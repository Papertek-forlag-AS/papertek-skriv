/**
 * Spell-check rule: FR possessive leur / leurs number agreement (FR-34, priority 9).
 *
 * The possessive determiner agrees in number with the thing owned:
 * "leur" before a singular noun, "leurs" before a plural noun. Norwegian
 * "deres" is invariable, so students under- or over-pluralise by L1 transfer.
 *
 *   Wrong:   "leur amis"      →  "leurs amis"   (amis = plural)
 *   Wrong:   "leur maisons"   →  "leurs maisons"(maisons = plural)
 *   Wrong:   "leurs livre"    →  "leur livre"   (livre = singular)
 *   Correct: "leur maison"    →  no flag (singular)
 *   Correct: "leurs amis"     →  no flag (plural)
 *
 * FP guard (load-bearing): "leur" is ALSO the invariable indirect-object
 * pronoun ("je leur parle" = I speak to them). To avoid flagging that:
 *   1. Only fire when the following token is a known noun (in nounPluralGenus
 *      for the leur→leurs direction, or nounLemmaGenus for leurs→leur). A verb
 *      like "parle"/"donne" is in neither index, so "je leur parle" never fires.
 *   2. For leur→leurs, additionally skip when the PREVIOUS token is a subject
 *      pronoun (je/tu/il/…): "[subject] leur [noun-looking verb form]" is always
 *      the object-pronoun reading (a possessive can't follow a bare subject),
 *      which neutralises noun/verb homographs like "portes" (doors / tu portes).
 * Each direction fires only on UNAMBIGUOUSLY numbered nouns (present in exactly
 * one of the two indexes) so number-ambiguous nouns are skipped, not guessed.
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-leur-leurs'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const PLURALE_TANTUM = new Set(['vacances','fiançailles','fiancailles','funérailles','funerailles','mœurs','moeurs','environs','ténèbres','tenebres','alentours','victuailles','arrhes','condoléances','condoleances','félicitations','felicitations','honoraires','obsèques','obseques','représailles','representailles','décombres','decombres']);
  const core = host.__lexiSpellCore || {};
  const { matchCase: coreMatchCase } = core;

  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original && original[0] >= 'A' && original[0] <= 'Z') {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  // A possessive "leur" can never directly follow a bare subject pronoun —
  // that slot is the indirect-object pronoun reading. Used to suppress
  // noun/verb homograph FPs in the leur→leurs direction.
  const SUBJECT_PRONOUNS = new Set([
    'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', "j'",
  ]);

  const rule = {
    id: 'fr-leur-leurs',
    languages: ['fr'],
    priority: 9,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Possessive leur/leurs number agreement via noun indexes — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: finding.fix.toLowerCase() === 'leurs'
        ? `Eiendomsordet <em>leur</em> blir <em>leurs</em> foran et flertallsord. <em>${finding.nounWord}</em> er flertall, så det heter <em>leurs ${finding.nounWord}</em>.`
        : `Eiendomsordet <em>leurs</em> blir <em>leur</em> foran et entallsord. <em>${finding.nounWord}</em> er entall, så det heter <em>leur ${finding.nounWord}</em>.`,
      nn: finding.fix.toLowerCase() === 'leurs'
        ? `Eigedomsordet <em>leur</em> blir <em>leurs</em> framfor eit fleirtalsord. <em>${finding.nounWord}</em> er fleirtal, så det heiter <em>leurs ${finding.nounWord}</em>.`
        : `Eigedomsordet <em>leurs</em> blir <em>leur</em> framfor eit eintalsord. <em>${finding.nounWord}</em> er eintal, så det heiter <em>leur ${finding.nounWord}</em>.`,
      en: finding.fix.toLowerCase() === 'leurs'
        ? `The possessive <em>leur</em> becomes <em>leurs</em> before a plural noun. <em>${finding.nounWord}</em> is plural, so it is <em>leurs ${finding.nounWord}</em>.`
        : `The possessive <em>leurs</em> becomes <em>leur</em> before a singular noun. <em>${finding.nounWord}</em> is singular, so it is <em>leur ${finding.nounWord}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const vocab = ctx.vocab || {};
      const nounPluralGenus = vocab.nounPluralGenus;
      const nounLemmaGenus = vocab.nounLemmaGenus;
      if (!nounPluralGenus || !nounPluralGenus.size) return [];
      if (!nounLemmaGenus || !nounLemmaGenus.size) return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const leurTok = tokens[i];
        const noun = tokens[i + 1];

        // Avoid flagging the determiner the user is actively typing.
        if (cursorPos != null && cursorPos >= leurTok.start && cursorPos <= leurTok.end + 1) continue;

        const leurW = leurTok.word.toLowerCase();
        if (leurW !== 'leur' && leurW !== 'leurs') continue;

        const nounW = noun.word.toLowerCase();
        const isPlural = nounPluralGenus.has(nounW);
        const isSingular = nounLemmaGenus.has(nounW);

        let fixWord = null;

        if (leurW === 'leur' && isPlural && !isSingular) {
          // leur + plural noun → leurs. Suppress the object-pronoun reading:
          // skip when the preceding token is a subject pronoun.
          const prev = i > 0 ? tokens[i - 1].word.toLowerCase() : null;
          if (prev && SUBJECT_PRONOUNS.has(prev)) continue;
          fixWord = 'leurs';
        } else if (leurW === 'leurs' && isSingular && !isPlural && !PLURALE_TANTUM.has(nounW)) {
          // leurs + singular noun → leur. ("leurs" is only ever possessive.)
          // Plurale-tantum nouns ("leurs vacances", "leurs fiançailles") read as
          // singular in the lemma index but are always plural — never downgrade.
          fixWord = 'leur';
        }

        if (!fixWord) continue;

        const origLeur = text.slice(leurTok.start, leurTok.end);

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: leurTok.start,
          end: leurTok.end,
          original: origLeur,
          fix: matchCase(origLeur, fixWord),
          nounWord: nounW,
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
