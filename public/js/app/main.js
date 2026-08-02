/**
 * Main entry point for Skriv.
 * Simple hash-based router: #/ = document list, #/doc/{id} = editor.
 */

import { initI18n } from '../editor-core/shared/i18n.js';
import { initTheme } from '../editor-core/shared/theme.js';
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
    let routeCounter = 0;

    async function route() {
        const localRouteCounter = ++routeCounter;

        if (currentScreen && typeof currentScreen.destroy === 'function') {
            try {
                currentScreen.destroy();
            } catch (err) {
                console.error('Screen destroy failed:', err);
            }
            currentScreen = null;
        }

        const hash = window.location.hash || '#/';

        if (hash.startsWith('#/doc/')) {
            const docId = hash.slice(6);
            const screen = await launchEditor(app, docId, () => {
                window.location.hash = '#/';
            });
            if (localRouteCounter === routeCounter) {
                currentScreen = screen;
            } else if (screen && typeof screen.destroy === 'function') {
                screen.destroy();
            }
        } else if (hash === '#/tysk') {
            const screen = await renderGermanExamScreen(app);
            if (localRouteCounter === routeCounter) {
                currentScreen = screen;
            } else if (screen && typeof screen.destroy === 'function') {
                screen.destroy();
            }
        } else {
            const screen = await renderDocumentList(app, (docId) => {
                window.location.hash = `#/doc/${docId}`;
            });
            if (localRouteCounter === routeCounter) {
                currentScreen = screen;
            } else if (screen && typeof screen.destroy === 'function') {
                screen.destroy();
            }
        }
    }

    window.addEventListener('hashchange', route);
    route();
}

init().catch(err => console.error('Skriv init failed:', err));
