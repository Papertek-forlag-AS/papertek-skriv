/**
 * Toast notification component for non-blocking messages.
 * Slides in from top-right, auto-dismisses, supports click actions.
 */

import { getModalParent } from './in-page-modal.js';

const TOAST_CONTAINER_ID = 'toast-container';
const DEFAULT_DURATION = 5000;

function ensureContainer() {
    let container = document.getElementById(TOAST_CONTAINER_ID);
    if (container) return container;

    container = document.createElement('div');
    container.id = TOAST_CONTAINER_ID;
    container.className = 'fixed top-4 right-4 flex flex-col gap-2 pointer-events-none';
    container.style.zIndex = '110';

    getModalParent().appendChild(container);
    return container;
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {Object} [options]
 * @param {number} [options.duration=5000]
 * @param {string} [options.icon]
 * @param {Function} [options.onClick]
 * @returns {{ dismiss: Function }}
 */
export function showToast(message, { duration = DEFAULT_DURATION, icon, onClick } = {}) {
    const container = ensureContainer();

    const toast = document.createElement('div');
    toast.className = 'pointer-events-auto max-w-sm w-full bg-white rounded-lg shadow-lg border border-stone-200 px-4 py-3 flex items-start gap-3 transform translate-x-full transition-transform duration-300 ease-out';

    if (onClick) {
        toast.classList.add('cursor-pointer', 'hover:bg-stone-50');
    }

    const iconHtml = icon
        ? `<span class="text-lg flex-shrink-0 mt-0.5">${icon}</span>`
        : '';

    toast.innerHTML = `
        ${iconHtml}
        <div class="flex-1 min-w-0">
            <p class="text-sm text-stone-700">${escapeHtml(message)}</p>
        </div>
        <button data-toast-close class="flex-shrink-0 text-stone-400 hover:text-stone-600 transition-colors ml-1 -mt-0.5">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
    `;

    container.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove('translate-x-full');
        toast.classList.add('translate-x-0');
    });

    function dismiss() {
        toast.classList.remove('translate-x-0');
        toast.classList.add('translate-x-full');
        toast.addEventListener('transitionend', () => toast.remove(), { once: true });
        setTimeout(() => toast.remove(), 400);
    }

    toast.querySelector('[data-toast-close]').addEventListener('click', (e) => {
        e.stopPropagation();
        dismiss();
    });

    if (onClick) {
        toast.addEventListener('click', (e) => {
            if (e.target.closest('[data-toast-close]')) return;
            dismiss();
            onClick();
        });
    }

    let timer;
    if (duration > 0) {
        timer = setTimeout(dismiss, duration);
        toast.addEventListener('mouseenter', () => clearTimeout(timer));
        toast.addEventListener('mouseleave', () => {
            timer = setTimeout(dismiss, 2000);
        });
    }

    return { dismiss };
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}
