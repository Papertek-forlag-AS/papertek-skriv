/**
 * Sidebar navigation with collapsible folder tree.
 * Shows: school year selector, recent docs, folder tree with counts,
 * orphan documents, personal folder, add-folder input, and drag-drop targets.
 */

import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';
import { showToast } from '../editor-core/shared/toast-notification.js';
import { showInPageConfirm } from '../editor-core/shared/in-page-modal.js';
import {
    getAllFolders, getAvailableSchoolYears, getCurrentSchoolYear,
    setCurrentSchoolYear, createFolder, renameFolder, deleteFolder,
    addDocToFolder, buildFolderTree, flattenTree,
    isPersonalFolder, isSystemFolder, PERSONAL_FOLDER_NAME, MAX_FOLDER_DEPTH,
} from './folder-store.js';
import { getSchoolLevel, setSchoolLevel, SCHOOL_LEVELS, getSubjectsForLevel } from './school-level.js';
import { showOnboardingModal } from './onboarding-modal.js';

const FOLDER_ICON = '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>';
const CHEVRON_SVG = '<svg class="w-3 h-3 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>';

/**
 * Create the sidebar navigation component.
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {Array} options.docs - All documents (for computing counts)
 * @param {string} options.activeFilter - Current active filter ('all' | 'orphans' | 'personal' | folderId)
 * @param {string} options.schoolYear - Active school year label
 * @param {Function} options.onFilterChange - Called with new filter value
 * @param {Function} options.onSchoolYearChange - Called with new school year label
 * @returns {{ destroy: Function, update: Function }}
 */
