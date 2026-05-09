/**
 * Spell-check rule: NN finite s-passive without modal verb (priority 25).
 *
 * Phase 19 Plan 02 — DEBT-04. Nynorsk restricts s-passive to infinitive
 * form after modal verbs (kan, skal, ma, etc.). Finite s-passive ("Boka
 * lesast av mange") is an error — students should use bli/verte-passive.
 *
 * St-verbs / deponent verbs (synast, lykkast) are excluded — they are
 * lexicalised and not passive constructions.
 *
 * Bli/verte + participle is accepted as valid NN passive (basic acceptance;
 * full gender/number participle agreement is deferred to a future phase).
 *
 * Rule ID: 'nn_passiv_s'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // NN modal verbs that license s-passive infinitive.
  // 'vil' is EXCLUDED per Sprakradet: NN 'vil' = personal will, not future.
  const NN_PASSIV_MODALS = new Set([
    'kan', 'kunna', 'kunne',
    'ma', 'matte',
    'skal', 'skulle',
    'bor', 'burde',
  ]);

  // Subject pronouns that can sit between modal and s-passive in inversion:
  // "Kan ein skrivast ...?" → modal + pronoun + s-passive = valid.
  const SUBJECT_PRONOUNS = new Set([
    'eg', 'du', 'han', 'ho', 'det', 'den', 'vi', 'de', 'dei',
    'ein', 'man',
  ]);

  const rule = {
    id: 'nn_passiv_s',
    languages: ['nn'],
    priority: 25,
    // exam-audit 33-03: stays safe=false — Cross-token passive-s detection; multi-token reasoning, not single-form lookup
    exam: {
      safe: false,
      reason: "Stays safe=false (nb-nn-passiv-s) — Cross-token passive-s detection; multi-token reasoning, not single-form lookup",
      category: "grammar-lookup",
    },
    severity: 'error',

    explain(/* finding */) {
      const esc = escapeHtml || (s => s);
      return {
        nb: 'S-passiv kan bare brukes i infinitiv etter modalverb pa nynorsk. Bruk bli/verte-passiv i stedet.',
        nn: 'S-passiv kan berre brukast i infinitiv etter modalverb pa nynorsk. Bruk bli/verte-passiv i staden.',
      };
    },

    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const sPassivForms = vocab.sPassivForms || new Map();
      if (sPassivForms.size === 0) return [];

      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        const info = sPassivForms.get(t.word);
        if (!info) continue;

        // Deponent / st-verbs: never flag (synast, lykkast are lexicalised)
        if (info.isDeponent) continue;

        // Check if preceded by a modal verb (directly or with pronoun inversion)
        const prev = tokens[i - 1];
        const prev2 = tokens[i - 2];
        const directModal = prev && NN_PASSIV_MODALS.has(prev.word);
        const invertedModal = prev2 && prev &&
          NN_PASSIV_MODALS.has(prev2.word) && SUBJECT_PRONOUNS.has(prev.word);

        if (directModal || invertedModal) continue; // valid: modal + s-passive infinitive

        out.push({
          rule_id: 'nn_passiv_s',
          start: t.start,
          end: t.end,
          original: t.raw,
          fix: null,
          message: 'S-passiv utan modalverb er feil pa nynorsk',
          severity: 'error',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
