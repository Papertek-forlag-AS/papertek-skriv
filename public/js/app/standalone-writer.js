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
import { initSlashMenu } from '../editor-core/student/slash-menu.js';
import { initDragHandle } from '../editor-core/student/drag-handle.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';
import { showInPageConfirm } from '../editor-core/shared/in-page-modal.js';
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
import { initEditorLang } from '../editor-core/student/editor-lang.js';
import { initReadAloud } from '../editor-core/student/read-aloud.js';
import { initReadingSettings } from '../editor-core/student/reading-settings.js';
import { initLeksihjelpBridge } from './leksihjelp-bridge.js';
import { initLeksihjelpSettings } from './leksihjelp-settings.js';
import { initLeksihjelpDictionary } from './leksihjelp-dictionary.js';
import { initSpecialCharsPanel } from '../editor-core/student/special-chars-panel.js';
import { initFindReplace } from '../editor-core/student/find-replace.js';
import { initInsightsDrawer } from '../editor-core/student/insights-drawer.js';
import { SPECIAL_CHAR_GROUPS } from '../editor-core/config.js';
// import { initMatte } from '../editor-core/student/matte.js'; // Deactivated — re-enable when subject choice is added
import { showSubmissionChecklist } from '../editor-core/student/submission-checklist.js';
import { downloadText, downloadPDF, downloadDocx } from '../editor-core/student/text-export.js';
import { escapeAttr } from '../editor-core/shared/html-escape.js';
import { getSchoolLevel, getSchoolLevelBand } from './school-level.js';
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

    let onToolsOutsideClick = null;
    let onExportOutsideClick = null;

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
            <button id="btn-structure" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5" title="${t('skriv.strukturTooltip') || 'Velg skriveramme'}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h10M4 18h14"/></svg>
                ${t('skriv.strukturTooltip') || 'Velg skriveramme'}
            </button>
            <button id="btn-insights" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5" title="${t('skriv.insightsTitle') || 'Gjennomgang'}">
                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                ${t('skriv.insightsTitle') || 'Gjennomgang'}
            </button>
            <button id="btn-german-hint" class="hidden text-xs px-3 py-1.5 rounded-lg border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors flex items-center gap-1.5"
                title="${t('germanExam.hintButtonTitle')}">
                💡
                ${t('germanExam.hintButton')}
            </button>
            <button id="btn-leksihjelp" class="hidden text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5"
                title="${t('leksihjelp.buttonTitle')}">
                📚
                ${t('leksihjelp.button')}
            </button>
        </div>
        
        <button id="btn-dark-mode" class="hidden text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors flex items-center gap-1.5" title="Mørk Modus">
            <svg class="w-3.5 h-3.5 dark:hidden" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>
            <svg class="w-3.5 h-3.5 hidden dark:block" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>
        </button>
        <div class="relative flex-shrink-0">
            <button id="btn-export" class="text-xs px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors">
                ${t('skriv.exportTitle')} &#9660;
            </button>
            <div id="export-menu" class="hidden animate-dropdown-in absolute right-0 top-full mt-1 bg-white/85 dark:bg-stone-800/85 backdrop-blur-md border border-stone-200 dark:border-stone-700 rounded-lg shadow-lg py-1 z-50 min-w-[160px]">
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

    // Search panel
    const searchPanel = document.createElement('div');
    searchPanel.id = 'search-panel';
    searchPanel.className = 'hidden px-4 py-2 border-b border-stone-200 dark:border-stone-700 bg-stone-100 dark:bg-stone-800 flex items-center gap-2';
    searchPanel.innerHTML = `
        <div class="relative flex-1 max-w-sm">
            <input type="text" id="search-input" placeholder="Søk i dokumentet (⌘F)" class="w-full pl-3 pr-12 py-1.5 text-sm border border-stone-300 dark:border-stone-600 rounded bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 focus:outline-none focus:border-emerald-500" />
            <span id="search-count" class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400">0/0</span>
        </div>
        <button id="search-prev" class="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded hover:bg-stone-200 dark:hover:bg-stone-700" title="Forrige">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7"/></svg>
        </button>
        <button id="search-next" class="p-1.5 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 rounded hover:bg-stone-200 dark:hover:bg-stone-700" title="Neste">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
        </button>
        <button id="search-close" class="p-1.5 text-stone-500 hover:text-red-500 rounded hover:bg-stone-200 dark:hover:bg-stone-700 ml-2" title="Lukk">
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
    `;

    // Assemble
    writingEnv.appendChild(topBar);
    writingEnv.appendChild(searchPanel);
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
            saving: `<div class="flex items-center gap-1.5"><svg class="w-4 h-4 text-emerald-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11v6m-3-3l3-3 3 3"/></svg><span class="hidden sm:inline">${t('skriv.saving')}</span></div>`,
            saved: `<div class="flex items-center gap-1.5"><svg class="w-4 h-4 text-stone-400 dark:text-stone-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4"/></svg><span class="hidden sm:inline">${t('skriv.saved')}</span></div>`,
            offline: `<div class="flex items-center gap-1.5" title="Lagret lokalt"><svg class="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 3l18 18M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"/></svg><span class="hidden sm:inline">Frakoblet</span></div>`,
            error: t('skriv.saveError'),
        },
        onError: () => {
            showToast(t('skriv.saveErrorToast'), { duration: 10000 });
        },
    });

    // --- Initialize modules ---
    // German exam docs ship with a seeded prompt that contains a bullet list
    // and a bold title — the toolbar's auto-detect would otherwise interpret
    // those as "advanced content" and flip the student into advanced mode
    // (which also auto-inserts a TOC). Opt out so the student starts in the
    // simple writing mode and can enable advanced manually if they want it.
    const isGermanExamDoc = !!(doc.germanHint && (doc.germanHint.simple || doc.germanHint.rich));
    const toolbarApi = initEditorToolbar(editor, { skipAutoDetectAdvanced: isGermanExamDoc });
    // const matteApi = initMatte(editor, toolbarApi.toolbarEl); // Deactivated
    const tocApi = initTOC(editor);
    const refsApi = initReferences(editor, { onSave: autoSave.schedule });
    // --- Content language (which language the pupil is WRITING in) ---
    // The Leksihjelp writing language is the strongest signal: it is what
    // the pupil (or the per-document seeding below) explicitly picked.
    // Read the raw localStorage entry rather than the bridge's getter —
    // the bridge is initialised further down, and the raw value also
    // distinguishes "never set" (fall back to UI language) from "set to nb".
    // Frames and spinner data exist for nb/nn/en; other writing languages
    // (de/es/fr) fall back to the UI language.
    function getContentLang() {
        let stored = null;
        try { stored = localStorage.getItem('skriv.leksihjelp.writingLang'); } catch (_) { /* ignore */ }
        if (stored && ['nb', 'nn', 'en'].includes(stored)) return stored;
        const ui = getCurrentLanguage();
        return ['nb', 'nn', 'en'].includes(ui) ? ui : 'nb';
    }

    const frameApi = initFrameGuide(editor, writingEnv, {
        onSave: () => autoSave.schedule(),
        getLevel: () => getSchoolLevel(),
        getContentLang,
    });
    const counterCleanup = attachWordCounter(editor, wordCountDisplay);

    // Load saved references
    if (doc.references && doc.references.length > 0) {
        refsApi.loadReferences(doc.references);
    }

    // Rehydrate frame state from saved document
    if (doc.frameType) {
        frameApi.setActiveFrameType(doc.frameType);
        // Re-load frame markdown for the guide panel (nb fallback if the
        // content-language file is missing, same as the frame selector).
        fetch(`/frames/${getContentLang()}/${doc.frameType}.md`)
            .then(r => r.ok ? r.text() : fetch(`/frames/nb/${doc.frameType}.md`).then(r2 => r2.ok ? r2.text() : null))
            .then(md => {
                if (md) {
                    const parsed = parseFrameMarkdown(md);
                    frameApi.applyFrame(parsed, doc.frameType);
                    frameApi.rehydrate();
                    frameSelectorApi.updateButtonState();
                }
            });
    }

    // --- Frame selector ---
    const structureBtn = topBar.querySelector('#btn-structure');
    const frameSelectorApi = initFrameSelector(structureBtn, editor, frameApi, {
        getLevelBand: () => getSchoolLevelBand(),
        getContentLang,
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
        getContentLang,
    });

    // --- Repetition Radar ---
    const radarApi = initWordFrequency(editor, writingEnv, {
        getContentLang,
        onWordClick: (word, range) => {
            editor.focus();
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        },
    });

    // --- Sentence Length Visualization ---
    const sentenceApi = initSentenceLength(editor, writingEnv);

    // --- Paragraph Map (minimap) ---
    const paragraphMapApi = initParagraphMap(editor, editorWrap);


    // --- Focus Mode ---
    const focusApi = initFocusMode(editor, writingEnv);

    // --- Writing Progress ---
    const progressApi = initWritingProgress(editor);

    // --- Keyboard Shortcuts ---
    const shortcutsApi = initKeyboardShortcuts(editor, {
        onSave: () => autoSave.saveNow(),
        onFocusMode: () => focusApi.toggle(),
    });

    // --- Table Manager ---
    const tableApi = initTableManager(editor, writingEnv, { onInsert: () => autoSave.schedule() });

    // --- Slash Menu ---
    const slashMenuApi = initSlashMenu(editor, {
        actions: [
            {
                label: 'Overskrift 1',
                icon: '<b class="font-serif">H1</b>',
                execute: () => { document.execCommand('formatBlock', false, 'H1'); }
            },
            {
                label: 'Overskrift 2',
                icon: '<b class="font-serif text-sm">H2</b>',
                execute: () => { document.execCommand('formatBlock', false, 'H2'); }
            },
            {
                label: 'Punktliste',
                icon: '•',
                execute: () => { document.execCommand('insertUnorderedList', false, null); }
            },
            {
                label: 'Nummerert liste',
                icon: '1.',
                execute: () => { document.execCommand('insertOrderedList', false, null); }
            },
            {
                label: t('skriv.refButton') || 'Kilde',
                icon: '<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>',
                execute: () => refsApi.openDialog()
            },
            {
                label: t('image.button') || 'Bilde',
                icon: '📷',
                execute: () => imageApi.openFilePicker()
            },
            {
                label: 'Tabell',
                icon: '📊',
                execute: () => tableApi.showInsertDialog()
            },
            {
                label: 'Skriv "/"',
                icon: '/',
                keepSlash: true
            }
        ]
    });

    // --- Drag Handle ---
    const dragHandleApi = initDragHandle(editor, {
        onDragDrop: () => autoSave.schedule()
    });

    // --- Writing Feedback ---
    const feedbackApi = initWritingFeedback(editor, writingEnv, {
        getActiveFrame: () => frameApi.getActiveFrame(),
        getWritingLang: () => leksihjelpBridge.getWritingLang(),
    });

    // --- Version History ---
    const versionApi = initVersionHistory(editor, {
        docId: docId,
        onRestore: () => { autoSave.schedule(); },
    });

    // --- LIX Readability Score ---
    const lixApi = initLixScore(editor, writingEnv, { getLevel: () => getSchoolLevel() });

    // --- Argument Flow ---
    const argumentApi = initArgumentFlow(editor, writingEnv, {
        getActiveFrame: () => frameApi.getActiveFrame(),
        getWritingLang: () => leksihjelpBridge.getWritingLang(),
    });

    // --- Reading Settings (lesevisning — dyslexia-friendly display) ---
    const readingSettingsApi = initReadingSettings(editor, writingEnv);

    // --- Insights Drawer (Gjennomgang) ---
    const insightsDrawerApi = initInsightsDrawer(writingEnv, [
        { label: t('readAloud.title'), description: t('readAloud.desc'), icon: 'M19.114 5.636a9 9 0 010 12.728M16.463 8.288a5.25 5.25 0 010 7.424M6.75 8.25l4.72-4.72a.75.75 0 011.28.53v15.88a.75.75 0 01-1.28.53l-4.72-4.72H4.51c-.88 0-1.704-.507-1.938-1.354A9.01 9.01 0 012.25 12c0-.83.112-1.633.322-2.396C2.806 8.756 3.63 8.25 4.51 8.25H6.75z', isTool: true, action: () => readAloudApi.toggle() },
        { label: t('readingView.title'), description: t('readingView.desc'), icon: 'M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75', isTool: true, action: () => readingSettingsApi.toggle() },
        { label: 'Søk', description: 'Søk etter ord og uttrykk i teksten', icon: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z', isTool: true, action: () => openSearch() },
        { label: 'Fokusmodus', description: 'Skjul alt annet og fokuser kun på teksten din', icon: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z', isTool: true, action: () => focusApi.toggle() },
        { label: 'Spinn', description: 'Få hjelp til å variere språket og ordvalget ditt', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', isTool: true, action: () => spinnerApi.show() },
        { label: 'Tilbakemelding', description: 'Få umiddelbar formativ vurdering av teksten', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', isTool: true, action: () => feedbackApi.toggle() },
        { label: 'Versjoner', description: 'Se og gjenopprett tidligere versjoner av teksten', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', isTool: true, action: () => versionApi.toggle() },
        { label: 'Ord-radar', description: 'Finn ord som brukes ofte for å skape mer variasjon', icon: 'M13 10V3L4 14h7v7l9-11h-7z', isAnalysis: true, action: () => radarApi.toggle() },
        { label: 'Setningslengde', description: 'Visuell sjekk for å sikre god flyt og variasjon i lengde', icon: 'M4 6h16M4 12h16m-7 6h7', isAnalysis: true, action: () => sentenceApi.toggle() },
        { label: 'Avsnittskart', description: 'Se tekstens visuelle oppbygning og balanse', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', isAnalysis: true, action: () => paragraphMapApi.toggle() },
        { label: 'LIX', description: 'Mål tekstens lesbarhet og kompleksitet', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z', isAnalysis: true, action: () => lixApi.toggle() },
        { label: 'Argument-flyt', description: 'Analyser hvordan argumentene dine henger sammen', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4', isAnalysis: true, action: () => argumentApi.toggle() },
    ]);
    const insightsBtn = topBar.querySelector('#btn-insights');
    if (insightsBtn) {
        insightsBtn.addEventListener('click', () => insightsDrawerApi.toggle());
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

    // --- Leksihjelp bridge + settings drawer ---
    // The bridge is the single source of truth for "who owns dictionary +
    // spell-check on this page" and the active Skrivespråk / Oppslagsspråk.
    // Other modules (special-chars panel, future spell-check) read it.
    const leksihjelpBridge = initLeksihjelpBridge();
    const leksihjelpSettingsApi = initLeksihjelpSettings(writingEnv, leksihjelpBridge);
    const leksihjelpBtn = topBar.querySelector('#btn-leksihjelp');
    // The button is always available now. Behaviour branches on bridge status
    // at click time: in 'extension' mode it points the user to the extension's
    // side panel (best-effort open signal + guidance toast, since Chrome
    // forbids a page from opening the panel itself); otherwise it opens Skriv's
    // own settings drawer.
    if (leksihjelpBtn) {
        leksihjelpBtn.classList.remove('hidden');
        leksihjelpBtn.addEventListener('click', () => {
            if (leksihjelpBridge.getStatus() === 'extension') {
                leksihjelpBridge.requestExtensionPanel();
                showToast(t('leksihjelp.openPanelHint'), { duration: 4000 });
            } else {
                leksihjelpSettingsApi.toggle();
            }
        });
    }

    // --- Special-chars panel — driven by the bridge's writingLang ---
    const specialCharsApi = initSpecialCharsPanel(editor, writingEnv, SPECIAL_CHAR_GROUPS);
    specialCharsApi.setActiveLanguage(leksihjelpBridge.getWritingLang());
    leksihjelpBridge.onWritingLangChange((lang) => specialCharsApi.setActiveLanguage(lang));

    // --- Leksihjelp dictionary popup (click any word) ---
    // Yields to the extension when bridge.status === 'extension' (the
    // extension renders its own dictionary surface on every page).
    const leksihjelpDictApi = initLeksihjelpDictionary(editor, leksihjelpBridge);

    // --- Per-document language seeding (S-9) ---
    // Soft seed: the writing language flows from the document's intent
    // when we have a strong signal. Student changes in the settings
    // drawer always win (the bridge persists their pick in localStorage,
    // and we only seed when the persisted value still equals the default).
    //
    // Signals (priority order — first match wins):
    //   1. doc.germanHint  → writing + lookup lang = 'de' (German exam tasks)
    //   2. (future)        → frame language for skriverammer
    if (doc.germanHint && (doc.germanHint.simple || doc.germanHint.rich)) {
        // Only seed if the user hasn't explicitly chosen a non-default
        // writingLang — looking at the raw localStorage entry rather than
        // the bridge's getter to detect "never set" vs "set to nb".
        const storedWriting = localStorage.getItem('skriv.leksihjelp.writingLang');
        if (!storedWriting || storedWriting === 'nb') {
            leksihjelpBridge.setWritingLang('de');
        }
        const storedLookup = localStorage.getItem('skriv.leksihjelp.lookupLang');
        if (!storedLookup || storedLookup === 'nb') {
            leksihjelpBridge.setLookupLang('de');
        }
    }

    // --- Accessibility: editor lang/spellcheck + read aloud ---
    // The language the pupil actually writes in: an explicit Leksihjelp
    // writing-language pick wins (raw localStorage read distinguishes
    // "never set" from "set to nb"); otherwise the UI language.
    function getActiveWritingLang() {
        let stored = null;
        try { stored = localStorage.getItem('skriv.leksihjelp.writingLang'); } catch (_) { /* ignore */ }
        if (stored) return leksihjelpBridge.getWritingLang();
        const ui = getCurrentLanguage();
        return ['nb', 'nn', 'en'].includes(ui) ? ui : 'nb';
    }

    const editorLangApi = initEditorLang(editor, {
        getWritingLang: getActiveWritingLang,
        onWritingLangChange: (fn) => leksihjelpBridge.onWritingLangChange(fn),
        // Leksihjelp (embedded or extension) owns spell-check when present;
        // keep the native checker off so the pupil sees one set of squiggles.
        hasExternalSpellcheck: () => leksihjelpBridge.getStatus() !== 'absent',
        onSpellcheckOwnerChange: (fn) => leksihjelpBridge.onStatusChange(fn),
    });

    const readAloudApi = initReadAloud(editor, writingEnv, {
        getLang: getActiveWritingLang,
    });

    // --- Onboarding Tour ---
    const tourApi = initOnboardingTour();

    // --- Search functionality ---
    const searchApi = initFindReplace(editor, writingEnv);
    const searchBtn = topBar.querySelector('#btn-search');
    const searchInput = searchPanel.querySelector('#search-input');
    const searchCount = searchPanel.querySelector('#search-count');
    const searchPrev = searchPanel.querySelector('#search-prev');
    const searchNext = searchPanel.querySelector('#search-next');
    const searchClose = searchPanel.querySelector('#search-close');

    function openSearch() {
        searchPanel.classList.remove('hidden');
        searchInput.focus();
        searchInput.select();
    }
    
    function closeSearch() {
        searchPanel.classList.add('hidden');
        searchApi.clear();
        searchInput.value = '';
        searchCount.textContent = '0/0';
        editor.focus();
    }

    function updateSearchCount(res) {
        if (res.count === 0) {
            searchCount.textContent = '0/0';
        } else {
            searchCount.textContent = `${res.current}/${res.count}`;
        }
    }

    searchClose.addEventListener('click', closeSearch);

    searchInput.addEventListener('input', () => {
        const res = searchApi.search(searchInput.value);
        updateSearchCount(res);
    });

    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (e.shiftKey) {
                updateSearchCount(searchApi.prev());
            } else {
                updateSearchCount(searchApi.next());
            }
        } else if (e.key === 'Escape') {
            closeSearch();
        }
    });

    searchPrev.addEventListener('click', () => updateSearchCount(searchApi.prev()));
    searchNext.addEventListener('click', () => updateSearchCount(searchApi.next()));

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'f') {
            e.preventDefault();
            openSearch();
        }
    });

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
            
            // Show all advanced buttons
            if (toolsWrapper) toolsWrapper.classList.remove('hidden');
            ['#btn-structure', '#btn-ref', '#btn-image', '#btn-dark-mode'].forEach(sel => {
                const btn = topBar.querySelector(sel);
                if (btn) btn.classList.remove('hidden');
            });
            
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
            
            // Hide all advanced buttons
            if (toolsWrapper) toolsWrapper.classList.add('hidden');
            if (toolsMenu) toolsMenu.classList.add('hidden');
            ['#btn-structure', '#btn-ref', '#btn-image', '#btn-dark-mode'].forEach(sel => {
                const btn = topBar.querySelector(sel);
                if (btn) btn.classList.add('hidden');
            });
            
            tocApi.remove();
            if (!suppressToast) showToast(t('skriv.advancedOff'), { duration: 1500 });
        }
        if (!suppressToast) autoSave.schedule();
    }

    onToolsOutsideClick = (e) => {
        if (toolsWrapper && !toolsWrapper.contains(e.target)) {
            toolsMenu.classList.add('hidden');
        }
    };

    // Tools dropdown toggle
    if (toolsBtn && toolsMenu) {
        toolsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toolsMenu.classList.toggle('hidden');
        });
        // Close on outside click
        document.addEventListener('click', onToolsOutsideClick);
        // Close menu when any tool inside is clicked
        toolsMenu.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', () => {
                toolsMenu.classList.add('hidden');
            });
        });
    }

    // --- Auto-TOC: insert/remove TOC based on heading presence ---
    let autoTocTimer = null;
    editor.addEventListener('input', () => {
        if (autoTocTimer) clearTimeout(autoTocTimer);
        autoTocTimer = setTimeout(() => {
            const headings = Array.from(editor.querySelectorAll('h1, h2')).filter(h => h.textContent.trim().length > 0);
            const hasHeadings = headings.length > 0;
            if (hasHeadings && !tocApi.hasTOC()) {
                tocApi.insert();
            } else if (!hasHeadings && tocApi.hasTOC()) {
                tocApi.remove();
            }
        }, 500);
    });

    // --- Paste Sanitizer ---
    editor.addEventListener('paste', (e) => {
        // Let image-manager handle image pasting
        if (e.clipboardData?.items) {
            for (const item of e.clipboardData.items) {
                if (item.type.startsWith('image/')) return;
            }
        }
        
        e.preventDefault();
        const html = e.clipboardData.getData('text/html');
        if (html) {
            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');
            const allowedTags = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'H1', 'H2', 'H3', 'UL', 'OL', 'LI']);
            
            function sanitizeNode(node) {
                if (node.nodeType === Node.TEXT_NODE) {
                    return document.createTextNode(node.textContent);
                }
                if (node.nodeType === Node.ELEMENT_NODE) {
                    if (allowedTags.has(node.tagName)) {
                        const cleanEl = document.createElement(node.tagName);
                        for (const child of Array.from(node.childNodes)) {
                            const cleanChild = sanitizeNode(child);
                            if (cleanChild) cleanEl.appendChild(cleanChild);
                        }
                        return cleanEl;
                    } else {
                        // Unwrap unsupported elements (e.g. SPAN, DIV) and keep text
                        const fragment = document.createDocumentFragment();
                        for (const child of Array.from(node.childNodes)) {
                            const cleanChild = sanitizeNode(child);
                            if (cleanChild) fragment.appendChild(cleanChild);
                        }
                        return fragment;
                    }
                }
                return null;
            }

            const fragment = document.createDocumentFragment();
            for (const child of Array.from(doc.body.childNodes)) {
                const cleanChild = sanitizeNode(child);
                if (cleanChild) fragment.appendChild(cleanChild);
            }
            
            const tempDiv = document.createElement('div');
            tempDiv.appendChild(fragment);
            document.execCommand('insertHTML', false, tempDiv.innerHTML);
        } else {
            const text = e.clipboardData.getData('text/plain');
            if (text) {
                document.execCommand('insertText', false, text);
            }
        }
    });

    // --- File Drag and Drop in Editor ---
    editorWrap.addEventListener('dragover', (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        }
    });

    editorWrap.addEventListener('drop', async (e) => {
        if (e.dataTransfer.types.includes('Files')) {
            e.preventDefault();
            const file = e.dataTransfer.files[0];
            if (file) {
                if (file.name.match(/\.(txt|md|html|json|csv)$/i)) {
                    let confirmMessage = t('skriv.confirmFileDrop');
                    if (confirmMessage === 'skriv.confirmFileDrop') {
                        confirmMessage = 'Er du sikker på at du vil sette inn innholdet fra denne filen akkurat her?';
                    }
                    
                    let importTitle = t('skriv.importFileTitle');
                    if (importTitle === 'skriv.importFileTitle') importTitle = 'Sett inn fil';
                    
                    let btnText = t('skriv.import');
                    if (btnText === 'skriv.import') btnText = 'Sett inn';
                    
                    let cancelText = t('skriv.cancel');
                    if (cancelText === 'skriv.cancel') cancelText = 'Avbryt';

                    if (await showInPageConfirm(importTitle, confirmMessage, btnText, cancelText)) {
                        const text = await file.text();
                        const paragraphs = text
                            .split(/\r?\n/)
                            .map(p => {
                                const t = p.trim();
                                return t ? `<p>${escapeHtml(t)}</p>` : `<p><br></p>`;
                            })
                            .join('');
                        document.execCommand('insertHTML', false, paragraphs || `<p>${escapeHtml(text)}</p>`);
                        autoSave.schedule();
                    }
                } else {
                    let unsupportedText = t('skriv.unsupportedFile');
                    if (unsupportedText === 'skriv.unsupportedFile') unsupportedText = 'Kan bare sette inn tekstfiler her';
                    showToast(unsupportedText, { duration: 2500 });
                }
            }
        }
    });


    // --- Destroy screen API ---
    const destroyScreen = () => {
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
        specialCharsApi.destroy();
        insightsDrawerApi.destroy();
        leksihjelpDictApi.destroy();
        if (germanHintApi) germanHintApi.destroy();
        editorLangApi.destroy();
        readAloudApi.destroy();
        readingSettingsApi.destroy();
        leksihjelpSettingsApi.destroy();
        slashMenuApi.destroy();
        dragHandleApi.destroy();
        document.body.classList.remove('skriv-editor-active');
        leksihjelpBridge.destroy();
        counterCleanup();

        if (onToolsOutsideClick) {
            document.removeEventListener('click', onToolsOutsideClick);
        }
        if (onExportOutsideClick) {
            document.removeEventListener('click', onExportOutsideClick);
        }
        if (autoTocTimer) clearTimeout(autoTocTimer);
    };

    // --- Back button ---
    topBar.querySelector('#btn-back').addEventListener('click', () => {
        onBack();
    });

    // --- Export menu ---
    
    const darkModeBtn = topBar.querySelector('#btn-dark-mode');
    if (darkModeBtn) {
        darkModeBtn.addEventListener('click', () => {
            const html = document.documentElement;
            html.classList.toggle('dark');
            const isDark = html.classList.contains('dark');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        });
        
        // Init theme from localstorage
        if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
    }

    const exportBtn = topBar.querySelector('#btn-export');
    const exportMenu = topBar.querySelector('#export-menu');

    exportBtn.addEventListener('click', () => {
        exportMenu.classList.toggle('hidden');
    });

    onExportOutsideClick = (e) => {
        if (!exportBtn.contains(e.target) && !exportMenu.contains(e.target)) {
            exportMenu.classList.add('hidden');
        }
    };

    document.addEventListener('click', onExportOutsideClick);

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
            try {
                await downloadDocx(editor, { title: getTitle() });
            } catch (err) {
                console.error('Word export failed:', err);
                showToast(t('export.docxFailed'), { duration: 5000 });
            }
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

    return {
        destroy: destroyScreen
    };
}
