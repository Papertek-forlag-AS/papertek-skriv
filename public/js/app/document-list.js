/**
 * Document list UI — the "home screen" of Skriv.
 * Shows all saved documents with create/open/delete actions.
 * Includes trash view for restoring soft-deleted documents.
 */

import { listDocuments, createDocument, getDocument } from './document-store.js';
import {
    trashDocument, restoreDocument, listTrashedDocuments,
    permanentlyDelete, emptyTrash, getTrashCount, getRetentionDays,
} from './trash-store.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';
import { countWords } from '../editor-core/shared/word-counter.js';
import { showInPageConfirm } from '../editor-core/shared/in-page-modal.js';
import { showToast } from '../editor-core/shared/toast-notification.js';
import { t, getDateLocale } from '../editor-core/shared/i18n.js';
import { showWordCountStats } from './word-count-stats.js';
import { createSearchBar, filterDocuments } from './document-search.js';
import { createTagFilter, collectTags, filterByTag } from './document-tags.js';
import { cycleTheme, getTheme } from '../editor-core/shared/theme.js';

/**
 * Render the document list into a container.
 * @param {HTMLElement} container - The element to render into
 * @param {Function} onOpenDocument - Called with doc.id when user opens a doc
 */
export async function renderDocumentList(container, onOpenDocument) {
    container.innerHTML = '';

    const trashCount = await getTrashCount();

    // Header
    const header = document.createElement('div');
    header.className = 'max-w-2xl mx-auto px-4 pt-8 pb-4';
    header.innerHTML = `
        <div class="flex items-center justify-between mb-6">
            <div>
                <h1 class="text-2xl font-bold text-stone-900 dark:text-stone-100">${t('skriv.appName')}</h1>
                <p class="text-sm text-stone-500 dark:text-stone-400 mt-1">${t('skriv.tagline')}</p>
            </div>
            <div class="flex items-center gap-2">
                <button id="btn-theme" class="px-3 py-2.5 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 rounded-lg text-sm transition-colors" title="${t('theme.toggle')}">
                    ${getThemeIconSVG()}
                </button>
                <button id="btn-trash" class="relative px-3 py-2.5 text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300 rounded-lg text-sm transition-colors" title="${t('skriv.trashButton')}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                    ${trashCount > 0 ? `<span class="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">${trashCount > 9 ? '9+' : trashCount}</span>` : ''}
                </button>
                <button id="btn-new-doc" class="px-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition-colors shadow-sm">
                    + ${t('skriv.newDocument')}
                </button>
            </div>
        </div>
    `;
    container.appendChild(header);

    // Footer with whitepaper link
    const footer = document.createElement('div');
    footer.className = 'max-w-2xl mx-auto px-4 mt-auto';
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
    listEl.className = 'max-w-2xl mx-auto px-4 pb-8';
    container.appendChild(listEl);

    // New document button
    header.querySelector('#btn-new-doc').addEventListener('click', async () => {
        const doc = await createDocument();
        onOpenDocument(doc.id);
    });

    // Theme toggle button
    header.querySelector('#btn-theme').addEventListener('click', () => {
        const newTheme = cycleTheme();
        header.querySelector('#btn-theme').innerHTML = getThemeIconSVG();
        showToast(t(`theme.${newTheme}`), { duration: 1500 });
    });

    // Trash button
    header.querySelector('#btn-trash').addEventListener('click', () => {
        renderTrashView(container, onOpenDocument);
    });

    // Load all documents once
    const docs = await listDocuments();

    if (docs.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-16">
                <div class="text-5xl mb-4 opacity-30">&#9997;&#65039;</div>
                <p class="text-stone-400 text-sm">${t('skriv.noDocuments')}</p>
            </div>
        `;
        container.appendChild(footer);
        return;
    }

    // Filter state
    let currentQuery = '';
    let currentTag = null;

    function applyFilters() {
        let filtered = filterByTag(docs, currentTag);
        filtered = filterDocuments(filtered, currentQuery);
        renderDocumentCards(listEl, docs, filtered, currentQuery, currentTag, onOpenDocument, container);
    }

    // Search bar (only shown when there are documents)
    const searchBar = createSearchBar(listEl, (query) => {
        currentQuery = query;
        applyFilters();
    });

    // Tag filter (only shown when tags exist)
    const allTags = collectTags(docs);
    let tagFilter = null;
    if (allTags.length > 0) {
        const tagContainer = document.createElement('div');
        tagContainer.className = 'max-w-2xl mx-auto';
        listEl.appendChild(tagContainer);
        tagFilter = createTagFilter(tagContainer, allTags, (tag) => {
            currentTag = tag;
            applyFilters();
        });
    }

    // Initial render of cards
    applyFilters();

    // Append footer at the bottom
    container.appendChild(footer);
}

/**
 * Render document cards into the list element.
 * Preserves the search bar and tag filter (first N children), clears cards and re-renders.
 */
function renderDocumentCards(listEl, allDocs, filteredDocs, query, activeTag, onOpenDocument, container) {
    // Keep search bar and tag filter wrapper, remove everything after
    const keepCount = listEl.querySelectorAll('.relative, [class*="flex-wrap"]').length || 1;
    while (listEl.children.length > keepCount) {
        listEl.removeChild(listEl.lastChild);
    }

    const isFiltering = query || activeTag;

    // Stats bar
    const totalWords = allDocs.reduce((sum, d) => sum + (d.wordCount || 0), 0);
    const statsBar = document.createElement('div');
    statsBar.className = 'text-xs text-stone-400 mb-4 flex gap-4';

    if (isFiltering && filteredDocs.length !== allDocs.length) {
        statsBar.innerHTML = `
            <span>${t('search.resultsCount', { count: filteredDocs.length, total: allDocs.length })}</span>
            <button id="btn-word-stats" class="skriv-word-stats-badge" title="${t('stats.title')}">
                ${t('skriv.wordsWritten', { count: totalWords })}
            </button>
        `;
    } else {
        statsBar.innerHTML = `
            <span>${t('skriv.documentsCount', { count: allDocs.length })}</span>
            <button id="btn-word-stats" class="skriv-word-stats-badge" title="${t('stats.title')}">
                ${t('skriv.wordsWritten', { count: totalWords })}
            </button>
        `;
    }
    listEl.appendChild(statsBar);

    statsBar.querySelector('#btn-word-stats').addEventListener('click', () => {
        showWordCountStats(allDocs);
    });

    // No results state
    if (filteredDocs.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'text-center py-12';
        noResults.innerHTML = `
            <div class="text-4xl mb-3 opacity-30">&#128269;</div>
            <p class="text-stone-400 text-sm">${t('search.noResults')}</p>
        `;
        listEl.appendChild(noResults);
        return;
    }

    // Document cards
    const cardList = document.createElement('div');
    cardList.setAttribute('role', 'list');
    cardList.setAttribute('aria-label', t('skriv.backToDocuments'));
    listEl.appendChild(cardList);

    filteredDocs.forEach(doc => {
        const card = document.createElement('div');
        card.setAttribute('role', 'listitem');
        card.className = 'group bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl p-4 mb-3 hover:border-stone-300 dark:hover:border-stone-600 hover:shadow-sm transition-all cursor-pointer';

        const title = doc.title || t('skriv.untitled');
        const wordCount = doc.wordCount || 0;
        const updatedAt = doc.updatedAt ? formatRelativeTime(doc.updatedAt) : '';
        const preview = doc.plainText ? doc.plainText.substring(0, 120).trim() : '';
        const tags = doc.tags && doc.tags.length > 0
            ? doc.tags.map(tag => `<span class="inline-block text-[10px] px-1.5 py-0.5 rounded-full bg-stone-100 dark:bg-stone-700 text-stone-500 dark:text-stone-300">${escapeHtml(tag)}</span>`).join(' ')
            : '';

        const cardLabel = `${title}, ${t('wordCounter.count', { count: wordCount })}, ${updatedAt}`;
        card.setAttribute('aria-label', cardLabel);

        card.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-stone-900 dark:text-stone-100 truncate">${escapeHtml(title)}</h3>
                    ${preview ? `<p class="text-sm text-stone-500 dark:text-stone-400 mt-1 line-clamp-2">${escapeHtml(preview)}...</p>` : ''}
                    <div class="flex items-center gap-3 mt-2 text-xs text-stone-400">
                        <span>${wordCount} ${t('wordCounter.count', { count: wordCount }).split(' ').pop()}</span>
                        <span>${updatedAt}</span>
                        ${tags ? `<span class="flex gap-1">${tags}</span>` : ''}
                    </div>
                </div>
                <button data-delete-id="${doc.id}" class="p-1.5 rounded-lg text-stone-300 dark:text-stone-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950 transition-all focus:opacity-100" title="${t('skriv.trashMoveToTrash')}" aria-label="${t('skriv.trashMoveToTrash')}: ${escapeHtml(title)}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        `;

        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-delete-id]')) return;
            onOpenDocument(doc.id);
        });

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
                const fullDoc = await getDocument(doc.id);
                if (fullDoc) {
                    await trashDocument(fullDoc);
                }
                renderDocumentList(container, onOpenDocument);
            }
        });

        cardList.appendChild(card);
    });
}

