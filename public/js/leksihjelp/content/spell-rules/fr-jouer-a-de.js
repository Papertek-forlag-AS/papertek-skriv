/**
 * Spell-check rule: FR "jouer à" (sport) vs "jouer de" (instrument) (FR-27, priority 14).
 *
 * French distinguishes "jouer à" + game/sport from "jouer de" + instrument.
 * Norwegian uses "spille" for both ("spille fotball", "spille piano"), so students
 * pick the wrong preposition by L1 transfer.
 *
 *   Wrong:   "je joue du football"  →  "je joue au football"
 *   Wrong:   "je joue à piano"      →  "je joue du piano"
 *   Correct: "je joue au tennis"    →  no flag
 *   Correct: "il joue du violon"    →  no flag
 *
 * Scope: curated MASCULINE sports (→ au) and MASCULINE instruments (→ du) only,
 * so the fix is always a clean contracted "au"/"du". Feminine cases that need
 * "à la"/"de la" (à la pétanque, de la guitare) and plural "aux échecs" are out
 * of scope. The rule fires only on a wrong preposition FAMILY (de-family before a
 * sport, or à-family before an instrument); a missing contraction ("à football")
 * is left to other rules.
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-jouer-a-de'
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

  // Masculine sports → "jouer au". (Feminine/plural sports out of scope.)
  const SPORTS_M = new Set([
    'football', 'foot', 'tennis', 'rugby', 'hockey', 'golf', 'handball',
    'baseball', 'basket', 'basketball', 'volley', 'volleyball', 'badminton',
    'cricket', 'billard', 'bowling', 'ping-pong',
  ]);

  // Masculine instruments → "jouer du". (Feminine instruments out of scope.)
  const INSTRUMENTS_M = new Set([
    'piano', 'violon', 'violoncelle', 'saxophone', 'saxo', 'accordéon',
    'hautbois', 'basson', 'trombone', 'banjo', 'ukulélé',
  ]);

  const A_FAMILY = new Set(['à', 'au', 'aux']);
  const DE_FAMILY = new Set(['de', 'du', 'des']);

  const rule = {
    id: 'fr-jouer-a-de',
    languages: ['fr'],
    priority: 14,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'jouer à/de preposition lookup (sport vs instrument) — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `På fransk: <em>jouer à</em> + sport, <em>jouer de</em> + instrument. Riktig: <em>jouer ${finding.fix} ${finding.noun}</em>.`,
      nn: `På fransk: <em>jouer à</em> + sport, <em>jouer de</em> + instrument. Rett: <em>jouer ${finding.fix} ${finding.noun}</em>.`,
      en: `In French: <em>jouer à</em> + sport, <em>jouer de</em> + instrument. Correct: <em>jouer ${finding.fix} ${finding.noun}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const frPresensToVerb = ctx.vocab && ctx.vocab.frPresensToVerb;
      if (!frPresensToVerb || !frPresensToVerb.size) return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 2 < tokens.length; i++) {
        const jouerTok = tokens[i];
        const prep = tokens[i + 1];
        const noun = tokens[i + 2];

        const jouerEntry = frPresensToVerb.get(jouerTok.word.toLowerCase());
        if (!jouerEntry || jouerEntry.inf !== 'jouer') continue;

        if (cursorPos != null && cursorPos >= prep.start && cursorPos <= prep.end + 1) continue;

        const prepW = prep.word.toLowerCase();
        const nounW = noun.word.toLowerCase();

        let expected = null;
        if (SPORTS_M.has(nounW) && DE_FAMILY.has(prepW)) expected = 'au';
        else if (INSTRUMENTS_M.has(nounW) && A_FAMILY.has(prepW)) expected = 'du';
        if (!expected) continue;

        const origPrep = text.slice(prep.start, prep.end);
        const fix = matchCase(origPrep, expected);

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: prep.start,
          end: prep.end,
          original: origPrep,
          fix,
          noun: noun.display || noun.word,
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
