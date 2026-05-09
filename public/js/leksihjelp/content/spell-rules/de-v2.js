/**
 * Spell-check rule: DE V2 word-order violation (WO-02, priority 66).
 *
 * Phase 7. Flags main-clause sentences where a fronted adverbial or wh-word
 * is followed by subject+verb instead of the correct verb+subject inversion.
 *   Wrong:   "Gestern ich habe Fussball gespielt"
 *   Correct: "Gestern habe ich Fussball gespielt"
 *
 * Detection strategy: find subject-pronoun + finite-verb adjacency where at
 * least one non-subject token precedes the subject at the sentence start.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};

  const WH_WORDS = new Set([
    'warum', 'wie', 'was', 'wer', 'welcher', 'welche', 'welches',
    'wo', 'wann', 'woher', 'wohin',
  ]);

  const SUBJECT_PRONOUNS = new Set([
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man',
  ]);

  const SUBORDINATORS = new Set([
    'dass', 'weil', 'wenn', 'ob', 'obwohl', 'als', 'bevor', 'nachdem',
    'damit', 'sodass', 'solange', 'sobald', 'seit', 'seitdem',
    'während', 'indem', 'falls',
  ]);

  // Separable prefixes: read from shared grammar-tables.js (canonical source).
  // Fallback to a local Set if grammar-tables hasn't loaded (backward compat).
  const grammarTables = host.__lexiGrammarTables || {};
  const SEPARABLE_PREFIXES = grammarTables.SEPARABLE_PREFIXES || new Set([
    'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fest', 'her', 'hin',
    'los', 'mit', 'nach', 'um', 'vor', 'weg', 'zu', 'zurück',
    'zusammen', 'weiter', 'vorbei', 'herum', 'heraus', 'hinaus',
  ]);

  // Check if a word is a finite verb, including unseparated separable verbs.
  function isFiniteOrUnseparated(word, ctx) {
    const tagged = ctx.getTagged ? null : null; // not using tagged here
    // Check standard isFinite via vocab
    if (ctx.vocab && ctx.vocab.knownPresens && ctx.vocab.knownPresens.has(word)) return true;
    if (ctx.vocab && ctx.vocab.knownPreteritum && ctx.vocab.knownPreteritum.has(word)) return true;
    // Check separable prefix stripping
    for (const prefix of SEPARABLE_PREFIXES) {
      if (word.startsWith(prefix) && word.length > prefix.length + 1) {
        const stem = word.slice(prefix.length);
        if (ctx.vocab && ctx.vocab.knownPresens && ctx.vocab.knownPresens.has(stem)) return true;
        if (ctx.vocab && ctx.vocab.knownPreteritum && ctx.vocab.knownPreteritum.has(stem)) return true;
      }
    }
    return false;
  }

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const rule = {
    id: 'de-v2',
    languages: ['de'],
    priority: 66,
    // exam-audit 33-03: stays safe=false — Multi-token V2 word-order rewrite; Chrome native spellcheck does not analyse syntax
    exam: {
      safe: false,
      reason: "Stays safe=false (de-v2) — Multi-token V2 word-order rewrite; Chrome native spellcheck does not analyse syntax",
      category: "grammar-lookup",
    },
    severity: 'warning',
    // Phase 39: Rich pedagogy for V2 word order in main clauses
    pedagogy: {
      note: {
        nb: 'I tyske hovedsetninger skal det bøyde verbet alltid stå på plass 2, selv om du starter setningen med noe annet enn subjektet.',
        nn: 'I tyske hovudsetningar skal det bøygde verbet alltid stå på plass 2, sjølv om du startar setninga med noko anna enn subjektet.',
        en: 'In German main clauses, the finite verb must always be at position 2, even if you start the sentence with something other than the subject.',
      },
      examples: [
        { 
          correct: 'Heute <strong>geht</strong> er nach Hause.', 
          incorrect: 'Heute er <strong>geht</strong> nach Hause.', 
          translation: { nb: 'I dag går han hjem.', nn: 'I dag går han heim.', en: 'Today he goes home.' } 
        },
        { 
          correct: 'Jetzt <strong>habe</strong> ich Zeit.', 
          incorrect: 'Jetzt ich <strong>habe</strong> tid.', 
          translation: { nb: 'Nå har jeg tid.', nn: 'No har eg tid.', en: 'Now I have time.' } 
        }
      ],
      extra: {
        nb: 'Tips: Hvis du starter setningen med et adverb (som <em>Heute, Jetzt, Dann</em>), må verbet komme rett etterpå.',
        nn: 'Tips: Viss du startar setninga med eit adverb (som <em>Heute, Jetzt, Dann</em>), må verbet kome rett etterpå.',
        en: 'Tip: If you start the sentence with an adverb (like <em>Heute, Jetzt, Dann</em>), the verb must follow immediately.'
      }
    },
    explain: function (finding) {
      return {
        nb: 'I tyske hovedsetninger skal verbet stå på plass 2. Skriv <em>' + escapeHtml(finding.fix) + '</em> i stedet for <em>' + escapeHtml(finding.original) + '</em>.',
        nn: 'I tyske hovudsetningar skal verbet stå på plass 2. Skriv <em>' + escapeHtml(finding.fix) + '</em> i staden for <em>' + escapeHtml(finding.original) + '</em>.',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'de') return [];
      if (!ctx.sentences || !core.tokensInSentence) return [];

      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = core.tokensInSentence(ctx, sentence);
        const sLen = range.end - range.start;
        if (sLen < 3) continue;

        // Honor structural suppression
        if (ctx.suppressedFor && ctx.suppressedFor.structural) {
          let allSuppressed = true;
          for (let i = range.start; i < range.end; i++) {
            if (!ctx.suppressedFor.structural.has(i)) { allSuppressed = false; break; }
          }
          if (allSuppressed) continue;
        }

        // Skip subordinate clauses: if first token is a subordinator, skip
        const firstWord = ctx.getTagged(range.start).word;
        if (SUBORDINATORS.has(firstWord)) continue;

        // Strategy: find adjacent [subject pronoun] [finite verb]
        // where the subject is NOT at position 0.
        for (let i = range.start + 1; i < range.end - 1; i++) {
          const tagged = ctx.getTagged(i);
          if (!tagged || !SUBJECT_PRONOUNS.has(tagged.word)) continue;

          // Found a subject pronoun at position > 0.
          // Check if the NEXT token is a directly-known finite verb
          // (including unseparated separable verbs like "aufstehe").
          // Use direct knownPresens/knownPreteritum check rather than
          // isFinite to avoid false matches from stem extraction.
          const nextTagged = ctx.getTagged(i + 1);
          if (!nextTagged) continue;
          const nw = nextTagged.word;
          const isDirectFinite = (ctx.vocab.knownPresens && ctx.vocab.knownPresens.has(nw)) ||
                                  (ctx.vocab.knownPreteritum && ctx.vocab.knownPreteritum.has(nw));
          if (!isDirectFinite && !isFiniteOrUnseparated(nw, ctx)) continue;

          // Embedded wh-clause guard
          let isEmbeddedWh = false;
          for (let j = range.start; j < i; j++) {
            const jTagged = ctx.getTagged(j);
            if (jTagged && WH_WORDS.has(jTagged.word)) {
              for (let k = range.start; k < j; k++) {
                if (ctx.getTagged(k).isFinite) {
                  isEmbeddedWh = true;
                  break;
                }
              }
              if (isEmbeddedWh) break;
            }
          }
          if (isEmbeddedWh) continue;

          // Guard: subordinator before subject in same sentence
          let hasSubBefore = false;
          for (let j = range.start + 1; j < i; j++) {
            const jTagged = ctx.getTagged(j);
            if (jTagged && SUBORDINATORS.has(jTagged.word)) {
              hasSubBefore = true;
              break;
            }
          }
          if (hasSubBefore) continue;

          // Build finding: flag just the subject pronoun to avoid overlap
          // with other rules that may fire on the verb token.
          const subjToken = ctx.tokens[i];
          const verbToken = ctx.tokens[i + 1];
          const original = subjToken.display + ' ' + verbToken.display;
          const fix = verbToken.display + ' ' + subjToken.display;
          findings.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: ctx.tokens[i].start,
            end: ctx.tokens[i].end,
            original: original,
            fix: fix,
            message: original + ' → ' + fix + ' (V2)',
            severity: 'warning',
            // F36-5: V2 fix requires reordering tokens across the clause; the
            // marker spans only the subject pronoun, so applying `fix` as an
            // atomic substitution would corrupt the sentence. Mirror nb-v2.
            noAutoFix: true,
            // pedagogy auto-attached by core: rulePedagogy.get(rule_id)
            // with rule.pedagogy as inline fallback.
          });

          break; // Only flag once per sentence
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
