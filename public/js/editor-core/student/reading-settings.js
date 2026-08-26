/**
 * Reading Settings (lesevisning)
 *
 * Dyslexia-friendly display options for the editor: an easier-to-read
 * font stack, larger text, wider line spacing and letter spacing.
 * Settings apply as inline styles on the editor CONTAINER only — the
 * document HTML (what is saved and exported) is never touched.
 *
 * Persisted in localStorage so the pupil's choice survives reloads and
 * applies to every document.
 */

import { t } from '../shared/i18n.js';

const STORAGE_KEY = 'skriv.readingSettings';

/** Option tables: id → CSS value. First entry is the default. */
const FONTS = {
    standard: '',
    lettlest: "Verdana, 'Trebuchet MS', Arial, sans-serif",
};
const SIZES = { m: '', l: '112.5%', xl: '125%' };
const LINE_HEIGHTS = { normal: '', wide: '2', wider: '2.4' };
const LETTER_SPACINGS = { normal: '', wide: '0.03em', wider: '0.06em' };

const DEFAULTS = { font: 'standard', size: 'm', lineHeight: 'normal', letterSpacing: 'normal' };

/**
 * Merge stored settings with defaults, dropping unknown values.
 * Exported for tests.
 * @param {object|null} raw
 * @returns {{ font, size, lineHeight, letterSpacing }}
 */
export function normalizeSettings(raw) {
    const tables = { font: FONTS, size: SIZES, lineHeight: LINE_HEIGHTS, letterSpacing: LETTER_SPACINGS };
    const settings = { ...DEFAULTS };
    if (raw && typeof raw === 'object') {
        for (const key of Object.keys(tables)) {
            if (typeof raw[key] === 'string' && raw[key] in tables[key]) {
                settings[key] = raw[key];
            }
        }
    }
    return settings;
}

const CSS = `
.skriv-reading-settings-panel {
    position: fixed;
    right: 1rem;
    bottom: 3.5rem;
    width: 260px;
    background: rgba(255, 255, 255, 0.97);
    backdrop-filter: blur(8px);
    border: 1px solid #e7e5e4;
    border-radius: 12px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.12);
    z-index: 90;
    padding: 0.9rem 1rem;
    font-size: 0.8rem;
    color: #44403c;
}
.dark .skriv-reading-settings-panel {
    background: rgba(41, 37, 36, 0.97);
    border-color: #44403c;
    color: #d6d3d1;
}
.skriv-reading-settings-panel.hidden { display: none; }
.skriv-reading-settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.6rem;
}
.skriv-reading-settings-title { font-weight: 600; font-size: 0.85rem; }
.skriv-reading-settings-close {
    border: none; background: none; color: #a8a29e;
    font-size: 1.1rem; cursor: pointer; padding: 0 0.25rem;
}
.skriv-reading-settings-close:hover { color: #57534e; }
.skriv-reading-settings-row { margin: 0.55rem 0; }
.skriv-reading-settings-label {
    display: block;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #78716c;
    margin-bottom: 0.25rem;
}
.skriv-reading-settings-group { display: flex; gap: 0.3rem; }
.skriv-reading-settings-option {
    flex: 1;
    padding: 0.3rem 0.2rem;
    border: 1px solid #d6d3d1;
    border-radius: 6px;
    background: none;
    color: inherit;
    cursor: pointer;
    font-size: 0.75rem;
    transition: background 0.1s, border-color 0.1s;
}
.skriv-reading-settings-option:hover { background: #f5f5f4; }
.dark .skriv-reading-settings-option:hover { background: #44403c; }
.skriv-reading-settings-option.active {
    background: #ecfdf5;
    border-color: #059669;
    color: #047857;
}
.dark .skriv-reading-settings-option.active {
    background: #064e3b;
    color: #a7f3d0;
}
.skriv-reading-settings-reset {
    display: block;
    width: 100%;
    margin-top: 0.7rem;
    padding: 0.35rem;
    border: 1px dashed #d6d3d1;
    border-radius: 6px;
    background: none;
    color: #78716c;
    cursor: pointer;
    font-size: 0.75rem;
}
.skriv-reading-settings-reset:hover { color: #059669; border-color: #a7f3d0; }
`;

/**
 * Initialize reading settings for an editor.
 * @param {HTMLElement} editor - The contenteditable element (styles applied here)
 * @param {HTMLElement} container - Parent for the settings panel
 * @returns {{ toggle, show, hide, destroy, getSettings }}
 */
