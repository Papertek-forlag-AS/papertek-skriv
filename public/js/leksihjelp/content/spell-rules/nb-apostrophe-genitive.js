/**
 * Spell-check rule: NB/NN apostrophe-genitive detection (priority 8).
 *
 * Flags English-style apostrophe before genitive -s:
 *   "katten's mat" → "kattens mat"
 *
 * Exceptions (no flag):
 * - Words ending in s, x, or z before the apostrophe — apostrophe IS
 *   correct per Språkrådet: "Vesaas' forfatterskap"
 * - English contractions: it's, he's, she's, that's, what's, let's,
 *   there's, here's, who's, where's, how's, one's
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
        const apoIdx = w.indexOf("'");
        if (apoIdx === -1) continue;
        if (w !== w.slice(0, apoIdx) + "'s") continue;
        // The part before the apostrophe.
        if (apoIdx === 0) continue;  // bare "'s" — skip

        // Skip English contractions.
        if (ENGLISH_CONTRACTIONS.has(w)) continue;

        // Språkrådet exception: if the stem ends in s, x, or z,
        // apostrophe is correct.
        const stem = w.slice(0, apoIdx);
        const lastChar = stem[stem.length - 1];
        if (lastChar === 's' || lastChar === 'x' || lastChar === 'z') continue;

        // Build the fix: remove the apostrophe → "katten's" → "kattens"
        const fixLower = stem + 's';
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
