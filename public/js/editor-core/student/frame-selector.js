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
const DEFAULT_FRAME_REGISTRY = [
    { id: 'droefting', file: '/frames/{{lang}}/droefting.md', labelKey: 'skriv.frameDroefting', descKey: 'skriv.frameDroeftingDesc' },
    { id: 'analyse', file: '/frames/{{lang}}/analyse.md', labelKey: 'skriv.frameAnalyse', descKey: 'skriv.frameAnalyseDesc' },
    { id: 'kronikk', file: '/frames/{{lang}}/kronikk.md', labelKey: 'skriv.frameKronikk', descKey: 'skriv.frameKronikkDesc' },
    { id: 'kaaseri', file: '/frames/{{lang}}/kaaseri.md', labelKey: 'skriv.frameKaaseri', descKey: 'skriv.frameKaaseriDesc' },
    { id: 'fagartikkel', file: '/frames/{{lang}}/fagartikkel.md', labelKey: 'skriv.frameFagartikkel', descKey: 'skriv.frameFagartikkelDesc' },
    { id: 'leserinnlegg', file: '/frames/{{lang}}/leserinnlegg.md', labelKey: 'skriv.frameLeserinnlegg', descKey: 'skriv.frameLeserinnleggDesc' },
    { id: 'novelle', file: '/frames/{{lang}}/novelle.md', labelKey: 'skriv.frameNovelle', descKey: 'skriv.frameNovelleDesc' },
    { id: 'retorisk-analyse', file: '/frames/{{lang}}/retorisk-analyse.md', labelKey: 'skriv.frameRetoriskAnalyse', descKey: 'skriv.frameRetoriskAnalyseDesc' },
    { id: 'kortsvar', file: '/frames/{{lang}}/kortsvar.md', labelKey: 'skriv.frameKortsvar', descKey: 'skriv.frameKortsvarDesc' },
    { id: 'kreativ-tekst', file: '/frames/{{lang}}/kreativ-tekst.md', labelKey: 'skriv.frameKreativTekst', descKey: 'skriv.frameKreativTekstDesc' },
    { id: 'reflekterende-tekst', file: '/frames/{{lang}}/reflekterende-tekst.md', labelKey: 'skriv.frameReflekterendeTekst', descKey: 'skriv.frameReflekterendeTekstDesc' },
    { id: 'sammenligning', file: '/frames/{{lang}}/sammenligning.md', labelKey: 'skriv.frameSammenligning', descKey: 'skriv.frameSammenligningDesc' },
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
 * @param {object} frameGuide - The frame guide panel API (applyFrame, removeFrame, getActiveFrame, hasFrame, toggle, hide)
 * @param {{ onFrameApplied?: () => void, frames?: Array }} options
 * @returns {{ destroy: () => void, updateButtonState: () => void }}
 */
export function initFrameSelector(button, editor, frameGuide, options = {}) {
    const { onFrameApplied } = options;
    const frameRegistry = options.frames || DEFAULT_FRAME_REGISTRY;

    // --- Build dropdown panel (appended to body to avoid overflow clipping) ---
    const panel = document.createElement('div');
    panel.className = 'hidden bg-white border border-stone-200 rounded-lg shadow-lg py-2 min-w-[240px]';
    panel.style.cssText = 'position: fixed; z-index: 100; max-height: 400px; overflow-y: auto;';
    document.body.appendChild(panel);

    /** Position the panel below the button using fixed coords. */
    function positionPanel() {
        const rect = button.getBoundingClientRect();
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
            toggleBtn.className = 'block w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors';
            toggleBtn.textContent = frameGuide.isVisible?.() ? t('skriv.frameHideGuide') : t('skriv.frameShowGuide');
            toggleBtn.addEventListener('click', () => {
                panel.classList.add('hidden');
                frameGuide.toggle();
            });
            panel.appendChild(toggleBtn);

            // Switch frame
            const switchBtn = document.createElement('button');
            switchBtn.className = 'block w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors';
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

        // Frame options
        for (const frame of frameRegistry) {
            const btn = document.createElement('button');
            btn.className = 'block w-full text-left px-4 py-2 hover:bg-stone-50 transition-colors';

            const isActive = frameGuide.getActiveFrame() === frame.id;

            btn.innerHTML = `
                <div class="text-sm font-medium ${isActive ? 'text-emerald-700' : 'text-stone-700'}">
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
    }

    // --- Frame selection logic ---

    async function handleSelectFrame(frame) {
        const hasExistingFrame = frameGuide.hasFrame();

        // If there's an existing frame, confirm switch
        if (hasExistingFrame) {
            const confirmed = await showInPageConfirm(
                t('skriv.frameSwitchConfirmTitle'),
                t('skriv.frameSwitchConfirmMessage'),
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
                frameGuide.applyFrame(frameData, frame.id);
                updateButtonState();
                if (onFrameApplied) onFrameApplied();
                return;
            }
            const md = await res.text();
            const frameData = parseFrameMarkdown(md);
            frameGuide.applyFrame(frameData, frame.id);
            updateButtonState();
            if (onFrameApplied) onFrameApplied();
        } catch (err) {
            console.error('Frame load error:', err);
        }
    }

    async function handleRemoveFrame() {
        frameGuide.removeFrame();
        frameGuide.hide();
        updateButtonState();
    }

    // --- Button state: green when frame is active ---

    function updateButtonState() {
        if (frameGuide.hasFrame()) {
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
        positionPanel();
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
