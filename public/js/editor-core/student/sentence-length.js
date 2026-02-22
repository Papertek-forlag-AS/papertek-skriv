/**
 * Sentence Length Visualization — shows writing rhythm.
 *
 * Two visual components:
 *   1. Inline highlights: long sentences (20+ words) → soft blue,
 *      very long (30+ words) → stronger blue with underline.
 *   2. Rhythm bar: compact bar chart below editor showing each
 *      sentence as a vertical bar, color-coded by length.
 *
 * Helps students vary sentence length for better prose rhythm.
 * No AI, no suggestions — just visual feedback.
 *
 * Usage:
 *   import { initSentenceLength } from './sentence-length.js';
 *   const { destroy, toggle, isActive, analyze } = initSentenceLength(editor, container);
 */

import { t } from '../shared/i18n.js';
import { isFrameElement, isImageBlock } from '../shared/frame-elements.js';

const LONG_THRESHOLD = 20;       // words — soft blue highlight
const VERY_LONG_THRESHOLD = 30;  // words — strong blue highlight
const DEBOUNCE_MS = 800;
const LONG_CLASS = 'skriv-sentence-long';
const VERY_LONG_CLASS = 'skriv-sentence-very-long';

// Bar colors matching the plan thresholds
const BAR_COLORS = {
    short:    '#059669', // emerald-600
    medium:   '#a8a29e', // stone-400
    long:     '#f59e0b', // amber-500
    veryLong: '#ef4444', // red-500
};

/**
 * Count words in a string.
 * @param {string} text
 * @returns {number}
 */
function countWordsInText(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
}

/**
 * Classify sentence length.
 * @param {number} wordCount
 * @returns {'short'|'medium'|'long'|'veryLong'}
 */
function classify(wordCount) {
    if (wordCount >= VERY_LONG_THRESHOLD) return 'veryLong';
    if (wordCount >= LONG_THRESHOLD) return 'long';
    if (wordCount >= 10) return 'medium';
    return 'short';
}

/**
 * Initialize the Sentence Length Visualization.
 * @param {HTMLElement} editor - contenteditable element
 * @param {HTMLElement} container - parent wrapping the editor (writing-env)
 * @returns {{ destroy, toggle, isActive, analyze }}
 */
