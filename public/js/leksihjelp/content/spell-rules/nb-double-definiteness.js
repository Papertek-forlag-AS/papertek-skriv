/**
 * Spell-check rule: double-definiteness demonstrative gender mismatch (priority 11).
 *
 * Flags 3-token patterns (demonstrative + adjective + noun) where the
 * demonstrative's gender does not match the noun's gender:
 *   "den stor huset"  → "det stor huset"   (huset = n, needs det)
 *   "det stor boka"   → "den stor boka"    (boka = f, needs den)
 *
 * Complements nb-demonstrative-gender.js which covers 2-token patterns
 * (demonstrative + noun). This rule ONLY fires on the 3-token pattern
 * where the middle token is a known adjective.
 *
 * Rule ID: 'nb-double-definiteness'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml, getString } = host.__lexiSpellCore || {};

  // Demonstrative → expected gender mapping.
  // den/denne = m/f (common gender), det/dette = n.
  const DEM_GENUS = { 'den': 'mf', 'det': 'n', 'denne': 'mf', 'dette': 'n' };

  // Fix mapping: given actual noun genus, which demonstrative to use.
  const GENUS_DEM_SIMPLE   = { m: 'den',   f: 'den',   n: 'det' };
  const GENUS_DEM_PROXIMAL = { m: 'denne', f: 'denne', n: 'dette' };

  // Phase 05.1 Gap C pattern: genus code → i18n label key.
  const GENUS_TO_LABEL_KEY = { m: 'gender_label_m', f: 'gender_label_f', n: 'gender_label_n' };

  // Function words that pass validWords.has() but cannot occupy the adjective
  // slot in dem+ADJ+noun. Without this guard "det en uke" (expletive det +
  // article + noun) misfires the same code path as "det stor uke" → flags
  // a gender mismatch on a non-existent demonstrative-noun pair.
  const NOT_ADJ_SLOT = new Set([
    'en', 'ei', 'et', 'eit', 'ein',                                 // indefinite articles
    'den', 'det', 'denne', 'dette', 'disse', 'desse', 'de', 'dei',  // demonstratives/articles
    'min', 'mi', 'mitt', 'mine', 'din', 'di', 'ditt', 'dine',
    'sin', 'si', 'sitt', 'sine', 'hans', 'hennes', 'hennar',
    'vår', 'vårt', 'våre', 'deres', 'deira', 'dykkar',              // possessives
    'og', 'men', 'eller', 'for', 'så',                              // coordinators
    'i', 'på', 'til', 'fra', 'frå', 'med', 'av', 'om', 'ved', 'før', 'etter', 'mot',
    'under', 'over', 'mellom', 'gjennom', 'uten', 'utan',           // common prepositions
    // Quantifiers / non-adjectival determiners. These pre-modify nouns
    // syntactically but aren't adjectives — the dem+adj+noun pattern
    // shouldn't match across them. Without this guard, sentences like
    // "Han gjør det kvar dag" (det = object pron 'it'; kvar dag =
    // adverbial 'every day') trip the rule because 'kvar' passes the
    // validWords check and 'dag' has m-gender that conflicts with the
    // n-default of 'det'. The three tokens are structurally separate
    // constituents, not a single NP.
    'kvar', 'hver', 'kvart', 'kvert',                               // every
    'nokon', 'noen', 'noko', 'noe', 'nokre',                        // some / any
    'all', 'alt', 'alle',                                           // all
    'ingen', 'inga', 'inkje',                                       // none / no
    'mange', 'få', 'litt', 'fleire', 'flere',                       // many / few / more
  ]);

  /**
   * Determine demonstrative type: 'simple' for den/det, 'proximal' for denne/dette.
   */
  function demType(word) {
    if (word === 'den' || word === 'det') return 'simple';
    if (word === 'denne' || word === 'dette') return 'proximal';
    return null;
  }

  const rule = {
    id: 'nb-double-definiteness',
    languages: ['nb', 'nn'],
    priority: 11,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule — demonstrative gender through adjective; single-token fix",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      const labelKey = GENUS_TO_LABEL_KEY[finding.actualGenus];
      const nounDisplay = finding.noun_display;
      if (!labelKey || !nounDisplay || typeof getString !== 'function') {
        return {
          nb: `<em>${escapeHtml(finding.original)}</em> passer ikke med substantivet — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `<em>${escapeHtml(finding.original)}</em> passar ikkje med substantivet — prøv <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      const labelNb = getString(labelKey, 'nb');
      const labelNn = getString(labelKey, 'nn');
      return {
        nb: `<em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNb)} — bruk <em>${escapeHtml(finding.fix)}</em> i stedet for <em>${escapeHtml(finding.original)}</em>.`,
        nn: `<em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNn)} — bruk <em>${escapeHtml(finding.fix)}</em> i staden for <em>${escapeHtml(finding.original)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const isAdjective = vocab.isAdjective || new Set();
      const validWords = vocab.validWords || new Set();
      const verbForms = vocab.verbForms || new Map();
      const verbInfinitive = vocab.verbInfinitive || new Map();
      const knownPresens = vocab.knownPresens || new Set();
      const knownPreteritum = vocab.knownPreteritum || new Set();
      const knownParticiples = vocab.knownParticiples || new Set();
      const out = [];

      // Plan 50-07 Finding B — adverbs that frequently sit in what looks like
      // the adjective slot but actually modify a following verb past-participle
      // (e.g. "den fullstendig dekket utsikten", "den helt revet sammen").
      // When the middle token is one of these AND the noun-slot candidate is
      // ALSO a recognisable verb past-participle (knownParticiples / homograph
      // -et form whose stem-e infinitive exists in verbInfinitive values),
      // the construction is [pron] [adv] [verb-pp] [obj], not dem+adj+noun.
      // Curated, narrow set to keep blast radius small.
      const ADVERB_NOT_ADJ = new Set([
        'fullstendig', 'helt', 'delvis', 'allerede', 'nesten', 'ganske',
        'snart', 'plutselig', 'straks', 'umiddelbart', 'endelig', 'omsider',
        'fortsatt', 'stadig', 'aldri', 'ofte', 'sjelden', 'alltid',
      ]);
      // "Heil/hel" (whole) as the adjective marks a quantificational time-
      // adverbial — "(verb) det heile dagen" = "…all day", where det is the
      // expletive subject, not a demonstrative head. Mirrors the guard in
      // nb-demonstrative-gender.js. Descriptive adjectives still bridge.
      const WHOLE_QUANT = new Set(['heil', 'heile', 'hel', 'hele']);

      for (let i = 0; i < tokens.length - 2; i++) {
        const dem = tokens[i];
        const adj = tokens[i + 1];
        const noun = tokens[i + 2];

        // Skip 'disse' — plural demonstrative, different pattern.
        if (dem.word === 'disse') continue;

        const demExpected = DEM_GENUS[dem.word];
        if (!demExpected) continue;

        // Expletive-det guard: when `det` follows a finite verb, it's almost
        // always the impersonal/expletive subject in V S inversion ("No var
        // det endeleg fredag" / "Då kom det ein mann …" / "I dag er det
        // mandag") OR the object pronoun "it" ("Han gjør det kvar dag" —
        // det = it, kvar dag = adverbial). In neither case is `det` a
        // demonstrative pre-modifying a definite noun phrase, so the
        // dem+adj+noun pattern matches structurally but `det` carries
        // no gender claim about the following noun. Skip.
        //
        // Cross-dialect fallback via sisterVerbForms — in an NN session
        // the NB-form `gjør` isn't in NN's knownPresens, but it IS in
        // sisterVerbForms (built from NB verbbank). Without this, the
        // guard misses every "Han gjør det <X>" NN sentence using the
        // NB present-tense form.
        if (dem.word === 'det' && i > 0) {
          const prev = tokens[i - 1];
          const prevW = prev && prev.word;
          if (prevW && (
            knownPresens.has(prevW) || knownPreteritum.has(prevW) ||
            verbForms.has(prevW) || verbInfinitive.has(prevW) ||
            (vocab.sisterVerbForms && vocab.sisterVerbForms.has(prevW))
          )) continue;
        }

        // Sentence-boundary guard: dem+ADJ+noun must lie in the same sentence.
        // Cross-sentence triples are nonsensical demonstrative-noun pairs,
        // e.g. "… lurte på dette. Forrige uke stengte …" matches dem(dette)
        // + adj(Forrige) + noun(uke) but the tokens are on either side of a
        // sentence terminator. Use ctx.sentences (Intl.Segmenter output) for
        // robust boundary detection — it handles dialog dashes ("?\n– Bra"),
        // ellipses, abbreviations correctly.
        if (Array.isArray(ctx.sentences) && ctx.sentences.length > 0) {
          let demSent = -1, nounSent = -1;
          for (let s = 0; s < ctx.sentences.length; s++) {
            const sent = ctx.sentences[s];
            if (dem.start >= sent.start && dem.start < sent.end) demSent = s;
            if (noun.start >= sent.start && noun.start < sent.end) { nounSent = s; break; }
          }
          if (demSent !== -1 && nounSent !== -1 && demSent !== nounSent) continue;
        }

        // Plan 50-07 Finding A — intervening genitive head guard.
        // When the middle token ends in `-s` AND its stem (without trailing s)
        // is a known noun, the middle token is a genitive owner that heads the
        // NP. The demonstrative agrees with that head's gender, not with the
        // noun two slots ahead. Reproducer: "Denne gruppas medlemmer" — head
        // is `gruppa` (f), so `Denne` is correct and the rule must stay silent.
        // If the stem's gender agrees with the demonstrative's expected gender,
        // skip this token-triple entirely. (If it doesn't agree, we still skip
        // here — the dem+gen-head construction is structurally distinct from
        // dem+adj+noun and outside this rule's scope; nb-demonstrative-gender
        // handles dem+noun directly when no intervening genitive applies.)
        if (adj.word.length >= 2 && adj.word.endsWith('s')) {
          const stem = adj.word.slice(0, -1);
          if (nounGenus.has(stem)) continue;
        }

        // Middle token must be a known adjective. isAdjective only has
        // base forms (stor, fin, god); inflected/definite forms (store,
        // fine, gode) live in validWords but not isAdjective. Accept
        // either, as long as the middle token is NOT itself a noun and
        // NOT an article/possessive/conjunction/preposition (those pass
        // validWords.has but are syntactically not adjective slots).
        if (NOT_ADJ_SLOT.has(adj.word)) continue;
        // Verbs are not adjective-slot. Without this, "den har tre kameraer"
        // matches as dem+verb+noun and flags den/det gender mismatch on
        // "tre" (homograph: number vs neuter noun "tree").
        if (knownPresens.has(adj.word) || knownPreteritum.has(adj.word) ||
            verbForms.has(adj.word) || verbInfinitive.has(adj.word)) continue;
        if (!isAdjective.has(adj.word) && !validWords.has(adj.word)) continue;
        if (nounGenus.has(adj.word)) continue;

        // Plan 50-07 Finding B — sentential-adverb guard.
        // Sentential adverbs (fullstendig, helt, delvis, allerede, …) modify
        // verbs, not nouns. When the middle slot is one of these, the chain
        // is [pron/det] [adv] [verb-past-participle] [obj] — verbal, not the
        // dem+adj+noun NP this rule targets. Reproducer: "den fullstendig
        // dekket utsikten" — `dekket` is past participle of `dekke`, not the
        // homograph neuter noun "tire/deck". Skip on adverb signal alone:
        // base-form adjectives (stor, fin, god, gode, fine) never collide
        // with this curated list, so positive cases (e.g. "den stor huset")
        // remain unaffected.
        //
        // Best-effort verb-form corroboration: also check if the noun-slot
        // candidate is independently indexed as a verb-form (verbInfinitive,
        // knownParticiples, knownPreteritum, verbForms). When the upstream
        // vocab data adds the missing verb lemma (e.g. dekke_verb — currently
        // a data gap; filed cross-repo), this becomes a hard confirmation;
        // until then the adverb signal alone is enough.
        if (ADVERB_NOT_ADJ.has(adj.word)) continue;
        if (WHOLE_QUANT.has(adj.word)) continue;

        // Adjacency: no punctuation inside the would-be NP («har du det?»
        // «Bra, takk!» — quote/comma between the tokens means they belong to
        // different clauses).
        if (ctx.text) {
          const g1 = ctx.text.slice(dem.end, adj.start);
          const g2 = ctx.text.slice(adj.end, noun.start);
          if (/[.!?,;:»«"–—]/.test(g1) || /[.!?,;:»«"–—]/.test(g2)) continue;
        }

        // The rule targets DOUBLE DEFINITENESS — the noun must be in its
        // DEFINITE form («det store huset», «den nye jobben»). An indefinite
        // noun means a presentational/expletive or distributive construction
        // («det føk gnister», «det trengs hjelp», «på det nasjonale plan»),
        // where «det» carries no gender claim about the noun.
        if (!/(?:en|et|a|ene|ane)$/.test(noun.word)) continue;

        // Noun-slot verb corroboration: an -et token followed by «seg» is the
        // reflexive VERB, not a definite noun («den eldste ønsket seg …»).
        if (tokens[i + 3] && tokens[i + 3].word === 'seg' && /et$/.test(noun.word)) continue;

        // Third token must be a known noun with genus.
        const actual = nounGenus.get(noun.word);
        if (!actual) continue;

        // Cursor exclusion: skip if cursor is within the noun token range.
        if (cursorPos != null && cursorPos >= noun.start && cursorPos <= noun.end + 1) continue;

        // Check gender match. v3.0.119: dual-genus values ("f/m" from the
        // Språkrådet likestilte sync) match if ANY listed gender fits;
        // suggestion draws from the first listed (mirrors nb-gender).
        const actualSet = actual.split('/');
        let matches;
        if (demExpected === 'mf') {
          matches = actualSet.includes('m') || actualSet.includes('f');
        } else {
          matches = actualSet.includes(demExpected);
        }

        if (!matches) {
          const type = demType(dem.word);
          if (!type) continue;
          const correctDem = (type === 'simple' ? GENUS_DEM_SIMPLE : GENUS_DEM_PROXIMAL)[actualSet[0]];
          if (correctDem) {
            out.push({
              rule_id: 'nb-double-definiteness',
              priority: rule.priority,
              start: dem.start,
              end: dem.end,
              original: dem.display,
              noun_display: noun.display,
              actualGenus: actualSet[0],
              fix: matchCase(dem.display, correctDem),
              message: `Dobbel bestemmelse: "${dem.display} ${adj.display} ${noun.display}" — bruk "${correctDem}" for samsvar med "${noun.display}"`,
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
