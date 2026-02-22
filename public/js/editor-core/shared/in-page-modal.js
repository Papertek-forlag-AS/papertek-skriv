/**
 * In-page modal dialogs.
 * Replaces native confirm() and alert().
 */

import { escapeHtml } from './html-escape.js';
import { getModalParent } from './dom-helpers.js';

/** Remove any lingering modal overlays. */
function cleanupStaleModals() {
    document.querySelectorAll('[data-in-page-modal]').forEach(el => el.remove());
}

/**
 * Show an in-page confirmation modal (replaces confirm()).
 * @returns {Promise<boolean>}
 */
export function showInPageConfirm(title, message, confirmText, cancelText) {
    cleanupStaleModals();

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.setAttribute('data-in-page-modal', '');
        overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4';
        overlay.style.zIndex = '100';
        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
                <h3 class="text-lg font-bold text-stone-900 mb-2">${escapeHtml(title)}</h3>
                <p class="text-sm text-stone-600 mb-6">${escapeHtml(message)}</p>
                <div class="flex gap-3 justify-center">
                    <button data-modal-cancel class="px-4 py-2 rounded-lg text-sm font-semibold bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors">
                        ${escapeHtml(cancelText)}
                    </button>
                    <button data-modal-confirm class="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                        ${escapeHtml(confirmText)}
                    </button>
                </div>
            </div>
        `;

        getModalParent().appendChild(overlay);

        overlay.querySelector('[data-modal-confirm]').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });

        overlay.querySelector('[data-modal-cancel]').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
    });
}

/**
 * Show an in-page prompt modal (replaces prompt()).
 * @returns {Promise<string|null>}
 */
export function showInPagePrompt(title, message, confirmText, cancelText, placeholder = '') {
    cleanupStaleModals();

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.setAttribute('data-in-page-modal', '');
        overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4';
        overlay.style.zIndex = '100';
        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
                <h3 class="text-lg font-bold text-stone-900 mb-2 text-center">${escapeHtml(title)}</h3>
                <p class="text-sm text-stone-600 mb-4 text-center">${escapeHtml(message)}</p>
                <input data-modal-input type="text" placeholder="${escapeHtml(placeholder)}"
                    class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 mb-4" />
                <div class="flex gap-3 justify-center">
                    <button data-modal-cancel class="px-4 py-2 rounded-lg text-sm font-semibold bg-stone-200 text-stone-700 hover:bg-stone-300 transition-colors">
                        ${escapeHtml(cancelText)}
                    </button>
                    <button data-modal-confirm class="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                        ${escapeHtml(confirmText)}
                    </button>
                </div>
            </div>
        `;

        getModalParent().appendChild(overlay);

        const input = overlay.querySelector('[data-modal-input]');
        input.focus();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                overlay.remove();
                resolve(input.value);
            }
        });

        overlay.querySelector('[data-modal-confirm]').addEventListener('click', () => {
            overlay.remove();
            resolve(input.value);
        });

        overlay.querySelector('[data-modal-cancel]').addEventListener('click', () => {
            overlay.remove();
            resolve(null);
        });
    });
}

/**
 * Show an in-page content modal with raw HTML.
 * @returns {Promise<void>}
 */
export function showInPageContent(title, htmlContent, closeText = 'OK') {
    cleanupStaleModals();

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.setAttribute('data-in-page-modal', '');
        overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4';
        overlay.style.zIndex = '100';
        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6">
                <h3 class="text-lg font-bold text-stone-900 mb-4 text-center">${escapeHtml(title)}</h3>
                <div class="mb-4">${htmlContent}</div>
                <div class="flex justify-center">
                    <button data-modal-ok class="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                        ${escapeHtml(closeText)}
                    </button>
                </div>
            </div>
        `;

        getModalParent().appendChild(overlay);

        overlay.querySelector('[data-modal-ok]').addEventListener('click', () => {
            overlay.remove();
            resolve();
        });

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
                resolve();
            }
        });
    });
}

/**
 * Show an in-page alert modal (replaces alert()).
 * @returns {Promise<void>}
 */
export function showInPageAlert(title, message, buttonText = 'OK') {
    cleanupStaleModals();

    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.setAttribute('data-in-page-modal', '');
        overlay.className = 'fixed inset-0 bg-black/70 flex items-center justify-center p-4';
        overlay.style.zIndex = '100';
        overlay.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
                <h3 class="text-lg font-bold text-stone-900 mb-2">${escapeHtml(title)}</h3>
                <p class="text-sm text-stone-600 mb-6">${escapeHtml(message)}</p>
                <div class="flex justify-center">
                    <button data-modal-ok class="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                        ${escapeHtml(buttonText)}
                    </button>
                </div>
            </div>
        `;

        getModalParent().appendChild(overlay);

        overlay.querySelector('[data-modal-ok]').addEventListener('click', () => {
            overlay.remove();
            resolve();
        });
    });
}
