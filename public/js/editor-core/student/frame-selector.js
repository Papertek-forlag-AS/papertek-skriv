/**
 * Frame Selector
 *
 * Dropdown UI for selecting a writing frame (genre).
 * Attached to the Struktur button. Lists available frames,
 * fetches/parses the chosen .md file, and calls frameGuide.applyFrame()
 * to open the sidebar guide panel. The editor content is not modified.
 *
 * When a frame is active, the dropdown shows toggle/switch/remove options.
 * The frame registry is passed in via options so this module
 * is not hard-coded to specific genres.
 */

import { t, getCurrentLanguage } from '../shared/i18n.js';
import { showInPageConfirm } from '../shared/in-page-modal.js';
import { parseFrameMarkdown } from './frame-parser.js';

/**
 * Default registry of available writing frames.
 * File paths use {{lang}} placeholder, resolved at runtime via getFramePath().
 * Can be overridden via options.frames.
 */
export const DEFAULT_FRAME_REGISTRY = [
    { id: 'droefting', file: '/frames/{{lang}}/droefting.md', labelKey: 'skriv.frameDroefting', descKey: 'skriv.frameDroeftingDesc', levels: ['ungdomsskole', 'vgs'] },
    { id: 'analyse', file: '/frames/{{lang}}/analyse.md', labelKey: 'skriv.frameAnalyse', descKey: 'skriv.frameAnalyseDesc', levels: ['ungdomsskole', 'vgs'] },
    { id: 'kronikk', file: '/frames/{{lang}}/kronikk.md', labelKey: 'skriv.frameKronikk', descKey: 'skriv.frameKronikkDesc', levels: ['vgs'] },
    { id: 'kaaseri', file: '/frames/{{lang}}/kaaseri.md', labelKey: 'skriv.frameKaaseri', descKey: 'skriv.frameKaaseriDesc', levels: ['ungdomsskole', 'vgs'] },
    { id: 'fagartikkel', file: '/frames/{{lang}}/fagartikkel.md', labelKey: 'skriv.frameFagartikkel', descKey: 'skriv.frameFagartikkelDesc', levels: ['ungdomsskole', 'vgs'] },
    { id: 'leserinnlegg', file: '/frames/{{lang}}/leserinnlegg.md', labelKey: 'skriv.frameLeserinnlegg', descKey: 'skriv.frameLeserinnleggDesc', levels: ['barneskole', 'ungdomsskole', 'vgs'] },
    { id: 'novelle', file: '/frames/{{lang}}/novelle.md', labelKey: 'skriv.frameNovelle', descKey: 'skriv.frameNovelleDesc', levels: ['barneskole', 'ungdomsskole', 'vgs'] },
    { id: 'retorisk-analyse', file: '/frames/{{lang}}/retorisk-analyse.md', labelKey: 'skriv.frameRetoriskAnalyse', descKey: 'skriv.frameRetoriskAnalyseDesc', levels: ['ungdomsskole', 'vgs'] },
    { id: 'kortsvar', file: '/frames/{{lang}}/kortsvar.md', labelKey: 'skriv.frameKortsvar', descKey: 'skriv.frameKortsvarDesc', levels: ['vgs'] },
    { id: 'kreativ-tekst', file: '/frames/{{lang}}/kreativ-tekst.md', labelKey: 'skriv.frameKreativTekst', descKey: 'skriv.frameKreativTekstDesc', levels: ['barneskole', 'ungdomsskole', 'vgs'] },
    { id: 'reflekterende-tekst', file: '/frames/{{lang}}/reflekterende-tekst.md', labelKey: 'skriv.frameReflekterendeTekst', descKey: 'skriv.frameReflekterendeTekstDesc', levels: ['ungdomsskole', 'vgs'] },
    { id: 'sammenligning', file: '/frames/{{lang}}/sammenligning.md', labelKey: 'skriv.frameSammenligning', descKey: 'skriv.frameSammenligningDesc', levels: ['ungdomsskole', 'vgs'] },
];