export function initReadingSettings(editor, container) {
    let settings = loadSettings();
    let styleEl = null;
    let panel = null;

    function loadSettings() {
        let raw = null;
        try { raw = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (_) { /* ignore */ }
        return normalizeSettings(raw);
    }

    function saveSettings() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(settings)); } catch (_) { /* ignore */ }
    }

    function applySettings() {
        editor.style.fontFamily = FONTS[settings.font];
        editor.style.fontSize = SIZES[settings.size];
        editor.style.lineHeight = LINE_HEIGHTS[settings.lineHeight];
        editor.style.letterSpacing = LETTER_SPACINGS[settings.letterSpacing];
    }

    if (!document.getElementById('skriv-reading-settings-styles')) {
        styleEl = document.createElement('style');
        styleEl.id = 'skriv-reading-settings-styles';
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);
    }

    // --- Panel ---
    const ROWS = [
        { key: 'font', label: t('readingView.font'), options: [
            { id: 'standard', label: t('readingView.fontStandard') },
            { id: 'lettlest', label: t('readingView.fontEasy') },
        ] },
        { key: 'size', label: t('readingView.size'), options: [
            { id: 'm', label: 'M' }, { id: 'l', label: 'L' }, { id: 'xl', label: 'XL' },
        ] },
        { key: 'lineHeight', label: t('readingView.lineHeight'), options: [
            { id: 'normal', label: t('readingView.normal') },
            { id: 'wide', label: t('readingView.wide') },
            { id: 'wider', label: t('readingView.wider') },
        ] },
        { key: 'letterSpacing', label: t('readingView.letterSpacing'), options: [
            { id: 'normal', label: t('readingView.normal') },
            { id: 'wide', label: t('readingView.wide') },
            { id: 'wider', label: t('readingView.wider') },
        ] },
    ];

    panel = document.createElement('div');
    panel.className = 'skriv-reading-settings-panel hidden';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', t('readingView.title'));

    const header = `
        <div class="skriv-reading-settings-header">
            <span class="skriv-reading-settings-title">${t('readingView.title')}</span>
            <button type="button" class="skriv-reading-settings-close" aria-label="${t('common.cancel')}">×</button>
        </div>`;
    const rows = ROWS.map(row => `
        <div class="skriv-reading-settings-row" data-key="${row.key}">
            <span class="skriv-reading-settings-label">${row.label}</span>
            <div class="skriv-reading-settings-group" role="group" aria-label="${row.label}">
                ${row.options.map(o => `<button type="button" class="skriv-reading-settings-option" data-value="${o.id}">${o.label}</button>`).join('')}
            </div>
        </div>`).join('');
    const reset = `<button type="button" class="skriv-reading-settings-reset">${t('readingView.reset')}</button>`;

    panel.innerHTML = header + rows + reset;
    container.appendChild(panel);

    function syncActiveButtons() {
        for (const row of panel.querySelectorAll('.skriv-reading-settings-row')) {
            const key = row.dataset.key;
            for (const opt of row.querySelectorAll('.skriv-reading-settings-option')) {
                opt.classList.toggle('active', opt.dataset.value === settings[key]);
            }
        }
    }

    function onPanelClick(e) {
        if (e.target.closest('.skriv-reading-settings-close')) { hide(); return; }
        if (e.target.closest('.skriv-reading-settings-reset')) {
            settings = { ...DEFAULTS };
            saveSettings();
            applySettings();
            syncActiveButtons();
            return;
        }
        const opt = e.target.closest('.skriv-reading-settings-option');
        if (!opt) return;
        const key = opt.closest('.skriv-reading-settings-row')?.dataset.key;
        if (!key) return;
        settings[key] = opt.dataset.value;
        saveSettings();
        applySettings();
        syncActiveButtons();
    }
    panel.addEventListener('click', onPanelClick);

    // Apply persisted settings immediately on init.
    applySettings();

    function show() { syncActiveButtons(); panel.classList.remove('hidden'); }
    function hide() { panel.classList.add('hidden'); }
    function toggle() { panel.classList.contains('hidden') ? show() : hide(); }

    function destroy() {
        panel.removeEventListener('click', onPanelClick);
        panel.remove();
        if (styleEl) styleEl.remove();
        // Leave the editor styles in place — the document view should not
        // jump if the module is re-initialised right after (doc switch).
    }

    return { toggle, show, hide, destroy, getSettings: () => ({ ...settings }) };
}
