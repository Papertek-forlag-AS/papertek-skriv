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

    drawer.innerHTML = `
        <header class="flex items-center justify-between gap-2 px-3 py-2 border-b border-stone-200 dark:border-stone-700">
            <h2 id="leksihjelp-settings-title" class="text-base font-semibold text-stone-800 dark:text-stone-100">
                ${escapeHtml(t('leksihjelp.settingsTitle'))}
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

        <div class="flex-1 overflow-y-auto px-4 py-4 space-y-5 text-sm text-stone-700 dark:text-stone-200">

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
    `;

    host.appendChild(drawer);

    const closeBtn = drawer.querySelector('[data-close]');
    const examModeCheckbox = drawer.querySelector('[data-exam-mode]');
    const writingLangSelect = drawer.querySelector('[data-writing-lang]');
    const lookupLangSelect = drawer.querySelector('[data-lookup-lang]');
    const statusHintEl = drawer.querySelector('[data-status-hint]');

    examModeCheckbox.checked = bridge.getExamMode();

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
