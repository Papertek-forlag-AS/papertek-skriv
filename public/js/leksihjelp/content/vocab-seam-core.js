/**
 * Leksihjelp — Vocab Seam Core (pure index-building)
 *
 * Pure, side-effect-free module that takes raw vocab JSON + optional bigrams
 * and returns the full set of derived indexes consumed by the extension
 * (word-prediction.js, spell-check.js) and by Node-side tooling
 * (scripts/check-fixtures.js — Plan 03).
 *
 * Dual-export footer: writes `self.__lexiVocabCore` in the browser and
 * `module.exports` in Node — same API, same code path.
 *
 * Contents — moved verbatim from:
 *   - word-prediction.js:440–760   (loadWordList emission loop)
 *   - word-prediction.js:763–785   (loadBigrams normalization)
 *   - spell-check.js:136–172       (rebuildIndexes)
 *
 * This file MUST NOT read from disk, call fetch, or reference chrome.*,
 * window.*, or document.* (the footer's `self` reference is the only
 * allowed global touchpoint).
 */

(function () {
  'use strict';

  // ── Constants (copied verbatim from word-prediction.js:166–219) ──

  const BANKS = [
    'verbbank', 'nounbank', 'adjectivebank', 'articlesbank',
    'generalbank', 'numbersbank', 'phrasesbank', 'pronounsbank',
    'languagesbank',      // Phase 05.1 Gap B
    'nationalitiesbank'   // Phase 05.1 Gap B
  ];

  // Pronoun labels per language — maps array index to pronoun string
  // Used to label Spanish/French conjugations where former is an array
  const LANGUAGE_PRONOUNS = {
    es: ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'],
    fr: ['je', 'tu', 'il/elle/on', 'nous', 'vous', 'ils/elles']
  };

  // NB/NN form-level feature gating — maps individual conjugation form keys
  // to grammar features so each can be toggled independently
  const NB_NN_FORM_FEATURES = {
    presens:              'grammar_present',
    preteritum:           'grammar_preteritum',
    perfektum_partisipp:  'grammar_perfektum',
    imperativ:            'grammar_imperativ',
    // infinitiv: always shown (base form, no gating)
  };

  // ── Generic → lang-prefixed feature resolver (module scope, DRY) ──
  // Single source of truth for resolving a GENERIC feature id (e.g.
  // `grammar_dative`, used by rule-features.js's __lexiRuleFeatures map) to the
  // LANG-PREFIXED forms a language's preset actually stores (e.g.
  // `grammar_de_dativ`, `grammar_nb_genus`). The browser seam's
  // buildFeaturePredicate(lang) in vocab-seam.js builds the same generic→lang
  // mapping for one fixed language via a `grammar_${lang}_` prefix; this map is
  // language-AGNOSTIC because makeFeaturePredicate takes only an explicit
  // enabled-feature array (no `lang`) — independent surfaces (Lær mer) gate on
  // an arbitrary language's preset. Values are the suffix(es) after the
  // `grammar_<lang>_` prefix; a generic id is enabled if ANY enabled id ends in
  // `_<suffix>` for any of its suffixes. Mirrors rule-features.js's documented
  // KNOWN_GENERIC set (present, preteritum, perfektum, imperativ, comparative,
  // superlative, plural, articles, accusative_nouns, dative, genitiv).
  const genericToLangSuffixes = {
    'grammar_articles':         ['genus'],
    'grammar_plural':           ['flertall', 'fleirtal'],
    'grammar_present':          ['presens'],
    'grammar_preteritum':       ['preteritum'],
    'grammar_perfektum':        ['perfektum'],
    'grammar_imperativ':        ['imperativ'],
    'grammar_comparative':      ['komparativ'],
    'grammar_superlative':      ['superlativ'],
    'grammar_accusative_nouns': ['akkusativ'],
    'grammar_dative':           ['dativ'],
    'grammar_genitiv':          ['genitiv'],
  };

  // Build a predicate from an explicit enabled-feature array. `enabledArr` holds
  // lang-prefixed ids (e.g. grammar_de_dativ, grammar_nb_genus). Resolves a
  // GENERIC id (e.g. grammar_dative) by checking whether ANY of its
  // lang-prefixed forms — `grammar_<lang>_<suffix>` for any language — is in the
  // enabled set. Pure; no `lang` parameter, so it works for any single
  // language's preset (the caller passes that language's enabled ids).
  function makeFeaturePredicate(enabledArr) {
    const enabled = new Set(enabledArr || []);
    return function isFeatureEnabled(id) {
      if (enabled.has(id)) return true;
      const suffixes = genericToLangSuffixes[id];
      if (!suffixes) return false;
      for (const e of enabled) {
        for (const suf of suffixes) {
          if (e.endsWith('_' + suf)) return true;
        }
      }
      return false;
    };
  }

  // Phase 16: Compound linking elements per language
  const LINKERS_BY_LANG = {
    nb: ['s', 'e'],
    nn: ['s', 'e'],
    de: ['s', 'n', 'en', 'er', 'e', 'es'],
  };

  // Closed (orthographic) compounds are a productive, grammatical category ONLY
  // in Norwegian (nb/nn) and German. English and the Romance languages
  // (es/fr) write compounds open or hyphenated, so a word that merely splits
  // into two known nouns (EN "endobject" → end+object) is NOT a compound and
  // must never be offered as a "Sammensatt ord". Both decomposeCompound and
  // predictCompound gate on this; no es/fr/en consumer relies on decomposition.
  const COMPOUND_LANGS = new Set(['nb', 'nn', 'de']);

  // Tense normalization — maps language-specific tense keys to common group names
  // Used for cross-language tense consistency detection
  const TENSE_GROUP = {
    presens: 'present', presente: 'present', present: 'present',
    preteritum: 'past', preterito: 'past', past: 'past', simple: 'past',
    perfektum: 'perfect', perfecto: 'perfect', passe_compose: 'perfect',
    perfektum_partisipp: 'perfect',
    participle: 'perfect',
    present_participle: 'continuous',
    subjuntivo: 'subjunctive',
    imperfecto: 'imperfect',
    subjonctif: 'subjunctive'
  };

  // Tense keys to feature mapping (supports multiple languages)
  const TENSE_FEATURES = {
    presens: 'grammar_present',
    presente: 'grammar_present',
    present: 'grammar_en_present',
    past: 'grammar_en_past',
    perfect: 'grammar_en_perfect',
    preteritum: 'grammar_preteritum',
    preterito: 'grammar_preterito',
    perfektum: 'grammar_perfektum',
    perfecto: 'grammar_perfecto',
    passe_compose: 'grammar_passe_compose',
    subjuntivo: 'grammar_es_subjuntivo',
    imperfecto: 'grammar_es_imperfecto',
    subjonctif: 'grammar_fr_subjonctif'
  };

  // Pronoun-feature sets per language (extracted from word-prediction.js:128–157
  // getAllowedPronouns). In the pure core the caller's isFeatureEnabled selects
  // which subset applies; if no pronoun feature is enabled, we default to the
  // widest set (same behaviour as the browser fallback).
  const LANG_PRONOUN_FEATURES = {
    de: [
      { id: 'grammar_pronouns_all', pronouns: ['ich', 'du', 'er/sie/es', 'wir', 'ihr', 'sie/Sie'] },
      { id: 'grammar_pronouns_singular_wir', pronouns: ['ich', 'du', 'er/sie/es', 'wir'] },
      { id: 'grammar_pronouns_ich_du', pronouns: ['ich', 'du'] }
    ],
    es: [
      { id: 'grammar_es_pronouns_all', pronouns: ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'] },
      { id: 'grammar_es_pronouns_singular_nosotros', pronouns: ['yo', 'tú', 'él/ella/usted', 'nosotros'] },
      { id: 'grammar_es_pronouns_yo_tu', pronouns: ['yo', 'tú'] }
    ],
    fr: [
      { id: 'grammar_fr_pronouns_all', pronouns: ['je', 'tu', 'il/elle/on', 'nous', 'vous', 'ils/elles'] },
      { id: 'grammar_fr_pronouns_singular_nous', pronouns: ['je', 'tu', 'il/elle/on', 'nous'] },
      { id: 'grammar_fr_pronouns_je_tu', pronouns: ['je', 'tu'] }
    ]
  };

  // ── Phonetic equivalence rules per language ──
  // Maps common spelling confusions for dyslexic learners
  const PHONETIC_RULES = {
    de: [
      // Vowel confusions
      ['ä', 'ae'], ['ö', 'oe'], ['ü', 'ue'],
      ['ß', 'ss'],
      ['ei', 'ai'], ['ei', 'ey'], ['ai', 'ey'],
      // Consonant confusions
      ['sch', 'sh'], ['sch', 'sk'],
      ['ch', 'k'], ['ch', 'ck'],
      ['v', 'f'], ['v', 'w'],
      ['th', 't'],
      ['ph', 'f'],
      ['ie', 'i'], ['ie', 'ih'],
      ['z', 'ts'], ['z', 'tz'],
      ['qu', 'kw'],
      ['chs', 'x'], ['cks', 'x'],
      ['dt', 't'], ['d', 't'],  // Word-final devoicing
      ['b', 'p'], ['g', 'k'],   // Word-final devoicing
    ],
    es: [
      // Common Spanish confusions
      ['b', 'v'],
      ['c', 's'], ['c', 'z'], ['s', 'z'],
      ['ll', 'y'],
      ['j', 'g'],  // before e/i
      ['qu', 'k'], ['qu', 'c'],
      ['h', ''],  // Silent h
      ['rr', 'r'],
      ['ñ', 'ny'], ['ñ', 'ni'],
      ['gü', 'gu'],
    ],
    fr: [
      // Common French confusions
      ['é', 'e'], ['è', 'e'], ['ê', 'e'], ['ë', 'e'],
      ['à', 'a'], ['â', 'a'],
      ['ù', 'u'], ['û', 'u'],
      ['î', 'i'], ['ï', 'i'],
      ['ô', 'o'],
      ['ç', 's'], ['ç', 'c'],
      ['ph', 'f'],
      ['qu', 'k'],
      ['eau', 'o'], ['au', 'o'],
      ['ai', 'e'], ['ei', 'e'],
      ['ou', 'u'],
      ['oi', 'wa'],
      ['ch', 'sh'],
      ['gn', 'ny'],
    ],
    nb: [
      // Double vs single consonants (most common Norwegian spelling error)
      ['ll', 'l'], ['mm', 'm'], ['nn', 'n'], ['tt', 't'],
      ['kk', 'k'], ['pp', 'p'], ['ss', 's'], ['dd', 'd'],
      ['gg', 'g'], ['ff', 'f'], ['bb', 'b'], ['rr', 'r'],
      // Sibilant confusions
      ['skj', 'sj'], ['sk', 'sj'],
      ['kj', 'tj'], ['kj', 'k'],
      // Silent/weak consonants
      ['hv', 'v'],       // hva/va, hvor/vor
      ['gj', 'j'],       // gjøre/jøre
      ['hj', 'j'],       // hjemme/jemme
      ['lj', 'j'],       // ljug/jug
      // Final devoicing / confusion
      ['d', 't'], ['g', 'k'],
      ['nd', 'nn'],       // band/bann
      // Vowel confusions
      ['æ', 'e'], ['ø', 'o'], ['å', 'o'],
      ['ei', 'e'], ['ai', 'e'],
      ['au', 'ø'],
      ['y', 'i'],
    ],
    nn: [
      // Double vs single consonants
      ['ll', 'l'], ['mm', 'm'], ['nn', 'n'], ['tt', 't'],
      ['kk', 'k'], ['pp', 'p'], ['ss', 's'], ['dd', 'd'],
      ['gg', 'g'], ['ff', 'f'], ['bb', 'b'], ['rr', 'r'],
      // Sibilant confusions
      ['skj', 'sj'], ['sk', 'sj'],
      ['kj', 'tj'], ['kj', 'k'],
      // Silent/weak consonants
      ['hv', 'v'],
      ['gj', 'j'],
      ['hj', 'j'],
      ['lj', 'j'],
      // Final devoicing / confusion
      ['d', 't'], ['g', 'k'],
      ['nd', 'nn'],
      // Vowel confusions
      ['æ', 'e'], ['ø', 'o'], ['å', 'o'],
      ['ei', 'e'], ['ai', 'e'],
      ['au', 'ø'],
      ['y', 'i'],
    ]
  };

  /**
   * Normalize a string using phonetic rules for the current language.
   * Replaces common confusable patterns with a canonical form.
   */
  function phoneticNormalize(str, lang) {
    const rules = PHONETIC_RULES[lang] || [];
    let normalized = str.toLowerCase();

    for (const [a, b] of rules) {
      // Normalize both sides to the shorter/canonical form
      const canonical = a.length <= b.length ? a : b;
      const variant = a.length <= b.length ? b : a;

      // Replace the variant with the canonical form
      if (variant && normalized.includes(variant)) {
        normalized = normalized.split(variant).join(canonical);
      }
    }

    // Also strip accents as a final normalization
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    return normalized;
  }

  /**
   * Score a phonetically normalized query against a phonetically normalized target.
   * Used when standard matching fails, to catch spelling confusions.
   */
  function phoneticMatchScore(queryPhonetic, targetPhonetic) {
    // Phonetic starts-with
    if (targetPhonetic.startsWith(queryPhonetic)) {
      return 70 + (queryPhonetic.length / targetPhonetic.length) * 20;
    }

    // Phonetic contains
    if (targetPhonetic.includes(queryPhonetic)) {
      return 35;
    }

    // Phonetic fuzzy (Levenshtein on normalized forms)
    if (queryPhonetic.length >= 3) {
      const maxDist = queryPhonetic.length <= 4 ? 1 : 2;
      const targetPrefix = targetPhonetic.slice(0, queryPhonetic.length + maxDist);
      const dist = levenshtein(queryPhonetic, targetPrefix);
      if (dist <= maxDist) {
        return 20 - dist * 5;
      }
    }

    return 0;
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return dp[m][n];
  }

  // ── Helpers ──



  // Shared "all features enabled" predicate singleton. Declared at module
  // scope so buildIndexes can reference-compare against it to skip a
  // duplicate buildWordList call when the caller already passed the same
  // identity predicate (fixture harness + first-load Node path).
  const iffTrue = () => true;

  function getAllowedPronouns(lang, isFeatureEnabled) {
    const features = LANG_PRONOUN_FEATURES[lang];
    if (features) {
      for (const pf of features) {
        if (isFeatureEnabled(pf.id)) return new Set(pf.pronouns);
      }
      return new Set(features[0].pronouns);
    }
    // For NB/NN/EN, we don't filter by default, so return a Set that always returns true or handle as null
    return null;
  }

  // ── buildWordList — copied verbatim from word-prediction.js:465–755 ──
  //
  // Preserves every emitted field on each entry. Consumers (spell-check.js
  // rebuildIndexes) rely on: word, display, translation, type, bank,
  // baseWord, pronoun, genus, formKey, tenseKey, number, definiteness,
  // caseName. Do NOT "clean up" the shape — pitfall #2 in RESEARCH.md.
  function buildWordList(data, lang, isFeatureEnabled) {
    const wordList = [];
    if (!data) return wordList;

    const isNorwegian = lang === 'nb' || lang === 'nn';
    const allowedPronouns = getAllowedPronouns(lang, isFeatureEnabled);

    for (const bank of BANKS) {
      const bankData = data[bank];
      if (!bankData || typeof bankData !== 'object') continue;

      for (const entry of Object.values(bankData)) {
        if (!entry.word) continue;

        const translation = entry.translation || entry.translations?.nb || '';

        // Pitfall 7 (Phase 3-04): raw `entry.frequency` scales differ wildly
        // per language (DE 0–48k+, similar shape elsewhere). Normalize once
        // at seam-build time to a Zipf-alike float so the word-prediction
        // ranker can feed all 6 languages into one signal without per-language
        // scale math. For NB/NN we PREFER VOCAB.getFrequency (Zipf sidecar
        // populated from freq-{nb,nn}.json), but `entry.zipf` here is the
        // fallback + the only source for de/es/fr/en. Computed once per
        // source entry; attached to every emitted wordList push so consumers
        // never need to know the bank-row shape.
        const rawFrequency = entry.frequency;
        const zipf = (typeof rawFrequency === 'number' && rawFrequency > 0)
          ? Math.log10(rawFrequency + 1)
          : 0;

        const baseWords = entry.word.split(';').map(w => w.trim()).filter(Boolean);
        for (const w of baseWords) {
          wordList.push({
            word: w.toLowerCase(),
            display: w,
            translation: translation,
            type: 'base',
            bank: bank,
            genus: bank === 'nounbank' ? (entry.genus || null) : null,
            // Preserve the épicène / gender-homograph markers so the nounGenus /
            // nounLemmaGenus build can collapse them to 'both' (see below).
            epicene: bank === 'nounbank' ? (entry.epicene === true) : false,
            genderTrap: bank === 'nounbank' ? (entry.genderTrap || null) : null,
            zipf: zipf
          });
        }

        // Add Norwegian translation for reverse prediction
        if (translation) {
          wordList.push({
            word: translation.toLowerCase(),
            display: translation,
            translation: entry.word,
            type: 'translation',
            zipf: zipf
          });
        }

        // Add known typos — when student types a common misspelling,
        // suggest the correct word with high priority
        if (entry.typos && Array.isArray(entry.typos)) {
          for (const typo of entry.typos) {
            // v3.0.121: upstream pipeline markers leaked into FR/ES/EN typo
            // arrays ('fr-conj-auto', 'no-table-tags') alongside dumped
            // conjugation tables — see the deferred typo-pollution note.
            // The markers must never become typo "words".
            if (typeof typo === 'string' && /^(fr|es|de|en)-conj-auto$|^no-table-tags$/.test(typo)) continue;
            wordList.push({
              word: typo.toLowerCase(),
              display: entry.word,  // Show the correct word
              translation: translation,
              type: 'typo',
              bank: bank,
              baseWord: entry.word,
              zipf: zipf
            });
          }
        }

        // Form-targeted typos — misspellings of a specific conjugated form.
        // Unlike entry.typos (which always suggest the headword), each key
        // maps to its own correct form: haben_verb's { habst: "hast" } must
        // suggest "hast", not "haben". Upstream field added in
        // papertek-vocabulary PR #31; the validwords-common generator
        // subtracts formTypos keys, so keys never collide with accept-lists.
        if (entry.formTypos && typeof entry.formTypos === 'object' && !Array.isArray(entry.formTypos)) {
          for (const [typo, correctForm] of Object.entries(entry.formTypos)) {
            if (typeof typo !== 'string' || typeof correctForm !== 'string' || !correctForm) continue;
            wordList.push({
              word: typo.toLowerCase(),
              display: correctForm,  // Show the correct conjugated form
              translation: translation,
              type: 'typo',
              bank: bank,
              baseWord: entry.word,
              zipf: zipf
            });
          }
        }

        // Add accepted forms — alternative valid spellings
        if (entry.acceptedForms && Array.isArray(entry.acceptedForms)) {
          for (const form of entry.acceptedForms) {
            wordList.push({
              word: form.toLowerCase(),
              display: form,
              translation: `${entry.word} (${translation || ''})`,
              type: 'accepted',
              bank: bank,
              baseWord: entry.word,
              zipf: zipf
            });

            // Phase 47 Track F: German -in/-innen feminine derivations on
            // masculine noun lemmas. Shape in papertek: lehrer_noun has
            // acceptedForms: ["Lehrerin", "Lehrerinnen"]. Without a per-form
            // genus tag these land in validWords but NOT in nounGenus, so
            // de-capitalization can't catch "Die lehrerin ist nett". Emit a
            // parallel nounform entry tagging the feminine derivation
            // explicitly. Gate: German nounbank, capitalized first char,
            // ends in -in (sg) or -innen (pl).
            if (lang === 'de' && bank === 'nounbank' && typeof form === 'string' && form.length > 2
                && form[0] === form[0].toUpperCase() && form[0] !== form[0].toLowerCase()) {
              const isPluralFem = /innen$/i.test(form);
              const isSingularFem = !isPluralFem && /in$/i.test(form);
              if (isPluralFem || isSingularFem) {
                wordList.push({
                  word: form.toLowerCase(),
                  display: form,
                  translation: `${entry.word} (feminin ${isPluralFem ? 'plural' : 'singular'})`,
                  type: 'nounform',
                  bank: bank,
                  baseWord: entry.word,
                  genus: 'f',
                  number: isPluralFem ? 'plural' : 'singular',
                  zipf: zipf,
                });
                // Auto-derive the -innen plural from a -in singular. German
                // feminine -in derivations follow a regular plural pattern
                // (Lehrerin → Lehrerinnen, Ärztin → Ärztinnen). The plural
                // form is rarely listed alongside the singular in papertek's
                // acceptedForms, so emit it algorithmically.
                if (isSingularFem) {
                  const pluralForm = form + 'nen';
                  wordList.push({
                    word: pluralForm.toLowerCase(),
                    display: pluralForm,
                    translation: `${entry.word} (feminin plural)`,
                    type: 'nounform',
                    bank: bank,
                    baseWord: entry.word,
                    genus: 'f',
                    number: 'plural',
                    zipf: zipf,
                  });
                }
              }
            }
          }
        }

        // Likestilte skrivemåter (Språkrådet §15-4): alternate lemma spellings
        // (vei↔veg) + their inflected forms are VALID words — they must be in
        // validWords so the spell-checker never flags them, and searchable so
        // word-prediction can surface them. Mirrors the acceptedForms emission.
        if (Array.isArray(entry.skrivemaater)) {
          // Genus per variant spelling, when the entry also carries the richer
          // §15-4 payload. `bjerk` is feminine/masculine exactly like `bjørk`;
          // the flat skrivemaater rows don't say so, likestilteFormer does.
          const variantGenus = new Map();
          if (Array.isArray(entry.likestilteFormer)) {
            for (const lf of entry.likestilteFormer) {
              if (!lf || typeof lf.spelling !== 'string') continue;
              const g = Array.isArray(lf.genus) && lf.genus.length ? lf.genus.join('/') : null;
              if (g) variantGenus.set(lf.spelling.toLowerCase(), g);
            }
          }
          for (const sv of entry.skrivemaater) {
            // Carrying the genus is what puts a variant spelling into nounGenus,
            // and therefore what lets the compound decomposer see it as an
            // element. Without it `bjørketre` split as `bjørk + e + tre` while
            // `bjerketre` — the equally valid spelling — decomposed to nothing
            // and the student got no card at all: §15-4 neutrality failing on an
            // unbounded surface, since compounds are productive.
            const genus = (bank === 'nounbank' && (lang === 'nb' || lang === 'nn'))
              ? (variantGenus.get(String(sv && sv.spelling || '').toLowerCase()) || entry.genus || null)
              : null;
            const forms = [];
            if (sv && typeof sv.spelling === 'string') forms.push(sv.spelling);
            if (Array.isArray(sv && sv.forms)) for (const f of sv.forms) if (typeof f === 'string' && f) forms.push(f);
            for (const form of forms) {
              wordList.push({
                word: form.toLowerCase(),
                display: form,
                translation: `${entry.word} (${translation || ''})`,
                type: 'accepted',
                bank: bank,
                baseWord: entry.word,
                genus: genus,
                // Variant spellings belong in nounGenus (the dictionary's
                // compound decomposer reads it) but NOT in nounLemmaGenus, the
                // lemma-only map the strict særskriving path uses. Letting them
                // in cost precision immediately: `kopper` is both a spelling of
                // `kobber` and the plural of `kopp`, so «to kopper sukker»
                // became a missing compound. Særskriving does not need variant
                // spellings; the dictionary does.
                variantForm: true,
                zipf: zipf,
              });
            }
          }
        }

        // …and the same emission driven by likestilteFormer, which is where the
        // COMPOSED compound variants live: `bjørkeskog` carries
        // bjerkeskog/bjørkeskau/bjerkeskau there and has no skrivemaater block
        // at all. Missing them left a variant compound lemma outside nounGenus,
        // so «lufthamnsjef» decomposed to `luft + hamn + sjef` while
        // «lufthavnsjef» got the shorter, right `lufthavn + sjef` — the same
        // spelling answered less well than its equal.
        if (Array.isArray(entry.likestilteFormer) && entry.likestilteFormer.length > 1
            && bank === 'nounbank' && (lang === 'nb' || lang === 'nn')) {
          for (const lf of entry.likestilteFormer) {
            if (!lf || typeof lf.spelling !== 'string' || !lf.spelling) continue;
            if (lf.spelling.toLowerCase() === String(entry.word || '').toLowerCase()) continue;
            const genus = (Array.isArray(lf.genus) && lf.genus.length)
              ? lf.genus.join('/')
              : (entry.genus || null);
            const forms = [lf.spelling];
            for (const p of (Array.isArray(lf.paradigms) ? lf.paradigms : [])) {
              for (const block of [p && p.ubestemt, p && p.bestemt]) {
                if (!block || typeof block !== 'object') continue;
                for (const v of Object.values(block)) {
                  for (const f of (Array.isArray(v) ? v : [v])) {
                    if (typeof f === 'string' && f) forms.push(f);
                  }
                }
              }
            }
            for (const form of forms) {
              wordList.push({
                word: form.toLowerCase(),
                display: form,
                translation: `${entry.word} (${translation || ''})`,
                type: 'accepted',
                bank: bank,
                baseWord: entry.word,
                genus: genus,
                variantForm: true,
                zipf: zipf,
              });
            }
          }
        }

        // F47-3 (v3.0.40): same Track F shape, but for German nouns whose
        // HEADWORD itself is already a -in feminine (e.g. `Studentin`,
        // `Ärztin`, `Künstlerin`) — no acceptedForms entry to hang the
        // auto-derivation off. Without this branch the singular is captured
        // via the regular base-noun emission above (line ~337) but the
        // -innen plural never reaches nounGenus, so a student typing
        // lowercase `studentinnen` either (a) silently passes through, or
        // (b) is matched by the curated typo entry mapping `studentinnen
        // → Studentin` (singular!) and a typo rule suggests the WRONG-
        // number lemma. Both shapes are worse than de-capitalization
        // firing with the same-form capitalization. Emit the auto-derived
        // -innen plural here so de-cap handles the fix correctly. Gate
        // mirrors Track F: German nounbank, capitalized first char,
        // genus 'f', and the headword ends in -in (singular). Already-
        // ending-in-nen entries (rare) are skipped — those should be
        // base-emitted on their own row.
        if (lang === 'de' && bank === 'nounbank' && entry.genus === 'f'
            && typeof entry.word === 'string' && entry.word.length > 2
            && entry.word[0] === entry.word[0].toUpperCase() && entry.word[0] !== entry.word[0].toLowerCase()
            && /in$/.test(entry.word) && !/innen$/.test(entry.word)) {
          const pluralForm = entry.word + 'nen';
          wordList.push({
            word: pluralForm.toLowerCase(),
            display: pluralForm,
            translation: `${entry.word} (feminin plural)`,
            type: 'nounform',
            bank: bank,
            baseWord: entry.word,
            genus: 'f',
            number: 'plural',
            zipf: zipf,
          });
        }

        // Add conjugated verb forms
        if (bank === 'verbbank' && entry.conjugations) {
          for (const [tense, tenseData] of Object.entries(entry.conjugations)) {
            // For DE/ES/FR: gate by tense feature
            if (!isNorwegian) {
              const featureId = TENSE_FEATURES[tense];
              if (featureId && !isFeatureEnabled(featureId)) continue;
            }

            // Spanish gerundio (and any other single-form tense slot stored
            // as a plain string at entry.conjugations.<tense>): index the
            // form directly so it lands in validWords and the typo rule
            // doesn't suggest "viento" for "viendo". No pronoun, no
            // feature gate (gerundio is unmarked register-wise).
            if (typeof tenseData === 'string' && tenseData) {
              const ger = tenseData;
              wordList.push({
                word: ger.toLowerCase(),
                display: ger,
                translation: `${entry.word} (${tense})`,
                type: 'conjugation',
                baseWord: entry.word,
                zipf: zipf
              });
              continue;
            }

            if (tenseData.former) {
              if (Array.isArray(tenseData.former)) {
                // Spanish/French: array of forms, map index to pronoun label
                const pronounLabels = LANGUAGE_PRONOUNS[lang] || [];
                const arrTenseKey = TENSE_GROUP[tense] || null;
                tenseData.former.forEach((form, index) => {
                  if (!form) return;
                  const pronoun = pronounLabels[index] || `${index}`;
                  // Filter by allowed pronouns (if set)
                  if (allowedPronouns && !allowedPronouns.has(pronoun)) return;
                  const formLower = form.toLowerCase();
                  wordList.push({
                    word: formLower,
                    display: form,
                    translation: `${entry.word} (${pronoun})`,
                    type: 'conjugation',
                    pronoun: pronoun,
                    baseWord: entry.word,
                    tenseKey: arrTenseKey,
                    zipf: zipf
                  });
                });
              } else if (typeof tenseData.former === 'object') {
                // Object with keys: German uses pronouns (ich, du, ...),
                // NB/NN uses form labels (infinitiv, presens, ...),
                // EN uses English pronouns (I, you, he/she, ...)
                for (const [key, form] of Object.entries(tenseData.former)) {
                  if (key.startsWith('_')) continue;
                  // Only apply pronoun filtering for German/English if allowedPronouns is set
                  if ((lang === 'de' || lang === 'en') && allowedPronouns && !allowedPronouns.has(key)) continue;

                  // NB/NN: gate each form individually by its own grammar feature
                  if (isNorwegian && NB_NN_FORM_FEATURES[key]) {
                    if (!isFeatureEnabled(NB_NN_FORM_FEATURES[key])) continue;
                  }

                  // NB/NN: tense is derived from form key (presens, preteritum, etc.)
                  // Other: tense is the outer loop (tense)
                  const objTenseKey = isNorwegian
                    ? (TENSE_GROUP[key] || null)
                    : (TENSE_GROUP[tense] || null);
                  const formValues = Array.isArray(form) ? form : [form];
                  for (const formStr of formValues) {
                    if (typeof formStr !== 'string' || !formStr) continue;
                    const formLower = formStr.toLowerCase();
                    wordList.push({
                      word: formLower,
                      display: formStr,
                      translation: `${entry.word} (${key})`,
                      type: 'conjugation',
                      pronoun: isNorwegian ? null : key,
                      formKey: isNorwegian ? key : null,
                      baseWord: entry.word,
                      tenseKey: objTenseKey,
                      zipf: zipf
                    });
                  }
                }
              }
            }

            // Phase 54-04: NN verb paradigms — sideform conjugations like
            // gå_verb's preteritum "gjekk" (alongside "gådde") or tru_verb's
            // presens "trur" (alongside "tror"). Shape mirrors former: each
            // paradigm holds form-key → form-string pairs. Without this loop,
            // sideforms miss validWords and typo-fuzzy fires false positives.
            if (isNorwegian && Array.isArray(tenseData.paradigms)) {
              for (const paradigm of tenseData.paradigms) {
                if (!paradigm || typeof paradigm !== 'object') continue;
                for (const [formKey, formStr] of Object.entries(paradigm)) {
                  if (formKey === 'class' || formKey.startsWith('_')) continue;
                  if (NB_NN_FORM_FEATURES[formKey] && !isFeatureEnabled(NB_NN_FORM_FEATURES[formKey])) continue;
                  if (typeof formStr !== 'string' || !formStr) continue;
                  const sideTenseKey = TENSE_GROUP[formKey] || null;
                  wordList.push({
                    word: formStr.toLowerCase(),
                    display: formStr,
                    translation: `${entry.word} (${formKey} sideform)`,
                    type: 'conjugation',
                    pronoun: null,
                    formKey: formKey,
                    baseWord: entry.word,
                    tenseKey: sideTenseKey,
                    zipf: zipf
                  });
                }
              }
            }

            // EN perfect tense: participle/present_participle (no former).
            // Phase 42: papertek-vocabulary started shipping ARRAY values for
            // valgfri irregular participles (e.g. ["got","gotten"]) — handle
            // both string and array shapes defensively.
            if (tenseData.participle) {
              const partValues = Array.isArray(tenseData.participle) ? tenseData.participle : [tenseData.participle];
              for (const part of partValues) {
                if (typeof part !== 'string' || !part) continue;
                wordList.push({
                  word: part.toLowerCase(),
                  display: part,
                  translation: `${entry.word} (past participle)`,
                  type: 'conjugation',
                  baseWord: entry.word,
                  zipf: zipf
                });
              }
            }
            if (tenseData.present_participle) {
              const ppValues = Array.isArray(tenseData.present_participle) ? tenseData.present_participle : [tenseData.present_participle];
              for (const pp of ppValues) {
                if (typeof pp !== 'string' || !pp) continue;
                wordList.push({
                  word: pp.toLowerCase(),
                  display: pp,
                  translation: `${entry.word} (-ing)`,
                  type: 'conjugation',
                  baseWord: entry.word,
                  zipf: zipf
                });
              }
            }
          }
        }

        // Add noun case forms (v2.0 format)
        if (bank === 'nounbank' && entry.cases) {
          for (const [caseName, caseData] of Object.entries(entry.cases)) {
            // Feature gating per case
            if (caseName === 'akkusativ' && !isFeatureEnabled('grammar_accusative_nouns')) continue;
            if (caseName === 'dativ' && !isFeatureEnabled('grammar_dative')) continue;
            if (caseName === 'genitiv' && !isFeatureEnabled('grammar_genitiv')) continue;

            if (!caseData.forms) continue;

            for (const [number, numberForms] of Object.entries(caseData.forms)) {
              if (!numberForms) continue; // plurale tantum: singular is null
              for (const [article, form] of Object.entries(numberForms)) {
                if (!form) continue;
                wordList.push({
                  word: form.toLowerCase(),
                  display: form,
                  translation: `${entry.word} (${caseName} ${number})`,
                  type: 'case',
                  baseWord: entry.word,
                  genus: entry.genus || null,
                  caseName: caseName,
                  zipf: zipf
                });
                // Phase 47 Track D: German case forms ship as "des Wetters" /
                // "dem Hund" / "eine Frau" — article + noun in one string.
                // The tokenizer splits on whitespace so the multi-word value
                // never matches a single bare noun token. Emit the trailing
                // bare-noun form (Wetters, Hund, Frau) separately so genitive/
                // dative declined forms land in validWords. Skip if the bare
                // form duplicates the lemma headword.
                if (lang === 'de' && typeof form === 'string' && form.includes(' ')) {
                  // Strip slash-alternates like "die Pensionisten / die" before
                  // splitting, then pick the last whitespace-separated token of
                  // the first alternate. Skip if the bare token doesn't start
                  // with an uppercase letter — German nouns are always
                  // capitalized, so a lowercase trailing token is an article
                  // (or data noise like "/ die"), not a noun.
                  const firstAlt = form.split('/')[0].trim();
                  const parts = firstAlt.split(/\s+/);
                  const bareNoun = parts[parts.length - 1];
                  const bareNounLower = bareNoun ? bareNoun.toLowerCase() : '';
                  const startsUpper = bareNoun && bareNoun[0] && bareNoun[0] === bareNoun[0].toUpperCase() && bareNoun[0] !== bareNoun[0].toLowerCase();
                  // Note: do not skip when bareNounLower === lemma. Nouns with
                  // identical singular and plural forms (Regen, Lehrer, Mädchen
                  // …) need the bare form emitted under each number so the
                  // singular/plural buckets in nounForms get populated
                  // symmetrically. Without it, my plural-form gate in
                  // de-prep-case wrongly treats "Regen" as exclusive plural.
                  if (bareNoun && startsUpper) {
                    wordList.push({
                      word: bareNounLower,
                      display: bareNoun,
                      translation: `${entry.word} (${caseName} ${number}, bare)`,
                      type: 'nounform',
                      bank: bank,
                      baseWord: entry.word,
                      genus: entry.genus || null,
                      number: number,
                      caseName: caseName,
                      zipf: zipf,
                    });
                  }
                }
              }
            }
          }
        }

        // Add NB/NN noun forms (ubestemt/bestemt × entall/flertall)
        if (bank === 'nounbank' && entry.forms) {
          for (const [formType, forms] of Object.entries(entry.forms)) {
            if (!forms || typeof forms !== 'object') continue;
            // Phase 54-04: entry.forms.paradigms[] is an array of paradigm
            // objects (NN sideforms — e.g. and_noun's ander/ender). Skip
            // here; emitted by the dedicated paradigm loop below.
            if (formType === 'paradigms') continue;
            for (const [number, formRaw] of Object.entries(forms)) {
              const formValues = Array.isArray(formRaw) ? formRaw : [formRaw];
              for (const form of formValues) {
                if (typeof form !== 'string' || !form) continue;
                if (form.toLowerCase() === (entry.word || '').toLowerCase()) continue;
                wordList.push({
                  word: form.toLowerCase(),
                  display: form,
                  translation: `${entry.word} (${formType} ${number})`,
                  type: 'nounform',
                  bank: bank,
                  baseWord: entry.word,
                  genus: entry.genus || null,
                  number: number,
                  definiteness: formType,
                  zipf: zipf
                });
              }
            }
          }

          // Phase 54-04: emit NN paradigm sideforms so valid alternatives
          // (e.g. ender as flertall of and alongside ander) land in
          // validWords — otherwise typo-fuzzy flags them as misspellings.
          if (Array.isArray(entry.forms.paradigms)) {
            for (const paradigm of entry.forms.paradigms) {
              if (!paradigm || typeof paradigm !== 'object') continue;
              for (const definiteness of ['ubestemt', 'bestemt']) {
                const block = paradigm[definiteness];
                if (!block || typeof block !== 'object') continue;
                for (const [number, formRaw] of Object.entries(block)) {
                  const formValues = Array.isArray(formRaw) ? formRaw : [formRaw];
                  for (const form of formValues) {
                    if (typeof form !== 'string' || !form) continue;
                    if (form.toLowerCase() === (entry.word || '').toLowerCase()) continue;
                    wordList.push({
                      word: form.toLowerCase(),
                      display: form,
                      translation: `${entry.word} (${definiteness} ${number} sideform)`,
                      type: 'nounform',
                      bank: bank,
                      baseWord: entry.word,
                      genus: entry.genus || null,
                      number: number,
                      definiteness: definiteness,
                      zipf: zipf
                    });
                  }
                }
              }
            }
          }
        }

        // Add plural forms
        const __plMarker = entry.plural === '–' || entry.plural === '-' || entry.plural === '—';
        if (bank === 'nounbank' && entry.plural && !__plMarker && isFeatureEnabled('grammar_plural')) {
          wordList.push({
            word: entry.plural.toLowerCase(),
            display: entry.plural,
            translation: `${entry.word} (flertall)`,
            type: 'plural',
            baseWord: entry.word,
            genus: entry.genus || null,
            zipf: zipf
          });
        } else if (bank === 'nounbank' && __plMarker && isFeatureEnabled('grammar_plural')
                   && /(?:er|el|en|chen|lein)$/.test(entry.word)) {
          // German Nullplural: the plural is IDENTICAL to the singular (der
          // Fehler → die Fehler, das Mädchen → die Mädchen, der Schlüssel → die
          // Schlüssel). The data marks these with a "–" placeholder, which was
          // previously emitted as a literal plural form (polluting validWords
          // and leaving the real plural unindexed). Emit the singular as the
          // plural so plural-sensitive rules (gender, prep-case, accusative)
          // recognise "die Fehler" as a plural rather than a gender mismatch.
          // Scoped to the -er/-el/-en/-chen/-lein endings that form German
          // Nullplurals, so uncountables ("die Milch") aren't mislabelled.
          wordList.push({
            word: entry.word.toLowerCase(),
            display: entry.word,
            translation: `${entry.word} (flertall)`,
            type: 'plural',
            baseWord: entry.word,
            genus: entry.genus || null,
            zipf: zipf
          });
        }

        // Phase 05.1 Gap B — nationalitiesbank morphology seeding.
        // Entries carry noun-shape fields (plural, definite, plural_definite) but
        // stay out of the nounGenus pipe per the typed-bank-shield pattern
        // (Plan 05.1-02). Seed the forms into wordList with genus: null so they
        // populate validWords (preventing typo-fuzzy false-flags on plurals like
        // "Nordmenn" / "svensker") without seeding nounGenus.
        if (bank === 'nationalitiesbank') {
          if (entry.plural) {
            wordList.push({
              word: entry.plural.toLowerCase(),
              display: entry.plural,
              translation: `${entry.word} (flertall)`,
              type: 'nationalityform',
              baseWord: entry.word,
              genus: null,
              zipf: zipf
            });
          }
          if (entry.definite) {
            wordList.push({
              word: entry.definite.toLowerCase(),
              display: entry.definite,
              translation: `${entry.word} (bestemt)`,
              type: 'nationalityform',
              baseWord: entry.word,
              genus: null,
              zipf: zipf
            });
          }
          if (entry.plural_definite) {
            wordList.push({
              word: entry.plural_definite.toLowerCase(),
              display: entry.plural_definite,
              translation: `${entry.word} (flertall bestemt)`,
              type: 'nationalityform',
              baseWord: entry.word,
              genus: null,
              zipf: zipf
            });
          }
        }

        // Add adjective comparison forms
        // German: entry.komparativ (string), Spanish/French: entry.comparison.komparativ.form (nested),
        // NN (Phase 54): entry.comparison.komparativ may be an array of sideforms (e.g. ["verre","dårlegare"]).
        if (bank === 'adjectivebank') {
          const komparativ = entry.komparativ
            || entry.comparison?.komparativ?.form || entry.comparison?.komparativ
            || entry.comparison?.comparativo?.form
            || entry.comparison?.comparatif?.form
            || entry.comparison?.comparative;
          const superlativ = entry.superlativ
            || entry.comparison?.superlativ?.form || entry.comparison?.superlativ
            || entry.comparison?.superlativo?.form
            || entry.comparison?.superlatif?.form
            || entry.comparison?.superlative;

          if (komparativ && isFeatureEnabled('grammar_comparative')) {
            const komparativValues = Array.isArray(komparativ) ? komparativ : [komparativ];
            for (const k of komparativValues) {
              if (typeof k !== 'string' || !k) continue;
              wordList.push({
                word: k.toLowerCase(),
                display: k,
                translation: `${entry.word} (komparativ)`,
                type: 'comparative',
                baseWord: entry.word,
                zipf: zipf
              });
            }
          }
          if (superlativ && isFeatureEnabled('grammar_superlative')) {
            const superlativValues = Array.isArray(superlativ) ? superlativ : [superlativ];
            for (const s of superlativValues) {
              if (typeof s !== 'string' || !s) continue;
              wordList.push({
                word: s.toLowerCase(),
                display: s,
                translation: `${entry.word} (superlativ)`,
                type: 'superlative',
                baseWord: entry.word,
                zipf: zipf
              });
            }
          }

          // NB/NN: emit declined adjective forms (maskulin/feminin/noytrum/flertall/bestemt)
          // so gender+number+definiteness agreement can surface the right form.
          //
          // Iterates all three degrees (positiv, komparativ, superlativ) so that
          // inflected comparison forms like `beste` (superlativ.bestemt of `god`)
          // enter validWords. Previously only `declension.positiv` was iterated,
          // which meant the superlative-definite (`beste`) and comparative
          // declension slots silently dropped — flipping typo-fuzzy into false-
          // positive mode on clean sentences like "den beste venen min".
          //
          // Array values are tolerated: phase-36 NN migration introduced
          // array-valued declension slots (e.g. `["sol-en", "sola", "solen"]`
          // for multi-variant forms). Each array element is emitted.
          if (isNorwegian && entry.declension) {
            const ADJ_FORM_META = {
              maskulin: { genus: 'm', number: 'entall', definiteness: 'ubestemt' },
              feminin: { genus: 'f', number: 'entall', definiteness: 'ubestemt' },
              noytrum: { genus: 'n', number: 'entall', definiteness: 'ubestemt' },
              flertall: { genus: null, number: 'flertall', definiteness: null },
              bestemt: { genus: null, number: 'entall', definiteness: 'bestemt' },
              ubestemt: { genus: null, number: 'entall', definiteness: 'ubestemt' },
              alle: { genus: null, number: null, definiteness: null },
            };
            const baseLower = (entry.word || '').toLowerCase();
            const emitDegreeBlock = (degree, degreeBlock) => {
              if (!degreeBlock || typeof degreeBlock !== 'object') return;
              for (const [formKey, formRaw] of Object.entries(degreeBlock)) {
                // One-level nested objects ("ubestemt": { "hankjønn_hunkjønn":
                // "liten" }) — flatten their string leaves under the parent
                // formKey. Previously dropped entirely.
                const formValues = Array.isArray(formRaw) ? formRaw
                  : (formRaw && typeof formRaw === 'object') ? Object.values(formRaw).filter(x => typeof x === 'string')
                  : [formRaw];
                for (const form of formValues) {
                  if (!form || typeof form !== 'string') continue;
                  const meta = ADJ_FORM_META[formKey] || { genus: null, number: null, definiteness: null };
                  const lower = form.toLowerCase();
                  if (degree === 'positiv' && lower === baseLower) continue;
                  // Intentionally emit duplicates by word (e.g. flertall & bestemt
                  // both "store") — display-level dedup downstream keeps the
                  // highest-scoring match for the current agreement context.
                  wordList.push({
                    word: lower,
                    display: form,
                    translation: `${entry.word} (${degree} ${formKey})`,
                    type: degree === 'komparativ' ? 'comparative'
                        : degree === 'superlativ' ? 'superlative'
                        : 'adjform',
                    baseWord: entry.word,
                    genus: meta.genus,
                    number: meta.number,
                    definiteness: meta.definiteness,
                    zipf: zipf
                  });
                }
              }
            };
            for (const degree of ['positiv', 'komparativ', 'superlativ']) {
              emitDegreeBlock(degree, entry.declension[degree]);
            }
            // Sideform paradigms: declension.paradigms[] each carry their own
            // positiv/komparativ/superlativ blocks («liten» keeps noytrum
            // 'lite' and bestemt 'lille' in a paradigm branch — previously
            // invisible, so isAdjective missed 'lille'/'vesle').
            if (Array.isArray(entry.declension.paradigms)) {
              for (const p of entry.declension.paradigms) {
                if (!p || typeof p !== 'object') continue;
                for (const degree of ['positiv', 'komparativ', 'superlativ']) {
                  emitDegreeBlock(degree, p[degree]);
                }
              }
            }
          }

          // ES/FR: emit adjective forms (m/f/m_pl/f_pl) so inflected adjectives
          // (próxima, simpática, abiertos, …) enter validWords. Mirrors the
          // Norwegian declension loop above. Without this branch, valid Spanish/
          // French adjective forms appear unknown to the spell-checker, and
          // typo-fuzzy then suggests bizarre d=1 neighbors (próxima→próximo as
          // a typo, simpática→simpático as a typo). Schema:
          //   ES: forms = { m, f, m_pl, f_pl } — string-valued
          //   FR: forms = { m, f, m_pl, f_pl } — string-valued
          //   DE has its own declension shape and is not indexed here.
          // (see below — Norwegian determiner declension emission lives
          // outside the adjectivebank branch since determiners ship in
          // generalbank with type:"det")

          if (!isNorwegian && entry.forms && typeof entry.forms === 'object'
              && (entry.forms.m || entry.forms.f || entry.forms.m_pl || entry.forms.f_pl)) {
            const baseLower = (entry.word || '').toLowerCase();
            const ADJ_ROMANCE_FORMS = ['m', 'f', 'm_pl', 'f_pl'];
            for (const formKey of ADJ_ROMANCE_FORMS) {
              const formRaw = entry.forms[formKey];
              if (!formRaw || typeof formRaw !== 'string') continue;
              const lower = formRaw.toLowerCase();
              if (lower === baseLower) continue;
              wordList.push({
                word: lower,
                display: formRaw,
                translation: `${entry.word} (${formKey})`,
                type: 'adjform',
                baseWord: entry.word,
                zipf: zipf,
              });
            }
          }

          // Phase 47 Track D: German adjective declension. Shape:
          //   declension.{positiv,komparativ,superlativ}.{stark,schwach,gemischt}
          //     .{nominativ,akkusativ,dativ,genitiv}.{maskulin,feminin,neutrum,plural}
          // Each leaf is a string form. Without emitting them, valid declined
          // adjectives (schöne, schönen, schönes, kranken, spannendes, …)
          // appear unknown to the spell-checker and typo-fuzzy invents bizarre
          // neighbors (schöne→schön, kranken→Kranken, spannendes→spannend).
          if (lang === 'de' && entry.declension && typeof entry.declension === 'object') {
            const baseLower = (entry.word || '').toLowerCase();
            for (const degree of ['positiv', 'komparativ', 'superlativ']) {
              const degreeBlock = entry.declension[degree];
              if (!degreeBlock || typeof degreeBlock !== 'object') continue;
              for (const strengthKey of ['stark', 'schwach', 'gemischt']) {
                const strengthBlock = degreeBlock[strengthKey];
                if (!strengthBlock || typeof strengthBlock !== 'object') continue;
                for (const caseKey of ['nominativ', 'akkusativ', 'dativ', 'genitiv']) {
                  const caseBlock = strengthBlock[caseKey];
                  if (!caseBlock || typeof caseBlock !== 'object') continue;
                  for (const [genusKey, formRaw] of Object.entries(caseBlock)) {
                    if (typeof formRaw !== 'string' || !formRaw) continue;
                    const lower = formRaw.toLowerCase();
                    if (lower === baseLower) continue;
                    wordList.push({
                      word: lower,
                      display: formRaw,
                      translation: `${entry.word} (${degree} ${strengthKey} ${caseKey} ${genusKey})`,
                      type: degree === 'komparativ' ? 'comparative'
                          : degree === 'superlativ' ? 'superlative'
                          : 'adjform',
                      baseWord: entry.word,
                      zipf: zipf,
                    });
                  }
                }
              }
            }
          }
        }

        // Phase 47 Track D: German possessive pronoun declension. Data lemmas
        // (mein/dein/sein/ihr/unser/euer + meine/deine/seine/ihre/unsere/eure)
        // exist in pronounsbank but carry no declension table — they follow the
        // kein-paradigm strictly, so generate it algorithmically rather than
        // duplicating the table in 12 data entries. Without this, weak/strong
        // declined forms (seinen, ihren, meinem, deines, …) appear unknown and
        // typo-fuzzy invents bizarre neighbors (seinen→seifen, ihren→ihnen).
        if (lang === 'de' && bank === 'pronounsbank' && entry.type && entry.type.includes('possessiv') && typeof entry.word === 'string') {
          // Pick the bare stem: "sein"/"mein"/etc. or strip trailing -e from
          // "seine"/"meine"/etc.
          const base = entry.word.toLowerCase();
          const stem = base.endsWith('e') && !base.endsWith('re') && !base.endsWith('se')
            ? base.slice(0, -1)  // shouldn't fire; both "seine" and "sein" pass through endsWith('e')→stem='sein'/'sein' chain below
            : base;
          // Both "sein" (bare) and "seine" (nom.f.sg) need to derive the same
          // 5-form paradigm. Use the bare-stem reading:
          const bareStem = base.endsWith('e') ? base.slice(0, -1) : base;
          // kein-paradigm endings (m.nom, n.nom, n.akk = bare; rest get suffixes)
          const SUFFIXES = ['e', 'en', 'em', 'es', 'er'];
          for (const sfx of SUFFIXES) {
            const form = bareStem + sfx;
            if (form === base) continue;  // already emitted as a lemma
            wordList.push({
              word: form.toLowerCase(),
              display: form,
              translation: `${entry.word} (possessiv declined)`,
              type: 'adjform',
              baseWord: entry.word,
              zipf: zipf,
            });
          }
        }

        // NB/NN determiner declension emission (Pass 3 follow-up).
        // Determiners like hvilken/hvilket/hvilke ship in generalbank with
        // type:"det" and a declension.positiv block of the same shape as
        // adjectives. The adjectivebank branch above doesn't run for them
        // (bank gate), so the inflected forms (hvilket, hvilke) would never
        // reach validWords. This emits the same shape with type:"detform".
        if (isNorwegian && entry.type === 'det' && entry.declension && entry.declension.positiv) {
          const baseLower = (entry.word || '').toLowerCase();
          const positiv = entry.declension.positiv;
          for (const formKey of ['maskulin', 'feminin', 'noytrum', 'flertall', 'bestemt']) {
            const formRaw = positiv[formKey];
            const formValues = Array.isArray(formRaw) ? formRaw : [formRaw];
            for (const form of formValues) {
              if (!form || typeof form !== 'string') continue;
              const lower = form.toLowerCase();
              if (lower === baseLower) continue;
              wordList.push({
                word: lower,
                display: form,
                translation: `${entry.word} (det.${formKey})`,
                type: 'detform',
                baseWord: entry.word,
                zipf: zipf,
              });
            }
          }
        }

        // NB/NN genitive-s emission (Pass 3 follow-up — Note 2 path 1).
        // Every NB/NN noun systematically forms its genitive by appending
        // -s to any form: byens, dagens, årenes, husets, …. Modern NB has
        // no irregular exceptions worth enumerating. Emit <form>+s for the
        // base headword AND the bestemt-entall (the only two forms that
        // commonly take written genitive in school-level prose). Skip if
        // the noun already ends in -s, -x, or -z (no double-s in NB
        // orthography; "fars" is the canonical form for already-s-ending
        // stems but the underlying entry typically lists it explicitly).
        if (isNorwegian && bank === 'nounbank' && entry.word && typeof entry.word === 'string') {
          const lemma = entry.word;
          const lemmaLower = lemma.toLowerCase();
          const lastChar = lemmaLower.slice(-1);
          if (lastChar !== 's' && lastChar !== 'x' && lastChar !== 'z') {
            const gen = lemma + 's';
            wordList.push({
              word: gen.toLowerCase(),
              display: gen,
              translation: `${entry.word} (genitiv)`,
              type: 'genitive',
              baseWord: entry.word,
              genus: entry.genus || null,
              zipf: zipf,
            });
            // Also emit bestemt-entall + s when present (e.g. "byen" → "byens"
            // is the common rendering rather than "by" → "bys" alone).
            const bestEntall = entry.forms?.bestemt?.entall || entry.declension?.bestemt?.entall;
            const bestArr = Array.isArray(bestEntall) ? bestEntall : (bestEntall ? [bestEntall] : []);
            for (const def of bestArr) {
              if (typeof def !== 'string' || !def) continue;
              const defLast = def.toLowerCase().slice(-1);
              if (defLast === 's' || defLast === 'x' || defLast === 'z') continue;
              const defGen = def + 's';
              wordList.push({
                word: defGen.toLowerCase(),
                display: defGen,
                translation: `${entry.word} (bestemt genitiv)`,
                type: 'genitive',
                baseWord: entry.word,
                genus: entry.genus || null,
                zipf: zipf,
              });
            }
          }
        }
      }
    }

    // Phase 47 Track E: German proper nouns (cities, countries, common given
    // names). Without these in validWords, typo-fuzzy invents wrong-direction
    // neighbors — "München → Mädchen", "Hamburg → Hamburger", "Wien → Wein",
    // "Berlin → Berliner". Curated list keeps install-size negligible.
    if (lang === 'de') {
      const DE_PROPER_NOUNS = [
        // Cities — Germany
        'Berlin', 'Hamburg', 'München', 'Köln', 'Frankfurt', 'Stuttgart',
        'Düsseldorf', 'Dortmund', 'Essen', 'Leipzig', 'Bremen', 'Dresden',
        'Hannover', 'Nürnberg', 'Duisburg', 'Bochum', 'Wuppertal', 'Bonn',
        'Bielefeld', 'Mannheim', 'Karlsruhe', 'Münster', 'Wiesbaden', 'Augsburg',
        'Aachen', 'Mönchengladbach', 'Gelsenkirchen', 'Braunschweig', 'Kiel',
        'Chemnitz', 'Halle', 'Magdeburg', 'Freiburg', 'Krefeld', 'Mainz',
        'Lübeck', 'Erfurt', 'Oberhausen', 'Rostock', 'Kassel', 'Hagen',
        'Potsdam', 'Saarbrücken', 'Heidelberg', 'Regensburg', 'Ingolstadt',
        'Würzburg', 'Ulm', 'Heilbronn', 'Pforzheim', 'Göttingen', 'Trier',
        'Reutlingen', 'Koblenz', 'Jena', 'Erlangen', 'Tübingen', 'Passau',
        // Cities — Austria, Switzerland
        'Wien', 'Salzburg', 'Innsbruck', 'Graz', 'Linz', 'Klagenfurt',
        'Bregenz', 'Zürich', 'Bern', 'Basel', 'Genf', 'Lausanne', 'Luzern',
        // Countries
        'Deutschland', 'Österreich', 'Schweiz', 'Frankreich', 'Italien',
        'Spanien', 'Polen', 'Russland', 'England', 'Schottland', 'Irland',
        'Norwegen', 'Schweden', 'Dänemark', 'Finnland', 'Niederlande',
        'Belgien', 'Griechenland', 'Türkei', 'Ungarn', 'Tschechien',
        'Slowakei', 'Portugal', 'Kroatien', 'Serbien', 'Rumänien', 'Bulgarien',
        'Amerika', 'Japan', 'China', 'Indien', 'Brasilien', 'Australien',
        'Kanada', 'Mexiko', 'Afrika', 'Europa', 'Asien',
        // Common given names (high-frequency in school texts)
        'Anna', 'Maria', 'Peter', 'Hans', 'Klaus', 'Thomas', 'Michael',
        'Andreas', 'Stefan', 'Markus', 'Sebastian', 'Christian', 'Daniel',
        'Lisa', 'Julia', 'Sabine', 'Petra', 'Karin', 'Susanne', 'Monika',
        'Sophie', 'Lena', 'Emma', 'Marie', 'Mia', 'Lukas', 'Felix', 'Max',
        'Paul', 'Jonas', 'Leon', 'Tim', 'Tom', 'Ben', 'Jan', 'Jens',
        // Months and days are common nouns in German (start with capitals);
        // they ship in the existing nounbank/numbersbank, so we don't repeat
        // them here — only proper nouns the bank doesn't carry get added.
      ];
      for (const w of DE_PROPER_NOUNS) {
        wordList.push({
          word: w.toLowerCase(),
          display: w,
          translation: 'proper noun',
          type: 'propernoun',
          baseWord: w,
        });
      }
    }

    // Phase 48 Wave B-6: NB anglicism brand-name list. Tech brands and
    // common anglicisms students write in lowercase definite forms (`ipaden`,
    // `iphonen`, `pcen`) are absent from Norsk Ordbank, so typo-fuzzy invents
    // wrong-direction neighbors — `ipaden → ipa-en`, `pcen → pcen` doesn't
    // round-trip. Curated list keeps install-size negligible. NB-only;
    // mirroring the DE proper-noun pattern above.
    if (lang === 'nb' || lang === 'nn') {
      const NB_ANGLICISM_BRANDS = [
        // Brands + their NB definite-singular forms (ipad / ipaden, iPad / iPaden).
        // Lowercase + capitalized variants both appear in student writing.
        'ipad', 'ipaden', 'ipader', 'ipadene',
        'iPad', 'iPaden', 'iPader', 'iPadene',
        'iphone', 'iphonen', 'iphoner', 'iphonene',
        'iPhone', 'iPhonen', 'iPhoner', 'iPhonene',
        'pc', 'pcen', 'pcer', 'pcene',
        'mac', 'macen', 'macer', 'macene',
        'youtube', 'tiktok', 'snapchat', 'instagram', 'facebook',
        'wifi', 'wifien',
        'app', 'appen', 'apper', 'appene',
        'podcast', 'podcasten', 'podcaster', 'podcastene',
        'streaming', 'streamingen',
      ];
      for (const w of NB_ANGLICISM_BRANDS) {
        wordList.push({
          word: w.toLowerCase(),
          display: w,
          translation: 'anglicism (tech/brand)',
          type: 'anglicism',
          baseWord: w,
        });
      }
    }

    // Phase 47 Track D: German der-paradigm determiner forms. These aren't
    // in any vocab bank as data lemmas, so generate them once per-lang at the
    // tail of buildWordList. Without this, valid determined forms (jeden,
    // dieser, manchen, …) appear unknown and typo-fuzzy invents neighbors.
    if (lang === 'de') {
      const DE_DET_STEMS = ['dies', 'jen', 'jed', 'manch', 'welch', 'solch', 'all'];
      // der-paradigm: m.nom=-er, f=-e, n=-es, pl=-e | akk m=-en, f=-e, n=-es, pl=-e
      //               dat m=-em, f=-er, n=-em, pl=-en | gen m=-es, f=-er, n=-es, pl=-er
      const DE_DET_ENDINGS = ['er', 'e', 'es', 'en', 'em'];
      for (const stem of DE_DET_STEMS) {
        for (const sfx of DE_DET_ENDINGS) {
          const form = stem + sfx;
          wordList.push({
            word: form.toLowerCase(),
            display: form,
            translation: `${stem}- (der-paradigm)`,
            type: 'adjform',
            baseWord: stem,
          });
        }
      }
    }

    return wordList;
  }

  // ── normalizeBigrams — copied verbatim from word-prediction.js:769–781 ──
  //
  // Deletes raw._metadata; lowercases both outer ("prev word") and inner
  // ("next word") keys; merges duplicates (e.g. "Guten"+"guten") by keeping
  // the higher weight. Mutates the input by deleting _metadata — matches the
  // original semantics exactly. Pass a fresh parse to this function.
  function normalizeBigrams(raw) {
    if (!raw) return null;
    delete raw._metadata;
    const out = {};
    for (const [key, pairs] of Object.entries(raw)) {
      const lowerKey = key.toLowerCase();
      const merged = out[lowerKey] || {};
      for (const [word, weight] of Object.entries(pairs)) {
        const lowerWord = word.toLowerCase();
        merged[lowerWord] = Math.max(merged[lowerWord] || 0, weight);
      }
      out[lowerKey] = merged;
    }
    return out;
  }

  // ── buildLookupIndexes — copied verbatim from spell-check.js:136–172 ──
  //
  // Every Map/Set key is lowercase. Caller MUST pass a wordList where
  // entry.word is already lowercased (buildWordList guarantees this).
  function buildLookupIndexes(wordList, lang) {
    const nounGenus = new Map();        // 'hus' → 'n'
    const nounLemmaGenus = new Map();   // base-form nouns only (no inflected/typo)
    const verbInfinitive = new Map();   // 'spiser' → 'spise'
    const validWords = new Set();       // every known lowercase form
    const isAdjective = new Set();      // 'stor' → true
    const adjLemma = new Map();         // 'gammal' → 'gamal', 'stort' → 'stor' (every form → lemma headword)
    const typoFix = new Map();          // 'komer' → 'kommer'
    const compoundNouns = new Set();    // noun-bank base entries
    // Likestilte variant spellings (vei↔veg, bjørk↔bjerk) — the dictionary
    // needs them in nounGenus so a variant-spelled compound decomposes, but a
    // rule that merges adjacent nouns must be able to tell them apart from
    // ordinary lemmas: `jus` is a spelling of `juss`, and its arrival in
    // nounGenus turned «første avdeling jus» into a missing compound.
    const variantSpellings = new Set();
    const knownPresens = new Set();     // 'spiser' → true
    const knownPreteritum = new Set();  // 'spiste' → true
    const knownParticiples = new Set(); // 'skjedd' → true — for modal+participle guard (conditional perfect)
    const mwTokenCandidates = new Set(); // single tokens of multi-word forms ("kämme mich" → "kämme"); merged post-curated-snapshot in buildIndexes
    const acceptedCandidates = new Set(); // type-'accepted' forms — same accept-don't-suggest route (v3.0.122)
    const verbForms = new Map();        // 'spise' → { present: Set, past: Set }
    const nounForms = new Map();        // 'hus' → { singular: Set, plural: Set }

    const isNorwegian = lang === 'nb' || lang === 'nn';

    for (const entry of wordList) {
      const w = entry.word;
      if (!w) continue;

      // Mirror the validWords typo exclusion (line below) — typo-type
      // entries are misspellings, not legitimate adjective forms. Without
      // this exclusion, fr-adj-gender mis-detects polluted-typo strings
      // like 'jeun' (typo of 'jeune') as a valid masculine form, then
      // fires "jeune → jeun" on every "jeune <m-noun>" phrase (jeune
      // homme / jeune garçon / jeune professeur / jeune artiste).
      //
      // 'adjform' covers declension-emitted forms from both NB/NN (the
      // positiv-branch maskulin/feminin/noytrum/flertall/bestemt) and the
      // Romance m/f/m_pl/f_pl form table. Without including them, the
      // gender rule's ARTICLE+ADJ+NOUN lookback misses every adjective
      // declension form that differs from the lemma — e.g. NN 'kjend'
      // (maskulin form of lemma 'kjent') wasn't in isAdjective, so
      // "ei kjend forfattar" didn't trigger nb-gender despite being a
      // real f-article-on-m-noun error.
      if (entry.type !== 'typo' && (
        entry.bank === 'adjectivebank' ||
        entry.type === 'adjective' ||
        entry.type === 'adjform' ||
        entry.type === 'comparative' ||
        entry.type === 'superlative' ||
        (entry.type === 'plural' && entry.bank === 'adjectivebank')
      )) {
        isAdjective.add(w);
        // adjLemma: map every adjective form to the lemma headword so the
        // context-typo rule can detect "same-lemma" sideform swaps
        // (gammal ↔ gamal, store ↔ stor) and skip those candidates.
        const lemma = entry.baseWord ? entry.baseWord.toLowerCase() : w;
        adjLemma.set(w, lemma);
      }

      // nounForms buckets bare singular/plural forms per lemma for
      // universal-agreement ("las casa" → "las casas") and the DE number
      // rules. Three populations feed it:
      //   1. inflected entries (nounform/plural) keyed on entry.baseWord, and
      //   2. the base headword itself (type:'base') — which carries NO
      //      baseWord (it IS the base), so it must be keyed on its own word
      //      and seeded into the singular bucket. Without this the bare
      //      singular ("casa") is never recorded, so universal-agreement's
      //      `forms.singular.has(next.word)` is always false and the rule
      //      silently never fires. This was the universal-agreement bug.
      // Exclusions: typos (misspellings, not valid forms — e.g. casa's
      // typos ["casas","cassa",…] would otherwise inject the plural into the
      // singular bucket) and multi-word article phrases ("una casa",
      // "las casas") which never match a bare token AND would corrupt the
      // plural-fix suggestion (Array.from(plural)[0] → "unas casas").
      let __nfBase = null;
      if ((entry.bank === 'nounbank' || entry.type === 'nounform' || entry.type === 'plural') && entry.baseWord) {
        __nfBase = entry.baseWord.toLowerCase();
      } else if (entry.type === 'base' && entry.bank === 'nounbank') {
        __nfBase = w;
      }
      // v3.0.122: 'accepted' (alternative valid spellings — incl. the typo-
      // pollution repair's relocated conjugations) and 'translation' entries
      // carry NO number information, so they can't be bucketed — an accepted
      // "casas" under casa would land in the SINGULAR bucket and make
      // universal-agreement flag correct "las casas". They still reach
      // validWords; only the number-sensitive nounForms index excludes them.
      if (__nfBase && entry.type !== 'typo' && entry.type !== 'accepted' && entry.type !== 'translation' && !w.includes(' ')) {
        const base = __nfBase;
        if (!nounForms.has(base)) {
          nounForms.set(base, { singular: new Set(), plural: new Set() });
        }
        const forms = nounForms.get(base);
        // Buckets nounform entries by number. The 'nounform' emission path
        // (line ~528) sets entry.number = 'flertall' for the flertall slot;
        // earlier code only checked wordKey === 'plural', so all ES/FR
        // plural forms silently fell into the singular bucket. That broke
        // universal-agreement on bare-form plurals (días, profesores, …)
        // exposed by the dia_noun bare-forms fix.
        if (
          entry.type === 'plural' ||
          entry.wordKey === 'plural' ||
          entry.number === 'flertall' ||
          entry.number === 'plural'
        ) {
          forms.plural.add(w);
        } else {
          forms.singular.add(w);
        }
      }

      if (entry.type === 'conjugation') {
        const inf = (entry.baseWord || '').replace(/^å\s+/i, '').trim();
        if (inf) {
          if (!verbForms.has(inf)) {
            verbForms.set(inf, { present: new Set(), past: new Set() });
          }
          const forms = verbForms.get(inf);
          if (isNorwegian) {
            if (entry.formKey === 'presens') {
              knownPresens.add(w);
              forms.present.add(w);
            } else if (entry.formKey === 'preteritum') {
              knownPreteritum.add(w);
              forms.past.add(w);
            } else if (entry.formKey === 'perfektum_partisipp') {
              knownParticiples.add(w);
            }
          } else {
            if (entry.tenseKey === 'present') {
              knownPresens.add(w);
              forms.present.add(w);
              // German separable verbs store the finite form with its detached
              // particle ("räume auf", "kaufe ein"). The bare stem before the
              // space is itself the V2 finite form a student writes ("Jeden
              // Abend räume ich … auf"), so index it too — otherwise the
              // de-capitalization Track-D verb guard misses it and flags the
              // noun-homograph (räume→Räume, the plural of Raum).
              const sp = w.indexOf(' ');
              if (sp > 0) { const stem = w.slice(0, sp); knownPresens.add(stem); forms.present.add(stem); }
            } else if (entry.tenseKey === 'past') {
              knownPreteritum.add(w);
              forms.past.add(w);
              const sp = w.indexOf(' ');
              if (sp > 0) { const stem = w.slice(0, sp); knownPreteritum.add(stem); forms.past.add(stem); }
            }
          }
        }
      }
      // Typo-type entries must NOT be added to validWords — they are
      // misspellings, not valid forms. The curated-typo branch in
      // spell-check-core.js skips any token that's in validWords, so
      // adding typos here silently disables the curated-fix path (and
      // the fuzzy path too, since it also respects validWords). This
      // bug was masked in Phase 1 because the baseline NB typo fixtures
      // happened to use typos that weren't in the bank at all. Phase 2
      // DATA-02's typo-bank expansion surfaced it — the seeded cases
      // couldn't hit the curated branch because their own typos had
      // been shadowed into validWords. Fixed here as a Rule-1 auto-fix.
      // v3.0.118: translation-type entries are the NORWEGIAN side of each
      // dictionary pair ("frisch" → "frisk") added to wordList for reverse
      // prediction/search. For the FOREIGN languages they must NOT enter
      // validWords: with them, every dictionary-covered Norwegian word was
      // "valid German/Spanish/French" — de-codeswitch could never flag
      // "frisk"/"glede"/"Italia"/"brus" in a German essay, and FR validWords
      // carried Norwegian phrases like "gi opp". Same exclusion reasoning as
      // typos: wordList membership ≠ target-language validity. For NB/NN the
      // translation field is the SISTER-DIALECT gloss — part of the
      // deliberate cross-dialect tolerance surface (and fuzzy-suggestion
      // pool: "skirver" → "skriver"), so Norwegian keeps them.
      const translationLeak = entry.type === 'translation'
        && lang !== 'nb' && lang !== 'nn';
      // v3.0.122: 'accepted' forms (alternative spellings + the typo-
      // pollution repair's relocated conjugations) follow the SAME
      // accept-don't-suggest route as multi-word tokens: collected here,
      // merged into the broad accept-path post-curated-snapshot, and
      // excluded from typo-fuzzy's suggestion pool — without the exclusion
      // the 44k relocated forms re-created the wrong-direction-fix class
      // ("cierto" → cierro, "Quoique" → Quelque came back).
      if (entry.type === 'accepted') {
        acceptedCandidates.add(w);
      } else if (entry.type !== 'typo' && !translationLeak) {
        validWords.add(w);
        // Multi-word forms are stored as full strings — DE reflexives
        // ("kämme mich") and separable verbs ("biege ab"), ES/FR composed
        // tenses ("he abandonado", "j'ai abandonné"), EN to-infinitives.
        // The spell-checker tests single tokens, so without splitting these
        // the verb token itself is invisible to validWords and typo-fuzzy
        // flags it (v3.0.112 bug: "kämme" → "komme"). At the time of the
        // fix this affected over HALF of all DE valid forms (22k of 39.5k)
        // and a third of ES/FR. Only COLLECT candidates here — they merge
        // into the broad accept-path in buildIndexes AFTER the
        // curatedValidWords snapshot (same pattern as the Ordbank extras),
        // so token-derived validity never silences the curated NB→NN
        // leakage/codeswitch rules, and token-only words are tracked in
        // multiwordTokens so typo-fuzzy keeps them out of its suggestion
        // pool. The letters-only guard drops annotation junk like "/".
        if (w.includes(' ')) {
          for (const part of w.split(/\s+/)) {
            if (/^[\p{L}\p{M}'’-]+$/u.test(part)) mwTokenCandidates.add(part);
          }
        }
      }
      // Verb infinitives are stored as "å sykle" / "å være" — also accept the
      // bare infinitive so unprefixed usage doesn't get flagged as unknown.
      if (entry.type !== 'typo' && w.startsWith('å ')) validWords.add(w.slice(2));

      if ((entry.bank === 'nounbank' || entry.type === 'nounform' || entry.type === 'plural') && entry.genus) {
        // Only set genus if not already present, so the base form wins
        // for common ambiguous words.
        // Épicène nouns (un/une spécialiste) and gender-homographs (le/la tour,
        // le/la mode — marked `genderTrap` upstream) have no single agreement
        // gender, so store 'both': every article/adjective/demonstrative/
        // possessive agreement rule skips a 'both' noun instead of re-deriving
        // the same false positive from an arbitrary stored gender. Dictionary
        // display reads the raw entry.genus, so this only affects the
        // spell-check accept-path. FR-only fields → other languages unaffected.
        if (!nounGenus.has(w)) {
          const g = entry.epicene === true ? 'both' : entry.genus;
          nounGenus.set(w, g);
        } else if (lang === 'nb' || lang === 'nn') {
          // Collision: the same surface form belongs to ANOTHER lemma with a
          // different genus — 'plaster' (n) is also the plural of 'plast' (m),
          // 'arbeider' (m) the plural of 'arbeid' (n), 'eden' (n) the definite
          // of 'ed' (m). First-write-wins depends on bank iteration order and
          // buried the base lemma's genus (Ordbank sweep: correct «et plaster»
          // flagged because plast-plural's m won). Merge into a dual-genus
          // value — the NB/NN agreement consumers all any-match '/'-lists.
          // Scoped to nb/nn: the collision class comes from Ordbank inflected
          // keys; other languages keep first-write semantics.
          const g = entry.epicene === true ? 'both' : entry.genus;
          const existing = nounGenus.get(w);
          if (g && g !== 'both' && existing && existing !== 'both' && existing !== g) {
            const merged = new Set(String(existing).split('/').concat(String(g).split('/')));
            nounGenus.set(w, Array.from(merged).join('/'));
          }
        }
      }

      // Phase 17-05: lemma-only genus for strict compound decomposition.
      // Excludes inflected forms (nounform, plural) and typos to prevent
      // false positives when sarskriving rule decomposes adjacent tokens.
      if (entry.bank === 'nounbank' && entry.type !== 'typo' && entry.type !== 'nounform' && entry.type !== 'plural' && !entry.variantForm && entry.genus) {
        // Same épicène/gender-homograph → 'both' transform as nounGenus above,
        // so the demonstrative (fr-ce-cet-cette) and possessive
        // (fr-accord-possessif) agreement rules — which read nounLemmaGenus —
        // skip épicène/homograph nouns too. Presence (has) is unchanged, so the
        // særskriving compound path is unaffected.
        if (!nounLemmaGenus.has(w)) {
          nounLemmaGenus.set(w, entry.epicene === true ? 'both' : entry.genus);
        }
      }

      // For særskriving: only consider noun-bank base entries, to avoid
      // flagging "stor by" (valid phrase) as a compound of the adjective form.
      // Variant spellings are excluded for the same reason they are kept out of
      // nounLemmaGenus: they widen the særskriving surface with homographs and
      // buy the dictionary nothing. Measured on nynorsk — `jus` as a spelling of
      // `juss` turned «første avdeling jus» into a missing compound.
      if (entry.bank === 'nounbank' && entry.type !== 'typo' && !entry.variantForm) {
        compoundNouns.add(w);
      }

      if (entry.variantForm) variantSpellings.add(w);

      if (entry.type === 'conjugation' && entry.baseWord) {
        const inf = entry.baseWord.replace(/^å\s+/i, '').trim();
        if (inf && inf !== w) verbInfinitive.set(w, inf);
      }

      if (entry.type === 'typo' && entry.display) {
        typoFix.set(w, entry.display);
      }
    }

    return { nounGenus, nounLemmaGenus, verbInfinitive, validWords, isAdjective, adjLemma, knownPresens, knownPreteritum, knownParticiples, verbForms, nounForms, typoFix, compoundNouns, variantSpellings, mwTokenCandidates, acceptedCandidates };
  }

  // ── Phase 8: Build participle → auxiliary Map from raw verbbank ──
  // Maps past-participle forms (lowercase) to their required auxiliary
  // ('haben', 'sein', or 'both'). Built from raw data rather than wordList
  // because wordList entries don't carry conjugation details.
  function buildParticipleToAux(raw) {
    const participleToAux = new Map();
    const reflexiveOnly = new Set(); // participles mapped only via a reflexive entry
    if (!raw || !raw.verbbank) return participleToAux;
    for (const entry of Object.values(raw.verbbank)) {
      const perf = entry.conjugations?.perfektum || entry.conjugations?.passe_compose;
      if (!perf) continue;
      if (!perf.participle || !perf.auxiliary) continue;
      // Phase 42: defensive against future array-valued participles.
      const partValues = Array.isArray(perf.participle) ? perf.participle : [perf.participle];
      // v3.0.121 (synthetic-wave FP "il a amélioré" → est): a REFLEXIVE
      // verb's être only applies with the reflexive pronoun present — the
      // shared participle is avoir-governed in plain use (améliorer). Mark
      // 'both' so fr-etre-avoir treats it as undecidable.
      const reflexive = typeof entry.word === 'string' && /^s['’]|^se\s|^sich\s/.test(entry.word);
      // The reflexive→'both' undecidability marker is FRENCH-specific: a French
      // reflexive verb's être only applies with the reflexive pronoun, while
      // plain use is avoir-governed ("il a amélioré" vs "il s'est amélioré").
      // GERMAN reflexives, by contrast, ALWAYS form the Perfekt with haben
      // ("hat sich verändert/gesetzt") — their entry already carries
      // auxiliary:'haben', so use it directly instead of 'both'. Without this,
      // reflexive-derived participles (verändert, gesetzt) were 'both' and the
      // de-perfekt-aux both-branch defaulted them to sein, flagging correct
      // "hat verändert"/"hat gesetzt".
      const frenchReflexiveBoth = reflexive
        && (perf.auxiliary === 'être' || perf.auxiliary === 'avoir');
      const auxToStore = frenchReflexiveBoth ? 'both' : perf.auxiliary;
      for (const p of partValues) {
        if (typeof p !== 'string' || !p) continue;
        const participle = p.toLowerCase();
        const existing = participleToAux.get(participle);
        if (existing === undefined) {
          participleToAux.set(participle, auxToStore);
          if (frenchReflexiveBoth) reflexiveOnly.add(participle);
        } else if (!reflexive && reflexiveOnly.has(participle)) {
          // A PLAIN verb shares this participle — its explicit aux wins over
          // the reflexive 'both' marker ("elle a sorti" → est needs sortir's
          // être, not se-sortir's undecidable).
          participleToAux.set(participle, perf.auxiliary);
          reflexiveOnly.delete(participle);
        } else if (existing !== auxToStore
                   && existing !== 'être' && existing !== 'avoir'
                   && perf.auxiliary !== 'être' && perf.auxiliary !== 'avoir') {
          // German conflict: two entries claim this participle with different
          // auxiliaries — e.g. motion "umziehen"=both vs reflexive "sich
          // umziehen"=haben ("ist umgezogen" moved house / "hat sich umgezogen"
          // changed clothes). Genuinely undecidable → 'both'; the both-branch
          // resolver decides per clause instead of false-flagging one reading.
          // (French être/avoir stays on the plain-verb-wins path above.)
          participleToAux.set(participle, 'both');
        }
      }
    }
    return participleToAux;
  }

  // ── Wave C0: Build plural-form → genus index from raw nounbank ──
  // Maps lowercased PLURAL noun forms (livres, maisons) to their genus
  // ('m'/'f'). Built from raw nounbank's `plural` field — NOT from the
  // feature-gated wordList — so it stays part of the unfiltered spell-check
  // superset (a plural rule must work even when grammar_plural is off in the
  // popup preset; cf. the buildLookupIndexes "MUST NOT be feature-gated" note).
  // Number-ambiguity carve-out: nouns whose plural equals the singular
  // (accès, prix, fils, cas) are EXCLUDED so no rule mistakes them for an
  // exclusively-plural form. Counterpart of nounLemmaGenus (singular lemmas).
  function buildNounPluralGenus(raw) {
    const nounPluralGenus = new Map();
    if (!raw || !raw.nounbank) return nounPluralGenus;
    for (const entry of Object.values(raw.nounbank)) {
      if (!entry || !entry.genus || !entry.plural) continue;
      const pl = String(entry.plural).toLowerCase();
      if (pl === String(entry.word || '').toLowerCase()) continue; // invariable
      if (!nounPluralGenus.has(pl)) nounPluralGenus.set(pl, entry.genus);
    }
    return nounPluralGenus;
  }

  // ── Phase 19: Build s-passive form index from raw verbbank ──
  // Maps lowercased s-passive forms (skrives, skrivast) to { baseVerb, isDeponent }.
  // For deponent (st-)verbs, also maps regular conjugation forms so the rule
  // can recognise "synest" (presens of deponent "synast").
  function buildSPassivIndex(raw, lang) {
    const sPassivForms = new Map();
    if (!raw || !raw.verbbank) return sPassivForms;

    // Known NN deponent/reciprocal st-verbs per Sprakradet and ROADMAP SC-6.
    // These are lexicalised forms, NOT productive s-passives.
    // Override isDeponent even if the verbbank derived them from a base verb
    // (e.g., møtast derived from møte has isDeponent: false in data).
    const NN_DEPONENTS = lang === 'nn' ? new Set([
      'møtast', 'synast', 'trivast', 'finnast', 'lykkast',
      'minnast', 'kjennast', 'slåast',
    ]) : null;

    for (const entry of Object.values(raw.verbbank)) {
      const conj = entry.conjugations?.presens?.former;
      if (!conj) continue;
      const isDeponent = !!entry.isDeponent;
      const baseVerb = entry.word;
      // Collect s-passive forms
      for (const key of ['s_passiv_infinitiv', 's_passiv_presens']) {
        const forms = conj[key];
        if (!forms) continue;
        const arr = Array.isArray(forms) ? forms : [forms];
        for (const f of arr) {
          if (typeof f === 'string' && f.length > 0) {
            sPassivForms.set(f.toLowerCase(), { baseVerb, isDeponent });
          }
        }
      }
      // Gap closure: derive NN finite presens s-passive from infinitive.
      // NN s-passive infinitive = stem + "ast" (e.g., lesast, skrivast).
      // NN finite presens s-passive = stem + "est" (e.g., lesest, skrivest).
      // Only derive when s_passiv_presens is absent from data (avoids overriding explicit data).
      if (lang === 'nn' && conj.s_passiv_infinitiv && !conj.s_passiv_presens) {
        const infForms = Array.isArray(conj.s_passiv_infinitiv) ? conj.s_passiv_infinitiv : [conj.s_passiv_infinitiv];
        for (const inf of infForms) {
          if (typeof inf === 'string' && inf.length >= 5 && inf.endsWith('ast')) {
            const presens = inf.slice(0, -3) + 'est';
            sPassivForms.set(presens.toLowerCase(), { baseVerb, isDeponent });
          }
        }
      }
      // v3.0.120: palatal-infinitive contraction. NN j-infinitives (byggje,
      // leggje, tenkje) yield s-passives byggjast/byggjest — but students
      // overwhelmingly write the j-less contraction (byggast/byggest), which
      // vanished from the index when the data normalized bygge → byggje.
      // Derive the contracted variants alongside.
      if (lang === 'nn') {
        for (const [k, v] of [...sPassivForms.entries()]) {
          if (v.baseVerb === baseVerb && /(g|k)j(ast|est)$/.test(k)) {
            sPassivForms.set(k.replace(/j(ast|est)$/, '$1'), v);
          }
        }
      }
      // For deponent verbs: also map their regular conjugation forms
      // so the NN rule can recognise "synest" (presens of st-verb "synast")
      if (isDeponent) {
        for (const [fk, fv] of Object.entries(conj)) {
          if (fk.startsWith('s_passiv')) continue; // already handled
          const arr = Array.isArray(fv) ? fv : [fv];
          for (const f of arr) {
            if (typeof f === 'string' && f.length > 0) {
              const clean = f.replace(/^a\s+/, '').replace(/^aa\s+/, '');
              if (clean.length > 0) {
                sPassivForms.set(clean.toLowerCase(), { baseVerb, isDeponent: true });
              }
            }
          }
        }
      }
    }

    // Override deponent status for known NN st-verbs (Gap 2 closure).
    // Verbs like møtast may be in the Map with isDeponent: false
    // (derived from base verb møte). Force them to deponent.
    if (NN_DEPONENTS) {
      for (const dep of NN_DEPONENTS) {
        const existing = sPassivForms.get(dep);
        if (existing && !existing.isDeponent) {
          sPassivForms.set(dep, { ...existing, isDeponent: true });
        } else if (!existing) {
          // Verb absent from verbbank entirely (e.g., trivast) — add it.
          sPassivForms.set(dep, { baseVerb: dep, isDeponent: true });
        }
        // Also derive the -est presens form as deponent
        if (dep.endsWith('ast') && dep.length >= 5) {
          const presens = dep.slice(0, -3) + 'est';
          const existingP = sPassivForms.get(presens);
          if (!existingP || !existingP.isDeponent) {
            sPassivForms.set(presens, { baseVerb: dep, isDeponent: true });
          }
        }
      }
    }

    return sPassivForms;
  }

  // ── Phase 11: Build mood/aspect reverse-lookup indexes from raw verbbank ──
  // Maps conjugated forms back to infinitive + person, and stores
  // subjuntivo/imperfecto/subjonctif forms keyed by infinitive|person.
  // Built from raw data (not wordList) to avoid feature-gating starvation.
  function buildMoodIndexes(raw, lang) {
    const esPresensToVerb = new Map();
    const esSubjuntivoForms = new Map();
    const esImperfectoForms = new Map();
    const esPreteritumToVerb = new Map();
    const frPresensToVerb = new Map();
    const frSubjonctifForms = new Map();
    const frSubjonctifDiffers = new Map();
    // Phase 32-01: FR aspect indexes for fr-aspect-hint rule.
    const frImparfaitToVerb = new Map();        // form (lc) → { inf, person }
    const frPasseComposeParticiples = new Map(); // participle (lc) → { inf, aux }
    const frAuxPresensForms = new Set();         // ai/as/a/avons/.../suis/...

    if (!raw || !raw.verbbank) {
      return { esPresensToVerb, esSubjuntivoForms, esImperfectoForms, esPreteritumToVerb,
               frPresensToVerb, frSubjonctifForms, frSubjonctifDiffers,
               frImparfaitToVerb, frPasseComposeParticiples, frAuxPresensForms };
    }

    // Helper: strip accents for fuzzy matching (students often omit accents)
    function stripAccents(s) {
      return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    }

    if (lang === 'es') {
      for (const entry of Object.values(raw.verbbank)) {
        const inf = (entry.word || '').replace(/^å\s+/i, '').trim();
        if (!inf) continue;
        const conj = entry.conjugations;
        if (!conj) continue;

        // Presente (presens key in ES data) → esPresensToVerb
        const pres = conj.presens;
        if (pres && pres.former) {
          for (const [person, form] of Object.entries(pres.former)) {
            if (!form) continue;
            const lc = form.toLowerCase();
            esPresensToVerb.set(lc, { inf, person });
            const stripped = stripAccents(lc);
            if (stripped !== lc) esPresensToVerb.set(stripped, { inf, person });
          }
        }

        // Preteritum → esPreteritumToVerb
        const pret = conj.preteritum;
        if (pret && pret.former) {
          for (const [person, form] of Object.entries(pret.former)) {
            if (!form) continue;
            const lc = form.toLowerCase();
            esPreteritumToVerb.set(lc, { inf, person });
            const stripped = stripAccents(lc);
            if (stripped !== lc) esPreteritumToVerb.set(stripped, { inf, person });
          }
        }

        // Subjuntivo → esSubjuntivoForms
        const subj = conj.subjuntivo;
        if (subj && subj.former) {
          for (const [person, form] of Object.entries(subj.former)) {
            if (!form) continue;
            esSubjuntivoForms.set(inf + '|' + person, form.toLowerCase());
          }
        }

        // Imperfecto → esImperfectoForms
        const imp = conj.imperfecto;
        if (imp && imp.former) {
          for (const [person, form] of Object.entries(imp.former)) {
            if (!form) continue;
            esImperfectoForms.set(inf + '|' + person, form.toLowerCase());
          }
        }
      }
    }

    if (lang === 'fr') {
      for (const entry of Object.values(raw.verbbank)) {
        const inf = (entry.word || '').replace(/^å\s+/i, '').trim();
        if (!inf) continue;
        const conj = entry.conjugations;
        if (!conj) continue;

        // Presens → frPresensToVerb
        const pres = conj.presens;
        const presForms = {};
        if (pres && pres.former) {
          for (const [person, form] of Object.entries(pres.former)) {
            if (!form) continue;
            const lc = form.toLowerCase();
            frPresensToVerb.set(lc, { inf, person });
            presForms[person] = lc;
          }
        }

        // Subjonctif → frSubjonctifForms + frSubjonctifDiffers
        const subj = conj.subjonctif;
        if (subj && subj.former) {
          for (const [person, form] of Object.entries(subj.former)) {
            if (!form) continue;
            const lc = form.toLowerCase();
            frSubjonctifForms.set(inf + '|' + person, lc);
            // Homophony guard: only flag when subjonctif differs from presens
            const presForm = presForms[person] || '';
            frSubjonctifDiffers.set(inf + '|' + person, lc !== presForm);
          }
        }

        // Phase 32-01: imparfait → frImparfaitToVerb
        const imp = conj.imparfait;
        if (imp && imp.former) {
          for (const [person, form] of Object.entries(imp.former)) {
            if (!form) continue;
            const lc = form.toLowerCase();
            if (!frImparfaitToVerb.has(lc)) frImparfaitToVerb.set(lc, { inf, person });
            const stripped = stripAccents(lc);
            if (stripped !== lc && !frImparfaitToVerb.has(stripped)) {
              frImparfaitToVerb.set(stripped, { inf, person });
            }
          }
        }

        // Phase 32-01: passé composé → frPasseComposeParticiples + frAuxPresensForms
        // Phase 42: defensive against future array-valued participles.
        const pc = conj.passe_compose;
        if (pc && pc.participle) {
          const partValues = Array.isArray(pc.participle) ? pc.participle : [pc.participle];
          const aux = String(pc.auxiliary || 'avoir').toLowerCase();
          for (const raw of partValues) {
            if (typeof raw !== 'string' || !raw) continue;
            const part = raw.toLowerCase();
            if (!frPasseComposeParticiples.has(part)) {
              frPasseComposeParticiples.set(part, { inf, aux });
            }
          }
        }
        // Pull avoir/être present-tense forms out of their passé-composé
        // `former` map (which is "j'ai mangé" / "as mangé" / "a mangé" /
        // "avons mangé" — the leading token is the auxiliary in present
        // tense). Only do this for the avoir / être verbs themselves.
        if (inf === 'avoir' || inf === 'être' || inf === 'etre') {
          if (pres && pres.former) {
            for (const form of Object.values(pres.former)) {
              if (!form) continue;
              const lc = String(form).toLowerCase();
              frAuxPresensForms.add(lc);
              const stripped = stripAccents(lc);
              if (stripped !== lc) frAuxPresensForms.add(stripped);
            }
          }
        }
      }
      // Defensive fallback: avoir/être present-tense surface forms a student
      // is likely to type. If the verbbank above already populated the Set,
      // these are no-ops; if avoir/être entries are missing or shaped
      // differently, the rule still fires.
      const FR_AUX_DEFAULTS = ['ai', 'as', 'a', 'avons', 'avez', 'ont',
                                'suis', 'es', 'est', 'sommes', 'êtes', 'etes', 'sont'];
      for (const f of FR_AUX_DEFAULTS) frAuxPresensForms.add(f);
    }

    return { esPresensToVerb, esSubjuntivoForms, esImperfectoForms, esPreteritumToVerb,
             frPresensToVerb, frSubjonctifForms, frSubjonctifDiffers,
             frImparfaitToVerb, frPasseComposeParticiples, frAuxPresensForms };
  }

  // ── Phase 13: Build NN infinitive classification map from raw verbbank ──
  // Maps bare infinitive forms to their register class and counterpart.
  // Only dual-form verbs (both a-infinitiv and e-infinitiv) are included;
  // single-form verbs are register-neutral and excluded.
  // Used by DOC-04 (doc-drift-nn-infinitive.js) for data-driven classification.
  function buildNNInfinitiveClasses(raw, lang) {
    const nnInfinitiveClasses = new Map();
    if (lang !== 'nn' || !raw || !raw.verbbank) return nnInfinitiveClasses;

    for (const entry of Object.values(raw.verbbank)) {
      const conj = entry.conjugations;
      if (!conj) continue;
      for (const tenseVal of Object.values(conj)) {
        // Collect infinitive surface forms from BOTH legacy and post-Phase-54
        // shapes. Legacy: `former.infinitiv` may be a string or array.
        // Post-Phase-54: `paradigms[].infinitiv` is one entry per paradigm
        // sideform (e.g. spele_verb ships [å spele, å spela] as two entries).
        // Without the paradigms[] path, every verb migrated to the new shape
        // (250+ NN verbs as of v3.0.15) becomes invisible to doc-drift,
        // silencing the rule on every modern verb sample.
        const infForms = [];
        if (tenseVal.former) {
          const legacy = tenseVal.former.infinitiv;
          if (Array.isArray(legacy)) infForms.push(...legacy);
          else if (typeof legacy === 'string') infForms.push(legacy);
        }
        if (Array.isArray(tenseVal.paradigms)) {
          for (const p of tenseVal.paradigms) {
            if (p && typeof p.infinitiv === 'string') infForms.push(p.infinitiv);
          }
        }
        if (infForms.length < 2) continue;

        // Strip "a " or "å " prefix from each form
        const forms = infForms.map(f => f.replace(/^[aå]\s+/, ''));
        const aForm = forms.find(f => f.endsWith('a'));
        const eForm = forms.find(f => f.endsWith('e'));

        if (aForm && eForm) {
          nnInfinitiveClasses.set(aForm, { register: 'a-infinitiv', counterpart: eForm });
          nnInfinitiveClasses.set(eForm, { register: 'e-infinitiv', counterpart: aForm });
        }
        break; // Only process the first tense entry with infinitiv per verb
      }
    }
    return nnInfinitiveClasses;
  }

  // ── Phase 46 round 4 (NN spell-check quality loop): NN canonical
  //    infinitive surface forms, drawn directly from `raw.verbbank`
  //    entry.word fields. Trusted (NN-only) lookup the
  //    nb-nn-infinitive-after-aa rule consults to gate its NN side
  //    against sister-dialect pollution in the merged verbInfinitive
  //    map. Single-word infinitives only (multi-word phrasal verbs
  //    are out of scope — single-token replacement isn't safe). ──
  function buildNNCanonicalInfinitives(raw, lang) {
    const set = new Set();
    if (lang !== 'nn' || !raw || !raw.verbbank) return set;
    const addForm = (f) => {
      if (typeof f !== 'string') return;
      const w = f.replace(/^[aå]\s+/i, '').trim().toLowerCase();
      if (!w || w.indexOf(' ') !== -1) return;
      set.add(w);
    };
    for (const entry of Object.values(raw.verbbank)) {
      if (!entry) continue;
      // Primary canonical from entry.word.
      addForm(entry.word);
      // Conjugation-table infinitiv array — picks up both a-infinitiv
      // and e-infinitiv when both are listed (NN dual-form verbs per
      // Språkrådet 2012 reform: spise/spisa, kaste/kasta, etc.).
      const conj = entry.conjugations;
      if (conj && typeof conj === 'object') {
        for (const tense of Object.values(conj)) {
          if (!tense || typeof tense !== 'object') continue;
          const former = tense.former;
          if (!former) continue;
          const inf = former.infinitiv;
          if (Array.isArray(inf)) for (const f of inf) addForm(f);
          else if (typeof inf === 'string') addForm(inf);
        }
      }
      // Paradigm sideforms (Phase 54 likestilt-consistency framework).
      const paradigms = entry.paradigms;
      if (Array.isArray(paradigms)) {
        for (const p of paradigms) {
          if (!p) continue;
          if (typeof p.word === 'string') addForm(p.word);
          if (p.forms && typeof p.forms === 'object' && typeof p.forms.infinitiv === 'string') {
            addForm(p.forms.infinitiv);
          }
        }
      }
      // Phase 46 round 4 fix: when an entry's imperativ form is NOT a
      // prefix of the canonical infinitive, treat it as a NN
      // canonical-alternate infinitive misfiled as imperativ. Pattern in
      // the bundled data: `se_verb` (auto-NB-sourced) has
      // `imperativ: "sjå"` while infinitiv is `"å se"` — `sjå` is the
      // historic NN canonical form, and Språkrådet 2012 accepts both.
      // Without this, the after-aa rule would suggest "sjå → se" inside
      // NN texts. Standard imperatives like `vel` (of `velje`) ARE
      // prefixes of the infinitive and stay excluded, so "å vel → å
      // velje" still fires correctly.
      if (entry.conjugations && typeof entry.conjugations === 'object') {
        for (const tense of Object.values(entry.conjugations)) {
          if (!tense || !tense.former) continue;
          const imp = tense.former.imperativ;
          const inf = tense.former.infinitiv;
          if (typeof imp !== 'string' || !imp) continue;
          // Resolve infinitive surface form (may be array, may carry "å ").
          let infForm = '';
          if (Array.isArray(inf)) infForm = inf[0] || '';
          else if (typeof inf === 'string') infForm = inf;
          const infBare = infForm.replace(/^[aå]\s+/i, '').trim().toLowerCase();
          const impBare = imp.trim().toLowerCase();
          if (!infBare || !impBare) continue;
          // Skip standard bare-stem imperatives that are prefixes of
          // their infinitive (vel ⊂ velje, aksepter ⊂ akseptere).
          if (infBare.startsWith(impBare)) continue;
          addForm(impBare);
        }
      }
    }
    return set;
  }

  // ── Phase 14: Build irregularForms Map from raw EN data ──
  // Maps wrong regular-pattern derivation forms (childs, eated, goed) to
  // { correct, type, base } objects so the EN morphology rule can flag
  // overregularization errors. Built from raw data banks (not wordList)
  // to avoid feature-gating starvation per Pitfall 3.
  function buildIrregularForms(raw) {
    const irregularForms = new Map();
    if (!raw) return irregularForms;

    // ── Irregular verbs: wrong regular past tense ──
    if (raw.verbbank) {
      for (const entry of Object.values(raw.verbbank)) {
        if (entry.verbClass !== 'irregular') continue;
        const word = (entry.word || '').trim();
        if (!word || word.includes(' ') || word.includes(';')) continue;

        const pastFormRaw = entry.conjugations?.past?.former?.simple;
        if (!pastFormRaw) continue;

        // Phase 42: papertek-vocabulary now ships ARRAY values for valgfri
        // pasts (burn → ["burnt","burned"], etc.). Treat all forms as
        // legitimate "correct" pasts; the wrong-regular-past forms we generate
        // must match none of them.
        const pastForms = Array.isArray(pastFormRaw) ? pastFormRaw.filter(p => typeof p === 'string') : [pastFormRaw];
        if (pastForms.length === 0) continue;
        const correctDisplay = pastForms[0];  // first form for display
        const correctLowerSet = new Set(pastForms.map(p => p.toLowerCase()));

        const lower = word.toLowerCase();

        // Generate wrong regular past forms
        const wrongForms = new Set();
        if (lower.endsWith('e')) {
          // come -> comed (not comeed)
          wrongForms.add(lower + 'd');
        } else {
          wrongForms.add(lower + 'ed');
          // Short verbs ending in consonant: consonant doubling (run -> runned)
          const lastChar = lower[lower.length - 1];
          const vowels = new Set(['a', 'e', 'i', 'o', 'u']);
          if (!vowels.has(lastChar) && lower.length <= 5) {
            wrongForms.add(lower + lastChar + 'ed');
          }
        }

        for (const wrongForm of wrongForms) {
          // Skip if the wrong form IS one of the legitimate correct forms
          if (correctLowerSet.has(wrongForm)) continue;
          // Don't overwrite existing entries (first match wins)
          if (!irregularForms.has(wrongForm)) {
            irregularForms.set(wrongForm, { correct: correctDisplay, type: 'past', base: word });
          }
        }
      }
    }

    // ── Irregular nouns: wrong regular plural ──
    if (raw.nounbank) {
      for (const entry of Object.values(raw.nounbank)) {
        const word = (entry.word || '').trim();
        if (!word || word.includes(' ') || word.includes(';')) continue;

        const plural = entry.plural || entry.forms?.plural;
        if (!plural || typeof plural !== 'string') continue;

        const lower = word.toLowerCase();
        const pluralLower = plural.toLowerCase();

        // Check if plural is regular — if so, skip
        // Regular patterns: word+s, word+es, y->ies
        const regularPlurals = new Set();
        regularPlurals.add(lower + 's');
        regularPlurals.add(lower + 'es');
        if (lower.endsWith('y') && lower.length > 1) {
          const stem = lower.slice(0, -1);
          regularPlurals.add(stem + 'ies');
        }
        if (regularPlurals.has(pluralLower)) continue;

        // Generate wrong regular plurals
        const wrongForms = new Set();
        wrongForms.add(lower + 's');
        wrongForms.add(lower + 'es');

        for (const wrongForm of wrongForms) {
          if (wrongForm === pluralLower) continue;
          if (!irregularForms.has(wrongForm)) {
            irregularForms.set(wrongForm, { correct: plural, type: 'plural', base: word });
          }
        }
      }
    }

    return irregularForms;
  }

  // ── Phase 16: Compound decomposition ──
  //
  // Splits compound nouns into constituent parts using both-sides validation
  // (left AND right must be known nouns). Supports NB/NN/DE linking elements
  // and recursive decomposition up to 4 components (depth 3).
  //
  // Returns: { parts: [{word, genus, linker}], gender, confidence } or null.

  /**
   * Pick the BEST analysis, not the first one found.
   *
   * The split loop below used to run shortest-first and return on its first
   * hit, so a short word that happens to be a lemma won over the right answer:
   * «vinterbok» came out as `vin + ter + bok` because `vin` is a wine and the
   * index holds inflected forms too, and «alderdomsplager» as
   * `alder + dom + s + plager`. The dictionary prints that decomposition to the
   * student as the structure of the word, so a wrong split is a wrong claim.
   *
   * Fewest parts wins. TIES KEEP THE SHORTEST-FIRST WINNER, and that is the
   * whole safety property: pure longest-first also fixes «vinterbok», but it
   * turns `bok + skatt` into `boks + katt`. Preferring fewer parts and leaving
   * ties alone is monotone — measured over 60 000 words, 601 analyses improved,
   * 0 decompositions lost, 0 gained, 0 ending with more parts than before.
   *
   * Sub-decompositions recurse through here too, so nested compounds get the
   * same treatment.
   */
  function decomposeCompound(word, nounGenus, lang, depth) {
    if (depth === undefined) depth = 0;
    if (!word || word.length < 6) return null;
    let best = null;
    const maxSplit = word.length - 3;
    for (let p = 3; p <= maxSplit; p++) {
      const cand = decomposeCompoundAt(word, nounGenus, lang, depth, p);
      if (isBetterDecomposition(cand, best)) best = cand;
    }
    return best;
  }

  /**
   * Ranking for two analyses of the SAME word. Fewest parts first (iteration 9's
   * rule), then fewest linkers, then whatever came first — which is the earliest
   * split position in decomposeCompound and the strategy order in
   * decomposeCompoundAt.
   *
   * The linker tie-break was added when likestilte variant spellings entered the
   * index: `bakk` is a word (a ship's foredeck) as well as the fuge-less prefix
   * of `bakke`, so «bakkeanlegg» suddenly had two two-part analyses —
   * `bakke + anlegg` and `bakk + (e) + anlegg`. Both are equally short, and the
   * older earliest-split tie-break handed the student the wrong one. A joint the
   * word doesn't need is the weaker claim, so fewer linkers wins. Ties among
   * zero-fuge analyses still keep shortest-first, which is what protects
   * `bok + skatt` from becoming `boks + katt`.
   */
  function countCompoundLinkers(c) {
    let n = 0;
    for (const p of c.parts) if (p.linker) n++;
    return n;
  }

  function isBetterDecomposition(cand, best) {
    if (!cand) return false;
    if (!best) return true;
    if (cand.parts.length !== best.parts.length) return cand.parts.length < best.parts.length;
    const cl = countCompoundLinkers(cand), bl = countCompoundLinkers(best);
    if (cl !== bl) return cl < bl;
    // A 'medium'-confidence analysis (the consonant-doubling fuge) never
    // displaces an equally short 'high' one.
    if (cand.confidence !== best.confidence) return best.confidence === 'medium' && cand.confidence === 'high';
    return false;
  }

  /** The original strategy stack, evaluated at ONE split position. */
  function decomposeCompoundAt(word, nounGenus, lang, depth, splitAt) {
    if (depth === undefined) depth = 0;
    // Max 4 components = max 3 splits (depth 0/1/2 = 3 recursive levels)
    if (depth > 2) return null;
    // Minimum compound length: 3 + 3
    if (!word || word.length < 6) return null;
    // Only nb/nn/de have closed compounds — never decompose en/es/fr.
    if (!COMPOUND_LANGS.has(lang)) return null;
    // Stored entry takes precedence (Tier 1)
    if (nounGenus.has(word)) return null;

    const linkers = LINKERS_BY_LANG[lang] || [];

    // Collect every strategy's analysis at this split position and keep the
    // best one instead of returning the first that matches. Strategy order used
    // to decide it, and that ordering outranked part count: «ammunisjonskisten»
    // came out as `ammunisjon + ski + sten` because the zero-fuge recursion is
    // tried before the -s- linker, and `sten` became a word the moment likestilte
    // spellings entered the index. Three parts where two will do is the same
    // wrong claim iteration 9 removed one level up.
    let best = null;
    const consider = (c) => { if (isBetterDecomposition(c, best)) best = c; };

    for (let splitPos = splitAt; splitPos <= splitAt; splitPos++) {
      const left = word.slice(0, splitPos);
      if (!nounGenus.has(left)) continue;

      const remainder = word.slice(splitPos);

      // Zero-fuge direct match
      if (nounGenus.has(remainder)) {
        consider({
          parts: [
            { word: left, genus: nounGenus.get(left), linker: '' },
            { word: remainder, genus: nounGenus.get(remainder), linker: '' },
          ],
          gender: nounGenus.get(remainder),
          confidence: 'high',
        });
      }

      // Zero-fuge recursive
      const subZero = decomposeCompound(remainder, nounGenus, lang, depth + 1);
      if (subZero) {
        consider({
          parts: [
            { word: left, genus: nounGenus.get(left), linker: '' },
            ...subZero.parts,
          ],
          gender: subZero.gender,
          confidence: 'high',
        });
      }

      // Linker-based splits
      for (const linker of linkers) {
        if (!remainder.startsWith(linker)) continue;
        const stripped = remainder.slice(linker.length);
        if (stripped.length < 3) continue;

        if (nounGenus.has(stripped)) {
          consider({
            parts: [
              { word: left, genus: nounGenus.get(left), linker: linker },
              { word: stripped, genus: nounGenus.get(stripped), linker: '' },
            ],
            gender: nounGenus.get(stripped),
            confidence: 'high',
          });
        }

        const subLinker = decomposeCompound(stripped, nounGenus, lang, depth + 1);
        if (subLinker) {
          consider({
            parts: [
              { word: left, genus: nounGenus.get(left), linker: linker },
              ...subLinker.parts,
            ],
            gender: subLinker.gender,
            confidence: 'high',
          });
        }
      }

      // Consonant-doubling fugen-e (NB/NN): some short stems ending in a
      // single consonant double the consonant before the -e- linker in
      // compounds. E.g., `lam` + compound = `lamme-` so `lam + kotlett =
      // lammekotlett`. The base noun stays `lam` in the dictionary; the
      // compound stem is lexically determined and not always derivable, so
      // we treat it as opportunistic: if `left` is a known short stem
      // ending in a single consonant AND `remainder` starts with that
      // consonant followed by `e`, peel both and re-test.
      //
      // Constraints to keep false-positive risk low:
      //   - left.length 2..5 (only short stems trigger doubling in NB)
      //   - left ends in a non-vowel
      //   - left[-2] is not the same char (no triple-cluster case; that's
      //     already handled by the elision branch below)
      //   - confidence = 'medium' (not 'high') so callers can choose to
      //     treat it as advisory rather than authoritative.
      if ((lang === 'nb' || lang === 'nn')
          && left.length >= 2 && left.length <= 5) {
        const lc = left[left.length - 1];
        const isConsonant = !'aeiouæøåyAEIOU'.includes(lc);
        const notTriple = left[left.length - 2] !== lc;
        if (isConsonant && notTriple
            && remainder.length >= 5
            && remainder[0] === lc && remainder[1] === 'e') {
          const stripped = remainder.slice(2);
          if (stripped.length >= 3) {
            if (nounGenus.has(stripped)) {
              consider({
                parts: [
                  { word: left, genus: nounGenus.get(left), linker: lc + 'e' },
                  { word: stripped, genus: nounGenus.get(stripped), linker: '' },
                ],
                gender: nounGenus.get(stripped),
                confidence: 'medium',
              });
            }
            const subDouble = decomposeCompound(stripped, nounGenus, lang, depth + 1);
            if (subDouble) {
              consider({
                parts: [
                  { word: left, genus: nounGenus.get(left), linker: lc + 'e' },
                  ...subDouble.parts,
                ],
                gender: subDouble.gender,
                confidence: 'medium',
              });
            }
          }
        }
      }

      // Triple-consonant elision: when left ends with a repeated char (e.g.
      // "natt" ends with tt), the compound form drops one occurrence of the
      // repeated letter. So "natt" + "time" is written "nattime" not "natttime".
      // We try restoring the dropped letter to see if the right side is a known noun.
      const lastChar = left[left.length - 1];
      if (left.length >= 2 && left[left.length - 2] === lastChar) {
        const restored = lastChar + remainder;

        if (nounGenus.has(restored)) {
          consider({
            parts: [
              { word: left, genus: nounGenus.get(left), linker: '' },
              { word: restored, genus: nounGenus.get(restored), linker: '' },
            ],
            gender: nounGenus.get(restored),
            confidence: 'high',
          });
        }

        const subElision = decomposeCompound(restored, nounGenus, lang, depth + 1);
        if (subElision) {
          consider({
            parts: [
              { word: left, genus: nounGenus.get(left), linker: '' },
              ...subElision.parts,
            ],
            gender: subElision.gender,
            confidence: 'high',
          });
        }
      }
    }

    return best;
  }

  // N+N fuge-aware fallback: decomposeCompound handles zero-fuge; this catches
  // fuge-e ("barnehage" = barn+e+hage) and fuge-s ("arbeidsplass" = arbeid+s+plass).
  // Returns the first split with a known-noun head (greedy, longest-head-first).
  // MIN part length (3, mirroring decomposeCompound) blocks single-char garbage
  // entries in nounGenus ('a','s','-') from producing bogus splits (sedans/asbjørn).
  function splitNounNounWithFuge(word, nounGenus) {
    const w = word.toLowerCase();
    const MIN = 3;
    for (let j = MIN; j <= w.length - MIN; j++) {
      const head = w.slice(j);
      if (!nounGenus.has(head)) continue;
      const modRaw = w.slice(0, j);
      if (modRaw.length >= MIN && nounGenus.has(modRaw)) {
        return {
          parts: [
            { word: modRaw, genus: nounGenus.get(modRaw), linker: '' },
            { word: head, genus: nounGenus.get(head), linker: '' },
          ],
          gender: nounGenus.get(head),
        };
      }
      for (const lk of ['e', 's']) {
        const mod = modRaw.slice(0, -1);
        if (modRaw.endsWith(lk) && mod.length >= MIN && nounGenus.has(mod)) {
          return {
            parts: [
              { word: mod, genus: nounGenus.get(mod), linker: lk },
              { word: head, genus: nounGenus.get(head), linker: '' },
            ],
            gender: nounGenus.get(head),
          };
        }
      }
    }
    return null;
  }

  // Slice 1 dictionary compound classifier. N+N only. Reuses decomposeCompound
  // for the base split, adds fuge fallback + tier. Returns {tier:2|3, parts, gender} or null.
  // The attestation source is injected as `isAttested(word) → bool` rather
  // than a validWords Set, so each host supplies membership its own way
  // (single-page hosts reuse the seam's already-loaded validWords; the
  // isolated extension popup queries a Bloom filter). The classifier stays
  // pure — tier 2 iff the whole word is attested, tier 3 otherwise.
  function classifyCompound(word, nounGenus, isAttested, lang) {
    const w = (word || '').toLowerCase();
    if (w.length < 4) return null;
    let decomp = decomposeCompound(w, nounGenus, lang);
    const allNouns = decomp && decomp.parts && decomp.parts.every((p) => nounGenus.has(p.word.toLowerCase()));
    if (!decomp || !allNouns) {
      decomp = splitNounNounWithFuge(w, nounGenus);
    }
    if (!decomp) return null;
    const tier = (typeof isAttested === 'function' && isAttested(w)) ? 2 : 3;
    return { tier, parts: decomp.parts, gender: decomp.gender };
  }

  // ── Phase 24: Compound word prediction ──
  //
  // Given a partial input string, returns compound word suggestions by
  // identifying a valid first component (+ optional fuge), then scanning
  // nounGenus for words that complete the compound.
  //
  // Returns: Array<{ word: string, decomposition: decomposeResult }>

  function predictCompound(partial, nounGenus, lang, decompFn) {
    if (!partial || partial.length < 4) return [];
    // Only nb/nn/de have closed compounds — no compound predictions for en/es/fr.
    if (!COMPOUND_LANGS.has(lang)) return [];
    if (!decompFn) decompFn = function (w) { return decomposeCompound(w, nounGenus, lang); };

    const input = partial.toLowerCase();
    const linkers = LINKERS_BY_LANG[lang] || [];
    const seen = new Set();
    const results = [];

    // Collect nounGenus keys once for prefix scanning
    const allNouns = Array.from(nounGenus.keys());

    for (let splitPos = 3; splitPos < input.length; splitPos++) {
      if (results.length >= 10) break;

      const left = input.slice(0, splitPos);
      if (!nounGenus.has(left)) continue;

      const remainder = input.slice(splitPos);
      if (remainder.length < 1) continue;

      // Zero-fuge: scan nouns starting with remainder
      for (const noun of allNouns) {
        if (results.length >= 10) break;
        if (!noun.startsWith(remainder)) continue;
        const candidate = left + noun;
        if (seen.has(candidate)) continue;
        const decomp = decompFn(candidate);
        if (decomp) {
          seen.add(candidate);
          results.push({ word: candidate, decomposition: decomp });
        }
      }

      // Linker-based: try each linker
      for (const linker of linkers) {
        if (results.length >= 10) break;
        if (!remainder.startsWith(linker)) continue;
        const stripped = remainder.slice(linker.length);
        if (stripped.length < 1) continue;

        for (const noun of allNouns) {
          if (results.length >= 10) break;
          if (!noun.startsWith(stripped)) continue;
          const candidate = left + linker + noun;
          if (seen.has(candidate)) continue;
          const decomp = decompFn(candidate);
          if (decomp) {
            seen.add(candidate);
            results.push({ word: candidate, decomposition: decomp });
          }
        }
      }
    }

    return results;
  }

  // Phase 45: parse the bundled `non-compound-pairs.json` into a Set of
  // "left|right" lowercase keys. Returns an empty Set when the JSON is
  // missing or malformed — callers can always do `vocab.nonCompoundPairs.has(...)`.
  function buildNonCompoundPairs(json) {
    const out = new Set();
    if (!json || !json.pairs || typeof json.pairs !== 'object') return out;
    for (const key of Object.keys(json.pairs)) {
      if (typeof key !== 'string' || !key.includes('|')) continue;
      out.add(key.toLowerCase());
    }
    return out;
  }

  // ── Public API ──

  // DE regular-verb present-tense paradigm index for de-subject-verb's
  // regular-verb agreement check. byLemma: infinitive → {ich,du,er,wir,ihr}
  // present forms (lowercased); byForm: surface form → Set<infinitive> (any
  // person). Excludes modals + sein/haben/werden — those are handled by the
  // rule's closed PARADIGMS, and haben/sein carry Konjunktiv-I surface
  // collisions. DE only; empty maps elsewhere. Multiword (separable) present
  // forms are skipped so single-token matching can't partial-match them.
  function buildDeRegularPresent(raw, lang) {
    const byLemma = new Map();
    const byForm = new Map();
    if (lang !== 'de' || !raw || !raw.verbbank) return { byLemma, byForm };
    const EXCLUDE = new Set(['sein', 'haben', 'werden', 'können', 'müssen', 'sollen', 'wollen', 'dürfen', 'mögen', 'möchten', 'wissen']);
    const KEYMAP = { 'ich': 'ich', 'du': 'du', 'er/sie/es': 'er', 'wir': 'wir', 'ihr': 'ihr' };
    for (const entry of Object.values(raw.verbbank)) {
      const inf = entry && typeof entry.word === 'string' ? entry.word.toLowerCase() : null;
      if (!inf || EXCLUDE.has(inf)) continue;
      const former = entry.conjugations && entry.conjugations.presens && entry.conjugations.presens.former;
      if (!former || typeof former !== 'object' || Array.isArray(former)) continue;
      const para = {};
      for (const [srcKey, cls] of Object.entries(KEYMAP)) {
        const f = former[srcKey];
        if (typeof f === 'string' && f && !f.includes(' ')) para[cls] = f.toLowerCase();
      }
      if (!para.ich && !para.du && !para.er) continue;
      byLemma.set(inf, para);
      for (const cls of Object.keys(para)) {
        const f = para[cls];
        let s = byForm.get(f);
        if (!s) { s = new Set(); byForm.set(f, s); }
        s.add(inf);
      }
    }
    return { byLemma, byForm };
  }

  // DE strong-verb present-tense index for de-strong-verb. Maps the REGULAR
  // (un-stem-changed) 2nd/3rd-person-singular form a student would wrongly
  // produce → Array<{fix, pron}> where fix is the real stem-changed form and
  // pron is the person class ('du' | 'er'). Only verbs whose curated present
  // form differs from the mechanically-regularized form are included (i.e.
  // genuine strong verbs: fahren→fährst, geben→gibt, lesen→liest, …). Sibilant-
  // stem verbs (lesen) collapse regularDu === regularEr, so both 'du' and 'er'
  // entries can land on one key — hence the array value. Excludes the same
  // modal/auxiliary set as buildDeRegularPresent. DE only; empty Map elsewhere.
  function buildDeStrongPresent(raw, lang) {
    const map = new Map();
    if (lang !== 'de' || !raw || !raw.verbbank) return map;
    const EXCLUDE = new Set(['sein', 'haben', 'werden', 'können', 'müssen', 'sollen', 'wollen', 'dürfen', 'mögen', 'möchten', 'wissen']);
    for (const entry of Object.values(raw.verbbank)) {
      const inf = entry && typeof entry.word === 'string' ? entry.word.toLowerCase() : null;
      if (!inf || EXCLUDE.has(inf)) continue;
      const former = entry.conjugations && entry.conjugations.presens && entry.conjugations.presens.former;
      if (!former || typeof former !== 'object' || Array.isArray(former)) continue;
      const stem = inf.endsWith('en') ? inf.slice(0, -2) : (inf.endsWith('n') ? inf.slice(0, -1) : inf);
      const regularDu = /[sßxz]$/.test(stem) ? stem + 't' : stem + 'st';
      const regularEr = /[td]$/.test(stem) ? stem + 'et' : stem + 't';
      const rawDu = typeof former.du === 'string' ? former.du.toLowerCase() : null;
      const rawEr = typeof former['er/sie/es'] === 'string' ? former['er/sie/es'].toLowerCase() : null;
      const duCorrect = (rawDu && !rawDu.includes(' ')) ? rawDu : null;
      const erCorrect = (rawEr && !rawEr.includes(' ')) ? rawEr : null;
      if (duCorrect && duCorrect !== regularDu) {
        if (!map.has(regularDu)) map.set(regularDu, []);
        map.get(regularDu).push({ fix: duCorrect, pron: 'du' });
      }
      if (erCorrect && erCorrect !== regularEr) {
        if (!map.has(regularEr)) map.set(regularEr, []);
        map.get(regularEr).push({ fix: erCorrect, pron: 'er' });
      }
    }
    return map;
  }

  // DE comparative set for de-komparativ: the lowercased comparative
  // (komparativ) form of every adjective, e.g. größer, besser, schneller.
  // The de-komparativ rule flags "wie" immediately after one of these
  // (predicative comparative + wie → should be "als"). Single-word forms
  // only (skip any that contain a space). DE only; empty Set elsewhere.
  function buildDeComparatives(raw, lang) {
    const set = new Set();
    if (lang !== 'de' || !raw || !raw.adjectivebank) return set;
    for (const entry of Object.values(raw.adjectivebank)) {
      const komp = entry && entry.comparison && entry.comparison.komparativ;
      if (typeof komp !== 'string') continue;
      const v = komp.toLowerCase();
      if (!v || v.includes(' ')) continue;
      set.add(v);
    }
    return set;
  }

  // DE dative-plural index for de-dative-plural: maps a noun's nominative-
  // plural surface form → its dative-plural form, but ONLY when they differ
  // (the dative adds -n: Jahre → Jahren, Kinder → Kindern). Plurals already
  // ending in -n/-s map to themselves and are omitted, so a hit always means
  // a real, fixable -n omission. Uses the article-free indefinite plural
  // (entry.plural carries "die …"). DE only; empty Map elsewhere.
  function buildDeDativePlural(raw, lang) {
    const m = new Map();
    if (lang !== 'de' || !raw || !raw.nounbank) return m;
    const pickPlural = (pl) => {
      if (!pl || typeof pl !== 'object') return null;
      const s = pl.indefinite || pl.definite;
      if (typeof s !== 'string' || !s.trim()) return null;
      return s.trim().split(/\s+/).pop() || null;
    };
    for (const e of Object.values(raw.nounbank)) {
      const c = e && e.cases;
      if (!c || !c.nominativ || !c.dativ) continue;
      const nomPl = pickPlural(c.nominativ.forms && c.nominativ.forms.plural);
      const datPl = pickPlural(c.dativ.forms && c.dativ.forms.plural);
      if (!nomPl || !datPl || nomPl.includes(' ') || datPl.includes(' ')) continue;
      if (nomPl.toLowerCase() === datPl.toLowerCase()) continue;
      const key = nomPl.toLowerCase();
      if (!m.has(key)) m.set(key, datPl);
    }
    return m;
  }

  function buildIndexes({ raw, bigrams, freq, sisterRaw, lang, isFeatureEnabled, nonCompoundPairs: nonCompoundPairsJson, validwordsExtra } = {}) {
    // Default predicate: emit all forms (Node / test use — "superset" policy
    // per CONTEXT: consumers filter further at the seam level).
    const iff = typeof isFeatureEnabled === 'function' ? isFeatureEnabled : iffTrue;

    // wordList is feature-gated and drives word-PREDICTION — the student sees
    // only the forms whose grammar features are enabled in the popup.
    const wordList = buildWordList(raw, lang, iff);

    // Spell-check lookup indexes (nounGenus / verbInfinitive / validWords /
    // typoFix / compoundNouns) MUST NOT be feature-gated. Example regression:
    // with the default "basic" NB preset, grammar_nb_preteritum is OFF, so
    // preteritum forms like `gikk` never enter the feature-gated wordList and
    // verbInfinitive.get('gikk') returns undefined — the modal_form rule
    // then silently fails on `Kan gikk` because the spell-check rule does
    // not know `gikk` is a verb inflection of `gå`. Fixture harness missed
    // this because it calls buildIndexes with isFeatureEnabled: () => true.
    // Fix: always build lookup indexes from the unfiltered superset. Reuse
    // the already-built wordList when iff is the identity predicate — avoids
    // a second O(N) pass in the Node / test path. (Phase 05.1-05 post-hoc.)
    const unfilteredWordList = (iff === iffTrue)
      ? wordList
      : buildWordList(raw, lang, iffTrue);
    const {
      nounGenus, nounLemmaGenus, verbInfinitive, validWords, isAdjective, adjLemma,
      knownPresens, knownPreteritum, knownParticiples, verbForms, nounForms, typoFix, compoundNouns,
      variantSpellings,
      mwTokenCandidates, acceptedCandidates
    } = buildLookupIndexes(unfilteredWordList, lang);

    // adjNeuter: NB/NN attributive neuter agreement. Maps the maskulin/base
    // adjective form → its neuter (intetkjønn) form, but ONLY when they DIFFER.
    // This auto-excludes invariant adjectives and the -ig/-sk/-e classes
    // (absurd→absurd, viktig→viktig, norsk→norsk, moderne→moderne) — there is
    // no entry, so nb-adjective-agreement never fires on them. Consumed to flag
    // "et rød eple" → "et rødt eple" and suggest the exact neuter form (handles
    // blå→blått, ny→nytt, liten→lite without a naive +t heuristic).
    const adjNeuter = new Map();
    if ((lang === 'nb' || lang === 'nn') && raw && raw.adjectivebank) {
      for (const key of Object.keys(raw.adjectivebank)) {
        if (key === '_metadata') continue;
        const entry = raw.adjectivebank[key];
        const pos = entry && entry.declension && entry.declension.positiv;
        if (!pos) continue;
        const maskRaw = pos.maskulin || entry.word;
        let neut = pos.noytrum;
        if (Array.isArray(neut)) neut = neut[0];
        if (!maskRaw || !neut || typeof maskRaw !== 'string' || typeof neut !== 'string') continue;
        const mask = maskRaw.toLowerCase();
        if (mask === neut.toLowerCase()) continue; // invariant / -ig / -sk → skip
        if (!adjNeuter.has(mask)) adjNeuter.set(mask, neut);
        const base = (entry.word || '').toLowerCase();
        if (base && base !== mask && !adjNeuter.has(base)) adjNeuter.set(base, neut);
      }
    }

    // nounPlural: NB/NN singular-lemma → indefinite-plural form, ONLY where the
    // plural DIFFERS from the singular. Invariant-plural nouns (hus/barn/land →
    // same form) get no entry, so "mange hus" is never flagged; plurale-tantum
    // (penger) have no singular lemma key. Consumed by nb-noun-plural-quantifier
    // to flag "mange bok" → "mange bøker".
    const nounPlural = new Map();
    if ((lang === 'nb' || lang === 'nn') && raw && raw.nounbank) {
      for (const key of Object.keys(raw.nounbank)) {
        if (key === '_metadata') continue;
        const entry = raw.nounbank[key];
        const f = entry && entry.forms;
        if (!f) continue;
        const sg = (f.ubestemt && f.ubestemt.entall) || entry.word;
        if (!sg || typeof sg !== 'string') continue;
        let pl = f.ubestemt && f.ubestemt.flertall;
        if (!pl && Array.isArray(f.paradigms)) {
          for (const p of f.paradigms) {
            if (p && p.ubestemt && p.ubestemt.flertall) { pl = p.ubestemt.flertall; break; }
          }
        }
        if (Array.isArray(pl)) pl = pl[0];
        if (!pl || typeof pl !== 'string') continue;
        const sgl = sg.toLowerCase();
        if (sgl === pl.toLowerCase()) continue; // invariant plural → skip
        if (!nounPlural.has(sgl)) nounPlural.set(sgl, pl);
      }
    }

    // Phase 48 Wave A.0: union an externally-supplied flat surface-form
    // wordlist (e.g. Norsk Ordbank for NB) into validWords. Spell-check
    // accept-path only — the curated banks above still drive POS/inflection
    // lookup (nounGenus, verbInfinitive, …). validwordsExtra is shaped
    // { words: ["lowercase", ...] }. Ordbank wins over curated typoFix:
    // if a word is a valid Bokmål spelling per Språkrådet, it must NOT be
    // surfaced as a typo, even if a curated typo entry lists it (those
    // entries are stale data bugs — e.g. `sinne` was listed as a typo of
    // `skinne` though `sinne` = "anger" is a valid noun; `ett` was listed
    // as a typo of `et` though `ett` is the numeral). We add to validWords
    // unconditionally AND delete any conflicting typoFix entry so the typo
    // rule sees a clean accept-path.
    // Snapshot the curated (lexicon-derived) accept-set BEFORE merging the
    // big Ordbank accept-list. The Ordbank list is intentionally permissive
    // (wide Nynorsk sideforms, loanwords, names, surface homographs), which is
    // right for the broad typo/fuzzy accept-path but would over-suppress the
    // targeted NB→NN leakage + codeswitch rules (e.g. silence "bilene→bilane"
    // because "bilene" exists somewhere in Ordbank). Those rules consult
    // curatedValidWords instead, so they keep enforcing the curated/preferred
    // Nynorsk surface set. Every other rule keeps using the merged validWords.
    const curatedValidWords = new Set(validWords);
    if (validwordsExtra && Array.isArray(validwordsExtra.words)) {
      const hasTypoFix = typoFix && typeof typoFix.has === 'function';
      for (const w of validwordsExtra.words) {
        if (typeof w !== 'string' || !w) continue;
        validWords.add(w);
        if (hasTypoFix && typoFix.has(w)) typoFix.delete(w);
      }
    }

    // Merge single tokens of multi-word forms ("kämme mich" → "kämme",
    // "biege ab" → "biege") into the broad accept-path, AFTER the curated
    // snapshot above for the same reason as the Ordbank merge: token-derived
    // validity must not silence the curated NB→NN leakage/codeswitch rules
    // (e.g. "løpet" occurs inside the NN phrase "i løpet av" but is exactly
    // the NB-ism nn-verb-leakage exists to catch after "har"). Words that
    // are ONLY valid as tokens-of-phrases are tracked in multiwordTokens so
    // nb-typo-fuzzy can exclude them from its SUGGESTION pool — without
    // that exclusion the richer pool invents wrong-direction fixes for
    // valid-but-uncovered words ("Quoique" → "Quelque", "issues" → "issue").
    const multiwordTokens = new Set();
    {
      const hasTypoFix = typoFix && typeof typoFix.has === 'function';
      for (const part of mwTokenCandidates) {
        if (validWords.has(part)) continue; // already a standalone form
        validWords.add(part);
        multiwordTokens.add(part);
        if (hasTypoFix && typoFix.has(part)) typoFix.delete(part);
      }
      // v3.0.122: accepted forms — same merge semantics. Words that are
      // ALSO standalone forms stay suggestable; accepted-only words are
      // valid but never offered as fuzzy fixes.
      for (const part of acceptedCandidates) {
        if (validWords.has(part)) continue;
        validWords.add(part);
        multiwordTokens.add(part);
        if (hasTypoFix && typoFix.has(part)) typoFix.delete(part);
      }
    }
     const normBigrams = bigrams ? normalizeBigrams(bigrams) : null;    // Hydrate Zipf frequency map from the sidecar shipped by Phase 2 DATA-01.
    // Freq is null for languages without a freq-{lang}.json sidecar (de/es/fr/en) —
    // consumers get an empty Map and VOCAB.getFrequency returns null for every word,
    // matching today's behaviour for those languages.
    const freqMap = new Map();
    if (freq && typeof freq === 'object') {
      for (const [k, v] of Object.entries(freq)) {
        if (typeof v === 'number') freqMap.set(k.toLowerCase(), v);
      }
    }

    // Phase 4 / SC-03: cross-dialect tolerance. For NB sessions, also derive
    // the NN validWords Set (lowercased, type!=='typo' filtered per Pitfall 1
    // in 04-RESEARCH.md — we must NOT inherit the sister dialect's typo
    // entries, or a word that's WRONG in both dialects would be silently
    // accepted because the other side has it in its typo bank). For de/es/fr/en,
    // sisterRaw is null and the Set stays empty.
    const sisterValidWords = new Set();
    // sisterVerbForms: union of every form-emission from sister-side verb
    // entries (lemma + all conjugated forms). Powers positive-evidence
    // verb gating in nn-verb-leakage. Built only for NN sessions (NB
    // doesn't need the reverse); null otherwise. Populated in the same
    // iteration that builds sisterValidWords to avoid a second pass.
    let sisterVerbForms = null;
    if (lang === 'nn') sisterVerbForms = new Set();
    if (sisterRaw && (lang === 'nb' || lang === 'nn')) {
      const sisterLang = lang === 'nb' ? 'nn' : 'nb';
      const sisterList = buildWordList(sisterRaw, sisterLang, () => true);
      for (const entry of sisterList) {
        if (entry.type === 'typo') continue;
        if (entry.word) {
          const w = entry.word.toLowerCase();
          sisterValidWords.add(w);
          // Verb-form filter: 'conjugation' entries all originate from
          // verbbank; the 'base' lemma is tagged with bank='verbbank'.
          // Together these cover every verb-side surface form.
          if (sisterVerbForms) {
            if (entry.type === 'conjugation' || (entry.type === 'base' && entry.bank === 'verbbank')) {
              sisterVerbForms.add(w);
            }
          }
        }
      }
    }

    // NB→NN cross-reference maps for auto-fix in nn-verb-leakage / nn-plural-leakage.
    // Keyed by lowercase NB form → { nnForm, field, nbInfinitive/nbBase, nnInfinitive/nnBase }.
    const nbToNnVerbs = new Map();
    const nbToNnNouns = new Map();
    if (lang === 'nn' && sisterRaw && sisterRaw.crossrefbank) {
      const verbXref = sisterRaw.crossrefbank.nb_nn_verb_crossref;
      if (verbXref && verbXref.data) {
        for (const [nbForm, entry] of Object.entries(verbXref.data)) {
          if (entry.nnForm) nbToNnVerbs.set(nbForm.toLowerCase(), entry);
        }
      }
      const nounXref = sisterRaw.crossrefbank.nb_nn_noun_crossref;
      if (nounXref && nounXref.data) {
        for (const [nbForm, entry] of Object.entries(nounXref.data)) {
          if (entry.nnForm) nbToNnNouns.set(nbForm.toLowerCase(), entry);
        }
      }
    }

    // ── Governance bank extraction (Phase 6) ──
    // These banks feed spell-check rules only, NOT word-prediction.
    const registerWords = new Map();  // word → { formal, severity }
    if (raw && raw.registerbank) {
      for (const [id, entry] of Object.entries(raw.registerbank)) {
        if (entry.word) registerWords.set(entry.word.toLowerCase(), entry);
      }
    }

    const collocations = [];  // [{ trigger, triggerWords, fix, severity }]
    // NN ships no collocationbank yet — fall back to NB (sisterRaw) which has
    // the same adjective+preposition collocations valid in both standards.
    const collocationSource = (raw && raw.collocationbank)
      ? raw
      : (lang === 'nn' && sisterRaw && sisterRaw.collocationbank ? sisterRaw : null);
    if (collocationSource && collocationSource.collocationbank) {
      for (const [id, entry] of Object.entries(collocationSource.collocationbank)) {
        if (entry.trigger && entry.fix) {
          collocations.push({
            ...entry,
            triggerWords: entry.trigger.toLowerCase().split(/\s+/),
          });
        }
      }
    }

    // Phase 8: participle → auxiliary Map for DE Perfekt auxiliary rule (DE-03).
    const participleToAux = buildParticipleToAux(raw);

    // Wave C0: plural noun form → genus, from raw nounbank (unfiltered superset).
    const nounPluralGenus = buildNounPluralGenus(raw);

    // Phase 11: mood/aspect reverse-lookup indexes for ES subjuntivo/imperfecto
    // and FR subjonctif rules. Built from raw verbbank (not wordList).
    const moodIndexes = buildMoodIndexes(raw, lang);

    // es-enye: curated n→ñ correction map. Keys are ascii forms (Norwegian
    // keyboards lack ñ), values the correct ñ spelling. Data lives in papertek
    // es/enyebank.json (ambiguity-vetted — año/ano, uña/una, piña/pina etc. are
    // deliberately excluded so the listed ascii forms are all genuine non-words).
    // Empty Map for non-es languages.
    const esEnyeMap = new Map();
    if (lang === 'es' && raw && raw.enyebank) {
      for (const [key, val] of Object.entries(raw.enyebank)) {
        if (key === '_metadata' || !val) continue;
        const correct = typeof val === 'string' ? val : (val.word || val.correct);
        if (typeof correct === 'string' && correct) esEnyeMap.set(key.toLowerCase(), correct);
      }
    }

    // fr-cedille: derived ascii→ç map. For every canonical FR word containing ç,
    // map its de-cedilla'd form → the ç form, UNLESS the de-cedilla'd form is
    // itself a canonical word (e.g. ça→ca is skipped). ç only appears where a
    // bare c would read /k/ before a/o/u, so de-cedilla'd ç-words are non-words —
    // the restoration is unambiguous (no valid-word collisions, no multi-target).
    // Empty Map for non-fr. Logic-only; data is the existing FR dictionary.
    const frCedilleMap = new Map();
    if (lang === 'fr' && raw) {
      const canon = new Set();
      const CEDILLE_FIELDS = ['word', 'lemma', 'plural', 'singular', 'forms', 'conjugations', 'feminine', 'feminin', 'masculin'];
      const harvestCedille = (v) => {
        if (typeof v === 'string') {
          for (const w of v.toLowerCase().split(/[^a-zàâäéèêëïîôöùûüÿç'-]+/)) if (w) canon.add(w);
        } else if (Array.isArray(v)) { v.forEach(harvestCedille); }
        else if (v && typeof v === 'object') { for (const x of Object.values(v)) harvestCedille(x); }
      };
      const CEDILLE_SKIP_BANKS = new Set(['grammarbank', '_metadata', 'typobank', 'phrasesbank']);
      for (const [bk, bank] of Object.entries(raw)) {
        if (CEDILLE_SKIP_BANKS.has(bk) || !bank || typeof bank !== 'object') continue;
        for (const [id, e] of Object.entries(bank)) {
          if (id === '_metadata' || !e || typeof e !== 'object') continue;
          for (const [f, v] of Object.entries(e)) if (CEDILLE_FIELDS.includes(f)) harvestCedille(v);
        }
      }
      for (const w of canon) {
        if (!w.includes('ç')) continue;
        const ascii = w.replace(/ç/g, 'c');
        if (ascii === w || canon.has(ascii)) continue; // collision (ça/ca) → skip
        if (!frCedilleMap.has(ascii)) frCedilleMap.set(ascii, w);
      }
    }

    // fr-plural: derived wrong-plural→correct-plural map for the irregular FR
    // plurals (-al→-aux, -eau→-eaux, -eu→-eux). For each single-word noun whose
    // plural ends in -aux/-eaux/-eux, the predictable learner error is the
    // regular -s plural (animal→"animals" for animaux). Map that wrong form →
    // the correct plural, UNLESS the wrong form is itself a canonical word (ciels,
    // lieus genuinely take -s). Empty Map for non-fr. Data = the FR dictionary.
    const frPluralMap = new Map();
    if (lang === 'fr' && raw) {
      const fpCanon = new Set();
      const FP_FIELDS = ['word', 'lemma', 'plural', 'singular', 'forms', 'feminine', 'feminin'];
      const fpHarvest = (v) => {
        if (typeof v === 'string') { for (const w of v.toLowerCase().split(/[^a-zàâäéèêëïîôöùûüÿç'-]+/)) if (w) fpCanon.add(w); }
        else if (Array.isArray(v)) v.forEach(fpHarvest);
        else if (v && typeof v === 'object') { for (const x of Object.values(v)) fpHarvest(x); }
      };
      const FP_SKIP = new Set(['grammarbank', '_metadata', 'typobank', 'phrasesbank']);
      for (const [bk, bank] of Object.entries(raw)) {
        if (FP_SKIP.has(bk) || !bank || typeof bank !== 'object') continue;
        for (const [id, e] of Object.entries(bank)) {
          if (id === '_metadata' || !e || typeof e !== 'object') continue;
          for (const [f, v] of Object.entries(e)) if (FP_FIELDS.indexOf(f) !== -1) fpHarvest(v);
        }
      }
      for (const [bk, bank] of Object.entries(raw)) {
        if (FP_SKIP.has(bk) || !bank || typeof bank !== 'object') continue;
        for (const [id, e] of Object.entries(bank)) {
          if (!e || typeof e !== 'object' || typeof e.word !== 'string' || typeof e.plural !== 'string') continue;
          const w = e.word.toLowerCase(), pl = e.plural.toLowerCase();
          if (/\s/.test(w) || !/(?:aux|eaux|eux)$/.test(pl)) continue;
          const wrong = w + 's';
          if (wrong === pl || fpCanon.has(wrong)) continue;
          if (!frPluralMap.has(wrong)) frPluralMap.set(wrong, e.plural);
        }
      }
    }

    // nb-anglicism: stem → Norwegian alternatives map, built from the curated
    // anglicismbank (NB/NN). Single source of truth for the nb-anglicism rule;
    // VERB entries only (the rule strips verb suffixes and is verb-scoped).
    // Empty Map for non-Norwegian languages.
    const anglicismMap = new Map();
    if ((lang === 'nb' || lang === 'nn') && raw && raw.anglicismbank && typeof raw.anglicismbank === 'object') {
      for (const e of Object.values(raw.anglicismbank)) {
        if (!e || typeof e !== 'object' || e.category !== 'verb') continue;
        if (typeof e.stem !== 'string' || !e.alternatives || typeof e.alternatives.infinitive !== 'string') continue;
        const inf = e.alternatives.infinitive;
        anglicismMap.set(e.stem.toLowerCase(), {
          inf,
          past: e.alternatives.past || inf,
          present: e.alternatives.present || inf,
        });
      }
    }

    // Full anglicism list for the browsable viewer (all categories + one example).
    // Viewer-only (NOT a spell-check index — exempt in check-vocab-seam-coverage).
    const anglicismList = [];
    if ((lang === 'nb' || lang === 'nn') && raw && raw.anglicismbank && typeof raw.anglicismbank === 'object') {
      for (const e of Object.values(raw.anglicismbank)) {
        if (!e || typeof e !== 'object' || typeof e.word !== 'string' || !e.alternatives) continue;
        const a = e.alternatives;
        const alt = a.infinitive || a.noun || a.adjective || a.adverb || a.expression || a.present || '';
        if (!alt) continue;
        const ex = Array.isArray(e.examples) && e.examples[0] && typeof e.examples[0].sentence === 'string'
          ? e.examples[0].sentence : '';
        anglicismList.push({ word: e.word, category: e.category || 'ord', alt, example: ex });
      }
      anglicismList.sort((a, b) => a.word.localeCompare(b.word, 'nb'));
    }

    // en-false-friend: lowercase EN word → false-friend metadata Map, built
    // from the curated falsefriendsbank (EN). Single source of truth for the
    // en-false-friend rule (mirrors anglicismMap). Carries the context-guard
    // arrays (safeContextNext/safeContextPrev) the rule reads. Empty Map for
    // non-English languages.
    const falseFriendsMap = new Map();
    if (lang === 'en' && raw && raw.falsefriendsbank && typeof raw.falsefriendsbank === 'object') {
      for (const e of Object.values(raw.falsefriendsbank)) {
        if (!e || typeof e !== 'object' || typeof e.word !== 'string') continue;
        // autoFlag:false → viewer-only. Some entries (novel≈novelle,
        // sensible≈sensitiv) are common correct English whose false-friend
        // sense is un-guardable by context word, so the en-false-friend rule
        // over-flags them. They stay in the browsable falseFriendsList below
        // (educational) but are excluded from the auto-flagging map.
        if (e.autoFlag === false) continue;
        falseFriendsMap.set(e.word.toLowerCase(), {
          nbWord: e.nbWord,
          enMeaning: e.enMeaning,
          suggestion: e.suggestion,
          safeContextNext: Array.isArray(e.safeContextNext) ? e.safeContextNext : undefined,
          safeContextPrev: Array.isArray(e.safeContextPrev) ? e.safeContextPrev : undefined,
        });
      }
    }

    // Full false-friends list for the browsable viewer (all entries + example).
    // Viewer-only (NOT a spell-check index — exempt in check-vocab-seam-coverage,
    // mirrors anglicismList). Built for ANY language that ships a falsefriendsbank
    // (EN + DE today); the falseFriendsMap above stays EN-gated because only the
    // en-false-friend rule consumes it — de-gate it when a DE flagging rule lands.
    const falseFriendsList = [];
    if (raw && raw.falsefriendsbank && typeof raw.falsefriendsbank === 'object') {
      for (const e of Object.values(raw.falsefriendsbank)) {
        if (!e || typeof e !== 'object' || typeof e.word !== 'string') continue;
        falseFriendsList.push({
          word: e.word,
          nbWord: e.nbWord,
          enMeaning: e.enMeaning,
          suggestion: e.suggestion,
          category: e.category || 'ord',
          examples: Array.isArray(e.examples) ? e.examples : [],
        });
      }
      falseFriendsList.sort((a, b) => a.word.localeCompare(b.word, lang));
    }

    // nb-typo-fuzzy: surface-form set of every anglicismbank headword plus
    // simple NB inflections (meetingen, canclet, gamet …). Established
    // loanwords students actually write ("cool", "random", "mindset") are
    // absent from the Ordbank validwords, so fuzzy-typo produced nonsense
    // corrections (cool→cobol, mindset→minuset) on top of the nb-anglicism
    // rule's own "consider a Norwegian word" nudge. The typo rule skips
    // members; nb-anglicism stays the single owner of loanword coaching.
    const anglicismWords = new Set();
    if ((lang === 'nb' || lang === 'nn') && raw && raw.anglicismbank && typeof raw.anglicismbank === 'object') {
      for (const e of Object.values(raw.anglicismbank)) {
        if (!e || typeof e !== 'object' || typeof e.word !== 'string') continue;
        const base = e.word.toLowerCase();
        if (base.includes(' ')) continue; // multiword expressions tokenize apart
        for (const suf of ['', 'en', 'et', 'er', 'e', 'a', 's', 't', 'de', 'r']) {
          anglicismWords.add(base + suf);
        }
        if (typeof e.stem === 'string') {
          const st = e.stem.toLowerCase();
          for (const suf of ['', 'en', 'et', 'er', 'e', 'a', 's', 't', 'de', 'r']) {
            anglicismWords.add(st + suf);
          }
        }
      }
    }

    // fr-adj-plural: derived wrong→correct map for FR adjectives whose masculine
    // plural is irregular in -aux (national→nationaux, local→locaux). The
    // predictable learner error is the regular -als plural ("nationals"). Map it →
    // the -aux form (computed from the word so accents are preserved), but only
    // for adjectives the data confirms take -aux (forms.m_pl or an acceptedForms
    // member ends -aux), and never when the -als form is itself a valid accepted
    // form (idéal→idéals/idéaux both exist). Empty Map for non-fr.
    const frAdjPluralMap = new Map();
    if (lang === 'fr' && raw && raw.adjectivebank && typeof raw.adjectivebank === 'object') {
      const adj = raw.adjectivebank;
      const apCanon = new Set();
      for (const e of Object.values(adj)) {
        if (!e || typeof e !== 'object') continue;
        if (Array.isArray(e.acceptedForms)) for (const f of e.acceptedForms) if (typeof f === 'string') apCanon.add(f.toLowerCase());
        if (e.forms && typeof e.forms === 'object') for (const f of Object.values(e.forms)) if (typeof f === 'string') apCanon.add(f.toLowerCase());
      }
      for (const e of Object.values(adj)) {
        if (!e || typeof e !== 'object' || typeof e.word !== 'string') continue;
        const w = e.word.toLowerCase();
        if (!/al$/.test(w) || /\s/.test(w)) continue;
        const mpl = (e.forms && typeof e.forms.m_pl === 'string') ? e.forms.m_pl.toLowerCase() : '';
        const acc = Array.isArray(e.acceptedForms) ? e.acceptedForms : [];
        const takesAux = /aux$/.test(mpl) || acc.some((x) => typeof x === 'string' && /aux$/.test(x.toLowerCase()));
        if (!takesAux) continue;
        const wrong = w + 's';
        if (apCanon.has(wrong)) continue;       // -als is itself a valid form
        const correct = w.slice(0, -2) + 'aux';  // national → nationaux (keeps accents)
        if (!frAdjPluralMap.has(wrong)) frAdjPluralMap.set(wrong, correct);
      }
    }

    // de-adjective-declension (predicative slice): inflected positive-degree
    // adjective form → uninflected lemma. German predicative adjectives (after
    // sein/werden/bleiben) take NO ending — "Das Haus ist groß", never "großes".
    // Built from the adjective bank's declension.positiv tables. Exclusions that
    // keep the consuming rule 0-FP: skip the lemma itself; skip masculine-strong
    // "-er" forms (they collide with the comparative, which IS valid predicatively
    // — "sind frischer"); skip a stoplist of quantifier/adverbial homographs
    // (viel/lang/hoch…) that are correct as bare predicates/adverbs. Keyed by the
    // lowercased inflected form; value is the correctly-spelled lemma.
    const deAdjPredicativeMap = new Map();
    if (lang === 'de' && raw && raw.adjectivebank && typeof raw.adjectivebank === 'object') {
      const STOP = new Set(['viel', 'wenig', 'manch', 'solch', 'all', 'beide', 'ander',
        'einig', 'mehrer', 'viele', 'beid', 'halb', 'ganz', 'lang', 'lange', 'hoch',
        'spät', 'früh', 'nah']);
      for (const e of Object.values(raw.adjectivebank)) {
        if (!e || typeof e !== 'object' || typeof e.word !== 'string') continue;
        if (!e.declension || !e.declension.positiv) continue;
        const lemma = e.word;
        const lemmaLc = lemma.toLowerCase();
        if (STOP.has(lemmaLc)) continue;
        const walk = (o) => {
          if (typeof o === 'string') {
            const f = o.toLowerCase();
            if (f && f !== lemmaLc && !/er$/.test(f) && !deAdjPredicativeMap.has(f)) {
              deAdjPredicativeMap.set(f, lemma);
            }
          } else if (o && typeof o === 'object') {
            for (const v of Object.values(o)) walk(v);
          }
        };
        walk(e.declension.positiv);
      }
    }

    const deRegularPresent = buildDeRegularPresent(raw, lang);
    const deStrongPresent = buildDeStrongPresent(raw, lang);
    const deComparatives = buildDeComparatives(raw, lang);
    const deDativePlural = buildDeDativePlural(raw, lang);

    // Phase 13: NN infinitive classification map for DOC-04.
    // Maps bare infinitive forms (akseptera, akseptere) to {register, counterpart}.
    // Empty Map for non-NN languages. Only dual-form verbs included.
    const nnInfinitiveClasses = buildNNInfinitiveClasses(raw, lang);

    // Phase 46 round 4: trusted NN canonical-infinitive surface set,
    // built straight from raw.verbbank entry.word fields. Used by
    // nb-nn-infinitive-after-aa.js to filter out NB-form fixes that
    // would otherwise come through the polluted verbInfinitive map.
    // Empty Set for non-NN languages.
    const nnCanonicalInfinitives = buildNNCanonicalInfinitives(raw, lang);

    // Phase 14: irregularForms Map for EN morphology rule (MORPH-01).
    // Maps wrong regular-pattern forms (childs, eated) to { correct, type, base }.
    // Empty Map for non-EN languages. Built from raw data (not wordList).
    const irregularForms = lang === 'en' ? buildIrregularForms(raw) : new Map();

    // Phase 19: s-passive form index for NB overuse + NN finite s-passive rules.
    // Maps lowercased s-passive forms to { baseVerb, isDeponent }.
    // Deponent entries also include all their regular conjugation forms.
    const sPassivForms = (lang === 'nb' || lang === 'nn') ? buildSPassivIndex(raw, lang) : new Map();

    // Phase 26-01: Preposition pedagogy index for the de-prep-case rule's
    // "Lær mer" popover panel. Maps lowercase preposition surface forms to
    // their `pedagogy` block as authored in papertek-vocabulary's
    // generalbank entries (case, summary, explanation, examples,
    // wechsel_pair, colloquial_note, contraction).
    //
    // Each lexicon entry's wordId looks like `durch_prep` / `ueber_prep` /
    // `am_prep`. We strip the `_prep` suffix and key the Map by:
    //   - the bare wordId stem (lowercase) — matches ASCII surface forms
    //     the student types when they avoid umlauts (durch, am, ueber, fuer)
    //   - the umlaut variant (ueber → über, fuer → für, waehrend → während)
    //     so a student typing the canonical German form also resolves
    //   - entry.word lowercased — covers any further canonical forms the
    //     lexicon might carry (defensive — usually equals the stem)
    //
    // NOT feature-gated: pedagogy lookup must work regardless of which
    // grammar features the user has enabled (mirrors the lookup-index
    // philosophy enforced by check-spellcheck-features).
    const prepPedagogy = new Map();
    if (raw && raw.generalbank) {
      const ASCII_TO_UMLAUT = [
        ['ue', 'ü'],
        ['oe', 'ö'],
        ['ae', 'ä'],
      ];
      for (const [wordId, entry] of Object.entries(raw.generalbank)) {
        if (!entry || !entry.pedagogy) continue;
        const keys = new Set();
        // Stem from wordId: drop trailing _prep / _adv / etc.
        const stem = String(wordId).replace(/_[a-z]+$/i, '').toLowerCase();
        if (stem) keys.add(stem);
        // Umlaut expansion of the stem (lexicon stores ASCII; students may type either).
        for (const [ascii, umlaut] of ASCII_TO_UMLAUT) {
          if (stem.includes(ascii)) {
            keys.add(stem.replaceAll(ascii, umlaut));
          }
        }
        // Canonical surface form from entry.word (covers any divergence).
        if (entry.word) keys.add(String(entry.word).toLowerCase());
        for (const k of keys) {
          if (k && !prepPedagogy.has(k)) prepPedagogy.set(k, entry.pedagogy);
        }
      }
    }

    const redundancyPhrases = [];  // [{ trigger, suggestion }]
    if (raw && raw.phrasebank) {
      for (const [id, entry] of Object.entries(raw.phrasebank)) {
        if (entry.trigger) redundancyPhrases.push(entry);
      }
    }

    // Grammar tables from synced grammarbank (replaces inline grammar-tables.js data)
    const grammarTables = {};
    const rulePedagogy = new Map();
    if (raw && raw.grammarbank) {
      for (const [id, entry] of Object.entries(raw.grammarbank)) {
        if (entry.type === 'grammar_table' && entry.table && entry.data) {
          grammarTables[entry.table] = entry.data;
        }
      }
      // Phase 39: generic structural pedagogy lessons authored in papertek-vocabulary
      if (raw.grammarbank.pedagogy) {
        for (const [id, entry] of Object.entries(raw.grammarbank.pedagogy)) {
          if (id === 'type' || id === 'word') continue;
          if (entry && typeof entry === 'object') rulePedagogy.set(id, entry);
        }
      }
    }

    // Phase 32-03: gustar-class membership read from verbbank verb_class
    // markers (lexical-entry-driven). Empty Set for non-ES languages.
    // Pedagogy block read from the shared grammarbank.pedagogy.gustar_class
    // entry — rendered by the es-gustar rule's "Lær mer" surface.
    const gustarClassVerbs = new Set();
    let gustarPedagogy = null;
    if (lang === 'es' && raw && raw.verbbank) {
      for (const entry of Object.values(raw.verbbank)) {
        if (entry && entry.verb_class === 'gustar-class' && entry.word) {
          gustarClassVerbs.add(String(entry.word).toLowerCase());
        }
      }
    }
    if (lang === 'es' && raw && raw.grammarbank && raw.grammarbank.pedagogy) {
      gustarPedagogy = raw.grammarbank.pedagogy.gustar_class || null;
    }

    // Phase 32-01: FR aspect-hint banks + shared pedagogy entry. Read from
    // generalbank's three meta entries authored in papertek-vocabulary:
    //   - aspect_passe_compose_adverbs (.values: array)
    //   - aspect_imparfait_adverbs (.values: array)
    //   - aspect_choice_pedagogy (.pedagogy: shared block)
    // Empty / null for non-FR languages.
    const frAspectAdverbs = { passeCompose: { single: new Set(), phrases: [] },
                               imparfait:    { single: new Set(), phrases: [] } };
    let frAspectPedagogy = null;
    if (lang === 'fr' && raw && raw.generalbank) {
      const pcEntry = raw.generalbank.aspect_passe_compose_adverbs;
      const ipEntry = raw.generalbank.aspect_imparfait_adverbs;
      const pdEntry = raw.generalbank.aspect_choice_pedagogy;
      const collectAdverbs = (entry, dest) => {
        if (!entry || !Array.isArray(entry.values)) return;
        for (const v of entry.values) {
          const s = String(v || '').toLowerCase().trim();
          if (!s) continue;
          if (s.includes(' ')) dest.phrases.push(s);
          else dest.single.add(s);
        }
      };
      collectAdverbs(pcEntry, frAspectAdverbs.passeCompose);
      collectAdverbs(ipEntry, frAspectAdverbs.imparfait);
      if (pdEntry && pdEntry.pedagogy) frAspectPedagogy = pdEntry.pedagogy;
    }

    return {
      wordList,
      nounGenus,
      nounLemmaGenus,
      // Wave C0: plural noun form → genus (counterpart of nounLemmaGenus).
      // Consumed by the FR agreement-number rules (ce-ces, quel-pluriel,
      // leur-leurs, adjectif-pluriel). Empty-ish for langs without plural data.
      nounPluralGenus,
      isAdjective,
      adjLemma,
      adjNeuter,
      nounPlural,
      knownPresens,
      knownPreteritum,
      knownParticiples,
      verbForms,
      nounForms,
      verbInfinitive,
      validWords,
      // Curated (lexicon-only) accept-set, excluding the permissive Ordbank
      // merge. Consumed by the NB→NN leakage + codeswitch rules so they keep
      // enforcing preferred Nynorsk instead of deferring to Ordbank sideforms.
      curatedValidWords,
      // v3.0.112: words valid ONLY as tokens of multi-word forms — in the
      // broad accept-path but excluded from typo-fuzzy's suggestion pool.
      multiwordTokens,
      typoFix,
      compoundNouns,
      // Every likestilt variant spelling, so a consumer can distinguish
      // «the norm also allows this» from «this is a lemma in its own right».
      variantSpellings,
      bigrams: normBigrams,
      // Phase 3-01: hydrated from freq-{lang}.json sidecar (NB/NN today; empty Map for other languages).
      freq: freqMap,
      // Phase 4 / SC-03: cross-dialect validWords Set (NB session → NN lemmas; NN session → NB lemmas).
      // Empty Set for de/es/fr/en. Typo-type entries intentionally excluded (Pitfall 1).
      sisterValidWords,
      // typoBank is an alias (same Map reference) of typoFix — the data-
      // oriented name used by consumers doing lookup/autocorrect work.
      typoBank: typoFix,
      // Phase 6: governance bank indexes for register/collocation/redundancy rules.
      // Empty when the underlying banks don't exist in the bundled vocab yet —
      // rules check for presence/size before iterating.
      registerWords,
      collocations,
      redundancyPhrases,
      // Phase 8: participle → auxiliary for DE Perfekt auxiliary choice rule.
      participleToAux,
      // Phase 11: mood/aspect reverse-lookup indexes for ES and FR rules.
      // Empty Maps for non-matching languages (e.g., esPresensToVerb is empty when lang !== 'es').
      ...moodIndexes,
      // es-enye: curated ascii→ñ correction map (data: papertek es/enyebank.json).
      esEnyeMap,
      // fr-cedille: derived ascii→ç correction map (from the FR dictionary).
      frCedilleMap,
      // fr-plural: derived wrong→correct irregular-plural map (FR dictionary).
      frPluralMap,
      // nb-anglicism: stem → Norwegian alternatives (from anglicismbank).
      anglicismMap,
      // full anglicism list for the browsable viewer (all categories).
      anglicismList,
      // en-false-friend: lowercase EN word → false-friend metadata (from falsefriendsbank).
      falseFriendsMap,
      // full false-friends list for the browsable viewer (viewer-only, exempt).
      falseFriendsList,
      // nb-typo-fuzzy: anglicismbank surface forms (headwords + inflections) —
      // established loanwords the fuzzy corrector must not nonsense-correct.
      anglicismWords,
      // fr-adj-plural: derived wrong→correct -al→-aux adjective map (FR dictionary).
      frAdjPluralMap,
      // de-adjective-declension: inflected adj form → uninflected lemma (predicative).
      deAdjPredicativeMap,
      // Phase 13: NN infinitive classification for DOC-04.
      // Empty Map for non-NN languages. 341 dual-form verb entries for NN.
      nnInfinitiveClasses,
      // Phase 46 round 4: trusted NN canonical-infinitive surface set
      // for nb-nn-infinitive-after-aa.js (NN side). Empty Set for non-NN.
      nnCanonicalInfinitives,
      // Phase 14: irregular form overregularization index for EN morphology rule.
      // Maps wrong regular forms (childs, eated) to { correct, type, base }.
      // Empty Map for non-EN languages.
      irregularForms,
      // Grammar tables from synced grammarbank. Keyed by table name
      // (e.g., "prep_case", "sein_verbs"). Empty when grammarbank not synced.
      grammarTables,
      // Generic structural pedagogy lookup (Phase 39). Keyed by rule_id.
      rulePedagogy,
      // Phase 19: s-passive form recognition index for NB/NN.
      // Maps s-passive forms to { baseVerb, isDeponent }. Empty for non-NB/NN.
      sPassivForms,
      // Phase 26-01: preposition pedagogy lookup for the "Lær mer" panel
      // surfaced by the de-prep-case rule. Empty Map for non-DE languages
      // (or when the bundled vocab pre-dates the pedagogy authoring pass).
      prepPedagogy,
      // Phase 32-03: gustar-class membership + shared pedagogy entry.
      // Empty Set / null for non-ES languages.
      gustarClassVerbs,
      gustarPedagogy,
      // Phase 32-01: FR aspect-hint adverb banks + shared pedagogy block.
      // Consumed by fr-aspect-hint rule. frAspectAdverbs has shape
      // { passeCompose: { single: Set, phrases: Array }, imparfait: same }.
      // Empty / null for non-FR languages.
      frAspectAdverbs,
      frAspectPedagogy,
      // NB→NN cross-reference maps for auto-fix in nn-verb-leakage / nn-plural-leakage.
      // Empty Maps for non-NN languages or when crossrefbank not synced.
      nbToNnVerbs,
      nbToNnNouns,
      // Union of every conjugated form across the sister verbbank. Powers
      // positive-evidence verb gating in nn-verb-leakage. null for non-NN.
      sisterVerbForms,
      // Phase 45: curated NB/NN denylist of word pairs that look decomposable
      // but are NOT productive compounds. Set of "left|right" lowercase keys.
      // Consumed by nb-sarskriving-tentative to suppress known-FP classes
      // (subject+verb collisions, idiomatic adj+noun phrases). Empty Set for
      // non-NB/NN or when sidecar not present.
      nonCompoundPairs: buildNonCompoundPairs(nonCompoundPairsJson),
      // DE regular-verb present paradigms ({byLemma, byForm}) for the
      // de-subject-verb regular-verb agreement check. Empty maps for non-DE.
      deRegularPresent,
      // DE strong-verb present index (regularized 2/3sg form → [{fix,pron}])
      // for the de-strong-verb rule ("du fahrst"→"fährst"). Empty for non-DE.
      deStrongPresent,
      deComparatives,
      // DE nominative-plural → dative-plural (only when -n differs) for the
      // de-dative-plural rule ("seit drei Jahre" → "Jahren"). Empty for non-DE.
      deDativePlural,
      // Phase 16: compound decomposition bound to this index's nounGenus and lang.
      decomposeCompound: (word) => decomposeCompound(word, nounGenus, lang),
      // Slice 1: dictionary compound tier classifier (N+N, fuge-aware).
      classifyCompound: (word) => classifyCompound(word, nounGenus, (w) => validWords.has(String(w).toLowerCase()), lang),
      // Phase 17-05: strict decomposition using lemma-only genus map (no inflected forms).
      decomposeCompoundStrict: (word) => decomposeCompound(word, nounLemmaGenus, lang),
      // Phase 24: compound word prediction bound to this index's nounGenus and lang.
      predictCompound: (partial) => predictCompound(partial, nounGenus, lang, (w) => decomposeCompound(w, nounGenus, lang)),
    };
  }

  // ── Dual-export footer ──
  // Writes `self.__lexiVocabCore` in the browser (content script) AND
  // `module.exports` in Node — same API, same code path.
  const api = { buildIndexes, makeFeaturePredicate, phoneticNormalize, phoneticMatchScore, decomposeCompound, classifyCompound, predictCompound, buildSPassivIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiVocabCore = api;
})();
