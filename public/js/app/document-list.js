/**
 * Document list UI — the "home screen" of Skriv.
 * Three-column desktop layout: folder tree + cleanup desk + document cards.
 * The cleanup desk becomes a compact section above the list on smaller screens.
 */

import { listDocuments, createDocument, getDocument, saveDocument } from './document-store.js';
import {
    trashDocument, restoreDocument, listTrashedDocuments,
    permanentlyDelete, emptyTrash, getTrashCount, getRetentionDays,
} from './trash-store.js';
import { escapeAttr, escapeHtml } from '../editor-core/shared/html-escape.js';
import { countWords } from '../editor-core/shared/word-counter.js';
import { showInPageConfirm } from '../editor-core/shared/in-page-modal.js';
import { showToast } from '../editor-core/shared/toast-notification.js';
import { t, getDateLocale, renderLanguageSelector } from '../editor-core/shared/i18n.js';
import { showWordCountStats } from './word-count-stats.js';
import { createSearchBar, filterDocuments } from './document-search.js';
import { cycleTheme, getThemeIconSVG } from '../editor-core/shared/theme.js';
import { createSidebar } from './sidebar.js';
import { createFolderPicker, createFolderBadges } from './folder-picker.js';
import { initCleanupDesk, getCleanupDocuments, getCleanupReasons } from './cleanup-desk.js';
import {
    getCurrentSchoolYear, getAllFolders, setDocFolders,
    isPersonalFolder, PERSONAL_FOLDER_NAME,
} from './folder-store.js';
import { isMicrosoftLocalhost } from './microsoft-config.js';
import { createMicrosoftStorage } from './microsoft-storage.js';
import { showMicrosoftStorageDialog } from './microsoft-storage-dialog.js';

/**
 * Render the document list into a container.
 * @param {HTMLElement} container - The element to render into
 * @param {Function} onOpenDocument - Called with doc.id and optional focus intent when opening a doc
 */
