/**
 * Spell-check rule: quotation-suppression pre-pass (priority 3).
 *
 * Phase 6 / INFRA-05. Suppression-only rule -- emits NO findings, only
 * populates ctx.suppressedFor.structural. Scans the text for matching
 * quote pairs and marks every token whose [start, end) falls inside a
 * quote span. Structural/register rules (priority 60+) honor this set;
 * token-local grammar rules (priority 10-55) do NOT check it.
 *
 * Supported quote pairs (greedy pairing for straight doubles):
 *   " ... "   (straight double quotes)
 *   << ... >>  (guillemets)
 *   " ... "   (English typographic)
 *   ,, ... "  (German/Nordic typographic)
 *
 * The rule never surfaces to the popover and never emits findings.
 * The severity field is required by the explain-contract gate.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  const QUOTE_PAIRS = [
    ['“', '”'],   // " " English typographic
    ['„', '”'],   // „ " German/Nordic typographic
    ['«', '»'],   // « » guillemets
    ['"', '"'],             // straight double quotes (greedy pairing)
  ];

  const rule = {
    id: 'quotation-suppression',
    languages: ['nb', 'nn', 'en', 'de', 'es', 'fr'],
    priority: 3,
    exam: {
      safe: true,
      reason: "Suppression scaffolding (no user-visible finding); inert in exam mode",
      category: "spellcheck",
    },
    severity: 'error',
    explain: () => ({ nb: 'Sitat-undertrykkelse.', nn: 'Sitat-undertrykkjing.' }),
    check(ctx) {
      const { text, tokens } = ctx;
      if (!text || !tokens || tokens.length === 0) return [];

      // Ensure suppressedFor.structural exists (belt-and-braces).
      if (!ctx.suppressedFor) ctx.suppressedFor = {};
      if (!ctx.suppressedFor.structural) ctx.suppressedFor.structural = new Set();

      // Collect all quoted spans as [start, end) character ranges.
      const spans = [];
      for (const [open, close] of QUOTE_PAIRS) {
        let searchFrom = 0;
        while (searchFrom < text.length) {
          const openIdx = text.indexOf(open, searchFrom);
          if (openIdx === -1) break;
          const closeIdx = text.indexOf(close, openIdx + open.length);
          if (closeIdx === -1) break;
          // Character range: first char after opening quote to closing quote (exclusive).
          spans.push([openIdx + open.length, closeIdx]);
          searchFrom = closeIdx + close.length;
        }
      }

      if (spans.length === 0) return [];

      // Mark token indices whose [start, end) falls entirely within any quoted span.
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        for (const [spanStart, spanEnd] of spans) {
          if (tok.start >= spanStart && tok.end <= spanEnd) {
            ctx.suppressedFor.structural.add(i);
            break;
          }
        }
      }

      return [];  // Pre-pass: never emits findings.
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
