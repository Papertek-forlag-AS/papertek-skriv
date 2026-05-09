/**
 * Spell-check rule: wrong verb form after modal (priority 20).
 *
 * Norwegian modal verbs (kan, må, vil, skal, bør, får, …) take a bare
 * infinitive. Flags inflected forms after a modal: "kan spiser" → "kan spise".
 *
 * Rule ID: 'modal_form' — preserved verbatim from pre-INFRA-03 inline rule.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const MODAL_VERBS = new Set([
    'kan', 'kunne', 'kunna',
    'må', 'måtte',
    'vil', 'ville',
    'skal', 'skulle',
    'bør', 'burde',
    'får', 'fikk', 'fekk',
  ]);

  // Subject pronouns that can sit between modal and finite verb in interrogatives
  // and subject-inversion patterns: "Kan du kommer hit?", "Må jeg gjør det?".
  // Covers NB + NN forms.
  const SUBJECT_PRONOUNS = new Set([
    'jeg', 'eg', 'du', 'han', 'hun', 'ho', 'den', 'det', 'vi', 'dere', 'dykk', 'de', 'dei',
    'man', 'en',
  ]);

  const rule = {
    id: 'modal_form',
    languages: ['nb', 'nn'],
    priority: 20,
    exam: {
      safe: false,
      reason: "Modal-verb form (kan gikk → gå) is grammatical pedagogy beyond browser-native spellcheck parity; reclassified 2026-05 per user feedback",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Etter modalverb skal hovedverbet stå i infinitiv — bytt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `Etter modalverb skal hovudverbet stå i infinitiv — byt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const verbInfinitive = vocab.verbInfinitive || new Map();
      const validWords = vocab.validWords || new Set();
      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const prev = tokens[i - 1];
        const prev2 = tokens[i - 2];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        // Modal context: either directly after a modal ("kan spiser") or
        // after a modal+subject-pronoun inversion ("Kan du kommer hit?",
        // "Må jeg gjør det?"). The latter covers interrogatives and topicalised
        // clauses where the finite verb is displaced two tokens from the modal.
        const directModal = prev && MODAL_VERBS.has(prev.word);
        const invertedModal = prev2 && prev && MODAL_VERBS.has(prev2.word) && SUBJECT_PRONOUNS.has(prev.word);
        const modalTok = directModal ? prev : (invertedModal ? prev2 : null);
        if (modalTok && verbInfinitive.has(t.word)) {
          const inf = verbInfinitive.get(t.word);
          if (inf && inf !== t.word) {
            // Phase 05.1-05 bug-fix: the token after a modal is only a "wrong
            // finite form" if it isn't ALREADY a legitimate bare infinitive.
            // Example: NN "Eg vil skrive på nynorsk" — `skrive` is the
            // infinitive of å skrive, but `verbInfinitive.get('skrive')`
            // returns `skrive ut` because the vocab-seam's buildLookupIndexes
            // over-writes the map as it iterates phrasal-verb conjugations
            // (skrive_av, skrive_opp, skrive_ut) that all share
            // `perfektum_partisipp: 'skrive'`. Self-mapping (`baseWord ===
            // word`) is skipped for the own entry (`inf !== w`), but not
            // for phrasal-verb siblings whose bare participle coincides
            // with another verb's infinitive. Defence: if `å ${word}` is in
            // validWords (the seam adds bare-infinitives from conjugation
            // `infinitiv` forms like `å skrive`), the token IS itself a
            // valid infinitive — skip the flag.
            if (validWords.has('å ' + t.word)) continue;
            // Phase 19: NN s-passive infinitive after modal is valid
            // ("kan lesast", "skal gjerast"). Don't suggest replacing
            // the s-passive form with the plain infinitive.
            const sPassivForms = vocab.sPassivForms;
            if (sPassivForms && sPassivForms.has(t.word)) continue;
            out.push({
              rule_id: 'modal_form',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, inf),
              message: `Etter "${modalTok.display}" skal verbet stå i infinitiv: "${inf}"`,
            });
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
