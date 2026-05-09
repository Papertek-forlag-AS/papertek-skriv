/**
 * Spell-check rule: NB/NN possessive + definite-form noun (priority 13).
 *
 * Flags "possessive pronoun + definite-form noun" — a very common Norwegian
 * student error:
 *   "min bilen" → fix to "min bil" (also mention "bilen min" as alternative)
 *   "hans huset" → fix to "hans hus"
 *
 * Detection: closed set of possessive pronouns followed by a noun whose
 * definite suffix (-en, -a, -et) can be stripped to yield a known stem.
 *
 * Severity: warning (amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const POSSESSIVES = new Set([
    'min', 'mi', 'mitt', 'mine',
    'din', 'di', 'ditt', 'dine',
    'sin', 'si', 'sitt', 'sine',
    'hans', 'hennes',
    'vår', 'vårt', 'våre',
    'deres',
  ]);

  /**
   * Try to strip a definite-singular suffix and return the indefinite stem.
   * Returns null if the word is not a recognised definite-form noun.
   */
  function getIndefiniteStem(word, nounGenus, validWords) {
    for (const suffix of ['et', 'en', 'a']) {
      if (word.length > suffix.length + 1 && word.endsWith(suffix)) {
        const stem = word.slice(0, -suffix.length);
        if (nounGenus.has(stem) || validWords.has(stem)) return stem;
      }
    }
    return null;
  }

  const rule = {
    id: 'nb-possessive-definite',
    languages: ['nb', 'nn'],
    priority: 13,
    severity: 'warning',
    exam: {
      safe: true,
      reason: "Possessive-noun agreement; 2-token lookup; single-token fix",
      category: "grammar-lookup",
    },

    explain: (finding) => {
      const poss = finding.possessive || '';
      return {
        nb: `Etter eiendomsord bruker vi ubestemt form: <em>${escapeHtml(poss)} ${escapeHtml(finding.fix)}</em>, ikke <em>${escapeHtml(poss)} ${escapeHtml(finding.original)}</em>. Du kan også skrive <em>${escapeHtml(finding.original)} ${escapeHtml(poss)}</em>.`,
        nn: `Etter eigedomsord bruker vi ubestemt form: <em>${escapeHtml(poss)} ${escapeHtml(finding.fix)}</em>, ikkje <em>${escapeHtml(poss)} ${escapeHtml(finding.original)}</em>. Du kan også skrive <em>${escapeHtml(finding.original)} ${escapeHtml(poss)}</em>.`,
      };
    },

    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const validWords = vocab.validWords || new Set();
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const poss = tokens[i];
        const noun = tokens[i + 1];

        // Cursor gating on both tokens
        if (cursorPos != null && cursorPos >= poss.start && cursorPos <= poss.end + 1) continue;
        if (cursorPos != null && cursorPos >= noun.start && cursorPos <= noun.end + 1) continue;
        if (suppressed && (suppressed.has(i) || suppressed.has(i + 1))) continue;

        const possLower = poss.word;
        if (!POSSESSIVES.has(possLower)) continue;

        const nounLower = noun.word;
        // Must be a known noun form
        if (!nounGenus.has(nounLower)) continue;

        const stem = getIndefiniteStem(nounLower, nounGenus, validWords);
        if (!stem) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: noun.start,
          end: noun.end,
          original: noun.display,
          fix: matchCase(noun.display, stem),
          possessive: poss.display,
          message: `Eiendomsord + bestemt form: "${poss.display} ${noun.display}" → "${poss.display} ${matchCase(noun.display, stem)}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
