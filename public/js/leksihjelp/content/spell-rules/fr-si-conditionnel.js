/**
 * Spell-check rule: FR "si" hypothetical clause takes imperfect, not conditional (FR-25, priority 16).
 *
 * In a French hypothetical, the si-clause (protasis) takes the IMPERFECT, and the
 * main clause (apodosis) takes the CONDITIONAL: "Si j'avais le temps, je viendrais".
 * Norwegian "hvis jeg hadde / skulle" and English "if I would" tempt students to
 * put the conditional in the si-clause: the classic "si j'aurais" error.
 *
 *   Wrong:   "Si j'aurais le temps, je viendrais"  →  "Si j'avais le temps…"
 *   Wrong:   "Si tu pourrais venir"                →  "Si tu pouvais venir"
 *   Correct: "Si j'avais le temps, je viendrais"   →  no flag (imperfect + conditional)
 *   Correct: "Je me demande si je pourrais venir"  →  no flag (si = "whether", not initial)
 *   Correct: "Si, je voudrais bien !"              →  no flag (emphatic "si" = yes)
 *
 * FP-safety is bought with three guards:
 *   1. Sentence-initial "Si" only — interrogative "si = whether" (which legitimately
 *      takes the conditional) almost always follows a verb of asking/knowing, so it is
 *      never sentence-initial.
 *   2. Protasis only — scanning stops at the first comma, so the CORRECT conditional in
 *      the apodosis ("…, je viendrais") is never touched.
 *   3. Comma-after-si skip — "Si, …" is emphatic "yes", not a hypothetical.
 *
 * Conditional forms are recognised from a curated form→imperfect map (top verbs).
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-si-conditionnel'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase: coreMatchCase } = core;

  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original && original[0] >= 'A' && original[0] <= 'Z') {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  // Conditional form → imperfect counterpart (protasis correction). Top verbs.
  const COND_TO_IMPARFAIT = new Map(Object.entries({
    aurais: 'avais', aurait: 'avait', auraient: 'avaient', aurions: 'avions', auriez: 'aviez',
    serais: 'étais', serait: 'était', seraient: 'étaient', serions: 'étions', seriez: 'étiez',
    irais: 'allais', irait: 'allait', iraient: 'allaient', irions: 'allions', iriez: 'alliez',
    ferais: 'faisais', ferait: 'faisait', feraient: 'faisaient', ferions: 'faisions', feriez: 'faisiez',
    voudrais: 'voulais', voudrait: 'voulait', voudraient: 'voulaient',
    pourrais: 'pouvais', pourrait: 'pouvait', pourraient: 'pouvaient',
    devrais: 'devais', devrait: 'devait', devraient: 'devaient',
    saurais: 'savais', saurait: 'savait', sauraient: 'savaient',
    viendrais: 'venais', viendrait: 'venait', viendraient: 'venaient',
    aimerais: 'aimais', aimerait: 'aimait', aimeraient: 'aimaient',
    prendrais: 'prenais', prendrait: 'prenait',
  }));

  // Elided je + vowel-initial conditional (single token "j'aurais").
  const ELIDED_COND = new Map(Object.entries({
    "j'aurais": "j'avais", "j'irais": "j'allais", "j'aimerais": "j'aimais",
  }));

  const SUBJECTS = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles']);

  function normApos(w) { return w.replace(/’/g, "'"); }

  function isSentenceInitial(text, startPos) {
    const before = text.slice(0, startPos).replace(/\s+$/, '');
    if (before === '') return true;
    return /[.!?\n…]$/.test(before);
  }

  const rule = {
    id: 'fr-si-conditionnel',
    languages: ['fr'],
    priority: 16,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Hypothetical si-clause takes imperfect, not conditional — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `I en <em>si</em>-setning (hypotese) bruker fransk <strong>imperfektum</strong>, ikke kondisjonalis: <em>${finding.fix}</em>, ikke <em>${finding.original}</em>. Kondisjonalis hører hjemme i hovedsetningen.`,
      nn: `I ei <em>si</em>-setning (hypotese) brukar fransk <strong>imperfektum</strong>, ikkje kondisjonalis: <em>${finding.fix}</em>, ikkje <em>${finding.original}</em>. Kondisjonalis høyrer heime i hovudsetninga.`,
      en: `In a hypothetical <em>si</em>-clause French uses the <strong>imperfect</strong>, not the conditional: <em>${finding.fix}</em>, not <em>${finding.original}</em>. The conditional belongs in the main clause.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const si = tokens[i];
        if (si.word.toLowerCase() !== 'si') continue;
        if (!isSentenceInitial(text, si.start)) continue;

        // Emphatic "Si, …" (yes) — comma immediately after si.
        if (text.slice(si.end, tokens[i + 1].start).indexOf(',') !== -1) continue;

        // Scan the protasis only: stop at the first comma (apodosis boundary) or
        // after a small window. Flag the first conditional form found.
        for (let j = i + 1; j < tokens.length && j <= i + 4; j++) {
          if (j > i + 1 && text.slice(tokens[j - 1].end, tokens[j].start).indexOf(',') !== -1) break;

          const tok = tokens[j];
          if (cursorPos != null && cursorPos >= tok.start && cursorPos <= tok.end + 1) break;

          const w = normApos(tok.word.toLowerCase());

          if (ELIDED_COND.has(w)) {
            const imp = ELIDED_COND.get(w);
            findings.push(makeFinding(rule, tok, text, imp));
            break;
          }
          if (SUBJECTS.has(w)) continue;
          if (COND_TO_IMPARFAIT.has(w)) {
            const imp = COND_TO_IMPARFAIT.get(w);
            findings.push(makeFinding(rule, tok, text, imp));
            break;
          }
          // A non-subject, non-conditional token inside the protasis: keep scanning
          // (the verb may follow an adverb), bounded by the i+4 window.
        }
      }

      return findings;

      function makeFinding(rule, tok, text, replacement) {
        const orig = text.slice(tok.start, tok.end);
        return {
          rule_id: rule.id,
          priority: rule.priority,
          start: tok.start,
          end: tok.end,
          original: orig,
          fix: matchCase(orig, replacement),
        };
      }
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
