/**
 * Spell-check rule: curated typo lookup (priority 40).
 *
 * Looks up the token in the curated typoFix Map (sourced from the Papertek
 * vocabulary `typos` arrays). Skips tokens that are themselves valid words
 * to avoid false-positive corrections on legitimate spellings that happen
 * to also appear as typos for another word.
 *
 * Rule ID: 'typo' — preserved verbatim from pre-INFRA-03 inline rule.
 *
 * Co-fires with the fuzzy rule (priority 50) on the same span. dedupeOverlapping
 * keeps THIS finding (lower priority = runs first = wins overlap), so curated
 * suggestions take precedence over fuzzy guesses on the same token.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const GLOBAL_WHITELIST = new Set(['will', 'die', 'der', 'das', 'den', 'ein', 'eine']);

  const rule = {
    id: 'typo',
    languages: ['nb', 'nn', 'en', 'de', 'es', 'fr'],
    priority: 40,
    exam: {
      safe: true,
      reason: "Token-level curated typo correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `<em>${escapeHtml(finding.original)}</em> er en vanlig skrivefeil — prøv <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `<em>${escapeHtml(finding.original)}</em> er ein vanleg skrivefeil — prøv <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      const validWords = vocab.validWords || new Set();
      const sisterValidWords = vocab.sisterValidWords || new Set(); // Phase 4 / SC-03
      const typoFix = vocab.typoFix || new Map();
      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue; // Phase 4 / SC-02 + SC-04

        if (GLOBAL_WHITELIST.has(t.word)) continue;
        // Phase 4 / SC-03 + Phase 05.1 Gap D co-existence: the cross-dialect
        // early-exit is preserved as a data-gap shield. Tokens in
        // sisterValidWords fall into two buckets: (a) genuine cross-dialect
        // markers captured by the nb-dialect-mix CROSS_DIALECT_MAP (priority
        // 35 — wins over this rule via dedupeOverlapping) and (b)
        // morphologically shared forms missing from the current dialect's
        // data (kjøkkenet, klokka, kaldt — still genuine Norwegian). The
        // early-exit keeps Phase 4's silent-tolerance shield for bucket (b);
        // dedupeOverlapping surfaces bucket (a) as dialect-mix.
        if (sisterValidWords.has(t.word)) continue;
        if (typoFix.has(t.word) && !validWords.has(t.word)) {
          const correct = typoFix.get(t.word);
          out.push({
            rule_id: 'typo',
            priority: rule.priority,
            start: t.start,
            end: t.end,
            original: t.display,
            fix: matchCase(t.display, correct),
            message: `Skrivefeil: "${t.display}" → "${correct}"`,
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
