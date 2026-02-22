/**
 * Word counting utility.
 */

import { t } from './i18n.js';
import { getCleanEditorText, FRAME_SELECTORS } from './frame-elements.js';

/**
 * Count words in a string. Splits on whitespace, filters empty strings.
 */
export function countWords(text) {
    if (!text || !text.trim()) return 0;
    return text.trim().split(/\s+/).length;
}

/**
 * Attach a real-time word counter to a contenteditable element.
 * Returns a cleanup function.
 */
export function attachWordCounter(element, displayEl, guidance) {
    const getText = () => {
        if (element.value !== undefined) return element.value;
        // If frame elements exist, exclude them from word count
        if (element.querySelector && element.querySelector(FRAME_SELECTORS.section)) {
            return getCleanEditorText(element);
        }
        return element.innerText || '';
    };

    const update = () => {
        const count = countWords(getText());
        let label = t('wordCounter.count', { count });

        if (guidance && guidance.min && guidance.max) {
            label += ' ' + t('wordCounter.goalRange', { min: guidance.min, max: guidance.max });
        } else if (guidance && guidance.min) {
            label += ' ' + t('wordCounter.goalMin', { min: guidance.min });
        } else if (guidance && guidance.max) {
            label += ' ' + t('wordCounter.goalMax', { max: guidance.max });
        }

        displayEl.textContent = label;

        if (guidance?.max && count > guidance.max) {
            displayEl.classList.add('text-red-600', 'font-semibold');
            displayEl.classList.remove('text-stone-600');
        } else {
            displayEl.classList.remove('text-red-600', 'font-semibold');
        }
    };

    element.addEventListener('input', update);
    update();

    return () => element.removeEventListener('input', update);
}
