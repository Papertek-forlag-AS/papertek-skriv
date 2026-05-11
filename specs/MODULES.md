# Module Registry

> Last updated: 2026-05-11

Every module in the codebase. When you add, remove, or rename a module — update this file.

## app/ — Application layer

| Module                 | Exports                                          | Depends on                          | Purpose                                |
|----------------------- |------------------------------------------------- |------------------------------------ |--------------------------------------- |
| `main.js`              | (self-executing)                                 | i18n, theme, document-list, standalone-writer, trash-store, sw-manager, school-level, onboarding-modal, german-exam-route | Hash router, app init, onboarding gate |
| `german-exam-route.js` | `renderGermanExamScreen`                         | editor-core/student/german-exam-spinner, document-store, folder-store, i18n, html-escape, in-page-modal | Route + screen wiring for `#/tysk`; ensures "Tysk" folder, creates document on pick; attaches `germanHint: { simple, rich }` metadata to the document instead of seeding draft content into the HTML |
| `leksihjelp-bridge.js` | `initLeksihjelpBridge`                           | (none)                              | Detects whether the leksihjelp Chrome extension is active on the page (via `window.__lexiPresent` / `window.__lexiVocab`). Brokers Skrivespråk + Oppslagsspråk + Eksamensmodus. Single source of truth for special-chars panel and future spell-check / dictionary modules |
| `leksihjelp-settings.js`| `initLeksihjelpSettings`                         | i18n, html-escape, `__lexiVocab` (runtime) | Slide-in right panel. Top section: dictionary search box (bidirectional match against `entry.word` OR `entry.translation`, debounced 120ms, top 8 results). Bottom: Eksamensmodus toggle, Skrivespråk picker, Oppslagsspråk picker, Grammatikknivå placeholder. Hidden when bridge.status === 'extension' |
| `leksihjelp-dictionary.js`| `initLeksihjelpDictionary`                     | (chrome.* shim, `__lexiVocab`)      | Click any word in the editor → floating popup with translation, part-of-speech, gender, and base-form lookup. Uses `caretRangeFromPoint` for word-boundary detection and `__lexiVocab.getWordList()` / `getVerbInfinitive()` for entry resolution. Yields entirely when bridge.status === 'extension' |
| `js/leksihjelp-loader.js` (classic `<script>`) | `window.__skrivLeksihjelpShim` | (none)              | Sits at `public/js/leksihjelp-loader.js`. Provides a minimal `chrome.runtime` + `chrome.storage` shim so the vendored leksihjelp content scripts run in Skriv's plain-page context. `bindBridge(api)` wires two-way sync between the bridge's settings (writingLang / lookupLang / examMode) and the `lang.spellcheck` / `lang.dictionary` / `examMode` keys leksihjelp's renderer reads. Loaded as a classic `<script>` BEFORE the vendored bundle in index.html |
| `js/leksihjelp/**` (vendored)              | `window.__lexi*` globals       | (chrome.* shim)            | Vendored from `Papertek-forlag-AS/leksihjelp` v3.0.7 (commit `ddeaf33fc6`). Synced by `scripts/sync-leksihjelp.js` — **do not hand-edit**. Includes `i18n/strings.js`, `exam-registry.js`, `content/vocab-seam{,-core}.js`, `content/spell-check-{core,engine,renderer}.js`, `content/lang-detect.js`, `content/spell-rules/*.js` (78 rules), `popup/dict-state-builder.js`, `popup/grammar-features-section.js`, `styles/leksihjelp.css` (scoped under `.skriv-leksihjelp`), and `data/*.json` vocab bundles |
| `document-store.js`    | `createDocument`, `getDocument`, `saveDocument`, `listDocuments`, `deleteDocument` | folder-store | IndexedDB CRUD for documents           |
| `trash-store.js`       | `trashDocument`, `restoreDocument`, `listTrashedDocuments`, `permanentlyDelete`, `emptyTrash`, `getTrashCount`, `purgeExpired`, `getRetentionDays` | (none) | Soft-delete with 30-day retention |
| `document-list.js`     | `renderDocumentList`                             | document-store, trash-store, word-count-stats, document-search, sidebar, folder-picker, folder-store, i18n, html-escape, in-page-modal, toast-notification, theme | Dashboard/home screen UI with sidebar   |
| `document-search.js`  | `createSearchBar`, `filterDocuments`              | i18n                                | Search bar with debounced filtering and Ctrl/Cmd+K shortcut |
| `standalone-writer.js` | `launchEditor`                                   | 13 student modules, 5 shared modules, document-store, folder-picker, folder-store | Editor orchestrator |
| `word-count-stats.js`  | `showWordCountStats`                             | folder-store, html-escape, i18n     | Statistics overlay with monthly chart  |
| `folder-store.js`      | `PERSONAL_FOLDER_NAME`, `MAX_FOLDER_DEPTH`, `PERSONAL_SUBJECT`, `getSchoolYear`, `getCurrentSchoolYear`, `setCurrentSchoolYear`, `getAvailableSchoolYears`, `createFolder`, `renameFolder`, `deleteFolder`, `moveFolder`, `getAllFolders`, `getRootFolders`, `getChildren`, `getFolderById`, `getFolderPath`, `getFolderDepth`, `buildFolderTree`, `flattenTree`, `addDocToFolder`, `removeDocFromFolder`, `setDocFolders`, `isPersonalFolder`, `isSystemFolder` | school-level | Folder CRUD, tree helpers, doc-folder assignment, school year logic |
| `sidebar.js`           | `createSidebar` (returns `{ destroy, update, setDragActive }`) | folder-store, school-level, onboarding-modal, i18n, html-escape, toast-notification, in-page-modal | Collapsible folder tree navigation + change level button + drag-drop cues |
| `school-level.js`      | `SCHOOL_LEVELS`, `LEVEL_SUBJECTS`, `getSchoolLevel`, `setSchoolLevel`, `hasSchoolLevel`, `getSubjectsForLevel` | (none) | School level data + localStorage persistence |
| `onboarding-modal.js`  | `showOnboardingModal`                            | school-level, i18n, html-escape, dom-helpers | First-time school level selection modal |
| `folder-picker.js`     | `createFolderPicker`, `createFolderBadges`       | folder-store, school-level, i18n, html-escape | Multi-select folder assignment dropdown + badges. Picker filters system folders by current school level (matches sidebar logic) so previous-curriculum folders don't pollute the list |
| `sw-manager.js`        | `initServiceWorker`                              | i18n, toast-notification            | SW registration, update prompt, dev-mode disable |

