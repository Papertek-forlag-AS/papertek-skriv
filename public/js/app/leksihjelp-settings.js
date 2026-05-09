/**
 * Leksihjelp settings drawer (Skriv-side).
 *
 * Slide-in right panel with the four leksihjelp controls:
 *   - Eksamensmodus (toggle)
 *   - Skrivespråk (drives spell-check + special-chars)
 *   - Oppslagsspråk (drives dictionary)
 *   - Grammatikknivå — placeholder until vendored grammar-features-section.js arrives
 *
 * Hidden entirely when the bridge reports status === 'extension'; in that
 * mode the extension's popup owns these settings and Skriv yields
 * (single source of truth, see docs/leksihjelp-integration.md §2).
 *
 * Public API mirrors the German hint drawer so the editor wires it the
 * same way:
 *   initLeksihjelpSettings(host, bridge) → { open, close, toggle, destroy }
 */

import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';

const LANGS = [
    { id: 'nb', label: 'Bokmål' },
    { id: 'nn', label: 'Nynorsk' },
    { id: 'en', label: 'Engelsk' },
    { id: 'de', label: 'Tysk' },
    { id: 'es', label: 'Spansk' },
    { id: 'fr', label: 'Fransk' },
];

function langOptions(activeId) {
    return LANGS.map(l =>
        `<option value="${l.id}" ${l.id === activeId ? 'selected' : ''}>${escapeHtml(l.label)}</option>`
    ).join('');
}

// Inject CSS for the vendored grammar-features-section once per page.
// The vendored module emits `.grammar-category`, `.grammar-features-list`,
// and `.grammar-feature-item` classes without styles of its own (the
// extension popup styles them in popup.css, which we don't ship). Skriv
// provides a small tailored style block.
function ensureGrammarFeaturesStyles() {
    if (document.getElementById('skriv-leksihjelp-grammar-features-styles')) return;
    const style = document.createElement('style');
    style.id = 'skriv-leksihjelp-grammar-features-styles';
    style.textContent = `
        .leksihjelp-grammar-features .grammar-category { margin-bottom: 0.5rem; }
        .leksihjelp-grammar-features .grammar-category-title {
            font-size: 0.7rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #78716c;
            margin: 0.5rem 0 0.25rem;
        }
        html.dark .leksihjelp-grammar-features .grammar-category-title { color: #a8a29e; }
        .leksihjelp-grammar-features .grammar-features-list {
            display: flex;
            flex-direction: column;
            gap: 0.125rem;
        }
        .leksihjelp-grammar-features .grammar-feature-item {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.25rem 0;
            font-size: 0.8rem;
            cursor: pointer;
            color: #44403c;
        }
        html.dark .leksihjelp-grammar-features .grammar-feature-item { color: #d6d3d1; }
        .leksihjelp-grammar-features .grammar-feature-item input[type="checkbox"] {
            width: 0.875rem;
            height: 0.875rem;
            border-radius: 0.25rem;
            border: 1px solid #d6d3d1;
            accent-color: #059669;
            cursor: pointer;
        }

        /* Dictionary result enrichment (conjugation / case / comparative tables) */
        .dict-result-card[data-expandable] [data-toggle] { user-select: none; }
        .dict-result-card .dict-arrow {
            display: inline-block;
            margin-left: 0.25rem;
            font-size: 0.6rem;
            color: #a8a29e;
        }
        .dict-result-card .dict-enrichment-host { margin-top: 0.5rem; }
        .dict-enrichment {
            display: flex;
            flex-direction: column;
            gap: 0.5rem;
            padding-top: 0.5rem;
            border-top: 1px dashed #e7e5e4;
        }
        html.dark .dict-enrichment { border-top-color: #44403c; }
        .dict-tense-block { font-size: 0.75rem; }
        .dict-tense-name {
            font-size: 0.65rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #78716c;
            margin-bottom: 0.25rem;
        }
        html.dark .dict-tense-name { color: #a8a29e; }
        .dict-conj-table {
            width: 100%;
            border-collapse: collapse;
            font-variant-numeric: tabular-nums;
        }
        .dict-conj-table td {
            padding: 0.125rem 0;
            line-height: 1.4;
        }
        .dict-conj-pronoun {
            color: #78716c;
            width: 5.5rem;
            white-space: nowrap;
        }
        html.dark .dict-conj-pronoun { color: #a8a29e; }
        .dict-conj-form { color: #1c1917; font-weight: 500; }
        html.dark .dict-conj-form { color: #fafaf9; }
    `;
    document.head.appendChild(style);
}

