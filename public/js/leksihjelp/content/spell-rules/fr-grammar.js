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

      // v3.0.121 (synthetic-corpus probe "des magasins ou il y a" scored 0):
      // ou (or) vs où (where). High-precision context: "ou il y a" — the
      // existential continuation only fits the place adverb.
      for (let i = 0; i < tokens.length - 2; i++) {
        if (tokens[i].word !== 'ou') continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i].end + 1) continue;
        if (tokens[i + 1].word === 'il' && tokens[i + 2].word === 'y') {
          out.push({
            rule_id: 'fr-grammar',
            priority: rule.priority,
            start: tokens[i].start,
            end: tokens[i].end,
            original: tokens[i].display,
            fix: matchCase(tokens[i].display, 'où'),
            subType: 'ou-ou',
            message: `«${tokens[i].display}» → «où» (stedsadverb — «ou» betyr «eller»)`,
            severity: 'error',
          });
        }
      }

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        if (POSSESSIVE_FIX[t.word] && next) {
          const nextWord = next.word;
          // Strip the accent off the first letter — accented vowels (é/è/ê/à/î/ô/ù/…)
          // are vowels too, so "ta école"→"ton école", "ma âme"→"mon âme" must
          // trigger. Without this the rule only fired before bare a/e/i/o/u/y.
          const firstChar = (nextWord[0] || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
          const startsWithVowelOrH = VOWELS.has(firstChar) || firstChar === 'h';
          
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
