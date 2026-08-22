/**
 * Spell-check rule: German separable-verb split (DE-02, priority 49).
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

  // v3.0.118 (synthetic clean-control FP): tokens whose presence in the
  // clause makes an UNSPLIT separable verb correct — modal/aux/werden frames
  // govern an infinitive ("will früh aufstehen", "aufstehen muss"), and a
  // subordinator puts the clause in verb-final order ("weil ich früh
  // aufstehen muss"). The sentence-level isMainClause() check misses
  // subclauses that FOLLOW a main clause in the same sentence.
  const INFINITIVE_GOVERNORS = new Set([
    'kann', 'kannst', 'können', 'könnt', 'konnte', 'konnten',
    'muss', 'musst', 'müssen', 'müsst', 'musste', 'mussten',
    'soll', 'sollst', 'sollen', 'sollt', 'sollte', 'sollten',
    'will', 'willst', 'wollen', 'wollt', 'wollte', 'wollten',
    'darf', 'darfst', 'dürfen', 'dürft', 'durfte', 'durften',
    'mag', 'magst', 'mögen', 'mögt', 'mochte', 'mochten',
    'möchte', 'möchtest', 'möchten', 'möchtet',
    'werde', 'wirst', 'wird', 'werden', 'werdet',
    // NOTE: 'zu' is deliberately NOT here — it matches adverbial "zu spät"
    // / "zu schnell" and a DIFFERENT verb's zu-infinitive ("sie aufhört zu
    // singen"), silencing genuine unsplit-verb errors. The zu-infinitive of
    // a separable verb is infixed ("aufzustehen") and never matches the
    // unsplit-form detector anyway.
  ]);
  const SUBORDINATORS = new Set([
    'dass', 'weil', 'wenn', 'ob', 'obwohl', 'als', 'bevor', 'nachdem',
    'damit', 'sodass', 'solange', 'sobald', 'seit', 'seitdem', 'während',
    'indem', 'falls',
    // Interrogative W-words introducing indirect questions / relative clauses,
    // which are ALSO verb-final ("… wie das aussieht", "… wann die Schule
    // anfängt", "… wie man das Gerät einschaltet") — the separable verb stays
    // unsplit at the end, so it must not be flagged.
    'wie', 'wann', 'wo', 'warum', 'wieso', 'weshalb', 'wobei', 'wodurch',
    'womit', 'wohin', 'woher', 'welche', 'welcher', 'welches', 'welchen', 'welchem',
  ]);

  // Finite perfect/passive auxiliaries. A separable-verb-shaped token PRECEDED
  // by one in its clause is a past participle ("sind … ausverkauft", "ist
  // angekommen"), not a finite V2 verb to split.
  const PERFECT_AUX = new Set([
    'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart',
    'habe', 'hast', 'hat', 'haben', 'habt', 'hatte', 'hattest', 'hatten', 'hattet',
  ]);

  const rule = {
    id: 'de-separable-verb',
    languages: ['de'],
    priority: 49,
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

          // Wikipedia-corpus precision (D3-companion, 2026-06-12): skip
          // mid-sentence CAPITALIZED tokens — in German those are nouns
          // (das Vorkommen, der Aufstand, die Ausnahmen), which are
          // substantivized homographs of the separable forms this rule
          // hunts. Sentence-initial capitals still pass through (k > start
          // check below would lose real findings otherwise).
          if (i > range.start && /^\p{Lu}/u.test(ctx.tokens[i].display)) continue;

          // Try each separable prefix
          let matchedPrefix = null;
          let stem = null;

          for (const prefix of SORTED_PREFIXES) {
            if (word.startsWith(prefix) && word.length > prefix.length + 1) {
              const candidate = word.slice(prefix.length);
              // A separable verb's INFINITIVE is correctly written joined
              // ("einkaufen", "nachdenken", "aufstehen") — only an unsplit
              // FINITE form in V2 is the error ("Ich einkaufe"). The candidate
              // stem matches knownPresens via the syncretic wir/sie -en form,
              // which equals the infinitive. A finite SINGULAR form (kaufe/
              // kaufst/kauft, stehe/steht) never ends in -en, so an -en
              // candidate means the whole word is the infinitive → skip
              // ("gehen einkaufen", "würde nachdenken" are both correct).
              // Exception (Ordbank sweep 2026-07): directly after "wir" the
              // syncretic -en form IS finite ("wir anfangen morgen" → "wir
              // fangen morgen an") — wir is unambiguous, so no infinitive
              // reading exists there.
              const afterWir = i > range.start && ctx.tokens[i - 1].word === 'wir';
              if (candidate.endsWith('en') && !afterWir) continue;
              // Check if the stem is a known finite verb form
              if (knownPresens.has(candidate) || knownPreteritum.has(candidate)) {
                matchedPrefix = prefix;
                stem = candidate;
                break;
              }
            }
          }

          if (!matchedPrefix) continue;

          // v3.0.118: comma-bounded clause scan — any infinitive governor or
          // subordinator in the token's own clause → unsplit form is correct.
          let clauseStart = range.start;
          let clauseEndTok = range.end;
          for (let k = i; k > range.start; k--) {
            const gap = ctx.text.slice(ctx.tokens[k - 1].end, ctx.tokens[k].start);
            if (/[,;:]/.test(gap)) { clauseStart = k; break; }
          }
          for (let k = i + 1; k < range.end; k++) {
            const gap = ctx.text.slice(ctx.tokens[k - 1].end, ctx.tokens[k].start);
            if (/[,;:]/.test(gap)) { clauseEndTok = k; break; }
          }
          let infinitiveContext = false;
          for (let k = clauseStart; k < clauseEndTok; k++) {
            if (k === i) continue;
            const w2 = ctx.tokens[k].word;
            if (INFINITIVE_GOVERNORS.has(w2) || SUBORDINATORS.has(w2)) { infinitiveContext = true; break; }
            // A perfect/passive auxiliary BEFORE the token → the token is a past
            // participle ("sind … ausverkauft"), not a finite verb to split.
            if (k < i && PERFECT_AUX.has(w2)) { infinitiveContext = true; break; }
          }
          if (infinitiveContext) continue;

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
