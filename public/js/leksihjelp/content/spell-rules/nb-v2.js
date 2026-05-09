/**
 * Spell-check rule: NB/NN V2 word-order violation (WO-01, priority 65).
 *
 * Phase 7. Flags main-clause sentences where a fronted adverbial or wh-word
 * is followed by subject+verb instead of the correct verb+subject inversion.
 *   Wrong:   "I går jeg gikk på kino"
 *   Correct: "I går gikk jeg på kino"
 *
 * Detection strategy: find subject-pronoun + finite-verb adjacency (or near-
 * adjacency) where at least one non-subject token precedes the subject at the
 * sentence start. This avoids the false-positive trap of multi-word adverbials
 * containing verb-homonyms ("I går" where "går" is present tense of "gå").
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};

  const WH_WORDS = {
    nb: new Set(['hvorfor', 'hvordan', 'hva', 'hvem', 'hvilken', 'hvilke', 'hvor', 'når']),
    nn: new Set(['kvifor', 'korleis', 'kva', 'kven', 'kvar', 'når']),
  };

  const SUBJECT_PRONOUNS = {
    nb: new Set(['jeg', 'du', 'han', 'hun', 'den', 'det', 'vi', 'dere', 'de', 'man', 'en']),
    nn: new Set(['eg', 'du', 'han', 'ho', 'den', 'det', 'vi', 'dykk', 'dei', 'ein']),
  };

  const COORD_CONJUNCTIONS = new Set(['og', 'men', 'eller', 'for']);

  // Modal verbs that can start yes/no questions but may not be in knownPresens
  const MODAL_VERBS = new Set(['skal', 'kan', 'må', 'vil', 'bør', 'tør', 'skulle', 'kunne', 'måtte', 'ville', 'burde']);

  // Prepositions that take pronoun objects — "Utan dei ville..." is NOT subject+verb
  const PREPOSITIONS_WITH_OBJECTS = new Set([
    'uten', 'utan', 'med', 'mot', 'til', 'fra', 'frå', 'mellom', 'blant',
    'bak', 'foran', 'rundt', 'gjennom',
  ]);

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  const rule = {
    id: 'nb-v2',
    languages: ['nb', 'nn'],
    priority: 65,
    // exam-audit 33-03: stays safe=false — Multi-token V2 word-order analysis; syntactic, not lookup
    exam: {
      safe: false,
      reason: "Stays safe=false (nb-v2) — Multi-token V2 word-order analysis; syntactic, not lookup",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      return {
        nb: 'I norske hovedsetninger skal verbet stå på plass 2. Skriv <em>' + escapeHtml(finding.fix) + '</em> i stedet for <em>' + escapeHtml(finding.original) + '</em>.',
        nn: 'I norske hovudsetningar skal verbet stå på plass 2. Skriv <em>' + escapeHtml(finding.fix) + '</em> i staden for <em>' + escapeHtml(finding.original) + '</em>.',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'nb' && ctx.lang !== 'nn') return [];
      if (!ctx.sentences || !core.tokensInSentence) return [];

      const findings = [];
      const lang = ctx.lang;
      const whWords = WH_WORDS[lang] || WH_WORDS.nb;
      const subjPronouns = SUBJECT_PRONOUNS[lang] || SUBJECT_PRONOUNS.nb;
      // Subordinators from spell-check-core
      const SUBORDINATORS = {
        nb: new Set(['fordi', 'at', 'som', 'når', 'hvis', 'selv', 'om', 'da', 'mens', 'etter', 'før', 'siden', 'dersom', 'enda', 'skjønt', 'ettersom']),
        nn: new Set(['fordi', 'at', 'som', 'når', 'viss', 'sjølv', 'om', 'då', 'mens', 'etter', 'før', 'sidan', 'dersom', 'endå', 'trass', 'frå']),
      };
      const subs = SUBORDINATORS[lang] || SUBORDINATORS.nb;

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

        // Skip subordinate clauses: if first token is a subordinator, skip.
        // Exception: "når" is both a subordinator and a wh-word. When at the
        // start of a question (sentence ends with ?), treat as wh-word.
        const firstWord = ctx.getTagged(range.start).word;
        if (subs.has(firstWord)) {
          const isAlsoWh = whWords.has(firstWord);
          const endsWithQuestion = sentence.text.trimEnd().endsWith('?');
          if (!isAlsoWh || !endsWithQuestion) continue;
        }

        // Guard: question-initial — if first word is a finite verb and the
        // sentence ends with "?", this is a yes/no question where subject
        // follows verb naturally (Kan du...? Skal vi...?).
        // Requiring "?" avoids false-suppression on fronted adverbs that are
        // verb-homonyms ("Så vi gikk hjem." — "så" = adverb "then", not verb "saw").
        const endsQ = sentence.text.trimEnd().endsWith('?');
        if (endsQ) {
          const firstTagged = ctx.getTagged(range.start);
          const firstIsVerb = (firstTagged && firstTagged.isFinite) || MODAL_VERBS.has(firstWord);
          if (firstIsVerb && !whWords.has(firstWord)) continue;
        }

        // Strategy: find adjacent or near-adjacent [subject pronoun] [finite verb]
        // where the subject is NOT at position 0 (i.e. something precedes it).
        // Position 0 subject = normal SVO order (correct).
        for (let i = range.start + 1; i < range.end - 1; i++) {
          const tagged = ctx.getTagged(i);
          if (!tagged || !subjPronouns.has(tagged.word)) continue;

          // Found a subject pronoun at position > 0.
          // Check if the NEXT token is a directly-known finite verb.
          // We check knownPresens/knownPreteritum directly rather than
          // relying solely on isFinite, because isFinite also matches
          // stems extracted from multi-word forms (e.g. "gå" from
          // "gå av"), leading to false positives on common words.
          const nextTagged = ctx.getTagged(i + 1);
          if (!nextTagged) continue;
          const nw = nextTagged.word;
          const isDirectFinite = (ctx.vocab.knownPresens && ctx.vocab.knownPresens.has(nw)) ||
                                  (ctx.vocab.knownPreteritum && ctx.vocab.knownPreteritum.has(nw));
          if (!isDirectFinite) continue;

          // Check that the position 0 token is NOT a subordinator (already handled)
          // and NOT a subject pronoun (that would be SVO with a dropped first element).

          // Embedded wh-clause guard: if there's a wh-word somewhere between
          // start and the subject, AND a finite verb between start and the wh-word,
          // this subject+verb belongs to an embedded wh-clause, not main clause.
          let isEmbeddedWh = false;
          for (let j = range.start; j < i; j++) {
            const jTagged = ctx.getTagged(j);
            if (jTagged && whWords.has(jTagged.word)) {
              // Check if there's a finite verb before this wh-word
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

          // Guard: if there's a subordinator between start and the subject,
          // this might be a subordinate clause within a larger sentence.
          let hasSubBefore = false;
          for (let j = range.start + 1; j < i; j++) {
            const jTagged = ctx.getTagged(j);
            if (jTagged && subs.has(jTagged.word)) {
              hasSubBefore = true;
              break;
            }
          }
          if (hasSubBefore) continue;

          // Guard: coordinate conjunction before subject — second clause SVO is correct
          let hasCoordBefore = false;
          for (let j = range.start; j < i; j++) {
            const jTagged = ctx.getTagged(j);
            if (jTagged && COORD_CONJUNCTIONS.has(jTagged.word)) {
              hasCoordBefore = true;
              break;
            }
          }
          if (hasCoordBefore) continue;

          // Guard: complement clause — "det er/var" after an earlier finite verb
          // or after a position-0 subject+verb (SVO first clause), meaning
          // "det er" is in a subordinate complement, not a main clause.
          // Covers: "Han sier det er bra", "Eg veit ikkje hvor det er", etc.
          if (tagged.word === 'det' && (nw === 'er' || nw === 'var')) {
            let hasEarlierVerb = false;
            for (let j = range.start; j < i; j++) {
              const jTagged = ctx.getTagged(j);
              if (!jTagged) continue;
              const jw = jTagged.word;
              if (jTagged.isFinite ||
                  (ctx.vocab.verbForms && ctx.vocab.verbForms.has(jw)) ||
                  (ctx.vocab.verbInfinitive && ctx.vocab.verbInfinitive.has(jw)) ||
                  MODAL_VERBS.has(jw)) {
                hasEarlierVerb = true;
                break;
              }
            }
            // Also check: subject pronoun at position 0 makes this a multi-clause
            // sentence where later "det er/var" is subordinate
            if (!hasEarlierVerb) {
              const firstT = ctx.getTagged(range.start);
              if (firstT && subjPronouns.has(firstT.word)) hasEarlierVerb = true;
            }
            if (hasEarlierVerb) continue;
          }

          // Guard: preposition + pronoun — "Utan dei ville..." where "dei" is
          // the object of a preposition, not a sentence subject
          if (i > range.start) {
            const beforeTagged = ctx.getTagged(i - 1);
            if (beforeTagged && PREPOSITIONS_WITH_OBJECTS.has(beforeTagged.word)) continue;
          }

          // Guard: NN "ein" as article, not pronoun — if next word is a known noun, skip
          if (lang === 'nn' && tagged.word === 'ein') {
            if (ctx.vocab.nounGenus && ctx.vocab.nounGenus.has(nw.toLowerCase())) continue;
          }

          // Build finding: flag just the subject pronoun to avoid overlap
          // with other rules that may fire on the verb token.
          const subjToken = ctx.tokens[i];
          const verbToken = ctx.tokens[i + 1];
          const original = subjToken.display + ' ' + verbToken.display;
          const fix = verbToken.display + ' ' + subjToken.display;

          findings.push({
            rule_id: 'nb-v2',
            start: subjToken.start,
            end: subjToken.end,
            original: original,
            fix: fix,
            message: original + ' → ' + fix + ' (V2)',
            severity: 'warning',
            // F36-5: V2 fix requires reordering tokens across the clause; the
            // marker spans only the subject pronoun, so applying `fix` as an
            // atomic substitution would corrupt the sentence. noAutoFix tells
            // spell-check.js to suppress the Fiks button and the orig→fix
            // arrow head; the explain() block carries the actionable rule.
            noAutoFix: true,
          });

          // Only flag once per sentence
          break;
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