export function initSentenceLength(editor, container) {
    let active = false;
    let debounceTimer = null;
    let highlights = [];
    let rhythmBarEl = null;

    // --- Create rhythm bar DOM ---
    rhythmBarEl = document.createElement('div');
    rhythmBarEl.className = 'skriv-rhythm-bar hidden';
    rhythmBarEl.innerHTML = `
        <div class="skriv-rhythm-inner"></div>
        <div class="skriv-rhythm-avg"></div>
    `;
    // Insert before word count bar (last child of writing-env)
    const wordCountBar = container.querySelector('.border-t.border-stone-200.bg-stone-50');
    if (wordCountBar) {
        wordCountBar.parentNode.insertBefore(rhythmBarEl, wordCountBar);
    } else {
        container.appendChild(rhythmBarEl);
    }

    const rhythmInner = rhythmBarEl.querySelector('.skriv-rhythm-inner');
    const rhythmAvg = rhythmBarEl.querySelector('.skriv-rhythm-avg');

    /**
     * Walk block-level elements in the editor (p, h1, h2, li, div)
     * and extract sentences from each, tracking their DOM ranges.
     *
     * Returns array of { text, wordCount, category, nodes }
     * where nodes is an array of { node, start, end } for DOM highlighting.
     */
    function extractSentences() {
        const sentences = [];
        const blocks = editor.querySelectorAll('p, h1, h2, li, div:not([class])');

        for (const block of blocks) {
            // Skip frame scaffold, non-editable blocks, and image blocks
            if (isFrameElement(block)) continue;
            if (isImageBlock(block)) continue;
            if (block.closest('.skriv-toc, .skriv-references, .skriv-frame-section, .skriv-frame-subsection, .skriv-image-block')) continue;

            // Collect text nodes in this block
            const textNodes = [];
            const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    if (isFrameElement(node.parentElement)) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                },
            });
            while (walker.nextNode()) textNodes.push(walker.currentNode);
            if (textNodes.length === 0) continue;

            // Build a combined text with a map back to text nodes + offsets
            const charMap = []; // charMap[i] = { node, offset } for combined text char i
            let combined = '';
            for (const node of textNodes) {
                const text = node.textContent;
                for (let i = 0; i < text.length; i++) {
                    charMap.push({ node, offset: i });
                }
                combined += text;
            }

            if (!combined.trim()) continue;

            // Split combined text into sentences on . ! ? followed by space or end
            // Also treat the end of the block as a sentence boundary
            const sentenceBoundaries = [];
            const re = /[.!?]+[\s\u00A0]+|[.!?]+$/g;
            let match;
            let lastEnd = 0;

            while ((match = re.exec(combined)) !== null) {
                const sentenceEnd = match.index + match[0].length;
                sentenceBoundaries.push({ start: lastEnd, end: sentenceEnd });
                lastEnd = sentenceEnd;
            }

            // Remaining text after last boundary (if no terminal punctuation)
            if (lastEnd < combined.length) {
                const remaining = combined.slice(lastEnd).trim();
                if (remaining.length > 0) {
                    sentenceBoundaries.push({ start: lastEnd, end: combined.length });
                }
            }

            // If no boundaries found, treat entire block as one sentence
            if (sentenceBoundaries.length === 0 && combined.trim()) {
                sentenceBoundaries.push({ start: 0, end: combined.length });
            }

            for (const { start, end } of sentenceBoundaries) {
                const text = combined.slice(start, end).trim();
                if (!text) continue;

                const wordCount = countWordsInText(text);
                if (wordCount === 0) continue;

                // Map back to DOM nodes for highlighting
                const nodes = [];
                let currentNode = null;
                let currentStart = -1;

                for (let i = start; i < end; i++) {
                    const cm = charMap[i];
                    if (!cm) continue;

                    if (cm.node !== currentNode) {
                        // Save previous span
                        if (currentNode && currentStart >= 0) {
                            nodes.push({ node: currentNode, start: currentStart, end: charMap[i - 1].offset + 1 });
                        }
                        currentNode = cm.node;
                        currentStart = cm.offset;
                    }
                }
                // Save last span
                if (currentNode && currentStart >= 0) {
                    const lastCharIdx = end - 1;
                    const lastCm = charMap[lastCharIdx];
                    if (lastCm) {
                        nodes.push({ node: currentNode, start: currentStart, end: lastCm.offset + 1 });
                    }
                }

                const category = classify(wordCount);
                sentences.push({ text, wordCount, category, nodes });
            }
        }

        return sentences;
    }

    /**
     * Remove all highlight marks from the editor.
     */
    function clearHighlights() {
        highlights.forEach(mark => {
            const parent = mark.parentNode;
            if (parent) {
                const text = document.createTextNode(mark.textContent);
                parent.replaceChild(text, mark);
                parent.normalize();
            }
        });
        highlights = [];
    }

    /**
     * Apply inline highlights to long/very-long sentences.
     */
    function applyHighlights() {
        if (!active) return;

        // Save caret
        const sel = window.getSelection();
        let savedRange = null;
        if (sel && sel.rangeCount > 0) {
            savedRange = sel.getRangeAt(0).cloneRange();
        }

        clearHighlights();

        const sentences = extractSentences();

        // Highlight long and very-long sentences
        // Process in reverse document order to keep offsets stable
        const toHighlight = sentences.filter(s => s.category === 'long' || s.category === 'veryLong');

        for (const sentence of toHighlight) {
            const cssClass = sentence.category === 'veryLong' ? VERY_LONG_CLASS : LONG_CLASS;
            const tooltipKey = sentence.category === 'veryLong' ? 'sentence.tooltipVeryLong' : 'sentence.tooltipLong';

            // Wrap each node span in a <mark>
            // Process spans in reverse order to maintain offsets
            for (let i = sentence.nodes.length - 1; i >= 0; i--) {
                const { node, start, end } = sentence.nodes[i];
                if (!node.parentNode) continue; // node may have been detached

                const text = node.textContent;
                const before = text.slice(0, start);
                const target = text.slice(start, end);
                const after = text.slice(end);

                if (!target.trim()) continue;

                const frag = document.createDocumentFragment();

                if (before) frag.appendChild(document.createTextNode(before));

                const mark = document.createElement('mark');
                mark.className = cssClass;
                mark.textContent = target;
                mark.title = t(tooltipKey, { count: sentence.wordCount });
                frag.appendChild(mark);
                highlights.push(mark);

                if (after) frag.appendChild(document.createTextNode(after));

                node.parentNode.replaceChild(frag, node);
            }
        }

        // Build rhythm bar
        buildRhythmBar(sentences);

        // Restore caret
        if (savedRange) {
            try {
                sel.removeAllRanges();
                sel.addRange(savedRange);
            } catch (e) {
                editor.focus();
            }
        }
    }

    /**
     * Build the rhythm bar visualization.
     * @param {{ wordCount: number, category: string }[]} sentences
     */
    function buildRhythmBar(sentences) {
        rhythmInner.innerHTML = '';
        rhythmAvg.textContent = '';

        if (sentences.length === 0) return;

        const maxWords = Math.max(...sentences.map(s => s.wordCount), 1);
        const totalWords = sentences.reduce((sum, s) => sum + s.wordCount, 0);
        const avg = (totalWords / sentences.length).toFixed(1);

        for (const s of sentences) {
            const bar = document.createElement('div');
            bar.className = 'bar';
            const heightPct = Math.max(4, (s.wordCount / maxWords) * 100);
            bar.style.height = `${heightPct}%`;
            bar.style.background = BAR_COLORS[s.category];
            bar.title = `${s.wordCount} ${t('wordCounter.count', { count: s.wordCount }).split(' ').pop()}`;
            rhythmInner.appendChild(bar);
        }

        rhythmAvg.textContent = t('sentence.avgLength', { avg });
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
     * Toggle visualization on/off.
     * @returns {boolean} New active state
     */
    function toggle() {
        active = !active;
        if (active) {
            applyHighlights();
            rhythmBarEl.classList.remove('hidden');
            editor.addEventListener('input', handleInput);
        } else {
            editor.removeEventListener('input', handleInput);
            clearHighlights();
            rhythmBarEl.classList.add('hidden');
            if (debounceTimer) clearTimeout(debounceTimer);
        }
        return active;
    }

    /**
     * Force a fresh analysis.
     */
    function analyze() {
        if (active) applyHighlights();
    }

    /**
     * Clean up everything.
     */
    function destroy() {
        active = false;
        editor.removeEventListener('input', handleInput);
        clearHighlights();
        if (debounceTimer) clearTimeout(debounceTimer);
        if (rhythmBarEl?.parentNode) rhythmBarEl.remove();
    }

    return { destroy, toggle, isActive: () => active, analyze };
}
