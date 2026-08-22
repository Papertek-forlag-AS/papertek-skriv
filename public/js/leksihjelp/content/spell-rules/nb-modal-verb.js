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
    explain: (finding) => {
      const nbPre = finding.modal ? `Etter modalverbet <em>${escapeHtml(finding.modal)}</em>` : 'Etter modalverb';
      return {
        nb: `${nbPre} skal hovedverbet stå i infinitiv — bytt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
        nn: `${nbPre} skal hovudverbet stå i infinitiv — byt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang } = ctx;
      const verbInfinitive = vocab.verbInfinitive || new Map();
      const validWords = vocab.validWords || new Set();
      const out = [];

      // Conditional perfect guard data: vocab.knownParticiples is the set
      // of NB perfektum_partisipp forms emitted by vocab-seam.
      const participles = vocab.knownParticiples || new Set();

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

        // Same-sentence guard: modal context only applies when modal and
        // candidate verb are in the same sentence. Without this, the
        // inverted-modal lookback ("modal … . SubjPron candidate") can
        // span a sentence terminator and misfire (e.g. "… vil. Det sparer
        // …" — "vil" two sentences back triggers spare on sparer).
        if (modalTok && Array.isArray(ctx.sentences) && ctx.sentences.length > 0) {
          let mSent = -1, tSent = -1;
          for (let s = 0; s < ctx.sentences.length; s++) {
            const sent = ctx.sentences[s];
            if (modalTok.start >= sent.start && modalTok.start < sent.end) mSent = s;
            if (t.start >= sent.start && t.start < sent.end) { tSent = s; break; }
          }
          if (mSent !== -1 && tSent !== -1 && mSent !== tSent) continue;
        }

        // Subject-pronoun guard: in modal+subject inversion ("Kva skal vi
        // gjera?"), the post-modal token is the SUBJECT, not the lexical
        // verb. Some subject pronouns (NN 'vi') homograph as imperatives
        // of unrelated verbs (vie_verb → 'vi'), and verbInfinitive.has('vi')
        // returns true. Without this guard the rule false-flags every
        // "skal/kan/må + vi/du/han/…" question.
        if (modalTok && SUBJECT_PRONOUNS.has(t.word)) continue;

        // Clause-boundary guard: when the candidate is ITSELF a finite modal
        // immediately followed by a subject pronoun, it heads a new main clause
        // in inversion — "Hvis du vil kan du bli med" is "…vil, kan du…", where
        // "vil" is the subordinate clause's verb, not a modal governing "kan".
        // Without a comma the boundary is invisible to the tokenizer, so detect
        // the modal+subject inversion. A genuine modal-form error keeps a
        // lexical verb after the modal ("vil kan svømme"), so this stays narrow.
        if (modalTok && MODAL_VERBS.has(t.word)) {
          const nextTok = tokens[i + 1];
          if (nextTok && SUBJECT_PRONOUNS.has(nextTok.word)) continue;
        }

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
            // Phase 46 round 5: NN canonical-alternate guard. The seam's
            // nnCanonicalInfinitives set (Phase 46 round 4) rescues NN
            // infinitives like sjå/spise that the bundled data files as
            // either imperativ values or paradigm sideforms rather than
            // entry.word. Without this, "Eg vil sjå filmen" misfires
            // (verbInfinitive maps sjå→se because se_verb is the auto-NB-
            // sourced canonical) and surfaces "sjå → se" — wrong NN
            // pedagogy. NB context: nnCanonicalInfinitives is empty so
            // the check is a free no-op.
            if (lang === 'nn' && vocab.nnCanonicalInfinitives && vocab.nnCanonicalInfinitives.has(t.word)) continue;
            // Phase 19: NN s-passive infinitive after modal is valid
            // ("kan lesast", "skal gjerast"). Don't suggest replacing
            // the s-passive form with the plain infinitive.
            const sPassivForms = vocab.sPassivForms;
            if (sPassivForms && sPassivForms.has(t.word)) continue;
            // Noun homograph guard, narrow: fikk/fekk (preteritum of få)
            // routinely take nominal complements via "fikk lov/rett/tid/
            // plass/lyst til å X". Without a guard, the rule treats
            // imperativ-derived verb mappings (lov→love, rett→rette)
            // as wrong finite forms. The other true modals (kan, må, vil,
            // skal, bør, kunne, …) almost never take noun complements,
            // so keep their behaviour unchanged. Real-modal fixtures
            // ("kan spiser middag" etc.) where the verb-form just happens
            // to be an agent-noun homograph (spiser_noun) must continue
            // to flag.
            // få/får/fikk/fekk/fått as the MAIN verb "receive/get" takes a noun
            // object, not an infinitive: "får svar", "får besøk", "får hjelp",
            // "fikk et brettspill", "fikk sitt gjennombrudd". Skip when the next
            // token is a noun OR a determiner/article/possessive introducing the
            // object NP (which the narrow fikk/fekk-only + noun-only guard
            // missed — "et"→"ete", "sitt"→"sitte"). The modal reading ("får
            // gjøre") is followed by a verb, never a noun/determiner.
            const FAA_FORMS = new Set(['få', 'får', 'fikk', 'fekk', 'fått']);
            const FAA_OBJECT_DET = new Set([
              'en', 'et', 'ei', 'den', 'det', 'de',
              'sin', 'si', 'sitt', 'sine', 'min', 'mi', 'mitt', 'mine',
              'din', 'di', 'ditt', 'dine', 'hans', 'hennes', 'dens', 'dets',
              'deres', 'vår', 'vårt', 'våre', 'denne', 'dette', 'disse', 'noen', 'noe',
            ]);
            if (FAA_FORMS.has(modalTok.word) &&
                ((vocab.nounGenus && vocab.nounGenus.has(t.word)) || FAA_OBJECT_DET.has(t.word))) continue;
            // A conjunction after a modal ("vil eller ei", "kan og bør") is not
            // a verb to infinitive-check.
            if (t.word === 'eller' || t.word === 'og' || t.word === 'men') continue;
            // Conditional perfect guard: modal + perfektum-partisipp is
            // grammatical NB ("ville skjedd" = would have happened,
            // "skulle tatt" = should have taken, "kunne kommet" = could
            // have come). The token is a participle, not a wrong finite
            // form. Skip when it's in the seam-derived participle set.
            if (participles.has(t.word)) continue;
            out.push({
              rule_id: 'modal_form',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, inf),
              modal: modalTok.display,
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
