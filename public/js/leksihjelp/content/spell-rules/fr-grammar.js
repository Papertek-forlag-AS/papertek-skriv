/**
 * Spell-check rule: French grammar (priority 15).
 *
 * Includes:
 * - mon/ton/son before feminine nouns starting with a vowel
 *
 * Rule ID: 'fr-grammar'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const POSSESSIVE_FIX = {
    'ma': 'mon',
    'ta': 'ton',
    'sa': 'son'
  };

  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

  const rule = {
    id: 'fr-grammar',
    languages: ['fr'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (fr-grammar) — Chrome native parity confirmed in 33-03 audit: FR grammar typo bank — single-token lookup against curated form list",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Bruk <em>${escapeHtml(finding.fix)}</em> i stedet for <em>${escapeHtml(finding.original)}</em> foran ord som starter med vokal for å unngå vokalklasj.`,
      nn: `Bruk <em>${escapeHtml(finding.fix)}</em> i staden for <em>${escapeHtml(finding.original)}</em> føre ord som startar med vokal for å unngå vokalklasj.`,
      en: `Use <em>${escapeHtml(finding.fix)}</em> instead of <em>${escapeHtml(finding.original)}</em> before words starting with a vowel to avoid a vowel clash.`,
    }),
    check(ctx) {
      const { tokens, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        if (POSSESSIVE_FIX[t.word] && next) {
          const nextWord = next.word;
          const startsWithVowelOrH = VOWELS.has(nextWord[0]) || nextWord[0] === 'h';
          
          if (startsWithVowelOrH) {
            const fix = POSSESSIVE_FIX[t.word];
            out.push({
              rule_id: 'fr-grammar',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, fix),
              suggestion: matchCase(t.display, fix),
              message: `Bruk "${fix}" foran vokal: "${fix} ${next.display}"`,
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
