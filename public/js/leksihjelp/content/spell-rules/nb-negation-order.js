/**
 * Spell-check rule: NB/NN negation/frequency adverb before finite verb (priority 24).
 *
 * Norwegian main clauses follow V2 word order: the finite verb occupies position 2.
 * Negation and frequency adverbs (ikke, aldri, alltid, bare) follow the verb.
 * L2 learners transfer the pre-verb adverb position from German or English:
 *   Wrong:   "Jeg ikke snakker norsk."
 *   Correct: "Jeg snakker ikke norsk."
 *
 * Detection: [subject pronoun][NEG_ADVERB][finite verb] in the same sentence.
 * FP guard: scan tokens before the subject for a subordinating conjunction —
 * in subordinate clauses [subj][neg][verb] is CORRECT Norwegian word order.
 *
 * Rule ID: 'nb_neg_order'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};

  // Combined NB+NN set for dialect-leak tolerance — a NN student may write
  // "Jeg ikkje snakkar"; "Jeg" is still the subject and should still fire.
  const SUBJECT_PRONOUNS = new Set([
    'jeg', 'eg', 'du', 'han', 'hun', 'ho', 'den', 'det',
    'vi', 'dere', 'dykk', 'de', 'dei', 'man', 'en', 'ein',
  ]);

  // Negation and frequency adverbs that commonly precede the verb in L2 learner text.
  const NEG_ADVERBS = new Set(['ikke', 'ikkje', 'aldri', 'aldrei', 'alltid', 'bare']);

  // Closed-set finite auxiliaries and copulas. These are unambiguously finite in
  // any context — used as a fallback when the verb form isn't in knownPresens.
  const FINITE_AUX = new Set([
    'er', 'var', 'vere', 'være', 'vart', 'blei', 'blir', 'vert', 'vore', 'vært',
    'har', 'hadde', 'hev', 'skal', 'kan', 'må', 'vil', 'bør', 'tør',
    'skulle', 'kunne', 'måtte', 'ville', 'burde',
  ]);

  // Subordinating conjunctions — borrowed from nb-v2.js.
  // If any of these appear BEFORE the subject in the same sentence, the
  // [subj][neg][verb] pattern is grammatically correct (subordinate clause).
  const SUBORDINATORS = {
    nb: new Set(['fordi', 'at', 'som', 'når', 'hvis', 'selv', 'om', 'da', 'mens',
                 'etter', 'før', 'siden', 'dersom', 'enda', 'skjønt', 'ettersom',
                 // Temporal "fra (den gang) hun ikke var …" (already in the NN
                 // set as frå) and "så lenge det ikke regner" (compound
                 // subordinator — 'lenge' only ever suppresses).
                 'fra', 'lenge',
                 // Interrogative subordinators (indirect questions): V2 does not apply
                 'hvorfor', 'hvordan', 'hva', 'hvem', 'hvor', 'hvilken', 'hvilket', 'hvilke']),
    nn: new Set(['fordi', 'at', 'som', 'når', 'viss', 'sjølv', 'om', 'då', 'mens',
                 'medan', 'etter', 'før', 'sidan', 'dersom', 'endå', 'trass', 'frå',
                 'ettersom',
                 // Interrogative subordinators (indirect questions): V2 does not apply
                 'kvifor', 'korleis', 'kva', 'kven', 'kor', 'kvar', 'kva', 'kven']),
  };

  function escHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const rule = {
    id: 'nb_neg_order',
    languages: ['nb', 'nn'],
    priority: 24,
    exam: {
      safe: false,
      reason: 'Multi-token word-order analysis (negation placement); syntactic, not lookup — exceeds Chrome native spellcheck parity',
      category: 'grammar-lookup',
    },
    severity: 'warning',
    explain(finding) {
      const adv = escHtml(finding.adverb || '');
      const verb = escHtml(finding.verb || '');
      return {
        nb: `I norske <strong>hovedsetninger</strong> kommer det bøyde verbet på plass 2. Nektings- og frekvensadverb som <em>${adv}</em> skal stå <strong>etter</strong> verbet — skriv <em>${verb} ${adv}</em>.`,
        nn: `I norske <strong>hovudsetningar</strong> kjem det bøygde verbet på plass 2. Nektings- og frekvensadverb som <em>${adv}</em> skal stå <strong>etter</strong> verbet — skriv <em>${verb} ${adv}</em>.`,
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
        if (range.end - range.start < 3) continue;

        for (let i = range.start; i < range.end - 2; i++) {
          const subjTok = tokens[i];
          if (!subjTok || !SUBJECT_PRONOUNS.has(subjTok.word)) continue;

          const negTok = tokens[i + 1];
          if (!negTok || !NEG_ADVERBS.has(negTok.word)) continue;

          const verbTok = tokens[i + 2];
          if (!verbTok) continue;

          const isFinite =
            knownPresens.has(verbTok.word) ||
            FINITE_AUX.has(verbTok.word);
          if (!isFinite) continue;

          // Elided-"som" relative clause: a noun or antecedent pronoun directly
          // before the subject means [subj][neg][verb] is the relative clause's
          // (correct) word order — "meninger jeg ikke har", "politikk de ikke
          // vil stå inne for", "det jeg ikke kan begripe", "søskenbarn han
          // aldri hadde møtt". Sentence-initial subjects (i === range.start)
          // are unaffected, so "Jeg ikke snakker norsk" still flags.
          if (i > range.start) {
            const beforeSubj = tokens[i - 1];
            const REL_ANTECEDENTS = new Set(['det', 'noe', 'alt', 'den', 'dem',
              'dette', 'ingenting', 'ingen', 'mye', 'lite', 'noko', 'alle',
              'tilfelle']); // "i tilfelle de ikke blir …" — compound subordinator head
            const nounGenus = (ctx.vocab && ctx.vocab.nounGenus) || new Map();
            // A noun inside a fronted PP ("I dag jeg ikke vil gå" — 'dag'
            // preceded by the preposition 'i') is a fronted ADVERBIAL, not a
            // relative-clause antecedent — the neg-order error there must
            // still flag. 'tilfelle' is exempt (the "i tilfelle" compound
            // subordinator is exactly a prep + noun).
            const PP_PREPS = new Set(['i', 'på', 'om', 'etter', 'før', 'fra',
              'frå', 'til', 'under', 'over', 'ved', 'hos', 'mot', 'uten', 'utan']);
            const inFrontedPP = i >= 2 && PP_PREPS.has(tokens[i - 2].word)
              && !REL_ANTECEDENTS.has(beforeSubj.word);
            if (beforeSubj && !inFrontedPP
                && (REL_ANTECEDENTS.has(beforeSubj.word) || nounGenus.has(beforeSubj.word))) continue;
          }

          // 'når' verb-homograph: as the i+2 token followed by a subject
          // pronoun it is the SUBORDINATOR opening a new clause ("det sa han
          // alltid når han dro"), not the finite verb of nå. The [subj][adv]
          // pair here belongs to an inverted matrix clause.
          if (verbTok.word === 'når' && tokens[i + 3] && SUBJECT_PRONOUNS.has(tokens[i + 3].word)) continue;

          // FP guard: scan tokens before the subject in the same sentence
          // for a subordinating conjunction. [subj][neg][verb] is CORRECT
          // inside a subordinate clause ("Han sa at jeg ikke snakker norsk").
          let inSubord = false;
          for (let j = range.start; j < i; j++) {
            const t = tokens[j];
            if (t && subs.has(t.word)) { inSubord = true; break; }
          }
          if (inSubord) continue;

          // Cursor guard: don't flag while the user is typing in the span.
          if (cursorPos != null &&
              cursorPos >= negTok.start && cursorPos <= verbTok.end + 1) continue;

          // Quotation suppression guard (structural — set by quotation-suppression.js).
          if (ctx.suppressedFor && ctx.suppressedFor.structural &&
              (ctx.suppressedFor.structural.has(i + 1) ||
               ctx.suppressedFor.structural.has(i + 2))) continue;

          const fix = verbTok.display + ' ' + negTok.display;
          out.push({
            rule_id: 'nb_neg_order',
            priority: rule.priority,
            start: negTok.start,
            end: verbTok.end,
            original: negTok.display + ' ' + verbTok.display,
            fix,
            message: `«${negTok.display} ${verbTok.display}» → «${fix}»`,
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
