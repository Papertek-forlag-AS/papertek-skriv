/**
 * Focus Mode — distraction-free writing experience.
 *
 * How it works:
 *   1. When activated, hides the toolbar and adds a vignette overlay
 *   2. Fades all paragraphs except the one containing the cursor
 *   3. Tracks cursor movement and updates the focused paragraph
 *   4. Shows a minimal word count in the bottom-right corner
 *   5. Escape key or close button exits focus mode
 *
 * Fully self-contained: injects its own <style> element, removes on destroy.
 *
 * Usage:
 *   import { initFocusMode } from './focus-mode.js';
 *   const { destroy, toggle, isActive } = initFocusMode(editor, container, { onToggle });
 */

import { t } from '../shared/i18n.js';

const TRANSITION_MS = 300;
const FADE_OPACITY = 0.3;

const STYLES = `
.skriv-focus-active {
    position: relative;
}

.skriv-focus-active::after {
    content: '';
    position: fixed;
    inset: 0;
    pointer-events: none;
    box-shadow: inset 0 0 120px rgba(0, 0, 0, 0.15);
    z-index: 9998;
    opacity: 0;
    transition: opacity ${TRANSITION_MS}ms ease;
}

.skriv-focus-active.skriv-focus-vignette::after {
    opacity: 1;
}

.skriv-focus-fade {
    opacity: ${FADE_OPACITY};
    transition: opacity ${TRANSITION_MS}ms ease;
}

.skriv-focus-current {
    opacity: 1;
    transition: opacity ${TRANSITION_MS}ms ease;
}

.skriv-focus-close {
    position: fixed;
    top: 12px;
    right: 16px;
    z-index: 10000;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.08);
    color: #555;
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity ${TRANSITION_MS}ms ease, background ${TRANSITION_MS}ms ease;
}

.skriv-focus-close:hover {
    background: rgba(0, 0, 0, 0.15);
    color: #222;
}

.skriv-focus-close.visible {
    opacity: 1;
}

.skriv-focus-wordcount {
    position: fixed;
    bottom: 16px;
    right: 20px;
    z-index: 10000;
    font-size: 12px;
    color: #888;
    font-variant-numeric: tabular-nums;
    opacity: 0;
    transition: opacity ${TRANSITION_MS}ms ease;
    pointer-events: none;
    user-select: none;
}

.skriv-focus-wordcount.visible {
    opacity: 1;
}

.skriv-focus-toolbar-hidden {
    transform: translateY(-100%);
    opacity: 0;
    transition: transform ${TRANSITION_MS}ms ease, opacity ${TRANSITION_MS}ms ease;
}

.skriv-focus-toolbar-transition {
    transition: transform ${TRANSITION_MS}ms ease, opacity ${TRANSITION_MS}ms ease;
}
`;

/**
 * Initializes Focus Mode for the given editor.
 *
 * @param {HTMLElement} editor — the contenteditable element
 * @param {HTMLElement} container — the outer container (usually .editor-area or body)
 * @param {object} [options]
 * @param {function} [options.onToggle] — callback(isActive) when mode changes
 * @param {string} [options.toolbarSelector] — CSS selector for the toolbar to hide
 * @returns {{ destroy: function, toggle: function, isActive: function }}
 */
