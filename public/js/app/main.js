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
import { renderParagraphTrainerScreen } from './paragraph-trainer-route.js';

async function init() {
    initTheme();

    // Ask the browser to protect local data from automatic eviction.
    // Without this, IndexedDB is best-effort storage: Safari purges it
    // after 7 days without a visit, and other browsers may evict it
    // under storage pressure — silently deleting the pupil's documents.
    if (navigator.storage && navigator.storage.persist) {
        navigator.storage.persist().catch(() => {});
    }

    initServiceWorker();
    await initI18n();

    // Purge expired trash documents on startup (silent, non-blocking)
    purgeExpired().catch(() => {});

    const app = document.getElementById('app');
    if (!app) {
        console.error('Missing #app element');
        return;
    }

    let currentScreen = null;
    let routeCounter = 0;

    // First-time onboarding: ask student for school level. Gated per route
    // instead of at init so pure practice surfaces reached by deep link
    // (#/avsnitt) skip the question — the level has no function there.
    // The modal appears on first navigation into the app proper instead.
    // "Velg senere" defers the question for the rest of the session —
    // level-aware features fall back to showing everything, and the level
    // can always be set from the sidebar ("Bytt trinn").
    let levelPromptDeferred = false;
    async function ensureSchoolLevel() {
        if (hasSchoolLevel() || levelPromptDeferred) return;
        const levelId = await showOnboardingModal();
        if (levelId) {
            setSchoolLevel(levelId);
        } else {
            levelPromptDeferred = true;
        }
    }

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

        if (hash !== '#/avsnitt') {
            await ensureSchoolLevel();
            if (localRouteCounter !== routeCounter) return;
        }

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
        } else if (hash === '#/avsnitt') {
            const screen = await renderParagraphTrainerScreen(app);
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
