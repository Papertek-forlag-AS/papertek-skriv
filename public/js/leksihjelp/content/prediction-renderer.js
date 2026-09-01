/**
 * Leksihjelp — Word Prediction Renderer (content script)
 *
 * DOM-owning surface for word-prediction. Fuzzy ranker logic lives in
 * prediction-engine.js (Phase 43-02 split). This file owns:
 *   - dropdown DOM mount + position
 *   - input/keyup/keydown/click event listeners
 *   - selectedIndex / expanded / VISIBLE_DEFAULT state machine
 *   - keyboard navigation (Up/Down/Tab/Enter/Escape/auto-reveal)
 *   - debounce, recent-words tracking, language picker
 *   - chrome.storage / chrome.runtime message wiring
 *   - getTextContext (DOM-side cursor + previous-word extraction)
 *   - applySuggestion (input + contenteditable replacement)
 *
 * Engine signature consumed: engine.suggest(prefix, vocab, prefs) → ranked[]
 *
 * Vocabulary is loaded by vocab-seam.js and consumed here via __lexiVocab.
 * Grammar-feature gating is seam-owned: the seam emits the filtered wordList
 * and this file consumes it as-is (no local isFeatureEnabled duplicate).
 */

(function () {
  'use strict';

  const { t, initI18n, setUiLanguage, getUiLanguage } = self.__lexiI18n;
  // Languages with a freq-*.json sidecar on disk. Kept equal to the seam's
  // FREQ_LANGS by check-sc-sidecar-lang-parity — do not edit one without the
  // other (v3.0.123 unloaded-sidecar drift class).
  const PRED_FREQ_LANGS = new Set(['nb', 'nn']);

  // Vocab seam binding. Must load before this script (see manifest.json
  // content_scripts order).
  const VOCAB = self.__lexiVocab;
  if (!VOCAB) {
    console.error('[lexi-prediction] __lexiVocab not loaded — check manifest content_scripts order');
    return;
  }

  // Engine binding (Phase 43-02). Engine must load before renderer (see
  // manifest content_scripts order).
  const ENGINE = self.__lexiPredictionEngine;
  if (!ENGINE) {
    console.error('[lexi-prediction] __lexiPredictionEngine not loaded — check manifest content_scripts order');
    return;
  }
  // Re-bind the engine's static signal tables under the names the renderer
  // already used so the call sites below don't churn. The tables are owned
  // by the engine; this is a read-only alias.
  const MODAL_VERBS = ENGINE.MODAL_VERBS;
  const INFINITIVE_MARKERS = ENGINE.INFINITIVE_MARKERS;
  const DETERMINERS_BY_LANG = ENGINE.DETERMINERS_BY_LANG;
  const PREPOSITIONS_BY_LANG = ENGINE.PREPOSITIONS_BY_LANG;
  const PREPOSITION_CASE = ENGINE.PREPOSITION_CASE;
  const PRONOUN_CONTEXT_BY_LANG = ENGINE.PRONOUN_CONTEXT_BY_LANG;
  const NB_NN_AGREEMENT_CONTEXT = ENGINE.NB_NN_AGREEMENT_CONTEXT;

  let dropdown = null;
  let activeElement = null;
  let selectedIndex = -1;
  let enabled = true;
  let currentLang = 'en';
  let predictionTimer = null; // debounce timer for prediction
  let prefixIndex = new Map(); // 2-3 char prefix → [indices into VOCAB.getWordList()]
  let recentWords = [];    // Last 20 selected words per language
  let recentWordsSet = new Set(); // For O(1) lookup
  let knownPresens = new Set();    // Known present-tense verb forms for tense detection (rebuilt from VOCAB)
  let knownPreteritum = new Set(); // Known past-tense verb forms for tense detection (rebuilt from VOCAB)

  // F43-1 (v3.0.40): per-surface language for word-prediction. The shared
  // VOCAB seam is hydrated for `lang.dictionary` only — if the student
  // picked a different lang for prediction via the dropdown's lang switcher,
  // VOCAB.getWordList() returns the dictionary lang's wordList and prediction
  // silently suggests wrong-language words (e.g. German verbs in a Norwegian
  // textarea). Mirror the spell-check sidecar pattern (spell-check-renderer
  // line ~1470): when currentLang differs from the seam's hydration, build a
  // lang-correct indexes object locally and expose it via PRED_VOCAB —
  // the adapter the engine + tense detector read from. Cached per-lang.
  const predictionSidecarCache = new Map();
  let activeSidecar = null;        // currently-active sidecar indexes (null when using shared VOCAB)
  let activeSidecarLang = null;    // lang the activeSidecar was built for

  async function loadPredictionSidecar(lang) {
    if (predictionSidecarCache.has(lang)) return predictionSidecarCache.get(lang);
    const core = self.__lexiVocabCore;
    if (!core || typeof core.buildIndexes !== 'function') return null;
    try {
      // SC-06: fetch + chrome.runtime.getURL on the same line so the
      // network-silence whitelist (line-based) exempts it as a bundled-
      // asset access, not a network call.
      const res = await fetch(chrome.runtime.getURL(`data/${lang}.json`));
      if (!res.ok) return null;
      const raw = await res.json();
      // Sidecar bigrams + freq. Bigrams are probed for every language —
      // v3.0.123: the old nb/nn-only gate left the curated FL bigram files
      // (bigrams-de/en/es/fr.json, shipped v3.0.19) unloaded, so FL
      // word-prediction never got its bigram boosts. Freq is gated on
      // PRED_FREQ_LANGS (freq-*.json only exists for nb/nn; the old
      // probe-everything produced a noisy console 404 for every other
      // language — Geir's v2b walk). check-sc-sidecar-lang-parity asserts
      // this set stays equal to the seam's FREQ_LANGS, so a future freq
      // sidecar can't ship unloaded here (the v3.0.123 drift class).
      let bigramsRaw = null, freqRaw = null;
      try {
        const [bRes, fRes] = await Promise.all([
          fetch(chrome.runtime.getURL(`data/bigrams-${lang}.json`)),
          PRED_FREQ_LANGS.has(lang)
            ? fetch(chrome.runtime.getURL(`data/freq-${lang}.json`))
            : Promise.resolve({ ok: false }),
        ]);
        if (bRes.ok) bigramsRaw = await bRes.json();
        if (fRes.ok) freqRaw = await fRes.json();
      } catch (_) {}
      // Sister bundle for NB↔NN cross-dialect signals (mirrors seam path).
      let sisterRaw = null;
      if (lang === 'nb' || lang === 'nn') {
        try {
          const sister = lang === 'nb' ? 'nn' : 'nb';
          const sRes = await fetch(chrome.runtime.getURL(`data/${sister}.json`));
          if (sRes.ok) sisterRaw = await sRes.json();
        } catch (_) {}
      }
      const indexes = core.buildIndexes({
        raw, sisterRaw, bigrams: bigramsRaw, freq: freqRaw,
        lang, isFeatureEnabled: () => true,
      });
      predictionSidecarCache.set(lang, indexes);
      return indexes;
    } catch (e) {
      console.warn('[lexi-prediction] sidecar load failed for', lang, e?.message);
      return null;
    }
  }

  // Build a VOCAB-shaped adapter the engine + getTextContext read through.
  // When a sidecar is active for currentLang, getters return sidecar data;
  // otherwise they delegate to the shared seam VOCAB. The engine signature
  // it needs: getWordList, getFrequency(word), getBigrams(), phoneticNormalize,
  // phoneticMatchScore. The renderer also uses getKnownPresens / getKnownPreteritum.
  const PRED_VOCAB = {
    getWordList: () => activeSidecar
      ? (activeSidecar.wordList || [])
      : VOCAB.getWordList(),
    getFrequency: (word) => {
      if (typeof word !== 'string') return null;
      if (activeSidecar) {
        const m = activeSidecar.freq;
        if (m && typeof m.get === 'function') {
          const v = m.get(word.toLowerCase());
          if (typeof v === 'number') return v;
        }
        return null;
      }
      return VOCAB.getFrequency(word);
    },
    getBigrams: () => activeSidecar
      ? (activeSidecar.bigrams || null)
      : VOCAB.getBigrams(),
    getKnownPresens: () => activeSidecar
      ? (activeSidecar.knownPresens || new Set())
      : VOCAB.getKnownPresens(),
    getKnownPreteritum: () => activeSidecar
      ? (activeSidecar.knownPreteritum || new Set())
      : VOCAB.getKnownPreteritum(),
    // Phonetic helpers are static functions on the core — same answer
    // regardless of which lang's indexes are live; pass through unchanged.
    phoneticNormalize: VOCAB.phoneticNormalize,
    phoneticMatchScore: VOCAB.phoneticMatchScore,
    // isTextInput is lang-agnostic — keep delegation.
    isTextInput: VOCAB.isTextInput,
  };

  // Synchronously decide whether to use the sidecar. Called on every
  // prediction request — cheap O(1) Map lookup. The async load happens in
  // refreshFromVocab (init path) and on lang.prediction storage changes.
  function applySidecarForCurrentLang() {
    const seamLang = VOCAB.getLanguage();
    if (currentLang === seamLang) {
      activeSidecar = null;
      activeSidecarLang = null;
      return;
    }
    const cached = predictionSidecarCache.get(currentLang);
    if (cached) {
      activeSidecar = cached;
      activeSidecarLang = currentLang;
    } else {
      // Not loaded yet — fall back to seam VOCAB until the async load
      // resolves and triggers refreshFromVocab.
      activeSidecar = null;
      activeSidecarLang = null;
    }
  }

  // ── UX-02: top-3 default with "Vis flere" reveal to 8 (Phase 5 Plan 03) ──
  // VISIBLE_DEFAULT: rows shown on first render (dyslexia-friendly cognitive
  // load). VISIBLE_EXPANDED: rows shown after user clicks "Vis flere" or
  // ArrowDowns past the last visible row.
  const VISIBLE_DEFAULT = 3;
  const VISIBLE_EXPANDED = 8;
  // lastSuggestions: captured from runPrediction so the reveal-click handler
  // can re-render in place without re-running findSuggestions.
  let lastSuggestions = [];
  // expanded: per-session reveal state. RESET to false at the top of every
  // showDropdown() call (Pitfall 5 from 05-RESEARCH.md) so a previously-
  // expanded list doesn't leak into the next keystroke's dropdown.
  let expanded = false;

  // ── Frequency helpers + signal tables now live in prediction-engine.js ──
  // (Phase 43-02 split). Renderer assembles `vocab` + `prefs` and calls
  // ENGINE.suggest(); the engine owns getEffectiveFreq, sharedSuffixLen,
  // freqSignal, lowFreqDemotion, levenshtein, matchScore, findSuggestions,
  // applyBoosts.

  // ── Init ──
  init();

  // Phase 27: cached exam-mode flag. Updated on init + storage.onChanged.
  let examMode = false;

  async function init() {
    await initI18n();
    const stored = await chromeStorageGet(['lang.prediction', 'predictionEnabled', 'examMode']);
    currentLang = stored['lang.prediction'] || 'en';
    enabled = stored.predictionEnabled === true;
    examMode = !!stored.examMode;

    // Live-toggle awareness for examMode + per-surface language.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if ('examMode' in changes) {
        examMode = !!changes.examMode.newValue;
        if (examMode) hideDropdown();
      }
      // Plan 43-04: prediction owns `lang.prediction`. External writers
      // (popup, hint-banner accept) reach us here. Mirror the LANGUAGE_CHANGED
      // path: rebuild recent-words + queue refreshFromVocab once the seam is
      // ready.
      if ('lang.prediction' in changes) {
        const next = changes['lang.prediction'].newValue;
        if (next && next !== currentLang) {
          currentLang = next;
          loadRecentWords(next).catch(() => {}).then(() => {
            // F43-1: load the per-surface sidecar before rebuilding derived
            // state. When the prediction lang matches the seam's hydration
            // (lang.dictionary), loadPredictionSidecar is short-circuited
            // by applySidecarForCurrentLang and the seam wordList is used.
            loadPredictionSidecar(currentLang).catch(() => {}).then(() => {
              VOCAB.onReady(refreshFromVocab);
            });
          });
          hideDropdown();
        }
      }
    });

    await loadRecentWords(currentLang);
    createDropdown();
    attachGlobalListeners();

    // F43-1: kick off prediction-lang sidecar load if needed. The await is
    // cheap (Map lookup if cached; one fetch + buildIndexes when cold) and
    // it sequences the prefix-index rebuild AFTER the sidecar is ready so
    // the very first keystroke after init sees the right wordList. We do
    // NOT await VOCAB.onReady here — refreshFromVocab honours both queues.
    if (currentLang !== VOCAB.getLanguage()) {
      try { await loadPredictionSidecar(currentLang); } catch (_) {}
    }

    // Rebuild local derived state (prefix index + tense sets) once the seam
    // has vocab loaded. Seam's onReady queue handles late subscribers.
    VOCAB.onReady(refreshFromVocab);

    chrome.runtime.onMessage.addListener(async (msg) => {
      // Plan 43-04: LANGUAGE_CHANGED retired. Per-surface updates arrive via
      // chrome.storage.onChanged for `lang.prediction` (handler above).
      if (msg.type === 'PREDICTION_TOGGLED') {
        enabled = msg.enabled;
        if (!enabled) hideDropdown();
      }
      if (msg.type === 'GRAMMAR_FEATURES_CHANGED') {
        // Vocab-seam rebuilds its indexes on this message (grammar toggles
        // change which forms make it into the wordList). We refresh our
        // prefix index + tense sets when the seam signals ready.
        VOCAB.onReady(refreshFromVocab);
      }
      if (msg.type === 'UI_LANGUAGE_CHANGED') {
        setUiLanguage(msg.uiLanguage);
      }
    });
  }

  // Rebuild prefixIndex + knownPresens/knownPreteritum from the active
  // wordList. Cheap — linear in wordList size. Called on init-ready and after
  // LANGUAGE_CHANGED / GRAMMAR_FEATURES_CHANGED. F43-1: reads through
  // PRED_VOCAB so the rebuild honours an active per-surface sidecar.
  function refreshFromVocab() {
    applySidecarForCurrentLang();
    buildPrefixIndex();
    knownPresens = PRED_VOCAB.getKnownPresens();
    knownPreteritum = PRED_VOCAB.getKnownPreteritum();
  }

  function chromeStorageGet(keys) {
    return new Promise(resolve => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  // Language labels for dropdown footer
  const LANG_LABELS = {
    de: 'DE', es: 'ES', fr: 'FR', en: 'EN', nb: 'NB', nn: 'NN'
  };

  // Short part-of-speech labels for dropdown badges (i18n)
  function bankToPosShort(bank) {
    const keys = { verbbank: 'pos_verb_short', nounbank: 'pos_noun_short', adjectivebank: 'pos_adjective_short',
      articlesbank: 'pos_article_short', generalbank: 'pos_general_short', numbersbank: 'pos_number_short',
      phrasesbank: 'pos_phrase_short', pronounsbank: 'pos_pronoun_short' };
    return t(keys[bank] || 'pos_general_short');
  }

  // Pronoun context — table lives in prediction-engine.js; renderer reads it
  // through the ENGINE alias declared at the top of this IIFE.

  function getPronounContext(word) {
    const langMap = PRONOUN_CONTEXT_BY_LANG[currentLang];
    return (langMap && langMap[word]) || null;
  }

  // ── Static signal tables (MODAL_VERBS, INFINITIVE_MARKERS,
  // DETERMINERS_BY_LANG, NB_NN_AGREEMENT_CONTEXT, PREPOSITION_CASE,
  // PREPOSITIONS_BY_LANG) live in prediction-engine.js (Phase 43-02).
  // They are aliased into local consts at the top of this IIFE so the
  // call sites below read unchanged. The previously-inline table
  // literals were removed in the engine extraction.

  // ── Prefix index for fast candidate lookup ──
  // Engine owns the construction; renderer keeps the cache + rebuild trigger.
  function buildPrefixIndex() {
    // F43-1: read via PRED_VOCAB so an active sidecar wordList takes effect.
    const built = ENGINE.buildPrefixIndex(PRED_VOCAB.getWordList());
    prefixIndex.clear();
    for (const [k, v] of built) prefixIndex.set(k, v);
  }

  // ── Recent words tracking ──
  async function loadRecentWords(lang) {
    try {
      const stored = await chromeStorageGet(['recentWords']);
      const all = stored.recentWords || {};
      recentWords = all[lang] || [];
      recentWordsSet = new Set(recentWords);
    } catch (e) {
      recentWords = [];
      recentWordsSet = new Set();
    }
  }

  function trackRecentWord(word) {
    const lw = word.toLowerCase();
    // Move to front if already present, otherwise prepend
    recentWords = [lw, ...recentWords.filter(w => w !== lw)].slice(0, 20);
    recentWordsSet = new Set(recentWords);
    // Persist asynchronously
    chromeStorageGet(['recentWords']).then(stored => {
      const all = stored.recentWords || {};
      all[currentLang] = recentWords;
      chrome.storage.local.set({ recentWords: all });
    });
  }

  // ── Dropdown DOM ──
  function createDropdown() {
    dropdown = document.createElement('div');
    dropdown.id = 'lexi-prediction-dropdown';
    document.documentElement.appendChild(dropdown);
  }

  // ── Input Listeners ──
  function attachGlobalListeners() {
    // Use capture to intercept before page handlers
    document.addEventListener('input', handleInput, true);
    document.addEventListener('keyup', handleKeyup, true); // Fallback for editors (e.g. CKEditor) that suppress input events
    document.addEventListener('keydown', handleKeydown, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('blur', () => {
      setTimeout(hideDropdown, 150);
    }, true);
  }

  function handleInput(e) {
    if (!enabled) return;
    if (self.__lexiPause && self.__lexiPause.isPausedNow()) { hideDropdown(); return; }
    const el = e.target;
    if (!VOCAB.isTextInput(el)) return;
    schedulePrediction(el);
  }

  // Fallback for rich-text editors (CKEditor, TinyMCE, etc.) that intercept
  // beforeinput and do their own DOM updates, which can suppress native input events.
  function handleKeyup(e) {
    if (!enabled) return;
    if (self.__lexiPause && self.__lexiPause.isPausedNow()) { hideDropdown(); return; }
    // Skip non-character keys
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
         'Shift', 'Control', 'Alt', 'Meta', 'CapsLock',
         'Tab', 'Enter', 'Escape', 'Home', 'End',
         'PageUp', 'PageDown', 'Insert',
         'F1', 'F2', 'F3', 'F4', 'F5', 'F6',
         'F7', 'F8', 'F9', 'F10', 'F11', 'F12'].includes(e.key)) return;
    const el = e.target;
    if (!VOCAB.isTextInput(el)) return;
    schedulePrediction(el);
  }

  // Debounce predictions with 100ms timeout so the editor's DOM
  // updates settle before we read the selection / text content.
  function schedulePrediction(el) {
    if (predictionTimer) clearTimeout(predictionTimer);
    predictionTimer = setTimeout(() => {
      predictionTimer = null;
      runPrediction(el);
    }, 100);
  }

  function runPrediction(el) {
    // Phase 27: word-prediction dropdown is non-exam-safe (wordPrediction.dropdown).
    // Bail at the entry point so no work runs and the dropdown never opens.
    if (examMode) {
      const helper = self.__lexiExam;
      const allowed = helper ? helper.isSurfaceSafe('wordPrediction.dropdown', true) : false;
      if (!allowed) { hideDropdown(); return; }
    }
    activeElement = el;
    // Plan 43-04: passive auto-detect hint banner. Run against the input's
    // full text (not just the current word) so we have enough signal. Never
    // auto-switches; one-click "Bytt" persists to lang.prediction.
    try { maybeShowLangHint(el); } catch (_) { /* defensive: no DOM crashes */ }
    const { currentWord, previousWord, hasModalVerb, detectedTense, expectedPOS, genderContext, posStrength, caseContext, previousTwoWords, numberContext, definitenessContext } = getTextContext(el);

    const minChars = (currentLang === 'nb' || currentLang === 'nn' || currentLang === 'de') ? 4 : 3;
    if (currentWord && currentWord.length >= minChars) {
      // Detect pronoun context for smart verb suggestions
      const pronounContext = getPronounContext(previousWord);
      // Infinitive markers (å, zu) only count when immediately preceding
      const hasInfinitiveMarker = hasModalVerb || INFINITIVE_MARKERS.has(previousWord);
      const suggestions = findSuggestions(currentWord, 8, pronounContext, hasInfinitiveMarker, detectedTense, expectedPOS, genderContext, posStrength, caseContext, previousWord, previousTwoWords, numberContext, definitenessContext);

      // NB/NN: check for compound word matches (særskriving detection)
      // If student typed "skole sekk", search for "skolesekk" as a compound
      if ((currentLang === 'nb' || currentLang === 'nn') && previousWord && previousWord.length >= 2) {
        const compound = (previousWord + currentWord).toLowerCase();
        const compoundHits = findSuggestions(compound, 3, null, false, null);
        const replaceLen = previousWord.length + 1 + currentWord.length; // prev + space + current
        for (const hit of compoundHits) {
          // Only include when the combined text is an exact prefix of a real word
          if (hit.word.startsWith(compound) && hit.word.length >= compound.length) {
            suggestions.unshift({
              ...hit,
              type: 'compound',
              score: hit.score + 300,
              compoundReplaceLen: replaceLen
            });
          }
        }
        // Pitfall 6 (05-RESEARCH.md): splice cap must equal the max-reveal cap
        // (VISIBLE_EXPANDED=8), not the visible-default cap. Otherwise a
        // 4-hit compound unshift would knock out regular top-3 candidates
        // before renderDropdownBody gets a chance to slice for the view.
        suggestions.splice(8);
      }

      if (suggestions.length > 0) {
        showDropdown(suggestions, el);
      } else {
        hideDropdown();
      }
    } else {
      hideDropdown();
    }
  }

  function handleKeydown(e) {
    if (!dropdown || !dropdown.classList.contains('visible')) return;

    const items = dropdown.querySelectorAll('.lh-pred-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      e.stopPropagation();
      // Auto-reveal path: if stepping past the last visible item AND more
      // candidates are available in lastSuggestions, expand in place and
      // advance selection onto the first newly-revealed row (zero extra
      // keystrokes for keyboard users). Pitfall 5: expanded is reset on
      // every new showDropdown() call so reveal state doesn't leak across
      // keystrokes.
      if (
        selectedIndex === items.length - 1 &&
        !expanded &&
        lastSuggestions.length > items.length
      ) {
        expanded = true;
        renderDropdownBody(activeElement);
        const newItems = dropdown.querySelectorAll('.lh-pred-item');
        // Advance selection onto the first newly-revealed row. items.length
        // is the pre-expand visible count (e.g. 3); clamp to newItems.length-1
        // defensively in case renderDropdownBody revealed fewer than expected.
        selectedIndex = Math.min(items.length, newItems.length - 1);
        updateSelection(newItems);
      } else {
        selectedIndex = (selectedIndex + 1) % items.length;
        updateSelection(items);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      e.stopPropagation();
      selectedIndex = (selectedIndex - 1 + items.length) % items.length;
      updateSelection(items);
    } else if (e.key === 'Tab' || e.key === 'Enter') {
      if (selectedIndex >= 0 && selectedIndex < items.length) {
        e.preventDefault();
        e.stopPropagation();
        const item = items[selectedIndex];
        applySuggestion(item.dataset.word, parseInt(item.dataset.compoundLen) || 0);
      }
    } else if (e.key === 'Escape') {
      hideDropdown();
    }
  }

  function handleClick(e) {
    if (!dropdown || dropdown.contains(e.target)) return;
    const item = e.target.closest('.lh-pred-item');
    if (item) {
      e.preventDefault();
      applySuggestion(item.dataset.word, parseInt(item.dataset.compoundLen) || 0);
    }
  }

  function updateSelection(items) {
    items.forEach((item, i) => {
      item.classList.toggle('selected', i === selectedIndex);
    });
  }

  // ── Get current word being typed ──
  function getTextContext(el) {
    let text = '';
    let cursorPos = 0;

    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (!sel.rangeCount) return { currentWord: '', previousWord: '', hasModalVerb: false, detectedTense: null, expectedPOS: null, genderContext: null, posStrength: 0, caseContext: null, previousTwoWords: '' };
      const range = sel.getRangeAt(0);
      let node = range.startContainer;
      let offset = range.startOffset;

      // Editors like CKEditor may place the cursor at an element boundary
      // (e.g. <p>|) instead of inside a text node. Resolve to the nearest text node.
      if (node.nodeType !== Node.TEXT_NODE) {
        let resolved = false;
        if (offset > 0 && offset <= node.childNodes.length) {
          let child = node.childNodes[offset - 1];
          while (child && child.nodeType !== Node.TEXT_NODE && child.lastChild) {
            child = child.lastChild;
          }
          if (child && child.nodeType === Node.TEXT_NODE) {
            node = child;
            offset = child.textContent.length;
            resolved = true;
          }
        }
        if (!resolved) {
          return { currentWord: '', previousWord: '', hasModalVerb: false, detectedTense: null, expectedPOS: null, genderContext: null, posStrength: 0, caseContext: null, previousTwoWords: '' };
        }
      }

      text = node.textContent;
      cursorPos = offset;
    } else {
      text = el.value || '';
      cursorPos = el.selectionStart || 0;
    }

    const beforeCursor = text.slice(0, cursorPos);

    // Get current word
    const currentMatch = beforeCursor.match(/[\wáàâäãåæéèêëíìîïóòôöõøúùûüñçß]+$/i);
    const currentWord = currentMatch ? currentMatch[0] : '';

    // Get previous word (word before the current one)
    const beforeCurrentWord = currentMatch
      ? beforeCursor.slice(0, beforeCursor.length - currentMatch[0].length).trimEnd()
      : beforeCursor.trimEnd();
    const prevMatch = beforeCurrentWord.match(/[\wáàâäãåæéèêëíìîïóòôöõøúùûüñçß]+$/i);
    const previousWord = prevMatch ? prevMatch[0].toLowerCase() : '';

    // Check if any modal verb exists in the sentence before the current word
    // This helps suggest infinitive forms (e.g., "ich kann Deutsch spr..." → "sprechen")
    const wordsBeforeCursor = beforeCurrentWord.toLowerCase().split(/\s+/);
    const hasModalVerb = wordsBeforeCursor.some(w => MODAL_VERBS.has(w));

    // Detect dominant tense in surrounding text (all languages)
    // Scans recent words for known present/past verb forms to detect tense consistency
    let detectedTense = null;
    {
      let presensCount = 0;
      let preteritumCount = 0;
      const recentTokens = wordsBeforeCursor.slice(-20);
      for (const w of recentTokens) {
        if (knownPresens.has(w)) presensCount++;
        if (knownPreteritum.has(w)) preteritumCount++;
      }
      // Need at least 2 verb hits to be confident, and a clear majority
      const total = presensCount + preteritumCount;
      if (total >= 2) {
        if (presensCount > preteritumCount) detectedTense = 'present';
        else if (preteritumCount > presensCount) detectedTense = 'past';
      }
    }

    // German: detect grammatical case from governing preposition
    // Checks previous word and 2 words back (for "mit dem H..." pattern)
    let caseContext = null;
    if (currentLang === 'de') {
      if (previousWord) caseContext = PREPOSITION_CASE[previousWord] || null;
      if (!caseContext && wordsBeforeCursor.length >= 2) {
        const twoBack = wordsBeforeCursor[wordsBeforeCursor.length - 2];
        if (twoBack) caseContext = PREPOSITION_CASE[twoBack] || null;
      }
    }

    // Detect POS expectation and gender context from determiners/prepositions
    let expectedPOS = null;  // 'noun_adj' when next word is likely a noun/adjective
    let genderContext = null; // gender hint ('m', 'f', 'n') from determiner
    let posStrength = 0;     // 2 = strong (determiner), 1 = moderate (preposition)

    const detMap = DETERMINERS_BY_LANG[currentLang];
    if (detMap) {
      // Check immediate previous word for a determiner
      if (previousWord && detMap[previousWord] !== undefined) {
        expectedPOS = 'noun_adj';
        genderContext = detMap[previousWord];
        posStrength = 2;
      } else if (wordsBeforeCursor.length >= 2) {
        // 2-word lookback: handles "die große Sch..." (article + adjective + noun)
        const twoBack = wordsBeforeCursor[wordsBeforeCursor.length - 2];
        if (twoBack && detMap[twoBack] !== undefined) {
          expectedPOS = 'noun_adj';
          genderContext = detMap[twoBack];
          posStrength = 2;
        }
      }
    }

    // Prepositions: moderate noun/adj signal (no verb demote)
    if (!expectedPOS) {
      const prepSet = PREPOSITIONS_BY_LANG[currentLang];
      if (prepSet && previousWord && prepSet.has(previousWord)) {
        expectedPOS = 'noun_adj';
        posStrength = 1;
      }
    }

    // NB/NN number + definiteness agreement signal
    let numberContext = null;
    let definitenessContext = null;
    if (currentLang === 'nb' || currentLang === 'nn') {
      const agreeMap = NB_NN_AGREEMENT_CONTEXT[currentLang];
      let agree = previousWord && agreeMap[previousWord];
      if (!agree && wordsBeforeCursor.length >= 2) {
        const twoBack = wordsBeforeCursor[wordsBeforeCursor.length - 2];
        agree = twoBack && agreeMap[twoBack];
      }
      if (agree) {
        numberContext = agree.number || null;
        definitenessContext = agree.definiteness || null;
      }
    }

    // Two-word lookback for multi-word bigram keys (e.g. "ha det" → "bra")
    const previousTwoWords = wordsBeforeCursor.length >= 2
      ? wordsBeforeCursor.slice(-2).join(' ')
      : '';

    return { currentWord, previousWord, hasModalVerb, detectedTense, expectedPOS, genderContext, posStrength, caseContext, previousTwoWords, numberContext, definitenessContext };
  }

  // ── Fuzzy matching delegated to prediction-engine.js (Phase 43-02) ──
  // findSuggestions is a thin wrapper that assembles `vocab` + `prefs` and
  // calls ENGINE.suggest. The engine owns matchScore, phoneticMatchScore,
  // levenshtein, applyBoosts, freqSignal, lowFreqDemotion, sharedSuffixLen.
  function findSuggestions(input, maxResults, pronounContext = null, hasModalVerb = false, detectedTense = null, expectedPOS = null, genderContext = null, posStrength = 0, caseContext = null, previousWord = '', previousTwoWords = '', numberContext = null, definitenessContext = null) {
    // F43-1: pass PRED_VOCAB so the engine sees the per-surface wordList +
    // freq + bigrams when an out-of-band prediction lang is active. When
    // the prediction lang matches the seam's hydration, PRED_VOCAB
    // transparently delegates to VOCAB — zero overhead on the common path.
    return ENGINE.suggest(input, PRED_VOCAB, {
      lang: currentLang,
      maxResults: maxResults,
      prefixIndex: prefixIndex,
      recentWordsSet: recentWordsSet,
      pronounContext: pronounContext,
      hasModalVerb: hasModalVerb,
      detectedTense: detectedTense,
      expectedPOS: expectedPOS,
      genderContext: genderContext,
      posStrength: posStrength,
      caseContext: caseContext,
      previousWord: previousWord,
      previousTwoWords: previousTwoWords,
      numberContext: numberContext,
      definitenessContext: definitenessContext,
    });
  }

  // ── Show / hide dropdown ──
  //
  // Thin wrapper: (a) captures the full suggestions array for reveal-click
  // re-render, (b) resets expanded state (Pitfall 5 — reveal doesn't leak
  // across keystrokes), (c) delegates rendering to renderDropdownBody so
  // the reveal-click path can re-render in place without re-running
  // findSuggestions.
  function showDropdown(suggestions, el) {
    selectedIndex = 0;
    expanded = false;                 // Pitfall 5: reset on every new dropdown session
    lastSuggestions = suggestions;    // capture for reveal-click re-render path
    renderDropdownBody(el);
    positionDropdown(el);
    dropdown.classList.add('visible');
  }

  // renderDropdownBody: assembles dropdown.innerHTML + attaches handlers.
  // Called by showDropdown (initial render) AND by the Vis-flere reveal
  // handler / ArrowDown auto-reveal path (re-render in place). Reads the
  // module-scoped expanded flag to pick the visible cap.
  function renderDropdownBody(el) {
    const visibleCap = expanded ? VISIBLE_EXPANDED : VISIBLE_DEFAULT;
    const visible = lastSuggestions.slice(0, visibleCap);
    const hasMore = lastSuggestions.length > visible.length;
    const visLabel = expanded ? t('pred_vis_faerre') : t('pred_vis_flere');
    // ⌃ (U+2303) for collapse (expanded state), ⌄ (U+2304) for expand.
    const visChevron = expanded ? '\u2303' : '\u2304';

    const itemsHtml = visible.map((s, i) => {
      const posLabel = s.bank ? bankToPosShort(s.bank) : '';
      const typoHint = s.type === 'typo' ? `<span class="lh-pred-typo">${escapeHtml(t('pred_typo_hint'))}</span>` : '';
      const compoundHint = s.type === 'compound' ? `<span class="lh-pred-typo">${escapeHtml(t('pred_compound_hint'))}</span>` : '';
      const compoundAttr = s.compoundReplaceLen ? ` data-compound-len="${s.compoundReplaceLen}"` : '';
      return `
      <div class="lh-pred-item ${i === selectedIndex ? 'selected' : ''}" data-word="${escapeAttr(s.display)}"${compoundAttr}>
        <span class="lh-pred-word">${escapeHtml(s.display)}${typoHint}${compoundHint}</span>
        ${posLabel ? `<span class="lh-pred-pos">${escapeHtml(posLabel)}</span>` : ''}
        <span class="lh-pred-translation">${escapeHtml(s.translation)}</span>
      </div>`;
    }).join('');

    // Vis-flere link: shown when either more candidates are available
    // (hasMore) OR we're currently expanded (so users can collapse back).
    const visFlereHtml = hasMore || expanded
      ? `<div class="lh-pred-vis-flere" role="button" tabindex="-1">${escapeHtml(visLabel)} ${visChevron}</div>`
      : '';

    dropdown.innerHTML = itemsHtml + visFlereHtml + `<div class="lh-pred-footer"><img src="${chrome.runtime.getURL('assets/icon-16.png')}" class="lh-pred-icon" alt=""><button class="lh-pred-lang" title="${escapeAttr(t('pred_switch_lang'))}">${LANG_LABELS[currentLang] || currentLang.toUpperCase()}</button><span class="lh-pred-hint">${escapeHtml(t('pred_tab_hint'))}</span><button class="lh-pred-pause" title="${escapeAttr(t('pred_pause'))}">\u23F8</button></div>`;

    attachDropdownHandlers(el);
  }

  // attachDropdownHandlers: wires up language switcher, pause button,
  // item-click handlers, AND the Vis-flere reveal link. Called from
  // renderDropdownBody after every (re-)render — event listeners on the
  // previous innerHTML are discarded when innerHTML is replaced, so
  // re-attaching is mandatory on each render pass.
  function attachDropdownHandlers(el) {
    // Attach language switcher handler
    const langBtn = dropdown.querySelector('.lh-pred-lang');
    if (langBtn) {
      langBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showLangPicker();
      });
    }

    // Attach pause button handler
    const pauseBtn = dropdown.querySelector('.lh-pred-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        disablePredictionsQuick();
      });
    }

    // Attach click handlers — preventDefault keeps focus in the editor,
    // stopPropagation prevents CKEditor from seeing the click and blurring.
    dropdown.querySelectorAll('.lh-pred-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        applySuggestion(item.dataset.word, parseInt(item.dataset.compoundLen) || 0);
      });
    });

    // Attach Vis-flere reveal handler (flip expanded + re-render in place).
    // Mirrors the .lh-pred-item mousedown guard: preventDefault keeps the
    // editor focused; stopPropagation prevents the click from bubbling to
    // the item-level handler and triggering applySuggestion.
    const visFlereEl = dropdown.querySelector('.lh-pred-vis-flere');
    if (visFlereEl) {
      visFlereEl.addEventListener('mousedown', (e) => {
        e.preventDefault();           // keep focus in the editor
        e.stopPropagation();          // don't bubble into item-click
        expanded = !expanded;
        renderDropdownBody(el);       // NOT showDropdown — that would reset expanded
      });
    }
  }

  function positionDropdown(el) {
    let rect;
    if (el.isContentEditable) {
      const sel = window.getSelection();
      if (sel.rangeCount) {
        rect = sel.getRangeAt(0).getBoundingClientRect();
      } else {
        rect = el.getBoundingClientRect();
      }
    } else {
      rect = el.getBoundingClientRect();
    }

    let top = rect.bottom + 4;
    let left = rect.left;

    // Adjust if going off-screen
    dropdown.style.left = Math.max(8, left) + 'px';
    dropdown.style.top = top + 'px';

    // After rendering, check if it overflows
    requestAnimationFrame(() => {
      const dRect = dropdown.getBoundingClientRect();
      if (dRect.bottom > window.innerHeight - 8) {
        dropdown.style.top = (rect.top - dRect.height - 4) + 'px';
      }
      if (dRect.right > window.innerWidth - 8) {
        dropdown.style.left = (window.innerWidth - dRect.width - 8) + 'px';
      }
    });
  }

  // ── Language picker (inline in dropdown footer) ──
  const LANG_PICKER_FLAGS = { de: '\uD83C\uDDE9\uD83C\uDDEA', es: '\uD83C\uDDEA\uD83C\uDDF8', fr: '\uD83C\uDDEB\uD83C\uDDF7', en: '\uD83C\uDDEC\uD83C\uDDE7', nb: 'NB', nn: 'NN' };
  const BUNDLED_PREDICTION_LANGS = ['nb', 'nn', 'en'];

  async function getAvailableLangs() {
    const langs = [...BUNDLED_PREDICTION_LANGS];
    if (window.__lexiVocabStore) {
      try {
        const cached = await window.__lexiVocabStore.listCachedLanguages();
        for (const c of cached) {
          if (!langs.includes(c.language)) langs.push(c.language);
        }
      } catch {}
    }
    return langs;
  }

  async function showLangPicker() {
    const langs = await getAvailableLangs();
    const footer = dropdown.querySelector('.lh-pred-footer');
    if (!footer) return;

    footer.innerHTML = langs.map(lang =>
      `<button class="lh-pred-lang-option ${lang === currentLang ? 'active' : ''}" data-lang="${lang}">${LANG_PICKER_FLAGS[lang] || ''} ${LANG_LABELS[lang] || lang.toUpperCase()}</button>`
    ).join('');

    footer.querySelectorAll('.lh-pred-lang-option').forEach(btn => {
      btn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const lang = btn.dataset.lang;
        if (lang === currentLang) return;
        switchPredictionLang(lang);
      });
    });
  }

  async function switchPredictionLang(lang) {
    // Plan 43-04: per-surface language. Write `lang.prediction` only —
    // dictionary / spellcheck / widget remain independent. Our own
    // chrome.storage.onChanged handler above also fires (idempotent: no-op
    // because we already updated currentLang here).
    currentLang = lang;
    await chromeStorageSet({ 'lang.prediction': lang });
    await loadRecentWords(lang);
    // F43-1: load + activate the per-surface sidecar before the prefix
    // index rebuild fires. Otherwise the first keystroke after switching
    // from DE to NB would race the async sidecar load and produce DE
    // suggestions for one frame.
    try { await loadPredictionSidecar(lang); } catch (_) {}
    VOCAB.onReady(refreshFromVocab);
    hideDropdown();
    // Re-prediction on the active field is driven by the user's next keystroke;
    // schedulePrediction here would race the seam's async reload.
  }

  function chromeStorageSet(obj) {
    return new Promise(resolve => chrome.storage.local.set(obj, resolve));
  }

  function disablePredictionsQuick() {
    enabled = false;
    chrome.storage.local.set({ predictionEnabled: false });
    // Cancel any pending prediction timer
    if (predictionTimer) {
      clearTimeout(predictionTimer);
      predictionTimer = null;
    }
    hideDropdown();
    showToast(t('toast_prediction_disabled'));
  }

  function showToast(msg) {
    const toast = document.createElement('div');
    toast.className = 'lh-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('visible');
      setTimeout(() => {
        toast.classList.remove('visible');
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }, 10);
  }

  function hideDropdown() {
    if (!dropdown) return;
    dropdown.classList.remove('visible');
    selectedIndex = -1;
  }

  // ── Sentence-start capitalization ──
  function shouldCapitalize(textBefore) {
    const trimmed = textBefore.trim();
    if (trimmed.length === 0) return true; // Start of document
    return /[.!?]\s*$/.test(textBefore) || /\n\s*$/.test(textBefore);
  }

  function capitalizeFirst(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  // ── Apply suggestion ──
  // compoundReplaceLen: if > 0, replace this many chars before cursor (prev word + space + current word)
  function applySuggestion(word, compoundReplaceLen = 0) {
    if (!activeElement) return;

    if (activeElement.isContentEditable) {
      applyToContentEditable(word, compoundReplaceLen);
    } else {
      applyToInput(word, compoundReplaceLen);
    }

    trackRecentWord(word);
    hideDropdown();
  }

  function applyToInput(word, compoundReplaceLen = 0) {
    const el = activeElement;
    const text = el.value || '';
    const cursorPos = el.selectionStart || 0;

    // Find the current word boundaries
    const before = text.slice(0, cursorPos);
    const after = text.slice(cursorPos);
    const match = before.match(/[\wáàâäãåæéèêëíìîïóòôöõøúùûüñçß]+$/i);

    if (match) {
      // Compound: replace previous word + space + current word
      const replaceStart = compoundReplaceLen > 0
        ? cursorPos - compoundReplaceLen
        : cursorPos - match[0].length;
      if (shouldCapitalize(text.slice(0, replaceStart))) {
        word = capitalizeFirst(word);
      }
      el.value = text.slice(0, replaceStart) + word + after;
      const newPos = replaceStart + word.length;
      el.selectionStart = newPos;
      el.selectionEnd = newPos;
    } else {
      el.value = text.slice(0, cursorPos) + word + after;
      const newPos = cursorPos + word.length;
      el.selectionStart = newPos;
      el.selectionEnd = newPos;
    }

    // Trigger input event so page JS reacts
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function applyToContentEditable(word, compoundReplaceLen = 0) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    let node = range.startContainer;
    let cursorPos = range.startOffset;

    // Resolve element node to nearest text node (same as getTextContext)
    if (node.nodeType !== Node.TEXT_NODE) {
      if (cursorPos > 0 && cursorPos <= node.childNodes.length) {
        let child = node.childNodes[cursorPos - 1];
        while (child && child.nodeType !== Node.TEXT_NODE && child.lastChild) {
          child = child.lastChild;
        }
        if (child && child.nodeType === Node.TEXT_NODE) {
          node = child;
          cursorPos = child.textContent.length;
        } else {
          return;
        }
      } else {
        return;
      }
    }

    const text = node.textContent;
    const before = text.slice(0, cursorPos);
    const match = before.match(/[\wáàâäãåæéèêëíìîïóòôöõøúùûüñçß]+$/i);

    if (match) {
      // Compound: replace previous word + space + current word
      const wordStart = compoundReplaceLen > 0
        ? cursorPos - compoundReplaceLen
        : cursorPos - match[0].length;

      if (shouldCapitalize(text.slice(0, wordStart))) {
        word = capitalizeFirst(word);
      }

      // Select the partial word so it gets replaced
      const selectRange = document.createRange();
      selectRange.setStart(node, wordStart);
      selectRange.setEnd(node, cursorPos);
      sel.removeAllRanges();
      sel.addRange(selectRange);

      // Ensure the contenteditable has focus (needed after dropdown clicks)
      if (activeElement) activeElement.focus();

      // Use execCommand('insertText') so editors like CKEditor process it
      // through their input pipeline (fires beforeinput/input events).
      // Falls back to direct DOM manipulation for basic contenteditables.
      if (!document.execCommand('insertText', false, word)) {
        node.textContent = text.slice(0, wordStart) + word + text.slice(cursorPos);
        const newRange = document.createRange();
        newRange.setStart(node, wordStart + word.length);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
        activeElement.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  // ── Helpers ──
  // isTextInput is now sourced from VOCAB.isTextInput (ported to vocab-seam.js
  // at Plan 01). spell-check.js consumes vocab directly from __lexiVocab; no
  // prediction-side export remains.

  function escapeHtml(str) {
    const d = document.createElement('span');
    d.textContent = str;
    return d.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  // ── Plan 43-04: passive auto-detect hint banner ──────────────────
  // Mirrors spell-check-renderer's banner. Surfaces above the active input
  // when __lexiDetectLanguage reports a high-confidence mismatch with the
  // user's stored `lang.prediction`. One-click "Bytt" persists; never
  // auto-switches.
  let langHintEl = null;
  let langHintLastDetected = null;
  const langHintDismissed = new Set();

  function langDisplayNamePred(code) {
    return t('lang_hint_name_' + code) || code.toUpperCase();
  }
  function hideLangHintPred() {
    if (langHintEl) { langHintEl.remove(); langHintEl = null; }
  }
  function maybeShowLangHint(el) {
    if (!el) { hideLangHintPred(); return; }
    let text = '';
    if (typeof el.value === 'string') text = el.value;
    else if (el.isContentEditable) text = el.textContent || '';
    if (!text || text.length < 8) { hideLangHintPred(); return; }
    const detect = self.__lexiDetectLanguage;
    if (typeof detect !== 'function') return;
    let result = null;
    try { result = detect(text); } catch (_) { return; }
    if (!result || result.confidence !== 'high') { hideLangHintPred(); return; }
    const detected = result.lang;
    if (!detected || detected === currentLang) { hideLangHintPred(); return; }
    if (langHintDismissed.has(detected)) { hideLangHintPred(); return; }
    if (langHintEl && langHintLastDetected === detected) return;
    langHintLastDetected = detected;
    renderLangHintPred(el, detected);
  }
  function renderLangHintPred(el, detected) {
    hideLangHintPred();
    const banner = document.createElement('div');
    banner.className = 'lh-lang-hint';
    banner.setAttribute('role', 'status');
    const msg = document.createElement('span');
    msg.className = 'lh-lang-hint-msg';
    msg.textContent = t('lang_hint_message', {
      language: langDisplayNamePred(detected),
      code: detected.toUpperCase(),
    });
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'lh-lang-hint-accept';
    accept.textContent = t('lang_hint_accept');
    accept.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      // Writing lang.prediction triggers our chrome.storage.onChanged
      // handler at init() time, which now also kicks off
      // loadPredictionSidecar — so no extra wiring needed here.
      try { chrome.storage.local.set({ 'lang.prediction': detected }); } catch (_) {}
      currentLang = detected;
      hideLangHintPred();
    });
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'lh-lang-hint-dismiss';
    dismiss.textContent = t('lang_hint_dismiss');
    dismiss.addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      langHintDismissed.add(detected);
      hideLangHintPred();
    });
    banner.appendChild(msg);
    banner.appendChild(accept);
    banner.appendChild(dismiss);
    // Fest til fullscreenElement når fullskjerm er aktiv — innebygde
    // prøvevertar (lockdown) køyrer i fullskjerm, og body-appendar hamnar
    // utanfor det synlege laget der. Same mønster som språkhint-banneret i
    // spell-check-renderer.js. (UAT-funn lockdown 28.08.2026.)
    (document.fullscreenElement || document.body).appendChild(banner);
    const r = el.getBoundingClientRect();
    banner.style.position = 'fixed';
    banner.style.left = Math.max(8, r.left) + 'px';
    banner.style.top = Math.max(8, r.top - 36) + 'px';
    banner.style.zIndex = '2147483646';
    langHintEl = banner;
  }
})();
