/**
 * Floating formatting toolbar for the writing editor.
 * Appears above text selection as a dark pill (Medium/Notion style).
 *
 * Default buttons: B, I, U
 * Advanced mode adds: bullet list, numbered list, H1, H2
 *
 * Special characters are handled by the separate special-chars-panel.js module.
 *
 * Usage:
 *   const toolbar = initEditorToolbar(editor);
 *   toolbar.destroy();                  // cleanup
 *   toolbar.isAdvancedMode();           // check state
 *   toolbar.onAdvancedChange(fn);       // listen to toggle
 *   toolbar.setAdvancedMode(bool);      // set programmatically
 */

import { computePosition, flip, shift, offset } from 'https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.7.5/+esm';
import { SPECIAL_CHAR_GROUPS } from '../config.js';
import { t } from '../shared/i18n.js';
import { showInPageConfirm } from '../shared/in-page-modal.js';
import { isInsideNonEditableBlock, FRAME_SELECTORS } from '../shared/frame-elements.js';
import { initSpecialCharsPanel } from './special-chars-panel.js';

/**
 * Initialize the floating editor toolbar.
 * @param {HTMLElement} editor - The contenteditable editor element
 * @returns {Object} toolbar API with destroy(), isAdvancedMode(), onAdvancedChange(), setAdvancedMode()
 */
