/**
 * Leksihjelp settings drawer (Skriv-side).
 *
 * Slide-in right panel with the four leksihjelp controls:
 *   - Limited assistance (toggle)
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
import { mountLeksihjelpDictionary } from './leksihjelp-view-host.js';

const LANGS = ['nb', 'nn', 'en', 'de', 'es', 'fr'];

function langOptions(activeId) {
    return LANGS.map(id =>
        `<option value="${id}" ${id === activeId ? 'selected' : ''}>${escapeHtml(t(`language.${id}`))}</option>`
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
    drawer.inert = true;

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

            <!-- Dictionary tab panel. The content is Leksihjelp's own shared
                 view, mounted by app/leksihjelp-view-host.js, so the dictionary
                 is the same surface in Skriv, Lockdown and the extension. -->
            <div role="tabpanel" data-panel="dictionary" data-dictionary-mount></div>

            <!-- Settings tab panel -->
            <div role="tabpanel" data-panel="settings"
                class="px-4 py-4 space-y-5">

                <p class="text-xs text-stone-500 dark:text-stone-400" data-status-hint></p>

                <!-- Limited assistance -->
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
                    <div class="leksihjelp-grammar-presets flex flex-wrap gap-1.5 mb-2" data-grammar-presets></div>
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
    const dictionaryMount = drawer.querySelector('[data-dictionary-mount]');
    const tabBtns = drawer.querySelectorAll('[role="tab"][data-tab]');
    const panelDictionary = drawer.querySelector('[data-panel="dictionary"]');
    const panelSettings = drawer.querySelector('[data-panel="settings"]');

    // ── Dictionary: Leksihjelp's own shared view ───────────────────
    // Skriv used to render its own search results from dict-state-builder's
    // view-model. It now mounts the upstream view instead, so the dictionary
    // is identical across Skriv, Lockdown and the extension — and a change to
    // the view-model's shape can no longer break Skriv's renderer silently.
    const dictionaryView = mountLeksihjelpDictionary(dictionaryMount, { bridge });

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
        // Auto-focus the shared view's search input when switching to the
        // dictionary tab so the student can start typing immediately.
        if (which === 'dictionary') {
            // microtask delay so the panel is visible first
            queueMicrotask(() => dictionaryMount?.querySelector('#search-input')?.focus());
        }
    }
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
    });
    setActiveTab(initialTab);

    examModeCheckbox.checked = bridge.getExamMode();

    // ── Grammatikknivå (vendored grammar-features-section.js + presets) ─
    // The vendored module renders a checkbox per grammar feature
    // (verb tenses, noun cases, comparison) for the current Oppslagsspråk.
    // It persists selections to chrome.storage.local.enabledGrammarFeatures
    // (which the seam reads — toggling re-runs the wordList filter).
    //
    // The extension popup also exposes preset pills (Lite / Middels / Mye / Alt)
    // sourced from the `presets` array in grammarfeatures-{lang}.json. We
    // render them above the checkbox tree so students can flip the whole
    // set at once instead of clicking 12 boxes.
    const grammarContainer = drawer.querySelector('[data-grammar-features]');
    const grammarPresetsContainer = drawer.querySelector('[data-grammar-presets]');
    let grammarSectionApi = null;
    let _grammarFeaturesData = null;

    async function loadGrammarFeatures(lang) {
        try {
            const res = await fetch(`/js/leksihjelp/data/grammarfeatures-${lang}.json`);
            if (!res.ok) return null;
            const data = await res.json();
            _grammarFeaturesData = data;
            return data;
        } catch (_) { return null; }
    }

    async function readEnabledFeatureIds() {
        return new Promise(resolve => {
            window.chrome.storage.local.get('enabledGrammarFeatures', (result) => {
                const stored = result && result.enabledGrammarFeatures;
                if (!stored || typeof stored !== 'object') return resolve(new Set());
                const lang = bridge.getLookupLang();
                resolve(new Set(Array.isArray(stored[lang]) ? stored[lang] : []));
            });
        });
    }

    async function detectActivePreset() {
        if (!_grammarFeaturesData || !Array.isArray(_grammarFeaturesData.presets)) return null;
        const enabled = await readEnabledFeatureIds();
        for (const preset of _grammarFeaturesData.presets) {
            const presetSet = new Set(preset.features || []);
            if (presetSet.size !== enabled.size) continue;
            let match = true;
            for (const id of presetSet) {
                if (!enabled.has(id)) { match = false; break; }
            }
            if (match) return preset.id;
        }
        return null;
    }

    async function applyPreset(presetId) {
        if (!_grammarFeaturesData || !Array.isArray(_grammarFeaturesData.presets)) return;
        const preset = _grammarFeaturesData.presets.find(p => p.id === presetId);
        if (!preset) return;
        const features = Array.isArray(preset.features) ? preset.features : [];
        const lang = bridge.getLookupLang();
        // Write per-language shape — that's what the seam reads.
        const existing = await new Promise(resolve =>
            window.chrome.storage.local.get('enabledGrammarFeatures', (r) => {
                const v = r && r.enabledGrammarFeatures;
                resolve((v && typeof v === 'object' && !Array.isArray(v)) ? v : {});
            })
        );
        const merged = { ...existing, [lang]: features };
        await new Promise(resolve =>
            window.chrome.storage.local.set({ enabledGrammarFeatures: merged }, resolve)
        );
        try { window.chrome.runtime.sendMessage({ type: 'GRAMMAR_FEATURES_CHANGED' }); } catch (_) {}
        // Re-render checkboxes via the vendored module's refresh hook so they
        // reflect the new active set without the user having to scroll.
        if (grammarSectionApi && grammarSectionApi.refresh) {
            grammarSectionApi.refresh(lang);
        }
        await renderPresetPills();
    }

    async function renderPresetPills() {
        if (!grammarPresetsContainer || !_grammarFeaturesData) return;
        const presets = Array.isArray(_grammarFeaturesData.presets) ? _grammarFeaturesData.presets : [];
        if (presets.length === 0) {
            grammarPresetsContainer.innerHTML = '';
            return;
        }
        const activeId = await detectActivePreset();
        grammarPresetsContainer.innerHTML = presets.map(p => {
            const active = p.id === activeId;
            const cls = active
                ? 'px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-600 text-white border border-emerald-600'
                : 'px-2.5 py-1 rounded-full text-xs font-medium text-stone-700 dark:text-stone-200 bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-600 hover:border-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300';
            return `<button type="button" class="${cls}" data-preset-id="${escapeHtml(p.id)}">${escapeHtml(p.name)}</button>`;
        }).join('');
    }

    if (grammarPresetsContainer) {
        grammarPresetsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-preset-id]');
            if (btn) applyPreset(btn.dataset.presetId);
        });
    }

    // Storage adapter for the vendored grammar-features-section.js.
    //
    // The vendored module's deps interface expects `storage.get(key)` to
    // return the value at that key, but chrome.storage.local.get returns
    // a `{key: value}` wrapper — flatten that here.
    //
    // (Earlier this adapter also translated between flat `{id: true}`
    // and per-language `{de: [...]}` shapes because grammar-features-section
    // wrote the flat shape that the seam couldn't read. Fixed upstream
    // in leksihjelp v3.0.9 commit 8f5416c — both writers now use the
    // canonical per-language shape, so the translation layer is gone.)
    const grammarStorageAdapter = {
        get(key) {
            return new Promise(resolve =>
                window.chrome.storage.local.get(key, (r) => resolve(r ? r[key] : undefined))
            );
        },
        set(obj) {
            return new Promise(resolve =>
                window.chrome.storage.local.set(obj, resolve)
            );
        },
    };

    async function mountGrammarFeatures() {
        if (!grammarContainer || !window.__lexiGrammarFeaturesSection) return;
        if (grammarSectionApi) {
            try { grammarSectionApi.destroy(); } catch (_) {}
            grammarSectionApi = null;
        }
        // Pre-load the data so the preset pills can render immediately.
        await loadGrammarFeatures(bridge.getLookupLang());
        await renderPresetPills();
        grammarSectionApi = window.__lexiGrammarFeaturesSection.mount(grammarContainer, {
            storage: grammarStorageAdapter,
            runtime: window.chrome.runtime,
            loadGrammarFeatures,
            getCurrentLanguage: () => bridge.getLookupLang(),
        });
    }
    mountGrammarFeatures();

    // Re-render pills + the active search when storage changes from any
    // source (preset click, checkbox toggle, vendored module persistence).
    //
    // Subtlety: the seam's enabledFeatures Set is updated *async* in
    // hydrateTarget — the chrome.storage write fires synchronously, but
    // re-reading the JSON and rebuilding the indexes takes a tick. Refreshing
    // the dictionary straight from storage.onChanged would still read the OLD
    // enabledFeatures and show rows the pupil just turned off. The fix: also
    // listen for the seam's `lexi:hydration` event with state='ready', and
    // refresh then.
    const onStorageChangedForPills = (changes) => {
        if (!changes || !changes.enabledGrammarFeatures) return;
        renderPresetPills();
    };
    window.chrome.storage.onChanged.addListener(onStorageChangedForPills);

    // Hydration listener: fires after the seam has rebuilt its indexes with
    // the new enabledFeatures. Re-run the dictionary's active search then, so
    // a grammar-feature toggle is reflected in the results rather than
    // waiting for the next keystroke.
    let hydrationRefreshTimer = null;
    const onHydrationMessage = (msg) => {
        if (!msg || msg.type !== 'lexi:hydration') return;
        if (msg.state !== 'ready') return;
        clearTimeout(hydrationRefreshTimer);
        hydrationRefreshTimer = setTimeout(() => dictionaryView?.refresh(), 30);
    };
    window.chrome.runtime.onMessage.addListener(onHydrationMessage);

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
        drawer.inert = false;
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
        drawer.inert = true;
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
        // The dictionary view reloads itself from this same bridge event
        // (see leksihjelp-view-host.js) — no need to drive it from here.
        // Re-mount grammar features against the new language's feature definitions.
        if (grammarSectionApi && grammarSectionApi.refresh) grammarSectionApi.refresh(lang);
        // Pull fresh presets for the new language and re-render the pills.
        loadGrammarFeatures(lang).then(renderPresetPills);
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
            try { dictionaryView.destroy(); } catch (_) {}
            clearTimeout(hydrationRefreshTimer);
            try { window.chrome.storage.onChanged.removeListener(onStorageChangedForPills); } catch (_) {}
            try { window.chrome.runtime.onMessage.removeListener(onHydrationMessage); } catch (_) {}
            drawer.remove();
        },
    };
}
