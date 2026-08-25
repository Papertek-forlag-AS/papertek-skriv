/**
 * Spell-check rule: French adjective-noun gender agreement (MORPH-02, priority 16).
 *
 * Phase 14. Flags when a pre-nominal adjective disagrees in gender with the
 * following noun. Complements the existing es-fr-gender.js rule (priority 15)
 * which catches article-noun mismatches; this rule targets adjective-noun
 * mismatches.
 *
 * Example: "un bon humeur" -> flags "bon", suggests "bonne"
 *          (humeur is feminine, bon is masculine)
 *
 * Rule ID: 'fr-adj-gender'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase, escapeHtml: coreEscape } = core;

  function escapeHtml(s) {
    if (coreEscape) return coreEscape(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Irregular feminine forms (closed class, inline per data-logic-separation) ──
  const FR_ADJ_FEM_IRREGULARS = {
    bon: 'bonne',
    beau: 'belle',
    bel: 'belle',
    vieux: 'vieille',
    vieil: 'vieille',
    nouveau: 'nouvelle',
    nouvel: 'nouvelle',
    fou: 'folle',
    blanc: 'blanche',
    sec: 'seche',
    long: 'longue',
    gros: 'grosse',
    faux: 'fausse',
    doux: 'douce',
    gentil: 'gentille',
    public: 'publique',
    frais: 'fraiche',
  };

  // ── Reverse map: feminine -> masculine (for reverse-direction errors) ──
  const FR_ADJ_MASC_IRREGULARS = {};
  for (const [masc, fem] of Object.entries(FR_ADJ_FEM_IRREGULARS)) {
    // Only map back to the primary masculine form (skip bel->belle, vieil->vieille etc.)
    if (!FR_ADJ_MASC_IRREGULARS[fem]) {
      FR_ADJ_MASC_IRREGULARS[fem] = masc;
    }
  }

  /**
   * Derive the feminine form of a masculine adjective.
   * 1. Check irregular map first
   * 2. If already ends in 'e', return unchanged (gender-neutral)
   * 3. Apply regular patterns: -er -> -ere, -eux -> -euse, -if -> -ive,
   *    -el/-en/-on -> double consonant + e
   * 4. Default: add 'e'
   */
  function feminize(adj) {
    const lower = adj.toLowerCase();

    // 1. Irregular
    if (FR_ADJ_FEM_IRREGULARS[lower]) return FR_ADJ_FEM_IRREGULARS[lower];

    // 2. Already ends in 'e' -> gender-neutral (petit/petite both handled by regular rule)
    if (lower.endsWith('e')) return lower;

    // 3. Regular patterns
    if (lower.endsWith('er')) return lower.slice(0, -2) + 'ere';
    if (lower.endsWith('eux')) return lower.slice(0, -1) + 'se';
    if (lower.endsWith('if')) return lower.slice(0, -1) + 've';
    if (lower.endsWith('el')) return lower + 'le';
    if (lower.endsWith('en')) return lower + 'ne';
    if (lower.endsWith('on')) return lower + 'ne';
    if (lower.endsWith('et')) return lower + 'te';

    // 4. Default: add 'e'
    return lower + 'e';
  }

  /**
   * Derive the masculine form of a feminine adjective.
   * Reverse of feminize. Returns null if cannot determine.
   */
  function masculinize(adj) {
    const lower = adj.toLowerCase();

    // 1. Irregular reverse
    if (FR_ADJ_MASC_IRREGULARS[lower]) return FR_ADJ_MASC_IRREGULARS[lower];

    // 2. Does not end in 'e' -> already masculine
    if (!lower.endsWith('e')) return lower;

    // 3. Reverse regular patterns
    if (lower.endsWith('ere') && lower.length > 3) return lower.slice(0, -3) + 'er';
    if (lower.endsWith('euse')) return lower.slice(0, -2) + 'x';
    if (lower.endsWith('ive') && lower.length > 3) return lower.slice(0, -2) + 'f';
    if (lower.endsWith('elle') && lower.length > 4) return lower.slice(0, -2);
    if (lower.endsWith('enne') && lower.length > 4) return lower.slice(0, -2);
    if (lower.endsWith('onne') && lower.length > 4) return lower.slice(0, -2);
    if (lower.endsWith('ette') && lower.length > 4) return lower.slice(0, -2);

    // 4. Default: drop trailing 'e'
    if (lower.endsWith('e') && lower.length > 1) return lower.slice(0, -1);

    return null;
  }

  /**
   * Check if a word is a known masculine adjective form.
   * Uses vocab isAdjective set (which contains masculine base forms).
   */
  function isMasculineAdj(word, isAdjective) {
    return isAdjective.has(word);
  }

  /**
   * Check if a word is a known feminine adjective form.
   * A feminine form is recognized if masculinizing it yields a known adjective.
   */
  function isFeminineAdj(word, isAdjective) {
    const masc = masculinize(word);
    return masc !== null && masc !== word && isAdjective.has(masc);
  }

  // v3.0.121: BAGS adjectives (beauty/age/goodness/size) belong BEFORE the
  // noun — when one appears after it, fr-bags owns the (primary) position
  // error; flagging gender here would shadow it in dedupeOverlapping.
  const FR_BAGS_ADJ = new Set([
    'petit', 'grand', 'gros', 'joli', 'beau', 'bon', 'mauvais', 'jeune',
    'vieux', 'nouveau', 'long', 'haut', 'autre', 'premier', 'dernier',
  ]);

  // Determiners that are homographs of (or leak into) the adjective set —
  // "ma/ta/sa" especially: the feminine possessives are NOT adjectives, but
  // "ma" sits in vocab.isAdjective, so Case 1 below feminized "ma sœur" → "mae".
  // Never treat a determiner as the agreeing adjective.
  const FR_DETERMINERS = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'l',
    'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses',
    'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
    'ce', 'cet', 'cette', 'ces', 'quel', 'quelle', 'quels', 'quelles',
  ]);

  // Prepositions / adverbs that are accent-folded homographs of adjectives and
  // leak into vocab.isAdjective — "sur" (preposition "on") collides with the
  // adjective "sûr/sure", so "sur l'autoroute" was feminized to "sure". Never
  // treat these function words as the agreeing adjective.
  const FR_NON_ADJ = new Set([
    'sur', 'sous', 'vers', 'dans', 'chez', 'avec', 'sans', 'pour', 'par',
    'entre', 'contre', 'selon', 'malgre', 'malgré', 'comme', 'plus', 'moins',
    'ne', 'que', 'qui', 'si', 'ou', 'où', 'et', 'mais', 'donc', 'car',
    'mal', 'bien', 'tres', 'très', 'trop', 'peu', 'fort', 'aussi', 'tout',
  ]);

  // Language names are NOUNS ("professeur de français", "cours d'anglais") that
  // also sit in isAdjective (français is both). Never feminize them for a
  // following noun ("de français l'année" → française).
  const FR_LANGUAGE_NOUNS = new Set([
    'français', 'francais', 'anglais', 'espagnol', 'allemand', 'italien',
    'portugais', 'russe', 'chinois', 'japonais', 'arabe', 'néerlandais',
    'neerlandais', 'latin', 'grec', 'hébreu', 'hebreu',
  ]);

  // Épicène nouns wrongly stored with a single gender — the article/adjective is
  // never an agreement error ("de nombreux touristes" — touriste is un/une).
  const FR_EPICENE_NOUN = new Set([
    'touriste', 'touristes', 'élève', 'élèves', 'enfant', 'enfants',
    'artiste', 'artistes', 'collègue', 'collègues', 'camarade', 'camarades',
    'adulte', 'adultes', 'membre', 'membres', 'partenaire', 'partenaires',
  ]);

  // Nouns that head fixed adverbial idioms rather than take an attributive
  // adjective ("à la fois nerveux et enthousiaste" — nerveux is a predicate).
  const FR_IDIOM_NOUN = new Set(['fois']);

  const rule = {
    id: 'fr-adj-gender',
    languages: ['fr'],
    priority: 16,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (fr-adj-gender) — Chrome native parity confirmed in 33-03 audit: FR adjective gender lookup; single-token feminine/masculine form swap",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      return {
        nb: 'Adjektivet <em>' + escapeHtml(finding.original) + '</em> har feil kjønn — bruk <em>' + escapeHtml(finding.fix) + '</em> foran dette substantivet.',
        nn: 'Adjektivet <em>' + escapeHtml(finding.original) + '</em> har feil kjønn — bruk <em>' + escapeHtml(finding.fix) + '</em> framfor dette substantivet.',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const { tokens, vocab, cursorPos } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const adjSet = vocab.isAdjective || new Set();
      // Verb homographs (court = runs / short, reste = remains / rest) must not be
      // feminized as if they were attributive adjectives.
      const verbForms = vocab.frPresensToVerb instanceof Map ? vocab.frPresensToVerb : new Map();
      const findings = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const adjTok = tokens[i];
        const nounTok = tokens[i + 1];

        // Skip token under cursor
        if (cursorPos != null && cursorPos >= adjTok.start && cursorPos <= adjTok.end + 1) continue;

        const adjWord = adjTok.word.toLowerCase();
        const nounWord = nounTok.word.toLowerCase();

        // tokens[i] being a determiner means it is NOT the pre-nominal adjective
        // (Case 1/2). It can still be the noun slot of Case 3, but a determiner
        // is never a noun, so skipping the whole iteration is safe.
        if (FR_DETERMINERS.has(adjWord) || FR_NON_ADJ.has(adjWord) || verbForms.has(adjWord)) continue;
        if (FR_LANGUAGE_NOUNS.has(adjWord)) continue;   // language noun, not an adjective

        // Hyphenated compounds (grand-mère, grand-père, petit-fils) are fixed
        // lexemes — the first element does not agree with the second. Skip when
        // a hyphen sits between the two tokens.
        if (/-/.test(ctx.text.slice(adjTok.end, nounTok.start))) continue;

        // Case 3 (v3.0.121, synthetic-corpus miss "une sauce blanc"): the
        // POST-position — French's default adjective placement. tokens[i] is
        // the noun, tokens[i+1] the adjective. Article gate before the noun
        // for precision; adjective must not itself be a known noun unless
        // it's also in the adjective set (blanc is both).
        {
          const ng3 = nounGenus.get(adjWord); // tokens[i] read as noun
          // Allow one intensifier adverb between the noun and a post-position
          // adjective ("une fille très intelligent" → intelligente). Without
          // this, only the adjacent "fille intelligent" was caught.
          const INTENSIFIERS = ['très', 'tres', 'trop', 'assez', 'si', 'plus', 'moins', 'peu', 'vraiment', 'bien', 'fort'];
          let postTok = nounTok;
          if (ng3 === 'f' && INTENSIFIERS.includes(nounWord) && i + 2 < tokens.length) {
            postTok = tokens[i + 2];
          }
          const postAdj = postTok.word.toLowerCase(); // adjective slot
          const artBefore = i > 0 && ['le', 'la', 'les', 'un', 'une', 'du', 'des', 'ma', 'mon', 'sa', 'son', 'ta', 'ton', 'cette', 'ce'].includes(tokens[i - 1].word);
          if (artBefore && ng3 === 'f' && !FR_IDIOM_NOUN.has(adjWord) && isMasculineAdj(postAdj, adjSet)
              && !FR_BAGS_ADJ.has(postAdj)
              && !FR_DETERMINERS.has(postAdj)
              && !FR_NON_ADJ.has(postAdj)
              && !verbForms.has(postAdj)
              && !isFeminineAdj(postAdj, adjSet)
              && (!nounGenus.has(postAdj) || adjSet.has(postAdj))) {
            const femForm = feminize(postAdj);
            // Never suggest a non-word: the feminine form must itself be a known
            // adjective (guards the +'e' fallback producing garbage on plurals).
            if (femForm !== postAdj && adjSet.has(femForm)) {
              const fix = matchCase ? matchCase(postTok.display, femForm) : femForm;
              findings.push({
                rule_id: 'fr-adj-gender',
                priority: rule.priority,
                start: postTok.start,
                end: postTok.end,
                original: postTok.display,
                fix: fix,
                message: 'Kjonn: "' + postTok.display + '" bor vaere "' + fix + '" etter "' + adjTok.display + '"',
              });
              continue;
            }
          }
        }

        // Cases 1/2 are the PRE-nominal placement (determiner + ADJ + noun): the
        // adjective agrees with the FOLLOWING noun only when it sits in front of
        // it, i.e. directly after a determiner. A bare adjTok that follows a
        // noun / verb / preposition is POST-nominal (it agrees with the PRECEDING
        // noun — Case 3 handles that), or a predicate / passé-composé participle /
        // language noun; pairing it with the next token mis-fires:
        //   "mobilité SOCIALE reste", "bâtiment ANCIEN date",
        //   "a RÉUSSI l'opération", "professeur de FRANÇAIS l'année".
        if (!(i > 0 && FR_DETERMINERS.has(tokens[i - 1].word.toLowerCase()))) continue;

        // Noun must be known with a gender
        const nounGender = nounGenus.get(nounWord);
        if (!nounGender) continue;
        if (FR_EPICENE_NOUN.has(nounWord)) continue;   // both genders valid

        // Case 1: Masculine adjective before feminine noun
        if (nounGender === 'f' && isMasculineAdj(adjWord, adjSet) && !isFeminineAdj(adjWord, adjSet)) {
          const femForm = feminize(adjWord);
          // Only flag if the feminine form differs AND is itself a known adjective
          // (never suggest a non-word — kills the +'e' fallback garbage).
          if (femForm !== adjWord && adjSet.has(femForm)) {
            const fix = matchCase ? matchCase(adjTok.display, femForm) : femForm;
            findings.push({
              rule_id: 'fr-adj-gender',
              priority: rule.priority,
              start: adjTok.start,
              end: adjTok.end,
              original: adjTok.display,
              fix: fix,
              message: 'Kjonn: "' + adjTok.display + '" bor vaere "' + fix + '" foran "' + nounTok.display + '"',
            });
          }
        }

        // Case 2: Feminine adjective before masculine noun
        if (nounGender === 'm' && isFeminineAdj(adjWord, adjSet)) {
          const mascForm = masculinize(adjWord);
          if (mascForm && mascForm !== adjWord && adjSet.has(mascForm)) {
            const fix = matchCase ? matchCase(adjTok.display, mascForm) : mascForm;
            findings.push({
              rule_id: 'fr-adj-gender',
              priority: rule.priority,
              start: adjTok.start,
              end: adjTok.end,
              original: adjTok.display,
              fix: fix,
              message: 'Kjonn: "' + adjTok.display + '" bor vaere "' + fix + '" foran "' + nounTok.display + '"',
            });
          }
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
