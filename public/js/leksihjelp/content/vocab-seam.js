/**
 * Leksihjelp — Vocab Seam (browser IIFE)
 *
 * Phase 40.2 owns this layer's hydration policy (supersedes Plan 23-02):
 *
 *   Phase 1 (sync, no network):
 *     - Build baseline indexes from the bundled NB vocab (data/nb.json or
 *       trimmed data/nb-baseline.json when present).
 *     - Set self.__lexiVocab so spell-check + word-prediction render
 *       immediately. NO awaits before this point — popup must work offline.
 *     - Emit {type: 'lexi:hydration', lang: 'nb', state: 'baseline'}.
 *
 *   Phase 2 (async, target language) — bundled-only:
 *     - chrome.runtime.getURL('data/<lang>.json') → fetch → buildIndexes →
 *       atomic state swap → emit 'ready' (or 'error' on bundled-load failure).
 *     - No IndexedDB cache lookup, no API fetch, no progress events beyond
 *       ready/error. Vocab updates flow through Chrome Web Store auto-update.
 *
 *   Atomic swap: self.__lexiVocab is a stable wrapper object. Internal state
 *   is held in a module-level mutable `state`; the wrapper's getters read
 *   `state.<index>` at call time. This means a consumer that captures
 *   `self.__lexiVocab` once (spell-check, word-prediction) sees the swap
 *   without re-grabbing — and sees a consistent indexes object on every read,
 *   never a half-built mix.
 *
 *   Idempotence: each swap records `lastRevision[lang]`. swapIndexes() is
 *   exposed for tests / future update-detection paths but the bundled-only
 *   hydration path no longer relies on it.
 *
 * Network-silence: vocab-seam.js is NOT in the SC-06 scan target list. Phase
 * 40.2 eliminated the runtime API fetch, so the only fetch() calls now go
 * through chrome-extension:// URLs (bundled JSON), which are SC-06 whitelisted.
 */

