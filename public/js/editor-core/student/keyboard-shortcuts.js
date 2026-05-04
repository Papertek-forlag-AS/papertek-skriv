import { t } from '../shared/i18n.js';

/**
 * Keyboard shortcuts module for the writing editor.
 * Adds heading shortcuts, list formatting, and a help overlay.
 *
 * @param {HTMLElement} editor - The contenteditable editor element
 * @param {Object} options
 * @param {Function} [options.onSave] - Called on Ctrl/Cmd+S
 * @param {Function} [options.onFocusMode] - Called on Ctrl/Cmd+Enter
 * @param {Function} [options.isAdvancedMode] - Returns boolean for H3 availability
 * @returns {{ destroy: Function, toggleHelp: Function }}
 */
export function initKeyboardShortcuts(editor, options = {}) {
    let helpOverlayVisible = false;
    let helpOverlay = null;
    let styleEl = null;

    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modSymbol = isMac ? '⌘' : 'Ctrl';

    function handleKeyDown(e) {
        const mod = e.metaKey || e.ctrlKey;
        if (!mod) return;

        if (e.key === '1') {
            e.preventDefault();
            formatBlock('h1');
        } else if (e.key === '2') {
            e.preventDefault();
            formatBlock('h2');
        } else if (e.key === '3' && options.isAdvancedMode?.()) {
            e.preventDefault();
            formatBlock('h3');
        } else if (e.key === '0') {
            e.preventDefault();
            formatBlock('p');
        } else if (e.key === '/' || e.key === '?') {
            e.preventDefault();
            toggleHelp();
        } else if (e.key === 's') {
            e.preventDefault();
            options.onSave?.();
        } else if (e.key === 'Enter') {
            e.preventDefault();
            options.onFocusMode?.();
        } else if (e.shiftKey && (e.key === 'L' || e.key === 'l')) {
            e.preventDefault();
            document.execCommand('insertUnorderedList');
        } else if (e.shiftKey && (e.key === 'O' || e.key === 'o')) {
            e.preventDefault();
            document.execCommand('insertOrderedList');
        } else if (e.shiftKey && (e.key === 'Q' || e.key === 'q')) {
            e.preventDefault();
            formatBlock('blockquote');
        }
    }

    function formatBlock(tag) {
        document.execCommand('formatBlock', false, tag);
    }

    function toggleHelp() {
        if (helpOverlayVisible) {
            closeHelp();
        } else {
            openHelp();
        }
    }

    function openHelp() {
        if (helpOverlay) return;
        injectStyles();

        helpOverlay = document.createElement('div');
        helpOverlay.className = 'kb-shortcuts-backdrop';
        helpOverlay.addEventListener('click', (e) => {
            if (e.target === helpOverlay) closeHelp();
        });

        const modal = document.createElement('div');
        modal.className = 'kb-shortcuts-modal';

        const header = document.createElement('div');
        header.className = 'kb-shortcuts-header';

        const title = document.createElement('h2');
        title.textContent = t('shortcuts.title');

        const closeBtn = document.createElement('button');
        closeBtn.className = 'kb-shortcuts-close';
        closeBtn.textContent = '×';
        closeBtn.setAttribute('aria-label', t('shortcuts.close'));
        closeBtn.addEventListener('click', closeHelp);

        header.appendChild(title);
        header.appendChild(closeBtn);
        modal.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'kb-shortcuts-grid';

        const sections = [
            {
                title: t('shortcuts.formatting'),
                shortcuts: [
                    [mod('B'), 'Fet skrift'],
                    [mod('I'), 'Kursiv'],
                    [mod('U'), 'Understreking'],
                ]
            },
            {
                title: t('shortcuts.headings'),
                shortcuts: [
                    [mod('1'), 'Overskrift 1'],
                    [mod('2'), 'Overskrift 2'],
                    [mod('3'), 'Overskrift 3'],
                    [mod('0'), 'Vanlig avsnitt'],
                ]
            },
            {
                title: t('shortcuts.lists'),
                shortcuts: [
                    [modShift('L'), 'Punktliste'],
                    [modShift('O'), 'Nummerert liste'],
                    [modShift('Q'), 'Sitat'],
                ]
            },
            {
                title: t('shortcuts.tools'),
                shortcuts: [
                    [mod('S'), 'Lagre'],
                    [mod('Enter'), 'Fokusmodus'],
                    [mod('/'), 'Vis/skjul snarveier'],
                ]
            },
        ];

        for (const section of sections) {
            const sectionEl = document.createElement('div');
            sectionEl.className = 'kb-shortcuts-section';

            const sectionTitle = document.createElement('h3');
            sectionTitle.textContent = section.title;
            sectionEl.appendChild(sectionTitle);

            for (const [key, desc] of section.shortcuts) {
                const row = document.createElement('div');
                row.className = 'kb-shortcuts-row';

                const keyEl = document.createElement('kbd');
                keyEl.textContent = key;

                const descEl = document.createElement('span');
                descEl.textContent = desc;

                row.appendChild(keyEl);
                row.appendChild(descEl);
                sectionEl.appendChild(row);
            }

            grid.appendChild(sectionEl);
        }

        modal.appendChild(grid);
        helpOverlay.appendChild(modal);
        document.body.appendChild(helpOverlay);

        helpOverlayVisible = true;
        document.addEventListener('keydown', handleHelpKeydown);
    }

    function closeHelp() {
        if (helpOverlay) {
            helpOverlay.remove();
            helpOverlay = null;
        }
        helpOverlayVisible = false;
        document.removeEventListener('keydown', handleHelpKeydown);
    }

    function handleHelpKeydown(e) {
        if (e.key === 'Escape') {
            e.preventDefault();
            closeHelp();
        }
        if ((e.metaKey || e.ctrlKey) && (e.key === '/' || e.key === '?')) {
            e.preventDefault();
            closeHelp();
        }
    }

    function mod(key) {
        return `${modSymbol}+${key}`;
    }

    function modShift(key) {
        return `${modSymbol}+Shift+${key}`;
    }

    function injectStyles() {
        if (styleEl) return;
        styleEl = document.createElement('style');
        styleEl.textContent = `
            .kb-shortcuts-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(0, 0, 0, 0.5);
                display: flex;
                align-items: center;
                justify-content: center;
                z-index: 10000;
                animation: kb-fade-in 0.15s ease;
            }
            @keyframes kb-fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .kb-shortcuts-modal {
                background: #fff;
                border-radius: 12px;
                padding: 24px 32px;
                max-width: 520px;
                width: 90vw;
                max-height: 80vh;
                overflow-y: auto;
                box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            }
            .kb-shortcuts-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 20px;
            }
            .kb-shortcuts-header h2 {
                margin: 0;
                font-size: 1.25rem;
                font-weight: 600;
                color: #1a1a1a;
            }
            .kb-shortcuts-close {
                background: none;
                border: none;
                font-size: 1.5rem;
                cursor: pointer;
                color: #666;
                padding: 4px 8px;
                border-radius: 4px;
                line-height: 1;
            }
            .kb-shortcuts-close:hover {
                background: #f0f0f0;
                color: #333;
            }
            .kb-shortcuts-grid {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 24px;
            }
            @media (max-width: 500px) {
                .kb-shortcuts-grid {
                    grid-template-columns: 1fr;
                }
            }
            .kb-shortcuts-section h3 {
                font-size: 0.75rem;
                text-transform: uppercase;
                letter-spacing: 0.05em;
                color: #888;
                margin: 0 0 8px 0;
                font-weight: 600;
            }
            .kb-shortcuts-row {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 4px 0;
            }
            .kb-shortcuts-row kbd {
                background: #f4f4f4;
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 2px 8px;
                font-family: -apple-system, system-ui, monospace;
                font-size: 0.8rem;
                color: #444;
                white-space: nowrap;
            }
            .kb-shortcuts-row span {
                font-size: 0.875rem;
                color: #555;
                margin-left: 12px;
            }
        `;
        document.head.appendChild(styleEl);
    }

    editor.addEventListener('keydown', handleKeyDown);

    function destroy() {
        editor.removeEventListener('keydown', handleKeyDown);
        closeHelp();
        if (styleEl) {
            styleEl.remove();
            styleEl = null;
        }
    }

    return { destroy, toggleHelp };
}
