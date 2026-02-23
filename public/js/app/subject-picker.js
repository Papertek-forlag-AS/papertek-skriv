/**
 * Subject picker dropdown for assigning a subject to a document.
 * Shows all available subjects + "Personlig" + "Fjern fag" (clear).
 * Used both on document cards (orphan quick-assign) and in the editor.
 */

import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';
import { getAllSubjects, PERSONAL_SUBJECT } from './subject-store.js';

/**
 * Create a subject picker dropdown anchored to a trigger element.
 * @param {HTMLElement} trigger - Button element that opens the dropdown
 * @param {string|null} currentSubject - Currently assigned subject
 * @param {Function} onChange - Called with selected subject string, PERSONAL_SUBJECT, or null (clear)
 * @returns {{ destroy: Function, getSubject: Function }}
 */
export function createSubjectPicker(trigger, currentSubject, onChange) {
    let selected = currentSubject;
    let dropdown = null;

    function open() {
        if (dropdown) { close(); return; }

        dropdown = document.createElement('div');
        dropdown.className = 'absolute z-50 mt-1 w-48 max-h-64 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 shadow-lg py-1';

        const subjects = getAllSubjects();

        // Subject options
        for (const subject of subjects) {
            dropdown.appendChild(createOption(subject, subject, selected === subject));
        }

        // Divider
        const divider = document.createElement('div');
        divider.className = 'my-1 border-t border-stone-200 dark:border-stone-700';
        dropdown.appendChild(divider);

        // Personal folder option
        dropdown.appendChild(createOption(
            PERSONAL_SUBJECT,
            t('sidebar.personalFolder'),
            selected === PERSONAL_SUBJECT
        ));

        // Clear option (only if currently has a subject)
        if (selected) {
            const divider2 = document.createElement('div');
            divider2.className = 'my-1 border-t border-stone-200 dark:border-stone-700';
            dropdown.appendChild(divider2);

            const clearBtn = document.createElement('button');
            clearBtn.className = 'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors';
            clearBtn.innerHTML = `
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                ${t('sidebar.removeSubject')}
            `;
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                selected = null;
                onChange(null);
                close();
            });
            dropdown.appendChild(clearBtn);
        }

        // Position below trigger
        trigger.style.position = 'relative';
        const parent = trigger.parentElement || trigger;
        parent.style.position = 'relative';
        parent.appendChild(dropdown);

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }, 0);
    }

    function createOption(value, label, isActive) {
        const btn = document.createElement('button');
        btn.className = `flex items-center gap-2 w-full px-3 py-1.5 text-xs transition-colors ${
            isActive
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium'
                : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700/50'
        }`;
        btn.innerHTML = `
            <span class="w-4 text-center">${isActive ? '&#10003;' : ''}</span>
            <span class="truncate">${escapeHtml(label)}</span>
        `;
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            selected = value;
            onChange(value);
            close();
        });
        return btn;
    }

    function close() {
        if (dropdown) {
            dropdown.remove();
            dropdown = null;
        }
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('keydown', handleEscape);
    }

    function handleClickOutside(e) {
        if (dropdown && !dropdown.contains(e.target) && !trigger.contains(e.target)) {
            close();
        }
    }

    function handleEscape(e) {
        if (e.key === 'Escape') close();
    }

    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        open();
    });

    return {
        destroy: () => {
            close();
            trigger.removeEventListener('click', open);
        },
        getSubject: () => selected,
        setSubject: (s) => { selected = s; },
    };
}

/**
 * Create a compact subject badge/button for use on document cards.
 * Shows the current subject or a "Velg fag" prompt if none.
 * @param {string|null} subject - Current subject
 * @returns {HTMLElement} The badge element (clickable)
 */
export function createSubjectBadge(subject) {
    const badge = document.createElement('button');
    badge.className = 'subject-badge inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border transition-colors';

    if (subject && subject !== PERSONAL_SUBJECT) {
        badge.className += ' bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800';
        badge.textContent = subject;
    } else if (subject === PERSONAL_SUBJECT) {
        badge.className += ' bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800';
        badge.textContent = t('sidebar.personalFolder');
    } else {
        badge.className += ' bg-stone-50 dark:bg-stone-700 text-stone-400 dark:text-stone-500 border-stone-200 dark:border-stone-600 border-dashed';
        badge.textContent = t('sidebar.chooseSubject');
    }

    badge.title = t('sidebar.chooseSubject');
    return badge;
}
