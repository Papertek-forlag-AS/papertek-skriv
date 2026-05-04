/**
 * LIX Readability Score Module
 * Calculates and displays the LIX (Lasbarhetsindex) score for Norwegian text.
 * LIX = (words/sentences) + (long words * 100 / words)
 * Long word = more than 6 characters.
 */

import { t } from '../shared/i18n.js';

const DEBOUNCE_MS = 1000;
const LONG_WORD_THRESHOLD = 6;
const MIN_WORDS_FOR_SCORE = 20;
const LIX_SCALE_MAX = 70;

const CSS = `
.skriv-lix-widget {
    padding: 0.5rem 1rem;
    border-top: 1px solid #e7e5e4;
    background: #fafaf9;
    font-size: 0.8rem;
}
.skriv-lix-widget.hidden { display: none; }
.lix-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.375rem;
}
.lix-title {
    font-weight: 500;
    color: #44403c;
    font-size: 0.75rem;
}
.lix-gauge { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
.lix-gauge-bar {
    flex: 1;
    height: 8px;
    background: #e7e5e4;
    border-radius: 4px;
    position: relative;
    overflow: hidden;
}
.lix-gauge-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.5s ease, background 0.3s;
}
.lix-gauge-marker {
    position: absolute;
    top: -2px;
    width: 3px;
    height: 12px;
    background: #1c1917;
    border-radius: 1px;
    transition: left 0.5s ease;
}
.lix-score-number {
    font-weight: 700;
    font-size: 1.1rem;
    color: #1c1917;
    min-width: 28px;
    text-align: center;
}
.lix-label {
    font-weight: 500;
    font-size: 0.75rem;
    margin-bottom: 0.25rem;
}
.lix-level-hint {
    font-size: 0.7rem;
    color: #dc2626;
    margin-bottom: 0.25rem;
}
.lix-details {
    display: flex;
    gap: 1rem;
    font-size: 0.7rem;
    color: #78716c;
}
.lix-hint {
    color: #a8a29e;
    font-size: 0.75rem;
}
@media (prefers-color-scheme: dark) {
    .skriv-lix-widget { background: #1c1917; border-color: #44403c; }
    .lix-title { color: #d6d3d1; }
    .lix-score-number { color: #e7e5e4; }
    .lix-gauge-bar { background: #44403c; }
    .lix-gauge-marker { background: #e7e5e4; }
    .lix-details { color: #a8a29e; }
}
`;

/**
 * Calculate LIX score from a text string.
 * @param {string} text - Plain text to analyze
 * @returns {object|null} Score breakdown or null if text is too short
 */
export function calculateLix(text) {
    // Tokenize into sentences (split on . ! ? followed by space or end)
    const sentences = text.split(/[.!?]+(?:\s+|$)/g).filter(s => s.trim().length > 0);
    const sentenceCount = sentences.length;
    if (sentenceCount === 0) return null;

    // Tokenize into words (keep only tokens that contain at least one letter)
    const words = text.split(/\s+/).filter(w => /[a-zA-ZæøåÆØÅ]/.test(w));
    const wordCount = words.length;
    if (wordCount === 0) return null;

    // Count long words (> 6 letter-characters)
    const longWords = words.filter(w => {
        const clean = w.replace(/[^a-zA-ZæøåÆØÅ]/g, '');
        return clean.length > LONG_WORD_THRESHOLD;
    });

    const avgSentenceLength = wordCount / sentenceCount;
    const longWordPct = (longWords.length / wordCount) * 100;
    const lix = avgSentenceLength + longWordPct;

    return {
        lix: Math.round(lix),
        wordCount,
        sentenceCount,
        avgSentenceLength: Number(avgSentenceLength.toFixed(1)),
        longWordCount: longWords.length,
        longWordPct: Number(longWordPct.toFixed(1)),
    };
}

/**
 * Get the LIX category label key and display color.
 * @param {number} lix - LIX score
 * @returns {{ key: string, color: string }}
 */
export function getLixCategory(lix) {
    if (lix < 25) return { key: 'veryEasy', color: '#6ee7b7' };
    if (lix < 35) return { key: 'easy', color: '#86efac' };
    if (lix < 45) return { key: 'medium', color: '#fbbf24' };
    if (lix < 55) return { key: 'difficult', color: '#fb923c' };
    return { key: 'veryDifficult', color: '#f87171' };
}