## editor-core/shared/ — Cross-product utilities

| Module                    | Exports                                       | Depends on       | Purpose                           |
|-------------------------- |---------------------------------------------- |----------------- |---------------------------------- |
| `i18n.js`                 | `initI18n`, `t`, `setLanguage`, `getLanguage`, `getDateLocale` | locales/*  | i18n with pluralization (nb, nn, en) |
| `html-escape.js`          | `escapeHtml`, `escapeAttr`                    | (none)           | XSS prevention                    |
| `dom-helpers.js`          | `getModalParent`                              | (none)           | DOM utility helpers               |
| `frame-elements.js`       | `FRAME_SELECTORS`, `ALL_FRAME_SCAFFOLD`, `isFrameElement`, `isInsideNonEditableBlock`, `getCleanEditorText`, `removeFrameScaffold`, `isImageBlock` | (none) | Editor element selectors & utils |
| `auto-save.js`            | `createAutoSave`                              | (none)           | Debounced save with status display |
| `word-counter.js`         | `attachWordCounter`, `countWords`             | frame-elements   | Real-time word/char counting      |
| `in-page-modal.js`        | `showInPageConfirm`, `showInPagePrompt`, `showInPageContent`, `showInPageAlert` | html-escape, dom-helpers | Dialog system               |
| `toast-notification.js`   | `showToast`                                   | html-escape, dom-helpers | Toast alerts                |
| `theme.js`                | `initTheme`, `setTheme`, `getTheme`, `cycleTheme`, `isDark`, `getThemeIcon` | (none) | Dark/light/system theme toggle |
| `aria-live.js`            | `announce`                                        | (none)           | Screen reader announcements via aria-live region |

## editor-core/student/ — Feature modules

Each exports an `init*()` function that returns `{ destroy(), ...api }`.

| Module                    | Init function           | Depends on (shared)            | Purpose                              |
|-------------------------- |------------------------ |------------------------------- |------------------------------------- |
| `editor-toolbar.js`       | `initEditorToolbar`     | i18n, frame-elements, Floating UI (CDN) | Floating formatting bar (B/I/U/lists/H1/H2). Accepts `{ skipAutoDetectAdvanced }` to opt out of auto-enabling advanced mode from existing headings/lists. The special-chars panel was moved out into standalone-writer.js so it can be driven by the leksihjelp bridge directly |
| `matte.js`                | `initMatte`             | i18n                           | Superscript/subscript math formatting |
| `frame-parser.js`         | `parseFrameMarkdown`    | (none)                         | Markdown → structured frame object (incl. spinner-bucket per section/subsection) |
| `frame-guide.js`          | `initFrameGuide`        | i18n, toast-notification, spinner-data-nb/nn (dynamic) | Eager-scaffolding sidebar guide: section/paragraph markers in editor, "Mark as done" toggle, "+ New paragraph", "🎲 More suggestions" spinner integration |
| `frame-manager.js`        | `initFrameManager`      | frame-parser, frame-elements, i18n | Frame insertion & rendering      |
| `frame-selector.js`       | `initFrameSelector`     | frame-manager, i18n            | Frame picker dialog                  |
| `toc-manager.js`          | `initTOC`               | frame-elements, i18n           | Auto-generated Table of Contents     |
| `reference-manager.js`    | `initReferences`        | html-escape, dom-helpers, frame-elements, i18n | Inline citations + bibliography |
| `writing-spinner.js`      | `initWritingSpinner`    | i18n, spinner-data-nb/nn       | Random word suggestions              |
| `word-frequency.js`       | `initWordFrequency`     | frame-elements, i18n           | Repetition radar (highlights)        |
| `sentence-length.js`      | `initSentenceLength`    | frame-elements, i18n           | Rhythm bar visualization             |
| `paragraph-map.js`        | `initParagraphMap`      | frame-elements, i18n           | Document minimap overlay             |
| `image-manager.js`        | `initImageManager`      | frame-elements, i18n           | Image upload, resize, captions       |
| `submission-checklist.js` | `showSubmissionChecklist`| in-page-modal, i18n            | Pre-export checklist dialog          |
| `text-export.js`          | `downloadText`, `downloadPDF` | frame-elements, word-counter, i18n, jsPDF (CDN) | TXT/PDF export        |
| `special-chars-panel.js`  | `initSpecialCharsPanel` | (none)                         | Floating column of special chars (ä ö ü ß / é è ê / ñ ¿ ¡ …) anchored to the caret. Driven externally via `setActiveLanguage(lang)` — the embedded leksihjelp bridge in `standalone-writer.js` calls it. The previous self-rendered "Annet språk?" picker was removed (Skrivespråk is now owned by the bridge) |
| `spinner-data-nb.js`      | `SPINNER_DATA_NB`       | (none)                         | Bokmål word suggestion data          |
| `spinner-data-nn.js`      | `SPINNER_DATA_NN`       | (none)                         | Nynorsk word suggestion data         |
| `german-exam-data.js`     | `writingTasks`, `examTasks`, `tasks`, `LEVELS`, `MODES` | lazy `german-exam-svg/*.js`    | Static task corpus for German exam spinner; exam mode includes 9 Tysk I and 9 Tysk II tasks from Udir/exam examples; each task ships `modelAnswers: { simple, rich }` (no glossary) |
| `german-exam-spinner.js`  | `initGermanExamSpinner` | i18n, html-escape, ./german-exam-data | Portable spinner UI; deck logic in localStorage; emits onPickTask callback; preview uses `modelAnswers.simple` |
| `german-hint-drawer.js`   | `initGermanHintDrawer`  | i18n, html-escape              | Slide-in drawer that shows the simple+rich Norwegian drafts; mounted in the editor when doc has `germanHint` metadata |
| `german-exam-svg/*.js`    | `default`               | (none)                         | 16 standalone SVG string modules used as optional visuals for German writing/exam tasks |

## editor-core/locales/ — Translation files

| File    | Language         | Exports           |
|-------- |----------------- |------------------ |
| `nb.js` | Norsk Bokmål     | `default` (object)|
| `nn.js` | Norsk Nynorsk    | `default` (object)|
| `en.js` | English          | `default` (object)|

## frames/ — Writing templates (Markdown)

| File              | Genre         | Language |
|------------------ |-------------- |--------- |
| `analyse.md`      | Analyse       | nb (legacy path) |
| `droefting.md`    | Drøfting      | nb (legacy path) |
| `kronikk.md`      | Kronikk       | nb (legacy path) |
| `nb/analyse.md`   | Analyse       | Bokmål   |
| `nb/droefting.md` | Drøfting      | Bokmål   |
| `nb/kronikk.md`   | Kronikk       | Bokmål   |
| `nb/kaaseri.md`   | Kåseri        | Bokmål   |
| `nb/fagartikkel.md` | Fagartikkel | Bokmål   |
| `nb/leserinnlegg.md` | Leserinnlegg | Bokmål |
| `nb/novelle.md`   | Novelle       | Bokmål   |
| `nb/retorisk-analyse.md` | Retorisk analyse | Bokmål |
| `nb/kortsvar.md` | Kortsvar | Bokmål |
| `nb/kreativ-tekst.md` | Kreativ tekst | Bokmål |
| `nb/reflekterende-tekst.md` | Reflekterende tekst | Bokmål |
| `nb/sammenligning.md` | Sammenlignende tekst | Bokmål |
| `nn/analyse.md`   | Analyse       | Nynorsk  |
| `nn/droefting.md` | Drøfting      | Nynorsk  |
| `nn/kronikk.md`   | Kronikk       | Nynorsk  |
| `nn/kaaseri.md`   | Kåseri        | Nynorsk  |
| `nn/fagartikkel.md` | Fagartikkel | Nynorsk  |
| `nn/leserinnlegg.md` | Lesarinnlegg | Nynorsk |
| `nn/novelle.md`   | Novelle       | Nynorsk  |
| `nn/retorisk-analyse.md` | Retorisk analyse | Nynorsk |
| `nn/kortsvar.md` | Kortsvar | Nynorsk |
| `nn/kreativ-tekst.md` | Kreativ tekst | Nynorsk |
| `nn/reflekterende-tekst.md` | Reflekterande tekst | Nynorsk |
| `nn/sammenligning.md` | Samanliknande tekst | Nynorsk |
