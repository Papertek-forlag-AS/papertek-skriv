/**
 * Service Worker Manager for Skriv.
 * Registers the worker and lets the student choose when a waiting update may
 * activate. Open editors get an awaited save hook before activation/reload.
 * Disabled on localhost to avoid caching headaches during development.
 */

import { t } from '../editor-core/shared/i18n.js';
import { showToast } from '../editor-core/shared/toast-notification.js';

const BEFORE_APP_RELOAD_EVENT = 'skriv:before-app-reload';
const APP_RELOAD_CANCELLED_EVENT = 'skriv:app-reload-cancelled';

const isLocalhost = () =>
    window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.');

/**
 * Give mounted screens a chance to persist local state before activation.
 * Listeners register promises through detail.waitUntil(), mirroring the
 * service-worker event pattern.
 */
async function flushBeforeAppReload() {
    const pending = [];
    const waitUntil = (promise) => {
        pending.push(
            Promise.resolve(promise).then((result) => {
                if (result === false) throw new Error('A reload safety hook failed');
            })
        );
    };

    document.dispatchEvent(new CustomEvent(BEFORE_APP_RELOAD_EVENT, {
        detail: { waitUntil },
    }));
    await Promise.all(pending);
}

/** Initialise the service worker. Call once from main.js. */
export function initServiceWorker() {
    if (!('serviceWorker' in navigator)) return;

    // --- Dev mode: no SW, clean slate ---
    if (isLocalhost()) {
        navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
        });
        return;
    }

    let reloadRequested = false;

    async function activateWaitingWorker(waitingWorker) {
        await flushBeforeAppReload();
        reloadRequested = true;
        try {
            waitingWorker.postMessage({ type: 'SKIP_WAITING' });
        } catch (err) {
            reloadRequested = false;
            throw err;
        }
    }

    // --- Production: register + listen for updates ---
    navigator.serviceWorker.register('/sw.js')
        .then(registration => {
            // Already a new worker waiting (e.g. user returned to a stale tab)
            if (registration.waiting) {
                showUpdatePrompt(registration.waiting, activateWaitingWorker);
            }

            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;
                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        // New version downloaded and ready; it remains waiting
                        // until the student explicitly accepts the prompt.
                        showUpdatePrompt(newWorker, activateWaitingWorker);
                    }
                });
            });
        })
        .catch(err => console.warn('SW registration failed:', err));

    // Initial installation may claim this page, but must never reload it.
    // Reload only follows an explicit click after every save hook has settled.
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!reloadRequested || refreshing) return;
        refreshing = true;
        window.location.reload();
    });
}

/* ------------------------------------------------------------------ */

/** Show a small bar at the top prompting the user to update. */
function showUpdatePrompt(waitingWorker, activateWaitingWorker) {
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
            await activateWaitingWorker(waitingWorker);
            // controllerchange above reloads after the waiting worker activates.
        } catch (err) {
            console.error('Update failed:', err);
            document.dispatchEvent(new CustomEvent(APP_RELOAD_CANCELLED_EVENT));
            bar.remove();
            showToast(t('skriv.saveError'));
            showUpdatePrompt(waitingWorker, activateWaitingWorker);
        }
    });
}
