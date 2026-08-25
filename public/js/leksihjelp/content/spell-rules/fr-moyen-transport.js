/**
 * Spell-check rule: FR preposition for means of transport — en vs à (FR-26, priority 15).
 *
 * French uses "en" for enclosed vehicles (en voiture, en train, en avion) and
 * "à" for open/astride means (à pied, à cheval). Norwegian "med bil / til fots"
 * gives no consistent mapping, so students swap the two.
 *
 *   Wrong:   "je voyage à voiture"  →  "en voiture"
 *   Wrong:   "nous allons en pied"  →  "à pied"
 *   Correct: "en voiture"           →  no flag
 *   Correct: "à pied"               →  no flag
 *   Correct: "en train de manger"   →  no flag (en train = expected prep)
 *
 * Only fires on a curated map of uncontested means. Contested cases where modern
 * usage accepts both prepositions (en/à vélo, en/à moto, en/à scooter) are
 * intentionally excluded to avoid annoying false positives.
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-moyen-transport'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase: coreMatchCase } = core;

  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original && original[0] >= 'A' && original[0] <= 'Z') {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  // Map<transport_noun_lowercase, expected_preposition>.
  const TRANSPORT = new Map([
    ['voiture', 'en'], ['train', 'en'], ['bus', 'en'], ['avion', 'en'],
    ['métro', 'en'], ['metro', 'en'], ['bateau', 'en'], ['taxi', 'en'],
    ['tram', 'en'], ['tramway', 'en'], ['camion', 'en'], ['car', 'en'],
    ['pied', 'à'], ['cheval', 'à'],
  ]);

  // Only these two prepositions are ever flagged here.
  const PREPS = new Set(['en', 'à']);

  const rule = {
    id: 'fr-moyen-transport',
    languages: ['fr'],
    priority: 15,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Transport preposition lookup (en/à) — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Transportmåter: <em>en</em> for lukkede kjøretøy (en voiture, en train), <em>à</em> for åpne (à pied, à cheval). Riktig: <em>${finding.fix} ${finding.mode}</em>.`,
      nn: `Transportmåtar: <em>en</em> for lukka køyretøy (en voiture, en train), <em>à</em> for opne (à pied, à cheval). Rett: <em>${finding.fix} ${finding.mode}</em>.`,
      en: `Means of transport: <em>en</em> for enclosed vehicles (en voiture, en train), <em>à</em> for open ones (à pied, à cheval). Correct: <em>${finding.fix} ${finding.mode}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const prep = tokens[i];
        const mode = tokens[i + 1];

        if (cursorPos != null && cursorPos >= prep.start && cursorPos <= prep.end + 1) continue;

        const prepW = prep.word.toLowerCase();
        if (!PREPS.has(prepW)) continue;

        const modeW = mode.word.toLowerCase();
        const expected = TRANSPORT.get(modeW);
        if (!expected || expected === prepW) continue;

        const origPrep = text.slice(prep.start, prep.end);
        const fix = matchCase(origPrep, expected);

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: prep.start,
          end: prep.end,
          original: origPrep,
          fix,
          mode: mode.display || mode.word,
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
