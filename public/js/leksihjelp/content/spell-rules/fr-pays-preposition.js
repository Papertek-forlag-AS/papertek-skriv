/**
 * Spell-check rule: FR country prepositions — en/au/aux/à before country names (FR-19, priority 17).
 *
 * Norwegian uses "til" (to) + country for all destinations; French requires
 * different prepositions depending on noun gender and initial sound:
 *   Feminine country  → en:   en France, en Espagne, en Norvège
 *   Masculine country → au:   au Canada, au Japon, au Maroc
 *   Plural country    → aux:  aux États-Unis, aux Pays-Bas (excluded — multi-token)
 *   Island / special  → à:    à Cuba, à Chypre (excluded from list to avoid FPs)
 *
 *   Wrong:   "à France"       →  "en France"
 *   Wrong:   "en Canada"      →  "au Canada"
 *   Wrong:   "à Espagne"      →  "en Espagne"
 *   Correct: "en France"      →  no flag
 *   Correct: "au Canada"      →  no flag
 *   Correct: "au marché"      →  no flag (marché not in country list)
 *
 * Only fires when the preposition is not the expected one for that country.
 * Islands, territories, and plural countries are excluded from the list to
 * prevent false positives from the "à" rule.
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-pays-preposition'
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

  // Map<country_lowercase, expected_preposition>
  // Feminine continental countries → 'en'; masculine → 'au'.
  // Excluded: islands (Cuba, Chypre, Madagascar), plural countries (États-Unis, Pays-Bas),
  // and countries where both prepositions are occasionally accepted.
  const PAYS = new Map([
    // Feminine → en
    ['france', 'en'], ['espagne', 'en'], ['allemagne', 'en'], ['italie', 'en'],
    ['belgique', 'en'], ['suisse', 'en'], ['hollande', 'en'], ['angleterre', 'en'],
    ['russie', 'en'], ['chine', 'en'], ['norvège', 'en'], ['suède', 'en'],
    ['finlande', 'en'], ['grèce', 'en'], ['turquie', 'en'], ['pologne', 'en'],
    ['autriche', 'en'], ['australie', 'en'], ['algérie', 'en'], ['argentine', 'en'],
    ['colombie', 'en'], ['corée', 'en'], ['egypte', 'en'], ['égypte', 'en'],
    ['éthiopie', 'en'], ['inde', 'en'], ['irlande', 'en'], ['jordanie', 'en'],
    ['libye', 'en'], ['slovaquie', 'en'], ['roumanie', 'en'], ['slovénie', 'en'],
    ['tunisie', 'en'], ['ukraine', 'en'],
    // Masculine → au
    ['canada', 'au'], ['japon', 'au'], ['maroc', 'au'], ['mexique', 'au'],
    ['portugal', 'au'], ['brésil', 'au'], ['liban', 'au'], ['sénégal', 'au'],
    ['cameroun', 'au'], ['vietnam', 'au'], ['pérou', 'au'], ['ghana', 'au'],
  ]);

  // Prepositions that can appear before a country name.
  // 'a' (avoir) is intentionally excluded — it's a verb, not a preposition.
  const PREPS = new Set(['à', 'en', 'au', 'aux']);

  const rule = {
    id: 'fr-pays-preposition',
    languages: ['fr'],
    priority: 17,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Country preposition lookup — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Bruk <em>${finding.fix}</em> foran <em>${finding.country}</em> på fransk. Feminine land tar <em>en</em>, maskuline tar <em>au</em>.`,
      nn: `Bruk <em>${finding.fix}</em> framfor <em>${finding.country}</em> på fransk. Feminine land tek <em>en</em>, maskuline tek <em>au</em>.`,
      en: `Use <em>${finding.fix}</em> before <em>${finding.country}</em> in French. Feminine countries take <em>en</em>, masculine countries take <em>au</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const prep = tokens[i];
        const country = tokens[i + 1];

        if (cursorPos != null && cursorPos >= prep.start && cursorPos <= prep.end + 1) continue;

        const prepW = prep.word.toLowerCase();
        if (!PREPS.has(prepW)) continue;

        const countryW = country.word.toLowerCase();
        const expected = PAYS.get(countryW);
        if (!expected) continue;

        // Already correct
        if (prepW === expected) continue;

        const origPrep = text.slice(prep.start, prep.end);
        const fix = matchCase(origPrep, expected);

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: prep.start,
          end: prep.end,
          original: origPrep,
          fix,
          country: country.display || country.word,
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
