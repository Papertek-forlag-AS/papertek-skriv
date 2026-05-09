/**
 * Special Characters Panel.
 *
 * Floating column of special-character buttons (ä ö ü ß / é è ê / ñ ¿ ¡ etc.)
 * that follows the caret in the editor. Driven entirely from outside via
 * `setActiveLanguage(lang)` — the panel renders the matching group when the
 * lang matches one in `charGroups`, and hides itself otherwise.
 *
 * History: the module used to render its own "Annet språk?" pill and a
 * language picker. Both were removed when the leksihjelp integration
 * landed — Skrivespråk now flows from the leksihjelp bridge (which is
 * the single source of truth, whether settings come from Skriv's
 * settings drawer, the leksihjelp extension popup, or a per-document
 * seed). See docs/leksihjelp-integration.md.
 *
 * Usage:
 *   import { initSpecialCharsPanel } from './special-chars-panel.js';
 *   const api = initSpecialCharsPanel(editor, container, SPECIAL_CHAR_GROUPS);
 *   api.setActiveLanguage('de'); // shows the German chars
 *   api.setActiveLanguage('nb'); // hides the panel (no chars for that lang)
 *   api.destroy();
 */

/**
 * Initialise the special-characters panel.
 * @param {HTMLElement} editor       contenteditable editor element
 * @param {HTMLElement} _container   parent container (kept for API parity)
 * @param {Array<{ id: string, label: string, chars: string[] }>} charGroups
 * @returns {{ setActiveLanguage(lang: string): void, getActiveLanguage(): string|null, destroy(): void }}
 */
export function initSpecialCharsPanel(editor, _container, charGroups) {
    const scrollParent = editor.closest('.overflow-y-auto') || editor.parentElement;
    let activeGroupId = null;
    let panelVisible = false;

    // The panel is positioned absolutely against `scrollParent`, so wrap
    // scrollParent in a relative-positioned host the panel can latch onto.
    const writingWrapper = document.createElement('div');
    writingWrapper.className = 'flex-1 relative overflow-hidden';
    scrollParent.parentNode.insertBefore(writingWrapper, scrollParent);
    writingWrapper.appendChild(scrollParent);
    scrollParent.classList.remove('flex-1');
    scrollParent.style.height = '100%';

    const panel = document.createElement('div');
    panel.id = 'special-chars-panel';
    panel.className = [
        'absolute', 'z-[200]',
        'flex', 'flex-col', 'gap-0.5',
        'bg-white', 'border', 'border-stone-200', 'rounded-lg',
        'shadow-sm', 'p-1',
        'transition-opacity', 'duration-150',
        'opacity-0', 'pointer-events-none',
    ].join(' ');
    panel.style.width = '36px';
    scrollParent.appendChild(panel);

    function buildCharButtons(groupId) {
        panel.innerHTML = '';

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
                'select-none', 'transition-colors',
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
        hidePanelChars();
    }

    document.addEventListener('selectionchange', onSelectionChangeChars);
    scrollParent.addEventListener('scroll', onScroll);
    editor.addEventListener('focus', onFocus);
    editor.addEventListener('blur', onBlur);

    function setActiveLanguage(lang) {
        const groupExists = !!charGroups.find(g => g.id === lang);
        if (!groupExists) {
            // Lang has no special chars worth showing (e.g. nb / nn / en).
            // Hide the panel and clear active state.
            activeGroupId = null;
            hidePanelChars();
            panel.innerHTML = '';
            return;
        }
        if (lang === activeGroupId) return;
        activeGroupId = lang;
        buildCharButtons(lang);
        updatePanelPosition();
    }

    return {
        setActiveLanguage,
        getActiveLanguage: () => activeGroupId,
        destroy() {
            document.removeEventListener('selectionchange', onSelectionChangeChars);
            scrollParent.removeEventListener('scroll', onScroll);
            editor.removeEventListener('focus', onFocus);
            editor.removeEventListener('blur', onBlur);
            if (panel.parentNode) panel.parentNode.removeChild(panel);
            if (writingWrapper.parentNode) {
                writingWrapper.parentNode.insertBefore(scrollParent, writingWrapper);
                scrollParent.classList.add('flex-1');
                scrollParent.style.height = '';
                writingWrapper.parentNode.removeChild(writingWrapper);
            }
        },
    };
}
