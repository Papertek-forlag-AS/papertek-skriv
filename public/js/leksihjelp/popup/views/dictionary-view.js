/**
 * Leksihjelp — Dictionary View Module (Phase 30-01)
 *
 * Mountable dictionary view: search input, lang switcher, direction toggle,
 * result rendering, "Lær mer" pedagogy popovers.
 *
 * The host (extension popup.js or lockdown sidepanel) passes a `container`
 * element (typically `<section id="view-dictionary">`) and a `deps` object
 * with explicit dependencies. The view does NOT touch chrome.* globals,
 * window.__lexi*, or document.getElementById directly — every external
 * dependency arrives via deps.
 *
 * @typedef {Object} DictionaryViewDeps
 * @property {Object} state    - shared mutable state: { currentLang, searchDirection,
 *                               dictionary, noDictionary, allWords, noWords,
 *                               inflectionIndex, nounGenusMap, noNounGenusMap,
 *                               nbEnrichmentIndex, nbTranslationIndex,
 *                               nbIdToTargetIndex, currentIndexes, compoundNavStack }
 *                               Host owns it; view reads + mutates via this handle
 *                               so language switches done in settings reflect here.
 * @property {Object} vocab    - { listCachedLanguages, getCachedLanguage,
 *                                 hasAudioCached, getAudioFile, decomposeCompound,
 *                                 BUNDLED_LANGUAGES (Set), LANG_FLAGS (Map),
 *                                 norwegianInfinitive, getTranslation,
 *                                 generatedFromRefs }
 * @property {Object} storage  - { get(key), set(obj) }
 * @property {Object} runtime  - { sendMessage, getURL }
 * @property {Function} t                  - i18n string resolver (key, vars?)
 * @property {Function} getUiLanguage      - returns 'nb' | 'nn' | 'en'
 * @property {Function} langName           - (code) => display name
 * @property {Function} isFeatureEnabled   - (featureId) => bool
 * @property {Function} getAllowedPronouns - () => Set<string> | null
 * @property {Function} loadDictionary     - async (lang) => void; reloads state
 * @property {Function} loadGrammarFeatures - async (lang) => void
 * @property {Function} initGrammarSettings - () => void; refresh grammar UI in settings
 * @property {boolean}  audioEnabled       - when false, audio buttons NOT rendered
 * @property {boolean}  [externalLinksEnabled=false] - when true, a "Slå opp på ordbokene.no" link is
 *   shown for nb/nn zero-result known-word searches. Must NOT be set in lockdown/exam contexts
 *   where students must not access external dictionaries. Defaults false (safe).
 * @property {string}   [BACKEND_URL]      - used for audio TTS endpoint
 * @property {Function} [getAllowedLanguages] - optional fn returning array of
 *   lang codes to limit which language pills are rendered. Returning null /
 *   undefined / empty array means no filter (show all). Used by lockdown to
 *   scope sidepanel pills to NB + active foreign language.
 * @property {Function} [audioPlayHandler] - optional host-supplied play function,
 *   signature `(entry, button) => void`. When provided, the audio button renders
 *   for every entry and click routes through audioPlayHandler instead of the
 *   bundled MP3 path. Used by the lockdown sidepanel (browser TTS — MP3 metadata
 *   is stripped from synced vocab JSON). Extension hosts that ship MP3 audio
 *   leave this undefined.
 * @property {boolean}  [broadcastLanguageChange=true] - when false, the view
 *   does NOT publish lang switches to the host environment (no chrome.storage
 *   write of `lastForeignLanguage`, no foreignLanguageBroadcast message). Used
 *   by the lockdown sidepanel where dictionary lang-pills are dictionary-scoped
 *   and must not switch the student's writing/spell-check language. Defaults to
 *   true; the extension popup explicitly passes false in Phase 35.1 to match
 *   lockdown's intent.
 * @property {Function} [onLanguageChanged] - optional callback `(newLang) => void`
 *   fired after a successful language switch (after state.currentLang is updated
 *   AND the dictionary is reloaded). Used by hosts to refresh language-list UI
 *   outside the view (e.g. the Settings panel's audio-cache pill).
 * @property {Function} [onFirstFLPick] - optional async callback. Invoked when
 *   the student clicks an FL pill while no studentForeignLang is set, OR when
 *   they click the `__fl_placeholder__` chip. Hosts implement the picker UI
 *   (extension popup → showLanguagePicker; lockdown → may no-op if FL is
 *   teacher-managed). The view awaits + re-renders.
 * @property {Function} [onGrammarPickerNeeded] - optional async callback
 *   `(lang) => void`. Invoked after a successful switchLanguage when
 *   grammarPresetByLang[lang] is unset and the lang isn't auto-defaulted
 *   (nb / nn / en silently apply 'all'). Hosts implement the modal; the view
 *   awaits + refreshes grammar UI.
 *
 * @returns {{ destroy(): void, refresh(query?: string): void,
 *             rebuildLangSwitcher(): void, updateLangLabels(): void }}
 */
