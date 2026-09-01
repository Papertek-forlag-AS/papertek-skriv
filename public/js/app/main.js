/**
 * Main entry point for Skriv.
 * Simple hash-based router: #/ = document list, #/doc/{id} = editor.
 */

import { getCurrentLanguage, initI18n, t } from '../editor-core/shared/i18n.js';
import { initTheme } from '../editor-core/shared/theme.js';
import { showToast } from '../editor-core/shared/toast-notification.js';
import { renderDocumentList, renderTrashView } from './document-list.js';
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

    // Keep the static Bokmål fallback usable before JavaScript starts, then
    // localize the document and its first keyboard-navigation affordance.
    document.documentElement.lang = getCurrentLanguage();
    const skipLink = document.getElementById('skip-to-content');
    if (skipLink) skipLink.textContent = t('a11y.skipToContent');

    document.addEventListener('skriv:database-blocked', () => {
        showToast(t('skriv.databaseBlocked'), { duration: 10000 });
    });

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

        if (hash !== '#/avsnitt') {
            await ensureSchoolLevel();
            if (localRouteCounter !== routeCounter) return;
        }

        if (hash.startsWith('#/doc/')) {
            const [docId, queryString = ''] = hash.slice(6).split('?');
            const routeParams = new URLSearchParams(queryString);
            const screen = await launchEditor(app, docId, () => {
                window.location.hash = '#/';
            }, { initialFocus: routeParams.get('focus') === 'title' ? 'title' : 'editor' });
            currentScreen = screen;
            renderedHash = hash;
        } else if (hash === '#/tysk') {
            const screen = await renderGermanExamScreen(app);
            currentScreen = screen;
            renderedHash = hash;
        } else if (hash === '#/avsnitt') {
            const screen = await renderParagraphTrainerScreen(app);
            currentScreen = screen;
            renderedHash = hash;
        } else if (hash === '#/trash') {
            const screen = await renderTrashView(app, () => {
                window.location.hash = '#/';
            });
            currentScreen = screen;
            renderedHash = hash;
        } else {
            const screen = await renderDocumentList(app, (docId, options = {}) => {
                const focus = options.focusTitle ? '?focus=title' : '';
                window.location.hash = `#/doc/${docId}${focus}`;
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
