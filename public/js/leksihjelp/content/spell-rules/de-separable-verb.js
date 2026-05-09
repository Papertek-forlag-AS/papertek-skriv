/**
 * Spell-check rule: German separable-verb split (DE-02, priority 69).
 *
 * Phase 8. In German main clauses, separable verbs must be split: the prefix
 * goes to the end and the stem occupies the V2 position.
 *
 *   Wrong:   "Ich aufstehe um sieben." (main clause — must split)
 *   Correct: "Ich stehe um sieben auf."
 *
 * In subordinate clauses the unsplit form is CORRECT (verb-final position):
 *   Correct: "dass ich aufstehe" — no flag.
 *
 * Detection: for each token, check if it's a known separable-verb unsplit form
 * (prefix from SEPARABLE_PREFIXES + finite stem). If so, verify it's in a
 * main clause and the prefix doesn't already appear as a separate particle.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { tokensInSentence, isMainClause, escapeHtml: coreEscape } = core;

  function escapeHtml(s) {
    if (coreEscape) return coreEscape(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const grammarTables = host.__lexiGrammarTables || {};
  const SEPARABLE_PREFIXES = grammarTables.SEPARABLE_PREFIXES || new Set([
    'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fest', 'her', 'hin',
    'los', 'mit', 'nach', 'um', 'vor', 'weg', 'zu', 'zurück',
    'zusammen', 'weiter', 'vorbei', 'herum', 'heraus', 'hinaus',
  ]);

  // Convert to array sorted by length descending so longer prefixes match first
  // (e.g. "zurück" before "zu", "heraus" before "her")
  const SORTED_PREFIXES = Array.from(SEPARABLE_PREFIXES).sort((a, b) => b.length - a.length);

  const rule = {
    id: 'de-separable-verb',
    languages: ['de'],
    priority: 69,
    // exam-audit 33-03: stays safe=false — Multi-token separable-prefix reattachment; syntactic edit beyond Chrome parity
    exam: {
      safe: false,
      reason: "Stays safe=false (de-separable-verb) — Multi-token separable-prefix reattachment; syntactic edit beyond Chrome parity",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      const prefix = finding.prefix || '';
      const stem = finding.stem || '';
      const split = stem + ' … ' + prefix;
      return {
        nb: 'I tyske hovedsetninger skal delbare verb splittes. Vurder å skille <em>' + escapeHtml(finding.original) + '</em> i <em>' + escapeHtml(split) + '</em> — prefikset <em>' + escapeHtml(prefix) + '</em> hører til slutten av setningen.',
        nn: 'I tyske hovudsetningar skal delbare verb splittast. Vurder å skilje <em>' + escapeHtml(finding.original) + '</em> i <em>' + escapeHtml(split) + '</em> — prefikset <em>' + escapeHtml(prefix) + '</em> høyrer til slutten av setninga.',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'de') return [];
      if (!ctx.sentences || !tokensInSentence || !isMainClause) return [];

      const vocab = ctx.vocab || {};
      const knownPresens = vocab.knownPresens || new Set();
      const knownPreteritum = vocab.knownPreteritum || new Set();
      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        if (range.end - range.start < 2) continue;

        // Only flag in main clauses
        if (!isMainClause(ctx, range.start, range.end)) continue;

        for (let i = range.start; i < range.end; i++) {
          if (ctx.suppressedFor && ctx.suppressedFor.structural && ctx.suppressedFor.structural.has(i)) continue;

          const word = ctx.tokens[i].word;
          if (word.length < 4) continue; // Too short to be prefix+stem

          // Try each separable prefix
          let matchedPrefix = null;
          let stem = null;

          for (const prefix of SORTED_PREFIXES) {
            if (word.startsWith(prefix) && word.length > prefix.length + 1) {
              const candidate = word.slice(prefix.length);
              // Check if the stem is a known finite verb form
              if (knownPresens.has(candidate) || knownPreteritum.has(candidate)) {
                matchedPrefix = prefix;
                stem = candidate;
                break;
              }
            }
          }

          if (!matchedPrefix) continue;

          // Guard: check if the prefix already appears as a separate particle
          // later in this sentence (meaning the verb IS correctly split)
          let prefixAlreadySplit = false;
          for (let k = i + 1; k < range.end; k++) {
            if (ctx.tokens[k].word === matchedPrefix) {
              prefixAlreadySplit = true;
              break;
            }
          }
          if (prefixAlreadySplit) continue;

          // Flag the unsplit form
          const tok = ctx.tokens[i];
          findings.push({
            rule_id: 'de-separable-verb',
            start: tok.start,
            end: tok.end,
            original: tok.display,
            // Structural rule — separable verb must split into stem + prefix
            // around other tokens. No atomic substitution. noAutoFix
            // suppresses the popover's Fiks button.
            fix: tok.display,
            noAutoFix: true,
            prefix: matchedPrefix,
            stem: stem,
            message: tok.display + ' → ' + stem + ' ... ' + matchedPrefix + ' (trennbar)',
            severity: 'warning',
          });

          break; // One flag per sentence
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
