/**
 * Route handler for #/avsnitt — the Paragraph Trainer screen.
 *
 * Hosts the portable three-step paragraph trainer from editor-core/student/.
 * Pure practice surface: nothing is written to IndexedDB — the in-progress
 * attempt lives in localStorage inside the trainer itself.
 */

import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';
import { initParagraphTrainer } from '../editor-core/student/paragraph-trainer.js';
import { getSchoolLevel } from './school-level.js';
import { createDocument, saveDocument } from './document-store.js';

let _currentTrainer = null;

/**
 * Render the paragraph trainer screen into the given app container.
 */
export function renderParagraphTrainerScreen(appContainer) {
    if (_currentTrainer) {
        try { _currentTrainer.destroy(); } catch {}
        _currentTrainer = null;
    }
    appContainer.innerHTML = '';

    // Simple top bar with a back button to the document list
    const wrapper = document.createElement('div');
    wrapper.className = 'min-h-screen bg-stone-50 dark:bg-stone-900';
    wrapper.innerHTML = `
        <header class="border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-2 flex items-center gap-3">
            <button type="button" data-back class="text-sm underline text-emerald-700 dark:text-emerald-400">← ${escapeHtml(t('common.back'))}</button>
            <h1 class="text-base font-semibold">${escapeHtml(t('paragraphTrainer.screenTitle'))}</h1>
        </header>
        <main data-trainer-host class="py-6"></main>
    `;
    appContainer.appendChild(wrapper);

    wrapper.querySelector('[data-back]').addEventListener('click', () => {
        window.location.hash = '#/';
    });

    _currentTrainer = initParagraphTrainer(wrapper.querySelector('[data-trainer-host]'), {
        getLevel: getSchoolLevel,
        // Bridge from drill to real writing: the finished paragraph becomes
        // a document and the editor opens, so the practice leaves an artefact.
        onSaveDocument: async ({ title, text }) => {
            const doc = await createDocument((title || '').slice(0, 80));
            await saveDocument(doc.id, {
                html: `<p>${escapeHtml(text)}</p>`,
                plainText: text,
                wordCount: text.trim().split(/\s+/).filter(Boolean).length,
            });
            window.location.hash = `#/doc/${doc.id}`;
        },
    });

    return {
        destroy() {
            if (_currentTrainer) {
                try { _currentTrainer.destroy(); } catch {}
                _currentTrainer = null;
            }
        }
    };
}
