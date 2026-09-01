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
 *   - Node:    module.exports = { runCheck, nextFindingByOffset }
 *   - Browser: self.__lexiSpellCheckEngine = { runCheck, nextFindingByOffset }
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

  /**
   * Kva funn skal «neste» opne etter at eleven har fiksa eller avvist eitt?
   *
   * IKKJE array-indeksen. spell-check-core byggjer findings[] REGEL FOR
   * REGEL — reglane er sorterte på priority, og kvar regel legg sine treff
   * bakerst. Rekkjefølgja er altså pedagogisk, ikkje tekstleg, og den
   * ordninga er berande: dedupeOverlapping held det FØRSTE funnet når to
   * spenn overlappar, og fixture-suiten i Plan 03 festar det. Ho skal ikkje
   * røyrast.
   *
   * Men gjennomgangen skal følgje TEKSTEN. Å gå til findings[i] etter at
   * i vart fjerna, gir det funnet som glei inn i slot i — som kan liggje
   * kvar som helst i dokumentet. Meldt av ein brukar 29.08.2026: popoveren
   * «hoppar» til ei anna setning lenger nede i staden for å halde fram der
   * ein var.
   *
   * Difor: minste `start` som er STØRRE enn der vi var; wrap til det
   * tidlegaste funnet når vi er forbi det siste. Uavgjort held det første
   * array-elementet — der har prioriteten allereie bestemt kven som vann.
   *
   * @param {Array<{start?: number}>} findings
   * @param {number} fromStart  offset til funnet vi kom frå (-1 = frisk start)
   * @returns {number} indeks i findings, eller -1 når det ikkje finst noko
   */
  function nextFindingByOffset(findings, fromStart) {
    if (!Array.isArray(findings) || findings.length === 0) return -1;
    const from = typeof fromStart === 'number' ? fromStart : -1;
    let idx = -1;
    let best = Infinity;
    let wrapIdx = -1;
    let wrapBest = Infinity;
    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      const s = f && f.start;
      // Eit funn utan numerisk start kan ikkje plasserast i teksten. Hopp
      // over det — å la det falle til 0 ville gjort det til «første funn».
      if (typeof s !== 'number' || !Number.isFinite(s)) continue;
      if (s < wrapBest) { wrapBest = s; wrapIdx = i; }
      if (s > from && s < best) { best = s; idx = i; }
    }
    return idx >= 0 ? idx : wrapIdx;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { runCheck, nextFindingByOffset };
  } else if (typeof self !== 'undefined') {
    self.__lexiSpellCheckEngine = { runCheck, nextFindingByOffset };
  }
})();
