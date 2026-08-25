/**
 * Spell-check rule: ES apocope before a noun (APOC-01).
 *
 * Several Spanish words MUST shorten (apocopate) directly before a noun:
 *   uno→un, bueno→buen, malo→mal, primero→primer, tercero→tercer,
 *   alguno→algún, ninguno→ningún  (before a MASCULINE singular noun)
 *   grande→gran                   (before ANY singular noun)
 *
 * Norwegian has no equivalent, so learners keep the full form:
 *   Flagged:  "uno libro"    → "un"
 *   Flagged:  "bueno día"     → "buen"
 *   Flagged:  "grande casa"   → "gran"
 *   OK:       "un buen día"    (already apocopated)
 *   OK:       "el libro bueno" (postnominal — not before the noun)
 *   OK:       "Bueno, vamos."  (interjection — not before a noun)
 *   OK:       "Quiero uno."    (pronoun — no following noun)
 *
 * Precision-first: fires only on an apocope word immediately followed by a noun
 * (nounGenus), masculine for the determiner/ordinal set. Postnominal, predicate,
 * pronoun, and interjection uses never have a bare noun next, so they're excluded.
 * Closed-class logic; gender from the shared seam.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  // Apocopate before a masculine singular noun.
  const MASC_APOCOPE = {
    uno: 'un', bueno: 'buen', malo: 'mal',
    primero: 'primer', tercero: 'tercer',
    alguno: 'algún', ninguno: 'ningún',
  };
  // Apocopate before any singular noun (both genders).
  const ANY_APOCOPE = { grande: 'gran' };

  const rule = {
    id: 'es-apocope',
    languages: ['es'],
    priority: 17,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Apocope before a noun across two tokens — syntactic, not single-token spelling',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `På spansk må <em>${finding.original}</em> kortes av rett foran et substantiv: skriv <em>${finding.fix}</em>.`,
      nn: `På spansk må <em>${finding.original}</em> kortast av rett framfor eit substantiv: skriv <em>${finding.fix}</em>.`,
      en: `In Spanish <em>${finding.original}</em> must shorten directly before a noun: write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const v = ctx.vocab || {};
      const nounGenus = v.nounGenus instanceof Map ? v.nounGenus : null;
      if (!nounGenus || !nounGenus.size) return [];
      const isAdjective = v.isAdjective instanceof Set ? v.isAdjective : null;
      const { tokens, text, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const w = tokens[i].word;
        let target = null, requireMasc = false;
        if (MASC_APOCOPE[w]) { target = MASC_APOCOPE[w]; requireMasc = true; }
        else if (ANY_APOCOPE[w]) { target = ANY_APOCOPE[w]; }
        else continue;

        const nounTok = tokens[i + 1];
        const gender = nounGenus.get(nounTok.word);
        if (gender !== 'm' && gender !== 'f') continue;
        if (requireMasc && gender !== 'm') continue;
        // If the next word is also an adjective (público, español, blanco…), the
        // apocope word is a pronoun + adjectival-noun ("uno público" = a public
        // one), not a determiner before a plain noun — skip to avoid a FP.
        if (isAdjective && isAdjective.has(nounTok.word)) continue;

        const gap = text.slice(tokens[i].end, nounTok.start);
        if (/[^ \t]/.test(gap)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i].end) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          start: tokens[i].start,
          end: tokens[i].end,
          original: tokens[i].display,
          fix: typeof matchCase === 'function' ? matchCase(tokens[i].display, target) : target,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
