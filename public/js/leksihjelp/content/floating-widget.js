/**
 * Leksihjelp — Floating TTS Widget (content script)
 *
 * Shows a glassmorphism widget when user selects text.
 * Uses ElevenLabs (authenticated) or browser speechSynthesis (fallback).
 *
 * Phase 43-03 (engine-extractions-per-surface-language):
 * Refactored as `mountFloatingWidget(deps)` per the Phase 30 dep-injection
 * contract. Executor decided AGAINST a separate `floating-widget-engine.js`:
 * the file is ~95% UI (DOM creation, event listeners, voice-select dropdowns,
 * word-by-word highlight via DOM spans, audio.currentTime polling, drag/
 * resize handles). The only candidate "pure" function — voice-language
 * mapping — is a 3-line lookup against ELEVENLABS_VOICES / BROWSER_VOICE_LANGS.
 * Splitting it out would be ceremony-without-consumer; the lockdown sidepanel
 * doesn't need a Node-runnable seam here, and `check-engine-purity` correctly
 * scans only `*-engine.js` siblings (none produced by this plan).
 *
 * What IS new in 43-03:
 *   1. Dep contract — `mountFloatingWidget(deps)` accepts an explicit deps
 *      object (chromeApi, windowApi, documentApi, i18n, examHelper, vocab,
 *      pause, lookupCacheStore, detectLanguage, backendUrl). Defaults pull
 *      from the live globals so the auto-mount call site is a one-liner.
 *      Downstream consumers (lockdown sidepanel, future skriveokt-zero) can
 *      pass shimmed deps without monkey-patching.
 *   2. Fullscreen-reparent logic ported upstream from
 *      lockdown/public/js/leksihjelp-loader.js:838 — on `fullscreenchange`,
 *      the widget DOM and the lookup card / prediction dropdown re-parent
 *      into the active fullscreen element. Idempotent across multiple
 *      toggles. Retires the lockdown-side TODO.
 */

