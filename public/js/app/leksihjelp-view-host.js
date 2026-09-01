/**
 * Skriv's host for Leksihjelp's shared dictionary view.
 *
 * Three-layer architecture, phase 9 step 4: the Leksihjelp panel mounts the
 * synced view module instead of drawing its own dictionary DOM, so the panel
 * is the same surface in Skriv, Lockdown and the extension. This file declares
 * only the inclusion contract — what Skriv mounts and with which dependencies.
 * Bugs in the view itself are fixed upstream and re-synced.
 *
 * Reference host: lockdown's
 * `public/js/writing-test/student/leksihjelp-sidepanel-host.js`.
 *
 * Where Skriv differs from Lockdown, and why:
 *
 *   - Vocabulary is BUNDLED, not cached in IndexedDB. `__lexiVocabStore`
 *     exists here but is empty (`getCachedLanguage` returns null,
 *     `listCachedLanguages` returns []), so every read goes to the JSON the
 *     service worker already serves from this origin.
 *   - No audio. The runtime declares `tts: false` and the sync strips audio
 *     metadata from the vocabulary payloads, so audio buttons are not
 *     rendered — no browser-TTS fallback either. Reading aloud in Skriv is
 *     the editor's own "Opplesing", not a dictionary surface.
 *   - No external dictionary links. Skriv's promise is that it sends nothing
 *     anywhere, so `externalLinksEnabled` stays false.
 *   - Language pills are dictionary-scoped: they must not change the language
 *     the pupil is WRITING in. That belongs to the document. A pill switch is
 *     mirrored into the bridge's lookup language so Skriv's own
 *     "Oppslagsspråk" select and the pills never disagree.
 *
 * Public API:
 *   mountLeksihjelpDictionary(container, { bridge }) → { destroy(), refresh(), setLanguage(lang) }
 */

import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';

/** Languages Skriv ships vocabulary for (public/js/leksihjelp/data/<lang>.json). */
const BUNDLED_LANGUAGES = ['nb', 'nn', 'en', 'de', 'es', 'fr'];

const LANG_FLAGS = { nb: '🇳🇴', nn: '🇳🇴', en: '🇬🇧', de: '🇩🇪', es: '🇪🇸', fr: '🇫🇷' };

const DATA_BASE = '/js/leksihjelp/data';

/** Raw dictionary payloads, kept per language for the page's lifetime. */
const rawDictCache = new Map();

function loadRawDictionary(lang) {
    if (!rawDictCache.has(lang)) {
        rawDictCache.set(lang, fetch(`${DATA_BASE}/${lang}.json`)
            .then(r => (r.ok ? r.json() : null))
            .catch(() => null));
    }
    return rawDictCache.get(lang);
}

/**
 * chrome.storage.local, promise-shaped the way the views expect.
 * A string key resolves to the VALUE, unconditionally — the runtime's store
 * omits absent keys, and resolving the `{}` wrapper instead would make every
 * "was this ever set?" check in the views truthy.
 */
function makeStorageAdapter(host) {
    return {
        get: (key) => new Promise((resolve) => {
            host.chrome.storage.local.get(key, (res) => {
                if (typeof key === 'string') resolve(res ? res[key] : undefined);
                else resolve(res);
            });
        }),
        set: (obj) => new Promise((resolve) => host.chrome.storage.local.set(obj, resolve)),
    };
}

function makeRuntimeAdapter(host) {
    return {
        sendMessage: (msg) => {
            try { return host.chrome.runtime.sendMessage(msg); }
            catch (_) { return undefined; }
        },
        getURL: (rel) => {
            try { return host.chrome.runtime.getURL(rel); }
            catch (_) { return rel; }
        },
    };
}

function makeI18n(host) {
    const i18n = host.__lexiI18n || {};
    return {
        t: (...args) => (i18n.t ? i18n.t(...args) : args[0]),
        getUiLanguage: () => (i18n.getUiLanguage ? i18n.getUiLanguage() : 'nb'),
        // Language names come from Skriv's own locale files, not the vendored
        // ones, so a language is called the same thing in the dictionary pills
        // as in the Skrivespråk/Oppslagsspråk selects beside them.
        langName: (lang) => {
            const langName = t(`language.${lang}`);
            return langName && !langName.startsWith('language.') ? langName
                : (i18n.langName ? i18n.langName(lang) : lang);
        },
    };
}

