/**
 * Math formatting module for the writing editor.
 * Adds superscript (x²) and subscript (x₂) support to the floating toolbar.
 *
 * Uses native execCommand('superscript'/'subscript') which wraps selected
 * text in <sup>/<sub> tags — perfect for writing powers, chemical formulas, etc.
 *
 * Keyboard shortcuts:
 *   Ctrl+.  → superscript
 *   Ctrl+,  → subscript
 *
 * Usage:
 *   const matte = initMatte(editor, toolbarEl);
 *   matte.destroy();   // cleanup
 */

import { t } from '../shared/i18n.js';

/**
 * Initialize math formatting (superscript / subscript).
 * @param {HTMLElement} editor     - The contenteditable editor element
 * @param {HTMLElement} toolbarEl  - The floating toolbar DOM element (the inner pill)
 * @returns {{ destroy: Function }}
 */
export function initMatte(editor, toolbarEl) {

    // --- Create buttons ---

    function createBtn(innerHTML, title, extraClasses = []) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.innerHTML = innerHTML;
        btn.title = title;
        btn.tabIndex = -1;
        btn.className = [
            'text-white', 'hover:bg-stone-600', 'rounded-full',
            'w-8', 'h-8', 'flex', 'items-center', 'justify-center',
            'text-sm', 'font-medium', 'select-none', 'transition-colors',
            ...extraClasses
        ].join(' ');
        btn.addEventListener('mousedown', (e) => e.preventDefault());
        return btn;
    }

    const separator = document.createElement('div');
    separator.className = 'w-px h-5 bg-stone-600 flex-shrink-0';

    const btnSup = createBtn(
        'x<sup style="font-size:0.65em;vertical-align:super;line-height:1">n</sup>',
        t('matte.superscriptTooltip'),
        ['text-xs']
    );

    const btnSub = createBtn(
        'x<sub style="font-size:0.65em;vertical-align:sub;line-height:1">n</sub>',
        t('matte.subscriptTooltip'),
        ['text-xs']
    );

    // Insert after the underline button (3rd button, index 2)
    // Toolbar children: [B, I, U, sep, bullet, ordered, sep, H1, H2]
    // We insert after U (index 2): sep, sup, sub
    const underlineBtn = toolbarEl.children[2]; // U button
    const insertRef = underlineBtn.nextSibling;
    toolbarEl.insertBefore(separator, insertRef);
    toolbarEl.insertBefore(btnSup, insertRef);
    toolbarEl.insertBefore(btnSub, insertRef);

    // --- Format actions ---

    function applySuperscript() {
        editor.focus();
        document.execCommand('superscript');
        updateActiveStates();
    }

    function applySubscript() {
        editor.focus();
        document.execCommand('subscript');
        updateActiveStates();
    }

    btnSup.addEventListener('click', applySuperscript);
    btnSub.addEventListener('click', applySubscript);

    // --- Active state management ---

    function updateActiveStates() {
        const isActive = (cmd) => {
            try { return document.queryCommandState(cmd); } catch { return false; }
        };
        btnSup.classList.toggle('bg-stone-600', isActive('superscript'));
        btnSub.classList.toggle('bg-stone-600', isActive('subscript'));
    }

    function onSelectionChange() {
        updateActiveStates();
    }

    document.addEventListener('selectionchange', onSelectionChange);

    // --- Keyboard shortcuts ---

    function onKeydown(e) {
        if (e.ctrlKey || e.metaKey) {
            if (e.key === '.') {
                e.preventDefault();
                applySuperscript();
            } else if (e.key === ',') {
                e.preventDefault();
                applySubscript();
            }
        }
    }

    editor.addEventListener('keydown', onKeydown);

    // --- Destroy ---

    function destroy() {
        document.removeEventListener('selectionchange', onSelectionChange);
        editor.removeEventListener('keydown', onKeydown);
        if (separator.parentNode) separator.remove();
        if (btnSup.parentNode) btnSup.remove();
        if (btnSub.parentNode) btnSub.remove();
    }

    return { destroy };
}