(function () {
  'use strict';

  // Rapportflater (ønskjeord, compound-vote, «Rapporter feil») sender via
  // SEND_REPORT. Ein embed-vert kan erklære `report: false` — då skal flatene
  // ikkje RENDERAST i det heile. Å vise ein knapp som stille blir avvist er
  // verre enn ingen knapp: brukaren trykkjer, får ingen kvittering, og trur
  // meldinga vart send. Les ved KALLTID — i embed lastar dette skriptet før
  // host-runtime installerer. Sjå extension/host-capabilities.js.
  function reportChannelOpen() {
    const h = typeof self !== 'undefined' ? self : globalThis;
    return typeof h.lexiHostAllows === 'function' ? h.lexiHostAllows('report') : true;
  }

  // Default-deps factory. Pulls every external dependency from the live
  // browser globals so the auto-mount path is unchanged. Downstream callers
  // can override any field; missing fields fall back to live globals.
  function defaultDeps() {
    const i18n = (typeof self !== 'undefined' && self.__lexiI18n) || {};
    return {
      chromeApi: typeof chrome !== 'undefined' ? chrome : null,
      windowApi: typeof window !== 'undefined' ? window : null,
      documentApi: typeof document !== 'undefined' ? document : null,
      i18n,
      examHelper: typeof self !== 'undefined' ? self.__lexiExam : null,
      pause: typeof self !== 'undefined' ? self.__lexiPause : null,
      vocab: typeof self !== 'undefined' ? self.__lexiVocab : null,
      vocabStore: typeof window !== 'undefined' ? window.__lexiVocabStore : null,
      detectLanguage: typeof self !== 'undefined' ? self.__lexiDetectLanguage : null,
      backendUrl: 'https://leksihjelp.no',
    };
  }

  function mountFloatingWidget(rawDeps) {
  const deps = Object.assign({}, defaultDeps(), rawDeps || {});
  const chromeApi = deps.chromeApi;
  const windowApi = deps.windowApi;
  const documentApi = deps.documentApi;

  const { t, initI18n, setUiLanguage, getUiLanguage, langName } = deps.i18n;

  /** Pick the right Norwegian translation based on UI language (nn vs nb). */
  function getTranslation(entry) {
    if (!entry) return '';
    const ui = getUiLanguage();
    if (ui === 'nn' && entry.linkedTo?.nn?.translation) return entry.linkedTo.nn.translation;
    if (ui === 'nb' && entry.linkedTo?.nb?.translation) return entry.linkedTo.nb.translation;
    return entry.translation || '';
  }

  const BACKEND_URL = deps.backendUrl;

  // Predefined ElevenLabs voices per language
  const ELEVENLABS_VOICES = {
    es: [
      { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Carolina (feminin)' },
      { id: 'VR6AewLTigWG4xSOukaG', name: 'Alejandro (maskulin)' },
      { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lucía (feminin)' }
    ],
    de: [
      { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Hannah (feminin)' },
      { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Lukas (maskulin)' },
      { id: 'XB0fDUnXU5powFXDhCwa', name: 'Anna (feminin)' }
    ],
    fr: [
      { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (feminin)' },
      { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Henri (maskulin)' },
      { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Sophie (feminin)' }
    ],
    en: [
      { id: 'ThT5KcBeYPX3keUQqHPh', name: 'Emily (feminin)' },
      { id: 'VR6AewLTigWG4xSOukaG', name: 'James (maskulin)' },
      { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Sophie (feminin)' }
    ],
    no: [
      { id: '2dhHLsmg0MVma2t041qT', name: 'Johannes (maskulin)' },
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (feminin)' },
      { id: 'FGY2WhTYpPnrIDTdsKH5', name: 'Laura (feminin)' }
    ]
  };

  // Language display names
  const LANG_NAMES = {
    es: 'Spansk',
    de: 'Tysk',
    fr: 'Fransk',
    en: 'Engelsk',
    nn: 'Nynorsk',
    no: 'Norsk'
  };

  // Map language codes to ElevenLabs voice keys
  // NB/NN both use the 'no' Norwegian voices
  const VOICE_LANG_MAP = { nb: 'no', nn: 'no' };

  // Browser TTS voice name patterns per language
  const BROWSER_VOICE_LANGS = {
    es: 'es',
    de: 'de',
    fr: 'fr',
    en: 'en',
    nb: 'nb',
    nn: 'nb', // Nynorsk uses same voice as Bokmål
    no: 'nb'
  };

  let widget = null;
  let currentAudio = null;
  let premiumPlaybackRun = 0;
  let premiumPlaybackActive = false;
  let settleCurrentAudio = null;
  let currentUtterance = null;
  let isAuthenticated = false;
  // 2026-08-15 free taste: a logged-in user WITHOUT premium may still hear
  // the paid voice, for a couple of thousand characters a month. Kept
  // separate from isAuthenticated because the two mean different things when
  // they run out — a subscriber who spends the month's quota goes quietly
  // back to the browser voice, while this one is the moment to say what
  // premium is. `freeTasteSpent` is per page-session: once the server has
  // said the sample is gone, stop asking it on every play.
  let freeVoiceTaste = false;
  let freeTasteSpent = false;
  const canUsePremiumVoice = () => isAuthenticated || (freeVoiceTaste && !freeTasteSpent);
  let currentLang = 'en'; // Target language (from settings)
  let selectedText = '';
  // Phase 27: cached exam-mode flag. Updated on init + storage.onChanged.
  let examMode = false;
  let hideExampleSentences = false;
  let readingLang = 'target'; // 'target' or 'no' - which language to read aloud
  let widgetWordSpans = []; // DOM span references for each word in the widget text area
  let wordCharPositions = []; // [{word, charStart, charEnd}] for timing sync
  let wordTimingInterval = null; // For ElevenLabs word timing estimation
  let browserTtsCharIndex = 0; // Last known charIndex for browser TTS restart
  let widgetEnabled = true;       // Hurtigoppslag (right-click → lookup card)
  let ttsWidgetEnabled = true;    // Uttaleknapp (TTS bubble on text selection)

  // Per-language inflection indexes for the lookup card — built lazily on first
  // lookup per language, then cached for the session. Maps lowercase inflected
  // form → { entry, bank } so we can resolve "schrieb" → schreiben_verb, etc.
  const _widgetInflectionCache = new Map();
  let justDragged = false; // Prevents hideWidget after drag ends
  let justDblClicked = false; // Prevents TTS widget on double-click (lookup handles it)

  // Font size settings
  const FONT_SIZE_MIN = 12;
  const FONT_SIZE_MAX = 36;
  const FONT_SIZE_STEP = 1;
  const FONT_SIZE_DEFAULT = 15;
  let widgetFontSize = FONT_SIZE_DEFAULT;
  let fontSizeMode = 'auto'; // 'auto' or 'fixed'

  // ── Init ──
  init();

  async function init() {
    await initI18n();
    const stored = await chromeStorageGet(['isAuthenticated', 'freeVoiceTaste', 'lang.widget', 'widgetEnabled', 'ttsWidgetEnabled', 'widgetFontSize', 'fontSizeMode', 'examMode', 'hideExampleSentences', 'widgetPos']);
    isAuthenticated = stored.isAuthenticated || false;
    freeVoiceTaste = stored.freeVoiceTaste || false;
    currentLang = stored['lang.widget'] || 'en';
    widgetEnabled = stored.widgetEnabled !== false;
    // Migrate from legacy combined widgetEnabled if ttsWidgetEnabled was
    // never written, so users who turned the old combined toggle off keep
    // both surfaces off until they explicitly re-enable each one.
    ttsWidgetEnabled = stored.ttsWidgetEnabled !== undefined && stored.ttsWidgetEnabled !== null
      ? stored.ttsWidgetEnabled !== false
      : stored.widgetEnabled !== false;
    widgetFontSize = stored.widgetFontSize || FONT_SIZE_DEFAULT;
    fontSizeMode = stored.fontSizeMode || 'auto';
    examMode = !!stored.examMode;
    // "Ordbok uten eksempelsetninger" — a third level below exam mode.
    // Examples are shown in ordinary exam mode in every language; only
    // this explicit flag removes them. Nothing sets it yet — see
    // `dictionary.examples` in extension/exam-registry.js.
    hideExampleSentences = !!stored.hideExampleSentences;
    const widgetPos = stored.widgetPos;

    createWidget();
    if (widgetPos) {
      widget.classList.add('dragged');
      widget.style.setProperty('left', widgetPos.left + 'px', 'important');
      widget.style.setProperty('top', widgetPos.top + 'px', 'important');
    }
    applyExamModeClass();
    attachListeners();
    attachFullscreenReparent();

    // Phase 27: live-toggle awareness. The widget itself stays visible in
    // exam mode (dictionary lookup + TTS are allowed static reference); only
    // surfaces flagged unsafe in __lexiExamRegistry close. We close the
    // pedagogy panel here so a Lær mer expansion doesn't survive the flip.
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if ('examMode' in changes) {
        examMode = !!changes.examMode.newValue;
        applyExamModeClass();
        if (examMode && !isSurfaceAllowed('widget.pedagogyPanel')) {
          collapsePedagogyPanelIfOpen();
        }
      }
      // Same cadence for the example-sentence flag, so it lands on the next
      // lookup rather than requiring a reload once something does set it.
      if ('hideExampleSentences' in changes) {
        hideExampleSentences = !!changes.hideExampleSentences.newValue;
      }
    });

    function collapsePedagogyPanelIfOpen() {
      // Best-effort: if any "Lær mer" disclosure is currently open inside the
      // widget, close it. The widget renders pedagogy via a <details> element
      // (or an .lh-pedagogy-open class) — both shapes covered.
      if (!widget) return;
      const det = widget.querySelectorAll('details[open]');
      det.forEach(d => d.removeAttribute('open'));
      const open = widget.querySelectorAll('.lh-pedagogy-open');
      open.forEach(n => n.classList.remove('lh-pedagogy-open'));
    }

    // Plan 43-04: per-surface language for widget. Subscribe to
    // `lang.widget` via chrome.storage.onChanged. LANGUAGE_CHANGED retired.
    if (chrome.storage && chrome.storage.onChanged) {
      chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if ('lang.widget' in changes) {
          const next = changes['lang.widget'].newValue;
          if (next) currentLang = next;
        }
      });
    }

    // Listen for setting changes and context menu actions
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg.type === 'AUTH_CHANGED') {
        isAuthenticated = msg.isAuthenticated;
        // Only reset the spent flag when the sender actually knows about the
        // taste; an older sender omits it, and treating `undefined` as false
        // would hand the sample back on every auth ping.
        if (typeof msg.freeVoiceTaste === 'boolean') {
          freeVoiceTaste = msg.freeVoiceTaste;
          freeTasteSpent = false;
        }
      }
      if (msg.type === 'UI_LANGUAGE_CHANGED') {
        setUiLanguage(msg.uiLanguage);
      }
      if (msg.type === 'WIDGET_ENABLED_CHANGED') {
        widgetEnabled = msg.enabled;
        // Hurtigoppslag controls the right-click lookup card; the TTS
        // floater has its own toggle (ttsWidgetEnabled) and is not hidden
        // here. If a lookup card is open, close it.
        const card = document.getElementById('lexi-lookup-card');
        if (!widgetEnabled && card) card.remove();
      }
      if (msg.type === 'TTS_WIDGET_ENABLED_CHANGED') {
        ttsWidgetEnabled = msg.enabled;
        if (!ttsWidgetEnabled) hideWidget();
      }
      if (msg.type === 'PLAY_TTS' && msg.text) {
        selectedText = msg.text;
        showWidget(true); // explicit action — bypass pause
        handlePlay();
      }
      if (msg.type === 'LOOKUP_WORD' && msg.word) {
        showInlineLookup(msg.word);
      }
      if (msg.type === 'TRIGGER_LOOKUP') {
        const sel = window.getSelection().toString().trim();
        if (sel) showInlineLookup(sel);
      }
      if (msg.type === 'TRIGGER_LOOKUP_CONTEXT') {
        const sel = window.getSelection().toString().trim();
        const word = (sel && !/\s/.test(sel)) ? sel : lastContextWord;
        if (word) showInlineLookup(word);
      }
      if (msg.type === 'RSVP_READ_FROM_CONTEXT') {
        const reader = self.__lexiRsvpReader;
        const dom = self.__lexiRsvpSourceDom;
        if (!reader || !dom) return;
        // Read on from the clicked paragraph through its siblings: the
        // container is the paragraph's parent, and the adapter enumerates its
        // block children. Climb to the enclosing block first — a right-click
        // frequently lands on a link or a <strong>, and taking that node's own
        // parent would make the container the paragraph itself, leaving
        // nothing to read on to.
        const startEl = nearestRsvpBlock(lastContextElement, dom);
        const container = startEl && startEl.parentElement ? startEl.parentElement : document.body;
        const source = dom.create(container);
        const all = source.getParagraphs();
        // By element identity, never by text: two paragraphs on a page can read
        // the same, and a text match would start at the first of them.
        const startId = source.idAt(lastContextElement);
        const from = Math.max(0, all.findIndex(p => p.id === startId));
        const scoped = {
          getParagraphs: () => all.slice(from),
          reveal: (id) => source.reveal(id),
          highlight: (id) => source.highlight(id),
          dispose: () => source.dispose(),
        };
        reader.openFor({ source: scoped, lang: currentLang });
      }
      if (msg.type === 'TRIGGER_TTS') {
        const sel = window.getSelection().toString().trim();
        if (sel) {
          selectedText = sel;
          showWidget(true); // right-click "Les opp" — bypass pause
          handlePlay();
        }
      }
    });
  }

  function chromeStorageGet(keys) {
    return new Promise(resolve => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  // Phase 27: apply/remove the exam-mode amber-border class on the widget root.
  // CSS hook lives in styles/content.css (.lh-exam-mode) and ALSO ships to
  // lockdown via the sync pipeline (see CLAUDE.md "Downstream consumer").
  function applyExamModeClass() {
    if (!widget) return;
    widget.classList.toggle('lh-exam-mode', !!examMode);
  }

  // Phase 27: surface gate using the shared helper. Returns true when the
  // surface should be SHOWN (safe), false when it should be hidden.
  function isSurfaceAllowed(surfaceId) {
    const helper = self.__lexiExam;
    if (!helper) return !examMode; // fail-safe: if helper missing, off==allowed, on==hidden
    return helper.isSurfaceSafe(surfaceId, examMode);
  }

  // ── Widget DOM ──
  function createWidget() {
    widget = document.createElement('div');
    widget.id = 'lexi-tts-widget';
    const initialModeClass = fontSizeMode === 'auto' ? 'mode-auto' : 'mode-fixed';
    widget.innerHTML = `
      <div class="lh-header">
        <span class="lh-title">${t('widget_title')}</span>
        <div class="lh-font-controls ${initialModeClass}">
          <button class="lh-font-btn lh-font-mode" title="${t('widget_font_auto_tooltip')}">${fontSizeMode === 'auto' ? t('widget_font_auto') : t('widget_font_fixed')}</button>
          <button class="lh-font-btn lh-font-decrease" title="${t('widget_font_smaller')}">A&minus;</button>
          <button class="lh-font-btn lh-font-increase" title="${t('widget_font_larger')}">A+</button>
        </div>
        <div class="lh-header-actions">
          <button class="lh-pause-widget" title="${t('pause_tts_widget_title')}">⏸</button>
          <button class="lh-close" title="${t('widget_close')}">&times;</button>
        </div>
      </div>
      <div class="lh-lang-toggle"></div>
      <div class="lh-text-area-wrapper">
        <div class="lh-text-area" role="region" aria-label="${t('widget_selected_text')}"></div>
      </div>
      <div class="lh-controls">
        <button class="lh-play-btn" title="${t('widget_play')}">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </button>
        <button class="lh-rsvp-btn" title="${t('rsvp_open_title')}">${t('rsvp_open')}</button>
        <div class="lh-slider-group">
          <div class="lh-slider-row">
            <span class="lh-slider-label">${t('widget_speed')}</span>
            <input type="range" class="lh-slider" id="lh-speed" min="0.7" max="1.2" step="0.1" value="1.0">
            <span class="lh-speed-value">1.0×</span>
          </div>
        </div>
      </div>
      <select class="lh-voice-select" id="lh-voice"></select>
      <div class="lh-mode-badge"></div>
    `;
    (document.fullscreenElement || document.documentElement).appendChild(widget);

    // Attach widget event listeners
    widget.querySelector('.lh-close').addEventListener('click', hideWidget);
    widget.querySelector('.lh-pause-widget').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleWidgetPauseMenu(widget.querySelector('.lh-pause-widget'));
    });
    widget.querySelector('.lh-play-btn').addEventListener('click', handlePlay);
    widget.querySelector('.lh-rsvp-btn').addEventListener('click', () => {
      const reader = self.__lexiRsvpReader;
      if (!reader || !selectedText) return;
      // A selection is plain text with no element to highlight, so it needs no
      // DOM adapter — the source is synthesised here. Splitting on blank lines
      // keeps a multi-paragraph selection readable.
      const parts = selectedText.split(/\n\s*\n/).map(s => s.trim()).filter(Boolean);
      const fake = {
        getParagraphs: () => parts.map((text, i) => ({ id: 'sel-' + i, text })),
        reveal: () => {},
        highlight: () => {},
        dispose: () => {},
      };
      reader.openFor({ source: fake, lang: currentLang });
    });
    widget.querySelector('#lh-speed').addEventListener('input', (e) => {
      widget.querySelector('.lh-speed-value').textContent = `${parseFloat(e.target.value).toFixed(1)}×`;
      // Live speed update for browser TTS: restart from current position with new rate
      if (currentUtterance) {
        const newSpeed = parseFloat(e.target.value);
        const remainingText = selectedText.substring(browserTtsCharIndex);
        if (!remainingText.trim()) return;
        const voiceURI = widget.querySelector('#lh-voice').value;
        window.speechSynthesis.cancel();
        currentUtterance = null;
        playBrowserTTS(remainingText, voiceURI, newSpeed, widget.querySelector('.lh-play-btn'), browserTtsCharIndex);
      }
    });

    // Font size controls
    widget.querySelector('.lh-font-decrease').addEventListener('click', () => {
      fontSizeMode = 'fixed';
      adjustFontSize(-FONT_SIZE_STEP);
      updateFontModeButton();
    });
    widget.querySelector('.lh-font-increase').addEventListener('click', () => {
      fontSizeMode = 'fixed';
      adjustFontSize(FONT_SIZE_STEP);
      updateFontModeButton();
    });
    widget.querySelector('.lh-font-mode').addEventListener('click', toggleFontMode);

    // Language picker is populated dynamically in buildLangPicker()

    // Prevent widget clicks from deselecting text,
    // but allow interaction with form controls (slider, select)
    widget.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
      e.preventDefault();
    });

    // ── Drag to reposition ──
    let isDragging = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    const header = widget.querySelector('.lh-header');
    header.addEventListener('mousedown', (e) => {
      // Don't drag when clicking control buttons
      if (e.target.closest('.lh-close') || e.target.closest('.lh-pause-widget')) return;
      isDragging = true;
      const rect = widget.getBoundingClientRect();
      dragOffsetX = e.clientX - rect.left;
      dragOffsetY = e.clientY - rect.top;
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const x = Math.max(0, Math.min(e.clientX - dragOffsetX, window.innerWidth - widget.offsetWidth));
      const y = Math.max(0, Math.min(e.clientY - dragOffsetY, window.innerHeight - widget.offsetHeight));
      widget.classList.add('dragged');
      // Use !important to override the stylesheet !important rules
      widget.style.setProperty('left', x + 'px', 'important');
      widget.style.setProperty('top', y + 'px', 'important');
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        justDragged = true;
        const rect = widget.getBoundingClientRect();
        chrome.storage.local.set({ widgetPos: { left: rect.left, top: rect.top } });
      }
      isDragging = false;
    });

    // ── Resize handles ──
    const resizeRight = document.createElement('div');
    resizeRight.className = 'lh-resize-handle lh-resize-right';
    widget.appendChild(resizeRight);

    const resizeBottom = document.createElement('div');
    resizeBottom.className = 'lh-resize-handle lh-resize-bottom';
    widget.appendChild(resizeBottom);

    const resizeCorner = document.createElement('div');
    resizeCorner.className = 'lh-resize-handle lh-resize-corner';
    widget.appendChild(resizeCorner);

    let isResizing = false;
    let resizeType = '';
    let resizeStartX = 0;
    let resizeStartY = 0;
    let resizeStartW = 0;
    let resizeStartH = 0;

    function startResize(e, type) {
      isResizing = true;
      resizeType = type;
      resizeStartX = e.clientX;
      resizeStartY = e.clientY;
      resizeStartW = widget.offsetWidth;
      resizeStartH = widget.offsetHeight;
      e.preventDefault();
      e.stopPropagation();
    }

    resizeRight.addEventListener('mousedown', (e) => startResize(e, 'right'));
    resizeBottom.addEventListener('mousedown', (e) => startResize(e, 'bottom'));
    resizeCorner.addEventListener('mousedown', (e) => startResize(e, 'corner'));

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;
      const dx = e.clientX - resizeStartX;
      const dy = e.clientY - resizeStartY;

      if (resizeType === 'right' || resizeType === 'corner') {
        const newW = Math.max(320, Math.min(window.innerWidth * 0.9, resizeStartW + dx));
        widget.style.setProperty('width', newW + 'px', 'important');
        widget.style.setProperty('min-width', newW + 'px', 'important');
        widget.style.setProperty('max-width', newW + 'px', 'important');
      }
      if (resizeType === 'bottom' || resizeType === 'corner') {
        const newH = Math.max(300, Math.min(window.innerHeight * 0.9, resizeStartH + dy));
        widget.style.setProperty('max-height', newH + 'px', 'important');
        widget.style.setProperty('height', newH + 'px', 'important');
      }
      widget.classList.add('resized');
      applyAutoFontSize();
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) justDragged = true;
      isResizing = false;
    });

  }

  const WIDGET_LANG_FLAGS = { de: '\uD83C\uDDE9\uD83C\uDDEA', es: '\uD83C\uDDEA\uD83C\uDDF8', fr: '\uD83C\uDDEB\uD83C\uDDF7', en: '\uD83C\uDDEC\uD83C\uDDE7', nb: 'NB', nn: 'NN' };
  const WIDGET_LANG_LABELS = { de: 'DE', es: 'ES', fr: 'FR', en: 'EN', nb: 'NB', nn: 'NN' };
  const BUNDLED_WIDGET_LANGS = ['nb', 'nn', 'en'];

  async function buildLangPicker() {
    const toggle = widget.querySelector('.lh-lang-toggle');
    if (!toggle) return;

    // Discover available languages
    const langs = [...BUNDLED_WIDGET_LANGS];
    // Same FL-injection as the lookup card so the TTS bubble shows a
    // tab for the student's chosen foreign language. The widget's
    // current lang stays LOCAL (Phase 30-04 Task 6) — we just expose
    // the FL as a tab they can switch to for the current bubble.
    try {
      const stored = await new Promise(r => chrome.storage.local.get('studentForeignLang', r));
      const sfl = stored?.studentForeignLang;
      if ((sfl === 'de' || sfl === 'es' || sfl === 'fr') && !langs.includes(sfl)) {
        langs.push(sfl);
      }
    } catch {}
    if (window.__lexiVocabStore) {
      try {
        const cached = await window.__lexiVocabStore.listCachedLanguages();
        for (const c of cached) {
          if (!langs.includes(c.language)) langs.push(c.language);
        }
      } catch {}
    }

    toggle.innerHTML = langs.map(lang =>
      `<button class="lh-lang-btn ${lang === currentLang ? 'active' : ''}" data-lang="${lang}">${WIDGET_LANG_FLAGS[lang] || ''} ${WIDGET_LANG_LABELS[lang] || lang.toUpperCase()}</button>`
    ).join('');

    toggle.querySelectorAll('.lh-lang-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.dataset.lang;
        if (lang === currentLang) return;
        currentLang = lang;
        readingLang = 'target';
        // Update active state
        toggle.querySelectorAll('.lh-lang-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        // Plan 43-04: widget now has its own per-surface storage key
        // (`lang.widget`). Persisting here lets the choice survive a reload
        // without affecting dictionary / spellcheck / prediction. Phase 30-04's
        // decoupling concern (don't stomp other surfaces) is preserved by the
        // per-surface key — the only change vs 30-04 is that the choice now
        // persists across page loads instead of resetting.
        try { chrome.storage.local.set({ 'lang.widget': lang }); } catch (_) {}
        updateVoiceOptions();
      });
    });
  }

  function attachListeners() {
    document.addEventListener('mouseup', handleTextSelection);
    document.addEventListener('dblclick', handleDoubleClick);
    document.addEventListener('contextmenu', handleContextMenuLookup);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') hideWidget();
    });
  }

  // Phase 43-03: fullscreen-reparent logic, ported upstream from
  // lockdown/public/js/leksihjelp-loader.js:838 (TODO retired).
  //
  // Why this is needed: the browser fullscreen API hides every element that
  // isn't a descendant of the active `document.fullscreenElement`. The widget
  // / lookup card / prediction dropdown are all initially appended to
  // `document.fullscreenElement || document.documentElement`, which is fine
  // when the widget is created INSIDE a fullscreen surface (e.g. an exam
  // session that fullscreens the editor). But if the page enters fullscreen
  // AFTER the widget has been created (most common case — widget appears on
  // page load, student then opens a youtube video and fullscreens it), the
  // widget lives outside the fullscreen subtree and the browser hides it.
  //
  // Fix: on every `fullscreenchange`, walk the three known leksihjelp overlays
  // and re-parent them into the active fullscreen root (or `documentElement`
  // when leaving fullscreen). Idempotent — `appendChild` of an already-
  // attached child is a no-op move, so multiple toggles work cleanly.
  //
  // The overlay IDs mirror the lockdown loader's FS_OVERLAY_IDS list —
  // `lexi-prediction-dropdown` belongs to word-prediction.js and `lexi-rsvp`
  // to rsvp-reader.js, but we re-parent them here too because (a) neither
  // owns a fullscreen-reparent listener of its own and (b) keeping every
  // overlay in one listener avoids independent listeners racing on the same
  // event.
  //
  // ANY overlay appended with the `document.fullscreenElement ||
  // document.documentElement` idiom must be in this list. The reader was not,
  // and entering fullscreen with it open dropped it out of the fullscreen
  // subtree: invisible, while its capture-phase keydown handler went on
  // swallowing Space and the arrow keys.
  const FS_OVERLAY_IDS = ['lexi-tts-widget', 'lexi-lookup-card', 'lexi-prediction-dropdown', 'lexi-rsvp'];
  function attachFullscreenReparent() {
    document.addEventListener('fullscreenchange', () => {
      const target = document.fullscreenElement || document.documentElement;
      for (const id of FS_OVERLAY_IDS) {
        const el = document.getElementById(id);
        if (el && el.parentElement !== target) {
          target.appendChild(el);
        }
      }
    });
  }

  function handleDoubleClick() {
    // Dictionary lookup moved to right-click "Slå opp". A double-click still
    // selects a word natively; we keep the justDblClicked flag so the TTS bubble
    // doesn't flash on that selection — preserving prior bubble behavior.
    justDblClicked = true;
    setTimeout(() => { justDblClicked = false; }, 400);
  }

  // Right-click "Slå opp": resolve the word under the pointer using the pure
  // helper, with no selection required. Returns '' when not over a word.
  function wordAtPoint(x, y) {
    try {
      let node = null, offset = 0;
      if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(x, y);
        if (r) { node = r.startContainer; offset = r.startOffset; }
      } else if (document.caretPositionFromPoint) {
        const p = document.caretPositionFromPoint(x, y);
        if (p) { node = p.offsetNode; offset = p.offset; }
      }
      if (!node || node.nodeType !== 3) return ''; // need a text node
      const expand = self.__lexiExpandToWord;
      if (typeof expand !== 'function') return '';
      return expand(node.data, offset).word || '';
    } catch (_) { return ''; }
  }

  // Track the word under the last right-click so the extension's native
  // context-menu item (which fires later, from the service worker) can look it
  // up even with no selection. Does NOT preventDefault — the native menu (and,
  // in Lockdown, the host's own menu) still opens.
  let lastContextWord = '';
  let lastContextElement = null;
  function handleContextMenuLookup(e) {
    // Recorded ahead of the widgetEnabled guard: the reading trainer's
    // right-click entry point needs the element, and it is a separate feature
    // from Hurtigoppslag with its own reasons to be on. Recording it after the
    // guard would also leave the previous right-click's element behind as a
    // stale value whenever Hurtigoppslag is off.
    lastContextElement = e.target;
    if (!widgetEnabled) { lastContextWord = ''; return; }
    // NOTE: intentionally NOT gated by pause — the right-click "Slå opp" menu
    // must keep working while the site is paused (pause suppresses everything
    // EXCEPT the right-click menu + popup). The capture just records the word
    // under the cursor for the context-menu handler; nothing is shown here.
    lastContextWord = wordAtPoint(e.clientX, e.clientY);
  }

  // The nearest enclosing block element, using the RSVP adapter's own notion of
  // a block so the two definitions cannot drift apart. Returns null when the
  // climb reaches <body> without finding one.
  function nearestRsvpBlock(node, dom) {
    const blocks = dom && dom.BLOCK_TAGS;
    if (!blocks) return null;
    let n = node;
    while (n && n.nodeType === 1) {
      if (blocks.has(n.tagName)) return n;
      if (n === document.body) return null;
      n = n.parentElement;
    }
    return null;
  }

  // Host hooks (Lockdown today; future skriveokt-zero). showInlineLookup keeps
  // its own exam/widgetEnabled gating; __lexiCanLookup lets a host decide
  // whether to offer the action before calling.
  window.__lexiWordAtPoint = wordAtPoint;
  window.__lexiLookupWord = (word) => { if (word) showInlineLookup(word); };
  window.__lexiCanLookup = () => widgetEnabled && isSurfaceAllowed('widget.dictionary');

  // The RSVP reader is a focus mode covering the whole page, and this bubble
  // sits one z-index above it (2147483647 vs 2147483646), so it lands on top
  // of the reader. Step aside while the reader runs, and stop talking with it
  // — a hidden player still reading aloud is worse than a visible one. This is
  // a reversible hide, unlike hideWidget(), which also drops the pupil's
  // resize and position. Returns whether it was visible, so the caller knows
  // whether to put it back.
  window.__lexiWidgetStepAside = () => {
    if (!widget || !widget.classList.contains('visible')) return false;
    stopPlayback();
    widget.classList.remove('visible');
    return true;
  };
  window.__lexiWidgetReturn = () => { if (widget) widget.classList.add('visible'); };

  // ── Text Selection ──
  function handleTextSelection(e) {
    // Text-selection → TTS bubble. Gated on the TTS-widget toggle
    // (ttsWidgetEnabled), independent of Hurtigoppslag.
    if (!ttsWidgetEnabled) return;
    // The RSVP reader is open and covering the page. Every click the pupil
    // makes in it — Pause above all — is a mouseup outside this widget with
    // their selection still live, which would pop the bubble straight back up
    // on top of the reader it just stepped aside from.
    if (window.__lexiRsvpOpen) return;
    // Ignore mouseup that ends a drag operation
    if (justDragged) { justDragged = false; return; }
    // Ignore clicks inside the widget
    if (widget.contains(e.target)) return;

    // Snapshot selection NOW so we can decide whether this looks like a
    // single-word selection (likely the first half of a double-click) or
    // a multi-word phrase. Single-word selections are deferred 350ms so
    // the dblclick handler can set justDblClicked first and suppress the
    // TTS bubble entirely. Multi-word phrase selections aren't part of
    // dblclick semantics and use the original 10ms.
    const earlySel = window.getSelection();
    const earlyText = earlySel ? earlySel.toString().trim() : '';
    const isSingleWord = earlyText.length > 0 && !/\s/.test(earlyText);
    const delay = isSingleWord ? 350 : 10;

    setTimeout(() => {
      if (justDblClicked) return;
      const selection = window.getSelection();
      const text = selection.toString().trim();

      if (text.length > 0 && text.length < 2000) {
        // Single-word selections: don't show TTS bubble. In the extension,
        // right-click → "Slå opp" or Cmd+Shift+D handles per-word lookup.
        if (!/\s/.test(text)) return;
        // How much text is worth interrupting for depends on the language, not
        // on a word count. «die Schule», «j'aime bien» — two words is a real
        // pronunciation question in a foreign language, and answering it is
        // what this extension is for. In Norwegian nobody needs «jeg gikk»
        // read back; there, listening is something you want for a sentence.
        // English sits with Norwegian: for these pupils it is near enough a
        // first language that two words carry no question.
        // Keyed on the pupil's chosen target language rather than a detector —
        // the detector deliberately returns null on selections this short, and
        // a threshold that moves unpredictably is worse than one that is
        // merely approximate. Right-click «Les opp» bypasses this entirely.
        const NEAR_NATIVE_MIN_WORDS = 6;
        const FOREIGN_MIN_WORDS = 2;
        const nearNative = currentLang === 'nb' || currentLang === 'nn' || currentLang === 'en';
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        if (wordCount < (nearNative ? NEAR_NATIVE_MIN_WORDS : FOREIGN_MIN_WORDS)) return;
        const editor = document.getElementById('writing-editor');
        if (editor && selection.anchorNode && editor.contains(selection.anchorNode) && /\s/.test(text)) return;
        // Opt-out hook: hosts can mark a region with `data-leksi-no-tts` to
        // suppress the TTS bubble for selections originating inside it. Used
        // by lockdown to keep the oppgavetekst panel quiet — that surface
        // has its own dedicated TTS button in the panel header. PDF resource
        // selections are unmarked, so they keep the bubble.
        if (selection.anchorNode) {
          const anchorEl = selection.anchorNode.nodeType === 1
            ? selection.anchorNode
            : selection.anchorNode.parentElement;
          if (anchorEl && anchorEl.closest && anchorEl.closest('[data-leksi-no-tts]')) return;
        }
        selectedText = text;
        showWidget();
      } else if (!widget.contains(e.target)) {
        hideWidget();
      }
    }, delay);
  }

  // `force` bypasses the pause gate: right-click "Les opp" and programmatic
  // PLAY_TTS are explicit user actions that must work even while the site is
  // paused (pause suppresses everything EXCEPT the right-click menu + popup).
  // The auto TTS-on-selection path calls showWidget() with no arg and stays
  // suppressed while paused.
  function showWidget(force) {
    // Phase 27: TTS widget is non-exam-safe (widget.tts). Bail out so the
    // widget never appears during exams. The amber border class is only
    // visible if a non-suppressed surface (none today) ever rendered.
    if (!isSurfaceAllowed('widget.tts')) return;
    // Pause-by-domain: the spell-check chip lets students pause leksihjelp on a
    // host (1h/4h/24h or until turned back on). While paused, suppress the
    // auto TTS bubble — but a forced (right-click) invocation still runs.
    if (!force && self.__lexiPause && self.__lexiPause.isPausedNow()) return;

    stopPlayback();
    removeWordHighlight();
    updateVoiceOptions();
    updateModeBadge();
    buildLangPicker();

    // Populate the text area with word spans
    populateTextArea(selectedText);

    // The reader is only worth offering on a real stretch of text. Below the
    // threshold a pupil reads the sentence faster with their eyes than word by
    // word, and the resulting «speed» would be startup and stop with nothing
    // in between. The right-click «Les videre herfra» is unaffected — that is
    // an explicit ask, and it reads on to the end of the container.
    const rsvpBtn = widget.querySelector('.lh-rsvp-btn');
    if (rsvpBtn) {
      const minWords = (self.__lexiRsvpReader && self.__lexiRsvpReader.MIN_WORDS_TO_OFFER) || 30;
      const words = selectedText ? selectedText.trim().split(/\s+/).filter(Boolean).length : 0;
      rsvpBtn.hidden = words < minWords;
    }

    // Reset play button
    const playBtn = widget.querySelector('.lh-play-btn');
    playBtn.disabled = false;
    playBtn.classList.remove('loading');
    playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';

    // Auto-route language toggle based on the selected text's content. Falls
    // back to 'target' (existing behaviour) when the detector is unavailable
    // or returns null (selection too short / no distinctive signal).
    //
    // Why this lives at showWidget rather than at play time: students often
    // glance at the widget before clicking play to confirm which voice will
    // be used, and the lh-lang-btn highlight is the visible cue. Setting it
    // up front also means the language toggle starts in the right state for
    // keyboard-only flows that skip the play button.
    let initialReadingLang = 'target';
    if (typeof self.__lexiDetectLanguage === 'function') {
      try {
        const detected = self.__lexiDetectLanguage(selectedText);
        // Map detector output back to the widget's two-button toggle. The
        // toggle is target-vs-Norwegian only — there's no "switch the
        // student's whole target language" affordance here, so a German-
        // detection while the student is on English homework still routes
        // to 'target' (= en voice). The dedicated lockdown editor TTS picker
        // handles the cross-target case where appropriate.
        if (detected && detected.lang === 'nb') {
          initialReadingLang = 'no';
        }
      } catch (_) { /* defensive: detector never throws, but stay safe */ }
    }
    readingLang = initialReadingLang;
    widget.querySelectorAll('.lh-lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === initialReadingLang);
    });

    // Keep the user's dragged position if they moved the widget;
    // only use the default center-bottom position on first appearance.
    if (!widget.classList.contains('dragged')) {
      widget.style.removeProperty('left');
      widget.style.removeProperty('top');
    }

    // Reset size if not manually resized
    if (!widget.classList.contains('resized')) {
      widget.style.removeProperty('width');
      widget.style.removeProperty('min-width');
      widget.style.removeProperty('max-width');
      widget.style.removeProperty('height');
      widget.style.removeProperty('max-height');
    }

    updateFontModeButton();

    // Show widget (CSS positions it at bottom center unless dragged)
    widget.classList.add('visible');
  }

  function hideWidget() {
    closeWidgetPauseMenu();
    widget.classList.remove('visible');
    widget.classList.remove('resized');
    widget.style.removeProperty('width');
    widget.style.removeProperty('min-width');
    widget.style.removeProperty('max-width');
    widget.style.removeProperty('height');
    widget.style.removeProperty('max-height');
    stopPlayback();
    removeWordHighlight();
  }

  // Site-pause menu on the TTS bubble's ⏸ button. Consistent with the green
  // spell-check chip: pausing here pauses EVERYTHING on the site (except the
  // right-click menu + popup), not just the TTS bubble. The "just hide the
  // read-aloud button" case keeps its own entry (disableWidgetQuick).
  let widgetPauseMenu = null;
  function closeWidgetPauseMenu() {
    if (widgetPauseMenu) { widgetPauseMenu.remove(); widgetPauseMenu = null; }
    document.removeEventListener('mousedown', onWidgetPauseOutside, true);
  }
  function onWidgetPauseOutside(e) {
    if (widgetPauseMenu && !widgetPauseMenu.contains(e.target) && !e.target.closest('.lh-pause-widget')) {
      closeWidgetPauseMenu();
    }
  }
  function toggleWidgetPauseMenu() {
    if (widgetPauseMenu) { closeWidgetPauseMenu(); return; }
    const pauseApi = self.__lexiPause;
    const menu = document.createElement('div');
    menu.className = 'lh-widget-pause-menu';
    menu.innerHTML =
      `<div class="lh-widget-pause-title">${t('widget_pause_heading')}</div>`
      + `<div class="lh-widget-pause-row">`
      +   `<button type="button" class="lh-widget-pause-btn" data-h="1">1 t</button>`
      +   `<button type="button" class="lh-widget-pause-btn" data-h="4">4 t</button>`
      +   `<button type="button" class="lh-widget-pause-btn" data-h="24">24 t</button>`
      + `</div>`
      + `<button type="button" class="lh-widget-pause-btn lh-widget-pause-forever" data-h="">${t('widget_pause_forever')}</button>`
      + `<div class="lh-widget-pause-note">${t('widget_pause_note')}</div>`
      + `<button type="button" class="lh-widget-pause-tts-only">${t('widget_pause_tts_only')}</button>`;
    menu.querySelectorAll('[data-h]').forEach((b) => {
      b.addEventListener('click', async (e) => {
        e.stopPropagation();
        const h = b.dataset.h;
        if (pauseApi && pauseApi.pause) await pauseApi.pause(h === '' ? null : Number(h));
        closeWidgetPauseMenu();
        hideWidget(); // paused now — the bubble goes away with everything else
      });
    });
    const ttsOnly = menu.querySelector('.lh-widget-pause-tts-only');
    if (ttsOnly) ttsOnly.addEventListener('click', (e) => {
      e.stopPropagation();
      closeWidgetPauseMenu();
      disableWidgetQuick();
    });
    widget.appendChild(menu);
    widgetPauseMenu = menu;
    setTimeout(() => document.addEventListener('mousedown', onWidgetPauseOutside, true), 0);
  }

  function disableWidgetQuick() {
    // Pause button on the TTS bubble — disables ONLY the TTS bubble
    // (Uttaleknapp), not Hurtigoppslag. Persists ttsWidgetEnabled so the
    // choice survives reloads, broadcasts so other tabs sync immediately.
    ttsWidgetEnabled = false;
    chrome.storage.local.set({ ttsWidgetEnabled: false });
    try { chrome.runtime.sendMessage({ type: 'TTS_WIDGET_ENABLED_CHANGED', enabled: false }); } catch (_) {}
    hideWidget();
    showToast(t('toast_tts_widget_disabled'));
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

  // ── Text Area Population ──
  function calculateAutoFontSize(textLength, widgetWidth) {
    // Factor in both text length and available width
    // Wider widget = can use larger font, narrower = smaller font
    const w = widgetWidth || 420;
    const widthFactor = Math.min(1, w / 500); // 0.56 at 280px, 1.0 at 500px+

    let baseSize;
    if (textLength <= 20) baseSize = 32;
    else if (textLength <= 50) baseSize = 28;
    else if (textLength <= 100) baseSize = 24;
    else if (textLength <= 200) baseSize = 22;
    else if (textLength <= 500) baseSize = 19;
    else if (textLength <= 1000) baseSize = 17;
    else baseSize = 15;

    // Scale by widget width, but never below 13px
    return Math.max(13, Math.round(baseSize * widthFactor));
  }

  function applyAutoFontSize() {
    if (fontSizeMode !== 'auto' || !selectedText) return;
    const textArea = widget.querySelector('.lh-text-area');
    if (!textArea) return;
    const autoSize = calculateAutoFontSize(selectedText.length, widget.offsetWidth);
    textArea.style.fontSize = autoSize + 'px';
  }

  function populateTextArea(text) {
    const textArea = widget.querySelector('.lh-text-area');
    textArea.innerHTML = '';
    widgetWordSpans = [];
    wordCharPositions = [];

    // Apply font size based on mode
    if (fontSizeMode === 'auto') {
      const autoSize = calculateAutoFontSize(text.length, widget.offsetWidth);
      textArea.style.fontSize = autoSize + 'px';
    } else {
      textArea.style.fontSize = widgetFontSize + 'px';
    }

    // Split by whitespace, preserving whitespace segments
    const segments = text.split(/(\s+)/);
    let wordIndex = 0;
    let charIndex = 0;

    for (const segment of segments) {
      if (/^\s+$/.test(segment)) {
        // Whitespace: preserve as a text node (rendered via white-space: pre-wrap)
        textArea.appendChild(document.createTextNode(segment));
        charIndex += segment.length;
      } else if (segment.length > 0) {
        // Word: wrap in a span
        const span = document.createElement('span');
        span.className = 'lh-word';
        span.dataset.wordIndex = wordIndex;
        span.textContent = segment;
        textArea.appendChild(span);
        widgetWordSpans.push(span);
        wordCharPositions.push({
          word: segment,
          charStart: charIndex,
          charEnd: charIndex + segment.length
        });
        wordIndex++;
        charIndex += segment.length;
      }
    }

    // Scroll widget to top
    widget.scrollTop = 0;
  }

  function adjustFontSize(delta) {
    widgetFontSize = Math.max(FONT_SIZE_MIN, Math.min(FONT_SIZE_MAX, widgetFontSize + delta));
    const textArea = widget.querySelector('.lh-text-area');
    if (textArea) {
      textArea.style.fontSize = widgetFontSize + 'px';
    }
    // Persist preference
    chrome.storage.local.set({ widgetFontSize, fontSizeMode });
  }

  function toggleFontMode() {
    fontSizeMode = fontSizeMode === 'auto' ? 'fixed' : 'auto';
    chrome.storage.local.set({ fontSizeMode });
    updateFontModeButton();
    // Re-render text with new mode
    if (selectedText) populateTextArea(selectedText);
  }

  function updateFontModeButton() {
    const btn = widget?.querySelector('.lh-font-mode');
    if (btn) {
      btn.textContent = fontSizeMode === 'auto' ? t('widget_font_auto') : t('widget_font_fixed');
      btn.title = fontSizeMode === 'auto'
        ? t('widget_font_auto_tooltip')
        : t('widget_font_fixed_tooltip');
    }
    const controls = widget?.querySelector('.lh-font-controls');
    if (controls) {
      controls.classList.toggle('mode-auto', fontSizeMode === 'auto');
      controls.classList.toggle('mode-fixed', fontSizeMode !== 'auto');
    }
  }

  // ── Word-by-Word Highlighting (in-widget) ──
  function highlightWordInWidget(index) {
    clearWidgetWordHighlight();

    if (index < 0 || index >= widgetWordSpans.length) return;

    const span = widgetWordSpans[index];
    span.classList.add('lh-word-active');

    // Auto-scroll to keep the highlighted word visible
    autoScrollToWord(span);
  }

  function clearWidgetWordHighlight() {
    for (const span of widgetWordSpans) {
      span.classList.remove('lh-word-active');
    }
  }

  function autoScrollToWord(span) {
    if (!widget) return;
    const textArea = widget.querySelector('.lh-text-area');
    if (!textArea) return;

    const spanRect = span.getBoundingClientRect();
    const areaRect = textArea.getBoundingClientRect();

    // If the word is below the visible area, scroll down
    if (spanRect.bottom > areaRect.bottom) {
      textArea.scrollTop += (spanRect.bottom - areaRect.bottom) + 8;
    }
    // If the word is above the visible area, scroll up
    else if (spanRect.top < areaRect.top) {
      textArea.scrollTop -= (areaRect.top - spanRect.top) + 8;
    }
  }

  // Remove highlight and stop the timing interval (used when stopping playback)
  function removeWordHighlight() {
    clearWidgetWordHighlight();
    if (wordTimingInterval) {
      cancelAnimationFrame(wordTimingInterval);
      wordTimingInterval = null;
    }
  }

  // Start word-by-word highlighting for ElevenLabs (synced with audio.currentTime)
  function startWordHighlightTimer(audio) {
    if (wordCharPositions.length === 0) return;

    const totalDuration = audio.duration;
    const totalChars = wordCharPositions.reduce((sum, w) => sum + w.word.length, 0);
    if (totalChars === 0 || !totalDuration) return;

    // Pre-calculate the time range for each word based on character proportion
    let charsSoFar = 0;
    const wordTimeRanges = wordCharPositions.map(w => {
      const startTime = (charsSoFar / totalChars) * totalDuration;
      charsSoFar += w.word.length;
      const endTime = (charsSoFar / totalChars) * totalDuration;
      return { startTime, endTime };
    });

    let lastHighlightedIndex = -1;

    // Poll audio.currentTime to stay in sync
    function updateHighlight() {
      if (!currentAudio) {
        removeWordHighlight();
        return;
      }

      const currentTime = audio.currentTime;

      // Find which word should be highlighted based on current time
      let wordIndex = wordTimeRanges.findIndex(
        range => currentTime >= range.startTime && currentTime < range.endTime
      );

      // If past all words, highlight last word
      if (wordIndex === -1 && currentTime >= wordTimeRanges[wordTimeRanges.length - 1]?.startTime) {
        wordIndex = wordCharPositions.length - 1;
      }

      // Only update if word changed
      if (wordIndex !== -1 && wordIndex !== lastHighlightedIndex) {
        highlightWordInWidget(wordIndex);
        lastHighlightedIndex = wordIndex;
      }

      // Continue polling while audio is playing
      if (!audio.paused && !audio.ended) {
        wordTimingInterval = requestAnimationFrame(updateHighlight);
      }
    }

    // Start polling
    wordTimingInterval = requestAnimationFrame(updateHighlight);
  }

  // Start precise word highlighting using real timing data from the backend.
  //
  // The engine (tts-timing-engine.js) decides WHICH span each timing
  // belongs to; this function only drives the clock. When the backend
  // supplies startOffset/endOffset — Papertek TTS does, ElevenLabs does
  // not — the mapping is exact against the original text, which is the
  // only thing that survives normalisation ("14.08." spoken as two
  // words). Without offsets the engine reproduces the positional
  // behaviour that shipped before, so an older backend is unaffected.
  function startPreciseWordHighlight(audio, wordTimings) {
    if (!wordTimings || wordTimings.length === 0 || widgetWordSpans.length === 0) return;

    const timing = self.__lexiTtsTiming;
    // Defensive: if the engine script somehow did not load, fall back to
    // the positional mapping inline rather than losing highlighting.
    const spanForTiming = timing
      ? timing.mapTimingsToSpans(wordTimings, wordCharPositions)
      : wordTimings.map((_, i) => Math.min(i, widgetWordSpans.length - 1));

    let lastHighlightedIndex = -1;

    function updateHighlight() {
      if (!currentAudio) {
        removeWordHighlight();
        return;
      }

      const currentTime = audio.currentTime;

      const timingIndex = timing
        ? timing.findActiveTimingIndex(wordTimings, currentTime)
        : wordTimings.findIndex(w => currentTime >= w.start && currentTime < w.end);

      // -1 means either "before the first word" or "this spoken token has
      // no counterpart in the written text". Both should leave the
      // current highlight alone rather than clearing it mid-sentence.
      let wordIndex = timingIndex === -1 ? -1 : spanForTiming[timingIndex];

      // Clamp to widget word span count (in case of mismatch)
      if (wordIndex >= widgetWordSpans.length) {
        wordIndex = widgetWordSpans.length - 1;
      }

      if (wordIndex !== -1 && wordIndex !== lastHighlightedIndex) {
        highlightWordInWidget(wordIndex);
        lastHighlightedIndex = wordIndex;
      }

      if (!audio.paused && !audio.ended) {
        wordTimingInterval = requestAnimationFrame(updateHighlight);
      }
    }

    wordTimingInterval = requestAnimationFrame(updateHighlight);
  }

  function updateVoiceOptions() {
    const select = widget.querySelector('#lh-voice');
    select.innerHTML = '';

    // Determine which language to use for voices
    // Map nb/nn → no for ElevenLabs voice lookup
    const rawLang = readingLang === 'no' ? 'no' : currentLang;
    const voiceLang = VOICE_LANG_MAP[rawLang] || rawLang;

    if (canUsePremiumVoice()) {
      const voices = ELEVENLABS_VOICES[voiceLang] || ELEVENLABS_VOICES.no;
      voices.forEach((v, i) => {
        const opt = document.createElement('option');
        opt.value = v.id;
        opt.textContent = v.name;
        if (i === 0) opt.selected = true;
        select.appendChild(opt);
      });
    } else {
      // Browser voices for the language
      const synth = window.speechSynthesis;
      const allVoices = synth.getVoices();
      const langCode = BROWSER_VOICE_LANGS[voiceLang] || BROWSER_VOICE_LANGS[rawLang] || 'nb';
      const matching = allVoices.filter(v => v.lang.startsWith(langCode));

      if (matching.length === 0) {
        const opt = document.createElement('option');
        opt.value = '__default';
        opt.textContent = t('widget_default_voice');
        select.appendChild(opt);
      } else {
        matching.forEach((v, i) => {
          const opt = document.createElement('option');
          opt.value = v.voiceURI;
          opt.textContent = v.name.replace(/Google |Microsoft |Apple /, '');
          if (i === 0) opt.selected = true;
          select.appendChild(opt);
        });
      }
    }
  }

  function updateModeBadge() {
    const badge = widget.querySelector('.lh-mode-badge');
    if (isAuthenticated) {
      badge.textContent = t('widget_badge_elevenlabs');
      badge.style.background = 'rgba(34, 197, 94, 0.1)';
      badge.style.color = '#16a34a';
    } else if (canUsePremiumVoice()) {
      badge.textContent = t('widget_badge_free_taste');
      badge.style.background = 'rgba(34, 197, 94, 0.1)';
      badge.style.color = '#16a34a';
    } else if (freeVoiceTaste && freeTasteSpent) {
      badge.textContent = t('widget_badge_free_taste_used');
      badge.style.background = 'rgba(245, 158, 11, 0.1)';
      badge.style.color = '#d97706';
    } else {
      badge.textContent = t('widget_badge_browser');
      badge.style.background = 'rgba(17, 180, 154, 0.1)';
      badge.style.color = '#11B49A';
    }
  }

  // ── Playback ──
  async function handlePlay() {
    const playBtn = widget.querySelector('.lh-play-btn');
    const speed = parseFloat(widget.querySelector('#lh-speed').value);
    const voiceId = widget.querySelector('#lh-voice').value;

    // If already playing, stop
    if (currentAudio || currentUtterance || premiumPlaybackActive) {
      stopPlayback();
      removeWordHighlight();
      playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
      return;
    }

    // Pass the language code so the backend can enforce the correct language.
    // This prevents ElevenLabs from misidentifying Norwegian as Danish.
    // Map nb/nn → 'no' because eleven_flash_v2_5 doesn't recognize the
    // bokmål/nynorsk codes — only the generic 'no'.
    const rawLang = readingLang === 'no' ? 'no' : currentLang;
    const langCode = VOICE_LANG_MAP[rawLang] || rawLang || null;

    if (canUsePremiumVoice()) {
      await playElevenLabs(selectedText, voiceId, speed, langCode, playBtn);
    } else {
      playBrowserTTS(selectedText, voiceId, speed, playBtn);
    }
  }

  // ── Premium TTS (Papertek pilot, with ElevenLabs fallback in the backend) ──
  async function playElevenLabs(text, voiceId, speed, language, playBtn) {
    playBtn.disabled = true;
    playBtn.classList.add('loading');
    playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';

    const runId = ++premiumPlaybackRun;
    premiumPlaybackActive = true;
    const segmentation = self.__lexiTtsSegmentation;
    const segments = segmentation
      ? segmentation.segmentText(text)
      : [{ text, startOffset: 0, endOffset: text.length }];
    let activeSegmentIndex = 0;

    try {
      // Build headers — prefer Bearer token, fall back to legacy access code
      const stored = await chromeStorageGet(['sessionToken', 'accessCode']);
      const headers = {
        'Content-Type': 'application/json',
        'X-Lexi-Client': 'lexi-extension'
      };

      if (stored.sessionToken) {
        headers['Authorization'] = `Bearer ${stored.sessionToken}`;
      }

      const requestSegment = async (segment) => {
        const body = { text: segment.text, voiceId, speed, language };
        if (!stored.sessionToken && stored.accessCode) body.code = stored.accessCode;

        // One deadline PER portion. Long passages no longer consume the whole
        // 55 s client budget in one request; the next portion is fetched while
        // the current audio is playing.
        const result = await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => reject(new Error('TTS request timed out')), 55_000);
          chrome.runtime.sendMessage(
            { type: 'FETCH_TTS', url: `${BACKEND_URL}/api/tts`, headers, body },
            (response) => {
              clearTimeout(timeout);
              if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
              else resolve(response);
            }
          );
        });
        if (!result || !result.error) return result;

        const errBody = result.errorBody || '';
        console.error('TTS response:', result.status, errBody);
        try {
          const errJson = JSON.parse(errBody);
          if (errJson.quotaExceeded) {
            updateModeBadgeQuota();
            throw new Error('quota_exceeded');
          }
          // The free sample is spent. Not an error to the pupil: the catch
          // below plays the same sentence with the browser voice, and the
          // badge says what happened and what premium would give. The flag
          // also rebuilds the voice list, so the dropdown stops offering
          // voices we can no longer speak with.
          if (errJson.freeTasteExhausted) {
            freeTasteSpent = true;
            updateModeBadge();
            updateVoiceOptions();
            throw new Error('free_taste_exhausted');
          }
          if (errJson.subscriptionRequired) throw new Error('subscription_required');
          if (errJson.tokenExpired) {
            chrome.storage.local.set({ sessionToken: null, isAuthenticated: false });
            throw new Error('token_expired');
          }
        } catch (parseErr) {
          if (['quota_exceeded', 'free_taste_exhausted', 'subscription_required', 'token_expired'].includes(parseErr.message)) throw parseErr;
        }
        throw new Error(`TTS ${result.status}: ${errBody}`);
      };

      const settle = (promise) => promise.then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error }),
      );

      const playSegment = (ttsResult, segment) => new Promise((resolve, reject) => {
        const audioBytes = Uint8Array.from(atob(ttsResult.audioBase64), c => c.charCodeAt(0));
        const blob = new Blob([audioBytes], { type: 'audio/mpeg' });
        const blobUrl = URL.createObjectURL(blob);
        const audio = new Audio(blobUrl);
        currentAudio = audio;
        audio.playbackRate = 1;

        // The backend reconciles Piper's phoneme groups against the written
        // words and tells us whether it succeeded. 'unavailable' means it
        // could not, and the honest response is no highlight at all: a
        // marker that wanders through the sentence is worse than none,
        // because a pupil following along is told the wrong word is being
        // read. Audio always plays either way — losing the highlight must
        // never cost the speech.
        //
        // Note this rebases exactly ONCE, here. offsetTimings adds
        // segment.startOffset to each timing, so calling it twice on the
        // same array would silently double every offset and push the
        // highlight further off with each segment.
        const usable = ttsResult.timingQuality !== 'unavailable';
        const timings = !usable
          ? []
          : segmentation
            ? segmentation.offsetTimings(ttsResult.wordTimings, segment)
            : ttsResult.wordTimings;
        if (timings.length > 0) {
          audio.addEventListener('loadedmetadata', () => startPreciseWordHighlight(audio, timings));
        }

        let done = false;
        const finish = (completed, error) => {
          if (done) return;
          done = true;
          URL.revokeObjectURL(blobUrl);
          if (currentAudio === audio) currentAudio = null;
          if (settleCurrentAudio === cancel) settleCurrentAudio = null;
          if (error) reject(error);
          else resolve(completed);
        };
        const cancel = () => {
          try { audio.pause(); } catch (_) {}
          finish(false);
        };
        settleCurrentAudio = cancel;
        audio.addEventListener('ended', () => finish(true), { once: true });
        audio.addEventListener('error', () => finish(false, new Error('TTS audio playback failed')), { once: true });
        audio.play().catch((error) => finish(false, error));
      });

      let pending = settle(requestSegment(segments[0]));
      let sequenceEngine = null;
      for (let index = 0; index < segments.length; index++) {
        activeSegmentIndex = index;
        const outcome = await pending;
        if (runId !== premiumPlaybackRun) return;
        if (!outcome.ok) throw outcome.error;
        if (!sequenceEngine) sequenceEngine = outcome.value.engine || null;
        else if (outcome.value.engine && outcome.value.engine !== sequenceEngine) {
          console.warn('Premium TTS engine changed within one passage', {
            from: sequenceEngine,
            to: outcome.value.engine,
            segment: index + 1,
          });
        }

        // Start only one request ahead. This hides synthesis behind playback
        // without spending quota on the entire passage if the pupil presses stop.
        pending = index + 1 < segments.length
          ? settle(requestSegment(segments[index + 1]))
          : null;

        playBtn.disabled = false;
        playBtn.classList.remove('loading');
        playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
        const completed = await playSegment(outcome.value, segments[index]);
        if (!completed || runId !== premiumPlaybackRun) return;
      }

      removeWordHighlight();
      playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    } catch (err) {
      if (runId !== premiumPlaybackRun) return;
      console.warn('Premium TTS failed, falling back to browser TTS:', err);
      playBtn.disabled = false;
      playBtn.classList.remove('loading');
      const voiceLang = language === 'no' ? 'no' : currentLang;
      const fallbackLangCode = BROWSER_VOICE_LANGS[voiceLang] || 'nb';
      const synth = window.speechSynthesis;
      const allVoices = synth.getVoices();
      const match = allVoices.find(v => v.lang.startsWith(fallbackLangCode));
      const remaining = segments[activeSegmentIndex] || segments[0];
      playBrowserTTS(
        text.slice(remaining.startOffset),
        match ? match.voiceURI : null,
        speed,
        playBtn,
        remaining.startOffset,
      );
    } finally {
      if (runId === premiumPlaybackRun) premiumPlaybackActive = false;
    }
  }

  function updateModeBadgeQuota() {
    const badge = widget.querySelector('.lh-mode-badge');
    if (badge) {
      badge.textContent = t('widget_badge_quota');
      badge.style.background = 'rgba(245, 158, 11, 0.1)';
      badge.style.color = '#d97706';
    }
  }

  // ── Browser TTS ──
  function playBrowserTTS(text, voiceURI, speed, playBtn, charOffset = 0) {
    const synth = window.speechSynthesis;
    synth.cancel();

    const voiceLang = readingLang === 'no' ? 'no' : currentLang;
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = speed;
    utterance.lang = BROWSER_VOICE_LANGS[voiceLang] || 'es';

    if (voiceURI && voiceURI !== '__default') {
      const voices = synth.getVoices();
      const match = voices.find(v => v.voiceURI === voiceURI);
      if (match) utterance.voice = match;
    }

    // Word-by-word highlighting using boundary event
    let browserTtsWordIndex = 0;
    browserTtsCharIndex = charOffset;
    utterance.onboundary = (event) => {
      if (event.name === 'word') {
        // Track absolute character position for live speed restart
        browserTtsCharIndex = charOffset + event.charIndex;
        // Find word index by absolute character position
        const absCharIndex = charOffset + event.charIndex;
        const wordIndex = wordCharPositions.findIndex(
          w => absCharIndex >= w.charStart && absCharIndex < w.charEnd
        );
        if (wordIndex !== -1) {
          highlightWordInWidget(wordIndex);
          browserTtsWordIndex = wordIndex;
        } else {
          // Fallback: just advance to next word
          browserTtsWordIndex++;
          highlightWordInWidget(browserTtsWordIndex);
        }
      }
    };

    utterance.onstart = () => {
      currentUtterance = utterance;
      if (charOffset === 0) {
        browserTtsWordIndex = 0;
        highlightWordInWidget(0);
      }
      playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    };

    utterance.onend = () => {
      currentUtterance = null;
      removeWordHighlight();
      playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    };

    utterance.onerror = () => {
      currentUtterance = null;
      removeWordHighlight();
      playBtn.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    };

    synth.speak(utterance);
  }

  function stopPlayback() {
    premiumPlaybackRun++;
    premiumPlaybackActive = false;
    if (settleCurrentAudio) {
      settleCurrentAudio();
      settleCurrentAudio = null;
    }
    if (currentAudio) {
      currentAudio.pause();
      currentAudio = null;
    }
    if (currentUtterance) {
      window.speechSynthesis.cancel();
      currentUtterance = null;
    }
    browserTtsCharIndex = 0;
    removeWordHighlight();
  }

  // Bank name to part of speech i18n key mapping
  const BANK_TO_POS_KEY = {
    verbbank: 'pos_verb',
    nounbank: 'pos_noun',
    adjectivebank: 'pos_adjective',
    articlesbank: 'pos_article',
    generalbank: 'pos_general',
    numbersbank: 'pos_number',
    phrasesbank: 'pos_phrase',
    pronounsbank: 'pos_pronoun',
    languagesbank: 'pos_language',       // Phase 05.1 Gap B
    nationalitiesbank: 'pos_nationality' // Phase 05.1 Gap B
  };

  function bankToPos(bank) {
    const key = BANK_TO_POS_KEY[bank];
    return key ? t(key) : bank.replace('bank', '');
  }

  // Build an inflection index from a raw bank-structured dict (lang.json).
  // Returns Map<lowercase form, { entry, bank }> covering verb conjugations,
  // noun plurals/cases, and acceptedForms. Mirrors dict-state-builder.js's
  // buildInflectionIndex but works on the raw dict without a prior flattenBanks.
  function buildWidgetInflectionIndex(dict) {
    const index = new Map();
    function add(key, entry, bank) {
      const k = (key || '').toLowerCase();
      if (!k || k === (entry.word || '').toLowerCase()) return;
      if (!index.has(k)) index.set(k, []);
      index.get(k).push({ entry, bank });
    }
    const banks = Object.keys(BANK_TO_POS_KEY);
    for (const bank of banks) {
      const bankData = dict[bank];
      if (!bankData || typeof bankData !== 'object') continue;
      for (const entry of Object.values(bankData)) {
        if (!entry || !entry.word) continue;
        // Verb conjugations
        if (entry.conjugations) {
          for (const tenseData of Object.values(entry.conjugations)) {
            if (!tenseData || !tenseData.former) continue;
            const former = tenseData.former;
            if (Array.isArray(former)) {
              for (const f of former) { if (f) add(f, entry, bank); }
            } else if (typeof former === 'object') {
              for (const [pronoun, f] of Object.entries(former)) {
                if (pronoun.startsWith('_')) continue;
                if (Array.isArray(f)) { for (const v of f) { if (typeof v === 'string') add(v, entry, bank); } }
                else if (typeof f === 'string') add(f, entry, bank);
              }
            }
          }
        }
        // Noun plurals (DE: plural field; NB/NN: forms; DE case grid)
        if (bank === 'nounbank') {
          if (entry.plural) {
            const pl = Array.isArray(entry.plural) ? entry.plural : [entry.plural];
            for (let p of pl) {
              if (typeof p === 'string') { if (p.startsWith('die ')) p = p.slice(4); add(p, entry, bank); }
            }
          }
          if (entry.forms) {
            const { bestemt, ubestemt, paradigms } = entry.forms;
            // Same cell may hold several equally valid forms — see the twin
            // fix in popup/dict-state-builder.js. A string-only test dropped
            // «fingre», «born», «bestemødrer» out of the lookup index.
            const eachForm = (v, fn) => {
              for (const x of (Array.isArray(v) ? v : [v])) if (typeof x === 'string' && x) fn(x);
            };
            if (bestemt) eachForm(bestemt.entall, (f) => add(f, entry, bank));
            if (ubestemt) eachForm(ubestemt.flertall, (f) => add(f, entry, bank));
            for (const paradigm of (Array.isArray(paradigms) ? paradigms : [])) {
              if (paradigm.bestemt) eachForm(paradigm.bestemt.flertall, (f) => add(f, entry, bank));
            }
          }
          if (entry.cases) {
            for (const caseData of Object.values(entry.cases)) {
              if (!caseData || !caseData.forms) continue;
              for (const numForms of Object.values(caseData.forms)) {
                if (!numForms) continue;
                for (const f of Object.values(numForms)) {
                  if (!f) continue;
                  add(f, entry, bank);
                  const parts = f.split(' ');
                  if (parts.length > 1) add(parts[parts.length - 1], entry, bank);
                }
              }
            }
          }
        }
        // Likestilte skrivemåter (§15-4): alternate spellings (vei↔veg) + forms.
        if (Array.isArray(entry.skrivemaater)) {
          for (const sv of entry.skrivemaater) {
            if (sv && sv.spelling) add(sv.spelling, entry, bank);
            if (Array.isArray(sv && sv.forms)) { for (const f of sv.forms) { if (f) add(f, entry, bank); } }
          }
        }
        // AcceptedForms + typos (covers DE accepted alternates)
        if (entry.acceptedForms) {
          for (const f of entry.acceptedForms) { if (f) add(f, entry, bank); }
        }
        if (entry.typos) {
          for (const f of entry.typos) { if (f) add(f, entry, bank); }
        }
      }
    }
    return index;
  }

  // Genus to gender i18n key mapping
  const GENUS_TO_GENDER_KEY = {
    m: 'gender_m',
    f: 'gender_f',
    n: 'gender_n',
    pl: 'gender_pl'
  };

  function genusToGender(genus) {
    const key = GENUS_TO_GENDER_KEY[genus];
    return key ? t(key) : genus;
  }

  const LANG_FLAGS = { de: '🇩🇪', es: '🇪🇸', fr: '🇫🇷', en: '🇬🇧', nb: 'NB', nn: 'NN', no: 'NB' };

  // ── Inline dictionary lookup (context menu) ──
  async function showInlineLookup(word) {
    // Phase 27: inline dictionary is non-exam-safe (widget.dictionary). Bail
    // before any DOM/network work so the lookup never appears during exams.
    if (!isSurfaceAllowed('widget.dictionary')) return;
    // Load dictionary. Bundled langs (nb/nn/en) read from the shipped JSON
    // first — bundled data is source of truth and refreshed by sync-vocab.
    // Cache-first would serve stale data after a sync.
    async function getDictForLang(lang) {
      const isBundled = lang === 'nb' || lang === 'nn' || lang === 'en';
      let d = null;
      // Phase 40.2: vocab data is bundled for all six supported languages.
      // Fetch directly from the extension zip via chrome.runtime.getURL.
      try {
        const url = chrome.runtime.getURL(`data/${lang}.json`);
        const res = await fetch(url);
        if (res.ok) d = await res.json();
      } catch (e) { console.warn('Leksihjelp: inline lookup dictionary load failed', lang, e); }
      // Defensive fallback to the back-compat stub (returns null in 40.2 —
      // future-proofing if a downstream shim wires getCachedLanguage to a
      // non-bundled source).
      if (!d && window.__lexiVocabStore) {
        try { d = await window.__lexiVocabStore.getCachedLanguage(lang); } catch (_) { /* */ }
      }
      return d;
    }

    let dict = await getDictForLang(currentLang);
    if (!dict) return;

    // Load NB dictionary for falseFriends/senses enrichment
    let nbDict = null;
    if (currentLang !== 'nb' && currentLang !== 'nn') {
      nbDict = await getDictForLang('nb');
    }

    const q = word.toLowerCase().trim();

    function searchDictBanks(dictData, query) {
      if (!dictData) return null;
      const banks = Object.keys(BANK_TO_POS_KEY);
      for (const bank of banks) {
        const bankData = dictData[bank];
        if (!bankData || typeof bankData !== 'object') continue;
        for (const [entryId, entry] of Object.entries(bankData)) {
          if (!entry.word) continue;
          if (entry.word.toLowerCase() === query ||
              (getTranslation(entry) || '').toLowerCase() === query) {
            return {
              ...entry,
              _wordId: entryId,
              translation: getTranslation(entry),
              partOfSpeech: bankToPos(bank),
              gender: entry.genus ? genusToGender(entry.genus) : null,
              grammar: entry.explanation?._description || null,
              examples: entry.examples || []
            };
          }
        }
      }
      return null;
    }

    // Build (or retrieve cached) inflection index for this language so lookups
    // like "schrieb" → schreiben, "Kindern" → Kind, "gegangener" → gehen work.
    if (!_widgetInflectionCache.has(currentLang)) {
      _widgetInflectionCache.set(currentLang, buildWidgetInflectionIndex(dict));
    }
    const inflectionIndex = _widgetInflectionCache.get(currentLang);

    let match = searchDictBanks(dict, q);
    let conjugatedFrom = null;

    // Inflection/declension fallback: covers all conjugated verb forms, noun
    // plurals, case forms, and acceptedForms — a superset of the old
    // getVerbInfinitive() path which only handled verb infinitives for NB.
    if (!match) {
      const hits = inflectionIndex.get(q);
      if (hits && hits.length > 0) {
        const hit = hits[0];
        match = {
          ...hit.entry,
          _wordId: hit.entry._wordId || hit.entry.word,
          translation: getTranslation(hit.entry),
          partOfSpeech: bankToPos(hit.bank),
          gender: hit.entry.genus ? genusToGender(hit.entry.genus) : null,
          grammar: hit.entry.explanation?._description || null,
          examples: hit.entry.examples || []
        };
        conjugatedFrom = word;
      }
    }
    // Legacy NB verb-infinitive path (covers NB words via seam even when the
    // widget language is foreign, e.g. "liker" on an NB page with DE selected).
    if (!match) {
      const vocab = self.__lexiVocab;
      if (vocab) {
        const inf = vocab.getVerbInfinitive?.()?.get?.(q);
        if (inf && inf !== q) {
          const baseMatch = searchDictBanks(dict, inf);
          if (baseMatch) {
            match = baseMatch;
            conjugatedFrom = word;
          }
        }
      }
    }

    // NB-side fallback: when reading a Norwegian page with a foreign target
    // language (de/es/fr/en) selected, the user double-clicks an NB word
    // ("opplevde"). It won't be in the foreign dict directly, but it IS in the
    // NB dict — and the NB entry's linkedTo[currentLang].primary points us to
    // the right foreign entry. Without this fallback the popover just says
    // "not found" on NB pages.
    if (!match && nbDict) {
      let nbHit = searchDictBanks(nbDict, q);
      let nbConjugatedFrom = null;
      if (!nbHit) {
        // Fallback for conjugated NB words
        const inf = self.__lexiVocab?.getVerbInfinitive?.()?.get?.(q);
        if (inf && inf !== q) {
          nbHit = searchDictBanks(nbDict, inf);
          if (nbHit) nbConjugatedFrom = word;
        } else if (q.length > 3) {
          // Heuristic infinitive for NB
          const infs = [q.replace(/er$/, 'e'), q.replace(/te$/, 'e'), q.replace(/de$/, 'e')];
          for (const inf of infs) {
            if (inf === q) continue;
            for (const bank of Object.keys(BANK_TO_POS_KEY)) {
              const bankData = nbDict[bank];
              if (!bankData || typeof bankData !== 'object') continue;
              for (const [, nbEntry] of Object.entries(bankData)) {
                const w = (nbEntry.word || '').toLowerCase().replace(/^å\s+/, '');
                if (w === inf) { nbHit = nbEntry; nbConjugatedFrom = word; break; }
              }
              if (nbHit) break;
            }
          }
        }
      }
      // Resolve NB hit → foreign entry via linkedTo.
      const targetId = nbHit?.linkedTo?.[currentLang]?.primary;
      if (targetId) {
        for (const bank of Object.keys(BANK_TO_POS_KEY)) {
          const targetEntry = dict[bank]?.[targetId];
          if (targetEntry) {
            match = {
              ...targetEntry,
              _wordId: targetId,
              translation: nbHit.word,
              partOfSpeech: bankToPos(bank),
              gender: targetEntry.genus ? genusToGender(targetEntry.genus) : null,
              grammar: targetEntry.explanation?._description || null,
              examples: targetEntry.examples || nbHit.examples || [],
            };
            if (nbConjugatedFrom) conjugatedFrom = nbConjugatedFrom;
            break;
          }
        }
      }
    }

    // Cross-language fallback — if no hit in the selected widget language or
    // via NB-side linkedTo, scan the other supported languages and surface the
    // first direct match. The card then displays in the language the word was
    // found in (using its flag) with a banner explaining the fallback. Mirrors
    // the dictionary view's "Fant ingen ord på X — viser treff på Y" UX.
    let foundInLang = match ? currentLang : null;
    if (!match) {
      const fallbackOrder = ['nb', 'nn', 'en', 'de', 'es', 'fr'].filter(l => l !== currentLang);
      for (const otherLang of fallbackOrder) {
        const otherDict = await getDictForLang(otherLang);
        const hit = searchDictBanks(otherDict, q);
        if (hit) {
          match = hit;
          foundInLang = otherLang;
          break;
        }
      }
    }

    const displayLang = foundInLang || currentLang;

    // Enrich match with NB falseFriends/senses via reverse linkedTo scan
    if (match && nbDict && match._wordId && displayLang !== 'nb' && displayLang !== 'nn') {
      for (const bank of Object.keys(nbDict)) {
        const bankData = nbDict[bank];
        if (!bankData || typeof bankData !== 'object') continue;
        for (const [, nbEntry] of Object.entries(bankData)) {
          if (!nbEntry.linkedTo?.[displayLang]?.primary) continue;
          if (nbEntry.linkedTo[displayLang].primary !== match._wordId) continue;
          if (nbEntry.falseFriends) {
            match.falseFriends = [...(match.falseFriends || []), ...nbEntry.falseFriends];
          }
          if (nbEntry.senses) {
            match.senses = [...(match.senses || []), ...nbEntry.senses];
          }
        }
      }
    }

    // Remove old lookup card
    const old = document.getElementById('lexi-lookup-card');
    if (old) old.remove();

    // Restore saved position if any. Stored as { left, top } in viewport coords.
    let savedPos = null;
    try {
      const stored = await new Promise(resolve => {
        chrome.storage.local.get('lookupCardPos', r => resolve(r.lookupCardPos || null));
      });
      // Validate the saved position is still on-screen (window may have resized
      // since last drag). If off-screen, fall back to centred default.
      if (stored && typeof stored.left === 'number' && typeof stored.top === 'number'
          && stored.left >= 0 && stored.top >= 0
          && stored.left < window.innerWidth - 80 && stored.top < window.innerHeight - 80) {
        savedPos = stored;
      }
    } catch (_) { /* storage unavailable in some test contexts */ }

    const card = document.createElement('div');
    card.id = 'lexi-lookup-card';
    const positionCss = savedPos
      ? `top: ${savedPos.top}px; left: ${savedPos.left}px;`
      : `top: 50%; left: 50%; transform: translate(-50%, -50%);`;
    card.style.cssText = `
      position: fixed; z-index: 2147483647; ${positionCss}
      min-width: 280px; max-width: 360px; padding: 18px;
      background: rgba(255,255,255,0.88); backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid rgba(255,255,255,0.4); border-radius: 14px;
      box-shadow: 0 8px 40px rgba(0,0,0,0.15);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #1e293b; animation: lexi-fadein 0.2s ease-out;
    `;

    const LANG_FLAGS = { de: '\u{1F1E9}\u{1F1EA}', es: '\u{1F1EA}\u{1F1F8}', fr: '\u{1F1EB}\u{1F1F7}', en: '\u{1F1EC}\u{1F1E7}', nb: 'NB', nn: 'NN', no: 'NB' };
    const langFlag = LANG_FLAGS[displayLang] || '';
    const langSuffix = displayLang === 'nb' ? ' NB' : displayLang === 'nn' ? ' NN' : '';

    if (match) {
      const conjugHint = conjugatedFrom
        ? `<div style="font-size:12px;color:#64748b;margin-bottom:6px;padding:4px 8px;background:rgba(17,180,154,0.06);border-radius:6px;border-left:3px solid #11B49A;">${escapeHtml(conjugatedFrom)} → <strong>${escapeHtml(match.word)}</strong></div>`
        : '';

      const crossLangHint = (foundInLang && foundInLang !== currentLang)
        ? `<div style="font-size:12px;color:#64748b;margin-bottom:8px;padding:6px 10px;background:rgba(17,180,154,0.06);border-radius:6px;border-left:3px solid #11B49A;">${escapeHtml(t('widget_cross_lang_hint', { searchLang: langName(currentLang), resultLang: langName(foundInLang) }))}</div>`
        : '';

      // False-friend banner (FF-04)
      let falseFriendHtml = '';
      if (match.falseFriends && match.falseFriends.length) {
        const pairs = match.falseFriends.filter(f => f.lang === displayLang);
        if (pairs.length) {
          const items = pairs.map(f => `
            <div style="font-size:12px;color:#1e293b;">
              <strong>${escapeHtml(f.form)}</strong> — ${escapeHtml(f.meaning || '')}
              ${f.warning ? `<p style="margin:2px 0 0;font-size:11px;color:#64748b;">${sanitizeWarning(f.warning)}</p>` : ''}
            </div>
          `).join('');
          falseFriendHtml = `
            <div class="lh-ff-banner" style="margin:8px 0;padding:8px 10px;background:rgba(245,158,11,0.08);border-left:3px solid #f59e0b;border-radius:6px;">
              <div style="font-size:11px;font-weight:700;color:#f59e0b;margin-bottom:4px;">⚠ ${t('result_false_friend_heading')}</div>
              ${items}
            </div>
          `;
        }
      }

      // Sense-grouped translations (POLY-04) — replace flat translation when present
      let translationHtml = '';
      const sensesForLang = (match.senses || []).filter(s => s.translations && s.translations[displayLang]);
      if (sensesForLang.length) {
        const senseItems = sensesForLang.map(s => {
          const tr = s.translations[displayLang];
          const forms = Array.isArray(tr.forms) ? tr.forms : (tr.form ? [tr.form] : []);
          const ex = tr.example || {};
          return `
            <div class="lh-sense-group" style="margin-bottom:6px;padding:4px 0;border-bottom:1px solid rgba(0,0,0,0.04);">
              <div style="font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;">${escapeHtml(s.trigger || '')}</div>
              <div style="font-size:14px;color:#1e293b;">${forms.map(escapeHtml).join(', ')}</div>
              ${ex.sentence ? `<div style="font-size:11px;font-style:italic;color:#94a3b8;">${escapeHtml(ex.sentence)}${ex.translation ? ` — ${escapeHtml(ex.translation)}` : ''}</div>` : ''}
            </div>
          `;
        }).join('');
        translationHtml = `<div style="margin-bottom:8px;">${senseItems}</div>`;
      } else {
        translationHtml = `<div style="font-size:15px;margin-bottom:6px;">${escapeHtml(match.translation)}</div>`;
      }

      card.innerHTML = `
        <div class="lh-lookup-drag" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;cursor:move;user-select:none;">
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#11B49A;">${t('widget_lookup_header')}</span>
          <button id="lh-lookup-close" style="background:none;border:none;font-size:18px;color:#94a3b8;cursor:pointer;">&times;</button>
        </div>
        ${crossLangHint}
        ${conjugHint}
        <div style="font-size:20px;font-weight:700;color:#11B49A;margin-bottom:2px;">${langFlag ? `<span style="margin-right:4px">${langFlag}${langSuffix}</span>` : ''}${escapeHtml(match.word)}</div>
        ${falseFriendHtml}
        ${translationHtml}
        <div style="display:flex;gap:6px;margin-bottom:8px;">
          <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:rgba(17,180,154,0.08);color:#11B49A;font-weight:500;">${escapeHtml(match.partOfSpeech)}</span>
          ${match.gender ? `<span style="font-size:11px;padding:2px 6px;border-radius:4px;background:rgba(17,180,154,0.08);color:#11B49A;font-weight:500;">${escapeHtml(match.gender)}</span>` : ''}
        </div>
        ${match.examples.length && !hideExampleSentences ? `<div style="font-style:italic;font-size:13px;color:#475569;margin-bottom:4px;">"${escapeHtml(match.examples[0].sentence)}"</div>${(displayLang === 'nb' || displayLang === 'nn') ? '' : `<div style="font-size:12px;color:#94a3b8;margin-bottom:8px;">${escapeHtml(match.examples[0].translation || '')}</div>`}` : ''}
        ${match.grammar && displayLang !== 'nb' && displayLang !== 'nn' ? `<div style="font-size:12px;color:#64748b;padding-top:8px;border-top:1px solid rgba(0,0,0,0.06);"><strong>${t('widget_lookup_grammar')}</strong> ${escapeHtml(match.grammar)}</div>` : ''}
      `;
    } else {
      // Phase 17 COMP-01: try compound decomposition before showing not-found
      const vocabSurface = self.__lexiVocab;
      const decompose = vocabSurface && vocabSurface.getDecomposeCompound();
      let decompResult = null;
      if (decompose) {
        decompResult = decompose(word.toLowerCase());
      }

      if (decompResult) {
        // Show compound breakdown: "hverdagsmas = hverdag + s + mas (hankjonn)"
        const breakdownParts = [];
        for (const part of decompResult.parts) {
          breakdownParts.push(escapeHtml(part.word));
          if (part.linker) breakdownParts.push(escapeHtml(part.linker));
        }
        const breakdownStr = breakdownParts.join(' + ');
        const genderStr = decompResult.gender ? ` (${genusToGender(decompResult.gender)})` : '';
        card.innerHTML = `
          <div class="lh-lookup-drag" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;cursor:move;user-select:none;">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#11B49A;">${t('widget_lookup_header')}</span>
            <button id="lh-lookup-close" style="background:none;border:none;font-size:18px;color:#94a3b8;cursor:pointer;">&times;</button>
          </div>
          <div style="font-size:18px;font-weight:700;color:#11B49A;margin-bottom:2px;">${escapeHtml(word)}</div>
          <div style="display:flex;gap:6px;margin-bottom:8px;">
            <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:rgba(124,58,237,0.08);color:#7c3aed;font-weight:600;">${t('compound_label')}</span>
            <span style="font-size:11px;padding:2px 6px;border-radius:4px;background:rgba(17,180,154,0.08);color:#11B49A;font-weight:500;">${t('pos_noun')}</span>
          </div>
          <div style="font-size:14px;font-weight:600;color:#1e293b;margin-bottom:4px;">${breakdownStr}${escapeHtml(genderStr)}</div>
        `;
      } else {
        card.innerHTML = `
          <div class="lh-lookup-drag" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;cursor:move;user-select:none;">
            <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#11B49A;">${t('widget_lookup_header')}</span>
            <button id="lh-lookup-close" style="background:none;border:none;font-size:18px;color:#94a3b8;cursor:pointer;">&times;</button>
          </div>
          <div style="text-align:center;padding:12px 0 8px;color:#94a3b8;">
            <div style="font-size:15px;margin-bottom:4px;">"${escapeHtml(word)}"</div>
            <div style="font-size:13px;margin-bottom:12px;">${t('widget_lookup_not_found')}</div>
            ${!reportChannelOpen() ? '' : `
            <p style="font-size:12px;color:#64748b;margin:0 0 8px;">${escapeHtml(t('wish_word_hint'))}</p>
            <button id="lh-lookup-wish-btn" style="font-size:12px;padding:6px 14px;border-radius:8px;border:1px solid #11B49A;background:rgba(17,180,154,0.08);color:#11B49A;cursor:pointer;font-weight:600;">${escapeHtml(t('wish_word_button', { word }))}</button>`}
          </div>
        `;
        const wishBtn = card.querySelector('#lh-lookup-wish-btn');
        if (wishBtn) {
          wishBtn.addEventListener('click', () => {
            wishBtn.disabled = true;
            chrome.runtime.sendMessage({
              type: 'SEND_REPORT',
              data: {
                kind: 'word_request',
                word,
                lang: displayLang,
                uiLang: getUiLanguage(),
                timestamp: new Date().toISOString(),
              }
            }, () => {
              const err = chrome.runtime.lastError;
              if (err) {
                wishBtn.disabled = false;
                wishBtn.textContent = t('wish_word_error');
              } else {
                wishBtn.outerHTML = `<p style="font-size:12px;color:#11B49A;margin:0;">${escapeHtml(t('wish_word_sent', { word }))}</p>`;
              }
            });
          });
        }
      }
    }

    // Always-visible widget language pill row inside the lookup card so the
    // student can see which language the lookup is using and switch on the
    // fly. Phase 30-04 Task 6 keeps the widget's lang LOCAL — clicking a
    // pill here re-runs the lookup but does NOT touch shared `language`
    // storage or broadcast LANGUAGE_CHANGED (intentional decoupling from
    // popup writing-language).
    {
      const langsForPicker = [...BUNDLED_WIDGET_LANGS];
      // Append the student's chosen FL so the lookup card has a tab for
      // the foreign language they're actually studying. Without this the
      // pill row shows only NB/NN/EN — the active FL is unreachable from
      // the card even though all 6 languages ship in the bundle.
      try {
        const stored = await new Promise(r => chrome.storage.local.get('studentForeignLang', r));
        const sfl = stored?.studentForeignLang;
        if ((sfl === 'de' || sfl === 'es' || sfl === 'fr') && !langsForPicker.includes(sfl)) {
          langsForPicker.push(sfl);
        }
      } catch {}
      if (window.__lexiVocabStore) {
        try {
          const cached = await window.__lexiVocabStore.listCachedLanguages();
          for (const c of cached) {
            if (!langsForPicker.includes(c.language)) langsForPicker.push(c.language);
          }
        } catch {}
      }
      const pillStyle = (active) => `font-size:11px;padding:3px 8px;border-radius:6px;border:1px solid ${active ? '#11B49A' : 'rgba(0,0,0,0.08)'};background:${active ? 'rgba(17,180,154,0.12)' : 'rgba(255,255,255,0.6)'};color:${active ? '#11B49A' : '#475569'};font-weight:${active ? '700' : '500'};cursor:pointer;`;
      const pillHtml = `<div class="lh-lookup-langs" style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px;">`
        + langsForPicker.map(lang => {
            const active = lang === currentLang;
            return `<button class="lh-lookup-lang" data-lang="${lang}" style="${pillStyle(active)}">${WIDGET_LANG_FLAGS[lang] || ''} ${WIDGET_LANG_LABELS[lang] || lang.toUpperCase()}</button>`;
          }).join('')
        + `</div>`;
      const dragEl = card.querySelector('.lh-lookup-drag');
      if (dragEl) dragEl.insertAdjacentHTML('afterend', pillHtml);
      card.querySelectorAll('.lh-lookup-lang').forEach(btn => {
        btn.addEventListener('click', () => {
          const lang = btn.dataset.lang;
          if (lang === currentLang) return;
          currentLang = lang;
          readingLang = 'target';
          if (typeof updateVoiceOptions === 'function') updateVoiceOptions();
          showInlineLookup(word);
        });
      });
    }

    (document.fullscreenElement || document.documentElement).appendChild(card);
    card.querySelector('#lh-lookup-close').addEventListener('click', () => card.remove());
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { card.remove(); document.removeEventListener('keydown', esc); }
    });

    // Make the card draggable by its header. On drag-end the position is
    // persisted to chrome.storage so the next lookup opens at the same spot.
    const dragHandle = card.querySelector('.lh-lookup-drag');
    if (dragHandle) {
      let dragging = false;
      let offsetX = 0;
      let offsetY = 0;
      dragHandle.addEventListener('mousedown', (e) => {
        if (e.target.closest('.lh-close') || e.target.closest('.lh-pause-widget')) return;
        const rect = card.getBoundingClientRect();
        // Drop the centring transform once the user takes manual control.
        card.style.transform = 'none';
        card.style.left = rect.left + 'px';
        card.style.top = rect.top + 'px';
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        dragging = true;
        e.preventDefault();
      });
      const onMove = (e) => {
        if (!dragging) return;
        const x = Math.max(0, Math.min(e.clientX - offsetX, window.innerWidth - card.offsetWidth));
        const y = Math.max(0, Math.min(e.clientY - offsetY, window.innerHeight - card.offsetHeight));
        card.style.left = x + 'px';
        card.style.top = y + 'px';
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = false;
        const left = parseFloat(card.style.left);
        const top = parseFloat(card.style.top);
        if (Number.isFinite(left) && Number.isFinite(top)) {
          try { chrome.storage.local.set({ lookupCardPos: { left, top } }); } catch (_) { /* */ }
        }
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      // Clean up listeners when the card goes away.
      const cleanup = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      // Observe removal so we don't leak listeners across multiple lookups.
      const obs = new MutationObserver(() => {
        if (!card.isConnected) { cleanup(); obs.disconnect(); }
      });
      obs.observe(card.parentNode, { childList: true });
    }
  }

  function escapeHtml(str) {
    const d = document.createElement('span');
    d.textContent = str;
    return d.innerHTML;
  }

  // Sanitize pedagogical warning HTML — allow em, strong, and SVG tags for visual aids.
  function sanitizeWarning(html) {
    return escapeHtml(html)
      .replace(/&lt;(\/?)(em|strong)&gt;/gi, '<$1$2>')
      // Pedagogy endings tables (e.g. de-subject-verb's pronoun/ending
      // grid). Attribute pass-through mirrors the <svg ...> pattern below.
      .replace(/&lt;table(.*?)&gt;/gi, '<table$1>')
      .replace(/&lt;\/table&gt;/gi, '</table>')
      .replace(/&lt;(\/?)(thead|tbody|tr|td|th)&gt;/gi, '<$1$2>')
      .replace(/&lt;svg(.*?)&gt;/gi, '<svg$1>')
      .replace(/&lt;\/svg&gt;/gi, '</svg>')
      .replace(/&lt;g(.*?)&gt;/gi, '<g$1>')
      .replace(/&lt;\/g&gt;/gi, '</g>')
      .replace(/&lt;(circle|rect|line|polyline|polygon|path|text|tspan|ellipse)(.*?)&gt;/gi, '<$1$2>')
      .replace(/&lt;\/(circle|rect|line|polyline|polygon|path|text|tspan|ellipse)&gt;/gi, '</$1>')
      .replaceAll('&quot;', '"'); // restore attributes
  }

  // Ensure browser voices are loaded
  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = () => {};
    window.speechSynthesis.getVoices();
  }

    // Public surface — exposed for external observation / future test harnesses.
    // Does NOT enable mid-session re-mount (the listeners attached above are
    // process-scoped). Returning a handle keeps mountFloatingWidget() symmetric
    // with the Phase 30 popup view contract (mountDictionaryView et al.).
    return {
      hideWidget: () => { try { hideWidget(); } catch (_) {} },
      isMounted: () => widget !== null,
    };
  } // end mountFloatingWidget

  // ── Auto-mount path (Chrome extension content-script context) ──
  // The extension loads floating-widget.js as a content script; auto-mount
  // immediately with default deps (live globals). Downstream consumers
  // (lockdown sidepanel, future skriveokt-zero) that need to override deps
  // can set `self.__lexiSkipFloatingWidgetAutoMount = true` BEFORE this file
  // loads, then call `self.__lexiFloatingWidget.mount(deps)` themselves.
  const host = typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : null);
  if (host) {
    host.__lexiFloatingWidget = { mount: mountFloatingWidget };
    if (!host.__lexiSkipFloatingWidgetAutoMount) {
      try { mountFloatingWidget(); } catch (e) {
        // Defensive: never let a mount failure break content-script load.
        // (e.g. self.__lexiI18n missing in a sandbox would otherwise throw.)
        console.warn('Leksihjelp: floating-widget mount failed', e);
      }
    }
  }
})();
