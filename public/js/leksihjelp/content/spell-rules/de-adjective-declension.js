/**
 * Spell-check rule: DE predicative adjective declension (ADJDECL-DE-01).
 *
 * German predicative adjectives — those after sein/werden/bleiben — take NO
 * ending: "Das Haus ist groß", never "*großes". (Attributive adjectives before a
 * noun DO inflect: "ein großes Haus".) Norwegian/English learners over-apply the
 * attributive ending:
 *
 *   Flagged:  "Das Haus ist großes."   → "groß"
 *   Flagged:  "Der Mann ist alte."      → "alt"
 *   OK:       "Das ist ein großes Haus." (attributive — noun follows)
 *   OK:       "Das Haus ist groß."        (already uninflected)
 *   OK:       "Wir sind viele."           (quantifier predicate — excluded)
 *
 * This rule covers only the clean PREDICATIVE slice of declension (full
 * attributive declension is case×gender×article-dependent and lesson-only). Map
 * is deAdjPredicativeMap (inflected positive form → lemma), built in the seam from
 * the adjective bank; -er forms and quantifier/adverbial homographs are excluded
 * there. Precision gates: the adjective must be lowercase (German adjectives are;
 * nouns are capitalised) and in predicative position — nothing that looks like a
 * noun (capitalised or in nounGenus) or another adjective may follow. Verified
 * 0 FP across the full DE example corpus.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  // Forms of sein / werden / bleiben that introduce a predicative complement.
  const COPULA = new Set([
    'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart', 'sei', 'wäre', 'wären',
    'werde', 'wirst', 'wird', 'werden', 'werdet', 'wurde', 'wurden',
    'bleibe', 'bleibst', 'bleibt', 'bleiben', 'blieb', 'blieben', 'bleib',
  ]);
  const UPPER_INITIAL = /^[A-ZÄÖÜ]/;

  const rule = {
    id: 'de-adjective-declension',
    languages: ['de'],
    priority: 17,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Predicative adjective must be uninflected — multi-token syntactic check',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Tyske adjektiv etter <em>sein/werden/bleiben</em> (predikativ) får <strong>ingen</strong> endelse: <em>Das Haus ist groß</em>, ikke «großes». Skriv <em>${finding.fix}</em>.`,
      nn: `Tyske adjektiv etter <em>sein/werden/bleiben</em> (predikativ) får <strong>inga</strong> ending: <em>Das Haus ist groß</em>, ikkje «großes». Skriv <em>${finding.fix}</em>.`,
      en: `German adjectives after <em>sein/werden/bleiben</em> (predicative) take <strong>no</strong> ending: <em>Das Haus ist groß</em>, not "großes". Write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'de') return [];
      const v = ctx.vocab || {};
      const map = v.deAdjPredicativeMap instanceof Map ? v.deAdjPredicativeMap : null;
      if (!map || !map.size) return [];
      const nounGenus = v.nounGenus instanceof Map ? v.nounGenus : new Map();
      const isAdjective = v.isAdjective instanceof Set ? v.isAdjective : new Set();
      const { tokens, text, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i + 1 < tokens.length; i++) {
        if (!COPULA.has(tokens[i].word)) continue;
        const a = tokens[i + 1];
        if (!a.display || UPPER_INITIAL.test(a.display)) continue; // adjective is lowercase
        const lemma = map.get(a.word);
        if (!lemma) continue;

        // Predicative = nothing noun-like or adjective-like follows.
        const nxt = tokens[i + 2];
        if (nxt) {
          if (nxt.display && UPPER_INITIAL.test(nxt.display)) continue; // capitalised → noun
          if (nounGenus.has(nxt.word)) continue;                        // noun → attributive
          if (map.has(nxt.word) || isAdjective.has(nxt.word)) continue; // adjective chain
        }

        const gap = text.slice(tokens[i].end, a.start);
        if (/[^ \t]/.test(gap)) continue;
        if (cursorPos != null && cursorPos >= a.start && cursorPos <= a.end) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          start: a.start,
          end: a.end,
          original: a.display,
          fix: typeof matchCase === 'function' ? matchCase(a.display, lemma) : lemma,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
