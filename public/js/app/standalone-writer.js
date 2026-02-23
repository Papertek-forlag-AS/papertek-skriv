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
 *  - Auto-save to IndexedDB (via auto-save module)
 *  - Export to .txt / .pdf
 *  - Document title editing
 */

import { initEditorToolbar } from '../editor-core/student/editor-toolbar.js';
import { initTOC } from '../editor-core/student/toc-manager.js';
import { initReferences } from '../editor-core/student/reference-manager.js';
import { initFrameManager } from '../editor-core/student/frame-manager.js';
import { initFrameSelector } from '../editor-core/student/frame-selector.js';
import { initWritingSpinner } from '../editor-core/student/writing-spinner.js';
import { initWordFrequency } from '../editor-core/student/word-frequency.js';
import { initSentenceLength } from '../editor-core/student/sentence-length.js';
import { initParagraphMap } from '../editor-core/student/paragraph-map.js';
// import { initImageManager } from '../editor-core/student/image-manager.js'; // Deactivated
// import { initMatte } from '../editor-core/student/matte.js'; // Deactivated — re-enable when subject choice is added
import { showSubmissionChecklist } from '../editor-core/student/submission-checklist.js';
import { downloadText, downloadPDF } from '../editor-core/student/text-export.js';
import { escapeAttr } from '../editor-core/shared/html-escape.js';
import { attachWordCounter, countWords } from '../editor-core/shared/word-counter.js';
import { createAutoSave } from '../editor-core/shared/auto-save.js';
import { showToast } from '../editor-core/shared/toast-notification.js';
import { t } from '../editor-core/shared/i18n.js';
import { getDocument, saveDocument } from './document-store.js';
import { createTagEditor } from './document-tags.js';
import { createSubjectPicker, createSubjectBadge } from './subject-picker.js';

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
    writingEnv.className = 'flex flex-col h-screen bg-white dark:bg-stone-900';

    // Top bar
    const topBar = document.createElement('div');
    topBar.className = 'flex items-center gap-2 px-4 py-2 border-b border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 flex-shrink-0';
    topBar.innerHTML = `
        <button id="btn-back" class="text-sm text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors flex items-center gap-1">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            ${t('skriv.backToDocuments')}
        </button>
        <div class="flex-1"></div>
        <span id="save-status" class="text-xs text-stone-400"></span>
        <div class="skriv-toolbar-buttons flex items-center gap-1.5 min-w-0">
            <button id="btn-structure" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5"
                title="${t('skriv.strukturTooltip')}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h10M4 18h14"/></svg>
                Struktur
            </button>
            <button id="btn-advanced" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5"
                title="${t('skriv.advancedToggle')}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
                ${t('skriv.advancedToggle')}
            </button>
            <button id="btn-ref" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5"
                title="${t('skriv.refButton')}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>
                ${t('skriv.refButton')}
            </button>
            <!-- Bilde button deactivated
            <button id="btn-image" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5"
                title="${t('image.button')}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>
                ${t('image.button')}
            </button>
            -->
            <button id="btn-spinner" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5"
                title="${t('spinner.title')}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                ${t('spinner.title')}
            </button>
            <button id="btn-radar" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5"
                title="${t('radar.button')}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                ${t('radar.button')}
            </button>
            <button id="btn-sentence-length" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5"
                title="${t('sentence.button')}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                ${t('sentence.button')}
            </button>
            <button id="btn-paragraph-map" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5"
                title="${t('paragraphMap.button')}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"/></svg>
                ${t('paragraphMap.button')}
            </button>
        </div>
        <div class="relative flex-shrink-0">
            <button id="btn-export" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
                ${t('skriv.exportTitle')} &#9660;
            </button>
            <div id="export-menu" class="hidden absolute right-0 top-full mt-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                <button id="btn-download-txt" class="block w-full text-left px-4 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">${t('skriv.downloadTxt')}</button>
                <button id="btn-download-pdf" class="block w-full text-left px-4 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">${t('skriv.downloadPdf')}</button>
            </div>
        </div>
    `;

    // Title input
    const titleRow = document.createElement('div');
    titleRow.className = 'px-4 pt-6 pb-1 max-w-3xl mx-auto w-full';
    titleRow.innerHTML = `
        <input id="doc-title" type="text"
            placeholder="${escapeAttr(t('skriv.titlePlaceholder'))}"
            value="${escapeAttr(doc.title || '')}"
            class="w-full text-2xl font-bold text-stone-900 dark:text-stone-100 placeholder-stone-300 dark:placeholder-stone-600 border-none outline-none bg-transparent" />
    `;

    // Tag editor (below title)
    const tagRow = document.createElement('div');
    tagRow.className = 'px-4 pb-1 max-w-3xl mx-auto w-full';
    const tagEditorApi = createTagEditor(tagRow, doc.tags || [], (updatedTags) => {
        autoSave.schedule();
    });

    // Subject picker (below tags)
    const subjectRow = document.createElement('div');
    subjectRow.className = 'px-4 pb-2 pt-1 max-w-3xl mx-auto w-full flex items-center gap-2 border-t border-stone-100 dark:border-stone-800';
    const subjectLabel = document.createElement('span');
    subjectLabel.className = 'text-xs text-stone-400 dark:text-stone-500';
    subjectLabel.textContent = t('sidebar.subjectLabel') + ':';
    subjectRow.appendChild(subjectLabel);
    const subjectBadge = createSubjectBadge(doc.subject || null);
    subjectRow.appendChild(subjectBadge);
    let currentSubject = doc.subject || null;
    const subjectPickerApi = createSubjectPicker(subjectBadge, currentSubject, (newSubject) => {
        currentSubject = newSubject;
        // Update badge display
        const newBadge = createSubjectBadge(newSubject);
        subjectBadge.replaceWith(newBadge);
        subjectPickerApi.setSubject(newSubject);
        // Re-attach picker to new badge
        newBadge.addEventListener('click', (e) => {
            e.stopPropagation();
            subjectBadge.click();
        });
        autoSave.schedule();
    });

    // Editor area
    const editorWrap = document.createElement('div');
    editorWrap.className = 'flex-1 overflow-y-auto px-4';

    const editorInner = document.createElement('div');
    editorInner.className = 'max-w-3xl mx-auto w-full pb-32';

    const editor = document.createElement('div');
    editor.id = 'editor';
    editor.contentEditable = 'true';
    editor.className = 'min-h-[60vh] outline-none text-stone-800 dark:text-stone-200 text-base leading-relaxed';
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
    wordCountBar.className = 'px-4 py-2 border-t border-stone-200 dark:border-stone-700 bg-stone-50 dark:bg-stone-800 flex-shrink-0';
    const wordCountDisplay = document.createElement('div');
    wordCountDisplay.className = 'max-w-3xl mx-auto text-xs text-stone-500';
    wordCountBar.appendChild(wordCountDisplay);

    // Assemble
    writingEnv.appendChild(topBar);
    writingEnv.appendChild(titleRow);
    writingEnv.appendChild(tagRow);
    writingEnv.appendChild(subjectRow);
    writingEnv.appendChild(editorWrap);
    writingEnv.appendChild(wordCountBar);
    container.appendChild(writingEnv);

    // --- Element references ---
    const titleInput = titleRow.querySelector('#doc-title');
    const saveStatusEl = topBar.querySelector('#save-status');

    // --- Auto-save (separate module) ---
    const autoSave = createAutoSave({
        saveFn: async (state) => {
            await saveDocument(docId, state);
            doc.title = state.title;
        },
        getState: () => {
            const plainText = frameApi.hasFrame() ? frameApi.getCleanText() : (editor.innerText || '');
            return {
                html: editor.innerHTML,
                plainText,
                title: titleInput.value,
                wordCount: countWords(plainText),
                references: refsApi.getReferences(),
                frameType: frameApi.getActiveFrame(),
                tags: tagEditorApi.getTags(),
                subject: currentSubject,
            };
        },
        statusEl: saveStatusEl,
        debounceMs: 1000,
        labels: {
            saving: t('skriv.saving'),
            saved:  t('skriv.saved'),
            error:  t('common.error'),
        },
    });

    // --- Initialize modules ---
    const toolbarApi = initEditorToolbar(editor);
    // const matteApi = initMatte(editor, toolbarApi.toolbarEl); // Deactivated
    const tocApi = initTOC(editor);
    const refsApi = initReferences(editor, { onSave: autoSave.schedule });
    const frameApi = initFrameManager(editor, { onSave: autoSave.schedule });
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

    // --- Writing Spinner ---
    const spinnerApi = initWritingSpinner(editor, writingEnv);
    const spinnerBtn = topBar.querySelector('#btn-spinner');
    spinnerBtn.addEventListener('click', () => {
        spinnerApi.show();
    });

    // --- Repetition Radar ---
    const radarApi = initWordFrequency(editor, writingEnv, {
        onWordClick: (word, range) => {
            // Open synonym popup if synonym data exists for this word
            // The synonym popup is handled by the spinner's dblclick handler,
            // but we can also trigger it by simulating a selection + showing spinner
            editor.focus();
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        },
    });
    const radarBtn = topBar.querySelector('#btn-radar');
    radarBtn.addEventListener('click', () => {
        const isNowActive = radarApi.toggle();
        if (isNowActive) {
            radarBtn.classList.remove('text-stone-500', 'border-stone-200');
            radarBtn.classList.add('text-amber-700', 'border-amber-400', 'bg-amber-50');
            showToast(t('radar.on'), { duration: 1500 });
        } else {
            radarBtn.classList.remove('text-amber-700', 'border-amber-400', 'bg-amber-50');
            radarBtn.classList.add('text-stone-500', 'border-stone-200');
            showToast(t('radar.off'), { duration: 1500 });
        }
    });

    // --- Sentence Length Visualization ---
    const sentenceApi = initSentenceLength(editor, writingEnv);
    const sentenceBtn = topBar.querySelector('#btn-sentence-length');
    sentenceBtn.addEventListener('click', () => {
        const isNowActive = sentenceApi.toggle();
        if (isNowActive) {
            sentenceBtn.classList.remove('text-stone-500', 'border-stone-200');
            sentenceBtn.classList.add('text-blue-700', 'border-blue-400', 'bg-blue-50');
            showToast(t('sentence.on'), { duration: 1500 });
        } else {
            sentenceBtn.classList.remove('text-blue-700', 'border-blue-400', 'bg-blue-50');
            sentenceBtn.classList.add('text-stone-500', 'border-stone-200');
            showToast(t('sentence.off'), { duration: 1500 });
        }
    });

    // --- Paragraph Map (minimap) ---
    const paragraphMapApi = initParagraphMap(editor, editorWrap);
    const paragraphMapBtn = topBar.querySelector('#btn-paragraph-map');
    paragraphMapBtn.addEventListener('click', () => {
        const isNowActive = paragraphMapApi.toggle();
        if (isNowActive) {
            paragraphMapBtn.classList.remove('text-stone-500', 'border-stone-200');
            paragraphMapBtn.classList.add('text-violet-700', 'border-violet-400', 'bg-violet-50');
            showToast(t('paragraphMap.on'), { duration: 1500 });
        } else {
            paragraphMapBtn.classList.remove('text-violet-700', 'border-violet-400', 'bg-violet-50');
            paragraphMapBtn.classList.add('text-stone-500', 'border-stone-200');
            showToast(t('paragraphMap.off'), { duration: 1500 });
        }
    });

    // --- Image Manager (deactivated) ---
    // const imageApi = initImageManager(editor, { onInsert: autoSave.schedule });
    // const imageBtn = topBar.querySelector('#btn-image');
    // imageBtn.addEventListener('click', () => {
    //     imageApi.openFilePicker();
    // });

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
        if (!suppressToast) autoSave.schedule();
    }

    // Listen for advanced mode changes from toolbar (including auto-detect)
    toolbarApi.onAdvancedChange(updateAdvancedUI);

    // Allow toasts after initial auto-detect has had a chance to fire
    setTimeout(() => { suppressToast = false; }, 100);

    advancedBtn.addEventListener('click', () => {
        toolbarApi.toggleAdvancedMode();
    });

    // --- Auto-TOC: insert/remove TOC based on heading presence ---
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
        autoSave.saveNow();
        autoSave.destroy();
        toolbarApi.destroy();
        // matteApi.destroy(); // Deactivated
        tocApi.destroy();
        refsApi.destroy();
        frameApi.destroy();
        frameSelectorApi.destroy();
        spinnerApi.destroy();
        radarApi.destroy();
        sentenceApi.destroy();
        paragraphMapApi.destroy();
        // imageApi.destroy(); // Deactivated
        tagEditorApi.destroy();
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

    const getTitle = () => titleInput.value || t('skriv.untitled');

    topBar.querySelector('#btn-download-txt').addEventListener('click', async () => {
        exportMenu.classList.add('hidden');
        const cleanText = frameApi.hasFrame() ? frameApi.getCleanText() : (editor.innerText || '');
        const proceed = await showSubmissionChecklist({
            frameType: frameApi.getActiveFrame(),
            title: titleInput.value,
            wordCount: countWords(cleanText),
            hasReferences: refsApi.getReferences().length > 0,
            hasHeadings: editor.querySelectorAll('h1, h2').length > 0,
            exportType: 'txt',
        });
        if (proceed) {
            downloadText({
                title: getTitle(),
                studentName: '',
                text: cleanText,
            });
        }
    });

    topBar.querySelector('#btn-download-pdf').addEventListener('click', async () => {
        exportMenu.classList.add('hidden');
        const cleanText = frameApi.hasFrame() ? frameApi.getCleanText() : (editor.innerText || '');
        const proceed = await showSubmissionChecklist({
            frameType: frameApi.getActiveFrame(),
            title: titleInput.value,
            wordCount: countWords(cleanText),
            hasReferences: refsApi.getReferences().length > 0,
            hasHeadings: editor.querySelectorAll('h1, h2').length > 0,
            exportType: 'pdf',
        });
        if (proceed) {
            downloadPDF({
                title: getTitle(),
                studentName: '',
                text: cleanText,
                html: editor.innerHTML || '',
                references: refsApi.getReferences(),
            });
        }
    });

    // --- Wire editor input to auto-save ---
    editor.addEventListener('input', autoSave.schedule);
    titleInput.addEventListener('input', autoSave.schedule);

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
