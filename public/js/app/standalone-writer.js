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
import { initFrameGuide } from '../editor-core/student/frame-guide.js';
import { parseFrameMarkdown } from '../editor-core/student/frame-parser.js';
import { initFrameSelector } from '../editor-core/student/frame-selector.js';
import { initWritingSpinner } from '../editor-core/student/writing-spinner.js';
import { initWordFrequency } from '../editor-core/student/word-frequency.js';
import { initSentenceLength } from '../editor-core/student/sentence-length.js';
import { initParagraphMap } from '../editor-core/student/paragraph-map.js';
import { initImageManager } from '../editor-core/student/image-manager.js';
import { initFocusMode } from '../editor-core/student/focus-mode.js';
import { initKeyboardShortcuts } from '../editor-core/student/keyboard-shortcuts.js';
import { initWritingProgress } from '../editor-core/student/writing-progress.js';
import { initTableManager } from '../editor-core/student/table-manager.js';
import { initWritingFeedback } from '../editor-core/student/writing-feedback.js';
import { initVersionHistory } from '../editor-core/student/version-history.js';
import { initOnboardingTour } from '../editor-core/student/onboarding-tour.js';
import { initLixScore } from '../editor-core/student/lix-score.js';
import { initArgumentFlow } from '../editor-core/student/argument-flow.js';
import { initGermanHintDrawer } from '../editor-core/student/german-hint-drawer.js';
// import { initMatte } from '../editor-core/student/matte.js'; // Deactivated — re-enable when subject choice is added
import { showSubmissionChecklist } from '../editor-core/student/submission-checklist.js';
import { downloadText, downloadPDF, downloadDocx } from '../editor-core/student/text-export.js';
import { escapeAttr } from '../editor-core/shared/html-escape.js';
import { getSchoolLevel } from './school-level.js';
import { attachWordCounter, countWords } from '../editor-core/shared/word-counter.js';
import { createAutoSave } from '../editor-core/shared/auto-save.js';
import { showToast } from '../editor-core/shared/toast-notification.js';
import { t, getCurrentLanguage } from '../editor-core/shared/i18n.js';
import { getDocument, saveDocument } from './document-store.js';
import { createFolderPicker, createFolderBadges } from './folder-picker.js';
import { getAllFolders } from './folder-store.js';

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
            <button id="btn-image" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5"
                title="${t('image.button')}">
                📷
                ${t('image.button')}
            </button>
            <button id="btn-german-hint" class="hidden text-xs px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center gap-1.5"
                title="${t('germanExam.hintButtonTitle')}">
                💡
                ${t('germanExam.hintButton')}
            </button>
            <div id="tools-wrapper" class="relative hidden flex-shrink-0">
                <button id="btn-tools" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5"
                    title="${t('skriv.toolsMenu')}">
                    <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/></svg>
                    ${t('skriv.toolsMenu')} &#9660;
                </button>
                <div id="tools-menu" class="hidden absolute right-0 top-full mt-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg py-1 z-50 min-w-[200px]">
                    <button id="btn-spinner" class="tool-menu-item flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors text-left">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/></svg>
                        <span>${t('spinner.title')}</span>
                    </button>
                    <button id="btn-radar" class="tool-menu-item flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors text-left">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
                        <span>${t('radar.button')}</span>
                    </button>
                    <button id="btn-sentence-length" class="tool-menu-item flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors text-left">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"/></svg>
                        <span>${t('sentence.button')}</span>
                    </button>
                    <button id="btn-paragraph-map" class="tool-menu-item flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors text-left">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7"/></svg>
                        <span>${t('paragraphMap.button')}</span>
                    </button>
                    <button id="btn-table" class="tool-menu-item flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors text-left">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h18M3 14h18M3 6h18M3 18h18M8 6v12M16 6v12"/></svg>
                        <span>${t('table.button')}</span>
                    </button>
                    <button id="btn-feedback" class="tool-menu-item flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors text-left">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <span>${t('feedback.button')}</span>
                    </button>
                    <button id="btn-versions" class="tool-menu-item flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors text-left">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                        <span>${t('versions.title')}</span>
                    </button>
                    <button id="btn-lix" class="tool-menu-item flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors text-left">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6 0h6m-6 0V9a2 2 0 012-2h2a2 2 0 012 2v10m6 0v-4a2 2 0 00-2-2h-2a2 2 0 00-2 2v4"/></svg>
                        <span>LIX</span>
                    </button>
                    <button id="btn-argument-flow" class="tool-menu-item flex w-full items-center gap-2 px-3 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors text-left">
                        <svg class="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 5l7 7-7 7M5 5l7 7-7 7"/></svg>
                        <span>${t('argument.title')}</span>
                    </button>
                </div>
            </div>
        </div>
        <div class="relative flex-shrink-0">
            <button id="btn-export" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
                ${t('skriv.exportTitle')} &#9660;
            </button>
            <div id="export-menu" class="hidden absolute right-0 top-full mt-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
                <button id="btn-download-txt" class="block w-full text-left px-4 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">${t('skriv.downloadTxt')}</button>
                <button id="btn-download-pdf" class="block w-full text-left px-4 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">${t('skriv.downloadPdf')}</button>
                <button id="btn-download-docx" class="block w-full text-left px-4 py-2 text-sm text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors">${t('skriv.downloadDocx')}</button>
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

    // Folder picker (below title)
    const folders = await getAllFolders();
    const folderRow = document.createElement('div');
    folderRow.className = 'px-4 pb-2 pt-1 max-w-3xl mx-auto w-full flex items-center gap-2 border-t border-stone-100 dark:border-stone-800';
    const folderLabel = document.createElement('span');
    folderLabel.className = 'text-xs text-stone-400 dark:text-stone-500 flex-shrink-0';
    folderLabel.textContent = t('sidebar.folderLabel') + ':';
    folderRow.appendChild(folderLabel);

    let currentFolderIds = doc.folderIds || [];
    const badgesContainer = document.createElement('span');
    badgesContainer.className = 'flex items-center gap-1 flex-wrap cursor-pointer';
    folderRow.appendChild(badgesContainer);

    function renderFolderBadges() {
        badgesContainer.innerHTML = '';
        badgesContainer.appendChild(createFolderBadges(currentFolderIds, folders));
    }
    renderFolderBadges();

    const folderPickerApi = createFolderPicker(badgesContainer, currentFolderIds, (newFolderIds) => {
        currentFolderIds = newFolderIds;
        folderPickerApi.setFolderIds(newFolderIds);
        renderFolderBadges();
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
    writingEnv.appendChild(folderRow);
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
                subject: null,
                folderIds: currentFolderIds,
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
    const frameApi = initFrameGuide(editor, writingEnv, {
        onSave: () => autoSave.schedule(),
        getLevel: () => getSchoolLevel(),
    });
    const counterCleanup = attachWordCounter(editor, wordCountDisplay);

    // Load saved references
    if (doc.references && doc.references.length > 0) {
        refsApi.loadReferences(doc.references);
    }

    // Rehydrate frame state from saved document
    if (doc.frameType) {
        frameApi.setActiveFrameType(doc.frameType);
        // Re-load frame markdown for the guide panel
        const lang = getCurrentLanguage() || 'nb';
        fetch(`/frames/${lang === 'nn' ? 'nn' : 'nb'}/${doc.frameType}.md`)
            .then(r => r.ok ? r.text() : null)
            .then(md => {
                if (md) {
                    const parsed = parseFrameMarkdown(md);
                    frameApi.applyFrame(parsed, doc.frameType);
                    frameApi.rehydrate();
                    frameSelectorApi.updateButtonState();
                }
            });
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

    // --- Image Manager ---
    const imageApi = initImageManager(editor, writingEnv, { onInsert: () => autoSave.schedule() });
    const imageBtn = topBar.querySelector('#btn-image');
    if (imageBtn) {
        imageBtn.addEventListener('click', () => imageApi.openFilePicker());
    }

    // --- Writing Spinner ---
    const spinnerApi = initWritingSpinner(editor, writingEnv, {
        getLevel: () => getSchoolLevel(),
        getActiveFrame: () => frameApi.getActiveFrame(),
    });
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


    // --- Focus Mode ---
    const focusApi = initFocusMode(editor, writingEnv);

    // --- Writing Progress ---
    const progressApi = initWritingProgress(editor);

    // --- Keyboard Shortcuts ---
    const shortcutsApi = initKeyboardShortcuts(editor, {
        onSave: () => autoSave.saveNow(),
        onFocusMode: () => focusApi.toggle(),
        isAdvancedMode: () => toolbarApi.isAdvancedMode(),
    });

    // --- Table Manager ---
    const tableApi = initTableManager(editor, writingEnv, { onInsert: () => autoSave.schedule() });
    const tableBtn = topBar.querySelector('#btn-table');
    if (tableBtn) {
        tableBtn.addEventListener('click', () => tableApi.showInsertDialog());
    }

    // --- Writing Feedback ---
    const feedbackApi = initWritingFeedback(editor, writingEnv, {
        getActiveFrame: () => frameApi.getActiveFrame(),
    });
    const feedbackBtn = topBar.querySelector('#btn-feedback');
    if (feedbackBtn) {
        feedbackBtn.addEventListener('click', () => {
            const isNowActive = feedbackApi.toggle(feedbackBtn);
            if (isNowActive) {
                feedbackBtn.classList.remove('text-stone-500', 'border-stone-200');
                feedbackBtn.classList.add('text-teal-700', 'border-teal-400', 'bg-teal-50');
            } else {
                feedbackBtn.classList.remove('text-teal-700', 'border-teal-400', 'bg-teal-50');
                feedbackBtn.classList.add('text-stone-500', 'border-stone-200');
            }
        });
    }

    // --- Version History ---
    const versionApi = initVersionHistory(editor, {
        docId: docId,
        onRestore: () => { autoSave.schedule(); },
    });
    const versionsBtn = topBar.querySelector('#btn-versions');
    if (versionsBtn) {
        versionsBtn.addEventListener('click', () => versionApi.toggle());
    }

    // --- LIX Readability Score ---
    const lixApi = initLixScore(editor, writingEnv, { getLevel: () => getSchoolLevel() });
    const lixBtn = topBar.querySelector('#btn-lix');
    if (lixBtn) {
        lixBtn.addEventListener('click', () => {
            const isNowActive = lixApi.toggle();
            if (isNowActive) {
                lixBtn.classList.remove('text-stone-500', 'border-stone-200');
                lixBtn.classList.add('text-indigo-700', 'border-indigo-400', 'bg-indigo-50');
            } else {
                lixBtn.classList.remove('text-indigo-700', 'border-indigo-400', 'bg-indigo-50');
                lixBtn.classList.add('text-stone-500', 'border-stone-200');
            }
        });
    }

    // --- Argument Flow ---
    const argumentApi = initArgumentFlow(editor, writingEnv, {
        getActiveFrame: () => frameApi.getActiveFrame(),
    });
    const argumentBtn = topBar.querySelector('#btn-argument-flow');
    if (argumentBtn) {
        argumentBtn.addEventListener('click', () => {
            const isNowActive = argumentApi.toggle();
            if (isNowActive) {
                argumentBtn.classList.remove('text-stone-500', 'border-stone-200');
                argumentBtn.classList.add('text-blue-700', 'border-blue-400', 'bg-blue-50');
            } else {
                argumentBtn.classList.remove('text-blue-700', 'border-blue-400', 'bg-blue-50');
                argumentBtn.classList.add('text-stone-500', 'border-stone-200');
            }
        });
    }

    // --- German Hint Drawer (only mounted when the doc was seeded with one) ---
    let germanHintApi = null;
    if (doc.germanHint && (doc.germanHint.simple || doc.germanHint.rich)) {
        germanHintApi = initGermanHintDrawer(writingEnv, doc.germanHint, { docId });
        const germanHintBtn = topBar.querySelector('#btn-german-hint');
        if (germanHintBtn) {
            germanHintBtn.classList.remove('hidden');
            germanHintBtn.addEventListener('click', () => germanHintApi.toggle());
        }
    }

    // --- Onboarding Tour ---
    const tourApi = initOnboardingTour();

    // --- Advanced toggle button ---
    const advancedBtn = topBar.querySelector('#btn-advanced');

    let suppressToast = true; // Suppress toast on initial auto-detect

    const toolsWrapper = topBar.querySelector('#tools-wrapper');
    const toolsMenu = topBar.querySelector('#tools-menu');
    const toolsBtn = topBar.querySelector('#btn-tools');

    function updateAdvancedUI(enabled) {
        if (enabled) {
            advancedBtn.classList.remove('text-stone-500', 'border-stone-200');
            advancedBtn.classList.add('text-emerald-700', 'border-emerald-400', 'bg-emerald-50');
            // Show the Verktøy dropdown
            if (toolsWrapper) toolsWrapper.classList.remove('hidden');
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
            // Hide the Verktøy dropdown and close menu
            if (toolsWrapper) toolsWrapper.classList.add('hidden');
            if (toolsMenu) toolsMenu.classList.add('hidden');
            tocApi.remove();
            if (!suppressToast) showToast(t('skriv.advancedOff'), { duration: 1500 });
        }
        if (!suppressToast) autoSave.schedule();
    }

    // Tools dropdown toggle
    if (toolsBtn && toolsMenu) {
        toolsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toolsMenu.classList.toggle('hidden');
        });
        // Close on outside click
        document.addEventListener('click', (e) => {
            if (toolsWrapper && !toolsWrapper.contains(e.target)) {
                toolsMenu.classList.add('hidden');
            }
        });
        // Close menu when any tool inside is clicked
        toolsMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                toolsMenu.classList.add('hidden');
            });
        });
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
        imageApi.destroy();
        spinnerApi.destroy();
        radarApi.destroy();
        sentenceApi.destroy();
        paragraphMapApi.destroy();
        focusApi.destroy();
        progressApi.destroy();
        shortcutsApi.destroy();
        tableApi.destroy();
        feedbackApi.destroy();
        versionApi.destroy();
        tourApi.destroy();
        lixApi.destroy();
        argumentApi.destroy();
        if (germanHintApi) germanHintApi.destroy();
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

    topBar.querySelector('#btn-download-docx').addEventListener('click', async () => {
        exportMenu.classList.add('hidden');
        const cleanText = frameApi.hasFrame() ? frameApi.getCleanText() : (editor.innerText || '');
        const proceed = await showSubmissionChecklist({
            frameType: frameApi.getActiveFrame(),
            title: titleInput.value,
            wordCount: countWords(cleanText),
            hasReferences: refsApi.getReferences().length > 0,
            hasHeadings: editor.querySelectorAll('h1, h2').length > 0,
            exportType: 'docx',
        });
        if (proceed) {
            downloadDocx(editor, { title: getTitle() });
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
