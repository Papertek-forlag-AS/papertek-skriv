/**
 * Leksihjelp — Word Prediction Engine (Phase 43-02)
 *
 * Pure-logic surface for the word-prediction pipeline. Owns the fuzzy
 * ranker (`findSuggestions` + `applyBoosts` + `matchScore` +
 * `phoneticMatchScore` + `levenshtein` + frequency helpers) plus the
 * static signal tables (modal verbs, determiners, prepositions, pronoun
 * context, NB/NN agreement context, German preposition→case map) that
 * were inlined in word-prediction.js.
 *
 * Engine signature:
 *   suggest(prefix, vocab, prefs) → ranked[]
 *
 *   prefix — string (the current word being typed, lowercase already
 *            applied internally)
 *   vocab  — { getWordList(), getFrequency(word), getBigrams(),
 *             phoneticNormalize(s), phoneticMatchScore(a, b) }
 *   prefs  — {
 *     lang                 : 'nb' | 'nn' | 'en' | 'de' | 'es' | 'fr',
 *     maxResults           : number = 8,
 *     prefixIndex          : Map<string, number[]>,    // built via buildPrefixIndex(wordList)
 *     recentWordsSet       : Set<string>,
 *     pronounContext       : string | null,
 *     hasModalVerb         : boolean,
 *     detectedTense        : 'present' | 'past' | null,
 *     expectedPOS          : 'noun_adj' | null,
 *     genderContext        : 'm' | 'f' | 'n' | null,
 *     posStrength          : 0 | 1 | 2,
 *     caseContext          : 'akkusativ' | 'dativ' | 'genitiv' | 'wechsel' | null,
 *     previousWord         : string,
 *     previousTwoWords     : string,
 *     numberContext        : 'entall' | 'flertall' | null,
 *     definitenessContext  : 'bestemt' | 'ubestemt' | null,
 *   }
 *
 * Returns: full ranked list (NOT trimmed to VISIBLE_DEFAULT). Renderer
 * decides how many rows to display. Each entry: a shallow-merged copy
 * of the vocab entry plus { score: number }.
 *
 * Engine also exports static signal tables:
 *   MODAL_VERBS, INFINITIVE_MARKERS, DETERMINERS_BY_LANG,
 *   PREPOSITIONS_BY_LANG, PREPOSITION_CASE, PRONOUN_CONTEXT_BY_LANG,
 *   NB_NN_AGREEMENT_CONTEXT
 *
 * …and helpers callers need to assemble prefs:
 *   buildPrefixIndex(wordList) → Map
 *
 * Dual-export footer (mirrors spell-check-engine.js exactly):
 *   - Node:    module.exports = { suggest, buildPrefixIndex, ... }
 *   - Browser: self.__lexiPredictionEngine = { suggest, buildPrefixIndex, ... }
 *
 * Purity contract (enforced by scripts/check-engine-purity.js):
 *   - No DOM / chrome.* / window.* references
 *   - No CSS class string literals
 *   - All vocab access via the injected `vocab` object
 *   - All UI state (selectedIndex, expanded, VISIBLE_DEFAULT) lives in
 *     the renderer; engine returns the full ranked list
 */

