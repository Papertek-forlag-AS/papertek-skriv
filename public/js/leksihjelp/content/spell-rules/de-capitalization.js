/**
 * Spell-check rule: German noun capitalization (priority 20).
 *
 * German nouns must always start with a capital letter. This rule flags
 * tokens found in the nounGenus index that start with a lowercase letter.
 *
 * Rule ID: 'de-capitalization'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Idiomatic predicate-noun phrases where lowercase is also accepted.
  // "recht haben" (be right), "angst haben" (be afraid), "schuld sein" (be
  // at fault), "leid tun" (feel sorry) are conventional fixed expressions
  // — flagging them disrupts students. Both lowercase and capitalized are
  // valid post-2006 reform. The auxiliary verb (haben/sein/tun) typically
  // appears immediately before the noun in main clauses ("Du hast recht")
  // and after it in subordinate clauses ("dass sie recht hat").
  const IDIOM_NOUN_PARTNERS = {
    recht:  new Set(['haben', 'hat', 'hatte', 'hatten', 'hattest', 'hattet', 'hast', 'habt', 'habe', 'hätte', 'hätten', 'hättest', 'hättet']),
    angst:  new Set(['haben', 'hat', 'hatte', 'hatten', 'hattest', 'hattet', 'hast', 'habt', 'habe']),
    schuld: new Set(['sein', 'ist', 'war', 'waren', 'bist', 'bin', 'sind']),
    leid:   new Set(['tun', 'tut', 'tat', 'taten']),
  };

  const rule = {
    id: 'de-capitalization',
    languages: ['de'],
    priority: 20,
    exam: {
      safe: true,
      reason: "Token-level capitalization correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `<em>${escapeHtml(finding.original)}</em> er et substantiv. På tysk skal alle substantiv ha stor forbokstav — prøv <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `<em>${escapeHtml(finding.original)}</em> er eit substantiv. På tysk skal alle substantiv ha stor førebokstav — prøv <em>${escapeHtml(finding.fix)}</em>.`,
      en: `<em>${escapeHtml(finding.original)}</em> is a noun. In German, all nouns must be capitalized — try <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        // If it's in the noun dictionary and starts with a lowercase letter
        if (nounGenus.has(t.word)) {
          // Skip idiomatic predicate-noun phrases where lowercase is conventional.
          const partners = IDIOM_NOUN_PARTNERS[t.word];
          if (partners) {
            const prev = tokens[i - 1];
            const next = tokens[i + 1];
            if ((prev && partners.has(prev.word)) || (next && partners.has(next.word))) continue;
          }
          const firstChar = t.display[0];
          if (firstChar && firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase()) {
            const capitalized = t.display[0].toUpperCase() + t.display.slice(1);
            out.push({
              rule_id: 'de-capitalization',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: capitalized,
              message: `Stor forbokstav: "${t.display}" → "${capitalized}"`,
            });
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