/** Shared mutable state. The view reads and writes it; the host refills it on
 *  a language change. Field names are the view's contract — do not rename. */
function buildViewState(initialLang) {
    return {
        currentLang: initialLang,
        searchDirection: 'no-target', // hyphen, not underscore — the view's enum
        dictionary: null,
        noDictionary: null,
        allWords: [],
        noWords: [],
        inflectionIndex: null,
        nounGenusMap: null,
        noNounGenusMap: null,
        nbEnrichmentIndex: null,
        nbTranslationIndex: null,
        nbIdToTargetIndex: null,
        currentIndexes: null,
        compoundNavStack: [],
    };
}

function buildVocabAdapter(host) {
    const base = host.__lexiVocab || {};
    const builder = host.__lexiDictStateBuilder || null;
    const core = host.__lexiVocabCore || null;

    return {
        ...base,
        BUNDLED_LANGUAGES: new Set(BUNDLED_LANGUAGES),
        LANG_FLAGS,
        // Skriv's vocabulary ships with the app, so every bundled language is
        // always "cached" — there is nothing to download and nothing to miss.
        listCachedLanguages: () => Promise.resolve([...BUNDLED_LANGUAGES]),
        getCachedLanguage: (lang) => loadRawDictionary(lang),
        // Audio is stripped at sync time; say so rather than letting the view
        // probe an IndexedDB store that is empty here.
        hasAudioCached: () => Promise.resolve(false),
        getAudioFile: () => Promise.resolve(null),
        getTranslation: (entry, state, uiLang) =>
            (builder ? builder.getTranslation(entry, state, uiLang) : (entry?.translation || '')),
        generatedFromRefs: (entry) => (builder ? builder.generatedFromRefs(entry) : []),
        norwegianInfinitive: (form) => (builder ? builder.norwegianInfinitive(form) : null),
        decomposeCompound: (q, nounGenusMap, lang) =>
            (core?.decomposeCompound ? core.decomposeCompound(q, nounGenusMap, lang) : null),
        // The compound card and its click-through navigation gate hard on
        // classifyCompound; without it the card never renders.
        classifyCompound: (q, nounGenusMap, isAttested, lang) =>
            (core?.classifyCompound ? core.classifyCompound(q, nounGenusMap, isAttested, lang) : null),
        isOrdbankWord: (word) => {
            try { return !!base.getValidWords?.()?.has?.(String(word).toLowerCase()); }
            catch (_) { return false; }
        },
    };
}

/**
 * The dictionary scaffold, mirroring upstream's popup markup for the elements
 * the view queries (#search-input, #search-clear, #dir-*, #lang-switcher,
 * #search-results). popup-views.css styles it, so the panel looks the same
 * here as everywhere else.
 */
function dictionaryScaffoldHTML(t) {
    return `
        <section id="view-dictionary" class="view active">
          <div class="search-container">
            <div class="search-box glass">
              <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input type="text" id="search-input" autocomplete="off" spellcheck="false"
                placeholder="${escapeHtml(t('search_placeholder') || 'Søk etter ord...')}">
              <button id="search-clear" class="search-clear hidden" aria-label="${escapeHtml(t('search_clear') || 'Tøm søk')}">&times;</button>
            </div>
            <div id="lang-switcher" class="lang-switcher"></div>
            <div class="search-direction glass-subtle">
              <button id="dir-no-target" class="dir-btn active">
                NO → <span class="target-lang-code"></span>
              </button>
              <button id="dir-target-no" class="dir-btn">
                <span class="target-lang-code"></span> → NO
              </button>
            </div>
          </div>
          <div id="search-results" class="results"></div>
        </section>
    `;
}

/**
 * Mount the shared dictionary view into `container`.
 *
 * @param {HTMLElement} container - host element; receives the sidepanel root
 * @param {{ bridge: object }} options
 * @returns {{ destroy: Function, refresh: Function, setLanguage: Function }}
 */
