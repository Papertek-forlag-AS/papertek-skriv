/**
 * Spell-check rule: NB transitive/intransitive verb-pair advisory (TRANSINTR-01).
 *
 * Some Norwegian verbs have TWO preteritum forms by transitivity:
 *   henge:  intransitiv «hang» (bildet hang)  /  transitiv «hengte» (jeg hengte bildet)
 *   brenne: intransitiv «brant» (huset brant) /  transitiv «brente» (jeg brente veden)
 *
 * This rule is purely ADVISORY (severity hint, no auto-fix): it does NOT decide
 * whether the student picked the right one — it just nudges them to learn the
 * distinction and opens the paired Lær mer lesson. Like the double-definiteness
 * advisory and the V2 explainer: tells, doesn't rewrite.
 *
 * Closed set (the two clean trans/intrans pairs — same set the dictionary labels;
 * skinne/vinne dual forms are other phenomena and excluded).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  // form → { lemma, intrans, trans } (the preteritum pair for that lemma)
  const PAIRS = {
    henge:  { intrans: 'hang',  trans: 'hengte', intransEx: 'bildet hang på veggen', transEx: 'jeg hengte bildet på veggen' },
    brenne: { intrans: 'brant', trans: 'brente', intransEx: 'huset brant ned', transEx: 'jeg brente veden' },
  };
  const FORMS = {};
  for (const [lemma, p] of Object.entries(PAIRS)) {
    FORMS[p.intrans] = { lemma, role: 'intransitiv', p };
    FORMS[p.trans] = { lemma, role: 'transitiv', p };
  }

  const rule = {
    id: 'nb-transitive-intransitive',
    languages: ['nb'],
    priority: 60, // advisory hint band (after corrective rules)
    severity: 'hint',
    noAutoFix: true,
    exam: {
      safe: false,
      reason: 'Reflective grammar advisory (transitiv/intransitiv preteritum); pedagogical nudge, suppressed in exam',
      category: 'grammar-lookup',
    },
    explain(finding) {
      const f = FORMS[(finding && finding.original || '').toLowerCase()] || null;
      if (!f) return { nb: 'Dette verbet har to former i preteritum: én intransitiv (uten objekt) og én transitiv (med objekt).', nn: 'Dette verbet har to former i preteritum.' };
      const p = f.p;
      return {
        nb: `<em>${f.role === 'intransitiv' ? p.intrans : p.trans}</em> er preteritum av <em>${f.lemma}</em>. Verbet har to former: <strong>${p.intrans}</strong> (intransitiv, uten objekt — «${p.intransEx}») og <strong>${p.trans}</strong> (transitiv, med objekt — «${p.transEx}»). Begge er riktige — pass på hvilken du mener.`,
        nn: `<em>${f.role === 'intransitiv' ? p.intrans : p.trans}</em> er preteritum av <em>${f.lemma}</em>. Verbet har to former: <strong>${p.intrans}</strong> (intransitiv, utan objekt) og <strong>${p.trans}</strong> (transitiv, med objekt). Begge er rette — pass på kva du meiner.`,
        en: `<em>${f.role === 'intransitiv' ? p.intrans : p.trans}</em> is the past tense of <em>${f.lemma}</em>. It has two forms: <strong>${p.intrans}</strong> (intransitive, no object) and <strong>${p.trans}</strong> (transitive, with an object). Both are correct — make sure you mean the right one.`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'nb') return [];
      const { tokens, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        if (!FORMS[tok.word]) continue;
        if (cursorPos != null && cursorPos >= tok.start && cursorPos <= tok.end) continue;
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          noAutoFix: true,
          start: tok.start,
          end: tok.end,
          original: tok.display,
          message: `«${tok.display}»: transitiv/intransitiv preteritumsform — se Lær mer.`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
