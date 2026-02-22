/**
 * Word Frequency Radar — highlights repeated content words in the editor.
 *
 * How it works:
 *   1. On debounced editor input, analyses the visible text
 *   2. Tokenizes → lowercases → stems → groups by stem
 *   3. Marks words that appear ≥ REPEAT_THRESHOLD times
 *   4. Highlights them with a soft background colour
 *   5. Clicking a highlighted word opens the synonym popup (if available)
 *
 * Norwegian stemming and stopword lists come from the spinner-data modules.
 * No API calls — works entirely offline.
 *
 * Usage:
 *   import { initWordFrequency } from './word-frequency.js';
 *   const { destroy, toggle, isActive } = initWordFrequency(editor, container, { onWordClick });
 */

import { t, getCurrentLanguage } from '../shared/i18n.js';
import { isFrameElement } from '../shared/frame-elements.js';

const REPEAT_THRESHOLD = 3;     // minimum occurrences to highlight
const DEBOUNCE_MS = 800;        // delay after last input
const HIGHLIGHT_CLASS = 'skriv-repeat-word';

/**
 * Load the word bank for the current language (same as writing-spinner).
 * @returns {Promise<{ stopwords: Set, stem: Function, synonyms: object }>}
 */
async function loadWordBank() {
    const lang = getCurrentLanguage();
    try {
        if (lang === 'nn') {
            return await import('./spinner-data-nn.js');
        }
        return await import('./spinner-data-nb.js');
    } catch (err) {
        console.error('Failed to load word bank for frequency analysis:', err);
        return { stopwords: new Set(), stem: (w) => w, synonyms: {} };
    }
}

/**
 * Walk text nodes inside the editor, skipping frame elements.
 * @param {HTMLElement} root
 * @returns {Text[]}
 */
function getTextNodes(root) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            // Skip text inside frame scaffolding (headers, placeholders)
            if (isFrameElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
            // Skip empty text nodes
            if (!node.textContent.trim()) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
        },
    });
    while (walker.nextNode()) nodes.push(walker.currentNode);
    return nodes;
}

/**
 * Tokenize a string into word-like tokens with their offsets.
 * @param {string} text
 * @returns {{ word: string, start: number, end: number }[]}
 */
function tokenize(text) {
    const re = /[\wæøåÆØÅ]+/g;
    const tokens = [];
    let m;
    while ((m = re.exec(text)) !== null) {
        tokens.push({ word: m[0], start: m.index, end: m.index + m[0].length });
    }
    return tokens;
}

/**
 * Initialize the Word Frequency Radar.
 * @param {HTMLElement} editor - contenteditable element
 * @param {HTMLElement} container - parent wrapping the editor
 * @param {object} [options]
 * @param {Function} [options.onWordClick] - Called with (word, range) when a highlighted word is clicked
 * @returns {{ destroy, toggle, isActive, analyze }}
 */
