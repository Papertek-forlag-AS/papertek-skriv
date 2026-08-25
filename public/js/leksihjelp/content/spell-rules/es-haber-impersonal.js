/**
 * Spell-check rule: ES impersonal haber agreement (HABER-01).
 *
 * Existential/impersonal haber is ALWAYS singular in standard Spanish, no matter
 * how many things exist: "había muchos problemas", never "habían muchos
 * problemas". Learners (and many native speakers) wrongly pluralise it to agree
 * with the noun phrase.
 *
 *   Flagged:  "Habían muchos problemas." → "Había"
 *   Flagged:  "Hubieron varias personas." → "Hubo"
 *   OK:       "Había muchos problemas."   (already singular)
 *   OK:       "Habían comido mucho."      (habían + participle = pluperfect
 *                                          auxiliary — a different, correct use)
 *   OK:       "Ellos habían hecho la tarea." (hecho is a participle here, NOT a
 *                                          determiner, so it never triggers)
 *
 * Precision-first: fires only on a plural haber form immediately followed by a
 * DETERMINER or quantifier (a closed function-word class). Participles never
 * follow as determiners, so the auxiliary use (habían + participle) is cleanly
 * excluded — including participle/noun homographs like "hecho". Closed-class
 * logic, no open word list.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  // Plural haber forms → their impersonal singular counterpart.
  const HABER_PLURAL = {
    habían: 'había', hubieron: 'hubo', habrán: 'habrá', habrían: 'habría',
    hayan: 'haya', hubieran: 'hubiera', hubiesen: 'hubiese',
  };

  // Determiners + quantifiers that open an existential NP after haber.
  const DETERMINERS = new Set([
    'el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas',
    'mucho', 'muchos', 'mucha', 'muchas', 'poco', 'pocos', 'poca', 'pocas',
    'varios', 'varias', 'alguno', 'alguna', 'algunos', 'algunas', 'algún',
    'demasiado', 'demasiados', 'demasiada', 'demasiadas', 'bastante', 'bastantes',
    'tanto', 'tantos', 'tanta', 'tantas', 'otro', 'otros', 'otra', 'otras',
    'cierto', 'ciertos', 'cierta', 'ciertas',
  ]);

  const rule = {
    id: 'es-haber-impersonal',
    languages: ['es'],
    priority: 23,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Impersonal-haber number agreement across two tokens — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Upersonlig <em>haber</em> (det finnes/fantes) står alltid i entall på spansk, uansett hvor mange ting det er snakk om. Skriv <em>${finding.fix}</em>, ikke <em>${finding.original}</em>.`,
      nn: `Upersonleg <em>haber</em> (det finst/fanst) står alltid i eintal på spansk, uansett kor mange ting det er snakk om. Skriv <em>${finding.fix}</em>, ikkje <em>${finding.original}</em>.`,
      en: `Impersonal <em>haber</em> (there is/are) is always singular in Spanish, however many things there are. Write <em>${finding.fix}</em>, not <em>${finding.original}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const { tokens, text, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i + 1 < tokens.length; i++) {
        const sing = HABER_PLURAL[tokens[i].word];
        if (!sing) continue;
        const next = tokens[i + 1];
        if (!DETERMINERS.has(next.word)) continue;

        const gap = text.slice(tokens[i].end, next.start);
        if (/[^ \t]/.test(gap)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i].end) continue;

        const orig = tokens[i].display;
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          start: tokens[i].start,
          end: tokens[i].end,
          original: orig,
          fix: typeof matchCase === 'function' ? matchCase(orig, sing) : sing,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
