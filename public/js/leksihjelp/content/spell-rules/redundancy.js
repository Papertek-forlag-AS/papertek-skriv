/**
 * Spell-check rule: redundancy / pleonasm detection (REG-03, priority 70).
 *
 * Phase 6. Data-driven rule that flags redundant phrases (e.g. "return back",
 * "free gift") across all supported languages. Sources data from vocab-seam
 * phrasebank; falls back to inline SEED_REDUNDANCY when the bank is absent.
 *
 * Severity: hint (P3 grey dotted underline).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // TEMPORARY: remove after papertek-vocabulary phrasebank PR lands.
  const SEED_REDUNDANCY = {
    en: [
      { trigger: 'return back', suggestion: 'return' },
      { trigger: 'free gift', suggestion: 'gift' },
      { trigger: 'future plans', suggestion: 'plans' },
      { trigger: 'past history', suggestion: 'history' },
      { trigger: 'added bonus', suggestion: 'bonus' },
      { trigger: 'close proximity', suggestion: 'proximity' },
      { trigger: 'advance planning', suggestion: 'planning' },
      { trigger: 'basic fundamentals', suggestion: 'fundamentals' },
      { trigger: 'end result', suggestion: 'result' },
      { trigger: 'final outcome', suggestion: 'outcome' },
      { trigger: 'each and every', suggestion: 'each / every' },
      { trigger: 'new innovation', suggestion: 'innovation' },
      { trigger: 'brief moment', suggestion: 'moment' },
      { trigger: 'unexpected surprise', suggestion: 'surprise' },
    ],
    nb: [
      { trigger: 'gratis gave', suggestion: 'gave' },
      { trigger: 'fremtidige planer', suggestion: 'planer' },
      { trigger: 'gjenta om igjen', suggestion: 'gjenta' },
      { trigger: 'ekstra bonus', suggestion: 'bonus' },
    ],
    nn: [
      { trigger: 'gratis gåve', suggestion: 'gåve' },
      { trigger: 'framtidige planar', suggestion: 'planar' },
      { trigger: 'gjenta om igjen', suggestion: 'gjenta' },
      { trigger: 'ekstra bonus', suggestion: 'bonus' },
    ],
    de: [
      { trigger: 'freies Geschenk', suggestion: 'Geschenk' },
      { trigger: 'Endresultat', suggestion: 'Resultat' },
    ],
    es: [
      { trigger: 'regalo gratis', suggestion: 'regalo' },
      { trigger: 'planes futuros', suggestion: 'planes' },
      { trigger: 'resultado final', suggestion: 'resultado' },
    ],
    fr: [
      { trigger: 'cadeau gratuit', suggestion: 'cadeau' },
      { trigger: 'plans futurs', suggestion: 'plans' },
    ],
  };

  const rule = {
    id: 'redundancy',
    languages: ['nb', 'nn', 'en', 'de', 'es', 'fr'],
    priority: 70,
    exam: {
      safe: true,
      reason: "Token-level phrase-level redundancy correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'hint',
    explain: function (finding) {
      return {
        nb: 'Kanskje — <em>' + escapeHtml(finding.original) + '</em> er overflodig. Vurder <em>' + escapeHtml(finding.fix) + '</em>.',
        nn: 'Kanskje — <em>' + escapeHtml(finding.original) + '</em> er overflodig. Vurder <em>' + escapeHtml(finding.fix) + '</em>.',
      };
    },
    check(ctx) {
      // Resolve redundancy phrases: prefer vocab-seam data, fall back to seed.
      let phrases = ctx.vocab.redundancyPhrases;
      if (!phrases || phrases.length === 0) {
        const langPhrases = SEED_REDUNDANCY[ctx.lang];
        phrases = langPhrases || [];
      }
      if (!phrases || phrases.length === 0) return [];
      if (!ctx.sentences) return [];

      const findings = [];

      for (const sentence of ctx.sentences) {
        const sentLower = sentence.text.toLowerCase();

        for (const entry of phrases) {
          if (!entry.trigger) continue;
          const suggestion = entry.suggestion || entry.fix;
          if (!suggestion) continue;
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
                rule_id: 'redundancy',
                start: absStart,
                end: absEnd,
                original: ctx.text.slice(absStart, absEnd),
                fix: suggestion,
                message: entry.trigger + ' → ' + suggestion,
                severity: 'hint',
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
