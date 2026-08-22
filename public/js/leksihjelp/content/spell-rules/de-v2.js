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
    // "Je + comparative" opens a verb-final correlative clause ("Je länger ich
    // warte, desto …") — the verb stays at the end, so this is NOT a V2 error.
    // A clause-initial "je" is virtually always this construction.
    'je',
  ]);

  // v3.0.119: unambiguous single-word fronting adverbs that open the
  // noun-subject V2 branch ("Dann die Reise ist kürzer"). Curated narrow —
  // multi-word fronted phrases ("Am Abend …") stay with the pronoun branch.
  const FRONT_ADVERBS = new Set([
    'dann', 'danach', 'heute', 'gestern', 'morgen', 'jetzt', 'deshalb',
    'später', 'zuerst', 'dort', 'hier', 'abends', 'morgens', 'manchmal',
    'oft', 'immer', 'leider', 'bald', 'vielleicht', 'außerdem', 'trotzdem',
  ]);
  // Determiners that can head the fronted noun phrase.
  const NP_DETS = new Set([
    'der', 'die', 'das', 'ein', 'eine',
    'mein', 'meine', 'dein', 'deine', 'sein', 'seine',
    'ihr', 'ihre', 'unser', 'unsere',
  ]);

  // Coordinating conjunctions + correlative lead/continuation words. A clause
  // opening after one of these keeps SVO order — V2 inversion is optional, not
  // required — so a following [subject pronoun][verb] is NOT a V2 error
  // ("Entweder du kommst mit …", "Weder er noch sie wollten …"). The set is
  // also used to reject a conjunction-homograph being read as the finite verb
  // ("Nicht nur er, sondern auch sie …", where "sondern" is the conjunction,
  // not the verb absondern/sondern).
  const COORD_CORRELATIVE = new Set([
    'und', 'oder', 'aber', 'denn', 'sondern',
    'entweder', 'weder', 'noch', 'sowohl',
  ]);
  // Perfect/passive auxiliaries — if one precedes a participle-homograph in the
  // same clause, the homograph is the participle bracket, not a misplaced finite
  // verb ("Trotzdem habe ich es versucht.", where "versucht" is the participle
  // AND a 3sg-present homograph).
  const PERFECT_AUX = new Set([
    'habe', 'hast', 'hat', 'haben', 'habt', 'hatte', 'hattest', 'hatten', 'hattet',
    'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart',
    'wird', 'werde', 'wirst', 'werden', 'werdet', 'wurde', 'wurdest', 'wurden', 'wurdet',
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

        // v3.0.119 (synthetic-corpus miss "dann die Reise ist kürzer"): the
        // pronoun detector below misses NOUN-PHRASE subjects. Narrow branch:
        // a curated fronting adverb opens the sentence, followed directly by
        // det + known noun + finite verb (or demonstrative das + finite verb,
        // real-corpus shape "dann das ist fisch"). OVS guard: a nominative
        // pronoun after the verb means the fronted NP is the object ("Dann
        // die Suppe esse ich") — correct German, skip.
        {
          const isFiniteWord = (w) =>
            (ctx.vocab.knownPresens && ctx.vocab.knownPresens.has(w)) ||
            (ctx.vocab.knownPreteritum && ctx.vocab.knownPreteritum.has(w));
          const nounGenusMap = ctx.vocab.nounGenus || new Map();
          // Clause starts: the sentence head plus any token preceded by a
          // comma ("Ich håper wir fliegen, dann die Reise ist kürzer").
          const clauseStarts = [range.start];
          for (let k = range.start + 1; k < range.end; k++) {
            const gap = ctx.text.slice(ctx.tokens[k - 1].end, ctx.tokens[k].start);
            if (/[,;:]/.test(gap)) clauseStarts.push(k);
          }
          let emitted = false;
          for (const cs of clauseStarts) {
            if (emitted) break;
            if (cs + 2 >= range.end) continue;
            if (!FRONT_ADVERBS.has(ctx.getTagged(cs).word)) continue;
            const t1 = ctx.getTagged(cs + 1);
            if (!t1 || !NP_DETS.has(t1.word)) continue;
            const t2 = ctx.getTagged(cs + 2);
            const t3 = cs + 3 < range.end ? ctx.getTagged(cs + 3) : null;
            let npEnd = -1; // index of the finite verb token
            if (t1.word === 'das' && t2 && isFiniteWord(t2.word) && !nounGenusMap.has(t2.word)) {
              npEnd = cs + 2; // demonstrative: "dann das ist …"
            } else if (t2 && nounGenusMap.has(t2.word) && t3 && isFiniteWord(t3.word) && !nounGenusMap.has(t3.word)) {
              npEnd = cs + 3;
            }
            if (npEnd < 0) continue;
            const after = npEnd + 1 < range.end ? ctx.getTagged(npEnd + 1) : null;
            if (after && SUBJECT_PRONOUNS.has(after.word)) continue; // OVS guard
            const raw = [];
            for (let k = cs + 1; k <= npEnd; k++) raw.push(ctx.tokens[k]);
            const original = raw.map(t => t.display).join(' ');
            const verbDisp = raw[raw.length - 1].display;
            const rest = raw.slice(0, -1).map(t => t.display).join(' ');
            const verbTok = ctx.tokens[npEnd]; // span the verb — det-area spans
            // collide with gender/possessive findings in dedupeOverlapping
            findings.push({
              rule_id: rule.id,
              priority: rule.priority,
              start: verbTok.start,
              end: verbTok.end,
              original: original,
              fix: verbDisp + ' ' + rest,
              message: original + ' → ' + verbDisp + ' ' + rest + ' (V2)',
              severity: 'warning',
              noAutoFix: true,
            });
            emitted = true;
          }
          if (emitted) continue;
        }

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
          // Particles are never the finite verb ("er es NICHT geschafft"
          // stem-matched as a verb) — Ordbank sweep 2026-07.
          if (nw === 'nicht' || nw === 'auch' || nw === 'nur' || nw === 'schon' || nw === 'noch' || nw === 'sehr') continue;

          // The "verb" is really a coordinating conjunction homograph (sondern/
          // denn also exist as verb forms) — not a finite verb here. Fixes
          // "Nicht nur er, sondern auch sie kommt." flagging "er sondern".
          if (COORD_CORRELATIVE.has(nw)) continue;

          // Participle bracket: a candidate that is also a known past participle,
          // preceded by a perfect/passive auxiliary in the same clause, is the
          // clause-final participle ("…habe ich es versucht"), not a misplaced
          // finite verb. "versucht"/"studiert"/… are participle+3sg homographs.
          const partAux = ctx.vocab && ctx.vocab.participleToAux;
          if (partAux && partAux.has(nw)) {
            let auxBefore = false;
            for (let j = range.start; j < i; j++) {
              const gap = j > range.start ? ctx.text.slice(ctx.tokens[j - 1].end, ctx.tokens[j].start) : '';
              if (/[.,;:!?]/.test(gap)) auxBefore = false;        // reset at a clause boundary
              if (PERFECT_AUX.has(ctx.getTagged(j).word)) auxBefore = true;
            }
            if (auxBefore) continue;
          }

          // Coordinating conjunction / correlative lead before the subject:
          // "und/oder/aber/denn/sondern" and "entweder/weder/noch/sowohl" all
          // keep SVO order, so [conj][subject][verb] is valid (no forced V2).
          if (i > range.start) {
            const prevWord = ctx.getTagged(i - 1).word;
            if (COORD_CORRELATIVE.has(prevWord)) continue;
            // Subordinator directly before the subject pronoun opens a
            // verb-final clause even without the (required) comma: "Ich
            // weiß das es stimmt." — das/dass before a PRONOUN is never a
            // determiner, always a complementizer/relative, so [subject]
            // [finite] there is correct subordinate order, not V3.
            if (SUBORDINATORS.has(prevWord) || prevWord === 'das' || prevWord === 'die' || prevWord === 'der') continue;
            // wie/wo open verb-final relative-adverb clauses ("Die Art,
            // wie sie spricht"); a pronoun directly after another subject
            // pronoun is the OBJECT ("hätte er es nicht geschafft").
            // (mid-sentence only: sentence-initial "Wie du heißt?" is the
            // fronted-question error and must still flag)
            if ((prevWord === 'wie' || prevWord === 'wo') && i - 1 > range.start) continue;
            if (SUBJECT_PRONOUNS.has(prevWord)) continue;
            // Pronoun directly after a preposition is a PP OBJECT, not the
            // subject — "Ohne sie gehe ich nicht." is correct inversion
            // around the fronted PP ('sie' is acc-ambiguous; for du/er the
            // case error belongs to the prep-case rules, not V2).
            const V2_PREPS = ['ohne', 'für', 'gegen', 'durch', 'um', 'mit',
              'bei', 'nach', 'von', 'zu', 'aus', 'seit', 'an', 'auf', 'in',
              'über', 'unter', 'vor', 'hinter', 'neben', 'zwischen'];
            if (V2_PREPS.indexOf(prevWord) !== -1) continue;
          }

          // Relative clause via preposition + relative pronoun: "Das Haus
          // in dem ich wohne ist alt." — [prep][dem/denen/…][subject][verb]
          // opens a verb-final relative clause (students often drop the
          // comma), so [subject][finite] there is correct, not V3.
          if (i - 2 >= range.start) {
            const rel = ctx.getTagged(i - 1).word;
            const prep = ctx.getTagged(i - 2).word;
            const REL_PRON = ['dem', 'der', 'den', 'denen', 'deren', 'dessen', 'die', 'das'];
            const REL_PREPS = ['in', 'an', 'auf', 'mit', 'von', 'zu', 'bei', 'nach',
              'über', 'unter', 'vor', 'hinter', 'neben', 'zwischen', 'für',
              'durch', 'gegen', 'ohne', 'um', 'aus', 'seit'];
            if (REL_PRON.indexOf(rel) !== -1 && REL_PREPS.indexOf(prep) !== -1) continue;
          }

          // Clause-start coordinator: if the clause containing the subject opens
          // (sentence head or first token after a comma) with a coordinator/
          // correlative, the whole clause keeps SVO — covers the continuation
          // half "…, sondern auch sie kommt." / "…, oder du bleibst hier.".
          {
            let clauseStart = range.start;
            for (let j = range.start + 1; j <= i; j++) {
              if (/[,;:]/.test(ctx.text.slice(ctx.tokens[j - 1].end, ctx.tokens[j].start))) clauseStart = j;
            }
            if (COORD_CORRELATIVE.has(ctx.getTagged(clauseStart).word)) continue;
            // The subject pronoun IS the clause start (sentence head or first
            // token after a comma) → subject-first, nothing fronted, so V2 is
            // satisfied. "Der Lehrer sagt, ich soll …" / "…, ich komme später."
            // are correct; only a FRONTED element before the subject in the same
            // clause makes "[fronted][subject][verb]" a V3 error.
            if (clauseStart === i) continue;
          }

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

          // V2-already-satisfied guard: if the token IMMEDIATELY before the
          // subject is itself a finite verb, the structure is
          // [fronted constituent][finite verb][subject] — correct inversion
          // ("Heute kann ich kommen"). The token after the subject is then a
          // non-finite verb in the modal/perfect bracket (infinitive "kommen")
          // or a coincidental finite homograph; flagging it is a false
          // positive. Real V2 errors put the subject BEFORE the finite verb
          // ("Heute ich kann kommen"), so the pre-subject token is the fronted
          // element, not a verb. Checking only i-1 (not the whole sentence)
          // keeps later clauses in long sentences flaggable.
          if (i > range.start) {
            const pw = ctx.getTagged(i - 1).word;
            if ((ctx.vocab.knownPresens && ctx.vocab.knownPresens.has(pw)) ||
                (ctx.vocab.knownPreteritum && ctx.vocab.knownPreteritum.has(pw)) ||
                isFiniteOrUnseparated(pw, ctx)) {
              continue;
            }
          }

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
