/**
 * Spell-check rule: German subordinate-clause verb-final (WO-03, priority 67).
 *
 * Phase 7. In German subordinate clauses introduced by a subordinating
 * conjunction (dass, weil, wenn, ob, ...), the finite verb must be placed
 * at the end of the clause. NB students frequently use main-clause word
 * order (verb-second) inside subordinate clauses.
 *
 * Example: "dass er ist nett" → "dass er nett ist"
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { findFiniteVerb, tokensInSentence, escapeHtml: coreEscape } = core;

  function escapeHtml(s) {
    if (coreEscape) return coreEscape(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const DE_SUBORDINATORS = new Set([
    'dass', 'weil', 'wenn', 'ob', 'obwohl', 'als', 'bevor', 'nachdem',
    'damit', 'sodass', 'solange', 'sobald', 'seit', 'seitdem', 'während',
    'indem', 'falls',
  ]);

  // Modal verb stems — these are the conjugated forms that should appear at
  // clause end in modal+infinitive constructions within subordinate clauses.
  const DE_MODALS = new Set([
    'kann', 'kannst', 'können', 'könnt',
    'muss', 'musst', 'müssen', 'müsst',
    'soll', 'sollst', 'sollen', 'sollt',
    'will', 'willst', 'wollen', 'wollt',
    'darf', 'darfst', 'dürfen', 'dürft',
    'mag', 'magst', 'mögen', 'mögt',
    'möchte', 'möchtest', 'möchten', 'möchtet',
  ]);

  const rule = {
    id: 'de-verb-final',
    languages: ['de'],
    priority: 67,
    // exam-audit 33-03: stays safe=false — Multi-token subordinate-clause verb-final rewrite; syntactic, not lookup
    exam: {
      safe: false,
      reason: "Stays safe=false (de-verb-final) — Multi-token subordinate-clause verb-final rewrite; syntactic, not lookup",
      category: "grammar-lookup",
    },
    severity: 'warning',
    // Phase 39: Rich pedagogy for verb-final word order
    pedagogy: {
      note: {
        nb: 'I tyske leddsetninger (setninger som starter med ord som <em>dass, weil, wenn, ob</em>) skal det bøyde verbet alltid stå helt til slutt.',
        nn: 'I tyske leddsetningar (setningar som startar med ord som <em>dass, weil, wenn, ob</em>) skal det bøygde verbet alltid stå heilt til slutt.',
        en: 'In German subordinate clauses (starting with words like <em>dass, weil, wenn, ob</em>), the finite verb must always go at the very end.',
      },
      examples: [
        { 
          correct: '...dass er krank ist.', 
          incorrect: '...dass er ist krank.', 
          translation: { nb: '...at han er syk.', nn: '...at han er sjuk.', en: '...that he is sick.' } 
        },
        { 
          correct: '...weil ich keine Zeit habe.', 
          incorrect: '...weil ich habe keine Zeit.', 
          translation: { nb: '...fordi jeg ikke har tid.', nn: '...fordi eg ikkje har tid.', en: '...because I have no time.' } 
        },
        { 
          correct: '...wenn du morgen kommst.', 
          incorrect: '...wenn du kommst morgen.', 
          translation: { nb: '...hvis du kommer i morgen.', nn: '...hvis du kjem i morgon.', en: '...if you come tomorrow.' } 
        }
      ],
      extra: {
        nb: 'Husk: Hvis du har to verb (f.eks. et modalverb + infinitiv), skal det bøyde verbet stå aller sist: <em>"...weil ich es <strong>kann</strong>"</em>.',
        nn: 'Hugs: Viss du har to verb (t.d. eit modalverb + infinitiv), skal det bøygde verbet stå aller sist: <em>"...weil ich es <strong>kann</strong>"</em>.',
        en: 'Note: If you have two verbs (e.g., modal + infinitive), the finite verb goes last: <em>"...weil ich es <strong>kann</strong>"</em>.'
      }
    },
    explain: function (finding) {
      return {
        nb: 'I tyske leddsetninger skal det bøyde verbet stå til slutt. Vurder å flytte <em>' + escapeHtml(finding.display || finding.original) + '</em> til slutten av leddsetningen.',
        nn: 'I tyske leddsetningar skal det bøygde verbet stå til slutt. Vurder å flytte <em>' + escapeHtml(finding.display || finding.original) + '</em> til slutten av leddsetninga.',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'de') return [];
      if (!ctx.sentences || !tokensInSentence || !findFiniteVerb) return [];

      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        if (range.end - range.start < 3) continue;

        // Scan for subordinators in this sentence
        for (let i = range.start; i < range.end; i++) {
          if (ctx.suppressedFor && ctx.suppressedFor.structural && ctx.suppressedFor.structural.has(i)) continue;

          const tagged = ctx.getTagged(i);
          if (!DE_SUBORDINATORS.has(tagged.word.toLowerCase())) continue;

          // Found a subordinator at position i. Define subordinate clause bounds.
          const clauseStart = i + 1;

          // Clause ends at next comma, period, or sentence end.
          // Also ends at the next subordinator (nested clause boundary).
          let clauseEnd = range.end;
          for (let j = clauseStart; j < range.end; j++) {
            const tok = ctx.tokens[j];
            // Check for punctuation between tokens (commas, periods in the raw text)
            if (j > clauseStart) {
              const textBetween = ctx.text.slice(ctx.tokens[j - 1].end, tok.start);
              if (/[,.]/.test(textBetween)) {
                clauseEnd = j;
                break;
              }
            }
            // Also check if this token itself is preceded by a comma in the text
          }

          // Need at least 2 tokens in the subordinate clause (subject + verb minimum)
          if (clauseEnd - clauseStart < 2) continue;

          // Collect ALL finite verbs in the subordinate clause.
          // Disambiguation: if a token is capitalized AND is a known noun,
          // treat it as a noun (not a verb). German capitalizes nouns, so
          // "Regen" (rain, noun) vs "regen" (to excite, verb) is resolved
          // by case. Sentence-initial tokens (clauseStart) are excluded
          // from this heuristic since they're always capitalized.
          var nounGenus = ctx.vocab.nounGenus || new Map();
          var finiteVerbs = [];
          for (var fi = clauseStart; fi < clauseEnd; fi++) {
            if (!ctx.getTagged(fi).isFinite) continue;
            var ftok = ctx.tokens[fi];
            // Skip noun-like capitalized tokens (not sentence-initial)
            if (fi > clauseStart && ftok.display[0] === ftok.display[0].toUpperCase() &&
                ftok.display[0] !== ftok.display[0].toLowerCase() &&
                nounGenus.has(ftok.word)) continue;
            finiteVerbs.push(fi);
          }
          if (finiteVerbs.length === 0) continue;

          // Find the last content token (non-punctuation) before clause boundary
          var lastContent = clauseEnd - 1;
          // lastContent should just be the last word token in the clause range
          // (tokens are word-only, no punctuation tokens exist in the tokenizer)
          if (lastContent < clauseStart) continue;

          // Modal+infinitive handling: in "ob er schwimmen kann", the modal
          // verb (kann) must be at the clause end. In "ob er kann schwimmen",
          // the modal is NOT at the end → error.
          // Strategy: if a modal is present among the finite verbs, IT is the
          // "true finite verb" that must be last. Otherwise, any finite verb
          // at the end position is correct.
          var modalIdxs = finiteVerbs.filter(function(idx) {
            return DE_MODALS.has(ctx.tokens[idx].word.toLowerCase());
          });

          if (modalIdxs.length > 0) {
            // Modal present: the modal must be the last finite verb at clause end
            if (modalIdxs.indexOf(lastContent) !== -1) continue;
            // Modal not at end → flag the modal
            var flagIdx = modalIdxs[0];
          } else {
            // No modal: any finite verb at the end is correct
            if (finiteVerbs.indexOf(lastContent) !== -1) continue;
            var flagIdx = finiteVerbs[0];
          }
          var verbTok = ctx.tokens[flagIdx];
          findings.push({
            rule_id: 'de-verb-final',
            priority: rule.priority,
            start: verbTok.start,
            end: verbTok.end,
            original: verbTok.display,
            display: verbTok.display,
            // Structural rule — the fix requires moving the verb across other
            // tokens, not a one-spot substitution. noAutoFix tells the popover
            // to suppress the "Fiks" button so the user gets the explanation
            // only and edits manually.
            fix: verbTok.display,
            noAutoFix: true,
            message: 'Verbet skal stå til slutt i leddsetningen: "' + verbTok.display + '"',
            severity: 'warning',
            // pedagogy auto-attached by core.
          });

          // Only flag the first violation per subordinate clause
          break;
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