(function () {
  'use strict';

  // Rapportflater (ønskjeord, compound-vote, «Rapporter feil») sender via
  // SEND_REPORT. Ein embed-vert kan erklære `report: false` — då skal flatene
  // ikkje RENDERAST i det heile. Å vise ein knapp som stille blir avvist er
  // verre enn ingen knapp: brukaren trykkjer, får ingen kvittering, og trur
  // meldinga vart send. Les ved KALLTID — i embed lastar dette skriptet før
  // host-runtime installerer. Sjå extension/host-capabilities.js.
  function reportChannelOpen() {
    const h = typeof self !== 'undefined' ? self : globalThis;
    return typeof h.lexiHostAllows === 'function' ? h.lexiHostAllows('report') : true;
  }

  // Bank → POS mapping (display only).
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

  // Result-card POS label resolves to an i18n key (locale-aware). generalbank
  // entries lump many word classes under "ord"; their real class lives in
  // `entry.type` (adv/conj/prep/…), so surface that precise label instead.
  const GENERAL_TYPE_TO_POSKEY = {
    adv: 'pos_adverb', conj: 'pos_conjunction', prep: 'pos_preposition',
    pron: 'pos_pronoun', num: 'pos_number', interj: 'pos_interjection',
    art: 'pos_article', det: 'pos_determiner', interr: 'pos_interrogative',
    contr: 'pos_contraction', propn: 'pos_proper_noun', adj: 'pos_adjective',
    phrase: 'pos_phrase', expr: 'pos_phrase', idiom: 'pos_phrase',
    // Bound morphemes. Ordbank tags «u-» / «mis-» PFX (nn 83687 / 49971, bm
    // 63574 / 38595); without this the label fell back to the nearest type and
    // the card claimed a word class the source contradicts. Deliberately NOT
    // routed through `adv` — the twin-dedup below keys on `adv`, and a prefix
    // has no adjective twin to collapse against.
    pref: 'pos_prefix',
  };
  const BANK_TO_POSKEY = {
    verbbank: 'pos_verb', nounbank: 'pos_noun', adjectivebank: 'pos_adjective',
    articlesbank: 'pos_article', generalbank: 'pos_general', numbersbank: 'pos_number',
    phrasesbank: 'pos_phrase', pronounsbank: 'pos_pronoun', languagesbank: 'pos_language',
    nationalitiesbank: 'pos_nationality',
  };
  function posLabelKey(entry) {
    if (entry._bank === 'generalbank' && entry.type && GENERAL_TYPE_TO_POSKEY[entry.type]) {
      return GENERAL_TYPE_TO_POSKEY[entry.type];
    }
    return BANK_TO_POSKEY[entry._bank] || null;
  }

  // §4b — drop the redundant adjective-adverb twin (nb/nn). A Norwegian
  // adjective's adverbial use is its neuter form, not a separate word; the data
  // carries a redundant generalbank adverb entry (e.g. ansvarlig_adv). When a
  // same-word adjective is present we drop that adverb so "ansvarlig" shows one
  // adjektiv card — matching ordbøkene (single adjective article). Genuine
  // homographs (til, fort noun+adj) have no adjective twin and are untouched.
  function dropAdjectiveAdverbTwins(results, isNbNn) {
    if (!isNbNn || !Array.isArray(results) || results.length < 2) return results;
    const adjWords = new Set();
    for (const r of results) {
      const e = r && r.entry;
      // Only an Ordbank-verified adjective counts as a real twin. Imported
      // pseudo-adjectives (de-nb/es-nb artifacts: gjerne, alene, senere, … which
      // are really adverbs/determiners) lack lemma_ids — don't let them drop the
      // correct adverb card.
      if (e && e._bank === 'adjectivebank' && e.word
          && e._ordbank_provenance?.lemma_ids?.length > 0) {
        adjWords.add(e.word.toLowerCase());
      }
    }
    // Same shape, one bank wider: a single word also gets thin generalbank
    // twins typed `expr` or `phrase`. «selvfølgelig» produced FIVE cards — the
    // Ordbank-verified adjective plus expr, interj and two phrase entries, none
    // of which carries an example, a paradigm or a provenance. A one-word entry
    // filed as a phrase is a generation artefact, not a sense.
    //
    // `interj` is deliberately NOT dropped: «takk!» and «klar!» are genuine
    // interjections beside the noun and the adjective, and ordbøkene files them
    // separately too. Multi-word entries are left alone for the same reason —
    // «dere selv» really is a phrase.
    const contentWords = new Set();
    for (const r of results) {
      const e = r && r.entry;
      if (e && ['adjectivebank', 'nounbank', 'verbbank'].includes(e._bank) && e.word
          && e._ordbank_provenance?.lemma_ids?.length > 0) {
        contentWords.add(e.word.toLowerCase());
      }
    }
    if (!adjWords.size && !contentWords.size) return results;
    return results.filter((r) => {
      const e = r && r.entry;
      if (!e || e._bank !== 'generalbank' || !e.word) return true;
      const w = e.word.toLowerCase();
      if (e.type === 'adv' && adjWords.has(w)) return false;
      if ((e.type === 'expr' || e.type === 'phrase') && !/\s/.test(w) && contentWords.has(w)) return false;
      return true;
    });
  }

  function mountDictionaryView(container, deps) {
    if (!container) throw new Error('mountDictionaryView: container required');
    if (!deps) throw new Error('mountDictionaryView: deps required');
    // `state` is read during mount (updateLangLabels), so omitting it
    // fails as a TypeError several frames deep instead of at the
    // boundary. Embedding hosts get this contract wrong before they get
    // it right — say so where the mistake was made.
    if (!deps.state) throw new Error('mountDictionaryView: deps.state required');

    const {
      state, vocab, storage: _storage, runtime, t,
      getUiLanguage, langName,
      isFeatureEnabled, getAllowedPronouns,
      loadDictionary, loadGrammarFeatures, initGrammarSettings,
      audioEnabled, BACKEND_URL,
      audioPlayHandler,
      openLesson,
    } = deps;

    // Local audio playback handle (per-view; not shared).
    let currentAudio = null;
    let currentAudioBlobUrl = null;

    // Per-view DOM lookups (scoped to container).
    const input = container.querySelector('#search-input');
    const clearBtn = container.querySelector('#search-clear');
    const dirNoTarget = container.querySelector('#dir-no-target');
    const dirTargetNo = container.querySelector('#dir-target-no');
    const langSwitcher = container.querySelector('#lang-switcher');
    const results = container.querySelector('#search-results');

    function escapeHtml(str) {
      // Use a fresh element. View can rely on document being present (popup
      // / sidepanel context) — this is render-time, not init-time.
      const d = container.ownerDocument.createElement('div');
      d.textContent = str == null ? '' : str;
      return d.innerHTML;
    }

    function sanitizeWarning(html) {
      return escapeHtml(html)
        .replace(/&lt;(\/?)(em|strong)&gt;/gi, '<$1$2>')
        .replace(/&lt;svg(.*?)&gt;/gi, '<svg$1>')
        .replace(/&lt;\/svg&gt;/gi, '</svg>')
        .replace(/&lt;g(.*?)&gt;/gi, '<g$1>')
        .replace(/&lt;\/g&gt;/gi, '</g>')
        .replace(/&lt;(circle|rect|line|polyline|polygon|path|text|tspan|ellipse)(.*?)&gt;/gi, '<$1$2>')
        .replace(/&lt;\/(circle|rect|line|polyline|polygon|path|text|tspan|ellipse)&gt;/gi, '</$1>')
        .replaceAll('&quot;', '"'); // restore attributes
    }

    function bankToPos(bank) {
      const keys = {
        verbbank: 'pos_verb', nounbank: 'pos_noun', adjectivebank: 'pos_adjective',
        articlesbank: 'pos_article', generalbank: 'pos_general', numbersbank: 'pos_number',
        phrasesbank: 'pos_phrase', pronounsbank: 'pos_pronoun',
      };
      return t(keys[bank] || 'pos_general');
    }

    function genusToGender(genus) {
      const keys = { m: 'gender_m', f: 'gender_f', n: 'gender_n', pl: 'gender_pl' };
      return keys[genus] ? t(keys[genus]) : genus;
    }

    // Display string for the result-card gender chip. Derived in the VIEW
    // (not the host) so every consumer gets it — the playground and lockdown
    // sidepanel don't pass a genusMapper, so entry.gender was null there and
    // the chip never rendered. Handles NB/NN dual genus ('f/m' → both labels,
    // Språkrådet likestilte) and skips non-gender values (EN 'common').
    function genderDisplay(entry) {
      if (entry.gender) return entry.gender;
      if (!entry.genus) return null;
      const keys = { m: 'gender_m', f: 'gender_f', n: 'gender_n', pl: 'gender_pl' };
      const parts = String(entry.genus).split('/').map(g => keys[g.trim()]).filter(Boolean);
      if (!parts.length) return null;
      return parts.map(k => t(k)).join('/');
    }

    function getPlayIcon() {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
    }
    function getPauseIcon() {
      return '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>';
    }

    function getTranslation(entry) {
      return vocab.getTranslation(entry, state, getUiLanguage());
    }

    function showPlaceholder() {
      results.innerHTML = `<div class="results-placeholder"><p>${t('search_placeholder_text')}</p></div>`;
      container.classList.remove('has-searched');
    }

    // Ordbank attestation source. Single-page hosts expose `isOrdbankWord`
    // backed by the seam's full validWords (state.validWords here is the
    // curated-only subset built by dict-state-builder, so it can't answer the
    // Tier-2 "is the whole compound in Ordbank?" test). Degrades to false
    // (→ Tier-3 guess) when the host provides no attestation source.
    const isOrdbankWord = vocab.isOrdbankWord || (() => false);

    function tryDecomposeQuery(query) {
      if (!vocab.classifyCompound) return null;
      const q = query.toLowerCase();
      if (state.nounGenusMap && state.nounGenusMap.size > 0) {
        const r = vocab.classifyCompound(q, state.nounGenusMap, isOrdbankWord, state.currentLang);
        if (r) return r;
      }
      if (state.noNounGenusMap && state.noNounGenusMap.size > 0) {
        const noLang = getUiLanguage() === 'nn' ? 'nn' : 'nb';
        return vocab.classifyCompound(q, state.noNounGenusMap, isOrdbankWord, noLang);
      }
      return null;
    }

    function performSearch(query) {
      // Pick up a mid-session exam-mode toggle for the NEXT lookup. The render
      // below stays synchronous on purpose — callers are input handlers.
      refreshExamMode();
      if (!query || !state.allWords || !state.allWords.length) {
        showPlaceholder();
        return;
      }

      const q = query.toLowerCase();
      const isNbNn = state.currentLang === 'nb' || state.currentLang === 'nn';
      const isMonolingual = isNbNn || getUiLanguage() === state.currentLang;
      const allWords = state.allWords;
      const noWords = state.noWords || [];
      const dictionary = state.dictionary;
      const inflectionIndex = state.inflectionIndex;

      // Phase 1: Direct matches
      const directResults = [];
      for (const entry of allWords) {
        if (isMonolingual) {
          if (entry.word && entry.word.toLowerCase().includes(q)) {
            directResults.push({ entry, inflectionHint: null });
          }
        } else if (state.searchDirection === 'no-target') {
          const trans = getTranslation(entry);
          if (trans && trans.toLowerCase().includes(q)) {
            directResults.push({ entry, inflectionHint: null });
          }
        } else {
          if (entry.word && entry.word.toLowerCase().includes(q)) {
            directResults.push({ entry, inflectionHint: null });
          }
        }
      }

      // Phase 1b: Two-way lookup via NB
      if (!isNbNn && state.searchDirection === 'no-target' && noWords.length > 0) {
        const directEntryWords = new Set(directResults.map(r => r.entry.word?.toLowerCase()));
        const langPrefix = `${state.currentLang}-nb/`;

        for (const noEntry of noWords) {
          if (!noEntry.word || !noEntry.word.toLowerCase().includes(q)) continue;

          let targetWordId = noEntry.linkedTo?.[state.currentLang]?.primary || null;

          if (!targetWordId && noEntry._generatedFrom) {
            for (const trimmed of vocab.generatedFromRefs(noEntry)) {
              if (trimmed.startsWith(langPrefix)) {
                const colonIdx = trimmed.indexOf(':');
                if (colonIdx !== -1) {
                  targetWordId = trimmed.substring(colonIdx + 1);
                  break;
                }
              }
            }
          }

          if (!targetWordId && noEntry._wordId && state.nbIdToTargetIndex && state.nbIdToTargetIndex.size > 0) {
            targetWordId = state.nbIdToTargetIndex.get(noEntry._wordId);
          }

          if (!targetWordId) continue;

          for (const bank of Object.keys(BANK_TO_POS)) {
            const targetEntry = dictionary?.[bank]?.[targetWordId];
            if (targetEntry && !directEntryWords.has(targetEntry.word?.toLowerCase())) {
              const flatEntry = allWords.find(w => w.word === targetEntry.word);
              if (flatEntry) {
                directResults.push({
                  entry: flatEntry,
                  inflectionHint: `«${noEntry.word}» → ${flatEntry.word}`,
                });
                directEntryWords.add(flatEntry.word?.toLowerCase());
              }
            }
          }
        }
      }

      // Phase 1c: Collapse duplicate articles. The papertek b2-expansion
      // (2026-04-28) minted English-concept-key entries (responsibility_noun,
      // conflict_noun, …) as parallel nodes beside the native ones (ansvar_noun,
      // konflikt_noun), so one lemma surfaced as two identical cards. We merge
      // direct results that share word + part-of-speech + an Ordbank lemma_id —
      // every such collision in the content banks is verifiably the SAME lemma
      // (e.g. ansvar_noun/responsibility_noun both lemma_id 2232). Keeping the
      // lemma_id in the key leaves genuine homonyms (FL "Bank" = bench/bank,
      // different lemmas) and POS-homographs (den adv/art/pron) as separate
      // articles. The kept representative is the richest Ordbank-verified entry,
      // which is the native-id one (more populated fields than the import).
      if (directResults.length > 1) {
        const articleKey = (e, idx) => {
          const w = (e.word || '').toLowerCase();
          const pos = e.partOfSpeech || e._bank || '';
          const lemmaIds = (e._ordbank_provenance && Array.isArray(e._ordbank_provenance.lemma_ids))
            ? e._ordbank_provenance.lemma_ids : [];
          // Closed-class generalbank entries carry no Ordbank lemma_id, so the
          // `@idx` fallback below never merged them — and the source data splits
          // them by the gender of the noun they modify: hans_hankjønn_pron,
          // hans_hunkjønn_pron, hans_pron. Norwegian «hans» does not inflect for
          // that; there is exactly one «hans». The suffix is an artefact of how
          // the bank was generated, not a lexical distinction, so a student
          // searching «hans» met three identical cards — Språkrådet's «TWO
          // articles» finding on «bred», in a different bank.
          //
          // Merge them on word + part-of-speech. Genuine homographs here differ
          // in POS (den art / den pron / den adv) and the POS is already in the
          // key, so they stay apart. Entries in the CONTENT banks keep the
          // unique-key behaviour: there a missing lemma_id means unverified, and
          // two unverified same-word entries may well be different lemmas.
          const isClosedClass = (e._bank || '') === 'generalbank';
          const lemmaPart = lemmaIds.length ? [...lemmaIds].sort().join(',')
            : (isClosedClass ? 'closed-class' : `@${idx}`);
          return `${w}~|~${pos}~|~${lemmaPart}`;
        };
        const articleScore = (e) => {
          const verified = (e._ordbank_provenance && (e._ordbank_provenance.lemma_ids || []).length) ? 1000 : 0;
          // Prefer curated translation-bank lineage (de-nb/…, es-nb/…) over raw
          // vocabulary-expansion imports, so the kept card is the native one
          // where distinguishable. Does NOT pre-commit the deferred concept-key
          // graph-consolidation decision — it only picks which article displays.
          const gf = e._generatedFrom;
          const curated = ((typeof gf === 'string' && gf.includes('/'))
            || (Array.isArray(gf) && gf.some(s => typeof s === 'string' && s.includes('/')))) ? 100 : 0;
          const examples = Array.isArray(e.examples) ? e.examples.length : 0;
          return verified + curated + examples * 10 + Object.keys(e).length;
        };
        const repByKey = new Map();
        const keyOrder = [];
        directResults.forEach((r, idx) => {
          const key = articleKey(r.entry, idx);
          const prev = repByKey.get(key);
          if (!prev) { repByKey.set(key, r); keyOrder.push(key); return; }
          const sCur = articleScore(r.entry);
          const sPrev = articleScore(prev.entry);
          if (sCur > sPrev || (sCur === sPrev && (r.entry._wordId || '') < (prev.entry._wordId || ''))) {
            repByKey.set(key, r);
          }
        });
        if (repByKey.size < directResults.length) {
          directResults.length = 0;
          for (const key of keyOrder) directResults.push(repByKey.get(key));
        }
      }

      // Phase 1d: drop redundant adjective-adverb twins (nb/nn). See
      // dropAdjectiveAdverbTwins — "ansvarlig" (adj) + "ansvarlig" (generalbank
      // adverb) collapses to the one adjektiv card, matching ordbøkene. Mutates
      // directResults in place to match the Phase-1c style (directResults is const).
      if (isNbNn) {
        const filtered = dropAdjectiveAdverbTwins(directResults, isNbNn);
        if (filtered.length !== directResults.length) {
          directResults.length = 0;
          directResults.push(...filtered);
        }
      }

      // Phase 2: Inflection
      const inflectionResults = [];
      const directEntrySet = new Set(directResults.map(r => r.entry));
      // Dedup guard: same entry can match multiple inflection paths (e.g.
      // "Kinder" hits nominativ/akkusativ/genitiv plural — all the same "Kind"
      // entry). Keep the first (highest-priority) match only.
      const inflectionEntrySet = new Set();

      function addInflectionResult(entry, hint, matchType) {
        if (directEntrySet.has(entry) || inflectionEntrySet.has(entry)) return;
        inflectionEntrySet.add(entry);
        // A skrivemåte is an equal spelling, not an inflection — no grunnform
        // "Les mer" lesson applies (that button targets ordbokens_grunnform).
        inflectionResults.push({ entry, inflectionHint: hint, noGrunnform: matchType === 'skrivemaate' });
      }

      function inflectionHintFor(matchType, query, word, entry) {
        if (matchType === 'conjugation') return t('result_inflection_conjugation', { query, word });
        if (matchType === 'typo')        return t('result_inflection_typo', { query, word });
        if (matchType === 'case')        return t('result_inflection_form', { query, word });
        if (matchType === 'skrivemaate') {
          // Språkrådet §15-4: likestilte former have NO reference form, so a
          // hint reading "«graut» er en likestilt skrivemåte AV «grøt»" states
          // the opposite of the rule — it makes grøt the original and graut the
          // variant. The headline already prints "grøt / graut" and the expanded
          // article prints the neutral both-columns bøyingstabell, so the hint
          // adds nothing except that ranking. Drop it, and searching either form
          // renders identically — which is the whole claim we make to Språkrådet.
          //
          // Only when the article actually shows the equal forms, though: an
          // entry without likestilteFormer has no other way to explain why a
          // search for X surfaced Y, so it keeps the hint.
          const showsEqualForms = Array.isArray(entry && entry.likestilteFormer)
            && entry.likestilteFormer.length > 1;
          return showsEqualForms ? null : t('result_inflection_skrivemaate', { query, word });
        }
        // An inflected form of a likestilt variant spelling (veg = imperative of
        // vege/veie) is a bøyd form, not a skrivemåte — generic inflection hint.
        if (matchType === 'skrivemaate-form') return t('result_inflection_form', { query, word });
        return t('result_inflection_plural', { query, word });
      }

      // FL inflection index (DE/ES/FR/EN forms → FL base entry).
      if (inflectionIndex) {
        for (const match of inflectionIndex.get(q) || []) {
          addInflectionResult(match.entry, inflectionHintFor(match.matchType, query, match.entry.word, match.entry), match.matchType);
        }
      }

      // NB sister inflection index: resolves NB inflected forms typed while the
      // dictionary is in NB→FL mode. "barnet" → barn (NB) → Kind (DE).
      const noInflectionIndex = state.noInflectionIndex;
      if (!isNbNn && state.searchDirection === 'no-target' && noInflectionIndex && state.nbIdToTargetIndex) {
        for (const noMatch of noInflectionIndex.get(q) || []) {
          const flWordId = state.nbIdToTargetIndex.get(noMatch.entry._wordId);
          if (!flWordId) continue;
          const flEntry = allWords.find(e => e._wordId === flWordId);
          if (!flEntry) continue;
          addInflectionResult(flEntry, inflectionHintFor(noMatch.matchType, query, noMatch.entry.word, noMatch.entry), noMatch.matchType);
        }
      }

      if (!isNbNn && state.searchDirection !== 'target-no') {
        const infinitive = vocab.norwegianInfinitive(q);
        if (infinitive) {
          for (const entry of allWords) {
            if (directEntrySet.has(entry) || inflectionEntrySet.has(entry)) continue;
            const entryTrans = getTranslation(entry);
            if (!entryTrans) continue;
            const trans = entryTrans.toLowerCase();
            const stripped = trans.startsWith('å ') ? trans.slice(2) : trans;
            if (stripped === infinitive || stripped.startsWith(infinitive + ' ')
                || stripped.startsWith(infinitive + ',') || stripped.includes(', ' + infinitive)) {
              addInflectionResult(entry, t('result_inflection_conjugation', { query, word: infinitive }));
            }
          }
        }
      }

      // Phase 3: Sort
      const useWord = isMonolingual || state.searchDirection === 'target-no';
      directResults.sort((a, b) => {
        const fieldA = useWord ? a.entry.word : getTranslation(a.entry);
        const fieldB = useWord ? b.entry.word : getTranslation(b.entry);
        const la = (fieldA || '').toLowerCase();
        const lb = (fieldB || '').toLowerCase();
        if (la === q && lb !== q) return -1;
        if (lb === q && la !== q) return 1;
        if (la.startsWith(q) && !lb.startsWith(q)) return -1;
        if (lb.startsWith(q) && !la.startsWith(q)) return 1;
        return la.localeCompare(lb);
      });

      // Eit treff MIDT inne i eit morfem er ikkje eit oppslag. Søket «øl» gav
      // 54 nynorske treff — pølse, sjølv, bølge, kjøleskap, nøle, sølibat — der
      // dei to som handlar om øl låg øvst og dei 52 andre var reint støy.
      //
      // Vi har ikkje morfemgrenser i data (`_compound` er ein boolean og
      // dekkjer 104 av 7448 oppslag), så ORDGRENSA er det næraste vi kjem: eit
      // delstrengstreff tel når det byrjar eller sluttar mot noko som ikkje er
      // ein bokstav. «lettøl» og «bykart» held; «pølse» og «melkekartong» fell.
      //
      // Ordgrense, ikkje strengstart — målt fram, ikkje resonnert. Ein regel på
      // `startsWith` kasta «å sole seg» ut av eit søk på «sol», av di
      // verboppslag lagrar infinitivsmerket i oppslagsordet. Same grunn held
      // «spise frokost» inne for «ost».
      const LETTERISH = /[\p{L}\p{N}]/u;
      function boundaryAnchored(field, needle) {
        let i = field.indexOf(needle);
        while (i !== -1) {
          const before = i > 0 ? field[i - 1] : '';
          const after = (i + needle.length) < field.length ? field[i + needle.length] : '';
          if (!LETTERISH.test(before) || !LETTERISH.test(after)) return true;
          i = field.indexOf(needle, i + 1);
        }
        return false;
      }

      const directExact = [];
      const directPrefixOnly = [];
      const directContains = [];
      for (const r of directResults) {
        const field = ((useWord ? r.entry.word : getTranslation(r.entry)) || '').toLowerCase();
        if (field === q) directExact.push(r);
        else if (field.startsWith(q)) directPrefixOnly.push(r);
        else if (boundaryAnchored(field, q)) directContains.push(r);
      }

      // A verb form is never an adverb (nb/nn). Searching «hadde» in nynorsk gave
      // two cards: «hadde · adverb» on top, and below it the correct «ha —
      // «hadde» er ei bøying». The adverb entry is a translation-bank artefact —
      // `_generatedFrom: de-nb/generalbank.json:hatte_hat_gehabt_general` — and
      // its own explanation asserts the error in words: «Nynorsk adverb: hadde,
      // har hatt». Six such entries exist (nb/nn × hadde, føler, setter/set),
      // every one of them an inflected form whose verb lemma is already in the
      // bank with that exact form.
      //
      // Dropped in the MONOLINGUAL view only, and only when the inflection
      // lookup has already produced the verb: the entry still carries the
      // linkedTo graph the German, Spanish and French dictionaries use to reach
      // «hadde» from «hatte», so the data stays put. The condition is the verb
      // specifically — «best» is also an inflected form (of «god»), but of an
      // ADJECTIVE, and its adverb card is a real one.
      //
      // Scoped to the TENSE-TRIPLE entries specifically — ids of the shape
      // `<presens>_har_<partisipp>_adv`, which is how the translation banks name
      // a verb-tense helper. A broader rule was measured and rejected: «an adv
      // entry whose word is a verb form» matches 31 entries, and most are real
      // adverbs that merely collide with one — «før» is the present of «fø»,
      // «så» the past of «se», «vel» a form of «velje», «slik» of «slikje».
      // Dropping those would be a worse error than the one being fixed.
      if (isNbNn) {
        const isTenseTriple = (e) => e && e._bank === 'generalbank' && e.type === 'adv'
          && /_har_.*_adv$/.test(e._wordId || '') && (e.word || '').toLowerCase() === q;
        if (directResults.some((r) => isTenseTriple(r.entry))) {
          const kept = directResults.filter((r) => !isTenseTriple(r.entry));
          if (kept.length !== directResults.length) {
            directResults.length = 0;
            directResults.push(...kept);
            directExact.length = 0; directPrefixOnly.length = 0; directContains.length = 0;
            for (const r of directResults) {
              const field = ((useWord ? r.entry.word : getTranslation(r.entry)) || '').toLowerCase();
              if (field === q) directExact.push(r);
              else if (field.startsWith(q)) directPrefixOnly.push(r);
              else if (boundaryAnchored(field, q)) directContains.push(r);
            }
          }
        }
      }

      // A bøygd form belongs to ONE article, but the reader looked up a WORD.
      // Nynorsk «øl» is two articles — «ølet» is the drink (neuter) and «ølen»
      // the serving (masculine) — and resolving «ølen» to the masculine alone
      // is precise and unhelpful: it hides the distinction from exactly the
      // pupil who just used the wrong one. A paper dictionary answers a lookup
      // with every article for that headword, numbered; so do we.
      //
      // Only siblings of an INFLECTION hit are added. A direct hit already
      // lists every article (they share the spelling, so they all match), and
      // Phase 1c has collapsed the ones that are the same article twice.
      for (const r of [...inflectionResults]) {
        const head = (r.entry.word || '').toLowerCase();
        if (!head) continue;
        for (const other of allWords) {
          if (other === r.entry) continue;
          if ((other.word || '').toLowerCase() !== head) continue;
          if (directEntrySet.has(other) || inflectionEntrySet.has(other)) continue;
          inflectionEntrySet.add(other);
          // No hint: the searched form is NOT this article's, so «"ølen" er en
          // bøyd form av "øl"» would be a false claim about it. The card's own
          // gender and definition are what tell the two apart.
          inflectionResults.push({ entry: other, inflectionHint: null, noGrunnform: true });
        }
      }

      inflectionResults.sort((a, b) => (a.entry.word || '').localeCompare(b.entry.word || ''));

      // Inflection hits beat prefix-only matches when the query isn't a word
      // itself — e.g. "barnet" (definite of "barn") should show "barn" before
      // "barnetog" (a compound that merely starts with "barnet").
      const combined = directExact.length > 0
        ? [...directExact, ...inflectionResults, ...directPrefixOnly, ...directContains]
        : [...inflectionResults, ...directExact, ...directPrefixOnly, ...directContains];

      // Compound decomposition
      if (combined.length === 0) {
        const decomp = tryDecomposeQuery(q);
        if (decomp) {
          renderCompoundCard(q, decomp);
          return;
        }
      }

      // Cross-standard fallback (nb/nn only): the query may be a word from the
      // OTHER written standard. Resolve it to the chosen standard's form via the
      // bundled bidirectional map, or — if unmapped but a real other-standard
      // word — offer the switch hint only.
      //
      // Gated on NO real current-standard resolution — i.e. no exact headword
      // (directExact) AND no inflection/skrivemåte match (inflectionResults).
      // NOT combined.length === 0: prefix/contains matches are junk that must
      // NOT suppress the hint (searching the exact Nynorsk word "gjere" in
      // Bokmål surfaced "regjere"; "kva" surfaced every "kva…" word). But a
      // skrivemåte match IS a real resolution and MUST win: "graut" is a
      // likestilt skrivemåte of "grøt" in Bokmål, so it should show grøt — not
      // bounce to a cross-standard hint (and, since "graut" is in both standards'
      // accept-lists, loop nb→nn→nb). directExact stays > 0 for a genuine
      // same-spelling word (e.g. "hus"), which also bypasses the hint.
      if (directExact.length === 0 && inflectionResults.length === 0 && isNbNn && state.crossStandardMap) {
        const other = state.currentLang === 'nb' ? 'nn' : 'nb';
        const dir = state.currentLang === 'nb' ? state.crossStandardMap.nn_nb : state.crossStandardMap.nb_nn;
        const mappedWord = dir && dir[q];
        if (mappedWord) {
          const xResults = [];
          for (const entry of allWords) {
            if ((entry.word || '').toLowerCase() === mappedWord) {
              xResults.push({ entry, crossStandard: { query, originStandard: other } });
            }
          }
          if (xResults.length) {
            renderResults(xResults.slice(0, 10), { crossStandard: { query, originStandard: other } });
            return;
          }
        }
        // Unmapped: if the query is DISTINCTIVELY an other-standard word, show
        // the switch hint only. "Distinctively" = in the other standard's
        // accept-list but NOT the current standard's — otherwise a word valid
        // in both (e.g. "graut", an entry in neither) makes each standard claim
        // it belongs to the other and the user loops nb→nn→nb forever. When the
        // current-standard list is unavailable (older host), fall back to the
        // other-standard-only check so behaviour degrades, not breaks.
        const otherHas = state.otherStandardValidWords && state.otherStandardValidWords.has(q);
        const currentHas = state.currentStandardValidWords && state.currentStandardValidWords.has(q);
        if (otherHas && !currentHas) {
          renderCrossStandardSwitchOnly(query, other);
          return;
        }
      }

      // Fallback opposite direction
      if (combined.length === 0 && !isMonolingual) {
        const fallbackResults = [];
        if (state.searchDirection === 'no-target') {
          for (const entry of allWords) {
            if (entry.word && entry.word.toLowerCase().includes(q)) {
              fallbackResults.push({ entry, inflectionHint: null });
            }
          }
          if (inflectionIndex) {
            const fallbackSet = new Set(fallbackResults.map(r => r.entry));
            const matches = inflectionIndex.get(q) || [];
            for (const match of matches) {
              if (fallbackSet.has(match.entry)) continue;
              const hint = match.matchType === 'conjugation'
                ? t('result_inflection_conjugation', { query, word: match.entry.word })
                : t('result_inflection_plural', { query, word: match.entry.word });
              fallbackResults.push({ entry: match.entry, inflectionHint: hint });
            }
          }
        } else {
          for (const entry of allWords) {
            const trans = getTranslation(entry);
            if (trans && trans.toLowerCase().includes(q)) {
              fallbackResults.push({ entry, inflectionHint: null });
            }
          }
        }

        if (fallbackResults.length > 0) {
          const fbUseWord = state.searchDirection === 'no-target';
          fallbackResults.sort((a, b) => {
            const fieldA = ((fbUseWord ? a.entry.word : getTranslation(a.entry)) || '').toLowerCase();
            const fieldB = ((fbUseWord ? b.entry.word : getTranslation(b.entry)) || '').toLowerCase();
            if (fieldA.startsWith(q) && !fieldB.startsWith(q)) return -1;
            if (fieldB.startsWith(q) && !fieldA.startsWith(q)) return 1;
            return fieldA.localeCompare(fieldB);
          });
          const noLang = getUiLanguage() === 'nn' ? 'nn' : 'nb';
          const searchLang = state.searchDirection === 'no-target' ? langName(noLang) : langName(state.currentLang);
          const resultLang = state.searchDirection === 'no-target' ? langName(state.currentLang) : langName(noLang);
          renderResults(fallbackResults.slice(0, 50), { fallbackHint: true, searchLang, resultLang });
          return;
        }
      }

      // Compound prediction
      if (combined.length === 0 && state.currentIndexes && state.currentIndexes.predictCompound) {
        const predictions = state.currentIndexes.predictCompound(q);
        if (predictions.length > 0) {
          renderCompoundSuggestions(query, predictions);
          return;
        }
      }

      // Known Ordbank compound WITHOUT a curated entry (Tier-2). When the exact
      // query is an attested compound (e.g. "husdør") that has no dictionary
      // headword of its own — directExact is empty — surface the rich compound
      // card (validated inflection as fact) instead of burying it in the
      // substring results list. classifyCompound only returns tier 2 for a full
      // Ordbank word, so partial/prefix queries fall through to the list.
      if (directExact.length === 0) {
        const known = tryDecomposeQuery(q);
        if (known && known.tier === 2) {
          renderCompoundCard(q, known);
          return;
        }
      }

      renderResults(combined.slice(0, 50));
    }

    function renderCompoundSuggestions(query, predictions) {
      const heading = `<div class="compound-suggestions-heading">${t('compound_suggestions_heading')}</div>`;

      const cards = predictions.map(pred => {
        const { parts, gender } = pred.decomposition;
        const breakdownParts = [];
        for (const part of parts) {
          breakdownParts.push(escapeHtml(part.word));
          if (part.linker) breakdownParts.push(escapeHtml(part.linker));
        }
        const breakdownHtml = breakdownParts.map(p =>
          `<span class="compound-breakdown-part">${p}</span>`
        ).join('<span class="compound-breakdown-sep"> + </span>');

        const genderBadge = gender
          ? `<span class="result-gender">${genusToGender(gender)}</span>`
          : '';

        return `
          <div class="result-card compound-suggestion glass" data-compound-word="${escapeHtml(pred.word)}">
            <div class="result-basic">
              <div class="result-word-row">
                <span class="result-word">${escapeHtml(pred.word)}</span>
              </div>
              <div class="result-meta">
                <span class="compound-badge">${t('compound_label')}</span>
                <span class="result-pos">${t('pos_noun')}</span>
                ${genderBadge}
              </div>
            </div>
            <div class="compound-breakdown compound-breakdown-compact">${breakdownHtml}</div>
          </div>
        `;
      }).join('');

      results.innerHTML = heading + cards;

      results.querySelectorAll('.compound-suggestion').forEach(card => {
        card.addEventListener('click', () => {
          const word = card.dataset.compoundWord;
          if (input) input.value = word;
          performSearch(word);
        });
      });
    }

    function getComponentTranslation(word) {
      const lw = word.toLowerCase();
      for (const entry of state.allWords) {
        if (entry.word && entry.word.toLowerCase() === lw) {
          const trans = getTranslation(entry);
          if (trans) return trans;
        }
      }
      return null;
    }

    // ── Likestilte skrivemåter INSIDE a compound (Språkrådet §15-4) ─────────
    //
    // Compounds are a productive, unbounded surface: the norm allows `bjørk`
    // and `bjerk` equally, so it allows `bjørketre` and `bjerketre` equally,
    // and a school dictionary that answers only the spelling the student
    // happened to type is giving partial information about the norm — the
    // same failure the article head had before variantformer shipped, on a
    // surface no word list can enumerate.
    //
    // Every allowed spelling of an element, headword included, in the order
    // the entry lists them. A part that is an inflected form (or has no
    // variants) contributes only itself.
    // Matched on ANY of the entry's spellings, not just the headword: the entry
    // for `bjørk` is where `bjerk` is written down, so looking up only headwords
    // would expand `bjørketre` into both spellings and leave `bjerketre` alone
    // with itself — the same asymmetry, mirrored.
    function elementSpellings(word) {
      const w = (word || '').toLowerCase();
      if (!w) return [];
      for (const e of state.allWords) {
        if (!Array.isArray(e.likestilteFormer) || e.likestilteFormer.length < 2) continue;
        const out = [];
        let hit = false;
        for (const f of e.likestilteFormer) {
          const s = f && typeof f.spelling === 'string' ? f.spelling.toLowerCase() : '';
          if (!s) continue;
          if (s === w) hit = true;
          if (!out.includes(s)) out.push(s);
        }
        if (hit && out.length > 1) return out;
      }
      return [w];
    }

    // The compound's allowed prefixes — every combination of the non-final
    // elements' spellings, each followed by its linker. The typed prefix comes
    // first so the student sees their own spelling where they expect it; all of
    // them render in identical spans, so first is not favoured.
    //
    // Guarded on the parts re-joining to exactly the query: the elision and
    // consonant-doubling strategies restore or drop letters (natt + time =
    // «nattime»), so for those a substitution would print a word nobody may
    // write. Those keep the single typed spelling.
    const MAX_COMPOUND_VARIANTS = 6;
    function compoundPrefixVariants(query, parts) {
      const q = (query || '').toLowerCase();
      if (!Array.isArray(parts) || parts.length < 2) return null;
      const joined = parts.map((p) => (p.word || '') + (p.linker || '')).join('').toLowerCase();
      if (joined !== q) return null;
      let combos = [''];
      for (const part of parts.slice(0, -1)) {
        const spellings = elementSpellings(part.word);
        const next = [];
        for (const sofar of combos) {
          for (const s of spellings) next.push(sofar + s + (part.linker || ''));
        }
        combos = next;
        if (combos.length > MAX_COMPOUND_VARIANTS) return null;
      }
      const typed = q.slice(0, q.length - String(parts[parts.length - 1].word || '').length);
      const ordered = [typed, ...combos.filter((c) => c !== typed)];
      return [...new Set(ordered.filter((c) => c !== null && c !== undefined))];
    }

    // Every allowed spelling of the whole compound, typed one first. Each
    // element varies independently — that is what the norm says — so this is
    // the product over all of them, final element included.
    function compoundHeadSpellings(query, parts) {
      const q = (query || '').toLowerCase();
      const prefixes = compoundPrefixVariants(query, parts);
      if (!prefixes) return [query];
      const lasts = elementSpellings(parts[parts.length - 1].word);
      const all = [];
      for (const p of prefixes) for (const l of lasts) all.push(p + l);
      if (all.length < 2 || all.length > MAX_COMPOUND_VARIANTS) return [query];
      const ordered = [q, ...all.filter((w) => w !== q)];
      return [...new Set(ordered)];
    }

    // The noun entry a compound's last element belongs to, found by any of its
    // allowed spellings. `sykkelveg` must reach `vei`'s paradigm the same way
    // `sykkelvei` does, or the variant gets a card with no inflection at all.
    function findNounEntryForSpelling(word) {
      const w = (word || '').toLowerCase();
      if (!w) return null;
      let variantHit = null;
      for (const e of state.allWords) {
        if (!e.forms || !(e.forms.ubestemt || e.forms.bestemt)) continue;
        if (e.word && e.word.toLowerCase() === w) return e;
        if (!variantHit && Array.isArray(e.likestilteFormer)) {
          for (const f of e.likestilteFormer) {
            if (f && typeof f.spelling === 'string' && f.spelling.toLowerCase() === w) { variantHit = e; break; }
          }
        }
      }
      return variantHit;
    }

    // Qualified-guess declension for a compound: a compound inflects like its
    // last element, so we apply the compound's prefix to each of the last
    // element's stored forms (apekatt → katt's forms 'katt/kattar/katten/
    // kattane' prefixed with 'ape' → apekatt/apekattar/apekatten/apekattane).
    // Only for nb/nn nouns whose last element has ubestemt/bestemt forms;
    // never asserted as canonical — clearly labelled as a qualified guess.
    function renderCompoundDeclensionGuess(query, lastComponentWord, parts) {
      if (!lastComponentWord) return '';
      const q = (query || '').toLowerCase();
      const last = lastComponentWord.toLowerCase();
      if (!q.endsWith(last) || q.length <= last.length) return '';
      // Every allowed prefix, not just the typed one: a table that inflects
      // «bjørketre» while the head also offers «bjerketre» would show one
      // spelling with a paradigm and the other without.
      const prefixes = compoundPrefixVariants(query, parts) || [q.slice(0, q.length - last.length)];
      // find the last element's noun entry with ubestemt/bestemt forms
      const entry = findNounEntryForSpelling(last);
      if (!entry) return '';
      // apply every prefix to a stored form value (string or likestilte array)
      const pre = (v) => {
        if (v == null || v === '-') return v;
        const arr = Array.isArray(v) ? v : [v];
        const out = [];
        for (const x of arr) {
          if (typeof x !== 'string' || !x || x === '-' || x.includes(' ')) continue;
          for (const prefix of prefixes) {
            const form = prefix + x.toLowerCase();
            if (!out.includes(form)) out.push(form);
          }
        }
        return out.length ? out : null;
      };
      // Read the SAME merged cells the BØYNING table reads. Using only the flat
      // forms.{ubestemt,bestemt} left this table almost empty for exactly the
      // nouns where the norm offers a choice: «bok» keeps bestemt = {} and puts
      // boka/boken, boker/bøker, bokene/bøkene in forms.paradigms[], so
      // «bjørkebok» rendered one filled cell and three blanks. A blank cell reads
      // as "this form does not exist", which is the opposite of the complete and
      // neutral disclosure § 15-4 asks for — and it failed precisely on the
      // optional forms, the ones the rule is about.
      const cell = (v) => v ? escapeHtml(fmtForm(v)) : '';
      const merged = (kind, num) => pre(collectNounCellFormsAllSpellings(entry, kind, num));
      const ubE = cell(merged('ubestemt', 'entall')), ubF = cell(merged('ubestemt', 'flertall'));
      const beE = cell(merged('bestemt', 'entall')), beF = cell(merged('bestemt', 'flertall'));
      if (!ubE && !ubF && !beE && !beF) return '';
      const label = t('compound_declension_guess', { lastComponent: escapeHtml(lastComponentWord) });
      return `
        <div class="compound-declension-guess">
          <span class="compound-guess-label">${label}:</span>
          <table class="conjugation-table declension-table">
            <thead>
              <tr><th></th><th>${t('decl_singular')}</th><th>${t('decl_plural')}</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>${t('decl_indefinite')}</strong></td><td>${ubE}</td><td>${ubF}</td></tr>
              <tr><td><strong>${t('decl_definite')}</strong></td><td>${beE}</td><td>${beF}</td></tr>
            </tbody>
          </table>
        </div>
      `;
    }

    // Returns { html, validated }. validated=true only when every derived
    // compound form is attested in Ordbank. Attestation comes from the same
    // injected `isOrdbankWord` predicate that drives the Tier-2/Tier-3 split —
    // state.validWords is the curated-only subset and can't attest bundled
    // Ordbank forms (e.g. husdør/husdører), so validating against it would
    // demote a genuine Tier-2 compound back to the "kvalifisert gjetning" table.
    function renderCompoundDeclensionKnown(query, lastComponentWord, parts) {
      const q = (query || '').toLowerCase();
      const last = (lastComponentWord || '').toLowerCase();
      if (!last || !q.endsWith(last) || q.length <= last.length) return { html: '', validated: false };
      const prefix = q.slice(0, q.length - last.length);
      // Attestation is judged on the spelling the student typed — that is what
      // decides "known compound" vs "qualified guess", and it must not change
      // just because an equally allowed variant is not in Ordbank's full-form
      // list. The variant prefixes ride along in the rendered cells: the norm is
      // fixed at lemma level, so if `bjørketreet` is a form then so is
      // `bjerketreet` (the interpretation recorded for Språkrådet).
      const prefixes = compoundPrefixVariants(query, parts) || [prefix];
      const entry = findNounEntryForSpelling(last);
      if (!entry) return { html: '', validated: false };
      // Attestation: the headword's own forms under the typed prefix, exactly
      // as before this function learned about variants. Nothing a variant does
      // may promote or demote the tier.
      let allAttested = true;
      const ub = entry.forms.ubestemt || {}, be = entry.forms.bestemt || {};
      for (const block of [ub, be]) {
        for (const v of [block.entall, block.flertall]) {
          for (const x of (Array.isArray(v) ? v : [v])) {
            if (typeof x !== 'string' || !x || x === '-' || x.includes(' ')) continue;
            if (!isOrdbankWord(prefix + x.toLowerCase())) allAttested = false;
          }
        }
      }
      const pre = (arr) => {
        const out = [];
        for (const x of (arr || [])) {
          if (typeof x !== 'string' || !x || x === '-' || x.includes(' ')) continue;
          for (const pfx of prefixes) {
            const form = pfx + x.toLowerCase();
            if (!out.includes(form)) out.push(form);
          }
        }
        return out.length ? out : null;
      };
      const cell = (v) => v ? escapeHtml(fmtForm(v)) : '';
      const all = (kind, num) => pre(collectNounCellFormsAllSpellings(entry, kind, num));
      const ubE = cell(all('ubestemt', 'entall')), ubF = cell(all('ubestemt', 'flertall'));
      const beE = cell(all('bestemt', 'entall')), beF = cell(all('bestemt', 'flertall'));
      if (!allAttested || (!ubE && !ubF && !beE && !beF)) return { html: '', validated: false };
      const label = t('compound_declension_known', { lastComponent: escapeHtml(lastComponentWord) });
      const html = `
        <div class="compound-declension-known">
          <span class="compound-known-label">${label}:</span>
          <table class="conjugation-table declension-table">
            <thead><tr><th></th><th>${t('decl_singular')}</th><th>${t('decl_plural')}</th></tr></thead>
            <tbody>
              <tr><td><strong>${t('decl_indefinite')}</strong></td><td>${ubE}</td><td>${ubF}</td></tr>
              <tr><td><strong>${t('decl_definite')}</strong></td><td>${beE}</td><td>${beF}</td></tr>
            </tbody>
          </table>
        </div>`;
      return { html, validated: true };
    }

    // Navigate straight to a word's dictionary entry (oppslagsord), not a
    // substring search. When a student clicks the "dør" part of "husdør" they
    // want the entry for dør — not a list of everything containing "dør"
    // (dør, dø, dørhåndtak, …). Renders the exact-match card(s) directly; falls
    // back to a normal search only when the word has no headword of its own.
    function showWordEntry(word) {
      const w = (word || '').toLowerCase();
      if (input) input.value = word;
      const exact = (w && Array.isArray(state.allWords))
        ? state.allWords.filter((e) => e.word && e.word.toLowerCase() === w)
        : [];
      if (exact.length) {
        renderResults(exact.map((entry) => ({ entry, inflectionHint: null })));
      } else {
        performSearch(word);
      }
    }

    // Compact compound breakdown shown INSIDE a normal article card. When a
    // search result is itself an attested N+N compound that has its own
    // dictionary article (barnehage, arbeidsplass), the rich article wins over
    // the fallback compound card — but the student still benefits from seeing
    // the parts. Renders a small clickable "Sammensatt: barn + e + hage" line;
    // empty for non-compounds or non-nb/nn. Clickable parts open each part's
    // dictionary entry (showWordEntry).
    function renderInlineCompoundBreakdown(entry) {
      if (!vocab.classifyCompound) return '';
      if (state.currentLang !== 'nb' && state.currentLang !== 'nn') return '';
      const word = (entry && entry.word ? entry.word : '').toLowerCase();
      if (!word || !state.nounGenusMap || state.nounGenusMap.size === 0) return '';
      const r = vocab.classifyCompound(word, state.nounGenusMap, isOrdbankWord, state.currentLang);
      if (!r || r.tier !== 2 || !r.parts || r.parts.length < 2) return '';
      const segs = [];
      for (const part of r.parts) {
        segs.push(`<button class="compound-inline-part" data-word="${escapeHtml(part.word)}">${escapeHtml(part.word)}</button>`);
        if (part.linker) segs.push(`<span class="compound-inline-fuge">${escapeHtml(part.linker)}</span>`);
      }
      const breakdown = segs.join('<span class="compound-inline-sep">+</span>');
      return `<div class="compound-inline-breakdown"><span class="compound-inline-label">${t('compound_inline_label')}:</span>${breakdown}</div>`;
    }

    function renderCompoundCard(query, decomposition) {
      const { parts, gender } = decomposition;

      const breakdownParts = [];
      for (const part of parts) {
        breakdownParts.push(escapeHtml(part.word));
        if (part.linker) breakdownParts.push(escapeHtml(part.linker));
      }
      const breakdownHtml = breakdownParts.map((p) =>
        `<span class="compound-breakdown-part">${p}</span>`
      ).join('<span class="compound-breakdown-sep"> + </span>');

      const componentBtns = parts.map(part =>
        `<button class="compound-component-btn" data-word="${escapeHtml(part.word)}">${escapeHtml(part.word)}</button>`
      ).join('');

      const genderBadge = gender
        ? `<span class="result-gender">${genusToGender(gender)}</span>`
        : '';

      const lastComponent = parts[parts.length - 1];
      const lastComponentWord = lastComponent ? lastComponent.word : '';
      const pedagogyNote = lastComponentWord
        ? `<div class="compound-pedagogy">${t('compound_pedagogy', { lastComponent: `<a class="compound-pedagogy-link" data-word="${escapeHtml(lastComponentWord)}">${escapeHtml(lastComponentWord)}</a>` })}</div>`
        : '';

      const isKnown = decomposition.tier === 2;
      let inflectionHtml = '';
      if (isKnown) {
        const known = renderCompoundDeclensionKnown(query, lastComponentWord, parts);
        inflectionHtml = known.validated ? known.html : renderCompoundDeclensionGuess(query, lastComponentWord, parts);
      } else {
        inflectionHtml = renderCompoundDeclensionGuess(query, lastComponentWord, parts);
      }

      // §15-4: the head lists every allowed spelling of the compound, each in an
      // identical `.result-word` span — same element, same class, so no
      // stylesheet can favour one — separated the same way the article head
      // separates likestilte forms.
      const headSpellings = (state.currentLang === 'nb' || state.currentLang === 'nn')
        ? compoundHeadSpellings(query, parts)
        : [query];
      const headHtml = headSpellings
        .map((w) => `<span class="result-word">${escapeHtml(w)}</span>`)
        .join('<span class="result-word-sep" aria-hidden="true">/</span>');
      const headNote = headSpellings.length > 1
        ? `<p class="likestilte-note compound-likestilte-note">${escapeHtml(t('likestilte_note'))}</p>`
        : '';

      let guessHtml;
      if (isKnown) {
        // Attested compound: the parts' meanings compose reliably, so show them.
        const guessSegments = parts.map(part => {
          const trans = getComponentTranslation(part.word);
          return trans || `(${part.word})`;
        });
        guessHtml = `
          <div class="compound-guess">
            <span class="compound-guess-label">${t('compound_translation_known')}:</span>
            <span class="compound-guess-text">${escapeHtml(guessSegments.join(' + '))}</span>
          </div>
        `;
      } else {
        // Possible compound (not attested in Ordbank): a joined gloss would be a
        // low-confidence guess, so instead point the student at each part's own
        // dictionary entry — clickable — so they can reason about the meaning.
        const partBtns = parts.map(part =>
          `<button class="compound-meaning-part" data-word="${escapeHtml(part.word)}">${escapeHtml(part.word)}</button>`
        ).join('');
        guessHtml = `
          <div class="compound-guess">
            <span class="compound-guess-label">${t('compound_meaning_help')}</span>
            <div class="compound-meaning-parts">${partBtns}</div>
          </div>
        `;
      }

      const compoundNavStack = state.compoundNavStack || [];
      const backLinkHtml = compoundNavStack.length > 0
        ? `<a class="compound-back-link" href="#">${t('compound_back_link', { word: compoundNavStack[compoundNavStack.length - 1].query })}</a>`
        : '';

      results.innerHTML = `
        ${backLinkHtml}
        <div class="result-card compound-card glass">
          <div class="result-basic">
            <div class="result-word-row">
              ${headHtml}
            </div>
            <div class="result-meta">
              <span class="compound-badge">${isKnown ? t('compound_known_badge') : t('compound_maybe_badge')}</span>
              <span class="result-pos">${t('pos_noun')}</span>
              ${genderBadge}
            </div>
            ${headNote}
          </div>
          <div class="compound-breakdown">${breakdownHtml}</div>
          <div class="compound-components">${componentBtns}</div>
          ${pedagogyNote}
          ${inflectionHtml}
          ${guessHtml}
          ${(isKnown || !reportChannelOpen()) ? '' : `
          <div class="compound-vote">
            <span class="compound-vote-prompt">${t('compound_vote_prompt')}</span>
            <div class="compound-vote-btns">
              <button type="button" class="compound-vote-btn" data-vote="yes">${t('compound_vote_yes')}</button>
              <button type="button" class="compound-vote-btn" data-vote="no">${t('compound_vote_no')}</button>
            </div>
            <p class="compound-vote-note">${t('compound_vote_note')}</p>
          </div>`}
        </div>
      `;

      // Tier-3 "Mulig sammensatt ord" vote: lets students confirm/deny whether
      // the decomposition is a real compound. Fire-and-forget via the existing
      // SEND_REPORT → /api/report → Firestore compound_votes pipeline (same
      // channel as the wish-word button). Degrades silently where runtime has
      // no backend (playground / lockdown shim).
      const voteRow = results.querySelector('.compound-vote');
      if (voteRow) {
        voteRow.querySelectorAll('.compound-vote-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const vote = btn.dataset.vote;
            const first = parts[0], last = parts[parts.length - 1];
            try {
              if (runtime && typeof runtime.sendMessage === 'function') {
                runtime.sendMessage({
                  type: 'SEND_REPORT',
                  data: {
                    kind: 'compound-vote',
                    left: first ? first.word : '',
                    right: last ? last.word : '',
                    joined: query,
                    linker: (first && first.linker) || '',
                    suggestedGender: gender || null,
                    vote,
                    surfaceLang: state.currentLang,
                    uiLang: getUiLanguage(),
                    context: '',
                    timestamp: new Date().toISOString(),
                  },
                }, () => {});
              }
            } catch (_) { /* fire-and-forget */ }
            voteRow.innerHTML = `<span class="compound-vote-thanks">${t('compound_vote_thanks')}</span>`;
          });
        });
      }

      results.querySelectorAll('.compound-component-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const word = btn.dataset.word;
          state.compoundNavStack.push({ query, decomposition });
          showWordEntry(word);
        });
      });

      // Tier-3 meaning helper: clicking a part opens its dictionary entry.
      results.querySelectorAll('.compound-meaning-part').forEach(btn => {
        btn.addEventListener('click', () => {
          const word = btn.dataset.word;
          state.compoundNavStack.push({ query, decomposition });
          showWordEntry(word);
        });
      });

      results.querySelectorAll('.compound-pedagogy-link').forEach(link => {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          const word = link.dataset.word;
          state.compoundNavStack.push({ query, decomposition });
          showWordEntry(word);
        });
      });

      const backLink = results.querySelector('.compound-back-link');
      if (backLink) {
        backLink.addEventListener('click', (e) => {
          e.preventDefault();
          const prev = state.compoundNavStack.pop();
          if (prev) {
            if (input) input.value = prev.query;
            // isCompoundCard===false means we came from an article's inline
            // breakdown — return to the article, not a fallback compound card.
            if (prev.isCompoundCard === false) showWordEntry(prev.query);
            else renderCompoundCard(prev.query, prev.decomposition);
          }
        });
      }
    }

    function crossStandardNoteHtml(cs) {
      if (!cs) return '';
      const noteKey = cs.originStandard === 'nb' ? 'result_cross_standard_note_bm' : 'result_cross_standard_note_nn';
      const switchKey = cs.originStandard === 'nb' ? 'result_cross_standard_switch_bm' : 'result_cross_standard_switch_nn';
      return `<div class="cross-standard-note">${escapeHtml(t(noteKey, { query: cs.query }))}</div>` +
        `<button type="button" class="cross-standard-switch" data-lang="${escapeHtml(cs.originStandard)}" data-query="${escapeHtml(cs.query)}">${escapeHtml(t(switchKey, { query: cs.query }))} →</button>`;
    }
    // Shared switch-and-research flow for both the cross-language chips (FL
    // suggestion) and the cross-standard switch hint (nb/nn). Kept single so the
    // two paths can't drift (they already had: cross-standard restored
    // input.value, cross-lang didn't — restoring it here is a harmless no-op in
    // the normal flow since `query` is the already-typed string).
    async function switchToLanguage(targetLang, query) {
      state.currentLang = targetLang;
      if (deps.broadcastLanguageChange !== false) {
        try { await deps.storage.set({ 'lang.dictionary': targetLang }); } catch (_) {}
      }
      await loadDictionary(targetLang);
      await loadGrammarFeatures(targetLang);
      if (typeof initGrammarSettings === 'function') initGrammarSettings();
      updateLangLabels();
      await rebuildLangSwitcher();
      if (input) input.value = query;
      if (query) performSearch(query);
      if (deps.onLanguageChanged) deps.onLanguageChanged(targetLang);
    }
    function attachCrossStandardSwitchHandlers() {
      results.querySelectorAll('.cross-standard-switch').forEach(btn => {
        btn.addEventListener('click', async () => {
          const targetLang = btn.dataset.lang;
          const q = btn.dataset.query || (input?.value || '').trim();
          await switchToLanguage(targetLang, q);
        });
      });
    }
    function renderCrossStandardSwitchOnly(query, other) {
      container.classList.add('has-searched');
      const cs = { query, originStandard: other };
      results.innerHTML = `<div class="results-placeholder cross-standard-only">${crossStandardNoteHtml(cs)}</div>`;
      attachCrossStandardSwitchHandlers();
    }

