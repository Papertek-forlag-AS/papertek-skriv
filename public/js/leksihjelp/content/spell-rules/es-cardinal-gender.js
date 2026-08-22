/**
 * Spell-check rule: ES hundreds gender agreement (CARD-01).
 *
 * Spanish hundreds (200–900) agree in gender with the noun they count:
 * doscientos/doscientas, trescientos/trescientas, … novecientos/novecientas.
 * Norwegian numbers are invariant, so students don't inflect them:
 *
 *   Flagged:  "doscientos casas"   → "doscientas"   (casas is feminine)
 *   Flagged:  "trescientas euros"   → "trescientos" (euros is masculine)
 *   OK:       "doscientas casas"    (agrees)
 *   OK:       "doscientos mil"       (mil is not a counted noun)
 *
 * Precision-first: the hundreds are a CLOSED set of unambiguous number words
 * (no noun/adjective/adverb homographs), and the gender comes from nounGenus, so
 * there is no false positive — fires only on a real hundred + a noun of the
 * opposite gender.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  // hundred form → { g: gender, other: opposite-gender form }. Listed explicitly
  // because the stems are irregular (quinientos, setecientos, novecientos).
  const HUNDREDS = {};
  const PAIRS = [
    ['doscientos', 'doscientas'], ['trescientos', 'trescientas'],
    ['cuatrocientos', 'cuatrocientas'], ['quinientos', 'quinientas'],
    ['seiscientos', 'seiscientas'], ['setecientos', 'setecientas'],
    ['ochocientos', 'ochocientas'], ['novecientos', 'novecientas'],
  ];
  for (const [m, f] of PAIRS) {
    HUNDREDS[m] = { g: 'm', other: f };
    HUNDREDS[f] = { g: 'f', other: m };
  }

  const rule = {
    id: 'es-cardinal-gender',
    languages: ['es'],
    priority: 18,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Hundreds-noun gender agreement across two tokens — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Spanske hundretall (200–900) bøyes etter substantivets kjønn: <em>doscientos libros</em> (m), <em>doscientas casas</em> (f). Skriv <em>${finding.fix}</em>.`,
      nn: `Spanske hundretal (200–900) vert bøygde etter kjønnet på substantivet: <em>doscientos libros</em> (m), <em>doscientas casas</em> (f). Skriv <em>${finding.fix}</em>.`,
      en: `Spanish hundreds (200–900) agree with the noun's gender: <em>doscientos libros</em> (m), <em>doscientas casas</em> (f). Write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const v = ctx.vocab || {};
      const nounGenus = v.nounGenus instanceof Map ? v.nounGenus : null;
      if (!nounGenus || !nounGenus.size) return [];
      const { tokens, text, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i + 1 < tokens.length; i++) {
        const hund = HUNDREDS[tokens[i].word];
        if (!hund) continue;
        const nounTok = tokens[i + 1];
        const gender = nounGenus.get(nounTok.word);
        if (gender !== 'm' && gender !== 'f') continue;
        if (gender === hund.g) continue; // already agrees

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
          fix: typeof matchCase === 'function' ? matchCase(tokens[i].display, hund.other) : hund.other,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