export function initWordFrequency(editor, container, options = {}) {
    let wordBank = null;
    let active = false;
    let debounceTimer = null;
    let highlights = [];  // Track highlight <mark> elements for cleanup

    const bankPromise = loadWordBank().then(bank => { wordBank = bank; });

    /**
     * Remove all existing highlight marks from the editor.
     */
    function clearHighlights() {
        highlights.forEach(mark => {
            const parent = mark.parentNode;
            if (parent) {
                // Replace the <mark> with its text content
                const text = document.createTextNode(mark.textContent);
                parent.replaceChild(text, mark);
                parent.normalize(); // merge adjacent text nodes
            }
        });
        highlights = [];
    }

    /**
     * Analyze text and return stem → { count, originalWords } map.
     * @returns {Map<string, { count: number, words: Set<string> }>}
     */
    function buildFrequencyMap() {
        if (!wordBank) return new Map();

        const { stopwords, stem } = wordBank;
        const freqMap = new Map(); // stem → { count, words }

        const textNodes = getTextNodes(editor);
        for (const node of textNodes) {
            const tokens = tokenize(node.textContent);
            for (const { word } of tokens) {
                const lower = word.toLowerCase();
                if (lower.length < 3) continue;
                if (stopwords.has(lower)) continue;

                const stemmed = stem(lower);
                if (!freqMap.has(stemmed)) {
                    freqMap.set(stemmed, { count: 0, words: new Set() });
                }
                const entry = freqMap.get(stemmed);
                entry.count++;
                entry.words.add(lower);
            }
        }
        return freqMap;
    }

    /**
     * Apply highlights to repeated words in the editor.
     */
    function applyHighlights() {
        if (!wordBank || !active) return;

        // Save caret position
        const sel = window.getSelection();
        let savedRange = null;
        if (sel && sel.rangeCount > 0) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }

        clearHighlights();

        const { stopwords, stem, synonyms } = wordBank;
        const freqMap = buildFrequencyMap();

        // Collect stems that exceed the threshold
        const repeatedStems = new Set();
        for (const [stemmed, { count }] of freqMap) {
            if (count >= REPEAT_THRESHOLD) {
                repeatedStems.add(stemmed);
            }
        }

        if (repeatedStems.size === 0) return;

        // Walk text nodes and wrap repeated words in <mark> elements
        const textNodes = getTextNodes(editor);
        for (const node of textNodes) {
            const tokens = tokenize(node.textContent);
            if (tokens.length === 0) continue;

            // Check if any token in this node needs highlighting
            const toHighlight = [];
            for (const tok of tokens) {
                const lower = tok.word.toLowerCase();
                if (lower.length < 3) continue;
                if (stopwords.has(lower)) continue;
                const stemmed = stem(lower);
                if (repeatedStems.has(stemmed)) {
                    const entry = freqMap.get(stemmed);
                    const hasSynonym = synonyms && synonyms[lower];
                    toHighlight.push({ ...tok, count: entry.count, hasSynonym });
                }
            }

            if (toHighlight.length === 0) continue;

            // Build highlighted version — work backwards to keep offsets stable
            const frag = document.createDocumentFragment();
            const text = node.textContent;
            let lastEnd = 0;

            for (const tok of toHighlight) {
                // Text before this token
                if (tok.start > lastEnd) {
                    frag.appendChild(document.createTextNode(text.slice(lastEnd, tok.start)));
                }
                // The highlighted token
                const mark = document.createElement('mark');
                mark.className = HIGHLIGHT_CLASS;
                mark.textContent = text.slice(tok.start, tok.end);
                mark.dataset.count = tok.count;
                mark.dataset.word = tok.word.toLowerCase();
                if (tok.hasSynonym) mark.dataset.hasSynonym = 'true';
                mark.title = t('radar.tooltip', { count: tok.count, word: tok.word });
                frag.appendChild(mark);
                highlights.push(mark);
                lastEnd = tok.end;
            }

            // Remaining text after last token
            if (lastEnd < text.length) {
                frag.appendChild(document.createTextNode(text.slice(lastEnd)));
            }

            // Replace the text node with the fragment
            node.parentNode.replaceChild(frag, node);
        }

        // Restore caret position (best effort — highlights change the DOM)
        if (savedRange) {
            try {
                sel.removeAllRanges();
                sel.addRange(savedRange);
            } catch (e) {
                // Caret restoration may fail after DOM changes — that's OK
                editor.focus();
            }
        }
    }

    /**
     * Handle clicks on highlighted words.
     */
    function handleClick(e) {
        const mark = e.target.closest(`.${HIGHLIGHT_CLASS}`);
        if (!mark) return;

        const word = mark.dataset.word;
        if (!word) return;

        // Create a range around the mark's text for replacement
        const range = document.createRange();
        range.selectNodeContents(mark);

        if (options.onWordClick) {
            options.onWordClick(word, range);
        }
    }

    /**
     * Debounced input handler.
     */
    function handleInput() {
        if (!active) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            applyHighlights();
        }, DEBOUNCE_MS);
    }

    /**
     * Toggle the radar on/off.
     * @returns {boolean} New active state
     */
    function toggle() {
        active = !active;
        if (active) {
            bankPromise.then(() => applyHighlights());
            editor.addEventListener('input', handleInput);
            editor.addEventListener('click', handleClick);
        } else {
            editor.removeEventListener('input', handleInput);
            editor.removeEventListener('click', handleClick);
            clearHighlights();
            if (debounceTimer) clearTimeout(debounceTimer);
        }
        return active;
    }

    /**
     * Force a fresh analysis (useful after undo/paste).
     */
    function analyze() {
        if (active) {
            bankPromise.then(() => applyHighlights());
        }
    }

    /**
     * Get frequency data without applying highlights (for UI display).
     * @returns {Promise<{ stem: string, count: number, words: string[] }[]>}
     */
    async function getFrequencyData() {
        await bankPromise;
        const freqMap = buildFrequencyMap();
        const result = [];
        for (const [stemmed, { count, words }] of freqMap) {
            if (count >= REPEAT_THRESHOLD) {
                result.push({ stem: stemmed, count, words: [...words] });
            }
        }
        return result.sort((a, b) => b.count - a.count);
    }

    function destroy() {
        active = false;
        editor.removeEventListener('input', handleInput);
        editor.removeEventListener('click', handleClick);
        clearHighlights();
        if (debounceTimer) clearTimeout(debounceTimer);
    }

    return { destroy, toggle, isActive: () => active, analyze, getFrequencyData };
}
