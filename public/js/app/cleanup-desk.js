/**
 * Pedagogical cleanup desk for documents that still need a title or folder.
 *
 * The desk is intentionally independent of search and folder filters: students
 * should always see the complete cleanup task for the selected school year.
 */

import { getDocument } from './document-store.js';
import { setDocFolders, isPersonalFolder } from './folder-store.js';
import { createFolderPicker } from './folder-picker.js';
import { trashDocument, getRetentionDays } from './trash-store.js';
import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml, escapeAttr } from '../editor-core/shared/html-escape.js';
import { showInPageConfirm } from '../editor-core/shared/in-page-modal.js';
import { showToast } from '../editor-core/shared/toast-notification.js';
import { announce } from '../editor-core/shared/aria-live.js';

const TITLE_REASON = 'title';
const FOLDER_REASON = 'folder';

/**
 * Return the cleanup work that remains for a document.
 * @param {Object} doc
 * @returns {Array<'title'|'folder'>}
 */
export function getCleanupReasons(doc) {
    const reasons = [];
    if (!String(doc?.title || '').trim()) reasons.push(TITLE_REASON);
    if (!Array.isArray(doc?.folderIds) || doc.folderIds.length === 0) reasons.push(FOLDER_REASON);
    return reasons;
}

/**
 * Return every document that needs cleanup in the selected school year.
 * @param {Object[]} docs
 * @param {string} schoolYear
 */
export function getCleanupDocuments(docs = [], schoolYear) {
    return docs.filter(doc => doc.schoolYear === schoolYear && getCleanupReasons(doc).length > 0);
}

/**
 * Create the responsive cleanup desk.
 * @param {Object} options
 * @param {(id: string, openOptions?: {focusTitle?: boolean}) => void} options.onOpenDocument
 * @param {(change: {type: 'folders'|'trash', doc: Object}) => (void|Promise<void>)} options.onDocumentChanged
 * @param {(active: boolean) => void} [options.onDragStateChange]
 * @returns {{desktopElement: HTMLElement, compactElement: HTMLElement, update: Function, destroy: Function}}
 */