export async function renderDocumentList(container, onOpenDocument) {
    container.innerHTML = '';

    const microsoftStorage = createMicrosoftStorage();
    const showMicrosoftButton = microsoftStorage.isConfigured() || isMicrosoftLocalhost();

    const trashCount = await getTrashCount();
    const docs = await listDocuments();

    // Filter state
    let currentQuery = '';
    let currentFolderFilter = 'all';
    let currentSchoolYear = getCurrentSchoolYear();
    let allFolders = await getAllFolders();

    let desktopSidebar = null;
    let mobileSidebarInstance = null;
    let searchBar = null;
    let cardPickerApis = [];

    async function handleDocumentChanged({ type, doc }) {
        if (type === 'trash') {
            const index = docs.findIndex(item => item.id === doc.id);
            if (index !== -1) docs.splice(index, 1);
        }
        applyFilters();
        if (type === 'trash') await updateTrashBadge();
    }

    const cleanupDesk = initCleanupDesk({
        onOpenDocument,
        onDocumentChanged: handleDocumentChanged,
        onDragStateChange: (active) => {
            desktopSidebar?.setDragActive(active);
            mobileSidebarInstance?.setDragActive(active);
        },
    });

    // Responsive three-column layout
    const layout = document.createElement('div');
    layout.className = 'skriv-layout flex h-screen';

    // Sidebar container
    const sidebarContainer = document.createElement('aside');
    sidebarContainer.className = 'skriv-sidebar-container hidden md:block w-56 flex-shrink-0 border-r border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 overflow-y-auto';

    // Main content area
    const mainContent = document.createElement('div');
    mainContent.className = 'flex-1 overflow-y-auto flex flex-col';

    layout.appendChild(sidebarContainer);
    layout.appendChild(cleanupDesk.desktopElement);
    layout.appendChild(mainContent);
    container.appendChild(layout);

    // Mobile sidebar overlay
    const mobileOverlay = document.createElement('div');
    mobileOverlay.className = 'skriv-sidebar-overlay fixed inset-0 z-40 bg-black/30 hidden';
    mobileOverlay.addEventListener('click', () => closeMobileSidebar({ restoreFocus: true }));

    const mobileSidebar = document.createElement('aside');
    mobileSidebar.id = 'mobile-folder-navigation';
    mobileSidebar.className = 'skriv-mobile-sidebar fixed top-0 left-0 z-50 h-full w-64 bg-stone-50 dark:bg-stone-800 border-r border-stone-200 dark:border-stone-700 overflow-y-auto transform -translate-x-full transition-transform duration-200';
    mobileSidebar.setAttribute('aria-label', t('sidebar.folders'));
    mobileSidebar.setAttribute('aria-hidden', 'true');
    mobileSidebar.tabIndex = -1;
    mobileSidebar.inert = true;
    container.appendChild(mobileOverlay);
    container.appendChild(mobileSidebar);

    let hamburgerButton = null;

    function openMobileSidebar() {
        mobileOverlay.classList.remove('hidden');
        mobileSidebar.classList.remove('-translate-x-full');
        mobileSidebar.setAttribute('aria-hidden', 'false');
        mobileSidebar.inert = false;
        layout.inert = true;
        hamburgerButton?.setAttribute('aria-expanded', 'true');
        requestAnimationFrame(() => {
            const firstControl = mobileSidebar.querySelector('button, select, [tabindex="0"]');
            (firstControl || mobileSidebar).focus();
        });
    }

    function closeMobileSidebar({ restoreFocus = false } = {}) {
        const wasOpen = mobileSidebar.getAttribute('aria-hidden') === 'false';
        mobileOverlay.classList.add('hidden');
        mobileSidebar.classList.add('-translate-x-full');
        mobileSidebar.setAttribute('aria-hidden', 'true');
        mobileSidebar.inert = true;
        layout.inert = false;
        hamburgerButton?.setAttribute('aria-expanded', 'false');
        if (restoreFocus || wasOpen) hamburgerButton?.focus();
    }

    function handleMobileSidebarKeydown(event) {
        if (event.key === 'Escape' && mobileSidebar.getAttribute('aria-hidden') === 'false') {
            event.preventDefault();
            closeMobileSidebar({ restoreFocus: true });
        }
    }
    document.addEventListener('keydown', handleMobileSidebarKeydown);

    // Header
    const header = document.createElement('div');
    header.className = 'max-w-2xl mx-auto px-4 pt-8 pb-4 w-full';
    header.innerHTML = `
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
                <button id="btn-hamburger" class="md:hidden p-2 -ml-2 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 rounded-lg transition-colors" aria-label="${t('sidebar.folders')}" aria-controls="mobile-folder-navigation" aria-expanded="false">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
                </button>
                <div>
                    <h1 class="text-2xl font-bold text-stone-900 dark:text-stone-100">${t('skriv.appName')}</h1>
                    <p class="text-sm text-stone-500 dark:text-stone-400 mt-1">${t('skriv.tagline')}</p>
                </div>
            </div>
            <div class="flex items-center gap-2">
                <span id="ui-language-selector"></span>
                <button id="btn-microsoft" class="${showMicrosoftButton ? '' : 'hidden '}px-3 py-2.5 text-stone-400 hover:text-emerald-600 dark:text-stone-500 dark:hover:text-emerald-400 rounded-lg text-sm transition-colors" title="${escapeAttr(t('microsoft.buttonTitle'))}" aria-label="${escapeAttr(t('microsoft.buttonTitle'))}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 18h10a4 4 0 00.8-7.919A6 6 0 006.34 8.53 4.5 4.5 0 007 18z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M9 13h6m-3-3v6"/></svg>
                </button>
                <button id="btn-theme" class="px-3 py-2.5 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 rounded-lg text-sm transition-colors" title="${t('theme.toggle')}">
                    ${getThemeIconSVG()}
                </button>
                <button id="btn-trash" class="relative px-3 py-2.5 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 rounded-lg text-sm transition-colors" title="${t('skriv.trashButton')}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    ${trashCount > 0 ? `<span data-trash-count class="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">${trashCount > 9 ? '9+' : trashCount}</span>` : ''}
                </button>
                <button id="btn-new-doc" class="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm">
                    + ${t('skriv.newDocument')}
                </button>
            </div>
        </div>
    `;
    hamburgerButton = header.querySelector('#btn-hamburger');
    renderLanguageSelector(header.querySelector('#ui-language-selector'), { compact: true });
    mainContent.appendChild(header);

    async function updateTrashBadge() {
        const button = header.querySelector('#btn-trash');
        const count = await getTrashCount();
        let badge = button.querySelector('[data-trash-count]');
        if (count === 0) {
            badge?.remove();
            return;
        }
        if (!badge) {
            badge = document.createElement('span');
            badge.setAttribute('data-trash-count', '');
            badge.className = 'absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center';
            button.appendChild(badge);
        }
        badge.textContent = count > 9 ? '9+' : String(count);
    }

    // Footer
    const footer = document.createElement('div');
    footer.className = 'max-w-2xl mx-auto px-4 mt-auto w-full';
    footer.innerHTML = `
        <div class="border-t border-stone-200 dark:border-stone-700 py-4 flex items-center justify-between text-xs text-stone-400">
            <span>&copy; ${new Date().getFullYear()} Papertek Forlag AS</span>
            <a href="/whitepaper.html" class="text-emerald-600 hover:text-emerald-700 hover:underline transition-colors">
                Whitepaper
            </a>
        </div>
    `;

    // Document list container
    const listEl = document.createElement('div');
    listEl.className = 'max-w-2xl mx-auto px-4 pb-8 w-full';
    listEl.appendChild(cleanupDesk.compactElement);
    mainContent.appendChild(listEl);

    // Event handlers
    header.querySelector('#btn-new-doc').addEventListener('click', async () => {
        const doc = await createDocument();
        onOpenDocument(doc.id);
    });

    header.querySelector('#btn-theme').addEventListener('click', () => {
        const newTheme = cycleTheme();
        header.querySelector('#btn-theme').innerHTML = getThemeIconSVG();
        showToast(t(`theme.${newTheme}`), { duration: 1500 });
    });

    header.querySelector('#btn-microsoft').addEventListener('click', () => {
        showMicrosoftStorageDialog({
            storage: microsoftStorage,
            onConfigurationChanged: () => globalThis.location.reload(),
            onImported: (importedDocument) => {
                if (importedDocument?.id) onOpenDocument(importedDocument.id);
            },
        }).catch(() => {
            showToast(t('microsoft.error.generic'), { duration: 3000 });
        });
    });

    header.querySelector('#btn-trash').addEventListener('click', () => {
        window.location.hash = '#/trash';
    });

    hamburgerButton.addEventListener('click', openMobileSidebar);

    // --- File drag & drop import ---
    const dragOverlay = document.createElement('div');
    dragOverlay.className = 'fixed inset-0 z-[100] bg-emerald-900/50 backdrop-blur-sm hidden flex-col items-center justify-center pointer-events-none transition-opacity opacity-0';
    dragOverlay.innerHTML = `
        <div class="bg-white dark:bg-stone-800 p-8 rounded-2xl shadow-2xl flex flex-col items-center gap-4 border-2 border-dashed border-emerald-400">
            <svg class="w-12 h-12 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"/></svg>
            <span class="text-xl font-medium text-stone-900 dark:text-stone-100">Slipp filen her for å importere</span>
        </div>
    `;
    container.appendChild(dragOverlay);

    const fileDragController = new AbortController();
    let dragCounter = 0;
    let dragLeaveTimer = null;
    container.addEventListener('dragenter', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            if (dragLeaveTimer) {
                clearTimeout(dragLeaveTimer);
                dragLeaveTimer = null;
            }
            dragCounter++;
            dragOverlay.classList.remove('hidden');
            dragOverlay.classList.add('flex');
            requestAnimationFrame(() => dragOverlay.classList.remove('opacity-0'));
        }
    }, { signal: fileDragController.signal });
    container.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    }, { signal: fileDragController.signal });
    container.addEventListener('dragleave', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            dragCounter--;
            if (dragCounter === 0) {
                dragOverlay.classList.add('opacity-0');
                dragLeaveTimer = setTimeout(() => {
                    if (dragCounter === 0) {
                        dragOverlay.classList.add('hidden');
                        dragOverlay.classList.remove('flex');
                    }
                    dragLeaveTimer = null;
                }, 200);
            }
        }
    }, { signal: fileDragController.signal });
    container.addEventListener('drop', async (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            dragCounter = 0;
            if (dragLeaveTimer) {
                clearTimeout(dragLeaveTimer);
                dragLeaveTimer = null;
            }
            dragOverlay.classList.add('opacity-0', 'hidden');
            dragOverlay.classList.remove('flex');
            
            const file = e.dataTransfer.files[0];
            if (file) {
                const text = await file.text();
                let title = file.name;
                title = title.replace(/\.[^/.]+$/, ''); // Remove extension
                
                const doc = await createDocument(title);
                
                // Simple conversion: double newlines = paragraphs. single newline = <br>
                const paragraphs = text
                    .split(/\r?\n\r?\n/)
                    .filter(p => p.trim())
                    .map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`)
                    .join('');
                
                await saveDocument(doc.id, {
                    html: paragraphs || `<p>${escapeHtml(text)}</p>`
                });
                onOpenDocument(doc.id);
            }
        }
    }, { signal: fileDragController.signal });
    // --------------------------------

    // Sidebar options
    const sidebarOptions = {
        docs,
        activeFilter: currentFolderFilter,
        schoolYear: currentSchoolYear,
        onFilterChange: (filter) => {
            currentFolderFilter = filter;
            closeMobileSidebar();
            applyFilters();
        },
        onSchoolYearChange: (year) => {
            currentSchoolYear = year;
            closeMobileSidebar();
            applyFilters();
        },
        onLibraryChanged: async () => {
            const [refreshedDocs, refreshedFolders] = await Promise.all([
                listDocuments(),
                getAllFolders(),
            ]);
            docs.splice(0, docs.length, ...refreshedDocs);
            allFolders = refreshedFolders;
            applyFilters();
        },
    };

    // Create sidebars (desktop + mobile)
    desktopSidebar = createSidebar(sidebarContainer, sidebarOptions);
    mobileSidebarInstance = createSidebar(mobileSidebar, sidebarOptions);

    const destroyScreen = () => {
        cardPickerApis.forEach(api => api.destroy?.());
        cardPickerApis = [];
        fileDragController.abort();
        if (dragLeaveTimer) clearTimeout(dragLeaveTimer);
        searchBar?.destroy?.();
        cleanupDesk.destroy();
        Promise.resolve(microsoftStorage.destroy?.()).catch(() => {});
        desktopSidebar.destroy?.();
        mobileSidebarInstance.destroy?.();
        document.removeEventListener('keydown', handleMobileSidebarKeydown);
    };

    cleanupDesk.update(getCleanupDocuments(docs, currentSchoolYear), allFolders);

    if (docs.length === 0) {
        // First-run empty state: point the pupil at the tools, not just
        // at an empty list — the trainer and tysk routes are otherwise
        // only discoverable via the sidebar.
        const emptyCardClass = 'flex flex-col items-start gap-1.5 p-4 rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 hover:border-emerald-400 dark:hover:border-emerald-500 hover:shadow-sm transition-all text-left w-full';
        listEl.innerHTML = `
            <div class="text-center py-10">
                <div class="text-5xl mb-4 opacity-30">&#9997;&#65039;</div>
                <p class="text-stone-400 text-sm mb-8">${t('skriv.noDocuments')}</p>
                <div class="grid gap-3 sm:grid-cols-3 max-w-2xl mx-auto">
                    <button id="empty-new-doc" class="${emptyCardClass}">
                        <span class="text-2xl" aria-hidden="true">&#128221;</span>
                        <span class="text-sm font-semibold text-stone-800 dark:text-stone-100">${t('skriv.newDocument')}</span>
                        <span class="text-xs text-stone-500 dark:text-stone-400">${t('skriv.emptyNewDocDesc')}</span>
                    </button>
                    <a href="#/avsnitt" class="${emptyCardClass}">
                        <span class="text-2xl" aria-hidden="true">&#129521;</span>
                        <span class="text-sm font-semibold text-stone-800 dark:text-stone-100">${t('paragraphTrainer.sidebar')}</span>
                        <span class="text-xs text-stone-500 dark:text-stone-400">${t('skriv.emptyTrainerDesc')}</span>
                    </a>
                    <a href="#/tysk" class="${emptyCardClass}">
                        <span class="text-2xl" aria-hidden="true">&#127891;</span>
                        <span class="text-sm font-semibold text-stone-800 dark:text-stone-100">${t('germanExam.sidebar')}</span>
                        <span class="text-xs text-stone-500 dark:text-stone-400">${t('skriv.emptyGermanDesc')}</span>
                    </a>
                </div>
            </div>
        `;
        listEl.querySelector('#empty-new-doc').addEventListener('click', async () => {
            const doc = await createDocument();
            onOpenDocument(doc.id);
        });
        mainContent.appendChild(footer);
        return { destroy: destroyScreen };
    }

    function getDescendantFolderIds(folderId) {
        const result = new Set([folderId]);
        function collect(parentId) {
            for (const f of allFolders) {
                if (f.parentId === parentId && !result.has(f.id)) {
                    result.add(f.id);
                    collect(f.id);
                }
            }
        }
        collect(folderId);
        return result;
    }

    function applyFilters() {
        let filtered = docs;

        // The cleanup task intentionally ignores search and folder filters.
        cleanupDesk.update(getCleanupDocuments(docs, currentSchoolYear), allFolders);

        // School year filter
        filtered = filtered.filter(d => d.schoolYear === currentSchoolYear);

        // Folder filter
        if (currentFolderFilter === 'orphans') {
            filtered = filtered.filter(d => !d.folderIds || d.folderIds.length === 0);
        } else if (currentFolderFilter === 'personal') {
            const personalFolder = allFolders.find(f => isPersonalFolder(f));
            if (personalFolder) {
                filtered = filtered.filter(d => d.folderIds?.includes(personalFolder.id));
            }
        } else if (currentFolderFilter !== 'all') {
            const descendantSet = getDescendantFolderIds(currentFolderFilter);
            filtered = filtered.filter(d =>
                d.folderIds?.some(fid => descendantSet.has(fid))
            );
        }

        // Search filter
        filtered = filterDocuments(filtered, currentQuery);

        cardPickerApis.forEach(api => api.destroy?.());
        cardPickerApis = renderDocumentCards(
            cardsContainer,
            docs,
            filtered,
            currentQuery,
            currentFolderFilter,
            currentSchoolYear,
            onOpenDocument,
            allFolders,
            handleDocumentChanged
        );

        // Update sidebar counts
        desktopSidebar.update({ docs, activeFilter: currentFolderFilter, schoolYear: currentSchoolYear });
        mobileSidebarInstance.update({ docs, activeFilter: currentFolderFilter, schoolYear: currentSchoolYear });
    }

    // Search bar
    searchBar = createSearchBar(listEl, (query) => {
        currentQuery = query;
        applyFilters();
    });

    // Cards container — separate div so re-renders only clear cards, not search
    const cardsContainer = document.createElement('div');
    cardsContainer.setAttribute('data-cards-container', '');
    listEl.appendChild(cardsContainer);

    // Broadcast drag state to sidebar for visual drop cues
    cardsContainer.addEventListener('dragstart', () => {
        desktopSidebar.setDragActive(true);
        mobileSidebarInstance.setDragActive(true);
    });
    cardsContainer.addEventListener('dragend', () => {
        desktopSidebar.setDragActive(false);
        mobileSidebarInstance.setDragActive(false);
    });
    // Initial render
    applyFilters();

    mainContent.appendChild(footer);

    return {
        destroy: destroyScreen,
    };
}

/**
 * Render document cards into the list element.
 */
function renderDocumentCards(listEl, allDocs, filteredDocs, query, folderFilter, schoolYear, onOpenDocument, folders, onDocumentChanged) {
    // Clear all cards — search bar and tag filter live outside this container
    listEl.innerHTML = '';

    // All documents have one canonical card. Cleanup work is shown separately.
    const mainDocs = filteredDocs;
    const pickerApis = [];

    const isFiltering = query || folderFilter !== 'all';

    // Filter allDocs by school year for stats
    const yearDocs = allDocs.filter(d => d.schoolYear === schoolYear);
    const totalWords = yearDocs.reduce((sum, d) => sum + (d.wordCount || 0), 0);

    // Stats bar
    const statsBar = document.createElement('div');
    statsBar.className = 'text-xs text-stone-400 mb-4 flex gap-4';

    if (isFiltering && filteredDocs.length !== yearDocs.length) {
        statsBar.innerHTML = `
            <span>${t('search.resultsCount', { count: filteredDocs.length, total: yearDocs.length })}</span>
            <button id="btn-word-stats" class="skriv-word-stats-badge" title="${t('stats.title')}">
                ${t('skriv.wordsWritten', { count: totalWords })}
            </button>
        `;
    } else {
        statsBar.innerHTML = `
            <span>${t('skriv.documentsCount', { count: yearDocs.length })}</span>
            <button id="btn-word-stats" class="skriv-word-stats-badge" title="${t('stats.title')}">
                ${t('skriv.wordsWritten', { count: totalWords })}
            </button>
        `;
    }
    listEl.appendChild(statsBar);

    statsBar.querySelector('#btn-word-stats').addEventListener('click', () => {
        showWordCountStats(yearDocs);
    });

    // No results
    if (filteredDocs.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'text-center py-12';
        noResults.innerHTML = `
            <div class="text-4xl mb-3 opacity-30">&#128269;</div>
            <p class="text-stone-400 text-sm">${t('search.noResults')}</p>
        `;
        listEl.appendChild(noResults);
        return pickerApis;
    }

    // Document cards
    const cardList = document.createElement('div');
    cardList.setAttribute('role', 'list');
    cardList.setAttribute('aria-label', t('skriv.backToDocuments'));
    listEl.appendChild(cardList);

    mainDocs.forEach(doc => {
        const card = document.createElement('div');
        card.setAttribute('role', 'listitem');
        card.setAttribute('tabindex', '0');
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-doc-id', doc.id);
        const needsCleanup = getCleanupReasons(doc).length > 0;
        const cleanupStyles = needsCleanup ? 'border-l-4 border-l-amber-400 ' : '';
        card.className = `group bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 ${cleanupStyles}rounded-xl p-4 mb-3 hover:border-stone-300 dark:hover:border-stone-600 hover:shadow-sm transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:ring-offset-1`;

        const title = String(doc.title || '').trim() || t('skriv.untitled');
        const wordCount = doc.wordCount || 0;
        const updatedAt = doc.updatedAt ? formatRelativeTime(doc.updatedAt) : '';
        const preview = doc.plainText ? doc.plainText.substring(0, 120).trim() : '';

        const cardLabel = `${title}, ${t('wordCounter.count', { count: wordCount })}, ${updatedAt}`;
        card.setAttribute('aria-label', cardLabel);

        card.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-stone-900 dark:text-stone-100 truncate">${escapeHtml(title)}</h3>
                    ${preview ? `<p class="text-sm text-stone-500 dark:text-stone-400 mt-1 line-clamp-2">${escapeHtml(preview)}...</p>` : ''}
                    <div class="flex items-center gap-2 mt-2 text-xs text-stone-400 flex-wrap">
                        <span>${wordCount} ${t('wordCounter.count', { count: wordCount }).split(' ').pop()}</span>
                        <span>${updatedAt}</span>
                        <span class="folder-badges-container"></span>
                    </div>
                </div>
                <button data-delete-id="${doc.id}" class="p-1.5 rounded-lg text-stone-300 dark:text-stone-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-all focus:opacity-100" title="${t('skriv.trashMoveToTrash')}" aria-label="${t('skriv.trashMoveToTrash')}: ${escapeHtml(title)}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        `;

        // Folder badges
        const badgesContainer = card.querySelector('.folder-badges-container');
        const badges = createFolderBadges(doc.folderIds || [], folders || []);
        badgesContainer.appendChild(badges);

        // Open document
        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-delete-id]') || e.target.closest('.folder-assign-btn')) return;
            onOpenDocument(doc.id);
        });
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.target.closest('[data-delete-id]') && !e.target.closest('.folder-assign-btn')) {
                onOpenDocument(doc.id);
            }
        });

        // Delete handler
        card.querySelector('[data-delete-id]').addEventListener('click', async (e) => {
            e.stopPropagation();
            const days = getRetentionDays();
            const confirmed = await showInPageConfirm(
                t('skriv.deleteConfirmTitle'),
                t('skriv.deleteConfirmMessageTrash', { title, days, count: days }),
                t('skriv.deleteConfirmYesTrash'),
                t('common.cancel')
            );
            if (confirmed) {
                // Collapse animation
                card.style.height = card.offsetHeight + 'px';
                card.classList.add('collapse-transition');
                void card.offsetHeight; // force reflow
                card.style.height = '0';
                card.style.opacity = '0';
                card.style.margin = '0';
                card.style.padding = '0';
                card.style.borderWidth = '0';
                
                await new Promise(resolve => setTimeout(resolve, 200));

                const fullDoc = await getDocument(doc.id);
                if (fullDoc) {
                    await trashDocument(fullDoc);
                }
                showToast(t('sidebar.cleanupMovedToTrash', { title }));
                await onDocumentChanged({ type: 'trash', doc });
            }
        });

        // Folder assign button for orphans (the "Choose folder" badge)
        const assignBtn = badgesContainer.querySelector('.folder-assign-btn');
        if (assignBtn) {
            pickerApis.push(createFolderPicker(assignBtn, [], async (newFolderIds) => {
                await setDocFolders(doc.id, newFolderIds);
                doc.folderIds = newFolderIds;
                await onDocumentChanged({ type: 'folders', doc });
            }));
        }

        // Drag start
        card.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', doc.id);
            e.dataTransfer.effectAllowed = 'move';
            card.classList.add('opacity-50');
            // Custom drag image pill
            const ghost = document.createElement('div');
            ghost.className = 'px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-full shadow-lg whitespace-nowrap';
            ghost.style.position = 'fixed';
            ghost.style.top = '-100px';
            const truncTitle = title.length > 30 ? title.substring(0, 30) + '\u2026' : title;
            ghost.textContent = truncTitle;
            document.body.appendChild(ghost);
            e.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
            requestAnimationFrame(() => ghost.remove());
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('opacity-50');
        });

        cardList.appendChild(card);
    });

    return pickerApis;
}

