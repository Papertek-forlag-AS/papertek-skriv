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
                <h1 class="text-2xl font-bold text-stone-900">${t('skriv.appName')}</h1>
                <p class="text-sm text-stone-500 mt-1">${t('skriv.tagline')}</p>
            </div>
            <div class="flex items-center gap-2">
                <button id="btn-trash" class="relative px-3 py-2.5 text-stone-400 hover:text-stone-600 rounded-lg text-sm transition-colors" title="${t('skriv.trashButton')}">
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
        <div class="border-t border-stone-200 py-4 flex items-center justify-between text-xs text-stone-400">
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

    // Trash button
    header.querySelector('#btn-trash').addEventListener('click', () => {
        renderTrashView(container, onOpenDocument);
    });

    // Load and render documents
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

    // Stats bar
    const totalWords = docs.reduce((sum, d) => sum + (d.wordCount || 0), 0);
    const statsBar = document.createElement('div');
    statsBar.className = 'text-xs text-stone-400 mb-4 flex gap-4';
    statsBar.innerHTML = `
        <span>${t('skriv.documentsCount', { count: docs.length })}</span>
        <span>${t('skriv.wordsWritten', { count: totalWords })}</span>
    `;
    listEl.appendChild(statsBar);

    // Document cards
    docs.forEach(doc => {
        const card = document.createElement('div');
        card.className = 'group bg-white border border-stone-200 rounded-xl p-4 mb-3 hover:border-stone-300 hover:shadow-sm transition-all cursor-pointer';

        const title = doc.title || t('skriv.untitled');
        const wordCount = doc.wordCount || 0;
        const updatedAt = doc.updatedAt ? formatRelativeTime(doc.updatedAt) : '';
        const preview = doc.plainText ? doc.plainText.substring(0, 120).trim() : '';

        card.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-stone-900 truncate">${escapeHtml(title)}</h3>
                    ${preview ? `<p class="text-sm text-stone-500 mt-1 line-clamp-2">${escapeHtml(preview)}...</p>` : ''}
                    <div class="flex items-center gap-3 mt-2 text-xs text-stone-400">
                        <span>${wordCount} ${t('wordCounter.count', { count: wordCount }).split(' ').pop()}</span>
                        <span>${updatedAt}</span>
                    </div>
                </div>
                <button data-delete-id="${doc.id}" class="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-stone-400 hover:text-red-500 hover:bg-red-50 transition-all" title="${t('skriv.trashMoveToTrash')}">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        `;

        // Open on card click (but not delete button)
        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-delete-id]')) return;
            onOpenDocument(doc.id);
        });

        // Delete button — now soft-deletes to trash
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

        listEl.appendChild(card);
    });

    // Append footer at the bottom
    container.appendChild(footer);
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
                <h1 class="text-2xl font-bold text-stone-900">${t('skriv.trashButton')}</h1>
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
        card.className = 'bg-white border border-stone-200 rounded-xl p-4 mb-3 opacity-75';

        const title = doc.title || t('skriv.untitled');
        const wordCount = doc.wordCount || 0;
        const trashedAt = doc.trashedAt ? formatRelativeTime(doc.trashedAt) : '';
        const daysLeft = doc.expiresAt ? Math.max(0, Math.ceil((new Date(doc.expiresAt) - new Date()) / 86400000)) : '?';

        card.innerHTML = `
            <div class="flex items-start justify-between gap-3">
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold text-stone-600 truncate">${escapeHtml(title)}</h3>
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
