/**
 * In-page modal dialogs.
 * Replaces native confirm() and alert().
 * Accessible: focus trap, ARIA attributes, Escape to close, focus restoration.
 */

import { escapeHtml } from './html-escape.js';
import { getModalParent } from './dom-helpers.js';

/** Remove any lingering modal overlays. */
function cleanupStaleModals() {
    document.querySelectorAll('[data-in-page-modal]').forEach(el => el.remove());
}

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
 * Create an accessible overlay with ARIA attributes and focus management.
 */
function createOverlay(title, innerHtml) {
    const previousFocus = document.activeElement;

    const overlay = document.createElement('div');
    overlay.setAttribute('data-in-page-modal', '');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'modal-title');
    overlay.className = 'skriv-modal-overlay fixed inset-0 bg-black/70 flex items-center justify-center p-4';
    overlay.style.zIndex = '100';
    overlay.innerHTML = innerHtml;

    // Set the title's ID for aria-labelledby
    const titleEl = overlay.querySelector('h3');
    if (titleEl) titleEl.id = 'modal-title';

    const removeFocusTrap = trapFocus(overlay);

    function close() {
        removeFocusTrap();
        overlay.remove();
        // Restore focus to the element that opened the modal
        if (previousFocus && previousFocus.focus) {
            previousFocus.focus();
        }
    }

    // Escape key closes the modal
    function handleEscape(e) {
        if (e.key === 'Escape') {
            e.stopPropagation();
            close();
        }
    }
    overlay.addEventListener('keydown', handleEscape);

    return { overlay, close };
}

/**
 * Show an in-page confirmation modal (replaces confirm()).
 * @returns {Promise<boolean>}
 */
export function showInPageConfirm(title, message, confirmText, cancelText) {
    cleanupStaleModals();

    return new Promise((resolve) => {
        const { overlay, close } = createOverlay(title, `
            <div class="skriv-modal-box bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
                <h3 class="text-lg font-bold text-stone-900 dark:text-stone-100 mb-2">${escapeHtml(title)}</h3>
                <p class="text-sm text-stone-600 dark:text-stone-400 mb-6">${escapeHtml(message)}</p>
                <div class="flex gap-3 justify-center">
                    <button data-modal-cancel class="px-4 py-2 rounded-lg text-sm font-semibold bg-stone-200 text-stone-700 hover:bg-stone-300 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600 transition-colors">
                        ${escapeHtml(cancelText)}
                    </button>
                    <button data-modal-confirm class="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                        ${escapeHtml(confirmText)}
                    </button>
                </div>
            </div>
        `);

        // Override close to resolve false (Escape = cancel)
        const originalClose = close;
        const resolveAndClose = (value) => {
            originalClose();
            resolve(value);
        };

        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') resolveAndClose(false);
        }, { once: true });

        getModalParent().appendChild(overlay);

        // Focus the confirm button
        const confirmBtn = overlay.querySelector('[data-modal-confirm]');
        confirmBtn.focus();

        confirmBtn.addEventListener('click', () => resolveAndClose(true));
        overlay.querySelector('[data-modal-cancel]').addEventListener('click', () => resolveAndClose(false));
    });
}

/**
 * Show an in-page prompt modal (replaces prompt()).
 * @returns {Promise<string|null>}
 */
export function showInPagePrompt(title, message, confirmText, cancelText, placeholder = '') {
    cleanupStaleModals();

    return new Promise((resolve) => {
        const { overlay, close } = createOverlay(title, `
            <div class="skriv-modal-box bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6">
                <h3 class="text-lg font-bold text-stone-900 dark:text-stone-100 mb-2 text-center">${escapeHtml(title)}</h3>
                <p class="text-sm text-stone-600 dark:text-stone-400 mb-4 text-center">${escapeHtml(message)}</p>
                <input data-modal-input type="text" placeholder="${escapeHtml(placeholder)}"
                    aria-label="${escapeHtml(title)}"
                    class="w-full px-3 py-2 border border-stone-300 rounded-lg text-sm text-center focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 mb-4" />
                <div class="flex gap-3 justify-center">
                    <button data-modal-cancel class="px-4 py-2 rounded-lg text-sm font-semibold bg-stone-200 text-stone-700 hover:bg-stone-300 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600 transition-colors">
                        ${escapeHtml(cancelText)}
                    </button>
                    <button data-modal-confirm class="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                        ${escapeHtml(confirmText)}
                    </button>
                </div>
            </div>
        `);

        const originalClose = close;
        const resolveAndClose = (value) => {
            originalClose();
            resolve(value);
        };

        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') resolveAndClose(null);
        }, { once: true });

        getModalParent().appendChild(overlay);

        const input = overlay.querySelector('[data-modal-input]');
        input.focus();

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.stopPropagation();
                resolveAndClose(input.value);
            }
        });

        overlay.querySelector('[data-modal-confirm]').addEventListener('click', () => resolveAndClose(input.value));
        overlay.querySelector('[data-modal-cancel]').addEventListener('click', () => resolveAndClose(null));
    });
}

/**
 * Show an in-page content modal with raw HTML.
 * @returns {Promise<void>}
 */
export function showInPageContent(title, htmlContent, closeText = 'OK') {
    cleanupStaleModals();

    return new Promise((resolve) => {
        const { overlay, close } = createOverlay(title, `
            <div class="skriv-modal-box bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6">
                <h3 class="text-lg font-bold text-stone-900 dark:text-stone-100 mb-4 text-center">${escapeHtml(title)}</h3>
                <div class="mb-4">${htmlContent}</div>
                <div class="flex justify-center">
                    <button data-modal-ok class="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                        ${escapeHtml(closeText)}
                    </button>
                </div>
            </div>
        `);

        const resolveAndClose = () => {
            close();
            resolve();
        };

        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') resolveAndClose();
        }, { once: true });

        getModalParent().appendChild(overlay);

        const okBtn = overlay.querySelector('[data-modal-ok]');
        okBtn.focus();
        okBtn.addEventListener('click', resolveAndClose);

        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) resolveAndClose();
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
        const { overlay, close } = createOverlay(title, `
            <div class="skriv-modal-box bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center">
                <h3 class="text-lg font-bold text-stone-900 dark:text-stone-100 mb-2">${escapeHtml(title)}</h3>
                <p class="text-sm text-stone-600 dark:text-stone-400 mb-6">${escapeHtml(message)}</p>
                <div class="flex justify-center">
                    <button data-modal-ok class="px-5 py-2 rounded-lg text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                        ${escapeHtml(buttonText)}
                    </button>
                </div>
            </div>
        `);

        const resolveAndClose = () => {
            close();
            resolve();
        };

        overlay.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') resolveAndClose();
        }, { once: true });

        getModalParent().appendChild(overlay);

        const okBtn = overlay.querySelector('[data-modal-ok]');
        okBtn.focus();
        okBtn.addEventListener('click', resolveAndClose);
    });
}