/**
 * Render the trash view.
 */
export async function renderTrashView(container, onBack, lifecycle = null) {
    const owner = lifecycle || { destroyed: false, version: 0 };
    const renderVersion = ++owner.version;
    const isStale = () => owner.destroyed || renderVersion !== owner.version;
    const api = {
        destroy: () => {
            owner.destroyed = true;
            owner.version++;
            container.innerHTML = '';
        },
    };
    const refresh = async () => {
        if (isStale()) return;
        await renderTrashView(container, onBack, owner);
    };

    container.innerHTML = '';

    const days = getRetentionDays();

    const header = document.createElement('div');
    header.className = 'max-w-2xl mx-auto px-4 pt-8 pb-4';
    header.innerHTML = `
        <div class="flex items-center justify-between mb-6">
            <div class="flex items-center gap-3">
                <button id="btn-back-from-trash" class="text-sm text-stone-500 hover:text-stone-700 transition-colors flex items-center gap-1">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
                    ${t('common.back')}
                </button>
                <h1 class="text-2xl font-bold text-stone-900 dark:text-stone-100">${t('skriv.trashButton')}</h1>
            </div>
            <button id="btn-empty-trash" class="px-3 py-2 text-xs text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg border border-red-200 transition-colors hidden">
                ${t('skriv.trashEmptyAll')}
            </button>
        </div>
        <p class="text-xs text-stone-400 -mt-4 mb-4">${t('skriv.trashInfo', { days, count: days })}</p>
    `;
    container.appendChild(header);

    header.querySelector('#btn-back-from-trash').addEventListener('click', () => {
        if (!isStale()) onBack();
    });

    const listEl = document.createElement('div');
    listEl.className = 'max-w-2xl mx-auto px-4 pb-8';
    container.appendChild(listEl);

    const trashedDocs = await listTrashedDocuments();
    if (isStale()) return api;

    if (trashedDocs.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-16">
                <div class="text-5xl mb-4 opacity-30">&#128465;&#65039;</div>
                <p class="text-stone-400 text-sm">${t('skriv.trashEmpty')}</p>
            </div>
        `;
        return api;
    }

    const emptyBtn = header.querySelector('#btn-empty-trash');
    emptyBtn.classList.remove('hidden');
    emptyBtn.addEventListener('click', async () => {
        const confirmed = await showInPageConfirm(
            t('skriv.trashEmptyAllConfirmTitle'),
            t('skriv.trashEmptyAllConfirmMessage', { count: trashedDocs.length }),
            t('skriv.trashEmptyAllConfirmYes'),
            t('common.cancel')
        );
        if (confirmed && !isStale()) {
            await emptyTrash();
            if (!isStale()) await refresh();
        }
    });

    const statsBar = document.createElement('div');
    statsBar.className = 'text-xs text-stone-400 mb-4';
    statsBar.textContent = t('skriv.trashCount', { count: trashedDocs.length });
    listEl.appendChild(statsBar);

    trashedDocs.forEach(doc => {
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-4 mb-3 opacity-75';

        const title = doc.title || t('skriv.untitled');
        const wordCount = doc.wordCount || 0;
        const trashedAt = doc.trashedAt ? formatRelativeTime(doc.trashedAt) : '';
        const daysLeft = doc.expiresAt ? Math.max(0, Math.ceil((new Date(doc.expiresAt) - new Date()) / 86400000)) : '?';

        card.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-stone-600 dark:text-stone-300 truncate">${escapeHtml(title)}</h3>
                    <div class="flex items-center gap-3 mt-2 text-xs text-stone-400">
                        <span>${wordCount} ${t('wordCounter.count', { count: wordCount }).split(' ').pop()}</span>
                        <span>${trashedAt}</span>
                        <span class="text-red-400">${daysLeft}d</span>
                    </div>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                    <button data-restore-id="${doc.id}" class="px-3 py-1.5 text-xs rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50 transition-colors">
                        ${t('skriv.trashRestore')}
                    </button>
                    <button data-permadelete-id="${doc.id}" class="p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all" title="${t('skriv.trashDeletePermanently')}">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                    </button>
                </div>
            </div>
        `;

        card.querySelector('[data-restore-id]').addEventListener('click', async () => {
            await restoreDocument(doc.id);
            if (isStale()) return;
            showToast(t('skriv.trashRestored'), { duration: 2000 });
            await refresh();
        });

        card.querySelector('[data-permadelete-id]').addEventListener('click', async () => {
            const confirmed = await showInPageConfirm(
                t('skriv.trashDeletePermanentlyConfirmTitle'),
                t('skriv.trashDeletePermanentlyConfirmMessage', { title }),
                t('skriv.trashDeletePermanentlyConfirmYes'),
                t('common.cancel')
            );
            if (confirmed && !isStale()) {
                await permanentlyDelete(doc.id);
                if (!isStale()) await refresh();
            }
        });

        listEl.appendChild(card);
    });

    return api;
}

/**
 * Format a date string as relative time.
 */
function formatRelativeTime(isoString) {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffMin = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return t('time.now');
    if (diffMin < 60) return t('time.minutesAgo', { count: diffMin });
    if (diffHrs < 24) return t('time.hoursAgo', { count: diffHrs });
    if (diffDays === 1) return t('time.yesterday');
    if (diffDays < 7) return t('time.daysAgo', { count: diffDays });

    return date.toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short' });
}

