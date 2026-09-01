/**
 * Submission Checklist — genre-aware pre-export checklist.
 *
 * Shown before PDF, text, or Word-compatible export.
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
 * Build the checklist items for a document about to be exported.
 * Pure — no DOM. Exported for tests.
 *
 * @param {object} options
 * @param {string|null} [options.frameType] - Active frame type or null
 * @param {string} [options.title] - Document title
 * @param {number} [options.wordCount] - Current word count
 * @param {boolean} [options.hasReferences] - Whether references exist
 * @returns {Array<{auto: boolean, pass?: boolean, label: string}>}
 */
export function buildChecklistItems({ frameType = null, title = '', wordCount = 0, hasReferences = false } = {}) {
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

    return items;
}

/**
 * Show the submission checklist modal.
 *
 * @param {object} options
 * @param {string|null} options.frameType - Active frame type (e.g. 'droefting', 'analyse', 'kronikk') or null
 * @param {string} options.title - Document title
 * @param {number} options.wordCount - Current word count
 * @param {boolean} options.hasReferences - Whether references exist
 * @param {boolean} options.hasHeadings - Whether H1/H2 headings exist
 * @param {'pdf'|'txt'|'docx'} options.exportType - Which export was clicked
 * @returns {Promise<boolean>} true if student wants to proceed, false if cancelled
 */
export function showSubmissionChecklist(options) {
    const {
        exportType = 'pdf',
    } = options;

    // Remove any existing checklist modals
    document.querySelectorAll('[data-checklist-modal]').forEach(el => el.remove());

    return new Promise((resolve) => {
        const items = buildChecklistItems(options);

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

        const exportLabel = {
            pdf: t('skriv.downloadPdf'),
            txt: t('skriv.downloadTxt'),
            docx: t('skriv.downloadDocx'),
        }[exportType] || t('checklist.proceed');

        // --- Create modal ---
        const overlay = document.createElement('div');
        overlay.setAttribute('data-checklist-modal', '');
        overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4';
        overlay.style.zIndex = '100';
        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6" role="dialog" aria-modal="true" aria-labelledby="submission-checklist-title">
                <div class="flex items-center gap-2 mb-4">
                    <span class="text-xl" aria-hidden="true">📋</span>
                    <h3 id="submission-checklist-title" class="text-lg font-bold text-stone-900">${escapeHtml(t('checklist.title'))}</h3>
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
        const previouslyFocused = document.activeElement;

        function finish(result) {
            document.removeEventListener('keydown', handleKeyDown);
            overlay.remove();
            if (previouslyFocused?.isConnected) previouslyFocused.focus();
            resolve(result);
        }

        // --- Wire buttons ---
        overlay.querySelector('[data-checklist-proceed]').addEventListener('click', () => {
            finish(true);
        });

        overlay.querySelector('[data-checklist-cancel]').addEventListener('click', () => {
            finish(false);
        });

        // Click outside to cancel
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                finish(false);
            }
        });

        // Escape cancels; Tab stays inside the modal.
        function handleKeyDown(e) {
            if (e.key === 'Escape') {
                e.preventDefault();
                finish(false);
                return;
            }
            if (e.key === 'Tab') {
                const controls = [...overlay.querySelectorAll('button, input')]
                    .filter((element) => !element.disabled);
                if (controls.length === 0) return;
                const first = controls[0];
                const last = controls[controls.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault();
                    last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault();
                    first.focus();
                }
            }
        }
        document.addEventListener('keydown', handleKeyDown);

        overlay.querySelector('input, [data-checklist-cancel], [data-checklist-proceed]')?.focus();
    });
}
