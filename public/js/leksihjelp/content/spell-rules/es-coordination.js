/**
 * Spell-check rule: Spanish coordination (priority 15).
 *
 * In Spanish:
 * - 'y' becomes 'e' before words starting with 'i' or 'hi'.
 * - 'o' becomes 'u' before words starting with 'o' or 'ho'.
 *
 * Rule ID: 'es-coordination'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const rule = {
    id: 'es-coordination',
    languages: ['es'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (es-coordination) — Chrome native parity confirmed in 33-03 audit: ES y/e o/u coordinator swap by next-word phonology; single-token lookup",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      if (finding.subType === 'y-e') {
        return {
          nb: `Bruk <em>e</em> i stedet for <em>y</em> foran ord som starter med i-lyd for å unngå vokalklasj.`,
          nn: `Bruk <em>e</em> i staden for <em>y</em> føre ord som startar med i-lyd for å unngå vokalklasj.`,
          en: `Use <em>e</em> instead of <em>y</em> before words starting with an "i" sound to avoid a vowel clash.`,
        };
      }
      return {
        nb: `Bruk <em>u</em> i stedet for <em>o</em> foran ord som starter med o-lyd for å unngå vokalklasj.`,
        nn: `Bruk <em>u</em> i staden for <em>o</em> føre ord som startar med o-lyd for å unngå vokalklasj.`,
        en: `Use <em>u</em> instead of <em>o</em> before words starting with an "o" sound to avoid a vowel clash.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        if (next) {
          const nextWord = next.word;
          
          if (t.word === 'y' && (nextWord.startsWith('i') || nextWord.startsWith('hi'))) {
            // Exceptions: 'hie' (like 'hierro') uses 'y'
            if (!nextWord.startsWith('hie')) {
              out.push({
                rule_id: 'es-coordination',
                subType: 'y-e',
                priority: rule.priority,
                start: t.start,
                end: t.end,
                original: t.display,
                fix: matchCase(t.display, 'e'),
                message: `Bruk "e" foran "${next.display}"`,
              });
            }
          } else if (t.word === 'o' && (nextWord.startsWith('o') || nextWord.startsWith('ho'))) {
            out.push({
              rule_id: 'es-coordination',
              subType: 'o-u',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'u'),
              message: `Bruk "u" foran "${next.display}"`,
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
