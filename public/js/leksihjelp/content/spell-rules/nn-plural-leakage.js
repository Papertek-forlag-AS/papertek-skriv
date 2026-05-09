/**
 * Spell-check rule: NN plural leakage detection (priority 39).
 *
 * Flags NB-only definite-plural noun forms used in an NN document context.
 * Fires when a token is valid in NB (sisterValidWords) but NOT valid in NN
 * (validWords) and ends in a typical NB definite-plural suffix (-ene, -erne,
 * -enne) that would differ in NN (-ane, -arane, etc.).
 *
 * Complements dialect-mix (priority 35) which handles a curated set of
 * high-confidence cross-dialect pairs with auto-fix. This rule catches the
 * REMAINING NB-only noun plural forms that fall outside the curated map,
 * without auto-fix (we lack NN plural data to suggest the correct form).
 *
 * Skips words already covered by dialect-mix's NB_TO_NN map.
 *
 * Rule ID: 'nn-plural-leakage'.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // NB definite-plural suffixes that differ from NN (-ane/-ene split)
  const NB_PLURAL_RE = /(?:ene|erne|enne)$/;

  // Avoid double-flagging with dialect-mix rule — NB side of the curated map.
  // Keep in sync with nb-dialect-mix.js NB_TO_NN keys.
  const DIALECT_MIX_NB_KEYS = new Set([
    'jeg', 'hun', 'de', 'dere', 'ikke', 'bare', 'noen', 'noe', 'mye',
    'hva', 'hvor', 'hvordan', 'hvem', 'hvorfor', 'være', 'vært', 'ble',
    'mente', 'mener', 'mene', 'høre', 'hører', 'hørt', 'sier', 'vet',
    'bytt', 'hjem', 'hjemme', 'nå', 'sammen', 'gjør', 'gjøre', 'fikk',
  ]);

  const rule = {
    id: 'nn-plural-leakage',
    languages: ['nn'],
    priority: 39,
    severity: 'warning',
    exam: {
      safe: true,
      reason: "Cross-language noun-form lookup; single-token; same class as dialect-mix",
      category: "grammar-lookup",
    },
    explain: (finding) => {
      const msg = `<em>${escapeHtml(finding.original)}</em> er bokmålsform — bruk nynorskforma.`;
      return { nb: msg, nn: msg };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang, suppressed } = ctx;
      if (lang !== 'nn') return [];

      const nnValid = vocab.validWords || new Set();
      const sisterValid = vocab.sisterValidWords || new Set();
      const nbToNnNouns = vocab.nbToNnNouns || new Map();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        // Valid NN word — nothing to flag
        if (nnValid.has(t.word)) continue;

        // Not valid in NB either — not a leakage, probably a typo
        if (!sisterValid.has(t.word)) continue;

        // Already covered by dialect-mix curated map
        if (DIALECT_MIX_NB_KEYS.has(t.word)) continue;

        // Heuristic: only flag words with typical NB definite-plural suffixes
        if (!NB_PLURAL_RE.test(t.word)) continue;

        const xref = nbToNnNouns.get(t.word);
        const fix = xref ? xref.nnForm : null;

        out.push({
          rule_id: 'nn-plural-leakage',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix,
          message: fix
            ? `Bokmålsform: "${t.display}" → "${fix}"`
            : `Bokmålsform: "${t.display}" — bruk nynorskforma`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
