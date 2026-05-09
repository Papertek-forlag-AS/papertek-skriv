/**
 * Spell-check rule: French preposition contraction (priority 15).
 *
 * French prepositions 'de' and 'à' contract with articles 'le' and 'les'.
 * - de + le = du
 * - de + les = des
 * - à + le = au
 * - à + les = aux
 *
 * Rule ID: 'fr-preposition'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const CONTRACTIONS = {
    'de': { 'le': 'du', 'les': 'des' },
    'à': { 'le': 'au', 'les': 'aux' },
    'a': { 'le': 'au', 'les': 'aux' }, // common typo: missing accent
  };

  const rule = {
    id: 'fr-preposition',
    languages: ['fr'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (fr-preposition) — Chrome native parity confirmed in 33-03 audit: FR preposition swap is single-token lookup; no multi-token edit",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `På fransk skal <em>${escapeHtml(finding.prep)}</em> og <em>${escapeHtml(finding.art)}</em> trekkes sammen til <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `På fransk skal <em>${escapeHtml(finding.prep)}</em> og <em>${escapeHtml(finding.art)}</em> trekkjast saman til <em>${escapeHtml(finding.fix)}</em>.`,
      en: `In French, <em>${escapeHtml(finding.prep)}</em> and <em>${escapeHtml(finding.art)}</em> must be contracted to <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        if (CONTRACTIONS[t.word] && next && CONTRACTIONS[t.word][next.word]) {
          const fix = CONTRACTIONS[t.word][next.word];
          out.push({
            rule_id: 'fr-preposition',
            priority: rule.priority,
            start: t.start,
            end: next.end,
            original: `${t.display} ${next.display}`,
            prep: t.display,
            art: next.display,
            fix: matchCase(t.display, fix),
            message: `Sammenslåing: "${fix}"`,
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
