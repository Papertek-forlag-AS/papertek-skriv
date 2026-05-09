/**
 * Spell-check rule: Spanish grammar (priority 15).
 *
 * Includes:
 * - muy vs. mucho article mismatch
 *
 * Rule ID: 'es-grammar'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const rule = {
    id: 'es-grammar',
    languages: ['es'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (es-grammar) — Chrome native parity confirmed in 33-03 audit: ES grammar typo bank — single-token lookup against curated form list",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      if (finding.subType === 'muy-mucho') {
        return {
          nb: `Bruk <em>muy</em> foran adjektiv og adverb — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `Bruk <em>muy</em> føre adjektiv og adverb — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          en: `Use <em>muy</em> before adjectives and adverbs — try <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      if (finding.subType === 'mucho-muy') {
        return {
          nb: `Bruk <em>mucho</em> foran substantiv — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `Bruk <em>mucho</em> føre substantiv — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          en: `Use <em>mucho</em> before nouns — try <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      return {
        nb: finding.message,
        nn: finding.message,
        en: finding.message,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const isAdjective = vocab.isAdjective || new Set();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        if (next) {
          const nextWord = next.word;
          
          // 1. mucho + adjective -> muy
          if ((t.word === 'mucho' || t.word === 'mucha' || t.word === 'muchos' || t.word === 'muchas') && isAdjective.has(nextWord)) {
             out.push({
              rule_id: 'es-grammar',
              subType: 'muy-mucho',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'muy'),
              message: `Bruk "muy" foran adjektivet "${next.display}"`,
            });
          }
          
          // 2. muy + noun -> mucho/a/os/as
          if (t.word === 'muy' && nounGenus.has(nextWord)) {
            const genus = nounGenus.get(nextWord);
            // Default to 'mucho' if unknown plural, but this is a good start
            const fix = (genus === 'f') ? 'mucha' : 'mucho';
             out.push({
              rule_id: 'es-grammar',
              subType: 'mucho-muy',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, fix),
              message: `Bruk "mucho" foran substantivet "${next.display}"`,
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
