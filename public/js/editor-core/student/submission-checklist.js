/**
 * Submission Checklist — genre-aware pre-export checklist.
 *
 * Shown when the student clicks "Last ned PDF" or "Last ned .txt".
 * Not a blocker — the student can always proceed.
 *
 * Two kinds of items:
 *   1. Auto-detected (✅ / ⚠️): title present, word count, sources
 *   2. Manual checkboxes (☐): student ticks them as self-check
 *
 * When a writing frame (drøfting/analyse/kronikk) is active,
 * genre-specific items are shown. Otherwise, a generic checklist.
 *
 * Usage:
 *   import { showSubmissionChecklist } from './submission-checklist.js';
 *   const proceed = await showSubmissionChecklist({ frameType, title, wordCount, ... });
 */

import { t } from '../shared/i18n.js';
import { escapeHtml } from '../shared/html-escape.js';
import { getModalParent } from '../shared/dom-helpers.js';

/**
 * Show the submission checklist modal.
 *
 * @param {object} options
 * @param {string|null} options.frameType - Active frame type (e.g. 'droefting', 'analyse', 'kronikk') or null
 * @param {string} options.title - Document title
 * @param {number} options.wordCount - Current word count
 * @param {boolean} options.hasReferences - Whether references exist
 * @param {boolean} options.hasHeadings - Whether H1/H2 headings exist
 * @param {'pdf'|'txt'} options.exportType - Which export was clicked
 * @returns {Promise<boolean>} true if student wants to proceed, false if cancelled
 */
export function showSubmissionChecklist(options) {
    const {
        frameType = null,
        title = '',
        wordCount = 0,
        hasReferences = false,
        hasHeadings = false,
        exportType = 'pdf',
    } = options;

    // Remove any existing checklist modals
    document.querySelectorAll('[data-checklist-modal]').forEach(el => el.remove());

    return new Promise((resolve) => {
        // --- Build checklist items ---
        const items = [];

        // Auto-detected items
        items.push({
            auto: true,
            pass: title.trim().length > 0,
            label: t('checklist.hasTitle'),
        });

        items.push({
            auto: true,
            pass: wordCount >= 100,
            label: t('checklist.hasWords'),
        });

        items.push({
            auto: true,
            pass: hasReferences,
            label: t('checklist.hasSources'),
        });

        // Genre-specific items (manual checkboxes)
        if (frameType === 'droefting') {
            items.push(
                { auto: false, label: t('checklist.droefting.question') },
                { auto: false, label: t('checklist.droefting.argFor') },
                { auto: false, label: t('checklist.droefting.argAgainst') },
                { auto: false, label: t('checklist.droefting.conclusion') },
            );
        } else if (frameType === 'analyse') {
            items.push(
                { auto: false, label: t('checklist.analyse.work') },
                { auto: false, label: t('checklist.analyse.structure') },
                { auto: false, label: t('checklist.analyse.devices') },
                { auto: false, label: t('checklist.analyse.interpretation') },
            );
        } else if (frameType === 'kronikk') {
            items.push(
                { auto: false, label: t('checklist.kronikk.hook') },
                { auto: false, label: t('checklist.kronikk.position') },
                { auto: false, label: t('checklist.kronikk.arguments') },
                { auto: false, label: t('checklist.kronikk.counterArg') },
            );
        }

        // Generic manual items (always shown)
        items.push(
            { auto: false, label: t('checklist.introConclusion') },
            { auto: false, label: t('checklist.spellCheck') },
        );

        // --- Build HTML ---
        const itemsHtml = items.map((item, i) => {
            if (item.auto) {
                const icon = item.pass ? '✅' : '⚠️';
                const textColor = item.pass ? 'text-stone-700' : 'text-amber-700';
                return `
                    <div class="flex items-start gap-3 py-1.5">
                        <span class="text-base leading-none mt-0.5">${icon}</span>
                        <span class="text-sm ${textColor}">${escapeHtml(item.label)}</span>
                    </div>
                `;
            } else {
                return `
                    <label class="flex items-start gap-3 py-1.5 cursor-pointer group">
                        <input type="checkbox" data-checklist-item="${i}"
                            class="mt-0.5 w-4 h-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer" />
                        <span class="text-sm text-stone-600 group-hover:text-stone-800">${escapeHtml(item.label)}</span>
                    </label>
                `;
            }
        }).join('');

        const exportLabel = exportType === 'pdf'
            ? t('checklist.proceed') + ' PDF'
            : t('checklist.proceed') + ' .txt';

        // --- Create modal ---
        const overlay = document.createElement('div');
        overlay.setAttribute('data-checklist-modal', '');
        overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4';
        overlay.style.zIndex = '100';
        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-xl">📋</span>
                    <h3 class="text-lg font-bold text-stone-900">${escapeHtml(t('checklist.title'))}</h3>
                </div>
                <div class="space-y-0.5 mb-6 max-h-[60vh] overflow-y-auto">
                    ${itemsHtml}
                </div>
                <div class="flex gap-3 justify-end">
                    <button data-checklist-cancel
                        class="px-4 py-2 rounded-lg text-sm font-semibold bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors">
                        ${escapeHtml(t('checklist.cancel'))}
                    </button>
                    <button data-checklist-proceed
                        class="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                        ${escapeHtml(exportLabel)}
                    </button>
                </div>
            </div>
        `;

        getModalParent().appendChild(overlay);

        // --- Wire buttons ---
        overlay.querySelector('[data-checklist-proceed]').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });

        overlay.querySelector('[data-checklist-cancel]').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });

        // Click outside to cancel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve(false);
            }
        });

        // Escape key to cancel
        function handleKeyDown(e) {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleKeyDown);
                overlay.remove();
                resolve(false);
            }
        }
        document.addEventListener('keydown', handleKeyDown);
    });
}
