/**
 * Standalone Writer — the main orchestrator for Skriv.
 * Replaces writing-environment.js from lockdown.
 * No Firebase, no lockdown, no tracking. Just writing.
 *
 * Wires up:
 *  - Editor (contenteditable) with formatting toolbar
 *  - Word counter
 *  - Auto-save to IndexedDB (debounced)
 *  - Export to .txt / .pdf
 *  - Document title editing
 */

import { initEditorToolbar } from '../editor-core/student/editor-toolbar.js';
import { downloadText, downloadPDF } from '../editor-core/student/text-export.js';
import { attachWordCounter, countWords } from '../editor-core/shared/word-counter.js';
import { showToast } from '../editor-core/shared/toast-notification.js';
import { t } from '../editor-core/shared/i18n.js';
import { getDocument, saveDocument } from './document-store.js';

/**
 * Launch the standalone editor for a given document.
 * @param {HTMLElement} container - The app container element
 * @param {string} docId - The document ID to load
 * @param {Function} onBack - Called when user navigates back to document list
 */
export async function launchEditor(container, docId, onBack) {
    const doc = await getDocument(docId);
    if (!doc) {
        console.error('Document not found:', docId);
        onBack();
        return;
    }

    container.innerHTML = '';

    // --- Build editor UI ---
    const writingEnv = document.createElement('div');
    writingEnv.id = 'writing-env';
    writingEnv.className = 'flex flex-col h-screen bg-white';

    // Top bar
    const topBar = document.createElement('div');
    topBar.className = 'flex items-center gap-3 px-4 py-2 border-b border-stone-200 bg-stone-50 flex-shrink-0';
    topBar.innerHTML = `
        <button id="btn-back" class="text-sm text-stone-500 hover:text-stone-700 transition-colors flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            ${t('skriv.backToDocuments')}
        </button>
        <div class="flex-1"></div>
        <span id="save-status" class="text-xs text-stone-400"></span>
        <div class="relative">
            <button id="btn-export" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-100 transition-colors">
                ${t('skriv.exportTitle')} &#9660;
            </button>
            <div id="export-menu" class="hidden absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                <button id="btn-download-txt" class="block w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">${t('skriv.downloadTxt')}</button>
                <button id="btn-download-pdf" class="block w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">${t('skriv.downloadPdf')}</button>
            </div>
        </div>
    `;

    // Title input
    const titleRow = document.createElement('div');
    titleRow.className = 'px-4 pt-6 pb-2 max-w-3xl mx-auto w-full';
    titleRow.innerHTML = `
        <input id="doc-title" type="text"
            placeholder="${t('skriv.titlePlaceholder')}"
            value="${escapeAttr(doc.title || '')}"
            class="w-full text-2xl font-bold text-stone-900 placeholder-stone-300 border-none outline-none bg-transparent" />
    `;

    // Editor area
    const editorWrap = document.createElement('div');
    editorWrap.className = 'flex-1 overflow-y-auto px-4';

    const editorInner = document.createElement('div');
    editorInner.className = 'max-w-3xl mx-auto w-full pb-32';

    const editor = document.createElement('div');
    editor.id = 'editor';
    editor.contentEditable = 'true';
    editor.className = 'min-h-[60vh] outline-none text-stone-800 text-base leading-relaxed';
    editor.setAttribute('data-placeholder', t('skriv.placeholder'));

    // Load existing content
    if (doc.html) {
        editor.innerHTML = doc.html;
    } else {
        editor.innerHTML = '<p><br></p>';
    }

    editorInner.appendChild(editor);
    editorWrap.appendChild(editorInner);

    // Word counter bar
    const wordCountBar = document.createElement('div');
    wordCountBar.className = 'px-4 py-2 border-t border-stone-200 bg-stone-50 flex-shrink-0';
    const wordCountDisplay = document.createElement('div');
    wordCountDisplay.className = 'max-w-3xl mx-auto text-xs text-stone-500';
    wordCountBar.appendChild(wordCountDisplay);

    // Assemble
    writingEnv.appendChild(topBar);
    writingEnv.appendChild(titleRow);
    writingEnv.appendChild(editorWrap);
    writingEnv.appendChild(wordCountBar);
    container.appendChild(writingEnv);

    // --- Initialize modules ---
    const toolbarCleanup = initEditorToolbar(editor);
    const counterCleanup = attachWordCounter(editor, wordCountDisplay);

    // --- Back button ---
    topBar.querySelector('#btn-back').addEventListener('click', () => {
        save(); // save before leaving
        toolbarCleanup();
        counterCleanup();
        onBack();
    });

    // --- Export menu ---
    const exportBtn = topBar.querySelector('#btn-export');
    const exportMenu = topBar.querySelector('#export-menu');

    exportBtn.addEventListener('click', () => {
        exportMenu.classList.toggle('hidden');
    });

    // Close menu on outside click
    document.addEventListener('click', (e) => {
        if (!exportBtn.contains(e.target) && !exportMenu.contains(e.target)) {
            exportMenu.classList.add('hidden');
        }
    });

    const titleInput = titleRow.querySelector('#doc-title');
    const getTitle = () => titleInput.value || t('skriv.untitled');

    topBar.querySelector('#btn-download-txt').addEventListener('click', () => {
        exportMenu.classList.add('hidden');
        downloadText({
            title: getTitle(),
            studentName: '',
            text: editor.innerText || ''
        });
    });

    topBar.querySelector('#btn-download-pdf').addEventListener('click', () => {
        exportMenu.classList.add('hidden');
        downloadPDF({
            title: getTitle(),
            studentName: '',
            text: editor.innerText || '',
            html: editor.innerHTML || ''
        });
    });

    // --- Auto-save with debounce ---
    const saveStatusEl = topBar.querySelector('#save-status');
    let saveTimer = null;
    let lastSavedHtml = doc.html || '';

    async function save() {
        const html = editor.innerHTML;
        const plainText = editor.innerText || '';
        const title = titleInput.value;
        const wc = countWords(plainText);

        // Skip if nothing changed
        if (html === lastSavedHtml && title === doc.title) return;

        saveStatusEl.textContent = t('skriv.saving');

        try {
            await saveDocument(docId, {
                html,
                plainText,
                title,
                wordCount: wc,
            });
            lastSavedHtml = html;
            doc.title = title;
            saveStatusEl.textContent = t('skriv.saved');
            setTimeout(() => {
                if (saveStatusEl.textContent === t('skriv.saved')) {
                    saveStatusEl.textContent = '';
                }
            }, 2000);
        } catch (err) {
            console.error('Save failed:', err);
            saveStatusEl.textContent = t('common.error');
        }
    }

    function scheduleSave() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 1000);
    }

    editor.addEventListener('input', scheduleSave);
    titleInput.addEventListener('input', scheduleSave);

    // Save on page unload
    window.addEventListener('beforeunload', save);

    // --- Placeholder CSS ---
    const style = document.createElement('style');
    style.textContent = `
        #editor:empty::before,
        #editor:has(> p:only-child > br:only-child)::before {
            content: attr(data-placeholder);
            color: #a8a29e;
            pointer-events: none;
            position: absolute;
        }
        #editor { position: relative; }
    `;
    document.head.appendChild(style);

    // Focus the editor
    editor.focus();
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
