/**
 * Spell-check rule: collocation error detection (REG-02, priority 65).
 *
 * Phase 6. Data-driven rule that flags wrong-verb bigrams and other
 * collocation errors in English. Sources data from vocab-seam collocationbank;
 * falls back to inline SEED_COLLOCATIONS when the bank is absent.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Phase 42: SEED_COLLOCATIONS removed — collocationbank in
  // papertek-vocabulary is now the canonical source for all six languages
  // (verified 2026-05-06: 34 EN, 13 NB, 22 DE, 29 ES, 33 FR entries; NN
  // falls back to NB via the lang-resolution below). The rule reads
  // ctx.vocab.collocations populated by the vocab seam.

  const rule = {
    id: 'collocation',
    languages: ['en', 'nb', 'nn', 'de', 'es', 'fr'],
    priority: 65,
    exam: {
      safe: true,
      reason: "Lexical collocation correction at lookup level; at-or-below browser native parity",
      category: "spellcheck",
    },
    severity: 'warning',
    explain: function (finding) {
      return {
        nb: 'Usikker — <em>' + escapeHtml(finding.original) + '</em> er feil kollokasjon. Bruk <em>' + escapeHtml(finding.fix) + '</em>.',
        nn: 'Usikker — <em>' + escapeHtml(finding.original) + '</em> er feil kollokasjon. Bruk <em>' + escapeHtml(finding.fix) + '</em>.',
      };
    },
    check(ctx) {
      // Phase 42: vocab-seam is now the only source. NN doesn't ship its own
      // collocationbank yet, but the seam resolves NN context against NB
      // collocations upstream (see vocab seam loadVocab fallback).
      const collocations = ctx.vocab && ctx.vocab.collocations;
      if (!collocations || collocations.length === 0) return [];
      if (!ctx.sentences) return [];

      const findings = [];

      for (const sentence of ctx.sentences) {
        const sentLower = sentence.text.toLowerCase();

        for (const entry of collocations) {
          if (!entry.trigger || !entry.fix) continue;
          const triggerLower = entry.trigger.toLowerCase();
          let searchStart = 0;

          while (searchStart < sentLower.length) {
            const idx = sentLower.indexOf(triggerLower, searchStart);
            if (idx === -1) break;

            const absStart = sentence.start + idx;
            const absEnd = absStart + entry.trigger.length;

            // Check structural suppression for any token in the match span.
            let suppressed = false;
            if (ctx.suppressedFor && ctx.suppressedFor.structural) {
              for (let ti = 0; ti < ctx.tokens.length; ti++) {
                const tok = ctx.tokens[ti];
                if (tok.end > absStart && tok.start < absEnd && ctx.suppressedFor.structural.has(ti)) {
                  suppressed = true;
                  break;
                }
              }
            }

            if (!suppressed) {
              findings.push({
                rule_id: 'collocation',
                start: absStart,
                end: absEnd,
                original: ctx.text.slice(absStart, absEnd),
                fix: entry.fix,
                message: entry.trigger + ' → ' + entry.fix,
                severity: 'warning',
              });
            }

            searchStart = idx + 1;
          }
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
