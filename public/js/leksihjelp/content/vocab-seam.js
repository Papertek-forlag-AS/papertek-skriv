/**
 * Leksihjelp — Vocab Seam (browser IIFE)
 *
 * Phase 40.2 owns this layer's hydration policy (supersedes Plan 23-02):
 *
 *   Phase 1 (sync, no network):
 *     - Build baseline indexes from the bundled NB vocab (full data/nb.json;
 *       trimmed data/nb-baseline.json is a fallback only — see initBaseline).
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

      // Cross-world presence signal. The sentinel above lives on the
      // content-script ISOLATED-world global (`self`), which is NOT the page's
      // `window` — so a host page (Skriv) running in the MAIN world cannot see
      // it, and would double-dip (its own embedded leksihjelp + ours). The
      // shared DOM is the one surface both worlds can read, so also stamp a
      // marker on <html>. Skriv's bridge reads `data-lexi-present` to yield.
      // Guarded on chrome.runtime.id, so Skriv's vendored copy of this file
      // (no runtime.id) never sets it — standalone Skriv stays embedded.
      try {
        if (typeof document !== 'undefined' && document.documentElement) {
          document.documentElement.setAttribute('data-lexi-present', 'extension');
        }
      } catch (_) { /* DOM not ready / inaccessible — sentinel above still set */ }

      // L-6 (skriv integration contract, skriv repo docs/leksihjelp-integration.md
      // §3.2): once Skriv detects us via the __lexiPresent sentinel above, its
      // 📚 Leksihjelp button defers to us — on click it posts
      //   { type: 'skriv:leksihjelp:openPanel', source: 'skriv' }
      // to its own origin. We relay that to the service worker, which makes a
      // best-effort chrome.sidePanel.open(). The message shape is fixed by the
      // merged Skriv side (Papertek-forlag-AS/papertek-skriv PR #6) — do NOT
      // change it without a coordinated change on the Skriv side. Gated inside
      // the chrome.runtime.id check so it registers ONLY in real extension
      // context — Skriv's own vendored copy of this file (no runtime.id) never
      // wires this listener and so never loops on its own postMessage.
      window.addEventListener('message', onSkrivOpenPanelMessage);
    }
  } catch (_) { /* defensive: chrome.* access can throw in odd contexts */ }

  // L-6: origins trusted to request a side-panel open. Skriv posts to its own
  // origin, so event.origin is the page origin. The __lexiPresent sentinel is
  // set on every page we inject into, so without an origin gate any site could
  // pop our side panel — benign, but annoying. Allow Skriv prod + localhost dev.
  const SKRIV_ORIGINS = new Set(['https://skriv.papertek.app']);
  function isTrustedSkrivOrigin(origin) {
    if (SKRIV_ORIGINS.has(origin)) return true;
    try {
      const u = new URL(origin);
      return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
    } catch (_) { return false; }
  }

  function onSkrivOpenPanelMessage(event) {
    // Reject cross-frame / worker posts, then match Skriv's published shape
    // verbatim (type + source). event.source === window ensures the post came
    // from this top window rather than a nested frame.
    if (event.source !== window) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type !== 'skriv:leksihjelp:openPanel') return;
    if (data.source !== 'skriv') return;
    if (!isTrustedSkrivOrigin(event.origin)) return;
    try {
      chrome.runtime.sendMessage({ type: 'openSidePanel' });
    } catch (_) {
      // Service worker asleep / no receiver — non-fatal. Skriv also shows a
      // toast pointing the user at the toolbar icon as a manual fallback.
    }
  }

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
  // v3.0.139: which language the CURRENT state was built for. Distinct from
  // currentLang (the requested/label language): hydrateTarget's baseline
  // early-return used to assume the boot-time NB baseline was still live,
  // but any intervening target-language hydration replaces `state` — so
  // switching de→nb left getLanguage()==='nb' serving German indexes
  // (spell-check then suggested «Paket»/«sole» on NB text; caught on the
  // live playground walk of v3.0.138).
  let stateLang = '';
  let ready = false;
  let _baselineLoading = false;
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
      // Noun-case keys — vocab-seam-core.js:517-519 calls isFeatureEnabled
      // with the generic ids below; storage holds the lang-prefixed forms
      // (`grammar_de_akkusativ` etc.) written by popup preset pills. Without
      // this mapping the case grid silently drops to nominativ-only any
      // time the user enables a case feature. Reported by Skriv-side agent
      // in docs/leksihjelp-upstream-fixes.md (Issue 1).
      'grammar_accusative_nouns': [`${langPrefix}akkusativ`],
      'grammar_dative':           [`${langPrefix}dativ`],
      'grammar_genitiv':          [`${langPrefix}genitiv`],
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
      // {timeout: 2000}: guarantee the callback runs within 2s even on pages
      // that never go idle (busy SPAs, chat apps, the playground harness).
      // Without the timeout, requestIdleCallback can be starved indefinitely,
      // so target-language hydration (incl. the Ordbank accept-list) never
      // completes and spell-check stays on the NB baseline — every target-
      // language-only word is then FP-flagged until the page happens to idle.
      requestIdleCallback(() => { try { fn(); } catch (e) { console.warn('[lexi-vocab] swap build failed', e); } }, { timeout: 2000 });
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
  // v3.0.123: de/en/es/fr added — the curated FL prediction-boost bigram
  // files shipped in v3.0.19 but the nb/nn-only gate left them unloaded in
  // every browser path (caught by check-sc-sidecar-lang-parity's new
  // disk-coverage check).
  const BIGRAM_LANGS = new Set(['nb', 'nn', 'de', 'en', 'es', 'fr']);
  const FREQ_LANGS = new Set(['nb', 'nn']);
  const PITFALL_LANGS = new Set(['en']);
  const NON_COMPOUND_PAIRS_LANGS = new Set(['nb', 'nn']);
  // Phase 48 Wave A.0: per-language spell-check accept-list sidecar.
  // v3.0.123: de + es added — validwords-de.json shipped in the bundle but
  // this set (then nb/nn-only) meant the browser never loaded it; real users
  // saw 'Letzten' flagged while the Node harness (which loads the sidecar
  // directly) kept fixtures green. check-sc-sidecar-lang-parity now also
  // asserts every validwords-*.json on disk is present here AND in the
  // renderer's SC_VALIDWORDS_LANGS, so the next sidecar can't ship unloaded.
  // v3.0.128: en + fr added — frequency-capped validwords-common lists now
  // ship for en/fr/es (papertek generate-validwords-common.py).
  const VALIDWORDS_LANGS = new Set(['nb', 'nn', 'de', 'es', 'en', 'fr']);
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
  // Phase 45: curated NB/NN denylist of word pairs that look decomposable
  // but are NOT productive compounds (subject+verb collisions, idiomatic
  // adj+noun phrases). Single shared file for both registers.
  async function loadNonCompoundPairs(lang) {
    if (!NON_COMPOUND_PAIRS_LANGS.has(lang)) return null;
    return loadBundledSidecar(`non-compound-pairs.json`);
  }
  async function loadValidwordsExtra(lang) {
    if (!VALIDWORDS_LANGS.has(lang)) return null;
    return loadBundledSidecar(`validwords-${lang}.json`);
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
    const [bigrams, freq, sisterRaw, pitfalls, nonCompoundPairs, validwordsExtra] = await Promise.all([
      loadBigrams(lang), loadFrequency(lang), loadSister(lang), loadPitfalls(lang),
      loadNonCompoundPairs(lang), loadValidwordsExtra(lang),
    ]);
    const isFeatureEnabled = buildFeaturePredicate(lang);
    const fresh = core.buildIndexes({ raw, bigrams, freq, sisterRaw, lang, isFeatureEnabled, nonCompoundPairs, validwordsExtra });
    fresh.pitfalls = pitfalls || {};
    fresh._sourceTag = source; // diagnostic
    state = fresh;
    stateLang = lang;
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
    stateLang = lang;
    if (revision) lastRevision.set(lang, revision);
  }

  // ── Sync baseline init ──
  // Async only because chrome.runtime.getURL + fetch is the standard MV3 way
  // to read bundled JSON, but no network hits the wire (chrome-extension://
  // scheme). Consumers can still call __lexiVocab synchronously after this
  // initial promise resolves; the readyCallbacks queue handles the gap.
  // v3.0.140 (deferred/nb-baseline-trimmed-starves-decompose): prefer the
  // FULL nb.json over the Plan 23-03 trimmed baseline. The trimmed file
  // existed to avoid parsing nb.json when Plan 23-05 was going to drop it
  // from the bundle — Phase 40.2 reversed that, so nb.json ships anyway,
  // and this path already parses the full sister nn.json (loadSister) plus
  // validwords-nb on every boot. Measured marginal cost of going full:
  // +150 ms async boot / +29 MB heap on a 327 ms / 61 MB base — while the
  // trimmed state starved nounLemmaGenus (138 vs 2245), compoundNouns
  // (627 vs 9720) and decomposeCompound, killing nb-sarskriving's
  // plural-compound fallback recall on the seam path («skole sekk» fired
  // via the spell-check side-car, silent via baseline). The trimmed file
  // remains a fallback only (it embeds its own freq + empty bigrams).
  async function initBaseline() {
    // all_frames: true causes this to run in each iframe (isolated worlds by
    // design). Guard against double-init within the same frame — cross-frame
    // deduplication is not feasible without SharedArrayBuffer.
    // Note: do NOT use `ready` as the guard here — `ready` is set on the
    // initial NB load and stays true after switching to a target language.
    // If the user switches DE→NB we must rebuild the NB state even though
    // ready=true; the `stateLang` check is the correct predicate.
    if (_baselineLoading) return;
    if (stateLang === BASELINE_LANG && state) return;
    _baselineLoading = true;
    try {
      let raw = await loadBundledRaw(BASELINE_LANG);
      let usingTrimmedBaseline = false;
      if (!raw) {
        raw = await loadBundledSidecar('nb-baseline.json');
        usingTrimmedBaseline = !!raw;
      }
      if (!raw) {
        console.error('[lexi-vocab] baseline NB load failed — extension unusable');
        return;
      }
      let bigrams, freq, sisterRaw, pitfalls;
      // Phase 48 Wave A.0 + B.2 follow-up: the baseline path is the ONLY path
      // that runs for NB users (target-language hydration at line ~365 returns
      // early when lang === BASELINE_LANG). Without loading validwordsExtra
      // and nonCompoundPairs here, the baseline NB state has none of the
      // Ordbank vocabulary, so all Phase 48 fixes are invisible in the
      // browser. The buildAndApply path only fires for non-NB languages.
      if (usingTrimmedBaseline) {
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
      const [nonCompoundPairs, validwordsExtra] = await Promise.all([
        loadNonCompoundPairs(BASELINE_LANG), loadValidwordsExtra(BASELINE_LANG),
      ]);
      const baseline = core.buildIndexes({
        raw, bigrams, freq, sisterRaw, lang: BASELINE_LANG, isFeatureEnabled: () => true,
        nonCompoundPairs, validwordsExtra,
      });
      baseline.pitfalls = pitfalls || {};
      baseline._sourceTag = usingTrimmedBaseline ? 'baseline-nb-trimmed' : 'baseline-nb';
      state = baseline;
      stateLang = BASELINE_LANG;
      ready = true;
      emitHydration(BASELINE_LANG, 'baseline');
      drainReady();
    } finally {
      _baselineLoading = false;
    }
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
    if (lang === BASELINE_LANG) {
      // v3.0.139: only skip when the live state actually IS the baseline.
      // After a de/es/… hydration, switching back to NB must rebuild —
      // the old unconditional `return` here left label=nb over the other
      // language's indexes (see stateLang declaration for the live repro).
      if (stateLang === BASELINE_LANG && state) {
        emitHydration(lang, 'ready');
        return;
      }
      await initBaseline(); // sets state + stateLang, emits 'baseline'
      emitHydration(lang, 'ready');
      return;
    }
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
    // Worker / SSR context (no chrome.* APIs): the sentinel block above
    // already no-ops defensively; init() likewise can't hydrate without
    // chrome.storage + chrome.runtime.getURL, so bail quietly rather than
    // throwing an unhandled rejection from storageGet().
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      return;
    }
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
    getAdjLemma: () => (state && state.adjLemma) ? state.adjLemma : new Map(),
    getAdjNeuter: () => (state && state.adjNeuter) ? state.adjNeuter : new Map(),
    getNounPlural: () => (state && state.nounPlural) ? state.nounPlural : new Map(),
    getKnownPresens: () => (state && state.knownPresens) ? state.knownPresens : new Set(),
    getKnownPreteritum: () => (state && state.knownPreteritum) ? state.knownPreteritum : new Set(),
    getKnownParticiples: () => (state && state.knownParticiples) ? state.knownParticiples : new Set(),
    getVerbForms: () => (state && state.verbForms) ? state.verbForms : new Map(),
    getVerbInfinitive: () => (state && state.verbInfinitive) ? state.verbInfinitive : new Map(),
    getValidWords: () => (state && state.validWords) ? state.validWords : new Set(),
    getCuratedValidWords: () => (state && state.curatedValidWords) ? state.curatedValidWords : new Set(),
    getMultiwordTokens: () => (state && state.multiwordTokens) ? state.multiwordTokens : new Set(),
    getTypoFix: () => (state && state.typoFix) ? state.typoFix : new Map(),
    getCompoundNouns: () => (state && state.compoundNouns) ? state.compoundNouns : new Set(),
    getVariantSpellings: () => (state && state.variantSpellings) ? state.variantSpellings : new Set(),
    getNonCompoundPairs: () => (state && state.nonCompoundPairs) ? state.nonCompoundPairs : new Set(),
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
    getNnCanonicalInfinitives: () => (state && state.nnCanonicalInfinitives) ? state.nnCanonicalInfinitives : new Set(),
    getEsEnyeMap: () => (state && state.esEnyeMap) ? state.esEnyeMap : new Map(),
    getFrCedilleMap: () => (state && state.frCedilleMap) ? state.frCedilleMap : new Map(),
    getFrPluralMap: () => (state && state.frPluralMap) ? state.frPluralMap : new Map(),
    getAnglicismMap: () => (state && state.anglicismMap) ? state.anglicismMap : new Map(),
    getAnglicismList: () => (state && Array.isArray(state.anglicismList)) ? state.anglicismList : [],
    getAnglicismWords: () => (state && state.anglicismWords) ? state.anglicismWords : new Set(),
    getFalseFriendsMap: () => (state && state.falseFriendsMap) ? state.falseFriendsMap : new Map(),
    getFalseFriendsList: () => (state && Array.isArray(state.falseFriendsList)) ? state.falseFriendsList : [],
    getFrAdjPluralMap: () => (state && state.frAdjPluralMap) ? state.frAdjPluralMap : new Map(),
    getDeAdjPredicativeMap: () => (state && state.deAdjPredicativeMap) ? state.deAdjPredicativeMap : new Map(),
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
    // v3.0.138: nb-sarskriving's plural-compound fallback (Plan 50-04 B)
    // gates on `vocab.nounLemmaGenus && decomposeCompound` — without this
    // getter the entire fallback was dead in the browser while the Node
    // fixture runner (raw buildIndexes output) exercised it. Discovered
    // via live playground walk: «skole sekk» fired in Node, not in Chrome.
    getNounLemmaGenus: () => (state && state.nounLemmaGenus) ? state.nounLemmaGenus : new Map(),
    // Wave C0: plural noun form → genus, for the FR agreement-number rules.
    getNounPluralGenus: () => (state && state.nounPluralGenus) ? state.nounPluralGenus : new Map(),
    getGrammarTables: () => (state && state.grammarTables) ? state.grammarTables : {},
    getDeRegularPresent: () => (state && state.deRegularPresent) ? state.deRegularPresent : { byLemma: new Map(), byForm: new Map() },
    getDeStrongPresent: () => (state && state.deStrongPresent) ? state.deStrongPresent : new Map(),
    getDeComparatives: () => (state && state.deComparatives) ? state.deComparatives : new Set(),
    getDeDativePlural: () => (state && state.deDativePlural) ? state.deDativePlural : new Map(),
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
    getSisterVerbForms: () => (state && state.sisterVerbForms) ? state.sisterVerbForms : new Set(),
    // Delegate to buildFeaturePredicate so external callers see exactly the
    // same logic the wordList filter uses. Pre-fix this wrapper did direct
    // membership only (`enabledFeatures.has(featureId)`), which gave
    // different answers than buildFeaturePredicate for any generic feature
    // id mapped through genericToLangMap (`grammar_present` → `grammar_de_presens`,
    // `grammar_accusative_nouns` → `grammar_de_akkusativ`, etc.). Embedders
    // querying with the generic form got false while the wordList correctly
    // resolved to true. Reported in docs/leksihjelp-upstream-fixes.md (Issue 3).
    //
    // currentLang is captured by closure and refreshed on every hydrateTarget,
    // so the predicate constructed here always reflects the active language's
    // genericToLangMap. Re-built per call (cheap — small object literal) so
    // we don't need a separate refresh hook.
    isFeatureEnabled: (featureId) => buildFeaturePredicate(currentLang)(featureId),
    // Predicate for an ARBITRARY language's level preset (independent surfaces
    // like Lær mer, whose language is decoupled from the dictionary's
    // currentLang). enabledArr: the lang-prefixed feature ids enabled for that
    // language (caller reads enabledGrammarFeatures[lang] or the basic-preset
    // default). Resolves generic ids via the core's language-agnostic
    // genericToLangMap — same generic→lang logic as buildFeaturePredicate, but
    // not bound to currentLang.
    makeFeaturePredicateFor: function (enabledArr) {
      return core.makeFeaturePredicate(enabledArr);
    },
  };

  init();
})();
