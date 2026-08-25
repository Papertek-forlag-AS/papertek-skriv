/**
 * Spell-check rule: code-switching density pre-pass (priority 1).
 *
 * Phase 4 / SC-04. Suppression-only rule — emits NO findings, only mutates
 * ctx.suppressed. When the user writes a passage containing a contiguous
 * span of non-Norwegian tokens (e.g. a quoted German sentence inside an NB
 * document), the typo rules downstream would produce a forest of fuzzy
 * suggestions on each unknown word. This rule detects such density clumps
 * via a sliding-5-token window: when ≥3 of 5 tokens are "unknown to both
 * NB and NN AND not a proper noun AND not a known typo", every token in
 * that window is added to ctx.suppressed. Downstream typo/curated/sarskriving
 * rules check the set and skip.
 *
 * Parameters (tuneable; locked at plan-authoring time):
 *   WINDOW_SIZE        = 5   — span of tokens examined at each position.
 *   UNKNOWN_THRESHOLD  = 3   — minimum count of unknown tokens inside the
 *                              window to trigger suppression.
 *   MIN_TOKENS         = 8   — short inputs don't activate the window;
 *                              guards against over-suppression on mixed
 *                              short greetings like "Wow so cool Siri og
 *                              Ola" (Pitfall 8 in 04-RESEARCH.md).
 *
 * Pitfall 2 safeguard: `isUnknown()` excludes `isLikelyProperNoun()` tokens
 * from the density count. Norwegian-name-rich sentences (e.g. "Vi møtte
 * Siri Hallgrim Pettersen") would otherwise trip density detection and
 * over-suppress real typos nearby.
 *
 * Gender and modal-verb rules do NOT opt into suppression — they fire on
 * real Norwegian grammar patterns regardless of whether the span is a
 * code-switched quote. See spell-rules/README.md for the convention.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const isLikelyProperNoun =
    typeof core.isLikelyProperNoun === 'function'
      ? core.isLikelyProperNoun
      : function fallbackIsProperNoun() { return false; };

  const WINDOW_SIZE = 5;
  const UNKNOWN_THRESHOLD = 3;
  const MIN_TOKENS = 8;

  // v3.0.119: core English function words ALWAYS count toward code-switch
  // density, even when they collide with the typo bank ('the' → te) or
  // sister-dialect forms ('and' = NN duck). Without this, one new upstream
  // typo entry fragmented the run window and the English words inside got
  // mis-corrected ("the salt" → "te salt") — the give→gave class this rule
  // exists to prevent. Isolated occurrences stay correctable: a single 'the'
  // in Norwegian text never reaches the window threshold on its own.
  const EN_DENSITY_WORDS = new Set([
    'the', 'and', 'you', 'this', 'that', 'with', 'have', 'what', 'when',
    'where', 'why', 'how', 'they', 'them', 'then', 'than', 'there', 'their',
    'would', 'could', 'should', 'because', 'about', 'just', 'very', 'please',
    'tomorrow', 'yesterday', 'today',
  ]);

  // v3.0.136 — foreign-run pass (Wikipedia precision-corpus run): the
  // density window above can't see SHORT foreign runs because proper nouns
  // are excluded from the unknown count («Order of the British Empire»,
  // «Región de Magallanes», «In the Mouth of Madness» never reach 3-of-5).
  // The lowercase connectors inside those runs then get mis-corrected by
  // token rules (the→te, de→dei, rock and→rockand, Master's→Masters).
  //
  // RUN_CONNECTORS: lowercase function words of EN/FR/ES/DE/IT/NL name- and
  // title-grammar. Suppressed ONLY when adjacent to a mid-sentence
  // capitalized token (isLikelyProperNoun), so plain Norwegian uses stay
  // flaggable. Norwegian homographs that commonly precede names in real
  // Norwegian syntax (da, en, et, den, som, om, i, på, til, av) are
  // deliberately EXCLUDED — «da Lisa kom» / «en PC» must keep firing
  // homophone/dialect-mix coaching.
  const RUN_CONNECTORS = new Set([
    'the', 'of', 'and', 'a', 'an', 'at', 'on', 'in', 'to', 'for',
    'de', 'la', 'le', 'les', 'du', 'des', 'del', 'della', 'di', 'do', 'dos',
    'y', 'el', 'von', 'van', 'der', 'zu',
  ]);

  // Fixed foreign phrases that appear verbatim inside Norwegian prose —
  // all tokens suppressed when the full phrase matches (lowercase).
  const FIXED_FOREIGN_PHRASES = [
    ['rock', 'and', 'roll'], ['heavy', 'metal'], ['rhythm', 'and', 'blues'],
    ['de', 'facto'], ['de', 'jure'], ['et', 'al'], ['ad', 'hoc'],
    ['a', 'priori'], ['a', 'posteriori'], ['per', 'se'], ['vice', 'versa'],
    ['status', 'quo'], ['in', 'situ'], ['in', 'vitro'], ['in', 'vivo'],
    ['alma', 'mater'], ['a', 'cappella'],
  ];

  function isUnknown(t, idx, tokens, text, vocab) {
    // Tokens that count for code-switching density. Punctuation fragments,
    // known Norwegian words (either dialect), recognized typos, and proper
    // nouns (handled by nb-propernoun-guard and existing isLikelyProperNoun
    // path) are all NOT unknown.
    if (t.word.length < 2) return false;
    if (EN_DENSITY_WORDS.has(t.word)) return true;
    // Use the curated (lexicon-only) accept-set, NOT the Ordbank-merged
    // validWords: the permissive Ordbank list carries loanwords (moment,
    // senior, software) that would fragment an English code-switch run below
    // the density window, so the run goes undetected and downstream typo
    // rules then mis-correct the English words (give→gave, project→prosjekt).
    const validWords = vocab.curatedValidWords || vocab.validWords;
    if (validWords && typeof validWords.has === 'function' && validWords.has(t.word)) return false;
    const sisterValidWords = vocab.sisterValidWords;
    if (sisterValidWords && typeof sisterValidWords.has === 'function' && sisterValidWords.has(t.word)) return false;
    const typoFix = vocab.typoFix;
    if (typoFix && typeof typoFix.has === 'function' && typoFix.has(t.word)) return false;
    if (isLikelyProperNoun(t, idx, tokens, text)) return false;
    return true;
  }

  const rule = {
    id: 'codeswitch',
    languages: ['nb', 'nn'],
    priority: 1,
    exam: {
      safe: true,
      reason: "Token-level codeswitch token correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: 'Tett klynge av ord som ikke er norske — sannsynligvis sitat eller fremmedspråk.',
    check(ctx) {
      const { tokens, text, vocab } = ctx;
      // Belt-and-braces: core initializes ctx.suppressed, but preserve the
      // invariant locally in case a future runner change drifts.
      ctx.suppressed = ctx.suppressed || new Set();
      if (!tokens) return [];

      // ── Foreign-run pass (v3.0.136) — no MIN_TOKENS gate: short inputs
      // contain short title runs too («Hun så In the Mouth of Madness»).
      const isPN = (j) => j >= 0 && j < tokens.length &&
        isLikelyProperNoun(tokens[j], j, tokens, text);
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        // (a) name/title connectors adjacent to a capitalized mid-sentence
        //     token: «Order of the British Empire», «Región de Magallanes».
        if (RUN_CONNECTORS.has(t.word) && (isPN(i - 1) || isPN(i + 1))) {
          ctx.suppressed.add(i);
          continue;
        }
        // (b) English possessive inside a name run: «His Master's Voice»,
        //     «Docker's Guild». The possessive token itself is capitalized
        //     AND a neighbor is a capitalized NON-Norwegian word («Voice»,
        //     «Guild», «His»). The Norwegian-validity test keeps the rule's
        //     own coaching cases firing: «Mari's PC» has a valid-Norwegian
        //     neighbor (pc), so it is NOT suppressed.
        if (/['’]s$/.test(t.word) && /^[A-ZÆØÅ]/.test(t.display)) {
          const validWords = vocab.validWords;
          const sisterValidWords = vocab.sisterValidWords;
          const isForeignCap = (j) => {
            if (!isPN(j)) return false;
            const w = tokens[j].word;
            if (validWords && typeof validWords.has === 'function' && validWords.has(w)) return false;
            if (sisterValidWords && typeof sisterValidWords.has === 'function' && sisterValidWords.has(w)) return false;
            return true;
          };
          if (isForeignCap(i - 1) || isForeignCap(i + 1)) ctx.suppressed.add(i);
        }
      }
      // (c) fixed foreign phrases («rock and roll», «de facto», «heavy
      //     metal») — suppress every token of a verbatim lowercase match.
      for (const phrase of FIXED_FOREIGN_PHRASES) {
        for (let i = 0; i + phrase.length <= tokens.length; i++) {
          let ok = true;
          for (let k = 0; k < phrase.length; k++) {
            if (tokens[i + k].word !== phrase[k]) { ok = false; break; }
          }
          if (ok) for (let k = 0; k < phrase.length; k++) ctx.suppressed.add(i + k);
        }
      }

      // Short inputs never activate the window — Pitfall 8 guard.
      if (tokens.length < MIN_TOKENS) return [];
      if (tokens.length < WINDOW_SIZE) return [];

      // Precompute unknown flags per token — O(n).
      const unknown = new Array(tokens.length);
      for (let i = 0; i < tokens.length; i++) {
        unknown[i] = isUnknown(tokens[i], i, tokens, text, vocab);
      }

      // Sliding window scan. When any window holds >= UNKNOWN_THRESHOLD
      // unknowns, add every token index inside that window to suppressed.
      // Windows overlap; the Set naturally de-dupes.
      for (let i = 0; i <= tokens.length - WINDOW_SIZE; i++) {
        let count = 0;
        for (let j = i; j < i + WINDOW_SIZE; j++) {
          if (unknown[j]) count++;
        }
        if (count >= UNKNOWN_THRESHOLD) {
          for (let j = i; j < i + WINDOW_SIZE; j++) ctx.suppressed.add(j);
        }
      }

      return []; // suppression-only rule emits no findings.
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
