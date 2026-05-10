/**
 * Leksihjelp — Spell / Grammar Check Renderer (content script, DOM adapter)
 *
 * Scans Norwegian (NB/NN) text in the active input for learner errors that
 * browsers miss. Each error gets a small dot anchored under the word;
 * clicking opens a popover with accept/dismiss actions.
 *
 * This file is the DOM/UI adapter only (Phase 43-01: was spell-check.js;
 * renamed when the engine/renderer split landed). Rule evaluation +
 * post-process filters live in `spell-check-engine.js` (pure, dual-export);
 * the engine in turn delegates to `spell-check-core.js` for rule-registry
 * dispatch. Vocab comes from the shared `__lexiVocab` seam (vocab-seam.js),
 * so this module rebuilds nothing and has zero references to
 * word-prediction.js internals or premium/subscription state — it could
 * later be extracted to skriv.papertek.app as a standalone product (INFRA-04).
 *
 * v1 error classes (emitted by the core as `rule_id`):
 *   - Gender article mismatch       ("en hus"       → "et hus")
 *   - Wrong verb form after modal   ("kan spiser"   → "kan spise")
 *   - Særskriving                   ("skole sekk"   → "skolesekk")
 *   - Known typo                    ("komer"        → "kommer")
 */

(function () {
  'use strict';

  // ── Seam bindings ──
  const VOCAB = self.__lexiVocab;
  const CORE  = self.__lexiSpellCore;
  const ENGINE = self.__lexiSpellCheckEngine;
  if (!VOCAB || !CORE || !ENGINE) return; // vocab-seam.js + spell-check-core.js + spell-check-engine.js must load first

  // i18n — strings.js exports to self.__lexiI18n; graceful fallback if not loaded.
  const t = (self.__lexiI18n && self.__lexiI18n.t) || ((key) => key);

  // ── State ──
  let enabled = false;
  let activeEl = null;
  let debounceTimer = null;

  // Phase 27: cached exam-mode flag. Updated on init + chrome.storage.onChanged.
  // Read on every runCheck pass; cheap (single bool lookup).
  let examMode = false;

  // ── Init ──
  init();

  // Temporary diagnostic logger — helps pinpoint why markers aren't
  // rendering on third-party editors. Enable in devtools with
  // `window.__lexiSpellDebug = true` or it runs anyway with reduced volume.
  function dbg(...args) {
    if (typeof window !== 'undefined' && window.__lexiSpellDebug) {
      console.log('[lexi-spell]', ...args);
    }
  }
  function warn(...args) {
    console.log('[lexi-spell]', ...args);
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

  // Plan 43-04: per-surface language for spell-check. Reads `lang.spellcheck`
  // (independent from `lang.dictionary` / vocab-seam's currentLang). The badge
  // and the chip-menu pill reflect this value. The underlying vocab indexes
  // (built by vocab-seam) still load whichever foreign language the dictionary
  // surface drives — multi-FL-in-memory is out of scope for Phase 43, but the
  // per-surface key gives the user UI-level independence today.
  let spellLang = '';

  async function init() {
    const stored = await storageGet(['spellCheckEnabled', 'lang.spellcheck']);
    // Spell-check is on by default (helps every student, not only dyslexia users).
    // Independent of predictionEnabled so users can keep spell-check while
    // turning predictions off.
    enabled = stored.spellCheckEnabled !== false;
    spellLang = stored['lang.spellcheck'] || '';

    warn('init', { lang: VOCAB.getLanguage(), enabled, spellCheckEnabled: stored.spellCheckEnabled });

    // Vocab is loaded by vocab-seam.js; just wait for it to be ready.
    // The seam's onReady queue handles late subscribers deterministically.
    VOCAB.onReady(() => {
      warn('vocab ready', {
        validWords: VOCAB.getValidWords().size,
        typos: VOCAB.getTypoFix().size,
        nouns: VOCAB.getNounGenus().size,
      });
    });

    attachListeners();

    chrome.runtime.onMessage.addListener(handleRuntimeMessage);

    // Phase 5 / UX-02: hydrate + subscribe to the alternates-visible toggle
    // (storage key written by popup.js initSettings — Plan 04). A live flip
    // re-renders the active popover in place so the user sees the layout
    // change without having to close and re-open it.
    chrome.storage.local.get('spellCheckAlternatesVisible', (r) => {
      // Default ON: only treat an explicit `false` as off; unset → true.
      alternatesVisible = !(r && r.spellCheckAlternatesVisible === false);
    });
    // Phase 27: hydrate cached examMode + subscribe to live toggle.
    chrome.storage.local.get('examMode', (r) => {
      examMode = !!(r && r.examMode);
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if ('spellCheckAlternatesVisible' in changes) {
        alternatesVisible = changes.spellCheckAlternatesVisible.newValue !== false;
        if (popover && activePopoverIdx >= 0 && lastFindings[activePopoverIdx]) {
          showPopover(activePopoverIdx, lastFindings[activePopoverIdx]);
        }
      }
      if ('examMode' in changes) {
        examMode = !!changes.examMode.newValue;
        // Hide any open popover and clear markers on toggle; the immediate
        // runCheck() below repaints with the filtered rule set so the change
        // is visually live (no perceptible lag, no reload).
        hideOverlay();
        // Cancel any pending debounce so we don't double-run.
        if (debounceTimer) { clearTimeout(debounceTimer); debounceTimer = null; }
        // Force lastCheckedText reset so runCheck doesn't short-circuit on
        // "same text as last time" — the rule set changed, not the text.
        lastCheckedText = '';
        if (activeEl) runCheck();
      }
      // Refresh the chip menu if it's open while the student picks a
      // different FL in the popup pill row, so the consolidated FL pill
      // there reflects the latest studentForeignLang. We DO NOT auto-
      // switch lang.spellcheck — surfaces stay independent per Plan
      // 43-04. The chip's chevron dropdown is the spell-check's own
      // FL picker.
      if ('studentForeignLang' in changes) {
        if (langFlyout) showChipMenu();
      }
      // External writers (e.g. another tab's chip switch via storage
      // sync) update lang.spellcheck — keep the local spellLang mirror
      // in sync so currentLangCode() returns the right value, refresh
      // the chip badge, and re-run the check against the new lang's
      // side-car indexes.
      if ('lang.spellcheck' in changes) {
        const next = changes['lang.spellcheck'].newValue || '';
        if (next !== spellLang) {
          spellLang = next;
          refreshLangBadge();
          if (langFlyout) showChipMenu();
          lastCheckedText = '';
          if (activeEl) runCheck();
        }
      }
    });

    // Expose state for ad-hoc inspection from devtools.
    if (typeof window !== 'undefined') {
      window.__lexiSpell = {
        state: () => ({
          lang: VOCAB.getLanguage(),
          enabled,
          activeEl,
          findings: lastFindings,
          markers: markers.length,
        }),
        recheck: () => runCheck(),
        validWordsSize: () => VOCAB.getValidWords().size,
      };
    }
  }

  function handleRuntimeMessage(msg) {
    // Plan 43-04: LANGUAGE_CHANGED retired. Per-surface language updates
    // arrive via chrome.storage.onChanged for `lang.spellcheck` (see the
    // listener registered below at init time).
    if (msg.type === 'PREDICTION_TOGGLED') {
      // Prediction off → spell-check off (honor the umbrella toggle).
      if (!msg.enabled) { enabled = false; hideOverlay(); }
    } else if (msg.type === 'SPELL_CHECK_TOGGLED') {
      enabled = !!msg.enabled;
      if (!enabled) { hideOverlay(); hideButton(); }
    } else if (msg.type === 'TOGGLE_PAUSE') {
      // Keyboard shortcut from the service worker. Toggle pause for the
      // active host: 1h pause if currently running, instant resume if
      // already paused. Suppressed in exam mode (lockdown owns the
      // disable affordance there).
      const pauseApi = self.__lexiPause;
      if (!pauseApi || examMode) return;
      (async () => {
        if (pauseApi.isPausedNow()) {
          await pauseApi.resume();
          if (activeEl) { lastCheckedText = ''; manualCheck(); }
        } else {
          await pauseApi.pause(1);
          hideOverlay();
        }
        refreshChipPauseState();
      })();
    }
  }

  function storageGet(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }


  // ── Input wiring ──

  function attachListeners() {
    document.addEventListener('input', onInput, true);
    document.addEventListener('keyup', onInput, true);
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('blur', onBlur, true);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('scroll', schedulePositionRefresh, true);
    window.addEventListener('resize', schedulePositionRefresh);
    document.addEventListener('click', onDocClick, true);
  }

  // Walk up to find the element that actually declared contenteditable, not a
  // nested text node or span that merely inherits it. Rich editors (TipTap,
  // Lexical, ProseMirror) fire focus/input on the root div — but third-party
  // code sometimes bubbles events from deeper nodes, and reading text from a
  // child would miss the rest of the document.
  // Skip our own UI: sidepanel, popup, lookup card, floating widget.
  // Without this, the green Aa pill renders inside the dictionary search
  // input (Plan 34 Bug B) and the spell-check overlay attaches to the
  // popup's settings inputs.
  function isInsideLexiUI(target) {
    if (!target || !target.closest) return false;
    return !!target.closest(
      '#leksihjelp-sidepanel-root, #lh-popup-root, ' +
      '.lh-floating-widget, .lh-lookup-card, .lh-spell-popover, .lh-spell-check-btn, ' +
      '.lh-lang-flyout, .lh-prediction-dropdown'
    );
  }

  function resolveEditable(target) {
    if (!target || target.nodeType !== 1) return null;
    if (isInsideLexiUI(target)) return null;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
      return VOCAB.isTextInput(target) ? target : null;
    }
    let cur = target;
    while (cur && cur.nodeType === 1) {
      const attr = cur.getAttribute && cur.getAttribute('contenteditable');
      if (attr === 'true' || attr === '') return cur;
      cur = cur.parentElement;
    }
    return target.isContentEditable ? target : null;
  }

  function onFocus(e) {
    if (!enabled) { dbg('skip focus — disabled', { enabled }); return; }
    const el = resolveEditable(e.target);
    if (!el) { dbg('skip focus — no editable', e.target?.tagName); return; }
    if (activeEl !== el) {
      // Reset dismissals when moving to a new input — they're session-scoped
      // to the currently focused element.
      dismissed.clear();
    }
    activeEl = el;
    warn('focus → active', { tag: el.tagName, cls: el.className, ce: el.isContentEditable });
    updateButtonVisibility();
    schedule();
  }

  function onInput(e) {
    if (!enabled) return;
    const el = resolveEditable(e.target);
    if (!el) return;
    activeEl = el;
    updateButtonVisibility();
    // Don't reset the fast recheck timer when auto-advancing
    if (pendingAdvanceIdx < 0) schedule();
  }

  function onBlur() {
    // Keep overlay briefly so users can click markers after the input
    // blurs; hide once focus has truly left the editable and our overlay.
    setTimeout(() => {
      const ae = document.activeElement;
      if (!activeEl) return;
      const focusStillInside = activeEl === ae || activeEl.contains(ae);
      const focusInOverlay = overlay && overlay.contains(ae);
      const focusInBtn = spellCheckBtn && (spellCheckBtn === ae || spellCheckBtn.contains(ae));
      if (!focusStillInside && !focusInOverlay && !focusInBtn) {
        hideOverlay();
        hideButton();
      }
    }, 250);
  }

  function onKeyDown(e) {
    // Phase 26: Esc on an open Lær mer panel collapses the panel without
    // dismissing the popover. If the panel is closed (or absent), let the
    // event propagate normally.
    if (e.key === 'Escape' && popover) {
      const panel = popover.querySelector('.lh-spell-pedagogy-panel');
      const btn = popover.querySelector('.lh-spell-laer-mer-btn');
      if (panel && !panel.hidden) {
        e.preventDefault();
        e.stopPropagation();
        panel.hidden = true;
        pedagogyPanelExpanded = false; // Phase 35 (F6): explicit user collapse
        if (btn) {
          btn.setAttribute('aria-expanded', 'false');
          btn.textContent = t('laer_mer_button');
        }
        if (markers[activePopoverIdx]) positionPopover(markers[activePopoverIdx].rect);
        return;
      }
    }
    if (e.key !== 'Tab' || !popover || activePopoverIdx < 0) return;
    e.preventDefault();
    // Tab advances to next marker — showPopover() rebuilds from scratch, so
    // the pedagogy panel state resets cleanly. No explicit cleanup needed.
    if (e.shiftKey) navigateToPrevMarker();
    else navigateToNextMarker();
  }

  function onDocClick(e) {
    if (!popover) return;
    if (popover.contains(e.target)) return;
    for (const m of markers) if (m.el.contains(e.target)) return;
    hidePopover();
  }

  function schedule() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runCheck();
    }, 800);
  }

  async function runCheck() {
    if (!activeEl || !enabled) {
      dbg('runCheck skip', { activeEl: !!activeEl, enabled });
      hideOverlay();
      return;
    }
    // Pause-by-domain: students can pause leksihjelp for 1h/4h/24h on a
    // host via the chip menu. The chip itself stays visible (in greyed
    // state) so the student can resume; everything else bails out.
    if (self.__lexiPause && self.__lexiPause.isPausedNow()) {
      hideOverlay();
      return;
    }
    const { text, cursor } = readInput(activeEl);
    if (!text || text.length < 3) { hideOverlay(); maybeHideLangHint(); return; }
    // Plan 43-04: spell-check has its own per-surface language. The
    // shared VOCAB seam is hydrated for `lang.dictionary` only — if the
    // student picked a different lang via the chip, VOCAB's indexes are
    // for the dictionary lang and would silently fire wrong-language
    // typo suggestions (e.g. "comb" for ES "como" when VOCAB is on EN).
    // Resolve the effective spell-check lang and build a lang-correct
    // indexes object via the side-car loader before dispatching.
    const lang = currentLangCode() || VOCAB.getLanguage();
    const supported = ['nb', 'nn', 'en', 'de', 'es', 'fr'];
    if (!supported.includes(lang)) { hideOverlay(); return; }

    // Plan 43-04: passive auto-detect hint banner. Runs against the active
    // input text; if __lexiDetectLanguage reports a high-confidence language
    // different from `lang.spellcheck`, surface a one-click "Bytt" banner.
    // Never auto-switches.
    maybeShowLangHint(text);

    // Side-car indexes for the spell-check lang when it differs from the
    // shared VOCAB hydration. Lazy-loaded per-lang and cached. Returns
    // the same shape the rule engine expects so we can swap it in
    // without changing downstream code.
    let sc = null;
    if (lang !== VOCAB.getLanguage()) {
      sc = await loadSpellCheckSidecar(lang);
    }
    const pick = (k, getter) => sc ? sc[k] : getter();

    const vocab = {
      nounGenus:        pick('nounGenus',        VOCAB.getNounGenus),
      nounForms:        pick('nounForms',        VOCAB.getNounForms),
      verbInfinitive:   pick('verbInfinitive',   VOCAB.getVerbInfinitive),
      validWords:       pick('validWords',       VOCAB.getValidWords),
      isAdjective:      pick('isAdjective',      VOCAB.getIsAdjective),
      knownPresens:     pick('knownPresens',     VOCAB.getKnownPresens),
      knownPreteritum:  pick('knownPreteritum',  VOCAB.getKnownPreteritum),
      verbForms:        pick('verbForms',        VOCAB.getVerbForms),
      typoFix:          pick('typoFix',          VOCAB.getTypoFix),
      compoundNouns:    pick('compoundNouns',    VOCAB.getCompoundNouns),
      pitfalls:         pick('pitfalls',         VOCAB.getPitfalls),
      freq:             pick('freq',             VOCAB.getFreq),
      sisterValidWords: pick('sisterValidWords', VOCAB.getSisterValidWords),
      registerWords:      pick('registerWords',      VOCAB.getRegisterWords),
      collocations:       pick('collocations',       VOCAB.getCollocations),
      redundancyPhrases:  pick('redundancyPhrases',  VOCAB.getRedundancyPhrases),
      isFeatureEnabled:   VOCAB.isFeatureEnabled || (() => true),
      nnInfinitiveClasses: pick('nnInfinitiveClasses', VOCAB.getNNInfinitiveClasses),
      participleToAux:    pick('participleToAux',    VOCAB.getParticipleToAux),
      esPresensToVerb:    pick('esPresensToVerb',    VOCAB.getEsPresensToVerb),
      esSubjuntivoForms:  pick('esSubjuntivoForms',  VOCAB.getEsSubjuntivoForms),
      esImperfectoForms:  pick('esImperfectoForms',  VOCAB.getEsImperfectoForms),
      esPreteritumToVerb: pick('esPreteritumToVerb', VOCAB.getEsPreteritumToVerb),
      frPresensToVerb:    pick('frPresensToVerb',    VOCAB.getFrPresensToVerb),
      frSubjonctifForms:  pick('frSubjonctifForms',  VOCAB.getFrSubjonctifForms),
      frSubjonctifDiffers: pick('frSubjonctifDiffers', VOCAB.getFrSubjonctifDiffers),
      irregularForms:     pick('irregularForms',     VOCAB.getIrregularForms),
      decomposeCompound:  pick('decomposeCompound',  VOCAB.getDecomposeCompound),
      decomposeCompoundStrict: pick('decomposeCompoundStrict', VOCAB.getDecomposeCompoundStrict),
      sPassivForms:       pick('sPassivForms',       VOCAB.getSPassivForms),
      prepPedagogy:       pick('prepPedagogy',       VOCAB.getPrepPedagogy),
      gustarClassVerbs:   pick('gustarClassVerbs',   VOCAB.getGustarClassVerbs),
      gustarPedagogy:     pick('gustarPedagogy',     VOCAB.getGustarPedagogy),
      frAspectAdverbs:    pick('frAspectAdverbs',    VOCAB.getFrAspectAdverbs),
      frAspectPedagogy:   pick('frAspectPedagogy',   VOCAB.getFrAspectPedagogy),
      frImparfaitToVerb:  pick('frImparfaitToVerb',  VOCAB.getFrImparfaitToVerb),
      frPasseComposeParticiples: pick('frPasseComposeParticiples', VOCAB.getFrPasseComposeParticiples),
      frAuxPresensForms:  pick('frAuxPresensForms',  VOCAB.getFrAuxPresensForms),
      nbToNnVerbs:        pick('nbToNnVerbs',        VOCAB.getNbToNnVerbs),
      nbToNnNouns:        pick('nbToNnNouns',        VOCAB.getNbToNnNouns),
      grammarTables:      pick('grammarTables',      VOCAB.getGrammarTables),
      rulePedagogy:       pick('rulePedagogy',       VOCAB.getRulePedagogy),
    };

    // Phase 43-01: rule dispatch + post-process filters delegated to the
    // pure spell-check engine. Engine handles: CORE.check() call, legacy
    // type=rule_id alias, dismissed-finding filter, and Phase 27
    // exam-mode rule filter. Renderer keeps owning the dual-marker
    // popover-render gate (in showPopover) — that's DOM-side.
    let findings = ENGINE.runCheck(text, vocab, {
      cursorPos: cursor,
      lang,
      core: CORE,
      examMode,
      examApi: self.__lexiExam || null,
      ruleRegistry: self.__lexiSpellRules || null,
      dismissed,
      dismissKey,
    });

    warn('check', {
      lang,
      vocabSize: vocab.validWords.size,
      textHead: (text || '').slice(0, 80),
      findingsCount: findings.length,
    });
    lastCheckedText = text;
    if (findings.length === 0) {
      lastFindings = [];
      hideOverlay();
      if (pendingAdvanceIdx >= 0) {
        pendingAdvanceIdx = -1;
        showToast(t('spell_toast_review_done') || 'Ferdig revidert ✓');
      }
      return;
    }
    lastFindings = findings;
    renderMarkers(findings);
    if (pendingAdvanceIdx >= 0) {
      const idx = Math.min(pendingAdvanceIdx, findings.length - 1);
      pendingAdvanceIdx = -1;
      showPopover(idx, findings[idx]);
      scrollMarkerIntoView(idx);
    }
  }

  function dismissKey(f) {
    return `${f.original}|${f.fix}`;
  }

  function readInput(el) {
    if (el.isContentEditable) return { text: el.textContent || '', cursor: null };
    return { text: el.value || '', cursor: el.selectionEnd };
  }

  // ── Overlay + markers + popover ──

  let overlay = null;
  const markers = []; // [{ el, finding, rect }]
  let popover = null;
  let activePopoverIdx = -1;
  let lastFindings = [];
  let lastCheckedText = '';
  let spellCheckBtn = null;
  const dismissed = new Set();
  let pendingAdvanceIdx = -1;
  let posRefreshRaf = null;
  // Phase 35 (F6): Tab navigation between markers calls showPopover() which
  // rebuilds the popover from scratch — that previously reset the Lær mer
  // panel to collapsed even though the user had explicitly opened it.
  // We persist the expanded/collapsed choice across Tab navigation by
  // remembering it module-side. Reset only on explicit dismissal paths
  // (Esc on panel, panel toggle close, hidePopover from decline / applyFix /
  // click-outside / blur).
  let pedagogyPanelExpanded = false;
  // Phase 5 / UX-02: popup Settings toggle subscriber. Plan 04 writes the key;
  // this module hydrates on init and re-reads via chrome.storage.onChanged so
  // a live toggle flips the active popover layout without a re-open.
  let alternatesVisible = false;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement('div');
    overlay.id = 'lexi-spell-overlay';
    (document.fullscreenElement || document.body).appendChild(overlay);
    return overlay;
  }

  function renderMarkers(findings) {
    clearMarkers();
    ensureOverlay();

    let rendered = 0, skipped = 0;
    findings.forEach((finding, idx) => {
      const rect = positionForRange(activeEl, finding.start, finding.end);
      if (!rect) {
        skipped++;
        warn('skip — no rect', finding.original, { start: finding.start, end: finding.end, elRect: activeEl.getBoundingClientRect() });
        return;
      }
      const er = activeEl.getBoundingClientRect();
      if (!isInsideElement(activeEl, rect)) {
        skipped++;
        warn('skip — outside el', finding.original, { rect, elRect: { top: er.top, left: er.left, right: er.right, bottom: er.bottom } });
        return;
      }
      const dot = document.createElement('div');
      // Phase 6: severity-aware CSS class suffix
      const severitySuffix = finding.severity === 'warning' ? ' lh-spell-warn'
                           : finding.severity === 'hint'    ? ' lh-spell-hint'
                           : '';
      dot.className = `lh-spell-dot lh-spell-${finding.type}${severitySuffix}`;
      dot.dataset.idx = String(idx);
      dot.title = finding.message;
      dot.addEventListener('mousedown', e => e.preventDefault()); // prevent blur
      dot.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        showPopover(idx, finding);
      });
      overlay.appendChild(dot);
      markers.push({ el: dot, finding, rect });
      positionDot(dot, rect);
      // Phase 6 / F38-4: hint markers span the full word width.
      // Height stays at the CSS default (3px) so the solid-color P3 hint
      // background actually paints. Pre-F38-4 the hint marker had inline
      // height=0 and relied on a border-bottom for visibility, but on the
      // 3px-fixed-position dot the border didn't paint reliably across hosts.
      if (finding.severity === 'hint') {
        const wordWidth = rect.width || (rect.right - rect.left);
        dot.style.width = wordWidth + 'px';
        dot.style.top = (rect.bottom || (rect.top + rect.height)) + 'px';
        dot.style.left = rect.left + 'px';
      }
      rendered++;
    });
    warn('markers rendered', { rendered, skipped, total: findings.length });
  }

  function positionDot(dot, rect) {
    // Thin underline-style bar, full width of the error span, just below it.
    dot.style.top = `${rect.top + rect.height}px`;
    dot.style.left = `${rect.left}px`;
    dot.style.width = `${Math.max(rect.width, 12)}px`;
  }

  // Keep markers aligned with their words when the input scrolls or the
  // viewport resizes. Skip the work if the text itself has changed —
  // schedule() will rerun check().
  function schedulePositionRefresh() {
    if (posRefreshRaf) return;
    posRefreshRaf = requestAnimationFrame(() => {
      posRefreshRaf = null;
      if (!activeEl || markers.length === 0) return;
      for (const m of markers) {
        const rect = positionForRange(activeEl, m.finding.start, m.finding.end);
        if (!rect || !isInsideElement(activeEl, rect)) {
          m.el.style.display = 'none';
          continue;
        }
        m.el.style.display = '';
        positionDot(m.el, rect);
        m.rect = rect;
      }
      if (popover && activePopoverIdx >= 0 && markers[activePopoverIdx]) {
        positionPopover(markers[activePopoverIdx].rect);
      }
      positionButton();
    });
  }

  function isInsideElement(el, rect) {
    const er = el.getBoundingClientRect();
    // Keep a few-pixel tolerance so a word at the very top/bottom line still
    // shows its marker.
    return rect.bottom >= er.top - 2 && rect.top <= er.bottom + 2 &&
           rect.right >= er.left - 2 && rect.left <= er.right + 2;
  }

  function clearMarkers() {
    for (const m of markers) m.el.remove();
    markers.length = 0;
    hidePopover();
  }

  function hideOverlay() {
    clearMarkers();
    if (overlay) overlay.remove();
    overlay = null;
  }

  function showPopover(idx, finding) {
    // Phase 35 (F6): preserve pedagogy panel open/close state across the
    // hidePopover() rebuild. hidePopover() resets the flag (so non-rebuild
    // dismissal paths — click-outside, Esc-on-popover, decline, applyFix —
    // start the next popover collapsed), but Tab navigation between markers
    // is a rebuild-not-a-dismissal so we restore the pre-hide value here.
    const _wasExpanded = pedagogyPanelExpanded;
    hidePopover();
    pedagogyPanelExpanded = _wasExpanded;

    // Phase 27: dual-marker gate. If exam mode is on AND this finding's rule
    // has rule.explain.exam.safe = false (e.g. de-prep-case Lær mer pedagogy
    // surface), suppress the popover entirely. The dot still renders because
    // the rule itself is exam-safe (rule.exam.safe = true). Without this
    // guard, the pedagogy-rich popover would surface during exams.
    if (examMode && self.__lexiExam && self.__lexiSpellRules && finding && finding.rule_id) {
      const rule = self.__lexiSpellRules.find(r => r && r.id === finding.rule_id);
      if (rule && !self.__lexiExam.isExplainSafe(rule, true)) {
        return;
      }
    }

    activePopoverIdx = idx;
    popover = document.createElement('div');
    // Phase 6: severity-aware popover class
    const popoverSeveritySuffix = finding.severity === 'warning' ? ' lh-spell-popover-warn'
                                : finding.severity === 'hint'    ? ' lh-spell-popover-hint'
                                : '';
    popover.className = `lh-spell-popover lh-spell-popover-${finding.type}${popoverSeveritySuffix}`;
    popover.addEventListener('mousedown', e => e.preventDefault());

    // Plan 43-04: prefer the spell-check's own per-surface lang.
    // VOCAB.getLanguage() reflects lang.dictionary which may be on a
    // completely different language (e.g. NB in popup, ES in chip);
    // using it here surfaced the "Bokmål" register badge on Spanish
    // findings.
    const lang = currentLangCode() || VOCAB.getLanguage();
    const suggestions = Array.isArray(finding.suggestions) && finding.suggestions.length
      ? finding.suggestions
      : [finding.fix];

    const useMulti = alternatesVisible && suggestions.length > 1;

    // Phase 05.1-05 inline UX gap-closure: small register-badge pill in the
    // popover header so the student can tell which Norwegian standard the
    // rule pipeline is running in (disambiguates the "skrevet valid NB but
    // unknown NN" class of confusion when pages carry mixed-register text).
    // Resolved per-target-locale: the label for "Bokmål" / "Nynorsk" is read
    // from that locale's strings block, mirroring the nb-gender three-beat
    // pattern. Rendered in BOTH the single- and multi-suggest branches.
    const registerBadgeHtml = renderRegisterBadge(lang);

    if (useMulti) {
      const topK = suggestions.slice(0, 3);
      const rest = suggestions.slice(3, 8);
      const rowsHtml = topK.map(s =>
        `<button type="button" class="lh-spell-sugg-row" data-fix="${escapeAttr(s)}">${escapeHtml(s)}</button>`
      ).join('');
      const visFlereHtml = rest.length
        ? `<button type="button" class="lh-spell-vis-flere" data-state="collapsed">Vis flere \u2304</button>`
        : '';
      popover.innerHTML = `
        <div class="lh-spell-head">
          <span class="lh-spell-orig">${escapeHtml(finding.original)}</span>
          ${registerBadgeHtml}
        </div>
        <div class="lh-spell-explain">${renderExplain(finding, lang)}</div>
        <div class="lh-spell-suggestions">${rowsHtml}${visFlereHtml}</div>
        <div class="lh-spell-actions">
          <button type="button" class="lh-spell-btn lh-spell-decline">\u2715 Avvis</button>
          <button type="button" class="lh-spell-btn lh-spell-report" title="Send beskjed til oss om at Leksihjelp tar feil her \u2014 vi bruker rapportene til \u00e5 forbedre stavekontrollen.">\u26a0 Rapporter feil</button>
        </div>
        ${finding.pedagogy ? `<button type="button" class="lh-spell-laer-mer-btn" aria-expanded="false">${escapeHtml(t('laer_mer_button'))}</button><div class="lh-spell-pedagogy-panel" hidden></div>` : ''}
      `;
      popover.querySelectorAll('.lh-spell-sugg-row').forEach(row => {
        row.addEventListener('click', () => applyFix({ ...finding, fix: row.dataset.fix }));
      });
      if (rest.length) {
        const visFlereBtn = popover.querySelector('.lh-spell-vis-flere');
        visFlereBtn.addEventListener('click', () => {
          const state = visFlereBtn.dataset.state;
          const suggList = popover.querySelector('.lh-spell-suggestions');
          if (state === 'collapsed') {
            rest.forEach(s => {
              const row = document.createElement('button');
              row.type = 'button';
              row.className = 'lh-spell-sugg-row';
              row.dataset.fix = s;
              row.textContent = s;
              row.addEventListener('click', () => applyFix({ ...finding, fix: s }));
              suggList.insertBefore(row, visFlereBtn);
            });
            visFlereBtn.textContent = 'Vis f\u00e6rre \u2303';
            visFlereBtn.dataset.state = 'expanded';
          } else {
            const extraRows = popover.querySelectorAll('.lh-spell-sugg-row');
            for (let i = 3; i < extraRows.length; i++) extraRows[i].remove();
            visFlereBtn.textContent = 'Vis flere \u2304';
            visFlereBtn.dataset.state = 'collapsed';
          }
        });
      }
    } else {
      // Structural rules (de-verb-final, de-separable-verb) set noAutoFix:true
      // because their fix can't be expressed as an atomic string substitution
      // \u2014 they require moving tokens across the clause.
      //
      // F38-4 follow-up: P3 hint rules (e.g. fr-aspect-hint, es-imperfecto-hint)
      // set finding.fix to the same string as finding.original because the
      // rule can't know which aspect/mood the student MEANT \u2014 the pedagogy
      // lives in explain(). Treat fix === original the same as noAutoFix so
      // we don't render a Fiks button that loops forever (replacing token
      // with itself \u2192 retokenize \u2192 rule fires again \u2192 same popover).
      const noAutoFix = finding.noAutoFix || (finding.fix === finding.original);
      const headHtml = noAutoFix
        ? `<div class="lh-spell-head"><span class="lh-spell-orig">${escapeHtml(finding.original)}</span>${registerBadgeHtml}</div>`
        : `<div class="lh-spell-head">
            <span class="lh-spell-orig">${escapeHtml(finding.original)}</span>
            <span class="lh-spell-arrow">\u2192</span>
            <span class="lh-spell-fix-text">${escapeHtml(suggestions[0])}</span>
            ${registerBadgeHtml}
          </div>`;
      const fixBtnHtml = noAutoFix
        ? ''
        : '<button type="button" class="lh-spell-btn lh-spell-accept">\u2713 Fiks</button>';
      popover.innerHTML = `
        ${headHtml}
        <div class="lh-spell-explain">${renderExplain(finding, lang)}</div>
        <div class="lh-spell-actions">
          ${fixBtnHtml}
          <button type="button" class="lh-spell-btn lh-spell-decline">\u2715 Avvis</button>
          <button type="button" class="lh-spell-btn lh-spell-report" title="Send beskjed til oss om at Leksihjelp tar feil her \u2014 vi bruker rapportene til \u00e5 forbedre stavekontrollen.">\u26a0 Rapporter feil</button>
        </div>
        ${finding.pedagogy ? `<button type="button" class="lh-spell-laer-mer-btn" aria-expanded="false">${escapeHtml(t('laer_mer_button'))}</button><div class="lh-spell-pedagogy-panel" hidden></div>` : ''}
      `;
      const acceptBtn = popover.querySelector('.lh-spell-accept');
      if (acceptBtn) acceptBtn.addEventListener('click', () => applyFix(finding));
    }

    // Phase 26: L\u00e6r mer pedagogy panel \u2014 toggle handler. Builds panel content
    // lazily on first expand, re-positions popover so the new height is
    // accommodated, swaps button label between "L\u00e6r mer" and "Lukk".
    if (finding.pedagogy) {
      const laerMerBtn = popover.querySelector('.lh-spell-laer-mer-btn');
      const panel = popover.querySelector('.lh-spell-pedagogy-panel');
      if (laerMerBtn && panel) {
        const uiLang = (self.__lexiI18n && typeof self.__lexiI18n.getUiLanguage === 'function')
          ? self.__lexiI18n.getUiLanguage() : 'nb';
        let built = false;
        // Phase 35 (F6): pre-expand panel if the user opened it on a prior
        // marker and is now Tab-navigating to a new marker. Without this, the
        // rebuilt popover always starts collapsed.
        if (pedagogyPanelExpanded) {
          panel.innerHTML = renderPedagogyPanel(finding.pedagogy, uiLang);
          built = true;
          panel.hidden = false;
          laerMerBtn.setAttribute('aria-expanded', 'true');
          laerMerBtn.textContent = t('laer_mer_close');
        }
        laerMerBtn.addEventListener('click', () => {
          if (panel.hidden) {
            if (!built) {
              panel.innerHTML = renderPedagogyPanel(finding.pedagogy, uiLang);
              built = true;
            }
            panel.hidden = false;
            laerMerBtn.setAttribute('aria-expanded', 'true');
            laerMerBtn.textContent = t('laer_mer_close');
            pedagogyPanelExpanded = true; // Phase 35 (F6)
          } else {
            panel.hidden = true;
            laerMerBtn.setAttribute('aria-expanded', 'false');
            laerMerBtn.textContent = t('laer_mer_button');
            pedagogyPanelExpanded = false; // Phase 35 (F6)
          }
          // Re-position popover since height changed.
          if (markers[activePopoverIdx]) positionPopover(markers[activePopoverIdx].rect);
        });
      }
    }

    popover.querySelector('.lh-spell-decline').addEventListener('click', () => {
      dismissed.add(dismissKey(finding));
      pendingAdvanceIdx = activePopoverIdx;
      hidePopover();
      runCheck();
    });
    // Two-step click on "Rapporter feil": first click REPLACES the entire
    // popover body with a confirm + cancel UI explaining the report is
    // anonymous and sent to leksihjelp to improve the spellcheck. Second
    // click on "Send rapport" transmits. Cancel restores the original
    // popover body. Goal: avoid students clicking "Rapporter feil" without
    // realising it's a feedback channel back to us, AND make the confirm
    // visually distinct from the original feedback (no overlap).
    function attachReportHandler(btn, savedPopoverHtml) {
      if (!btn) return;
      btn.addEventListener('click', () => {
        const restoreHtml = savedPopoverHtml || popover.innerHTML;
        popover.innerHTML = `
          <div class="lh-spell-report-confirm">
            <p class="lh-spell-report-confirm-text">Vil du sende en anonym rapport til Leksihjelp om at denne påvisningen er feil? Vi bruker rapportene til å forbedre stavekontrollen.</p>
            <div class="lh-spell-report-confirm-actions lh-spell-actions">
              <button type="button" class="lh-spell-btn lh-spell-report-send">✓ Send rapport</button>
              <button type="button" class="lh-spell-btn lh-spell-report-cancel">✕ Avbryt</button>
            </div>
          </div>
        `;
        if (markers[activePopoverIdx]) positionPopover(markers[activePopoverIdx].rect);
        const sendBtn = popover.querySelector('.lh-spell-report-send');
        const cancelBtn = popover.querySelector('.lh-spell-report-cancel');
        cancelBtn?.addEventListener('click', () => {
          popover.innerHTML = restoreHtml;
          // Re-attach all popover button listeners on the restored DOM nodes.
          // Decline = Avvis: dismiss this finding and re-run.
          popover.querySelector('.lh-spell-decline')?.addEventListener('click', () => {
            dismissed.add(dismissKey(finding));
            pendingAdvanceIdx = activePopoverIdx;
            hidePopover();
            runCheck();
          });
          // Accept = Fiks (only present when !noAutoFix).
          popover.querySelector('.lh-spell-accept')?.addEventListener('click', () => applyFix(finding));
          // Re-attach Rapporter feil with the saved HTML so a second cancel
          // works too.
          attachReportHandler(popover.querySelector('.lh-spell-report'), restoreHtml);
          if (markers[activePopoverIdx]) positionPopover(markers[activePopoverIdx].rect);
        });
        sendBtn?.addEventListener('click', () => {
          sendBtn.textContent = '…';
          sendBtn.disabled = true;
          if (cancelBtn) cancelBtn.disabled = true;
          const surrounding = activeEl ? (activeEl.value || activeEl.textContent || '').slice(
            Math.max(0, finding.start - 40), finding.end + 40
          ) : '';
          // Privacy: URL deliberately NOT sent. Rule + token + 80-char
          // context + language is enough to debug; URL adds privacy risk
          // for marginal debugging value.
          sendReport({
            type: 'spell',
            ruleId: finding.rule_id || finding.type,
            original: finding.original,
            suggestion: finding.fix || (finding.suggestions && finding.suggestions[0]) || '',
            context: surrounding,
            language: lang,
          }).then(ok => {
            sendBtn.textContent = ok ? '✓ Sendt — takk!' : '✗ Kunne ikke sendes';
            setTimeout(() => {
              dismissed.add(dismissKey(finding));
              pendingAdvanceIdx = activePopoverIdx;
              hidePopover();
              runCheck();
            }, 1200);
          });
        });
      });
    }
    attachReportHandler(popover.querySelector('.lh-spell-report'));
    overlay.appendChild(popover);
    positionPopover(markers[idx]?.rect);
  }

  function typeLabel(t) {
    switch (t) {
      case 'typo': return 'Skrivefeil';
      case 'homophone': return 'Forveksling';
      case 'context-typo': return 'Kontekst-feil';
      case 'gender': return 'Kjønn';
      case 'agreement': return 'Samsvarsfeil';
      case 'modal_form': return 'Verbform etter hjelpeverb';
      case 'sarskriving': return 'Særskriving';
      case 'de-capitalization': return 'Stor forbokstav';
      case 'de-grammar': return 'Tysk grammatikk';
      case 'en-grammar': return 'Engelsk grammatikk';
      case 'es-accent': return 'Aksent / spesialtegn';
      case 'es-coordination': return 'Sammenbinding';
      case 'es-grammar': return 'Spansk grammatikk';
      case 'fr-grammar': return 'Fransk grammatikk';
      case 'fr-contraction': return 'Kontraksjon';
      case 'fr-preposition': return 'Sammenslåing';
      default: return '';
    }
  }

  // Phase 05.1-05 inline UX gap-closure: resolve the human-readable label for
  // the active Norwegian standard (nb → "Bokmål", nn → "Nynorsk") and wrap it
  // in a small pill, so the popover always tells the student which register
  // the rule pipeline is running in. Uses __lexiSpellCore.getString so the
  // label reads out of the SAME locale it names (per-target-locale pattern,
  // matching nb-gender Gap C). Gracefully no-ops if i18n isn't loaded or lang
  // is anything other than nb/nn (shouldn't happen — runCheck() early-exits
  // for other locales — but belt-and-braces so we never render a raw key).
  function renderRegisterBadge(lang) {
    // Tells the student which language the spell-check pipeline is
    // running against (independent from the popup pill / dictionary
    // lang per Plan 43-04). Flag + short label for all six supported
    // languages — disambiguates findings when the popup is on one lang
    // and the chip is on another.
    const FLAGS = {
      nb: '🇳🇴',
      nn: '🇳🇴',
      en: '🇬🇧',
      de: '🇩🇪',
      es: '🇪🇸',
      fr: '🇫🇷',
    };
    const flag = FLAGS[lang];
    if (!flag) return '';
    let label;
    if (lang === 'nb' || lang === 'nn') {
      // Norwegian register names ("Bokmål" / "Nynorsk") read out of
      // the matching locale's strings block — same per-target-locale
      // pattern that's been in place since Phase 05.1.
      const key = 'register_label_' + lang;
      label = key;
      try {
        if (CORE && typeof CORE.getString === 'function') {
          label = CORE.getString(key, lang);
        }
      } catch (_) { /* fall through */ }
      if (!label || label === key) label = lang.toUpperCase();
    } else {
      label = lang.toUpperCase();
    }
    return `<span class="lh-spell-register-badge" data-register="${escapeAttr(lang)}">${flag} ${escapeHtml(label)}</span>`;
  }

  // Phase 5 / UX-01: look up the per-rule `explain` callable and return the
  // NB- or NN-register student-friendly sentence (already HTML-safe:
  // rule.explain() templates call escapeHtml on every interpolated token).
  // Graceful fallback chain (Pitfall 9): callable.lang → callable.nb → string
  // → typeLabel. Curated-typo (priority 40) vs fuzzy-typo (priority 50) share
  // rule_id 'typo' — route by (id, priority) to hit the correct callable
  // (Pitfall 1 disambiguation).
  function renderExplain(finding, lang) {
    const host = typeof self !== 'undefined' ? self : globalThis;
    const rules = host.__lexiSpellRules || [];
    let rule = rules.find(r =>
      r.id === finding.rule_id &&
      r.priority === finding.priority &&
      Array.isArray(r.languages) && r.languages.includes(lang)
    );
    if (!rule) {
      rule = rules.find(r =>
        r.id === finding.rule_id &&
        Array.isArray(r.languages) && r.languages.includes(lang)
      );
    }
    if (!rule) return escapeHtml(typeLabel(finding.type || finding.rule_id));

    let result;
    try {
      result = typeof rule.explain === 'function' ? rule.explain(finding) : rule.explain;
    } catch (e) {
      console.warn('[lexi-spell] rule.explain threw', rule.id, e);
      return escapeHtml(typeLabel(finding.type || finding.rule_id));
    }

    if (typeof result === 'string') return result;
    if (result && typeof result[lang] === 'string') return result[lang];
    if (result && typeof result.nb === 'string') return result.nb;
    return escapeHtml(typeLabel(finding.type || finding.rule_id));
  }

  // Phase 26: render the Lær mer pedagogy panel from the finding.pedagogy
  // block (DE preposition data sourced via plan 26-01). All text is
  // student-friendly, resolved per-uiLang with nb fallback. Network-silent —
  // every string is on the finding object.
  function renderPedagogyPanel(pedagogy, uiLang) {
    if (!pedagogy) return '';
    const pick = (obj) => {
      if (!obj) return '';
      return (typeof obj[uiLang] === 'string' && obj[uiLang]) ||
             (typeof obj.nb === 'string' && obj.nb) ||
             (typeof obj.en === 'string' && obj.en) || '';
    };
    const parts = [];

    // Case badge (only for morphological rules)
    if (pedagogy.case) {
      const caseKey = pedagogy.case;
      const badgeLabel = t('case_label_' + caseKey) || caseKey.toUpperCase();
      parts.push(`<div class="lh-spell-pedagogy-header">
        <span class="lh-spell-pedagogy-case-badge lh-spell-pedagogy-case-badge--${escapeAttr(caseKey)}">${escapeHtml(badgeLabel)}</span>`);

      // Optional contraction annotation
      if (pedagogy.contraction && pedagogy.contraction.from && pedagogy.contraction.article) {
        parts.push(`<span class="lh-spell-pedagogy-contraction">= ${escapeHtml(pedagogy.contraction.from)} + ${escapeHtml(pedagogy.contraction.article)}</span>`);
      }
      parts.push(`</div>`);
    }

    // Summary + explanation paragraphs + general note
    const summary = pick(pedagogy.summary);
    if (summary) parts.push(`<p class="lh-spell-pedagogy-summary">${sanitizeWarning(summary)}</p>`);
    const explanation = pick(pedagogy.explanation);
    if (explanation) parts.push(`<p class="lh-spell-pedagogy-explanation">${sanitizeWarning(explanation)}</p>`);
    const noteMain = pick(pedagogy.note);
    if (noteMain) parts.push(`<p class="lh-spell-pedagogy-explanation">${sanitizeWarning(noteMain)}</p>`);

    // Visual aid (Phase 39 SVG support)
    if (pedagogy.visual && pedagogy.visual.svg) {
      const caption = pick(pedagogy.visual.caption);
      parts.push(`<div class="lh-spell-pedagogy-visual">
        <div class="lh-spell-pedagogy-svg-wrapper">${sanitizeWarning(pedagogy.visual.svg)}</div>
        ${caption ? `<div class="lh-spell-pedagogy-visual-caption">${escapeHtml(caption)}</div>` : ''}
      </div>`);
    }

    // Examples (correct ✓ + incorrect ✗)
    const examples = Array.isArray(pedagogy.examples) ? pedagogy.examples : [];
    for (const ex of examples) {
      if (!ex) continue;
      const xlate = pick(ex.translation);
      const note = pick(ex.note);
      parts.push(`<div class="lh-spell-pedagogy-example">`);
      if (ex.correct) {
        parts.push(`<div class="lh-spell-pedagogy-example-correct">✓ <strong>${escapeHtml(ex.correct)}</strong></div>`);
      }
      if (ex.incorrect) {
        parts.push(`<div class="lh-spell-pedagogy-example-incorrect">✗ ${escapeHtml(ex.incorrect)}</div>`);
      }
      if (xlate) {
        parts.push(`<div class="lh-spell-pedagogy-example-translation">${escapeHtml(xlate)}</div>`);
      }
      if (note) {
        parts.push(`<div class="lh-spell-pedagogy-example-note"><em>${escapeHtml(note)}</em></div>`);
      }
      parts.push(`</div>`);
    }

    // Extra pro-tips
    const extra = pick(pedagogy.extra);
    if (extra) {
      parts.push(`<div class="lh-spell-pedagogy-extra">${sanitizeWarning(extra)}</div>`);
    }

    // Wechselpräposition motion vs location pair
    if (pedagogy.case === 'wechsel' && pedagogy.wechsel_pair) {
      const wp = pedagogy.wechsel_pair;
      const renderSide = (side, cls, labelKey, glyph) => {
        if (!side) return '';
        const t1 = pick(side.translation);
        const n1 = pick(side.note);
        const out = [];
        out.push(`<div class="${cls}">`);
        out.push(`<div class="lh-spell-pedagogy-wechsel-label">${glyph} ${escapeHtml(t(labelKey))}</div>`);
        if (side.sentence) out.push(`<div class="lh-spell-pedagogy-wechsel-sentence">${escapeHtml(side.sentence)}</div>`);
        if (t1) out.push(`<div class="lh-spell-pedagogy-example-translation">${escapeHtml(t1)}</div>`);
        if (n1) out.push(`<div class="lh-spell-pedagogy-example-note"><em>${escapeHtml(n1)}</em></div>`);
        out.push(`</div>`);
        return out.join('');
      };
      parts.push(`<div class="lh-spell-pedagogy-wechsel">`);
      parts.push(renderSide(wp.motion,   'lh-spell-pedagogy-wechsel-motion',   'wechsel_motion_label',   '→'));
      parts.push(renderSide(wp.location, 'lh-spell-pedagogy-wechsel-location', 'wechsel_location_label', '●'));
      parts.push(`</div>`);
    }

    // Colloquial note (friendly aside, never warning-flavoured)
    const colloq = pick(pedagogy.colloquial_note);
    if (colloq) {
      parts.push(`<aside class="lh-spell-pedagogy-colloquial">${escapeHtml(t('colloquial_aside_prefix'))}<em>${escapeHtml(colloq)}</em></aside>`);
    }

    return parts.join('');
  }

  function positionPopover(rect) {
    if (!popover || !rect) return;
    // Size must be known — force layout.
    const pw = popover.offsetWidth || 240;
    const ph = popover.offsetHeight || 80;
    const margin = 6;
    let top = rect.top - ph - margin;
    if (top < margin) top = rect.bottom + margin + 4; // drop below word if no room above
    let left = rect.left;
    if (left + pw > window.innerWidth - margin) left = window.innerWidth - pw - margin;
    if (left < margin) left = margin;
    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }

  function hidePopover() {
    if (popover) popover.remove();
    popover = null;
    activePopoverIdx = -1;
    // Phase 35 (F6): default reset so the next OPEN-FRESH starts collapsed.
    // showPopover() saves/restores this around its internal hidePopover() call
    // so Tab navigation between markers preserves the user's choice.
    pedagogyPanelExpanded = false;
  }

  // ── Manual spell-check button + toast (Phase 18, Plan 02) ──

  let btnFixedPos = null; // {x, y} when user drags; null = auto-position

  // Languages the spell-check pipeline supports.
  // nb/nn/en are bundled (always available); de/es/fr require download
  // via the popup language picker before they can be selected here.
  const SUPPORTED_LANGS = [
    { code: 'nb', label: 'Bokmål' },
    { code: 'nn', label: 'Nynorsk' },
    { code: 'en', label: 'English' },
    { code: 'de', label: 'Deutsch' },
    { code: 'es', label: 'Español' },
    { code: 'fr', label: 'Français' },
  ];
  const BUNDLED_LANGS_SET = new Set(['nb', 'nn', 'en']);

  async function getActivatedLangs() {
    const set = new Set(BUNDLED_LANGS_SET);
    try {
      if (window.__lexiVocabStore && typeof window.__lexiVocabStore.listCachedLanguages === 'function') {
        const cached = await window.__lexiVocabStore.listCachedLanguages();
        for (const c of (cached || [])) {
          if (c && c.language) set.add(c.language);
        }
      }
    } catch (_) { /* fall through to bundled-only */ }
    const FL = new Set(['de', 'es', 'fr']);
    const cur = currentLangCode();
    if (cur) set.add(cur);
    // Add the student's chosen FL ONLY if spell-check isn't already on an
    // FL. The chip's BYTT SPRÅK row should carry at most one FL pill:
    // either the spell-check's active FL (when on de/es/fr) or the
    // student's chosen FL (when spell-check is on nb/nn/en). Adding both
    // produced the "ES FR" double-FL submenu the user reported as weird.
    if (!FL.has(cur)) {
      try {
        const stored = await new Promise(r => chrome.storage.local.get('studentForeignLang', r));
        const sfl = stored?.studentForeignLang;
        if (FL.has(sfl)) set.add(sfl);
      } catch (_) {}
    }
    return set;
  }

  let langFlyout = null;
  let langBadgeEl = null;
  let longPressTimer = null;
  let pausedTickInterval = null;

  // Foreign languages — consolidated into a single pill in the chip menu,
  // mirroring the popup row's FL consolidation. Right-click / long-press
  // on the active FL pill opens a submenu over the remaining FL choices.
  const FL_LANGS_SET = new Set(['de', 'es', 'fr']);

  function currentLangCode() {
    // Plan 43-04: spell-check has its own per-surface language (`lang.spellcheck`).
    // Prefer the surface-local value; fall back to vocab-seam's currentLang
    // (which now drives off `lang.dictionary`) when the surface key isn't yet
    // hydrated.
    if (spellLang) return spellLang;
    try { return (VOCAB && VOCAB.getLanguage && VOCAB.getLanguage()) || ''; } catch (_) { return ''; }
  }

  function formatRemaining(untilMs) {
    const ms = Math.max(0, Number(untilMs) - Date.now());
    if (ms === 0) return '0m';
    const totalMin = Math.ceil(ms / 60000);
    if (totalMin < 60) return `${totalMin}m`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m > 0 ? `${h}t ${m}m` : `${h}t`;
  }

  function refreshLangBadge() {
    if (!langBadgeEl) return;
    const pauseApi = self.__lexiPause;
    const entry = pauseApi ? pauseApi.getPauseFor() : null;
    if (entry) {
      langBadgeEl.textContent = '⏸ ' + formatRemaining(entry.until);
    } else {
      langBadgeEl.textContent = (currentLangCode() || '').toUpperCase();
    }
  }

  function refreshChipPauseState() {
    if (!spellCheckBtn) return;
    const pauseApi = self.__lexiPause;
    const isPaused = !!(pauseApi && pauseApi.isPausedNow());
    spellCheckBtn.classList.toggle('is-paused', isPaused);
    refreshLangBadge();
    // While paused, refresh the countdown badge once per minute. When
    // unpaused, clear the ticker so the chip doesn't repaint pointlessly.
    if (isPaused && !pausedTickInterval) {
      pausedTickInterval = setInterval(refreshLangBadge, 60 * 1000);
    } else if (!isPaused && pausedTickInterval) {
      clearInterval(pausedTickInterval);
      pausedTickInterval = null;
    }
  }

  // Subscribe to pause-storage changes (covers cross-tab pause/resume) and
  // initial hydration callbacks. The chip is built lazily; refreshing
  // before ensureButton() is fine — the function no-ops on null btn.
  try {
    if (self.__lexiPause && typeof self.__lexiPause.onChange === 'function') {
      self.__lexiPause.onChange(refreshChipPauseState);
    }
  } catch (_) {}

  async function switchSpellLanguage(lang) {
    if (!lang || lang === currentLangCode()) { hideLangFlyout(); return; }
    // Plan 43-04: spell-check now has its own per-surface key. Writing
    // `lang.spellcheck` updates only this surface; lang.dictionary /
    // lang.prediction / lang.widget remain whatever the user set them to.
    spellLang = lang;
    try {
      await new Promise(resolve => chrome.storage.local.set({ 'lang.spellcheck': lang }, resolve));
    } catch (_) {}
    refreshLangBadge();
    hideLangFlyout();
    // Re-run check against the freshly switched language.
    if (activeEl) {
      lastCheckedText = ''; // force re-check
      manualCheck();
    }
  }

  async function showChipMenu() {
    hideLangFlyout();
    if (!spellCheckBtn) return;

    const pauseApi = self.__lexiPause;
    const pauseEntry = pauseApi ? pauseApi.getPauseFor() : null;
    const isPaused = !!pauseEntry;
    const cur = currentLangCode();

    // Mirror the popup pill row exactly: NB / NN / EN + ONE consolidated
    // FL pill with chevron + dropdown over all three FLs (DE / ES / FR).
    // All 6 languages are bundled, so we don't filter by activation —
    // every language is pickable from the chip. Active FL = current
    // spell-check lang if it's an FL, else the student's chosen FL,
    // else 'de' as a last-resort default.
    const consolidatedFLChoices = ['de', 'es', 'fr'];
    let activeFL = FL_LANGS_SET.has(cur) ? cur : null;
    if (!activeFL) {
      try {
        const stored = await new Promise(r => chrome.storage.local.get('studentForeignLang', r));
        const sfl = stored?.studentForeignLang;
        if (FL_LANGS_SET.has(sfl)) activeFL = sfl;
      } catch (_) {}
    }
    if (!activeFL) activeFL = 'de';

    const visible = [
      ...SUPPORTED_LANGS.filter(l => l.code === 'nb' || l.code === 'nn' || l.code === 'en'),
      SUPPORTED_LANGS.find(l => l.code === activeFL),
    ].filter(Boolean);

    langFlyout = document.createElement('div');
    langFlyout.className = 'lh-spell-chip-menu';

    // ── Section: Bytt språk (hidden while paused so the menu is focused
    //    on resuming, matching the prompt's pause-active intent). ──
    if (!isPaused) {
      const langSection = document.createElement('section');
      langSection.className = 'lh-chip-menu-section';
      const langTitle = document.createElement('div');
      langTitle.className = 'lh-chip-menu-title';
      langTitle.textContent = 'Bytt språk';
      langSection.appendChild(langTitle);
      const langRow = document.createElement('div');
      langRow.className = 'lh-chip-menu-langrow';
      for (const { code, label } of visible) {
        const isFL = FL_LANGS_SET.has(code);
        const showChevron = isFL && consolidatedFLChoices && consolidatedFLChoices.length > 1;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'lh-spell-lang-item' + (code === cur ? ' is-active' : '') + (isFL ? ' is-fl' : '');
        item.dataset.lang = code;
        if (showChevron) item.title = 'Høyreklikk for å bytte fremmedspråk';
        item.innerHTML = `<span class="lh-spell-lang-code">${code.toUpperCase()}</span><span class="lh-spell-lang-label">${label}</span>`;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          // Tap on the active FL pill opens the FL submenu (touch fallback).
          if (showChevron && code === cur) { openFLSubmenu(item, consolidatedFLChoices); return; }
          switchSpellLanguage(code);
        });
        if (showChevron) {
          item.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openFLSubmenu(item, consolidatedFLChoices);
          });
        }
        langRow.appendChild(item);
      }
      langSection.appendChild(langRow);
      langFlyout.appendChild(langSection);
    }

    // ── Section: Pause på dette nettstedet (suppressed in exam mode —
    //    lockdown has its own UI for disabling spellcheck). ──
    if (!examMode) {
      const pauseSection = document.createElement('section');
      pauseSection.className = 'lh-chip-menu-section';
      const pTitle = document.createElement('div');
      pTitle.className = 'lh-chip-menu-title';
      pTitle.textContent = isPaused ? 'Pause aktiv' : 'Pause på dette nettstedet';
      pauseSection.appendChild(pTitle);
      if (isPaused) {
        const status = document.createElement('div');
        status.className = 'lh-chip-menu-paused-status';
        status.textContent = `Tilbake om ${formatRemaining(pauseEntry.until)}`;
        pauseSection.appendChild(status);
        const resumeBtn = document.createElement('button');
        resumeBtn.type = 'button';
        resumeBtn.className = 'lh-chip-menu-resume';
        resumeBtn.textContent = 'Fortsett nå';
        resumeBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          if (pauseApi) await pauseApi.resume();
          hideLangFlyout();
          refreshChipPauseState();
          if (activeEl) { lastCheckedText = ''; manualCheck(); }
        });
        pauseSection.appendChild(resumeBtn);
      } else {
        const row = document.createElement('div');
        row.className = 'lh-chip-menu-pauserow';
        for (const hours of [1, 4, 24]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'lh-chip-menu-pause-btn';
          b.textContent = `${hours} t`;
          b.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (pauseApi) await pauseApi.pause(hours);
            hideLangFlyout();
            hideOverlay();
            refreshChipPauseState();
          });
          row.appendChild(b);
        }
        pauseSection.appendChild(row);
      }
      langFlyout.appendChild(pauseSection);
    }

    // ── Section: Innstillinger (always shown — service worker bridges
    //    to chrome.action.openPopup; falls back to opening the popup
    //    page in a new tab on browsers that block programmatic open). ──
    const settingsSection = document.createElement('section');
    settingsSection.className = 'lh-chip-menu-section';
    const settingsBtn = document.createElement('button');
    settingsBtn.type = 'button';
    settingsBtn.className = 'lh-chip-menu-settings-link';
    settingsBtn.textContent = 'Åpne innstillinger';
    settingsBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      try { chrome.runtime.sendMessage({ type: 'open-settings' }); } catch (_) {}
      hideLangFlyout();
    });
    settingsSection.appendChild(settingsBtn);
    langFlyout.appendChild(settingsSection);

    (document.fullscreenElement || document.body).appendChild(langFlyout);
    // Position above-or-below the Aa button, mirroring popover logic.
    const br = spellCheckBtn.getBoundingClientRect();
    const fw = langFlyout.offsetWidth || 220;
    const fh = langFlyout.offsetHeight || 240;
    let top = br.top - fh - 6;
    if (top < 6) top = br.bottom + 6;
    let left = br.left;
    if (left + fw > window.innerWidth - 6) left = window.innerWidth - fw - 6;
    if (left < 6) left = 6;
    langFlyout.style.top = top + 'px';
    langFlyout.style.left = left + 'px';

    // Persistent outside-click handler. Removed only when langFlyout is
    // actually torn down (hideLangFlyout). The handler ALSO honours an
    // open FL submenu — if the user mousedowns inside the submenu (which
    // is rendered to document.body, not into langFlyout), we must NOT
    // close the chip menu beneath it. {once: true} produced a flaky
    // fallout where the listener fired on the FL-pill mousedown that
    // opened the submenu and then was gone, leaving subsequent mousedowns
    // unhandled — but in practice the chip menu still vanished, likely
    // because a downstream handler tore it down. Using a persistent
    // listener with explicit submenu-aware targeting is robust.
    const onDocClick = (ev) => {
      if (!langFlyout) {
        document.removeEventListener('mousedown', onDocClick, true);
        return;
      }
      if (langFlyout.contains(ev.target)) return;
      if (flSubmenuEl && flSubmenuEl.contains(ev.target)) return;
      if (ev.target === spellCheckBtn || (spellCheckBtn && spellCheckBtn.contains(ev.target))) return;
      hideLangFlyout();
    };
    chipMenuDocListener = onDocClick;
    setTimeout(() => document.addEventListener('mousedown', onDocClick, true), 0);
  }

  let flSubmenuEl = null;
  let chipMenuDocListener = null;

  // Spell-check side-car indexes — built when lang.spellcheck differs from
  // the shared VOCAB seam's hydration (lang.dictionary). The seam is a
  // singleton tied to one bundle at a time, so to honour Plan 43-04's
  // per-surface independence we load + index the spell-check lang here.
  // Cached by lang to avoid rebuilding on every keystroke.
  const spellCheckSidecarCache = new Map();
  async function loadSpellCheckSidecar(lang) {
    if (spellCheckSidecarCache.has(lang)) return spellCheckSidecarCache.get(lang);
    const core = self.__lexiVocabCore;
    if (!core || typeof core.buildIndexes !== 'function') return null;
    try {
      // SC-06: fetch + chrome.runtime.getURL kept on the same line so the
      // network-silence whitelist (line-based) exempts it as a bundled-
      // asset access, not a network call.
      const res = await fetch(chrome.runtime.getURL(`data/${lang}.json`));
      if (!res.ok) return null;
      const raw = await res.json();
      // Sister bundle for nb↔nn cross-dialect; skip for FL languages.
      let sisterRaw = null;
      if (lang === 'nb' || lang === 'nn') {
        try {
          const sister = lang === 'nb' ? 'nn' : 'nb';
          const sRes = await fetch(chrome.runtime.getURL(`data/${sister}.json`));
          if (sRes.ok) sisterRaw = await sRes.json();
        } catch (_) {}
      }
      const indexes = core.buildIndexes({
        raw, sisterRaw, bigrams: null, freq: null,
        lang, isFeatureEnabled: () => true,
      });
      spellCheckSidecarCache.set(lang, indexes);
      return indexes;
    } catch (e) {
      console.warn('[lexi-spell] side-car load failed for', lang, e?.message);
      return null;
    }
  }

  function closeFLSubmenu() {
    if (flSubmenuEl) { flSubmenuEl.remove(); flSubmenuEl = null; }
  }

  function openFLSubmenu(anchor, flChoices) {
    if (!Array.isArray(flChoices) || flChoices.length === 0) return;
    closeFLSubmenu();
    const sub = document.createElement('div');
    sub.className = 'lh-spell-fl-submenu';
    const cur = currentLangCode();
    for (const code of flChoices) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lh-spell-fl-submenu-item' + (code === cur ? ' is-active' : '');
      b.innerHTML = `<span class="lh-spell-lang-code">${code.toUpperCase()}</span>`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        switchSpellLanguage(code);
        closeFLSubmenu();
      });
      sub.appendChild(b);
    }
    (document.fullscreenElement || document.body).appendChild(sub);
    flSubmenuEl = sub;
    const ar = anchor.getBoundingClientRect();
    sub.style.top = (ar.bottom + 4) + 'px';
    sub.style.left = ar.left + 'px';
    // Submenu's own outside-click listener — closes the submenu only,
    // not the parent chip menu. The chip menu's persistent listener
    // (above) checks for flSubmenuEl and treats clicks there as
    // chip-menu-internal too.
    const onSubDoc = (ev) => {
      if (!flSubmenuEl) {
        document.removeEventListener('mousedown', onSubDoc, true);
        return;
      }
      if (flSubmenuEl.contains(ev.target)) return;
      if (ev.target === anchor || anchor.contains(ev.target)) return;
      closeFLSubmenu();
      document.removeEventListener('mousedown', onSubDoc, true);
    };
    setTimeout(() => document.addEventListener('mousedown', onSubDoc, true), 0);
  }

  // Backwards-compat alias — older code paths (and the old name) still call
  // showLangFlyout. Keep both names referring to the same impl so nothing
  // silently regresses.
  const showLangFlyout = showChipMenu;

  function hideLangFlyout() {
    if (langFlyout) { langFlyout.remove(); langFlyout = null; }
  }

  function ensureButton() {
    if (spellCheckBtn) return;
    spellCheckBtn = document.createElement('button');
    spellCheckBtn.type = 'button';
    spellCheckBtn.className = 'lh-spell-check-btn';
    spellCheckBtn.title = t('spell_check_btn_title');

    const aa = document.createElement('span');
    aa.className = 'lh-spell-check-btn-aa';
    aa.textContent = 'Aa';
    langBadgeEl = document.createElement('span');
    langBadgeEl.className = 'lh-spell-check-btn-lang';
    langBadgeEl.setAttribute('aria-label', 'Bytt språk');
    spellCheckBtn.appendChild(aa);
    spellCheckBtn.appendChild(langBadgeEl);
    refreshLangBadge();
    refreshChipPauseState();

    let dragState = null;
    spellCheckBtn.addEventListener('pointerdown', e => {
      e.preventDefault();
      dragState = { startX: e.clientX, startY: e.clientY, moved: false, button: e.button };
      spellCheckBtn.setPointerCapture(e.pointerId);
      // Touch / pen long-press → language flyout.
      if (e.pointerType === 'touch' || e.pointerType === 'pen') {
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (dragState && !dragState.moved) {
            dragState.longPressed = true;
            showLangFlyout();
          }
        }, 500);
      }
    });
    spellCheckBtn.addEventListener('pointermove', e => {
      if (!dragState) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;
      if (!dragState.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      dragState.moved = true;
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      const x = clampX(e.clientX - 20);
      const y = clampY(e.clientY - 14);
      spellCheckBtn.style.left = x + 'px';
      spellCheckBtn.style.top = y + 'px';
      btnFixedPos = { x, y };
    });
    // Click semantics on the green Aa button:
    //   single left-click  → open language picker (showLangFlyout)
    //   double left-click  → run a manual spell-check pass (manualCheck)
    //   touch long-press   → open language picker (existing pointerdown branch)
    //   right-click        → kept as a fallback for muscle memory
    //
    // Single-click is the primary student affordance because picking the
    // working language is the action they take 10x more often than forcing
    // a re-check. The single-click action is delayed 280ms so a double-click
    // can pre-empt it. Adjust DBLCLICK_GAP_MS if the delay feels sluggish.
    const DBLCLICK_GAP_MS = 280;
    let pendingClickTimer = null;
    spellCheckBtn.addEventListener('pointerup', e => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      const wasDrag = dragState && dragState.moved;
      const wasLongPress = dragState && dragState.longPressed;
      dragState = null;
      if (wasDrag || wasLongPress) return;
      if (pendingClickTimer) {
        // Second click within the gap → treat as double-click.
        clearTimeout(pendingClickTimer);
        pendingClickTimer = null;
        manualCheck();
        return;
      }
      pendingClickTimer = setTimeout(async () => {
        pendingClickTimer = null;
        // While paused, a single click on the chip resumes immediately —
        // matches the prompt's "Click chip → Resume now" affordance and
        // means students don't have to navigate the menu to undo a pause.
        const pauseApi = self.__lexiPause;
        if (pauseApi && pauseApi.isPausedNow()) {
          await pauseApi.resume();
          refreshChipPauseState();
          if (activeEl) { lastCheckedText = ''; manualCheck(); }
          return;
        }
        showChipMenu();
      }, DBLCLICK_GAP_MS);
    });
    spellCheckBtn.addEventListener('contextmenu', e => {
      e.preventDefault();
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      if (pendingClickTimer) { clearTimeout(pendingClickTimer); pendingClickTimer = null; }
      if (dragState) dragState.longPressed = true;
      
      enabled = false;
      chrome.storage.local.set({ spellCheckEnabled: false });
      hideOverlay();
      hideButton();
      showToast(t('toast_spellcheck_disabled'));
    });

    (document.fullscreenElement || document.body).appendChild(spellCheckBtn);
  }

  function clampX(x) { return Math.max(4, Math.min(x, window.innerWidth - 44)); }
  function clampY(y) { return Math.max(4, Math.min(y, window.innerHeight - 32)); }

  function positionButton() {
    if (!activeEl || !spellCheckBtn) return;
    const rect = activeEl.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      spellCheckBtn.style.display = 'none';
      return;
    }
    spellCheckBtn.style.display = '';
    if (btnFixedPos) {
      spellCheckBtn.style.left = clampX(btnFixedPos.x) + 'px';
      spellCheckBtn.style.top = clampY(btnFixedPos.y) + 'px';
    } else {
      spellCheckBtn.style.left = clampX(rect.right - 42) + 'px';
      spellCheckBtn.style.top = clampY(rect.bottom - 32) + 'px';
    }
  }

  const MIN_TEXT_LENGTH_FOR_BUTTON = 20;

  function updateButtonVisibility() {
    if (!activeEl) return;
    if (!enabled) { hideButton(); return; }
    // Downstream consumers (lockdown webapp, future skriveokt-zero) set
    // host.__lexiSpellBtnAlwaysVisible = true so the green Aa appears as
    // soon as the editor is focused — useful when the editor is the page's
    // primary surface and the button is the student's only language picker.
    // The extension keeps the 20-char gate so the button doesn't clutter
    // every textarea on every page on the web.
    const host = typeof self !== 'undefined' ? self : globalThis;
    if (host.__lexiSpellBtnAlwaysVisible) {
      ensureButton();
      positionButton();
      return;
    }
    const { text } = readInput(activeEl);
    if (text.length >= MIN_TEXT_LENGTH_FOR_BUTTON) {
      ensureButton();
      positionButton();
    } else {
      hideButton();
    }
  }

  function hideButton() {
    if (spellCheckBtn) {
      spellCheckBtn.remove();
      spellCheckBtn = null;
      langBadgeEl = null;
    }
    hideLangFlyout();
  }

  // ── Plan 43-04: passive auto-detect hint banner ──────────────────
  // Surfaces a small "Det ser ut som du skriver tysk — bytt til DE?" banner
  // near the active input when __lexiDetectLanguage returns a high-confidence
  // language different from the user's stored `lang.spellcheck`. Never
  // auto-switches. Dismissed via the Avvis button or by switching surfaces;
  // re-armed once the user picks a different language or clears the input.
  let langHintEl = null;
  let langHintLastDetected = null;   // cached lang code we last suggested
  let langHintDismissed = new Set(); // suggested codes the user said no to (per session)

  function hideLangHint() {
    if (langHintEl) {
      langHintEl.remove();
      langHintEl = null;
    }
  }
  // Hide-on-empty alias. Public-style name for runCheck's bail path.
  function maybeHideLangHint() {
    hideLangHint();
    langHintLastDetected = null;
  }

  function langDisplayName(code) {
    return t('lang_hint_name_' + code) || code.toUpperCase();
  }

  function maybeShowLangHint(text) {
    if (!activeEl) { hideLangHint(); return; }
    if (!text || text.length < 8) { hideLangHint(); return; }
    const detect = self.__lexiDetectLanguage;
    if (typeof detect !== 'function') return;
    let result = null;
    try { result = detect(text); } catch (_) { return; }
    if (!result || result.confidence !== 'high') { hideLangHint(); return; }
    const detected = result.lang;
    const stored = currentLangCode();
    if (!detected || detected === stored) { hideLangHint(); return; }
    if (langHintDismissed.has(detected)) { hideLangHint(); return; }
    // Already showing the same suggestion — leave it alone (avoid flicker).
    if (langHintEl && langHintLastDetected === detected) return;

    langHintLastDetected = detected;
    renderLangHint(detected);
  }

  function renderLangHint(detected) {
    hideLangHint();
    if (!activeEl) return;
    const banner = document.createElement('div');
    banner.className = 'lh-lang-hint';
    banner.setAttribute('role', 'status');
    const msg = document.createElement('span');
    msg.className = 'lh-lang-hint-msg';
    msg.textContent = t('lang_hint_message', {
      language: langDisplayName(detected),
      code: detected.toUpperCase(),
    });
    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'lh-lang-hint-accept';
    accept.textContent = t('lang_hint_accept');
    accept.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Persist: writes to lang.spellcheck. The chrome.storage.onChanged
      // listener picks it up and refreshes the badge + re-checks.
      try { chrome.storage.local.set({ 'lang.spellcheck': detected }); } catch (_) {}
      spellLang = detected;
      hideLangHint();
      if (activeEl) { lastCheckedText = ''; runCheck(); }
    });
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'lh-lang-hint-dismiss';
    dismiss.textContent = t('lang_hint_dismiss');
    dismiss.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      langHintDismissed.add(detected);
      hideLangHint();
    });
    banner.appendChild(msg);
    banner.appendChild(accept);
    banner.appendChild(dismiss);
    // Attach to fullscreenElement when active — lockdown runs in
    // fullscreen, and document.body appends render outside the visible
    // layer there. Same pattern as the floating widget at init time.
    (document.fullscreenElement || document.body).appendChild(banner);
    positionLangHint(banner);
    langHintEl = banner;
  }

  function positionLangHint(banner) {
    if (!activeEl) return;
    const r = activeEl.getBoundingClientRect();
    banner.style.position = 'fixed';
    banner.style.left = Math.max(8, r.left) + 'px';
    banner.style.top = Math.max(8, r.top - 36) + 'px';
    banner.style.zIndex = '2147483646';
  }

  // Plan 43-04: Per-surface language lives in `lang.spellcheck`. Subscribe
  // here so external writers (popup, lockdown's spellcheck pill, hint banner
  // accept) keep the badge + cached spellLang in sync. We also still watch
  // `lang.dictionary` for the badge fallback path (when spellLang is empty).
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if ('lang.spellcheck' in changes) {
        spellLang = changes['lang.spellcheck'].newValue || '';
        refreshLangBadge();
        if (activeEl) { lastCheckedText = ''; manualCheck(); }
      }
      if ('lang.dictionary' in changes) refreshLangBadge();
    });
  } catch (_) { /* no-op outside extension context */ }

  function manualCheck() {
    if (!activeEl) return;
    const { text } = readInput(activeEl);
    const needsRecheck = text !== lastCheckedText || (lastFindings.length > 0 && markers.length === 0);
    if (needsRecheck) runCheck();

    if (lastFindings.length > 0 && markers.length > 0) {
      showPopover(0, lastFindings[0]);
      scrollMarkerIntoView(0);
    } else {
      showToast(lastFindings.length > 0
        ? t('spell_toast_errors', { count: lastFindings.length })
        : t('spell_toast_clean'));
    }
  }

  function scrollMarkerIntoView(idx) {
    if (markers[idx] && markers[idx].el) {
      markers[idx].el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  function navigateToNextMarker() {
    if (!lastFindings.length || !markers.length) return;
    const next = (activePopoverIdx + 1) % lastFindings.length;
    showPopover(next, lastFindings[next]);
    scrollMarkerIntoView(next);
  }

  function navigateToPrevMarker() {
    if (!lastFindings.length || !markers.length) return;
    const prev = (activePopoverIdx - 1 + lastFindings.length) % lastFindings.length;
    showPopover(prev, lastFindings[prev]);
    scrollMarkerIntoView(prev);
  }

  function showToast(message) {
    // Remove any existing toast
    const old = document.querySelector('.lh-spell-toast');
    if (old) old.remove();
    const toast = document.createElement('div');
    toast.className = 'lh-spell-toast';
    toast.textContent = message;
    (document.fullscreenElement || document.body).appendChild(toast);
    // Position above the button
    if (spellCheckBtn) {
      const br = spellCheckBtn.getBoundingClientRect();
      toast.style.top = (br.top + window.scrollY - 36) + 'px';
      toast.style.left = (br.left + window.scrollX - 20) + 'px';
    }
    setTimeout(() => toast.remove(), 2500);
  }

  // ── Apply fix ──

  function applyFix(finding) {
    if (!activeEl || !finding) return;
    if (activeEl.isContentEditable) {
      applyFixCE(finding);
    } else {
      applyFixTextarea(finding);
    }
    pendingAdvanceIdx = activePopoverIdx;
    hidePopover();
    // Short delay for DOM to settle, then re-check and auto-advance
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      runCheck();
    }, 150);
  }

  function applyFixTextarea(finding) {
    const value = activeEl.value || '';
    const before = value.slice(0, finding.start);
    const after = value.slice(finding.end);
    activeEl.value = before + finding.fix + after;
    const cursor = before.length + finding.fix.length;
    try { activeEl.setSelectionRange(cursor, cursor); } catch (_) { /* noop */ }
    activeEl.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function applyFixCE(finding) {
    // Route through the editor's input pipeline so frameworks (TipTap,
    // Lexical, etc.) don't overwrite the DOM mutation on their next render.
    const range = rangeForOffsets(activeEl, finding.start, finding.end);
    if (!range) return;
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    // beforeinput first for modern editors; execCommand fallback for older ones
    let ok = false;
    try {
      const ev = new InputEvent('beforeinput', {
        bubbles: true, cancelable: true,
        inputType: 'insertReplacementText',
        data: finding.fix,
      });
      const dispatched = activeEl.dispatchEvent(ev);
      if (dispatched && !ev.defaultPrevented) {
        ok = document.execCommand && document.execCommand('insertText', false, finding.fix);
      } else {
        // Editor handled it — we're done
        ok = true;
      }
    } catch (_) { ok = false; }
    if (!ok) {
      // Last-ditch: replace the text node content directly. Works in plain
      // contenteditable but may be reverted by some frameworks.
      try {
        range.deleteContents();
        range.insertNode(document.createTextNode(finding.fix));
      } catch (_) { /* noop */ }
    }
    sel.removeAllRanges();
  }

  // ── Range / position helpers ──

  function positionForRange(el, start, end) {
    if (el.isContentEditable) return rectFromCE(el, start, end);
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return rectFromTextarea(el, start, end);
    return null;
  }

  function rangeForOffsets(el, start, end) {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let startNode = null, startOff = 0, endNode = null, endOff = 0;
    let n;
    while ((n = walker.nextNode())) {
      const len = n.textContent.length;
      const nextOff = offset + len;
      // Use strict > for start: when the start offset lands exactly on a text-node
      // boundary (e.g., between two paragraphs), the character at `start` belongs
      // to the NEXT node, not this one. Using >= here would anchor the range to
      // the very end of the previous node and the Range would span whitespace
      // instead of the target word.
      if (startNode === null && nextOff > start) {
        startNode = n;
        startOff = start - offset;
      }
      if (endNode === null && nextOff >= end) {
        endNode = n;
        endOff = end - offset;
        break;
      }
      offset = nextOff;
    }
    if (!startNode || !endNode) return null;
    try {
      const r = document.createRange();
      r.setStart(startNode, Math.max(0, Math.min(startOff, startNode.textContent.length)));
      r.setEnd(endNode, Math.max(0, Math.min(endOff, endNode.textContent.length)));
      return r;
    } catch (_) { return null; }
  }

  function rectFromCE(el, start, end) {
    const r = rangeForOffsets(el, start, end);
    if (!r) return null;
    const rect = r.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return null;
    return {
      top: rect.top, left: rect.left,
      width: rect.width, height: rect.height,
      bottom: rect.top + rect.height, right: rect.left + rect.width,
    };
  }

  // Mirror-div technique for textarea. Build a hidden clone of the textarea
  // with the same layout, insert a marker span at the target offsets, read
  // its rect. Adjust for the textarea's scroll position.
  function rectFromTextarea(el, start, end) {
    const cs = window.getComputedStyle(el);
    const eRect = el.getBoundingClientRect();
    const mirror = document.createElement('div');
    const copyProps = [
      'boxSizing', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle',
      'letterSpacing', 'textTransform', 'wordSpacing', 'lineHeight',
      'tabSize', 'overflowWrap', 'wordBreak',
      'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
      'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
      'borderTopStyle', 'borderRightStyle', 'borderBottomStyle', 'borderLeftStyle',
    ];
    for (const p of copyProps) mirror.style[p] = cs[p];
    mirror.style.position = 'fixed';
    mirror.style.visibility = 'hidden';
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.top = `${eRect.top}px`;
    mirror.style.left = `${eRect.left}px`;
    mirror.style.width = `${el.clientWidth + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth)}px`;
    mirror.style.height = 'auto';

    const value = el.value || '';
    const before = document.createTextNode(value.slice(0, start));
    const marker = document.createElement('span');
    marker.textContent = value.slice(start, end) || '\u200b';
    const after = document.createTextNode(value.slice(end));
    mirror.appendChild(before);
    mirror.appendChild(marker);
    mirror.appendChild(after);
    (document.fullscreenElement || document.body).appendChild(mirror);
    const mRect = marker.getBoundingClientRect();
    mirror.remove();

    const top = mRect.top - el.scrollTop;
    const left = mRect.left - el.scrollLeft;
    return {
      top, left,
      width: mRect.width, height: mRect.height,
      bottom: top + mRect.height, right: left + mRect.width,
    };
  }

  async function sendReport(data) {
    try {
      return await new Promise(resolve => {
        chrome.runtime.sendMessage({ type: 'SEND_REPORT', data }, ok => {
          resolve(ok ?? false);
        });
      });
    } catch (_) { return false; }
  }

  function escapeHtml(s) {
    const d = document.createElement('span');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  }

  // Sanitize pedagogical warning HTML — allow em, strong, and SVG tags for visual aids.
  function sanitizeWarning(html) {
    return escapeHtml(html)
      .replace(/&lt;(\/?)(em|strong)&gt;/gi, '<$1$2>')
      .replace(/&lt;svg(.*?)&gt;/gi, '<svg$1>')
      .replace(/&lt;\/svg&gt;/gi, '</svg>')
      .replace(/&lt;g(.*?)&gt;/gi, '<g$1>')
      .replace(/&lt;\/g&gt;/gi, '</g>')
      .replace(/&lt;(circle|rect|line|polyline|polygon|path|text|tspan|ellipse)(.*?)&gt;/gi, '<$1$2>')
      .replace(/&lt;\/(circle|rect|line|polyline|polygon|path|text|tspan|ellipse)&gt;/gi, '</$1>')
      .replaceAll('&quot;', '"'); // restore attributes
  }

  // escapeHtml escapes &, <, >. Attribute values must ALSO escape " since
  // the multi-suggest branch interpolates each suggestion into a data-fix="..."
  // attribute. Layered on top of escapeHtml — same shape as word-prediction.js.
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }
})();
