/**
 * Spell-check rule: 3rd-person reflexive vs non-reflexive possessive
 * (priority 30). Bilingual NB + NN.
 *
 * Pedagogical target — one of the highest-value Norwegian grammar
 * distinctions, especially for NN students:
 *
 *   "Per kjørte hans bil"   → reflexive expected: "sin bil" / "bilen sin"
 *   "Ho leste hennar bok"   → reflexive expected: "si bok" / "boka si"
 *   "Dei tok deira bilar"   → reflexive expected: "sine bilar"
 *
 * In standard NB and NN, when the possessor IS the subject of the
 * clause, you must use the reflexive forms sin / si / sitt / sine
 * (agreeing with the gender + number of the POSSESSED noun, NOT the
 * possessor). The non-reflexive hans / hennar / hennes / deira / deres
 * forms are for possessors DIFFERENT from the clause subject.
 *
 * Detection scope — same-clause subject + matching possessive (V1):
 *
 *   <3rd-person-subject-pronoun> <finite-verb> ... <hans|hennar|hennes
 *   |deira|deres> <noun>                          (pre-nominal poss)
 *
 *   <3rd-person-subject-pronoun> <finite-verb> ... <noun> <hans|hennar
 *   |hennes|deira|deres>                          (post-nominal poss)
 *
 * When the subject pronoun (han/hun/ho/de/dei) and the possessive
 * (hans/hennes/hennar/deres/deira) co-refer within a simple clause
 * (no coord conjunction or subordinator separating them, possessive
 * occurs AFTER the finite verb so it can't be part of a compound
 * subject like "Han og hans bror"), the possessive is by construction
 * reflexive — the only available antecedent is the subject — and
 * should be rendered as sin/si/sitt/sine.
 *
 * Gender agreement uses the noun's genus from vocab.nounGenus:
 *   m / m+f common gender → sin (nb-NB and nn-mf overlap fine)
 *   f                     → si  (NN strict; NB accepts both sin and si)
 *   n                     → sitt
 *   plural                → sine (detected by noun-form lookup)
 *
 * Rule ID: 'nb-nn-reflexive-possessive'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml, matchCase } = host.__lexiSpellCore || {};

  // Subject pronoun → non-reflexive possessive that, when co-referent,
  // should be flagged.
  const NB_REFL_MAP = new Map([
    ['han', { poss: 'hans', genus: 'm' }],
    ['hun', { poss: 'hennes', genus: 'f' }],
    ['de',  { poss: 'deres', genus: 'pl' }],
  ]);
  const NN_REFL_MAP = new Map([
    ['han', { poss: 'hans', genus: 'm' }],
    ['ho',  { poss: 'hennar', genus: 'f' }],
    ['dei', { poss: 'deira', genus: 'pl' }],
  ]);

  // Possessive lemma surface forms — used to scan after the verb.
  const ALL_NON_REFL_POSS = new Set(['hans', 'hennes', 'hennar', 'deres', 'deira']);

  // Subordinators that terminate the same-clause scan window. Mirrors
  // SUBORDINATORS from spell-check-core; copied here so the rule stays
  // self-contained and doesn't depend on core internals.
  const SUBORDINATORS = {
    nb: new Set(['fordi', 'at', 'som', 'når', 'hvis', 'selv', 'om', 'da', 'mens', 'etter', 'før', 'siden', 'dersom', 'enda', 'skjønt', 'ettersom']),
    nn: new Set(['fordi', 'at', 'som', 'når', 'viss', 'sjølv', 'om', 'då', 'medan', 'etter', 'før', 'sidan', 'dersom', 'endå', 'trass']),
  };

  // Coord conjunctions that also terminate the scan window.
  const COORD = new Set(['og', 'men', 'eller', 'for']);

  // Form-from-genus lookup. NN students are taught the agreement
  // explicitly; NB is more permissive but the same fix is acceptable.
  function reflexiveFor(genus, isPlural) {
    if (isPlural) return 'sine';
    if (genus === 'n') return 'sitt';
    if (genus === 'f') return 'si';
    return 'sin'; // m, mf, fallback
  }

  const rule = {
    id: 'nb-nn-reflexive-possessive',
    languages: ['nb', 'nn'],
    priority: 30,
    exam: {
      safe: false,
      reason: "Cross-token reflexive-binding analysis — multi-token grammatical reasoning, not single-form lookup",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain(finding) {
      const esc = escapeHtml || (s => s);
      const subj = esc(finding.subject || '');
      const orig = esc(finding.original || '');
      const fix = esc(finding.fix || '');
      const noun = esc(finding.noun || '');
      const nb = `Etter same subjekt skal eigedomsordet vere refleksivt. Når <em>${subj}</em> eig <em>${noun}</em>, bytt <em>${orig}</em> med <em>${fix}</em>.`;
      const nn = `Når same subjekt eig tingen, skal ein bruke det refleksive eigedomsordet. <em>${subj}</em> eig <em>${noun}</em>, så <em>${orig}</em> bør bli <em>${fix}</em>.`;
      return { nb, nn };
    },

    check(ctx) {
      const { text, tokens, vocab, lang, cursorPos, suppressed } = ctx;
      if (lang !== 'nb' && lang !== 'nn') return [];
      if (!Array.isArray(ctx.sentences) || ctx.sentences.length === 0) return [];

      const reflMap = lang === 'nb' ? NB_REFL_MAP : NN_REFL_MAP;
      const subs = SUBORDINATORS[lang];
      const nounGenus = vocab.nounGenus || new Map();
      const knownPresens = vocab.knownPresens || new Set();
      const knownPreteritum = vocab.knownPreteritum || new Set();
      const verbForms = vocab.verbForms || new Set();
      // Cross-dialect verb-form fallback. Lets the rule see "Han kjørte
      // hans bil" in NN context (kjørte is NB-form, not in NN's
      // knownPresens/Preteritum) and still flag the reflexive error
      // alongside the orthogonal NB-form leakage (which nn-verb-leakage
      // or dialect-mix handles separately). Only the NN→NB direction
      // is wired today; NB→NN sister-verb-form coverage can land later.
      const sisterVerbForms = vocab.sisterVerbForms || new Set();
      // Common modal verbs as a fallback for finite-verb detection.
      const MODALS = new Set(['skal', 'kan', 'må', 'vil', 'bør', 'lyt',
        'skulle', 'kunne', 'måtte', 'ville', 'burde', 'laut']);
      // Copulas — excluded from "predicate-with-object" verb detection.
      // "Han er hans bror" is a predicate-nominal construction, not a
      // transitive clause; the reflexive rule doesn't apply. Without
      // this exclusion the rule would FP on every copular sentence with
      // a predicate genitive.
      const COPULAS = new Set([
        'er', 'var', 'vere', 'være', 'vart', 'blei', 'blir', 'vert', 'vore', 'vært',
      ]);

      // Plural nouns: any token whose base form is in nounGenus but the
      // token itself ends in a typical plural marker. Cheaper than
      // building a separate plural index.
      function isPluralNoun(word) {
        if (nounGenus.has(word)) {
          // Lemma headword form, not necessarily plural — check suffix.
          return /(?:ar|er|ane|ene|a)$/.test(word) && word.length > 4;
        }
        // Surface-form might still be a noun via verbForms-like checks;
        // skip for now — covered by genus lookup below.
        return false;
      }

      function isFiniteVerb(word) {
        if (COPULAS.has(word)) return false;
        return knownPresens.has(word) || knownPreteritum.has(word) ||
               verbForms.has(word) || MODALS.has(word) ||
               sisterVerbForms.has(word);
      }

      // Map token index → sentence-end index for fast in-sentence scans.
      function sentenceEndForToken(tokIdx) {
        const tok = tokens[tokIdx];
        if (!tok) return tokens.length;
        for (const s of ctx.sentences) {
          if (tok.start >= s.start && tok.start < s.end) {
            // Find the last token index whose start < sentence end.
            let last = tokIdx;
            for (let j = tokIdx + 1; j < tokens.length; j++) {
              if (tokens[j].start >= s.end) break;
              last = j;
            }
            return last + 1;
          }
        }
        return tokens.length;
      }

      // Sentence-initial words that ARE capitalized but are NOT proper
      // nouns. Curated stop set protects against the FP class surfaced
      // by NB benchmark fp05: "Ute i hagen vokste blomstene hans …" —
      // "Ute" is sentence-initial adverb; the actual subject is implicit
      // via V2 inversion; 'hans' postnominal refers to earlier 'han'.
      // Without this set, the proper-noun path mis-identifies "Ute" as
      // subject and flags 'hans' for the reflexive 'sine'.
      const NOT_PROPER_NOUN = new Set([
        // Locative / directional adverbs
        'inne', 'ute', 'der', 'her', 'rundt', 'overalt', 'borte', 'oppe', 'nede',
        // Temporal adverbs
        'aldri', 'alltid', 'snart', 'først', 'fyrst', 'no', 'nå', 'da', 'då',
        'etter', 'før', 'sidan', 'siden',
        // Prepositions
        'i', 'på', 'til', 'fra', 'frå', 'med', 'av', 'for', 'ved', 'om', 'under', 'over',
        // Discourse particles / connectors / coord conj
        'vel', 'tja', 'ja', 'nei', 'jo', 'men', 'og', 'eller', 'så',
        // Subordinators / conditionals
        'hvis', 'viss', 'når', 'mens', 'medan', 'dersom', 'sjølv', 'selv',
        // Other common starters
        'kanskje', 'visselig', 'sikkert', 'naturligvis', 'rett', 'midt',
        'mange', 'fleire', 'flere', 'alle', 'all', 'både', 'litt',
      ]);

      // Proper-noun detection: token whose display starts uppercase AND
      // whose lowercased form isn't a known common noun AND isn't in the
      // sentence-initial stop set. Catches personal names like Per /
      // Maria / Anne while rejecting capitalized adverbs/prepositions
      // that happen to start sentences.
      function isProperNounSubject(tok) {
        if (!tok || !tok.display || tok.display.length === 0) return false;
        const first = tok.display[0];
        if (first !== first.toUpperCase() || first === first.toLowerCase()) return false;
        if (reflMap.has(tok.word)) return false;
        if (nounGenus.has(tok.word)) return false;
        if (NOT_PROPER_NOUN.has(tok.word)) return false;
        return true;
      }

      // For proper-noun subjects we can't infer the name's gender, so any
      // of the three 3rd-person possessive forms (hans/hennar/deira/hennes/
      // deres) in the predicate must be reflexive (no other antecedent
      // exists in the clause given the COORD/SUBORDINATOR scope guards).
      const ALL_NON_REFL_POSS = new Set();
      for (const [, e] of reflMap) ALL_NON_REFL_POSS.add(e.poss);

      const out = [];

      // A clause subject is never the object of a preposition. When the subject
      // candidate is immediately preceded by a preposition it sits inside a PP
      // ("til Grieg", "av han") and is NOT the subject — so it can't be the
      // reflexive antecedent. Real-NN-text FP: "Songane … til Grieg … kjærleiken
      // hans" flagged hans→si because "Grieg" was mis-read as the subject.
      const PREP_BEFORE = new Set([
        'til', 'av', 'for', 'på', 'i', 'med', 'om', 'ved', 'frå', 'fra', 'hjå', 'hos',
        'under', 'over', 'mot', 'etter', 'før', 'mellom', 'gjennom', 'utan', 'uten',
        'kring', 'omkring', 'blant', 'bak', 'framfor', 'mot', 'enn', 'som',
      ]);

      for (let i = 0; i < tokens.length; i++) {
        const subjTok = tokens[i];
        const pronounEntry = reflMap.get(subjTok.word);
        const isPropNoun = !pronounEntry && isProperNounSubject(subjTok);
        if (!pronounEntry && !isPropNoun) continue;
        if (suppressed && suppressed.has(i)) continue;
        // PP-object guard: skip when the previous token is a preposition.
        if (i > 0 && PREP_BEFORE.has(tokens[i - 1].word)) continue;

        // The subject should be followed by a finite verb within a token
        // or two (allowing an interceding adverb like "alltid").
        let verbIdx = -1;
        for (let j = i + 1; j < Math.min(tokens.length, i + 4); j++) {
          if (isFiniteVerb(tokens[j].word)) { verbIdx = j; break; }
        }
        if (verbIdx === -1) continue;

        // Scan forward from after the verb to end-of-sentence, stopping
        // at any subordinator or coord conjunction (clause boundary).
        // For pronoun subjects, accept only the matching possessive;
        // for proper-noun subjects, accept any 3rd-person non-reflexive
        // possessive (gender ambiguity precludes narrowing).
        const endIdx = sentenceEndForToken(i);
        for (let j = verbIdx + 1; j < endIdx; j++) {
          const t = tokens[j];
          if (subs && subs.has(t.word)) break;
          if (COORD.has(t.word)) break;
          if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
          const matchesPoss = pronounEntry
            ? t.word === pronounEntry.poss
            : ALL_NON_REFL_POSS.has(t.word);
          if (!matchesPoss) continue;
          // Phase 48 C9: proper-noun guard. `hans` (3sg.m possessive) is
          // also the male given name "Hans". Mid-sentence capitalization
          // is a strong proper-noun signal. Without this, "Hans sin død"
          // wrongly flagged "Hans → Sin" because lowercased Hans matches
          // ALL_NON_REFL_POSS. Same for hennes / deres if they ever appear
          // as capitalized proper-noun homophones in the future.
          if (t.display && t.display[0] !== t.display[0].toLowerCase()) {
            const gapBefore = text ? text.slice(0, t.start) : '';
            const isSentenceStart = /[.!?]\s*$/.test(gapBefore) || gapBefore.trim() === '';
            if (!isSentenceStart) continue;
          }

          // Determine noun + plural via pre-/post-nominal pattern.
          let nounTok = null;
          let isPlural = false;
          // Pre-nominal: poss directly followed by noun (or adj + noun;
          // accept the noun within 2 tokens).
          for (let k = j + 1; k < Math.min(endIdx, j + 3); k++) {
            const tk = tokens[k];
            if (subs && subs.has(tk.word)) break;
            if (COORD.has(tk.word)) break;
            if (nounGenus.has(tk.word)) { nounTok = tk; break; }
          }
          // Post-nominal: noun appears directly before the possessive
          // (bilen hans / boka hennar / pengane deira).
          if (!nounTok && j > verbIdx + 1) {
            const prev = tokens[j - 1];
            if (prev && nounGenus.has(prev.word)) {
              nounTok = prev;
            }
          }
          if (!nounTok) continue;

          isPlural = isPluralNoun(nounTok.word);
          const genus = nounGenus.get(nounTok.word) || 'm';
          const fixForm = reflexiveFor(genus, isPlural);
          const fix = matchCase ? matchCase(t.display, fixForm) : fixForm;

          out.push({
            rule_id: 'nb-nn-reflexive-possessive',
            priority: rule.priority,
            severity: 'warning',
            start: t.start,
            end: t.end,
            original: t.display,
            fix,
            subject: subjTok.display,
            noun: nounTok.display,
            message: `Refleksiv eigedom: "${subjTok.display} … ${t.display} ${nounTok.display}" → "${fix} ${nounTok.display}"`,
          });

          // One finding per (subject, possessive) pair. Move on to next
          // subject candidate.
          break;
        }
      }

      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
