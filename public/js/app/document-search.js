/**
 * Document search bar for the document list.
 * Renders a search input that filters documents by title and plain text.
 * Supports Ctrl/Cmd+K keyboard shortcut to focus.
 */

import { t } from '../editor-core/shared/i18n.js';

/**
 * Create and mount a search bar.
 * @param {HTMLElement} container - Element to append the search bar into
 * @param {Function} onFilter - Called with the current search query string (debounced)
 * @returns {{ destroy: Function, clear: Function, getQuery: Function }}
 */
export function createSearchBar(container, onFilter) {
    let debounceTimer = null;

    const wrapper = document.createElement('div');
    wrapper.className = 'relative mb-4';
    wrapper.innerHTML = `
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input type="text"
            id="doc-search"
            placeholder="${t('search.placeholder')}"
            class="w-full pl-10 pr-10 py-2.5 text-sm border border-stone-200 rounded-lg bg-white text-stone-800 placeholder-stone-400 outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 transition-colors" />
        <button id="search-clear" class="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-stone-400 hover:text-stone-600 transition-colors hidden" title="${t('search.clear')}">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
        </button>
        <span class="absolute right-10 top-1/2 -translate-y-1/2 text-[10px] text-stone-300 pointer-events-none" id="search-hint">⌘K</span>
    `;

    container.appendChild(wrapper);

    const input = wrapper.querySelector('#doc-search');
    const clearBtn = wrapper.querySelector('#search-clear');
    const hint = wrapper.querySelector('#search-hint');

    function handleInput() {
        const query = input.value.trim();
        clearBtn.classList.toggle('hidden', query.length === 0);
        hint.classList.toggle('hidden', query.length > 0);

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            onFilter(query);
        }, 200);
    }

    function handleClear() {
        input.value = '';
        clearBtn.classList.add('hidden');
        hint.classList.remove('hidden');
        if (debounceTimer) clearTimeout(debounceTimer);
        onFilter('');
        input.focus();
    }

    function handleKeyboardShortcut(e) {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            input.focus();
            input.select();
        }
    }

    input.addEventListener('input', handleInput);
    clearBtn.addEventListener('click', handleClear);
    document.addEventListener('keydown', handleKeyboardShortcut);

    function destroy() {
        if (debounceTimer) clearTimeout(debounceTimer);
        input.removeEventListener('input', handleInput);
        clearBtn.removeEventListener('click', handleClear);
        document.removeEventListener('keydown', handleKeyboardShortcut);
        wrapper.remove();
    }

    return {
        destroy,
        clear: handleClear,
        getQuery: () => input.value.trim(),
    };
}

/**
 * Filter documents by a search query.
 * Matches against title and plainText (case-insensitive).
 * @param {Array} docs - Array of document objects
 * @param {string} query - Search query string
 * @returns {Array} Filtered documents
 */
export function filterDocuments(docs, query) {
    if (!query) return docs;
    const lower = query.toLowerCase();
    return docs.filter(doc => {
        const title = (doc.title || '').toLowerCase();
        const text = (doc.plainText || '').toLowerCase();
        return title.includes(lower) || text.includes(lower);
    });
}
