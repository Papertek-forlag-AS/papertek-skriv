/**
 * Spell-check rule: ES subjuntivo trigger detection (MOOD-01, priority 60).
 *
 * Phase 11. Flags indicative verb forms after subjunctive-trigger phrases
 * (quiero que, espero que, dudo que, etc.) and suggests the subjunctive form.
 *
 *   Wrong:   "Quiero que mi hermano viene" (indicative viene after trigger)
 *   Fix:     "Quiero que mi hermano venga" (subjunctive venga)
 *
 * Trigger phrases are consumed from grammar-tables.js ES_SUBJUNTIVO_TRIGGERS.
 * Verb form resolution uses vocab-seam indexes esPresensToVerb and
 * esSubjuntivoForms — no local conjugation tables.
 *
 * Guard: relative clauses ("el libro que viene") do NOT flag because "libro que"
 * is not in the trigger set. Only complete multi-word triggers ending in "que"
 * are matched.
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

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Subject pronouns and determiners that may appear between "que" and the verb
  const SKIP_AFTER_QUE = new Set([
    'yo', 'tu', 'tú', 'el', 'él', 'ella', 'usted',
    'nosotros', 'nosotras', 'vosotros', 'vosotras',
    'ellos', 'ellas', 'ustedes',
    // Possessives + articles that start NP subjects ("mi hermano", "el profesor")
    'mi', 'mis', 'su', 'sus', 'un', 'una', 'unos', 'unas',
    'la', 'los', 'las', 'nuestro', 'nuestra', 'nuestros', 'nuestras',
  ]);

  // Words that are likely nouns (not verbs) in NP subject position
  // We don't have a noun list, but we skip tokens that appear in SKIP_AFTER_QUE
  // and then check the next token for verb status. This handles "mi hermano viene"
  // by skipping "mi", then skipping "hermano" (not a known verb), reaching "viene".

  // Lazy-init grammar tables
  let _triggers = null;
  function getTriggers() {
    if (_triggers) return _triggers;
    const gt = host.__lexiGrammarTables || {};
    _triggers = gt.ES_SUBJUNTIVO_TRIGGERS || new Set();
    return _triggers;
  }

  const rule = {
    id: 'es-subjuntivo',
    languages: ['es'],
    priority: 60,
    // exam-audit 33-03: stays safe=false — Subjuntivo mood selection requires trigger-clause analysis; multi-token reasoning
    exam: {
      safe: false,
      reason: "Stays safe=false (es-subjuntivo) — Subjuntivo mood selection requires trigger-clause analysis; multi-token reasoning",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      const original = finding.original || '';
      const fix = finding.fix || '';
      const trigger = finding.trigger || '';
      return {
        nb: 'Etter uttrykket <em>' + escapeHtml(trigger) + '</em> skal verbet staa i subjuntivo: <em>' + escapeHtml(fix) + '</em>, ikke <em>' + escapeHtml(original) + '</em>.',
        nn: 'Etter uttrykket <em>' + escapeHtml(trigger) + '</em> skal verbet staa i subjuntivo: <em>' + escapeHtml(fix) + '</em>, ikkje <em>' + escapeHtml(original) + '</em>.',
        severity: 'warning',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      if (!ctx.sentences || !tokensInSentence) return [];

      const triggers = getTriggers();
      if (!triggers.size) return [];

      const presensToVerb = ctx.vocab && ctx.vocab.esPresensToVerb;
      const subjuntivoForms = ctx.vocab && ctx.vocab.esSubjuntivoForms;
      if (!presensToVerb || !presensToVerb.size) return [];
      if (!subjuntivoForms || !subjuntivoForms.size) return [];

      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        if (range.end - range.start < 3) continue; // need at least trigger + que + verb

        for (let i = range.start; i < range.end; i++) {
          // Try to match a multi-word trigger starting at position i.
          // Triggers are 2-5 words long and always end with "que".
          let matched = null;
          let matchEnd = -1; // index AFTER the last token of the matched trigger

          for (let len = 2; len <= 5 && (i + len - 1) < range.end; len++) {
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
          if (!matched.endsWith(' que')) continue;

          // Scan forward from matchEnd, skipping subject pronouns/determiners and nouns.
          // We allow up to 4 tokens of subject NP between "que" and the verb.
          const scanLimit = Math.min(matchEnd + 5, range.end);
          for (let j = matchEnd; j < scanLimit; j++) {
            const tokenWord = ctx.tokens[j].word;
            const stripped = stripAccents(tokenWord);

            // Check if this token is a known indicative present form
            let verbInfo = presensToVerb.get(tokenWord) || presensToVerb.get(stripped);
            if (verbInfo) {
              // Found an indicative present form — look up the subjunctive
              const subjForm = subjuntivoForms.get(verbInfo.inf + '|' + verbInfo.person);
              if (subjForm && subjForm !== tokenWord && subjForm !== stripped) {
                const fixCased = matchCase(ctx.tokens[j].display, subjForm);
                findings.push({
                  rule_id: 'es-subjuntivo',
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
            if (SKIP_AFTER_QUE.has(tokenWord) || SKIP_AFTER_QUE.has(stripped)) {
              continue;
            }

            // Unknown word — could be a noun in subject NP. Continue scanning
            // but only if we haven't gone too far.
            // If it's not a skip word and not a verb, it might be a noun.
            // Continue to next token.
          }
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
