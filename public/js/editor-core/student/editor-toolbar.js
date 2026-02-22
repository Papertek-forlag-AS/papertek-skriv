/**
 * Floating formatting toolbar for the writing editor.
 * Appears above text selection as a dark pill (Medium/Notion style).
 * Buttons: B, I, U, H1, H2
 *
 * Special characters are rendered separately via initSpecialCharsPanel()
 * as a left-margin panel that follows the cursor vertically.
 *
 * Usage:
 *   const toolbarCleanup = initEditorToolbar(editor);
 *   // ...later:
 *   toolbarCleanup();
 */

import { computePosition, flip, shift, offset } from 'https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.7.5/+esm';
import { SPECIAL_CHAR_GROUPS } from '../config.js';

/**
 * Initialize the floating editor toolbar.
 * @param {HTMLElement} editor - The contenteditable editor element
 * @returns {Function} destroy - Call to remove all listeners and DOM elements
 */
export function initEditorToolbar(editor) {
    document.execCommand('defaultParagraphSeparator', false, 'p');

    const container = editor.closest('#writing-env') || editor.parentElement;

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

    const btnBold      = createBtn('B', ['font-bold']);
    const btnItalic    = createBtn('I', ['italic']);
    const btnUnderline = createBtn('U', ['underline']);
    const btnH1        = createBtn('H1', ['text-xs', 'font-bold']);
    const btnH2        = createBtn('H2', ['text-xs', 'font-bold']);

    toolbar.appendChild(btnBold);
    toolbar.appendChild(btnItalic);
    toolbar.appendChild(btnUnderline);
    toolbar.appendChild(createSeparator());
    toolbar.appendChild(btnH1);
    toolbar.appendChild(btnH2);

    const toolbarWrapper = document.createElement('div');
    toolbarWrapper.className = 'fixed z-[300]';
    toolbarWrapper.style.position = 'fixed';
    container.appendChild(toolbarWrapper);
    toolbarWrapper.appendChild(toolbar);

    let toolbarMousedown = false;
    toolbarWrapper.addEventListener('mousedown', () => { toolbarMousedown = true; });
    toolbarWrapper.addEventListener('mouseup',   () => { toolbarMousedown = false; });
    document.addEventListener('mouseup', () => { toolbarMousedown = false; });

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

    function applyHeading(tag) {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        const blockEl = getBlockElement();
        if (!blockEl || blockEl === editor) return;

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

    btnBold.addEventListener('click',      () => applyInlineFormat('bold'));
    btnItalic.addEventListener('click',    () => applyInlineFormat('italic'));
    btnUnderline.addEventListener('click', () => applyInlineFormat('underline'));
    btnH1.addEventListener('click',        () => applyHeading('H1'));
    btnH2.addEventListener('click',        () => applyHeading('H2'));

    // --- Keyboard shortcuts + heading reset on Enter ---
    function onEditorKeydown(e) {
        if (e.ctrlKey || e.metaKey) {
            const key = e.key.toLowerCase();
            if (key === 'b') { e.preventDefault(); applyInlineFormat('bold'); return; }
            if (key === 'i') { e.preventDefault(); applyInlineFormat('italic'); return; }
            if (key === 'u') { e.preventDefault(); applyInlineFormat('underline'); return; }
        }

        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            const sel = window.getSelection();
            const range = sel.getRangeAt(0);
            const blockEl = getBlockElement();

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

    // --- Special characters panel ---
    const charsCleanup = initSpecialCharsPanel(editor, container);

    // --- Destroy ---
    function destroy() {
        document.removeEventListener('selectionchange', onSelectionChange);
        editor.removeEventListener('keydown', onEditorKeydown);
        charsCleanup();
        if (toolbarWrapper.parentNode) {
            toolbarWrapper.parentNode.removeChild(toolbarWrapper);
        }
    }

    return destroy;
}


/**
 * Special characters: prompt + language picker + left-side panel.
 */
function initSpecialCharsPanel(editor, container) {
    const scrollParent = editor.closest('.overflow-y-auto') || editor.parentElement;
    let activeGroupId = null;
    let panelVisible = false;

    const writingWrapper = document.createElement('div');
    writingWrapper.className = 'flex-1 relative overflow-hidden';
    scrollParent.parentNode.insertBefore(writingWrapper, scrollParent);
    writingWrapper.appendChild(scrollParent);
    scrollParent.classList.remove('flex-1');
    scrollParent.style.height = '100%';

    const prompt = document.createElement('button');
    prompt.type = 'button';
    prompt.tabIndex = -1;
    prompt.innerHTML = '<span class="mr-1">Aa</span> Annet språk?';
    prompt.className = [
        'sticky', 'bottom-2', 'z-[100]', 'ml-auto', 'mr-2',
        'flex', 'items-center', 'gap-1',
        'px-3', 'py-1.5', 'rounded-full',
        'text-xs', 'text-stone-400', 'hover:text-stone-600',
        'bg-white/80', 'hover:bg-white',
        'border', 'border-stone-200', 'hover:border-stone-300',
        'shadow-sm', 'transition-all', 'duration-150',
        'select-none', 'cursor-pointer',
        'w-fit'
    ].join(' ');
    prompt.addEventListener('mousedown', (e) => e.preventDefault());

    const picker = document.createElement('div');
    picker.className = [
        'sticky', 'bottom-2', 'z-[100]', 'ml-auto', 'mr-2',
        'bg-white', 'border', 'border-stone-200', 'rounded-lg',
        'shadow-lg', 'p-2',
        'hidden', 'w-fit'
    ].join(' ');

    const pickerTitle = document.createElement('div');
    pickerTitle.className = 'text-xs text-stone-500 font-medium mb-1.5 px-1';
    pickerTitle.textContent = 'Velg språk:';
    picker.appendChild(pickerTitle);

    SPECIAL_CHAR_GROUPS.forEach(group => {
        const langBtn = document.createElement('button');
        langBtn.type = 'button';
        langBtn.tabIndex = -1;
        langBtn.textContent = group.label;
        langBtn.className = [
            'block', 'w-full', 'text-left',
            'px-3', 'py-1.5', 'rounded-md',
            'text-sm', 'text-stone-700',
            'hover:bg-stone-100', 'active:bg-stone-200',
            'transition-colors', 'select-none'
        ].join(' ');
        langBtn.addEventListener('mousedown', (e) => e.preventDefault());
        langBtn.addEventListener('click', () => selectLanguage(group.id));
        picker.appendChild(langBtn);
    });

    scrollParent.appendChild(prompt);
    scrollParent.appendChild(picker);

    const panel = document.createElement('div');
    panel.id = 'special-chars-panel';
    panel.className = [
        'absolute', 'z-[200]',
        'flex', 'flex-col', 'gap-0.5',
        'bg-white', 'border', 'border-stone-200', 'rounded-lg',
        'shadow-sm', 'p-1',
        'transition-opacity', 'duration-150',
        'opacity-0', 'pointer-events-none'
    ].join(' ');
    panel.style.width = '36px';
    scrollParent.appendChild(panel);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.tabIndex = -1;
    closeBtn.textContent = '×';
    closeBtn.className = [
        'w-7', 'h-7', 'rounded',
        'text-base', 'text-stone-400', 'hover:text-stone-700', 'hover:bg-stone-100',
        'flex', 'items-center', 'justify-center',
        'select-none', 'transition-colors', 'mb-0.5'
    ].join(' ');
    closeBtn.addEventListener('mousedown', (e) => e.preventDefault());
    closeBtn.addEventListener('click', () => deactivatePanel());

    function showPrompt() {
        prompt.classList.remove('hidden');
        picker.classList.add('hidden');
    }

    function showPicker() {
        prompt.classList.add('hidden');
        picker.classList.remove('hidden');
    }

    function selectLanguage(groupId) {
        activeGroupId = groupId;
        picker.classList.add('hidden');
        prompt.classList.add('hidden');
        buildCharButtons(groupId);
        updatePanelPosition();
    }

    function deactivatePanel() {
        activeGroupId = null;
        hidePanelChars();
        showPrompt();
        editor.focus();
    }

    prompt.addEventListener('click', () => showPicker());

    function onDocMousedown(e) {
        if (!picker.classList.contains('hidden') &&
            !picker.contains(e.target) && e.target !== prompt) {
            picker.classList.add('hidden');
            showPrompt();
        }
    }
    document.addEventListener('mousedown', onDocMousedown);

    function buildCharButtons(groupId) {
        panel.innerHTML = '';
        panel.appendChild(closeBtn);

        const group = SPECIAL_CHAR_GROUPS.find(g => g.id === groupId);
        if (!group) return;

        const label = document.createElement('div');
        label.className = 'text-[9px] text-stone-400 text-center mb-0.5 leading-tight';
        label.textContent = group.label;
        panel.appendChild(label);

        group.chars.forEach(char => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = char;
            btn.tabIndex = -1;
            btn.title = char;
            btn.className = [
                'w-7', 'h-7', 'rounded',
                'text-sm', 'font-serif',
                'flex', 'items-center', 'justify-center',
                'text-stone-700', 'hover:bg-stone-100', 'active:bg-stone-200',
                'select-none', 'transition-colors'
            ].join(' ');
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => {
                editor.focus();
                document.execCommand('insertText', false, char);
            });
            panel.appendChild(btn);
        });
    }

    function updatePanelPosition() {
        if (!activeGroupId) return;

        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        if (!editor.contains(range.startContainer)) {
            hidePanelChars();
            return;
        }

        const caretRect = range.getBoundingClientRect();
        if (!caretRect || (caretRect.height === 0 && caretRect.width === 0)) return;

        const scrollRect = scrollParent.getBoundingClientRect();
        const editorRect = editor.getBoundingClientRect();

        const leftPos = editorRect.left - scrollRect.left - 44;
        const topPos = caretRect.top - scrollRect.top + scrollParent.scrollTop;

        panel.style.left = `${Math.max(4, leftPos)}px`;
        panel.style.top = `${Math.max(4, topPos)}px`;

        if (!panelVisible) {
            panelVisible = true;
            panel.classList.remove('opacity-0', 'pointer-events-none');
            panel.classList.add('opacity-100');
        }
    }

    function hidePanelChars() {
        if (!panelVisible) return;
        panelVisible = false;
        panel.classList.remove('opacity-100');
        panel.classList.add('opacity-0', 'pointer-events-none');
    }

    function onSelectionChangeChars() {
        if (!activeGroupId) return;
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) { hidePanelChars(); return; }
        if (!editor.contains(sel.getRangeAt(0).startContainer)) { hidePanelChars(); return; }
        updatePanelPosition();
    }

    function onScroll() {
        if (panelVisible) updatePanelPosition();
    }

    function onFocus() {
        if (activeGroupId) updatePanelPosition();
    }

    function onBlur(e) {
        if (panel.contains(e.relatedTarget)) return;
        if (picker.contains(e.relatedTarget)) return;
        if (e.relatedTarget === prompt) return;
        hidePanelChars();
    }

    document.addEventListener('selectionchange', onSelectionChangeChars);
    scrollParent.addEventListener('scroll', onScroll);
    editor.addEventListener('focus', onFocus);
    editor.addEventListener('blur', onBlur);

    return function cleanup() {
        document.removeEventListener('selectionchange', onSelectionChangeChars);
        document.removeEventListener('mousedown', onDocMousedown);
        scrollParent.removeEventListener('scroll', onScroll);
        editor.removeEventListener('focus', onFocus);
        editor.removeEventListener('blur', onBlur);
        if (panel.parentNode) panel.parentNode.removeChild(panel);
        if (prompt.parentNode) prompt.parentNode.removeChild(prompt);
        if (picker.parentNode) picker.parentNode.removeChild(picker);
        if (writingWrapper.parentNode) {
            writingWrapper.parentNode.insertBefore(scrollParent, writingWrapper);
            scrollParent.classList.add('flex-1');
            scrollParent.style.height = '';
            writingWrapper.parentNode.removeChild(writingWrapper);
        }
    };
}
