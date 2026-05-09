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

  // Phase 16: Compound linking elements per language
  const LINKERS_BY_LANG = {
    nb: ['s', 'e'],
    nn: ['s', 'e'],
    de: ['s', 'n', 'en', 'er', 'e', 'es'],
  };

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
          }
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
              }
            }
          }
        }

        // Add NB/NN noun forms (ubestemt/bestemt × entall/flertall)
        if (bank === 'nounbank' && entry.forms) {
          for (const [formType, forms] of Object.entries(entry.forms)) {
            if (!forms || typeof forms !== 'object') continue;
            for (const [number, formRaw] of Object.entries(forms)) {
              const formValues = Array.isArray(formRaw) ? formRaw : [formRaw];
              for (const form of formValues) {
                if (!form || form.toLowerCase() === (entry.word || '').toLowerCase()) continue;
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
        }

        // Add plural forms
        if (bank === 'nounbank' && entry.plural && isFeatureEnabled('grammar_plural')) {
          wordList.push({
            word: entry.plural.toLowerCase(),
            display: entry.plural,
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
        // German: entry.komparativ (string), Spanish/French: entry.comparison.komparativ.form (nested)
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
            wordList.push({
              word: komparativ.toLowerCase(),
              display: komparativ,
              translation: `${entry.word} (komparativ)`,
              type: 'comparative',
              baseWord: entry.word,
              zipf: zipf
            });
          }
          if (superlativ && isFeatureEnabled('grammar_superlative')) {
            wordList.push({
              word: superlativ.toLowerCase(),
              display: superlativ,
              translation: `${entry.word} (superlativ)`,
              type: 'superlative',
              baseWord: entry.word,
              zipf: zipf
            });
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
            for (const degree of ['positiv', 'komparativ', 'superlativ']) {
              const degreeBlock = entry.declension[degree];
              if (!degreeBlock || typeof degreeBlock !== 'object') continue;
              for (const [formKey, formRaw] of Object.entries(degreeBlock)) {
                const formValues = Array.isArray(formRaw) ? formRaw : [formRaw];
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
    const typoFix = new Map();          // 'komer' → 'kommer'
    const compoundNouns = new Set();    // noun-bank base entries
    const knownPresens = new Set();     // 'spiser' → true
    const knownPreteritum = new Set();  // 'spiste' → true
    const verbForms = new Map();        // 'spise' → { present: Set, past: Set }
    const nounForms = new Map();        // 'hus' → { singular: Set, plural: Set }

    const isNorwegian = lang === 'nb' || lang === 'nn';

    for (const entry of wordList) {
      const w = entry.word;
      if (!w) continue;

      if (entry.bank === 'adjectivebank' || entry.type === 'adjective' || (entry.type === 'plural' && entry.bank === 'adjectivebank')) {
        isAdjective.add(w);
      }

      if ((entry.bank === 'nounbank' || entry.type === 'nounform' || entry.type === 'plural') && entry.baseWord) {
        const base = entry.baseWord.toLowerCase();
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
          entry.number === 'flertall'
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
            }
          } else {
            if (entry.tenseKey === 'present') {
              knownPresens.add(w);
              forms.present.add(w);
            } else if (entry.tenseKey === 'past') {
              knownPreteritum.add(w);
              forms.past.add(w);
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
      if (entry.type !== 'typo') {
        validWords.add(w);
      }
      // Verb infinitives are stored as "å sykle" / "å være" — also accept the
      // bare infinitive so unprefixed usage doesn't get flagged as unknown.
      if (entry.type !== 'typo' && w.startsWith('å ')) validWords.add(w.slice(2));

      if ((entry.bank === 'nounbank' || entry.type === 'nounform' || entry.type === 'plural') && entry.genus) {
        // Only set genus if not already present, so the base form wins
        // for common ambiguous words.
        if (!nounGenus.has(w)) nounGenus.set(w, entry.genus);
      }

      // Phase 17-05: lemma-only genus for strict compound decomposition.
      // Excludes inflected forms (nounform, plural) and typos to prevent
      // false positives when sarskriving rule decomposes adjacent tokens.
      if (entry.bank === 'nounbank' && entry.type !== 'typo' && entry.type !== 'nounform' && entry.type !== 'plural' && entry.genus) {
        if (!nounLemmaGenus.has(w)) nounLemmaGenus.set(w, entry.genus);
      }

      // For særskriving: only consider noun-bank base entries, to avoid
      // flagging "stor by" (valid phrase) as a compound of the adjective form.
      if (entry.bank === 'nounbank' && entry.type !== 'typo') {
        compoundNouns.add(w);
      }

      if (entry.type === 'conjugation' && entry.baseWord) {
        const inf = entry.baseWord.replace(/^å\s+/i, '').trim();
        if (inf && inf !== w) verbInfinitive.set(w, inf);
      }

      if (entry.type === 'typo' && entry.display) {
        typoFix.set(w, entry.display);
      }
    }

    return { nounGenus, nounLemmaGenus, verbInfinitive, validWords, isAdjective, knownPresens, knownPreteritum, verbForms, nounForms, typoFix, compoundNouns };
  }

  // ── Phase 8: Build participle → auxiliary Map from raw verbbank ──
  // Maps past-participle forms (lowercase) to their required auxiliary
  // ('haben', 'sein', or 'both'). Built from raw data rather than wordList
  // because wordList entries don't carry conjugation details.
  function buildParticipleToAux(raw) {
    const participleToAux = new Map();
    if (!raw || !raw.verbbank) return participleToAux;
    for (const entry of Object.values(raw.verbbank)) {
      const perf = entry.conjugations?.perfektum || entry.conjugations?.passe_compose;
      if (!perf) continue;
      if (!perf.participle || !perf.auxiliary) continue;
      // Phase 42: defensive against future array-valued participles.
      const partValues = Array.isArray(perf.participle) ? perf.participle : [perf.participle];
      for (const p of partValues) {
        if (typeof p !== 'string' || !p) continue;
        const participle = p.toLowerCase();
        if (!participleToAux.has(participle)) {
          participleToAux.set(participle, perf.auxiliary);
        }
      }
    }
    return participleToAux;
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
        const former = tenseVal.former;
        if (!former) continue;
        const inf = former.infinitiv;
        if (!Array.isArray(inf) || inf.length < 2) continue;

        // Strip "a " or "å " prefix from each form
        const forms = inf.map(f => f.replace(/^[aå]\s+/, ''));
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

  function decomposeCompound(word, nounGenus, lang, depth) {
    if (depth === undefined) depth = 0;
    // Max 4 components = max 3 splits (depth 0/1/2 = 3 recursive levels)
    if (depth > 2) return null;
    // Minimum compound length: 3 + 3
    if (!word || word.length < 6) return null;
    // Stored entry takes precedence (Tier 1)
    if (nounGenus.has(word)) return null;

    const linkers = LINKERS_BY_LANG[lang] || [];

    for (let splitPos = 3; splitPos <= word.length - 3; splitPos++) {
      const left = word.slice(0, splitPos);
      if (!nounGenus.has(left)) continue;

      const remainder = word.slice(splitPos);

      // Zero-fuge direct match
      if (nounGenus.has(remainder)) {
        return {
          parts: [
            { word: left, genus: nounGenus.get(left), linker: '' },
            { word: remainder, genus: nounGenus.get(remainder), linker: '' },
          ],
          gender: nounGenus.get(remainder),
          confidence: 'high',
        };
      }

      // Zero-fuge recursive
      const subZero = decomposeCompound(remainder, nounGenus, lang, depth + 1);
      if (subZero) {
        return {
          parts: [
            { word: left, genus: nounGenus.get(left), linker: '' },
            ...subZero.parts,
          ],
          gender: subZero.gender,
          confidence: 'high',
        };
      }

      // Linker-based splits
      for (const linker of linkers) {
        if (!remainder.startsWith(linker)) continue;
        const stripped = remainder.slice(linker.length);
        if (stripped.length < 3) continue;

        if (nounGenus.has(stripped)) {
          return {
            parts: [
              { word: left, genus: nounGenus.get(left), linker: linker },
              { word: stripped, genus: nounGenus.get(stripped), linker: '' },
            ],
            gender: nounGenus.get(stripped),
            confidence: 'high',
          };
        }

        const subLinker = decomposeCompound(stripped, nounGenus, lang, depth + 1);
        if (subLinker) {
          return {
            parts: [
              { word: left, genus: nounGenus.get(left), linker: linker },
              ...subLinker.parts,
            ],
            gender: subLinker.gender,
            confidence: 'high',
          };
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
              return {
                parts: [
                  { word: left, genus: nounGenus.get(left), linker: lc + 'e' },
                  { word: stripped, genus: nounGenus.get(stripped), linker: '' },
                ],
                gender: nounGenus.get(stripped),
                confidence: 'medium',
              };
            }
            const subDouble = decomposeCompound(stripped, nounGenus, lang, depth + 1);
            if (subDouble) {
              return {
                parts: [
                  { word: left, genus: nounGenus.get(left), linker: lc + 'e' },
                  ...subDouble.parts,
                ],
                gender: subDouble.gender,
                confidence: 'medium',
              };
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
          return {
            parts: [
              { word: left, genus: nounGenus.get(left), linker: '' },
              { word: restored, genus: nounGenus.get(restored), linker: '' },
            ],
            gender: nounGenus.get(restored),
            confidence: 'high',
          };
        }

        const subElision = decomposeCompound(restored, nounGenus, lang, depth + 1);
        if (subElision) {
          return {
            parts: [
              { word: left, genus: nounGenus.get(left), linker: '' },
              ...subElision.parts,
            ],
            gender: subElision.gender,
            confidence: 'high',
          };
        }
      }
    }

    return null;
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

  // ── Public API ──

  function buildIndexes({ raw, bigrams, freq, sisterRaw, lang, isFeatureEnabled } = {}) {
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
      nounGenus, nounLemmaGenus, verbInfinitive, validWords, isAdjective,
      knownPresens, knownPreteritum, verbForms, nounForms, typoFix, compoundNouns
    } = buildLookupIndexes(unfilteredWordList, lang);
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
    if (sisterRaw && (lang === 'nb' || lang === 'nn')) {
      const sisterLang = lang === 'nb' ? 'nn' : 'nb';
      const sisterList = buildWordList(sisterRaw, sisterLang, () => true);
      for (const entry of sisterList) {
        if (entry.type === 'typo') continue;
        if (entry.word) sisterValidWords.add(entry.word.toLowerCase());
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
    if (raw && raw.collocationbank) {
      for (const [id, entry] of Object.entries(raw.collocationbank)) {
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

    // Phase 11: mood/aspect reverse-lookup indexes for ES subjuntivo/imperfecto
    // and FR subjonctif rules. Built from raw verbbank (not wordList).
    const moodIndexes = buildMoodIndexes(raw, lang);

    // Phase 13: NN infinitive classification map for DOC-04.
    // Maps bare infinitive forms (akseptera, akseptere) to {register, counterpart}.
    // Empty Map for non-NN languages. Only dual-form verbs included.
    const nnInfinitiveClasses = buildNNInfinitiveClasses(raw, lang);

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
      isAdjective,
      knownPresens,
      knownPreteritum,
      verbForms,
      nounForms,
      verbInfinitive,
      validWords,
      typoFix,
      compoundNouns,
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
      // Phase 13: NN infinitive classification for DOC-04.
      // Empty Map for non-NN languages. 341 dual-form verb entries for NN.
      nnInfinitiveClasses,
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
      // Phase 16: compound decomposition bound to this index's nounGenus and lang.
      decomposeCompound: (word) => decomposeCompound(word, nounGenus, lang),
      // Phase 17-05: strict decomposition using lemma-only genus map (no inflected forms).
      decomposeCompoundStrict: (word) => decomposeCompound(word, nounLemmaGenus, lang),
      // Phase 24: compound word prediction bound to this index's nounGenus and lang.
      predictCompound: (partial) => predictCompound(partial, nounGenus, lang, (w) => decomposeCompound(w, nounGenus, lang)),
    };
  }

  // ── Dual-export footer ──
  // Writes `self.__lexiVocabCore` in the browser (content script) AND
  // `module.exports` in Node — same API, same code path.
  const api = { buildIndexes, phoneticNormalize, phoneticMatchScore, decomposeCompound, predictCompound, buildSPassivIndex };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiVocabCore = api;
})();