(function () {
  'use strict';

  // ── Static signal tables (lifted verbatim from word-prediction.js) ──

  // Modal verbs - when present, main verb should be infinitive
  const MODAL_VERBS = new Set([
    // German - können
    'kann', 'kannst', 'können', 'könnt',
    // German - müssen
    'muss', 'musst', 'müssen', 'müsst',
    // German - wollen
    'will', 'willst', 'wollen', 'wollt',
    // German - sollen
    'soll', 'sollst', 'sollen', 'sollt',
    // German - dürfen
    'darf', 'darfst', 'dürfen', 'dürft',
    // German - mögen/möchten
    'mag', 'magst', 'mögen', 'mögt',
    'möchte', 'möchtest', 'möchten', 'möchtet',
    // Spanish - poder (can)
    'puedo', 'puedes', 'puede', 'podemos', 'pueden',
    // Spanish - querer (want)
    'quiero', 'quieres', 'quiere', 'queremos', 'quieren',
    // Spanish - deber (must)
    'debo', 'debes', 'debe', 'debemos', 'deben',
    // French - pouvoir (can)
    'peux', 'peut', 'pouvons', 'pouvez', 'peuvent',
    // French - devoir (must)
    'dois', 'doit', 'devons', 'devez', 'doivent',
    // French - vouloir (want)
    'veux', 'veut', 'voulons', 'voulez', 'veulent',
    // Norwegian - kunne (can)
    'kan', 'kunne', 'kunna',
    // Norwegian - måtte (must)
    'må', 'måtte',
    // Norwegian - ville (want)
    'vil', 'ville',
    // Norwegian - skulle (shall)
    'skal', 'skulle',
    // Norwegian - burde (should)
    'bør', 'burde',
    // Norwegian - få (get to)
    'får', 'fikk', 'fekk'
  ]);

  // Infinitive markers — only trigger when IMMEDIATELY preceding the current word
  const INFINITIVE_MARKERS = new Set(['å', 'zu']);

  // Pronoun context mapping — per-language to avoid key conflicts
  const PRONOUN_CONTEXT_BY_LANG = {
    de: {
      'ich': 'ich', 'du': 'du', 'er': 'er/sie/es',
      'sie': 'er/sie/es', 'es': 'er/sie/es',
      'wir': 'wir', 'ihr': 'ihr'
    },
    es: {
      'yo': 'yo', 'tú': 'tú', 'tu': 'tú',
      'él': 'él/ella/usted', 'ella': 'él/ella/usted', 'usted': 'él/ella/usted',
      'nosotros': 'nosotros', 'nosotras': 'nosotros',
      'vosotros': 'vosotros', 'vosotras': 'vosotros',
      'ellos': 'ellos/ellas/ustedes', 'ellas': 'ellos/ellas/ustedes', 'ustedes': 'ellos/ellas/ustedes'
    },
    fr: {
      'je': 'je', "j'": 'je',
      'il': 'il/elle/on', 'elle': 'il/elle/on', 'on': 'il/elle/on',
      'tu': 'tu', 'nous': 'nous', 'vous': 'vous',
      'ils': 'ils/elles', 'elles': 'ils/elles'
    },
    nb: {
      'jeg': '_nb_pronoun', 'du': '_nb_pronoun', 'han': '_nb_pronoun',
      'hun': '_nb_pronoun', 'vi': '_nb_pronoun', 'dere': '_nb_pronoun',
      'de': '_nb_pronoun', 'det': '_nb_pronoun', 'den': '_nb_pronoun', 'man': '_nb_pronoun'
    },
    nn: {
      'eg': '_nb_pronoun', 'du': '_nb_pronoun', 'han': '_nb_pronoun',
      'ho': '_nb_pronoun', 'vi': '_nb_pronoun', 'dykk': '_nb_pronoun',
      'dei': '_nb_pronoun', 'det': '_nb_pronoun', 'den': '_nb_pronoun', 'ein': '_nb_pronoun'
    }
  };

  // POS expectation: determiners + their gender hints
  const DETERMINERS_BY_LANG = {
    de: {
      'der': 'm', 'die': 'f', 'das': 'n',
      'ein': null, 'eine': 'f', 'einen': 'm', 'einem': null, 'einer': 'f',
      'dem': null, 'den': 'm',
      'kein': null, 'keine': 'f', 'keinen': 'm', 'keinem': null, 'keiner': 'f',
      'mein': null, 'meine': 'f', 'meinen': 'm',
      'dein': null, 'deine': 'f', 'deinen': 'm',
      'sein': null, 'seine': 'f', 'seinen': 'm',
      'ihre': 'f', 'ihren': 'm',
      'unsere': 'f', 'unseren': 'm',
      'dieser': 'm', 'diese': 'f', 'dieses': 'n', 'diesem': null, 'diesen': 'm',
      'jeder': 'm', 'jede': 'f', 'jedes': 'n',
      'welcher': 'm', 'welche': 'f', 'welches': 'n',
    },
    es: {
      'el': 'm', 'la': 'f', 'los': 'm', 'las': 'f',
      'un': 'm', 'una': 'f', 'unos': 'm', 'unas': 'f',
      'nuestro': 'm', 'nuestra': 'f', 'nuestros': 'm', 'nuestras': 'f',
      'este': 'm', 'esta': 'f', 'estos': 'm', 'estas': 'f',
      'ese': 'm', 'esa': 'f', 'esos': 'm', 'esas': 'f',
      'aquel': 'm', 'aquella': 'f',
      'mi': null, 'tu': null, 'su': null,
      'mis': null, 'tus': null, 'sus': null,
    },
    fr: {
      'le': 'm', 'la': 'f', 'les': null,
      'un': 'm', 'une': 'f', 'des': null,
      'du': 'm',
      'mon': null, 'ma': 'f', 'mes': null,
      'ton': null, 'ta': 'f', 'tes': null,
      'son': null, 'sa': 'f', 'ses': null,
      'notre': null, 'votre': null, 'leur': null,
      'ce': 'm', 'cet': 'm', 'cette': 'f', 'ces': null,
      'quel': 'm', 'quelle': 'f', 'quels': 'm', 'quelles': 'f',
    },
    nb: {
      'en': 'm', 'ei': 'f', 'et': 'n',
      'min': 'm', 'mi': 'f', 'mitt': 'n',
      'din': 'm', 'di': 'f', 'ditt': 'n',
      'si': 'f', 'sitt': 'n',
      'vårt': 'n', 'denne': null, 'dette': 'n',
      'noe': 'n', 'intet': 'n', 'hvert': 'n',
      'noen': null, 'ingen': null, 'hver': null, 'alle': null,
    },
    nn: {
      'ein': 'm', 'ei': 'f', 'eit': 'n',
      'min': 'm', 'mi': 'f', 'mitt': 'n',
      'din': 'm', 'di': 'f', 'ditt': 'n',
      'si': 'f', 'sitt': 'n',
      'vårt': 'n', 'denne': null, 'dette': 'n',
      'noko': 'n', 'inkje': 'n', 'kvart': 'n',
      'nokon': null, 'ingen': null, 'kvar': null, 'alle': null,
    }
  };

  // NB/NN number + definiteness hints from determiners/demonstratives.
  const NB_NN_AGREEMENT_CONTEXT = {
    nb: {
      'en': { number: 'entall', definiteness: 'ubestemt' },
      'ei': { number: 'entall', definiteness: 'ubestemt' },
      'et': { number: 'entall', definiteness: 'ubestemt' },
      'den': { number: 'entall', definiteness: 'bestemt' },
      'det': { number: 'entall', definiteness: 'bestemt' },
      'de': { number: 'flertall', definiteness: 'bestemt' },
      'denne': { number: 'entall', definiteness: 'bestemt' },
      'dette': { number: 'entall', definiteness: 'bestemt' },
      'disse': { number: 'flertall', definiteness: 'bestemt' },
      'mange': { number: 'flertall' },
      'flere': { number: 'flertall' },
      'noen': { number: 'flertall' },
      'få': { number: 'flertall' },
      'alle': { number: 'flertall' },
      'begge': { number: 'flertall' },
    },
    nn: {
      'ein': { number: 'entall', definiteness: 'ubestemt' },
      'ei': { number: 'entall', definiteness: 'ubestemt' },
      'eit': { number: 'entall', definiteness: 'ubestemt' },
      'den': { number: 'entall', definiteness: 'bestemt' },
      'det': { number: 'entall', definiteness: 'bestemt' },
      'dei': { number: 'flertall', definiteness: 'bestemt' },
      'denne': { number: 'entall', definiteness: 'bestemt' },
      'dette': { number: 'entall', definiteness: 'bestemt' },
      'desse': { number: 'flertall', definiteness: 'bestemt' },
      'mange': { number: 'flertall' },
      'fleire': { number: 'flertall' },
      'nokon': { number: 'flertall' },
      'få': { number: 'flertall' },
      'alle': { number: 'flertall' },
      'begge': { number: 'flertall' },
    },
  };

  // German preposition → grammatical case map
  const PREPOSITION_CASE = {
    'durch': 'akkusativ', 'für': 'akkusativ', 'gegen': 'akkusativ',
    'ohne': 'akkusativ', 'um': 'akkusativ', 'bis': 'akkusativ',
    'aus': 'dativ', 'bei': 'dativ', 'mit': 'dativ', 'nach': 'dativ',
    'seit': 'dativ', 'von': 'dativ', 'gegenüber': 'dativ',
    'während': 'genitiv', 'wegen': 'genitiv', 'trotz': 'genitiv', 'statt': 'genitiv',
    'an': 'wechsel', 'auf': 'wechsel', 'hinter': 'wechsel', 'in': 'wechsel',
    'neben': 'wechsel', 'über': 'wechsel', 'unter': 'wechsel', 'vor': 'wechsel',
    'zwischen': 'wechsel',
  };

  // Prepositions — moderate noun/adj signal
  const PREPOSITIONS_BY_LANG = {
    de: new Set(['in', 'auf', 'mit', 'für', 'an', 'bei', 'nach', 'von', 'aus',
      'über', 'unter', 'vor', 'hinter', 'zwischen', 'neben', 'gegen', 'ohne',
      'um', 'durch', 'bis', 'seit', 'während', 'wegen', 'trotz', 'statt']),
    es: new Set(['en', 'de', 'a', 'por', 'para', 'con', 'sin', 'sobre', 'entre',
      'hacia', 'hasta', 'desde', 'durante', 'contra', 'tras']),
    fr: new Set(['à', 'de', 'en', 'dans', 'sur', 'sous', 'avec', 'sans', 'pour',
      'par', 'entre', 'vers', 'chez', 'contre', 'depuis', 'pendant',
      'avant', 'après', 'devant', 'derrière', 'malgré']),
    nb: new Set(['i', 'på', 'med', 'for', 'til', 'fra', 'av', 'om', 'hos', 'mot',
      'over', 'under', 'ved', 'etter', 'mellom', 'gjennom', 'blant',
      'langs', 'rundt', 'uten', 'innen', 'utenfor', 'innenfor']),
    nn: new Set(['i', 'på', 'med', 'for', 'til', 'frå', 'av', 'om', 'hos', 'mot',
      'over', 'under', 'ved', 'etter', 'mellom', 'gjennom', 'blant',
      'langs', 'rundt', 'utan', 'innan', 'utanfor', 'innanfor']),
  };

  // ── Frequency helpers (Phase 3-04: WP-01 + WP-03 + WP-04) ──

  function getEffectiveFreq(entry, vocab) {
    const z = vocab.getFrequency(entry.word);
    if (typeof z === 'number') return z;
    if (typeof entry.zipf === 'number') return entry.zipf;
    return 0;
  }

  function sharedSuffixLen(a, b) {
    if (!a || !b) return 0;
    const la = a.length, lb = b.length;
    const n = Math.min(la, lb);
    let i = 0;
    while (i < n && a[la - 1 - i] === b[lb - 1 - i]) i++;
    return i;
  }

  function freqSignal(entry, vocab) {
    const z = getEffectiveFreq(entry, vocab);
    return z * 20;
  }

  function lowFreqDemotion(entry, vocab) {
    const z = getEffectiveFreq(entry, vocab);
    if (z > 0 && z < 1.5) return -80;
    return 0;
  }

  // ── Match scoring ──

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

  function matchScore(query, target) {
    if (target.startsWith(query)) return 100 + (query.length / target.length) * 50;
    if (target.includes(query)) return 50;
    if (query.length >= 3) {
      const maxDist = query.length <= 4 ? 1 : 2;
      const targetPrefix = target.slice(0, query.length + maxDist);
      const dist = levenshtein(query, targetPrefix);
      if (dist <= maxDist) return 30 - dist * 5;
    }
    return 0;
  }

  // ── Prefix index (callable so renderer can rebuild on vocab change) ──

  function buildPrefixIndex(wordList) {
    const idx = new Map();
    for (let i = 0; i < wordList.length; i++) {
      const w = wordList[i].word;
      for (let len = 2; len <= Math.min(3, w.length); len++) {
        const prefix = w.slice(0, len);
        if (!idx.has(prefix)) idx.set(prefix, []);
        idx.get(prefix).push(i);
      }
    }
    return idx;
  }

  // ── Boost accumulation ──
  // Mirrors applyBoosts from word-prediction.js verbatim. Pushes a scored
  // entry onto `scored`. `recentWordsSet` may be empty; `vocab.getBigrams()`
  // may return null — both handled defensively.

  function applyBoosts(entry, score, scored, prefs, vocab) {
    const {
      pronounContext, hasModalVerb, detectedTense, query,
      expectedPOS, genderContext, posStrength, caseContext,
      previousWord, previousTwoWords, numberContext, definitenessContext,
      recentWordsSet,
    } = prefs;

    let workingEntry = entry;

    // 1. Typo matches
    if (entry.type === 'typo' && score >= 50) {
      if (query && query.length / entry.display.length >= 0.6) {
        score += 150;
      } else {
        workingEntry = Object.assign({}, entry, { type: 'base' });
        score += 30;
      }
    }

    // 2. Recency
    if (recentWordsSet && recentWordsSet.has(workingEntry.word)) {
      score += 150;
    }

    // 3. Modal verb + infinitive boost
    if (hasModalVerb && workingEntry.type === 'base' && workingEntry.bank === 'verbbank') {
      score += 250;
    }
    if (hasModalVerb && workingEntry.type === 'conjugation' && workingEntry.formKey === 'infinitiv') {
      score += 250;
    }

    // 4. Pronoun + tense
    if (!hasModalVerb && pronounContext && workingEntry.type === 'conjugation') {
      if (workingEntry.pronoun === pronounContext) score += 200;
    }
    if (!hasModalVerb && pronounContext === '_nb_pronoun') {
      const targetTense = detectedTense || 'present';
      if (workingEntry.type === 'base' && workingEntry.bank === 'verbbank') {
        score += 150;
      }
      if (workingEntry.type === 'conjugation' && workingEntry.tenseKey === targetTense) {
        score += 200;
      }
    }
    if (detectedTense && workingEntry.type === 'conjugation' && workingEntry.tenseKey) {
      if (workingEntry.tenseKey === detectedTense) score += 180;
    }

    // 5. POS expectation
    if (expectedPOS === 'noun_adj') {
      const isNounOrAdj = workingEntry.bank === 'nounbank' || workingEntry.bank === 'adjectivebank' ||
        workingEntry.type === 'nounform' || workingEntry.type === 'plural' || workingEntry.type === 'case' ||
        workingEntry.type === 'comparative' || workingEntry.type === 'superlative' || workingEntry.type === 'adjform';
      const isVerb = workingEntry.bank === 'verbbank' || workingEntry.type === 'conjugation';
      if (isNounOrAdj) {
        score += posStrength >= 2 ? 150 : 100;
      } else if (isVerb && posStrength >= 2) {
        score -= 200;
      }
    }

    // 6. Gender agreement
    if (genderContext && workingEntry.genus === genderContext) {
      score += 120;
    }

    // 7. NB/NN number + definiteness agreement
    if ((numberContext || definitenessContext) && (workingEntry.type === 'nounform' || workingEntry.type === 'adjform')) {
      const numMatch = numberContext && workingEntry.number === numberContext;
      const defMatch = definitenessContext && workingEntry.definiteness === definitenessContext;
      const adjFlertall = workingEntry.type === 'adjform' && workingEntry.number === 'flertall' && workingEntry.definiteness == null;
      if (numMatch && (defMatch || !definitenessContext || adjFlertall)) {
        score += 130;
      } else if (numMatch || defMatch) {
        score += 60;
      } else {
        const numConflict = numberContext && workingEntry.number && workingEntry.number !== numberContext;
        const defConflict = definitenessContext && workingEntry.definiteness && workingEntry.definiteness !== definitenessContext;
        if (numConflict || defConflict) score -= 80;
      }
    }

    // 8. DE case from prepositions
    if (caseContext && workingEntry.type === 'case' && workingEntry.caseName) {
      if (caseContext === 'wechsel') {
        if (workingEntry.caseName === 'akkusativ' || workingEntry.caseName === 'dativ') {
          score += 80;
        }
      } else if (workingEntry.caseName === caseContext) {
        score += 150;
      }
    }

    // 9. Bigram frequency
    const bigramData = vocab.getBigrams();
    if (bigramData) {
      let bigramWeight = 0;
      if (previousTwoWords) {
        const pairs2 = bigramData[previousTwoWords];
        if (pairs2) bigramWeight = pairs2[workingEntry.word] || 0;
      }
      if (!bigramWeight && previousWord) {
        const pairs1 = bigramData[previousWord];
        if (pairs1) bigramWeight = pairs1[workingEntry.word] || 0;
      }
      if (bigramWeight > 0) score += bigramWeight * 60;
    }

    // 10. Frequency signal (WP-01)
    score += freqSignal(workingEntry, vocab);

    // 11. Low-frequency demotion (WP-04)
    score += lowFreqDemotion(workingEntry, vocab);

    scored.push(Object.assign({}, workingEntry, { score: score }));
  }

  // ── Main ranker ──

  /**
   * Rank vocab against a typed prefix.
   * @param {string} prefix - Current word being typed.
   * @param {object} vocab - { getWordList, getFrequency, getBigrams, phoneticNormalize, phoneticMatchScore }
   * @param {object} prefs - See module header for full shape.
   * @returns {Array<object>} Full ranked list, deduplicated by display, capped at prefs.maxResults (default 8).
   */
  function suggest(prefix, vocab, prefs) {
    if (!prefix || typeof prefix !== 'string') return [];
    if (!vocab || typeof vocab.getWordList !== 'function') return [];
    if (!prefs) return [];

    const q = prefix.toLowerCase();
    const maxResults = prefs.maxResults || 8;
    const prefixIndex = prefs.prefixIndex;
    if (!prefixIndex) return [];

    const wordList = vocab.getWordList();
    if (!wordList || wordList.length === 0) return [];

    const qPhonetic = vocab.phoneticNormalize ? vocab.phoneticNormalize(q) : q;

    const scored = [];
    const scoredIndices = new Set();

    // Bundle prefs + query for applyBoosts
    const boostPrefs = Object.assign({}, prefs, { query: q });

    if (q.length >= 2) {
      const prefix2 = q.slice(0, 2);
      const candidates = prefixIndex.get(prefix2);
      if (candidates) {
        for (const idx of candidates) {
          scoredIndices.add(idx);
          const entry = wordList[idx];
          const score = matchScore(q, entry.word);
          if (score > 0) {
            applyBoosts(entry, score, scored, boostPrefs, vocab);
          }
        }
        if (q.length >= 3) {
          const prefix3 = q.slice(0, 3);
          const candidates3 = prefixIndex.get(prefix3);
          if (candidates3) {
            for (const idx of candidates3) {
              if (scoredIndices.has(idx)) continue;
              scoredIndices.add(idx);
              const entry = wordList[idx];
              const score = matchScore(q, entry.word);
              if (score > 0) {
                applyBoosts(entry, score, scored, boostPrefs, vocab);
              }
            }
          }
        }
      }
    }

    // Phonetic/fuzzy fallback
    if (scored.length < maxResults && q.length >= 3 && vocab.phoneticMatchScore) {
      for (let i = 0; i < wordList.length; i++) {
        if (scoredIndices.has(i)) continue;
        const entry = wordList[i];
        const targetPhonetic = vocab.phoneticNormalize(entry.word);
        const score = vocab.phoneticMatchScore(qPhonetic, targetPhonetic);
        if (score > 0) {
          applyBoosts(entry, score, scored, boostPrefs, vocab);
        }
      }
    }

    // Deterministic sort (WP-03)
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const fa = getEffectiveFreq(a, vocab), fb = getEffectiveFreq(b, vocab);
      if (fa !== fb) return fb - fa;
      const la = Math.abs(a.word.length - q.length);
      const lb = Math.abs(b.word.length - q.length);
      if (la !== lb) return la - lb;
      const sa = sharedSuffixLen(q, a.word);
      const sb = sharedSuffixLen(q, b.word);
      if (sa !== sb) return sb - sa;
      return a.word.localeCompare(b.word);
    });

    // Dedup by display
    const seen = new Set();
    const results = [];
    for (const s of scored) {
      const key = (s.display || s.word).toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        results.push(s);
        if (results.length >= maxResults) break;
      }
    }

    return results;
  }

  // ── Dual-export footer (mirrors spell-check-engine.js exactly) ──

  const api = {
    suggest,
    buildPrefixIndex,
    matchScore,
    levenshtein,
    sharedSuffixLen,
    MODAL_VERBS,
    INFINITIVE_MARKERS,
    DETERMINERS_BY_LANG,
    PREPOSITIONS_BY_LANG,
    PREPOSITION_CASE,
    PRONOUN_CONTEXT_BY_LANG,
    NB_NN_AGREEMENT_CONTEXT,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof self !== 'undefined') {
    self.__lexiPredictionEngine = api;
  }
})();
