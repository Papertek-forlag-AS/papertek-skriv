/**
 * Leksihjelp — Language Detector (browser IIFE)
 *
 * Detects whether a piece of text is more likely Norwegian (nb/nn) or in one
 * of the four foreign languages this extension supports (de / en / fr / es).
 * Used by:
 *   - floating-widget.js: auto-routing the TTS bubble to the right voice
 *     when the student selects text in a webpage. Removes the need to flip
 *     the language picker before clicking play.
 *   - lockdown's editor TTS (consumes via window.__lexiDetectLanguage):
 *     same auto-route for the student's own writing — pronouncing Norwegian
 *     text with a German voice was the most-reported confusion in the
 *     teacher feedback round on 2026-05-06.
 *
 * Algorithm (intentionally simple):
 *   1. Distinctive characters dominate when present.
 *      - äöüß  → German       (only DE among our 6 langs uses these)
 *      - ñ¿¡  → Spanish      (¿¡ are Spanish-only inverted punctuation)
 *      - ç + accented vowels in French-only patterns → French
 *      - æøå  → Norwegian
 *      Even a one-word selection like "Mädchen" or "español" produces an
 *      unambiguous classification this way; vocab matching can't reliably
 *      rule on so few tokens.
 *   2. If no distinctive characters appear (typical for nb-vs-en, since
 *      both share the same alphabet), tokenize and score against per-language
 *      vocab Sets derived from the bundled extension/data/<lang>.json files.
 *      The winning language must score ≥0.50 AND beat the runner-up by
 *      ≥0.15 to return high-confidence — this prevents flapping on cognate-
 *      heavy near-tie cases (es/fr cognates, nb/nn shared lexicon).
 *   3. Selections shorter than 3 tokens with no distinctive chars are
 *      considered too noisy to override the user's picker. We return null
 *      and the caller falls back to the explicit picker setting.
 *
 * Vocab data source (v3.0.2):
 *   The hardcoded *_FUNCWORDS sets from v3.0.1 duplicated vocab data we
 *   already ship in extension/data/<lang>.json. v3.0.2 derives the
 *   per-language word Sets at runtime by walking every bank in those JSON
 *   files and collecting `entry.word.toLowerCase()` across all banks. This
 *   covers function words (which live in pronounsbank/articlesbank/
 *   generalbank for de/es/fr) AND content words, so detection precision
 *   improves with every vocab-data sync without code changes here. The
 *   loads are fire-and-forget at module-load; detector calls before
 *   resolution fall back to the distinctive-char path.
 *
 * Memory cost: ~6 Sets of 1000–2000 word strings each, ~1–3 MB total.
 * Acceptable on every modern Chromebook.
 */
