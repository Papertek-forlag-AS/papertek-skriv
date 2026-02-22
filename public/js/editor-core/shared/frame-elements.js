/**
 * Frame element selectors and utilities.
 * Centralizes knowledge of frame CSS classes so that
 * modules don't independently hard-code them.
 *
 * Usage:
 *   import { FRAME_SELECTORS, isFrameElement, getCleanEditorText } from './frame-elements.js';
 */

/**
 * CSS selectors for all frame scaffold elements.
 * These are non-editable structure that should be excluded
 * from word counts, exports, and TOC scanning.
 */
export const FRAME_SELECTORS = {
    section:    '.skriv-frame-section',
    subsection: '.skriv-frame-subsection',
    prompt:     '.skriv-frame-prompt',
    toc:        '.skriv-toc',
    references: '.skriv-references',
};

/**
 * All frame scaffold selectors (section + subsection + prompt).
 */
export const ALL_FRAME_SCAFFOLD = [
    FRAME_SELECTORS.section,
    FRAME_SELECTORS.subsection,
    FRAME_SELECTORS.prompt,
].join(', ');

/**
 * Check if an element is a frame scaffold element.
 */
export function isFrameElement(el) {
    if (!el || !el.classList) return false;
    return el.classList.contains('skriv-frame-section')
        || el.classList.contains('skriv-frame-subsection')
        || el.classList.contains('skriv-frame-prompt');
}

/**
 * Check if an element is inside a non-editable block
 * (TOC, references, or frame section/subsection header).
 */
export function isInsideNonEditableBlock(el) {
    if (!el) return false;
    return !!el.closest('.skriv-toc')
        || !!el.closest('.skriv-references')
        || !!el.closest('.skriv-frame-section')
        || !!el.closest('.skriv-frame-subsection');
}

/**
 * Get editor text with all frame scaffold elements removed.
 * Used for accurate word count and .txt export.
 * @param {HTMLElement} editor - The contenteditable element
 * @returns {string} Clean text
 */
export function getCleanEditorText(editor) {
    const clone = editor.cloneNode(true);
    clone.querySelectorAll(ALL_FRAME_SCAFFOLD).forEach(el => el.remove());
    return clone.innerText || '';
}

/**
 * Remove frame scaffold elements from a cloned DOM.
 * Useful for export where you need the cleaned HTML tree.
 * @param {HTMLElement} clone - A cloned DOM element
 */
export function removeFrameScaffold(clone) {
    clone.querySelectorAll(ALL_FRAME_SCAFFOLD).forEach(el => el.remove());
}