const FRAME_LANGUAGES = ['nb', 'nn'];

/** Resolve the available frame language for a document writing language. */
export function resolveFrameLanguage(lang) {
    return FRAME_LANGUAGES.includes(lang) ? lang : 'nb';
}

/** Resolve a registry path without coupling frame language to interface language. */
export function resolveFramePath(pathTemplate, writingLanguage) {
    return pathTemplate.replace('{{lang}}', resolveFrameLanguage(writingLanguage));
}

/**
 * Split frames into recommended and additional groups for a broad level band.
 * Registries without level metadata remain fully backward compatible.
 */
export function partitionFramesByLevel(frames, levelBand) {
    if (!levelBand) return { recommended: [...frames], additional: [] };

    const recommended = [];
    const additional = [];
    for (const frame of frames) {
        if (!Array.isArray(frame.levels) || frame.levels.includes(levelBand)) {
            recommended.push(frame);
        } else {
            additional.push(frame);
        }
    }

    // An unknown/custom level must never produce an empty picker.
    if (recommended.length === 0) return { recommended: [...frames], additional: [] };
    return { recommended, additional };
}

/**
 * Resolve a frame file path for the current language.
 * Falls back to 'nb' if the language-specific file doesn't exist.
 * @param {string} pathTemplate - Path with {{lang}} placeholder
 * @returns {string} Resolved path
 */
function getFramePath(pathTemplate, getWritingLanguage) {
    const lang = getWritingLanguage?.() || getCurrentLanguage();
    return resolveFramePath(pathTemplate, lang);
}

/**
 * Initialize the frame selector dropdown.
 * @param {HTMLElement} button - The Struktur button
 * @param {HTMLElement} editor - The contenteditable element
 * @param {object} frameGuide - The frame guide panel API (applyFrame, removeFrame, getActiveFrame, hasFrame, toggle, hide)
 * @param {{ onFrameApplied?: () => void, frames?: Array, getWritingLanguage?: () => string, getLevelBand?: () => string|null }} options
 * @returns {{ destroy: () => void, updateButtonState: () => void, reloadActiveFrame: () => Promise<void> }}
 */