(function () {
  'use strict';

  // L-3 (skriv integration contract): sentinel that lets Skriv's bridge module
  // distinguish "the leksihjelp Chrome extension is injecting on this page"
  // from "Skriv's own vendored seam loaded via <script>". Skriv reads this in
  // public/js/app/leksihjelp-bridge.js — when set, Skriv yields the dictionary
  // + spell-check surface to the extension. Guarded on chrome.runtime.id so
  // it fires ONLY in real extension context (Skriv's vendored copy of this
  // file runs without that, so the sentinel correctly stays unset there).
  // See docs/leksihjelp-integration.md (skriv repo) §3.4.
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      self.__lexiPresent = 'extension';
    }
  } catch (_) { /* defensive: chrome.* access can throw in odd contexts */ }

  // ── Dependencies ──
  const core = self.__lexiVocabCore;
  if (!core) {
    console.error('[lexi-vocab] __lexiVocabCore not loaded — check manifest content_scripts order');
    return;
  }

  // ── Module state ──
  // `state` holds the currently-published indexes. Wrappers below capture
  // `state` by closure but read live through it, so a swap is observed by
  // every existing __lexiVocab reference.
  let state = null;
  let currentLang = 'en';
  let ready = false;
  let enabledFeatures = new Set();
  const readyCallbacks = [];

  // Per-language last-applied revision; gates idempotent swaps.
  const lastRevision = new Map();

  // Languages with bundled JSON in extension/data/. Phase 40.2: ALL six
  // supported languages ship bundled in the packaged zip. Vocab updates flow
  // through Chrome Web Store auto-update (not runtime API fetch). The
  // hydrateTarget path below is bundled-only — no IDB cache lookup, no API
  // fetch. Audio is the only carve-out (still runtime-fetched).
  const BUNDLED_LANGS = ['de', 'en', 'es', 'fr', 'nb', 'nn'];
  const BASELINE_LANG = 'nb';

  // ── Hydration progress emitter ──
  const hydrationListeners = new Set();
  function emitHydration(lang, hydrationState, extra) {
    const msg = Object.assign({ type: 'lexi:hydration', lang, state: hydrationState }, extra || {});
    for (const l of hydrationListeners) {
      try { l(msg); } catch (_) { /* swallow */ }
    }
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(msg);
      }
    } catch (_) { /* no receiver — fine */ }
  }

  function onHydrationProgress(handler) {
    if (typeof handler === 'function') hydrationListeners.add(handler);
    return () => hydrationListeners.delete(handler);
  }

  // ── Storage helpers ──
  function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }

  // ── Grammar-feature predicate ──
  function buildFeaturePredicate(lang) {
    if (enabledFeatures.size === 0) return () => true;
    const langPrefix = `grammar_${lang}_`;
    const genericToLangMap = {
      'grammar_articles': [`${langPrefix}genus`],
      'grammar_plural': [`${langPrefix}flertall`, `${langPrefix}fleirtal`],
      'grammar_present': [`${langPrefix}presens`],
      'grammar_preteritum': [`${langPrefix}preteritum`],
      'grammar_perfektum': [`${langPrefix}perfektum`],
      'grammar_imperativ': [`${langPrefix}imperativ`],
      'grammar_comparative': [`${langPrefix}komparativ`],
      'grammar_superlative': [`${langPrefix}superlativ`],
    };
    return function isFeatureEnabled(featureId) {
      if (enabledFeatures.has(featureId)) return true;
      const langIds = genericToLangMap[featureId];
      if (langIds) return langIds.some(id => enabledFeatures.has(id));
      return false;
    };
  }

  // ── Off-thread scheduler ──
  // Build full indexes during browser-idle so we don't compete with input
  // events during typing. Falls back to setTimeout(0) when rIC is missing.
  function scheduleIdle(fn) {
    if (typeof requestIdleCallback === 'function') {
      requestIdleCallback(() => { try { fn(); } catch (e) { console.warn('[lexi-vocab] swap build failed', e); } });
    } else {
      setTimeout(() => { try { fn(); } catch (e) { console.warn('[lexi-vocab] swap build failed', e); } }, 0);
    }
  }

  // ── Bundled-data loaders (chrome.runtime.getURL — SC-06 whitelisted) ──
  // Phase 40.2: bundled-only. If the bundled file is missing the manifest is
  // broken — emit a single error path, no fallback to IDB/API.
  async function loadBundledRaw(lang) {
    if (!BUNDLED_LANGS.includes(lang)) return null;
    try {
      const url = chrome.runtime.getURL(`data/${lang}.json`);
      const res = await fetch(url);
      if (!res.ok) throw new Error('not bundled');
      return await res.json();
    } catch (e) {
      console.warn('[lexi-vocab] bundled load failed for ' + lang, e);
      return null;
    }
  }

  async function loadBundledSidecar(filename) {
    try {
      const url = chrome.runtime.getURL(`data/${filename}`);
      const res = await fetch(url);
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }

  // F38-1 / F38-3 (Plan 38-01.2): cached one-shot loader for the bundled FR
  // payload. Used by the seam-side defensive backfill in buildAndApply when
  // the API/cache-served generalbank is missing the 3 aspect meta entries
  // (aspect_passe_compose_adverbs, aspect_imparfait_adverbs,
  // aspect_choice_pedagogy). Papertek API serves FR `generalbank` from
  // vocabulary/lexicon/fr/ which is missing these three; bundled fr.json has
  // them (sourced from vocabulary/core/fr/). Single fetch per page lifetime —
  // subsequent FR hydrations reuse the parsed payload.
  let _frBundledPromise = null;
  function loadFrBundledOnce() {
    if (!_frBundledPromise) {
      _frBundledPromise = (async () => {
        try {
          const url = chrome.runtime.getURL('data/fr.json');
          const res = await fetch(url);
          if (!res.ok) return null;
          return await res.json();
        } catch (_) { return null; }
      })();
    }
    return _frBundledPromise;
  }

  // Sidecar files only ship for a subset of languages — the rest get null
  // (graceful no-op downstream). loadBundledSidecar already swallows 404s
  // in JS, but the browser still logs `Failed to load resource` to the
  // devtools console for every missing file. Gate the fetch by language
  // to keep the console clean. Update these sets when a new sidecar gets
  // added to extension/data/.
  const BIGRAM_LANGS = new Set(['nb', 'nn']);
  const FREQ_LANGS = new Set(['nb', 'nn']);
  const PITFALL_LANGS = new Set(['en']);
  async function loadBigrams(lang) {
    if (!BIGRAM_LANGS.has(lang)) return null;
    return loadBundledSidecar(`bigrams-${lang}.json`);
  }
  async function loadFrequency(lang) {
    if (!FREQ_LANGS.has(lang)) return null;
    return loadBundledSidecar(`freq-${lang}.json`);
  }
  async function loadPitfalls(lang) {
    if (!PITFALL_LANGS.has(lang)) return null;
    return loadBundledSidecar(`pitfalls-${lang}.json`);
  }
  async function loadSister(lang) {
    const sister = lang === 'nb' ? 'nn' : lang === 'nn' ? 'nb' : null;
    if (!sister) return null;
    return loadBundledRaw(sister);
  }

  // ── Index building + swap ──
  async function buildAndApply(lang, raw, source) {
    if (!raw) return false;

    // F38-1 / F38-3 defensive backfill (Plan 38-01.2): the Papertek API serves
    // FR `generalbank` from vocabulary/lexicon/fr/ which is missing 3 aspect
    // meta entries that live only in vocabulary/core/fr/generalbank.json.
    // Bundled extension/data/fr.json has all entries (sourced from core/), so
    // overlay the missing meta entries onto the API payload here. Narrow and
    // surgical — does NOT broadly merge bundled data; only the specific
    // known-stripped meta entries. Without this fix, frAspectAdverbs ends up
    // empty in the browser and fr-aspect-hint never fires.
    if (lang === 'fr' && raw && raw.generalbank) {
      const required = [
        'aspect_passe_compose_adverbs',
        'aspect_imparfait_adverbs',
        'aspect_choice_pedagogy',
      ];
      const missing = required.filter(k => !(k in raw.generalbank));
      if (missing.length > 0) {
        try {
          const bundled = await loadFrBundledOnce();
          if (bundled && bundled.generalbank) {
            for (const k of missing) {
              if (k in bundled.generalbank) {
                raw.generalbank[k] = bundled.generalbank[k];
              }
            }
            console.info('[lexi-vocab] FR aspect-meta backfill applied', { missing, source });
          }
        } catch (e) {
          console.warn('[lexi-vocab] FR aspect-meta backfill failed (rule may be silent)', e);
        }
      }
    }

    // Refresh enabled features (popup may have toggled mid-flight).
    const stored = await storageGet(['enabledGrammarFeatures']);
    if (stored.enabledGrammarFeatures && stored.enabledGrammarFeatures[lang]) {
      enabledFeatures = new Set(stored.enabledGrammarFeatures[lang]);
    } else {
      enabledFeatures = new Set();
    }
    const [bigrams, freq, sisterRaw, pitfalls] = await Promise.all([
      loadBigrams(lang), loadFrequency(lang), loadSister(lang), loadPitfalls(lang),
    ]);
    const isFeatureEnabled = buildFeaturePredicate(lang);
    const fresh = core.buildIndexes({ raw, bigrams, freq, sisterRaw, lang, isFeatureEnabled });
    fresh.pitfalls = pitfalls || {};
    fresh._sourceTag = source; // diagnostic
    state = fresh;
    return true;
  }

  /**
   * Public swap: idempotent on (lang, revision). Used by plan 04 update
   * detection and exposed as a test seam on __lexiVocab.
   */
  function swapIndexes(lang, revision, freshIndexes) {
    if (!freshIndexes) return;
    if (revision && lastRevision.get(lang) === revision) return;
    state = freshIndexes;
    if (revision) lastRevision.set(lang, revision);
  }

  // ── Sync baseline init ──
  // Async only because chrome.runtime.getURL + fetch is the standard MV3 way
  // to read bundled JSON, but no network hits the wire (chrome-extension://
  // scheme). Consumers can still call __lexiVocab synchronously after this
  // initial promise resolves; the readyCallbacks queue handles the gap.
  // Plan 23-03: trimmed baseline (data/nb-baseline.json) replaces full nb.json
  // as the bundled fallback. The trimmed file embeds its own freq + (empty)
  // bigrams maps; use those when present so we don't hit nb.json/freq-nb.json
  // (which plan 23-05 will remove from the bundle). Falls back to the legacy
  // full file path if nb-baseline.json is missing — keeps the seam working in
  // older installs / lockdown contexts where the baseline hasn't been built.
  async function initBaseline() {
    let raw = await loadBundledSidecar('nb-baseline.json');
    let usingTrimmedBaseline = !!raw;
    if (!raw) {
      raw = await loadBundledRaw(BASELINE_LANG);
    }
    if (!raw) {
      console.error('[lexi-vocab] baseline NB load failed — extension unusable');
      return;
    }
    let bigrams, freq, sisterRaw, pitfalls;
    if (usingTrimmedBaseline) {
      // Trimmed baseline carries its own freq + bigrams in-payload. Pitfalls
      // and the sister-language word list aren't in the baseline; load them
      // out-of-band when those sidecars happen to still be bundled, otherwise
      // an empty fallback is fine for spell-check on the baseline path.
      bigrams = (raw && raw.bigrams) || {};
      freq = (raw && raw.freq) || {};
      [sisterRaw, pitfalls] = await Promise.all([
        loadSister(BASELINE_LANG), loadPitfalls(BASELINE_LANG),
      ]);
    } else {
      [bigrams, freq, sisterRaw, pitfalls] = await Promise.all([
        loadBigrams(BASELINE_LANG), loadFrequency(BASELINE_LANG), loadSister(BASELINE_LANG), loadPitfalls(BASELINE_LANG),
      ]);
    }
    const baseline = core.buildIndexes({
      raw, bigrams, freq, sisterRaw, lang: BASELINE_LANG, isFeatureEnabled: () => true,
    });
    baseline.pitfalls = pitfalls || {};
    baseline._sourceTag = usingTrimmedBaseline ? 'baseline-nb-trimmed' : 'baseline-nb';
    state = baseline;
    ready = true;
    emitHydration(BASELINE_LANG, 'baseline');
    drainReady();
  }

  function drainReady() {
    const toRun = readyCallbacks.splice(0);
    for (const cb of toRun) {
      try { cb(); } catch (_) { /* swallow */ }
    }
  }

  // ── Target-language hydration ──
  // Phase 40.2: bundled-only path. All six supported languages ship in the
  // packaged zip via extension/data/<lang>.json. No IDB cache lookup, no API
  // fetch, no progress events beyond ready/error. If the bundled load fails
  // the manifest is broken — single 'error' emission, no fallback waterfall.
  async function hydrateTarget(lang) {
    if (lang === BASELINE_LANG) return; // baseline already serving NB
    const raw = await loadBundledRaw(lang);
    if (!raw) {
      emitHydration(lang, 'error');
      return;
    }
    scheduleIdle(async () => {
      const built = await buildAndApply(lang, raw, 'bundled');
      if (built) {
        currentLang = lang;
        emitHydration(lang, 'ready');
      } else {
        emitHydration(lang, 'error');
      }
    });
  }

  // ── Init ──
  async function init() {
    const stored = await storageGet(['lang.dictionary']);
    currentLang = stored['lang.dictionary'] || 'en';

    if (chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener(onMessage);
    }
    // Plan 43-04: vocab-seam drives off lang.dictionary. Subscribe to the
    // per-surface key directly via chrome.storage.onChanged — replaces the
    // retired LANGUAGE_CHANGED runtime broadcast.
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if (changes['lang.dictionary']) {
          const next = changes['lang.dictionary'].newValue;
          if (next && next !== currentLang) {
            currentLang = next;
            hydrateTarget(currentLang);
          }
        }
      });
    }

    await initBaseline();
    // Spawn target hydration without awaiting — popup + lookups are already
    // serving baseline NB.
    hydrateTarget(currentLang);
  }

  function onMessage(msg) {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'GRAMMAR_FEATURES_CHANGED') {
      hydrateTarget(currentLang);
    }
  }

  // ── isTextInput — copied verbatim from word-prediction.js ──
  function isTextInput(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    const tag = el.tagName;
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') {
      const type = (el.type || 'text').toLowerCase();
      return ['text', 'search', 'url', 'email'].includes(type);
    }
    return false;
  }

  // ── Public surface ──
  // Wrapper object reads `state` live so the swap is atomic to consumers
  // that captured __lexiVocab once. Every getter null-guards on state.
  self.__lexiVocab = {
    getWordList: () => (state && state.wordList) ? state.wordList : [],
    getLanguage: () => currentLang,
    isReady: () => ready,
    isPaused: () => false,
    isTextInput,
    onReady(cb) {
      if (typeof cb !== 'function') return;
      if (ready) { try { cb(); } catch (_) {} return; }
      readyCallbacks.push(cb);
    },

    // Plan 23-02 surfaces (consumed by plans 03/04/05 popup + tests):
    onHydrationProgress,
    swapIndexes,

    // Data getters
    getFrequency: (word) => {
      if (!state || !state.freq || typeof word !== 'string') return null;
      const v = state.freq.get(word.toLowerCase());
      return typeof v === 'number' ? v : null;
    },
    getBigrams: () => (state && state.bigrams) ? state.bigrams : null,
    getTypoBank: () => (state && state.typoBank) ? state.typoBank : null,
    getNounGenus: () => (state && state.nounGenus) ? state.nounGenus : new Map(),
    getNounForms: () => (state && state.nounForms) ? state.nounForms : new Map(),
    getIsAdjective: () => (state && state.isAdjective) ? state.isAdjective : new Set(),
    getKnownPresens: () => (state && state.knownPresens) ? state.knownPresens : new Set(),
    getKnownPreteritum: () => (state && state.knownPreteritum) ? state.knownPreteritum : new Set(),
    getVerbForms: () => (state && state.verbForms) ? state.verbForms : new Map(),
    getVerbInfinitive: () => (state && state.verbInfinitive) ? state.verbInfinitive : new Map(),
    getValidWords: () => (state && state.validWords) ? state.validWords : new Set(),
    getTypoFix: () => (state && state.typoFix) ? state.typoFix : new Map(),
    getCompoundNouns: () => (state && state.compoundNouns) ? state.compoundNouns : new Set(),
    getPitfalls: () => (state && state.pitfalls) ? state.pitfalls : {},
    phoneticNormalize: (str) => core.phoneticNormalize(str, currentLang),
    phoneticMatchScore: (queryPhonetic, targetPhonetic) => core.phoneticMatchScore(queryPhonetic, targetPhonetic),
    getFreq: () => (state && state.freq instanceof Map) ? state.freq : new Map(),
    getSisterValidWords: () => (state && state.sisterValidWords instanceof Set) ? state.sisterValidWords : new Set(),
    getRegisterWords: () => (state && state.registerWords) ? state.registerWords : new Map(),
    getCollocations: () => (state && state.collocations) ? state.collocations : [],
    getRedundancyPhrases: () => (state && state.redundancyPhrases) ? state.redundancyPhrases : [],
    getParticipleToAux: () => (state && state.participleToAux) ? state.participleToAux : new Map(),
    getNNInfinitiveClasses: () => (state && state.nnInfinitiveClasses) ? state.nnInfinitiveClasses : new Map(),
    getEsPresensToVerb: () => (state && state.esPresensToVerb) ? state.esPresensToVerb : new Map(),
    getEsSubjuntivoForms: () => (state && state.esSubjuntivoForms) ? state.esSubjuntivoForms : new Map(),
    getEsImperfectoForms: () => (state && state.esImperfectoForms) ? state.esImperfectoForms : new Map(),
    getEsPreteritumToVerb: () => (state && state.esPreteritumToVerb) ? state.esPreteritumToVerb : new Map(),
    getFrPresensToVerb: () => (state && state.frPresensToVerb) ? state.frPresensToVerb : new Map(),
    getFrSubjonctifForms: () => (state && state.frSubjonctifForms) ? state.frSubjonctifForms : new Map(),
    getFrSubjonctifDiffers: () => (state && state.frSubjonctifDiffers) ? state.frSubjonctifDiffers : new Map(),
    getIrregularForms: () => (state && state.irregularForms) ? state.irregularForms : new Map(),
    getDecomposeCompound: () => (state && state.decomposeCompound) ? state.decomposeCompound : null,
    getDecomposeCompoundStrict: () => (state && state.decomposeCompoundStrict) ? state.decomposeCompoundStrict : null,
    getGrammarTables: () => (state && state.grammarTables) ? state.grammarTables : {},
    getRulePedagogy: () => (state && state.rulePedagogy) ? state.rulePedagogy : new Map(),
    getSPassivForms: () => (state && state.sPassivForms) ? state.sPassivForms : new Map(),
    // Phase 35.1 (UAT regression): pedagogy and class-membership indexes
    // built by vocab-seam-core but never surfaced through the seam, so the
    // spell-check.js consumer (which composes ctx.vocab from VOCAB.getX()
    // calls) silently fed an empty map/set into every pedagogy-attaching
    // rule (de-prep-case, es-por-para, es-gustar, fr-aspect-hint). Result:
    // no Lær mer popovers in the browser, plus es-gustar / fr-aspect-hint
    // false negatives on extended verbs / canonical trigger sentences.
    // Node fixture-runner bypassed the seam (passed raw indexes object
    // directly), which is why every gate stayed green.
    getPrepPedagogy: () => (state && state.prepPedagogy) ? state.prepPedagogy : new Map(),
    getGustarClassVerbs: () => (state && state.gustarClassVerbs) ? state.gustarClassVerbs : new Set(),
    getGustarPedagogy: () => (state && state.gustarPedagogy) ? state.gustarPedagogy : null,
    getFrAspectAdverbs: () => (state && state.frAspectAdverbs) ? state.frAspectAdverbs : null,
    getFrAspectPedagogy: () => (state && state.frAspectPedagogy) ? state.frAspectPedagogy : null,
    // Phase 36-02 (INFRA-10 gate): the three FR mood-aspect indexes spread
    // from buildMoodIndexes() — fr-aspect-hint consumes them via
    // ctx.vocab.frImparfaitToVerb / .frPasseComposeParticiples / .frAuxPresensForms.
    // Same bug-class as the Phase 35 v2.9.15 fix: present in buildIndexes
    // return literal, never surfaced through the seam, so browser users got
    // empty Maps/Set and fr-aspect-hint silently fell back to false negatives.
    // Caught by the new check-vocab-seam-coverage release gate.
    getFrImparfaitToVerb: () => (state && state.frImparfaitToVerb) ? state.frImparfaitToVerb : new Map(),
    getFrPasseComposeParticiples: () => (state && state.frPasseComposeParticiples) ? state.frPasseComposeParticiples : new Map(),
    getFrAuxPresensForms: () => (state && state.frAuxPresensForms) ? state.frAuxPresensForms : new Set(),
    getNbToNnVerbs: () => (state && state.nbToNnVerbs) ? state.nbToNnVerbs : new Map(),
    getNbToNnNouns: () => (state && state.nbToNnNouns) ? state.nbToNnNouns : new Map(),
    isFeatureEnabled: (featureId) => {
      if (enabledFeatures.size === 0) return true;
      return enabledFeatures.has(featureId);
    },
  };

  init();
})();
