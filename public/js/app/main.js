/**
 * Main entry point for Skriv.
 * Simple hash-based router: #/ = document list, #/doc/{id} = editor.
 */

import { initI18n } from '../editor-core/shared/i18n.js';
import { renderDocumentList } from './document-list.js';
import { launchEditor } from './standalone-writer.js';

async function init() {
    await initI18n();

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
