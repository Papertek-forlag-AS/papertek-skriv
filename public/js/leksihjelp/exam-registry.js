/**
 * Leksihjelp — Exam-Mode Surface Registry
 *
 * Phase 27 (Exam Mode). Single source of truth for non-rule user-visible
 * surfaces (dictionary popup, conjugation tables, TTS, word prediction,
 * pedagogy panel, side panel, grammar-features popover, popup search).
 * Spell-check rules carry their own `exam` marker on the rule object pushed
 * to `host.__lexiSpellRules`; this registry covers everything that is NOT a
 * spell-check rule.
 *
 * Policy (Phase 27, post-UAT round 1):
 *   "Static reference information is allowed during exam; answer-generating
 *    surfaces are not." A printed dictionary on the desk would be allowed,
 *    so the digital equivalent is too. Live writing assistance (word
 *    prediction) and active grammar feedback (Lær mer pedagogy with worked
 *    examples) are not.
 *
 * Allowed in exam mode (safe: true):
 *   popup.search, popup.conjugationTable, popup.ttsButton,
 *   popup.grammarFeaturesPopover, widget.dictionary, widget.conjugation,
 *   widget.tts, sidePanel.fest
 *
 * Suppressed in exam mode (safe: false):
 *   wordPrediction.dropdown, widget.pedagogyPanel
 *
 * Marker shape (matches the rule-side contract from CONTEXT.md):
 *   { id: string, exam: { safe: boolean, reason: string, category: string } }
 *
 * Categories (closed set, mirrors rule-side): 'spellcheck', 'grammar-lookup',
 * 'dictionary', 'tts', 'prediction', 'pedagogy', 'popup', 'widget'.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;

  host.__lexiExamRegistryVersion = 2;

  host.__lexiExamRegistry = Object.freeze([
    Object.freeze({
      id: 'popup.search',
      exam: Object.freeze({
        safe: true,
        reason: 'Dictionary lookup is static reference material — equivalent to a printed dictionary, allowed during exam',
        category: 'dictionary',
      }),
    }),
    Object.freeze({
      id: 'popup.conjugationTable',
      exam: Object.freeze({
        safe: true,
        reason: 'Conjugation tables are static reference material, allowed during exam',
        category: 'dictionary',
      }),
    }),
    Object.freeze({
      id: 'popup.ttsButton',
      exam: Object.freeze({
        safe: true,
        reason: 'TTS playback pronounces existing words; pronunciation aid is allowed during exam',
        category: 'tts',
      }),
    }),
    Object.freeze({
      id: 'popup.grammarFeaturesPopover',
      exam: Object.freeze({
        safe: true,
        reason: 'Grammar-features popover is configuration UI for which features render in the dictionary view; static descriptions, allowed during exam',
        category: 'pedagogy',
      }),
    }),
    Object.freeze({
      id: 'widget.dictionary',
      exam: Object.freeze({
        safe: true,
        reason: 'Floating-widget inline dictionary lookup is the same static reference as popup.search, allowed during exam',
        category: 'dictionary',
      }),
    }),
    Object.freeze({
      id: 'widget.conjugation',
      exam: Object.freeze({
        safe: true,
        reason: 'Floating-widget conjugation surface is static reference material, allowed during exam',
        category: 'dictionary',
      }),
    }),
    Object.freeze({
      id: 'widget.tts',
      exam: Object.freeze({
        safe: true,
        reason: 'Floating-widget TTS button is pronunciation aid for existing words, allowed during exam',
        category: 'tts',
      }),
    }),
    Object.freeze({
      id: 'widget.pedagogyPanel',
      exam: Object.freeze({
        safe: false,
        reason: 'Lær mer pedagogy panel surfaces worked examples and grammatical explanations that can leak answers to grammar exam tasks',
        category: 'pedagogy',
      }),
    }),
    Object.freeze({
      id: 'wordPrediction.dropdown',
      exam: Object.freeze({
        safe: false,
        reason: 'Autocomplete suggestions actively generate writing for the student — answer-generating, not allowed during exam',
        category: 'prediction',
      }),
    }),
    Object.freeze({
      id: 'sidePanel.fest',
      exam: Object.freeze({
        safe: true,
        reason: 'Festet side-panel is the same dictionary surface as the popup; static reference, allowed during exam',
        category: 'dictionary',
      }),
    }),
  ]);

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = host.__lexiExamRegistry;
  }
})();
