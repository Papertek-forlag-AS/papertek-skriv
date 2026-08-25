/**
 * Spell-check rule: FR preposition before city names — always "à" (FR-24, priority 15).
 *
 * French uses "à" before (article-less) city names: à Paris, à Lyon, à Oslo.
 * Norwegian "i Paris" / "til Paris" doesn't distinguish, so students transfer
 * "en"/"au" (which belong before countries) onto cities.
 *
 *   Wrong:   "je vais en Paris"   →  "à Paris"
 *   Wrong:   "il habite au Lyon"  →  "à Lyon"
 *   Correct: "à Paris"            →  no flag
 *   Correct: "en France"          →  no flag (country → fr-pays-preposition)
 *   Correct: "en ville"           →  no flag ("ville" is a common noun, not a city)
 *
 * Only fires on a curated set of article-less cities — cities that carry an
 * article (Le Havre → au Havre, Le Mans → au Mans, Le Caire → au Caire) are
 * intentionally excluded, as are regions (en Bretagne, en Provence) and
 * countries (handled by fr-pays-preposition). "à"/"dans" are never flagged
 * ("dans Paris" = "within Paris" is grammatical).
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-ville-preposition'
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

  // Article-less cities that take "à". Lowercase keys. Excludes article cities
  // (Le Havre/Le Mans/Le Caire), regions, and countries.
  const VILLES = new Set([
    'paris', 'lyon', 'marseille', 'nice', 'bordeaux', 'lille', 'toulouse',
    'nantes', 'strasbourg', 'cannes', 'grenoble', 'montpellier', 'rennes',
    'reims', 'dijon', 'montréal', 'londres', 'berlin', 'madrid', 'rome',
    'oslo', 'bergen', 'barcelone', 'amsterdam', 'bruxelles', 'genève',
    'lisbonne', 'copenhague', 'stockholm',
  ]);

  // Prepositions that wrongly replace "à" before a city. "à"/"dans" never flagged.
  const WRONG_PREPS = new Set(['en', 'au']);

  const rule = {
    id: 'fr-ville-preposition',
    languages: ['fr'],
    priority: 15,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'City preposition lookup (à before cities) — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Franske byer tar <em>à</em>: <em>à ${finding.city}</em>. <em>en</em>/<em>au</em> brukes foran land, ikke byer.`,
      nn: `Franske byar tek <em>à</em>: <em>à ${finding.city}</em>. <em>en</em>/<em>au</em> vert brukt framfor land, ikkje byar.`,
      en: `French city names take <em>à</em>: <em>à ${finding.city}</em>. <em>en</em>/<em>au</em> are for countries, not cities.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const prep = tokens[i];
        const city = tokens[i + 1];

        if (cursorPos != null && cursorPos >= prep.start && cursorPos <= prep.end + 1) continue;

        const prepW = prep.word.toLowerCase();
        if (!WRONG_PREPS.has(prepW)) continue;

        const cityW = city.word.toLowerCase();
        if (!VILLES.has(cityW)) continue;

        const origPrep = text.slice(prep.start, prep.end);
        const fix = matchCase(origPrep, 'à');

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: prep.start,
          end: prep.end,
          original: origPrep,
          fix,
          city: city.display || city.word,
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
