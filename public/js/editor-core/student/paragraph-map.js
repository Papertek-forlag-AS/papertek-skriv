/**
 * Paragraph Map — a visual minimap of the document's structure.
 *
 * Shows a vertical strip on the right side of the editor that
 * represents each block element (paragraph, heading, list) as a
 * proportionally-sized bar. Color-coded by element type:
 *   - Headings (H1/H2) → emerald (structural landmarks)
 *   - Regular paragraphs → stone (body text)
 *   - Lists (UL/OL) → blue-gray
 *   - Frame sections → soft green (scaffolding)
 *
 * Clicking a bar scrolls the editor to that paragraph.
 * The currently visible paragraph is highlighted with stronger color.
 *
 * Helps students see the shape of their text at a glance:
 * is the introduction too long? Are the body paragraphs balanced?
 *
 * No AI, no suggestions — just visual structure feedback.
 *
 * Usage:
 *   import { initParagraphMap } from './paragraph-map.js';
 *   const { destroy, toggle, isActive, update } = initParagraphMap(editor, scrollContainer);
 */

import { t } from '../shared/i18n.js';
import { isFrameElement } from '../shared/frame-elements.js';

const DEBOUNCE_MS = 600;
const MIN_BAR_HEIGHT = 3;  // px — minimum visual size for tiny paragraphs

// Block selector — the elements we visualize
const BLOCK_SELECTOR = 'p, h1, h2, li, div.skriv-frame-section, div.skriv-frame-subsection';

/**
 * Classify a block element for color-coding.
 * @param {HTMLElement} el
 * @returns {'heading'|'paragraph'|'list'|'frame'|'empty'}
 */
function classifyBlock(el) {
    const tag = el.tagName;
    if (tag === 'H1' || tag === 'H2') return 'heading';
    if (tag === 'LI') return 'list';
    if (el.classList.contains('skriv-frame-section') || el.classList.contains('skriv-frame-subsection')) return 'frame';
    // Check for empty paragraph
    const text = el.textContent.trim();
    if (!text || text === '\u200B') return 'empty';
    return 'paragraph';
}

/**
 * Get the word count of a block (used for proportional sizing).
 * @param {HTMLElement} el
 * @returns {number}
 */
function blockWordCount(el) {
    const text = el.textContent.trim();
    if (!text) return 0;
    return text.split(/\s+/).length;
}

/**
 * Initialize the Paragraph Map.
 * @param {HTMLElement} editor - contenteditable element
 * @param {HTMLElement} scrollContainer - the scrollable parent (editorWrap)
 * @returns {{ destroy, toggle, isActive, update }}
 */
