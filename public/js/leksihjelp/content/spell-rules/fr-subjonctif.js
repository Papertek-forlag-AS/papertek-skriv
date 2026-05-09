/**
 * Spell-check rule: FR subjonctif trigger detection (MOOD-03, priority 60).
 *
 * Phase 11. Flags indicative verb forms after French subjunctive-trigger
 * phrases, but ONLY when the subjunctive form demonstrably differs from
 * the indicative form for that person — the homophony guard.
 *
 *   Wrong:   "Il faut que je fais mes devoirs" (fais -> fasse, faire irregular)
 *   Correct: "Il faut que je parle mieux"      (parle = same in both moods for je)
 *
 * Regular -er verbs have identical presens and subjonctif forms for
 * je/tu/il/ils. Only nous/vous differ (parlons -> parlions, parlez -> parliez).
 * Irregular verbs differ for all persons (fais -> fasse, etc.).
 *
 * Trigger phrases are consumed from grammar-tables.js FR_SUBJONCTIF_TRIGGERS.
 * Verb form resolution uses vocab-seam indexes frPresensToVerb,
 * frSubjonctifForms, and frSubjonctifDiffers.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { tokensInSentence, matchCase: coreMatchCase } = core;

  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original && original[0] === original[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  function escapeHtml(s) {
    const fn = core.escapeHtml;
    if (fn) return fn(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Subject pronoun -> conjugation person key (matching verb data format)
  const PRONOUN_TO_PERSON = {
    je: 'je', tu: 'tu',
    il: 'il/elle', elle: 'il/elle', on: 'il/elle',
    nous: 'nous', vous: 'vous',
    ils: 'ils/elles', elles: 'ils/elles',
  };

  // Subject pronouns and words that may appear between "que" and the verb
  const SKIP_AFTER_QUE = new Set([
    'je', 'tu', 'il', 'elle', 'on',
    'nous', 'vous', 'ils', 'elles',
    // Articles, possessives, demonstratives that start NP subjects
    'le', 'la', 'les', 'un', 'une', 'des',
    'mon', 'ma', 'mes', 'ton', 'ta', 'tes',
    'son', 'sa', 'ses', 'notre', 'nos', 'votre', 'vos',
    'leur', 'leurs', 'ce', 'cet', 'cette', 'ces',
  ]);

  // Lazy-init grammar tables
  let _triggers = null;
  function getTriggers() {
    if (_triggers) return _triggers;
    const gt = host.__lexiGrammarTables || {};
    _triggers = gt.FR_SUBJONCTIF_TRIGGERS || new Set();
    return _triggers;
  }

  const rule = {
    id: 'fr-subjonctif',
    languages: ['fr'],
    priority: 60,
    // exam-audit 33-03: stays safe=false — Subjonctif mood selection requires trigger-clause analysis; multi-token reasoning
    exam: {
      safe: false,
      reason: "Stays safe=false (fr-subjonctif) — Subjonctif mood selection requires trigger-clause analysis; multi-token reasoning",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      const original = finding.original || '';
      const fix = finding.fix || '';
      const trigger = finding.trigger || '';
      return {
        nb: 'Etter uttrykket <em>' + escapeHtml(trigger) + '</em> skal verbet staa i subjonctif: <em>' + escapeHtml(fix) + '</em>, ikke <em>' + escapeHtml(original) + '</em>.',
        nn: 'Etter uttrykket <em>' + escapeHtml(trigger) + '</em> skal verbet staa i subjonctif: <em>' + escapeHtml(fix) + '</em>, ikkje <em>' + escapeHtml(original) + '</em>.',
        severity: 'warning',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      if (!ctx.sentences || !tokensInSentence) return [];

      const triggers = getTriggers();
      if (!triggers.size) return [];

      const presensToVerb = ctx.vocab && ctx.vocab.frPresensToVerb;
      const subjonctifForms = ctx.vocab && ctx.vocab.frSubjonctifForms;
      const subjonctifDiffers = ctx.vocab && ctx.vocab.frSubjonctifDiffers;
      if (!presensToVerb || !presensToVerb.size) return [];
      if (!subjonctifForms || !subjonctifForms.size) return [];
      if (!subjonctifDiffers) return [];

      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        if (range.end - range.start < 3) continue; // need at least trigger + que + verb

        for (let i = range.start; i < range.end; i++) {
          // Try to match a multi-word trigger starting at position i.
          // Triggers are 2-5 words long and always end with "que".
          let matched = null;
          let matchEnd = -1; // index AFTER the last token of the matched trigger

          for (let len = 1; len <= 5 && (i + len - 1) < range.end; len++) {
            const phrase = [];
            for (let k = 0; k < len; k++) {
              phrase.push(ctx.tokens[i + k].word);
            }
            const joined = phrase.join(' ');
            if (triggers.has(joined)) {
              // Keep the longest match
              matched = joined;
              matchEnd = i + len;
            }
          }

          if (!matched) continue;
          // Trigger must end with "que"
          if (!matched.endsWith(' que') && matched !== 'quoique') continue;

          // Scan forward from matchEnd, skipping subject pronouns/determiners and nouns.
          // We allow up to 4 tokens of subject NP between "que" and the verb.
          // Track the last subject pronoun seen to disambiguate person when
          // presens forms are shared (e.g., "fais" is both je and tu).
          const scanLimit = Math.min(matchEnd + 5, range.end);
          let detectedPerson = null;
          for (let j = matchEnd; j < scanLimit; j++) {
            const tokenWord = ctx.tokens[j].word;

            // Track subject pronoun for person disambiguation
            if (PRONOUN_TO_PERSON[tokenWord]) {
              detectedPerson = PRONOUN_TO_PERSON[tokenWord];
            }

            // Check if this token is a known indicative present form
            const verbInfo = presensToVerb.get(tokenWord);
            if (verbInfo) {
              // Use detected pronoun person if available (more accurate than
              // the Map's last-wins person which may be wrong for shared forms
              // like "fais" = je/tu). Fall back to the Map's person otherwise.
              const person = detectedPerson || verbInfo.person;
              const key = verbInfo.inf + '|' + person;

              // Found an indicative present form — check homophony guard
              const differs = subjonctifDiffers.get(key);

              // If forms are identical (differs === false) or unknown (undefined),
              // do NOT flag — we cannot distinguish indicative from subjunctive.
              if (!differs) break;

              // Forms differ — look up the subjunctive form
              const subjForm = subjonctifForms.get(key);
              if (subjForm && subjForm !== tokenWord) {
                const fixCased = matchCase(ctx.tokens[j].display, subjForm);
                findings.push({
                  rule_id: 'fr-subjonctif',
                  start: ctx.tokens[j].start,
                  end: ctx.tokens[j].end,
                  original: ctx.tokens[j].display,
                  fix: fixCased,
                  trigger: matched,
                  message: ctx.tokens[j].display + ' -> ' + fixCased + ' (after ' + matched + ')',
                  severity: 'warning',
                });
              }
              break; // Stop scanning after first verb
            }

            // If this is a skip word (pronoun/determiner), continue scanning
            if (SKIP_AFTER_QUE.has(tokenWord)) {
              continue;
            }

            // Unknown word — could be a noun in subject NP. Continue scanning.
          }
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