/**
 * Render the trash view — shows deleted documents with restore/delete actions.
 * @param {HTMLElement} container - The element to render into
 * @param {Function} onOpenDocument - Passed through for navigation back to doc list
 */
async function renderTrashView(container, onOpenDocument) {
    container.innerHTML = '';

    const days = getRetentionDays();

    // Header
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

    // Back button
    header.querySelector('#btn-back-from-trash').addEventListener('click', () => {
        renderDocumentList(container, onOpenDocument);
    });

    // Trash list container
    const listEl = document.createElement('div');
    listEl.className = 'max-w-2xl mx-auto px-4 pb-8';
    container.appendChild(listEl);

    // Load trashed documents
    const trashedDocs = await listTrashedDocuments();

    if (trashedDocs.length === 0) {
        listEl.innerHTML = `
            <div class="text-center py-16">
                <div class="text-5xl mb-4 opacity-30">&#128465;&#65039;</div>
                <p class="text-stone-400 text-sm">${t('skriv.trashEmpty')}</p>
            </div>
        `;
        return;
    }

    // Show empty trash button when there are items
    const emptyBtn = header.querySelector('#btn-empty-trash');
    emptyBtn.classList.remove('hidden');
    emptyBtn.addEventListener('click', async () => {
        const confirmed = await showInPageConfirm(
            t('skriv.trashEmptyAllConfirmTitle'),
            t('skriv.trashEmptyAllConfirmMessage', { count: trashedDocs.length }),
            t('skriv.trashEmptyAllConfirmYes'),
            t('common.cancel')
        );
        if (confirmed) {
            await emptyTrash();
            renderTrashView(container, onOpenDocument);
        }
    });

    // Stats
    const statsBar = document.createElement('div');
    statsBar.className = 'text-xs text-stone-400 mb-4';
    statsBar.textContent = t('skriv.trashCount', { count: trashedDocs.length });
    listEl.appendChild(statsBar);

    // Trashed document cards
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

        // Restore button
        card.querySelector('[data-restore-id]').addEventListener('click', async () => {
            await restoreDocument(doc.id);
            showToast(t('skriv.trashRestored'), { duration: 2000 });
            renderTrashView(container, onOpenDocument);
        });

        // Permanent delete button
        card.querySelector('[data-permadelete-id]').addEventListener('click', async () => {
            const confirmed = await showInPageConfirm(
                t('skriv.trashDeletePermanentlyConfirmTitle'),
                t('skriv.trashDeletePermanentlyConfirmMessage', { title }),
                t('skriv.trashDeletePermanentlyConfirmYes'),
                t('common.cancel')
            );
            if (confirmed) {
                await permanentlyDelete(doc.id);
                renderTrashView(container, onOpenDocument);
            }
        });

        listEl.appendChild(card);
    });
}

/**
 * Format a date string as relative time (e.g. "2 timer siden", "i går").
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

/**
 * Get the SVG icon for the current theme.
 */
function getThemeIconSVG() {
    const theme = getTheme();
    if (theme === 'dark') {
        // Moon icon
        return '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>';
    }
    if (theme === 'light') {
        // Sun icon
        return '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>';
    }
    // System (monitor) icon
    return '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>';
}
