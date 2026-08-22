/**
 * Spell-check rule: ES ambos/ambas gender agreement (AMBOS-01).
 *
 * Spanish "ambos" (both) agrees in gender with its noun: ambos (m) / ambas (f).
 * Norwegian "begge" is invariant, so students don't inflect it:
 *
 *   Flagged:  "ambos manos"   → "ambas"  (manos is feminine)
 *   Flagged:  "ambas libros"   → "ambos" (libros is masculine)
 *   OK:       "ambas manos"    (agrees)
 *   OK:       "Vinieron ambos." (standalone — no noun follows)
 *
 * Precision-first: ambos/ambas is a CLOSED, unambiguous determiner (no homograph),
 * and the gender comes from nounGenus, so there is no false positive — fires only
 * on ambos/ambas + a noun of the opposite gender.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const FORMS = {
    ambos: { g: 'm', other: 'ambas' },
    ambas: { g: 'f', other: 'ambos' },
  };

  const rule = {
    id: 'es-ambos',
    languages: ['es'],
    priority: 18,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'ambos/ambas gender agreement across two tokens — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `<em>ambos</em> (begge) bøyes etter substantivets kjønn: <em>ambos libros</em> (m), <em>ambas casas</em> (f). Skriv <em>${finding.fix}</em>.`,
      nn: `<em>ambos</em> (begge) vert bøygd etter kjønnet på substantivet: <em>ambos libros</em> (m), <em>ambas casas</em> (f). Skriv <em>${finding.fix}</em>.`,
      en: `<em>ambos</em> (both) agrees with the noun's gender: <em>ambos libros</em> (m), <em>ambas casas</em> (f). Write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const v = ctx.vocab || {};
      const nounGenus = v.nounGenus instanceof Map ? v.nounGenus : null;
      if (!nounGenus || !nounGenus.size) return [];
      const { tokens, text, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i + 1 < tokens.length; i++) {
        const form = FORMS[tokens[i].word];
        if (!form) continue;
        const nounTok = tokens[i + 1];
        const gender = nounGenus.get(nounTok.word);
        if (gender !== 'm' && gender !== 'f') continue;
        if (gender === form.g) continue; // already agrees

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
          fix: typeof matchCase === 'function' ? matchCase(tokens[i].display, form.other) : form.other,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
