/**
 * Spell-check rule: NB/NN place preposition i/på before country names (priority 17).
 *
 * Norwegian uses "i" before (mainland) countries and "på" before a few islands:
 *   "Jeg bor i Norge"   (correct)        "Jeg bor på Norge"  → "i Norge"
 *   "Han bor på Island" (correct)        "Han bor i Island"  → "på Island"
 *
 * PRECISION-FIRST scope (the enkel-bestemmelse lesson — don't flag correct
 * Norwegian):
 *   - Only a curated gazetteer of places whose preposition is UNAMBIGUOUS
 *     (mainland "i"-countries + the two canonical "på"-places Island/Grønland).
 *     Towns/cities (på Hamar / i Oslo), ambiguous islands, regions are NOT in
 *     the list → never flagged.
 *   - Requires a LOCATIVE/MOTION verb directly before the preposition
 *     (bor/reiste/er/flyttet …). This is the load-bearing guard: it excludes
 *     the governed-preposition readings that are CORRECT — "ekspert på Norge",
 *     "fokus på Frankrike", "interessert i Island", "et angrep på Norge" — where
 *     "på"/"i" is governed by the preceding word, not a locative.
 *
 * Severity: warning (P2 amber). Rule ID: 'nb-place-preposition'.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase: coreMatchCase } = core;
  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original && original[0] >= 'A' && original[0] <= 'Z') return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
  }

  // place (lowercase) → expected preposition. Curated for UNAMBIGUOUS prep only.
  const PLACES = new Map([
    // Mainland + island-nations that unambiguously take "i". (NOT: Island,
    // Grønland, Kypros, Cuba, Malta, Hawaii, Filippinene — those take "på" or
    // are mixed; and NO towns/cities, which are exception-ridden.)
    ['norge', 'i'], ['sverige', 'i'], ['danmark', 'i'], ['finland', 'i'],
    ['tyskland', 'i'], ['frankrike', 'i'], ['spania', 'i'], ['italia', 'i'],
    ['england', 'i'], ['skottland', 'i'], ['irland', 'i'], ['nederland', 'i'],
    ['belgia', 'i'], ['sveits', 'i'], ['østerrike', 'i'], ['polen', 'i'],
    ['russland', 'i'], ['kina', 'i'], ['japan', 'i'], ['india', 'i'],
    ['brasil', 'i'], ['mexico', 'i'], ['canada', 'i'], ['australia', 'i'],
    ['hellas', 'i'], ['portugal', 'i'], ['ukraina', 'i'], ['tyrkia', 'i'],
    ['egypt', 'i'], ['marokko', 'i'], ['argentina', 'i'], ['chile', 'i'],
    ['usa', 'i'], ['storbritannia', 'i'], ['sverige', 'i'],
    // Canonical "på"-places.
    ['island', 'på'], ['grønland', 'på'],
  ]);

  const PREPS = new Set(['i', 'på']);

  // Locative / motion verbs (common NB+NN forms). The verb must sit DIRECTLY
  // before the preposition — this adjacency is what excludes governed readings
  // ("ekspert på", "interessert i", "fokus på", "angrep på").
  const LOC_VERBS = new Set([
    'bo', 'bor', 'bodde', 'bodd',
    'ligge', 'ligg', 'ligger', 'låg', 'lå', 'ligget',
    'reise', 'reiser', 'reiste', 'reist', 'reis',
    'dra', 'drar', 'dro', 'drog', 'dratt',
    'flytte', 'flytter', 'flyttet', 'flytta', 'flytt',
    'være', 'vere', 'er', 'var', 'vore', 'vært',
    'feriere', 'ferierer', 'ferierte',
    'studere', 'studerer', 'studerte', 'studer',
    'jobbe', 'jobber', 'jobba', 'jobbet',
    'arbeide', 'arbeider', 'arbeidde', 'arbeidet',
  ]);

  const rule = {
    id: 'nb-place-preposition',
    languages: ['nb', 'nn'],
    priority: 17,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Country preposition lookup — grammatical assistance, suppressed in exam',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Land som <em>${finding.place}</em> tar <em>${finding.fix}</em> — skriv <em>${finding.fix} ${finding.place}</em>.`,
      nn: `Land som <em>${finding.place}</em> tek <em>${finding.fix}</em> — skriv <em>${finding.fix} ${finding.place}</em>.`,
    }),
    check(ctx) {
      const { tokens, text, cursorPos, lang } = ctx;
      if (lang !== 'nb' && lang !== 'nn') return [];
      const out = [];
      for (let i = 0; i + 2 < tokens.length; i++) {
        const verb = tokens[i];
        const prep = tokens[i + 1];
        const place = tokens[i + 2];

        if (!LOC_VERBS.has(verb.word)) continue;
        const prepW = prep.word.toLowerCase();
        if (!PREPS.has(prepW)) continue;
        const expected = PLACES.get(place.word.toLowerCase());
        if (!expected) continue;
        if (prepW === expected) continue;

        if (cursorPos != null && cursorPos >= prep.start && cursorPos <= prep.end + 1) continue;

        const origPrep = text.slice(prep.start, prep.end);
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: prep.start,
          end: prep.end,
          original: origPrep,
          fix: matchCase(origPrep, expected),
          place: place.display || place.word,
          message: `"${place.display || place.word}" tar "${expected}" — bruk "${expected} ${place.display || place.word}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
