import { escapeHtml } from '../shared/html-escape.js';
import { t } from '../shared/i18n.js';

export function initSlashMenu(editor, options = {}) {
    let menuEl = null;
    let isActive = false;
    let selectedIndex = 0;
    let activeSlashNode = null;
    let activeSlashOffset = -1;
    
    // Default actions if not provided
    const actions = options.actions || [];
    
    function createMenu() {
        if (menuEl) return;
        menuEl = document.createElement('div');
        menuEl.className = 'absolute z-50 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 shadow-xl rounded-xl py-2 w-56 flex flex-col hidden';
        document.body.appendChild(menuEl);
    }
    
    function positionMenu() {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        
        // Position below the caret
        menuEl.style.left = `${rect.left + window.scrollX}px`;
        menuEl.style.top = `${rect.bottom + window.scrollY + 8}px`;
    }
    
    function renderMenu() {
        menuEl.innerHTML = '';
        actions.forEach((action, idx) => {
            const btn = document.createElement('button');
            btn.dataset.idx = idx;
            btn.innerHTML = `
                <span class="w-5 h-5 flex items-center justify-center opacity-70">${action.icon || ''}</span>
                <span>${escapeHtml(action.label)}</span>
            `;
            btn.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Keep focus in editor
                executeAction(action);
            });
            btn.addEventListener('mouseenter', () => {
                selectedIndex = idx;
                updateSelection();
            });
            menuEl.appendChild(btn);
        });
        updateSelection();
    }
    
    function updateSelection() {
        const buttons = menuEl.querySelectorAll('button');
        buttons.forEach((btn, idx) => {
            const isSelected = idx === selectedIndex;
            btn.className = `w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${isSelected ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium' : 'text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700/50'}`;
        });
    }
    
    function openMenu() {
        if (!menuEl) createMenu();
        if (actions.length === 0) return;
        isActive = true;
        selectedIndex = 0;
        positionMenu();
        renderMenu();
        menuEl.classList.remove('hidden');
    }
    
    function closeMenu() {
        if (!isActive) return;
        isActive = false;
        menuEl.classList.add('hidden');
    }
    
    function executeAction(action) {
        closeMenu();
        if (!action.keepSlash) {
            editor.focus();
            let manualSuccess = false;

            if (activeSlashNode && activeSlashNode.isConnected) {
                const text = activeSlashNode.textContent;
                if (activeSlashOffset >= 0 && activeSlashOffset < text.length && text.charAt(activeSlashOffset) === '/') {
                    manualSuccess = true;
                    const delRange = document.createRange();
                    delRange.setStart(activeSlashNode, activeSlashOffset);
                    delRange.setEnd(activeSlashNode, activeSlashOffset + 1);
                    delRange.deleteContents();

                    const parent = activeSlashNode.parentElement;
                    const isBlock = parent && ['P', 'LI', 'H1', 'H2', 'DIV'].includes(parent.tagName.toUpperCase());
                    
                    if (isBlock && parent.textContent === '' && !parent.querySelector('img, br')) {
                        parent.innerHTML = '<br>';
                        const newRange = document.createRange();
                        newRange.setStart(parent, 0);
                        newRange.collapse(true);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    } else {
                        const newRange = document.createRange();
                        newRange.setStart(activeSlashNode, activeSlashOffset);
                        newRange.collapse(true);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(newRange);
                    }
                }
            }

            if (!manualSuccess) {
                document.execCommand('delete', false, null);
            }
        }
        
        if (action.execute) {
            // Ensure editor has focus before executing command
            editor.focus();
            action.execute();
        }
    }
    
    // Listen to keydown to intercept navigation while menu is open
    editor.addEventListener('keydown', (e) => {
        if (!isActive) return;
        
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            selectedIndex = (selectedIndex + 1) % actions.length;
            updateSelection();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            selectedIndex = (selectedIndex - 1 + actions.length) % actions.length;
            updateSelection();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            executeAction(actions[selectedIndex]);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            closeMenu();
        } else if (e.key === 'Backspace') {
            // Let the backspace happen, but we'll check on keyup if we should close
        } else {
            // Any other typing closes the menu because it's no longer just a slash
            closeMenu();
        }
    });
    
    // Listen to keyup to detect the slash
    editor.addEventListener('keyup', (e) => {
        // Don't re-trigger if already active and navigating
        if (isActive && ['ArrowDown', 'ArrowUp', 'Enter', 'Escape'].includes(e.key)) return;
        
        const selection = window.getSelection();
        if (!selection.rangeCount) {
            closeMenu();
            return;
        }
        
        let node = selection.focusNode;
        let offset = selection.focusOffset;
        
        // Normalize if selection is on an element
        if (node && node.nodeType === Node.ELEMENT_NODE && offset > 0) {
            const child = node.childNodes[offset - 1];
            if (child && child.nodeType === Node.TEXT_NODE) {
                node = child;
                offset = child.textContent.length;
            }
        }
        
        if (node && node !== editor && node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent;
            
            if ((offset > 0 && text.charAt(offset - 1) === '/') || text.trim() === '/') {
                activeSlashNode = node;
                activeSlashOffset = offset > 0 && text.charAt(offset - 1) === '/' ? offset - 1 : text.indexOf('/');
                openMenu();
            } else {
                closeMenu();
            }
        } else {
            closeMenu();
        }
    });
    
    // Click outside to close
    document.addEventListener('click', (e) => {
        if (isActive && menuEl && !menuEl.contains(e.target) && e.target !== editor) {
            closeMenu();
        }
    });
    
    return {
        close: closeMenu,
        destroy: () => {
            if (menuEl) menuEl.remove();
        }
    };
}
