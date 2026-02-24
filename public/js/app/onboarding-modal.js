/**
 * Onboarding modal — first-time school level selection.
 * Shows a centered modal with 5 clickable cards (one per school level).
 * No cancel button on first use (student must pick a level).
 * When called with allowCancel=true (e.g. from sidebar), Escape closes it.
 *
 * Depends on: school-level.js, i18n.js, html-escape.js, dom-helpers.js
 */

import { SCHOOL_LEVELS } from './school-level.js';
import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';
import { getModalParent } from '../editor-core/shared/dom-helpers.js';

/**
 * Set up a focus trap within a container.
 * Tab/Shift+Tab cycle through focusable elements.
 */
function trapFocus(container) {
    function handler(e) {
        if (e.key !== 'Tab') return;

        const focusable = container.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusable.length === 0) return;

        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
            if (document.activeElement === first) {
                e.preventDefault();
                last.focus();
            }
        } else {
            if (document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    }

    container.addEventListener('keydown', handler);
    return () => container.removeEventListener('keydown', handler);
}

/**
 * Level card icons — graduation cap variants per level.
 */
const LEVEL_ICONS = {
    barneskole: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25"/></svg>`,
    ungdomsskole: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>`,
    vg1: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>`,
    vg2: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>`,
    vg3: `<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>`,
};

/**
 * Show the school level onboarding modal.
 *
 * @param {Object} [options]
 * @param {boolean} [options.allowCancel=false] - If true, Escape/overlay click closes without picking
 * @returns {Promise<string|null>} The chosen level ID, or null if cancelled
 */
export function showOnboardingModal({ allowCancel = false } = {}) {
    // Remove any lingering onboarding modals
    document.querySelectorAll('[data-onboarding-modal]').forEach(el => el.remove());

    return new Promise((resolve) => {
        const previousFocus = document.activeElement;

        const overlay = document.createElement('div');
        overlay.setAttribute('data-onboarding-modal', '');
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-labelledby', 'onboarding-title');
        overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4';
        overlay.style.zIndex = '200';

        // Build card HTML for each level
        const cardsHtml = SCHOOL_LEVELS.map(level => `
            <button data-level-id="${level.id}"
                class="onboarding-card group flex items-center gap-4 w-full px-5 py-4 rounded-xl border-2 border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-800 hover:border-emerald-400 dark:hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-all text-left focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-stone-900">
                <span class="flex-shrink-0 text-stone-400 dark:text-stone-500 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                    ${LEVEL_ICONS[level.id]}
                </span>
                <span class="flex flex-col">
                    <span class="text-sm font-semibold text-stone-800 dark:text-stone-100">${escapeHtml(t(level.labelKey))}</span>
                    <span class="text-xs text-stone-500 dark:text-stone-400">${escapeHtml(t(level.subKey))}</span>
                </span>
                <svg class="w-5 h-5 ml-auto flex-shrink-0 text-stone-300 dark:text-stone-600 group-hover:text-emerald-500 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
            </button>
        `).join('');

        overlay.innerHTML = `
            <div class="onboarding-box bg-white dark:bg-stone-800 rounded-2xl shadow-2xl max-w-md w-full p-6 sm:p-8">
                <h2 id="onboarding-title" class="text-xl font-bold text-stone-900 dark:text-stone-100 mb-1 text-center">
                    ${escapeHtml(t('level.title'))}
                </h2>
                <p class="text-sm text-stone-500 dark:text-stone-400 mb-6 text-center">
                    ${escapeHtml(t('level.subtitle'))}
                </p>
                <div class="flex flex-col gap-2">
                    ${cardsHtml}
                </div>
            </div>
        `;

        const removeFocusTrap = trapFocus(overlay);

        function close(levelId) {
            removeFocusTrap();
            overlay.remove();
            if (previousFocus && previousFocus.focus) {
                previousFocus.focus();
            }
            resolve(levelId);
        }

        // Click handlers on level cards
        overlay.querySelectorAll('[data-level-id]').forEach(btn => {
            btn.addEventListener('click', () => {
                close(btn.dataset.levelId);
            });
        });

        // Escape key — only if cancellable (e.g. changing level from sidebar)
        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && allowCancel) {
                e.stopPropagation();
                close(null);
            }
        });

        // Click on overlay backdrop — only if cancellable
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && allowCancel) {
                close(null);
            }
        });

        getModalParent().appendChild(overlay);

        // Focus the first card
        const firstCard = overlay.querySelector('[data-level-id]');
        if (firstCard) firstCard.focus();
    });
}
