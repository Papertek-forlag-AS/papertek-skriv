/**
 * Spell-check rule: ES ciento→cien apocope (CIEN-01).
 *
 * Spanish "ciento" (100) shortens to "cien" directly before a noun or before
 * mil/millones: "cien euros", "cien personas", "cien mil". The full "ciento" is
 * used only for 101–199 ("ciento uno") and on its own ("el ciento"). Students
 * over-use "ciento":
 *
 *   Flagged:  "ciento euros"   → "cien"
 *   Flagged:  "ciento mil"      → "cien"
 *   OK:       "ciento veinte"   (101–199 — followed by a number word)
 *   OK:       "el ciento"       (the noun "a hundred")
 *   OK:       "por ciento"      (percent)
 *
 * Precision-first: fires only on "ciento" + a noun (nounGenus) or mil/millones,
 * and never after por/el/un/del/al/cada. Deterministic — "ciento + noun" is
 * always wrong.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const BIG_NUMERALS = new Set(['mil', 'millón', 'millon', 'millones']);
  const PRECEDING_SKIP = new Set(['por', 'el', 'un', 'del', 'al', 'cada']);

  const rule = {
    id: 'es-numeral-cien',
    languages: ['es'],
    priority: 17,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'ciento→cien apocope before a noun — two-token syntactic check',
      category: 'grammar-lookup',
    },
    explain: () => ({
      nb: `På spansk kortes <em>ciento</em> ned til <strong>cien</strong> rett foran et substantiv eller <em>mil/millones</em>: <em>cien euros</em>, <em>cien mil</em>. <em>ciento</em> brukes bare for 101–199 og alene.`,
      nn: `På spansk vert <em>ciento</em> korta ned til <strong>cien</strong> rett framfor eit substantiv eller <em>mil/millones</em>: <em>cien euros</em>, <em>cien mil</em>. <em>ciento</em> vert berre brukt for 101–199 og åleine.`,
      en: `In Spanish, <em>ciento</em> shortens to <strong>cien</strong> directly before a noun or <em>mil/millones</em>: <em>cien euros</em>, <em>cien mil</em>. <em>ciento</em> is used only for 101–199 and on its own.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const v = ctx.vocab || {};
      const nounGenus = v.nounGenus instanceof Map ? v.nounGenus : null;
      if (!nounGenus) return [];
      const { tokens, text, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i + 1 < tokens.length; i++) {
        if (tokens[i].word !== 'ciento') continue;
        if (i > 0 && PRECEDING_SKIP.has(tokens[i - 1].word)) continue;

        const next = tokens[i + 1];
        if (!nounGenus.has(next.word) && !BIG_NUMERALS.has(next.word)) continue;

        const gap = text.slice(tokens[i].end, next.start);
        if (/[^ \t]/.test(gap)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i].end) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          start: tokens[i].start,
          end: tokens[i].end,
          original: tokens[i].display,
          fix: typeof matchCase === 'function' ? matchCase(tokens[i].display, 'cien') : 'cien',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
