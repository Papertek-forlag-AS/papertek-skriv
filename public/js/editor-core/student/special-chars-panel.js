/**
 * Special Characters Panel.
 * A self-contained module that provides a language picker + character
 * insertion panel. Appears as a prompt at the bottom of the editor
 * ("Annet språk?"), expands to show language options, then displays
 * a floating character panel following the cursor.
 *
 * Portable: this module can be copied into another project that
 * has a contenteditable editor and the SPECIAL_CHAR_GROUPS config.
 *
 * Usage:
 *   import { initSpecialCharsPanel } from './special-chars-panel.js';
 *   const cleanup = initSpecialCharsPanel(editor, container, SPECIAL_CHAR_GROUPS);
 *   // later:
 *   cleanup();
 */

/**
 * Initialize the special characters panel.
 * @param {HTMLElement} editor - The contenteditable editor element
 * @param {HTMLElement} container - Parent container wrapping the editor
 * @param {Array<{ id: string, label: string, chars: string[] }>} charGroups - Character groups to show
 * @returns {Function} Cleanup function
 */
export function initSpecialCharsPanel(editor, container, charGroups) {
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

    charGroups.forEach(group => {
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

        const group = charGroups.find(g => g.id === groupId);
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
