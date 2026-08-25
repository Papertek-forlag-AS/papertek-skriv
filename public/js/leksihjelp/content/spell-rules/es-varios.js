/**
 * Spell-check rule: ES varios/varias gender agreement (VARIOS-01).
 *
 * Spanish "varios" (several) agrees in gender with its noun: varios (m) / varias
 * (f). It is inherently plural. Norwegian "flere" is invariant, so students don't
 * inflect it:
 *
 *   Flagged:  "varios casas"   → "varias"  (casa is feminine)
 *   Flagged:  "varias libros"   → "varios" (libro is masculine)
 *   OK:       "varias casas"    (agrees)
 *   OK:       "Hay varios."     (standalone — no noun follows)
 *
 * Precision-first: varios/varias is a CLOSED, unambiguous determiner (no
 * homograph), and the gender comes from nounGenus — so there is no false
 * positive; fires only on varios/varias + a noun of the opposite gender.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const FORMS = {
    varios: { g: 'm', other: 'varias' },
    varias: { g: 'f', other: 'varios' },
  };

  const rule = {
    id: 'es-varios',
    languages: ['es'],
    priority: 18,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'varios/varias gender agreement across two tokens — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `<em>varios</em> (flere) bøyes etter substantivets kjønn: <em>varios libros</em> (m), <em>varias casas</em> (f). Skriv <em>${finding.fix}</em>.`,
      nn: `<em>varios</em> (fleire) vert bøygd etter kjønnet på substantivet: <em>varios libros</em> (m), <em>varias casas</em> (f). Skriv <em>${finding.fix}</em>.`,
      en: `<em>varios</em> (several) agrees with the noun's gender: <em>varios libros</em> (m), <em>varias casas</em> (f). Write <em>${finding.fix}</em>.`,
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
