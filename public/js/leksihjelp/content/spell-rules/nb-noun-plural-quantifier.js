/**
 * Spell-check rule: NB/NN noun must be plural after a plural quantifier (priority 16).
 *
 * Quantifiers like "mange / flere / begge" require the indefinite PLURAL form of
 * the noun; learners leave it singular:
 *   Wrong:   "mange bok"        → "mange bøker"
 *   Wrong:   "flere gang"       → "flere ganger"
 *   Wrong:   "mange små gutt"   → "mange små gutter"
 *   Correct: "mange bøker"      → no flag
 *   Correct: "mange hus"        → no flag (invariant plural, not in nounPlural)
 *
 * PRECISION:
 *   - Quantifiers restricted to UNAMBIGUOUS plural ones (no "få" = few/get verb
 *     homograph, no "noen" = somebody/some).
 *   - Suggestion + detection use vocab.nounPlural (singular lemma → indefinite
 *     plural, built ONLY where they differ), so invariant-plural nouns (hus/barn/
 *     land) and plurale-tantum (penger) never fire.
 *   - A small EXCLUDE set guards fixed "mange X" idioms ("mange takk").
 *   - Allows one attributive adjective between quantifier and noun
 *     ("mange små gutt").
 *
 * Severity: warning (P2 amber). Rule ID: 'nb-noun-plural-quantifier'.
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

  // Plural quantifiers + spelled-out counting numbers 2–12 (all unambiguously
  // require a plural noun). "én/ein/en" (=1) deliberately excluded.
  const QUANTIFIERS = new Set([
    'mange', 'flere', 'fleire', 'begge',
    'to', 'tre', 'fire', 'fem', 'seks', 'sju', 'syv', 'åtte', 'ni', 'ti', 'elleve', 'tolv',
  ]);
  // Fixed idioms + count-ellipsis drink/food nouns where the singular is the
  // everyday norm ("tre pils", "fem iskrem") — flagging them reads as nagging.
  const EXCLUDE = new Set([
    'takk', 'slags', 'sort', 'slag',
    'pils', 'iskrem', 'brus', 'vin', 'kaffe', 'te', 'cola', 'juice',
  ]);

  const rule = {
    id: 'nb-noun-plural-quantifier',
    languages: ['nb', 'nn'],
    priority: 16,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Noun number agreement after quantifier; grammatical, not lookup — exceeds Chrome native spellcheck parity',
      category: 'grammar-lookup',
    },
    explain(finding) {
      const fix = finding.fix || '';
      const orig = finding.original || '';
      const q = finding.quant || '';
      return {
        nb: `Etter <em>${q}</em> skal substantivet stå i <strong>flertall</strong>: skriv <em>${q} ${fix}</em>, ikke <em>${q} ${orig}</em>.`,
        nn: `Etter <em>${q}</em> skal substantivet stå i <strong>fleirtal</strong>: skriv <em>${q} ${fix}</em>, ikkje <em>${q} ${orig}</em>.`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'nb' && ctx.lang !== 'nn') return [];
      const { tokens, cursorPos } = ctx;
      if (!tokens || tokens.length < 2) return [];
      const vocab = ctx.vocab || {};
      const nounPlural = vocab.nounPlural;
      if (!nounPlural || nounPlural.size === 0) return [];
      const isAdjective = vocab.isAdjective || new Set();
      const knownPresens = vocab.knownPresens || new Set();
      const nounPluralGenus = vocab.nounPluralGenus || new Set();
      const out = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const quant = tokens[i];
        if (!QUANTIFIERS.has(quant.word)) continue;

        // Noun directly after the quantifier, or after one attributive adjective.
        // If the middle slot is an adjective (even a noun-homograph like "tunge"
        // =heavy/tongue), treat the NEXT token as the noun — "tre tunge poser"
        // is adj+plural-noun, not the noun "tunge".
        let noun = tokens[i + 1];
        if (noun && isAdjective.has(noun.word) && tokens[i + 2]) {
          noun = tokens[i + 2];
        }
        if (!noun) continue;
        if (EXCLUDE.has(noun.word)) continue;
        // "mange sliter/tror/mener" — mange is a PRONOUN + finite present verb.
        if (knownPresens.has(noun.word)) continue;
        // Homograph already in the plural ("mange sanger" = many songs, plural
        // of sang, though "sanger"=singer is also a singular lemma).
        if (nounPluralGenus.has(noun.word)) continue;

        const plural = nounPlural.get(noun.word);
        if (!plural) continue;                       // invariant / not a singular lemma
        if (plural.toLowerCase() === noun.word) continue;

        if (cursorPos != null && cursorPos >= noun.start && cursorPos <= noun.end + 1) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: noun.start,
          end: noun.end,
          original: noun.display,
          fix: matchCase(noun.display, plural),
          quant: quant.display,
          message: `Flertall etter «${quant.display}»: «${quant.display} ${noun.display}» → «${quant.display} ${matchCase(noun.display, plural)}»`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
