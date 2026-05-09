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

  function isUnknown(t, idx, tokens, text, vocab) {
    // Tokens that count for code-switching density. Punctuation fragments,
    // known Norwegian words (either dialect), recognized typos, and proper
    // nouns (handled by nb-propernoun-guard and existing isLikelyProperNoun
    // path) are all NOT unknown.
    if (t.word.length < 2) return false;
    const validWords = vocab.validWords;
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

      // Short inputs never activate the window — Pitfall 8 guard.
      if (!tokens || tokens.length < MIN_TOKENS) return [];
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