export function initCleanupDesk({ onOpenDocument, onDocumentChanged, onDragStateChange = () => {} }) {
    const desktopElement = document.createElement('aside');
    desktopElement.className = 'skriv-cleanup-desk hidden lg:flex lg:flex-col w-60 flex-shrink-0 border-r border-amber-200/70 dark:border-amber-900/70 bg-amber-50/35 dark:bg-amber-950/20 overflow-y-auto';
    desktopElement.setAttribute('aria-label', t('sidebar.cleanupDesk'));

    const compactElement = document.createElement('section');
    compactElement.className = 'skriv-cleanup-compact lg:hidden mb-5';
    compactElement.setAttribute('aria-label', t('sidebar.cleanupDesk'));

    let currentDocs = [];
    let currentFolders = [];
    let pickerApis = [];
    let compactOpen = true;
    let actionInProgress = false;
    let destroyed = false;

    function destroyPickers() {
        pickerApis.forEach(api => api.destroy?.());
        pickerApis = [];
    }

    function issueText(reason) {
        return reason === TITLE_REASON
            ? t('sidebar.cleanupNeedsTitle')
            : t('sidebar.cleanupNeedsFolder');
    }

    function setControlsBusy(busy) {
        for (const surface of [desktopElement, compactElement]) {
            surface.setAttribute('aria-busy', String(busy));
            surface.querySelectorAll('button, input').forEach(control => {
                control.disabled = busy;
            });
        }
    }

    async function runAction(operation) {
        if (destroyed || actionInProgress) return;
        actionInProgress = true;
        setControlsBusy(true);
        try {
            return await operation();
        } catch (error) {
            console.error('Cleanup desk action failed:', error);
            if (!destroyed) {
                const message = t('sidebar.cleanupActionError');
                showToast(message);
                announce(message);
            }
        } finally {
            actionInProgress = false;
            if (!destroyed) setControlsBusy(false);
        }
    }

    async function notifyChanged(change, previousId) {
        await onDocumentChanged(change);
        if (destroyed) return;
        requestAnimationFrame(() => {
            const visibleSurface = desktopElement.offsetParent === null ? compactElement : desktopElement;
            const nextCard = [...visibleSurface.querySelectorAll('[data-cleanup-doc-id]')]
                .find(card => card.getAttribute('data-cleanup-doc-id') !== previousId);
            const nextAction = nextCard?.querySelector('[data-cleanup-primary]')
                || visibleSurface.querySelector('[data-cleanup-primary], [data-cleanup-complete]');
            nextAction?.focus();
        });
    }

    async function updateFolders(doc, folderIds) {
        return runAction(async () => {
            await setDocFolders(doc.id, folderIds);
            if (destroyed) return;
            doc.folderIds = folderIds;

            const addedFolder = currentFolders.find(folder => folderIds.includes(folder.id));
            const folderLabel = addedFolder && isPersonalFolder(addedFolder)
                ? t('sidebar.personalFolder')
                : addedFolder?.name;
            const message = folderLabel
                ? t('sidebar.movedToFolder', { folder: folderLabel })
                : t('sidebar.cleanupFolderUpdated');
            showToast(message, { duration: 1800 });
            announce(message);
            await notifyChanged({ type: 'folders', doc }, doc.id);
        });
    }

    async function moveToTrash(doc) {
        return runAction(async () => {
            const title = String(doc.title || '').trim() || t('skriv.untitled');
            const days = getRetentionDays();
            const confirmed = await showInPageConfirm(
                t('skriv.deleteConfirmTitle'),
                t('skriv.deleteConfirmMessageTrash', { title, days, count: days }),
                t('skriv.deleteConfirmYesTrash'),
                t('common.cancel')
            );
            if (!confirmed || destroyed) return;

            const fullDoc = await getDocument(doc.id);
            if (!fullDoc || destroyed) return;
            await trashDocument(fullDoc);
            if (destroyed) return;

            const message = t('sidebar.cleanupMovedToTrash', { title });
            showToast(message);
            announce(message);
            await notifyChanged({ type: 'trash', doc }, doc.id);
        });
    }

    function createCompletionState(compact = false) {
        const panel = document.createElement('div');
        panel.className = compact
            ? 'flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 px-4 py-3'
            : 'flex flex-col items-center justify-center min-h-48 h-full p-5 text-center';
        panel.tabIndex = -1;
        panel.setAttribute('data-cleanup-complete', '');
        panel.innerHTML = `
            <div class="${compact ? 'w-9 h-9' : 'w-12 h-12 mb-3'} flex-shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center">
                <svg class="${compact ? 'w-5 h-5' : 'w-6 h-6'} text-emerald-600 dark:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"/>
                </svg>
            </div>
            <div>
                <p class="text-sm font-semibold text-emerald-700 dark:text-emerald-300">${escapeHtml(t('sidebar.allOrganized'))}</p>
                <p class="text-xs text-emerald-700/70 dark:text-emerald-300/70 ${compact ? 'mt-0.5' : 'mt-1'}">${escapeHtml(t('sidebar.allOrganizedHint'))}</p>
            </div>
        `;
        return panel;
    }

    function createHeader(compact = false) {
        const wrapper = document.createElement('div');
        wrapper.className = compact ? '' : 'sticky top-0 z-10 bg-amber-50/95 dark:bg-stone-900/95 backdrop-blur-sm px-3 pt-4 pb-3';
        wrapper.innerHTML = `
            <div class="flex items-start gap-2">
                <div class="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 flex items-center justify-center flex-shrink-0" aria-hidden="true">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 19.5A2.5 2.5 0 016.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
                </div>
                <div class="min-w-0">
                    <h2 class="text-sm font-bold text-amber-900 dark:text-amber-100">${escapeHtml(t('sidebar.cleanupDesk'))}</h2>
                    <p class="text-xs text-amber-800/70 dark:text-amber-200/70 mt-0.5">${escapeHtml(t('sidebar.cleanupCount', { count: currentDocs.length }))}</p>
                </div>
            </div>
            ${compact ? '' : `<p class="text-xs leading-relaxed text-stone-500 dark:text-stone-400 mt-2">${escapeHtml(t('sidebar.cleanupDeskHint'))}</p>`}
        `;
        return wrapper;
    }

    function bindDrag(card, doc, title) {
        card.addEventListener('dragstart', event => {
            event.dataTransfer.setData('text/plain', doc.id);
            event.dataTransfer.effectAllowed = 'move';
            card.classList.add('opacity-50');
            onDragStateChange(true);

            const ghost = document.createElement('div');
            ghost.className = 'px-3 py-1.5 bg-emerald-600 text-white text-xs rounded-full shadow-lg whitespace-nowrap';
            ghost.style.position = 'fixed';
            ghost.style.top = '-100px';
            ghost.textContent = title.length > 30 ? `${title.substring(0, 30)}\u2026` : title;
            document.body.appendChild(ghost);
            event.dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, ghost.offsetHeight / 2);
            requestAnimationFrame(() => ghost.remove());
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('opacity-50');
            onDragStateChange(false);
        });
    }

    function createCard(doc, compact = false, position = 1) {
        const reasons = getCleanupReasons(doc);
        const title = String(doc.title || '').trim() || t('skriv.untitled');
        const needsTitle = reasons.includes(TITLE_REASON);
        const openLabel = needsTitle
            ? t('sidebar.cleanupOpenAndName', { position })
            : t('sidebar.cleanupOpenDocument', { title });
        const card = document.createElement('article');
        card.className = compact
            ? 'bg-white dark:bg-stone-800 border border-amber-200 dark:border-amber-800 border-l-4 border-l-amber-400 rounded-xl p-3'
            : 'bg-white dark:bg-stone-800 border border-amber-200 dark:border-amber-800 border-l-[3px] border-l-amber-400 rounded-xl p-3 shadow-sm';
        card.setAttribute('role', 'listitem');
        card.setAttribute('draggable', 'true');
        card.setAttribute('data-cleanup-doc-id', doc.id);

        card.innerHTML = `
            <button type="button" data-cleanup-primary class="w-full min-h-11 text-left rounded-lg -m-1 p-1 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-stone-800" aria-label="${escapeAttr(openLabel)}">
                <span class="block text-sm font-semibold text-stone-800 dark:text-stone-100 truncate">${escapeHtml(title)}</span>
                <span class="block text-[11px] text-stone-400 dark:text-stone-500 mt-0.5">${escapeHtml(t('wordCounter.count', { count: doc.wordCount || 0 }))}</span>
            </button>
            <div class="flex flex-wrap gap-1 mt-2" aria-label="${escapeAttr(t('sidebar.cleanupRemaining'))}">
                ${reasons.map(reason => `<span class="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 px-2 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-200">${escapeHtml(issueText(reason))}</span>`).join('')}
            </div>
            <div class="flex items-center gap-1 mt-3">
                ${reasons.includes(FOLDER_REASON) ? `<button type="button" data-cleanup-folder class="min-h-11 flex-1 px-2 py-2 text-xs font-semibold rounded-lg border border-dashed border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 focus:outline-none focus:ring-2 focus:ring-emerald-500">${escapeHtml(t('sidebar.chooseFolder'))}</button>` : ''}
                <button type="button" data-cleanup-trash class="min-w-11 min-h-11 p-2 rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 focus:outline-none focus:ring-2 focus:ring-red-500" aria-label="${escapeAttr(t('sidebar.cleanupDeleteDocument', { title }))}" title="${escapeAttr(t('skriv.trashMoveToTrash'))}">
                    <svg class="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            </div>
        `;

        card.querySelector('[data-cleanup-primary]').addEventListener('click', () => {
            onOpenDocument(doc.id, { focusTitle: needsTitle });
        });
        card.querySelector('[data-cleanup-trash]').addEventListener('click', () => moveToTrash(doc));

        const folderButton = card.querySelector('[data-cleanup-folder]');
        if (folderButton) {
            pickerApis.push(createFolderPicker(folderButton, doc.folderIds || [], folderIds => updateFolders(doc, folderIds)));
        }

        bindDrag(card, doc, title);
        return card;
    }

    function createTrashDropZone() {
        const zone = document.createElement('div');
        zone.className = 'mx-3 mt-1 mb-3 min-h-16 px-3 py-2 flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 dark:border-stone-700 text-stone-400 dark:text-stone-500 transition-colors';
        zone.innerHTML = `
            <svg class="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3"/></svg>
            <span class="text-[11px] leading-tight">${escapeHtml(t('sidebar.cleanupTrashHint'))}</span>
        `;
        zone.addEventListener('dragover', event => {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            zone.classList.add('border-red-400', 'text-red-600', 'bg-red-50', 'dark:bg-red-950/30');
        });
        zone.addEventListener('dragleave', () => {
            zone.classList.remove('border-red-400', 'text-red-600', 'bg-red-50', 'dark:bg-red-950/30');
        });
        zone.addEventListener('drop', event => {
            event.preventDefault();
            zone.classList.remove('border-red-400', 'text-red-600', 'bg-red-50', 'dark:bg-red-950/30');
            const doc = currentDocs.find(item => item.id === event.dataTransfer.getData('text/plain'));
            if (doc) moveToTrash(doc);
        });
        return zone;
    }

    function renderDesktop() {
        desktopElement.innerHTML = '';
        if (currentDocs.length === 0) {
            desktopElement.appendChild(createCompletionState());
            return;
        }

        desktopElement.appendChild(createHeader());
        desktopElement.appendChild(createTrashDropZone());
        const list = document.createElement('div');
        list.className = 'px-3 pb-4 space-y-2';
        list.setAttribute('role', 'list');
        list.setAttribute('aria-label', t('sidebar.cleanupDocuments'));
        currentDocs.forEach((doc, index) => list.appendChild(createCard(doc, false, index + 1)));
        desktopElement.appendChild(list);
    }

    function renderCompact() {
        compactElement.innerHTML = '';
        if (currentDocs.length === 0) {
            compactElement.appendChild(createCompletionState(true));
            return;
        }

        const details = document.createElement('details');
        details.open = compactOpen;
        details.className = 'rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/20 overflow-visible';
        details.addEventListener('toggle', () => { compactOpen = details.open; });

        const summary = document.createElement('summary');
        summary.className = 'cursor-pointer list-none min-h-12 px-3 py-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-500';
        summary.appendChild(createHeader(true));
        details.appendChild(summary);

        const content = document.createElement('div');
        content.className = 'border-t border-amber-200 dark:border-amber-800 p-3';
        const hint = document.createElement('p');
        hint.className = 'text-xs leading-relaxed text-stone-500 dark:text-stone-400 mb-3';
        hint.textContent = t('sidebar.cleanupDeskHint');
        content.appendChild(hint);

        const list = document.createElement('div');
        list.className = 'space-y-2';
        list.setAttribute('role', 'list');
        list.setAttribute('aria-label', t('sidebar.cleanupDocuments'));
        currentDocs.forEach((doc, index) => list.appendChild(createCard(doc, true, index + 1)));
        content.appendChild(list);
        details.appendChild(content);
        compactElement.appendChild(details);
    }

    function update(docs, folders = []) {
        if (destroyed) return;
        destroyPickers();
        currentDocs = docs || [];
        currentFolders = folders || [];
        renderDesktop();
        renderCompact();
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        destroyPickers();
        onDragStateChange(false);
        desktopElement.remove();
        compactElement.remove();
    }

    update([], []);
    return { desktopElement, compactElement, update, destroy };
}
