/**
 * Spell-check rule: NB/NN subordinate-clause adverb order — BIFF (priority 24).
 *
 * In Norwegian SUBORDINATE clauses the sentence adverb (ikke/aldri) comes
 * BEFORE the finite verb (the "BIFF" rule: I Bisetninger kommer Ikke Foran
 * Finitt verb). L2 learners keep the main-clause order (verb before adverb):
 *   Wrong:   "...fordi jeg liker ikke kaffe."
 *   Correct: "...fordi jeg ikke liker kaffe."
 *   Wrong:   "Jeg vet at han er ikke snill."
 *   Correct: "Jeg vet at han ikke er snill."
 *
 * This is the INVERSE of nb-negation-order (which handles main clauses and
 * EXCLUDES subordinate ones); it reuses the same subject/adverb/finite-verb
 * machinery.
 *
 * PRECISION-FIRST frame (4 ADJACENT tokens):
 *   [subordinator][subject pronoun][finite verb][ikke/aldri]
 * The subordinator must DIRECTLY precede the subject — this is what keeps the
 * rule from firing on a correct V2 main clause that merely follows a
 * subordinate one ("...at han kommer, og han liker ikke kaffe": the token
 * before the 2nd "han" is "og", not a subordinator → no flag).
 * Subordinator set is restricted to UNAMBIGUOUS introducers (no som/om/da/etter/
 * før/siden, which double as prepositions/adverbs).
 *
 * Severity: warning (P2 amber). Rule ID: 'nb-subordinate-order'.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};

  const SUBJECT_PRONOUNS = new Set([
    'jeg', 'eg', 'du', 'han', 'hun', 'ho', 'den', 'det',
    'vi', 'dere', 'dykk', 'de', 'dei', 'man', 'en', 'ein',
  ]);

  // Only sentence adverbs that STRICTLY precede the finite verb in a subordinate
  // clause. (bare/alltid are positionally flexible — excluded for precision.)
  const NEG_ADVERBS = new Set(['ikke', 'ikkje', 'aldri', 'aldrei']);

  const FINITE_AUX = new Set([
    'er', 'var', 'vere', 'være', 'vart', 'blei', 'blir', 'vert', 'vore', 'vært',
    'har', 'hadde', 'hev', 'skal', 'kan', 'må', 'vil', 'bør', 'tør',
    'skulle', 'kunne', 'måtte', 'ville', 'burde',
  ]);

  // Restricted to UNAMBIGUOUS subordinators that take [subord][subject-pronoun]
  // directly. Deliberately omits som/om/da/etter/før/siden (preposition/adverb
  // homographs) to keep the rule from misreading a main clause as subordinate.
  const SUBORDINATORS = {
    nb: new Set(['fordi', 'at', 'hvis', 'dersom', 'ettersom', 'når', 'mens']),
    nn: new Set(['fordi', 'at', 'viss', 'dersom', 'ettersom', 'når', 'medan', 'mens']),
  };

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const rule = {
    id: 'nb-subordinate-order',
    languages: ['nb', 'nn'],
    priority: 24,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Multi-token word-order analysis (BIFF adverb placement); syntactic, not lookup — exceeds Chrome native spellcheck parity',
      category: 'grammar-lookup',
    },
    explain(finding) {
      const adv = escHtml(finding.adverb || '');
      const verb = escHtml(finding.verb || '');
      return {
        nb: `I norske <strong>leddsetninger</strong> (etter <em>fordi, at, hvis</em> …) kommer adverb som <em>${adv}</em> <strong>foran</strong> det bøyde verbet — skriv <em>${adv} ${verb}</em>. (BIFF-regelen.)`,
        nn: `I norske <strong>leddsetningar</strong> (etter <em>fordi, at, viss</em> …) kjem adverb som <em>${adv}</em> <strong>framfor</strong> det bøygde verbet — skriv <em>${adv} ${verb}</em>. (BIFF-regelen.)`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'nb' && ctx.lang !== 'nn') return [];
      if (!ctx.sentences || !core.tokensInSentence) return [];

      const { tokens, cursorPos } = ctx;
      const subs = SUBORDINATORS[ctx.lang] || SUBORDINATORS.nb;
      const knownPresens = (ctx.vocab && ctx.vocab.knownPresens) ? ctx.vocab.knownPresens : new Set();
      const out = [];

      for (const sentence of ctx.sentences) {
        const range = core.tokensInSentence(ctx, sentence);
        if (range.end - range.start < 4) continue;

        // Frame: [subord][subj][finite verb][neg] — 4 adjacent tokens.
        for (let i = range.start; i < range.end - 3; i++) {
          const subTok = tokens[i];
          if (!subTok || !subs.has(subTok.word)) continue;

          const subjTok = tokens[i + 1];
          if (!subjTok || !SUBJECT_PRONOUNS.has(subjTok.word)) continue;

          const verbTok = tokens[i + 2];
          if (!verbTok) continue;
          const isFinite = knownPresens.has(verbTok.word) || FINITE_AUX.has(verbTok.word);
          if (!isFinite) continue;

          const negTok = tokens[i + 3];
          if (!negTok || !NEG_ADVERBS.has(negTok.word)) continue;

          // Cursor guard: don't flag while typing inside the span.
          if (cursorPos != null &&
              cursorPos >= verbTok.start && cursorPos <= negTok.end + 1) continue;

          // Quotation/structural suppression guard.
          if (ctx.suppressedFor && ctx.suppressedFor.structural &&
              (ctx.suppressedFor.structural.has(i + 2) ||
               ctx.suppressedFor.structural.has(i + 3))) continue;

          const fix = negTok.display + ' ' + verbTok.display;
          out.push({
            rule_id: 'nb-subordinate-order',
            priority: rule.priority,
            start: verbTok.start,
            end: negTok.end,
            original: verbTok.display + ' ' + negTok.display,
            fix,
            message: `«${verbTok.display} ${negTok.display}» → «${fix}» (BIFF: adverb foran verbet i leddsetning)`,
            severity: 'warning',
            adverb: negTok.word,
            verb: verbTok.word,
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