(function () {
    'use strict';

    // Character classes that occur in only one of our supported languages.
    const NB_DISTINCTIVE = /[æøåÆØÅ]/;
    const DE_DISTINCTIVE = /[äöüßÄÖÜ]/;
    const ES_DISTINCTIVE = /[ñ¿¡Ñ]/;
    const FR_DISTINCTIVE = /[çÇ]|[àèùêîôœ]/;

    const DETECTION_LANGS = ['de', 'es', 'fr', 'en', 'nb', 'nn'];

    // lang → Set<string> of lowercased words drawn from every bank in
    // extension/data/<lang>.json. Populated lazily; absent until the fetch
    // resolves. Detector calls before resolution skip the vocab-scoring path.
    const detectionVocabs = new Map();
    const detectionVocabPromise = new Map();

    function buildVocabSet(json) {
        const set = new Set();
        if (!json || typeof json !== 'object') return set;
        for (const bankName of Object.keys(json)) {
            if (bankName.startsWith('_')) continue;
            const bank = json[bankName];
            if (!bank || typeof bank !== 'object') continue;
            for (const entry of Object.values(bank)) {
                if (entry && typeof entry.word === 'string' && entry.word) {
                    set.add(entry.word.toLowerCase());
                }
            }
        }
        return set;
    }

    function loadDetectionVocab(lang) {
        if (detectionVocabs.has(lang)) return Promise.resolve(detectionVocabs.get(lang));
        if (detectionVocabPromise.has(lang)) return detectionVocabPromise.get(lang);
        const url = (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL)
            ? chrome.runtime.getURL('data/' + lang + '.json')
            : null;
        if (!url || typeof fetch !== 'function') return Promise.resolve(null);
        const p = fetch(url)
            .then(function (r) { return r.json(); })
            .then(function (json) {
                const set = buildVocabSet(json);
                detectionVocabs.set(lang, set);
                detectionVocabPromise.delete(lang);
                return set;
            })
            .catch(function () {
                detectionVocabPromise.delete(lang);
                return null;
            });
        detectionVocabPromise.set(lang, p);
        return p;
    }

    function ensureDetectionVocabsLoaded() {
        for (const lang of DETECTION_LANGS) {
            loadDetectionVocab(lang);
        }
    }

    /**
     * Run the detector.
     *
     * @param {string} text         Free text to classify.
     * @param {Object} [opts]
     * @param {string} [opts.targetLang]   Active target language code: 'de'|'en'|'fr'|'es'.
     * @param {Set<string>} [opts.targetVocab]
     *                                     Lowercase word set for the target language.
     *                                     Caller supplies this from __lexiVocab.getValidWords().
     * @returns {{lang: string, confidence: 'high'|'medium', reason: string} | null}
     *          null = ambiguous, defer to picker.
     */
    function detectLanguage(text, opts) {
        opts = opts || {};
        if (typeof text !== 'string') return null;
        const trimmed = text.trim();
        if (!trimmed) return null;

        // 1. Distinctive characters give a high-confidence signal regardless
        //    of which target language the student currently has selected.
        if (DE_DISTINCTIVE.test(text)) {
            return { lang: 'de', confidence: 'high', reason: 'distinctive-de' };
        }
        if (ES_DISTINCTIVE.test(text)) {
            return { lang: 'es', confidence: 'high', reason: 'distinctive-es' };
        }
        if (FR_DISTINCTIVE.test(text)) {
            return { lang: 'fr', confidence: 'high', reason: 'distinctive-fr' };
        }
        if (NB_DISTINCTIVE.test(text)) {
            return { lang: 'nb', confidence: 'high', reason: 'distinctive-nb' };
        }

        // 2. No distinctive characters. Tokenize on Unicode letter runs.
        const tokens = trimmed.toLowerCase().match(/[\p{L}'’]+/gu) || [];
        if (tokens.length < 3) {
            return null;
        }

        // 2a. Vocab-derived scoring across every loaded language. Each lang's
        //     Set comes from its full bundled JSON, so common function words
        //     (articles, pronouns, prepositions) AND content words contribute.
        if (detectionVocabs.size >= 2) {
            const scores = [];
            for (const [lang, vocabSet] of detectionVocabs) {
                let hits = 0;
                for (const tok of tokens) {
                    if (vocabSet.has(tok)) hits++;
                }
                scores.push({ lang: lang, hits: hits, score: hits / tokens.length });
            }
            scores.sort(function (a, b) { return b.score - a.score; });
            const top = scores[0];
            const runnerUp = scores[1];
            if (top.score >= 0.50 && (top.score - runnerUp.score) >= 0.15) {
                const gapPP = ((top.score - runnerUp.score) * 100).toFixed(0);
                return {
                    lang: top.lang,
                    confidence: 'high',
                    reason: 'vocab-match ' + top.hits + '/' + tokens.length
                        + ' (' + top.lang + ' beat ' + runnerUp.lang + ' by ' + gapPP + 'pp)'
                };
            }
        }

        // 3. Fallback: caller-supplied single-target vocab match (medium).
        const targetVocab = opts.targetVocab;
        const targetLang = opts.targetLang;
        if (!targetVocab || typeof targetVocab.has !== 'function'
            || !targetLang || targetLang === 'nb' || targetLang === 'nn') {
            return null;
        }

        let hits = 0;
        for (const tok of tokens) {
            if (targetVocab.has(tok)) hits++;
        }
        const hitRate = hits / tokens.length;

        if (hitRate >= 0.4) {
            return {
                lang: targetLang,
                confidence: 'medium',
                reason: 'vocab-match ' + hits + '/' + tokens.length
            };
        }
        return {
            lang: 'nb',
            confidence: 'medium',
            reason: 'vocab-miss ' + hits + '/' + tokens.length
        };
    }

    /**
     * Convenience wrapper that pulls the active target vocab from
     * __lexiVocab on the same `self` so callers don't have to.
     */
    function detectLanguageAuto(text) {
        const vocab = self.__lexiVocab;
        if (!vocab) {
            // Even without __lexiVocab, the lazy detection vocabs may have
            // loaded — try detection with no caller-supplied target.
            return detectLanguage(text, {});
        }
        const targetLang = (typeof vocab.getLanguage === 'function')
            ? vocab.getLanguage()
            : null;
        const validWords = (typeof vocab.getValidWords === 'function')
            ? vocab.getValidWords()
            : null;
        return detectLanguage(text, {
            targetLang: targetLang,
            targetVocab: validWords
        });
    }

    // Expose. Both the detailed (caller-supplies-vocab) form and the
    // auto-vocab form are useful: floating-widget.js already has the vocab
    // in scope and can call the detailed form; lockdown only sees the
    // window global and uses the auto form.
    self.__lexiDetectLanguage = detectLanguageAuto;
    self.__lexiDetectLanguageWithVocab = detectLanguage;

    // Test-only seam: lets the node test runner inject pre-built vocab Sets
    // without depending on chrome.runtime.getURL/fetch.
    self.__lexiDetectLanguageSetVocabsForTest = function (entries) {
        detectionVocabs.clear();
        detectionVocabPromise.clear();
        if (!entries) return;
        for (const [lang, set] of entries) {
            detectionVocabs.set(lang, set);
        }
    };
    self.__lexiDetectLanguageBuildVocabSet = buildVocabSet;

    // Fire-and-forget: kick off all six language vocab loads at module init.
    // First detector calls before resolution fall back to distinctive-char +
    // single-target paths. After resolution every call uses the full set.
    ensureDetectionVocabsLoaded();
})();