function renderResults(resultsList, options = {}) {
      if (!resultsList.length) {
        const query = (input?.value || '').trim();
        const wishHtml = (query && reportChannelOpen())
          ? `<div class="wish-word-card">
              <p class="wish-word-hint">${t('wish_word_hint')}</p>
              <button type="button" class="wish-word-btn" data-word="${escapeHtml(query)}">${t('wish_word_button', { word: query })}</button>
            </div>`
          : '';
        results.innerHTML = `<div class="results-placeholder"><p>${t('search_no_results')}</p>${wishHtml}</div>`;

        // Cross-dictionary suggestion: check all bundled languages for this
        // query. findWordInOtherLangs resolves instantly for already-visited
        // languages (in-memory index) and lazily (one-time JSON load) for
        // unvisited ones. Chips are injected when the promise resolves, but
        // only if the query hasn't changed in the meantime.
        if (deps.findWordInOtherLangs && query) {
          const capturedQuery = query;
          function _injectCrossLangChips(hits) {
            if (!hits.length) return;
            if ((input?.value || '').trim() !== capturedQuery) return;
            const placeholder = results.querySelector('.results-placeholder');
            if (!placeholder || placeholder.querySelector('.cross-lang-suggestions')) return;
            const suggestDiv = document.createElement('div');
            suggestDiv.className = 'cross-lang-suggestions';
            suggestDiv.innerHTML = hits.map(hit =>
              `<div class="cross-lang-chip">
                <span class="cross-lang-text">${escapeHtml(t('cross_lang_found', { word: hit.word, lang: langName(hit.lang) }))}</span>
                <button class="cross-lang-btn" type="button" data-lang="${escapeHtml(hit.lang)}" data-query="${escapeHtml(capturedQuery)}">${escapeHtml(t('cross_lang_switch', { lang: langName(hit.lang) }))}</button>
              </div>`
            ).join('');
            const wishCard = placeholder.querySelector('.wish-word-card');
            placeholder.insertBefore(suggestDiv, wishCard || null);
            suggestDiv.querySelectorAll('.cross-lang-btn').forEach(btn => {
              btn.addEventListener('click', async () => {
                const targetLang = btn.dataset.lang;
                const q = btn.dataset.query || (input?.value || '').trim();
                await switchToLanguage(targetLang, q);
              });
            });
          }
          Promise.resolve(deps.findWordInOtherLangs(capturedQuery, state.currentLang))
            .then(_injectCrossLangChips)
            .catch(() => {});
        }

        container.classList.remove('has-searched');
        // v3.0.127: known-form check. The spell-check accept-lists (Norsk
        // Ordbank for nb/nn, curated extras for FLs) know far more word
        // FORMS than the teaching dictionary has articles. If the missed
        // query is a known form, tell the student the word is real (just
        // article-less) and stamp the wish payload so curation can rank
        // known-form wishes above probable typos. Direction decides which
        // language's list to consult: a NO→target search is a Norwegian
        // query; target→NO (and nb/nn monolingual) checks currentLang.
        let wishKnownForm = false;
        const knownFormLang = (state.searchDirection === 'no-target' && state.currentLang !== 'nb' && state.currentLang !== 'nn')
          ? 'nb'
          : state.currentLang;
        if (query && typeof deps.isKnownWordForm === 'function') {
          Promise.resolve(deps.isKnownWordForm(query, knownFormLang)).then((known) => {
            if (!known) return;
            wishKnownForm = true;
            const placeholder = results.querySelector('.results-placeholder');
            const hint = placeholder && placeholder.querySelector('.wish-word-hint');
            if (!hint) return;
            const info = document.createElement('p');
            info.className = 'wish-word-known';
            info.textContent = t('wish_word_known_form', { word: query, lang: langName(knownFormLang) });
            hint.parentNode.insertBefore(info, hint);
            // For nb/nn, add an external dictionary link so the user can look it up now.
            // Gated on externalLinksEnabled — must be false in lockdown/exam contexts.
            if ((knownFormLang === 'nb' || knownFormLang === 'nn') && deps.externalLinksEnabled) {
              const extLink = document.createElement('a');
              // Canonical ordbøkene.no word URL is /<dicts>/<word> (e.g.
              // /bm,nn/graut). The older /bm,nn/search?q=<word> form server-side
              // 302-redirects to a malformed /bm,nn/undefined/bm,nn/<word> → 404
              // (Sturla audit g3). Link straight to the word page in both dicts.
              extLink.href = 'https://ordbokene.no/bm,nn/' + encodeURIComponent(query);
              extLink.target = '_blank';
              extLink.rel = 'noopener noreferrer';
              extLink.className = 'wish-word-ext-link';
              extLink.textContent = t('wish_word_ordbank_link');
              hint.parentNode.insertBefore(extLink, hint);
            }
          }).catch(() => {});
        }
        const wishBtn = results.querySelector('.wish-word-btn');
        if (wishBtn) {
          wishBtn.addEventListener('click', async () => {
            const word = wishBtn.dataset.word;
            const lang = state.currentLang;
            wishBtn.disabled = true;
            try {
              await new Promise((resolve) => {
                runtime.sendMessage({
                  type: 'SEND_REPORT',
                  data: {
                    kind: 'word_request',
                    word,
                    lang,
                    uiLang: getUiLanguage(),
                    // Curation triage signal: true when the word is in the
                    // checked language's accept-list (real word, no article)
                    // — rank these above wishes for unknown strings.
                    knownForm: wishKnownForm,
                    knownFormLang,
                    timestamp: new Date().toISOString(),
                  }
                }, resolve);
              });
              wishBtn.outerHTML = `<p class="wish-word-sent">${t('wish_word_sent', { word })}</p>`;
            } catch (e) {
              wishBtn.disabled = false;
              wishBtn.textContent = t('wish_word_error');
            }
          });
        }
        return;
      }
      container.classList.add('has-searched');

      const compoundNavStack = state.compoundNavStack || [];
      const backLinkHtml = compoundNavStack.length > 0
        ? `<a class="compound-back-link" href="#">${t('compound_back_link', { word: compoundNavStack[compoundNavStack.length - 1].query })}</a>`
        : '';

      const hintHtml = options.fallbackHint
        ? `<div class="fallback-hint">${t('search_fallback_hint', { searchLang: options.searchLang || '', resultLang: options.resultLang || '' })}</div>`
        : '';

      // Cross-standard note + switch rendered ONCE above the card list (a
      // reverse lookup can resolve to multiple chosen-standard cards).
      const csHtml = options.crossStandard ? crossStandardNoteHtml(options.crossStandard) : '';

      results.innerHTML = backLinkHtml + hintHtml + csHtml + resultsList.map(({ entry, inflectionHint, noGrunnform }) => {
        const enrichment = entry._wordId && state.nbEnrichmentIndex
          ? state.nbEnrichmentIndex.get(entry._wordId)
          : null;
        const enrichedEntry = enrichment ? {
          ...entry,
          falseFriends: [...(entry.falseFriends || []), ...(enrichment.falseFriends || [])],
          senses: [...(entry.senses || []), ...(enrichment.senses || [])],
        } : entry;
        const audioBtnHtml = (audioEnabled && (entry.audio || audioPlayHandler))
          ? `<button class="audio-btn" data-audio="${escapeHtml(entry.audio || '')}" title="${t('widget_play')}">${getPlayIcon()}</button>`
          : '';
        return `
        <div class="result-card glass" data-id="${entry._id || ''}">
          <div class="result-basic">
            <div class="result-word-row">
              ${renderHeadForms(entry)}
              ${audioBtnHtml}
            </div>
            ${renderFalseFriends(enrichedEntry)}
            ${renderSenses(enrichedEntry) || ((state.currentLang === 'nb' || state.currentLang === 'nn')
              // NB/NN are monolingual standards: entry.translation here is just
              // the OTHER standard's equivalent (NN "verd" → bokmål "verden"),
              // shown only one way and confusing. Drop it. The cross-standard
              // FALLBACK hint ("«verden» er eit bokmålsord — slå opp …") is
              // rendered separately (crossStandardNoteHtml) and stays.
              //
              // UNNTAK: oppslag importerte frå ordbøkene ber ein DEFINISJON i
              // same feltet, ikkje ein motstandard-ekvivalent. Å skjule han
              // gjorde homografdelinga verdilaus for lesaren: to «stoppe»-kort
              // med identisk bøying og ingenting som skilde dei. Ein a-verbs
              // homograf skil seg berre på tyding, så tydinga MÅ fram.
              // UNNTAKET er oppslag som er BUNDNE til ein ordboksartikkel:
              // der er `translation` definisjonen frå ordbøkene, ikkje
              // motstandardens ord. «advent → nemning på dei fire siste vekene
              // før jul» er ei tyding; «verd → verden» er det ikkje, og det
              // siste har ingen article_id.
              //
              // Utan dette unntaket var homografdelinga verdilaus for lesaren:
              // to «stoppe»-kort med identisk a-verbsbøying og ingenting som
              // skilde dei. Eg prøvde fyrst å kjenne definisjonane att på
              // provenienstempel (som ikkje overlever synken) og deretter på
              // ordtal (som slår inn på «betre seg → forbedre seg» òg).
              // Artikkelbindinga er det einaste signalet som held.
              ? (entry._ordbank_provenance?.article_id && getTranslation(entry)
                ? `<div class="result-translation">${escapeHtml(getTranslation(entry))}</div>`
                : '')
              : `<div class="result-translation">${escapeHtml(getTranslation(entry))}</div>`)}
            ${inflectionHint ? `<div class="inflection-hint">${escapeHtml(inflectionHint)}${openLesson && !noGrunnform ? ` <button class="inflection-grunnform-btn" type="button">${escapeHtml(t('inflection_grunnform_les_mer'))}</button>` : ''}</div>` : ''}            <div class="result-meta">
              <span class="result-pos">${escapeHtml(posLabelKey(entry) ? t(posLabelKey(entry)) : (entry.partOfSpeech || ''))}</span>
              ${genderDisplay(entry) ? `<span class="result-gender">${escapeHtml(genderDisplay(entry))}</span>` : ''}
              ${/* The plural badge belongs to ONE spelling, and an entry with
                    likestilte skrivemåter has more than one. «mineralvann /
                    mineralvatn» showed «mineralvanner» in the head — a form of
                    the first spelling only, and one the neutral table does not
                    even list (ubestemt fl. is «mineralvann»/«mineralvatn»). So
                    it both favoured a spelling and contradicted the table
                    below it. The multi-column table carries the paradigm for
                    these entries; the badge stands down, exactly as
                    renderNounForms does. Found by the held-out sample, not by
                    a gate. */ ''}
              ${entry.plural && !hasLikestilteFormer(entry) && isFeatureEnabled('grammar_plural') ? `<span class="result-plural">${escapeHtml(entry.plural)}</span>` : ''}
            </div>
            ${renderInlineCompoundBreakdown(entry)}
          </div>
          <button class="explore-btn">${t('result_explore')}</button>
          <div class="result-expanded hidden">
            ${renderSkrivemaater(entry)}
            ${renderLikestilteFormer(entry)}
            ${renderVerbConjugations(entry)}
            ${renderNounCases(entry)}
            ${renderNounForms(entry)}
            ${renderGenusColumns(entry)}
            ${renderAdjectiveDeclension(entry)}
            ${renderAdjectiveComparison(entry)}
            ${entry.synonyms && entry.synonyms.length ? `
              <div class="expanded-section">
                <h4>${t('result_synonyms')}</h4>
                <p>${entry.synonyms.map(s => escapeHtml(s)).join(', ')}</p>
              </div>
            ` : ''}
            ${entry.grammar && state.currentLang !== 'nb' && state.currentLang !== 'nn' ? `
              <div class="expanded-section">
                <h4>${t('result_grammar')}</h4>
                <p>${escapeHtml(entry.grammar)}</p>
              </div>
            ` : ''}
            ${entry.cefr && state.currentLang !== 'nb' && state.currentLang !== 'nn' ? `
              <div class="expanded-section">
                <h4>${t('result_level')}</h4>
                <p>${escapeHtml(entry.cefr)}</p>
              </div>
            ` : ''}
            ${renderExamples(entry)}
          </div>
        </div>
      `;
      }).join('');

      results.querySelectorAll('.explore-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const expanded = btn.nextElementSibling;
          const isHidden = expanded.classList.contains('hidden');
          expanded.classList.toggle('hidden');
          btn.textContent = isHidden ? t('result_collapse') : t('result_explore');
        });
      });

      // Inline compound breakdown on an article card: clicking a part opens its
      // dictionary entry. Record the article word (not a compound decomposition)
      // so Back returns to the article via showWordEntry, not renderCompoundCard.
      results.querySelectorAll('.compound-inline-part').forEach(btn => {
        btn.addEventListener('click', () => {
          const word = btn.dataset.word;
          const cardWord = btn.closest('.result-card')?.querySelector('.result-word')?.textContent || (input?.value || '');
          state.compoundNavStack.push({ query: cardWord, decomposition: null, isCompoundCard: false });
          showWordEntry(word);
        });
      });

      attachCrossStandardSwitchHandlers();

      if (openLesson) {
        results.querySelectorAll('.inflection-grunnform-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openLesson(state.currentLang, 'ordbokens_grunnform');
          });
        });
        results.querySelectorAll('.false-friend-les-mer-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openLesson(state.currentLang, 'de-false-friends');
          });
        });
        results.querySelectorAll('.conj-transintr-btn').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            openLesson(state.currentLang, 'nb-transitive-intransitive');
          });
        });
      }

      if (audioEnabled) {
        results.querySelectorAll('.audio-btn').forEach((btn, idx) => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const audioFile = btn.dataset.audio;
            // Host-supplied play handler wins (used by lockdown sidepanel for
            // browser-TTS playback when audio metadata is stripped). Falls
            // back to MP3 path when handler not provided AND data-audio set.
            if (audioPlayHandler) {
              const item = resultsList[idx];
              audioPlayHandler(item ? item.entry : null, btn);
            } else if (audioFile) {
              playAudio(audioFile, btn);
            }
          });
        });
      }

      const backLink = results.querySelector('.compound-back-link');
      if (backLink) {
        backLink.addEventListener('click', (e) => {
          e.preventDefault();
          const prev = state.compoundNavStack.pop();
          if (prev) {
            if (input) input.value = prev.query;
            // isCompoundCard===false means we came from an article's inline
            // breakdown — return to the article, not a fallback compound card.
            if (prev.isCompoundCard === false) showWordEntry(prev.query);
            else renderCompoundCard(prev.query, prev.decomposition);
          }
        });
      }
    }

    function renderSenses(entry) {
      if (!entry.senses || !entry.senses.length) return null;
      const relevant = entry.senses.filter(s => s.translations && s.translations[state.currentLang]);
      if (!relevant.length) return null;
      const items = relevant.map(s => {
        const tr = s.translations[state.currentLang];
        const forms = Array.isArray(tr.forms) ? tr.forms : (tr.form ? [tr.form] : []);
        const ex = tr.example || {};
        return `
          <div class="sense-item">
            <div class="sense-trigger">${escapeHtml(s.trigger || '')}</div>
            <div class="sense-forms">${forms.map(escapeHtml).join(', ')}</div>
            ${ex.sentence ? `
              <div class="sense-example">
                <span class="sense-example-src">${escapeHtml(ex.sentence)}</span>
                ${ex.translation ? `<span class="sense-example-tr"> — ${escapeHtml(ex.translation)}</span>` : ''}
              </div>
            ` : ''}
          </div>
        `;
      }).join('');
      return `<div class="senses-block">${items}</div>`;
    }

    function renderFalseFriends(entry) {
      if (!entry.falseFriends || !entry.falseFriends.length) return '';
      const pairs = entry.falseFriends.filter(f => f.lang === state.currentLang);
      if (!pairs.length) return '';
      const items = pairs.map(f => `
        <div class="false-friend-item">
          <span class="false-friend-form">${escapeHtml(f.form)}</span>
          <span class="false-friend-meaning">${escapeHtml(f.meaning || '')}</span>
          <p class="false-friend-warning">${sanitizeWarning(f.warning || '')}</p>
        </div>
      `).join('');
      // "Les mer →" deep-links to the language's false-friends reference lesson.
      // Currently only German ships one (de-false-friends, a library lesson);
      // other languages render the banner without the link.
      const lesMer = (openLesson && state.currentLang === 'de')
        ? `<button class="false-friend-les-mer-btn" type="button">${escapeHtml(t('inflection_grunnform_les_mer'))}</button>`
        : '';
      return `
        <div class="false-friend-banner" role="note">
          <span class="false-friend-heading">⚠ ${t('result_false_friend_heading')}</span>
          ${items}
          ${lesMer}
        </div>
      `;
    }

    // EXAMPLE SENTENCES — shown in ordinary exam mode, in every language.
    //
    // A teacher's report (2026-08-19) that «særlig setningsforslag til ord med
    // rød strek gjør at svake elever kan surfe på setninger de ikke har tenkt
    // ut selv» made exam mode hide examples outright. That was withdrawn on
    // 2026-08-25: the lift-value of an example is high in a language the pupil
    // cannot yet write and low in their mother tongue, so the blanket rule
    // took «test av bilen» away from a Norwegian exam for nothing.
    //
    // The concern keeps its own control instead — `hideExampleSentences`,
    // "ordbok uten eksempelsetninger", a third level below exam mode.
    // **Nothing sets the flag yet**; there is no settings UI and no teacher
    // control. See `dictionary.examples` in extension/exam-registry.js.
    let hideExamples = false;
    function refreshExamMode() {
      try {
        const r = _storage && typeof _storage.get === 'function' ? _storage.get(['hideExampleSentences']) : null;
        if (r && typeof r.then === 'function') {
          r.then((v) => { hideExamples = !!(v && v.hideExampleSentences); }).catch(() => {});
        }
      } catch (_) { /* host without storage: leave examples visible */ }
    }
    refreshExamMode();

    // Examples are allowed in ordinary exam mode — see `dictionary.examples`
    // in extension/exam-registry.js for why the 2026-08-19 blanket suppression
    // was withdrawn. The only thing that hides them is the explicit
    // `hideExampleSentences` flag ("ordbok uten eksempelsetninger"), which
    // nothing sets yet.
    //
    // The flag is read through `deps.storage` rather than a new dep, so no
    // host has to change its call. Refreshed at mount and after each search,
    // so a mid-session toggle lands on the next lookup — the same cadence the
    // exam-mode read used.
    function examplesAllowed() {
      return !hideExamples;
    }

    function renderExamples(entry) {
      if (!examplesAllowed()) return '';
      const examples = [];
      const uiLang = getUiLanguage();
      const hideExampleTranslations = (uiLang === 'nb' || uiLang === 'nn') && (state.currentLang === 'nb' || state.currentLang === 'nn');

      if (entry.examples && entry.examples.length) {
        for (const ex of entry.examples) {
          if (!hideExampleTranslations || !ex.lang || ex.lang === state.currentLang) {
            examples.push({
              sentence: ex.sentence || ex.source || '',
              translation: (!hideExampleTranslations) ? (ex.translation || ex.target || '') : '',
              lang: ex.lang,
            });
          } else if (hideExampleTranslations && ex.lang) {
            const sentence = ex.sentence || ex.source || '';
            if (sentence) examples.push({ sentence, translation: '', lang: ex.lang });
          }
        }
      }

      if (entry.linkedTo && !hideExampleTranslations) {
        const link = entry.linkedTo.nb || entry.linkedTo.nn;
        if (link?.examples) {
          for (const ex of link.examples) {
            const sentence = ex.source || ex.sentence || '';
            const translation = ex.target || ex.translation || '';
            if (sentence && !examples.some(e => e.sentence === sentence)) {
              examples.push({ sentence, translation });
            }
          }
        }
      }

      // De-duplicate: NB/NN entries store each example once per source-language
      // pair (a `de` and an `en` copy of the same Norwegian sentence). With
      // translations hidden these collapse to identical rows, so the same
      // sentence was printed twice. Key on sentence+translation so foreign-
      // language entries that legitimately show two different translations of
      // one sentence are preserved.
      const seenExamples = new Set();
      const dedupedExamples = examples.filter((ex) => {
        const key = `${ex.sentence}|@|${ex.translation || ''}`;
        if (seenExamples.has(key)) return false;
        seenExamples.add(key);
        return true;
      });

      if (dedupedExamples.length === 0) return '';

      return `
        <div class="expanded-section">
          <h4>${t('result_examples')}</h4>
          ${dedupedExamples.map(ex => `
            <div class="example">
              <p class="example-sentence">"${escapeHtml(ex.sentence)}"</p>
              ${ex.translation ? `<p class="example-translation">${escapeHtml(ex.translation)}</p>` : ''}
            </div>
          `).join('')}
        </div>
      `;
    }

    // Kløyvd infinitiv: which verbs take -a. Nynorsk allows three infinitive
    // systems — a-infinitiv («å bera, å kasta»), e-infinitiv («å bere, å
    // kaste») and the kløyvd one, where the ending follows jamvektslova: -a on
    // short-root verbs, -e on the rest. Both endings are therefore listed for
    // every verb, and nothing in the table said which of them the kløyvd
    // system picks. Språkrådet's August 2026 assessment named exactly that:
    // «det opplyses ikke hvilke verb som tar -a».
    //
    // The answer is a closed list (Rettskrivinga av 2012), carried in the data
    // as entry.kloyvdInfinitiv — see papertek-vocabulary
    // vocabulary/lexicon/_shared/kloyvd-infinitiv.json. Rendered as a plain
    // note on the Infinitiv row: it must INFORM without favouring, since the
    // two infinitives remain equally valid (§ 15-4). No colour, no weight, no
    // reordering — the same muted `.conj-note` the transitivity labels use.
    function kloyvdNote(entry) {
      if (!entry || entry.kloyvdInfinitiv !== true) return '';
      return ` <span class="conj-note">(${escapeHtml(t('kloyvd_infinitiv_note'))})</span>`;
    }

    // Nynorsk «hive» har TO bøyingssystem, ikkje eitt med valfrie celler:
    //
    //     hiver – hivde – hivt      (veik)
    //     hiv   – heiv  – hive      (sterk)
    //
    // Den vanlege verbtabellen unionerer `former` og alle `paradigms[]` per
    // celle, så presens ville bli «hiver / hiv» og preteritum «hivde / heiv»
    // — fire kombinasjonar der berre to er lisensierte. Eleven som les
    // «hiv – hivde» rett ut av tabellen tek feil, og tabellen sa at han
    // kunne. Nøyaktig same feilen som den samanslåtte kjønnstabellen gjorde
    // for substantiv, og han har same svaret: éi kolonne per system.
    //
    // Eit system er eit paradigme med `systemKey` (preteritumsforma si,
    // skriven av papertek-vocabulary/scripts/rebuild-verb-systems.mjs).
    // Overskrifta ER preteritumet, av di det er den forma som skil systema
    // — meir opplysande enn «1» og «2», og utan noka rangering.
    const VERB_SYSTEM_ROWS = [
      { key: 'infinitiv', labelKey: 'tense_infinitive' },
      { key: 'presens', labelKey: 'tense_presens' },
      { key: 'preteritum', labelKey: 'tense_preteritum' },
      { key: 'perfektum_partisipp', labelKey: 'tense_past_participle' },
      { key: 'imperativ', labelKey: 'tense_imperative' },
    ];

    function verbSystems(entry) {
      const pars = entry?.conjugations?.presens?.paradigms;
      if (!Array.isArray(pars)) return null;
      const systems = pars.filter((p) => p && typeof p.systemKey === 'string' && p.systemKey);
      // Under to system er det ikkje eit val, og den vanlege tabellen er rett.
      if (systems.length < 2) return null;
      if (new Set(systems.map((p) => p.systemKey)).size < 2) return null;
      return systems;
    }

    function renderVerbSystems(entry) {
      const systems = verbSystems(entry);
      if (!systems) return '';
      const rows = VERB_SYSTEM_ROWS
        .map((row) => {
          // Éin lesar for alle kolonnane, som i renderGenusColumns: ingen
          // kolonne kan bli rikare enn naboen. fmtForm held « / » for ei
          // celle som verkeleg har fleire former INNANFOR eitt system.
          const cells = systems.map((s) => fmtForm(s[row.key]));
          if (!cells.some(Boolean)) return '';
          return `<tr><th scope="row">${escapeHtml(t(row.labelKey))}</th>${
            cells.map((c) => `<td>${escapeHtml(c || '–')}</td>`).join('')
          }</tr>`;
        })
        .filter(Boolean)
        .join('');
      if (!rows) return '';
      return `
        <div class="expanded-section likestilte-section">
          <h4>${t('verb_systems_heading')}</h4>
          <p class="likestilte-note">${escapeHtml(t('verb_systems_note'))}</p>
          <div class="likestilte-scroll">
            <table class="conjugation-table likestilte-table">
              <thead>
                <tr><th></th>${systems.map((s) => `<th scope="col">${escapeHtml(s.systemKey)}</th>`).join('')}</tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderVerbConjugations(entry) {
      if (!entry.conjugations) return '';
      // See renderNounForms — likestilte spellings own the bøyingstabell.
      if (hasLikestilteFormer(entry)) return '';
      // Eit verb med to bøyingssystem får kolonnetabellen i staden. Å teikne
      // begge ville vise paradigmet to gonger — éin gong samanslått under ein
      // note som er usann for det, éin gong delt — og den samanslåtte er den
      // misvisande halvdelen. Same avveginga som renderNounForms gjer mot
      // renderGenusColumns.
      if (verbSystems(entry)) return renderVerbSystems(entry);

      const allowedPronouns = getAllowedPronouns();
      const sections = [];

      const presensData = entry.conjugations.presens;
      // Route here whenever an infinitive exists ANYWHERE — in `former` or in
      // `paradigms[]`. Testing only `former.infinitiv` dropped every nynorsk
      // verb whose infinitives are kløyvd and therefore live in paradigms
      // («gjere»: å gjera / å gjere). Those fell through to the generic
      // pronoun-table renderer, which prints object keys verbatim — Språkrådet
      // saw «perfektum_partisipp» and «s_passiv_infinitiv» as row labels, and
      // no infinitive row at all. The branch below already merges former +
      // paradigms and has real labels, so it is the correct home for them.
      const presensParadigms = Array.isArray(presensData?.paradigms) ? presensData.paradigms : [];
      const hasInfinitiv = presensData?.former?.infinitiv !== undefined
        || presensParadigms.some((p) => p && p.infinitiv != null);
      if (hasInfinitiv) {
        const former = presensData.former || {};
        const paradigms = presensParadigms;
        // preteritum + perfektum partisipp live in conjugations.presens.paradigms[]
        // (the Ordbank likestilte former: kasta/kastet), not in `former`. Merge
        // both so the BØYNING table shows the full paradigm, likestilte forms
        // joined with " / ".
        // Returns the cell's forms as a LIST, not a joined string: the caller
        // needs to know whether the cell offers a choice (for the neutrality
        // note), and formatting is fmtForm's job. formValues flattens, so a
        // slot whose value is itself an array of likestilte forms — every
        // nynorsk kløyvd-infinitiv imperative — contributes its forms rather
        // than one comma-glued blob.
        const collect = (key) => {
          const vals = [];
          if (former[key] != null) vals.push(...formValues(former[key]));
          for (const p of paradigms) if (p && p[key] != null) vals.push(...formValues(p[key]));
          const uniq = [...new Set(vals)];
          return uniq.length ? uniq : undefined;
        };
        // Presens perfektum er ikkje ein slot i Ordbank — han er samansett av
        // hjelpeverbet og perfektum partisippet. Bokmåls-/Nynorskordboka fører
        // han likevel som eiga rad rett etter preteritum («har tipsa»), og
        // ordbøkene er fasiten for presentasjon. Berre nb/nn: for tysk og
        // fransk er samansetjinga ei anna, og å gjette henne ville vere å finne
        // på ein husstil i staden for å følgje ei kjelde.
        const perfektumRow = () => {
          if (state.currentLang !== 'nb' && state.currentLang !== 'nn') return undefined;
          const pp = collect('perfektum_partisipp');
          if (!pp) return undefined;
          const aux = formValues(entry?.conjugations?.presens?.auxiliary ?? entry?.auxiliary)[0] || 'har';
          return pp.map((v) => `${aux} ${v}`);
        };
        // Ordbøkene fører perfektum partisipp som ein SEKSJON med fire rader —
        // hankjønn/hokjønn, inkjekjønn, bunden, fleirtal — ikkje som éi celle.
        // Bokmål «skrive» har tre ulike former der (skreven/skrevet/skrevne),
        // og kortet viste berre «skrevet», så «dei skrevne reglane» fanst ikkje
        // i oppslaget. Målt: 1169 av 1170 bokmålsverb og 652 av 1017
        // nynorskverb har eit partisipp som faktisk bøyer seg.
        //
        // Data: `conjugations.presens.partisipp`, skrive av papertek-vocabulary
        // sin fill-participle-declension.mjs, og BERRE der cellene skil seg —
        // nynorske a-verb har «sakna» i alle fire, og der held den eine rada.
        const ppDecl = entry?.conjugations?.presens?.partisipp;
        const ppRow = (key) => {
          if (!ppDecl || (state.currentLang !== 'nb' && state.currentLang !== 'nn')) return undefined;
          const v = formValues(ppDecl[key]);
          return v.length ? v : undefined;
        };
        const forms = {
          infinitiv: collect('infinitiv'),
          presens: collect('presens'),
          preteritum: collect('preteritum'),
          presens_perfektum: perfektumRow(),
          perfektum_partisipp: ppDecl ? undefined : collect('perfektum_partisipp'),
          pp_mf: ppRow('maskulin_feminin'),
          pp_n: ppRow('noytrum'),
          pp_def: ppRow('bestemt'),
          pp_pl: ppRow('flertall'),
          imperativ: collect('imperativ'),
          // Kept (rather than dropped) so re-routing the kløyvd-infinitiv verbs
          // here loses no information they used to show — with a real label
          // this time. Rows render only when the verb actually has the form.
          presens_partisipp: collect('presens_partisipp'),
          s_passiv_infinitiv: collect('s_passiv_infinitiv'),
        };
        const labels = {
          infinitiv: t('tense_infinitive'),
          presens: t('tense_presens'),
          preteritum: t('tense_preteritum'),
          presens_perfektum: t('tense_present_perfect'),
          perfektum_partisipp: t('tense_past_participle'),
          // Fire underrader under ei felles seksjonsoverskrift, som i ordbøkene.
          // Å gjenta «Perfektum partisipp – » på kvar av dei fire les tungt og
          // seier same ordet fire gonger; seksjonsrada seier det éin gong.
          pp_mf: t('pp_mf'),
          pp_n: t('pp_n'),
          pp_def: t('pp_def'),
          pp_pl: t('pp_pl'),
          imperativ: t('tense_imperative'),
          presens_partisipp: t('tense_present_participle'),
          s_passiv_infinitiv: t('tense_s_passive'),
        };
        const rows = Object.entries(labels)
          .filter(([key]) => forms[key] !== undefined)
          .map(([key, label]) => {
            // Seksjonsoverskrift rett før den fyrste partisippcella, slik
            // ordbøkene gjer det. Berre når dei fire radene faktisk er der.
            const head = key === 'pp_mf'
              ? `<tr class="conj-section"><td colspan="2"><strong>${escapeHtml(t('tense_past_participle'))}</strong></td></tr>`
              : '';
            if (key === 'preteritum') {
              // Per-paradigm transitivity labels when present (henge: hang
              // «intransitiv» / hengte «transitiv»). Built here rather than via
              // collect() because the note is HTML; other cells stay plain-escaped.
              const parts = [];
              for (const v of formValues(former.preteritum)) parts.push(escapeHtml(v));
              for (const p of paradigms) {
                if (!p || p.preteritum == null) continue;
                const note = p.note ? ` <span class="conj-note">(${escapeHtml(p.note)})</span>` : '';
                // The note belongs to the paradigm, so it is appended once
                // after that paradigm's forms — not once per form.
                const text = formValues(p.preteritum).map(escapeHtml).join(FORM_SEPARATOR);
                if (text) parts.push(text + note);
              }
              const uniq = [...new Set(parts)];
              return `<tr><td>${label}</td><td>${uniq.join(FORM_SEPARATOR)}</td></tr>`;
            }
            if (key === 'infinitiv') {
              return `<tr><td>${label}</td><td>${escapeHtml(fmtForm(forms[key]))}${kloyvdNote(entry)}</td></tr>`;
            }
            return `${head}<tr><td>${label}</td><td>${escapeHtml(fmtForm(forms[key]))}</td></tr>`;
          })
          .join('');
        if (rows) {
          // When the verb carries transitivity notes on its preteritum paradigms
          // (henge: hang/hengte, brenne: brant/brente), offer a "Les mer →" link
          // to the transitiv/intransitiv lesson.
          const hasTransNote = paradigms.some((p) => p && p.note);
          const transCta = (hasTransNote && openLesson && state.currentLang === 'nb')
            ? `<div class="conjugation-lesmer"><button type="button" class="conj-transintr-btn">${escapeHtml(t('inflection_grunnform_les_mer'))}</button></div>`
            : '';
          sections.push(`
            <div class="expanded-section">
              <h4>${t('result_conjugation')}</h4>
              ${multiFormNote(Object.values(forms))}
              <table class="conjugation-table">${rows}</table>
              ${transCta}
            </div>
          `);
        }
        return sections.join('');
      }

      if (entry.conjugations.present || entry.conjugations.past || entry.conjugations.perfect) {
        const enTenses = [
          { key: 'present', featureIds: ['grammar_present', 'grammar_en_present'], nameKey: 'tense_presens' },
          { key: 'past', featureIds: ['grammar_preteritum', 'grammar_en_past'], nameKey: 'tense_preteritum' },
          { key: 'perfect', featureIds: ['grammar_perfektum', 'grammar_en_perfect'], nameKey: 'tense_perfektum' },
        ];
        for (const config of enTenses) {
          const isEnabled = config.featureIds.some(id => isFeatureEnabled(id));
          if (!isEnabled) continue;
          const tenseData = entry.conjugations[config.key];
          if (!tenseData) continue;
          if (tenseData.former) {
            // Same class, other direction: `typeof form === 'string'` silently
            // DROPPED every array-valued cell, so the 17 English perfect
            // participles that carry two forms (learnt / learned) rendered no
            // row at all. formValues decides now — a cell shows when it has
            // forms, however many.
            const rows = Object.entries(tenseData.former)
              .filter(([pronoun, form]) => !pronoun.startsWith('_') && formValues(form).length > 0)
              .map(([pronoun, form]) => `<tr><td>${escapeHtml(pronoun)}</td><td>${escapeHtml(fmtForm(form))}</td></tr>`)
              .join('');
            if (rows) {
              sections.push(`
                <div class="expanded-section">
                  <h4>${t(config.nameKey)}</h4>
                  <table class="conjugation-table">${rows}</table>
                </div>
              `);
            }
          } else if (tenseData.participle || tenseData.present_participle) {
            const parts = [];
            if (tenseData.participle) parts.push(`${t('tense_past_participle')}: ${escapeHtml(fmtForm(tenseData.participle))}`);
            if (tenseData.present_participle) parts.push(`Present participle: ${escapeHtml(fmtForm(tenseData.present_participle))}`);
            sections.push(`
              <div class="expanded-section">
                <h4>${t(config.nameKey)}</h4>
                <p>${parts.join('<br>')}</p>
              </div>
            `);
          }
        }
        return sections.join('');
      }

      const tenseConfig = [
        { keys: ['presens', 'presente'], featureIds: ['grammar_present', 'grammar_de_presens', 'grammar_es_presente', 'grammar_fr_present', 'grammar_nb_presens', 'grammar_nn_presens', 'grammar_presens'], nameKey: 'tense_presens' },
        { keys: ['preteritum', 'preterito'], featureIds: ['grammar_preteritum', 'grammar_de_preteritum', 'grammar_es_preterito', 'grammar_preterito', 'grammar_nb_preteritum', 'grammar_nn_preteritum'], nameKey: 'tense_preteritum' },
        { keys: ['perfektum', 'perfecto', 'passe_compose'], featureIds: ['grammar_perfektum', 'grammar_de_perfektum', 'grammar_es_perfecto', 'grammar_fr_passe_compose', 'grammar_perfecto', 'grammar_nb_perfektum', 'grammar_nn_perfektum'], nameKey: 'tense_perfektum' },
      ];

      for (const config of tenseConfig) {
        const isEnabled = config.featureIds.some(id => isFeatureEnabled(id));
        if (!isEnabled) continue;

        let tenseData = null;
        for (const key of config.keys) {
          if (entry.conjugations[key]) { tenseData = entry.conjugations[key]; break; }
        }
        if (!tenseData) continue;

        if (tenseData.former) {
          const filtered = filterPronouns(tenseData.former, allowedPronouns);
          if (Object.keys(filtered).length > 0) {
            sections.push(`
              <div class="expanded-section">
                <h4>${t(config.nameKey)}</h4>
                ${renderConjugationTable(filtered)}
              </div>
            `);
          }
        } else if (tenseData.auxiliary || tenseData.participle) {
          sections.push(`
            <div class="expanded-section">
              <h4>${t(config.nameKey)}</h4>
              <p>${escapeHtml(formValues(tenseData.auxiliary).join(FORM_SEPARATOR))} + ${escapeHtml(formValues(tenseData.participle).join(FORM_SEPARATOR))}</p>
            </div>
          `);
        }
      }
      return sections.join('');
    }

    function filterPronouns(forms, allowedPronouns) {
      const pronounLabels = {
        es: ['yo', 'tú', 'él/ella/usted', 'nosotros', 'vosotros', 'ellos/ellas/ustedes'],
        fr: ['je', 'tu', 'il/elle/on', 'nous', 'vous', 'ils/elles'],
      };
      if (Array.isArray(forms)) {
        const labels = pronounLabels[state.currentLang] || [];
        const result = {};
        forms.forEach((form, i) => {
          if (!form) return;
          const pronoun = labels[i] || `${i}`;
          if (!allowedPronouns || allowedPronouns.has(pronoun)) result[pronoun] = form;
        });
        return result;
      }
      const filtered = {};
      for (const [pronoun, form] of Object.entries(forms)) {
        if (pronoun.startsWith('_')) continue;
        if (allowedPronouns && !allowedPronouns.has(pronoun)) continue;
        filtered[pronoun] = form;
      }
      return filtered;
    }

    // Row labels for the generic table. Its keys are usually PRONOUNS (ich,
    // du, er …), which are their own labels — but a Norwegian verb that misses
    // the labelled branch lands here too, and then the object's field names
    // print verbatim. Språkrådet saw «perfektum_partisipp» and
    // «s_passiv_infinitiv» as row labels in nn «gjere». That routing is fixed,
    // but the leak should not depend on the routing being right: any key that
    // names a grammatical slot gets its proper label here as well.
    const GENERIC_FORM_LABELS = {
      infinitiv: 'tense_infinitive',
      presens: 'tense_presens',
      preteritum: 'tense_preteritum',
      perfektum: 'tense_perfektum',
      perfektum_partisipp: 'tense_past_participle',
      presens_partisipp: 'tense_present_participle',
      imperativ: 'tense_imperative',
      s_passiv_infinitiv: 'tense_s_passive',
      komparativ: 'tense_comparative',
      superlativ: 'tense_superlative',
    };

    function conjugationRowLabel(key) {
      const k = GENERIC_FORM_LABELS[key];
      return k ? t(k) : key;
    }

    function renderConjugationTable(forms) {
      return `<table class="conjugation-table">
        ${Object.entries(forms).map(([pronoun, form]) =>
          `<tr><td>${escapeHtml(conjugationRowLabel(pronoun))}</td><td>${escapeHtml(fmtForm(form))}</td></tr>`
        ).join('')}
      </table>`;
    }

    function renderNounCases(entry) {
      if (!entry.cases) return '';
      const caseConfig = [
        { key: 'nominativ', label: 'Nominativ', feature: null },
        { key: 'akkusativ', label: 'Akkusativ', feature: ['grammar_accusative_indefinite', 'grammar_accusative_definite', 'grammar_accusative_nouns'] },
        { key: 'dativ', label: 'Dativ', feature: ['grammar_dative'] },
        { key: 'genitiv', label: 'Genitiv', feature: ['grammar_genitiv'] },
      ];
      const enabledCases = caseConfig.filter(c => {
        if (!c.feature) return true;
        return c.feature.some(f => isFeatureEnabled(f));
      });
      if (enabledCases.length <= 1) return '';
      const rows = enabledCases.map(c => {
        const caseData = entry.cases[c.key];
        const singular = caseData?.forms?.singular || {};
        const plural = caseData?.forms?.plural || {};
        return `<tr>
          <td><strong>${c.label}</strong></td>
          <td>${escapeHtml(fmtForm(singular.definite))}</td>
          <td>${escapeHtml(fmtForm(singular.indefinite))}</td>
          <td>${escapeHtml(fmtForm(plural.definite))}</td>
          <td>${escapeHtml(fmtForm(plural.indefinite))}</td>
        </tr>`;
      }).join('');
      return `
        <div class="expanded-section">
          <h4>${t('result_cases')}</h4>
          <table class="conjugation-table declension-table">
            <thead>
              <tr>
                <th></th>
                <th>${t('decl_def_sg')}</th>
                <th>${t('decl_indef_sg')}</th>
                <th>${t('decl_def_pl')}</th>
                <th>${t('decl_indef_pl')}</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      `;
    }

    // A form cell holds ONE form or SEVERAL equally valid ones: nynorsk
    // «kaste» has three imperatives (kast, kasta, kaste) and two infinitives,
    // all licensed by Ordbank article 37388. The data models that as an array,
    // and handing an array to escapeHtml stringifies it with JavaScript's own
    // comma-and-no-space — «kast,kasta,kaste», which reads as a typo rather
    // than as a choice. § 15-4 asks for information about valgfrie former that
    // is complete AND NEUTRAL, and the rest of the card (article head,
    // likestilte table, compound head) already separates equal forms with
    // " / ". Every form cell goes through this reader, so no renderer can put
    // the comma back.
    const FORM_SEPARATOR = ' / ';
    function formValues(val) {
      if (val == null) return [];
      const flat = Array.isArray(val) ? val.flat(Infinity) : [val];
      const out = [];
      for (const v of flat) {
        const s = typeof v === 'string' ? v : (typeof v === 'number' ? String(v) : '');
        if (s && !out.includes(s)) out.push(s);
      }
      return out;
    }
    function fmtForm(val) {
      const vals = formValues(val);
      return vals.length ? vals.join(FORM_SEPARATOR) : '-';
    }

    // The likestilte table states in words that its columns are
    // interchangeable; a slot table has to as well, or a cell holding three
    // forms still reads as editorial hesitation. Wording differs from
    // likestilte_note on purpose: there, every form in the table is a spelling
    // of the same word; here, only the forms sharing a CELL are interchangeable
    // — «kastar» and «kasta» are different slots. NB/NN only, because
    // «likestilt» is a concept in the Norwegian norm, not a general claim about
    // German or French variants.
    function multiFormNote(cells) {
      if (state.currentLang !== 'nb' && state.currentLang !== 'nn') return '';
      if (!cells.some((v) => formValues(v).length > 1)) return '';
      return `<p class="likestilte-note">${escapeHtml(t('cell_forms_note'))}</p>`;
    }

    // Gather every likestilt form for one declension cell across the top-level
    // forms.{ubestemt,bestemt} AND every forms.paradigms[] variant (where the
    // Ordbank likestilte former — boka/boken, gressa/gressene — actually live),
    // de-duplicated and joined with " / ". This is the cell the BØYNING table
    // shows; without the paradigms merge those cells render blank.
    function collectNounCellForms(forms, kind /* 'ubestemt'|'bestemt' */, num /* 'entall'|'flertall' */) {
      const vals = [];
      const push = (obj) => {
        if (obj && obj[num] != null) {
          const v = obj[num];
          if (Array.isArray(v)) vals.push(...v);
          else vals.push(v);
        }
      };
      push(forms[kind]);
      for (const p of (Array.isArray(forms.paradigms) ? forms.paradigms : [])) {
        if (p) push(p[kind]);
      }
      return [...new Set(vals.filter(Boolean))];
    }

    // Same cell, but across every allowed spelling of the lemma: the headword's
    // own paradigms plus each likestilt spelling's. A compound's last element
    // may itself be a variant pair (`-vei` / `-veg`), and a cell that listed
    // only the headword's forms would silently drop the other's.
    function collectNounCellFormsAllSpellings(entry, kind, num) {
      const vals = collectNounCellForms(entry.forms || {}, kind, num);
      const seen = new Set(vals);
      for (const f of (Array.isArray(entry.likestilteFormer) ? entry.likestilteFormer : [])) {
        for (const p of (f && Array.isArray(f.paradigms) ? f.paradigms : [])) {
          for (const v of collectNounCellForms(p || {}, kind, num)) {
            if (!seen.has(v)) { seen.add(v); vals.push(v); }
          }
        }
      }
      return vals;
    }

    function collectNounCell(forms, kind, num) {
      const uniq = collectNounCellForms(forms, kind, num);
      return uniq.length ? uniq.join(' / ') : '-';
    }

    // Likestilte skrivemåter (Språkrådet §15-4 pt. 1 + 3): show every allowed
    // spelling of the lemma, neutrally — the headword and its variants listed
    // as equals, none favoured. Data: entry.skrivemaater[{spelling,...}] (NB/NN
    // only, sourced from Bokmåls-/Nynorskordboka). Search resolves the variants;
    // this is the visible disclosure.
    function renderSkrivemaater(entry) {
      if (!Array.isArray(entry.skrivemaater) || !entry.skrivemaater.length) return '';
      if (state.currentLang !== 'nb' && state.currentLang !== 'nn') return '';
      const all = [entry.word, ...entry.skrivemaater.map((s) => s && s.spelling)].filter(Boolean);
      const seen = new Set();
      const display = [];
      for (const w of all) {
        const k = w.toLowerCase();
        if (!seen.has(k)) { seen.add(k); display.push(w); }
      }
      if (display.length < 2) return '';
      return `
        <div class="expanded-section">
          <h4>${t('result_skrivemaater')}</h4>
          <p>${display.map(escapeHtml).join(' / ')} <em>(${escapeHtml(t('result_skrivemaater_note'))})</em></p>
        </div>
      `;
    }

    // ── Likestilte former: head + bøyingstabell (Språkrådet §15-4) ──────────
    //
    // §15-4 requires a school dictionary to show the spelling norm in full and
    // NEUTRALLY: every allowed form present, and no form graphically favoured
    // over another. Showing `veg` only as a footnote under SKRIVEMÅTER while
    // the head and the table say `vei` fails that on both counts.
    //
    // Data: entry.likestilteFormer — the headword AND every likestilt spelling
    // in ONE array, in one shape, all built from the same ord.uib.no fetch
    // (papertek-vocabulary/scripts/enrich-skrivemaater-paradigms.mjs). The
    // renderer below walks that array with a single cell reader, so a form
    // cannot end up richer than its peers: there is no per-form code path.
    //
    // Layout is one COLUMN per allowed spelling. Side-by-side columns make the
    // neutrality a property of the table rather than something the CSS has to
    // keep promising — every form gets the same header cell and the same
    // reader. Long tables (nynorsk `ønske` has four spellings) scroll
    // horizontally rather than favouring the first columns.

    // Which row set applies, inferred from the paradigm's own shape rather
    // than a part-of-speech label (banks disagree on labels; shapes don't).
    function likestilteRowSpec(paradigm) {
      if (!paradigm) return null;
      if (paradigm.ubestemt || paradigm.bestemt) {
        return [
          { labelKey: 'decl_indef_sg', path: ['ubestemt', 'entall'] },
          { labelKey: 'decl_def_sg', path: ['bestemt', 'entall'] },
          { labelKey: 'decl_indef_pl', path: ['ubestemt', 'flertall'] },
          { labelKey: 'decl_def_pl', path: ['bestemt', 'flertall'] },
        ];
      }
      if (paradigm.positiv || paradigm.komparativ || paradigm.superlativ) {
        return [
          { labelKey: 'adj_pos_mf', path: ['positiv', 'maskulin_feminin'] },
          { labelKey: 'adj_pos_n', path: ['positiv', 'noytrum'] },
          { labelKey: 'adj_pos_def', path: ['positiv', 'bestemt'] },
          { labelKey: 'adj_pos_pl', path: ['positiv', 'flertall'] },
          { labelKey: 'tense_comparative', path: ['komparativ'] },
          { labelKey: 'tense_superlative', path: ['superlativ'] },
          { labelKey: 'superlative_definite', path: ['superlativ_bestemt'] },
        ];
      }
      if (paradigm.infinitiv || paradigm.presens || paradigm.preteritum) {
        return [
          { labelKey: 'tense_infinitive', path: ['infinitiv'] },
          { labelKey: 'tense_presens', path: ['presens'] },
          { labelKey: 'tense_preteritum', path: ['preteritum'] },
          // Samansett rad, ikkje ein slot — sjå perfektumRow i den vanlege
          // verbtabellen. Han må vere her òg, elles ville «avlede» (som får
          // §15-4-tabellen) mangle ei rad «tipse» har, som er nettopp den
          // ujamnheita denne runden finst for å fjerne.
          { labelKey: 'tense_present_perfect', path: ['perfektum_partisipp'], perfektum: true },
          { labelKey: 'tense_past_participle', path: ['perfektum_partisipp'] },
          { labelKey: 'tense_imperative', path: ['imperativ'] },
          { labelKey: 'tense_present_participle', path: ['presens_partisipp'] },
          { labelKey: 'tense_s_passive', path: ['s_passiv_infinitiv'] },
        ];
      }
      return null;
    }

    // Every value one spelling has in one slot, across all its paradigms
    // (a noun listed as both feminine and masculine contributes broa AND
    // broen), de-duplicated and joined — the same convention collectNounCell
    // already uses. THE only cell reader: every column goes through it.
    function likestiltCell(spelling, path) {
      const vals = [];
      for (const p of (spelling.paradigms || [])) {
        let v = p;
        for (const key of path) v = (v == null ? v : v[key]);
        if (v == null) continue;
        if (Array.isArray(v)) vals.push(...v);
        else vals.push(v);
      }
      const uniq = [...new Set(vals.filter(Boolean))];
      return uniq.length ? uniq.join(' / ') : '';
    }

    // True when this entry has two or more equally-valid spellings to show.
    // One spelling is not a variant question — the ordinary renderers cover it,
    // with their feature gating and pedagogy links intact.
    // Canonical f/m/n order, shared by the head pill, the likestilte table's
    // Kjønn row and the gender-column table. Ordbank lists paradigms in article
    // order, so an unsorted label prints «maskulin/feminin» under a pill saying
    // «feminin/maskulin» — the same fact twice, looking like a contradiction.
    const GENUS_ORDER = ['f', 'm', 'n'];
    const genusLabel = (g) => {
      const keys = { m: 'gender_m', f: 'gender_f', n: 'gender_n' };
      const sorted = [...new Set(Array.isArray(g) ? g : (g ? [g] : []))]
        .sort((a, b) => GENUS_ORDER.indexOf(a) - GENUS_ORDER.indexOf(b));
      return sorted.map((x) => (keys[x] ? t(keys[x]) : x)).join('/');
    };

    function hasLikestilteFormer(entry) {
      if (state.currentLang !== 'nb' && state.currentLang !== 'nn') return false;
      return Array.isArray(entry.likestilteFormer) && entry.likestilteFormer.length > 1;
    }

    // Ei kolonne per skrivemåte × KJØNN, når skrivemåtane ber meir enn eitt.
    //
    // Sju nynorske oppslag har to uavhengige valdimensjonar: skrivemåte
    // (jernbane/jarnbane) OG kjønn (hokjønn/hankjønn). Med éi kolonne per
    // skrivemåte unionerer cella kjønna, og kortet kom ut slik:
    //
    //     «Alle formene under er likestilte. Du kan bruke kva som helst av dei.»
    //                    jernbane                  jarnbane
    //     Bestemt ent.   jernbana / jernbanen      jarnbana / jarnbanen
    //     Ubestemt fl.   jernbaner / jernbanar     jarnbaner / jarnbanar
    //
    // Teke på ordet gjev det åtte kombinasjonar, og fire av dei er
    // ulisensierte: «jernbana … jernbanar» blandar hokjønnsentalet med
    // hankjønnsfleirtalet. I nynorsk skil f og m seg i FLEIRE celler enn
    // bunden eintal, så samanslåinga er ikkje uskuldig slik ho er i bokmål.
    //
    // Same feilen som den samanslåtte kjønnstabellen, ein etasje ned — og
    // kjønnstabellen (renderGenusColumns) trer til side nettopp for desse
    // sju, av di notene deira ville motseie kvarandre. Løysinga er å la
    // §15-4-tabellen bere begge dimensjonane sjølv.
    // ── Ko-variasjon, generelt over slot-stiar ────────────────────────────
    // Same rekninga som substantivtabellen gjer (sjå isFullProduct nedanfor),
    // men over kva stiliste som helst, så § 15-4-tabellen kan bruke ho for
    // substantiv, verb og adjektiv utan ein eigen kodeveg per ordklasse.
    function pathVals(obj, path) {
      let v = obj;
      for (const k of path) v = (v == null ? v : v[k]);
      return formValues(v);
    }
    function isFullProductOver(rows, paths) {
      const covered = rows.reduce(
        (a, r) => a + paths.reduce((m, p) => m * Math.max(pathVals(r, p).length, 1), 1),
        0,
      );
      const product = paths.reduce((a, p) => {
        const s = new Set();
        for (const r of rows) for (const v of pathVals(r, p)) s.add(v);
        return a * Math.max(s.size, 1);
      }, 1);
      return covered >= product;
    }
    // Slå saman dei paradigma som SEG IMELLOM utgjer eit fullt produkt. Utan
    // dette ville «leksikon»-forma — fem paradigme der fire er eitt fritt 2x2 —
    // få fem kolonnar som påstår fem uavhengige mønster.
    // Slår éi blokk saman til éi rad: union per slot, og kjønna samla i ei
    // liste. `genusLabel` sorterer og skriv dei ut som «hokjønn/hankjønn».
    function mergeParadigmBlock(block, paths) {
      if (block.length === 1) return block[0];
      const out = {};
      const genus = [...new Set(block.flatMap((r) => (Array.isArray(r.genus) ? r.genus : (r.genus ? [r.genus] : []))))];
      if (genus.length) out.genus = genus.length === 1 ? genus[0] : genus;
      for (const path of paths) {
        const seen = [];
        for (const r of block) for (const v of pathVals(r, path)) if (!seen.includes(v)) seen.push(v);
        if (!seen.length) continue;
        let o = out;
        for (let i = 0; i < path.length - 1; i++) o = (o[path[i]] ||= {});
        o[path[path.length - 1]] = seen.length === 1 ? seen[0] : seen;
      }
      return out;
    }

    function collapseParadigmBlocks(rows, paths) {
      let blocks = rows.map((r) => [r]);
      let merged = true;
      while (merged) {
        merged = false;
        for (let i = 0; i < blocks.length && !merged; i++) {
          for (let j = i + 1; j < blocks.length && !merged; j++) {
            const u = blocks[i].concat(blocks[j]);
            if (isFullProductOver(u, paths)) {
              blocks[i] = u;
              blocks.splice(j, 1);
              merged = true;
            }
          }
        }
      }
      return blocks;
    }
    // Færrast celler som skil kolonnane frå kvarandre, slik ordbøkene sjølve
    // gjer det: «armé (-éen) el. (-een)».
    //
    // Berre slotar som FAKTISK skil noko kjem med. Fyrste stien i stilista er
    // ubestemt eintal, som nesten alltid ER skrivemåten, så ei kumulativ
    // søking som tok stiane i rekkjefølgje gav overskrifta «armé · armé ·
    // arméen» — skrivemåten to gonger og ein slot som namngjev ingenting.
    function blockMarkers(blocks, paths) {
      if (blocks.length < 2) return blocks.map(() => '');
      const cell = (b, p) => [...new Set(b.flatMap((r) => pathVals(r, p)))].join(FORM_SEPARATOR);
      const useful = paths
        .map((p) => ({ p, n: new Set(blocks.map((b) => cell(b, p))).size }))
        .filter((x) => x.n > 1)
        // Mest utpeikande fyrst; ved likskap held stabil sortering
        // stilista si eiga rekkjefølgje, som er den pedagogiske.
        .sort((a, b) => b.n - a.n)
        .map((x) => x.p);
      const used = [];
      for (const p of useful) {
        used.push(p);
        const keys = blocks.map((b) => used.map((q) => cell(b, q)).join(' · '));
        if (new Set(keys).size === blocks.length && keys.every(Boolean)) return keys;
      }
      return blocks.map(() => '');
    }

    // Ei kolonne per skrivemåte × kjønn × BØYINGSMØNSTER.
    //
    // It. 92 gav tabellen skrivemåte × kjønn. Den tredje dimensjonen stod att,
    // og han er den same defekten eitt hakk ned: innanfor éi skrivemåte og eitt
    // kjønn kan lemmaet framleis ha fleire paradigme som KO-VARIERER, og cella
    // unionerte dei. Bokmål «armé» kom ut slik:
    //
    //                    armé                 arme
    //     Bestemt ent.   arméen / armeen      armeen
    //     Ubestemt fl.   arméer / armeer      armeer
    //     Bestemt fl.    arméene / armeene    armeene
    //
    // Ordbank fører lemmaet «armé» med TO paradigme — armé/arméen/arméer/arméene
    // og armé/armeen/armeer/armeene — så aksenten er valfri, men han følgjer
    // ordet gjennom heile bøyinga. «armé»-kolonna tilbaud åtte kombinasjonar
    // der to er lisensierte, under noten «du kan bruke kva som helst av dei».
    //
    // Målt 24.08.2026: 18 bokmål + 24 nynorsk oppslag, 54 grupper. Alle 54
    // kontrollerte mot Ordbank: settet vårt er identisk med hans, korkje
    // manglande eller ekstra rader, så dette er ei rein presentasjonssak.
    function likestilteColumns(forms, paths) {
      const genusSplits = forms.some((f) => {
        const g = (f.paradigms || []).map((p) => p && p.genus).filter(Boolean);
        return new Set(g).size > 1;
      });
      const columns = [];
      let paradigmSplit = false;
      for (const f of forms) {
        // Kjønnsgruppering er erstatta av KOLLAPSREGELEN: to paradigme blir
        // slegne saman berre når dei saman utgjer eit fullt kartesisk produkt.
        // For bokmål styrer kjønnet ofte berre bunden eintal, og då er cellene
        // uavhengige — «sykemeldinga/sykemeldingen» høyrer i éi celle, ikkje i
        // kvar sin kolonne. For nynorsk styrer kjønnet heile bøyingsklassen, og
        // då er det ikkje eit fullt produkt, og kolonnane står.
        //
        // Målt 24.08: 200 av 202 bokmålstabellar med kjønnssplitt blir smalare,
        // mot 1 av 14 nynorske. it. 88 målte den asymmetrien og handla ikkje på
        // henne; her fell ho ut av regelen i staden for å bli slått fast.
        const pars = (f.paradigms || []).filter(Boolean);
        const groups = [];
        if (genusSplits && pars.filter((p) => p.genus).length >= 2 && paths) {
          for (const blk of collapseParadigmBlocks(pars.filter((p) => p.genus), paths)) {
            const merged = mergeParadigmBlock(blk, paths);
            groups.push({ genus: merged.genus || null, pars: blk });
          }
        } else if (genusSplits && pars.filter((p) => p.genus).length >= 2) {
          const byGenus = new Map();
          for (const p of pars.filter((x) => x.genus)) {
            if (!byGenus.has(p.genus)) byGenus.set(p.genus, []);
            byGenus.get(p.genus).push(p);
          }
          for (const g of [...byGenus.keys()].sort((a, b) => GENUS_ORDER.indexOf(a) - GENUS_ORDER.indexOf(b))) {
            groups.push({ genus: g, pars: byGenus.get(g) });
          }
        } else {
          // Ein skrivemåte utan kjønnsmerkte paradigme får framleis éi kolonne;
          // å hoppe over han ville skjule ein heil skrivemåte for å rette
          // presentasjonen av ein annan.
          groups.push({ genus: null, pars });
        }
        for (const grp of groups) {
          // Del berre eit sett vi står inne for. `paradigmsComplete` blir sett
          // av papertek-vocabulary's verify-likestilte-paradigm-completeness.mjs
          // og berre der vårt paradigmesett er kontrollert identisk med
          // Ordbank sitt. Å dele eit UFULLSTENDIG sett byter over-generering
          // mot under-rapportering, og punkt 4 krev båe halvdelane.
          //
          // Målt 24.08.2026, og dette er grunnen flagget finst i staden for ein
          // ordklassesjekk: av 54 ko-varierande substantivgrupper er 54
          // identiske med Ordbank; av 226 verb-/adjektivgrupper har 74 FÆRRE
          // paradigme enn han («fôre»: vi 3, Ordbank 8). Verb og adjektiv får
          // difor framleis den samanslåtte cella, og same kodevegen lyser opp
          // for dei når setta er kompletterte.
          const blocks = (paths && grp.pars.length > 1 && f.paradigmsComplete)
            ? collapseParadigmBlocks(grp.pars, paths)
            : [grp.pars];
          const markers = (paths && blocks.length > 1) ? blockMarkers(blocks, paths) : blocks.map(() => '');
          if (blocks.length > 1) paradigmSplit = true;
          blocks.forEach((block, i) => {
            const col = { ...f, paradigms: block };
            if (grp.genus) { col.genus = [grp.genus]; col._genusOnly = grp.genus; }
            if (markers[i]) col._paradigmMarker = markers[i];
            columns.push(col);
          });
        }
      }
      return { columns, split: genusSplits, paradigmSplit };
    }

    function renderLikestilteFormer(entry) {
      if (!hasLikestilteFormer(entry)) return '';
      // Stilista må vere kjend FØR kolonnane blir delte, av di ko-variasjon
      // blir rekna over nettopp dei slotane tabellen viser. Difor eit fyrste
      // kall utan stiar berre for å finne ordklassa, og eit andre med dei.
      const probe = likestilteColumns(entry.likestilteFormer, null);
      const spec = likestilteRowSpec(probe.columns[0] && probe.columns[0].paradigms && probe.columns[0].paradigms[0]);
      if (!spec) return '';
      const { columns: forms, split, paradigmSplit } = likestilteColumns(
        entry.likestilteFormer,
        spec.map((r) => r.path),
      );

      // Same canonical order as genderDisplay() uses for the head pill (which
      // reads entry.genus, an f/m/n-sorted string). Ordbank lists paradigms in
      // article order, so an unsorted row would print «maskulin/feminin» under
      // a pill saying «feminin/maskulin» — the same fact twice, looking like a
      // contradiction to exactly the kind of close reader who assesses this.
      const anyGenus = forms.some((f) => Array.isArray(f.genus) && f.genus.length);

      let hasGap = false;
      const rows = spec
        .map((row) => {
          const cells = forms.map((f) => {
            const cell = likestiltCell(f, row.path);
            if (!row.perfektum || !cell) return cell;
            if (state.currentLang !== 'nb' && state.currentLang !== 'nn') return '';
            const aux = formValues(entry?.conjugations?.presens?.auxiliary ?? entry?.auxiliary)[0] || 'har';
            return cell.split(FORM_SEPARATOR).map((v) => `${aux} ${v}`).join(FORM_SEPARATOR);
          });
          // Drop a row no spelling fills; keep it (with "–") when some do, so a
          // genuine gap in one form stays visible instead of silently aligning.
          if (!cells.some(Boolean)) return '';
          // …and remember that it happened, so the note above the table can
          // stop promising the columns are interchangeable. `tungvint` is the
          // live case: article 71952 gives «tungvinnere / tungvinnest» to the
          // spelling `tungvinn` and article 71953 gives the spelling `tungvint`
          // no comparison at all. The dash is the truth; «Alle formene under er
          // likestilte — bruk hvilken som helst» printed above it is not.
          if (!cells.every(Boolean)) hasGap = true;
          // The kløyvd-infinitiv note belongs to the ROW, not to a column: it
          // is a fact about the verb, and every likestilt spelling of that verb
          // takes the same ending. Putting it in one cell would read as a
          // property of that spelling — the imbalance § 15-4 forbids.
          const note = row.path[0] === 'infinitiv' ? kloyvdNote(entry) : '';
          return `<tr><th scope="row">${escapeHtml(t(row.labelKey))}${note}</th>${
            cells.map((c) => `<td>${escapeHtml(c || '–')}</td>`).join('')
          }</tr>`;
        })
        .filter(Boolean)
        .join('');
      if (!rows) return '';

      // Når kjønnet står i kolonneoverskrifta, seier Kjønn-rada det same ein
      // gong til — og då som ein einskild verdi per kolonne, som ser ut som
      // ei innsnevring av pilla øvst på kortet.
      const genusRow = (anyGenus && !split)
        ? `<tr><th scope="row">${escapeHtml(t('likestilte_gender'))}</th>${
          forms.map((f) => `<td>${escapeHtml(genusLabel(f.genus) || '–')}</td>`).join('')
        }</tr>`
        : '';

      // Overskrifta må bere alle opplysningane utan å favorisere nokon:
      // skrivemåte, kjønn og bøyingsmønster står i same celle, i same form for
      // kvar kolonne.
      // Kjønnet i overskrifta berre når det SKIL kolonnane. Etter
      // kjønnskollapsen ber alle fire «sykemelding»-kolonnane lista
      // «feminin/maskulin», og då er «· feminin/maskulin» fire gonger berre
      // støy — skrivemåten er det som skil dei.
      const genusKeys = new Set(forms.map((f) => (Array.isArray(f._genusOnly) ? [...f._genusOnly].sort().join('+') : (f._genusOnly || ''))));
      const genusDistinguishes = genusKeys.size > 1;
      const head = (f) => [
        f.spelling,
        (genusDistinguishes && f._genusOnly) ? genusLabel(f._genusOnly) : '',
        f._paradigmMarker || '',
      ].filter(Boolean).join(' · ');

      // Noten må seie kva lesaren faktisk kan gjere. «Alle formene under er
      // likestilte — bruk kva som helst» er sant om kolonnane kvar for seg og
      // FALSK på tvers av dei så snart tabellen er delt, same om delinga kjem
      // av kjønn eller av bøyingsmønster.
      // Rekkjefølgja er med vilje: eit HOL er den sterkaste innskrenkinga, av di
      // ei kolonne med tankestrek ikkje er «éi fullstendig bøying» — så
      // gap-noten går føre kjønnsnoten når begge gjeld.
      const noteKey = hasGap ? 'likestilte_gap_note'
        : (split || paradigmSplit) ? 'likestilte_genus_note'
        : 'likestilte_note';

      return `
        <div class="expanded-section likestilte-section">
          <h4>${t('likestilte_heading')}</h4>
          <p class="likestilte-note">${escapeHtml(t(noteKey))}</p>
          <div class="likestilte-scroll">
            <table class="conjugation-table likestilte-table">
              <thead>
                <tr><th></th>${forms.map((f) => `<th scope="col">${escapeHtml(head(f))}</th>`).join('')}</tr>
              </thead>
              <tbody>${genusRow}${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    // The head: every allowed spelling, each in an identical `.result-word`
    // span. Same element, same class — so no stylesheet can favour one. The
    // first span stays the headword, which is what the audio button and the
    // compound back-navigation read via querySelector('.result-word').
    function renderHeadForms(entry) {
      if (!hasLikestilteFormer(entry)) {
        return `<span class="result-word">${escapeHtml(entry.word || '')}</span>`;
      }
      return entry.likestilteFormer
        .map((f) => `<span class="result-word">${escapeHtml(f.spelling)}</span>`)
        .join('<span class="result-word-sep" aria-hidden="true">/</span>');
    }

    // ── Bøying etter kjønn ────────────────────────────────────────────────
    // Some nouns are inflected as either of two genders, and in nynorsk the
    // gender governs the WHOLE declension class: «ei ape» takes aper/apene,
    // «ein ape» takes apar/apane. Measured 2026-08-23: 90 of 100 nynorsk
    // dual-gender nouns diverge in the plural as well as the definite
    // singular, against 12 of 514 in bokmål — where «boka / boken» really is
    // a free choice in one cell and the merged table tells the truth.
    //
    // The merged table did not. It put «minutten / minuttet» in one cell under
    // a note reading «du kan bruke kva som helst av dei», so a student could
    // read «apa … apar» straight off it — 2 of the 4 combinations it offers
    // are not licensed by any paradigm. Complete and neutral, and still
    // teaching an error: § 15-4 is about how optional forms are PRESENTED, so
    // structure is part of the obligation, not a nicety on top of it.
    //
    // Nynorskordboka answers the presentation question itself — «minutt
    // substantiv hankjønn eller inkjekjønn» over one column per gender — so
    // this mirrors it rather than inventing a house style. Columns come from
    // `forms.paradigms[]`, each carrying its own `genus` (papertek-vocabulary
    // rebuilt them per gender 2026-08-23; before that the paradigms were
    // chimeras, feminine singular sitting with masculine plural).
    const NOUN_SLOTS = [
      ['ubestemt', 'entall'],
      ['ubestemt', 'flertall'],
      ['bestemt', 'entall'],
      ['bestemt', 'flertall'],
    ];
    const slotVals = (p, kind, num) => formValues(p && p[kind] ? p[kind][num] : null);

    // Does this paradigm list cover the WHOLE Cartesian product of its cell
    // values? Then the cells really are independent and the merged table is
    // true: bokmål «alfabet» has four paradigms — alfabet/alfabeter ×
    // alfabeta/alfabetene — so every combination the merged cell offers is
    // licensed. Nynorsk «bunad» has two of four, and there the merged cell
    // invents «bunadar – bunadene».
    //
    // Ordbank ENUMERATING the product is what makes this decidable. The
    // handoff for iteration 97 recorded the opposite — that co-variation
    // «kan ikkje avgjerast mekanisk» because Ordbank lists paradigms and not
    // what co-varies. It lists both: an entry whose paradigm set is a strict
    // SUBSET of its own product is Ordbank saying those cells co-vary.
    function isFullProduct(pars) {
      const covered = pars.reduce(
        (a, p) => a + NOUN_SLOTS.reduce((m, [k, n]) => m * Math.max(slotVals(p, k, n).length, 1), 1),
        0,
      );
      const product = NOUN_SLOTS.reduce((a, [k, n]) => {
        const s = new Set();
        for (const p of pars) for (const v of slotVals(p, k, n)) s.add(v);
        return a * Math.max(s.size, 1);
      }, 1);
      return covered >= product;
    }

    // One column per LICENSED paradigm — the general form of the gender table.
    //
    // A gender split has earned columns since it. 88; the same-gender case is
    // the same defect with a different discriminator. Nynorsk «bunad» is one
    // masculine lemma with two patterns (-ar/-ane and -er/-ene), and the merged
    // table put «bunadar / bunader» over «bunadane / bunadene» under a note
    // reading «du kan bruke kva som helst av dei». Measured 2026-08-24: 110
    // bokmål + 158 nynorsk entries whose merged table offers combinations no
    // paradigm licenses.
    function paradigmColumns(entry) {
      const forms = entry && entry.forms;
      const all = (forms && Array.isArray(forms.paradigms)) ? forms.paradigms.filter(Boolean) : [];
      if (all.length < 2) return null;
      const tagged = all.filter((p) => typeof p.genus === 'string' && p.genus);
      const genusSplit = tagged.length === all.length && new Set(tagged.map((p) => p.genus)).size > 1;
      // A same-gender split earns columns only when the paradigm list is known
      // to be COMPLETE (`forms.paradigmsComplete`, written by
      // papertek-vocabulary's complete-noun-paradigms-from-ordbank.mjs from
      // Ordbank's own current paradigm_info). Splitting an INCOMPLETE list
      // trades an over-generating table for an under-reporting one — showing
      // two of four licensed patterns as though they were all of them is the
      // «fullstendig» half of punkt 4 failing instead of the neutral half.
      if (!genusSplit && !forms.paradigmsComplete) return null;
      if (!genusSplit && isFullProduct(all)) return null;
      // KJØNN BLIR SLEGE SAMAN NÅR — OG BERRE NÅR — DET IKKJE ER EIT VAL.
      //
      // it. 88 slo fast at kjønn aldri blir slege saman, og målte samstundes
      // kvifor: 90 av 100 nynorske tvikjønnsord skil seg i fleirtalet òg, mot
      // 12 av 514 i bokmål. Regelen vart brukt likt på begge, og då vart
      // bokmål overdelt — «sykemelding» fekk åtte kolonnar som skilde seg i
      // ÉI celle, og «bok» fire.
      //
      // Kollapsregelen frå it. 97 avgjer det av seg sjølv: to blokker blir
      // slegne saman berre når dei SAMAN utgjer eit fullt kartesisk produkt,
      // altså når kvar kombinasjon er lisensiert og cellene difor er
      // uavhengige. Nynorsk «ape» — apa/apene mot apen/apane — er ikkje eit
      // fullt produkt og står delt. Bokmål «bok» går frå fire kolonnar til to,
      // med «boka / boken» i éi celle, som er nettopp det Ordbank lisensierer.
      //
      // Målt 24.08: nb 11 av 28 kjønnstabellar og 200 av 202 §15-4-tabellar
      // blir smalare; nn 2 av 96 og 1 av 14. Asymmetrien it. 88 MÅLTE, men
      // ikkje handla på.
      const paths = NOUN_SLOTS.map(([k, n]) => [k, n]);
      const rows = collapseParadigmBlocks(all, paths)
        .map((b) => mergeParadigmBlock(b, paths))
        .sort((a, b) => GENUS_ORDER.indexOf(Array.isArray(a.genus) ? a.genus[0] : a.genus)
          - GENUS_ORDER.indexOf(Array.isArray(b.genus) ? b.genus[0] : b.genus));
      if (rows.length < 2) return null;
      return { rows, genusSplit };
    }

    // Kept for the two call sites that only ask «does this entry get columns
    // instead of the merged table?».
    const genusParadigms = (entry) => {
      const cols = paradigmColumns(entry);
      return cols ? cols.rows : null;
    };

    // What to write above each column. A gender split names the genders, as it
    // has since it. 88. Same-gender columns are told apart by the first cell
    // whose value differs across them — «-ar/-ane» against «-er/-ene» — which
    // is how Bokmålsordboka and Nynorskordboka themselves distinguish two
    // patterns of one lemma. Numbering them «Mønster 1 / 2» would rank forms
    // the norm holds equal.
    function columnLabels(rows, genusSplit) {
      // Markers are computed WITHIN each gender group, not across the whole
      // table. Nynorsk «elv» has four licensed patterns — feminine and
      // masculine, each with the -er/-ene and the -ar/-ane system — and no
      // single cell separates all four: the plural indefinite reads
      // elver/elvar/elvar/elver. A global marker therefore found none, and the
      // header came out «hokjønn · hokjønn · hankjønn · hankjønn», two pairs of
      // columns with the same name. Inside the feminine group the plural does
      // separate them, which is also what a reader needs told.
      //
      // The marker itself comes from blockMarkers — the SAME reader the § 15-4
      // table uses. Two markers meant two chances to print a column name that
      // says nothing, and the second one did.
      const order = [['ubestemt', 'flertall'], ['bestemt', 'flertall'], ['bestemt', 'entall'], ['ubestemt', 'entall']];
      // Nøkkelen må vere ein STRENG. Etter kjønnskollapsen er `genus` ei liste
      // («['f','m']»), og ein Map nøkla på lista sjølv gjev kvar rad si eiga
      // gruppe — då fann markørsøkinga ingenting å skilje, og «bok» fekk to
      // kolonnar som begge heitte «feminin/maskulin».
      const gKey = (r) => (genusSplit
        ? [...new Set(Array.isArray(r.genus) ? r.genus : (r.genus ? [r.genus] : []))].sort().join('+')
        : '');
      const groups = new Map();
      for (const r of rows) {
        const g = gKey(r);
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g).push(r);
      }
      const marker = new Map();
      for (const group of groups.values()) {
        if (group.length < 2) continue;
        const keys = blockMarkers(group.map((r) => [r]), order);
        group.forEach((r, i) => { if (keys[i]) marker.set(r, keys[i]); });
      }
      return rows.map((r) => {
        const parts = [];
        // Ei kolonne som ber BEGGE kjønna er ikkje eit kjønnsval lenger, så
        // etiketten seier det berre når han skil noko: to kolonnar med same
        // kjønnsliste blir skilde av forma, ikkje av kjønnet.
        const distinctG = new Set(rows.map(gKey)).size > 1;
        if (genusSplit && distinctG && r.genus) parts.push(genusLabel(r.genus));
        const m = marker.get(r);
        if (m) parts.push(m);
        return parts.join(' · ') || (r.genus ? genusLabel(r.genus) : '–');
      });
    }

    function renderGenusColumns(entry) {
      // A word with likestilte skrivemåter already owns a column table, and it
      // declares the genders in its Kjønn row. Drawing this one as well put two
      // paradigm tables on the card whose notes CONTRADICT each other — «du kan
      // bruke kva som helst av dei» directly above «dei kan ikkje blandast».
      // Seven nynorsk entries are in that overlap (jernbane, kjøkkenmaskin,
      // scene, skoleklasse, svømmehall, vennskap, hank).
      //
      // Standing down used to leave those seven with the merge this table
      // exists to fix — the likestilte table unioned genders WITHIN each
      // spelling column, the same defect one level down. Løyst i it. 92:
      // `likestilteColumns` gjev no éi kolonne per skrivemåte×kjønn
      // (jernbane·hokjønn, jernbane·hankjønn, jarnbane·hokjønn,
      // jarnbane·hankjønn), så §15-4-tabellen ber begge dimensjonane sjølv.
      // Denne tabellen trer framleis til side, men no fordi han er
      // OVERFLØDIG for dei sju, ikkje fordi han er umogleg å forlike.
      if (hasLikestilteFormer(entry)) return '';
      const cols = paradigmColumns(entry);
      if (!cols) return '';
      const { rows: pars, genusSplit } = cols;
      const labels = columnLabels(pars, genusSplit);
      const rows = [
        { labelKey: 'decl_indef_sg', path: ['ubestemt', 'entall'] },
        { labelKey: 'decl_def_sg', path: ['bestemt', 'entall'] },
        { labelKey: 'decl_indef_pl', path: ['ubestemt', 'flertall'] },
        { labelKey: 'decl_def_pl', path: ['bestemt', 'flertall'] },
      ]
        .map((row) => {
          // One reader for every column, as in renderLikestilteFormer: there is
          // no per-gender code path, so no column can end up richer than its
          // peer. fmtForm keeps « / » for a cell that genuinely holds several
          // forms WITHIN one gender.
          const cells = pars.map((p) => {
            let v = p;
            for (const key of row.path) v = (v == null ? v : v[key]);
            return fmtForm(v);
          });
          if (!cells.some(Boolean)) return '';
          return `<tr><th scope="row">${escapeHtml(t(row.labelKey))}</th>${
            cells.map((c) => `<td>${escapeHtml(c || '–')}</td>`).join('')
          }</tr>`;
        })
        .filter(Boolean)
        .join('');
      if (!rows) return '';
      // A pure gender split keeps the wording it has shipped with since it. 88
      // — «kan bøyast som to kjønn» is the true description there and says
      // more than a generic one would. But nynorsk «elv» has four columns,
      // feminine and masculine each in the -er/-ene and the -ar/-ane system,
      // and there «kan bøyast som to kjønn» names one of the two choices and
      // hides the other. One row per gender is the test.
      const perGenus = new Map();
      for (const p of pars) perGenus.set(p.genus || '', (perGenus.get(p.genus || '') || 0) + 1);
      const genusOnly = genusSplit && [...perGenus.values()].every((n) => n === 1);
      const heading = genusOnly ? 'genus_columns_heading' : 'paradigm_columns_heading';
      const note = genusOnly ? 'genus_columns_note' : 'paradigm_columns_note';
      return `
        <div class="expanded-section likestilte-section">
          <h4>${t(heading)}</h4>
          <p class="likestilte-note">${escapeHtml(t(note))}</p>
          <div class="likestilte-scroll">
            <table class="conjugation-table likestilte-table">
              <thead>
                <tr><th></th>${labels.map((l) => `<th scope="col">${escapeHtml(l)}</th>`).join('')}</tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        </div>
      `;
    }

    function renderNounForms(entry) {
      if (!entry.forms) return '';
      // A word with likestilte skrivemåter gets the neutral multi-column table
      // instead; rendering both would show the headword's paradigm twice and
      // re-introduce exactly the imbalance §15-4 forbids.
      if (hasLikestilteFormer(entry)) return '';
      // A gender-split noun gets renderGenusColumns instead. Drawing both would
      // show the paradigm twice — once merged under a neutrality note that is
      // false for it, once split — and the merged one is the misleading half.
      if (genusParadigms(entry)) return '';
      // Adjectives also carry a `forms` object, but in a different shape
      // ({ubestemt:{hankjønn_hunkjønn,intetkjønn}, …}), so the noun-cell reader
      // below would draw an all-dashes table. Their real paradigm is in
      // entry.declension — rendered by renderAdjectiveDeclension. (No noun
      // carries declension.positiv, so this is a safe discriminator.)
      if (entry.declension && entry.declension.positiv) return '';
      const forms = entry.forms;
      const hasParadigms = Array.isArray(forms.paradigms) && forms.paradigms.length > 0;
      if (!forms.ubestemt && !forms.bestemt && !hasParadigms) return '';
      // Cells here were already joined with " / " (collectNounCellForms), but
      // said nothing about WHY two forms share a cell. Same § 15-4 point as the
      // verb table — the note belongs to every slot table, not only the one
      // where the defect was noticed.
      const cells = [
        collectNounCellForms(forms, 'ubestemt', 'entall'),
        collectNounCellForms(forms, 'ubestemt', 'flertall'),
        collectNounCellForms(forms, 'bestemt', 'entall'),
        collectNounCellForms(forms, 'bestemt', 'flertall'),
      ];
      return `
        <div class="expanded-section">
          <h4>${t('result_conjugation')}</h4>
          ${multiFormNote(cells)}
          <table class="conjugation-table declension-table">
            <thead>
              <tr><th></th><th>${t('decl_singular')}</th><th>${t('decl_plural')}</th></tr>
            </thead>
            <tbody>
              <tr><td><strong>${t('decl_indefinite')}</strong></td><td>${escapeHtml(collectNounCell(forms, 'ubestemt', 'entall'))}</td><td>${escapeHtml(collectNounCell(forms, 'ubestemt', 'flertall'))}</td></tr>
              <tr><td><strong>${t('decl_definite')}</strong></td><td>${escapeHtml(collectNounCell(forms, 'bestemt', 'entall'))}</td><td>${escapeHtml(collectNounCell(forms, 'bestemt', 'flertall'))}</td></tr>
            </tbody>
          </table>
        </div>
      `;
    }

    // Positive-degree gender/number declension of an adjective, from
    // entry.declension.positiv ({maskulin,feminin,noytrum,flertall,bestemt}).
    // Komparativ/superlativ are handled separately by renderAdjectiveComparison.
    function renderAdjectiveDeclension(entry) {
      const decl = entry.declension;
      if (!decl || !decl.positiv) return '';
      // See renderNounForms — likestilte spellings own the bøyingstabell.
      if (hasLikestilteFormer(entry)) return '';
      // Positivformene bur i TO stader, akkurat som verbets infinitiv: i
      // `declension.positiv`, og i `declension.paradigms[].positiv` når ordet
      // har likestilte skrivemåtar eller eit uregelrett mønster. 48 bokmålske
      // og 22 nynorske celler stod TOMME i positiv med formene sine i
      // paradigms — «blå» viste korkje bestemt form eller fleirtal, «avslappet»
      // heller ikkje, og nn «liten» hadde heile fleirtalet (små / småe / vesle)
      // usynleg. Same feilklassa som iterasjon 46 sitt `if (Array.isArray(
      // table)) continue`, og same fiksen som verbtabellen fekk: slå saman
      // begge kjeldene per celle før ho blir teikna.
      const declParadigms = Array.isArray(decl.paradigms) ? decl.paradigms : [];
      const collect = (key) => {
        const vals = formValues(decl.positiv[key]);
        for (const par of declParadigms) {
          if (par && par.positiv && par.positiv[key] != null) vals.push(...formValues(par.positiv[key]));
        }
        const uniq = [...new Set(vals)];
        return uniq.length ? uniq : undefined;
      };
      const p = {
        maskulin: collect('maskulin'),
        feminin: collect('feminin'),
        noytrum: collect('noytrum'),
        bestemt: collect('bestemt'),
        flertall: collect('flertall'),
      };
      const rows = [];
      const cells = [];
      const add = (label, val) => {
        const text = formValues(val).join(FORM_SEPARATOR);
        if (!text) return;
        cells.push(val);
        rows.push(`<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(text)}</td></tr>`);
      };
      // Hankjønn and hunkjønn are identical for most adjectives — merge when
      // equal. Compared on the rendered forms, not with ===: a cell that holds
      // two likestilte forms is an ARRAY, and two arrays are never === even
      // when they list the same forms, so «open» split into two identical rows.
      const same = (a, b) => formValues(a).join('\u0000') === formValues(b).join('\u0000');
      if (p.maskulin && same(p.maskulin, p.feminin)) {
        add('Hankjønn/hunkjønn', p.maskulin);
      } else {
        add('Hankjønn', p.maskulin);
        add('Hunkjønn', p.feminin);
      }
      add('Intetkjønn', p.noytrum);
      // Bestemt form and flertall are usually the same (-e) — merge when equal.
      if (p.bestemt && same(p.bestemt, p.flertall)) {
        add('Bestemt form / flertall', p.bestemt);
      } else {
        add('Bestemt form', p.bestemt);
        add('Flertall', p.flertall);
      }
      if (!rows.length) return '';
      return `
        <div class="expanded-section">
          <h4>${t('result_conjugation')}</h4>
          ${multiFormNote(cells)}
          <table class="conjugation-table">${rows.join('')}</table>
        </div>
      `;
    }

    // Gradbøyinga bur i TO containerar, og 130 bokmålske + 98 nynorske oppslag
    // ber henne berre i `declension` — «ond» har komparativ «ondere / verre»
    // der og ingen `comparison` i det heile. Kortet las berre `comparison`, så
    // for dei oppslaga viste det ingen komparativ og ingen superlativ, med
    // komplette og Ordbank-verifiserte former i fila. Punkt 4 er eit krav om
    // det eleven SER. Union av begge containerane, ikkje val mellom dei: er
    // dei usamde, er begge formene lisensierte og høyrer i same cella.
    function gradeCell(entry, key, aliases, declPath) {
      const cmp = entry.comparison || {};
      const vals = [];
      for (const k of [key, ...aliases]) if (cmp[k] != null) vals.push(...formValues(cmp[k]));
      const d = entry.declension || {};
      const holder = d[declPath[0]];
      if (holder && holder[declPath[1]] != null) vals.push(...formValues(holder[declPath[1]]));
      const uniq = [...new Set(vals)];
      return uniq.length ? uniq : null;
    }

    function renderAdjectiveComparison(entry) {
      if (!entry.comparison && !entry.declension) return '';
      // See renderNounForms — likestilte spellings own the bøyingstabell
      // (komparativ/superlativ are rows in it).
      if (hasLikestilteFormer(entry)) return '';
      const sections = [];
      const komparativ = gradeCell(entry, 'komparativ', ['comparativo', 'comparative'], ['komparativ', 'alle']);
      if (isFeatureEnabled('grammar_comparative') && komparativ) {
        sections.push(`
          <div class="expanded-section">
            <h4>${t('tense_comparative')}</h4>
            <p>${escapeHtml(fmtForm(komparativ))}</p>
            ${multiFormNote([komparativ])}
          </div>
        `);
      }
      const superlativ = gradeCell(entry, 'superlativ', ['superlativo', 'superlative'], ['superlativ', 'ubestemt']);
      if (isFeatureEnabled('grammar_superlative') && superlativ) {
        sections.push(`
          <div class="expanded-section">
            <h4>${t('tense_superlative')}</h4>
            <p>${escapeHtml(fmtForm(superlativ))}</p>
            ${multiFormNote([superlativ])}
          </div>
        `);
      }
      return sections.join('');
    }

    // ── Audio ──────────────────────────────────────
    function cleanupAudio() {
      if (currentAudioBlobUrl) {
        URL.revokeObjectURL(currentAudioBlobUrl);
        currentAudioBlobUrl = null;
      }
    }

    async function playAudio(audioFilename, button) {
      if (!audioEnabled) return;
      if (currentAudio) {
        currentAudio.pause();
        cleanupAudio();
        currentAudio = null;
        results.querySelectorAll('.audio-btn.playing').forEach(btn => {
          btn.classList.remove('playing');
          btn.innerHTML = getPlayIcon();
        });
      }

      if (!audioFilename || !state.dictionary?._metadata) return;
      const lang = state.dictionary._metadata.language;
      const langsToTry = lang === 'nn' ? ['nn', 'nb'] : lang === 'nb' ? ['nb', 'nn'] : [lang];

      let audioUrl = null;
      if (vocab.getAudioFile) {
        for (const tryLang of langsToTry) {
          const blob = await vocab.getAudioFile(tryLang, audioFilename);
          if (blob) {
            audioUrl = URL.createObjectURL(blob);
            currentAudioBlobUrl = audioUrl;
            break;
          }
        }
      }

      if (!audioUrl && runtime.getURL) {
        for (const tryLang of langsToTry) {
          try {
            const url = runtime.getURL(`audio/${tryLang}/${audioFilename}`);
            const check = await fetch(url, { method: 'HEAD' });
            if (check.ok) { audioUrl = url; break; }
          } catch { /* not found */ }
        }
      }

      if (!audioUrl) {
        // Browser TTS fallback
        const wordEl = button.closest('.result-word-row')?.querySelector('.result-word');
        const word = wordEl?.textContent?.trim();
        if (word && self.speechSynthesis) {
          const VOICE_LANGS = { de: 'de', es: 'es', fr: 'fr', en: 'en', nb: 'nb', nn: 'nb', no: 'nb' };
          const synth = self.speechSynthesis;
          synth.cancel();
          const utterance = new SpeechSynthesisUtterance(word);
          utterance.lang = VOICE_LANGS[lang] || 'nb';
          const voices = synth.getVoices();
          const match = voices.find(v => v.lang.startsWith(utterance.lang));
          if (match) utterance.voice = match;
          button.classList.add('playing');
          button.innerHTML = getPauseIcon();
          utterance.onend = () => { button.classList.remove('playing'); button.innerHTML = getPlayIcon(); };
          utterance.onerror = () => { button.classList.remove('playing'); button.innerHTML = getPlayIcon(); };
          synth.speak(utterance);
        }
        return;
      }

      currentAudio = new Audio(audioUrl);
      button.classList.add('playing');
      button.innerHTML = getPauseIcon();

      currentAudio.play().catch(err => {
        // eslint-disable-next-line no-console
        console.warn('Audio playback failed:', err);
        button.classList.remove('playing');
        button.innerHTML = getPlayIcon();
        cleanupAudio();
        currentAudio = null;
      });
      currentAudio.addEventListener('ended', () => {
        button.classList.remove('playing');
        button.innerHTML = getPlayIcon();
        cleanupAudio();
        currentAudio = null;
      });
      currentAudio.addEventListener('error', () => {
        button.classList.remove('playing');
        button.innerHTML = getPlayIcon();
        cleanupAudio();
        currentAudio = null;
      });
    }

    // ── Lang switcher + labels ─────────────────────────────
    // Which language we are mid-switch to, or null. Lives OUTSIDE
    // rebuildLangSwitcher because switchLanguage is nested inside it and the
    // flag has to survive the rebuild it triggers.
    //
    // Why it exists: switching to German parses de.json — ~11.7 MB — and
    // rebuildLangSwitcher used to run only AFTER that finished, so for a second
    // or two the pill still showed the OLD language and nothing anywhere moved.
    // Users could not tell whether their click had registered. The load is not
    // the bug; the silence was.
    let langSwitchBusy = null;

    async function rebuildLangSwitcher() {
      if (!langSwitcher) return;

      const available = [];
      const bundled = vocab.BUNDLED_LANGUAGES || new Set(['nb', 'nn', 'en']);
      for (const lang of bundled) available.push(lang);

      if (vocab.listCachedLanguages) {
        const cached = await vocab.listCachedLanguages();
        for (const c of cached) {
          if (!available.includes(c.language)) available.push(c.language);
        }
      }

      // deps.getAllowedLanguages (optional fn): return an array of lang
      // codes to limit which pills render. Used by lockdown to scope the
      // sidepanel to NB + the active foreign language — Norwegian
      // students study one foreign language at a time, so French and
      // Spanish pills in a German test are noise. Returning null/undefined
      // means no filter (show all). The extension popup leaves it unset.
      let filtered = available;
      if (typeof deps.getAllowedLanguages === 'function') {
        const allowed = deps.getAllowedLanguages();
        if (Array.isArray(allowed) && allowed.length > 0) {
          const allowSet = new Set(allowed);
          filtered = available.filter(l => allowSet.has(l));
        }
      }

      filtered.sort((a, b) => {
        if (a === state.currentLang) return -1;
        if (b === state.currentLang) return 1;
        return langName(a).localeCompare(langName(b));
      });

      const flags = vocab.LANG_FLAGS || { de: '🇩🇪', es: '🇪🇸', fr: '🇫🇷', en: '🇬🇧', nn: 'NN', nb: 'NB' };

      // ── Foreign-language consolidation (Plan 41-01) ────────────────────
      // Norwegian students learn ONE foreign language at a time (German,
      // French, or Spanish). Showing all three at once wastes space; the
      // popup row now renders a SINGLE FL pill (the student's chosen
      // foreign language, or the currently-active one if it's an FL) and
      // a context-menu (right-click / Alt+ArrowDown) opens a picker for
      // the other FLs. The non-FL pills (NB / NN / EN) render as before.
      //
      // The consolidation only applies when the filtered set contains
      // 2+ FL pills — i.e. the extension popup with all six bundled.
      // Lockdown's getAllowedLanguages already scopes to NB + one FL, so
      // its filtered set has ≤ 1 FL pill and falls through unchanged.
      // FL_LANGS is kept for the render + switchLanguage closures below; the
      // consolidation MATH (which FLs to show, placeholder, sub-menu choices) is
      // computed by the shared helper so the dictionary and the Lær mer picker
      // stay in lock-step. Graceful fallback (show all flat) if the helper isn't
      // loaded — harmless downstream since lockdown scopes to ≤1 FL anyway, so
      // its consolidation is a no-op there regardless.
      const FL_LANGS = new Set(['de', 'fr', 'es']);
      let renderList = filtered;
      let consolidatedFLChoices = null;
      let useFLPlaceholder = false;
      if (typeof self.computeLangPickerModel === 'function') {
        const model = self.computeLangPickerModel({
          available: filtered,
          studentForeignLang: state.studentForeignLang,
          currentLang: state.currentLang,
          allowed: null, // `filtered` is already allowed-filtered + sorted above
          hasFirstFLPicker: typeof deps.onFirstFLPick === 'function',
        });
        renderList = model.displayLangs;
        consolidatedFLChoices = model.foreignChoices.length > 1 ? model.foreignChoices : null;
        useFLPlaceholder = model.showPlaceholder;
      }

      const pillsHtml = renderList.map(lang => {
        const isFL = FL_LANGS.has(lang);
        const showChevron = isFL && consolidatedFLChoices && consolidatedFLChoices.length > 1;
        const isBusy = lang === langSwitchBusy;
        return `
        <button class="lang-switch-btn ${lang === state.currentLang ? 'active' : ''} ${isFL ? 'is-fl' : ''}${isBusy ? ' busy' : ''}" data-lang="${lang}"${showChevron ? ' title="Høyreklikk for å bytte fremmedspråk"' : ''}${isBusy ? ' aria-busy="true"' : ''}>
          <span class="lang-switch-flag">${flags[lang] || ''}</span>
          ${langName(lang)}${showChevron ? ' <span class="lang-switch-chevron" aria-hidden="true">▾</span>' : ''}
        </button>
      `;
      }).join('');

      const placeholderHtml = useFLPlaceholder ? `
        <button class="lang-switch-btn is-fl-placeholder" data-lang="__fl_placeholder__" title="Velg fremmedspråket du lærer">
          <span class="lang-switch-flag" aria-hidden="true">🌐</span>
          Velg fr.språk
        </button>
      ` : '';

      langSwitcher.innerHTML = pillsHtml + placeholderHtml;

      // Inline dropdown for the FL picker — appended to langSwitcher and
      // toggled on right-click of the FL pill (and Alt+ArrowDown for keyboard).
      let dropdown = null;
      function closeDropdown() {
        if (dropdown && dropdown.parentNode) dropdown.parentNode.removeChild(dropdown);
        dropdown = null;
        document.removeEventListener('click', onDocClick, true);
        document.removeEventListener('keydown', onDocKey, true);
      }
      function onDocClick(e) {
        if (!dropdown) return;
        if (!dropdown.contains(e.target)) closeDropdown();
      }
      function onDocKey(e) {
        if (e.key === 'Escape') closeDropdown();
      }
      function openFLPicker(anchor) {
        if (!consolidatedFLChoices) return;
        closeDropdown();
        dropdown = document.createElement('div');
        dropdown.className = 'lang-fl-dropdown';
        dropdown.setAttribute('role', 'menu');
        dropdown.innerHTML = consolidatedFLChoices.map(l => `
          <button class="lang-fl-dropdown-item ${l === state.currentLang ? 'active' : ''}" data-lang="${l}" role="menuitem">
            <span class="lang-switch-flag">${flags[l] || ''}</span>
            <span>${langName(l)}</span>${l === state.currentLang ? ' <span class="lang-fl-dropdown-check" aria-hidden="true">✓</span>' : ''}
          </button>
        `).join('');
        // Position: viewport-fixed below the FL pill, attached to the
        // fullscreen element when one is active (lockdown's exam-mode
        // sidepanel runs the page in fullscreen — appending to document
        // .body in that mode renders OUTSIDE the visible layer, making
        // the dropdown invisible to the user). Inline max-z-index so the
        // dropdown is never hidden behind a host overlay even when CSS
        // (popup.css) isn't sync'd to the host.
        const rect = anchor.getBoundingClientRect();
        dropdown.style.position = 'fixed';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.top = (rect.bottom + 4) + 'px';
        dropdown.style.zIndex = '2147483646';
        (document.fullscreenElement || document.body).appendChild(dropdown);
        // After attaching, clamp horizontally so the dropdown doesn't run
        // off the right edge of the popup viewport.
        const dw = dropdown.offsetWidth || 140;
        if (rect.left + dw > window.innerWidth - 6) {
          dropdown.style.left = Math.max(6, window.innerWidth - dw - 6) + 'px';
        }
        // Wire dropdown click → switch lang + persist as studentForeignLang.
        dropdown.querySelectorAll('.lang-fl-dropdown-item').forEach(item => {
          item.addEventListener('click', async (ev) => {
            ev.stopPropagation();
            const lang = item.dataset.lang;
            closeDropdown();
            // Persist the picked FL as the student's chosen one even if it
            // matches the current — explicit user choice deserves to be saved.
            try { await deps.storage.set({ studentForeignLang: lang }); } catch (_) { /* lockdown shim may lack set */ }
            state.studentForeignLang = lang;
            if (lang === state.currentLang) { rebuildLangSwitcher(); return; }
            // Reuse the standard switch path by simulating a click on a hidden pill.
            await switchLanguage(lang);
          });
        });
        document.addEventListener('click', onDocClick, true);
        document.addEventListener('keydown', onDocKey, true);
      }

      // Extracted switch-language path so both .lang-switch-btn click and
      // dropdown-item click share the same flow.
      async function switchLanguage(lang) {
        // Lazy first-FL onboarding: when an FL pill is picked for the first
        // time (studentForeignLang unset) and the host provides a picker,
        // hand control to the host. The picker writes language +
        // studentForeignLang + grammar preset; we rehydrate state from
        // storage and re-render. Skipped in lockdown sidepanel (no
        // onFirstFLPick dep).
        if (
          FL_LANGS.has(lang) &&
          !state.studentForeignLang &&
          typeof deps.onFirstFLPick === 'function'
        ) {
          await deps.onFirstFLPick();
          try {
            if (deps.storage && typeof deps.storage.get === 'function') {
              // Plan 43-04: read lang.dictionary (per-surface key for the
              // dictionary surface). Legacy `language` key is migrated by the
              // service-worker / popup boot helper.
              const stored = await deps.storage.get(['studentForeignLang', 'lang.dictionary']);
              const sfl = stored?.studentForeignLang;
              if (sfl === 'de' || sfl === 'fr' || sfl === 'es') {
                state.studentForeignLang = sfl;
              }
              if (stored?.['lang.dictionary']) state.currentLang = stored['lang.dictionary'];
            }
          } catch (_) { /* lockdown shim may differ — non-fatal */ }
          updateLangLabels();
          rebuildLangSwitcher();
          return;
        }
        if (lang === state.currentLang) {
          // Even if we're already on this lang, the student may have just
          // landed here from a fresh install / new language and not yet
          // picked a grammar preset for it. Run the same first-time
          // grammar prompt path we use after a real switch.
          await maybePromptGrammarForLang(lang);
          return;
        }
        state.currentLang = lang;
        if (FL_LANGS.has(lang)) {
          state.studentForeignLang = lang;
          try { await deps.storage.set({ studentForeignLang: lang }); } catch (_) {}
        }
        if (deps.broadcastLanguageChange !== false) {
          // Plan 43-04: write lang.dictionary (per-surface key). Peer surfaces
          // (vocab-seam in extension, lockdown editor-toolbar's char-pill)
          // subscribe to chrome.storage.onChanged for `lang.dictionary` and
          // re-route automatically. LANGUAGE_CHANGED runtime broadcast retired.
          await deps.storage.set({ 'lang.dictionary': state.currentLang });
        }
        // Acknowledge the click BEFORE the ~11.7 MB parse, not after: paint the
        // new pill as active-and-busy right now so the student can see their
        // tap landed. state.currentLang is already the new one, so this render
        // is the real end state plus a busy marker — nothing to undo.
        langSwitchBusy = lang;
        await rebuildLangSwitcher();

        try {
          await loadDictionary(state.currentLang);
          await loadGrammarFeatures(state.currentLang);
        } finally {
          // Cleared in `finally` so a failed load can't strand the pill in a
          // permanent spinner — the busy marker is about the click, not about
          // whether the load succeeded.
          langSwitchBusy = null;
        }
        if (initGrammarSettings) initGrammarSettings();
        updateLangLabels();
        if (input?.value.trim()) performSearch(input.value.trim());
        if (deps.onLanguageChanged) deps.onLanguageChanged(state.currentLang);
        // Re-render so the consolidated pill picks up the new active FL, and
        // to clear the busy marker set above.
        rebuildLangSwitcher();
        // First-time grammar onboarding for the newly switched-to lang.
        await maybePromptGrammarForLang(lang);
      }

      // Ask the host to open the grammar-preset modal when the student
      // switches to a language they haven't yet graded. Honours an
      // existing-data fallback (legacy enabledGrammarFeatures map) so
      // existing installs aren't re-prompted on languages they already
      // configured. Skipped when the host doesn't supply the dep
      // (lockdown sidepanel, where settings live elsewhere).
      async function maybePromptGrammarForLang(lang) {
        if (typeof deps.onGrammarPickerNeeded !== 'function') return;
        if (!deps.storage || typeof deps.storage.get !== 'function') return;
        try {
          const stored = await deps.storage.get(['grammarPresetByLang', 'enabledGrammarFeatures']);
          const map = stored?.grammarPresetByLang || {};
          if (map[lang]) return; // already chosen (or skipped)
          // Legacy fallback: the student has a populated
          // enabledGrammarFeatures for this lang from before the
          // grammarPresetByLang map existed. Treat as already configured
          // so we don't re-prompt mid-session for a lang they've used.
          const legacy = stored?.enabledGrammarFeatures || {};
          const legacyForLang = legacy[lang];
          if (Array.isArray(legacyForLang) && legacyForLang.length > 0) return;
          await deps.onGrammarPickerNeeded(lang);
        } catch (_) { /* lockdown shim may differ — non-fatal */ }
      }

      langSwitcher.querySelectorAll('.lang-switch-btn').forEach(btn => {
        // Right-click on the FL pill opens the FL picker. Single click on
        // an already-active FL pill ALSO opens the picker (so touch users
        // without right-click can still discover the dropdown).
        if (btn.classList.contains('is-fl') && consolidatedFLChoices && consolidatedFLChoices.length > 1) {
          btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            openFLPicker(btn);
          });
          btn.addEventListener('keydown', (e) => {
            if (e.altKey && e.key === 'ArrowDown') {
              e.preventDefault();
              openFLPicker(btn);
            }
          });
        }
        btn.addEventListener('click', async () => {
          const lang = btn.dataset.lang;
          // Placeholder FL pill: route to the first-FL picker without
          // mutating state. The picker's resolve writes language +
          // studentForeignLang to storage; rebuildLangSwitcher re-runs
          // post-resolve and the placeholder branch drops out.
          if (lang === '__fl_placeholder__' && typeof deps.onFirstFLPick === 'function') {
            await deps.onFirstFLPick();
            try {
              if (deps.storage && typeof deps.storage.get === 'function') {
                // Plan 43-04: read lang.dictionary (per-surface key).
                const stored = await deps.storage.get(['studentForeignLang', 'lang.dictionary']);
                const sfl = stored?.studentForeignLang;
                if (sfl === 'de' || sfl === 'fr' || sfl === 'es') state.studentForeignLang = sfl;
                if (stored?.['lang.dictionary']) state.currentLang = stored['lang.dictionary'];
              }
            } catch (_) {}
            updateLangLabels();
            rebuildLangSwitcher();
            return;
          }
          // Touch fallback: tap on the active FL pill opens the picker.
          if (
            lang === state.currentLang &&
            btn.classList.contains('is-fl') &&
            consolidatedFLChoices && consolidatedFLChoices.length > 1
          ) {
            openFLPicker(btn);
            return;
          }
          // Delegate to switchLanguage so the lazy first-FL onboarding gate
          // and studentForeignLang write apply to direct pill clicks as
          // well as dropdown picks. Active-class repaint happens via
          // rebuildLangSwitcher inside switchLanguage.
          await switchLanguage(lang);
        });
      });
    }

    function updateLangLabels() {
      const dict = state.dictionary;
      if (!dict || !dict._metadata) return;
      // Sturla audit g2: the direction toggle used bare codes (NO/NB/NN) and
      // showed a generic "NO" for both written standards — confusing. Use full
      // standard names (Bokmål/Nynorsk/Tysk…), and collapse the monolingual case
      // to a single label so there's no pointless NO→NB / NB→NO pair (g1).
      const dictLang = dict._metadata.language;
      const dictName = langName(dictLang) || dictLang.toUpperCase();
      const uiLang = getUiLanguage();
      const uiName = langName(uiLang) || uiLang.toUpperCase();
      // nb/nn are monolingual same-language standards: hide the direction toggle
      // entirely (the standard pill is the only control). Foreign langs keep it.
      const isNbNn = state.currentLang === 'nb' || state.currentLang === 'nn';
      const isMonolingual = uiLang === dictLang;

      // Legacy span used by host templates; keep it populated with the name.
      container.querySelectorAll('.target-lang-code').forEach(el => {
        el.textContent = dictName;
      });

      const dirContainer = container.querySelector('.search-direction');
      if (isNbNn) {
        state.searchDirection = 'no-target';
        if (dirContainer) dirContainer.style.display = 'none';
        return; // nb/nn: standard pill is the only control; no direction toggle
      }
      if (dirContainer) dirContainer.style.display = '';

      if (dirNoTarget && dirTargetNo) {
        if (isMonolingual) {
          dirNoTarget.textContent = dictName;
          dirNoTarget.title = dictName;
          dirNoTarget.classList.add('active');
          dirTargetNo.style.display = 'none';
        } else {
          dirTargetNo.style.display = '';
          dirNoTarget.textContent = `${uiName} → ${dictName}`;
          dirNoTarget.title = `${uiName} → ${dictName}`;
          dirTargetNo.textContent = `${dictName} → ${uiName}`;
          dirTargetNo.title = `${dictName} → ${uiName}`;
          dirNoTarget.classList.toggle('active', state.searchDirection !== 'target-no');
          dirTargetNo.classList.toggle('active', state.searchDirection === 'target-no');
        }
      }
    }

    // ── Wiring ─────────────────────────────────
    let searchDebounceTimer;
    function onInput() {
      if (clearBtn) clearBtn.classList.toggle('hidden', !input.value);
      if (state.compoundNavStack) state.compoundNavStack.length = 0;
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => performSearch(input.value.trim()), 150);
    }
    function onClear() {
      if (input) input.value = '';
      if (clearBtn) clearBtn.classList.add('hidden');
      showPlaceholder();
    }
    function onDirNoTarget() {
      state.searchDirection = 'no-target';
      dirNoTarget.classList.add('active');
      dirTargetNo.classList.remove('active');
      if (input?.value.trim()) performSearch(input.value.trim());
    }
    function onDirTargetNo() {
      state.searchDirection = 'target-no';
      dirTargetNo.classList.add('active');
      dirNoTarget.classList.remove('active');
      if (input?.value.trim()) performSearch(input.value.trim());
    }

    if (input) input.addEventListener('input', onInput);
    if (clearBtn) clearBtn.addEventListener('click', onClear);
    if (dirNoTarget) dirNoTarget.addEventListener('click', onDirNoTarget);
    if (dirTargetNo) dirTargetNo.addEventListener('click', onDirTargetNo);

    if (input && typeof input.focus === 'function') input.focus();

    // Hydrate state.studentForeignLang from storage before first render so
    // the consolidated FL pill picks the right language. Best-effort: if
    // the host's storage shim doesn't surface get(), fall back silently.
    (async () => {
      try {
        if (deps.storage && typeof deps.storage.get === 'function') {
          const stored = await deps.storage.get(['studentForeignLang']);
          const v = stored?.studentForeignLang;
          if (v === 'de' || v === 'fr' || v === 'es') {
            state.studentForeignLang = v;
            rebuildLangSwitcher();
          }
        }
      } catch (_) { /* lockdown shim may differ — non-fatal */ }
    })();

    updateLangLabels();
    rebuildLangSwitcher();
    // Label the direction toggle for the initial (default) language too —
    // switchLanguage() updates it on every switch, but the first paint never
    // goes through a switch, which left the host template's hardcoded "NO →"
    // prefix in place (Sturla g2).
    updateLangLabels();

    return {
      destroy() {
        clearTimeout(searchDebounceTimer);
        if (currentAudio) { currentAudio.pause(); cleanupAudio(); currentAudio = null; }
        if (input) input.removeEventListener('input', onInput);
        if (clearBtn) clearBtn.removeEventListener('click', onClear);
        if (dirNoTarget) dirNoTarget.removeEventListener('click', onDirNoTarget);
        if (dirTargetNo) dirTargetNo.removeEventListener('click', onDirTargetNo);
      },
      refresh(query) {
        const q = query != null ? query : (input?.value || '').trim();
        if (q) performSearch(q); else showPlaceholder();
      },
      rebuildLangSwitcher,
      updateLangLabels,
    };
  }

  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiDictionaryView = { mount: mountDictionaryView };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mount: mountDictionaryView, mountDictionaryView, dropAdjectiveAdverbTwins };
  }
})();
