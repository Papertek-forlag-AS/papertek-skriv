/**
 * Route handler for #/tysk — the German Exam Spinner screen.
 *
 * Hosts the portable spinner from editor-core/student/. On task pick,
 * ensures a "Tysk" folder exists, creates a new document inside it
 * pre-populated with the task, and navigates to the standalone-writer.
 */

import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';
import { showInPageConfirm } from '../editor-core/shared/in-page-modal.js';
import { initGermanExamSpinner } from '../editor-core/student/german-exam-spinner.js';
import { createDocument, saveDocument } from './document-store.js';
import { getAllFolders, createFolder, addDocToFolder } from './folder-store.js';

const TYSK_FOLDER_KEY = 'germanExam.folderName';
const WRITE_EXPLAIN_SEEN_KEY = 'germanExam.writeExplainSeen';

async function ensureTyskFolder() {
    const name = t(TYSK_FOLDER_KEY);
    const folders = await getAllFolders();
    const existing = folders.find(f => f.name === name && (!f.parentId || f.parentId === null));
    if (existing) return existing;
    return await createFolder(name, null);
}

function levelLabel(levelKey) {
    return levelKey === 'tysk-2' ? t('germanExam.levelTysk2') : t('germanExam.levelTysk1');
}

// Render a task prompt as semantic HTML — paragraphs separated by blank
// lines, lines starting with "- " or "* " grouped into a single <ul>.
// Mirrors the spinner's card rendering so future Udir prompts with bullets
// don't silently flatten in the seeded document.
function promptToDocHtml(prompt) {
    const blocks = prompt.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    return blocks.map(block => {
        if (/^[-*]\s/m.test(block)) {
            const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
            const firstBullet = lines.findIndex(l => /^[-*]\s/.test(l));
            const prefix = firstBullet > 0 ? lines.slice(0, firstBullet).join(' ') : null;
            const items = lines.slice(firstBullet)
                .filter(l => /^[-*]\s/.test(l))
                .map(l => l.replace(/^[-*]\s+/, ''));
            let out = '';
            if (prefix) out += `<p>${escapeHtml(prefix)}</p>`;
            out += '<ul>' + items.map(i => `<li>${escapeHtml(i)}</li>`).join('') + '</ul>';
            return out;
        }
        return `<p>${escapeHtml(block)}</p>`;
    }).join('');
}

function renderInitialDocHtml(task) {
    // Seeded doc content: only the task framing. The simple+rich drafts
    // live in a side drawer (germanHint metadata on the doc), keeping the
    // writing canvas itself uncluttered. No glossary either — exam
    // conditions assume a dictionary, not a translation list.
    //
    // No <h1>: the doc title input above the editor already shows the full
    // title, so a heading inside the editor is redundant — and an H1 would
    // trigger the auto Table of Contents, which is noise for a single-task
    // document. Title becomes a bold paragraph; if the student wants a
    // proper heading they can enable advanced mode.
    const titleLine = `<p><strong>${escapeHtml(task.title)}</strong></p>`;
    const attribution = `<p><em>${escapeHtml(task.attribution)}</em></p>`;
    const promptHtml = promptToDocHtml(task.prompt);
    const writingSpace = '<p><br></p><p><br></p>';
    return [titleLine, attribution, promptHtml, writingSpace].join('');
}

function stripHtml(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || '';
}

async function handlePickTask(task, levelKey) {
    // First time only: explain that "Write answer" creates a new doc in the
    // Tysk folder. After confirmation we remember the choice so subsequent
    // clicks proceed without interruption.
    if (!localStorage.getItem(WRITE_EXPLAIN_SEEN_KEY)) {
        const proceed = await showInPageConfirm(
            t('germanExam.writeExplainTitle'),
            t('germanExam.writeExplainBody'),
            t('germanExam.writeExplainConfirm'),
            t('common.cancel')
        );
        if (!proceed) return;
        localStorage.setItem(WRITE_EXPLAIN_SEEN_KEY, '1');
    }

    const folder = await ensureTyskFolder();

    const title = t('germanExam.docTitlePattern', {
        level: levelLabel(levelKey),
        term: task.term,
        year: task.year,
        title: task.title,
    });
    const doc = await createDocument(title);
    const html = renderInitialDocHtml(task);
    const germanHint = (task.modelAnswers && (task.modelAnswers.simple || task.modelAnswers.rich))
        ? {
            simple: task.modelAnswers.simple || '',
            rich: task.modelAnswers.rich || '',
        }
        : null;
    await saveDocument(doc.id, {
        html,
        plainText: stripHtml(html),
        ...(germanHint ? { germanHint } : {}),
    });
    await addDocToFolder(doc.id, folder.id);

    window.location.hash = `#/doc/${doc.id}`;
}

let _currentSpinner = null;

/**
 * Render the German exam spinner screen into the given app container.
 */
export function renderGermanExamScreen(appContainer) {
    if (_currentSpinner) {
        try { _currentSpinner.destroy(); } catch {}
        _currentSpinner = null;
    }
    appContainer.innerHTML = '';

    // Simple top bar with a back button to the document list
    const wrapper = document.createElement('div');
    wrapper.className = 'min-h-screen bg-stone-50 dark:bg-stone-900';
    wrapper.innerHTML = `
        <header class="border-b border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-2 flex items-center gap-3">
            <button type="button" data-back class="text-sm underline text-emerald-700 dark:text-emerald-400">← ${escapeHtml(t('common.back') || 'Tilbake')}</button>
            <h1 class="text-base font-semibold">${escapeHtml(t('germanExam.screenTitle'))}</h1>
        </header>
        <main data-spinner-host class="py-6"></main>
    `;
    appContainer.appendChild(wrapper);

    wrapper.querySelector('[data-back]').addEventListener('click', () => {
        window.location.hash = '#/';
    });

    const host = wrapper.querySelector('[data-spinner-host]');
    _currentSpinner = initGermanExamSpinner(host, {
        onPickTask: (task, level) => {
            handlePickTask(task, level).catch(err => {
                console.error('Failed to create German exam document:', err);
            });
        },
    });

    return {
        destroy() {
            if (_currentSpinner) {
                try { _currentSpinner.destroy(); } catch {}
                _currentSpinner = null;
            }
        }
    };
}
