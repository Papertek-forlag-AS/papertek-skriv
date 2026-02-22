/**
 * Frame Selector
 *
 * Dropdown UI for selecting a writing frame (genre).
 * Attached to the Struktur button. Lists available frames,
 * fetches/parses the chosen .md file, and calls frameApi.applyFrame().
 * Shows "Remove frame" when a frame is active.
 *
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
const DEFAULT_FRAME_REGISTRY = [
    { id: 'droefting', file: '/frames/{{lang}}/droefting.md', labelKey: 'skriv.frameDroefting', descKey: 'skriv.frameDroeftingDesc' },
    { id: 'analyse', file: '/frames/{{lang}}/analyse.md', labelKey: 'skriv.frameAnalyse', descKey: 'skriv.frameAnalyseDesc' },
    { id: 'kronikk', file: '/frames/{{lang}}/kronikk.md', labelKey: 'skriv.frameKronikk', descKey: 'skriv.frameKronikkDesc' },
];

/**
 * Resolve a frame file path for the current language.
 * Falls back to 'nb' if the language-specific file doesn't exist.
 * @param {string} pathTemplate - Path with {{lang}} placeholder
 * @returns {string} Resolved path
 */
function getFramePath(pathTemplate) {
    const lang = getCurrentLanguage();
    // Nynorsk (nn) and Bokmål (nb) have their own frame directories.
    // Other languages fall back to nb for now.
    const frameLang = ['nb', 'nn'].includes(lang) ? lang : 'nb';
    return pathTemplate.replace('{{lang}}', frameLang);
}

/**
 * Initialize the frame selector dropdown.
 * @param {HTMLElement} button - The Struktur button
 * @param {HTMLElement} editor - The contenteditable element
 * @param {object} frameApi - The frame manager API
 * @param {{ onFrameApplied?: () => void, frames?: Array }} options
 * @returns {{ destroy: () => void, updateButtonState: () => void }}
 */
export function initFrameSelector(button, editor, frameApi, options = {}) {
    const { onFrameApplied } = options;
    const frameRegistry = options.frames || DEFAULT_FRAME_REGISTRY;

    // --- Build dropdown panel ---
    const panel = document.createElement('div');
    panel.className = 'hidden absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg py-2 z-50 min-w-[240px]';
    panel.style.cssText = 'max-height: 400px; overflow-y: auto;';

    // Position panel relative to button
    button.parentElement.style.position = 'relative';
    button.parentElement.appendChild(panel);

    function buildPanel() {
        panel.innerHTML = '';

        // Title
        const titleDiv = document.createElement('div');
        titleDiv.className = 'px-4 py-1 text-xs font-semibold text-stone-400 uppercase tracking-wide';
        titleDiv.textContent = t('skriv.frameSelectorTitle');
        panel.appendChild(titleDiv);

        // Frame options
        for (const frame of frameRegistry) {
            const btn = document.createElement('button');
            btn.className = 'block w-full text-left px-4 py-2 hover:bg-stone-50 transition-colors';

            const isActive = frameApi.getActiveFrame() === frame.id;

            btn.innerHTML = `
                <div class="text-sm font-medium ${isActive ? 'text-emerald-700' : 'text-stone-700'}">
                    ${isActive ? '✓ ' : ''}${t(frame.labelKey)}
                </div>
                <div class="text-xs text-stone-400 mt-0.5">${t(frame.descKey)}</div>
            `;

            btn.addEventListener('click', () => {
                panel.classList.add('hidden');
                if (isActive) return; // Already active, do nothing
                handleSelectFrame(frame);
            });

            panel.appendChild(btn);
        }

        // Divider + Remove option (only when frame is active)
        if (frameApi.hasFrame()) {
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
        }
    }

    // --- Frame selection logic ---

    async function handleSelectFrame(frame) {
        const editorText = editor.innerText?.trim();
        const hasContent = editorText && editorText.length > 0;
        const hasExistingFrame = frameApi.hasFrame();

        // If there's an existing frame, remove it first (with confirm)
        if (hasExistingFrame) {
            const confirmed = await showInPageConfirm(
                t('skriv.frameRemoveConfirmTitle'),
                t('skriv.frameRemoveConfirmMessage'),
                t('skriv.frameRemoveConfirmYes'),
                t('common.cancel')
            );
            if (confirmed) {
                frameApi.removeFrame();
                await applyFrameFromRegistry(frame);
            }
            return;
        }

        // If editor has content (not just whitespace), confirm
        if (hasContent) {
            const confirmed = await showInPageConfirm(
                t('skriv.frameApplyConfirmTitle'),
                t('skriv.frameApplyConfirmMessage'),
                t('skriv.frameApplyConfirmYes'),
                t('common.cancel')
            );
            if (confirmed) {
                await applyFrameFromRegistry(frame);
            }
            return;
        }

        // Empty editor — apply directly
        await applyFrameFromRegistry(frame);
    }

    async function applyFrameFromRegistry(frame) {
        try {
            const filePath = getFramePath(frame.file);
            const res = await fetch(filePath);
            if (!res.ok) {
                // Fallback to nb if language-specific frame not found
                const fallbackPath = frame.file.replace('{{lang}}', 'nb');
                const fallbackRes = await fetch(fallbackPath);
                if (!fallbackRes.ok) throw new Error(`Failed to load frame: ${res.status}`);
                const md = await fallbackRes.text();
                const frameData = parseFrameMarkdown(md);
                frameApi.applyFrame(frameData, frame.id);
                updateButtonState();
                if (onFrameApplied) onFrameApplied();
                return;
            }
            const md = await res.text();
            const frameData = parseFrameMarkdown(md);
            frameApi.applyFrame(frameData, frame.id);
            updateButtonState();
            if (onFrameApplied) onFrameApplied();
        } catch (err) {
            console.error('Frame load error:', err);
        }
    }

    async function handleRemoveFrame() {
        const confirmed = await showInPageConfirm(
            t('skriv.frameRemoveConfirmTitle'),
            t('skriv.frameRemoveConfirmMessage'),
            t('skriv.frameRemoveConfirmYes'),
            t('common.cancel')
        );
        if (confirmed) {
            frameApi.removeFrame();
            updateButtonState();
        }
    }

    // --- Button state: green when frame is active ---

    function updateButtonState() {
        if (frameApi.hasFrame()) {
            button.classList.remove('text-stone-500', 'border-stone-200');
            button.classList.add('text-emerald-700', 'border-emerald-400', 'bg-emerald-50');
            button.title = t('skriv.frameActive');
        } else {
            button.classList.remove('text-emerald-700', 'border-emerald-400', 'bg-emerald-50');
            button.classList.add('text-stone-500', 'border-stone-200');
            button.title = t('skriv.strukturTooltip');
        }
    }

    // --- Toggle dropdown ---

    function handleButtonClick(e) {
        e.stopPropagation(); // Prevent document click from immediately closing
        buildPanel(); // Rebuild to reflect current state
        panel.classList.toggle('hidden');
    }

    // Close panel when clicking outside
    function handleOutsideClick(e) {
        if (!button.contains(e.target) && !panel.contains(e.target)) {
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

    return { destroy, updateButtonState };
}
