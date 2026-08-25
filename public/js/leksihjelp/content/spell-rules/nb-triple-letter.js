/**
 * Spell-check rule: triple-letter typo detection (priority 45).
 *
 * Phase 18. Flags words containing three or more consecutive identical
 * characters — a common keyboard typo where a key is held too long:
 *   "bakkke" -> "bakke"
 *   "fulll" -> "full"
 *
 * Phase 50-05: iterative collapse depths (3→2 AND 3→1) + curated
 * anglicism / English-loanword fallback. The four-tier lookup order is:
 *   1. depth-2 collapse hits NB/NN validWords  (preserves prior behavior;
 *      handles "skikkkelig" → "skikkelig")
 *   2. depth-1 collapse hits NB/NN validWords  (NEW: handles "hjeeem" → "hjem")
 *   3. depth-2 collapse hits ANGLICISM_TRIPLE_STEMS  (NEW: "smoooothie" → "smoothie")
 *   4. depth-1 collapse hits ANGLICISM_TRIPLE_STEMS  (NEW fallback)
 * Ordering favors NB hits first, and within a source favors the longer
 * (depth-2) suggestion — students typed extra letters, not too few.
 *
 * The ANGLICISM_TRIPLE_STEMS list is inlined here (Path A from Plan 50-05
 * — curated, install-size-negligible, no new seam param). Pattern matches
 * Phase 47 Track E + Phase 48 Wave B-6 (curated lists for student typo
 * targets); the list lives in the rule file because it's rule-specific.
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
  const TRIPLE_GLOBAL_RE_D2 = /(.)\1\1+/g;  // depth 2: 3+ run -> 2
  const TRIPLE_GLOBAL_RE_D1 = /(.)\1\1+/g;  // depth 1: 3+ run -> 1 (replacement differs)

  // Curated English/loanword stems commonly typed by NB students with held
  // keys producing 3+ runs. Each entry is a short common loanword whose
  // canonical form has an internal `oo`/`ee` repeat — exactly the shape that
  // a key-held-too-long typo collapses to via depth-2.
  const ANGLICISM_TRIPLE_STEMS = new Set([
    'smoothie', 'cookie', 'boots', 'boom', 'mood', 'noon', 'cool',
    'pool', 'book', 'look', 'seek', 'feet', 'meet', 'feel', 'keep',
    'sleep', 'screen', 'green', 'between',
  ]);

  function collapseTo(word, n) {
    if (n === 2) return word.replace(TRIPLE_GLOBAL_RE_D2, '$1$1');
    if (n === 1) return word.replace(TRIPLE_GLOBAL_RE_D1, '$1');
    return word;
  }

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
      nb: `<em>${escapeHtml(finding.original)}</em> har trippel bokstav — prøv <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `<em>${escapeHtml(finding.original)}</em> har trippel bokstav — prøv <em>${escapeHtml(finding.fix)}</em>.`,
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

        const w = t.word;
        const d2 = collapseTo(w, 2);
        const d1 = collapseTo(w, 1);

        // Four-tier lookup. depth-2 + validWords first (longer suggestion,
        // NB-first); depth-1 second; then anglicism fallback in same order.
        let suggestion = null;
        if (d2 !== w && validWords.has(d2)) suggestion = d2;
        else if (d1 !== w && validWords.has(d1)) suggestion = d1;
        else if (d2 !== w && ANGLICISM_TRIPLE_STEMS.has(d2)) suggestion = d2;
        else if (d1 !== w && ANGLICISM_TRIPLE_STEMS.has(d1)) suggestion = d1;

        if (!suggestion) continue;

        out.push({
          rule_id: 'nb-triple-letter',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: matchCase(t.display, suggestion),
          message: `Trippel bokstav: "${t.display}" -> "${suggestion}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
