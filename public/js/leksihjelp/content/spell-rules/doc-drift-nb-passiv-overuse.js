/**
 * Document-drift rule: NB s-passive overuse hint (priority 205).
 *
 * Phase 19 Plan 02 — DEBT-04. When a NB text contains more than 3
 * non-deponent s-passive forms (skrives, behandles, etc.), each instance
 * gets an informational hint suggesting active voice for clarity.
 *
 * Deponent verbs (finnes, synes, lykkes) are excluded from the count
 * because they are not stylistic passives — they are lexicalised forms
 * with no active counterpart.
 *
 * Rule ID: 'doc-drift-nb-passiv-overuse'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  const OVERUSE_THRESHOLD = 3; // flag when count > 3 (i.e. 4+)

  const rule = {
    id: 'doc-drift-nb-passiv-overuse',
    kind: 'document',
    languages: ['nb'],
    priority: 205,
    // exam-audit 33-03: stays safe=false — Doc-drift detection: passive-overuse heuristic across whole document
    exam: {
      safe: false,
      reason: "Stays safe=false (doc-drift-nb-passiv-overuse) — Doc-drift detection: passive-overuse heuristic across whole document",
      category: "grammar-lookup",
    },
    severity: 'hint',

    explain(/* finding */) {
      return {
        nb: 'Teksten bruker mange s-passivformer. Aktiv form gir ofte klarere sprak.',
        nn: 'Teksten brukar mange s-passivformer. Aktiv form gir ofte klarare sprak.',
      };
    },

    check(/* ctx */) {
      // No-op in pass-1. Document-level only.
      return [];
    },

    checkDocument(ctx, findings) {
      const { tokens } = ctx;
      const sPassivForms = ctx.vocab ? ctx.vocab.sPassivForms : null;
      if (!sPassivForms || sPassivForms.size === 0) return [];

      // Collect non-deponent s-passive token positions
      const sPassiveTokens = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const info = sPassivForms.get(t.word);
        if (info && !info.isDeponent) {
          sPassiveTokens.push(t);
        }
      }

      if (sPassiveTokens.length <= OVERUSE_THRESHOLD) return [];

      // Build a set of already-flagged spans from pass-1 to avoid double-flagging
      const flaggedSpans = new Set();
      for (const f of findings) {
        flaggedSpans.add(f.start + ':' + f.end);
      }

      const out = [];
      const count = sPassiveTokens.length;
      for (const t of sPassiveTokens) {
        if (flaggedSpans.has(t.start + ':' + t.end)) continue;
        out.push({
          rule_id: 'doc-drift-nb-passiv-overuse',
          start: t.start,
          end: t.end,
          original: t.raw,
          fix: null,
          message: 'Teksten har ' + count + ' s-passivformer. Vurder aktiv form for klarere sprak.',
          severity: 'hint',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