export function createSidebar(container, options) {
    const nav = document.createElement('nav');
    nav.className = 'skriv-sidebar';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', t('sidebar.folders'));

    let state = { ...options };
    let cachedFolders = [];
    const expandedSet = new Set();
    let isDragActive = false;

    // --- Counts ---

    function getFolderCounts(docs, folders, schoolYear) {
        const counts = { all: 0, orphans: 0, personal: 0 };
        const folderCounts = new Map();
        const personalId = folders.find(f => isPersonalFolder(f))?.id;

        for (const doc of docs) {
            if (doc.schoolYear !== schoolYear) continue;
            counts.all++;

            const fids = doc.folderIds || [];
            if (fids.length === 0) {
                counts.orphans++;
            }

            for (const fid of fids) {
                if (personalId && fid === personalId) {
                    counts.personal++;
                } else {
                    folderCounts.set(fid, (folderCounts.get(fid) || 0) + 1);
                }
            }
        }

        // Build parent→children map for descendant summing
        const childMap = new Map();
        for (const f of folders) {
            if (f.parentId) {
                const siblings = childMap.get(f.parentId) || [];
                siblings.push(f.id);
                childMap.set(f.parentId, siblings);
            }
        }

        // Recursive sum: own count + all descendant counts
        function getTreeCount(fid) {
            let total = folderCounts.get(fid) || 0;
            const children = childMap.get(fid) || [];
            for (const childId of children) {
                total += getTreeCount(childId);
            }
            return total;
        }

        const treeCounts = new Map();
        for (const f of folders) {
            if (!isPersonalFolder(f)) {
                treeCounts.set(f.id, getTreeCount(f.id));
            }
        }

        return { ...counts, treeCounts };
    }

    // --- Render ---

    async function render() {
        cachedFolders = await getAllFolders();
        const counts = getFolderCounts(state.docs, cachedFolders, state.schoolYear);
        const years = getAvailableSchoolYears(state.docs);

        // Filter folders by school level if set
        const levelId = getSchoolLevel();
        const levelSubjects = levelId ? getSubjectsForLevel(levelId) : null;

        // Build tree from non-personal folders
        const regularFolders = cachedFolders.filter(f => !isPersonalFolder(f));
        const tree = buildFolderTree(regularFolders);

        // Filter root system folders: show if has count OR matches level OR is custom
        const visibleTree = tree.filter(node => {
            if (!isSystemFolder(node)) return true; // custom folders always visible
            if (node.children.length > 0) return true;
            const treeCount = counts.treeCounts.get(node.id) || 0;
            if (treeCount > 0) return true;
            if (levelSubjects && levelSubjects.includes(node.name)) return true;
            return false;
        });

        nav.innerHTML = '';

        // School year selector
        const yearSection = document.createElement('div');
        yearSection.className = 'px-3 pt-4 pb-2';
        yearSection.innerHTML = `
            <label class="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold mb-1 block">${t('sidebar.schoolYear')}</label>
            <select class="sidebar-year-select w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-200 outline-none focus:border-emerald-400">
                ${years.map(y => `<option value="${y}" ${y === state.schoolYear ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
        `;
        nav.appendChild(yearSection);

        yearSection.querySelector('.sidebar-year-select').addEventListener('change', (e) => {
            state.schoolYear = e.target.value;
            setCurrentSchoolYear(e.target.value);
            state.onSchoolYearChange(e.target.value);
            render();
        });

        // Navigation items container
        const list = document.createElement('div');
        list.className = 'px-2 py-2 flex flex-col gap-0.5';

        // "Recent documents" (All)
        list.appendChild(createFlatItem(
            'all',
            t('sidebar.recentDocs'),
            counts.all,
            `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
        ));

        // Divider + section label
        list.appendChild(createDivider(t('sidebar.folders')));

        // Folder tree
        for (const node of visibleTree) {
            renderFolderNode(list, node, 0, counts);
        }

        // Add folder button (root level)
        list.appendChild(createAddButton(null, 0));

        // Divider
        list.appendChild(createDivider());

        // Orphans
        list.appendChild(createFlatItem(
            'orphans',
            t('sidebar.orphans'),
            counts.orphans,
            `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
            counts.orphans > 0
        ));

        // Personal folder
        list.appendChild(createFlatItem(
            'personal',
            t('sidebar.personalFolder'),
            counts.personal,
            `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>`
        ));

        nav.appendChild(list);

        // "Change level" button
        renderLevelButton(nav);

        if (isDragActive) applyDragCues();
    }

    // --- Recursive folder tree rendering ---

    function renderFolderNode(container, node, depth, counts) {
        const count = counts.treeCounts.get(node.id) || 0;
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedSet.has(node.id);
        const isActive = state.activeFilter === node.id;
        const isCustom = !isSystemFolder(node);
        const paddingLeft = 12 + depth * 16;

        const row = document.createElement('div');
        row.className = 'flex items-center group';

        // Expand/collapse toggle
        const toggleBtn = document.createElement('button');
        toggleBtn.className = `flex-shrink-0 w-5 h-5 flex items-center justify-center rounded transition-colors ${
            hasChildren ? 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300' : 'invisible'
        }`;
        toggleBtn.style.marginLeft = `${paddingLeft - 12}px`;
        if (hasChildren) {
            toggleBtn.innerHTML = CHEVRON_SVG;
            if (isExpanded) toggleBtn.querySelector('svg').style.transform = 'rotate(90deg)';
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (expandedSet.has(node.id)) expandedSet.delete(node.id);
                else expandedSet.add(node.id);
                render();
            });
        }

        // Folder button (click to filter)
        const btn = document.createElement('button');
        btn.className = `skriv-sidebar-item flex items-center gap-2 flex-1 min-w-0 px-2 py-2 text-sm rounded-lg transition-colors ${
            isActive
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium'
                : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700/50'
        }`;
        btn.setAttribute('data-filter', node.id);
        btn.setAttribute('data-folder-id', node.id);
        if (isActive) btn.setAttribute('aria-current', 'page');

        btn.innerHTML = `
            <span class="flex-shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500'}">${FOLDER_ICON}</span>
            <span class="flex-1 text-left truncate">${escapeHtml(node.name)}</span>
            ${count > 0 ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-700 text-stone-400 dark:text-stone-500">${count}</span>` : ''}
        `;

        btn.addEventListener('click', () => {
            state.activeFilter = node.id;
            state.onFilterChange(node.id);
            render();
        });

        // Drag-drop target
        let autoExpandTimer = null;
        btn.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            btn.classList.remove('ring-1', 'ring-emerald-200', 'dark:ring-emerald-800');
            btn.classList.add('ring-2', 'ring-emerald-400', 'bg-emerald-50', 'dark:bg-emerald-900/20', 'scale-[1.02]', 'shadow-sm');
            if (!btn.querySelector('.skriv-drag-plus')) {
                const plus = document.createElement('span');
                plus.className = 'skriv-drag-plus text-emerald-500 text-[10px] font-bold';
                plus.textContent = '+';
                btn.appendChild(plus);
            }
            // Auto-expand collapsed folder with children after 600ms
            if (hasChildren && !isExpanded && !autoExpandTimer) {
                autoExpandTimer = setTimeout(() => {
                    expandedSet.add(node.id);
                    render();
                }, 600);
            }
        });
        btn.addEventListener('dragleave', () => {
            btn.classList.remove('ring-2', 'ring-emerald-400', 'bg-emerald-50', 'dark:bg-emerald-900/20', 'scale-[1.02]', 'shadow-sm');
            btn.querySelector('.skriv-drag-plus')?.remove();
            if (isDragActive) {
                btn.classList.add('ring-1', 'ring-emerald-200', 'dark:ring-emerald-800');
            }
            if (autoExpandTimer) { clearTimeout(autoExpandTimer); autoExpandTimer = null; }
        });
        btn.addEventListener('drop', async (e) => {
            e.preventDefault();
            btn.classList.remove('ring-2', 'ring-emerald-400', 'bg-emerald-50', 'dark:bg-emerald-900/20', 'scale-[1.02]', 'shadow-sm');
            btn.querySelector('.skriv-drag-plus')?.remove();
            if (autoExpandTimer) { clearTimeout(autoExpandTimer); autoExpandTimer = null; }
            const docId = e.dataTransfer.getData('text/plain');
            if (docId) {
                await addDocToFolder(docId, node.id);
                showToast(t('sidebar.movedToFolder', { folder: node.name }));
                // Success flash
                btn.classList.add('bg-emerald-100', 'dark:bg-emerald-900/40');
                setTimeout(() => btn.classList.remove('bg-emerald-100', 'dark:bg-emerald-900/40'), 400);
                state.onFilterChange(state.activeFilter); // refresh
            }
        });

        // Context menu for custom folders (right-click)
        if (isCustom) {
            btn.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                showContextMenu(e, node, depth);
            });
        }

        row.appendChild(toggleBtn);
        row.appendChild(btn);
        container.appendChild(row);

        // Render children if expanded
        if (hasChildren && isExpanded) {
            for (const child of node.children) {
                renderFolderNode(container, child, depth + 1, counts);
            }

            // Add subfolder button inside expanded folder (if depth allows)
            if (depth + 1 < MAX_FOLDER_DEPTH) {
                container.appendChild(createAddButton(node.id, depth + 1));
            }
        }
    }

    // --- Context menu for custom folders ---

    function showContextMenu(e, folder, depth) {
        // Remove any existing context menu
        document.querySelectorAll('.skriv-folder-context-menu').forEach(el => el.remove());

        const menu = document.createElement('div');
        menu.className = 'skriv-folder-context-menu fixed z-50 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg py-1 min-w-[160px]';
        menu.style.left = `${e.clientX}px`;
        menu.style.top = `${e.clientY}px`;

        // Rename
        const renameBtn = createMenuAction(t('sidebar.renameFolder'), async () => {
            menu.remove();
            const newName = prompt(t('sidebar.renameFolder'), folder.name);
            if (newName && newName.trim() !== folder.name) {
                await renameFolder(folder.id, newName.trim());
                render();
            }
        });
        menu.appendChild(renameBtn);

        // Add subfolder (if depth allows)
        if (depth < MAX_FOLDER_DEPTH - 1) {
            const addSubBtn = createMenuAction(t('sidebar.addSubfolder'), async () => {
                menu.remove();
                expandedSet.add(folder.id);
                await showAddFolderInput(folder.id);
            });
            menu.appendChild(addSubBtn);
        }

        // Delete
        const deleteBtn = createMenuAction(t('sidebar.deleteFolder'), async () => {
            menu.remove();
            const confirmed = await showInPageConfirm(
                t('sidebar.deleteFolder'),
                t('sidebar.deleteFolderConfirm', { name: folder.name }),
                t('common.delete'),
                t('common.cancel')
            );
            if (confirmed) {
                await deleteFolder(folder.id);
                if (state.activeFilter === folder.id) {
                    state.activeFilter = 'all';
                    state.onFilterChange('all');
                }
                render();
            }
        }, true);
        menu.appendChild(deleteBtn);

        document.body.appendChild(menu);

        // Close on click outside
        const closeMenu = (ev) => {
            if (!menu.contains(ev.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        };
        setTimeout(() => document.addEventListener('click', closeMenu), 0);
    }

    function createMenuAction(label, onClick, isDanger = false) {
        const btn = document.createElement('button');
        btn.className = `block w-full text-left px-4 py-2 text-xs transition-colors ${
            isDanger
                ? 'text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20'
                : 'text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700/50'
        }`;
        btn.textContent = label;
        btn.addEventListener('click', onClick);
        return btn;
    }

    // --- Add folder input ---

    function createAddButton(parentId, depth) {
        const paddingLeft = 12 + depth * 16 + 20; // +20 for toggle space
        const btn = document.createElement('button');
        btn.className = 'flex items-center gap-2 w-full py-1.5 text-xs text-stone-400 dark:text-stone-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors rounded-lg';
        btn.style.paddingLeft = `${paddingLeft}px`;
        btn.innerHTML = `
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m6-6H6"/></svg>
            ${parentId ? t('sidebar.addSubfolder') : t('sidebar.addFolder')}
        `;
        btn.addEventListener('click', () => showAddFolderInput(parentId));
        return btn;
    }

    async function showAddFolderInput(parentId) {
        const name = prompt(t('sidebar.folderNamePlaceholder'));
        if (!name || !name.trim()) return;
        try {
            await createFolder(name.trim(), parentId);
            if (parentId) expandedSet.add(parentId);
            render();
        } catch (err) {
            showToast(err.message, { duration: 3000 });
        }
    }

    // --- Flat items (all, orphans, personal) ---

    function createFlatItem(filterValue, label, count, iconSvg, hasAttention = false) {
        const isActive = state.activeFilter === filterValue;
        const btn = document.createElement('button');
        btn.className = `skriv-sidebar-item flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors ${
            isActive
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium'
                : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700/50'
        }`;
        btn.setAttribute('data-filter', filterValue);
        if (isActive) btn.setAttribute('aria-current', 'page');

        btn.innerHTML = `
            <span class="flex-shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500'}">${iconSvg}</span>
            <span class="flex-1 text-left truncate">${escapeHtml(label)}</span>
            ${count > 0 ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full ${
                hasAttention
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                    : 'bg-stone-100 dark:bg-stone-700 text-stone-400 dark:text-stone-500'
            }">${count}</span>` : ''}
        `;

        // Drag-drop for orphans → personal
        if (filterValue === 'personal') {
            btn.classList.add('skriv-drop-target');
            btn.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                btn.classList.remove('ring-1', 'ring-emerald-200', 'dark:ring-emerald-800');
                btn.classList.add('ring-2', 'ring-violet-400', 'scale-[1.02]', 'shadow-sm');
            });
            btn.addEventListener('dragleave', () => {
                btn.classList.remove('ring-2', 'ring-violet-400', 'scale-[1.02]', 'shadow-sm');
                if (isDragActive) {
                    btn.classList.add('ring-1', 'ring-emerald-200', 'dark:ring-emerald-800');
                }
            });
            btn.addEventListener('drop', async (e) => {
                e.preventDefault();
                btn.classList.remove('ring-2', 'ring-violet-400', 'scale-[1.02]', 'shadow-sm');
                const docId = e.dataTransfer.getData('text/plain');
                const personalFolder = cachedFolders.find(f => isPersonalFolder(f));
                if (docId && personalFolder) {
                    await addDocToFolder(docId, personalFolder.id);
                    showToast(t('sidebar.movedToFolder', { folder: t('sidebar.personalFolder') }));
                    // Success flash
                    btn.classList.add('bg-violet-100', 'dark:bg-violet-900/40');
                    setTimeout(() => btn.classList.remove('bg-violet-100', 'dark:bg-violet-900/40'), 400);
                    state.onFilterChange(state.activeFilter);
                }
            });
        }

        btn.addEventListener('click', () => {
            state.activeFilter = filterValue;
            state.onFilterChange(filterValue);
            render();
        });

        return btn;
    }

    // --- Helpers ---

    function createDivider(label) {
        const div = document.createElement('div');
        if (label) {
            div.className = 'mt-3 mb-1 px-3';
            div.innerHTML = `<span class="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold">${escapeHtml(label)}</span>`;
        } else {
            div.className = 'my-2 mx-3 border-t border-stone-200 dark:border-stone-700';
        }
        return div;
    }

    function renderLevelButton(nav) {
        const levelId = getSchoolLevel();
        if (!levelId) return;

        const levelData = SCHOOL_LEVELS.find(l => l.id === levelId);
        const levelSection = document.createElement('div');
        levelSection.className = 'px-3 py-3 mt-auto border-t border-stone-200 dark:border-stone-700';

        const changeLevelBtn = document.createElement('button');
        changeLevelBtn.className = 'flex items-center gap-2 w-full px-3 py-2 text-xs text-stone-500 dark:text-stone-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-stone-100 dark:hover:bg-stone-700/50 rounded-lg transition-colors';
        changeLevelBtn.innerHTML = `
            <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>
            <span class="flex flex-col text-left">
                <span class="font-medium">${escapeHtml(t('level.changeLevel'))}</span>
                <span class="text-[10px] text-stone-400 dark:text-stone-500">${levelData ? escapeHtml(t(levelData.labelKey)) : ''}</span>
            </span>
        `;

        changeLevelBtn.addEventListener('click', async () => {
            const newLevel = await showOnboardingModal({ allowCancel: true });
            if (newLevel) {
                setSchoolLevel(newLevel);
                render();
                state.activeFilter = 'all';
                state.onFilterChange('all');
            }
        });

        levelSection.appendChild(changeLevelBtn);
        nav.appendChild(levelSection);
    }

    // --- Drag cues ---

    function applyDragCues() {
        nav.querySelectorAll('[data-folder-id], .skriv-drop-target').forEach(btn => {
            if (isDragActive) {
                btn.classList.add('ring-1', 'ring-emerald-200', 'dark:ring-emerald-800');
            } else {
                btn.classList.remove('ring-1', 'ring-emerald-200', 'dark:ring-emerald-800');
            }
        });
    }

    // --- Init ---

    render();
    container.appendChild(nav);

    return {
        destroy: () => nav.remove(),
        update(newOptions) {
            Object.assign(state, newOptions);
            render();
        },
        setDragActive(active) {
            isDragActive = active;
            applyDragCues();
        },
    };
}
