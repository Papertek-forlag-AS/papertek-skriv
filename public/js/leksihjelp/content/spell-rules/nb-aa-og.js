/**
 * Spell-check rule: Norwegian å/og confusion detection (priority 15).
 *
 * The single most common writing error for Norwegian students:
 * - "og" used where "å" (infinitive marker) is needed
 * - "å" used where "og" (conjunction) is needed
 *
 * Handles posture-verb exceptions ("sitter og leser" is correct).
 *
 * Rule ID: 'aa_og'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase, escapeHtml } = core;

  // Verbs and adjectives that take an infinitive complement (X å gjøre).
  // When "og" appears between one of these and a verb form, it should be "å".
  const INFINITIVE_TRIGGERS = new Set([
    // Verbs (present + preteritum forms)
    'liker', 'likte', 'pleier', 'pleide', 'begynner', 'begynte',
    'prøver', 'prøvde', 'ønsker', 'ønsket', 'elsker', 'elsket',
    'hater', 'hatet', 'slutter', 'sluttet', 'fortsetter', 'fortsatte',
    'kommer', 'kom', 'lærer', 'lærte', 'trenger', 'trengte',
    'hjelper', 'hjalp', 'klarer', 'klarte', 'husker', 'husket',
    'nekter', 'nektet', 'nekta', 'håper', 'håpet', 'håpa',
    'forsøker', 'forsøkte', 'velger', 'valgte', 'bestemmer', 'bestemte',
    'lover', 'lovet', 'lova', 'glemmer', 'glemte',
    'gidder', 'gadd', 'orker', 'orket', 'orka',
    'våger', 'våget', 'våga', 'tør', 'turte', 'turde',
    'rekker', 'rakk',
    // Adjective/adverb triggers (det er X å gjøre)
    'godt', 'fint', 'viktig', 'vanskelig', 'lett', 'moro', 'gøy',
    'kjedelig', 'umulig', 'klart', 'farlig', 'trygt', 'morsomt',
    'enkelt', 'nødvendig', 'mulig', 'greit', 'dumt', 'lurt', 'rart', 'vanlig',
    // ── Nynorsk equivalents (the rule serves both NB and NN) ──
    // verbs (present + preteritum)
    'likar', 'plar', 'byrjar', 'byrja', 'ønskjer', 'ønskte', 'elskar', 'elska',
    'hatar', 'hata', 'sluttar', 'slutta', 'kjem', 'treng', 'trong',
    'hjelpte', 'klarar', 'hugsar', 'hugsa', 'nektar', 'håpar', 'håpa',
    'vel', 'valde', 'gløymer', 'gløymde', 'orkar', 'vågar', 'rekk',
    // adjective/adverb triggers (NN spellings)
    'vanskeleg', 'kjedeleg', 'umogleg', 'farleg', 'mogleg', 'vanleg', 'morosamt', 'naudsynt',
  ]);

  // Posture/motion verbs — "sitter og leser" is grammatically correct
  // (progressive aspect). Both NB and NN present + preteritum forms.
  const POSTURE_VERBS = new Set([
    // sitte
    'sitter', 'sit', 'satt', 'sat',
    // stå
    'står', 'staar', 'stod', 'sto',
    // ligge
    'ligger', 'ligg', 'lå', 'la', 'laag', 'låg',
    // gå
    'går', 'gikk', 'gjekk',
    // henge
    'henger', 'heng', 'hang', 'hengte',
  ]);

  // Tokens after "å" that indicate it should be "og" (conjunction, not infinitive marker).
  const PRONOUNS = new Set([
    'jeg', 'eg', 'du', 'han', 'hun', 'ho', 'vi', 'dere', 'de', 'dei', 'man',
  ]);
  const ARTICLES_POSSESSIVES = new Set([
    'en', 'ei', 'et', 'eit', 'den', 'det', 'de', 'dei',
    'min', 'mi', 'mitt', 'mine', 'din', 'di', 'ditt', 'dine',
    'vår', 'vårt', 'våre', 'hans', 'hennes', 'hennar', 'deres', 'deira',
  ]);
  const PREPOSITIONS = new Set(['i', 'på', 'med', 'til', 'fra', 'for', 'om', 'av', 'ut', 'inn', 'opp', 'ned']);

  // Prepositions that canonically take an infinitive complement
  // ("kommer til å huske", "for å lære", "uten å si noe"). When `prev` is
  // one of these, "å" is the infinitive marker — must NOT be flagged as
  // misplaced "og".
  // Phase 48 C11: "med" added — "med å [verb]" is a productive NB construction
  // meaning "by doing X" / "with the act of X-ing" ("en bra jobb med å formidle
  // død og sorg"). Without this, aa_og fired "å → og" wherever an infinitive
  // verb after "med å" wasn't in our verb maps (which is common because
  // Ordbank validWords doesn't carry POS).
  const INFINITIVE_PREPS = new Set(['til', 'for', 'uten', 'utan', 'ved', 'etter', 'før', 'om', 'mot', 'med']);

  const rule = {
    id: 'aa_og',
    languages: ['nb', 'nn'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (nb-aa-og) — Chrome native parity confirmed in 33-03 audit: NB å/og confusion is single-token typo lookup; Chrome native flags neither but fix is single-token",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `<strong>Å</strong> er infinitivsmerke (foran verb). <strong>Og</strong> er bindeord (binder like ledd). Bytt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `<strong>Å</strong> er infinitivsmerke (føre verb). <strong>Og</strong> er bindeord (bind like ledd). Byt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      const verbForms = vocab.verbForms || new Map();
      const verbInfinitive = vocab.verbInfinitive || new Map();
      const validWords = vocab.validWords || new Set();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        const word = t.word.toLowerCase();
        const prev = i > 0 ? tokens[i - 1].word.toLowerCase() : null;
        const next = i < tokens.length - 1 ? tokens[i + 1].word.toLowerCase() : null;

        // ── Direction 1: "og" should be "å" ──
        if (word === 'og' && next && prev) {
          // Check posture verb exception first: V_posture + og + V → correct
          if (POSTURE_VERBS.has(prev)) continue;
          // Also check prev-prev for subject pronoun intervening: "hun sitter og leser"
          if (i > 1) {
            const prevPrev = tokens[i - 2].word.toLowerCase();
            if (POSTURE_VERBS.has(prevPrev) && PRONOUNS.has(prev)) continue;
          }

          // Finite-verb coordination: "Bussane kom og gjekk" — both verbs
          // are conjugated, so "og" is the coordinator, not a misplaced
          // infinitive marker. verbInfinitive.keys are inflected (finite)
          // forms; values are infinitives. When next is a key whose value
          // differs and isn't a phrasal-verb infinitive (containing a
          // space — those pollute the map with the simplex stem), we know
          // next is finite and the rule must not fire.
          if (verbInfinitive.has(next)) {
            const nextInf = verbInfinitive.get(next);
            if (typeof nextInf === 'string' && nextInf && nextInf !== next && !nextInf.includes(' ')) {
              continue;
            }
          }

          // Allow ONE intervening negation between "og" and the infinitive:
          // "viktig og ikke gi opp" → "viktig å ikke gi opp". Gated on the
          // trigger + verb checks below, so it stays narrow (prev must be an
          // infinitive trigger AND the post-negation token must be a verb).
          const NEGATIONS = new Set(['ikke', 'ikkje']);
          let verbCand = next;
          if (NEGATIONS.has(next) && i + 2 < tokens.length) {
            verbCand = tokens[i + 2].word.toLowerCase();
          }

          // Check if next is a verb form and prev is an infinitive trigger.
          // V2-inversion case: "Om kvelden prøvde jeg og skrive" — the
          // subject pronoun (jeg) sits between trigger (prøvde) and og.
          // When prev is a pronoun, peek one further back for a trigger.
          const nextIsVerb = verbForms.has(verbCand) || verbInfinitive.has(verbCand) || validWords.has('å ' + verbCand);
          let triggerHit = INFINITIVE_TRIGGERS.has(prev);
          if (!triggerHit && PRONOUNS.has(prev) && i > 1) {
            const prevPrev = tokens[i - 2].word.toLowerCase();
            if (INFINITIVE_TRIGGERS.has(prevPrev)) triggerHit = true;
          }
          if (nextIsVerb && triggerHit) {
            out.push({
              rule_id: 'aa_og',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'å'),
              suggestions: [matchCase(t.display, 'å')],
              message: `Forveksling: "og" etter verb/adjektiv som tar infinitiv. Prøv "å".`,
            });
            if (suppressed) suppressed.add(i);
          }
        }

        // ── Direction 2: "å" should be "og" ──
        else if (word === 'å' && next) {
          // Dialect-cross verb check: when student mixes dialects (writes
          // "hyggelig å være" in NN), the NB-form `være` won't be in NN's
          // verbForms / verbInfinitive maps, so without this fallback the
          // rule misreads "å være" as å-between-non-verbs and FP-suggests
          // "og". sisterValidWords contains the other-dialect vocab; we
          // accept it as a verb-likely signal because the prev/next slot
          // is being used as a verb regardless of register. Dialect-mix
          // handles the register flag on the next token separately.
          const sisterValidWords = vocab.sisterValidWords || new Set();
          const nounGenus = vocab.nounGenus || new Map();
          const isVerbLike = (w) => {
            if (verbForms.has(w) || verbInfinitive.has(w)) return true;
            if (validWords.has('å ' + w)) return true;
            // Sister-dialect verb form: when the next token is in the other
            // dialect's vocab, treat it as verb-likely. The "å + sister-form"
            // pattern is overwhelmingly infinitive in student writing —
            // student wrote "å være" thinking NB; the dialect-mix rule flags
            // `være → vere` separately. Without this, aa_og false-fires
            // "å → og" because the NN data carries `være` as NB-leak data.
            //
            // BUT: NB and NN share most nouns ("kake", "katt", "kaffe", …),
            // so a bare sister-vocab membership check would treat any noun
            // as verb-likely. Suppress the sister fallback when the token
            // is a known noun in the current dialect and is NOT in our verb
            // maps — pure-noun cases like "kaffe å kake" must reach the
            // coordinate-structure path below.
            if (sisterValidWords.has(w) && !nounGenus.has(w)
                && !ARTICLES_POSSESSIVES.has(w) && !PRONOUNS.has(w) && !PREPOSITIONS.has(w)) {
              return true;
            }
            return false;
          };
          // Sentence-initial "å" + verb → valid infinitive marker ("Å lese er gøy")
          if (i === 0) {
            if (isVerbLike(next)) continue;
          }

          // If "å" is followed by a verb, it's a valid infinitive marker — skip
          if (isVerbLike(next)) continue;

          // Preposition + å + (anything) — preposition takes infinitive
          // complement. "kommer til å huske", "for å lære", "uten å si noe".
          // verbInfinitive doesn't always cover every infinitive (some land
          // only as 'å X' bigrams in validWords); when prev is one of these
          // canonical infinitive-taking prepositions, å is the infinitive
          // marker regardless of whether next is in our verb maps.
          if (prev && INFINITIVE_PREPS.has(prev)) continue;

          // Quantifier/degree word + å → infinitive relative ("mye å glede seg
          // ved", "mer å si", "nok å gjøre", "ingenting å frykte") — the å is
          // the infinitive marker even when the following verb is missing from
          // the verb maps or is a noun homograph (glede).
          const QUANT_BEFORE_INF = new Set(['mye', 'mykje', 'mer', 'meir', 'mest',
            'lite', 'litt', 'nok', 'noe', 'noko', 'ingenting', 'alt', 'mangt',
            'masse', 'lett', 'vanskelig', 'vanskeleg', 'umulig', 'umogleg']);
          if (prev && QUANT_BEFORE_INF.has(prev)) continue;

          // Inverted infinitive-trigger: "Liker du å binge serier?" — the
          // trigger verb sits BEFORE the subject pronoun (V2 question), so
          // check i-2 when prev is a pronoun. Direction 1 has the mirrored
          // check; without it here, a noun-homograph loan verb (binge) after
          // "å" fell through to the noun-coordination branch.
          if (prev && PRONOUNS.has(prev) && i > 1) {
            const pp = tokens[i - 2].word.toLowerCase();
            if (INFINITIVE_TRIGGERS.has(pp) || verbForms.has(pp) || verbInfinitive.has(pp)) continue;
          }

          // "å" followed by article, pronoun, or preposition → likely "og"
          if (ARTICLES_POSSESSIVES.has(next) || PRONOUNS.has(next) || PREPOSITIONS.has(next)) {
            out.push({
              rule_id: 'aa_og',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'og'),
              suggestions: [matchCase(t.display, 'og')],
              message: `Forveksling: "å" foran ikke-verb. Prøv "og".`,
            });
            if (suppressed) suppressed.add(i);
            continue;
          }

          // "å" between two non-verb words (noun å noun pattern like "kaffe å
          // kake"). Require `next` to be a KNOWN NOUN — otherwise an unknown
          // word is more likely an unrecognised infinitive ("skikk å tenna" —
          // tenna = "to light", missing from the verb vocab) than a coordinated
          // noun, and suggesting "og" is wrong. Real-NN-text FP.
          if (prev && nounGenus.has(next) &&
              !verbForms.has(prev) && !validWords.has('å ' + prev) &&
              !INFINITIVE_TRIGGERS.has(prev) && !POSTURE_VERBS.has(prev)) {
            // prev is not a verb, next is not a verb → coordinate structure
            out.push({
              rule_id: 'aa_og',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'og'),
              suggestions: [matchCase(t.display, 'og')],
              message: `Forveksling: "å" mellom to ikke-verb. Prøv "og".`,
            });
            if (suppressed) suppressed.add(i);
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
