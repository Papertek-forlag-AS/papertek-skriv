/**
 * Spell-check rule: fuzzy typo neighbor lookup (priority 50).
 *
 * Final-resort branch: for tokens that aren't in validWords and aren't likely
 * proper nouns, search validWords for a Damerau-Levenshtein neighbor within
 * the bounded edit distance and pick the highest-scoring candidate.
 *
 * Rule ID: 'typo' — preserved verbatim from pre-INFRA-03 inline rule.
 *
 * Phase 3-03 (SC-01): scoring is now LOCAL to this file (rather than imported
 * from __lexiSpellCore). The local `scoreCandidate` adds a bounded Zipf term
 * sourced from `vocab.freq` (the freq-{lang}.json sidecar shipped in Phase
 * 2 DATA-01). When two candidates are otherwise tied, the higher-frequency
 * NB/NN word wins. Local ownership keeps future ranker tuning a one-file
 * change — INFRA-03's "no core edits for scoring changes" contract.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const {
    editDistance,
    candidateIndex,
    sharedPrefixLen,
    sharedSuffixLen,
    isAdjacentTransposition,
    isLikelyProperNoun,
    matchCase,
    escapeHtml,
  } = core;

  // Scoring heuristic — higher is better. Mirrors the formula in core for
  // pref/suff/distance/length/transposition (lifted verbatim from the
  // pre-Phase-3 inline rule), then adds a bounded Zipf tiebreaker.
  //
  // Pitfall 4 (RESEARCH.md:420-432) guardrail: the Zipf multiplier MUST be
  // bounded so a d=2 common-word never beats a d=1 rare-word AND so a
  // small Zipf gap can't override a small distance/length difference. With
  // max observed Zipf ≈ 7 and multiplier 10, max boost is 70 points; the
  // distance penalty is 100 per edit. So:
  //   d=1 Zipf-0  → -100
  //   d=2 Zipf-7  → -200 + 70 = -130
  // d=1 still wins comfortably (gap of 30 points).
  //
  // Multiplier tuning (Phase 3-03): chose ZIPF_MULT = 10 over the 15 the
  // plan first proposed. With 15, the existing fixture nb-typo-likr-001
  // regressed: 'likr' has neighbors 'liker' (today -45, Zipf 4.99) and
  // 'like' (today -55, Zipf 5.76); the 0.77 Zipf gap × 15 = +11.55 points
  // overshoots the 10-point distance/length gap and flips the winner to
  // 'like'. With multiplier 10, the boost is +7.7 — too small to override
  // the length-penalty signal, so 'liker' stays the winner. The two new
  // SC-01 cases (hagde, hatde) still flip correctly because their Zipf
  // gaps (3.39, 3.09) × 10 produce 33.9 / 30.9 points — comfortably above
  // the 5-point today-score gap.
  const ZIPF_MULT = 10;
  const BIGRAM_MULT = 60;
  const GLOBAL_WHITELIST = new Set(['will', 'die', 'der', 'das', 'den', 'ein', 'eine']);

  // NB/NN sideform-pair detector: returns true when the two strings differ
  // only by a single a↔å substitution. Used to suppress typo flags on
  // productive compounds whose final part is a vowel-sideform of an
  // already-stored compound (bursdagsgåve vs bursdagsgave).
  function isAaSideformPair(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    let diffs = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue;
      if ((a[i] === 'a' && b[i] === 'å') || (a[i] === 'å' && b[i] === 'a')) {
        diffs++;
        if (diffs > 1) return false;
      } else {
        return false;
      }
    }
    return diffs === 1;
  }

  function scoreCandidate(query, cand, d, vocab, prevWord) {
    const pref = sharedPrefixLen(query, cand);
    const suff = sharedSuffixLen(query, cand);
    let s = pref * 15 + suff * 10 - d * 100;
    if (cand.length < query.length) s -= 50;
    if (isAdjacentTransposition(query, cand)) s += 40;

    // Zipf tiebreaker — vocab.freq is hydrated from freq-{lang}.json by
    // vocab-seam-core.buildIndexes (Phase 3-01). Empty Map for languages
    // without a sidecar (de/es/fr/en) — fine, fuzzy is NB/NN-only anyway.
    if (vocab && vocab.freq && vocab.freq.size > 0) {
      const z = vocab.freq.get(cand);
      if (typeof z === 'number') {
        s += z * ZIPF_MULT;
      } else {
        // Deprioritise candidates absent from the frequency list — obscure
        // forms that a large accept-list (e.g. the 412k Norsk Ordbank Nynorsk
        // set) surfaces as same-distance neighbours and which would otherwise
        // outrank the common, intended correction ("tysnk" → obscure "tynsk"
        // instead of "tysk"). Only applies when freq data is present (NB/NN).
        s -= 35;
      }
    }

    // Bigram boost — if we have a previous word, check if the candidate
    // is a common next word. Similar to word-prediction logic.
    if (prevWord && vocab && vocab.bigrams) {
      const pairs = vocab.bigrams[prevWord.toLowerCase()];
      if (pairs && pairs[cand]) {
        s += pairs[cand] * BIGRAM_MULT;
      }
    }
    return s;
  }

  // Local fuzzy neighbor lookup — owns its own scoring surface so future
  // ranker tuning stays in this one file.
  //
  // Phase 5 / UX-02: returns a top-K list (cap 8) sorted by scoreCandidate
  // descending. The previous single-best return is preserved at index 0 —
  // `suggestions[0] === (what fix used to be)` for every pre-Phase-5 fixture
  // case. The cap of 8 matches the UX-02 "Vis flere alternativer" reveal max.
  // Memoisering (27.08.2026). Hele dokumentet sjekkes på nytt 800 ms etter
  // hvert opphold i skrivingen, men nesten alltid er bare siste setning
  // endret — og en elev som staver et ord feil, staver det gjerne feil
  // igjen. Naboene for et gitt (forrige ord, ord) er en ren funksjon av
  // vokabularet, så de kan huskes.
  //
  // Nøkkelen bærer prevWord fordi scoreCandidate gir bigram-bonus for
  // (prevWord → kandidat); uten den ville rangeringen kunne bli feil.
  // lang er med fordi den fonetiske fallbacken normaliserer per språk.
  //
  // Cachen henger på validWords-Set-et via en WeakMap. Det er det eneste
  // stabile holdepunktet: renderer-en bygger et NYTT vokabular-objekt for
  // hver runCheck(), så en cache nøklet på `vocab` ville aldri truffet.
  // Bytter eleven språk, eller legger til et eget ord, blir Set-et et
  // annet og cachen faller bort av seg selv.
  const _neighborCache = typeof WeakMap === 'function' ? new WeakMap() : null;
  const NEIGHBOR_CACHE_MAX = 4000;   // ~én lang skoletekst med god margin

  function findFuzzyNeighbors(word, vocab, prevWord, lang) {
    const validWords = vocab.validWords || new Set();
    let memo = null;
    let memoKey = null;
    if (_neighborCache) {
      memo = _neighborCache.get(validWords);
      if (!memo) { memo = new Map(); _neighborCache.set(validWords, memo); }
      memoKey = lang + '\u0000' + (prevWord || '') + '\u0000' + word;
      const hit = memo.get(memoKey);
      if (hit) return hit;
    }
    const result = computeFuzzyNeighbors(word, vocab, prevWord, lang, validWords);
    if (memo) {
      // Enkel takgrense framfor LRU: en elevtekst treffer den aldri, og en
      // maskin som limer inn en bok skal ikke kunne vokse cachen fritt.
      if (memo.size >= NEIGHBOR_CACHE_MAX) memo.clear();
      memo.set(memoKey, result);
    }
    return result;
  }

  function computeFuzzyNeighbors(word, vocab, prevWord, lang, validWords) {
    // Words valid ONLY as tokens of multi-word forms ("quelque" via "quelque
    // chose") accept — but never SUGGEST. Without this exclusion the richer
    // accept-pool invents wrong-direction fixes for valid-but-uncovered
    // words ("Quoique" → "Quelque", "issues" → "issue").
    const mwTokens = vocab.multiwordTokens || new Set();
    const len = word.length;
    // Tighter threshold for short words — 1 edit out of 4 chars is already
    // a lot of signal to drop, but 1 edit out of 8+ is common.
    const k = len <= 6 ? 1 : 2;
    const first = word[0];
    const scored = [];
    // Ytelse (27.08.2026): de to første linjene i løkken under var et filter
    // på (forbokstav, lengde) anvendt på hele validWords — 639 352 ord for nb.
    // Nå ER det nøkkelen i kandidatindeksen, så vi besøker bare bøttene som
    // kan inneholde en treffer. Resultatmengden er uendret per definisjon.
    //
    // `ord` er posisjonen kandidaten hadde i validWords. Sorten under var
    // stabil over en løkke som gikk i validWords-rekkefølge, så like scorer
    // kom ut i den rekkefølgen; å gå bøtte for bøtte ville byttet om på dem.
    // Vi sorterer derfor eksplisitt på (score synkende, ordinal stigende),
    // som er nøyaktig det den stabile sorten gjorde før.
    const cIdx = typeof candidateIndex === 'function' ? candidateIndex(validWords) : null;
    if (cIdx) {
      for (let cl = len - k; cl <= len + k; cl++) {
        if (cl < 1) continue;
        const b = cIdx.bucket(first, cl);
        if (!b) continue;
        const words = b.words, ords = b.ords;
        for (let i = 0; i < words.length; i++) {
          const cand = words[i];
          if (mwTokens.has(cand)) continue; // token-of-phrase: accept, don't suggest
          if (cand === word) continue;
          const d = editDistance(word, cand, k);
          if (d > k) continue;
          scored.push({ cand, ord: ords[i], score: scoreCandidate(word, cand, d, vocab, prevWord) });
        }
      }
    } else {
      // Fallback for verter uten kandidatindeks (eldre synket kopi av core).
      let ord = 0;
      for (const cand of validWords) {
        const o = ord++;
        if (mwTokens.has(cand)) continue;
        const cl = cand.length;
        if (Math.abs(cl - len) > k) continue;
        if (cand[0] !== first) continue;
        if (cand === word) continue;
        const d = editDistance(word, cand, k);
        if (d > k) continue;
        scored.push({ cand, ord: o, score: scoreCandidate(word, cand, d, vocab, prevWord) });
      }
    }

    // Phonetic fallback: if Levenshtein search yielded no results, try phonetic
    // matching (Phonetic matching logic brought over from word-prediction.js).
    const vocabCore = host.__lexiVocabCore;
    if (scored.length === 0 && vocabCore && word.length >= 3) {
      const qPhonetic = vocabCore.phoneticNormalize(word, lang);
      let ord = 0;
      for (const cand of validWords) {
        const o = ord++;
        if (mwTokens.has(cand)) continue; // token-of-phrase: accept, don't suggest
        if (cand === word) continue;
        // Optimization: only check candidates with similar length
        if (Math.abs(cand.length - word.length) > 2) continue;
        const targetPhonetic = vocabCore.phoneticNormalize(cand, lang);
        const pScore = vocabCore.phoneticMatchScore(qPhonetic, targetPhonetic);
        if (pScore >= 70) {
          // Normalize pScore to be competitive but generally lower than d=1 hits
          scored.push({ cand, ord: o, score: -150 + pScore });
        }
      }
    }

    // (score synkende, ordinal stigende) — se kommentaren over bøtteløkken:
    // dette gjenskaper nøyaktig den stabile sorten over validWords-rekkefølge.
    scored.sort((a, b) => (b.score - a.score) || (a.ord - b.ord));
    return scored.slice(0, 8).map(s => s.cand);
  }

  // v3.0.115 (student-corpus triage): name-introducer verbs per language.
  // German disables the capitalized-proper-noun heuristic (German capitalizes
  // ALL nouns), so unknown names were fuzzy-flagged with absurd fixes —
  // "Balder" → "Bilder", "Trym" → "Tram", "Thelma" → "Thema" (tyskprøve uke
  // 22 corpus, 19 texts). But nearly every such name is introduced by a
  // naming verb ("Er heißt Balder", "sie heisst ulla"). Tokens following an
  // introducer that aren't in validWords are collected as text-local names,
  // and EVERY occurrence of those tokens in the text is amnestied (Balder
  // appears 4× but only once after heißt). Misspelled-introducer forms
  // (heisst, heist, heibt — the B→ß and ss→ß student classes) are included
  // so the guard still fires when the introducer itself is a typo.
  const NAME_INTRODUCERS = {
    de: new Set(['heißt', 'heiße', 'heißen', 'heisst', 'heisse', 'heissen', 'heist', 'heibt', 'heibe', 'genannt']),
    nb: new Set(['heter', 'kalles', 'døpt']),
    nn: new Set(['heiter', 'heter', 'kallast', 'døypt']),
    en: new Set(['named', 'called']),
    es: new Set(['llama', 'llamo', 'llaman', 'llamas']),
    fr: new Set(['appelle', 'appelles', 'appellent']),
  };
  const NAME_COORDINATORS = new Set(['und', 'oder', 'og', 'eller', 'and', 'or', 'y', 'e', 'o', 'u', 'et', 'ou']);

  // v3.0.118: French perfekt auxiliaries — unknown tokens right after these
  // are participle attempts owned by fr-etre-avoir / fr-pp-agreement.
  const FR_AUX_FORMS = new Set([
    'ai', 'as', 'a', 'avons', 'avez', 'ont',
    'suis', 'es', 'est', 'sommes', 'êtes', 'sont',
  ]);

  // v3.0.116 (student-corpus triage): brands/platforms students mention in
  // every essay, regardless of writing language. These don't belong in the
  // dictionaries (the NB cleanup deliberately REMOVED brand entries —
  // grandiosa), but typo-fuzzy must not "correct" them: the corpus produced
  // "Fifa" → other words, "youtube" unknown, etc. Small closed list, kept
  // inline per the data-logic friction test — extend as triage surfaces more.
  const BRAND_WORDS = new Set([
    'youtube', 'netflix', 'tiktok', 'instagram', 'snapchat', 'spotify',
    'facebook', 'whatsapp', 'discord', 'twitch', 'minecraft', 'fortnite',
    'fifa', 'gta', 'playstation', 'xbox', 'nintendo', 'iphone', 'ipad',
    'mac', 'pepsi', 'cola', 'champions',
  ]);

  // Hyphenated loanwords. The tokenizer (WORD_RE) splits on hyphens, so
  // "week-end" becomes "week" + "end" and the non-native part ("end") gets
  // fuzzy-flagged. wordfreq splits on the hyphen too, so these standard forms
  // never survive the validwords-{lang} top-N intersection — the same gap the
  // elided FR forms had. Curated per-language set; kept inline per the
  // data-logic friction test (mirrors BRAND_WORDS). The guard ALSO consults
  // validWords, so once an upstream force-include lands these become redundant
  // but harmless. Lowercase, full hyphenated form.
  const HYPHEN_LOANWORDS = {
    fr: new Set([
      'week-end', 'week-ends', 'pique-nique', 'pique-niques',
      't-shirt', 't-shirts', 'after-shave', 'after-shaves',
      'talkie-walkie', 'talkies-walkies', 'e-mail', 'e-mails',
    ]),
  };

  function collectTextNames(tokens, text, lang, validWords) {
    const intro = NAME_INTRODUCERS[lang];
    const names = new Set();
    if (!intro) return names;
    for (let i = 0; i < tokens.length; i++) {
      if (!intro.has(tokens[i].word)) continue;
      // Window after the introducer: names, optionally coordinated
      // ("heißen Lucas und Luis", "heiße Pippi und Sara").
      for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
        const between = text ? text.slice(tokens[j - 1].end, tokens[j].start) : '';
        if (/[.!?;:]/.test(between)) break;
        const w = tokens[j].word;
        if (NAME_COORDINATORS.has(w)) continue;
        if (!validWords.has(w)) { names.add(w); continue; }
        break; // a known word ends the naming window
      }
    }
    return names;
  }

  // v3.0.115 (student-corpus triage): German orthography-normalization
  // direct fixes. Norwegian students systematically (a) type ss for ß
  // ("heisst" — fuzzy at k=1 could only reach the absurd "heizst", since
  // "heißt" is 2 edits away), (b) type B for ß ("heiBt"), and (c) drop
  // umlauts ("uber" → fuzzy suggested "ufer" instead of "über"). A
  // normalized variant that lands EXACTLY in validWords is a far stronger
  // signal than any fuzzy neighbor, so it's emitted directly.
  function deNormalizedVariant(w, validWords) {
    const tryWord = (v) => (v !== w && validWords.has(v)) ? v : null;
    let m;
    if (w.includes('ss')) {
      m = tryWord(w.replace(/ss/g, 'ß'));
      if (m) return m;
    }
    for (let i = 0; i < w.length; i++) {
      const c = w[i];
      let sub = null;
      if (c === 's' || c === 'b') sub = 'ß';
      else if (c === 'a') sub = 'ä';
      else if (c === 'o') sub = 'ö';
      else if (c === 'u') sub = 'ü';
      if (!sub) continue;
      m = tryWord(w.slice(0, i) + sub + w.slice(i + 1));
      if (m) return m;
    }
    if (/ae|oe|ue/.test(w)) {
      m = tryWord(w.replace(/ae/g, 'ä').replace(/oe/g, 'ö').replace(/ue/g, 'ü'));
      if (m) return m;
    }
    return null;
  }

  // v3.0.121: French accent normalization (mirrors deNormalizedVariant).
  // Norwegian keyboards bury French accents, so students drop them: "tres"
  // (très), "cinema" (cinéma), "francais" (français). A variant landing
  // exactly in validWords beats any fuzzy neighbor.
  function frNormalizedVariant(w, validWords) {
    const tryWord = (v) => (v !== w && validWords.has(v)) ? v : null;
    const SUBS = { e: ['é', 'è', 'ê'], a: ['à', 'â'], u: ['ù', 'û'], o: ['ô'], i: ['î', 'ï'], c: ['ç'] };
    let m;
    for (let i = 0; i < w.length; i++) {
      const subs = SUBS[w[i]];
      if (!subs) continue;
      for (const s of subs) {
        m = tryWord(w.slice(0, i) + s + w.slice(i + 1));
        if (m) return m;
      }
    }
    return null;
  }

  // v3.0.121: class-specific Lær mer for the normalization fixes — the typo
  // rule itself can't carry ONE lesson, but these classes can.
  const DE_ESZETT_PEDAGOGY = {
    note: {
      nb: 'Tysk <strong>ß</strong> (scharfes S) uttales som en skarp s og finnes ikke på norske tastaturer. Skriv aldri <em>B</em> eller <em>ss</em> i stedet i ord som har ß.',
      nn: 'Tysk <strong>ß</strong> (scharfes S) vert uttalt som ein skarp s og finst ikkje på norske tastatur. Skriv aldri <em>B</em> eller <em>ss</em> i staden i ord som har ß.',
      en: 'German <strong>ß</strong> (sharp S) is a sharp s-sound and is missing from Norwegian keyboards. Never substitute <em>B</em> or <em>ss</em> in words spelled with ß.',
    },
    examples: [
      { correct: 'heißt', incorrect: 'heisst', translation: { nb: 'heter', nn: 'heiter', en: 'is called' } },
      { correct: 'Fußball', incorrect: 'fuBball', translation: { nb: 'fotball', nn: 'fotball', en: 'football' } },
      { correct: 'groß', incorrect: 'gross', translation: { nb: 'stor', nn: 'stor', en: 'big' } },
    ],
    extra: {
      nb: 'På Mac: hold inne <em>S</em>-tasten og velg ß. På Windows: <em>AltGr + S</em> (eller Alt + 0223). I Sveits skriver man faktisk ss — men i tysk skoletysk gjelder ß.',
      nn: 'På Mac: hald inne <em>S</em>-tasten og vel ß. På Windows: <em>AltGr + S</em> (eller Alt + 0223). I Sveits skriv ein faktisk ss — men i skuletysk gjeld ß.',
      en: 'On Mac: hold the <em>S</em> key and pick ß. On Windows: <em>AltGr + S</em> (or Alt + 0223). Switzerland actually writes ss — but school German uses ß.',
    },
  };
  const DE_UMLAUT_PEDAGOGY = {
    note: {
      nb: 'Tyske <strong>omlyd</strong> (ä, ö, ü) er egne lyder — ikke pynt. <em>schon</em> (allerede) og <em>schön</em> (fin) er forskjellige ord!',
      nn: 'Tyske <strong>omlydar</strong> (ä, ö, ü) er eigne lydar — ikkje pynt. <em>schon</em> (allereie) og <em>schön</em> (fin) er ulike ord!',
      en: 'German <strong>umlauts</strong> (ä, ö, ü) are distinct sounds — not decoration. <em>schon</em> (already) and <em>schön</em> (nice) are different words!',
    },
    examples: [
      { correct: 'über', incorrect: 'uber', translation: { nb: 'over / om', nn: 'over / om', en: 'over / about' } },
      { correct: 'fünfzehn', incorrect: 'funfzehn', translation: { nb: 'femten', nn: 'femten', en: 'fifteen' } },
      { correct: 'gemütlich', incorrect: 'gemutlich', translation: { nb: 'koselig', nn: 'koseleg', en: 'cosy' } },
    ],
    extra: {
      nb: 'Hold inne bokstaven på Mac for å velge omlyden. Nødløsning hvis du ikke finner den: skriv <em>ae, oe, ue</em> (über → ueber) — det er alltid riktigere enn å droppe prikkene.',
      nn: 'Hald inne bokstaven på Mac for å velje omlyden. Naudløysing om du ikkje finn han: skriv <em>ae, oe, ue</em> (über → ueber) — det er alltid rettare enn å droppe prikkane.',
      en: 'Hold the letter key on Mac to pick the umlaut. Fallback if you cannot find it: write <em>ae, oe, ue</em> (über → ueber) — always more correct than dropping the dots.',
    },
  };
  const FR_ACCENT_PEDAGOGY = {
    note: {
      nb: 'Franske <strong>aksenter</strong> skiller ord og uttale: <em>a</em> (har) og <em>à</em> (til), <em>ou</em> (eller) og <em>où</em> (hvor). De kan ikke droppes.',
      nn: 'Franske <strong>aksentar</strong> skil ord og uttale: <em>a</em> (har) og <em>à</em> (til), <em>ou</em> (eller) og <em>où</em> (kvar). Dei kan ikkje droppast.',
      en: 'French <strong>accents</strong> distinguish words and pronunciation: <em>a</em> (has) vs <em>à</em> (to), <em>ou</em> (or) vs <em>où</em> (where). They cannot be dropped.',
    },
    examples: [
      { correct: 'très bon', incorrect: 'tres bon', translation: { nb: 'veldig god', nn: 'veldig god', en: 'very good' } },
      { correct: 'le cinéma', incorrect: 'le cinema', translation: { nb: 'kinoen', nn: 'kinoen', en: 'the cinema' } },
      { correct: 'français', incorrect: 'francais', translation: { nb: 'fransk', nn: 'fransk', en: 'French' } },
    ],
    extra: {
      nb: 'På Mac: hold inne bokstaven og velg aksenten. é = den vanligste (uttales som «e» i «le»), è/ê = mer åpen lyd, ç uttales alltid som s.',
      nn: 'På Mac: hald inne bokstaven og vel aksenten. é = den vanlegaste (vert uttalt som «e» i «le»), è/ê = meir open lyd, ç vert alltid uttalt som s.',
      en: 'On Mac: hold the letter key and pick the accent. é is the most common (like the "e" in "le"), è/ê are more open sounds, ç is always pronounced s.',
    },
  };

  const rule = {
    id: 'typo',
    languages: ['nb', 'nn', 'en', 'de', 'es', 'fr'],
    priority: 50,
    exam: {
      safe: true,
      reason: "Token-level fuzzy typo correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `<em>${escapeHtml(finding.original)}</em> står ikke i ordboken — kanskje du mente <em>${escapeHtml(finding.fix)}</em>?`,
      nn: `<em>${escapeHtml(finding.original)}</em> står ikkje i ordboka — kanskje du meinte <em>${escapeHtml(finding.fix)}</em>?`,
    }),
    check(ctx) {
      const { text, tokens, vocab, cursorPos, suppressed } = ctx;
      const validWords = vocab.validWords || new Set();
      const sisterValidWords = vocab.sisterValidWords || new Set(); // Phase 4 / SC-03
      // v3.0.115: text-local names learned from naming verbs — see
      // collectTextNames above. Every occurrence is amnestied.
      const textNames = collectTextNames(tokens, text, ctx.lang, validWords);

      // F36-1: Cross-language verb-form guard. When the seam-exposed
      // mood/aspect indexes recognise the token (in ANY language registered
      // through the seam), suppress the typo emission. Defends against
      // ctx.lang/vocab-state desync (vocab still on NB baseline while user
      // typed an FR token) AND against future lang-routing regressions.
      //
      // The check is conservative: only the *seam-surfaced* verb-form indexes
      // are consulted (frImparfaitToVerb, frPasseComposeParticiples,
      // frAuxPresensForms — and any future esPreterito*/dePreterit* indexes
      // gated by seam coverage). Empty Maps (the seam's safe default) make
      // this a no-op for languages that haven't hydrated.
      const FOREIGN_VERB_INDEX_KEYS = [
        'frImparfaitToVerb', 'frPasseComposeParticiples',
        // Add future cross-lang indexes here as they ship through the seam.
      ];
      const FOREIGN_VERB_SET_KEYS = ['frAuxPresensForms'];
      // F38-1: French elision strip. The tokenizer emits elided tokens whole
      // (e.g. "j'ai", "n'a", "qu'as", "s'est"), but the seam-exposed FR
      // mood/aspect indexes contain only the unelided base ("ai", "a", "as",
      // "est"). Without this strip, the cross-language guard misses every
      // elided auxiliary and nb-typo-fuzzy falsely flags `j'ai` → `j'aime`
      // (F38-1 walker symptom). The strip mirrors the elision-detection
      // pattern in extension/content/spell-rules/fr-aspect-hint.js (the
      // /^[a-zçéèêëàâ]'(.+)$/ regex on the auxiliary candidate).
      const ELISION_RE = /^(?:j|n|s|c|d|l|m|t|qu)'(.+)$/i;
      function stripElision(lc) {
        const m = lc.match(ELISION_RE);
        return m ? m[1] : null;
      }
      function tokenIsForeignVerbForm(lc) {
        const stripped = stripElision(lc);
        const candidates = stripped ? [lc, stripped] : [lc];
        for (const k of FOREIGN_VERB_INDEX_KEYS) {
          const m = vocab && vocab[k];
          if (m && typeof m.has === 'function') {
            for (const c of candidates) if (m.has(c)) return true;
          }
        }
        for (const k of FOREIGN_VERB_SET_KEYS) {
          const s = vocab && vocab[k];
          if (s && typeof s.has === 'function') {
            for (const c of candidates) if (s.has(c)) return true;
          }
        }
        return false;
      }

      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue; // Phase 4 / SC-02 + SC-04

        if (GLOBAL_WHITELIST.has(t.word)) continue;

        // Abbreviation guard. A token whose very next character is '.' and
        // which forms a known abbreviation is not a misspelling:
        //     "Han ble student i 1878 og cand. jur. i 1883."
        // flagged «cand» as unknown and helpfully suggested «cand.» — the
        // same string plus the period already sitting there. 19 findings on
        // Wikipedia biography prose, 2026-08-13.
        //
        // Read at CHECK time, not load time: rule files are required in
        // alphabetical order, so nb-typo-fuzzy is evaluated before
        // sentence-case has published the list. Deliberately shares that one
        // list rather than keeping a second copy here — the two rules fired
        // on the same input, and two lists would drift.
        if (ctx.text && ctx.text[t.end] === '.') {
          const abbrevFor = host.__lexiAbbrev && host.__lexiAbbrev.setFor;
          if (abbrevFor && abbrevFor(ctx.lang).has((t.word + '.').toLowerCase())) continue;
        }
        // Phase 48 C9: structural-quote suppression for NB/NN. Tokens
        // inside «...»/„..."/"..." quotation spans (marked by the priority-3
        // quotation-suppression pre-pass) are typically excerpts from
        // external source material — flagging fuzzy typo neighbors there
        // produces noise ("dvd'er" inside a book-list quotation, "the new"
        // inside an English-quoted phrase). Limited to NB/NN to keep blast
        // radius small; other languages still flag fuzzy hits inside quotes.
        if ((ctx.lang === 'nb' || ctx.lang === 'nn')
            && ctx.suppressedFor && ctx.suppressedFor.structural
            && ctx.suppressedFor.structural.has(i)) continue;
        // Phase 4 / SC-03 + Phase 05.1 Gap D co-existence: data-gap shield.
        // sisterValidWords contains (a) curated cross-dialect markers handled
        // by nb-dialect-mix (priority 35, wins via dedupeOverlapping) and
        // (b) forms missing from current-dialect validWords due to data
        // gaps (kaldt in NN, klokka in NB — still genuine Norwegian).
        // Silencing fuzzy on (b) preserves Phase 4 SC-03 tolerance.
        // Goal-loop 2 refinement (2026-06-12): a sister-valid token that is
        // (i) NOT valid in the current dialect, (ii) has NO frequency entry
        // (so it isn't a common shared word), and (iii) sits ONE edit from
        // a HIGH-frequency current-dialect word is far more likely a slip
        // than deliberate sister vocabulary — «gjore» (valid NN supinum) in
        // NB text is gjorde minus the d; «spørre» in NN text is spørje with
        // one substitution. Without this, SC-03 tolerance silenced both.
        if (sisterValidWords.has(t.word)) {
          let slipNeighbor = false;
          if (!validWords.has(t.word)
              && vocab.freq instanceof Map
              && vocab.freq.get(t.word) === undefined
              && t.word.length >= 4 && t.word.length <= 12) {
            const ALPHA = 'abcdefghijklmnopqrstuvwxyzæøå';
            const isHigh = (v) => { const z = vocab.freq.get(v); return typeof z === 'number' && z >= 4.5 && validWords.has(v); };
            outer:
            for (let d = 0; d < t.word.length; d++) {
              // deletion
              if (isHigh(t.word.slice(0, d) + t.word.slice(d + 1))) { slipNeighbor = true; break; }
              // substitution
              for (const c of ALPHA) {
                if (c !== t.word[d] && isHigh(t.word.slice(0, d) + c + t.word.slice(d + 1))) { slipNeighbor = true; break outer; }
              }
            }
            if (!slipNeighbor) {
              // insertion
              outer2:
              for (let d = 0; d <= t.word.length; d++) {
                for (const c of ALPHA) {
                  if (isHigh(t.word.slice(0, d) + c + t.word.slice(d))) { slipNeighbor = true; break outer2; }
                }
              }
            }
          }
          if (!slipNeighbor) continue;
        }
        // F36-1: Cross-language verb-form guard — see definition above.
        if (tokenIsForeignVerbForm(t.word)) continue;
        // v3.0.115: token was introduced as a name somewhere in this text
        // ("Er heißt Balder" → every "Balder" skips typo flagging).
        if (textNames.has(t.word)) continue;
        // v3.0.116: curated brand/platform names — never "correct" these.
        if (BRAND_WORDS.has(t.word)) continue;
        // Hyphenated-loanword guard. WORD_RE splits "week-end" → "week"+"end",
        // so a non-native part fuzzy-flags. If this token is glued by a hyphen
        // (no spaces) to a neighbour and the reconstructed compound is a known
        // loanword (curated HYPHEN_LOANWORDS or validWords), skip it — covers
        // BOTH parts ("after"+"shave") via the same compound lookup.
        {
          const loanSet = HYPHEN_LOANWORDS[ctx.lang];
          const inLoanword = (comp) => (loanSet && loanSet.has(comp)) || validWords.has(comp);
          let skipHyphen = false;
          if (text && t.start > 0 && text[t.start - 1] === '-' && i > 0 &&
              tokens[i - 1].end === t.start - 1) {
            if (inLoanword(tokens[i - 1].word + '-' + t.word)) skipHyphen = true;
          }
          if (!skipHyphen && text && text[t.end] === '-' && i + 1 < tokens.length &&
              tokens[i + 1].start === t.end + 1) {
            if (inLoanword(t.word + '-' + tokens[i + 1].word)) skipHyphen = true;
          }
          if (skipHyphen) continue;
        }
        // Phase 48 C2: productive-compound suppression. If the unknown
        // word splits cleanly into two valid NB parts (Ordbank validWords),
        // it's almost certainly a productive compound or a morphological
        // form Ordbank is missing — not a typo. Try plain concat first,
        // then fuge-s and fuge-e linkers. Conservative thresholds: total
        // word ≥ 6 chars for NB/NN (rimlag, tørrved, lingarn — Ordbank sweep
        // 2026-07; DE keeps ≥ 8), each part ≥ 3 chars. Without this, fuzzy fired
        // on `lesebingoer` (lese+bingoer), `leseinteresse`, `popkulturen`,
        // and the gap-superlative `vidunderligste`.
        if ((ctx.lang === 'nb' || ctx.lang === 'nn' || ctx.lang === 'de' || ctx.lang === 'en')
            && t.word.length >= (ctx.lang === 'de' ? 8 : ctx.lang === 'en' ? 7 : 6)
            && !validWords.has(t.word)) {
          let isCompound = false;
          for (let s = 3; s <= t.word.length - 3 && !isCompound; s++) {
            const left = t.word.slice(0, s);
            const right = t.word.slice(s);
            if (validWords.has(left) && validWords.has(right)) {
              // Fuge-drop typo guard (nb/nn): a word that splits into two valid
              // parts with NO linker, but whose fuge-inserted form (left+e+right
              // or left+s+right) is itself an attested word, is a misspelling of
              // THAT compound — «barnhage»→barnehage, «arbeidplass»→arbeidsplass —
              // not a novel compound. Leave isCompound false so the fuzzy pass
              // flags it and suggests the attested fuge form. Genuine novel
              // compounds (lesebingoer, popkulturen) have no attested fuge
              // variant, so they still suppress. NB/NN only — DE fuge shapes
              // differ and keep their own branch below.
              if ((ctx.lang === 'nb' || ctx.lang === 'nn')
                  && (validWords.has(left + 'e' + right) || validWords.has(left + 's' + right))) {
                break; // fuge-drop typo — do not treat as a productive compound
              }
              isCompound = true; break;
            }
            // Fuge-s linker: left + 's' + right
            if (right[0] === 's' && validWords.has(left) && validWords.has(right.slice(1)) && right.length >= 4) { isCompound = true; break; }
            // Fuge-e linker
            if (right[0] === 'e' && validWords.has(left) && validWords.has(right.slice(1)) && right.length >= 4) { isCompound = true; break; }
            // German drop-e stem ("Schule" → "Schul-": Schulband, Schulsachen)
            // and -n/-en Fugen ("Straße" → "Straßen-", "Sonne" → "Sonnen-").
            // Only for DE; requires the left stem + linker to be a real word.
            if (ctx.lang === 'de' && validWords.has(right) && right.length >= 3) {
              if (validWords.has(left + 'e')) { isCompound = true; break; }        // Schul + (e) + band
              if (right[0] === 'n' && validWords.has(left + 'e') && right.length >= 4) { isCompound = true; break; } // Straße|n + bahn
              if (right.slice(0, 2) === 'en' && validWords.has(left) && right.length >= 5) { isCompound = true; break; } // Fuge-en
            }
          }
          // Goal-loop 1+3 (2026-06-12/13): high-frequency 1-edit neighbor
          // beats the compound reading. «kannskje» splits as kann+skje
          // (both in the NN Ordbank list) and was silenced as a productive
          // compound — but it is one deleted letter from «kanskje» (Zipf
          // 5.7); «opplevelese» (oppleve+lese) is one deletion from
          // «opplevelse» (4.52); «eksempen» (eksem+pen) is one SUBSTITUTION
          // from «eksempel» (5.57). A single-letter slip onto a common word
          // is overwhelmingly more likely than a novel compound; genuine
          // compounds (lesebingoer, popkulturen) have no such neighbor.
          // EN has no freq sidecar, so the Zipf-based C2 check below is inert
          // there. Deletion-only neighbor check instead: a valid 1-DELETION
          // neighbor ("allready" → already, "untill" → until — the classic
          // doubled-letter typo class) beats the compound reading, while
          // substitution neighbors (whiteboard→whitebeard) do NOT un-suppress
          // genuine compounds.
          if (isCompound && ctx.lang === 'en') {
            for (let d = 0; d < t.word.length; d++) {
              if (validWords.has(t.word.slice(0, d) + t.word.slice(d + 1))) { isCompound = false; break; }
            }
          }
          if (isCompound && vocab.freq instanceof Map) {
            const C2_ALPHA = ctx.lang === 'de'
              ? 'abcdefghijklmnopqrstuvwxyzäöüß'
              : 'abcdefghijklmnopqrstuvwxyzæøå';
            const isCommon = (v) => { const z = vocab.freq.get(v); return typeof z === 'number' && z >= 4.5 && validWords.has(v); };
            c2scan:
            for (let d = 0; d < t.word.length; d++) {
              if (isCommon(t.word.slice(0, d) + t.word.slice(d + 1))) { isCompound = false; break; }
              // Adjacent transposition ("skirver" → "skriver"): among the most
              // common slips, and required once the NB/NN compound threshold
              // dropped to 6 — 7-char typos can now split into two valid parts
              // (skir+ver) and would otherwise be silenced as compounds.
              if (d + 1 < t.word.length && t.word[d] !== t.word[d + 1]) {
                const sw = t.word.slice(0, d) + t.word[d + 1] + t.word[d] + t.word.slice(d + 2);
                if (isCommon(sw)) { isCompound = false; break; }
              }
              for (const c of C2_ALPHA) {
                if (c !== t.word[d] && isCommon(t.word.slice(0, d) + c + t.word.slice(d + 1))) { isCompound = false; break c2scan; }
              }
            }
          }
          if (isCompound) continue;
        }
        // Phase 48 C9: unknown capitalized word — likely a proper noun
        // (name, place, brand): "Gisela er utrolig vakker", "Sjøli henviser
        // til …". Suggesting "Gisla" or "Sjøliv" as a typo fix is nonsense.
        // Only applied to NB/NN (DE has its own capitalization rule, EN
        // proper nouns are mostly already in en.json).
        //
        // 2026-07 recall fix (Geir's walk catch + product decision): the
        // original C9 skipped EVERY capitalized unknown — but every
        // sentence-starter is capitalized, so all sentence-initial typos
        // ("Morrgen er en fin dag", "Sjokollade er godt") silently passed.
        // Sentence-INITIAL capitals carry no name signal, so the blanket
        // skip now applies only MID-sentence. Sentence-initial unknowns run
        // through the fuzzy search like any lowercase word — when it's
        // actually a name/brand ("Gisela er vakker"), the student keeps it
        // via «Behold ordet» (personal dictionary, cloud-synced), mirroring
        // how native spellcheckers treat names.
        if ((ctx.lang === 'nb' || ctx.lang === 'nn')
            && t.display && t.display[0] !== t.display[0].toLowerCase()
            && !validWords.has(t.word)) {
          const sentInitial = i === 0
            || /[.!?]/.test(text.slice(tokens[i - 1].end, t.start));
          if (!sentInitial) continue;
        }
        if (
          t.word.length >= 3 &&
          !validWords.has(t.word) &&
          (ctx.lang === 'de' || !isLikelyProperNoun(t, i, tokens, text))
        ) {
          // Established loanwords from the anglicismbank ("cool", "random",
          // "mindset", inflected "meetingen") — absent from Ordbank validwords,
          // so fuzzy produced nonsense corrections (cool→cobol). nb-anglicism
          // owns the "consider a Norwegian word" coaching for these.
          if (vocab.anglicismWords && vocab.anglicismWords.has(t.word)) continue;
          // Genitive-s guard (NB/NN): Norwegian genitives add -s to any noun
          // and are NOT enumerated in the Ordbank fullform list, so every
          // genitive would otherwise be flagged. If the token ends in -s and
          // the stem is a known word, treat it as a genitive, not a typo:
          // "tidenes" (tidene+s, "of all time"), "dømes" ("til dømes" = "for
          // example", døme+s), "landets", "barnets".
          if ((ctx.lang === 'nb' || ctx.lang === 'nn') &&
              t.word.length >= 4 && t.word.endsWith('s') &&
              validWords.has(t.word.slice(0, -1))) {
            continue;
          }
          // FR/ES regular plurals: "apprenants"/"fonctionnalités" (FR),
          // "ordenadores" (ES) are inflected forms whose singular is valid but
          // the plural isn't always enumerated in validwords. Accept X-s / X-es
          // when the stem is a known word — the Romance analogue of the NB
          // genitive-s / EN possessive guards. (project_fr_elided_validwords_gap)
          if ((ctx.lang === 'fr' || ctx.lang === 'es' || ctx.lang === 'en') && t.word.length >= 4 && t.word.endsWith('s') &&
              (validWords.has(t.word.slice(0, -1)) ||
               (t.word.endsWith('es') && validWords.has(t.word.slice(0, -2))))) {
            continue;
          }
          // Title + surname ("Mr. Hansen", "Mrs. Larsen") — capitalized word
          // after an honorific is a proper noun, never a typo target.
          if (i > 0 && /^[A-Z]/.test(t.display) &&
              ['mr', 'mrs', 'ms', 'dr', 'prof', 'sir', 'lady'].includes(tokens[i - 1].word.toLowerCase())) {
            continue;
          }
          // ES enclitic pronouns: Spanish attaches object pronouns to infinitives/
          // gerunds ("abrocharte"=abrochar+te, "convencerle"=convencer+le,
          // "dárselo"=dar+se+lo). validwords holds the bare verb, not the enclitic
          // form. Strip a trailing enclitic and accept when the base is valid.
          // Runs only on otherwise-unknown words, so the blast radius is small.
          if (ctx.lang === 'es' && t.word.length >= 5) {
            const ES_ENCLITICS = ['noslos', 'noslas', 'melos', 'melas', 'telos', 'telas', 'selos', 'selas',
              'noslo', 'nosla', 'melo', 'mela', 'telo', 'tela', 'selo', 'sela',
              'nos', 'los', 'las', 'les', 'me', 'te', 'se', 'lo', 'la', 'le', 'os'];
            let enclSkip = false;
            for (let e = 0; e < ES_ENCLITICS.length; e++) {
              const enc = ES_ENCLITICS[e];
              if (t.word.endsWith(enc)) {
                const base = t.word.slice(0, -enc.length);
                // Accept an infinitive/gerund base ("convencer"+le) OR any base
                // whose de-accented form is a valid verb form — imperatives take
                // an added stress accent under enclisis ("reinícia"+lo,
                // "exprime"+le → "exprímele"), so check the de-accented base too.
                const deAcc = base.normalize('NFD').replace(/[̀-ͯ]/g, '');
                if (base.length >= 3 && (
                    (/(?:ar|er|ir|ár|ér|ír|ando|iendo)$/.test(base) && validWords.has(base)) ||
                    validWords.has(base) || validWords.has(deAcc))) { enclSkip = true; break; }
              }
            }
            if (enclSkip) continue;
          }
          // Wikipedia-corpus precision (E1, 2026-06-12): EN possessives.
          // The 45k frequency-capped validwords-en holds stems, not
          // possessive forms, so «women's», «Bunyan's» fuzzy-flagged
          // (women's→women was the single largest EN FP class, 294-finding
          // typo bucket). Accept X's / X' / X’s when the stem is valid —
          // the EN analogue of the NB genitive-s guard above.
          if (ctx.lang === 'en') {
            const m = t.word.match(/^(.+?)(?:['’]s?|['’])$/);
            if (m && m[1].length >= 2 && validWords.has(m[1])) continue;
            // Contractions (Ordbank sweep 2026-07): "didn't", "we'll",
            // "they're", "you've", "she'd", "I'm", "can't", "won't" — the
            // wordfreq-derived validwords strips apostrophes, so fuzzy
            // suggested apostrophe-less junk (didnt, canst, sherd). An
            // apostrophe + standard contraction tail is never a typo target.
            if (/['’](?:t|ll|re|ve|d|m|s)$/.test(t.word)) continue;
            // Derivational forms of valid stems ("mentoring" → mentor,
            // "kayaked" → kayak, "kayaking") — regular English morphology the
            // frequency-capped list doesn't enumerate.
            const dm = t.word.match(/^(.{3,}?)(?:ing|ed|er|ers|ings)$/);
            if (dm && (validWords.has(dm[1]) || validWords.has(dm[1] + 'e'))) continue;
          }
          // FR elision: "j'achète", "l'effort", "qu'elle", "n'est" are tokenized
          // whole, but validwords holds the unelided base (achète, effort, elle,
          // est) because wordfreq splits on the apostrophe. Accept the token when
          // its post-apostrophe base is valid — the FR analogue of the EN
          // possessive / NB genitive-s guards. (project_fr_elided_validwords_gap)
          if (ctx.lang === 'fr') {
            const m = t.word.match(/^(?:[jlmtscdn]|qu)['’](.+)$/i);
            if (m && validWords.has(m[1])) continue;
            // œ/æ ligature: the Lexique-derived validwords holds the oe/ae
            // DIGRAPH form ("choeur", "boeuf", "voeu"), so the ligatured
            // spellings "chœur"/"bœuf"/"vœu"/"nœud" get fuzzy-flagged though
            // they are the same, valid word. Accept when the de-ligatured form
            // is valid. (Both spellings are correct French.)
            if (/[œæ]/.test(t.word)) {
              const deLig = t.word.replace(/œ/g, 'oe').replace(/æ/g, 'ae');
              if (validWords.has(deLig)) continue;
            }
          }
          // E1/D6 (2026-06-12): internal-uppercase tokens are acronyms,
          // formulas, or camelCase brands (ClN→Clan, cDNAs) — never
          // fuzzy-correct them. Students don't typo INTO camelCase.
          if (/.\p{Lu}/u.test(t.display)) continue;
          // D6 (2026-06-12): DE multi-word proper-name run. DE bypasses
          // isLikelyProperNoun (all DE nouns are capitalized), so «New
          // York» fuzzy-flagged New→News. An unknown CAPITALIZED token
          // adjacent to another capitalized token is a name run or a
          // KNOWN-noun + name apposition («Mein Freundin Nora reitet» —
          // Nora fuzzy-corrected to Nord), not a noun typo — a misspelled
          // real noun («Schle») stands alone between lowercase words.
          if (ctx.lang === 'de' && /^\p{Lu}/u.test(t.display)) {
            // 2026-08-28: EIN STOR FORBOKSTAV I SETNINGSSTART ER IKKJE EIT
            // NAMNESIGNAL. Vaktene under les ein stor forbokstav hjå naboen
            // som «her går det eit namnelaup». På tysk er kvart ord i
            // setningsstart stort — konjunksjonar (Aber, Und, Denn),
            // adverb (Heute, Dann), pronomen (Ich, Wir), verb i spørsmål
            // (Hast, Kannst) — så den kapitalen ber null informasjon.
            //
            // Utan desse to sjekkane var «Aber Dtusch spreche ich» tagd
            // (Aber er stor fordi setninga startar der), og likeins var det
            // SISTE ordet før eit punktum nesten aldri fuzzy-sjekka, fordi
            // neste setning alltid opnar med stor bokstav. Meldt av ein
            // brukar 28.08.2026 med nettopp «Aber Dtusch».
            //
            // Kommentaren under prevCapName sa premissen rett ut — «articles
            // are the only capitalized non-nouns at clause start» — og det
            // er det som ikkje held.
            const isSentInitial = (idx) => {
              if (idx <= 0) return true;
              return /[.!?]/.test(text.slice(tokens[idx - 1].end, tokens[idx].start));
            };
            // Ein stor bokstav på NESTE token tel berre når han står inne i
            // same setninga; over ei setningsgrense er han obligatorisk.
            const nextCap = tokens[i + 1] && /^\p{Lu}/u.test(tokens[i + 1].display)
              && !isSentInitial(i + 1);
            // Apposition guard requires the previous token to be a KNOWN
            // NOUN (nounGenus), not merely valid — a sentence-initial
            // capitalized article («Der Schle ist …») must not mask the
            // following noun typo.
            const prevT = tokens[i - 1];
            const nounGenus = vocab.nounGenus || new Map();
            const prevKnownNoun = prevT && /^\p{Lu}/u.test(prevT.display) && nounGenus.has(prevT.word);
            // A capitalized unknown directly after a BARE preposition (no
            // article between) is a proper noun — place or person: "nach Paris",
            // "aus Ecuador", "von Molière", "in Oslo", "am Rhein". Fuzzy-
            // correcting «Paris»→«Pairs» is nonsense. Contracted preps with a
            // baked-in article (im/am/beim/zum/vom) are excluded — they head a
            // common-noun NP where a real typo can hide ("im Automataten").
            const DE_BARE_PREP = /^(?:nach|aus|von|in|bei|zu|mit|über|um|für|gegen|ohne|seit|an|auf|nahe|per)$/;
            const prevBarePrep = prevT && DE_BARE_PREP.test(prevT.word);
            // Name run: the previous token is itself a capitalized UNKNOWN word
            // — a first name before a surname ("Tom Hanks", "Pablo Picasso",
            // "Harry Potter"). A capitalized KNOWN word ("Der Schle …") is an
            // article/noun and must NOT mask the following typo, so require the
            // predecessor to be unknown to validWords.
            // Same sak for førre token: er HAN setningsinitial, seier kapitalen
            // hans ingenting om at dette ordet er eit namn.
            const prevCapMeaningful = prevT && /^\p{Lu}/u.test(prevT.display)
              && !isSentInitial(i - 1);
            const prevCapUnknown = prevCapMeaningful && !validWords.has(prevT.word);
            // Gazetteer follow-up (2026-07): making first names VALID words
            // removed the prev-cap-unknown signal ("Harry Potter" — harry is
            // now in validWords, so Potter lost its name-run protection).
            // A capitalized predecessor that is neither a known NOUN nor an
            // article/determiner is a name in DE (articles are the only
            // capitalized non-nouns at clause start).
            const DE_CAP_FUNCTION = /^(?:der|die|das|den|dem|des|ein|eine|einen|einem|einer|eines|mein|meine|dein|deine|sein|seine|ihr|ihre|unser|unsere|euer|eure|kein|keine|welcher|welche|welches|dieser|diese|dieses|jeder|jede|jedes)$/;
            const prevCapName = prevCapMeaningful
              && !nounGenus.has(prevT.word) && !DE_CAP_FUNCTION.test(prevT.word);
            // Genitive of a name ("Marias einziges Kind", "Peters Auto"):
            // capitalized, ends in -s, and the stem is itself a valid word.
            const genitiveName = /s$/.test(t.word) && t.word.length > 3
              && validWords.has(t.word.slice(0, -1)) && !nounGenus.has(t.word);
            if (nextCap || prevKnownNoun || prevBarePrep || prevCapUnknown || prevCapName || genitiveName) continue;
          }
          // v3.0.118: FR — an unknown token directly after an être/avoir
          // auxiliary is a participle attempt ("il a alle" = allé). That
          // territory belongs to fr-etre-avoir / fr-pp-agreement, which coach
          // the aux+participle pair contextually; a parallel fuzzy guess
          // ("alle" → "aller") is noise on the same construction. Surfaced
          // when the v3.0.118 translation-leak fix removed Norwegian "alle"
          // from FR validWords.
          if (ctx.lang === 'fr' && i > 0 && FR_AUX_FORMS.has(tokens[i - 1].word)) continue;
          // v3.0.115: DE orthography normalization beats fuzzy. ss→ß, B→ß
          // and dropped-umlaut variants that land exactly in validWords are
          // emitted directly — "heisst" → "heißt" (fuzzy could only reach
          // "heizst"), "uber" → "über" (fuzzy suggested "ufer").
          if (ctx.lang === 'de' || ctx.lang === 'fr') {
            const norm = ctx.lang === 'de'
              ? deNormalizedVariant(t.word, validWords)
              : frNormalizedVariant(t.word, validWords);
            if (norm) {
              const fixCased = matchCase(t.display, norm);
              // v3.0.121 Lær mer: these classes are SYSTEMATIC keyboard
              // habits, not one-off typos — perfect teaching moments. The
              // explicit f.pedagogy wins over rule/remote lessons in core.
              const pedagogy = ctx.lang === 'de'
                ? (norm.includes('ß') ? DE_ESZETT_PEDAGOGY : DE_UMLAUT_PEDAGOGY)
                : FR_ACCENT_PEDAGOGY;
              out.push({
                rule_id: 'typo',
                priority: rule.priority,
                start: t.start,
                end: t.end,
                original: t.display,
                fix: fixCased,
                suggestions: [fixCased],
                pedagogy,
                message: `Skrivefeil: "${t.display}" → "${fixCased}"`,
              });
              continue;
            }
          }
          const prevWord = i > 0 ? tokens[i - 1].word : null;
          const neighbors = findFuzzyNeighbors(t.word, vocab, prevWord, ctx.lang || 'nb');
          // DE proper-noun guard: when the only fuzzy "correction" of a
          // capitalized unknown is that same word plus a derivational/inflectional
          // suffix ("London"→"Londoner", "Ecuador"→"Ecuadors", "Skandinavien"→
          // "Skandinaviens", "Oslo"→"Osloer"), the original is a valid proper-noun
          // BASE, not a typo. Restricted to real suffixes so an end-truncation
          // typo ("Grammatikrege"→"Grammatikregel", added 'l') still flags.
          if (ctx.lang === 'de' && neighbors.length > 0 && /^\p{Lu}/u.test(t.display)) {
            const cand = neighbors[0];
            if (cand.length > t.word.length && cand.startsWith(t.word)
                && /^(?:er|ers|es|s|n|en)$/.test(cand.slice(t.word.length))) {
              continue;
            }
          }
          if (neighbors.length > 0) {
            // NN sideform-pair guard: when the student-typed token decomposes
            // into known noun parts with high confidence AND a fuzzy candidate
            // is itself a known noun differing only by a single a↔å
            // substitution, this is a productive sideform compound (gåve vs
            // gave on a known -gave compound base — bursdagsgåve, julegåve).
            // DE compounds like Haustür / Haustier are semantically distinct
            // pairs that must still flag — gated to NB/NN.
            let sideformSkip = false;
            if (ctx.lang === 'nb' || ctx.lang === 'nn') {
              const decompose = vocab.decomposeCompound;
              const nounGenus = vocab.nounGenus;
              if (decompose && nounGenus) {
                const origDecomp = decompose(t.word);
                if (origDecomp && origDecomp.confidence === 'high') {
                  for (const cand of neighbors) {
                    if (isAaSideformPair(t.word, cand) && nounGenus.has(cand)) {
                      sideformSkip = true;
                      break;
                    }
                  }
                }
              }
            }
            if (sideformSkip) continue;
            const suggestions = neighbors.map(n => matchCase(t.display, n));
            out.push({
              rule_id: 'typo',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: suggestions[0],       // winner — back-compat with fixture harness
              suggestions,               // top-K for UX-02 multi-suggest layout
              message: `Skrivefeil: "${t.display}" → "${suggestions[0]}"`,
            });
          } else {
            // Phase 17 COMP-03: no fuzzy match — try decomposition acceptance.
            // Typo-fuzzy d=1 correction wins (checked above); only reach here
            // when the word has NO close neighbors. Accept silently if the
            // shared decomposition engine splits it into known nouns with high
            // confidence. Do NOT add to validWords/compoundNouns (Pitfall 3/6).
            const decompose = vocab.decomposeCompound;
            if (decompose) {
              const decomp = decompose(t.word);
              if (decomp && decomp.confidence === 'high') continue;
            }
            // If decomposition also fails, do NOT flag — existing behaviour
            // for unknown words without suggestions.
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
