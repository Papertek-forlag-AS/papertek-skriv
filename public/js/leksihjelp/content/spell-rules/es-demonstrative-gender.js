/**
 * Spell-check rule: ES demonstrative gender agreement (DEM-01).
 *
 * Spanish demonstratives agree with the noun in gender and number:
 * este/esta/estos/estas, ese/esa/esos/esas, aquel/aquella/aquellos/aquellas.
 * Norwegian "denne/dette/disse" maps differently, so students mis-gender:
 *
 *   Flagged:  "Este casa."    → "Esta"
 *   Flagged:  "Esa problema."  → "Ese"   (problema is masculine)
 *   OK:       "Esta casa."     (agrees)
 *   OK:       "Esta agua."     (agua is feminine with demonstratives)
 *   OK:       "Este es mío."   (este is a pronoun — no following noun)
 *   OK:       "Este artista."  (epicene -ista noun — gender ambiguous, skipped)
 *
 * Mirrors es-fr-gender (article gender) for demonstratives. Gender comes from
 * nounGenus (data). Epicene nouns (-ista/-ante/-ente: artista, estudiante,
 * cliente) are skipped because nounGenus carries only one default gender, so
 * "esta artista" (valid feminine) must not be flagged. Demonstrative pronoun
 * uses are excluded by requiring a following noun.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  // demonstrative form → { family, number, gender }
  const DEMS = {
    este: { fam: 'e', n: 'sg', g: 'm' }, esta: { fam: 'e', n: 'sg', g: 'f' },
    estos: { fam: 'e', n: 'pl', g: 'm' }, estas: { fam: 'e', n: 'pl', g: 'f' },
    ese: { fam: 's', n: 'sg', g: 'm' }, esa: { fam: 's', n: 'sg', g: 'f' },
    esos: { fam: 's', n: 'pl', g: 'm' }, esas: { fam: 's', n: 'pl', g: 'f' },
    aquel: { fam: 'a', n: 'sg', g: 'm' }, aquella: { fam: 'a', n: 'sg', g: 'f' },
    aquellos: { fam: 'a', n: 'pl', g: 'm' }, aquellas: { fam: 'a', n: 'pl', g: 'f' },
  };
  const FORM = {
    e: { m: { sg: 'este', pl: 'estos' }, f: { sg: 'esta', pl: 'estas' } },
    s: { m: { sg: 'ese', pl: 'esos' }, f: { sg: 'esa', pl: 'esas' } },
    a: { m: { sg: 'aquel', pl: 'aquellos' }, f: { sg: 'aquella', pl: 'aquellas' } },
  };
  // Epicene / common-gender suffixes — gender is referent-dependent, so a single
  // nounGenus default would cause false positives. Skip them.
  const EPICENE = /(?:ista|ante|ente)$/;

  const rule = {
    id: 'es-demonstrative-gender',
    languages: ['es'],
    priority: 16,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Demonstrative–noun gender agreement across two tokens — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Spanske påpekende ord (<em>este, ese, aquel</em>…) bøyes etter substantivets kjønn og tall. Her må <em>${finding.original}</em> bli <em>${finding.fix}</em>.`,
      nn: `Spanske påpeikande ord (<em>este, ese, aquel</em>…) vert bøygde etter kjønn og tal på substantivet. Her må <em>${finding.original}</em> bli <em>${finding.fix}</em>.`,
      en: `Spanish demonstratives (<em>este, ese, aquel</em>…) agree with the noun's gender and number. Here <em>${finding.original}</em> must become <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const v = ctx.vocab || {};
      const nounGenus = v.nounGenus instanceof Map ? v.nounGenus : null;
      if (!nounGenus || !nounGenus.size) return [];
      const { tokens, text, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const dem = DEMS[tokens[i].word];
        if (!dem) continue;

        const nounTok = tokens[i + 1];
        const gender = nounGenus.get(nounTok.word);
        if (gender !== 'm' && gender !== 'f') continue;
        if (gender === dem.g) continue;            // already agrees
        if (EPICENE.test(nounTok.word)) continue;  // epicene — ambiguous gender

        const gap = text.slice(tokens[i].end, nounTok.start);
        if (/[^ \t]/.test(gap)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i].end) continue;

        const target = FORM[dem.fam][gender][dem.n];
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