export function initParagraphMap(editor, scrollContainer) {
    let active = false;
    let debounceTimer = null;
    let mapEl = null;
    let blocks = []; // cached block data
    let scrollHandler = null;
    let resizeObserver = null;

    // --- Create minimap DOM ---
    mapEl = document.createElement('div');
    mapEl.className = 'skriv-paragraph-map hidden';
    mapEl.setAttribute('aria-label', t('paragraphMap.ariaLabel'));

    // The map container sits inside the scroll container
    // positioned fixed on the right side
    scrollContainer.style.position = 'relative';
    scrollContainer.appendChild(mapEl);

    /**
     * Analyze the editor and build block data.
     * @returns {Array<{el: HTMLElement, type: string, words: number, top: number, height: number}>}
     */
    function analyzeBlocks() {
        const result = [];
        const allBlocks = editor.querySelectorAll(BLOCK_SELECTOR);
        const editorRect = editor.getBoundingClientRect();
        const scrollTop = scrollContainer.scrollTop;

        for (const block of allBlocks) {
            // Skip blocks inside TOC and reference list
            if (block.closest('.skriv-toc, .skriv-references')) continue;

            const type = classifyBlock(block);
            if (type === 'empty') continue;

            // Skip frame prompts (ghost text)
            if (block.classList.contains('skriv-frame-prompt')) continue;

            const words = blockWordCount(block);
            const blockRect = block.getBoundingClientRect();

            // Position relative to editor top
            const top = blockRect.top - editorRect.top + scrollTop;
            const height = blockRect.height;

            result.push({ el: block, type, words, top, height });
        }

        return result;
    }

    /**
     * Render the minimap bars.
     */
    function render() {
        if (!active) return;

        blocks = analyzeBlocks();
        mapEl.innerHTML = '';

        if (blocks.length === 0) return;

        // Calculate total editor height for proportional mapping
        const editorHeight = editor.scrollHeight;
        const mapHeight = mapEl.clientHeight || 200;

        // Find viewport position for active indicator
        const scrollTop = scrollContainer.scrollTop;
        const viewportHeight = scrollContainer.clientHeight;

        for (let i = 0; i < blocks.length; i++) {
            const b = blocks[i];

            // Proportional position and size
            const barTop = (b.top / editorHeight) * mapHeight;
            const barHeight = Math.max(MIN_BAR_HEIGHT, (b.height / editorHeight) * mapHeight);

            const bar = document.createElement('div');
            bar.className = `pmap-bar pmap-${b.type}`;
            bar.style.top = `${barTop}px`;
            bar.style.height = `${barHeight}px`;

            // Tooltip showing word count
            if (b.type === 'heading') {
                const text = b.el.textContent.trim();
                bar.title = text.length > 40 ? text.slice(0, 40) + '…' : text;
            } else if (b.type !== 'frame') {
                bar.title = `${b.words} ${t('paragraphMap.words')}`;
            }

            // Check if this block is currently in view
            const blockVisibleTop = b.top;
            const blockVisibleBottom = b.top + b.height;
            const isInView = blockVisibleBottom > scrollTop && blockVisibleTop < (scrollTop + viewportHeight);
            if (isInView) {
                bar.classList.add('pmap-active');
            }

            // Click to scroll to this paragraph
            bar.addEventListener('click', () => {
                b.el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });

            mapEl.appendChild(bar);
        }

        // Viewport indicator
        const viewIndicator = document.createElement('div');
        viewIndicator.className = 'pmap-viewport';
        const viTop = (scrollTop / editorHeight) * mapHeight;
        const viHeight = Math.max(10, (viewportHeight / editorHeight) * mapHeight);
        viewIndicator.style.top = `${viTop}px`;
        viewIndicator.style.height = `${viHeight}px`;
        mapEl.appendChild(viewIndicator);
    }

    /**
     * Debounced input handler.
     */
    function handleInput() {
        if (!active) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(render, DEBOUNCE_MS);
    }

    /**
     * Scroll handler — update active indicators and viewport.
     */
    function handleScroll() {
        if (!active) return;
        // Use requestAnimationFrame for smooth updates
        requestAnimationFrame(render);
    }

    /**
     * Toggle the paragraph map on/off.
     * @returns {boolean} New active state
     */
    function toggle() {
        active = !active;
        if (active) {
            mapEl.classList.remove('hidden');
            render();
            editor.addEventListener('input', handleInput);
            scrollHandler = handleScroll;
            scrollContainer.addEventListener('scroll', scrollHandler, { passive: true });

            // Watch for resize
            resizeObserver = new ResizeObserver(() => {
                if (active) render();
            });
            resizeObserver.observe(editor);
        } else {
            editor.removeEventListener('input', handleInput);
            if (scrollHandler) {
                scrollContainer.removeEventListener('scroll', scrollHandler);
                scrollHandler = null;
            }
            if (resizeObserver) {
                resizeObserver.disconnect();
                resizeObserver = null;
            }
            mapEl.classList.add('hidden');
            if (debounceTimer) clearTimeout(debounceTimer);
        }
        return active;
    }

    /**
     * Force a fresh render.
     */
    function update() {
        if (active) render();
    }

    /**
     * Clean up everything.
     */
    function destroy() {
        active = false;
        editor.removeEventListener('input', handleInput);
        if (scrollHandler) {
            scrollContainer.removeEventListener('scroll', scrollHandler);
            scrollHandler = null;
        }
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (debounceTimer) clearTimeout(debounceTimer);
        if (mapEl?.parentNode) mapEl.remove();
    }

    return { destroy, toggle, isActive: () => active, update };
}
