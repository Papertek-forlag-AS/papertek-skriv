/**
 * Leksihjelp — Spell-Check Engine (Phase 43-01)
 *
 * Pure-logic surface for the spell-check pipeline. Owns the runCheck()
 * composition that was previously inlined in spell-check.js (the DOM
 * adapter): given raw text, a vocab indexes object, and prefs, run the
 * underlying rule registry (`spell-check-core.check`) and apply the
 * post-process filters (dismissed-finding suppression, exam-mode rule
 * filter) before returning the final findings list.
 *
 * Engine signature:
 *   runCheck(text, vocab, prefs) → findings[]
 *
 *   text   — string (raw input text)
 *   vocab  — pre-built indexes object (caller assembles this from the
 *            VOCAB seam in the renderer; engine does not look up globals)
 *   prefs  — {
 *     cursorPos       : number | undefined,
 *     lang            : 'nb' | 'nn' | 'en' | 'de' | 'es' | 'fr',
 *     core            : { check(text, vocab, opts) → findings[] }   // injected
 *     examMode        : boolean,                                     // optional
 *     ruleRegistry    : Array<{ id, exam? }> | null,                 // optional
 *     examApi         : { isRuleSafe(rule, examOn) } | null,         // optional
 *     dismissed       : Set<string>,                                 // optional
 *     dismissKey      : (finding) => string                          // optional
 *   }
 *
 * Findings shape (passthrough from core):
 *   { rule_id, start, end, fix, message, severity, priority_band, ... }
 *
 * Dual-export footer (mirrors spell-check-core.js exactly):
 *   - Node:    module.exports = { runCheck }
 *   - Browser: self.__lexiSpellCheckEngine = { runCheck }
 *
 * Purity contract (enforced by scripts/check-engine-purity.js):
 *   - No DOM references (document, window, getElementById, querySelector, …)
 *   - No chrome.* references (no chrome.runtime, chrome.storage, …)
 *   - No CSS class string literals (lh-spell-*)
 *   - The dual-export footer's `typeof self !== 'undefined'` and
 *     `typeof module !== 'undefined'` checks are whitelisted by the gate.
 *
 * Why pure: lockdown's chrome-API shim doesn't fully cover all extension
 * APIs; per-surface engine must work behind the shim. Mirroring
 * spell-check-core.js's dual-export footer keeps the extension/Node
 * loading contract identical to the existing pattern (Phase 43 CONTEXT).
 */

(function () {
  'use strict';

  /**
   * Run the spell-check pipeline.
   * @param {string} text - Raw input text to check.
   * @param {object} vocab - Pre-built vocab indexes (Maps + Sets).
   * @param {object} prefs - { cursorPos, lang, core, examMode?, ruleRegistry?, examApi?, dismissed?, dismissKey? }
   * @returns {Array<object>} findings - Filtered findings array.
   */
  function runCheck(text, vocab, prefs) {
    if (!text || typeof text !== 'string') return [];
    if (!prefs || !prefs.core || typeof prefs.core.check !== 'function') return [];

    const lang = prefs.lang;
    const supported = ['nb', 'nn', 'en', 'de', 'es', 'fr'];
    if (!supported.includes(lang)) return [];

    let findings = prefs.core.check(text, vocab, { cursorPos: prefs.cursorPos, lang }) || [];

    // Legacy-UI shim: alias rule_id → type so existing renderer code that
    // reads `f.type` keeps working. The fixture-harness contract uses
    // `rule_id`; mismatched names silently fail.
    for (const f of findings) f.type = f.rule_id;

    // Dismissed-finding filter (renderer maintains the dismissed set).
    if (prefs.dismissed && prefs.dismissKey) {
      findings = findings.filter(f => !prefs.dismissed.has(prefs.dismissKey(f)));
    }

    // Phase 27: exam-mode rule filter. Drops findings whose source rule has
    // exam.safe = false when examMode is on. Dual-marker rules (rule.exam.safe
    // = true but rule.explain.exam.safe = false) keep the dot but the
    // popover-render gate (in renderer's showPopover) hides Lær mer + explain.
    if (prefs.examMode && prefs.examApi && prefs.ruleRegistry) {
      const ruleById = new Map();
      for (const r of prefs.ruleRegistry) {
        if (r && r.id) ruleById.set(r.id, r);
      }
      findings = findings.filter(f => {
        const rule = ruleById.get(f.rule_id);
        if (!prefs.examApi.isRuleSafe(rule, true)) return false;
        // Udir parity: the exam-mode spell surface is spelling-only — no
        // grammar. AND the spelling-category gate so a finding survives only if
        // it is BOTH exam-safe AND a spellcheck-category rule.
        if (typeof prefs.examApi.isRuleExamSpelling === 'function') {
          return prefs.examApi.isRuleExamSpelling(rule, true);
        }
        return true; // defensive: older examApi without the predicate
      });
    }

    return findings;
  }

  // Dual-export footer. Mirrors spell-check-core.js exactly — Node gets
  // module.exports, browser gets self.__lexiSpellCheckEngine.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runCheck };
  } else if (typeof self !== 'undefined') {
    self.__lexiSpellCheckEngine = { runCheck };
  }
})();
