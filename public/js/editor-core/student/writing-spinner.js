/**
 * Writing Spinner — sentence starters and synonym suggestions.
 *
 * Two modes:
 *   1. Sentence starters: click spinner button → random starter with scramble animation
 *   2. Synonym mode: double-click a word in editor → synonym popup
 *
 * The word bank is loaded dynamically based on the current language.
 * All data is static — no API calls, works offline.
 * The spinner does NOT track which suggestions the student uses.
 *
 * Usage:
 *   import { initWritingSpinner } from './writing-spinner.js';
 *   const { destroy } = initWritingSpinner(editor, container);
 */

import { t, getCurrentLanguage } from '../shared/i18n.js';
import { isFrameElement } from '../shared/frame-elements.js';

const SCRAMBLE_CHARS = 'abcdefghijklmnoprstuvwxyzæøå';
const SCRAMBLE_DURATION = 600; // ms
const SCRAMBLE_INTERVAL = 30;  // ms per tick

/**
 * Load word bank for the current language.
 * @returns {Promise<{ starters, synonyms, stopwords, stem }>}
 */
async function loadWordBank() {
    const lang = getCurrentLanguage();
    try {
        if (lang === 'nn') {
            return await import('./spinner-data-nn.js');
        }
        // Default to nb for all other languages
        return await import('./spinner-data-nb.js');
    } catch (err) {
        console.error('Failed to load word bank:', err);
        return { starters: {}, synonyms: {}, stopwords: new Set(), stem: (w) => w };
    }
}

/**
 * Scramble animation — characters resolve left-to-right like a hacker effect.
 * @param {HTMLElement} el - Element to animate into
 * @param {string} finalText - The text to reveal
 * @param {Function} [onDone] - Callback when animation completes
 */
function scrambleReveal(el, finalText, onDone) {
    const len = finalText.length;
    let resolvedCount = 0;
    const startTime = Date.now();
    const resolvePerTick = Math.max(1, len / (SCRAMBLE_DURATION / SCRAMBLE_INTERVAL));

    function tick() {
        const elapsed = Date.now() - startTime;
        resolvedCount = Math.min(len, Math.floor((elapsed / SCRAMBLE_DURATION) * len));

        let display = '';
        for (let i = 0; i < len; i++) {
            if (i < resolvedCount) {
                display += finalText[i];
            } else if (finalText[i] === ' ') {
                display += ' ';
            } else {
                display += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
            }
        }
        el.textContent = display;

        if (resolvedCount < len) {
            requestAnimationFrame(tick);
        } else {
            el.textContent = finalText;
            if (onDone) onDone();
        }
    }

    requestAnimationFrame(tick);
}

/**
 * Initialize the Writing Spinner.
 * @param {HTMLElement} editor - The contenteditable editor element
 * @param {HTMLElement} container - Parent wrapping the editor (for positioning)
 * @param {object} [options]
 * @returns {{ destroy: () => void }}
 */
