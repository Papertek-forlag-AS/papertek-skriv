/**
 * Spell-check rule: Context-aware typo correction (priority 45).
 * 
 * Flags valid words that are statistically unlikely in their current context
 * when a very close neighbor (edit distance 1) is a common bigram match.
 * 
 * Example: "veldig bar" -> "veldig bra"
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const {
    editDistance,
    matchCase,
    escapeHtml,
  } = core;

  const SAFE_WORDS = new Set([
    // Norwegian Bokmål/Nynorsk common short words
    'at', 'av', 'de', 'deg', 'dem', 'den', 'det', 'din', 'du', 'en', 'enn',
    'er', 'et', 'for', 'fra', 'før', 'ha', 'han', 'har', 'her', 'hva', 'hun',
    'hvor', 'i', 'ikke', 'jeg', 'kan', 'man', 'med', 'meg', 'min', 'må', 'noe',
    'noen', 'nå', 'og', 'om', 'opp', 'oss', 'på', 'seg', 'sin', 'skal', 'som',
    'så', 'ta', 'til', 'ut', 'var', 'vi', 'vil', 'å', 'ei', 'eit', 'ein',
    'dei', 'eg', 'ho', 'vår', 'kvar', 'kva', 'kven', 'kor', 'mer', 'meir',
    'barn', 'born', 'mykje', 'veldig', 'også', 'eller', 'men', 'vårt', 'våre',
    'mi', 'mitt', 'mine', 'di', 'ditt', 'dine', 'si', 'sitt', 'sine',
    // Phase 48 C3 (extended): high-frequency words that share an
    // edit-distance-1 neighbor in the lexicon and were FP-flagged via
    // context bigram. `ett` (numeral, distinct from indef art `et`),
    // `der` (locative adverb, distinct from `det`), `dit` (motion),
    // `mer/meir`/`mest` already covered above.
    'ett', 'der', 'dit', 'her',
    // Additional NN core function words missing from the original list. These
    // are high-frequency NN forms that surface as edit-distance-1 neighbors
    // of NB cognates (vart↔var, frå↔fra, alt↔at, nokon↔noen) and were
    // false-flagged as typos in benchmark sweep.
    'vart', 'vorte', 'vorten', 'verta',           // NN 'verta' = bli (preteritum/supine)
    'frå', 'fram', 'attende',                     // NN preposition/adverbs
    'alt', 'all', 'alle', 'andre', 'anna', 'annan',
    'nokon', 'noko', 'nokre',                     // NN indefinites
    'inga', 'ingen', 'ikkje',                     // NN negation
    'då', 'då-då', 'no', 'medan', 'sjølv', 'sjølve',
    'rett', 'lett', 'godt', 'mest', 'meste',
    // Ordbank sweep (2026-07): valid function words / fixed-adverbial forms
    // flagged via bigram sparsity — 'pr' (abbreviation pr.), 'ad' (archaic
    // preposition, "ad omveier"), 'via', 'hen' ("hvor hen"), 'morges'
    // ("i morges"), 'igjennom' (valid variant of gjennom, "tvers igjennom").
    'pr', 'ad', 'via', 'hen', 'morges', 'igjennom',
    // English common short words and verbs
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from', 'has', 
    'have', 'he', 'i', 'in', 'is', 'it', 'not', 'of', 'on', 'or', 'so', 'that', 
    'the', 'to', 'was', 'we', 'will', 'with', 'you', 'went', 'want', 'can', 
    'could', 'should', 'would', 'may', 'might', 'shall', 'must', 'am', 'were', 
    'been', 'being', 'had', 'does', 'did', 'done', 'doing'
  ]);

  const rule = {
    id: 'context-typo',
    languages: ['nb', 'nn', 'en'], // Enabled for languages with bigram data
    priority: 45, // Slightly higher priority than standard typo
    exam: {
      safe: true,
      reason: "Token-level context typo correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Mente du <em>${escapeHtml(finding.fix)}</em>? Ordet <em>${escapeHtml(finding.original)}</em> passer sjelden etter "${escapeHtml(finding.prev)}".`,
      nn: `Meinte du <em>${escapeHtml(finding.fix)}</em>? Ordet <em>${escapeHtml(finding.original)}</em> passar sjeldan etter "${escapeHtml(finding.prev)}".`,
      en: `Did you mean <em>${escapeHtml(finding.fix)}</em>? The word <em>${escapeHtml(finding.original)}</em> is unusual after "${escapeHtml(finding.prev)}".`,
    }),
    check(ctx) {
      const { text, tokens, vocab, cursorPos, suppressed, lang } = ctx;
      const validWords = vocab.validWords || new Set();
      const bigrams = vocab.bigrams;
      const verbInfinitive = vocab.verbInfinitive || new Map();
      const adjLemma = vocab.adjLemma || new Map();
      if (!bigrams) return [];
      // Guard: when currentWord and the candidate map to the same lemma,
      // they're tense/aspect/sideform variants of the same word (e.g. NN
      // `vert` / `vart` — present and preteritum of `verte`; `gammal` /
      // `gamal` — declension sideforms of one adjective). The rule fires
      // because bigrams may prefer one variant over another in the training
      // corpus, but suggesting the swap is a sideform/tense-swap FP, not a
      // typo correction. Covers both verb and adjective lemma maps.
      //
      // The maps only contain INFLECTED-form → lemma entries; the lemma
      // itself isn't a key. When comparing a conjugation with its lemma
      // (e.g. "sa" inflected with lemma "si", vs "si" itself which has no
      // entry), we fall back to "word is its own lemma". This catches the
      // sa↔si and se↔ser conjugation-vs-lemma swaps; for genuinely
      // unrelated words both missing from the map, the fallback compares
      // string equality of the two words (false → rule fires correctly).
      const lemmaOf = (w, map) => {
        const m = map && map.get && map.get(w);
        return m || w;
      };
      const shareLemma = (a, b) => {
        // Verb lemma
        if (verbInfinitive.has && (verbInfinitive.has(a) || verbInfinitive.has(b))) {
          if (lemmaOf(a, verbInfinitive) === lemmaOf(b, verbInfinitive)) return true;
        }
        // Adjective lemma
        if (adjLemma.has && (adjLemma.has(a) || adjLemma.has(b))) {
          if (lemmaOf(a, adjLemma) === lemmaOf(b, adjLemma)) return true;
        }
        return false;
      };

      const out = [];
      // Fold accents/diacritics to a base ASCII-ish form for variant detection.
      // NFD + combining-mark strip handles ê/å/ä/ö/à…; ø/æ are atomic so map them.
      const foldDiacritics = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ø/g, 'o').replace(/æ/g, 'ae');
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        const prevT = tokens[i - 1];
        
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        // Do not bridge punctuation
        const between = text.slice(prevT.end, t.start);
        if (/[.!?,\-:]/.test(between)) continue;

        const prevWord = prevT.word.toLowerCase();
        const currentWord = t.word.toLowerCase();

        // Phase 48 C9: proper-noun guard. If the displayed token is
        // capitalized AND not at sentence-start, it's almost certainly a
        // proper noun (character/place/brand). Refuse to suggest a swap
        // even when an edit-distance-1 neighbor exists ("Hans → Han",
        // "Gisela → Gisla"). Sentence-start cap is allowed because that's
        // routine sentence capitalization, not a name signal. Detect
        // sentence-start by looking at the gap before this token: empty
        // or starts-of-document is sentence-start; otherwise we treat the
        // capital as a proper-noun marker.
        const startsCap = t.display && t.display[0] !== t.display[0].toLowerCase();
        if (startsCap) {
          const gapBefore = text.slice(0, t.start);
          const prevSentenceEnd = /[.!?]\s*$/.test(gapBefore) || gapBefore.trim() === '';
          if (!prevSentenceEnd) continue;
        }

        // Protect highly common function words from being flagged as typos
        if (SAFE_WORDS.has(currentWord)) continue;

        // Hyphen-compound fragment: a token directly joined to the NEXT token
        // by a hyphen is a compound member ("e-post", "e-en"), not a standalone
        // word to context-check. (The backward hyphen case is already covered
        // by the punctuation-bridge check above.) Single letters are likewise
        // never context-typos worth flagging.
        if (currentWord.length === 1) continue;
        const nextT0 = tokens[i + 1];
        if (nextT0 && text.slice(t.end, nextT0.start).includes('-')) continue;

        // Preposition/determiner complements are OPEN-CLASS: after i/på/med/
        // en/denne/to/…, any valid noun (or adjective: "kjenne seg mo") is
        // grammatically fine, so a missing prev→current bigram there is table
        // sparsity, not a real-word error ("fordele en arv", "i sorgen", "med
        // dun", "to gynger", "som hare"). The rule's real target — an
        // adjective/verb slot mismatch like "veldig bar" → "bra" — has an
        // intensifier/adverb prev, which stays outside this set.
        if (lang === 'nb' || lang === 'nn') {
          const NB_PREP_DET = new Set([
            'i', 'på', 'med', 'til', 'av', 'fra', 'frå', 'over', 'under', 'om',
            'mot', 'hos', 'ved', 'etter', 'uten', 'utan', 'mellom', 'gjennom',
            'en', 'ei', 'et', 'ein', 'eit', 'denne', 'dette', 'disse', 'desse',
            'to', 'tre', 'fire', 'fem', 'seks', 'mye', 'mykje', 'slik', 'som',
            'seg', 'sin', 'si', 'sitt', 'sine', 'min', 'din', 'vår',
          ]);
          // Noun-shaped: in the curated noun/adjective indexes, OR an inflected
          // form whose stem is a valid word ("margen" → marg, "gynger" →
          // gynge) — the curated nounbank will never cover all of Ordbank, so
          // the morphological fallback closes the class. Scoped to the
          // prep/det position only, where a valid noun-form is near-certainly
          // legitimate.
          const isNounish = (w) => {
            if (vocab.nounGenus && vocab.nounGenus.has(w)) return true;
            if (vocab.isAdjective && vocab.isAdjective.has(w)) return true;
            for (const suf of ['ene', 'ane', 'en', 'et', 'er', 'a', 'r']) {
              if (w.length - suf.length >= 3 && w.endsWith(suf) && validWords.has(w.slice(0, -suf.length))) return true;
            }
            return false;
          };
          if (NB_PREP_DET.has(prevWord) && isNounish(currentWord)) continue;
        }
        
        // If current word is valid but has no bigram connection to previous word
        const currentPairs = bigrams[prevWord];
        if (currentPairs && !currentPairs[currentWord] && validWords.has(currentWord)) {

          // Forward-integration guard: if the current (valid) word forms a
          // bigram with the FOLLOWING word, it's well-integrated in the
          // sentence — the missing backward bigram (prev->current) is bigram-
          // table sparsity, not a real-word error. Kills FPs like "ein liten
          // gard i Sogn" (gard->i is a real bigram, so don't suggest grad),
          // "katten sov i sola" (sov->i), and the over-eager "Han sa at"
          // (sa->at is a real bigram). Genuinely isolated words (no forward
          // bigram, e.g. before a clause boundary) can still be corrected.
          const nextFwd = tokens[i + 1];
          if (nextFwd) {
            const fwdGap = text.slice(t.end, nextFwd.start);
            if (!/[.!?,\-:]/.test(fwdGap)) {
              const fwdPairs = bigrams[currentWord];
              if (fwdPairs && fwdPairs[nextFwd.word.toLowerCase()]) continue;
            }
          }

          let bestNeighbor = null;
          let bestScore = 0;

          const currentZipf = (vocab.freq && vocab.freq.get(currentWord)) || 0;

          // Common-word guard: never "correct" a frequent valid word. A common
          // word (gard 5.08, sov 4.61) simply lacking a specific previous-word
          // bigram is table sparsity, not a real-word error — and the forward-
          // integration guard above can't help at a clause boundary ("ein
          // liten gard." with no following word). Real-word errors worth
          // catching are the uncommon-but-present words; this rule only fires
          // for 0 < Zipf < 4.0. (Diacritic variants are filtered separately.)
          if (currentZipf >= 4.0) continue;

          // Ytelse (27.08.2026): denne løkken gikk gjennom HELE validWords —
          // 639 352 ord for nb — per kvalifiserende ord, og var alene 225 ms
          // av en 414 ms check() på 200 ord.
          //
          // Den trengte aldri å gjøre det. Se `weight` under: en kandidat
          // kan bare vinne hvis `currentPairs[cand] >= minWeight`, og
          // minWeight er 2 eller 5. Er ikke kandidaten en nøkkel i
          // `currentPairs`, er weight `undefined`, og `undefined >= 2` er
          // usann — den kunne aldri blitt valgt. Kandidatuniverset ER altså
          // bigram-etterfølgerne til forrige ord: titalls ord, ikke 639 352.
          // Alle vaktene under står i samme rekkefølge som før, så
          // resultatmengden er per definisjon uendret.
          //
          // Det ene som IKKE følger av mengdelikhet er uavgjort: `weight >
          // bestScore` er streng, så det FØRSTE maksimumet vant, og «først»
          // betydde først i validWords-rekkefølge. Bigram-nøkkelrekkefølgen
          // er en annen. Vi samler derfor alle med maksvekt og faller
          // tilbake til en skanning bare når to eller flere står likt —
          // sjelden, og da koster det det løkken kostet før.
          const candKeys = Object.keys(currentPairs);
          const tiedBest = [];
          for (let ci = 0; ci < candKeys.length; ci++) {
            const cand = candKeys[ci];
            if (!validWords.has(cand)) continue;
            if (cand === currentWord) continue;
            if (Math.abs(cand.length - currentWord.length) > 1) continue;
            // For short words, only allow edits that preserve the first letter (unless it's a transposition)
            if (cand[0] !== currentWord[0] && currentWord.length <= 4) {
               if (!(cand.length === currentWord.length && cand[1] === currentWord[0] && cand[0] === currentWord[1])) {
                   continue; 
               }
            }

            const dist = editDistance(currentWord, cand, 1);
            if (dist === 1) {
              // Genitive-s guard: when the current word IS the candidate plus
              // a genitive -s ("ens" = one's, "års" = years', "dets" = its),
              // it is the correct possessive of that very word, not a typo of
              // it. Norwegian genitives attach -s productively and are sparse
              // in the bigram table.
              if (currentWord === cand + 's') continue;
              // Tense/aspect-swap guard: skip candidates that share a verb
              // lemma with the current word. Eliminates the `vert → vart`
              // class of FP (both are valid conjugations of NN `verte`).
              if (shareLemma(currentWord, cand)) continue;
              // Diacritic-only variants (vêr/ver, å/a, ø/o, æ/ae) are spelling
              // variants between two valid words, not real-word errors — never
              // suggest one accented form for another via bigram preference.
              if (foldDiacritics(cand) === foldDiacritics(currentWord)) continue;
              const weight = currentPairs[cand];
              const candZipf = (vocab.freq && vocab.freq.get(cand)) || 0;

              // We only have Zipf data for NB/NN.
              // If we do, ensure we aren't suggesting a rare word.
              if (currentZipf > 0 && candZipf > 0 && candZipf < 3.0) continue;

              // Without Zipf data (e.g. EN has no freq sidecar), we lose the
              // frequency gate that normally stops us suggesting a rare word
              // as the "right" form. Compensate by demanding a stronger
              // bigram signal. Symptom this guards against: "They ate
              // dinner" → "ate → are" (bigram `they are` dominates the
              // table, but `ate` is the correct word here). Raising the bar
              // to 5 stops bigram-majority cases from overriding a token
              // that was already valid.
              const hasZipfData = vocab.freq && vocab.freq.size > 0;
              const minWeight = hasZipfData ? 2 : 5;

              if (weight >= minWeight) {
                if (weight > bestScore) {
                  bestScore = weight;
                  bestNeighbor = cand;
                  tiedBest.length = 0;
                  tiedBest.push(cand);
                } else if (weight === bestScore) {
                  tiedBest.push(cand);
                }
              }
            }
          }

          // Uavgjort på maksvekt: gjenskap den gamle rekkefølgen ved å
          // finne den av dem som kom først i validWords. Early-exit, og
          // bare på denne grenen.
          if (tiedBest.length > 1) {
            const tied = new Set(tiedBest);
            for (const w of validWords) {
              if (tied.has(w)) { bestNeighbor = w; break; }
            }
          }

          const hasZipfData = vocab.freq && vocab.freq.size > 0;
          const minBestScore = hasZipfData ? 2 : 5;
          if (bestNeighbor && bestScore >= minBestScore) {
            const fix = matchCase(t.display, bestNeighbor);
            out.push({
              rule_id: 'context-typo',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              prev: prevT.display,
              fix: fix,
              suggestions: [fix],
              message: `Kontekst-feil: "${t.display}" -> "${fix}"`,
            });
            if (suppressed) suppressed.add(i);
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
