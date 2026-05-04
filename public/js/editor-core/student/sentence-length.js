/**
 * Sentence Length Visualization — shows writing rhythm.
 *
 * Two visual components:
 *   1. Inline highlights: long sentences (20+ words) → soft blue,
 *      very long (30+ words) → stronger blue with underline.
 *   2. Rhythm bar: compact bar chart below editor showing each
 *      sentence as a vertical bar, color-coded by length.
 *      Bars are proportional to word count (capped at 40 words).
 *      Grouped by paragraph with gaps. Includes rhythm score.
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
const MAX_BAR_WORDS = 40;        // cap bar height at this word count

// Updated bar colors
const BAR_COLORS = {
    short:    '#6ee7b7', // green-300
    medium:   '#a8a29e', // stone-400 — neutral "good" range
    long:     '#fbbf24', // amber-400
    veryLong: '#f87171', // red-400
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
    if (wordCount >= 8) return 'medium';
    return 'short';
}

/**
 * Calculate rhythm score based on variation in sentence lengths.
 * @param {number[]} lengths
 * @returns {'good'|'ok'|'low'|null}
 */
function calculateRhythmScore(lengths) {
    if (lengths.length < 3) return null; // not enough data
    const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    if (mean === 0) return null;
    const variance = lengths.reduce((a, b) => a + (b - mean) ** 2, 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    const cv = stdDev / mean; // coefficient of variation
    // cv > 0.4 = good variation, cv < 0.2 = monotonous
    if (cv > 0.4) return 'good';
    if (cv > 0.25) return 'ok';
    return 'low';
}

/**
 * Inject rhythm bar styles (once per page).
 */
let stylesInjected = false;
function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const style = document.createElement('style');
    style.textContent = `
        .skriv-rhythm-bar {
            position: relative;
        }
        .skriv-rhythm-inner {
            display: flex;
            align-items: flex-end;
            gap: 0;
            height: 48px;
            position: relative;
            padding: 0 4px;
        }
        .skriv-rhythm-inner .target-zone {
            position: absolute;
            left: 0;
            right: 0;
            background: rgba(110, 231, 183, 0.10);
            border-top: 1px dashed rgba(110, 231, 183, 0.4);
            border-bottom: 1px dashed rgba(110, 231, 183, 0.4);
            pointer-events: none;
            z-index: 0;
        }
        .skriv-rhythm-inner .paragraph-group {
            display: flex;
            align-items: flex-end;
            gap: 1px;
            flex-shrink: 0;
        }
        .skriv-rhythm-inner .paragraph-gap {
            width: 6px;
            flex-shrink: 0;
        }
        .skriv-rhythm-inner .bar {
            width: 5px;
            min-width: 3px;
            border-radius: 2px 2px 0 0;
            transition: height 0.3s ease;
            position: relative;
            z-index: 1;
            cursor: default;
        }
        .skriv-rhythm-score {
            font-size: 12px;
            padding: 2px 8px 4px;
            color: #78716c;
        }
        .skriv-rhythm-score.good { color: #059669; }
        .skriv-rhythm-score.low { color: #d97706; }
        .skriv-rhythm-tooltip {
            position: fixed;
            background: #1c1917;
            color: #fafaf9;
            font-size: 12px;
            padding: 4px 8px;
            border-radius: 4px;
            pointer-events: none;
            z-index: 9999;
            max-width: 280px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
            opacity: 0;
            transition: opacity 0.15s ease;
        }
        .skriv-rhythm-tooltip.visible {
            opacity: 1;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Initialize the Sentence Length Visualization.
 * @param {HTMLElement} editor - contenteditable element
 * @param {HTMLElement} container - parent wrapping the editor (writing-env)
 * @returns {{ destroy, toggle, isActive, analyze }}
 */
export function initSentenceLength(editor, container) {
    injectStyles();

    let active = false;
    let debounceTimer = null;
    let highlights = [];
    let rhythmBarEl = null;
    let tooltipEl = null;
    let currentBars = []; // track existing bars for smooth transitions

    // --- Create rhythm bar DOM ---
    rhythmBarEl = document.createElement('div');
    rhythmBarEl.className = 'skriv-rhythm-bar hidden';
    rhythmBarEl.innerHTML = `
        <div class="skriv-rhythm-inner"></div>
        <div class="skriv-rhythm-score"></div>
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
    const rhythmScore = rhythmBarEl.querySelector('.skriv-rhythm-score');
    const rhythmAvg = rhythmBarEl.querySelector('.skriv-rhythm-avg');

    // --- Create tooltip element ---
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'skriv-rhythm-tooltip';
    document.body.appendChild(tooltipEl);

    /**
     * Walk block-level elements in the editor (p, h1, h2, li, div)
     * and extract sentences from each, tracking their DOM ranges.
     *
     * Returns array of { text, wordCount, category, nodes, paragraphIdx }
     * where nodes is an array of { node, start, end } for DOM highlighting.
     */
    function extractSentences() {
        const sentences = [];
        const blocks = editor.querySelectorAll('p, h1, h2, li, div:not([class])');
        let paragraphIdx = 0;

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
            if (textNodes.length === 0) { paragraphIdx++; continue; }

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

            if (!combined.trim()) { paragraphIdx++; continue; }

            // Split combined text into sentences on . ! ? followed by space or end
            // Also treat the end of the block as a sentence boundary
            const sentenceBoundaries = [];
            const re = /[.!?]+[\s ]+|[.!?]+$/g;
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
                sentences.push({ text, wordCount, category, nodes, paragraphIdx });
            }

            paragraphIdx++;
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
     * Show tooltip near a bar.
     * @param {HTMLElement} bar
     * @param {string} text
     * @param {number} wordCount
     */
    function showTooltip(bar, text, wordCount) {
        const truncated = text.length > 50 ? text.slice(0, 50) + '...' : text;
        tooltipEl.textContent = `${truncated} (${wordCount} ord)`;
        const rect = bar.getBoundingClientRect();
        tooltipEl.style.left = `${rect.left}px`;
        tooltipEl.style.top = `${rect.top - 28}px`;
        tooltipEl.classList.add('visible');
    }

    function hideTooltip() {
        tooltipEl.classList.remove('visible');
    }

    /**
     * Build the rhythm bar visualization with paragraph grouping,
     * proportional bars, target zone, and smooth transitions.
     * @param {{ text: string, wordCount: number, category: string, paragraphIdx: number }[]} sentences
     */
    function buildRhythmBar(sentences) {
        rhythmAvg.textContent = '';
        rhythmScore.textContent = '';
        rhythmScore.className = 'skriv-rhythm-score';

        if (sentences.length === 0) {
            rhythmInner.innerHTML = '';
            currentBars = [];
            return;
        }

        const totalWords = sentences.reduce((sum, s) => sum + s.wordCount, 0);
        const avg = (totalWords / sentences.length).toFixed(1);

        // Group sentences by paragraph
        const groups = [];
        let currentGroup = [];
        let currentParagraph = sentences[0].paragraphIdx;

        for (const s of sentences) {
            if (s.paragraphIdx !== currentParagraph) {
                if (currentGroup.length > 0) groups.push(currentGroup);
                currentGroup = [];
                currentParagraph = s.paragraphIdx;
            }
            currentGroup.push(s);
        }
        if (currentGroup.length > 0) groups.push(currentGroup);

        // Target zone: 10-20 words out of MAX_BAR_WORDS cap
        const targetBottom = (10 / MAX_BAR_WORDS) * 100;
        const targetTop = (20 / MAX_BAR_WORDS) * 100;

        // Check if we can reuse existing DOM (same sentence count and paragraph structure)
        const flatSentences = groups.flat();
        const canReuse = currentBars.length === flatSentences.length;

        if (canReuse) {
            // Update existing bars with transitions
            flatSentences.forEach((s, i) => {
                const bar = currentBars[i];
                const heightPct = Math.max(8, Math.min(100, (s.wordCount / MAX_BAR_WORDS) * 100));
                bar.style.height = `${heightPct}%`;
                bar.style.background = BAR_COLORS[s.category];
                // Update event data
                bar._sentenceData = s;
            });
        } else {
            // Rebuild DOM
            rhythmInner.innerHTML = '';
            currentBars = [];

            // Add target zone background
            const targetZone = document.createElement('div');
            targetZone.className = 'target-zone';
            targetZone.style.bottom = `${targetBottom}%`;
            targetZone.style.height = `${targetTop - targetBottom}%`;
            rhythmInner.appendChild(targetZone);

            for (let g = 0; g < groups.length; g++) {
                if (g > 0) {
                    const gap = document.createElement('div');
                    gap.className = 'paragraph-gap';
                    rhythmInner.appendChild(gap);
                }

                const groupEl = document.createElement('div');
                groupEl.className = 'paragraph-group';

                for (const s of groups[g]) {
                    const bar = document.createElement('div');
                    bar.className = 'bar';
                    const heightPct = Math.max(8, Math.min(100, (s.wordCount / MAX_BAR_WORDS) * 100));
                    bar.style.height = `${heightPct}%`;
                    bar.style.background = BAR_COLORS[s.category];
                    bar._sentenceData = s;

                    bar.addEventListener('mouseenter', () => showTooltip(bar, s.text, s.wordCount));
                    bar.addEventListener('mouseleave', hideTooltip);

                    groupEl.appendChild(bar);
                    currentBars.push(bar);
                }

                rhythmInner.appendChild(groupEl);
            }
        }

        // Rhythm score
        const lengths = sentences.map(s => s.wordCount);
        const score = calculateRhythmScore(lengths);
        if (score === 'good') {
            rhythmScore.textContent = 'Variasjon: God ✓';
            rhythmScore.classList.add('good');
        } else if (score === 'ok') {
            rhythmScore.textContent = 'Variasjon: OK';
        } else if (score === 'low') {
            rhythmScore.textContent = 'Variasjon: Lav — prøv å variere setningslengden';
            rhythmScore.classList.add('low');
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
        if (tooltipEl?.parentNode) tooltipEl.remove();
    }

    return { destroy, toggle, isActive: () => active, analyze };
}
