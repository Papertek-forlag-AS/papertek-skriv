/**
 * Spell-check rule: proper-noun + loan-word guard (priority 5).
 *
 * Phase 4 / SC-02. Suppression-only rule — emits NO findings, only mutates
 * ctx.suppressed with tokens that look like proper nouns or known loan
 * words. Four layers, each catches a pattern the existing core-level
 * `isLikelyProperNoun` helper misses:
 *
 *   1. LOAN_WORDS lookup   — curated Set of English/loan words commonly
 *                            typed by Norwegian learners inside NB/NN
 *                            text (foods, tech, social-media). Each entry
 *                            must NOT exist in NB/NN validWords (see
 *                            authoring rule below). These are the ones
 *                            that would otherwise get fuzzy-matched to a
 *                            Norwegian neighbor (brown→broen, burger→burgere).
 *
 *   2. All-caps tokens     — acronyms like NATO, NRK, UIO (length >= 3,
 *                            all uppercase). The existing isLikelyProperNoun
 *                            only checks first-char capitalization.
 *
 *   3. Hyphenated caps     — compounds like K-pop, SMS-melding where at
 *                            least one part is capitalized. Tokenization
 *                            splits on letters only, so each side is a
 *                            separate token; we catch the capitalized
 *                            component.
 *
 *   4. Consecutive-cap span — if both current token and either neighbor
 *                            are mid-sentence capitalized names, the
 *                            current token is part of a multi-word proper
 *                            noun (Anne Grethe, Oslo Universitetssykehus).
 *                            This catches names where the second/third
 *                            word isn't in validWords (e.g. Grethe).
 *
 * NOT redone here: the single-capitalized-mid-sentence case. The existing
 * fuzzy rule's `isLikelyProperNoun` guard already handles Oslo, Bergen,
 * Kristiansand, etc.
 *
 * Gender and modal-verb rules do NOT opt into suppression — they fire on
 * real Norwegian grammar patterns regardless. If a user writes "en
 * Kristiansand" (wrong-gender article before a proper noun), the gender
 * rule should STILL flag "en" even though this rule suppresses
 * Kristiansand. See spell-rules/README.md for the convention.
 *
 * AUTHORING RULE FOR LOAN_WORDS (Pitfall 3 in 04-RESEARCH.md):
 *   Each entry must NOT be in extension/data/{nb,nn}.json validWords. If a
 *   conflict is found, REMOVE the entry — the token is a legitimate
 *   Norwegian word and should not be silently suppressed. If the loan is
 *   also a legitimate Norwegian word (e.g. "set" as both English verb and
 *   Norwegian past participle), rely on isLikelyProperNoun / context
 *   instead.
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

  // Curated loan-word Set — 70 entries (Phase 4 seed). ASCII-only; lowercase.
  // Audited 2026-04-20 via Node probe: no entry is in NB or NN validWords.
  // If this list grows past ~400 entries, promote to a JSON sidecar so the
  // seam loads it (see 04-RESEARCH.md alternative table).
  const LOAN_WORDS = new Set([
    'smoothie', 'deadline', 'weekend', 'email', 'newsletter', 'podcast',
    'streaming', 'outfit', 'brunch', 'feedback', 'laptop', 'player',
    'coach', 'update', 'download', 'upload', 'software', 'hardware',
    'meeting', 'workshop', 'content', 'snack', 'lunch', 'muffin',
    'cookie', 'burger', 'salad', 'cocktail', 'barista', 'manager',
    'vlog', 'blog', 'tweet', 'feed', 'share', 'follow',
    'livestream', 'checkout', 'shopping', 'backup', 'account', 'cloud',
    'influencer', 'playlist', 'soundtrack', 'trailer', 'webinar', 'hoodie',
    'sneakers', 'jumpsuit', 'layout', 'brand', 'fitness', 'wellness',
    'freelance', 'homeoffice', 'template', 'tutorial', 'benchmark', 'budget',
    'bestseller', 'brown', 'label', 'peanut', 'milkshake', 'toast',
    'bacon', 'workflow', 'framework', 'keyword', 'pai'
  ]);

  function isAllCaps(word) {
    // Rejects single/double-letter tokens (too noisy) and tokens that
    // aren't cased at all (numbers, punctuation — but tokenizer already
    // filters those via \p{L}).
    if (!word || word.length < 3) return false;
    return word === word.toUpperCase() && word !== word.toLowerCase();
  }

  function isHyphenCap(display) {
    // Tokenizer strips hyphens, so this check will rarely fire on the
    // current token in isolation. It's here for defense-in-depth in case
    // a future tokenizer keeps hyphens or the `display` text is taken
    // from a wider source. Matches either "X-Capital" or "Capital-X" at
    // string boundaries.
    if (!display) return false;
    return /-[A-ZÆØÅ]/.test(display) || /[A-ZÆØÅ].*-/.test(display);
  }

  function isCap(tok) {
    if (!tok || !tok.display) return false;
    const c = tok.display[0];
    return c === c.toUpperCase() && c !== c.toLowerCase();
  }

  function isConsecutiveCapSpan(tok, idx, tokens, text) {
    // Current token must itself be capitalized (any position, not only
    // mid-sentence — an all-caps Span beginning with a name like "Anne"
    // at sentence start should still be suppressed if the next token is
    // also a name).
    if (!isCap(tok)) return false;

    // Previous or next token is also a likely mid-sentence proper noun.
    const prev = tokens[idx - 1];
    const next = tokens[idx + 1];
    if (prev && isCap(prev) && isLikelyProperNoun(prev, idx - 1, tokens, text)) return true;
    if (next && isCap(next) && isLikelyProperNoun(next, idx + 1, tokens, text)) return true;
    return false;
  }

  const rule = {
    id: 'propernoun-guard',
    languages: ['nb', 'nn'],
    priority: 5,
    exam: {
      safe: true,
      reason: "Token-level proper-noun guard correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: 'Egennavn eller lånord — stoppes fra å utløse skrivefeil.',
    check(ctx) {
      const { tokens, text } = ctx;
      ctx.suppressed = ctx.suppressed || new Set();
      if (!tokens) return [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        // Layer 1: curated loan word (t.word is already lowercased).
        if (LOAN_WORDS.has(t.word)) { ctx.suppressed.add(i); continue; }
        // Layer 2: all-caps acronym.
        if (isAllCaps(t.display)) { ctx.suppressed.add(i); continue; }
        // Layer 3: hyphenated compound with capitalized component.
        if (isHyphenCap(t.display)) { ctx.suppressed.add(i); continue; }
        // Layer 4: consecutive-capitalized span (Anne Grethe, Oslo
        // Universitetssykehus).
        if (isConsecutiveCapSpan(t, i, tokens, text)) { ctx.suppressed.add(i); continue; }
        // Single-capitalized-mid-sentence — DELIBERATELY NOT REDONE here.
        // The existing fuzzy rule's isLikelyProperNoun guard already
        // handles Oslo, Bergen, Kristiansand. This rule only adds
        // coverage for the cases that single check misses.
      }

      return []; // suppression-only rule emits no findings.
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