export function initFocusMode(editor, container, options = {}) {
    const { onToggle, toolbarSelector = '.editor-toolbar, .top-bar' } = options;

    let active = false;
    let currentParagraph = null;
    let styleEl = null;
    let closeBtn = null;
    let wordcountEl = null;

    // --- DOM setup ---

    function injectStyles() {
        styleEl = document.createElement('style');
        styleEl.setAttribute('data-skriv-focus', '');
        styleEl.textContent = STYLES;
        document.head.appendChild(styleEl);
    }

    function createCloseButton() {
        closeBtn = document.createElement('button');
        closeBtn.className = 'skriv-focus-close';
        closeBtn.setAttribute('aria-label', t('focusMode.close') || 'Close focus mode');
        closeBtn.textContent = '×'; // multiplication sign as X
        closeBtn.addEventListener('click', deactivate);
        document.body.appendChild(closeBtn);
    }

    function createWordCount() {
        wordcountEl = document.createElement('div');
        wordcountEl.className = 'skriv-focus-wordcount';
        wordcountEl.setAttribute('aria-live', 'polite');
        document.body.appendChild(wordcountEl);
    }

    // --- Word count ---

    function countWords() {
        const text = editor.innerText || '';
        const words = text.trim().split(/\s+/).filter(w => w.length > 0);
        return words.length;
    }

    function updateWordCount() {
        if (!wordcountEl || !active) return;
        const count = countWords();
        const label = t('focusMode.words') || '{count} ord';
        wordcountEl.textContent = label.replace('{count}', count);
    }

    // --- Paragraph focus ---

    function getParagraphAtCursor() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return null;

        let node = sel.anchorNode;
        if (!node) return null;

        // Walk up to find direct child of editor
        while (node && node.parentElement !== editor) {
            node = node.parentElement;
        }

        // If node is text node directly in editor, use it
        if (node && node.nodeType === Node.TEXT_NODE && node.parentNode === editor) {
            return node;
        }

        return node && node.parentElement === editor ? node : null;
    }

    function updateFocus() {
        if (!active) return;

        const paragraph = getParagraphAtCursor();

        if (paragraph === currentParagraph) return;
        currentParagraph = paragraph;

        // Apply classes to all direct children of editor
        const children = editor.children;
        for (let i = 0; i < children.length; i++) {
            const child = children[i];
            if (child === currentParagraph) {
                child.classList.remove('skriv-focus-fade');
                child.classList.add('skriv-focus-current');
            } else {
                child.classList.remove('skriv-focus-current');
                child.classList.add('skriv-focus-fade');
            }
        }

        updateWordCount();
    }

    // --- Toolbar hiding ---

    function getToolbars() {
        return document.querySelectorAll(toolbarSelector);
    }

    function hideToolbar() {
        const toolbars = getToolbars();
        toolbars.forEach(tb => {
            tb.classList.add('skriv-focus-toolbar-transition');
            // Force reflow so transition applies
            void tb.offsetHeight;
            tb.classList.add('skriv-focus-toolbar-hidden');
        });
    }

    function showToolbar() {
        const toolbars = getToolbars();
        toolbars.forEach(tb => {
            tb.classList.remove('skriv-focus-toolbar-hidden');
            // Remove transition class after animation completes
            setTimeout(() => {
                tb.classList.remove('skriv-focus-toolbar-transition');
            }, TRANSITION_MS);
        });
    }

    // --- Activate / Deactivate ---

    function activate() {
        if (active) return;
        active = true;

        container.classList.add('skriv-focus-active');

        // Delay vignette for smooth entry
        requestAnimationFrame(() => {
            container.classList.add('skriv-focus-vignette');
        });

        hideToolbar();
        updateFocus();
        updateWordCount();

        // Show UI elements
        if (closeBtn) closeBtn.classList.add('visible');
        if (wordcountEl) wordcountEl.classList.add('visible');

        // Bind events
        document.addEventListener('selectionchange', handleSelectionChange);
        editor.addEventListener('input', handleInput);
        document.addEventListener('keydown', handleKeyDown);

        if (onToggle) onToggle(true);
    }

    function deactivate() {
        if (!active) return;
        active = false;

        // Remove paragraph classes
        const children = editor.children;
        for (let i = 0; i < children.length; i++) {
            children[i].classList.remove('skriv-focus-fade', 'skriv-focus-current');
        }

        container.classList.remove('skriv-focus-vignette');
        // Delay removing base class so vignette transition can play
        setTimeout(() => {
            container.classList.remove('skriv-focus-active');
        }, TRANSITION_MS);

        showToolbar();

        // Hide UI elements
        if (closeBtn) closeBtn.classList.remove('visible');
        if (wordcountEl) wordcountEl.classList.remove('visible');

        // Unbind events
        document.removeEventListener('selectionchange', handleSelectionChange);
        editor.removeEventListener('input', handleInput);
        document.removeEventListener('keydown', handleKeyDown);

        currentParagraph = null;

        if (onToggle) onToggle(false);
    }

    function toggle() {
        active ? deactivate() : activate();
    }

    // --- Event handlers ---

    function handleSelectionChange() {
        updateFocus();
    }

    function handleInput() {
        updateFocus();
        updateWordCount();
    }

    function handleKeyDown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            deactivate();
        }
    }

    // --- Destroy ---

    function destroy() {
        deactivate();

        if (styleEl && styleEl.parentNode) {
            styleEl.parentNode.removeChild(styleEl);
            styleEl = null;
        }
        if (closeBtn && closeBtn.parentNode) {
            closeBtn.removeEventListener('click', deactivate);
            closeBtn.parentNode.removeChild(closeBtn);
            closeBtn = null;
        }
        if (wordcountEl && wordcountEl.parentNode) {
            wordcountEl.parentNode.removeChild(wordcountEl);
            wordcountEl = null;
        }
    }

    // --- Init ---

    injectStyles();
    createCloseButton();
    createWordCount();

    return { destroy, toggle, isActive: () => active };
}
