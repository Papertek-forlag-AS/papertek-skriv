/**
 * Main entry point for Skriv.
 * Simple hash-based router: #/ = document list, #/doc/{id} = editor.
 */

import { getCurrentLanguage, initI18n, t } from '../editor-core/shared/i18n.js';
import { initTheme } from '../editor-core/shared/theme.js';
import { showToast } from '../editor-core/shared/toast-notification.js';
import { renderDocumentList } from './document-list.js';
import { launchEditor } from './standalone-writer.js';
import { purgeExpired } from './trash-store.js';
import { initServiceWorker } from './sw-manager.js';
import { hasSchoolLevel, setSchoolLevel } from './school-level.js';
import { showOnboardingModal } from './onboarding-modal.js';
import { renderGermanExamScreen } from './german-exam-route.js';

async function init() {
    initTheme();
    initServiceWorker();
    await initI18n();

    // Keep the static Bokmål fallback usable before JavaScript starts, then
    // localize the document and its first keyboard-navigation affordance.
    document.documentElement.lang = getCurrentLanguage();
    const skipLink = document.getElementById('skip-to-content');
    if (skipLink) skipLink.textContent = t('a11y.skipToContent');

    document.addEventListener('skriv:database-blocked', () => {
        showToast(t('skriv.databaseBlocked'), { duration: 10000 });
    });

    // First-time onboarding: ask student for school level
    if (!hasSchoolLevel()) {
        const levelId = await showOnboardingModal();
        setSchoolLevel(levelId);
    }

    // Purge expired trash documents on startup (silent, non-blocking)
    purgeExpired().catch(() => {});

    const app = document.getElementById('app');
    if (!app) {
        console.error('Missing #app element');
        return;
    }

    let currentScreen = null;
    let renderedHash = window.location.hash || '#/';
    let routeCounter = 0;
    let routeQueue = Promise.resolve();

    async function performRoute(localRouteCounter) {
        // Coalesce hash changes that arrived before this queued route began.
        if (localRouteCounter !== routeCounter) return;

        if (currentScreen && typeof currentScreen.destroy === 'function') {
            const previousScreen = currentScreen;
            currentScreen = null;
            try {
                await previousScreen.destroy();
            } catch (err) {
                console.error('Screen destroy failed:', err);
                // A writer teardown only rejects when its final save failed.
                // Keep that screen mounted and restore its URL so a transient
                // storage error cannot turn navigation into data loss.
                currentScreen = previousScreen;
                if (window.location.hash !== renderedHash) {
                    window.history.replaceState(null, '', renderedHash);
                }
                return;
            }
        }

        // A newer hash was queued while an async teardown was flushing. Let
        // that queued route render the latest destination exactly once.
        if (localRouteCounter !== routeCounter) return;

        const hash = window.location.hash || '#/';

        if (hash.startsWith('#/doc/')) {
            const docId = hash.slice(6);
            const screen = await launchEditor(app, docId, () => {
                window.location.hash = '#/';
            });
            currentScreen = screen;
            renderedHash = hash;
        } else if (hash === '#/tysk') {
            const screen = await renderGermanExamScreen(app);
            currentScreen = screen;
            renderedHash = hash;
        } else {
            const screen = await renderDocumentList(app, (docId) => {
                window.location.hash = `#/doc/${docId}`;
            });
            currentScreen = screen;
            renderedHash = hash;
        }
    }

    function route() {
        const localRouteCounter = ++routeCounter;
        routeQueue = routeQueue
            .then(() => performRoute(localRouteCounter))
            .catch((err) => console.error('Route failed:', err));
        return routeQueue;
    }

    window.addEventListener('hashchange', route);
    route();
}

init().catch(err => console.error('Skriv init failed:', err));