export function initLeksihjelpSettings(host, bridge) {
    ensureGrammarFeaturesStyles();
    const drawer = document.createElement('aside');
    drawer.className = 'leksihjelp-settings-drawer fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-stone-800 shadow-2xl border-l border-stone-200 dark:border-stone-700 z-40 flex flex-col transform translate-x-full transition-transform duration-200 ease-out';
    drawer.style.pointerEvents = 'none';
    drawer.setAttribute('role', 'complementary');
    drawer.setAttribute('aria-labelledby', 'leksihjelp-settings-title');
    drawer.setAttribute('aria-hidden', 'true');

    // Active tab persists per-session so opening the drawer twice in a
    // row keeps the student where they were. Default to 'dictionary'
    // since that's the more frequent action — checking a word, not
    // tweaking settings.
    const ACTIVE_TAB_KEY = 'skriv.leksihjelp.activeTab';
    const initialTab = (() => {
        try {
            const v = localStorage.getItem(ACTIVE_TAB_KEY);
            return v === 'settings' ? 'settings' : 'dictionary';
        } catch (_) { return 'dictionary'; }
    })();

    drawer.innerHTML = `
        <header class="flex items-center justify-between gap-2 px-3 py-2 border-b border-stone-200 dark:border-stone-700">
            <h2 id="leksihjelp-settings-title" class="text-base font-semibold text-stone-800 dark:text-stone-100">
                ${escapeHtml(t('leksihjelp.title'))}
            </h2>
            <button type="button" data-close
                class="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 active:bg-stone-300 transition-colors flex-shrink-0"
                aria-label="${escapeHtml(t('leksihjelp.close'))}"
                title="${escapeHtml(t('leksihjelp.close'))} (Esc)">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/>
                </svg>
                <span>${escapeHtml(t('leksihjelp.close'))}</span>
            </button>
        </header>

        <!-- Tab bar -->
        <div role="tablist" aria-label="${escapeHtml(t('leksihjelp.tabsLabel'))}"
            class="flex items-stretch border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/50">
            <button type="button" role="tab" data-tab="dictionary"
                class="flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors focus:outline-none">
                📖 ${escapeHtml(t('leksihjelp.tabDictionary'))}
            </button>
            <button type="button" role="tab" data-tab="settings"
                class="flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors focus:outline-none">
                ⚙️ ${escapeHtml(t('leksihjelp.tabSettings'))}
            </button>
        </div>

        <div class="flex-1 overflow-y-auto text-sm text-stone-700 dark:text-stone-200">

            <!-- Dictionary tab panel -->
            <div role="tabpanel" data-panel="dictionary"
                class="px-4 py-4 space-y-3">
                <p class="text-xs text-stone-500 dark:text-stone-400" data-search-hint></p>
                <input type="search" data-search-input
                    autocomplete="off" autocapitalize="none" spellcheck="false"
                    class="w-full text-sm px-3 py-2 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-200 outline-none focus:border-emerald-400"
                    placeholder="${escapeHtml(t('leksihjelp.searchPlaceholder'))}">
                <div class="space-y-1.5" data-search-results></div>
            </div>

            <!-- Settings tab panel -->
            <div role="tabpanel" data-panel="settings"
                class="px-4 py-4 space-y-5">

                <p class="text-xs text-stone-500 dark:text-stone-400" data-status-hint></p>

                <!-- Eksamensmodus -->
                <section>
                    <label class="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" data-exam-mode
                            class="mt-0.5 rounded border-stone-300 dark:border-stone-600 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 w-4 h-4">
                        <span>
                            <span class="font-medium block">${escapeHtml(t('leksihjelp.examMode'))}</span>
                            <span class="text-xs text-stone-500 dark:text-stone-400 block mt-0.5">${escapeHtml(t('leksihjelp.examModeHint'))}</span>
                        </span>
                    </label>
                </section>

                <!-- Skrivespråk -->
                <section>
                    <label class="block">
                        <span class="font-medium block mb-0.5">${escapeHtml(t('leksihjelp.writingLang'))}</span>
                        <span class="text-xs text-stone-500 dark:text-stone-400 block mb-1.5">${escapeHtml(t('leksihjelp.writingLangHint'))}</span>
                        <select data-writing-lang
                            class="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-200 outline-none focus:border-emerald-400">
                            ${langOptions(bridge.getWritingLang())}
                        </select>
                    </label>
                </section>

                <!-- Oppslagsspråk -->
                <section>
                    <label class="block">
                        <span class="font-medium block mb-0.5">${escapeHtml(t('leksihjelp.lookupLang'))}</span>
                        <span class="text-xs text-stone-500 dark:text-stone-400 block mb-1.5">${escapeHtml(t('leksihjelp.lookupLangHint'))}</span>
                        <select data-lookup-lang
                            class="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-200 outline-none focus:border-emerald-400">
                            ${langOptions(bridge.getLookupLang())}
                        </select>
                    </label>
                </section>

                <!-- Grammatikknivå -->
                <section>
                    <h3 class="font-medium mb-0.5">${escapeHtml(t('leksihjelp.grammarLevel'))}</h3>
                    <p class="text-xs text-stone-500 dark:text-stone-400 mb-2">${escapeHtml(t('leksihjelp.grammarLevelHint'))}</p>
                    <div class="leksihjelp-grammar-features text-xs text-stone-700 dark:text-stone-200" data-grammar-features></div>
                    <p class="text-[11px] text-stone-500 dark:text-stone-400 mt-2 italic">${escapeHtml(t('leksihjelp.grammarLevelTip'))}</p>
                </section>
            </div>
        </div>
    `;

    host.appendChild(drawer);

    const closeBtn = drawer.querySelector('[data-close]');
    const examModeCheckbox = drawer.querySelector('[data-exam-mode]');
    const writingLangSelect = drawer.querySelector('[data-writing-lang]');
    const lookupLangSelect = drawer.querySelector('[data-lookup-lang]');
    const statusHintEl = drawer.querySelector('[data-status-hint]');
    const searchInputEl = drawer.querySelector('[data-search-input]');
    const searchResultsEl = drawer.querySelector('[data-search-results]');
    const searchHintEl = drawer.querySelector('[data-search-hint]');
    const tabBtns = drawer.querySelectorAll('[role="tab"][data-tab]');
    const panelDictionary = drawer.querySelector('[data-panel="dictionary"]');
    const panelSettings = drawer.querySelector('[data-panel="settings"]');

    // ── Tab switching ──────────────────────────────────────────────
    function setActiveTab(tab) {
        const which = tab === 'settings' ? 'settings' : 'dictionary';
        try { localStorage.setItem(ACTIVE_TAB_KEY, which); } catch (_) {}
        tabBtns.forEach(btn => {
            const selected = btn.dataset.tab === which;
            btn.setAttribute('aria-selected', selected);
            btn.className = 'flex-1 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors focus:outline-none '
                + (selected
                    ? 'border-emerald-500 text-emerald-700 dark:text-emerald-300 bg-white dark:bg-stone-800'
                    : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-800/60');
        });
        panelDictionary.classList.toggle('hidden', which !== 'dictionary');
        panelSettings.classList.toggle('hidden', which !== 'settings');
        // Auto-focus the search input when switching to the dictionary tab
        // so the student can start typing immediately.
        if (which === 'dictionary' && searchInputEl) {
            // microtask delay so the panel is visible first
            queueMicrotask(() => searchInputEl.focus());
        }
    }
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
    });
    setActiveTab(initialTab);

    examModeCheckbox.checked = bridge.getExamMode();

    // ── Dictionary search ──
    // Bidirectional: a query matches against either the loaded language's
    // word list (entry.word) OR the translation field, so typing "hund"
    // surfaces the German "Hund" entry when Oppslagsspråk = de, and typing
    // "Hund" surfaces it equally. Lookup target follows bridge.lookupLang.
    function refreshSearchHint() {
        if (!searchHintEl) return;
        const lang = bridge.getLookupLang();
        const langName = (LANGS.find(l => l.id === lang) || {}).label || lang;
        searchHintEl.textContent = t('leksihjelp.searchHint', { lang: langName });
    }
    refreshSearchHint();

    function searchEntries(query) {
        const vocab = window.__lexiVocab;
        if (!vocab || typeof vocab.getWordList !== 'function') return [];
        const list = vocab.getWordList();
        if (!Array.isArray(list)) return [];
        const lower = query.toLowerCase().trim();
        if (lower.length < 2) return [];

        // Within each match category, base/accepted entries float to the top so
        // typing "kommen" surfaces the base verb (with its full conjugation
        // table available) rather than a 'wir kommen' conjugation row first.
        // Typo entries get a slight push down — they're noise in search.
        function typeRank(e) {
            const t = e && e.type;
            if (t === 'base' || t === 'accepted') return 0;
            if (t === 'typo') return 9;
            return 1;
        }

        const exactWord = [];
        const exactTrans = [];
        const startsWord = [];
        const startsTrans = [];
        for (const e of list) {
            if (!e) continue;
            const w = (e.display || e.word || '').toLowerCase();
            const tr = (e.translation || '').toLowerCase();
            if (w === lower) { exactWord.push(e); continue; }
            if (tr && tr === lower) { exactTrans.push(e); continue; }
            if (w.startsWith(lower)) { startsWord.push(e); continue; }
            if (tr.startsWith(lower)) { startsTrans.push(e); continue; }
        }
        // Stable sort within each bucket by typeRank.
        const sortByType = (arr) => arr
            .map((e, i) => ({ e, i, r: typeRank(e) }))
            .sort((a, b) => a.r - b.r || a.i - b.i)
            .map(x => x.e);
        return [
            ...sortByType(exactWord),
            ...sortByType(exactTrans),
            ...sortByType(startsWord),
            ...sortByType(startsTrans),
        ].slice(0, 8);
    }

    // ── Result enrichment ──
    // For each *base* entry in the wordList, we can find related forms
    // (conjugations, case variants, comparative/superlative) by matching
    // `baseWord`. Show them inline under the row when expanded.
    const TENSE_LABELS_NB = {
        present:    'Presens',
        past:       'Preteritum',
        perfect:    'Perfektum',
        pluperfect: 'Pluskvamperfekt',
        future:     'Futurum',
        imperfect:  'Imperfektum',
        preterito:  'Pretérito',
        imperfecto: 'Imperfecto',
        subjunctive: 'Konjunktiv',
        imperative: 'Imperativ',
    };

    function findRelatedForms(entry) {
        const vocab = window.__lexiVocab;
        if (!vocab || !vocab.getWordList) return [];
        const base = entry.display || entry.word;
        if (!base) return [];
        const list = vocab.getWordList();
        return list.filter(e => e && e.baseWord === base && e !== entry);
    }

    function renderConjugationsHTML(forms) {
        const conj = forms.filter(f => f.type === 'conjugation');
        if (conj.length === 0) return '';
        const byTense = new Map();
        for (const c of conj) {
            const tense = c.tenseKey || 'other';
            if (!byTense.has(tense)) byTense.set(tense, []);
            byTense.get(tense).push(c);
        }
        let html = '';
        for (const [tense, rows] of byTense) {
            const tenseName = TENSE_LABELS_NB[tense] || tense;
            html += `<div class="dict-tense-block">
                <div class="dict-tense-name">${escapeHtml(tenseName)}</div>
                <table class="dict-conj-table"><tbody>`;
            for (const r of rows) {
                html += `<tr>
                    <td class="dict-conj-pronoun">${escapeHtml(r.pronoun || '')}</td>
                    <td class="dict-conj-form">${escapeHtml(r.display || r.word || '')}</td>
                </tr>`;
            }
            html += `</tbody></table></div>`;
        }
        return html;
    }

    function renderCaseTableHTML(forms) {
        const cases = forms.filter(f => f.type === 'case');
        if (cases.length === 0) return '';
        let html = `<div class="dict-tense-block"><div class="dict-tense-name">Kasus</div><table class="dict-conj-table"><tbody>`;
        for (const r of cases) {
            html += `<tr>
                <td class="dict-conj-pronoun">${escapeHtml(r.caseName || '')}</td>
                <td class="dict-conj-form">${escapeHtml(r.display || r.word || '')}</td>
            </tr>`;
        }
        html += `</tbody></table></div>`;
        return html;
    }

    function renderComparativesHTML(forms) {
        const comp = forms.find(f => f.type === 'comparative');
        const sup = forms.find(f => f.type === 'superlative');
        if (!comp && !sup) return '';
        let html = `<div class="dict-tense-block"><div class="dict-tense-name">Sammenligning</div><table class="dict-conj-table"><tbody>`;
        if (comp) html += `<tr><td class="dict-conj-pronoun">komparativ</td><td class="dict-conj-form">${escapeHtml(comp.display || comp.word)}</td></tr>`;
        if (sup) html += `<tr><td class="dict-conj-pronoun">superlativ</td><td class="dict-conj-form">${escapeHtml(sup.display || sup.word)}</td></tr>`;
        html += `</tbody></table></div>`;
        return html;
    }

    function renderEnrichmentHTML(entry) {
        if (entry.type !== 'base') return '';
        const forms = findRelatedForms(entry);
        if (forms.length === 0) return '';
        return `<div class="dict-enrichment">
            ${renderConjugationsHTML(forms)}
            ${renderCaseTableHTML(forms)}
            ${renderComparativesHTML(forms)}
        </div>`;
    }

    function renderResultRow(entry, idx) {
        const display = escapeHtml(entry.display || entry.word || '');
        const translation = escapeHtml(entry.translation || '');
        const pos = escapeHtml(entry.partOfSpeech || entry.type || '');
        const genus = entry.genus ? escapeHtml(entry.genus) : '';
        const enrichment = renderEnrichmentHTML(entry);
        const expandable = !!enrichment;
        return `
            <div class="dict-result-card rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/40 px-3 py-2"
                data-result-idx="${idx}" ${expandable ? 'data-expandable="1"' : ''}>
                <div class="flex items-baseline justify-between gap-2 ${expandable ? 'cursor-pointer' : ''}" data-toggle>
                    <span class="font-semibold text-stone-800 dark:text-stone-100">${display}</span>
                    <span class="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">
                        ${pos}${genus ? ' · ' + genus : ''}${expandable ? ' <span data-arrow class="dict-arrow">▸</span>' : ''}
                    </span>
                </div>
                ${translation ? `<div class="text-xs text-stone-600 dark:text-stone-300 mt-0.5">${translation}</div>` : ''}
                ${expandable ? `<div class="dict-enrichment-host hidden">${enrichment}</div>` : ''}
            </div>
        `;
    }

    let searchDebounceTimer = null;
    function runSearch() {
        if (!searchResultsEl) return;
        const query = (searchInputEl.value || '').trim();
        if (query.length < 2) {
            searchResultsEl.innerHTML = '';
            return;
        }
        const results = searchEntries(query);
        if (results.length === 0) {
            searchResultsEl.innerHTML = `<div class="text-xs italic text-stone-500 dark:text-stone-400">${escapeHtml(t('leksihjelp.searchNoResults'))}</div>`;
            return;
        }
        searchResultsEl.innerHTML = results.map((e, i) => renderResultRow(e, i)).join('');
        // Expand the first base-type result by default so the most likely
        // hit shows its conjugation/case table without an extra click.
        const firstExpandable = searchResultsEl.querySelector('[data-expandable]');
        if (firstExpandable) {
            firstExpandable.querySelector('.dict-enrichment-host')?.classList.remove('hidden');
            const arrow = firstExpandable.querySelector('[data-arrow]');
            if (arrow) arrow.textContent = '▾';
        }
    }

    if (searchInputEl) {
        searchInputEl.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(runSearch, 120);
        });
    }

    // Click anywhere in a result card with `data-expandable` to toggle
    // its enrichment table. Delegated so we don't re-bind per render.
    if (searchResultsEl) {
        searchResultsEl.addEventListener('click', (e) => {
            const card = e.target.closest('[data-expandable]');
            if (!card) return;
            const host = card.querySelector('.dict-enrichment-host');
            const arrow = card.querySelector('[data-arrow]');
            if (!host) return;
            const willOpen = host.classList.contains('hidden');
            host.classList.toggle('hidden', !willOpen);
            if (arrow) arrow.textContent = willOpen ? '▾' : '▸';
        });
    }

    // ── Grammatikknivå (vendored grammar-features-section.js) ─────────
    // The vendored module renders a checkbox per grammar feature
    // (verb tenses, noun cases, comparison) for the current Oppslagsspråk.
    // It persists selections to chrome.storage.local.enabledGrammarFeatures
    // (which the seam reads — toggling re-runs the wordList filter).
    const grammarContainer = drawer.querySelector('[data-grammar-features]');
    let grammarSectionApi = null;

    async function loadGrammarFeatures(lang) {
        try {
            const res = await fetch(`/js/leksihjelp/data/grammarfeatures-${lang}.json`);
            if (!res.ok) return null;
            return await res.json();
        } catch (_) { return null; }
    }

    function mountGrammarFeatures() {
        if (!grammarContainer || !window.__lexiGrammarFeaturesSection) return;
        if (grammarSectionApi) {
            try { grammarSectionApi.destroy(); } catch (_) {}
            grammarSectionApi = null;
        }
        grammarSectionApi = window.__lexiGrammarFeaturesSection.mount(grammarContainer, {
            storage: window.chrome.storage.local,
            runtime: window.chrome.runtime,
            loadGrammarFeatures,
            getCurrentLanguage: () => bridge.getLookupLang(),
        });
    }
    mountGrammarFeatures();

    let isOpen = false;

    function refreshStatusHint() {
        const status = bridge.getStatus();
        if (status === 'extension') {
            statusHintEl.textContent = t('leksihjelp.statusHintExtension');
        } else if (status === 'embedded') {
            statusHintEl.textContent = t('leksihjelp.statusHintEmbedded');
        } else {
            statusHintEl.textContent = t('leksihjelp.statusHintAbsent');
        }
    }
    refreshStatusHint();

    function open() {
        if (isOpen) return;
        if (bridge.getStatus() === 'extension') {
            console.warn('[leksihjelp-settings] open() ignored — extension owns settings');
            return;
        }
        isOpen = true;
        drawer.style.pointerEvents = 'auto';
        drawer.setAttribute('aria-hidden', 'false');
        // eslint-disable-next-line no-unused-expressions
        drawer.offsetWidth;
        drawer.classList.remove('translate-x-full');
        drawer.classList.add('translate-x-0');
        document.addEventListener('keydown', onKey);
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        drawer.classList.remove('translate-x-0');
        drawer.classList.add('translate-x-full');
        drawer.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
            if (!isOpen) drawer.style.pointerEvents = 'none';
        }, 220);
        document.removeEventListener('keydown', onKey);
    }

    function toggle() { isOpen ? close() : open(); }

    function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
    }

    function onCloseClick(e) {
        e.preventDefault();
        e.stopPropagation();
        close();
    }
    closeBtn.addEventListener('click', onCloseClick);

    function onExamModeChange() {
        bridge.setExamMode(examModeCheckbox.checked);
    }
    examModeCheckbox.addEventListener('change', onExamModeChange);

    function onWritingLangChange() {
        bridge.setWritingLang(writingLangSelect.value);
    }
    writingLangSelect.addEventListener('change', onWritingLangChange);

    function onLookupLangChange() {
        bridge.setLookupLang(lookupLangSelect.value);
    }
    lookupLangSelect.addEventListener('change', onLookupLangChange);

    // Stay in sync if some other module changes a setting through the bridge.
    const offWriting = bridge.onWritingLangChange((lang) => {
        if (writingLangSelect.value !== lang) writingLangSelect.value = lang;
    });
    const offLookup = bridge.onLookupLangChange((lang) => {
        if (lookupLangSelect.value !== lang) lookupLangSelect.value = lang;
        refreshSearchHint();
        // Re-run the active search against the new vocab so results stay coherent.
        if (searchInputEl && searchInputEl.value) runSearch();
        // Re-mount grammar features against the new language's feature definitions.
        if (grammarSectionApi && grammarSectionApi.refresh) grammarSectionApi.refresh(lang);
    });
    const offExam = bridge.onExamModeChange((on) => {
        if (examModeCheckbox.checked !== on) examModeCheckbox.checked = on;
    });
    const offStatus = bridge.onStatusChange(() => {
        refreshStatusHint();
        if (bridge.getStatus() === 'extension' && isOpen) close();
    });

    return {
        open,
        close,
        toggle,
        destroy() {
            close();
            closeBtn.removeEventListener('click', onCloseClick);
            examModeCheckbox.removeEventListener('change', onExamModeChange);
            writingLangSelect.removeEventListener('change', onWritingLangChange);
            lookupLangSelect.removeEventListener('change', onLookupLangChange);
            document.removeEventListener('keydown', onKey);
            offWriting();
            offLookup();
            offExam();
            offStatus();
            if (grammarSectionApi && grammarSectionApi.destroy) {
                try { grammarSectionApi.destroy(); } catch (_) {}
            }
            drawer.remove();
        },
    };
}
