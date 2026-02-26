/**
 * Folder picker dropdown for assigning documents to multiple folders.
 * Replaces subject-picker.js with multi-select hierarchy support.
 *
 * Exports:
 *   createFolderPicker(trigger, currentFolderIds, onChange) → { destroy, getFolderIds, setFolderIds }
 *   createFolderBadges(folderIds, folders) → DocumentFragment
 *
 * Dependencies: folder-store.js, i18n.js, html-escape.js
 */

import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';
import {
    getAllFolders, buildFolderTree, flattenTree,
    getFolderPath, isPersonalFolder, isSystemFolder, PERSONAL_FOLDER_NAME,
} from './folder-store.js';

/**
 * Create a multi-select folder picker dropdown anchored to a trigger element.
 * @param {HTMLElement} trigger - Element that opens the dropdown
 * @param {string[]} currentFolderIds - Currently assigned folder IDs
 * @param {Function} onChange - Called with updated string[] of folder IDs
 * @returns {{ destroy: Function, getFolderIds: Function, setFolderIds: Function }}
 */
export function createFolderPicker(trigger, currentFolderIds, onChange) {
    let selected = new Set(currentFolderIds || []);
    let dropdown = null;

    async function open() {
        if (dropdown) { close(); return; }

        const folders = await getAllFolders();
        const tree = buildFolderTree(folders);

        // Separate personal and regular folders
        const personalNode = tree.find(n => isPersonalFolder(n));
        const regularNodes = tree.filter(n => !isPersonalFolder(n));
        const regularFlat = flattenTree(regularNodes);

        dropdown = document.createElement('div');
        dropdown.className = 'absolute z-50 mt-1 w-56 max-h-72 overflow-y-auto rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 shadow-lg py-1';

        // Regular folder checkboxes
        for (const { folder, depth } of regularFlat) {
            dropdown.appendChild(createCheckItem(folder, depth));
        }

        // Divider + personal folder
        if (personalNode) {
            dropdown.appendChild(createDivider());
            dropdown.appendChild(createCheckItem(personalNode, 1));
        }

        // Divider + "Remove all" button
        dropdown.appendChild(createDivider());

        const removeAllBtn = document.createElement('button');
        removeAllBtn.className = 'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors';
        removeAllBtn.innerHTML = `
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
            ${escapeHtml(t('sidebar.removeAllFolders'))}
        `;
        removeAllBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            selected.clear();
            updateCheckboxes();
            onChange([...selected]);
        });
        dropdown.appendChild(removeAllBtn);

        // "Done" button
        dropdown.appendChild(createDivider());

        const doneBtn = document.createElement('button');
        doneBtn.className = 'flex items-center justify-center w-full px-3 py-2 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors';
        doneBtn.textContent = t('sidebar.folderPickerDone');
        doneBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            close();
        });
        dropdown.appendChild(doneBtn);

        // Position below trigger
        const parent = trigger.parentElement || trigger;
        parent.style.position = 'relative';
        parent.appendChild(dropdown);

        // Close on click outside / Escape
        setTimeout(() => {
            document.addEventListener('click', handleClickOutside);
            document.addEventListener('keydown', handleEscape);
        }, 0);
    }

    function createCheckItem(folder, depth) {
        const isChecked = selected.has(folder.id);
        const btn = document.createElement('label');
        btn.className = 'flex items-center gap-2 w-full px-3 py-1.5 text-xs cursor-pointer transition-colors hover:bg-stone-50 dark:hover:bg-stone-700/50';
        btn.style.paddingLeft = `${8 + (depth - 1) * 16}px`;
        btn.setAttribute('data-folder-id', folder.id);

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = isChecked;
        checkbox.className = 'rounded border-stone-300 dark:border-stone-600 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-0 w-3.5 h-3.5';

        const label = document.createElement('span');
        label.className = 'truncate ' + (isPersonalFolder(folder)
            ? 'text-violet-600 dark:text-violet-400'
            : 'text-stone-700 dark:text-stone-300');
        label.textContent = isPersonalFolder(folder) ? t('sidebar.personalFolder') : folder.name;

        checkbox.addEventListener('change', (e) => {
            e.stopPropagation();
            if (checkbox.checked) {
                selected.add(folder.id);
            } else {
                selected.delete(folder.id);
            }
            onChange([...selected]);
        });

        btn.addEventListener('click', (e) => {
            if (e.target !== checkbox) {
                e.preventDefault();
                e.stopPropagation();
                checkbox.checked = !checkbox.checked;
                checkbox.dispatchEvent(new Event('change'));
            }
        });

        btn.appendChild(checkbox);
        btn.appendChild(label);
        return btn;
    }

    function createDivider() {
        const div = document.createElement('div');
        div.className = 'my-1 border-t border-stone-200 dark:border-stone-700';
        return div;
    }

    function updateCheckboxes() {
        if (!dropdown) return;
        const items = dropdown.querySelectorAll('[data-folder-id]');
        for (const item of items) {
            const fid = item.getAttribute('data-folder-id');
            const cb = item.querySelector('input[type="checkbox"]');
            if (cb) cb.checked = selected.has(fid);
        }
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
        getFolderIds: () => [...selected],
        setFolderIds: (ids) => {
            selected = new Set(ids || []);
            updateCheckboxes();
        },
    };
}

/**
 * Create folder badge elements for display on document cards or in the editor.
 * @param {string[]} folderIds - Array of folder IDs
 * @param {Array} folders - All folder objects (flat array)
 * @returns {DocumentFragment} Fragment with badge elements
 */
export function createFolderBadges(folderIds, folders) {
    const fragment = document.createDocumentFragment();
    const folderMap = new Map(folders.map(f => [f.id, f]));

    if (!folderIds || folderIds.length === 0) {
        // "Choose folder" prompt badge
        const badge = document.createElement('button');
        badge.className = 'folder-assign-btn inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-stone-50 dark:bg-stone-700 text-stone-400 dark:text-stone-500 border border-dashed border-stone-300 dark:border-stone-600 hover:border-emerald-400 hover:text-emerald-600 transition-colors';
        badge.innerHTML = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m6-6H6"/></svg>${escapeHtml(t('sidebar.chooseFolder'))}`;
        fragment.appendChild(badge);
        return fragment;
    }

    for (const fid of folderIds) {
        const folder = folderMap.get(fid);
        if (!folder) continue;

        const badge = document.createElement('span');

        if (isPersonalFolder(folder)) {
            badge.className = 'inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border border-violet-200 dark:border-violet-800';
            badge.textContent = t('sidebar.personalFolder');
        } else {
            badge.className = 'inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-800';
            // Show breadcrumb for subfolders: "Parent > Child"
            const breadcrumb = buildBreadcrumb(folder, folderMap);
            badge.textContent = breadcrumb;
        }

        fragment.appendChild(badge);

        // Add a small gap between badges
        if (fid !== folderIds[folderIds.length - 1]) {
            const spacer = document.createTextNode(' ');
            fragment.appendChild(spacer);
        }
    }

    return fragment;
}

/**
 * Build breadcrumb string for a folder: "Norsk > Litteratur"
 * @param {Object} folder
 * @param {Map} folderMap
 * @returns {string}
 */
function buildBreadcrumb(folder, folderMap) {
    const parts = [];
    let current = folder;
    while (current) {
        if (isPersonalFolder(current)) break;
        parts.unshift(current.name);
        current = current.parentId ? folderMap.get(current.parentId) : null;
    }
    // Only show last 2 levels to keep badges compact
    if (parts.length > 2) {
        return '... > ' + parts.slice(-2).join(' > ');
    }
    return parts.join(' > ');
}
