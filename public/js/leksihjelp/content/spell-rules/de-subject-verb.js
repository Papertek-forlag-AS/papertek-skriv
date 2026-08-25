/**
 * Spell-check rule: German subject–verb agreement (de-subject-verb, priority 19).
 *
 * Flags a finite verb that sits directly beside an unambiguously-nominative
 * subject pronoun but is conjugated for the wrong person/number. Covers the
 * closed MODAL + SEIN paradigms (below) AND regular verbs (data-driven from
 * verbbank present conjugations via vocab.deRegularPresent). Both word orders:
 *
 *   Subject → verb:
 *     "Ich kannst …"  → "Ich kann …"     (kannst is 2sg, subject is 1sg)
 *     "Du kann …"     → "Du kannst …"
 *     "Wir könnt …"   → "Wir können …"
 *     "Ich bist …"    → "Ich bin …"
 *
 *   Verb → subject (inversion — yes/no + W-questions, V2 fronting):
 *     "Kann du …?"      → "Kannst du …?"
 *     "Wann muss du …?" → "Wann musst du …?"
 *     "Heute kann du …" → "Heute kannst du …"
 *   The inversion path requires the verb and pronoun to be directly adjacent
 *   (whitespace-only gap) so it never pairs a clause-final verb with the next
 *   clause's subject ("… kann. Du …").
 *
 * Modal + sein use a closed hardcoded paradigm (no indicative↔subjunctive
 * surface collision). Regular verbs use the verbbank present index, with
 * three FP guards: (1) a bare infinitive directly after a pronoun is treated
 * as a modal complement, not a finite verb ("Kann du kommen?"); (2) the
 * er-class skips forms equal to the verb's ich-form, the Konjunktiv-I
 * look-alike ("er sagt, er komme …"); (3) "ihr" is excluded from inversion
 * because post-verbal "ihr" is usually a dative object ("Er hilft ihr").
 * Ambiguous "sie/Sie"/"es" and the auxiliaries haben/werden are excluded.
 *
 * Exam mode: safe = false — this is a syntactic agreement check, not a
 * single-token spelling lookup, so it is suppressed when exam mode is on.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // person/number class → conjugated form, per lemma.
  // Classes: ich (1sg), du (2sg), er (3sg: er/sie/es/man), wir (1pl), ihr (2pl).
  const PARADIGMS = {
    können: { ich: 'kann', du: 'kannst', er: 'kann', wir: 'können', ihr: 'könnt' },
    müssen: { ich: 'muss', du: 'musst', er: 'muss', wir: 'müssen', ihr: 'müsst' },
    sollen: { ich: 'soll', du: 'sollst', er: 'soll', wir: 'sollen', ihr: 'sollt' },
    wollen: { ich: 'will', du: 'willst', er: 'will', wir: 'wollen', ihr: 'wollt' },
    dürfen: { ich: 'darf', du: 'darfst', er: 'darf', wir: 'dürfen', ihr: 'dürft' },
    mögen: { ich: 'mag', du: 'magst', er: 'mag', wir: 'mögen', ihr: 'mögt' },
    möchten: { ich: 'möchte', du: 'möchtest', er: 'möchte', wir: 'möchten', ihr: 'möchtet' },
    sein: { ich: 'bin', du: 'bist', er: 'ist', wir: 'sind', ihr: 'seid' },
    // v3.0.118 (synthetic-corpus probe "Wir hat gewonnen" scored 0): haben
    // was missing from the closed paradigms. Known trade-off: Konjunktiv I
    // "er habe gesagt" (reported speech, B2+) will flag er habe → hat — in
    // A1/A2 student texts a bare "er habe" is an agreement error virtually
    // always, so the trade matches this audience.
    haben: { ich: 'habe', du: 'hast', er: 'hat', wir: 'haben', ihr: 'habt' },
  };

  // Only UNAMBIGUOUSLY-NOMINATIVE pronouns. ich/du/wir/ihr have distinct
  // accusatives (mich/dich/uns/euch); er→ihn; man is subject-only — so when one
  // of these sits directly before a finite verb it can only be the subject.
  // Excluded on purpose: "es" and "sie/Sie" are nominative OR accusative, so a
  // preverbal "es"/"sie" may be an OBJECT (e.g. "…dass wir es können", where
  // wir is the subject and es the object). Flagging those would be a false
  // positive. Full noun-phrase subjects ("Die Frauen sieht das Kind") are also
  // excluded: German allows OVS order and die/das don't disambiguate case, so
  // which NP is the subject is genuinely undecidable — accepted risk.
  const SUBJECT_CLASS = {
    ich: 'ich', du: 'du',
    er: 'er', man: 'er',
    wir: 'wir', ihr: 'ihr',
  };

  // Function words (politeness particles, possessives, negation determiner) that
  // are homographs of a present verb form — "bitte"=bitten, "danke"=danken,
  // "meine"=meinen, … Next to a pronoun these are particles/determiners, not a
  // disagreeing finite verb, so "Hast du meine Tasche?" / "Kannst du bitte
  // helfen?" must not flag "meine"/"bitte". (The correct "ich meine das ernst"
  // is already safe — there "meine" IS the ich-form, so no disagreement fires.)
  const NON_VERB_HOMOGRAPHS = new Set([
    'bitte', 'danke',
    'meine', 'deine', 'seine', 'keine', 'ihre', 'eure', 'unsere',
  ]);
  // A determiner after one of these heads a prepositional phrase, not the subject.
  const DE_PREPOSITIONS = new Set([
    'in', 'an', 'auf', 'über', 'unter', 'vor', 'hinter', 'neben', 'zwischen',
    'mit', 'bei', 'von', 'zu', 'nach', 'aus', 'seit', 'gegenüber',
    'durch', 'für', 'gegen', 'ohne', 'um', 'während', 'wegen', 'trotz',
    'entlang', 'innerhalb', 'außerhalb', 'oberhalb', 'unterhalb', 'statt', 'anstatt',
  ]);

  // Coordinating conjunctions: "X und ich/du/wir …" is a COMPOUND subject and
  // takes a PLURAL verb ("Der Chef und ich haben …" — wir-agreement, not habe).
  const COORD_CONJ = new Set(['und', 'oder', 'sowie']);

  // Preterite modal forms — the closed FORM_INDEX only carries present modals,
  // so a preterite modal ("konnte das Team gewinnen", "Sie mussten das Spiel
  // verlassen") wasn't recognised as the finite verb, and the following bare
  // infinitive got agree-checked as if it were finite.
  const MODAL_PRETERITE = new Set([
    'konnte', 'konntest', 'konnten', 'konntet',
    'musste', 'musstest', 'mussten', 'musstet',
    'wollte', 'wolltest', 'wollten', 'wolltet',
    'sollte', 'solltest', 'sollten', 'solltet',
    'durfte', 'durftest', 'durften', 'durftet',
    'mochte', 'mochtest', 'mochten', 'mochtet',
  ]);

  // Finite auxiliary forms of haben/sein/werden. A pronoun that FOLLOWS one is
  // a post-verbal (inversion) subject, and the word after it is that auxiliary's
  // participle/infinitive, not a finite verb to agree-check ("Hast du gehört …"
  // — «gehört» is the participle of the finite «Hast»).
  const AUX_FINITE = new Set([
    'habe', 'hast', 'hat', 'haben', 'habt',
    'bin', 'bist', 'ist', 'sind', 'seid',
    'war', 'warst', 'waren', 'wart',
    'wird', 'wirst', 'werde', 'werden', 'werdet', 'wurde', 'wurden',
    'hatte', 'hattest', 'hatten', 'hattet',
  ]);

  // Relative / demonstrative pronouns. A det+noun that directly follows one is a
  // relative-clause object or a genitive attribute, not the clause subject.
  const REL_PRONOUNS = new Set([
    'die', 'der', 'das', 'dem', 'den', 'deren', 'denen', 'dessen',
    'welche', 'welcher', 'welches', 'welchem', 'welchen',
  ]);

  // form (lowercased) → { lemma, class }. Forms are distinct across paradigms.
  const FORM_INDEX = {};
  for (const [lemma, forms] of Object.entries(PARADIGMS)) {
    for (const [cls, form] of Object.entries(forms)) {
      FORM_INDEX[form] = { lemma, class: cls };
    }
  }

  const CLASS_LABEL = {
    ich: 'ich (jeg)', du: 'du', er: 'er/hun/det', wir: 'wir (vi)', ihr: 'ihr (dere)',
  };

  const rule = {
    id: 'de-subject-verb',
    languages: ['de'],
    priority: 19,
    exam: {
      safe: false,
      reason: 'Stays safe=false (de-subject-verb) — subject–verb agreement is a syntactic check, not a single-token spelling lookup',
      category: 'grammar-lookup',
    },
    severity: 'error',
    explain: (finding) => {
      const subj = finding.subject ? `<em>${escapeHtml(finding.subject)}</em>` : 'subjektet';
      const subjEn = finding.subject ? `<em>${escapeHtml(finding.subject)}</em>` : 'the subject';
      return {
        nb: `Verbet <em>${escapeHtml(finding.original)}</em> er ikke bøyd for subjektet ${subj} — bruk <em>${escapeHtml(finding.fix)}</em>.`,
        nn: `Verbet <em>${escapeHtml(finding.original)}</em> er ikkje bøygd for subjektet ${subj} — bruk <em>${escapeHtml(finding.fix)}</em>.`,
        en: `The verb <em>${escapeHtml(finding.original)}</em> doesn't agree with the subject ${subjEn} — use <em>${escapeHtml(finding.fix)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, text } = ctx;
      if (!tokens) return [];
      const out = [];

      const vocab = ctx.vocab || {};
      const verbInf = vocab.verbInfinitive instanceof Map ? vocab.verbInfinitive : null;
      const reg = (vocab.deRegularPresent && vocab.deRegularPresent.byForm instanceof Map)
        ? vocab.deRegularPresent : null;

      const pushFinding = (verbTok, subjTok, expected, cls) => {
        if (cursorPos != null && cursorPos >= verbTok.start && cursorPos <= verbTok.end + 1) return;
        out.push({
          rule_id: 'de-subject-verb',
          priority: rule.priority,
          start: verbTok.start,
          end: verbTok.end,
          original: verbTok.display,
          fix: matchCase(verbTok.display, expected),
          subject: subjTok.display,
          subjectClass: cls,
          message: `«${verbTok.display}» passer ikke til subjektet «${subjTok.display}» — bruk «${expected}»`,
        });
      };

      // Closed modal + sein paradigm (high-confidence, no Konjunktiv collision).
      const flagModal = (verbTok, subjTok, cls) => {
        const info = FORM_INDEX[verbTok.word];
        if (!info) return false;
        const expected = PARADIGMS[info.lemma][cls];
        if (!expected || expected === verbTok.word) return false;
        pushFinding(verbTok, subjTok, expected, cls);
        return true;
      };

      // Regular-verb agreement, data-driven from verbbank present conjugations.
      // Fires only when the written form is a present form of some verb but is
      // NOT the correct form for the subject's person under ANY of its lemmas
      // (homograph guard). Konjunktiv-I guard: skip the er-class when the form
      // equals that verb's ich-form (e.g. reported speech "er gehe" = Konj I,
      // not an indicative error).
      const flagRegular = (verbTok, subjTok, cls, allowInfinitive) => {
        if (!reg) return false;
        const w = verbTok.word;
        // Function-word homograph next to the pronoun (possessive/particle) —
        // not a disagreeing finite verb. Avoids "Hast du meine Tasche?" → meinst.
        if (NON_VERB_HOMOGRAPHS.has(w)) return false;
        // Skip bare infinitives: the wir/sie present form is identical to the
        // infinitive, and a pronoun directly before an infinitive is normally
        // its modal's complement ("Kann du kommen?", "Wann muss du gehen?"),
        // not a finite verb to agree-check. Avoids the biggest FP class.
        if (reg.byLemma.has(w) && !allowInfinitive) return false;
        const infs = reg.byForm.get(w);
        if (!infs || !infs.size) return false;
        for (const inf of infs) {
          const p = reg.byLemma.get(inf);
          if (p && p[cls] === w) return false; // correct form for this person → no error
          // Sibilant-stem du-form: for verbs whose stem ends in s/ß/z/tz/x the
          // du-ending merges, so the du-form equals the er-form ("du schwitzt/
          // sitzt/heißt/reist"). Some bank entries carry the archaic "-est"
          // du-form (schwitzest); accept the modern merged form.
          if (cls === 'du' && p && p.er === w && /(?:s|ß|z|x)$/.test(inf.replace(/e?n$/, ''))) return false;
        }
        if (cls === 'er') {
          for (const inf of infs) {
            const p = reg.byLemma.get(inf);
            if (p && p.ich === w) return false; // Konjunktiv-I look-alike
          }
        }
        let inf = verbInf && verbInf.get(w);
        if (!(inf && reg.byLemma.has(inf))) inf = infs.values().next().value;
        const p = reg.byLemma.get(inf);
        const expected = p && p[cls];
        if (!expected || expected === w) return false;
        pushFinding(verbTok, subjTok, expected, cls);
        return true;
      };

      // v3.0.118 (synthetic-corpus probe "Das Training starten" scored 0):
      // singular-determiner noun-phrase subjects. das/der/dieser/jeder force a
      // SINGULAR subject by construction, so det + KnownNoun + verb expects
      // the er-form regardless of noun-plurality edge cases. OVS fronting
      // ("Das Training starten wir um sechs") is correct German — skip when a
      // nominative pronoun follows the verb. allowInfinitive lets the
      // infinitive-shaped error through ("starten" for "startet"), which the
      // pronoun path must keep guarding against (modal complements).
      const DET_SG = new Set(['das', 'der', 'dieser', 'dieses', 'jeder', 'jedes']);
      const NOM_PRONOUNS = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man']);
      const nounGenus = vocab.nounGenus instanceof Map ? vocab.nounGenus : new Map();
      const isCapNoun = (t) => t && t.display && t.display[0] !== t.display[0].toLowerCase()
        && nounGenus.has(t.word);

      // Konjunktiv-I reported-speech guard for the closed paradigm. The only
      // indicative↔Konjunktiv-I surface collision in PARADIGMS is haben's
      // "habe" (ich-form == Konj-I er-form). A bare "er habe" is overwhelmingly
      // an A1/A2 agreement slip (→ hat) and stays flagged — BUT inside reported
      // speech ("Mein Lehrer sagte, er habe keine Zeit") it is correct Konj I.
      // Detect the frame: a reporting verb earlier in the sentence, with a comma
      // between it and the subject pronoun. Mirrors de-akkusativ-pronoun's guard.
      const REPORTING_VERBS = new Set([
        'sagte', 'sagt', 'meinte', 'meint', 'erzählte', 'erzählt',
        'fragte', 'fragt', 'behauptete', 'behauptet', 'erklärte', 'erklärt',
        'antwortete', 'antwortet', 'berichtete', 'berichtet', 'betonte', 'betont',
        'erwiderte', 'versicherte', 'glaubte', 'dachte', 'schrieb', 'schreibt', 'fügte',
      ]);
      const isReportedSpeechBefore = (subjIdx) => {
        for (let k = subjIdx - 1; k >= 0; k--) {
          const gap = text ? text.slice(tokens[k].end, tokens[k + 1].start) : '';
          if (/[.!?]/.test(gap)) return false;          // sentence boundary
          if (REPORTING_VERBS.has(tokens[k].word)) {
            // require a comma somewhere between the reporting verb and the subject
            const frame = text ? text.slice(tokens[k].end, tokens[subjIdx].start) : '';
            return /,/.test(frame);
          }
        }
        return false;
      };

      for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i];
        const b = tokens[i + 1];

        // Subject → verb order:  "Du kann …", "Ich kannst …", "Ich wohnst …".
        const aCls = SUBJECT_CLASS[a.word];
        if (aCls) {
          // Compound subject "X und ich/du/wir …" → plural verb, not singular
          // agreement with the near conjunct ("Der Chef und ich haben …").
          if (i > 0 && COORD_CONJ.has(tokens[i - 1].word)) continue;
          // Pronoun after a preposition is a PP object with a CASE error
          // ("Bei du ist es ruhig", "Ohne du gehe ich") — the case rules
          // (dat/akk-prep-pronoun) own that finding; the following verb
          // agrees with the real subject elsewhere in the clause.
          if (i > 0 && DE_PREPOSITIONS.has(tokens[i - 1].word)) continue;
          // Inversion / perfect tense: a finite verb (modal, or haben/sein/
          // werden auxiliary) directly before the pronoun means the pronoun is a
          // POST-VERBAL subject and the following word is that verb's participle/
          // infinitive complement, not a finite verb to agree-check ("Hast du
          // gehört …"). The genuine inversion agreement error ("hat ich …") is
          // still caught by the verb→subject path below.
          if (i > 0 && (FORM_INDEX[tokens[i - 1].word] || AUX_FINITE.has(tokens[i - 1].word)
              || MODAL_PRETERITE.has(tokens[i - 1].word))) continue;
          // Konjunktiv-I look-alike (haben "habe") under reported speech → skip.
          const minfo = FORM_INDEX[b.word];
          if (minfo && aCls === 'er' && PARADIGMS[minfo.lemma].ich === b.word
              && isReportedSpeechBefore(i)) {
            continue;
          }
          if (!flagModal(b, a, aCls)) flagRegular(b, a, aCls);
          continue;
        }

        // Det + Noun + verb: "Das Training starten um sechs Uhr" → startet.
        if (DET_SG.has(a.word) && isCapNoun(b) && i + 2 < tokens.length) {
          // A determiner right after a PREPOSITION heads a prepositional phrase,
          // not the subject: "Meine Lieblingsfächer in der Schule sind …" — "der
          // Schule" is a PP object (singular), but the real subject is the plural
          // "Lieblingsfächer", so "sind" is correct. Don't agree-check off the PP.
          if (i > 0 && DE_PREPOSITIONS.has(tokens[i - 1].word)) continue;
          // Non-subject det+noun: directly preceded by a NOUN (genitive
          // attribute — "Die Meinungen der Schüler sind", where «der Schüler» is
          // gen-pl of the plural head Meinungen) or by a relative/demonstrative
          // pronoun (relative-clause object — "…Faktoren, die das Wetter
          // beeinflussen", where «das Wetter» is the object and «die» the
          // subject). In both the det+noun is NOT the clause subject.
          if (i > 0 && (isCapNoun(tokens[i - 1]) || REL_PRONOUNS.has(tokens[i - 1].word))) continue;
          const verbTok = tokens[i + 2];
          const after = tokens[i + 3];
          // Modal earlier in the sentence → the NP is an OBJECT and the verb
          // an infinitive complement ("Können Sie das Buch finden?", "Ich
          // kann das Training starten") — never an agreement error. Present
          // modals live in FORM_INDEX; preterite modals ("konnte … gewinnen")
          // in MODAL_PRETERITE.
          let modalBefore = false;
          let pronounSubjectBefore = false;
          for (let k = i - 1; k >= 0; k--) {
            const gap = text ? text.slice(tokens[k].end, tokens[k + 1].start) : '';
            if (/[.!?;,\n]/.test(gap)) break;
            if (FORM_INDEX[tokens[k].word] || MODAL_PRETERITE.has(tokens[k].word)) { modalBefore = true; break; }
            // A nominative pronoun earlier in the clause is the subject, so the
            // det+noun is the OBJECT and the (clause-final) verb agrees with the
            // pronoun: "Bevor wir das Projekt starten …" — «starten» agrees with
            // «wir», not «das Projekt».
            if (SUBJECT_CLASS[tokens[k].word]) { pronounSubjectBefore = true; break; }
          }
          if (pronounSubjectBefore) continue;
          if (!modalBefore && !(after && NOM_PRONOUNS.has(after.word))) { // OVS guard
            if (!flagModal(verbTok, b, 'er')) flagRegular(verbTok, b, 'er', true);
          }
          continue;
        }

        // Verb → subject order (inversion): yes/no + W-questions, V2 fronting
        // ("Kann du …", "Wann muss du …", "Kommt du …?"). Only when the verb and
        // pronoun are DIRECTLY adjacent (whitespace-only gap) — never across a
        // clause/sentence boundary like "… kann. Du …", where token adjacency
        // would otherwise pair a clause-final verb with the next subject.
        // Post-verbal "ihr" is ambiguous: 2pl nominative ("you all") OR dative
        // ("to her", e.g. "Er hilft ihr"). The other classes (ich/du/er/wir)
        // have distinct object forms (mich/dich/ihn/uns), so post-verbally they
        // can only be the subject. Excluding "ihr" from inversion avoids
        // flagging a dative object as a mis-agreeing subject. It stays valid in
        // subject-first order above.
        const bCls = SUBJECT_CLASS[b.word];
        if (bCls && b.word !== 'ihr') {
          if (text && /\S/.test(text.slice(a.end, b.start))) continue;
          // v3.0.119: the verb already has a subject directly BEFORE it
          // ("Ich hoffe wir fliegen" — comma-less object clause). Then
          // "hoffe wir" is not inversion; agree-checking the verb against
          // the FOLLOWING pronoun false-flagged hoffe→hoffen.
          if (i > 0 && SUBJECT_CLASS[tokens[i - 1].word]) continue;
          if (!flagModal(a, b, bCls)) flagRegular(a, b, bCls);
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
