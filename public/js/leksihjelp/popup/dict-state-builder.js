/**
 * dict-state-builder.js — shared dictionary helpers (Phase 30-04 Task 4)
 *
 * Helpers consumed by both the extension popup (popup.js) and downstream
 * embedders (lockdown sidepanel host) when building the dictionary view's
 * state from raw bank-structured language data.
 *
 * Exports (via host.__lexiDictStateBuilder + module.exports):
 *  - BANK_TO_POS                    bank-name → part-of-speech mapping (raw codes)
 *  - flattenBanks(dict, opts?)      flatten banks into [{ ...entry, _wordId, _bank, partOfSpeech, genus, gender? }]
 *  - getTranslation(entry, state, uiLang)   resolve translation via linkedTo / direct / nbTranslationIndex
 *  - generatedFromRefs(entry)       parse _generatedFrom into array
 *  - NORWEGIAN_IRREGULAR_VERBS      irregular form → infinitive
 *  - norwegianInfinitive(form)      best-effort form-to-infinitive heuristic
 *
 * Why this exists:
 *  popup.js used to own these helpers; the lockdown sidepanel host inlined
 *  copies in 2.8.2 to make search work. This module is the single source of
 *  truth — both consumers import from here. Adding a new bank or a new
 *  irregular verb happens in one place.
 *
 * Loaded via:
 *  - Extension popup: popup.html includes <script src="dict-state-builder.js"> before popup.js
 *  - Lockdown: leksihjelp-loader.js LEKSI_BUNDLE injects 'leksihjelp/popup/dict-state-builder.js'
 *    BEFORE the view modules
 */