export function initFrameSelector(button, editor, frameGuide, options = {}) {
    const { onFrameApplied } = options;
    const frameRegistry = options.frames || DEFAULT_FRAME_REGISTRY;

    // --- Build dropdown panel (appended to body to avoid overflow clipping) ---
    const panel = document.createElement('div');
    panel.className = 'hidden bg-white/85 dark:bg-stone-800/85 backdrop-blur-md border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg py-2 min-w-[240px]';
    panel.style.cssText = 'position: fixed; z-index: 100; max-height: 400px; overflow-y: auto;';
    document.body.appendChild(panel);

    /** Position the panel below the button using fixed coords. */
    function positionPanel(customRect) {
        const rect = customRect || button.getBoundingClientRect();
        panel.style.top = `${rect.bottom + 4}px`;
        // Align left edge with button, but clamp to viewport
        const left = Math.min(rect.left, window.innerWidth - 260);
        panel.style.left = `${Math.max(4, left)}px`;
    }

    function buildPanel() {
        panel.innerHTML = '';

        if (frameGuide.hasFrame()) {
            // --- Active frame menu: toggle guide, switch, remove ---

            // Toggle guide visibility
            const toggleBtn = document.createElement('button');
            toggleBtn.className = 'block w-full text-left px-4 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors';
            toggleBtn.textContent = frameGuide.isVisible?.() ? t('skriv.frameHideGuide') : t('skriv.frameShowGuide');
            toggleBtn.addEventListener('click', () => {
                panel.classList.add('hidden');
                frameGuide.toggle();
            });
            panel.appendChild(toggleBtn);

            // Switch frame
            const switchBtn = document.createElement('button');
            switchBtn.className = 'block w-full text-left px-4 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors';
            switchBtn.textContent = t('skriv.frameSwitchFrame');
            switchBtn.addEventListener('click', () => {
                buildFramePickerList();
            });
            panel.appendChild(switchBtn);

            // Divider + Remove
            const divider = document.createElement('div');
            divider.className = 'border-t border-stone-200 my-1';
            panel.appendChild(divider);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors';
            removeBtn.textContent = t('skriv.frameRemove');
            removeBtn.addEventListener('click', () => {
                panel.classList.add('hidden');
                handleRemoveFrame();
            });
            panel.appendChild(removeBtn);
        } else {
            // --- No active frame: show frame picker list ---
            buildFramePickerList();
        }
    }

    function buildFramePickerList() {
        panel.innerHTML = '';

        // Title
        const titleDiv = document.createElement('div');
        titleDiv.className = 'px-4 py-1 text-xs font-semibold text-stone-400 uppercase tracking-wide';
        titleDiv.textContent = t('skriv.frameSelectorTitle');
        panel.appendChild(titleDiv);

        const writingLanguage = options.getWritingLanguage?.() || getCurrentLanguage();
        if (resolveFrameLanguage(writingLanguage) !== writingLanguage) {
            const languageNote = document.createElement('p');
            languageNote.className = 'px-4 py-1.5 text-xs leading-snug text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20';
            languageNote.textContent = t('skriv.frameLanguageFallback');
            panel.appendChild(languageNote);
        }

        const levelBand = options.getLevelBand?.() || null;
        const { recommended, additional } = partitionFramesByLevel(frameRegistry, levelBand);

        function appendGroupTitle(key, withDivider = false) {
            const heading = document.createElement('div');
            heading.className = `px-4 pt-2 pb-1 text-[11px] font-semibold text-stone-400 uppercase tracking-wide${withDivider ? ' border-t border-stone-100 dark:border-stone-700 mt-1' : ''}`;
            heading.textContent = t(key);
            panel.appendChild(heading);
        }

        function appendFrame(frame) {
            const btn = document.createElement('button');
            btn.className = 'block w-full text-left px-4 py-2 hover:bg-stone-50 transition-colors';

            const isActive = frameGuide.getActiveFrame() === frame.id;

            btn.innerHTML = `
                <div class="text-sm font-medium ${isActive ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-700 dark:text-stone-300'}">
                    ${isActive ? '&#10003; ' : ''}${t(frame.labelKey)}
                </div>
                <div class="text-xs text-stone-400 mt-0.5">${t(frame.descKey)}</div>
            `;

            btn.addEventListener('click', () => {
                panel.classList.add('hidden');
                if (isActive) return;
                handleSelectFrame(frame);
            });

            panel.appendChild(btn);
        }

        if (levelBand) appendGroupTitle('skriv.frameRecommendedForLevel');
        recommended.forEach(appendFrame);

        if (additional.length > 0) {
            appendGroupTitle('skriv.frameMoreOptions', true);
            additional.forEach(appendFrame);
        }
    }

    // --- Frame selection logic ---

    async function handleSelectFrame(frame) {
        const hasExistingFrame = frameGuide.hasFrame();

        // If there's an existing frame, confirm switch.
        // If the student has already marked sections done (=dividers in editor),
        // use a stronger warning so they know the markers will be deleted.
        if (hasExistingFrame) {
            const markerCount = editor.querySelectorAll('.skriv-frame-divider').length;
            const message = markerCount > 0
                ? t('skriv.frameSwitchConfirmMessageWithMarkers', { count: markerCount })
                : t('skriv.frameSwitchConfirmMessage');
            const confirmed = await showInPageConfirm(
                t('skriv.frameSwitchConfirmTitle'),
                message,
                t('skriv.frameSwitchConfirmYes'),
                t('common.cancel')
            );
            if (confirmed) {
                frameGuide.removeFrame();
                await applyFrameFromRegistry(frame);
            }
            return;
        }

        // No active frame — apply directly (guide panel doesn't modify editor)
        await applyFrameFromRegistry(frame);
    }

    function commitFrameMarkdown(md, frame, rehydrate = false) {
        const wasVisible = frameGuide.isVisible?.() ?? true;
        const frameData = parseFrameMarkdown(md);
        frameGuide.applyFrame(frameData, frame.id);
        if (rehydrate) {
            frameGuide.rehydrate?.();
            if (!wasVisible) frameGuide.hide();
        }
        updateButtonState();
        if (onFrameApplied) onFrameApplied();
    }

    async function applyFrameFromRegistry(frame, { rehydrate = false } = {}) {
        try {
            const filePath = getFramePath(frame.file, options.getWritingLanguage);
            const res = await fetch(filePath);
            if (!res.ok) {
                // Fallback to nb if language-specific frame not found
                const fallbackPath = frame.file.replace('{{lang}}', 'nb');
                const fallbackRes = await fetch(fallbackPath);
                if (!fallbackRes.ok) throw new Error(`Failed to load frame: ${res.status}`);
                const md = await fallbackRes.text();
                commitFrameMarkdown(md, frame, rehydrate);
                return;
            }
            const md = await res.text();
            commitFrameMarkdown(md, frame, rehydrate);
        } catch (err) {
            console.error('Frame load error:', err);
        }
    }

    async function reloadActiveFrame() {
        const activeId = frameGuide.getActiveFrame();
        const frame = frameRegistry.find(item => item.id === activeId);
        if (!frame) return;
        await applyFrameFromRegistry(frame, { rehydrate: true });
    }

    async function handleRemoveFrame() {
        frameGuide.removeFrame();
        frameGuide.hide();
        updateButtonState();
    }

    // --- Button state: green when frame is active ---

    function updateButtonState() {
        if (frameGuide.hasFrame()) {
            button.classList.remove('text-stone-500', 'dark:text-stone-400', 'border-stone-200', 'dark:border-stone-600', 'hover:bg-stone-100', 'dark:hover:bg-stone-700');
            button.classList.add('text-emerald-700', 'dark:text-emerald-400', 'border-emerald-400', 'dark:border-emerald-600', 'bg-emerald-50', 'dark:bg-emerald-900/30');
            button.title = t('skriv.frameActive');
        } else {
            button.classList.remove('text-emerald-700', 'dark:text-emerald-400', 'border-emerald-400', 'dark:border-emerald-600', 'bg-emerald-50', 'dark:bg-emerald-900/30');
            button.classList.add('text-stone-500', 'dark:text-stone-400', 'border-stone-200', 'dark:border-stone-600', 'hover:bg-stone-100', 'dark:hover:bg-stone-700');
            button.title = t('skriv.strukturTooltip');
        }
    }

    // --- Toggle dropdown ---

    function handleButtonClick(e) {
        e.stopPropagation(); // Prevent document click from immediately closing
        buildPanel(); // Rebuild to reflect current state
        positionPanel();
        panel.classList.toggle('hidden');
    }

    function openDialog(customRect) {
        buildPanel();
        positionPanel(customRect);
        panel.classList.remove('hidden');
    }

    // Close panel when clicking outside
    function handleOutsideClick(e) {
        // Only close if it's not the button, not inside the panel, and panel is visible
        if (!button.contains(e.target) && !panel.contains(e.target) && !panel.classList.contains('hidden')) {
            panel.classList.add('hidden');
        }
    }

    button.addEventListener('click', handleButtonClick);
    document.addEventListener('click', handleOutsideClick);

    // Initial state
    updateButtonState();

    // --- Cleanup ---
    function destroy() {
        button.removeEventListener('click', handleButtonClick);
        document.removeEventListener('click', handleOutsideClick);
        panel.remove();
    }

    return { destroy, updateButtonState, openDialog, reloadActiveFrame };
}
