/**
 * Spell-check rule: French prepositional contraction (priority 15).
 *
 * Flags missing mandatory contractions of prepositions with articles:
 *   de le  -> du       a le  -> au
 *   de les -> des      a les -> aux
 *
 * NOTE: le/la + vowel elision (l') is handled by fr-elision.js (Plan 02).
 *
 * Rule ID: 'fr-contraction'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Preposition + article -> contracted form
  const CONTRACTIONS = {
    'de le': 'du',
    'a le': 'au',
    'de les': 'des',
    'a les': 'aux',
  };

  const PREPOSITIONS = new Set(['de', 'a']);
  const ARTICLES = new Set(['le', 'les']);

  const rule = {
    id: 'fr-contraction',
    languages: ['fr'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (fr-contraction) — Chrome native parity confirmed in 33-03 audit: FR contraction (de+le→du) is deterministic single-token lookup",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Bruk samantrekning <em>${escapeHtml(finding.fix)}</em> i staden for <em>${escapeHtml(finding.original)}</em>.`,
      nn: `Bruk samantrekking <em>${escapeHtml(finding.fix)}</em> i staden for <em>${escapeHtml(finding.original)}</em>.`,
      en: `Use the contraction <em>${escapeHtml(finding.fix)}</em> instead of <em>${escapeHtml(finding.original)}</em>.`,
    }),
    check(ctx) {
      const { tokens, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= next.end + 1) continue;

        const prep = t.word;
        const art = next.word;

        if (!PREPOSITIONS.has(prep) || !ARTICLES.has(art)) continue;

        const key = prep + ' ' + art;
        const contracted = CONTRACTIONS[key];
        if (!contracted) continue;

        out.push({
          rule_id: 'fr-contraction',
          priority: rule.priority,
          start: t.start,
          end: next.end,
          original: `${t.display} ${next.display}`,
          fix: contracted,
          message: `Samantrekning: "${contracted}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
