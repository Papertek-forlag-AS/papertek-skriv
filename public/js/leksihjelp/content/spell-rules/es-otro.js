/**
 * Spell-check rule: ES otro/otra/otros/otras gender agreement (OTRO-01).
 *
 * The Spanish determiner "otro" (other/another) agrees in gender AND number with
 * its noun: otro (m sg) / otra (f sg) / otros (m pl) / otras (f pl). Norwegian
 * "annen/andre" doesn't track Spanish gender, so students mismatch it:
 *
 *   Flagged:  "otro casa"        → "otra"   (casa is feminine)
 *   Flagged:  "otras problemas"   → "otros" (problema is masculine)
 *   OK:       "otra casa"         (agrees)
 *   OK:       "el otro día"       (día is masculine — agrees)
 *   OK:       "Dame otro."        (pronoun — no noun follows)
 *
 * Precision-first: otro/otra/otros/otras is a CLOSED, unambiguous determiner (no
 * adverb/verb homograph, unlike adjectives), the gender comes from nounGenus, and
 * the suggestion keeps the noun's number (singular vs plural read from
 * nounLemmaGenus). Fires only when the determiner's number already matches the
 * noun's number and only the gender is wrong — so no false positive on clean text.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  // form → { g: gender, num: 'sg'|'pl', other: opposite-gender same-number form }
  const FORMS = {
    otro: { g: 'm', num: 'sg', other: 'otra' },
    otra: { g: 'f', num: 'sg', other: 'otro' },
    otros: { g: 'm', num: 'pl', other: 'otras' },
    otras: { g: 'f', num: 'pl', other: 'otros' },
  };

  const rule = {
    id: 'es-otro',
    languages: ['es'],
    priority: 18,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'otro determiner gender agreement across two tokens — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `<em>otro</em> (annen/en til) bøyes i kjønn og tall etter substantivet: <em>otro libro</em> (m), <em>otra casa</em> (f). Skriv <em>${finding.fix}</em>.`,
      nn: `<em>otro</em> (annan/ein til) vert bøygd i kjønn og tal etter substantivet: <em>otro libro</em> (m), <em>otra casa</em> (f). Skriv <em>${finding.fix}</em>.`,
      en: `<em>otro</em> (other/another) agrees in gender and number with the noun: <em>otro libro</em> (m), <em>otra casa</em> (f). Write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
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

        // Noun number: singular forms are lemmas; plural forms are in nounGenus
        // but not nounLemmaGenus.
        const isSingular = nounLemmaGenus.has(nw);
        const isPlural = !isSingular && nounGenus.has(nw);
        const nounNum = isSingular ? 'sg' : (isPlural ? 'pl' : null);
        if (nounNum !== form.num) continue;   // number must already match
        if (gender === form.g) continue;       // already agrees

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
