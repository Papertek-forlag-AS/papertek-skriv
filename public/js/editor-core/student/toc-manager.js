/**
 * Table of Contents (TOC) Manager.
 * Auto-generates a TOC block from H1/H2 headings in the editor.
 *
 * The TOC block is contenteditable="false" and lives at the top of the editor.
 * It updates automatically on editor input (debounced).
 *
 * Usage:
 *   const toc = initTOC(editor);
 *   toc.insert();    // Insert TOC block
 *   toc.remove();    // Remove TOC block
 *   toc.update();    // Force update
 *   toc.destroy();   // Cleanup listeners
 *   toc.hasTOC();    // Check if TOC exists
 */

import { t } from '../shared/i18n.js';

/**
 * @param {HTMLElement} editor - The contenteditable editor element
 * @returns {Object} TOC API
 */
export function initTOC(editor) {
    let debounceTimer = null;

    function getTocElement() {
        return editor.querySelector('.skriv-toc');
    }

    function hasTOC() {
        return !!getTocElement();
    }

    /**
     * Insert a TOC block at the top of the editor.
     */
    function insert() {
        if (hasTOC()) return;

        const tocEl = document.createElement('div');
        tocEl.className = 'skriv-toc';
        tocEl.contentEditable = 'false';

        // Insert at the very top of the editor
        if (editor.firstChild) {
            editor.insertBefore(tocEl, editor.firstChild);
        } else {
            editor.appendChild(tocEl);
        }

        // Ensure there's a paragraph after the TOC for cursor placement
        const next = tocEl.nextSibling;
        if (!next || (next.nodeType === Node.ELEMENT_NODE && next.classList.contains('skriv-references'))) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            tocEl.after(p);
        }

        update();
    }

    /**
     * Remove the TOC block from the editor.
     */
    function remove() {
        const tocEl = getTocElement();
        if (tocEl) tocEl.remove();
    }

    /**
     * Update TOC contents based on current headings.
     */
    function update() {
        const tocEl = getTocElement();
        if (!tocEl) return;

        const headings = [];
        // Walk only direct children and their subtree, skipping TOC, references, and frame blocks
        for (const child of editor.children) {
            if (child.classList.contains('skriv-toc')) continue;
            if (child.classList.contains('skriv-references')) continue;
            if (child.classList.contains('skriv-frame-section')) continue;
            if (child.classList.contains('skriv-frame-subsection')) continue;
            const tag = child.tagName?.toUpperCase();
            if (tag === 'H1' || tag === 'H2') {
                headings.push(child);
            }
        }

        // Assign IDs to headings
        headings.forEach((h, i) => {
            h.id = `heading-${i}`;
        });

        // Build TOC content
        tocEl.innerHTML = '';

        const title = document.createElement('p');
        title.className = 'toc-title';
        title.textContent = t('skriv.tocTitle');
        tocEl.appendChild(title);

        if (headings.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'toc-empty';
            empty.textContent = t('skriv.tocEmpty');
            tocEl.appendChild(empty);
            return;
        }

        let h1Count = 0;
        let h2Count = 0;

        headings.forEach(h => {
            const tag = h.tagName.toUpperCase();
            const entry = document.createElement('p');

            if (tag === 'H1') {
                h1Count++;
                h2Count = 0;
                entry.className = 'toc-entry toc-h1';
                entry.textContent = `${h1Count}. ${h.textContent}`;
            } else {
                h2Count++;
                entry.className = 'toc-entry toc-h2';
                entry.textContent = `${h1Count}.${h2Count} ${h.textContent}`;
            }

            entry.dataset.target = h.id;

            // Click to scroll to heading
            entry.addEventListener('click', () => {
                const target = document.getElementById(h.id);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }
            });

            tocEl.appendChild(entry);
        });
    }

    /**
     * Debounced update — call on editor input.
     */
    function scheduleUpdate() {
        if (!hasTOC()) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(update, 500);
    }

    // Listen for editor changes
    editor.addEventListener('input', scheduleUpdate);

    function destroy() {
        editor.removeEventListener('input', scheduleUpdate);
        if (debounceTimer) clearTimeout(debounceTimer);
    }

    return { insert, remove, update, destroy, hasTOC };
}
