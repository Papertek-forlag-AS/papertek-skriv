/**
 * Spell-check rule: NB↔NN dialect-mix detection (priority 35).
 *
 * Phase 05.1 / Gap D / UX-01 close gate.
 *
 * User memory (2026-04-21, project_nb_nn_no_mixing.md): NB and NN are two
 * distinct official written standards of Norwegian and may not be mixed
 * in a single document. Analogy: "it is like you shouldn't accept German
 * words when writing bokmål or nynorsk." Reverses Phase 4's SC-03
 * `sisterValidWords` early-exit tolerance.
 *
 * Guard: fires ONLY when token is in vocab.sisterValidWords (valid in
 * the OTHER dialect) AND NOT in vocab.validWords (invalid in the current
 * dialect). Words valid in both dialects (hus, er, og, many common
 * morphologically-shared lemmas that live in both dialects via the
 * translation-seam — see SUMMARY) naturally pass through. Words valid in
 * neither (typos) fall to typo-curated/fuzzy.
 *
 * Priority 35 slots ABOVE sarskriving (30) and BELOW typo-curated (40) /
 * typo-fuzzy (50). On overlap, dedupeOverlapping keeps dialect-mix over
 * typo rules, teaching the student the cross-dialect reason rather than
 * the weaker "unknown word" reason. Does NOT tie with sarskriving.
 *
 * Research note (RESEARCH.md Pitfall 1): CONTEXT.md stated priority 30,
 * but nb-sarskriving.js is already 30. Moved to 35 for disambiguation.
 * See 05.1-CONTEXT.md "Research Amendments (2026-04-21)".
 *
 * Rule ID: 'dialect-mix'. Deliberately new (not reusing 'typo') so
 * renderExplain in spell-check.js routes via the dedicated three-way
 * lookup (rule_id, priority, lang) to this rule's explain callable.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Two directional Maps (research-recommended shape over single bidirectional
  // Map; see RESEARCH.md Pitfall 9). NN→NB used in NB document sessions
  // (student typed NN, we suggest NB). NB→NN used in NN document sessions.
  // Curated high-confidence pairs per direction. Papertek-vocabulary
  // promotion of this data is deferred per CONTEXT.md.
  // v3.0.136 homograph audit (Wikipedia precision-corpus run, 2026-06-12):
  // because the rule fires map-only (no validity guard — see Phase 05.1-05
  // note below), every key must be homograph-free in the dialect it fires
  // ON. Audited all keys against ordbokene.no (Språkrådet). REMOVED from
  // NN_TO_NB (valid/common bokmål readings): høyre (retning/partiet, bm
  // #..), seier (substantiv «en seier»), kor (substantiv «synge i kor»),
  // vert (substantiv «en god vert»), kven (folkegruppa),
  // laga (normert a-form/partisipp, bm a3 ADJ #33494), heim
  // (normert substantiv+adverb, bm #22789/#23742/#23743), heime (normert
  // adverb, bm #23769). KEPT rare-homograph keys where the leak reading
  // dominates real text: ho (substantiv «hakke», sjelden), kvar, gjekk
  // (arkaisk «narr»), veit (sjelden substantiv «smau»), blei (kun
  // substantiv «kile» i bm — verbformen er IKKE normert bokmål).
  const NN_TO_NB = new Map([
    // Pronouns
    ['eg', 'jeg'], ['ho', 'hun'], ['dei', 'de'],
    ['dykk', 'dere'],           // homograph «et dykk» guarded in check loop
    ['hennar', 'hennes'],
    // Reciprocal pronoun
    ['kvarandre', 'hverandre'],
    // Negation / particles
    ['ikkje', 'ikke'],
    // Quantifiers / function words
    ['berre', 'bare'], ['nokon', 'noen'], ['noko', 'noe'],
    ['mykje', 'mye'],
    // Question words
    ['kva', 'hva'], ['kvar', 'hvor'], ['korleis', 'hvordan'],
    ['kvifor', 'hvorfor'],
    // Subordinators / connectors
    ['sidan', 'siden'], ['medan', 'mens'], ['endå', 'enda'],
    ['anten', 'enten'],
    // Common irregular verbs
    ['vere', 'være'], ['vore', 'vært'],
    ['blei', 'ble'], ['vart', 'ble'],
    ['gjekk', 'gikk'], ['kjem', 'kommer'],
    // High-frequency NN-only verb forms
    ['meinte', 'mente'], ['meiner', 'mener'], ['meine', 'mene'],
    ['høyrer', 'hører'], ['høyrt', 'hørt'],
    ['såg', 'så'],
    ['veit', 'vet'],            // Phase 05.1-05 Bug 4 — NN presens of å vite
    ['byt', 'bytt'],
    ['forventar', 'forventer'], // NN presens of forvente
    ['åtvarar', 'advarer'],     // NN form of advare
    ['køyre', 'kjøre'], ['køyrer', 'kjører'], ['køyrde', 'kjørte'], ['køyrt', 'kjørt'],
    ['fortalde', 'fortalte'], ['fortel', 'forteller'],
    // Common nouns / adverbs / adjectives
    ['no', 'nå'],
    ['saman', 'sammen'],
    ['heile', 'hele'],          // goal-loop 1 (2026-06-12): adjectival NN form; followed-by-noun guard in check loop (Ordbank BM lists a rare homograph)
    // goal-loop 3 (2026-06-13): NN-only weekdays leaking into NB text
    ['måndag', 'mandag'], ['tysdag', 'tirsdag'], ['laurdag', 'lørdag'],
    ['verkeleg', 'virkelig'], ['kjærleik', 'kjærlighet'],
    ['gjer', 'gjør'], ['gjere', 'gjøre'],
    ['fekk', 'fikk'],
    ['seinare', 'senere'], ['tidlegare', 'tidligere'], ['tidleg', 'tidlig'],
    ['vanlegvis', 'vanligvis'], ['sjølvsagt', 'selvfølgelig'],
  ]);

  // v3.0.136 homograph audit (same run as NN_TO_NB above). REMOVED from
  // NB_TO_NN (valid nynorsk readings per ordbokene.no): nå (likestilt
  // adverbform av no, nn-artikkel 52863 lister begge lemma), enda
  // (likestilt med endå, nn #15197), enten (likestilt med anten, nn
  // #1864 CCONJ), de (normert NN 2pl-pronomen de/dokker, nn #11067),
  // norge (Noreg OG Norge er offisielle nynorskformer). KEPT
  // rare-homograph keys: hun (sjeldent substantiv «bakhon»), mens
  // (substantiv, uformelt), bare (sjeldent verb), ble (sjeldent verb),
  // mente (substantiv «i mente» — contextual i-guard in the check loop).
  const NB_TO_NN = new Map([
    // Pronouns
    ['jeg', 'eg'], ['hun', 'ho'], ['dere', 'dykk'],
    ['hennes', 'hennar'],
    // Reciprocal pronoun
    ['hverandre', 'kvarandre'],
    // Negation / particles
    ['ikke', 'ikkje'],
    // Indefinite articles (NB → NN). Note: `et` collides with the NN 3sg
    // present of `ete` (to eat). nb-gender rule's NN extension has a
    // subject-pronoun guard for the article reading. Dialect-mix has no
    // POS context, so to keep the FP rate down we only flag `et` here
    // when it's NOT immediately preceded by a subject pronoun (handled
    // in the check loop below).
    ['et', 'eit'], ['en', 'ein'],
    // Quantifiers / function words
    ['bare', 'berre'], ['noen', 'nokon'], ['noe', 'noko'],
    ['mye', 'mykje'],
    // Question words
    ['hva', 'kva'], ['hvor', 'kvar'], ['hvordan', 'korleis'],
    ['hvem', 'kven'], ['hvorfor', 'kvifor'],
    // Subordinators / connectors
    // 'mens' → medan REMOVED (Ordbank sweep 2026-07): «mens» is a STANDARD
    // NN single-form entry per Nynorskordboka (ord.uib.no) — flagging it as
    // bokmålsform mis-taught the official norm. «medan» remains the common
    // stylistic choice, but both are correct.
    ['siden', 'sidan'],
    // Common irregular verbs
    ['være', 'vere'], ['vært', 'vore'],
    ['ble', 'vart'],
    ['gikk', 'gjekk'], ['kommer', 'kjem'],
    // High-frequency NB-only verb forms
    ['mente', 'meinte'], ['mener', 'meiner'], ['mene', 'meine'],
    ['høre', 'høyre'], ['hører', 'høyrer'], ['hørt', 'høyrt'],
    ['sier', 'seier'],
    ['vet', 'veit'],            // Phase 05.1-05 Bug 4 — NB presens of å vite
    ['bytt', 'byt'],
    ['hele', 'heile'],          // goal-loop 1 (2026-06-12): adjectival NB form; followed-by-noun guard in check loop («hele» is also a rare normert NN noun, rimfrost)
    ['spørre', 'spørje'],       // goal-loop 2 (2026-06-12): NB infinitive — NN normert is spørje (spør/spurde/spurt share forms and stay unmapped)
    // goal-loop 3 (2026-06-13): NB-only weekdays + adverb/noun leaks (all
    // confirmed NOT normert NN via ordbokene; onsdag/torsdag/fredag/søndag
    // are shared and stay unmapped — tenke is normert NN, also unmapped)
    ['mandag', 'måndag'], ['tirsdag', 'tysdag'], ['lørdag', 'laurdag'],
    ['virkelig', 'verkeleg'], ['kjærlighet', 'kjærleik'],
    // bokmål -else abstract nouns → NN -ing (same class as kjærlighet→kjærleik).
    // Språkrådet-2025 flagged "ødeleggelse"-leak in NN; none of these bokmål
    // forms are valid NN (NN uses øydelegging), so they are homograph-safe to
    // flag in NN text. The malformed hybrid "ødeleggelsane" (bokmål stem + NN
    // -ane suffix) is NOT a standard token here and stays an uncaught
    // conservative-fuzzy edge — by design, since flagging unknown forms we can't
    // confidently correct is what keeps NB/NN precision near 100%.
    ['ødeleggelse', 'øydelegging'], ['ødeleggelsen', 'øydelegginga'],
    ['ødeleggelser', 'øydeleggingar'], ['ødeleggelsene', 'øydeleggingane'],
    // NOTE: 'lagde' is NOT mapped NB→NN. Although it is the NB preteritum of
    // "lage" (→ NN "laga"), it is ALSO a valid Nynorsk perfect participle of
    // "leggje" (Ordbank: adj <perf-part> normert — "vart lagde fram"). Flagging
    // it in an NN document is a false positive (real-NN-text finding); the
    // homograph can't be disambiguated by lookup, so we don't flag it.
    ['forventer', 'forventar'], // NB presens of forvente → NN forventar
    ['advarer', 'åtvarar'],     // NB form → NN åtvarar
    ['kjøre', 'køyre'], ['kjører', 'køyrer'], ['kjørte', 'køyrde'], ['kjørt', 'køyrt'],
    ['fortalte', 'fortalde'], ['forteller', 'fortel'],
    // NB-only verb "spise" — not in Nynorskordboka (confirmed 2026-05-16
    // via Språkrådet ordbokene.no: 0 NN entries for "spise"). The NN
    // canonical for "to eat" is "ete" (presens: et, preteritum: åt,
    // perfektum: ete; "eta" is the valid kløyvd-infinitiv sideform).
    //
    // 2026-05-17 retirement attempt reverted: typoFix Map gives lemma-only
    // suggestions (typos[] all map to entry.word per vocab-seam-core
    // wordList builder), so retiring these entries would degrade
    // "spiser"→"et" to "spiser"→"ete" etc. The per-form NB→NN suggestion
    // pattern below is irreducible — keep here despite upstream data being
    // fixed in papertek-vocabulary 5dc4f69c. See typos[] in ete/gløyme/
    // velje verbs for the lemma-level fallback (priority 40 typo rule).
    ['spise', 'ete'], ['spiser', 'et'], ['spiste', 'åt'], ['spist', 'ete'],
    // NB-only verb "glemme" — 0 NN entries (Språkrådet, 2026-05-16).
    // NN canonical: gløyme (nn-weak-de class).
    ['glemme', 'gløyme'], ['glemmer', 'gløymer'], ['glemte', 'gløymde'], ['glemt', 'gløymt'],
    // NB-only verb "velge" — 0 NN entries (Språkrådet, 2026-05-16).
    // NN canonical: velje (strong; conjugations confirmed via ordbokene.no:
    // presens "vel", preteritum "valde", perfektum "vald").
    ['velge', 'velje'], ['velger', 'vel'], ['valgte', 'valde'], ['valgt', 'vald'],
    // Common nouns / adverbs / adjectives
    // 'nå' deliberately NOT mapped: likestilt adverbform av 'no' i nynorsk
    // (ordbokene nn-artikkel 52863 lister begge lemma) — v3.0.136 audit.
    ['hjem', 'heim'], ['hjemme', 'heime'],
    // "frokost" is the Bokmål form; the Nynorsk word is "frukost" (the
    // curated NN headword). frokost happens to sit in the NN Ordbank
    // fullform accept-list (so the typo rules treat it as valid and never
    // flag it), which means an NN student writing "frokost" gets no signal
    // — and a fuzzy typo near it (e.g. "frokst") gets corrected toward the
    // Bokmål "frokost" rather than NN "frukost". This map entry is the
    // authoritative dialect nudge: frokost → frukost in an NN document.
    ['frokost', 'frukost'],
    ['sammen', 'saman'],
    ['gjør', 'gjer'], ['gjøre', 'gjere'],
    ['fikk', 'fekk'],
    ['senere', 'seinare'], ['tidligere', 'tidlegare'], ['tidlig', 'tidleg'],
    ['vanligvis', 'vanlegvis'], ['selvfølgelig', 'sjølvsagt'],
    // Auto-nb headword-contamination nudges (papertek-vocabulary report
    // nn-bm-headword-contam): Bokmål forms that are seeded into NN validWords
    // (carried as the NN entries' NB `translation`) so the typo rules can't
    // flag them — dialect-mix is the authoritative lever. Every NN target is
    // verified present in Norsk Ordbank NN (SBR-41) and every NB key verified
    // ABSENT from it (so no valid-NN homograph is flagged, unlike `lagde`).
    ['mer', 'meir'], ['dyp', 'djup'], ['blek', 'bleik'], ['foran', 'framfor'],
    ['fortsatt', 'framleis'], ['ensom', 'einsam'], ['åpen', 'open'],
    ['sent', 'seint'], ['oftest', 'oftast'], ['raskest', 'raskast'],
    ['trang', 'trong'], ['utenlandsk', 'utanlandsk'],
    ['sannsynligvis', 'sannsynlegvis'], ['ødelagt', 'øydelagd'],
    ['fremtidig', 'framtidig'], ['holdbar', 'haldbar'], ['ellers', 'elles'],
    ['senest', 'seinast'], ['åpenbart', 'openbert'], ['greit', 'greitt'],
    ['enig', 'samd'], ['snarere', 'snarare'], ['såkalt', 'såkalla'],
    ['verdiløs', 'verdlaus'], ['vellykket', 'vellukka'], ['skjevt', 'skeivt'],
    ['tallrik', 'talrik'], ['entydig', 'eintydig'], ['midterst', 'midtarste'],
    // 'norge' deliberately NOT mapped: Noreg og Norge er begge offisielle
    // nynorskformer (Språkrådet) — flagging Norge i NN-dokument er FP.
    ['østerrike', 'austerrike'],
  ]);

  // Morphological hybrid expansion (NN morphology). A student mixing dialects
  // may write a bokmål -else abstract-noun STEM carrying an NN inflectional
  // suffix — "ødeleggels" + "-ane" = "ødeleggelsane". This form is valid in
  // NEITHER standard (bokmål uses -ene, NN uses the -ing stem), so it can't be
  // caught by a wordlist and previously slipped through (Språkrådet-2025
  // flagged exactly this). Derive the hybrids from the -else family already in
  // the map: the bokmål stem + an NN suffix maps to the SAME NN target as the
  // corresponding bokmål inflection (ødeleggelsene → øydeleggingane, so
  // ødeleggelsane → øydeleggingane too). Generalises to any -else noun added
  // above; scoped to the -else class so it can't mis-generate on verbs/others.
  for (const [bmKey, nnVal] of [...NB_TO_NN.entries()]) {
    if (!/els(e|en|er|ene)$/.test(bmKey)) continue;
    let hybrid = null;
    if (bmKey.endsWith('ene') && nnVal.endsWith('ane')) hybrid = bmKey.slice(0, -3) + 'ane';      // def. plural
    else if (bmKey.endsWith('er') && nnVal.endsWith('ar')) hybrid = bmKey.slice(0, -2) + 'ar';     // indef. plural
    else if (bmKey.endsWith('en') && nnVal.endsWith('a')) hybrid = bmKey.slice(0, -2) + 'a';       // def. singular
    if (hybrid && hybrid !== bmKey && !NB_TO_NN.has(hybrid)) NB_TO_NN.set(hybrid, nnVal);
  }

  function fixFor(word, lang) {
    const map = lang === 'nb' ? NN_TO_NB : NB_TO_NN;
    return map.get(word.toLowerCase());
  }

  const rule = {
    id: 'dialect-mix',
    languages: ['nb', 'nn'],
    priority: 35,
    exam: {
      safe: true,
      reason: "Token-level dialect-mix token correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: (finding) => {
      const other = finding.lang === 'nn' ? 'bokmål' : 'nynorsk';
      const docDialect = finding.lang === 'nn' ? 'nynorsk' : 'bokmål';
      const hasFix = !!finding.fix;
      const base = `<em>${escapeHtml(finding.original)}</em> er ${other}`;
      if (hasFix) {
        const tail = ` — prøv <em>${escapeHtml(finding.fix)}</em>.`;
        // Same template renders identically in both NB and NN popovers —
        // the copy describes the student's document and their typed word,
        // not the popover's register. Both keys returned for contract shape.
        return { nb: base + tail, nn: base + tail };
      }
      // No-fix fallback — hedged question invites the student to confirm register
      const fallback = `${base}. Skriv du ${docDialect}?`;
      return { nb: fallback, nn: fallback };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed, lang } = ctx;
      // Dialect-mix is NB/NN only — silent no-op for other languages.
      if (lang !== 'nb' && lang !== 'nn') return [];
      const out = [];
      const crossMap = lang === 'nb' ? NN_TO_NB : NB_TO_NN;
      // NN verb-collision guard: in NN, the token `et` is both an NB-leak
      // article (→ eit) AND the 3sg present of the NN verb `ete` (to eat).
      // When `et` follows a subject pronoun, it's verb usage — don't flag.
      // `en` doesn't have this collision; only `et` needs the guard.
      const NN_SUBJ_PRONOUNS = lang === 'nn'
        ? new Set(['eg', 'du', 'han', 'ho', 'den', 'det', 'vi', 'dykk', 'dei', 'ein'])
        : null;
      // Coordinating conjunctions: in a coordinated predicate ("vaknar og et
      // frukost" = …and eat[s] breakfast), `et` after a conjunction is the
      // verb `ete`, not the leaked NB article. Mirror of the nb-gender guard.
      const NN_COORD_CONJ = lang === 'nn'
        ? new Set(['og', 'eller', 'men', 'for', 'så', 'samt'])
        : null;
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;
        // v3.0.136: token glued to a preceding dot is a domain/file segment
        // («vg.no», «index.no»), not running prose — the .no TLD otherwise
        // hits the no→nå entry on every Norwegian domain name.
        if (t.start > 0 && ctx.text[t.start - 1] === '.') continue;
        // Hyphen-joined suffix article («pc-en», «tv-en», «cv-en», «e-en») —
        // the definite article after a hyphenated initialism is standard in
        // BOTH norms; the bare 'en'/'et' token is not a dialect leak.
        if (t.start > 0 && ctx.text[t.start - 1] === '-') continue;
        // Verb-`et` collision guard (NN only) — a subject pronoun OR noun
        // subject before means «et» is the verb of ete ("Eg et frukost",
        // "Familien et middag", "Elevane et lunsj", "veganar et ikkje …").
        if (NN_SUBJ_PRONOUNS && t.word === 'et' && i > 0) {
          const prev = tokens[i - 1];
          if (prev && NN_SUBJ_PRONOUNS.has(prev.word)) continue;
          const nounGenus0 = (vocab && vocab.nounGenus) || new Map();
          if (prev && nounGenus0.has(prev.word)) continue;
        }
        // Inverted verb-`et`: a fronted adverbial then «et» then the subject
        // («Om kvelden et vi middag», «Kvar morgon et ho ein müsli»).
        if (t.word === 'et' && i + 1 < tokens.length && NN_SUBJ_PRONOUNS
            && NN_SUBJ_PRONOUNS.has(tokens[i + 1].word)) continue;
        // Verb-`et` after a coordinating conjunction (NN only)
        if (NN_COORD_CONJ && t.word === 'et' && i > 0) {
          const prev = tokens[i - 1];
          if (prev && NN_COORD_CONJ.has(prev.word)) continue;
        }
        // 'mente' homograph guard (NN only, v3.0.136): «to i mente» is the
        // normert NN math noun (nn-artikkel 49309) — skip after 'i'.
        if (lang === 'nn' && t.word === 'mente' && i > 0 && tokens[i - 1].word === 'i') continue;
        // 'dykk' homograph guard (NB only, v3.0.136): «et dykk» is the
        // normert NB noun (bm-artikkel 11305) — skip after a determiner;
        // the NN-pronoun leak («kva dykk meiner») has no determiner before.
        if (lang === 'nb' && t.word === 'dykk' && i > 0 &&
            ['et', 'eit', 'ett', 'dette', 'mitt', 'ditt', 'sitt', 'hvert', 'noe'].includes(tokens[i - 1].word)) continue;
        // 'hele'/'heile' homograph guard (goal-loop 1, 2026-06-12): «hele»
        // is a rare normert NN noun (rimfrost) and Ordbank BM lists «heile»
        // — but the cross-dialect leak is the ADJECTIVAL use («heile dagen»
        // in NB, «hele dagen» in NN). Fire only when a noun follows; the
        // rare noun readings stand alone or precede prepositions.
        if (t.word === 'hele' || t.word === 'heile') {
          const next = tokens[i + 1];
          const nounGenus = (vocab && vocab.nounGenus) || new Map();
          if (!next || !nounGenus.has(next.word)) continue;
          const gap = ctx.text.slice(t.end, next.start);
          if (/[.!?,;:]/.test(gap)) continue;
        }
        // Phase 05.1-05 bug-fix: CROSS_DIALECT_MAP is the SINGLE AUTHORITATIVE
        // signal for cross-dialect tokens. The previous guard —
        //   if (validWords.has(t.word)) continue;
        //   if (!sisterValidWords.has(t.word)) continue;
        // — silently suppressed the rule's flagship test cases (ikkje in NB,
        // ikke/jeg in NN) because the vocab-seam's translation-entry path
        // seeds cross-dialect tokens into BOTH validWords sets. (See
        // 05.1-04-SUMMARY.md Decision 4 for the diagnosis; the guard's
        // intent was "fire only on sister-valid AND NOT current-valid",
        // but `jeg` ends up in NN's validWords via every NN entry's
        // translation field, so the guard short-circuited the whole rule
        // for the tokens the rule was explicitly built for.)
        //
        // The Plan 05.1-04 CROSS_DIALECT_MAP narrowing (Rule 4 discovery)
        // already protects against false-positive storms on the broader
        // `sisterValidWords \ validWords` superset by making the map the
        // fire-gate. We therefore collapse to "in-map ⇔ fire". Clean and
        // codeswitch fixtures were verified (post-hoc scan in 05.1-05) to
        // contain ZERO map-key tokens, so this change is a false-positive
        // silent no-op outside the dialect-mix bucket.
        //
        // ctx.suppressed (codeswitch density) is still honored above so
        // dense unknown spans still silence the rule for cross-dialect
        // tokens that happen to live inside an English/French quotation.
        let rawFix = crossMap.get(t.word);
        if (!rawFix) continue;
        // goal-loop 3 (2026-06-13): «kvar» is BOTH NN hver («kvar dag») and
        // NN hvor («kvar er du»). The map's unconditional kvar→hvor gave
        // «trener fotball kvar tirsdag» the fix hvor. Determiner reading
        // (followed by a noun) → hver; otherwise keep hvor.
        if (lang === 'nb' && t.word === 'kvar') {
          const next = tokens[i + 1];
          const nounGenus = (vocab && vocab.nounGenus) || new Map();
          if (next && nounGenus.has(next.word)) rawFix = 'hver';
        }
        const fix = matchCase(t.display, rawFix);
        out.push({
          rule_id: 'dialect-mix',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          lang,                                 // carries document lang to explain()
          fix,                                  // always defined under the map-only gate
          message: `Dialektblanding: "${t.display}" er ${lang === 'nb' ? 'nynorsk' : 'bokmål'} → "${fix}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
