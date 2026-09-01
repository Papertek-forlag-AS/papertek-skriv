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

  // ── Seam bindings ──
  const VOCAB = self.__lexiVocab;
  const CORE  = self.__lexiSpellCore;
  const ENGINE = self.__lexiSpellCheckEngine;
  // Phase 50-06: seam-missing path no longer early-returns the IIFE. Reason:
  // the node-friendly export shim at the bottom is the test surface for
  // renderPedagogyPanel (pedagogy-markup unit test). If the IIFE bailed
  // here, the shim would never install. Browser-side init() is still
  // guarded — it only runs when all three seams are live.
  const __SEAMS_READY = !!(VOCAB && CORE && ENGINE);

  // i18n — strings.js exports to self.__lexiI18n; graceful fallback if not loaded.
  const t = (self.__lexiI18n && self.__lexiI18n.t) || ((key) => key);

  // ── State ──
  let enabled = false;
  let activeEl = null;
  let debounceTimer = null;

  // Phase 27: cached exam-mode flag. Updated on init + chrome.storage.onChanged.
  // Read on every runCheck pass; cheap (single bool lookup).
  let examMode = false;
  // Capability flag: defaults ON (extension + Node harnesses unaffected).
  // Lockdown seeds `personalizationEnabled` false via its storage shim to show
  // lessons without the personalization UI (mark-known/demote + known-badge).
  let personalizationEnabled = true;
  // Phase 45-02: cached `sarskrivingTentativeEnabled` setting. ON by default
  // (Phase 45-03 activation); students opt OUT via the settings toggle. The
  // tier is severity:'hint' + noAutoFix, so a false positive is a dismissable
  // amber dot, never a text mutation. Surfaces the tentative compound tier
  // (nb/nn/de) with a Ja/Nei vote that feeds curator-reviewed promotion.
  let tentativeCompoundEnabled = true;

  // Wechselpräposition self-check (de-wechselpraep Layer 2). OFF by default;
  // students opt in via the toggle in that rule's "Lær mer" popover. Read on
  // init + live-applied on storage change so toggling re-runs without reload.
  let wechselAlwaysWarn = false;
  // EN variety-picker (2026-07): 'both' (default) | 'br' | 'am'. Strict
  // variety activates en-spelling-variety and supersedes the consistency
  // hint. Storage key is also the lockdown teacher-profile override point.
  let enSpellingVariety = 'both';

  // ── Init ──
  if (__SEAMS_READY) init();

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
    // Phase 45-03: hydrate cached tentative-compound flag (default ON; opt-out).
    chrome.storage.local.get('sarskrivingTentativeEnabled', (r) => {
      tentativeCompoundEnabled = !(r && r.sarskrivingTentativeEnabled === false);
    });
    chrome.storage.local.get('wechselAlwaysWarn', (r) => {
      wechselAlwaysWarn = !!(r && r.wechselAlwaysWarn === true);
    });
    chrome.storage.local.get('enSpellingVariety', (r) => {
      const v = r && r.enSpellingVariety;
      enSpellingVariety = (v === 'br' || v === 'am') ? v : 'both';
    });
    // Phase 27: hydrate cached examMode + subscribe to live toggle.
    chrome.storage.local.get(['examMode', 'personalizationEnabled'], (r) => {
      examMode = !!(r && r.examMode);
      personalizationEnabled = (r && 'personalizationEnabled' in r) ? !!r.personalizationEnabled : true;
    });
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if ('spellCheckAlternatesVisible' in changes) {
        alternatesVisible = changes.spellCheckAlternatesVisible.newValue !== false;
        if (popover && activePopoverIdx >= 0 && lastFindings[activePopoverIdx]) {
          showPopover(activePopoverIdx, lastFindings[activePopoverIdx]);
        }
      }
      if ('sarskrivingTentativeEnabled' in changes) {
        tentativeCompoundEnabled = changes.sarskrivingTentativeEnabled.newValue !== false;
        // Repaint so the tier surfaces (or disappears) immediately on toggle.
        lastCheckedText = '';
        if (activeEl) runCheck();
      }
      if ('enSpellingVariety' in changes) {
        const v = changes.enSpellingVariety.newValue;
        enSpellingVariety = (v === 'br' || v === 'am') ? v : 'both';
        lastCheckedText = '';
        if (activeEl) runCheck();
      }
      if ('wechselAlwaysWarn' in changes) {
        wechselAlwaysWarn = !!(changes.wechselAlwaysWarn.newValue === true);
        // Repaint so the Layer-2 self-check hints appear/disappear on toggle.
        lastCheckedText = '';
        if (activeEl) runCheck();
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
        refreshLangBadge(); // exam mode bypasses focus filtering → hide the 🎯
      }
      if ('personalizationEnabled' in changes) {
        personalizationEnabled = !!changes.personalizationEnabled.newValue;
        lastCheckedText = '';
        if (activeEl) runCheck();
        refreshLangBadge(); // focus indicator is personalization-gated
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
      // Focus may land inside the open chip menu (or its FL submenu) when the
      // student clicks an item — don't tear the menu down in that case.
      const focusInFlyout = (langFlyout && langFlyout.contains(ae)) || (flSubmenuEl && flSubmenuEl.contains(ae));
      if (!focusStillInside && !focusInOverlay && !focusInBtn && !focusInFlyout) {
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
          // Keep the "du kan dette" label for known lessons after an
          // Escape-collapse (mirrors the click-collapse restore in showPopover).
          const _f = lastFindings[activePopoverIdx];
          const _lng = currentLangCode() || VOCAB.getLanguage();
          btn.textContent = (personalizationEnabled && _f && PERSONAL.isLessonKnown(_lng, _f.rule_id)) ? t('laer_mer_known_label') : t('laer_mer_button');
        }
        if (markerAt(activePopoverIdx)) positionPopover(markerAt(activePopoverIdx).rect);
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
      validWords: (() => {
        const base = pick('validWords', VOCAB.getValidWords);
        if (examMode) return base;                 // exam: canonical Ordbank only
        const extra = PERSONAL.getPersonalWords(lang);
        if (!extra.length) return base;
        const merged = new Set(base);
        for (const w of extra) merged.add(w);
        return merged;
      })(),
      curatedValidWords: pick('curatedValidWords', VOCAB.getCuratedValidWords),
      multiwordTokens:  pick('multiwordTokens',  VOCAB.getMultiwordTokens),
      isAdjective:      pick('isAdjective',      VOCAB.getIsAdjective),
      adjLemma:         pick('adjLemma',         VOCAB.getAdjLemma),
      adjNeuter:        pick('adjNeuter',        VOCAB.getAdjNeuter),
      nounPlural:       pick('nounPlural',       VOCAB.getNounPlural),
      knownPresens:     pick('knownPresens',     VOCAB.getKnownPresens),
      knownPreteritum:  pick('knownPreteritum',  VOCAB.getKnownPreteritum),
      knownParticiples: pick('knownParticiples', VOCAB.getKnownParticiples),
      verbForms:        pick('verbForms',        VOCAB.getVerbForms),
      typoFix:          pick('typoFix',          VOCAB.getTypoFix),
      compoundNouns:    pick('compoundNouns',    VOCAB.getCompoundNouns),
      variantSpellings: pick('variantSpellings', VOCAB.getVariantSpellings),
      nonCompoundPairs: pick('nonCompoundPairs', VOCAB.getNonCompoundPairs),
      nbNnStemCrossref: pick('nbNnStemCrossref', VOCAB.getNbNnStemCrossref),
      pitfalls:         pick('pitfalls',         VOCAB.getPitfalls),
      freq:             pick('freq',             VOCAB.getFreq),
      sisterValidWords: pick('sisterValidWords', VOCAB.getSisterValidWords),
      registerWords:      pick('registerWords',      VOCAB.getRegisterWords),
      collocations:       pick('collocations',       VOCAB.getCollocations),
      redundancyPhrases:  pick('redundancyPhrases',  VOCAB.getRedundancyPhrases),
      isFeatureEnabled:   VOCAB.isFeatureEnabled || (() => true),
      nnInfinitiveClasses: pick('nnInfinitiveClasses', VOCAB.getNNInfinitiveClasses),
      nnCanonicalInfinitives: pick('nnCanonicalInfinitives', VOCAB.getNnCanonicalInfinitives),
      participleToAux:    pick('participleToAux',    VOCAB.getParticipleToAux),
      esEnyeMap:          pick('esEnyeMap',          VOCAB.getEsEnyeMap),
      frCedilleMap:       pick('frCedilleMap',       VOCAB.getFrCedilleMap),
      frPluralMap:        pick('frPluralMap',        VOCAB.getFrPluralMap),
      anglicismMap:       pick('anglicismMap',       VOCAB.getAnglicismMap),
      anglicismWords:     pick('anglicismWords',     VOCAB.getAnglicismWords),
      falseFriendsMap:    pick('falseFriendsMap',    VOCAB.getFalseFriendsMap),
      frAdjPluralMap:     pick('frAdjPluralMap',     VOCAB.getFrAdjPluralMap),
      deAdjPredicativeMap: pick('deAdjPredicativeMap', VOCAB.getDeAdjPredicativeMap),
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
      nounLemmaGenus:     pick('nounLemmaGenus',     VOCAB.getNounLemmaGenus),
      nounPluralGenus:    pick('nounPluralGenus',    VOCAB.getNounPluralGenus),
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
      sisterVerbForms:    pick('sisterVerbForms',    VOCAB.getSisterVerbForms),
      grammarTables:      pick('grammarTables',      VOCAB.getGrammarTables),
      deRegularPresent:   pick('deRegularPresent',    VOCAB.getDeRegularPresent),
      deStrongPresent:    pick('deStrongPresent',     VOCAB.getDeStrongPresent),
      deComparatives:     pick('deComparatives',      VOCAB.getDeComparatives),
      deDativePlural:     pick('deDativePlural',      VOCAB.getDeDativePlural),
      rulePedagogy:       pick('rulePedagogy',       VOCAB.getRulePedagogy),
      // Phase 45-02: gate the tentative compound-recognition tier. The
      // rule reads this flag and returns [] when false. Cached from
      // chrome.storage on init + live-applied via onChanged below.
      sarskrivingTentativeEnabled: tentativeCompoundEnabled,
      wechselAlwaysWarn: wechselAlwaysWarn,
      enSpellingVariety: enSpellingVariety,
    };

    // Phase 43-01: rule dispatch + post-process filters delegated to the
    // pure spell-check engine. Engine handles: CORE.check() call, legacy
    // type=rule_id alias, dismissed-finding filter, and Phase 27
    // exam-mode rule filter. Renderer keeps owning the dual-marker
    // popover-render gate (in showPopover) — that's DOM-side.
    const focusModeEnabled = personalizationEnabled && PERSONAL.isFocusModeEnabled(lang);
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

    // Focus Mode: suppress pedagogy-gated findings not in the student's learning sets.
    // Rules without pedagogy (typos, sarskriving) always pass through.
    // Typo-rule findings with supplementary pedagogy (DE umlauts, DE eszett,
    // FR accents, NN noun-plurals) also always pass through — 'typo' never
    // maps to a library lesson, so the pedagogy here is Lær mer bonus content,
    // not a reason to gate the finding.
    if (focusModeEnabled && !examMode) {
      findings = findings.filter(f => {
        if (!f.pedagogy || f.rule_id === 'typo') return true;
        return PERSONAL.isLessonKnown(lang, f.rule_id)
            || PERSONAL.isLessonLearning(lang, f.rule_id);
      });
    }

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
        pendingAdvanceFrom = -1;
        showToast(t('spell_toast_review_done') || 'Ferdig revidert ✓');
      }
      return;
    }
    lastFindings = findings;
    renderMarkers(findings);
    if (pendingAdvanceIdx >= 0) {
      const from = pendingAdvanceFrom;
      pendingAdvanceIdx = -1;
      pendingAdvanceFrom = -1;
      const idx = ENGINE.nextFindingByOffset(findings, from);
      if (idx >= 0) {
        showPopover(idx, findings[idx]);
        scrollMarkerIntoView(idx);
      }
    }
  }

  function dismissKey(f) {
    return `${f.original}|${f.fix}`;
  }

  // ── contenteditable text extraction ───────────────────────────────────
  //
  // buildEditableText is the SINGLE traversal that both readInput() and
  // rangeForOffsets() are built on. They must agree by construction: the
  // string the rules see and the offsets we map back onto the DOM come out
  // of the same walk, in the same order, with the same synthetic
  // characters. Keeping them as two independent walks is what caused the
  // bug below.
  //
  // WHY: readInput used to return `el.textContent`, which concatenates text
  // nodes and DROPS every block boundary. So
  //     <h1>Hva skjer her nå?</h1><p>Nå skriver…</p>
  // read as "Hva skjer her nå?Nå skriver…" — the last word of one block
  // glued to the first word of the next. Two consequences, both live on
  // 2026-08-12:
  //   * sentence-case saw "?N" and reported a missing space after a full
  //     stop that the student had not omitted; unknown-word rules see
  //     fused tokens like "skolenNeste" the same way.
  //   * worse, «Fiks» on such a finding selected a span across two block
  //     elements and ran execCommand('insertText'), which MERGES them.
  //     Measured: <h1>…</h1><p>…</p> became a single <h1> with the
  //     paragraph absorbed into it. Silent structural damage to a pupil's
  //     document, from a finding that was never real.
  //
  // This is not leksihjelp-only: lockdown's exam surface is a
  // contenteditable (#writing-editor) running this same synced file, and
  // sentence-case is exam-safe, so it reaches pupils mid-exam.
  //
  // WHY NOT innerText: it inserts newlines at block boundaries, which is
  // the right STRING — but those characters exist in no text node, while
  // offsets are indices into the text-node concatenation. Every marker
  // after the first boundary would drift by one character, cumulatively.
  // The false positive would vanish and marker positioning would silently
  // break. The map below is the point of the exercise, not the newline.
  //
  // Separator is a single '\n' per boundary, deliberately: it matches what
  // a <textarea> yields (so rules need no change — they already handle \n
  // from the textarea path), and one character per boundary keeps the
  // mapping trivial. innerText would emit '\n\n' between paragraphs; we do
  // not, because nothing downstream distinguishes paragraph from line and
  // the extra character is more offset arithmetic for no gain.
  const BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DD', 'DIV', 'DL', 'DT',
    'FIELDSET', 'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3',
    'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
    'SECTION', 'TABLE', 'TBODY', 'TD', 'TFOOT', 'TH', 'THEAD', 'TR', 'UL',
  ]);

  /**
   * Walk `root` once, producing the text the rules run against plus the
   * map back onto the DOM.
   *
   * @returns {{ text: string, segments: Array<{node: Text, start: number, end: number}> }}
   *   segments cover ONLY real text-node runs, in document order. Offsets
   *   that fall between segments are synthetic separators owned by no node
   *   — locateStart/locateEnd resolve those to the adjacent node.
   */
  function buildEditableText(root) {
    const segments = [];
    let text = '';
    let pendingBreak = false; // crossed a boundary; emit '\n' before the next text
    let seenText = false;     // suppresses a leading separator

    const walker = document.createTreeWalker(
      root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null,
    );
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        // A <br> is a boundary even though it is not a block.
        if (n.tagName === 'BR' || BLOCK_TAGS.has(n.tagName)) pendingBreak = true;
        continue;
      }
      const chunk = n.textContent;
      if (!chunk.length) continue;
      if (pendingBreak && seenText) text += '\n';
      pendingBreak = false;
      const start = text.length;
      text += chunk;
      segments.push({ node: n, start, end: start + chunk.length });
      seenText = true;
    }
    return { text, segments };
  }

  // Resolve a START offset. Mirrors the original walker's strict `>`: an
  // offset landing exactly on a text-node boundary belongs to the NEXT
  // node, so the range spans the target word rather than trailing
  // whitespace at the end of the previous one.
  function locateStart(segments, off) {
    for (const s of segments) {
      if (off < s.end) {
        return { node: s.node, offset: Math.max(0, off - s.start) };
      }
    }
    return null;
  }

  // Resolve an END offset. Mirrors the original `>=`: an offset landing
  // exactly on a node's end stays in THAT node, at its full length.
  function locateEnd(segments, off) {
    for (const s of segments) {
      if (off <= s.end) {
        return {
          node: s.node,
          offset: Math.max(0, Math.min(off - s.start, s.node.textContent.length)),
        };
      }
    }
    return null;
  }

  function readInput(el) {
    if (el.isContentEditable) return { text: buildEditableText(el).text, cursor: null };
    return { text: el.value || '', cursor: el.selectionEnd };
  }

  // ── Segmentkart-cache for ÉN synkron runde (ytelse, 27.08.2026) ──
  //
  // rangeForOffsets kaller buildEditableText, som går hele contenteditable-
  // treet med en TreeWalker. Med ett kall per funn ble det én full
  // DOM-gjennomgang per markør — 12–36 av dem per runde på en elevtekst.
  //
  // Cachen er med vilje IKKE tidsbasert og ikke hengt på elementet. Den er
  // åpen bare inne i ett synkront kall, der DOM-en ikke kan endre seg
  // (ingen await, ingen event-loop-tur), og lukkes i finally. Alt annet
  // ville vært farlig: et stale segmentkart peker offsets på feil
  // tekstnoder, og applyFixCE bruker samme kartet til å velge spennet den
  // erstatter. En markør på feil sted er stygt; en execCommand over feil
  // spenn slår sammen blokker og ødelegger eleven sitt dokument — se
  // kommentaren over buildEditableText og rangeCrossesBlocks-vakten.
  // Derfor: applyFixCE kjører ALDRI inne i denne cachen.
  let _segCache = null;         // { el, result } mens en runde er åpen
  let _segCacheOpen = false;

  function withSegmentCache(el, fn) {
    const prevOpen = _segCacheOpen, prevCache = _segCache;
    _segCacheOpen = true;
    _segCache = null;
    try {
      return fn();
    } finally {
      _segCacheOpen = prevOpen;
      _segCache = prevCache;
    }
  }

  function editableSegments(el) {
    if (_segCacheOpen && _segCache && _segCache.el === el) return _segCache.result;
    const result = buildEditableText(el);
    if (_segCacheOpen) _segCache = { el, result };
    return result;
  }

  // ── Overlay + markers + popover ──

  let overlay = null;
  const markers = []; // [{ el, finding, rect, fIdx }] — fIdx indexes lastFindings; see renderMarkers
  // Look up a marker by its FINDINGS index. markers is a compacted subset of
  // findings (out-of-view findings render no marker), so positional indexing
  // is wrong whenever anything earlier was skipped.
  function markerAt(fIdx) {
    for (const m of markers) if (m.fIdx === fIdx) return m;
    return null;
  }
  let popover = null;
  let activePopoverIdx = -1;
  let lastFindings = [];
  let lastCheckedText = '';
  let spellCheckBtn = null;
  const dismissed = new Set();
  // Personal dictionary (Phase 1, local-first). chrome.storage.local only — no
  // network (SC-06 safe). Words are unioned into validWords in runCheck() unless
  // exam mode is active.
  const PERSONAL = self.__lexiPersonalization.createPersonalizationStore({
    storage: {
      read: () => new Promise(r => chrome.storage.local.get('personalization', o => r(o.personalization || null))),
      write: (obj) => new Promise(r => chrome.storage.local.set({ personalization: obj }, r)),
      subscribe: (cb) => {
        const listener = (changes, area) => { if (area === 'local' && changes.personalization) cb(changes.personalization.newValue || null); };
        chrome.storage.onChanged.addListener(listener);
        return () => chrome.storage.onChanged.removeListener(listener);
      },
    },
  });
  PERSONAL.load().then(() => { try { runCheck(); refreshLangBadge(); } catch (_) {} });
  PERSONAL.onChange(() => { try { runCheck(); refreshLangBadge(); } catch (_) {} });
  let pendingAdvanceIdx = -1;
  // Offset vi kom FRÅ, ikkje indeksen vi var på. findings[] er bygd regel for
  // regel (spell-check-core sorterer reglane på priority), så array-ordenen er
  // pedagogisk — ikkje tekstleg. Å opne findings[i] etter at i vart fjerna gir
  // det funnet som glei inn i slot i, som kan liggje kvar som helst i
  // dokumentet. Meldt av ein brukar 29.08.2026: popoveren hoppa til ei anna
  // setning lenger nede. Sjå nextFindingByOffset i spell-check-engine.js.
  let pendingAdvanceFrom = -1;

  /** Marker at neste sjekk skal opne funnet som kjem ETTER dette i teksten. */
  function markPendingAdvance(finding) {
    markPendingAdvance(finding);
    // Strengt etter: eit fiks flyttar dei etterfølgjande funna, men aldri
    // forbi startpunktet sitt, så «første start > her» held. Eit fiks som
    // slettar heile ordet KAN la det neste funnet lande på nøyaktig same
    // offset; det blir då teke på neste runde i staden for no. Betre enn å
    // risikere å låse eleven fast på same ord.
    pendingAdvanceFrom = (finding && typeof finding.start === 'number') ? finding.start : -1;
  }
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

    const lang = currentLangCode() || VOCAB.getLanguage();
    let rendered = 0, skipped = 0;

    // LES ALT FØRST, SKRIV ETTERPÅ (ytelse, 27.08.2026).
    //
    // Løkken under leste en rect per funn og skrev stilene med én gang.
    // Hver skriving ugyldiggjør layouten, så neste lesing tvinger en ny
    // reflow — 12–36 tvungne layouts per runde på en elevtekst. Nå
    // samles alle rect-ene i én lesefase, og alle DOM-skrivingene skjer
    // etterpå. `withSegmentCache` holder samtidig segmentkartet i live
    // gjennom lesefasen, så TreeWalker-en går én gang i stedet for én
    // gang per funn. Begge fasene er synkrone; DOM-en kan ikke endre seg
    // mellom dem.
    const er = activeEl.getBoundingClientRect();
    const measured = withSegmentCache(activeEl, () => findings.map((finding, idx) => ({
      finding, idx, rect: positionForRange(activeEl, finding.start, finding.end),
    })));

    measured.forEach(({ finding, idx, rect }) => {
      if (!rect) {
        skipped++;
        warn('skip — no rect', finding.original, { start: finding.start, end: finding.end, elRect: er });
        return;
      }
      if (!isInsideElement(activeEl, rect, er)) {
        skipped++;
        warn('skip — outside el', finding.original, { rect, elRect: { top: er.top, left: er.left, right: er.right, bottom: er.bottom } });
        return;
      }
      const dot = document.createElement('div');
      // Phase 6: severity-aware CSS class suffix
      const severitySuffix = finding.severity === 'warning' ? ' lh-spell-warn'
                           : finding.severity === 'hint'    ? ' lh-spell-hint'
                           : '';
      // Læringsbunken: a rule the student is actively practising gets a ring on
      // its marker — the "special marker when you do wrong" that closes the loop
      // between the Lær mer library and the writing surface.
      const learningSuffix = (personalizationEnabled && !examMode && finding.rule_id
        && PERSONAL.isLessonLearning(lang, finding.rule_id)) ? ' lh-spell-learning-marked' : '';
      dot.className = `lh-spell-dot lh-spell-${finding.type}${severitySuffix}${learningSuffix}`;
      dot.dataset.idx = String(idx);
      dot.title = finding.message;
      dot.addEventListener('mousedown', e => e.preventDefault()); // prevent blur
      dot.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        showPopover(idx, finding);
      });
      overlay.appendChild(dot);
      // fIdx = index into the FINDINGS array (and lastFindings). markers is a
      // compacted subset — findings whose rect is missing or scrolled outside
      // the input's box are skipped above — so markers[i] does NOT line up
      // with findings[i]. Every lookup must go through markerAt(fIdx);
      // indexing markers[] with a findings index positioned the popover at
      // the wrong word (or, past the end, left it unpositioned at the
      // viewport's top-left corner).
      markers.push({ el: dot, finding, rect, fIdx: idx });
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
      // Samme les-alt-først som i renderMarkers. Dette kjører på hver
      // scroll- og resize-frame, så det er den løkken som oftest går.
      const er = activeEl.getBoundingClientRect();
      const rects = withSegmentCache(activeEl, () =>
        markers.map(m => positionForRange(activeEl, m.finding.start, m.finding.end)));
      for (let i = 0; i < markers.length; i++) {
        const m = markers[i];
        const rect = rects[i];
        if (!rect || !isInsideElement(activeEl, rect, er)) {
          m.el.style.display = 'none';
          continue;
        }
        m.el.style.display = '';
        positionDot(m.el, rect);
        m.rect = rect;
      }
      if (popover && activePopoverIdx >= 0 && markerAt(activePopoverIdx)) {
        positionPopover(markerAt(activePopoverIdx).rect);
      }
      positionButton();
    });
  }

  // `elRect` lar kalleren lese elementets rect ÉN gang utenfor løkken sin.
  // Den kan ikke endre seg mens vi maler markører — overlayet ligger utenfor
  // input-elementet — og en getBoundingClientRect() per funn er en tvungen
  // reflow per funn.
  function isInsideElement(el, rect, elRect) {
    const er = elRect || el.getBoundingClientRect();
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

  function laerMerButtonHtml(finding, lang) {
    if (!finding.pedagogy || examMode) return '';
    const known = personalizationEnabled && PERSONAL.isLessonKnown(lang, finding.rule_id);
    const label = known ? t('laer_mer_known_label') : t('laer_mer_button');
    const cls = 'lh-spell-laer-mer-btn' + (known ? ' lh-spell-laer-mer-known' : '');
    return `<button type="button" class="${cls}" aria-expanded="false">${escapeHtml(label)}</button><div class="lh-spell-pedagogy-panel" hidden></div>`;
  }
  // "Keep word" (personal-dictionary add) is only meaningful for unknown-word
  // / spelling findings — i.e. a single token that's not in the dictionary, so
  // adding it to the personal list makes it valid. Gated on the generic 'typo'
  // rule_id (emitted by nb-typo-curated + nb-typo-fuzzy for the "word not in
  // dictionary" case) AND a single-word fix. Deliberately EXCLUDED:
  //   - 'homophone' (nb-typo-curated) — real word in the wrong sense (og/å);
  //     "keep word" wouldn't stop the flag.
  //   - 'context-typo' (universal-context-typo) — real word wrong in context.
  //   - run-on words (nb-runon-words ALSO emits rule_id 'typo' for popover
  //     styling — "hanharsett" → "han har sett"): its fix contains a SPACE,
  //     so we exclude any finding whose fix splits into multiple words. This
  //     also correctly excludes multi-word corrections like EN "alot" → "a
  //     lot" — you shouldn't whitelist a mashed-together non-word.
  //   - all grammar findings (gender, comma, word-order, tense, sarskriving,
  //     tentative-compound, …) — never spelling.
  // Safety bias: a false negative (no button on a real typo) is harmless; a
  // false positive ("keep word" on a run-on / grammar finding) is wrong.
  function isUnknownWordFinding(finding) {
    if (!finding || finding.rule_id !== 'typo') return false;
    // Single-word fix only: a fix containing whitespace is a run-on split
    // (or other multi-word correction), not a keep-able single word. A
    // missing/empty fix (pure unknown word, no suggestion) stays keep-able.
    if (typeof finding.fix === 'string' && /\s/.test(finding.fix.trim())) return false;
    return true;
  }
  // Renders the "keep word" action button for the spell popover, or '' when it
  // shouldn't appear. Gated on: unknown-word finding, personalization enabled,
  // NOT exam mode (exam-registry marks personalization.addWord unsafe — a
  // personal dictionary in an exam is an answer-loading vector), and the word
  // isn't already in the personal list.
  function addWordButtonHtml(finding, lang) {
    if (!isUnknownWordFinding(finding)) return '';
    if (!personalizationEnabled || examMode) return '';
    if (PERSONAL.hasPersonalWord(lang, finding.original)) return '';
    return `<button type="button" class="lh-spell-btn lh-spell-add-word" title="${escapeAttr(t('spell_keep_word_title'))}">✓ ${escapeHtml(t('spell_keep_word'))}</button>`;
  }
  function panelActionHtml(finding, lang) {
    if (examMode || !personalizationEnabled) return '';   // exam OR personalization-off → no personal UI
    const id = finding.rule_id;
    const known = PERSONAL.isLessonKnown(lang, id);
    const learning = !known && PERSONAL.isLessonLearning(lang, id);
    const btn = (action, label) =>
      `<button type="button" class="lh-spell-mark-known" data-action="${action}" data-rule="${escapeAttr(id)}">${escapeHtml(label)}</button>`;
    if (known) return btn('demote', t('personal_demote'));   // mastered → back to læringsbunken
    if (learning) {
      // The student is actively practising this rule — close the loop from the
      // writing surface: remind them + let them graduate it to mastered.
      return `<p class="lh-spell-learning-note">${escapeHtml(t('personal_learning_note'))}</p>` + btn('mark', t('personal_mark_known'));
    }
    return btn('mark', t('personal_mark_known')) + btn('learn', t('personal_mark_learning'))
      + `<p class="lh-spell-known-note">${escapeHtml(t('personal_known_note'))}</p>`;
  }
  // Wire every action button in a pedagogy panel (mark/learn/demote/unlearn).
  function wireMarkButtons(panel, lang) {
    const ACTIONS = { mark: 'markKnown', learn: 'markLearning', demote: 'markLearning', unlearn: 'unmarkLearning' };
    panel.querySelectorAll('.lh-spell-mark-known').forEach((btn) => {
      btn.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        const fn = ACTIONS[btn.dataset.action];
        if (fn && PERSONAL[fn]) await PERSONAL[fn](lang, btn.dataset.rule);
        hidePopover();
      });
    });
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
${!reportChannelOpen() ? '' : `<button type="button" class="lh-spell-btn lh-spell-report" title="Send beskjed til oss om at Leksihjelp tar feil her \u2014 vi bruker rapportene til \u00e5 forbedre stavekontrollen.">\u26a0 Rapporter feil</button>`}
          ${addWordButtonHtml(finding, lang)}
        </div>
        ${laerMerButtonHtml(finding, lang)}
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
      // Phase 45-02: tentative compound findings render a Ja/Nei vote layout
      // instead of the standard Fiks/Avvis. Ja-click applies the fix AND
      // emits a SEND_REPORT compound-vote payload; Nei-click dismisses AND
      // emits a no-vote. The student is NEVER auto-corrected without a Ja.
      const isTentativeCompound = finding.tentative === true && finding.rule_id === 'sarskriving-tentative';
      const headHtml = noAutoFix
        ? `<div class="lh-spell-head">${isTentativeCompound ? '<span class="lh-spell-tentative-badge">Sannsynleg</span>' : ''}<span class="lh-spell-orig">${escapeHtml(finding.original)}</span>${isTentativeCompound ? `<span class="lh-spell-arrow">\u2192</span><span class="lh-spell-fix-text">${escapeHtml(finding.fix)}</span>` : ''}${registerBadgeHtml}</div>`
        : `<div class="lh-spell-head">
            <span class="lh-spell-orig">${escapeHtml(finding.original)}</span>
            <span class="lh-spell-arrow">\u2192</span>
            <span class="lh-spell-fix-text">${escapeHtml(suggestions[0])}</span>
            ${registerBadgeHtml}
          </div>`;
      let actionsHtml;
      if (isTentativeCompound) {
        actionsHtml = `
          <button type="button" class="lh-spell-btn lh-spell-accept lh-spell-vote-yes">\u2713 ${escapeHtml(t('spell_sarskriving_tentative_yes'))}</button>
          <button type="button" class="lh-spell-btn lh-spell-decline lh-spell-vote-no">\u2715 ${escapeHtml(t('spell_sarskriving_tentative_no'))}</button>
        `;
      } else {
        const fixBtnHtml = noAutoFix
          ? ''
          : '<button type="button" class="lh-spell-btn lh-spell-accept">\u2713 Fiks</button>';
        actionsHtml = `
          ${fixBtnHtml}
          <button type="button" class="lh-spell-btn lh-spell-decline">\u2715 Avvis</button>
${!reportChannelOpen() ? '' : `<button type="button" class="lh-spell-btn lh-spell-report" title="Send beskjed til oss om at Leksihjelp tar feil her \u2014 vi bruker rapportene til \u00e5 forbedre stavekontrollen.">\u26a0 Rapporter feil</button>`}
          ${addWordButtonHtml(finding, lang)}
        `;
      }
      popover.innerHTML = `
        ${headHtml}
        <div class="lh-spell-explain">${renderExplain(finding, lang)}</div>
        <div class="lh-spell-actions">${actionsHtml}</div>
        ${laerMerButtonHtml(finding, lang)}
      `;
      const acceptBtn = popover.querySelector('.lh-spell-accept');
      if (acceptBtn) {
        if (isTentativeCompound) {
          // Tentative Yes-vote: apply fix + emit yes-vote payload.
          acceptBtn.addEventListener('click', () => {
            emitCompoundVote(finding, 'yes', lang);
            applyFix(finding);
          });
        } else {
          acceptBtn.addEventListener('click', () => applyFix(finding));
        }
      }
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
        const wirePedagogyNav = (panelEl) => {
          const pagesEl = panelEl.querySelector('.lh-spell-pedagogy-pages');
          if (!pagesEl) return;
          pagesEl.addEventListener('click', (e) => {
            // Page navigation
            const navBtn = e.target.closest('.lh-spell-pedagogy-prev, .lh-spell-pedagogy-next');
            if (navBtn) {
              const cur = parseInt(pagesEl.dataset.current, 10);
              const total = parseInt(pagesEl.dataset.total, 10);
              const next = navBtn.classList.contains('lh-spell-pedagogy-next') ? cur + 1 : cur - 1;
              if (next < 0 || next >= total) return;
              // Navigating cancels any in-progress/paused read-aloud so the next
              // play reads the NEW slide, not the resumed previous one (the
              // pause state survives navigation, else "paused → resume" fires).
              try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (_) {}
              pagesEl.querySelectorAll('.lh-spell-pedagogy-speak').forEach((sb) => { sb.textContent = '🔊'; });
              pagesEl.querySelectorAll('.lh-spell-pedagogy-page').forEach(p => {
                p.hidden = parseInt(p.dataset.pageIdx, 10) !== next;
              });
              pagesEl.dataset.current = next;
              const ind = pagesEl.querySelector('.lh-spell-pedagogy-indicator');
              if (ind) ind.textContent = (next + 1) + ' / ' + total;
              const prev = pagesEl.querySelector('.lh-spell-pedagogy-prev');
              const nxt = pagesEl.querySelector('.lh-spell-pedagogy-next');
              if (prev) prev.disabled = next === 0;
              if (nxt) nxt.disabled = next === total - 1;
              requestAnimationFrame(() => {
                if (markerAt(activePopoverIdx)) positionPopover(markerAt(activePopoverIdx).rect);
              });
              return;
            }

            // Expand/collapse toggle
            if (e.target.closest('.lh-spell-pedagogy-expand')) {
              if (!popover) return;
              const isExpanded = popover.classList.toggle('lh-spell-popover--expanded');
              const btn = e.target.closest('.lh-spell-pedagogy-expand');
              btn.textContent = isExpanded ? '⤣' : '⤢';
              btn.title = isExpanded ? (t('pedagogy_collapse_title') || 'Forminsk') : (t('pedagogy_expand_title') || 'Forstørr');
              // Re-measure page heights since width changed
              pagesEl.style.minHeight = '';
              requestAnimationFrame(() => {
                const pages = pagesEl.querySelectorAll('.lh-spell-pedagogy-page');
                const cur2 = parseInt(pagesEl.dataset.current, 10) || 0;
                let maxH = 0;
                pages.forEach(p => { p.hidden = false; p.style.position = 'absolute'; p.style.visibility = 'hidden'; p.style.width = '100%'; });
                pages.forEach(p => { maxH = Math.max(maxH, p.offsetHeight); });
                pages.forEach((p, i) => { p.style.position = ''; p.style.visibility = ''; p.style.width = ''; p.hidden = i !== cur2; });
                if (maxH > 0) pagesEl.style.minHeight = maxH + 'px';
                if (markerAt(activePopoverIdx)) positionPopover(markerAt(activePopoverIdx).rect);
              });
              return;
            }

            // de-wechselpraep opt-in toggle (Layer 2 "always warn"). The
            // checkbox is already toggled by the time this click fires, so
            // .checked is the new state. Writing the pref triggers onChanged →
            // re-check; the popover stays open and the box stays in its state.
            const wTgl = e.target.closest('.lh-spell-wechsel-toggle');
            if (wTgl) {
              try { chrome.storage.local.set({ wechselAlwaysWarn: !!wTgl.checked }); } catch (_) {}
              return;
            }

            // Read aloud (browser speechSynthesis) — play / pause / resume
            if (e.target.closest('.lh-spell-pedagogy-speak')) {
              const synth = window.speechSynthesis;
              if (!synth) return;
              const speakBtn = e.target.closest('.lh-spell-pedagogy-speak');

              // Decide from THIS button's own icon, NOT the global
              // speechSynthesis paused/speaking flags — those are shared and
              // unreliable across slide changes. Chrome can leave the engine
              // stuck-paused after a cancel() that followed a pause(), so the
              // old "synth.paused → resume" branch would resume an empty queue
              // and nothing plays. The nav handler resets every button to 🔊.
              const label = speakBtn.textContent.trim();
              if (label === '⏸') { // this reading is playing → pause
                synth.pause();
                speakBtn.textContent = '▶';
                return;
              }
              if (label === '▶') { // this reading is paused → resume
                synth.resume();
                speakBtn.textContent = '⏸';
                return;
              }
              // Idle (🔊) → start fresh. Clear any residual/stuck engine state
              // (cancel + resume unsticks a paused engine so the new speak
              // plays) and reset every button so only this one shows playing.
              try { synth.cancel(); synth.resume(); } catch (_) {}
              pagesEl.querySelectorAll('.lh-spell-pedagogy-speak').forEach((b) => { b.textContent = '🔊'; });

              // Build utterance queue with per-element language detection
              const uiLangCode = 'nb-NO';
              const targetLangCode = lang === 'de' ? 'de-DE' : lang === 'es' ? 'es-ES'
                : lang === 'fr' ? 'fr-FR' : lang === 'en' ? 'en-US' : 'nb-NO';
              const TARGET_CLASSES = ['lh-spell-pedagogy-example-correct', 'lh-spell-pedagogy-example-incorrect', 'lh-spell-pedagogy-wechsel-sentence'];
              const visiblePage = pagesEl.querySelector('.lh-spell-pedagogy-page:not([hidden])');
              const root = visiblePage || pagesEl;

              // Strip UI icons AND emoji / variation-selectors / the U+FFFD
              // replacement char: a bokmål lesson coalesces its whole slide
              // (incl. the comparison box's 🍴/🐔) into one nb-NO utterance, and
              // Chrome's speechSynthesis silently drops an utterance containing
              // those chars → no audio at all. (Foreign lessons split by
              // language so they dodged it.)
              const clean = (s) => (s || '')
                .replace(/[✓✗→●←⤢⤣🔊⏸▶⏹]/g, '')
                .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE0F}\u{200D}]/gu, '')
                // Lone/broken surrogate halves (a mojibake 🐔 in the data lands
                // as one — it silently kills the whole utterance) + U+FFFD.
                .replace(/[\uD800-\uDFFF�]/g, '')
                .replace(/\s+/g, ' ').trim();
              const raw = [];
              const walk = (el) => {
                // Skip illustrations / SVGs / interactive controls — read only
                // the teaching prose. The compound-word comparison box lives in
                // .lh-spell-pedagogy-visual (an SVG with emoji labels + a
                // caption + "+ +" buttons); <button>/<input> covers the viewer
                // CTAs and any widget controls in other lessons.
                const tag = el.tagName && el.tagName.toLowerCase();
                if (tag === 'svg' || tag === 'button' || tag === 'input' ||
                    (el.classList && el.classList.contains('lh-spell-pedagogy-visual'))) {
                  return;
                }
                // A whole example/target subtree reads in the target language.
                if (el.classList && TARGET_CLASSES.some(c => el.classList.contains(c))) {
                  const t = clean(el.textContent);
                  if (t) raw.push({ text: t, lang: targetLangCode });
                  return;
                }
                // Walk childNodes (NOT el.children) so interleaved TEXT NODES —
                // the actual prose of a mixed <p>text <em>…</em> text</p> — aren't
                // skipped. The old code recursed into element children only, so it
                // read just the <em> words and dropped the whole main sentence.
                for (const node of el.childNodes) {
                  if (node.nodeType === 3) { // text node
                    const t = clean(node.textContent);
                    if (t) raw.push({ text: t, lang: uiLangCode });
                  } else if (node.nodeType === 1) { // element
                    walk(node);
                  }
                }
              };
              walk(root);
              // Coalesce adjacent same-language fragments so a mixed paragraph
              // reads as continuous speech instead of choppy word-by-word.
              const queue = [];
              for (const item of raw) {
                const last = queue[queue.length - 1];
                if (last && last.lang === item.lang) last.text += ' ' + item.text;
                else queue.push({ ...item });
              }
              if (queue.length === 0) return;

              let idx = 0;
              const speakNext = () => {
                if (idx >= queue.length) { speakBtn.textContent = '🔊'; return; }
                const item = queue[idx++];
                const utt = new SpeechSynthesisUtterance(item.text);
                utt.lang = item.lang;
                utt.rate = 0.9;
                utt.onend = speakNext;
                utt.onerror = () => { speakBtn.textContent = '🔊'; };
                synth.speak(utt);
              };
              speakBtn.textContent = '⏸';
              speakNext();
              return;
            }
          });

          // Stabilize height: measure all pages, lock container to tallest
          requestAnimationFrame(() => {
            const pages = pagesEl.querySelectorAll('.lh-spell-pedagogy-page');
            if (pages.length < 2) return;
            const cur = parseInt(pagesEl.dataset.current, 10) || 0;
            let maxH = 0;
            pages.forEach(p => {
              p.hidden = false;
              p.style.position = 'absolute';
              p.style.visibility = 'hidden';
              p.style.width = '100%';
            });
            pages.forEach(p => { maxH = Math.max(maxH, p.offsetHeight); });
            pages.forEach((p, i) => {
              p.style.position = '';
              p.style.visibility = '';
              p.style.width = '';
              p.hidden = i !== cur;
            });
            if (maxH > 0) pagesEl.style.minHeight = maxH + 'px';
            if (markerAt(activePopoverIdx)) positionPopover(markerAt(activePopoverIdx).rect);
          });
        };
        if (pedagogyPanelExpanded) {
          panel.innerHTML = renderPedagogyPanel(finding.pedagogy, uiLang, finding.rule_id) + panelActionHtml(finding, lang);
          wireMarkButtons(panel, lang);
          wirePedagogyNav(panel);
          built = true;
          panel.hidden = false;
          laerMerBtn.setAttribute('aria-expanded', 'true');
          laerMerBtn.textContent = t('laer_mer_close');
        }
        laerMerBtn.addEventListener('click', () => {
          if (panel.hidden) {
            if (!built) {
              panel.innerHTML = renderPedagogyPanel(finding.pedagogy, uiLang, finding.rule_id) + panelActionHtml(finding, lang);
              wireMarkButtons(panel, lang);
              wirePedagogyNav(panel);
              built = true;
            }
            panel.hidden = false;
            laerMerBtn.setAttribute('aria-expanded', 'true');
            laerMerBtn.textContent = t('laer_mer_close');
            pedagogyPanelExpanded = true; // Phase 35 (F6)
          } else {
            panel.hidden = true;
            laerMerBtn.setAttribute('aria-expanded', 'false');
            laerMerBtn.textContent = (personalizationEnabled && PERSONAL.isLessonKnown(lang, finding.rule_id)) ? t('laer_mer_known_label') : t('laer_mer_button');
            pedagogyPanelExpanded = false; // Phase 35 (F6)
          }
          // Re-position popover since height changed.
          if (markerAt(activePopoverIdx)) positionPopover(markerAt(activePopoverIdx).rect);
        });
      }
    }

    popover.querySelector('.lh-spell-decline').addEventListener('click', () => {
      // Phase 45-02: a Nei-click on a tentative compound finding doubles as
      // a no-vote (denylist signal). Emit the SEND_REPORT first; the standard
      // dismiss-and-rerun path follows.
      if (finding.tentative === true && finding.rule_id === 'sarskriving-tentative') {
        emitCompoundVote(finding, 'no', lang);
      }
      dismissed.add(dismissKey(finding));
      markPendingAdvance(finding);
      hidePopover();
      runCheck();
    });
    const addWordBtn = popover.querySelector('.lh-spell-add-word');
    if (addWordBtn) addWordBtn.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      await PERSONAL.addWord(lang, finding.original);
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
        if (markerAt(activePopoverIdx)) positionPopover(markerAt(activePopoverIdx).rect);
        const sendBtn = popover.querySelector('.lh-spell-report-send');
        const cancelBtn = popover.querySelector('.lh-spell-report-cancel');
        cancelBtn?.addEventListener('click', () => {
          popover.innerHTML = restoreHtml;
          // Re-attach all popover button listeners on the restored DOM nodes.
          // Decline = Avvis: dismiss this finding and re-run.
          popover.querySelector('.lh-spell-decline')?.addEventListener('click', () => {
            dismissed.add(dismissKey(finding));
            markPendingAdvance(finding);
            hidePopover();
            runCheck();
          });
          // Accept = Fiks (only present when !noAutoFix).
          popover.querySelector('.lh-spell-accept')?.addEventListener('click', () => applyFix(finding));
          // Re-attach Rapporter feil with the saved HTML so a second cancel
          // works too.
          attachReportHandler(popover.querySelector('.lh-spell-report'), restoreHtml);
          if (markerAt(activePopoverIdx)) positionPopover(markerAt(activePopoverIdx).rect);
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
              markPendingAdvance(finding);
              hidePopover();
              runCheck();
            }, 1200);
          });
        });
      });
    }
    attachReportHandler(popover.querySelector('.lh-spell-report'));
    overlay.appendChild(popover);
    // Position from a FRESH rect for this finding (guards against a stale
    // marker rect after scrolling), falling back to the marker's stored rect,
    // then to the input element's own box — never leave the popover
    // unpositioned (it would render at the viewport's top-left corner).
    let pRect = positionForRange(activeEl, finding.start, finding.end);
    if (!pRect) pRect = markerAt(idx)?.rect || null;
    if (!pRect && activeEl) {
      const er = activeEl.getBoundingClientRect();
      pRect = { top: er.top, left: er.left, width: 0, height: 0, bottom: er.top, right: er.left };
    }
    positionPopover(pRect);
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
      nb: 'NB',
      nn: 'NN',
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

    const uiL = (self.__lexiI18n && typeof self.__lexiI18n.getUiLanguage === 'function')
      ? self.__lexiI18n.getUiLanguage() : 'nb';
    if (typeof result === 'string') return result;
    if (result && typeof result[uiL] === 'string') return result[uiL];
    if (result && typeof result.nb === 'string') return result.nb;
    return escapeHtml(typeLabel(finding.type || finding.rule_id));
  }

  // Phase 26: render the Lær mer pedagogy panel from the finding.pedagogy
  // block (DE preposition data sourced via plan 26-01). All text is
  // student-friendly, resolved per-uiLang with nb fallback. Network-silent —
  // every string is on the finding object.
  function renderPedagogyPanel(pedagogy, uiLang, ruleId) {
    return self.__lexiPedagogyRender.renderPedagogyPanelHtml(pedagogy, uiLang, ruleId, {
      t, escapeHtml, escapeAttr, sanitize: sanitizeWarning, wechselAlwaysWarn,
    });
  }

  function positionPopover(rect) {
    if (!popover || !rect) return;
    // Size must be known — force layout.
    const pw = popover.offsetWidth || 240;
    const ph = popover.offsetHeight || 80;
    const margin = 6;
    let top = rect.top - ph - margin;
    if (top < margin) top = rect.bottom + margin + 4; // drop below word if no room above
    // Clamp so popover never extends below the viewport.
    if (top + ph > window.innerHeight - margin) top = window.innerHeight - ph - margin;
    if (top < margin) top = margin;
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
    // Focus mode («Kun det jeg arbeider med») filters findings invisibly —
    // on real sites that made spell-check "look broken" (the web app grew
    // a dedicated indicator row for exactly this; the chip is the
    // extension's equivalent surface). Mirror runCheck's gate: indicator
    // only when the filter actually applies (not in exam mode, where the
    // filter is bypassed).
    const focusOn = !entry && personalizationEnabled && !examMode
      && PERSONAL.isFocusModeEnabled(currentLangCode());
    if (entry) {
      langBadgeEl.textContent = '⏸ ' + formatRemaining(entry.until);
    } else {
      langBadgeEl.textContent = (focusOn ? '🎯 ' : '') + (currentLangCode() || '').toUpperCase();
    }
    if (spellCheckBtn) {
      spellCheckBtn.classList.toggle('lh-focus-on', focusOn);
      spellCheckBtn.title = focusOn
        ? `${t('focus_mode_label')} — ${t('focus_mode_subtitle')}`
        : t('spell_check_btn_title');
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
    // No hard German fallback — when the student hasn't picked a foreign
    // language yet, mirror the popup: show a neutral "Velg fr.språk" placeholder
    // (below) instead of an arbitrary DE pill. Both surfaces read/write the
    // shared studentForeignLang key, so a pick in either place syncs the other.
    const flChosen = !!activeFL;

    const visible = [
      ...SUPPORTED_LANGS.filter(l => l.code === 'nb' || l.code === 'nn' || l.code === 'en'),
      flChosen ? SUPPORTED_LANGS.find(l => l.code === activeFL) : null,
    ].filter(Boolean);

    langFlyout = document.createElement('div');
    langFlyout.className = 'lh-spell-chip-menu';
    // Keep focus in the editable when clicking menu items. Without this, a real
    // click blurs the textarea; onBlur's 250ms timeout then sees focus left the
    // editable (it whitelists the button but not this menu) and tears the menu
    // down via hideButton() → hideLangFlyout(). That broke the inline FL
    // expand and the English→variety reopen (UAT 2.2/2.3) — but ONLY on real
    // clicks; synthetic events don't move focus, so it passed in the playground.
    // Mirrors the popover + dots (which already preventDefault on mousedown).
    langFlyout.addEventListener('mousedown', (e) => e.preventDefault());

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
          const wasCur = cur;
          // switchSpellLanguage is async and closes the flyout when it resolves.
          // Picking English → reopen AFTER it resolves so the Begge/Britisk/
          // Amerikansk row is right there. Reopening before the async close
          // would race and the menu would just shut (UAT 2.3).
          Promise.resolve(switchSpellLanguage(code)).then(() => {
            if (code === 'en' && wasCur !== 'en') showChipMenu();
          });
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
      // No foreign language chosen yet → neutral placeholder that opens the FL
      // submenu (de/es/fr). Picking one persists studentForeignLang, so the
      // popup's FL pill and this one stay in sync.
      if (!flChosen) {
        const placeholder = document.createElement('button');
        placeholder.type = 'button';
        placeholder.className = 'lh-spell-lang-item is-fl is-fl-placeholder';
        placeholder.title = 'Velg fremmedspråket du lærer';
        placeholder.innerHTML = `<span class="lh-spell-lang-label">🌐 Velg fr.språk</span>`;
        placeholder.addEventListener('click', (e) => {
          e.stopPropagation();
          // UAT 2.2: expand INLINE into DE/ES/FR pills (in the chip menu, in
          // context) instead of a detached floating submenu. Picking one
          // persists studentForeignLang (syncs the popup) + switches surface.
          const frag = document.createDocumentFragment();
          for (const flCode of consolidatedFLChoices) {
            const fl = SUPPORTED_LANGS.find((l) => l.code === flCode);
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'lh-spell-lang-item is-fl';
            b.dataset.lang = flCode;
            b.innerHTML = `<span class="lh-spell-lang-code">${flCode.toUpperCase()}</span><span class="lh-spell-lang-label">${fl ? fl.label : flCode.toUpperCase()}</span>`;
            b.addEventListener('click', (ev) => {
              ev.stopPropagation();
              try { chrome.storage.local.set({ studentForeignLang: flCode }); } catch (_) {}
              switchSpellLanguage(flCode);
            });
            frag.appendChild(b);
          }
          placeholder.replaceWith(frag);
        });
        langRow.appendChild(placeholder);
      }
      langSection.appendChild(langRow);
      langFlyout.appendChild(langSection);
    }

    // ── Section: Engelsk stavemåte (only while EN is the active spell
    //    language). Mirrors the settings SELECT — both write the shared
    //    `enSpellingVariety` storage key ('both' | 'br' | 'am'), so changing
    //    it here or in Innstillinger affects both. The storage.onChanged
    //    listener above repaints the check live (no reload). ──
    if (!isPaused && cur === 'en') {
      const varSection = document.createElement('section');
      varSection.className = 'lh-chip-menu-section';
      const varTitle = document.createElement('div');
      varTitle.className = 'lh-chip-menu-title';
      varTitle.textContent = 'Engelsk stavemåte';
      varSection.appendChild(varTitle);
      const varRow = document.createElement('div');
      varRow.className = 'lh-chip-menu-pauserow';
      const activeVar = (enSpellingVariety === 'br' || enSpellingVariety === 'am') ? enSpellingVariety : 'both';
      for (const { val, label } of [
        { val: 'both', label: 'Begge' },
        { val: 'br', label: 'Britisk' },
        { val: 'am', label: 'Amerikansk' },
      ]) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'lh-chip-menu-pause-btn lh-chip-menu-variety-btn' + (val === activeVar ? ' is-active' : '');
        b.textContent = label;
        b.dataset.variety = val;
        b.addEventListener('click', (e) => {
          e.stopPropagation();
          try { chrome.storage.local.set({ enSpellingVariety: val }); } catch (_) {}
          // Reflect the pick immediately; the onChanged listener re-runs the
          // check so the dots update without closing the menu.
          varRow.querySelectorAll('.lh-chip-menu-variety-btn').forEach((btn) => {
            btn.classList.toggle('is-active', btn.dataset.variety === val);
          });
        });
        varRow.appendChild(b);
      }
      varSection.appendChild(varRow);
      langFlyout.appendChild(varSection);
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
        status.textContent = pauseEntry.until === null
          ? 'Pause til du slår den på igjen'
          : `Tilbake om ${formatRemaining(pauseEntry.until)}`;
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
        const doPause = async (hours) => {
          if (pauseApi) await pauseApi.pause(hours);
          hideLangFlyout();
          hideOverlay();
          refreshChipPauseState();
        };
        for (const hours of [1, 4, 24]) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'lh-chip-menu-pause-btn';
          b.textContent = `${hours} t`;
          b.addEventListener('click', (e) => { e.stopPropagation(); doPause(hours); });
          row.appendChild(b);
        }
        pauseSection.appendChild(row);
        // Indefinite pause — ends only when the user resumes (chip, settings
        // list, or the right-click "Gjenoppta" item). null → until:null.
        const foreverBtn = document.createElement('button');
        foreverBtn.type = 'button';
        foreverBtn.className = 'lh-chip-menu-pause-btn lh-chip-menu-pause-forever';
        foreverBtn.textContent = 'Til jeg slår den på igjen';
        foreverBtn.addEventListener('click', (e) => { e.stopPropagation(); doPause(null); });
        pauseSection.appendChild(foreverBtn);
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
    // In-page version stamp — reflects the CONTENT-SCRIPT build actually running
    // on this tab (not the popup's). Reloading the extension doesn't re-inject
    // content scripts into open tabs, so this is the signal that catches "did my
    // reload actually reach the page?" during UAT.
    try {
      const ver = (chrome.runtime && chrome.runtime.getManifest) ? chrome.runtime.getManifest().version : '';
      if (ver) {
        const verEl = document.createElement('div');
        verEl.className = 'lh-chip-menu-version';
        verEl.textContent = 'v' + ver;
        settingsSection.appendChild(verEl);
      }
    } catch (_) { /* no manifest in shim */ }
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
  //
  // F48-2 (Plan 48-02): mirror the seam's full sidecar set when building
  // this independent index. Pre-fix this call passed only `raw + sisterRaw`
  // and hardcoded `bigrams: null, freq: null` — every Ordbank-only NB word
  // was FP-flagged for users with lang.dictionary != lang.spellcheck (e.g.
  // dictionary=de, spellcheck=nb), and nb-typo-fuzzy's Zipf tiebreaker
  // (SC-01) was dead in this path. Lang-gate sets mirror vocab-seam.js's
  // BIGRAM_LANGS / FREQ_LANGS / NON_COMPOUND_PAIRS_LANGS / VALIDWORDS_LANGS;
  // keep these in step with vocab-seam.js when a new sidecar ships.
  const SC_BIGRAM_LANGS = new Set(['nb', 'nn', 'de', 'en', 'es', 'fr']); // v3.0.123: FL bigrams shipped but unloaded — see BIGRAM_LANGS in vocab-seam.js
  const SC_FREQ_LANGS = new Set(['nb', 'nn']);
  const SC_NON_COMPOUND_PAIRS_LANGS = new Set(['nb', 'nn']);
  const SC_STEM_CROSSREF_LANGS = new Set(['nb', 'nn']); // keep in step with STEM_CROSSREF_LANGS in vocab-seam.js
  const SC_VALIDWORDS_LANGS = new Set(['nb', 'nn', 'de', 'es', 'en', 'fr']); // v3.0.128: keep in step with VALIDWORDS_LANGS in vocab-seam.js
  async function loadSpellCheckSidecarFile(filename) {
    try {
      // SC-06: fetch + chrome.runtime.getURL kept on the same line so the
      // network-silence whitelist (line-based) exempts it as a bundled-
      // asset access, not a network call.
      const res = await fetch(chrome.runtime.getURL(`data/${filename}`));
      if (!res.ok) return null;
      return await res.json();
    } catch (_) {
      return null;
    }
  }
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
      // F48-2: load the seam's full sidecar set in parallel so this
      // independent index path matches what initBaseline/buildAndApply build.
      const [bigrams, freq, nonCompoundPairs, validwordsExtra, stemCrossref] = await Promise.all([
        SC_BIGRAM_LANGS.has(lang) ? loadSpellCheckSidecarFile(`bigrams-${lang}.json`) : Promise.resolve(null),
        SC_FREQ_LANGS.has(lang) ? loadSpellCheckSidecarFile(`freq-${lang}.json`) : Promise.resolve(null),
        SC_NON_COMPOUND_PAIRS_LANGS.has(lang) ? loadSpellCheckSidecarFile(`non-compound-pairs.json`) : Promise.resolve(null),
        SC_VALIDWORDS_LANGS.has(lang) ? loadSpellCheckSidecarFile(`validwords-${lang}.json`) : Promise.resolve(null),
        SC_STEM_CROSSREF_LANGS.has(lang) ? loadSpellCheckSidecarFile('nb-nn-stem-crossref.json') : Promise.resolve(null),
      ]);
      const indexes = core.buildIndexes({
        raw, bigrams, freq, sisterRaw, lang, isFeatureEnabled: () => true,
        nonCompoundPairs, validwordsExtra, stemCrossref,
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
        // Persist the chosen FL so the popup's FL pill syncs (shared
        // studentForeignLang key), THEN switch the spell-check surface.
        if (FL_LANGS_SET.has(code)) {
          try { chrome.storage.local.set({ studentForeignLang: code }); } catch (_) {}
        }
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
    const m = markerAt(idx);
    if (m && m.el) {
      m.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    markPendingAdvance(finding);
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
    // NEVER replace across a block boundary. execCommand('insertText') over
    // such a selection does not just edit text — it MERGES the blocks.
    // Measured 2026-08-12: <h1>Hva skjer her nå?</h1><p>Nå skriver…</p>
    // became one <h1> with the paragraph absorbed into it, wrapped in
    // inline spans carrying a hardcoded font-size.
    //
    // The block-separator fix above should stop findings from spanning
    // boundaries in the first place, so this is belt and braces — but it
    // guards the failure mode that actually destroys a pupil's work, and
    // it holds for any FUTURE rule that learns to match across a boundary.
    // Dropping the fix silently would be its own bug, so say why.
    if (rangeCrossesBlocks(range)) {
      warn('fix refused — range crosses a block boundary', {
        rule: finding.rule_id, original: finding.original, fix: finding.fix,
      });
      showToast(t('spell_fix_crosses_block'));
      return;
    }
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
    // Built from the SAME walk readInput() used, so the synthetic block
    // separators it inserted are accounted for here. This function used to
    // run its own SHOW_TEXT walk accumulating textContent lengths, which
    // was correct only while readInput returned bare textContent — the
    // moment the string gained a character the DOM does not contain, the
    // two disagreed and every marker past the first block boundary drifted.
    const { segments } = editableSegments(el);
    const s = locateStart(segments, start);
    const e = locateEnd(segments, end);
    if (!s || !e) return null;
    try {
      const r = document.createRange();
      r.setStart(s.node, s.offset);
      r.setEnd(e.node, e.offset);
      // A reversed range means the span was entirely inside a synthetic
      // separator, i.e. it described a boundary rather than real text.
      // Nothing sensible to point at; refuse rather than return a range
      // the browser will happily misinterpret.
      if (r.collapsed && start !== end) return null;
      return r;
    } catch (_) { return null; }
  }

  /**
   * True when a range spans more than one block element.
   *
   * Kept separate from rangeForOffsets because the answer means different
   * things to its two callers: for a marker rect, spanning blocks is
   * merely ugly; for applyFix it is destructive. See applyFixCE.
   */
  function rangeCrossesBlocks(range) {
    if (!range) return false;
    const blockOf = (node) => {
      let cur = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
      while (cur && !BLOCK_TAGS.has(cur.tagName)) cur = cur.parentElement;
      return cur;
    };
    return blockOf(range.startContainer) !== blockOf(range.endContainer);
  }

  function rectFromCE(el, start, end) {
    const r = rangeForOffsets(el, start, end);
    if (!r) return null;
    // A finding that wraps across a line break — «data maskin» with «data» at
    // the end of one line — has a bounding rect that is the UNION of both line
    // fragments: as wide as the column and two lines tall. Drawn as a marker
    // that is a full-width bar under the wrong line, which is what it looked
    // like. getClientRects() gives one rect per line; take the first, where the
    // finding actually starts. That is also the right anchor for the popover.
    const rects = r.getClientRects();
    const rect = rects.length > 1 ? rects[0] : r.getBoundingClientRect();
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

  // Phase 45-02: emit a compound-vote payload via the existing SEND_REPORT
  // pipeline. Fire-and-forget — the popover dismiss/apply path continues
  // regardless of network. Backend (api/report.js) branches on payload.kind
  // and routes 'compound-vote' to the Firestore compound_votes collection.
  // Privacy: ±20-char surrounding context with rough PII stripping (emails,
  // phone-shaped digit sequences) so debug context isn't a leak vector.
  function emitCompoundVote(finding, vote, surfaceLang) {
    try {
      let surrounding = '';
      if (activeEl) {
        const fullText = (activeEl.value || activeEl.textContent || '');
        surrounding = fullText.slice(
          Math.max(0, finding.start - 20),
          Math.min(fullText.length, finding.end + 20)
        ).replace(/\s+/g, ' ').trim();
        // Coarse PII strip — drop email-shaped and long-digit sequences.
        surrounding = surrounding
          .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, '[email]')
          .replace(/\b\d{4,}\b/g, '[number]');
      }
      const uiLang = (self.__lexiI18n && typeof self.__lexiI18n.getUiLanguage === 'function')
        ? self.__lexiI18n.getUiLanguage() : 'nb';
      const extensionVersion = (typeof chrome !== 'undefined'
        && chrome.runtime && chrome.runtime.getManifest)
        ? (chrome.runtime.getManifest().version || '') : '';
      sendReport({
        kind: 'compound-vote',
        left: finding.left || '',
        right: finding.right || '',
        joined: finding.fix || '',
        linker: finding.linker || '',
        suggestedGender: finding.suggestedGender || null,
        vote: vote,
        surfaceLang: surfaceLang || '',
        uiLang: uiLang,
        context: surrounding,
        extensionVersion: extensionVersion,
        timestamp: Date.now(),
      });
    } catch (_) { /* fire-and-forget */ }
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
      .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
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

  // escapeHtml escapes &, <, >. Attribute values must ALSO escape " since
  // the multi-suggest branch interpolates each suggestion into a data-fix="..."
  // attribute. Layered on top of escapeHtml — same shape as word-prediction.js.
  function escapeAttr(s) {
    return escapeHtml(s).replace(/"/g, '&quot;');
  }

  // Phase 50-06: node-friendly export shim for the pedagogy-markup unit
  // test (`tests/renderer/pedagogy-markup.test.js`). Uses the standard
  // `typeof module !== 'undefined'` guard whitelisted by check-engine-purity
  // (this file isn't an engine, but the idiom is the project's canonical
  // dual-export shape). Browser-side this branch is a no-op.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderPedagogyPanel, sanitizeWarning, escapeHtml };
  }
})();
