/**
 * Spell-check rule: English Grammar (priority 20).
 *
 * Catch-all for two narrow exam-safe patterns not owned by another rule:
 *   - "I" capitalization (lone lowercase i)
 *   - Modal-verb base form (must run / can swim — not "must runs")
 *
 * The a/an logic was moved to the dedicated `en-a-an` rule (priority 9)
 * and subject-verb agreement to `en-subject-verb` (priority 14). Those
 * specialised rules fire first and own their respective categories.
 *
 * Rule ID: 'en-grammar'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const MODAL_VERBS = new Set(['can', 'could', 'must', 'shall', 'should', 'will', 'would', 'may', 'might']);

  const rule = {
    id: 'en-grammar',
    languages: ['en'],
    priority: 20,
    exam: {
      safe: true,
      reason: "Basic morphology and capitalization (en-grammar) — matches native browser spellcheck behavior.",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      if (finding.subType === 'i-capitalization') {
        return {
          nb: `Personlig pronomen «I» (jeg) skal alltid ha stor forbokstav på engelsk.`,
          nn: `Personleg pronomen «I» (eg) skal alltid ha stor førebokstav på engelsk.`,
          en: `The personal pronoun "I" must always be capitalized in English.`,
        };
      }
      if (finding.subType === 'modal') {
        return {
          nb: `Etter modalverb (som <em>${escapeHtml(finding.modal)}</em>) skal verbet stå i grunnform — bruk <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `Etter modalverb (som <em>${escapeHtml(finding.modal)}</em>) skal verbet stå i grunnform — bruk <em>${escapeHtml(finding.fix)}</em>.`,
          en: `After modal verbs (like <em>${escapeHtml(finding.modal)}</em>), use the base form — try <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      return { nb: finding.message, nn: finding.message, en: finding.message };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const verbInfinitive = vocab.verbInfinitive || new Map();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        // 1. "I" Capitalization
        if (t.word === 'i' && t.display === 'i') {
          out.push({
            rule_id: 'en-grammar', subType: 'i-capitalization', priority: rule.priority,
            start: t.start, end: t.end, original: t.display, fix: 'I', suggestion: 'I',
            message: 'Stor "I": Pronomenet "I" skal alltid ha stor forbokstav.',
          });
        }

        // 2. Modal Verb Form (basic)
        if (MODAL_VERBS.has(t.word) && next && verbInfinitive.has(next.word)) {
          const inf = verbInfinitive.get(next.word);
          if (inf && inf !== next.word) {
            const isInflected = next.word.endsWith('s') || next.word.endsWith('ed') || next.word.endsWith('ing');
            if (isInflected) {
               out.push({
                rule_id: 'en-grammar', subType: 'modal', priority: rule.priority,
                start: next.start, end: next.end, original: next.display, modal: t.display,
                fix: matchCase(next.display, inf), suggestion: matchCase(next.display, inf),
                message: `Etter "${t.display}" skal verbet stå i grunnform: "${inf}"`,
              });
            }
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
