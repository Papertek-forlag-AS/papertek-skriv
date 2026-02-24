/**
 * Service Worker Manager for Skriv.
 * Handles registration, update detection, and forced refresh.
 * Disabled on localhost to avoid caching headaches during dev.
 *
 * Pattern borrowed from Papertek's tysk project (service-worker-manager.js).
 */

import { t } from '../editor-core/shared/i18n.js';
import { showToast } from '../editor-core/shared/toast-notification.js';

const isLocalhost = () =>
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.');

/**
 * Initialise the service worker. Call once from main.js.
 */
export function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    // --- Dev mode: no SW, clean slate ---
    if (isLocalhost()) {
        navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
        });
        return;
    }

    // --- Production: register + listen for updates ---
    navigator.serviceWorker.register('/sw.js')
        .then(registration => {
            // Already a new worker waiting (e.g. user returned to a stale tab)
            if (registration.waiting) {
                showUpdatePrompt(registration.waiting);
            }

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version downloaded and ready
                        showUpdatePrompt(newWorker);
                    }
                });
            });
        })
        .catch(err => console.warn('SW registration failed:', err));

    // When a new SW takes over, reload so the user gets fresh code
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    });
}

/* ------------------------------------------------------------------ */

/**
 * Show a small bar at the top prompting the user to update.
 */
function showUpdatePrompt(waitingWorker) {
    if (document.getElementById('sw-update-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'sw-update-bar';
    bar.style.cssText = `
        position: fixed; top: 0; left: 0; right: 0; z-index: 9999;
        display: flex; align-items: center; justify-content: center; gap: 12px;
        padding: 10px 16px;
        background: #065f46; color: white;
        font-size: 14px; font-family: system-ui, sans-serif;
    `;
    bar.innerHTML = `
        <span>${t('sw.updateAvailable')}</span>
        <button id="sw-update-btn" style="
            padding: 4px 14px; border-radius: 6px;
            background: white; color: #065f46;
            font-weight: 600; font-size: 13px;
            border: none; cursor: pointer;
        ">${t('sw.updateNow')}</button>
    `;
    document.body.prepend(bar);

    document.getElementById('sw-update-btn').addEventListener('click', async () => {
        bar.innerHTML = `<span>${t('sw.updating')}</span>`;

        try {
            // 1. Clear all caches
            const names = await caches.keys();
            await Promise.all(names.map(n => caches.delete(n)));

            // 2. Tell waiting worker to activate
            waitingWorker.postMessage({ type: 'SKIP_WAITING' });

            // controllerchange handler above will reload the page
        } catch (err) {
            console.error('Update failed:', err);
            window.location.reload();
        }
    });
}
