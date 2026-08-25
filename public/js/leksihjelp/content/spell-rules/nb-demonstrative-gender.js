/**
 * Spell-check rule: demonstrative-gender mismatch (priority 12).
 *
 * Phase 18. Flags demonstrative + noun pairs where the demonstrative's
 * grammatical gender does not match the noun's gender:
 *   "Det boka" -> "Den boka"  (boka = f, needs den)
 *   "Denne huset" -> "Dette huset" (huset = n, needs dette)
 *
 * Checks both immediately next word and 2-ahead (catches adjective gap:
 * "Det store boka" where an adjective sits between).
 *
 * In Bokmal, feminine nouns accept the common-gender demonstrative "den"/"denne"
 * too: "den boka" and "denne boka" are both correct. Only flags strict mismatches.
 *
 * Trigger words: den, det, denne, dette — DISJOINT from nb-gender.js articles
 * (en/ei/et for NB, ein/ei/eit for NN). No collision possible.
 *
 * Rule ID: 'nb-demonstrative-gender'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml, getString } = host.__lexiSpellCore || {};

  // Demonstrative -> expected gender mapping per language.
  // den/denne = m/f (common gender in NB), det/dette = n.
  const DEM_GENUS = {
    nb: { 'den': 'mf', 'det': 'n', 'denne': 'mf', 'dette': 'n' },
    nn: { 'den': 'mf', 'det': 'n', 'denne': 'mf', 'dette': 'n' },
  };

  // Fix mapping: given actual noun genus, which demonstrative to use.
  const GENUS_DEM = {
    simple:  { m: 'den',   f: 'den',   n: 'det' },
    proximal: { m: 'denne', f: 'denne', n: 'dette' },
  };

  // Phase 05.1 Gap C pattern: genus code -> i18n label key.
  const GENUS_TO_LABEL_KEY = { m: 'gender_label_m', f: 'gender_label_f', n: 'gender_label_n' };

  /**
   * Determine demonstrative type: 'simple' for den/det, 'proximal' for denne/dette.
   */
  function demType(word) {
    if (word === 'den' || word === 'det') return 'simple';
    if (word === 'denne' || word === 'dette') return 'proximal';
    return null;
  }

  /**
   * Check if a demonstrative's expected gender matches the actual noun gender.
   * 'mf' = common gender, accepts both m and f.
   * NB common-gender tolerance: 'den'/'denne' accept f nouns in NB.
   */
  function genderMatch(demExpected, actual, lang) {
    if (demExpected === 'mf') {
      // den/denne expects m or f
      return actual === 'm' || actual === 'f';
    }
    if (demExpected === 'n') {
      return actual === 'n';
    }
    return false;
  }

  const rule = {
    id: 'nb-demonstrative-gender',
    languages: ['nb', 'nn'],
    priority: 12,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (nb-demonstrative-gender) — Chrome native parity confirmed in 33-03 audit: NB demonstrative gender lookup against noun gender map; single-token suggestion",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      const labelKey = GENUS_TO_LABEL_KEY[finding.actualGenus];
      const nounDisplay = finding.noun_display;
      if (!labelKey || !nounDisplay || typeof getString !== 'function') {
        return {
          nb: `<em>${escapeHtml(finding.original)}</em> kan være feil kjønn — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `<em>${escapeHtml(finding.original)}</em> kan vere feil kjønn — prøv <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      const labelNb = getString(labelKey, 'nb');
      const labelNn = getString(labelKey, 'nn');
      return {
        nb: `<em>${escapeHtml(finding.original)}</em> kan være feil kjønn — <em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNb)}. Prøv <em>${escapeHtml(finding.fix)}</em>.`,
        nn: `<em>${escapeHtml(finding.original)}</em> kan vere feil kjønn — <em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNn)}. Prøv <em>${escapeHtml(finding.fix)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const verbInfinitive = vocab.verbInfinitive || new Map();
      // Copula verbs that precede expletive det/den: "er det helt greit",
      // "blir det fint vær", "var det merkelig". When the demonstrative
      // sits right after one of these, it's almost always anaphoric or
      // expletive — not modifying a nominal head — so skip the rule.
      const COPULAS = new Set([
        'er', 'var', 'blir', 'ble', 'vart', 'verte', 'vere', 'være',
      ]);
      // Quantifiers/determiners that don't form a "Det <adj> N" chain.
      const NON_BRIDGING = new Set(['kvar', 'kver', 'hver', 'hvert', 'kvart']);
      // Articles, demonstratives, possessives, coordinators, and common
      // prepositions cannot occupy the adjective slot in "Dem ADJ N".
      // Without this guard, "blir det en uke" (expletive det + indef.
      // article + noun) misfires as "det" demonstrating an f-noun "uke".
      const NOT_ADJ_SLOT = new Set([
        'en', 'ei', 'et', 'eit', 'ein',
        'den', 'det', 'denne', 'dette', 'disse', 'desse', 'de', 'dei',
        'min', 'mi', 'mitt', 'mine', 'din', 'di', 'ditt', 'dine',
        'sin', 'si', 'sitt', 'sine', 'hans', 'hennes', 'hennar',
        'vår', 'vårt', 'våre', 'deres', 'deira', 'dykkar',
        'og', 'men', 'eller', 'for', 'så',
        'i', 'på', 'til', 'fra', 'frå', 'med', 'av', 'om', 'ved',
        'før', 'etter', 'mot', 'under', 'over', 'mellom', 'gjennom',
        'uten', 'utan',
      ]);
      // Plan 50-07 Finding B — sentential adverbs that occupy the adjective
      // slot but actually modify a following past-participle verb. Mirrors
      // the set in nb-double-definiteness.js. Curated; base-form adjectives
      // never collide with these tokens so positive cases are unaffected.
      const ADVERB_NOT_ADJ = new Set([
        'fullstendig', 'helt', 'delvis', 'allerede', 'nesten', 'ganske',
        'snart', 'plutselig', 'straks', 'umiddelbart', 'endelig', 'omsider',
        'fortsatt', 'stadig', 'aldri', 'ofte', 'sjelden', 'alltid',
      ]);
      // "Heil/hel" (whole) in the adjective slot marks a quantificational
      // time-adverbial — "(verb) det heile dagen" = "…all day long", where
      // `det` is the expletive/inverted subject, not a demonstrative head.
      // Descriptive adjectives (store, raude, gamle) still bridge, so genuine
      // demonstrative-gender errors ("det store boka" → "den store boka") fire.
      // (heilt/helt are adverb forms — already covered by ADVERB_NOT_ADJ.)
      const WHOLE_QUANT = new Set(['heil', 'heile', 'hel', 'hele']);
      const demGenus = DEM_GENUS[lang];
      if (!demGenus) return [];
      const out = [];

      function sameSentence(a, b) {
        if (!Array.isArray(ctx.sentences) || ctx.sentences.length === 0) return true;
        let aSent = -1, bSent = -1;
        for (let s = 0; s < ctx.sentences.length; s++) {
          const sent = ctx.sentences[s];
          if (a >= sent.start && a < sent.end) aSent = s;
          if (b >= sent.start && b < sent.end) { bSent = s; break; }
        }
        if (aSent === -1 || bSent === -1) return true;
        return aSent === bSent;
      }

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const demExpected = demGenus[t.word];
        if (!demExpected) continue;

        // Expletive/anaphoric guard: when "det"/"den" follows a copula or
        // auxiliary verb ("er det greit", "blir den brukt", "har det tre
        // kameraer"), the pronoun is rarely a determiner of the next noun
        // phrase — it's expletive subject, anaphoric reference, or part
        // of a copular construction whose predicate is adjectival, not
        // nominal. Skip to avoid flagging pseudo-noun homographs (helt =
        // adverb/noun, tre = number/noun, etc.).
        if (i > 0) {
          const prev = tokens[i - 1];
          if (prev && COPULAS.has(prev.word)) continue;
        }

        // Look ahead: next token (i+1) or 2-ahead (i+2) for adjective gap.
        let nounTok = null;
        const next = tokens[i + 1];
        const twoAhead = tokens[i + 2];
        // Present-participle / multi-part adjectives absent from isAdjective.
        const SUPP_ADJ = new Set(['videregående', 'fullskala', 'smertestillende',
          'kommende', 'nåværende', 'påfølgende', 'foregående', 'omkringliggende']);
        const isAdj = (w) => (vocab.isAdjective && vocab.isAdjective.has(w))
          || (vocab.adjLemma && vocab.adjLemma.has(w)) || SUPP_ADJ.has(w);
        // A finite verb after the demonstrative means it is the EXPLETIVE/
        // anaphoric "det/den" ("det morer meg", "det haster", "det dufter
        // parfyme"), not a determiner. verbInfinitive keys conjugated→inf but
        // misses many present/preterite forms, so also consult knownPresens/
        // knownPreteritum.
        const knownPresens = vocab.knownPresens || new Set();
        const knownPreteritum = vocab.knownPreteritum || new Set();
        const isFiniteVerb = (w) => verbInfinitive.has(w) || knownPresens.has(w) || knownPreteritum.has(w);

        // Head-final NP guard. A Norwegian noun phrase puts its head LAST:
        // «det [svenske] [laget]». `svenske` is at once an inflected adjective
        // (svensk + -e) and a noun homograph (en svenske = a Swede), and
        // isAdjective holds neither `svensk` nor `svenske` — so the rule took
        // the MODIFIER for the head, read its gender (m), and told a pupil
        // that correct Norwegian was wrong, with a Fiks button. Found on
        // Wikipedia prose 2026-08-13; 18 hits on 150 articles, the single
        // largest source of confident false positives in Bokmål.
        //
        // Two conditions, both needed. `next` must LOOK like an inflected
        // adjective (…-e), and `twoAhead` must be a DEFINITE noun — the form
        // this construction actually requires («det svenske laget», not «det
        // svenske lag»). Definiteness is what keeps «den tiden folk levde
        // her» safe: `folk` is a noun, but an indefinite one, so `tiden`
        // rightly stays the head. Same test nb-double-definiteness uses.
        // NB: deliberately NOT gated on !isFiniteVerb(twoAhead). A great many
        // definite neuter nouns are spelled exactly like a preterite or past
        // participle — laget, møtet, bygget — and «laget» is the reported case
        // itself, so that guard silently un-did the fix on first test. The
        // reflexive-verb reading is excluded below the same way
        // nb-double-definiteness does it, by looking for a following «seg».
        const DEFINITE_END = /(?:en|et|a|ene|ane)$/;
        const modifierThenHead = !!(next && twoAhead
          && nounGenus.has(next.word) && nounGenus.has(twoAhead.word)
          && next.word.length > 2 && next.word.endsWith('e')
          && DEFINITE_END.test(twoAhead.word)
          && !(tokens[i + 3] && tokens[i + 3].word === 'seg'));

        // ── Expletive / pronominal «det» guards (2026-08-13 sweep) ────────
        //
        // «det» is far more often a pronoun than a determiner, and the
        // pronoun readings kept reaching a noun that was never its head.
        // Four structural signals, none of which need verb coverage:

        // (a) Punctuation between the demonstrative and its candidate noun.
        // A determiner cannot be separated from its head by ? ! , : » or a
        // dash — «Hvordan har du det?» «Bra, takk!» was read as det+…+takk
        // straight across the quote. Mirrors the gap check in
        // nb-double-definiteness, and is stricter than sentence segmentation,
        // which does not split reliably inside «…» or around en-dashes.
        const gapClean = (a, b) => !(ctx.text
          && /[.!?,;:»«"'”“–—()\[\]]/.test(ctx.text.slice(a.end, b.start)));

        // (b) An object pronoun right after the candidate tells us the
        // candidate was a VERB: «det morer meg», «det gleder oss».
        // OBJECT-ONLY forms. «han», «dere» and «det» were in this list for
        // one test run and cost a true positive: «det jobben han ville ha»
        // stopped firing, because «han» opens a relative clause as its
        // SUBJECT. Only forms that cannot be a subject are safe here.
        const OBJ_PRONOUN = new Set([
          'meg', 'deg', 'seg', 'oss', 'ham', 'henne', 'dem',
        ]);

        // (c) Prepositions and other function words are noun homographs in
        // Norwegian — «et under», «en for». «la den under treet» read
        // «under» as the head and told the writer to say «det». A
        // preposition immediately after a demonstrative is never its head.
        // NOT_ADJ_SLOT already lists them; it was only consulted on the
        // 2-ahead branch.

        if (next && nounGenus.has(next.word) && !isAdj(next.word) && !modifierThenHead) {
          // Skip when the candidate noun is also a known verb form — "Det
          // skjer", "Det går", "Det blir" all have homograph noun entries
          // but the verb reading is the only sensible one after a clausal
          // "Det/det".
          if (isFiniteVerb(next.word)) continue;
          if (NOT_ADJ_SLOT.has(next.word)) continue;                    // (c)
          if (tokens[i + 2] && OBJ_PRONOUN.has(tokens[i + 2].word)) continue; // (b)
          if (!gapClean(t, next)) continue;                             // (a)
          // Sentence-boundary guard (see nb-double-definiteness for context).
          if (!sameSentence(t.start, next.start)) continue;
          nounTok = next;
        } else if (twoAhead && nounGenus.has(twoAhead.word) && next) {
          // (d) Reflexive verb in the noun slot: «den eldste ønsket seg å
          // være ridder» — «ønsket» is the verb, not «the wish». Same test
          // nb-double-definiteness uses.
          if (tokens[i + 3] && tokens[i + 3].word === 'seg') continue;
          if (!gapClean(t, twoAhead)) continue;                         // (a)
          // 2-ahead is for adjective-gap ("Det store boka", "den onde
          // stemoren" where «onde» is an adjective-homograph noun). Reject when
          // the intervening word is a verb form ("Det var natt luft") or a
          // quantifier ("gjør det kvar dag") — the demonstrative isn't
          // actually modifying the 2-ahead noun in those clauses.
          if (isFiniteVerb(next.word)) continue;
          if (NON_BRIDGING.has(next.word)) continue;
          if (NOT_ADJ_SLOT.has(next.word)) continue;
          // Plan 50-07 Finding A — intervening genitive head guard.
          // When `next` ends in `-s` AND its stem is a known noun, that
          // intervening token is the actual head of the NP (genitive owner).
          // The demonstrative agrees with the genitive head's gender, not
          // with twoAhead. Reproducer: "Denne gruppas medlemmer" — head is
          // `gruppa` (f), so `Denne` is correct; skip this token-triple.
          if (next.word.length >= 2 && next.word.endsWith('s')) {
            const stem = next.word.slice(0, -1);
            if (nounGenus.has(stem)) continue;
          }
          // Plan 50-07 Finding B — sentential-adverb guard. When `next` is
          // a curated sentential adverb (fullstendig, helt, …) the chain is
          // [pron] [adv] [verb-past-participle], not dem+adj+noun. Skip.
          if (ADVERB_NOT_ADJ.has(next.word)) continue;
          if (WHOLE_QUANT.has(next.word)) continue;
          if (!sameSentence(t.start, twoAhead.start)) continue;
          nounTok = twoAhead;
        }

        if (!nounTok) continue;

        // (e) The head must be DEFINITE. A Norwegian demonstrative takes a
        // definite noun — «det store huset», «den nye jobben». An indefinite
        // one means the «det» is presentational or expletive and makes no
        // gender claim at all about the noun that follows:
        //     det føk gnister   ·   det trengs hjelp   ·   det dufter parfyme
        //     hersket det full forvirring   ·   kan det skje en ulykke
        //     på det nasjonale plan   ·   det grenser til det absurde
        // Every one of those was a false positive in the 2026-08-13 sweep.
        //
        // Not a new idea — nb-double-definiteness already requires exactly
        // this, and its comment names three of the cases above as the reason.
        // The two rules look at the same construction, so they should agree
        // about what counts as a noun phrase; they simply did not.
        if (!DEFINITE_END.test(nounTok.word)) continue;

        // Cursor exclusion: skip if cursor is within the noun token range.
        if (cursorPos != null && cursorPos >= nounTok.start && cursorPos <= nounTok.end + 1) continue;

        const actual = nounGenus.get(nounTok.word);
        if (!actual) continue;

        // v3.0.119: dual-genus values ("f/m") match if ANY listed gender
        // fits; suggestion draws from the first listed (mirrors nb-gender).
        const actualSet = actual.split('/');
        const anyMatch = actualSet.some(g => genderMatch(demExpected, g, lang));
        if (!anyMatch) {
          const type = demType(t.word);
          if (!type) continue;
          const correctDem = GENUS_DEM[type][actualSet[0]];
          if (correctDem) {
            out.push({
              rule_id: 'nb-demonstrative-gender',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              noun_display: nounTok.display,
              actualGenus: actualSet[0],
              fix: matchCase(t.display, correctDem),
              message: `Pekepronomen: "${t.display} ${nounTok.display}" skulle vart "${correctDem} ${nounTok.display}"`,
            });
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
