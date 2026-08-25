/**
 * Spell-check rule: FR relative pronoun qui → que before subject pronoun (FR-15, priority 21).
 *
 * Norwegian uses a single relative pronoun "som" for both subject and object
 * relative clauses. French students use "qui" everywhere. When the head noun
 * is the OBJECT of the relative clause and another pronoun provides the subject,
 * "qui" must be replaced with "que".
 *
 *   Wrong:   "le livre qui j'ai lu"     →  "le livre que j'ai lu"
 *   Wrong:   "l'homme qui tu admires"   →  "l'homme que tu admires"
 *   Wrong:   "la chanson qui elle chante" → "la chanson qu'elle chante"
 *   Correct: "l'homme qui parle"        →  no flag (qui = subject, no separate pronoun follows)
 *   Correct: "c'est moi qui suis venu"  →  no flag (qui followed by a verb, not a pronoun)
 *
 * Detection pattern: token "qui" immediately followed by a personal subject pronoun
 * (je / j' / tu / il / elle / nous / vous / ils / elles). When a subject pronoun
 * immediately follows "qui", the head noun is the object of the relative clause,
 * so "que" is required.
 *
 * Fix: "qui" → "que" (elision qu' before vowel-starting pronoun handled by fr-elision).
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-relative-qui-que'
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

  // Personal subject pronouns that immediately follow "qui" in the error pattern.
  // When one of these directly follows "qui", the head noun is the object of the
  // relative clause → "qui" must be "que".
  const SUBJECT_PRONOUNS = new Set([
    'je', "j'", '’', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles',
  ]);

  // Vowel-starting pronouns that require elision: que → qu'
  const VOWEL_PRONOUNS = new Set(['il', 'ils', 'elle', 'elles']);

  // Prepositions: "à/de/avec/pour … qui" is the prepositional relative for
  // PERSONS and is always "qui", never "que" ("l'amie à qui je parle").
  const PREPOSITIONS = new Set([
    'à', 'a', 'de', "d'", 'd’', 'avec', 'pour', 'sans', 'chez', 'sur', 'sous',
    'contre', 'vers', 'par', 'entre', 'envers', 'selon', 'dans', 'derrière',
    'devant', 'près', 'auprès', 'grâce',
  ]);

  // Verbs of asking/telling/knowing that introduce an INDIRECT QUESTION, where
  // "qui" is the interrogative "who" (correct even as object): "Dis-moi qui tu
  // as rencontré", "Je sais qui tu es". Matched within a short look-back.
  const INTERROG_INTRO = new Set([
    'dis', 'dites', 'dis-moi', 'dites-moi', 'dis-nous', 'dites-nous', 'dire',
    'demande', 'demandes', 'demandez', 'demander', 'raconte', 'racontez',
    'montre', 'montrez', 'explique', 'expliquez', 'devine', 'devinez',
    'sais', 'sait', 'savez', 'savoir', 'ignore', 'oublie', 'rappelle',
  ]);

  // 2pl verbs whose stem is irregular (don't end in -ez) but still mark a
  // "vous" SUBJECT after "qui".
  const IRREG_2PL = new Set(['avez', 'êtes', 'etes', 'faites', 'dites']);
  const IRREG_1PL = new Set(['avons', 'sommes']);

  const rule = {
    id: 'fr-relative-qui-que',
    languages: ['fr'],
    priority: 21,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Relative pronoun substitution qui→que — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `<em>qui</em> er subjektspronomen i relativsetninger («mannen <em>som</em> snakker»). Når et nytt subjekt følger, er leddet et objekt — bruk <em>que</em>: <em>${finding.fix}</em>.`,
      nn: `<em>qui</em> er subjektspronomen i relativsetningar («mannen <em>som</em> snakkar»). Når eit nytt subjekt kjem etter, er leddet eit objekt — bruk <em>que</em>: <em>${finding.fix}</em>.`,
      en: `<em>qui</em> is the subject relative pronoun ("the man <em>who</em> speaks"). When a separate subject pronoun follows, the clause is an object relative — use <em>que</em>: <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const { tokens, text } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const tok = tokens[i];
        if (tok.word.toLowerCase() !== 'qui') continue;

        const next = tokens[i + 1];
        const nextW = next.word.toLowerCase();

        // Also handle contracted je forms tokenized as a single token: j'ai, j'habite, etc.
        const isContractedJe = nextW.startsWith("j'") || nextW.startsWith('j’');
        if (!SUBJECT_PRONOUNS.has(nextW) && !isContractedJe) continue;

        // (B) Prepositional relative for persons — always "qui" ("à qui je parle").
        if (i > 0 && PREPOSITIONS.has(tokens[i - 1].word.toLowerCase())) continue;

        // (C) Indirect question introduced by a verb of asking/telling/knowing:
        // "Dis-moi qui tu as rencontré" — interrogative "who", not a relative.
        let interrog = false;
        for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
          if (INTERROG_INTRO.has(tokens[k].word.toLowerCase())) { interrog = true; break; }
        }
        if (interrog) continue;

        // (A) "nous"/"vous" double as OBJECT clitics: "le modèle qui vous plaît",
        // "le monde qui nous entoure" — qui is the SUBJECT, nous/vous the object,
        // and the verb stays 3rd-person. Only flag when the following verb
        // actually agrees with nous/vous (1pl -ons / 2pl -ez, or the irregulars).
        if (nextW === 'nous' || nextW === 'vous') {
          const vtok = tokens[i + 2];
          const vw = vtok ? vtok.word.toLowerCase() : '';
          const agrees = nextW === 'nous'
            ? (/ons$/.test(vw) || IRREG_1PL.has(vw))
            : (/ez$/.test(vw) || IRREG_2PL.has(vw));
          if (!agrees) continue;
        }

        // "qui" immediately before a personal subject pronoun → should be "que"
        const origQui = text.slice(tok.start, tok.end);
        const fix = matchCase(origQui, 'que');

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: tok.start,
          end: tok.end,
          original: origQui,
          fix,
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
