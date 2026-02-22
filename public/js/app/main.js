/**
 * Main entry point for Skriv.
 * Simple hash-based router: #/ = document list, #/doc/{id} = editor.
 */

import { initI18n } from '../editor-core/shared/i18n.js';
import { renderDocumentList } from './document-list.js';
import { launchEditor } from './standalone-writer.js';
import { purgeExpired } from './trash-store.js';

async function init() {
    await initI18n();

    // Purge expired trash documents on startup (silent, non-blocking)
    purgeExpired().then(count => {
        if (count > 0) console.log(`Purged ${count} expired document(s) from trash`);
    }).catch(err => console.warn('Trash purge failed:', err));

    const app = document.getElementById('app');
    if (!app) {
        console.error('Missing #app element');
        return;
    }

    function route() {
        const hash = window.location.hash || '#/';

        if (hash.startsWith('#/doc/')) {
            const docId = hash.slice(6);
            launchEditor(app, docId, () => {
                window.location.hash = '#/';
            });
        } else {
            renderDocumentList(app, (docId) => {
                window.location.hash = `#/doc/${docId}`;
            });
        }
    }

    window.addEventListener('hashchange', route);
    route();
}

init().catch(err => console.error('Skriv init failed:', err));
