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
 * Supports:
 *   - Stem-aware synonym lookup (inflected forms find base synonyms)
 *   - Level-aware data (US vs VGS content based on school level)
 *   - Genre-aware starters (based on active writing frame)
 *
 * Usage:
 *   import { initWritingSpinner } from './writing-spinner.js';
 *   const { destroy, show } = initWritingSpinner(editor, container, {
 *       getLevel: () => 'ungdomsskole',      // returns school level string
 *       getActiveFrame: () => 'droefting',    // returns current genre or null
 *   });
 *
 * NEW i18n keys needed:
 *   spinner.academic — "akademisk" (nb), "akademisk" (nn), "academic" (en)
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
 * @param {() => string|null} [options.getLevel] - Returns school level ('ungdomsskole'|'barneskole'|'vg1'|'vg2'|'vg3')
 * @param {() => string|null} [options.getActiveFrame] - Returns current writing frame genre string (e.g. 'droefting')
 * @returns {{ destroy: () => void, show: () => void }}
 */
export function initWritingSpinner(editor, container, options = {}) {
    let wordBank = null;
    let synonymPopup = null;
    let spinnerPanel = null;
    let currentCategory = null;
    let savedRange = null;          // cursor position saved before panel opens
    const recentPicks = new Map();  // category → index[] of recently shown

    // --- Level/genre helpers ---

    /**
     * Resolve school level to data tier ('us' or 'vgs').
     */
    function getLevelTier() {
        const level = options.getLevel?.() || 'ungdomsskole';
        return (level === 'ungdomsskole' || level === 'barneskole') ? 'us' : 'vgs';
    }

    /**
     * Get merged synonyms for current level tier.
     * Merges common + tier-specific (tier wins on conflict).
     */
    function getSynonymsForLevel() {
        if (!wordBank?.synonyms) return {};
        const tier = getLevelTier();
        // Support both old flat format and new tiered format
        if (!wordBank.synonyms.common && !wordBank.synonyms.us && !wordBank.synonyms.vgs) {
            // Legacy flat format: { word: [alts] }
            return wordBank.synonyms;
        }
        return { ...(wordBank.synonyms.common || {}), ...(wordBank.synonyms[tier] || {}) };
    }

    /**
     * Get starters for the current genre and level context.
     * Falls back: genre+tier → genre+us → generell+tier → generell+us → flat starters
     */
    function getStartersForContext() {
        if (!wordBank?.starters) return {};
        const tier = getLevelTier();
        const frame = options.getActiveFrame?.() || null;

        // Support old flat format: { category: [strings] }
        const firstValue = Object.values(wordBank.starters)[0];
        if (Array.isArray(firstValue)) {
            // Legacy flat format
            return wordBank.starters;
        }

        // New tiered format: { genre: { level: { category: [strings] } } }
        // Try genre-specific first, fall back to generell
        const genreData = (frame && wordBank.starters[frame]) || wordBank.starters.generell;
        if (!genreData) return {};
        return genreData[tier] || genreData.us || {};
    }

    /**
     * Check if a synonym word comes from the VGS tier specifically
     * (not from common). Used for formality badge.
     */
    function isVgsTierWord(word) {
        if (!wordBank?.synonyms?.vgs) return false;
        // Check if the word appears as a value in VGS synonyms
        for (const alts of Object.values(wordBank.synonyms.vgs)) {
            if (alts.includes(word)) return true;
        }
        return false;
    }

    // --- Load word bank ---
    const bankPromise = loadWordBank().then(bank => { wordBank = bank; });

    // --- Spinner panel (sentence starters) ---
    spinnerPanel = document.createElement('div');
    spinnerPanel.className = 'skriv-spinner-panel hidden';
    spinnerPanel.setAttribute('role', 'region');
    spinnerPanel.setAttribute('aria-label', t('spinner.title'));
    spinnerPanel.innerHTML = `
        <div class="spinner-header">
            <span class="spinner-title">${t('spinner.title')}</span>
            <button class="spinner-close" title="${t('common.cancel')}" aria-label="${t('common.cancel')}">&times;</button>
        </div>
        <div class="spinner-categories" role="group" aria-label="${t('spinner.title')}"></div>
        <div class="spinner-result" aria-live="polite"></div>
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
        const starters = getStartersForContext();
        if (!starters || Object.keys(starters).length === 0) return;
        categoriesEl.innerHTML = '';
        const categories = Object.keys(starters);

        // If current category is not in available categories, reset
        if (!categories.includes(currentCategory)) {
            currentCategory = categories[0] || null;
        }

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
        const starters = getStartersForContext();
        if (!starters || !currentCategory) return;
        const pool = starters[currentCategory];
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
        editor.focus();
    });

    // Escape key closes the spinner panel
    function handleSpinnerKeydown(e) {
        if (e.key === 'Escape' && !spinnerPanel.classList.contains('hidden')) {
            spinnerPanel.classList.add('hidden');
            editor.focus();
        }
    }
    spinnerPanel.addEventListener('keydown', handleSpinnerKeydown);

    // Click on result → insert into editor at saved cursor position
    resultEl.addEventListener('click', () => {
        const text = resultEl.textContent;
        if (!text || resultEl.classList.contains('spinning')) return;
        editor.focus();
        if (savedRange) {
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(savedRange);
            savedRange = null;
        }
        document.execCommand('insertText', false, text);
        spinnerPanel.classList.add('hidden');
    });

    /**
     * Show the spinner panel.
     */
    function show() {
        // Save cursor position before panel steals focus
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            const r = sel.getRangeAt(0);
            if (editor.contains(r.commonAncestorContainer)) {
                savedRange = r.cloneRange();
            }
        }
        bankPromise.then(() => {
            const starters = getStartersForContext();
            if (!currentCategory && starters) {
                currentCategory = Object.keys(starters)[0] || null;
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

        // Level-aware synonym lookup
        const allSynonyms = getSynonymsForLevel();
        let alts = allSynonyms[word];

        // Stem-aware fallback: try to find synonyms via stemmed form
        if (!alts && wordBank.stem) {
            const stemmed = wordBank.stem(word);
            if (stemmed && stemmed !== word) {
                // Direct stem lookup
                if (allSynonyms[stemmed]) {
                    alts = allSynonyms[stemmed];
                } else {
                    // Find any key whose stem matches
                    for (const [key, val] of Object.entries(allSynonyms)) {
                        if (wordBank.stem(key) === stemmed) {
                            alts = val;
                            break;
                        }
                    }
                }
            }
        }

        if (!alts || alts.length === 0) return;

        // Show synonym popup
        showSynonymPopup(range, word, alts);
    }

    function showSynonymPopup(range, word, alternatives) {
        removeSynonymPopup();

        const rect = range.getBoundingClientRect();

        synonymPopup = document.createElement('div');
        synonymPopup.className = 'skriv-synonym-popup';

        const title = document.createElement('div');
        title.className = 'synonym-title';
        title.textContent = t('spinner.synonymTitle', { word });
        synonymPopup.appendChild(title);

        alternatives.forEach(alt => {
            const btn = document.createElement('button');
            btn.className = 'synonym-option';

            // Add formality badge for VGS-tier words
            if (isVgsTierWord(alt)) {
                btn.innerHTML = `<span class="synonym-word">${alt}</span><span class="synonym-badge academic">${t('spinner.academic')}</span>`;
            } else {
                btn.textContent = alt;
            }

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
        if (spinnerPanel) {
            spinnerPanel.removeEventListener('keydown', handleSpinnerKeydown);
            if (spinnerPanel.parentNode) spinnerPanel.remove();
        }
    }

    return { destroy, show };
}
