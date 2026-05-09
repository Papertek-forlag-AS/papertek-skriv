/**
 * Spell-check rule: FR double-pronoun clitic ordering (PRON-03, priority 60).
 *
 * Phase 12. French object pronoun clitics have a fixed pre-verbal order:
 *   me/te/se/nous/vous (rank 1) < le/la/les (rank 2) < lui/leur (rank 3) < y (rank 4) < en (rank 5)
 *
 * Norwegian students commonly invert rank-2 and rank-3 clitics:
 *   Wrong:   "je lui le donne"  (rank 3 before rank 2)
 *   Correct: "je le lui donne"  (rank 2 before rank 3)
 *
 * Guards:
 *   - le/la/les as articles (before nouns) are NOT treated as clitics
 *   - nous/vous as subject pronouns stop the backwards walk
 *   - Imperative-affirmative (verb-hyphen-clitic) is skipped entirely
 *   - Single clitics are never flagged
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { tokensInSentence, escapeHtml: coreEscape } = core;

  function escapeHtml(s) {
    if (coreEscape) return coreEscape(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Clitic rank table — stable grammar-level closed class (inline per
  // data-logic-separation philosophy).
  var FR_CLITIC_RANKS = {
    me: 1, te: 1, se: 1, nous: 1, vous: 1,
    le: 2, la: 2, les: 2,
    lui: 3, leur: 3,
    y: 4,
    en: 5,
  };

  // Subject pronouns that stop the backwards walk
  var FR_SUBJECT_PRONOUNS = new Set([
    'je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  ]);

  // Negation particles that can sit between subject and clitics
  var FR_NEGATION = new Set(['ne', 'n']);

  /**
   * Check whether a token in raw text is preceded by a hyphen (imperative
   * affirmative construction like "donne-le-moi"). Hyphens are not tokens,
   * so we check the raw text character before the token's start offset.
   */
  function precededByHyphen(text, tokenStart) {
    for (var p = tokenStart - 1; p >= 0; p--) {
      var ch = text.charAt(p);
      if (ch === '-') return true;
      if (ch !== ' ') return false;
    }
    return false;
  }

  /**
   * Check whether a token in raw text is followed by a hyphen (imperative).
   */
  function followedByHyphen(text, tokenEnd) {
    for (var p = tokenEnd; p < text.length; p++) {
      var ch = text.charAt(p);
      if (ch === '-') return true;
      if (ch !== ' ') return false;
    }
    return false;
  }

  var rule = {
    id: 'fr-clitic-order',
    languages: ['fr'],
    priority: 60,
    // exam-audit 33-03: stays safe=false — Multi-token clitic-pronoun reorder; syntactic, not lookup
    exam: {
      safe: false,
      reason: "Stays safe=false (fr-clitic-order) — Multi-token clitic-pronoun reorder; syntactic, not lookup",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      var original = finding.original || '';
      var fix = finding.fix || '';
      return {
        nb: 'Feil rekkefølge på objektpronomen: <em>' + escapeHtml(original) + '</em> skal skrives <em>' + escapeHtml(fix) + '</em>. Riktig rekkefølge: me/te/se &lt; le/la/les &lt; lui/leur &lt; y &lt; en.',
        nn: 'Feil rekkjefølgje på objektpronomen: <em>' + escapeHtml(original) + '</em> skal skrivast <em>' + escapeHtml(fix) + '</em>. Riktig rekkjefølgje: me/te/se &lt; le/la/les &lt; lui/leur &lt; y &lt; en.',
        severity: 'warning',
      };
    },
    check: function (ctx) {
      if (ctx.lang !== 'fr') return [];
      if (!ctx.sentences || !tokensInSentence) return [];

      var findings = [];
      var text = ctx.text;

      for (var s = 0; s < ctx.sentences.length; s++) {
        var range = tokensInSentence(ctx, ctx.sentences[s]);
        if (range.end - range.start < 3) continue; // need subject + clitic + verb minimum

        // Scan for finite verbs in this sentence
        for (var vi = range.start; vi < range.end; vi++) {
          var tagged = ctx.getTagged(vi);
          if (!tagged || !tagged.isFinite) continue;

          var verbTok = ctx.tokens[vi];

          // GUARD: imperative-affirmative — if verb is followed by a hyphen,
          // skip (e.g., "donne-le-moi")
          if (followedByHyphen(text, verbTok.end)) continue;

          // Walk backwards from verb collecting clitics
          var clitics = []; // { idx, rank, word, tok }
          for (var k = vi - 1; k >= range.start; k--) {
            var tok = ctx.tokens[k];
            var w = tok.word.toLowerCase();

            // GUARD: imperative — if this token is preceded by a hyphen, skip entire verb
            if (precededByHyphen(text, tok.start)) {
              clitics = []; // discard — imperative construction
              break;
            }

            // Skip negation particles (ne/n') between subject and clitics
            if (FR_NEGATION.has(w)) continue;

            var rank = FR_CLITIC_RANKS[w];
            if (rank !== undefined) {
              // GUARD: le/la/les article disambiguation.
              // Only treat as clitic if the NEXT token toward the verb is either
              // another clitic, a negation particle, or the verb itself.
              if (w === 'le' || w === 'la' || w === 'les') {
                var nextIdx = k + 1;
                // Skip negation between this position and the next meaningful token
                while (nextIdx < vi && FR_NEGATION.has(ctx.tokens[nextIdx].word.toLowerCase())) nextIdx++;
                if (nextIdx < vi) {
                  var nextW = ctx.tokens[nextIdx].word.toLowerCase();
                  var nextIsClitic = FR_CLITIC_RANKS[nextW] !== undefined;
                  var nextIsVerb = nextIdx === vi;
                  if (!nextIsClitic && !nextIsVerb) {
                    // Next token is neither clitic nor verb — likely an article before a noun
                    break;
                  }
                }
              }

              // GUARD: nous/vous can be subject pronouns.
              // If this is the first token in the sentence or is tagged as subject,
              // and it's nous/vous, treat it as a subject and stop.
              if ((w === 'nous' || w === 'vous') && k === range.start) {
                break; // sentence-initial nous/vous = subject
              }
              if ((w === 'nous' || w === 'vous') && tagged && ctx.getTagged(k).isSubject) {
                // Check if there's nothing before it that looks like a clitic —
                // if this nous/vous is at the subject position, stop.
                if (clitics.length === 0 || k === range.start) {
                  break;
                }
              }

              clitics.unshift({ idx: k, rank: rank, word: w, tok: tok });
            } else if (FR_SUBJECT_PRONOUNS.has(w)) {
              break; // hit subject pronoun, stop
            } else {
              break; // non-clitic, non-subject, non-negation — stop
            }
          }

          // Check for rank ordering violation
          if (clitics.length < 2) continue;

          var hasViolation = false;
          for (var ci = 1; ci < clitics.length; ci++) {
            if (clitics[ci].rank < clitics[ci - 1].rank) {
              hasViolation = true;
              break;
            }
          }

          if (!hasViolation) continue;

          // Build the reordered suggestion
          var sorted = clitics.slice().sort(function (a, b) { return a.rank - b.rank; });
          var originalText = clitics.map(function (c) { return c.tok.display; }).join(' ');
          var fixText = sorted.map(function (c) { return c.tok.display; }).join(' ');

          var spanStart = clitics[0].tok.start;
          var spanEnd = clitics[clitics.length - 1].tok.end;

          findings.push({
            rule_id: 'fr-clitic-order',
            priority: rule.priority,
            start: spanStart,
            end: spanEnd,
            original: originalText,
            display: originalText,
            fix: fixText,
            message: originalText + ' -> ' + fixText,
            severity: 'warning',
          });
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
