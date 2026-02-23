/**
 * Document tag system for organizing documents.
 * Renders tag filter chips and provides tag editing UI.
 */

import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';

/** Color map for tags (deterministic based on tag name) */
const TAG_COLORS = [
    { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', bgActive: 'bg-emerald-100' },
    { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', bgActive: 'bg-blue-100' },
    { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', bgActive: 'bg-amber-100' },
    { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', bgActive: 'bg-violet-100' },
    { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200', bgActive: 'bg-rose-100' },
    { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200', bgActive: 'bg-cyan-100' },
];

function getTagColor(tag) {
    let hash = 0;
    for (let i = 0; i < tag.length; i++) {
        hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    }
    return TAG_COLORS[Math.abs(hash) % TAG_COLORS.length];
}

/**
 * Collect all unique tags from a list of documents.
 * @param {Array} docs - Array of document objects
 * @returns {string[]} Sorted unique tags
 */
export function collectTags(docs) {
    const tagSet = new Set();
    for (const doc of docs) {
        if (doc.tags && Array.isArray(doc.tags)) {
            doc.tags.forEach(tag => tagSet.add(tag));
        }
    }
    return [...tagSet].sort((a, b) => a.localeCompare(b));
}

/**
 * Create a tag filter bar.
 * @param {HTMLElement} container - Element to append the tag bar into
 * @param {string[]} allTags - All available tags
 * @param {Function} onTagSelect - Called with selected tag (string) or null for "all"
 * @returns {{ destroy: Function, getSelectedTag: Function }}
 */
export function createTagFilter(container, allTags, onTagSelect) {
    if (allTags.length === 0) return { destroy: () => {}, getSelectedTag: () => null };

    let selectedTag = null;

    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-wrap gap-1.5 mb-4';

    function render() {
        wrapper.innerHTML = '';

        // "All" chip
        const allChip = document.createElement('button');
        const isAllActive = selectedTag === null;
        allChip.className = `text-xs px-2.5 py-1 rounded-full border transition-colors ${
            isAllActive
                ? 'bg-stone-800 text-white border-stone-800'
                : 'bg-white text-stone-500 border-stone-200 hover:border-stone-300'
        }`;
        allChip.textContent = t('tags.all');
        allChip.addEventListener('click', () => {
            selectedTag = null;
            render();
            onTagSelect(null);
        });
        wrapper.appendChild(allChip);

        // Tag chips
        allTags.forEach(tag => {
            const color = getTagColor(tag);
            const isActive = selectedTag === tag;
            const chip = document.createElement('button');
            chip.className = `text-xs px-2.5 py-1 rounded-full border transition-colors ${
                isActive
                    ? `${color.bgActive} ${color.text} ${color.border} font-medium`
                    : `${color.bg} ${color.text} ${color.border} hover:${color.bgActive}`
            }`;
            chip.textContent = tag;
            chip.addEventListener('click', () => {
                selectedTag = isActive ? null : tag;
                render();
                onTagSelect(selectedTag);
            });
            wrapper.appendChild(chip);
        });
    }

    render();
    container.appendChild(wrapper);

    return {
        destroy: () => wrapper.remove(),
        getSelectedTag: () => selectedTag,
    };
}

/**
 * Filter documents by a selected tag.
 * @param {Array} docs - Array of document objects
 * @param {string|null} tag - Tag to filter by, or null for all
 * @returns {Array} Filtered documents
 */
export function filterByTag(docs, tag) {
    if (!tag) return docs;
    return docs.filter(doc => doc.tags && doc.tags.includes(tag));
}

/**
 * Render a small inline tag editor for a document.
 * Shows current tags as chips with remove buttons, plus an add input.
 * @param {HTMLElement} container - Element to render into
 * @param {string[]} currentTags - Current tags on the document
 * @param {Function} onChange - Called with updated tags array
 * @returns {{ destroy: Function, getTags: Function }}
 */
export function createTagEditor(container, currentTags = [], onChange) {
    let tags = [...currentTags];

    const wrapper = document.createElement('div');
    wrapper.className = 'flex flex-wrap items-center gap-1.5 mt-1';

    function render() {
        wrapper.innerHTML = '';

        // Existing tag chips
        tags.forEach(tag => {
            const color = getTagColor(tag);
            const chip = document.createElement('span');
            chip.className = `inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${color.bg} ${color.text} ${color.border} border`;
            chip.innerHTML = `
                ${escapeHtml(tag)}
                <button class="hover:opacity-70 transition-opacity" title="${t('tags.removeTag')}">
                    <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            `;
            chip.querySelector('button').addEventListener('click', (e) => {
                e.stopPropagation();
                tags = tags.filter(t => t !== tag);
                render();
                onChange(tags);
            });
            wrapper.appendChild(chip);
        });

        // Add tag input
        const addBtn = document.createElement('button');
        addBtn.className = 'text-xs px-2 py-0.5 rounded-full border border-dashed border-stone-300 text-stone-400 hover:text-stone-600 hover:border-stone-400 transition-colors';
        addBtn.textContent = `+ ${t('tags.addTag')}`;
        addBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showAddInput();
        });
        wrapper.appendChild(addBtn);
    }

    function showAddInput() {
        // Replace add button with input
        const existingAddBtn = wrapper.querySelector('button:last-child');
        if (existingAddBtn) existingAddBtn.remove();

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'text-xs px-2 py-0.5 rounded-full border border-stone-300 outline-none focus:border-emerald-400 w-24';
        input.placeholder = t('tags.addTag');
        input.maxLength = 20;

        function commitTag() {
            const value = input.value.trim();
            if (value && !tags.includes(value)) {
                tags.push(value);
                onChange(tags);
            }
            render();
        }

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                commitTag();
            } else if (e.key === 'Escape') {
                render();
            }
        });

        input.addEventListener('blur', commitTag);

        wrapper.appendChild(input);
        input.focus();
    }

    render();
    container.appendChild(wrapper);

    return {
        destroy: () => wrapper.remove(),
        getTags: () => [...tags],
    };
}