export function initWritingSpinner(editor, container, options = {}) {
    let wordBank = null;
    let synonymPopup = null;
    let spinnerPanel = null;
    let currentCategory = null;
    const recentPicks = new Map();  // category → index[] of recently shown

    // --- Load word bank ---
    const bankPromise = loadWordBank().then(bank => { wordBank = bank; });

    // --- Spinner panel (sentence starters) ---
    spinnerPanel = document.createElement('div');
    spinnerPanel.className = 'skriv-spinner-panel hidden';
    spinnerPanel.innerHTML = `
        <div class="spinner-header">
            <span class="spinner-title">${t('spinner.title')}</span>
            <button class="spinner-close" title="${t('common.cancel')}">&times;</button>
        </div>
        <div class="spinner-categories"></div>
        <div class="spinner-result"></div>
        <button class="spinner-spin">${t('spinner.spin')}</button>
    `;

    const bottomBar = editor.closest('#writing-env')?.querySelector('.border-t.border-stone-200');
    if (bottomBar) {
        bottomBar.parentNode.insertBefore(spinnerPanel, bottomBar);
    } else {
        container.appendChild(spinnerPanel);
    }

    const categoriesEl = spinnerPanel.querySelector('.spinner-categories');
    const resultEl = spinnerPanel.querySelector('.spinner-result');
    const spinBtn = spinnerPanel.querySelector('.spinner-spin');
    const closeBtn = spinnerPanel.querySelector('.spinner-close');

    function buildCategories() {
        if (!wordBank?.starters) return;
        categoriesEl.innerHTML = '';
        const categories = Object.keys(wordBank.starters);
        categories.forEach(cat => {
            const btn = document.createElement('button');
            btn.className = 'spinner-cat-btn' + (cat === currentCategory ? ' active' : '');
            btn.textContent = t(`spinner.cat.${cat}`);
            btn.addEventListener('click', () => {
                currentCategory = cat;
                buildCategories();
                doSpin();
            });
            categoriesEl.appendChild(btn);
        });
    }

    /**
     * Pick a random item from the pool, avoiding recent picks.
     * Cycles through all items before repeating any.
     */
    function pickFromPool(pool, category) {
        if (!recentPicks.has(category)) {
            recentPicks.set(category, []);
        }
        const recent = recentPicks.get(category);

        // Build list of indices not recently shown
        let available = [];
        for (let i = 0; i < pool.length; i++) {
            if (!recent.includes(i)) available.push(i);
        }

        // If all used up, reset but keep the very last one out to avoid immediate repeat
        if (available.length === 0) {
            const last = recent[recent.length - 1];
            recent.length = 0;
            available = [];
            for (let i = 0; i < pool.length; i++) {
                if (i !== last) available.push(i);
            }
            // Edge case: pool has only 1 item
            if (available.length === 0) available.push(last);
        }

        const idx = available[Math.floor(Math.random() * available.length)];
        recent.push(idx);
        return pool[idx];
    }

    function doSpin() {
        if (!wordBank?.starters || !currentCategory) return;
        const pool = wordBank.starters[currentCategory];
        if (!pool || pool.length === 0) return;
        const text = pickFromPool(pool, currentCategory);
        resultEl.classList.add('spinning');
        scrambleReveal(resultEl, text, () => {
            resultEl.classList.remove('spinning');
        });
    }

    spinBtn.addEventListener('click', doSpin);
    closeBtn.addEventListener('click', () => {
        spinnerPanel.classList.add('hidden');
    });

    // Click on result → insert into editor
    resultEl.addEventListener('click', () => {
        const text = resultEl.textContent;
        if (!text || resultEl.classList.contains('spinning')) return;
        editor.focus();
        document.execCommand('insertText', false, text);
        spinnerPanel.classList.add('hidden');
    });

    /**
     * Show the spinner panel.
     */
    function show() {
        bankPromise.then(() => {
            if (!currentCategory && wordBank?.starters) {
                currentCategory = Object.keys(wordBank.starters)[0] || null;
            }
            buildCategories();
            resultEl.textContent = t('spinner.clickToSpin');
            spinnerPanel.classList.remove('hidden');
        });
    }

    // --- Synonym popup (double-click on word) ---
    function handleDblClick(e) {
        if (!wordBank?.synonyms) return;
        if (isFrameElement(e.target)) return;

        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;

        // Get the selected word
        const range = sel.getRangeAt(0);
        const word = sel.toString().trim().toLowerCase();
        if (!word || word.includes(' ')) return;

        const alts = wordBank.synonyms[word];
        if (!alts || alts.length === 0) return;

        // Show synonym popup
        showSynonymPopup(range, word, alts);
    }

    function showSynonymPopup(range, word, alternatives) {
        removeSynonymPopup();

        const rect = range.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();

        synonymPopup = document.createElement('div');
        synonymPopup.className = 'skriv-synonym-popup';

        const title = document.createElement('div');
        title.className = 'synonym-title';
        title.textContent = t('spinner.synonymTitle', { word });
        synonymPopup.appendChild(title);

        alternatives.forEach(alt => {
            const btn = document.createElement('button');
            btn.className = 'synonym-option';
            btn.textContent = alt;
            btn.addEventListener('mousedown', (e) => e.preventDefault());
            btn.addEventListener('click', () => {
                editor.focus();
                const sel = window.getSelection();
                // Re-select the word to replace it
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand('insertText', false, alt);
                removeSynonymPopup();
            });
            synonymPopup.appendChild(btn);
        });

        // Position below the word
        synonymPopup.style.position = 'fixed';
        synonymPopup.style.left = `${rect.left}px`;
        synonymPopup.style.top = `${rect.bottom + 4}px`;

        document.body.appendChild(synonymPopup);

        // Close on click outside
        setTimeout(() => {
            document.addEventListener('mousedown', closeSynonymOnOutsideClick);
        }, 0);
    }

    function closeSynonymOnOutsideClick(e) {
        if (synonymPopup && !synonymPopup.contains(e.target)) {
            removeSynonymPopup();
        }
    }

    function removeSynonymPopup() {
        if (synonymPopup) {
            synonymPopup.remove();
            synonymPopup = null;
            document.removeEventListener('mousedown', closeSynonymOnOutsideClick);
        }
    }

    editor.addEventListener('dblclick', handleDblClick);

    // --- Cleanup ---
    function destroy() {
        editor.removeEventListener('dblclick', handleDblClick);
        removeSynonymPopup();
        if (spinnerPanel?.parentNode) spinnerPanel.remove();
    }

    return { destroy, show };
}