export function mountLeksihjelpDictionary(container, { bridge }) {
    const host = window;
    const i18n = makeI18n(host);
    const builder = host.__lexiDictStateBuilder || null;

    // popup-views.css is hard-scoped under #leksihjelp-sidepanel-root, and its
    // dark rules key off an ancestor [data-theme="dark"]. Skriv's own theming
    // is Tailwind's .dark class on <html>, so the host mirrors it here.
    const root = document.createElement('div');
    root.id = 'leksihjelp-sidepanel-root';
    root.innerHTML = dictionaryScaffoldHTML(i18n.t);
    container.appendChild(root);

    function syncTheme() {
        const dark = document.documentElement.classList.contains('dark');
        container.setAttribute('data-theme', dark ? 'dark' : 'light');
    }
    syncTheme();
    const themeObserver = new MutationObserver(syncTheme);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    const dictRoot = root.querySelector('#view-dictionary');
    const viewState = buildViewState(bridge.getLookupLang());

    async function loadDictionary(lang) {
        const raw = await loadRawDictionary(lang);
        if (!raw) return;

        // Two-way lookup needs the Norwegian side as well, so a pupil looking
        // up German can still search from Norwegian.
        const uiLang = i18n.getUiLanguage() || 'nb';
        const noLang = uiLang === 'nn' ? 'nn' : 'nb';
        const sisterRaw = lang !== noLang ? await loadRawDictionary(noLang) : null;

        viewState.currentLang = lang;
        viewState.dictionary = raw;
        viewState.noDictionary = sisterRaw;
        if (builder) {
            Object.assign(viewState, builder.buildDictState({
                raw,
                sisterRaw,
                lang,
                noLang,
                vocabCore: host.__lexiVocabCore,
            }));
        }
    }

    let viewHandle = null;
    if (host.__lexiDictionaryView?.mount && dictRoot) {
        viewHandle = host.__lexiDictionaryView.mount(dictRoot, {
            state: viewState,
            vocab: buildVocabAdapter(host),
            storage: makeStorageAdapter(host),
            runtime: makeRuntimeAdapter(host),
            t: i18n.t,
            getUiLanguage: i18n.getUiLanguage,
            langName: i18n.langName,
            // Skriv's settings tab owns the grammar-feature toggles; the
            // dictionary honours whatever they resolved to.
            isFeatureEnabled: (featureId) => {
                try { return host.__lexiVocab?.isFeatureEnabled?.(featureId) !== false; }
                catch (_) { return true; }
            },
            getAllowedPronouns: () => null,
            loadDictionary,
            loadGrammarFeatures: async (lang) => {
                try {
                    const res = await fetch(`${DATA_BASE}/grammarfeatures-${lang}.json`);
                    return res.ok ? res.json() : null;
                } catch (_) { return null; }
            },
            initGrammarSettings: () => { /* owned by Skriv's settings tab */ },
            // See the header: no audio, and no links off this origin.
            audioEnabled: false,
            externalLinksEnabled: false,
            BACKEND_URL: '',
            // The pills pick which dictionary to read, never which language
            // the pupil writes in.
            broadcastLanguageChange: false,
            getAllowedLanguages: () => [...BUNDLED_LANGUAGES],
            onLanguageChanged: (lang) => {
                // Keep Skriv's own "Oppslagsspråk" select in step with the pills.
                try { bridge.setLookupLang(lang); } catch (_) { /* non-fatal */ }
            },
        });
    }

    // Skriv's select and the view's pills are two controls over one value.
    const unsubscribeLookup = bridge.onLookupLangChange((lang) => {
        if (!viewHandle || lang === viewState.currentLang) return;
        loadDictionary(lang).then(() => {
            viewHandle.rebuildLangSwitcher?.();
            viewHandle.updateLangLabels?.();
            viewHandle.refresh?.();
        });
    });

    // First fill, so a search works before any language switch.
    const ready = loadDictionary(viewState.currentLang).then(() => {
        viewHandle?.rebuildLangSwitcher?.();
        viewHandle?.updateLangLabels?.();
    });

    return {
        ready,
        refresh(query) { viewHandle?.refresh?.(query); },
        setLanguage(lang) { return loadDictionary(lang); },
        destroy() {
            try { unsubscribeLookup?.(); } catch (_) { /* already gone */ }
            themeObserver.disconnect();
            try { viewHandle?.destroy?.(); } catch (_) { /* already gone */ }
            if (root.parentNode) root.parentNode.removeChild(root);
        },
    };
}
