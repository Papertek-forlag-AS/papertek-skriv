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

  const BAGS_SET = new Set([
    'beau', 'bel', 'belle', 'beaux', 'belles',
    'joli', 'jolie', 'jolis', 'jolies',
    'jeune', 'jeunes',
    'vieux', 'vieil', 'vieille', 'vieilles',
    'nouveau', 'nouvel', 'nouvelle', 'nouveaux', 'nouvelles',
    'ancien', 'ancienne', 'anciens', 'anciennes',
    'bon', 'bonne', 'bons', 'bonnes',
    'mauvais', 'mauvaise', 'mauvaises',
    'gentil', 'gentille', 'gentils', 'gentilles',
    'vilain', 'vilaine', 'vilains', 'vilaines',
    'brave', 'braves',
    'grand', 'grande', 'grands', 'grandes',
    'petit', 'petite', 'petits', 'petites',
    'gros', 'grosse', 'grosses',
    'long', 'longue', 'longs', 'longues',
    'haut', 'haute', 'hauts', 'hautes',
    'court', 'courte', 'courts', 'courtes',
    'large', 'larges',
  ]);

  const FR_ARTICLES = new Set([
    'le', 'la', 'les', 'un', 'une', 'des', 'l', 'du', 'au', 'aux',
  ]);

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

        // Check if the preceding token (i-1) is a noun
        const prevTok = ctx.tokens[i - 1];
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
            var hasArticle = i >= 2 && FR_ARTICLES.has(ctx.tokens[i - 2].word.toLowerCase());
            if (!hasArticle) prevIsNoun = false;
          }
        }

        // Heuristic: if i-2 is an article and i-1 is not a known adjective,
        // treat i-1 as a noun even if not in nounGenus
        if (!prevIsNoun && i >= 2) {
          const preprevTok = ctx.tokens[i - 2];
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