export function initEditorToolbar(editor) {
    document.execCommand('defaultParagraphSeparator', false, 'p');

    const container = editor.closest('#writing-env') || editor.parentElement;
    let advancedMode = false;
    const advancedChangeListeners = [];

    // --- Build toolbar DOM ---
    const toolbar = document.createElement('div');
    toolbar.id = 'editor-floating-toolbar';
    toolbar.className = [
        'fixed', 'z-[300]',
        'flex', 'items-center', 'gap-0.5',
        'bg-stone-800', 'rounded-full', 'px-1.5', 'py-1', 'shadow-xl',
        'transition-all', 'duration-150', 'origin-bottom',
        'opacity-0', 'scale-95', 'pointer-events-none'
    ].join(' ');

    function createBtn(label, extraClasses = []) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = label;
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

    function createSeparator() {
        const sep = document.createElement('div');
        sep.className = 'w-px h-5 bg-stone-600 flex-shrink-0';
        return sep;
    }

    // Always-visible buttons
    const btnBold      = createBtn('B', ['font-bold']);
    const btnItalic    = createBtn('I', ['italic']);
    const btnUnderline = createBtn('U', ['underline']);

    // Advanced mode buttons (hidden by default)
    const sepLists      = createSeparator();
    const btnBulletList = createBtn('•', ['text-lg']);
    const btnOrderedList = createBtn('1.', ['text-xs', 'font-bold']);
    const sepHeadings   = createSeparator();
    const btnH1         = createBtn('H1', ['text-xs', 'font-bold']);
    const btnH2         = createBtn('H2', ['text-xs', 'font-bold']);

    // Always-visible part
    toolbar.appendChild(btnBold);
    toolbar.appendChild(btnItalic);
    toolbar.appendChild(btnUnderline);

    // Advanced mode: lists
    toolbar.appendChild(sepLists);
    toolbar.appendChild(btnBulletList);
    toolbar.appendChild(btnOrderedList);

    // Advanced mode: headings
    toolbar.appendChild(sepHeadings);
    toolbar.appendChild(btnH1);
    toolbar.appendChild(btnH2);

    // Hide advanced buttons initially
    const advancedBtns = [sepLists, btnBulletList, btnOrderedList, sepHeadings, btnH1, btnH2];
    advancedBtns.forEach(el => { el.style.display = 'none'; });

    const toolbarWrapper = document.createElement('div');
    toolbarWrapper.className = 'fixed z-[300]';
    toolbarWrapper.style.position = 'fixed';
    container.appendChild(toolbarWrapper);
    toolbarWrapper.appendChild(toolbar);

    let toolbarMousedown = false;
    toolbarWrapper.addEventListener('mousedown', () => { toolbarMousedown = true; });
    toolbarWrapper.addEventListener('mouseup',   () => { toolbarMousedown = false; });
    document.addEventListener('mouseup', () => { toolbarMousedown = false; });

    // --- Advanced toggle (fixed in top bar, added by standalone-writer) ---
    // The toolbar exposes API for standalone-writer to control advanced mode.

    function updateAdvancedButtons() {
        const display = advancedMode ? '' : 'none';
        advancedBtns.forEach(el => { el.style.display = display; });
    }

    async function toggleAdvancedMode() {
        if (advancedMode) {
            // Check if there are headings in the editor
            const headings = editor.querySelectorAll('h1, h2');
            const toc = editor.querySelector('.skriv-toc');
            if (headings.length > 0 || toc) {
                const confirmed = await showInPageConfirm(
                    t('skriv.advancedDisableConfirmTitle'),
                    t('skriv.advancedDisableConfirmMessage'),
                    t('skriv.advancedDisableConfirmYes'),
                    t('common.cancel')
                );
                if (!confirmed) return;

                // Convert headings to bold paragraphs with data markers for restoration
                headings.forEach(h => {
                    const p = document.createElement('p');
                    const level = h.tagName.toUpperCase() === 'H1' ? '1' : '2';
                    p.setAttribute('data-was-heading', level);
                    p.innerHTML = `<b>${h.innerHTML}</b>`;
                    h.parentNode.replaceChild(p, h);
                });

                // Remove TOC
                if (toc) toc.remove();
            }
            advancedMode = false;
        } else {
            // Restore marked paragraphs back to headings
            const markedParas = editor.querySelectorAll('p[data-was-heading]');
            markedParas.forEach(p => {
                const level = p.getAttribute('data-was-heading');
                const tag = level === '1' ? 'h1' : 'h2';
                const heading = document.createElement(tag);
                const boldChild = p.querySelector(':scope > b');
                if (boldChild && p.childNodes.length === 1) {
                    heading.innerHTML = boldChild.innerHTML;
                } else {
                    heading.innerHTML = p.innerHTML;
                }
                p.parentNode.replaceChild(heading, p);
            });

            advancedMode = true;
        }
        updateAdvancedButtons();
        advancedChangeListeners.forEach(fn => fn(advancedMode));
    }

    // --- Helper: find closest LI ancestor within editor ---
    function getClosestLI() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        let node = sel.getRangeAt(0).startContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        while (node && node !== editor) {
            if (node.tagName === 'LI') return node;
            node = node.parentNode;
        }
        return null;
    }

    // --- Active state management ---
    function getBlockElement() {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return null;
        const range = sel.getRangeAt(0);
        const startNode = range.startContainer;
        let node = startNode;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
        if (!node || !editor.contains(node)) return null;

        if (node !== editor) {
            let current = node;
            while (current && current !== editor) {
                if (current.parentNode === editor) return current;
                current = current.parentNode;
            }
        }

        if (startNode === editor) {
            const child = editor.childNodes[range.startOffset]
                || editor.childNodes[range.startOffset - 1]
                || editor.lastChild;
            if (child && child.nodeType === Node.ELEMENT_NODE && child.parentNode === editor) {
                return child;
            }
            if (child && child.nodeType === Node.TEXT_NODE && child.parentNode === editor) {
                const p = document.createElement('p');
                editor.insertBefore(p, child);
                p.appendChild(child);
                return p;
            }
        }

        if (startNode.nodeType === Node.TEXT_NODE && startNode.parentNode === editor) {
            const p = document.createElement('p');
            editor.insertBefore(p, startNode);
            p.appendChild(startNode);
            range.setStart(startNode, range.startOffset);
            return p;
        }

        return null;
    }

    function updateActiveStates() {
        const isActive = (cmd) => {
            try { return document.queryCommandState(cmd); } catch { return false; }
        };

        btnBold.classList.toggle('bg-stone-600', isActive('bold'));
        btnItalic.classList.toggle('bg-stone-600', isActive('italic'));
        btnUnderline.classList.toggle('bg-stone-600', isActive('underline'));

        // List active states
        btnBulletList.classList.toggle('bg-stone-600', isActive('insertUnorderedList'));
        btnOrderedList.classList.toggle('bg-stone-600', isActive('insertOrderedList'));

        const blockEl = getBlockElement();
        const tag = blockEl?.tagName?.toUpperCase() || '';
        btnH1.classList.toggle('bg-stone-600', tag === 'H1');
        btnH2.classList.toggle('bg-stone-600', tag === 'H2');
    }

    // --- Show/hide toolbar ---
    let isVisible = false;

    function showToolbar(range) {
        isVisible = true;
        toolbar.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
        toolbar.classList.add('opacity-100', 'scale-100');

        const virtualEl = {
            getBoundingClientRect: () => range.getBoundingClientRect(),
            getClientRects: () => range.getClientRects(),
        };

        computePosition(virtualEl, toolbarWrapper, {
            placement: 'top',
            middleware: [offset(8), flip(), shift({ padding: 8 })],
        }).then(({ x, y }) => {
            toolbarWrapper.style.left = `${x}px`;
            toolbarWrapper.style.top  = `${y}px`;
        });

        updateActiveStates();
    }

    function hideToolbar() {
        if (!isVisible) return;
        isVisible = false;
        toolbar.classList.remove('opacity-100', 'scale-100');
        toolbar.classList.add('opacity-0', 'scale-95', 'pointer-events-none');
    }

    function onSelectionChange() {
        if (toolbarMousedown) return;

        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
            hideToolbar();
            return;
        }

        const range = sel.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) {
            hideToolbar();
            return;
        }

        showToolbar(range);
    }

    document.addEventListener('selectionchange', onSelectionChange);

    // --- Format actions ---
    function applyInlineFormat(command) {
        editor.focus();
        document.execCommand(command);
        updateActiveStates();
    }

    function applyList(type) {
        editor.focus();
        document.execCommand(type);
        updateActiveStates();
    }

    function applyHeading(tag) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        const blockEl = getBlockElement();
        if (!blockEl || blockEl === editor) return;

        // Don't allow heading inside TOC, reference, or frame blocks
        if (isInsideNonEditableBlock(blockEl)) return;

        const currentTag = blockEl.tagName?.toUpperCase() || '';

        editor.focus();

        const targetTag = (currentTag === tag.toUpperCase()) ? 'p' : tag.toLowerCase();

        const newEl = document.createElement(targetTag);
        newEl.innerHTML = blockEl.innerHTML;
        blockEl.parentNode.replaceChild(newEl, blockEl);
        const range = document.createRange();
        range.selectNodeContents(newEl);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        updateActiveStates();
    }

    btnBold.addEventListener('click',        () => applyInlineFormat('bold'));
    btnItalic.addEventListener('click',      () => applyInlineFormat('italic'));
    btnUnderline.addEventListener('click',   () => applyInlineFormat('underline'));
    btnBulletList.addEventListener('click',  () => applyList('insertUnorderedList'));
    btnOrderedList.addEventListener('click', () => applyList('insertOrderedList'));
    btnH1.addEventListener('click',          () => applyHeading('H1'));
    btnH2.addEventListener('click',          () => applyHeading('H2'));

    // --- Keyboard shortcuts + Enter/Tab handling ---
    function onEditorKeydown(e) {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === 'b') { e.preventDefault(); applyInlineFormat('bold'); return; }
            if (key === 'i') { e.preventDefault(); applyInlineFormat('italic'); return; }
            if (key === 'u') { e.preventDefault(); applyInlineFormat('underline'); return; }
        }

        // --- Tab / Shift+Tab for list indent/outdent ---
        if (e.key === 'Tab') {
            const li = getClosestLI();
            if (li) {
                e.preventDefault();
                if (e.shiftKey) {
                    document.execCommand('outdent');
                } else {
                    document.execCommand('indent');
                }
                return;
            }
            // If not in a list, let Tab do default (or nothing — we don't trap Tab outside lists)
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return;
            const range = sel.getRangeAt(0);
            const blockEl = getBlockElement();

            // Don't handle enter inside non-editable blocks
            if (blockEl && isInsideNonEditableBlock(blockEl)) {
                e.preventDefault();
                return;
            }

            // --- List item Enter handling ---
            const li = getClosestLI();
            if (li) {
                const isEmpty = !li.textContent.trim() && !li.querySelector('img');
                if (isEmpty) {
                    // Empty LI: exit the list
                    e.preventDefault();
                    const list = li.closest('ul, ol');
                    if (!list) return;

                    // Check if this is a nested list
                    const parentLI = list.parentElement?.closest('li');
                    if (parentLI) {
                        // Nested: outdent instead of exiting completely
                        li.remove();
                        if (list.children.length === 0) list.remove();
                        document.execCommand('outdent');
                    } else {
                        // Top-level: exit list, create a <p> after the list
                        li.remove();
                        if (list.children.length === 0) list.remove();

                        const p = document.createElement('p');
                        p.innerHTML = '<br>';
                        if (list.parentNode) {
                            if (list.nextSibling) {
                                list.parentNode.insertBefore(p, list.nextSibling);
                            } else {
                                list.parentNode.appendChild(p);
                            }
                        } else {
                            editor.appendChild(p);
                        }

                        const newRange = document.createRange();
                        newRange.setStart(p, 0);
                        newRange.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    }
                } else {
                    // Non-empty LI: split at cursor and create new LI
                    e.preventDefault();
                    const afterRange = document.createRange();
                    afterRange.setStart(range.endContainer, range.endOffset);
                    afterRange.setEnd(li, li.childNodes.length);
                    const afterContent = afterRange.extractContents();

                    const newLI = document.createElement('li');
                    if (afterContent.textContent.trim() || afterContent.querySelector('*')) {
                        newLI.appendChild(afterContent);
                    } else {
                        newLI.innerHTML = '<br>';
                    }

                    if (!li.textContent.trim() && !li.querySelector('img, br')) {
                        li.innerHTML = '<br>';
                    }

                    if (li.nextSibling) {
                        li.parentNode.insertBefore(newLI, li.nextSibling);
                    } else {
                        li.parentNode.appendChild(newLI);
                    }

                    const newRange = document.createRange();
                    newRange.setStart(newLI, 0);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                }
                return;
            }

            // --- Normal (non-list) Enter handling ---
            e.preventDefault();

            if (!blockEl || blockEl === editor) {
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                editor.appendChild(p);
                range.setStart(p, 0);
                range.collapse(true);
                sel.removeAllRanges();
                sel.addRange(range);
                return;
            }

            const tag = blockEl.tagName?.toUpperCase();
            const isHeading = tag === 'H1' || tag === 'H2';

            const afterRange = document.createRange();
            afterRange.setStart(range.endContainer, range.endOffset);
            afterRange.setEnd(blockEl, blockEl.childNodes.length);
            const afterContent = afterRange.extractContents();

            const newBlock = document.createElement(isHeading ? 'p' : blockEl.tagName.toLowerCase());
            if (afterContent.textContent.trim() || afterContent.querySelector('*')) {
                newBlock.appendChild(afterContent);
            } else {
                newBlock.innerHTML = '<br>';
            }

            if (!blockEl.textContent.trim() && !blockEl.querySelector('img, br')) {
                blockEl.innerHTML = '<br>';
            }

            if (blockEl.nextSibling) {
                editor.insertBefore(newBlock, blockEl.nextSibling);
            } else {
                editor.appendChild(newBlock);
            }

            const newRange = document.createRange();
            newRange.setStart(newBlock, 0);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
    }

    editor.addEventListener('keydown', onEditorKeydown);

    // --- Special characters panel (separate module) ---
    const charsCleanup = initSpecialCharsPanel(editor, container, SPECIAL_CHAR_GROUPS);

    // --- Destroy ---
    function destroy() {
        document.removeEventListener('selectionchange', onSelectionChange);
        editor.removeEventListener('keydown', onEditorKeydown);
        charsCleanup();
        if (toolbarWrapper.parentNode) {
            toolbarWrapper.parentNode.removeChild(toolbarWrapper);
        }
    }

    // --- Check if document already has advanced content ---
    function detectExistingAdvanced() {
        const hasHeadings = editor.querySelectorAll('h1, h2').length > 0;
        const hasToc = !!editor.querySelector('.skriv-toc');
        const hasLists = editor.querySelectorAll('ul, ol').length > 0;
        const hasMarkedHeadings = editor.querySelectorAll('p[data-was-heading]').length > 0;
        const hasFrame = editor.querySelectorAll(FRAME_SELECTORS.section).length > 0;
        if (hasHeadings || hasToc || hasLists || hasFrame) {
            advancedMode = true;
            updateAdvancedButtons();
            advancedChangeListeners.forEach(fn => fn(advancedMode));
        }
        // Note: hasMarkedHeadings alone doesn't auto-enable advanced mode —
        // the student turned it off deliberately. The markers just preserve the ability to restore.
    }

    // Detect after a short delay to ensure all listeners are registered
    setTimeout(detectExistingAdvanced, 50);

    return {
        destroy,
        isAdvancedMode: () => advancedMode,
        toggleAdvancedMode,
        setAdvancedMode: (enabled) => {
            advancedMode = enabled;
            updateAdvancedButtons();
            advancedChangeListeners.forEach(fn => fn(advancedMode));
        },
        onAdvancedChange: (fn) => { advancedChangeListeners.push(fn); },
        getBlockElement,
    };
}
