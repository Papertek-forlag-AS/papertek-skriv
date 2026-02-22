/**
 * Reference Manager for Skriv.
 * Handles inline citation markers [1], [2] and auto-generated bibliography.
 *
 * References are stored as an array in the document's metadata (IndexedDB).
 * Inline markers are <span class="skriv-ref" data-ref-id="ref-xxx" contenteditable="false">[1]</span>
 * The bibliography block is <div class="skriv-references" contenteditable="false">...</div>
 *
 * Usage:
 *   const refs = initReferences(editor, { onSave });
 *   refs.openDialog();         // Open add-reference dialog
 *   refs.loadReferences(arr);  // Load saved references
 *   refs.getReferences();      // Get references array for saving
 *   refs.destroy();            // Cleanup
 */

import { t } from '../shared/i18n.js';
import { showInPageConfirm } from '../shared/in-page-modal.js';
import { getModalParent } from '../shared/in-page-modal.js';

/**
 * @param {HTMLElement} editor - The contenteditable editor element
 * @param {Object} opts
 * @param {Function} opts.onSave - Called when references change (for auto-save trigger)
 * @returns {Object} References API
 */
export function initReferences(editor, { onSave } = {}) {
    let references = []; // Array of { id, author, year, title, url, publisher, type }
    let debounceTimer = null;

    function generateRefId() {
        return 'ref-' + (crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 6));
    }

    // --- Bibliography block management ---

    function getRefListElement() {
        return editor.querySelector('.skriv-references');
    }

    function ensureRefList() {
        let refList = getRefListElement();
        if (!refList) {
            refList = document.createElement('div');
            refList.className = 'skriv-references';
            refList.contentEditable = 'false';
            editor.appendChild(refList);

            // Ensure there's a paragraph before the reference list for cursor
            const prev = refList.previousSibling;
            if (!prev || (prev.nodeType === Node.ELEMENT_NODE && prev.classList.contains('skriv-toc'))) {
                const p = document.createElement('p');
                p.innerHTML = '<br>';
                editor.insertBefore(p, refList);
            }
        }
        return refList;
    }

    function removeRefListIfEmpty() {
        if (references.length === 0) {
            const refList = getRefListElement();
            if (refList) refList.remove();
        }
    }

    /**
     * Format a reference in simplified APA style.
     */
    function formatReference(ref) {
        const parts = [];
        if (ref.author) parts.push(ref.author);
        if (ref.year) parts.push(`(${ref.year}).`);
        else if (parts.length) parts[parts.length - 1] += '.';

        if (ref.title) {
            if (ref.type === 'book') {
                parts.push(`<i>${escapeHtml(ref.title)}</i>.`);
            } else {
                parts.push(`${escapeHtml(ref.title)}.`);
            }
        }

        if (ref.publisher) parts.push(`${escapeHtml(ref.publisher)}.`);
        if (ref.url) parts.push(escapeHtml(ref.url));

        return parts.join(' ');
    }

    /**
     * Scan editor for inline ref markers and build ordered list.
     * Returns array of ref IDs in document order.
     */
    function getRefOrderFromDOM() {
        const markers = editor.querySelectorAll('.skriv-ref');
        const seen = new Set();
        const ordered = [];
        markers.forEach(marker => {
            const refId = marker.dataset.refId;
            if (refId && !seen.has(refId)) {
                seen.add(refId);
                ordered.push(refId);
            }
        });
        return ordered;
    }

    /**
     * Renumber all inline markers based on document order.
     */
    function renumberMarkers() {
        const order = getRefOrderFromDOM();
        const numberMap = {};
        order.forEach((refId, i) => { numberMap[refId] = i + 1; });

        // Update inline markers
        editor.querySelectorAll('.skriv-ref').forEach(marker => {
            const refId = marker.dataset.refId;
            const num = numberMap[refId];
            if (num) marker.textContent = `[${num}]`;
        });

        return { order, numberMap };
    }

    /**
     * Rebuild the bibliography block.
     */
    function updateRefList() {
        const { order, numberMap } = renumberMarkers();

        if (order.length === 0) {
            removeRefListIfEmpty();
            return;
        }

        const refList = ensureRefList();
        refList.innerHTML = '';

        const title = document.createElement('p');
        title.className = 'ref-title';
        title.textContent = t('skriv.refTitle');
        refList.appendChild(title);

        // Render in document order
        order.forEach(refId => {
            const ref = references.find(r => r.id === refId);
            if (!ref) return;

            const num = numberMap[refId];
            const entry = document.createElement('p');
            entry.className = 'ref-entry';
            entry.dataset.refId = refId;
            entry.innerHTML = `[${num}] ${formatReference(ref)}`;

            // Click to edit
            entry.addEventListener('click', () => openEditDialog(refId));

            refList.appendChild(entry);
        });

        // Also add any refs that exist in the array but not in the document (orphaned)
        // — these are refs the user created but hasn't placed yet
        const inDoc = new Set(order);
        references.forEach(ref => {
            if (inDoc.has(ref.id)) return;
            const num = references.indexOf(ref) + order.length + 1;
            const entry = document.createElement('p');
            entry.className = 'ref-entry ref-entry-orphan';
            entry.dataset.refId = ref.id;
            entry.innerHTML = `[?] ${formatReference(ref)}`;
            entry.addEventListener('click', () => openEditDialog(ref.id));
            refList.appendChild(entry);
        });

        // Make sure ref list is at the end of the editor
        if (refList.nextSibling) {
            editor.appendChild(refList);
        }
    }

    /**
     * Insert an inline reference marker at the current cursor position.
     */
    function insertMarker(refId) {
        editor.focus();

        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        const range = sel.getRangeAt(0);
        if (!editor.contains(range.commonAncestorContainer)) return;

        // Don't insert inside TOC or ref list
        const container = range.startContainer.nodeType === Node.TEXT_NODE
            ? range.startContainer.parentElement
            : range.startContainer;
        if (container.closest('.skriv-toc') || container.closest('.skriv-references') || container.closest('.skriv-frame-section') || container.closest('.skriv-frame-subsection')) return;

        const marker = document.createElement('span');
        marker.className = 'skriv-ref';
        marker.dataset.refId = refId;
        marker.contentEditable = 'false';
        marker.textContent = '[?]'; // Will be renumbered

        // Click on marker to edit the reference
        marker.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openEditDialog(refId);
        });

        range.deleteContents();
        range.insertNode(marker);

        // Move cursor after the marker
        const afterRange = document.createRange();
        afterRange.setStartAfter(marker);
        afterRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(afterRange);

        updateRefList();
        if (onSave) onSave();
    }

    // --- Reference dialog ---

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeAttr(str) {
        return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    /**
     * Open the add-reference dialog.
     */
    function openDialog() {
        showRefDialog(null);
    }

    /**
     * Open the edit-reference dialog.
     */
    function openEditDialog(refId) {
        const ref = references.find(r => r.id === refId);
        if (!ref) return;
        showRefDialog(ref);
    }

    function showRefDialog(existingRef) {
        // Clean up any existing dialog
        document.querySelectorAll('[data-ref-dialog]').forEach(el => el.remove());

        const isEdit = !!existingRef;
        const ref = existingRef || { id: '', author: '', year: '', title: '', url: '', publisher: '', type: 'web' };

        const overlay = document.createElement('div');
        overlay.setAttribute('data-ref-dialog', '');
        overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4';
        overlay.style.zIndex = '9999';

        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                <h3 class="text-lg font-bold text-stone-900 mb-4">${escapeHtml(isEdit ? t('skriv.refDialogEdit') : t('skriv.refDialogTitle'))}</h3>

                <div class="space-y-3">
                    <div>
                        <label class="block text-xs font-medium text-stone-500 mb-1">Type</label>
                        <div class="flex gap-2" data-ref-type-group>
                            <button type="button" data-ref-type="book" class="ref-type-btn px-3 py-1.5 rounded-lg text-sm border transition-colors ${ref.type === 'book' ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}">${t('skriv.refTypeBook')}</button>
                            <button type="button" data-ref-type="web" class="ref-type-btn px-3 py-1.5 rounded-lg text-sm border transition-colors ${ref.type === 'web' ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}">${t('skriv.refTypeWeb')}</button>
                            <button type="button" data-ref-type="article" class="ref-type-btn px-3 py-1.5 rounded-lg text-sm border transition-colors ${ref.type === 'article' ? 'bg-emerald-100 border-emerald-400 text-emerald-800' : 'border-stone-200 text-stone-600 hover:bg-stone-50'}">${t('skriv.refTypeArticle')}</button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-stone-500 mb-1">${escapeHtml(t('skriv.refAuthor'))}</label>
                        <input data-ref-author type="text" value="${escapeAttr(ref.author)}" placeholder="Etternavn, F."
                            class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-stone-500 mb-1">${escapeHtml(t('skriv.refYear'))}</label>
                        <input data-ref-year type="text" value="${escapeAttr(ref.year)}" placeholder="2024"
                            class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-stone-500 mb-1">${escapeHtml(t('skriv.refSourceTitle'))}</label>
                        <input data-ref-title type="text" value="${escapeAttr(ref.title)}" placeholder=""
                            class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-stone-500 mb-1">${escapeHtml(t('skriv.refUrl'))}</label>
                        <input data-ref-url type="url" value="${escapeAttr(ref.url)}" placeholder="https://..."
                            class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                    </div>
                    <div>
                        <label class="block text-xs font-medium text-stone-500 mb-1">${escapeHtml(t('skriv.refPublisher'))}</label>
                        <input data-ref-publisher type="text" value="${escapeAttr(ref.publisher)}" placeholder=""
                            class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500" />
                    </div>
                </div>

                <div class="flex gap-3 justify-between mt-6">
                    <div>
                        ${isEdit ? `<button data-ref-delete class="px-3 py-2 rounded-lg text-sm font-semibold text-red-600 hover:bg-red-50 transition-colors">${escapeHtml(t('skriv.refDelete'))}</button>` : ''}
                    </div>
                    <div class="flex gap-3">
                        <button data-ref-cancel class="px-4 py-2 rounded-lg text-sm font-semibold bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors">
                            ${escapeHtml(t('common.cancel'))}
                        </button>
                        <button data-ref-save class="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                            ${escapeHtml(isEdit ? t('skriv.refUpdate') : t('skriv.refAdd'))}
                        </button>
                    </div>
                </div>
            </div>
        `;

        getModalParent().appendChild(overlay);

        let selectedType = ref.type || 'web';

        // Type toggle buttons
        overlay.querySelectorAll('[data-ref-type]').forEach(btn => {
            btn.addEventListener('click', () => {
                selectedType = btn.dataset.refType;
                overlay.querySelectorAll('.ref-type-btn').forEach(b => {
                    b.className = b.className
                        .replace(/bg-emerald-100|border-emerald-400|text-emerald-800/g, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                    b.classList.add('border-stone-200', 'text-stone-600', 'hover:bg-stone-50');
                });
                btn.classList.remove('border-stone-200', 'text-stone-600', 'hover:bg-stone-50');
                btn.classList.add('bg-emerald-100', 'border-emerald-400', 'text-emerald-800');
            });
        });

        // Cancel
        overlay.querySelector('[data-ref-cancel]').addEventListener('click', () => {
            overlay.remove();
            editor.focus();
        });

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                editor.focus();
            }
        });

        // Save/Add
        overlay.querySelector('[data-ref-save]').addEventListener('click', () => {
            const author = overlay.querySelector('[data-ref-author]').value.trim();
            const year = overlay.querySelector('[data-ref-year]').value.trim();
            const title = overlay.querySelector('[data-ref-title]').value.trim();
            const url = overlay.querySelector('[data-ref-url]').value.trim();
            const publisher = overlay.querySelector('[data-ref-publisher]').value.trim();

            if (!author && !title) {
                // Need at least author or title
                overlay.querySelector('[data-ref-author]').focus();
                return;
            }

            if (isEdit) {
                // Update existing
                existingRef.author = author;
                existingRef.year = year;
                existingRef.title = title;
                existingRef.url = url;
                existingRef.publisher = publisher;
                existingRef.type = selectedType;
                updateRefList();
            } else {
                // Create new
                const newRef = {
                    id: generateRefId(),
                    author,
                    year,
                    title,
                    url,
                    publisher,
                    type: selectedType,
                };
                references.push(newRef);
                overlay.remove();
                insertMarker(newRef.id);
                return;
            }

            overlay.remove();
            if (onSave) onSave();
            editor.focus();
        });

        // Delete (edit mode only)
        const deleteBtn = overlay.querySelector('[data-ref-delete]');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', async () => {
                const confirmed = await showInPageConfirm(
                    t('skriv.refDelete'),
                    t('skriv.refDeleteConfirm'),
                    t('common.confirm'),
                    t('common.cancel')
                );
                if (!confirmed) return;

                // Remove from array
                references = references.filter(r => r.id !== existingRef.id);

                // Remove all inline markers for this ref
                editor.querySelectorAll(`.skriv-ref[data-ref-id="${existingRef.id}"]`).forEach(m => m.remove());

                overlay.remove();
                updateRefList();
                if (onSave) onSave();
                editor.focus();
            });
        }

        // Focus first field
        overlay.querySelector('[data-ref-author]').focus();
    }

    // --- Re-attach click handlers to existing markers after load ---

    function reattachMarkerListeners() {
        editor.querySelectorAll('.skriv-ref').forEach(marker => {
            const refId = marker.dataset.refId;
            marker.contentEditable = 'false';
            marker.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                openEditDialog(refId);
            });
        });
    }

    // --- Handle deletion of markers via backspace/delete ---

    function onInput() {
        // Check if any markers were removed from DOM
        const markerIds = new Set();
        editor.querySelectorAll('.skriv-ref').forEach(m => markerIds.add(m.dataset.refId));

        // Only update ref list if it exists
        if (getRefListElement()) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                // Clean orphaned refs that have no markers
                const orphaned = references.filter(r => !markerIds.has(r.id));
                if (orphaned.length > 0) {
                    // Remove refs with no markers in the document
                    references = references.filter(r => markerIds.has(r.id));
                }
                updateRefList();
            }, 500);
        }
    }

    editor.addEventListener('input', onInput);

    // --- Delegated click handler for refs inside contenteditable="false" ---
    function onEditorClick(e) {
        // Check if clicked on an inline ref marker
        const marker = e.target.closest('.skriv-ref');
        if (marker) {
            e.preventDefault();
            e.stopPropagation();
            const refId = marker.dataset.refId;
            if (refId) openEditDialog(refId);
            return;
        }

        // Check if clicked on a ref entry in the bibliography
        const entry = e.target.closest('.ref-entry');
        if (entry) {
            e.preventDefault();
            e.stopPropagation();
            const refId = entry.dataset.refId;
            if (refId) openEditDialog(refId);
            return;
        }
    }

    editor.addEventListener('click', onEditorClick);

    // --- Public API ---

    function loadReferences(refs) {
        references = (refs || []).map(r => ({ ...r }));
        reattachMarkerListeners();
        if (references.length > 0) {
            updateRefList();
        }
    }

    function getReferences() {
        return references.map(r => ({ ...r }));
    }

    function destroy() {
        editor.removeEventListener('input', onInput);
        editor.removeEventListener('click', onEditorClick);
        if (debounceTimer) clearTimeout(debounceTimer);
        document.querySelectorAll('[data-ref-dialog]').forEach(el => el.remove());
    }

    return {
        openDialog,
        loadReferences,
        getReferences,
        updateRefList,
        destroy,
    };
}
