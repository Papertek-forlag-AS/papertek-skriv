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

export function initLeksihjelpSettings(host, bridge) {
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

                <!-- Grammatikknivå (placeholder) -->
                <section>
                    <h3 class="font-medium mb-0.5">${escapeHtml(t('leksihjelp.grammarLevel'))}</h3>
                    <p class="text-xs text-stone-500 dark:text-stone-400 mb-2">${escapeHtml(t('leksihjelp.grammarLevelHint'))}</p>
                    <p class="text-xs text-stone-500 dark:text-stone-400 italic" data-grammar-placeholder>
                        ${escapeHtml(t('leksihjelp.grammarLevelPlaceholder'))}
                    </p>
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
        return [...exactWord, ...exactTrans, ...startsWord, ...startsTrans].slice(0, 8);
    }

    function renderResultRow(entry) {
        const display = escapeHtml(entry.display || entry.word || '');
        const translation = escapeHtml(entry.translation || '');
        const pos = escapeHtml(entry.partOfSpeech || entry.type || '');
        const genus = entry.genus ? escapeHtml(entry.genus) : '';
        return `
            <div class="rounded-md border border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-900/40 px-3 py-2">
                <div class="flex items-baseline justify-between gap-2">
                    <span class="font-semibold text-stone-800 dark:text-stone-100">${display}</span>
                    <span class="text-[10px] uppercase tracking-wider text-stone-500 dark:text-stone-400">${pos}${genus ? ' · ' + genus : ''}</span>
                </div>
                ${translation ? `<div class="text-xs text-stone-600 dark:text-stone-300 mt-0.5">${translation}</div>` : ''}
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
        searchResultsEl.innerHTML = results.map(renderResultRow).join('');
    }

    if (searchInputEl) {
        searchInputEl.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(runSearch, 120);
        });
    }

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
            drawer.remove();
        },
    };
}
