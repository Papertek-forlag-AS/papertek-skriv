/**
 * Spell-check rule: triple-letter typo detection (priority 45).
 *
 * Phase 18. Flags words containing three or more consecutive identical
 * characters — a common keyboard typo where a key is held too long:
 *   "bakkke" -> "bakke"
 *   "fulll" -> "full"
 *
 * Collapses all triple+ runs to double, then checks if the collapsed
 * form is a known valid word. Only flags if the collapse produces a
 * valid word (otherwise it may be a different kind of error).
 *
 * Separate rule file per STATE.md Pitfall 8 — not a modification to
 * nb-typo-fuzzy.
 *
 * Rule ID: 'nb-triple-letter'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const TRIPLE_RE = /(.)\1\1+/;
  const TRIPLE_GLOBAL_RE = /(.)\1\1+/g;

  const rule = {
    id: 'nb-triple-letter',
    languages: ['nb', 'nn'],
    priority: 45,
    exam: {
      safe: true,
      reason: "Token-level triple-letter typo correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `<em>${escapeHtml(finding.original)}</em> har trippel bokstav — prov <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `<em>${escapeHtml(finding.original)}</em> har trippel bokstav — prov <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      const validWords = vocab.validWords || new Set();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (suppressed && suppressed.has(i)) continue;
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (validWords.has(t.word)) continue;
        if (!TRIPLE_RE.test(t.word)) continue;

        const collapsed = t.word.replace(TRIPLE_GLOBAL_RE, '$1$1');
        if (validWords.has(collapsed)) {
          out.push({
            rule_id: 'nb-triple-letter',
            priority: rule.priority,
            start: t.start,
            end: t.end,
            original: t.display,
            fix: matchCase(t.display, collapsed),
            message: `Trippel bokstav: "${t.display}" -> "${collapsed}"`,
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
