/**
 * In-editor search functionality (Find in Document).
 * Highlights all matches using the CSS Custom Highlight API (if supported),
 * and selects the current active match.
 */

import { t } from '../shared/i18n.js';

export function initFindReplace(editor, container) {
    let query = '';
    let matches = [];
    let currentIndex = -1;

    // We'll use CSS Highlight API to highlight all matches without modifying DOM.
    // If not supported, we degrade gracefully to only selecting the current match.
    const supportsHighlight = 'highlights' in CSS;

    function clearSearch() {
        query = '';
        matches = [];
        currentIndex = -1;
        if (supportsHighlight) {
            CSS.highlights.delete('search-matches');
            CSS.highlights.delete('search-active');
        }
        // Deselect if we were selecting a search match
        const sel = window.getSelection();
        if (sel.rangeCount > 0 && container.contains(sel.anchorNode)) {
            sel.removeAllRanges();
        }
    }

    function executeSearch(newQuery) {
        clearSearch();
        if (!newQuery.trim()) return { count: 0, current: 0 };
        
        query = newQuery.toLowerCase();
        
        // Find all text nodes in the editor
        const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null, false);
        let node;
        
        while ((node = walker.nextNode())) {
            const text = node.textContent.toLowerCase();
            let startIndex = 0;
            let index;
            
            while ((index = text.indexOf(query, startIndex)) !== -1) {
                const range = document.createRange();
                range.setStart(node, index);
                range.setEnd(node, index + query.length);
                matches.push(range);
                startIndex = index + query.length;
            }
        }

        if (matches.length > 0) {
            currentIndex = 0;
            updateHighlights();
            selectCurrentMatch();
        }

        return { count: matches.length, current: currentIndex + 1 };
    }

    function nextMatch() {
        if (matches.length === 0) return { count: 0, current: 0 };
        currentIndex = (currentIndex + 1) % matches.length;
        updateHighlights();
        selectCurrentMatch();
        return { count: matches.length, current: currentIndex + 1 };
    }

    function prevMatch() {
        if (matches.length === 0) return { count: 0, current: 0 };
        currentIndex = (currentIndex - 1 + matches.length) % matches.length;
        updateHighlights();
        selectCurrentMatch();
        return { count: matches.length, current: currentIndex + 1 };
    }

    function updateHighlights() {
        if (!supportsHighlight) return;
        
        const allMatchesHighlight = new Highlight();
        const activeMatchHighlight = new Highlight();

        matches.forEach((range, idx) => {
            if (idx === currentIndex) {
                activeMatchHighlight.add(range);
            } else {
                allMatchesHighlight.add(range);
            }
        });

        CSS.highlights.set('search-matches', allMatchesHighlight);
        CSS.highlights.set('search-active', activeMatchHighlight);
    }

    function selectCurrentMatch() {
        if (currentIndex < 0 || currentIndex >= matches.length) return;
        const range = matches[currentIndex];
        
        // Scroll into view
        const span = document.createElement('span');
        range.insertNode(span);
        span.scrollIntoView({ block: 'center', behavior: 'smooth' });
        span.parentNode.removeChild(span);

        // Natively select it so user sees it clearly if highlights aren't supported
        // or just to allow immediate typing to replace.
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }

    return {
        search: executeSearch,
        next: nextMatch,
        prev: prevMatch,
        clear: clearSearch
    };
}