(function () {
  'use strict';

  const BANK_TO_POS = {
    verbbank: 'verb',
    nounbank: 'substantiv',
    adjectivebank: 'adjektiv',
    articlesbank: 'artikkel',
    generalbank: 'ord',
    numbersbank: 'tall',
    phrasesbank: 'frase',
    pronounsbank: 'pronomen',
    languagesbank: 'språk',
    nationalitiesbank: 'nasjonalitet',
  };

  /**
   * @param {Object} dict           raw bank-structured language dict
   * @param {Object} [opts]
   * @param {Function} [opts.genusMapper]    optional (genus) => translatedGender. If
   *                                         provided, entries get a `gender` field.
   * @param {Function} [opts.posMapper]      optional (bank) => translatedPos. If
   *                                         provided, entries' partOfSpeech is the
   *                                         translation; otherwise the raw code from
   *                                         BANK_TO_POS.
   * @returns {Array} flattened word entries
   */
  function flattenBanks(dict, opts) {
    const out = [];
    if (!dict || typeof dict !== 'object') return out;
    const genusMapper = opts && opts.genusMapper;
    const posMapper = opts && opts.posMapper;

    for (const bank of Object.keys(BANK_TO_POS)) {
      const bankData = dict[bank];
      if (!bankData || typeof bankData !== 'object') continue;
      for (const wordId in bankData) {
        if (!Object.prototype.hasOwnProperty.call(bankData, wordId)) continue;
        if (wordId.startsWith('_')) continue;
        const entry = bankData[wordId];
        if (!entry || typeof entry !== 'object') continue;
        out.push({
          ...entry,
          _wordId: wordId,
          _bank: bank,
          partOfSpeech: posMapper ? posMapper(bank) : BANK_TO_POS[bank],
          genus: entry.genus || null,
          gender: entry.genus && genusMapper ? genusMapper(entry.genus) : null,
          grammar: entry.explanation && entry.explanation._description || null,
        });
      }
    }
    return out;
  }

  function generatedFromRefs(entry) {
    const g = entry && entry._generatedFrom;
    if (!g) return [];
    if (Array.isArray(g)) return g;
    return String(g).split(',').map(s => s.trim()).filter(Boolean);
  }

  /**
   * @param {Object} entry
   * @param {Object} state    expects { noDictionary, nbTranslationIndex } (Map or null)
   * @param {string} uiLang   'nb' | 'nn' | other
   */
  function getTranslation(entry, state, uiLang) {
    if (!entry) return '';
    const ui = uiLang || 'nb';
    if (ui === 'nn' && entry.linkedTo && entry.linkedTo.nn && entry.linkedTo.nn.translation) {
      return entry.linkedTo.nn.translation;
    }
    if (ui === 'nb' && entry.linkedTo && entry.linkedTo.nb && entry.linkedTo.nb.translation) {
      return entry.linkedTo.nb.translation;
    }
    if (entry.translation) return entry.translation;
    const link = (entry.linkedTo && (entry.linkedTo[ui] || entry.linkedTo.nb || entry.linkedTo.nn)) || null;
    if (link && link.primary && state && state.noDictionary) {
      for (const bank of Object.keys(BANK_TO_POS)) {
        const resolved = state.noDictionary[bank] && state.noDictionary[bank][link.primary];
        if (resolved && resolved.word) return resolved.word;
      }
    }
    if (entry._wordId && state && state.nbTranslationIndex && state.nbTranslationIndex.size > 0) {
      const nbWord = state.nbTranslationIndex.get(entry._wordId);
      if (nbWord) return nbWord;
    }
    return '';
  }

  // Norwegian irregular verb forms → infinitive (without "å" prefix).
  const NORWEGIAN_IRREGULAR_VERBS = {
    'er': 'være', 'var': 'være', 'har': 'ha', 'hadde': 'ha',
    'kan': 'kunne', 'kunne': 'kunne', 'vil': 'ville', 'ville': 'ville',
    'skal': 'skulle', 'skulle': 'skulle', 'må': 'måtte',
    'vet': 'vite', 'visste': 'vite', 'går': 'gå', 'gikk': 'gå',
    'får': 'få', 'fikk': 'få', 'gjør': 'gjøre', 'gjorde': 'gjøre',
    'ser': 'se', 'så': 'se', 'sier': 'si', 'sa': 'si',
    'tar': 'ta', 'tok': 'ta', 'kommer': 'komme', 'kom': 'komme',
    'finner': 'finne', 'fant': 'finne', 'gir': 'gi', 'gav': 'gi',
    'ligger': 'ligge', 'lå': 'ligge', 'sitter': 'sitte', 'satt': 'sitte',
    'står': 'stå', 'stod': 'stå', 'drar': 'dra', 'dro': 'dra',
    'legger': 'legge', 'la': 'legge', 'setter': 'sette', 'satte': 'sette',
    'skriver': 'skrive', 'skrev': 'skrive', 'spiser': 'spise', 'spiste': 'spise',
    'liker': 'like', 'likte': 'like', 'bor': 'bo', 'bodde': 'bo',
    'heter': 'hete', 'het': 'hete', 'snakker': 'snakke', 'snakket': 'snakke',
    'leser': 'lese', 'leste': 'lese', 'lærer': 'lære', 'lærte': 'lære',
    'synger': 'synge', 'sang': 'synge', 'danser': 'danse', 'danset': 'danse',
    'svømmer': 'svømme', 'lager': 'lage', 'lagde': 'lage',
    'leker': 'leke', 'lekte': 'leke',
  };

  function norwegianInfinitive(form) {
    if (!form) return null;
    const lower = String(form).toLowerCase();
    if (NORWEGIAN_IRREGULAR_VERBS[lower]) return NORWEGIAN_IRREGULAR_VERBS[lower];
    // Regular heuristic: present "-er" → infinitive "-e"
    if (lower.endsWith('er') && lower.length > 3) return lower.slice(0, -1);
    return null;
  }

  /**
   * Build an inflection index keyed by inflected forms (lowercased) → entries.
   * Lifted verbatim from popup.js's buildInflectionIndex (Phase 33-01) so the
   * lockdown sidepanel can reuse it without depending on vocab-seam-core.
   */
  function buildInflectionIndex(words) {
    const index = new Map();

    function addToIndex(key, entry, matchType, matchDetail) {
      if (!key || key === (entry.word || '').toLowerCase()) return;
      if (!index.has(key)) index.set(key, []);
      index.get(key).push({ entry, matchType, matchDetail });
    }

    if (!Array.isArray(words)) return index;
    for (const entry of words) {
      // Verb conjugations
      if (entry.conjugations) {
        for (const [tenseName, tenseData] of Object.entries(entry.conjugations)) {
          if (!tenseData || !tenseData.former) continue;
          const former = tenseData.former;
          if (Array.isArray(former)) {
            for (const form of former) {
              if (form) addToIndex(form.toLowerCase(), entry, 'conjugation', tenseName);
            }
          } else if (typeof former === 'object') {
            for (const [pronoun, form] of Object.entries(former)) {
              if (!form || pronoun.startsWith('_')) continue;
              if (Array.isArray(form)) {
                for (const f of form) {
                  if (typeof f === 'string' && f) addToIndex(f.toLowerCase(), entry, 'conjugation', `${pronoun} (${tenseName})`);
                }
              } else if (typeof form === 'string') {
                addToIndex(form.toLowerCase(), entry, 'conjugation', `${pronoun} (${tenseName})`);
              }
            }
          }
        }
      }

      // Noun plurals
      if (entry._bank === 'nounbank') {
        if (entry.plural) {
          const plurals = Array.isArray(entry.plural) ? entry.plural : [entry.plural];
          for (let p of plurals) {
            if (!p || typeof p !== 'string') continue;
            if (p.startsWith('die ')) p = p.slice(4);
            addToIndex(p.toLowerCase(), entry, 'plural', null);
          }
        }
        if (entry.declension && entry.declension.flertall) {
          for (const variant of [entry.declension.flertall.ubestemt, entry.declension.flertall.bestemt]) {
            if (!variant || !variant.form) continue;
            let f = variant.form;
            if (f.startsWith('die ')) f = f.slice(4);
            addToIndex(f.toLowerCase(), entry, 'plural', null);
          }
        }
      }

      // Noun case forms (v2.0: cases.{case}.forms.{number}.{article})
      if (entry._bank === 'nounbank' && entry.cases) {
        for (const [caseName, caseData] of Object.entries(entry.cases)) {
          if (!caseData || !caseData.forms) continue;
          for (const [number, numberForms] of Object.entries(caseData.forms)) {
            if (!numberForms) continue; // plurale tantum: singular is null
            for (const [article, form] of Object.entries(numberForms)) {
              if (!form) continue;
              const fullForm = form.toLowerCase();
              addToIndex(fullForm, entry, 'case', `${caseName} ${number} ${article}`);
              const parts = form.split(' ');
              if (parts.length > 1) {
                addToIndex(parts[parts.length - 1].toLowerCase(), entry, 'case', `${caseName} ${number} ${article}`);
              }
            }
          }
        }
      }

      if (entry.typos && Array.isArray(entry.typos)) {
        for (const typo of entry.typos) {
          addToIndex(typo.toLowerCase(), entry, 'typo', null);
        }
      }

      if (entry.acceptedForms && Array.isArray(entry.acceptedForms)) {
        for (const form of entry.acceptedForms) {
          addToIndex(form.toLowerCase(), entry, 'typo', null);
        }
      }
    }

    return index;
  }

  /**
   * buildDictState({ raw, sisterRaw, lang, noLang, vocabCore })
   *
   * Pure function that builds the full dictionary view state from raw bank
   * dicts. Mirrors what popup.js's loadDictionary used to do inline (lifted
   * in Phase 33-01) so the lockdown sidepanel host can populate the same
   * state set on first paint and on language switch.
   *
   * Returns: {
   *   allWords, inflectionIndex, nounGenusMap, currentIndexes,
   *   noWords, noNounGenusMap,
   *   nbEnrichmentIndex, nbTranslationIndex, nbIdToTargetIndex
   * }
   */
  function buildDictState(opts) {
    const o = opts || {};
    const raw = o.raw || null;
    const sisterRaw = o.sisterRaw || null;
    const lang = o.lang || null;
    const noLang = o.noLang || 'nb';
    const vocabCore = o.vocabCore || null;
    const flattenOpts = {};
    if (typeof o.posMapper === 'function') flattenOpts.posMapper = o.posMapper;
    if (typeof o.genusMapper === 'function') flattenOpts.genusMapper = o.genusMapper;

    const allWords = flattenBanks(raw, flattenOpts);

    // Inflection index — prefer this module's own builder; vocabCore may
    // optionally override (none ships today, but the contract is open).
    let inflectionIndex;
    if (vocabCore && typeof vocabCore.buildInflectionIndex === 'function') {
      inflectionIndex = vocabCore.buildInflectionIndex(allWords);
    } else {
      inflectionIndex = buildInflectionIndex(allWords);
    }

    // Compound-decomposition indexes (vocab-seam-core owns these — needs lang).
    let currentIndexes = null;
    let nounGenusMap = new Map();
    if (raw && lang && vocabCore && typeof vocabCore.buildIndexes === 'function') {
      currentIndexes = vocabCore.buildIndexes({ raw, lang });
      nounGenusMap = (currentIndexes && currentIndexes.nounGenus) || new Map();
    }

    // Sister (NB/NN) dict — only when caller passes one.
    let noWords = [];
    let noNounGenusMap = new Map();
    let nbEnrichmentIndex = new Map();
    let nbTranslationIndex = new Map();
    let nbIdToTargetIndex = new Map();

    if (sisterRaw) {
      noWords = flattenBanks(sisterRaw, flattenOpts);
      if (vocabCore && typeof vocabCore.buildIndexes === 'function') {
        const noIdx = vocabCore.buildIndexes({ raw: sisterRaw, lang: noLang });
        noNounGenusMap = (noIdx && noIdx.nounGenus) || new Map();
      }

      // Walk sister bank dict to build:
      //   - nbEnrichmentIndex (linkedTo with falseFriends/senses)
      //   - nbTranslationIndex (Direction 1: NB→target via sister _generatedFrom)
      const langPrefix = `${lang}-${noLang}/`;
      const nbIdToWord = new Map();
      for (const bank of Object.keys(sisterRaw)) {
        const bankData = sisterRaw[bank];
        if (!bankData || typeof bankData !== 'object') continue;
        for (const [id, entry] of Object.entries(bankData)) {
          if (id.startsWith('_')) continue;
          if (entry && entry.word) nbIdToWord.set(id, entry.word);
          if (entry && (entry.falseFriends || entry.senses) && entry.linkedTo && entry.linkedTo[lang] && entry.linkedTo[lang].primary) {
            const linkId = entry.linkedTo[lang].primary;
            const existing = nbEnrichmentIndex.get(linkId);
            nbEnrichmentIndex.set(linkId, {
              falseFriends: [...((existing && existing.falseFriends) || []), ...((entry.falseFriends) || [])],
              senses: [...((existing && existing.senses) || []), ...((entry.senses) || [])],
            });
          }
          if (entry && entry._generatedFrom && entry.word) {
            for (const trimmed of generatedFromRefs(entry)) {
              if (trimmed.startsWith(langPrefix)) {
                const colonIdx = trimmed.indexOf(':');
                if (colonIdx !== -1) {
                  const targetId = trimmed.substring(colonIdx + 1);
                  if (!nbTranslationIndex.has(targetId)) {
                    nbTranslationIndex.set(targetId, entry.word);
                  }
                }
              }
            }
          }
        }
      }

      // Direction 2: target→NB via target _generatedFrom
      const revPrefix = `${noLang}-${lang}/`;
      if (raw) {
        for (const bank of Object.keys(raw)) {
          const bankData = raw[bank];
          if (!bankData || typeof bankData !== 'object') continue;
          for (const [id, entry] of Object.entries(bankData)) {
            if (id.startsWith('_') || !entry || !entry._generatedFrom) continue;
            for (const trimmed of generatedFromRefs(entry)) {
              if (trimmed.startsWith(revPrefix)) {
                const colonIdx = trimmed.indexOf(':');
                if (colonIdx !== -1) {
                  const nbId = trimmed.substring(colonIdx + 1);
                  const nbWord = nbIdToWord.get(nbId);
                  if (nbWord) {
                    if (!nbTranslationIndex.has(id)) nbTranslationIndex.set(id, nbWord);
                    if (!nbIdToTargetIndex.has(nbId)) nbIdToTargetIndex.set(nbId, id);
                  }
                }
              }
            }
          }
        }
      }
    }

    return {
      allWords,
      inflectionIndex,
      nounGenusMap,
      currentIndexes,
      noWords,
      noNounGenusMap,
      nbEnrichmentIndex,
      nbTranslationIndex,
      nbIdToTargetIndex,
    };
  }

  const exports = {
    BANK_TO_POS,
    NORWEGIAN_IRREGULAR_VERBS,
    flattenBanks,
    getTranslation,
    generatedFromRefs,
    norwegianInfinitive,
    buildInflectionIndex,
    buildDictState,
  };

  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiDictStateBuilder = exports;

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }
})();
