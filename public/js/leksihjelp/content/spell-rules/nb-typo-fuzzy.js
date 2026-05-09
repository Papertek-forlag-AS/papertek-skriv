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

  function scoreCandidate(query, cand, d, vocab, prevWord) {
    const pref = sharedPrefixLen(query, cand);
    const suff = sharedSuffixLen(query, cand);
    let s = pref * 15 + suff * 10 - d * 100;
    if (cand.length < query.length) s -= 50;
    if (isAdjacentTransposition(query, cand)) s += 40;

    // Zipf tiebreaker — vocab.freq is hydrated from freq-{lang}.json by
    // vocab-seam-core.buildIndexes (Phase 3-01). Empty Map for languages
    // without a sidecar (de/es/fr/en) — fine, fuzzy is NB/NN-only anyway.
    if (vocab && vocab.freq) {
      const z = vocab.freq.get(cand);
      if (typeof z === 'number') s += z * ZIPF_MULT;
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
  function findFuzzyNeighbors(word, vocab, prevWord, lang) {
    const validWords = vocab.validWords || new Set();
    const len = word.length;
    // Tighter threshold for short words — 1 edit out of 4 chars is already
    // a lot of signal to drop, but 1 edit out of 8+ is common.
    const k = len <= 6 ? 1 : 2;
    const first = word[0];
    const scored = [];
    for (const cand of validWords) {
      const cl = cand.length;
      if (Math.abs(cl - len) > k) continue;
      if (cand[0] !== first) continue; // Very common typos keep the first char
      if (cand === word) continue;
      const d = editDistance(word, cand, k);
      if (d > k) continue;
      scored.push({ cand, score: scoreCandidate(word, cand, d, vocab, prevWord) });
    }

    // Phonetic fallback: if Levenshtein search yielded no results, try phonetic
    // matching (Phonetic matching logic brought over from word-prediction.js).
    const vocabCore = host.__lexiVocabCore;
    if (scored.length === 0 && vocabCore && word.length >= 3) {
      const qPhonetic = vocabCore.phoneticNormalize(word, lang);
      for (const cand of validWords) {
        if (cand === word) continue;
        // Optimization: only check candidates with similar length
        if (Math.abs(cand.length - word.length) > 2) continue;
        const targetPhonetic = vocabCore.phoneticNormalize(cand, lang);
        const pScore = vocabCore.phoneticMatchScore(qPhonetic, targetPhonetic);
        if (pScore >= 70) {
          // Normalize pScore to be competitive but generally lower than d=1 hits
          scored.push({ cand, score: -150 + pScore });
        }
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 8).map(s => s.cand);
  }

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
        // Phase 4 / SC-03 + Phase 05.1 Gap D co-existence: data-gap shield.
        // sisterValidWords contains (a) curated cross-dialect markers handled
        // by nb-dialect-mix (priority 35, wins via dedupeOverlapping) and
        // (b) forms missing from current-dialect validWords due to data
        // gaps (kaldt in NN, klokka in NB — still genuine Norwegian).
        // Silencing fuzzy on (b) preserves Phase 4 SC-03 tolerance.
        if (sisterValidWords.has(t.word)) continue;
        // F36-1: Cross-language verb-form guard — see definition above.
        if (tokenIsForeignVerbForm(t.word)) continue;
        if (
          t.word.length >= 3 &&
          !validWords.has(t.word) &&
          (ctx.lang === 'de' || !isLikelyProperNoun(t, i, tokens, text))
        ) {
          const prevWord = i > 0 ? tokens[i - 1].word : null;
          const neighbors = findFuzzyNeighbors(t.word, vocab, prevWord, ctx.lang || 'nb');
          if (neighbors.length > 0) {
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
