/**
 * Spell-check rule: NB/NN V2 word-order violation (WO-01, priority 65).
 *
 * Phase 7. Flags main-clause sentences where a fronted adverbial or wh-word
 * is followed by subject+verb instead of the correct verb+subject inversion.
 *   Wrong:   "I går jeg gikk på kino"
 *   Correct: "I går gikk jeg på kino"
 *
 * Detection strategy: find subject-pronoun + finite-verb adjacency (or near-
 * adjacency) where at least one non-subject token precedes the subject at the
 * sentence start. This avoids the false-positive trap of multi-word adverbials
 * containing verb-homonyms ("I går" where "går" is present tense of "gå").
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};

  const WH_WORDS = {
    nb: new Set(['hvorfor', 'hvordan', 'hva', 'hvem', 'hvilken', 'hvilke', 'hvor', 'når']),
    nn: new Set(['kvifor', 'korleis', 'kva', 'kven', 'kvar', 'når']),
  };

  const SUBJECT_PRONOUNS = {
    nb: new Set(['jeg', 'du', 'han', 'hun', 'den', 'det', 'vi', 'dere', 'de', 'man', 'en']),
    nn: new Set(['eg', 'du', 'han', 'ho', 'den', 'det', 'vi', 'dykk', 'dei', 'ein']),
  };

  const COORD_CONJUNCTIONS = new Set(['og', 'men', 'eller', 'for']);

  // Discourse particles that introduce a clause WITHOUT establishing the
  // fronted-topicalization that licenses V2 inversion. "Nei, eg kan ikkje
  // kome" — the "Nei," is a separate utterance, not a fronted element of
  // the following clause; the clause restarts with SVO. Same for "Ja,
  // det er bra" where "det" is the (object-fronted or expletive) start
  // of the real clause. Without this guard nb-v2 false-flags every short
  // dialogue answer.
  const DISCOURSE_PARTICLES = new Set(['ja', 'nei', 'jo', 'tja', 'vel', 'nei', 'ok', 'hm', 'au', 'huff']);

  // "Kanskje" / "kanskje" allows both inversion ("Kanskje går vi") and
  // non-inversion ("Kanskje vi går") in both NB and NN; modern descriptive
  // grammar treats both as acceptable. Same for "altså" as a sentence-
  // initial discourse marker. Skip V2 enforcement when one of these is
  // the sole fronted element. Phase 48 Wave B-3 extends this to NB after
  // the corpus surfaced FPs on student writing like "Kanskje jeg kan
  // skrive noe..." — the prescriptive-norm fixture (former nb-v2-pos-004)
  // was retired alongside this change.
  const NON_INVERTING_ADVERBS = new Set(['kanskje', 'altså']);

  // Modal verbs that can start yes/no questions but may not be in knownPresens
  const MODAL_VERBS = new Set(['skal', 'kan', 'må', 'vil', 'bør', 'tør', 'skulle', 'kunne', 'måtte', 'ville', 'burde']);
  // Unambiguous finite verbs (copulas + perfect/passive auxiliaries + modals).
  // When one of these sits immediately before the subject, the clause is already
  // V2-inverted — "[fronted] [finite verb] [subject] [participle]" ("Innan
  // kristendommen er ho feira") — so a following participle is NOT a second
  // finite verb. Closed set, so noun/adverb homographs ("i går") never match.
  const FINITE_AUX = new Set([
    'er', 'var', 'vere', 'være', 'vart', 'blei', 'blir', 'vert', 'vore', 'vært',
    'har', 'hadde', 'hev', 'skal', 'kan', 'må', 'vil', 'bør', 'tør',
    'skulle', 'kunne', 'måtte', 'ville', 'burde',
  ]);

  // Prepositions that take pronoun objects — "Utan dei ville..." is NOT subject+verb
  const PREPOSITIONS_WITH_OBJECTS = new Set([
    'uten', 'utan', 'med', 'mot', 'til', 'fra', 'frå', 'mellom', 'blant',
    'bak', 'foran', 'rundt', 'gjennom',
  ]);

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const rule = {
    id: 'nb-v2',
    languages: ['nb', 'nn'],
    priority: 65,
    // exam-audit 33-03: stays safe=false — Multi-token V2 word-order analysis; syntactic, not lookup
    exam: {
      safe: false,
      reason: "Stays safe=false (nb-v2) — Multi-token V2 word-order analysis; syntactic, not lookup",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      return {
        nb: 'I norske hovedsetninger skal verbet stå på plass 2. Skriv <em>' + escapeHtml(finding.fix) + '</em> i stedet for <em>' + escapeHtml(finding.original) + '</em>.',
        nn: 'I norske hovudsetningar skal verbet stå på plass 2. Skriv <em>' + escapeHtml(finding.fix) + '</em> i staden for <em>' + escapeHtml(finding.original) + '</em>.',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'nb' && ctx.lang !== 'nn') return [];
      if (!ctx.sentences || !core.tokensInSentence) return [];

      const findings = [];
      const lang = ctx.lang;
      const whWords = WH_WORDS[lang] || WH_WORDS.nb;
      const subjPronouns = SUBJECT_PRONOUNS[lang] || SUBJECT_PRONOUNS.nb;
      // Combined set for "is there an earlier/elsewhere subject pronoun?"
      // guards: dialect-leaked subjects ("Jeg" in NN text, "Eg" in NB text)
      // are still subjects of the clause — dialect-mix handles the register
      // flag separately. Without this, V2 false-fires on patterns like
      // "Jeg syns det er rart" in NN mode because the NN-only subjPronouns
      // set doesn't recognize "Jeg" as a subject, so the hasEarlierSubject
      // and "det er" complement-clause guards both fail.
      const anySubjPronouns = new Set([...SUBJECT_PRONOUNS.nb, ...SUBJECT_PRONOUNS.nn]);
      // Subordinators from spell-check-core
      const SUBORDINATORS = {
        nb: new Set(['fordi', 'at', 'som', 'når', 'hvis', 'selv', 'om', 'da', 'mens', 'etter', 'før', 'siden', 'dersom', 'enda', 'skjønt', 'ettersom', 'slik', 'der', 'inntil', 'enn']),
        // NN: `medan` is the canonical NN subordinator (NB cognate `mens`,
        // also accepted as NN sideform). Without `medan` here, V2 falsely
        // fires on subordinate clauses like "medan eg gjorde lekser".
        nn: new Set(['fordi', 'at', 'som', 'når', 'viss', 'sjølv', 'om', 'då', 'mens', 'medan', 'etter', 'før', 'sidan', 'dersom', 'endå', 'trass', 'frå', 'ettersom']),
      };
      const subs = SUBORDINATORS[lang] || SUBORDINATORS.nb;

      for (const sentence of ctx.sentences) {
        const range = core.tokensInSentence(ctx, sentence);
        const sLen = range.end - range.start;
        if (sLen < 3) continue;

        // Phase 50-02 Finding A: structural suppression is checked
        // per-candidate-pair inside the inner loop, NOT sentence-level.
        // The previous all-or-nothing guard skipped the entire sentence
        // only when EVERY token was inside a quote — useless for the
        // reproducer `Læreren min sa: «Du må …», men jeg glemte det.`
        // where tokens outside the quote keep `allSuppressed=false` and
        // the rule walked the inner-quote positions. The replacement
        // check is inside the for-i loop below, mirroring de-v2.js.

        // Skip subordinate clauses: if first token is a subordinator, skip.
        // Exception: "når" is both a subordinator and a wh-word. When at the
        // start of a question (sentence ends with ?), treat as wh-word.
        const firstWord = ctx.getTagged(range.start).word;
        if (subs.has(firstWord)) {
          const isAlsoWh = whWords.has(firstWord);
          const endsWithQuestion = sentence.text.trimEnd().endsWith('?');
          if (!isAlsoWh || !endsWithQuestion) continue;
        }

        // Guard: question-initial — if first word is a finite verb and the
        // sentence ends with "?", this is a yes/no question where subject
        // follows verb naturally (Kan du...? Skal vi...?).
        // Requiring "?" avoids false-suppression on fronted adverbs that are
        // verb-homonyms ("Så vi gikk hjem." — "så" = adverb "then", not verb "saw").
        const endsQ = sentence.text.trimEnd().endsWith('?');
        if (endsQ) {
          const firstTagged = ctx.getTagged(range.start);
          const firstIsVerb = (firstTagged && firstTagged.isFinite) || MODAL_VERBS.has(firstWord);
          if (firstIsVerb && !whWords.has(firstWord)) continue;
        }

        // Guard: elided-subject matrix verb pattern. Informal NB drops
        // the 1st-person-singular subject before reporting verbs:
        //   "Håper han lærer av feilen."  ([Jeg] håper [at] han lærer …)
        //   "Synes ikke det var rart."    ([Jeg] synes ikke …)
        // The first token is a finite verb (or known reporting verb) and
        // the matrix clause has no explicit subject. The subsequent
        // subj+verb sequence is then in a subordinate complement (elided
        // "at"), not a main clause — V2 doesn't apply. Conservative
        // trigger list to avoid false-suppression on legitimate fronted-
        // adverbial V2 violations like "I går jeg gikk hjem".
        const ELIDED_MATRIX_VERBS = new Set([
          // Conservative: only present-tense reporting verbs unambiguous as
          // 1st-person matrix. Preteritum forms (sa, så, hørte, trodde)
          // overlap with valid fronted-adverb V2 patterns like "Så vi gikk
          // hjem" (where "Så" = adverb "then", not verb "saw") — keeping
          // them out preserves the rule's intent on those.
          'håper', 'tror', 'synes', 'mener', 'antar',
        ]);
        if (ELIDED_MATRIX_VERBS.has(firstWord)) continue;

        // Strategy: find adjacent or near-adjacent [subject pronoun] [finite verb]
        // where the subject is NOT at position 0 (i.e. something precedes it).
        // Position 0 subject = normal SVO order (correct).
        for (let i = range.start + 1; i < range.end - 1; i++) {
          const tagged = ctx.getTagged(i);
          if (!tagged || !subjPronouns.has(tagged.word)) continue;

          // Phase 50-02 Finding A: per-candidate-pair structural
          // suppression. If either token of the [subj@i, verb@i+1] pair
          // is inside a quoted span (populated by quotation-suppression
          // at priority 3), skip — same shape as de-v2.js:119-122.
          if (ctx.suppressedFor && ctx.suppressedFor.structural &&
              (ctx.suppressedFor.structural.has(i) ||
               ctx.suppressedFor.structural.has(i + 1))) continue;

          // Phase 50-02 Finding B: quotative-tag inversion. When the
          // candidate pair is immediately preceded by a closing-quote-
          // comma (`,»` or `»,`), treat the closing quote as the
          // fronted constituent (position 0) and skip — verb-subject
          // after a quote is standard NB direct-speech inversion
          // ("«Alle var det,» svarte han.").
          if (i >= 1 && ctx.text && ctx.tokens) {
            const prevTok = ctx.tokens[i - 1];
            const curTok = ctx.tokens[i];
            if (prevTok && curTok) {
              // Gap between prev-token-end and current-token-start
              // holds punctuation/closing quote (WORD_RE does not
              // capture punctuation, so `,»` between tokens lives in
              // the gap).
              const gap = ctx.text.slice(prevTok.end, curTok.start);
              // Closing-quote-comma signatures:
              //   `,»` — comma inside the quote
              //   `»,` — comma after the quote
              if (/,\s*[»”"]/.test(gap) || /[»”"]\s*,/.test(gap)) {
                continue;
              }
            }
          }

          // Found a subject pronoun at position > 0.
          // Check if the NEXT token is a directly-known finite verb.
          // We check knownPresens/knownPreteritum directly rather than
          // relying solely on isFinite, because isFinite also matches
          // stems extracted from multi-word forms (e.g. "gå" from
          // "gå av"), leading to false positives on common words.
          const nextTagged = ctx.getTagged(i + 1);
          if (!nextTagged) continue;
          const nw = nextTagged.word;
          const isDirectFinite = (ctx.vocab.knownPresens && ctx.vocab.knownPresens.has(nw)) ||
                                  (ctx.vocab.knownPreteritum && ctx.vocab.knownPreteritum.has(nw));
          if (!isDirectFinite) continue;

          // Already-inverted guard: if the token before the subject is an
          // unambiguous finite verb (copula/auxiliary/modal), V2 is already
          // satisfied — "[fronted] er/har/skal [subject] [participle/inf]"
          // ("Innan kristendommen er ho feira"). The i+1 token is then a
          // participle/infinitive, not a fronting violation. Real-NN-text FP.
          if (i > range.start) {
            const beforeSubj = ctx.getTagged(i - 1);
            if (beforeSubj && FINITE_AUX.has(beforeSubj.word)) continue;
          }

          // Check that the position 0 token is NOT a subordinator (already handled)
          // and NOT a subject pronoun (that would be SVO with a dropped first element).

          // Embedded wh-clause guard: if there's a wh-word somewhere between
          // start and the subject, AND a finite verb between start and the wh-word,
          // this subject+verb belongs to an embedded wh-clause, not main clause.
          let isEmbeddedWh = false;
          for (let j = range.start; j < i; j++) {
            const jTagged = ctx.getTagged(j);
            if (jTagged && whWords.has(jTagged.word)) {
              // Check if there's a finite verb before this wh-word
              for (let k = range.start; k < j; k++) {
                if (ctx.getTagged(k).isFinite) {
                  isEmbeddedWh = true;
                  break;
                }
              }
              if (isEmbeddedWh) break;
            }
          }
          if (isEmbeddedWh) continue;

          // Guard: if there's a subordinator between start and the subject,
          // this might be a subordinate clause within a larger sentence.
          let hasSubBefore = false;
          for (let j = range.start + 1; j < i; j++) {
            const jTagged = ctx.getTagged(j);
            if (jTagged && subs.has(jTagged.word)) {
              hasSubBefore = true;
              break;
            }
          }
          if (hasSubBefore) continue;

          // Guard: coordinate conjunction before subject — second clause SVO is correct
          let hasCoordBefore = false;
          for (let j = range.start; j < i; j++) {
            const jTagged = ctx.getTagged(j);
            if (!jTagged) continue;
            if (COORD_CONJUNCTIONS.has(jTagged.word)) {
              hasCoordBefore = true;
              break;
            }
            // "så" as a consequence conjunction ("…, så vi gjekk" = "so we
            // went") joins a preceding clause and takes SVO — unlike the
            // fronted adverb "Så gjekk vi" ("then we went", V2). The signal:
            // a non-sentence-initial "så" (something precedes it in the
            // sentence) is the conjunction; sentence/clause-initial "Så"
            // (j === range.start) keeps V2 (see nb-v2-pos-029).
            if (jTagged.word === 'så' && j > range.start) {
              hasCoordBefore = true;
              break;
            }
          }
          if (hasCoordBefore) continue;

          // Guard: clause-boundary punctuation (em-dash —, en-dash –, colon,
          // semicolon) starts a fresh main clause. After such a boundary the
          // subject sits at the HEAD of the new clause, so subject+verb is
          // correct SVO, not a fronted-element V2 violation:
          //   "Serien min er interessant — den handler om en hund."
          //   "Her er poenget: den handler om en hund."
          // Find the token index immediately after the last clause boundary
          // preceding the subject; if the subject IS that token (nothing
          // fronted between the boundary and the subject), skip. A fronted
          // element after the boundary ("…: i går jeg gikk") keeps the flag,
          // since the post-boundary clause then violates V2 on its own.
          // Punctuation lives in the gap between tokens (WORD_RE skips it).
          if (ctx.text && ctx.tokens) {
            let clauseStart = range.start;
            for (let j = range.start + 1; j <= i; j++) {
              const prevTok = ctx.tokens[j - 1];
              const curTok = ctx.tokens[j];
              if (!prevTok || !curTok) continue;
              const gap = ctx.text.slice(prevTok.end, curTok.start);
              if (/[—–:;,]/.test(gap)) clauseStart = j;
            }
            if (clauseStart === i) continue;
          }

          // Guard: discourse-particle fronting. "Nei, eg kan ikkje kome."
          // "Ja, det gjer eg." Discourse particles don't establish a
          // topicalized constituent that licenses V2; the post-comma
          // clause is independent SVO. Applies to both NB and NN.
          //
          // NON_INVERTING_ADVERBS ('kanskje', 'altså') applies to BOTH
          // NB and NN. Descriptive NB grammar accepts non-inversion after
          // these adverbs in modern usage; corpus evidence (Phase 48 NB
          // benchmark, text 3) shows real students writing
          // "Kanskje jeg kan skrive..." which the rule previously over-flagged.
          let hasDiscourseFronting = false;
          for (let j = range.start; j < i; j++) {
            const jTagged = ctx.getTagged(j);
            if (!jTagged) continue;
            if (DISCOURSE_PARTICLES.has(jTagged.word)) {
              hasDiscourseFronting = true;
              break;
            }
            if (NON_INVERTING_ADVERBS.has(jTagged.word)) {
              hasDiscourseFronting = true;
              break;
            }
          }
          if (hasDiscourseFronting) continue;

          // Guard: elided-"som" relative clause — when an earlier subject
          // pronoun (or expletive det/den) appears in the sentence, the
          // current subject+verb sequence is most likely inside a relative
          // clause modifying a noun phrase, e.g.:
          //   "Det eneste jeg er redd for, er …"     (det at pos 0)
          //   "Forhåpentligvis blir det en uke jeg kommer til å huske."
          //                            ↑                ↑
          //                            earlier det      this subj+verb
          // V2 only governs main-clause word order, so skip.
          let hasEarlierSubject = false;
          for (let j = range.start; j < i; j++) {
            const jTagged = ctx.getTagged(j);
            if (jTagged && anySubjPronouns.has(jTagged.word)) {
              hasEarlierSubject = true;
              break;
            }
          }
          if (hasEarlierSubject) continue;

          // Guard: relative clause on an antecedent pronoun. When the token
          // immediately before the subject is an indefinite/demonstrative
          // antecedent (noe/alt/det/den/dem/ingenting) the subject+verb is a
          // relative clause modifying it ("noe [som] en har mistet", "alt [som]
          // han fortalte", "dette er noe vi må se"). SVO is correct there.
          const REL_ANTECEDENTS = new Set(['noe', 'alt', 'det', 'den', 'dem', 'dette', 'ingenting', 'ingen', 'mye', 'lite']);
          if (i > range.start) {
            const bTag = ctx.getTagged(i - 1);
            if (bTag && REL_ANTECEDENTS.has(bTag.word)) continue;
          }

          // Guard: MID-sentence wh-word before the subject → embedded question or
          // relative clause, which is verb-final SVO ("… hvor viktige de er",
          // "samme hva jeg gjør", "med hva en sier", "gjett hvem jeg traff").
          // Position-0 wh (a fronted wh-question) is NOT covered here — that is
          // handled by the V2/question logic above. The pre-existing embedded-wh
          // guard required a finite verb before the wh; this covers the bare
          // "verb-less matrix + embedded wh" case it missed.
          let hasMidWh = false;
          for (let j = range.start + 1; j < i; j++) {
            const jt = ctx.getTagged(j);
            if (jt && whWords.has(jt.word)) { hasMidWh = true; break; }
          }
          if (hasMidWh) continue;

          // Guard: complement clause after a reporting/mental verb. When one
          // appears before the subject, the subject+verb is the object clause
          // with an elided "at" ("jentene synes han er sexy", "legene trodde han
          // var …", "hvilke problemer tror du vil oppstå") — SVO, not V2.
          // Quotative "sa/sier" excluded (handled by the direct-speech guard).
          const REPORTING_VERBS_MID = new Set([
            'tror', 'trodde', 'synes', 'syntes', 'mener', 'mente', 'vet', 'visste',
            'håper', 'håpet', 'tenkte', 'tenker', 'føler', 'følte', 'antar', 'antok',
            'trur', 'meiner', 'meinte', 'veit', 'visste', 'håpar', 'trudde',
          ]);
          let hasReportingBefore = false;
          for (let j = range.start; j < i; j++) {
            const jt = ctx.getTagged(j);
            if (jt && REPORTING_VERBS_MID.has(jt.word)) { hasReportingBefore = true; break; }
          }
          if (hasReportingBefore) continue;

          // Guard: fronted-noun-head relative clause with elided "som".
          //   "Boka eg lånte heitte 'Sult'."
          //    ↑    ↑                ↑
          //    head subj+verb        main verb (the V2 slot belongs to "heitte",
          //                                     not to the relative-clause "lånte")
          // Pattern: a BARE noun (NOT inside a fronted prepositional phrase
          // like "I helgen vi var" — that's a legit V2 violation, not a
          // relative clause) precedes the subject AND no finite verb has
          // appeared yet. Distinguishing the bare-NP head from a PP head
          // is what makes this guard safe; "I helgen" still triggers V2.
          const nounGenusMap = ctx.vocab.nounGenus || new Map();
          const PREP_FRONTED = new Set([
            'i', 'på', 'av', 'til', 'fra', 'frå', 'med', 'mot', 'om', 'ut',
            'inn', 'opp', 'ned', 'over', 'under', 'gjennom', 'mellom', 'blant',
            'foran', 'bak', 'rundt', 'uten', 'utan', 'hos', 'etter', 'før',
            'siden', 'sidan', 'ved', 'utenfor', 'innenfor', 'utanfor', 'innanfor',
          ]);
          let hasEarlierNoun = false;
          let hasEarlierFinite = false;
          let sawPrep = false;
          let nounIsBareHead = false;
          for (let j = range.start; j < i; j++) {
            const jTagged = ctx.getTagged(j);
            if (!jTagged) continue;
            if (jTagged.isFinite) { hasEarlierFinite = true; break; }
            if (PREP_FRONTED.has(jTagged.word)) sawPrep = true;
            if (nounGenusMap.has(jTagged.word)) {
              hasEarlierNoun = true;
              if (!sawPrep) nounIsBareHead = true;
            }
          }
          if (hasEarlierNoun && nounIsBareHead && !hasEarlierFinite) continue;

          // Guard: predicative-NP relative clause with elided "som". Phase 48
          // C6. The bare-noun-head guard above breaks on the copula "er" /
          // "var", but copular constructions specifically create predicative
          // positions where relative clauses are routine:
          //   "Hovedkarakteren er et vesen [som] jeg uttaler som Rusallki"
          //                            ↑          ↑
          //                            indef art  subj+verb
          //   "Det var en mann [som] vi møtte i går"
          // Signal: the two tokens immediately before the subject pronoun are
          // [indefinite article] + [any non-verb word]. Indef-article + noun
          // + subj+verb is an extremely strong relative-clause cue in NB; even
          // if the noun is missing from nounGenusMap, the pattern is reliable.
          // Excludes the V2-violating "I helgen jeg var" case (preceding token
          // would be a noun, not an indefinite article).
          const INDEF_ARTICLES = new Set(['en', 'et', 'ei', 'ein', 'ei']);
          if (i - 2 >= range.start) {
            const twoBack = ctx.getTagged(i - 2);
            if (twoBack && INDEF_ARTICLES.has(twoBack.word)) continue;
          }

          // Guard: predicative-NP relative clause with one attributive
          // adjective between article and noun:
          //   "det er en kort tekst [som] jeg leste"
          //   "en gammel mann [som] vi kjente"
          // Same signal one position further back.
          if (i - 3 >= range.start) {
            const threeBack = ctx.getTagged(i - 3);
            if (threeBack && INDEF_ARTICLES.has(threeBack.word)) continue;
          }

          // Guard: sentence-initial "Ikke" (negative imperative fragment).
          // Phase 48 C6. Patterns like:
          //   "Ikke se på mobilen, ikke gjøre lekser, jeg må finne ut …"
          // are comma-separated infinitive imperatives followed by a new
          // declarative main clause. The subj+verb starts a fresh clause
          // where SVO order is correct; V2 doesn't reach across the
          // imperative fragment(s). Narrow guard: only fires when firstWord
          // of the sentence is exactly "ikke" — doesn't suppress
          // "I går jeg gikk" or other true V2 violations.
          if (firstWord === 'ikke') continue;
          // "Enten du vil eller ei" (correlative — SVO) and "Klart jeg kommer"
          // (predicative adjective + elided "at" complement — SVO).
          if (firstWord === 'enten' || firstWord === 'klart' || firstWord === 'klar') continue;

          // Guard: complement clause — "det er/var" after an earlier finite verb
          // or after a position-0 subject+verb (SVO first clause), meaning
          // "det er" is in a subordinate complement, not a main clause.
          // Covers: "Han sier det er bra", "Eg veit ikkje hvor det er", etc.
          if (tagged.word === 'det' && (nw === 'er' || nw === 'var')) {
            let hasEarlierVerb = false;
            for (let j = range.start; j < i; j++) {
              const jTagged = ctx.getTagged(j);
              if (!jTagged) continue;
              const jw = jTagged.word;
              if (jTagged.isFinite ||
                  (ctx.vocab.verbForms && ctx.vocab.verbForms.has(jw)) ||
                  (ctx.vocab.verbInfinitive && ctx.vocab.verbInfinitive.has(jw)) ||
                  MODAL_VERBS.has(jw)) {
                hasEarlierVerb = true;
                break;
              }
            }
            // Also check: subject pronoun at position 0 makes this a multi-clause
            // sentence where later "det er/var" is subordinate. Use the combined
            // NB+NN subject set so dialect-leaked subjects (e.g. "Jeg" in NN
            // text) still license the embedded-complement guard.
            if (!hasEarlierVerb) {
              const firstT = ctx.getTagged(range.start);
              if (firstT && anySubjPronouns.has(firstT.word)) hasEarlierVerb = true;
            }
            if (hasEarlierVerb) continue;
          }

          // Guard: preposition + pronoun — "Utan dei ville..." where "dei" is
          // the object of a preposition, not a sentence subject
          if (i > range.start) {
            const beforeTagged = ctx.getTagged(i - 1);
            if (beforeTagged && PREPOSITIONS_WITH_OBJECTS.has(beforeTagged.word)) continue;
          }

          // Guard: determiner, not subject pronoun. The indefinite articles
          // en/et/ei/ein and the plural determiner de/dei are homographs of the
          // subject pronouns "en" (one) / "de" (they), but directly before a
          // NOUN or ADJECTIVE they head a noun phrase — "synge en sang", "hyre
          // en maler", "begrave de døde", "de ansatte", "de mistenkte". The
          // following noun/adjective is often a verb-homograph (sang, døde,
          // maler), which is exactly what made the V2 detector misread the NP as
          // subject+verb. Skip when the next token is a known noun or adjective.
          const DETERMINER_HOMOGRAPHS = new Set(['en', 'et', 'ei', 'ein', 'de', 'dei', 'det', 'den']);
          if (DETERMINER_HOMOGRAPHS.has(tagged.word)) {
            const nounG = ctx.vocab.nounGenus || new Map();
            const adjS = ctx.vocab.isAdjective || new Set();
            const nwl = nw.toLowerCase();
            // Determiner + (noun | adjective) → noun phrase, not subject+verb.
            if (nounG.has(nwl) || adjS.has(nwl)) continue;
            // Nominalized (declined) adjective/participle head: "det forsømte",
            // "de mistenkte", "de ansatte", "det tapte" — the declined form maps
            // to an adjective lemma.
            const adjLemma = ctx.vocab.adjLemma;
            if (adjLemma && adjLemma.has(nwl)) continue;
            // Determiner + adjective/participle + NOUN ("en lei hoste", "en
            // blandet mottakelse", "de nye bestemmelsene") — the participle
            // adjective may be absent from isAdjective, but a noun two tokens
            // out confirms the NP reading.
            const n2 = ctx.getTagged(i + 2);
            if (n2 && nounG.has(n2.word.toLowerCase())) continue;
          }

          // Build finding: flag just the subject pronoun to avoid overlap
          // with other rules that may fire on the verb token.
          const subjToken = ctx.tokens[i];
          const verbToken = ctx.tokens[i + 1];
          const original = subjToken.display + ' ' + verbToken.display;
          const fix = verbToken.display + ' ' + subjToken.display;

          findings.push({
            rule_id: 'nb-v2',
            start: subjToken.start,
            end: subjToken.end,
            original: original,
            fix: fix,
            message: original + ' → ' + fix + ' (V2)',
            severity: 'warning',
            // F36-5: V2 fix requires reordering tokens across the clause; the
            // marker spans only the subject pronoun, so applying `fix` as an
            // atomic substitution would corrupt the sentence. noAutoFix tells
            // spell-check.js to suppress the Fiks button and the orig→fix
            // arrow head; the explain() block carries the actionable rule.
            noAutoFix: true,
          });

          // Only flag once per sentence
          break;
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