/**
 * Check whether a LIX score is appropriate for the given school level.
 * @param {number} lix - LIX score
 * @param {string} level - 'barneskole', 'ungdomsskole', 'vg1', 'vg2', 'vg3'
 * @returns {boolean}
 */
export function isAppropriateForLevel(lix, level) {
    if (level === 'ungdomsskole' || level === 'barneskole') {
        return lix >= 25 && lix <= 40;
    }
    // VGS levels
    return lix >= 35 && lix <= 50;
}

/**
 * Initialise the LIX score widget.
 * @param {HTMLElement} editor - The contenteditable editor element
 * @param {HTMLElement} container - Parent container to attach the widget to
 * @param {object} [options] - Configuration
 * @param {function} [options.getLevel] - Returns current school level string
 * @returns {{ destroy: function, toggle: function, isActive: function }}
 */
export function initLixScore(editor, container, options = {}) {
    let active = false;
    let widget = null;
    let debounceTimer = null;

    // Inject scoped styles
    const styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    /**
     * Extract plain text from the editor, excluding frame UI elements.
     */
    function getEditorText() {
        const clone = editor.cloneNode(true);
        // Remove frame dividers/sections that are UI chrome, not student text
        clone.querySelectorAll(
            '.skriv-frame-divider, .skriv-frame-section, .skriv-frame-subsection'
        ).forEach(el => el.remove());
        return clone.textContent || '';
    }

    /**
     * Run analysis and update the widget display.
     */
    function analyze() {
        const text = getEditorText();
        const result = calculateLix(text);
        renderWidget(result);
    }

    /**
     * Render the score result into the widget.
     */
    function renderWidget(result) {
        if (!widget) return;
        const content = widget.querySelector('.lix-content');

        if (!result || result.wordCount < MIN_WORDS_FOR_SCORE) {
            content.innerHTML = `<span class="lix-hint">${t('lix.tooShort')}</span>`;
            return;
        }

        const category = getLixCategory(result.lix);
        const level = options.getLevel?.() || 'ungdomsskole';
        const appropriate = isAppropriateForLevel(result.lix, level);
        const fillPct = Math.min(100, (result.lix / LIX_SCALE_MAX) * 100);

        content.innerHTML = `
            <div class="lix-gauge">
                <div class="lix-gauge-bar">
                    <div class="lix-gauge-fill" style="width: ${fillPct}%; background: ${category.color}"></div>
                    <div class="lix-gauge-marker" style="left: ${fillPct}%"></div>
                </div>
                <div class="lix-score-number">${result.lix}</div>
            </div>
            <div class="lix-label" style="color: ${category.color}">${t('lix.' + category.key)}</div>
            ${!appropriate ? `<div class="lix-level-hint">${t('lix.levelHint')}</div>` : ''}
            <div class="lix-details">
                <span>${result.sentenceCount} ${t('lix.sentences')}</span>
                <span>${result.avgSentenceLength} ${t('lix.wordsPerSentence')}</span>
                <span>${result.longWordPct}% ${t('lix.longWords')}</span>
            </div>
        `;
    }

    /**
     * Create and attach the widget element.
     */
    function createWidget() {
        widget = document.createElement('div');
        widget.className = 'skriv-lix-widget hidden';
        widget.innerHTML = `
            <div class="lix-header">
                <span class="lix-title">${t('lix.title')}</span>
            </div>
            <div class="lix-content"></div>
        `;

        // Try to place near the bottom status bar; fall back to container
        const bottomBar = editor.closest('#writing-env')?.querySelector('.border-t.border-stone-200');
        if (bottomBar) {
            bottomBar.parentNode.insertBefore(widget, bottomBar);
        } else {
            container.appendChild(widget);
        }
    }

    createWidget();

    /**
     * Debounced input handler.
     */
    function handleInput() {
        if (!active) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(analyze, DEBOUNCE_MS);
    }

    editor.addEventListener('input', handleInput);

    /**
     * Toggle the widget on or off.
     * @returns {boolean} New active state
     */
    function toggle() {
        active = !active;
        if (active) {
            widget.classList.remove('hidden');
            analyze();
        } else {
            widget.classList.add('hidden');
        }
        return active;
    }

    /**
     * Clean up all DOM and listeners.
     */
    function destroy() {
        editor.removeEventListener('input', handleInput);
        if (debounceTimer) clearTimeout(debounceTimer);
        if (widget) widget.remove();
        if (styleEl) styleEl.remove();
    }

    return { destroy, toggle, isActive: () => active };
}
