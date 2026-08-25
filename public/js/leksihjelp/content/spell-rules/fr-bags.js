/**
 * Spell-check rule: French BAGS adjective placement (WO-04, priority 68).
 *
 * Phase 7. BAGS adjectives (Beauty, Age, Goodness, Size) typically precede
 * the noun in French. NB students frequently place them after the noun
 * following Norwegian word order.
 *
 * Example: "une femme belle" → "une belle femme"
 *
 * Severity: hint (P3 grey dot) — some BAGS adjectives DO follow the noun
 * with meaning shift (e.g. "un homme grand" = a tall man vs "un grand
 * homme" = a great man), so this is advisory.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { escapeHtml: coreEscape } = core;

  function escapeHtml(s) {
    if (coreEscape) return coreEscape(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Reliably PRE-nominal adjectives — post-nominal placement is a genuine
  // Norwegian-interference error worth nudging. Deliberately EXCLUDED:
  // ancien/long/court/jeune (and previously others) — their post-nominal use is
  // standard correct French ("l'histoire ancienne", "les cheveux longs", "une
  // coupe courte", "des consommateurs jeunes"), structurally indistinguishable
  // from the flagged pattern, so flagging them mis-teaches the student.
  const BAGS_SET = new Set([
    'beau', 'bel', 'belle', 'beaux', 'belles',
    'joli', 'jolie', 'jolis', 'jolies',
    'vieux', 'vieil', 'vieille', 'vieilles',
    'nouveau', 'nouvel', 'nouvelle', 'nouveaux', 'nouvelles',
    'bon', 'bonne', 'bons', 'bonnes',
    'mauvais', 'mauvaise', 'mauvaises',
    'gentil', 'gentille', 'gentils', 'gentilles',
    'vilain', 'vilaine', 'vilains', 'vilaines',
    'brave', 'braves',
    'grand', 'grande', 'grands', 'grandes',
    'petit', 'petite', 'petits', 'petites',
    'gros', 'grosse', 'grosses',
    'haut', 'haute', 'hauts', 'hautes',
    'large', 'larges',
  ]);

  const FR_ARTICLES = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'l', 'du', 'au', 'aux',
  ]);

  // v3.0.130: intensifiers that may sit between the noun and a misplaced
  // BAGS adjective — "un film très bon" is still the post-nominal error
  // (correct: "un très bon film"). Synthetic probe fr/syn-02.
  const FR_INTENSIFIERS = new Set([
    'très', 'tres', 'si', 'assez', 'plutôt', 'plutot', 'vraiment', 'trop', 'super',
  ]);

  // A BAGS adjective joined to another by et/ou/ni describes post-nominally and
  // is correct ("les cheveux longs et bouclés", "un pays long et étroit").
  const COORDINATORS = new Set(['et', 'ou', 'ni']);
  // A prepositional complement keeps the adjective after the noun ("un éclairage
  // nouveau sur l'histoire", "ce n'est pas bon pour la santé", "l'herbe haute
  // derrière la maison").
  const FR_PREPOSITIONS = new Set([
    'de', 'd', 'à', 'a', 'sur', 'sous', 'dans', 'en', 'par', 'pour', 'avec',
    'sans', 'vers', 'chez', 'contre', 'entre', 'derrière', 'devant', 'depuis',
    'pendant', 'selon', 'du', 'des', 'au', 'aux', 'près', 'envers', 'parmi',
  ]);
  // A determiner right AFTER the candidate means it is not a post-nominal
  // adjective here — it is a verb homograph or a new noun phrase ("Ma sœur
  // court le plus vite", where "court" = the verb courir).
  const FR_DETERMINERS = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'du', 'au', 'aux',
    'ce', 'cet', 'cette', 'ces', 'mon', 'ton', 'son', 'ma', 'ta', 'sa',
    'mes', 'tes', 'ses', 'notre', 'votre', 'leur', 'nos', 'vos', 'leurs',
  ]);
  // Function-word homographs that are also nouns (le pas, le peu, le plus): in a
  // predicative/adverbial position they are NOT the head noun of the adjective
  // ("ce n'est pas bon", "un peu trop court").
  const PREDICATIVE_HOMOGRAPHS = new Set([
    'pas', 'peu', 'plus', 'moins', 'point', 'rien', 'tout', 'fort', 'bien',
    'mal', 'fait', 'si', 'tres', 'très', 'trop', 'assez',
  ]);
  const QUOTE_CHARS = /['"«»‹›“”‘’]/;

  const rule = {
    id: 'fr-bags',
    languages: ['fr'],
    priority: 68,
    // exam-audit 33-03: stays safe=false — Multi-token BAGS adjective placement (before/after noun); syntactic edit
    exam: {
      safe: false,
      reason: "Stays safe=false (fr-bags) — Multi-token BAGS adjective placement (before/after noun); syntactic edit",
      category: "grammar-lookup",
    },
    severity: 'hint',
    explain: function (finding) {
      return {
        nb: 'BAGS-adjektiv (Beauty, Age, Goodness, Size) står vanligvis foran substantivet på fransk — flytt <em>' + escapeHtml(finding.display || finding.original) + '</em> foran substantivet.',
        nn: 'BAGS-adjektiv (Beauty, Age, Goodness, Size) står vanlegvis framfor substantivet på fransk — flytt <em>' + escapeHtml(finding.display || finding.original) + '</em> framfor substantivet.',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const findings = [];
      const nounGenus = ctx.vocab.nounGenus || new Map();

      for (let i = 1; i < ctx.tokens.length; i++) {
        if (ctx.suppressedFor && ctx.suppressedFor.structural && ctx.suppressedFor.structural.has(i)) continue;

        const tok = ctx.tokens[i];
        const word = tok.word.toLowerCase();

        // Check if this token is a BAGS adjective
        if (!BAGS_SET.has(word)) continue;

        // Check if the preceding token is a noun. An intensifier may sit
        // between them ("un film très bon") — skip ONE intensifier so the
        // noun check lands on the actual noun (v3.0.130).
        let nounIdx = i - 1;
        if (FR_INTENSIFIERS.has(ctx.tokens[nounIdx].word.toLowerCase()) && nounIdx >= 1) {
          nounIdx -= 1;
        }
        const prevTok = ctx.tokens[nounIdx];
        const prevWord = prevTok.word.toLowerCase();
        let prevIsNoun = nounGenus.has(prevWord);

        // Disambiguation: if the preceding token is ALSO a known verb form,
        // only treat it as a noun if there's an article before it.
        // E.g. "Il fait beau" — fait is both noun and verb; without article
        // it's a verb here. But "le fait bon" — article signals noun usage.
        if (prevIsNoun) {
          var knownP = ctx.vocab.knownPresens || new Set();
          var knownPr = ctx.vocab.knownPreteritum || new Set();
          var verbInf = ctx.vocab.verbInfinitive || new Map();
          var isAlsoVerb = knownP.has(prevWord) || knownPr.has(prevWord) || verbInf.has(prevWord);
          if (isAlsoVerb) {
            // Ambiguous — only keep as noun if preceded by article
            var hasArticle = nounIdx >= 1 && FR_ARTICLES.has(ctx.tokens[nounIdx - 1].word.toLowerCase());
            if (!hasArticle) prevIsNoun = false;
          }
        }

        // Heuristic: if the token before the noun slot is an article and the
        // noun-slot token is not a known adjective, treat it as a noun even
        // if not in nounGenus
        if (!prevIsNoun && nounIdx >= 1) {
          const preprevTok = ctx.tokens[nounIdx - 1];
          const preprevWord = preprevTok.word.toLowerCase();
          if (FR_ARTICLES.has(preprevWord)) {
            // Article + unknown word + BAGS adj → likely noun + adj pattern
            const isAdj = ctx.vocab.isAdjective && ctx.vocab.isAdjective.has(prevWord);
            if (!isAdj) {
              prevIsNoun = true;
            }
          }
        }

        if (!prevIsNoun) continue;

        // Predicative / adverbial homograph instead of a real head noun
        // ("ce n'est pas bon", "un peu trop court").
        if (PREDICATIVE_HOMOGRAPHS.has(prevWord)) continue;

        const nextTok = ctx.tokens[i + 1];
        const nextWord = nextTok ? nextTok.word.toLowerCase() : '';
        // Coordinated description, prepositional complement, or a determiner
        // after the candidate — all keep/turn the word into a non-flaggable
        // position (post-nominal-correct, or a verb homograph like "court le").
        if (nextWord && (COORDINATORS.has(nextWord) || FR_PREPOSITIONS.has(nextWord) || FR_DETERMINERS.has(nextWord))) continue;

        // Fixed expressions: "bon marché" (cheap), "à voix haute" (aloud).
        if (word === 'bon' && nextWord === 'marché') continue;
        if ((word === 'haut' || word === 'haute') && prevWord === 'voix') continue;

        // Quoted / metalinguistic mention: "le mot 'grand' est 'petit'".
        if (ctx.text != null) {
          const pre = ctx.text.slice(Math.max(0, tok.start - 2), tok.start);
          const post = ctx.text.slice(tok.end, tok.end + 2);
          if (QUOTE_CHARS.test(pre) || QUOTE_CHARS.test(post)) continue;
          // Dictionary-style example listing ("un repas bon · une soupe bonne"):
          // the middot marks a constructed contrast, not natural prose.
          if (ctx.text.indexOf('·') !== -1) continue;
        }

        // Check that BAGS adjective is NOT before a noun (i.e., it's truly post-nominal)
        // If the next token is also a noun, this could be a different construction
        // The BAGS adj follows the noun → flag
        findings.push({
          rule_id: 'fr-bags',
          priority: rule.priority,
          start: tok.start,
          end: tok.end,
          original: tok.display,
          display: tok.display,
          fix: tok.display + ' (flytt foran substantivet)',
          message: 'BAGS-adjektivet bør stå foran substantivet: "' + tok.display + '"',
          severity: 'hint',
          // F36-5: BAGS fix is "move the adjective in front of the noun" — a
          // structural reorder, not an atomic token substitution. The literal
          // "fix" string above is instructional ("(flytt foran substantivet)")
          // and would corrupt the sentence if pasted via Fiks. noAutoFix
          // suppresses the Fiks button and orig→fix arrow head; the explain
          // block carries the actionable rule.
          noAutoFix: true,
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
