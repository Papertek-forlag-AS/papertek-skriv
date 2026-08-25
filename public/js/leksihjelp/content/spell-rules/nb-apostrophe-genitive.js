/**
 * Spell-check rule: NB/NN apostrophe-genitive detection (priority 8).
 *
 * Flags English-style apostrophe before genitive -s:
 *   "katten's mat" → "kattens mat"
 *
 * Special handling:
 * - Words whose stem ends in s, x, or z get the s-less fix shape per
 *   Språkrådet (apostrophe only): "Lars's" → "Lars'", "Marx's" → "Marx'".
 *   The fully correct form "Vesaas' bok" (no trailing s in source) stays
 *   silent because the trailing-`<apo>s` guard below only matches when the
 *   user wrote "<stem>'s".
 *
 * Exceptions (no flag):
 * - English contractions: it's, he's, she's, that's, what's, let's,
 *   there's, here's, who's, where's, how's, one's
 *
 * Phase 50-01 also extended tokenizer (spell-check-core.js WORD_RE) to
 * accept U+2019 (curly apostrophe — macOS/iOS/Word smart-quote default)
 * as a word-internal joiner, and the apoIdx lookup below honors both
 * U+0027 (ASCII) and U+2019.
 *
 * Rule ID: 'nb-apostrophe-genitive'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // English contractions that should never be flagged.
  // Lowercased for comparison against token.word.
  const ENGLISH_CONTRACTIONS = new Set([
    "it's", "he's", "she's", "that's", "what's", "let's",
    "there's", "here's", "who's", "where's", "how's", "one's",
  ]);

  const rule = {
    id: 'nb-apostrophe-genitive',
    languages: ['nb', 'nn'],
    priority: 8,
    exam: {
      safe: true,
      reason: "Orthographic apostrophe correction; single-token; at browser-native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'warning',
    explain: (finding) => {
      const orig = escapeHtml(finding.original);
      const fix = escapeHtml(finding.fix);
      const text =
        `I norsk skriver vi eieform uten apostrof: <em>${fix}</em>, ` +
        `ikke <em>${orig}</em>. Apostrof før <em>-s</em> er engelsk ` +
        `(f.eks. "the cat's food"). Unntak: etter s, x og z bruker vi ` +
        `apostrof (<em>Vesaas' forfatterskap</em>).`;
      return { nb: text, nn: text };
    },
    check(ctx) {
      const { tokens, cursorPos, suppressed } = ctx;
      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        const w = t.word;  // lowercase
        // Must contain exactly one apostrophe followed by "s" at the end.
        // Phase 50-01 bug 1: accept both ASCII apostrophe (U+0027) and right
        // single quotation mark (U+2019, the macOS/iOS/Word smart-quote
        // auto-replacement). WORD_RE in spell-check-core.js already treats
        // both as word-internal joiners, so the token comes through whole.
        let apoIdx = w.indexOf("'");
        if (apoIdx === -1) apoIdx = w.indexOf("’");
        if (apoIdx < 0) continue;
        const apoChar = w[apoIdx];
        if (w !== w.slice(0, apoIdx) + apoChar + 's') continue;
        // The part before the apostrophe.
        if (apoIdx === 0) continue;  // bare "'s" — skip

        // Skip English contractions (compare against normalised ASCII-apostrophe form).
        const wAscii = apoChar === "'" ? w : w.slice(0, apoIdx) + "'" + w.slice(apoIdx + 1);
        if (ENGLISH_CONTRACTIONS.has(wAscii)) continue;

        // Språkrådet handling: if the stem ends in s, x, or z, the CORRECT
        // genitive form is just the apostrophe with no trailing s (e.g.
        // "Vesaas' forfatterskap", "Marx' teori"). Phase 50-01 bug 2:
        // previously hard-skipped these, which let `Lars's bursdag` silently
        // pass. Now we still flag them but with the s-less fix shape.
        const stem = w.slice(0, apoIdx);
        const lastChar = stem[stem.length - 1];
        const sxzStem = (lastChar === 's' || lastChar === 'x' || lastChar === 'z');

        // Build the fix:
        // - sxz stem: drop the trailing s ("Lars's" → "Lars'")
        // - other:    drop the apostrophe ("katten's" → "kattens")
        const fixLower = sxzStem ? stem + "'" : stem + 's';
        const fix = matchCase(t.display, fixLower);
        out.push({
          rule_id: 'nb-apostrophe-genitive',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix,
          message: `Feil apostrof i eieform: "${t.display}" → "${fix}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
