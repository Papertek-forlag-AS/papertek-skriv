/**
 * Standalone Writer — the main orchestrator for Skriv.
 * Replaces writing-environment.js from lockdown.
 * No Firebase, no lockdown, no tracking. Just writing.
 *
 * Wires up:
 *  - Editor (contenteditable) with formatting toolbar
 *  - Advanced toggle (lists, H1/H2 hidden by default)
 *  - Table of Contents (auto-generated when headings exist)
 *  - References (inline citations + bibliography)
 *  - Word counter
 *  - Auto-save to IndexedDB (debounced)
 *  - Export to .txt / .pdf
 *  - Document title editing
 */

import { initEditorToolbar } from '../editor-core/student/editor-toolbar.js';
import { initTOC } from '../editor-core/student/toc-manager.js';
import { initReferences } from '../editor-core/student/reference-manager.js';
import { initFrameManager } from '../editor-core/student/frame-manager.js';
import { initFrameSelector } from '../editor-core/student/frame-selector.js';
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
    topBar.className = 'flex items-center gap-2 px-4 py-2 border-b border-stone-200 bg-stone-50 flex-shrink-0';
    topBar.innerHTML = `
        <button id="btn-back" class="text-sm text-stone-500 hover:text-stone-700 transition-colors flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            ${t('skriv.backToDocuments')}
        </button>
        <div class="flex-1"></div>
        <span id="save-status" class="text-xs text-stone-400"></span>
        <div class="flex items-center gap-1.5">
            <button id="btn-structure" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-100 transition-colors flex items-center gap-1.5"
                title="${t('skriv.strukturTooltip')}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h10M4 18h14"/></svg>
                Struktur
            </button>
            <button id="btn-advanced" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-100 transition-colors flex items-center gap-1.5"
                title="${t('skriv.advancedToggle')}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
                ${t('skriv.advancedToggle')}
            </button>
            <button id="btn-ref" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 text-stone-500 hover:bg-stone-100 transition-colors flex items-center gap-1.5"
                title="${t('skriv.refButton')}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                ${t('skriv.refButton')}
            </button>
            <div class="relative">
                <button id="btn-export" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-100 transition-colors">
                    ${t('skriv.exportTitle')} &#9660;
                </button>
                <div id="export-menu" class="hidden absolute right-0 top-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                    <button id="btn-download-txt" class="block w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">${t('skriv.downloadTxt')}</button>
                    <button id="btn-download-pdf" class="block w-full text-left px-4 py-2 text-sm text-stone-700 hover:bg-stone-50 transition-colors">${t('skriv.downloadPdf')}</button>
                </div>
            </div>
        </div>
    `;

    // Title input
    const titleRow = document.createElement('div');
    titleRow.className = 'px-4 pt-6 pb-2 max-w-3xl mx-auto w-full';
    titleRow.innerHTML = `
        <input id="doc-title" type="text"
            placeholder="${escapeAttr(t('skriv.titlePlaceholder'))}"
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
    const toolbarApi = initEditorToolbar(editor);
    const tocApi = initTOC(editor);
    const refsApi = initReferences(editor, { onSave: scheduleSave });
    const frameApi = initFrameManager(editor, { onSave: scheduleSave });
    const counterCleanup = attachWordCounter(editor, wordCountDisplay);

    // Load saved references
    if (doc.references && doc.references.length > 0) {
        refsApi.loadReferences(doc.references);
    }

    // Rehydrate frame state from saved document
    if (doc.frameType) {
        frameApi.setActiveFrameType(doc.frameType);
    }

    // --- Frame selector (Struktur button) ---
    const strukturBtn = topBar.querySelector('#btn-structure');
    const frameSelectorApi = initFrameSelector(strukturBtn, editor, frameApi, {
        onFrameApplied: () => {
            // Auto-enable advanced mode when a frame is applied
            if (!toolbarApi.isAdvancedMode()) {
                toolbarApi.setAdvancedMode(true);
            }
        },
    });

    // Update Struktur button state on load (in case frame was rehydrated)
    if (doc.frameType) {
        frameSelectorApi.updateButtonState();
    }

    // --- Advanced toggle button ---
    const advancedBtn = topBar.querySelector('#btn-advanced');

    let suppressToast = true; // Suppress toast on initial auto-detect

    function updateAdvancedUI(enabled) {
        if (enabled) {
            advancedBtn.classList.remove('text-stone-500', 'border-stone-200');
            advancedBtn.classList.add('text-emerald-700', 'border-emerald-400', 'bg-emerald-50');
            // Check if headings exist — if so, auto-insert TOC
            const hasHeadings = editor.querySelectorAll('h1, h2').length > 0;
            if (hasHeadings && !tocApi.hasTOC()) {
                tocApi.insert();
            }
            tocApi.update();
            if (!suppressToast) showToast(t('skriv.advancedOn'), { duration: 1500 });
        } else {
            advancedBtn.classList.remove('text-emerald-700', 'border-emerald-400', 'bg-emerald-50');
            advancedBtn.classList.add('text-stone-500', 'border-stone-200');
            tocApi.remove();
            if (!suppressToast) showToast(t('skriv.advancedOff'), { duration: 1500 });
        }
        if (!suppressToast) scheduleSave();
    }

    // Listen for advanced mode changes from toolbar (including auto-detect)
    toolbarApi.onAdvancedChange(updateAdvancedUI);

    // Allow toasts after initial auto-detect has had a chance to fire
    setTimeout(() => { suppressToast = false; }, 100);

    advancedBtn.addEventListener('click', () => {
        toolbarApi.toggleAdvancedMode();
    });

    // --- Auto-TOC: insert/remove TOC based on heading presence ---
    // When advanced mode is on and student adds their first H1/H2, auto-insert TOC.
    // When all headings are removed, TOC shows "no headings" message (handled by toc-manager).
    let autoTocTimer = null;
    editor.addEventListener('input', () => {
        if (!toolbarApi.isAdvancedMode()) return;
        if (autoTocTimer) clearTimeout(autoTocTimer);
        autoTocTimer = setTimeout(() => {
            const hasHeadings = editor.querySelectorAll('h1, h2').length > 0;
            if (hasHeadings && !tocApi.hasTOC()) {
                tocApi.insert();
            }
        }, 500);
    });

    // --- Reference button ---
    topBar.querySelector('#btn-ref').addEventListener('click', () => {
        refsApi.openDialog();
    });

    // --- Back button ---
    topBar.querySelector('#btn-back').addEventListener('click', () => {
        save();
        toolbarApi.destroy();
        tocApi.destroy();
        refsApi.destroy();
        frameApi.destroy();
        frameSelectorApi.destroy();
        counterCleanup();
        onBack();
    });

    // --- Export menu ---
    const exportBtn = topBar.querySelector('#btn-export');
    const exportMenu = topBar.querySelector('#export-menu');

    exportBtn.addEventListener('click', () => {
        exportMenu.classList.toggle('hidden');
    });

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
            text: frameApi.hasFrame() ? frameApi.getCleanText() : (editor.innerText || '')
        });
    });

    topBar.querySelector('#btn-download-pdf').addEventListener('click', () => {
        exportMenu.classList.add('hidden');
        downloadPDF({
            title: getTitle(),
            studentName: '',
            text: frameApi.hasFrame() ? frameApi.getCleanText() : (editor.innerText || ''),
            html: editor.innerHTML || '',
            references: refsApi.getReferences(),
        });
    });

    // --- Auto-save with debounce ---
    const saveStatusEl = topBar.querySelector('#save-status');
    let saveTimer = null;
    let lastSavedHtml = doc.html || '';

    async function save() {
        const html = editor.innerHTML;
        const plainText = frameApi.hasFrame() ? frameApi.getCleanText() : (editor.innerText || '');
        const title = titleInput.value;
        const wc = countWords(plainText);
        const refs = refsApi.getReferences();
        const frameType = frameApi.getActiveFrame();

        // Skip if nothing changed
        if (html === lastSavedHtml && title === doc.title) return;

        saveStatusEl.textContent = t('skriv.saving');

        try {
            await saveDocument(docId, {
                html,
                plainText,
                title,
                wordCount: wc,
                references: refs,
                frameType,
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
    return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
