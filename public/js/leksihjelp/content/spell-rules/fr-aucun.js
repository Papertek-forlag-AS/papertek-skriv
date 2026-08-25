/**
 * Spell-check rule: FR aucun/aucune gender agreement (AUCUN-01).
 *
 * The French negative determiner "aucun" (no/not any) agrees in gender with its
 * noun: aucun (m) / aucune (f). It is singular. Norwegian/English "ingen/no" is
 * invariant, so learners mismatch it:
 *
 *   Flagged:  "aucun raison"   → "aucune"  (raison is feminine)
 *   Flagged:  "aucune doute"    → "aucun"  (doute is masculine)
 *   OK:       "aucune raison"   (agrees)
 *   OK:       "Aucun ne vient." (pronoun — no noun follows)
 *
 * Precision-first: aucun/aucune is a CLOSED, unambiguous determiner (no
 * homograph), the gender comes from nounGenus, and it fires only before a
 * SINGULAR noun (nounLemmaGenus) of the opposite gender — so no false positive.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const FORMS = {
    aucun: { g: 'm', other: 'aucune' },
    aucune: { g: 'f', other: 'aucun' },
  };

  const rule = {
    id: 'fr-aucun',
    languages: ['fr'],
    priority: 18,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'aucun/aucune gender agreement across two tokens — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `<em>aucun</em> (ingen) bøyes etter substantivets kjønn: <em>aucun doute</em> (m), <em>aucune raison</em> (f). Skriv <em>${finding.fix}</em>.`,
      nn: `<em>aucun</em> (ingen) vert bøygd etter kjønnet på substantivet: <em>aucun doute</em> (m), <em>aucune raison</em> (f). Skriv <em>${finding.fix}</em>.`,
      en: `<em>aucun</em> (no/not any) agrees with the noun's gender: <em>aucun doute</em> (m), <em>aucune raison</em> (f). Write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      const v = ctx.vocab || {};
      const nounGenus = v.nounGenus instanceof Map ? v.nounGenus : null;
      const nounLemmaGenus = v.nounLemmaGenus instanceof Map ? v.nounLemmaGenus : null;
      if (!nounGenus || !nounGenus.size || !nounLemmaGenus) return [];
      const { tokens, text, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i + 1 < tokens.length; i++) {
        const form = FORMS[tokens[i].word];
        if (!form) continue;
        const nounTok = tokens[i + 1];
        const nw = nounTok.word;
        const gender = nounGenus.get(nw);
        if (gender !== 'm' && gender !== 'f') continue;
        if (!nounLemmaGenus.has(nw)) continue;  // singular noun only
        if (gender === form.g) continue;          // already agrees

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
