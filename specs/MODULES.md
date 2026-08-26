# Module Registry

> Last updated: 2026-08-25

Every module in the codebase. When you add, remove, or rename a module — update this file.

## app/ — Application layer

| Module                 | Exports                                          | Depends on                          | Purpose                                |
|----------------------- |------------------------------------------------- |------------------------------------ |--------------------------------------- |
| `main.js`              | (self-executing)                                 | i18n, theme, document-list, standalone-writer, trash-store, sw-manager, school-level, onboarding-modal, german-exam-route, paragraph-trainer-route | Hash router, app init, per-route onboarding gate (school-level modal — skipped for `#/avsnitt`) |
| `german-exam-route.js` | `renderGermanExamScreen`                         | editor-core/student/german-exam-spinner, document-store, folder-store, i18n, html-escape, in-page-modal | Route + screen wiring for `#/tysk`; ensures "Tysk" folder, creates document on pick; attaches `germanHint: { simple, rich }` metadata to the document instead of seeding draft content into the HTML |
| `paragraph-trainer-route.js` | `renderParagraphTrainerScreen`             | editor-core/student/paragraph-trainer, document-store, i18n, html-escape, school-level | Route + screen wiring for `#/avsnitt`; hosts the portable three-step paragraph trainer, passes `getLevel`, and provides `onSaveDocument` (creates a document from the finished paragraph and opens the editor). Drafts still live in localStorage inside the trainer |
| `school-page.js`       | (self-executing)                                 | i18n, theme, toast-notification, editor-core/student/paragraph-trainer | Entry point for `school.html` — standalone per-school one-pager hosting the paragraph trainer without the Skriv shell (no router/onboarding, and deliberately no service-worker registration). School identity (name, fixed level, accent palette remapping the emerald scale, theme-color) comes from the `SKRIV_SCHOOLS` config map in `school.html`, resolved via `?skole=<id>`; adding a school is one config entry. `stabekk.html` is a redirect to `school.html?skole=stabekk`. No `onSaveDocument` is passed, so the trainer's save button stays hidden here |
| `leksihjelp-bridge.js` | `initLeksihjelpBridge`                           | (none)                              | Detects whether the leksihjelp Chrome extension is active on the page (via `window.__lexiPresent` / `window.__lexiVocab`). Brokers Skrivespråk + Oppslagsspråk + Eksamensmodus. Single source of truth for special-chars panel and future spell-check / dictionary modules. Returned API also exposes `requestExtensionPanel()` — fires the `skriv:leksihjelp:openPanel` window message so the extension can open its side panel. |
| `leksihjelp-settings.js`| `initLeksihjelpSettings`                         | i18n, html-escape, `__lexiVocab` (runtime) | Slide-in right panel. Top section: dictionary search box (bidirectional match against `entry.word` OR `entry.translation`, debounced 120ms, top 8 results). Bottom: Eksamensmodus toggle, Skrivespråk picker, Oppslagsspråk picker, Grammatikknivå placeholder. Hidden when bridge.status === 'extension' |
| `leksihjelp-dictionary.js`| `initLeksihjelpDictionary`                     | (chrome.* shim, `__lexiVocab`)      | Click any word in the editor → floating popup with translation, part-of-speech, gender, and base-form lookup. Uses `caretRangeFromPoint` for word-boundary detection and `__lexiVocab.getWordList()` / `getVerbInfinitive()` for entry resolution. Yields entirely when bridge.status === 'extension' |
| `js/leksihjelp-loader.js` (classic `<script>`) | `window.__skrivLeksihjelpShim` | (none)              | Sits at `public/js/leksihjelp-loader.js`. Provides a minimal `chrome.runtime` + `chrome.storage` shim so the vendored leksihjelp content scripts run in Skriv's plain-page context. `bindBridge(api)` wires two-way sync between the bridge's settings (writingLang / lookupLang / examMode) and the `lang.spellcheck` / `lang.dictionary` / `examMode` keys leksihjelp's renderer reads. Loaded as a classic `<script>` BEFORE the vendored bundle in index.html |
| `js/leksihjelp/**` (vendored)              | `window.__lexi*` globals       | (chrome.* shim)            | Vendored from `Papertek-forlag-AS/leksihjelp` v3.8.127 (commit `40241513b099`). Synced by `scripts/sync-leksihjelp.js` — **do not hand-edit**. Includes `i18n/strings.js`, `exam-registry.js`, `content/vocab-seam{,-core}.js`, `content/pause-domain.js`, `content/rule-features.js`, `content/spell-check-{core,engine,renderer}.js`, `content/pedagogy-render.js`, `content/personalization-store.js`, `content/lang-detect.js`, `content/spell-rules/*.js` (181 rules), `popup/dict-state-builder.js`, `popup/grammar-features-section.js`, `styles/leksihjelp.css` (scoped under `.skriv-leksihjelp`), and `data/*.json` vocab bundles |
| `document-store.js`    | `createDocument`, `getDocument`, `saveDocument`, `listDocuments`, `deleteDocument` | folder-store | IndexedDB CRUD for documents           |
| `trash-store.js`       | `trashDocument`, `restoreDocument`, `listTrashedDocuments`, `permanentlyDelete`, `emptyTrash`, `getTrashCount`, `purgeExpired`, `getRetentionDays` | (none) | Soft-delete with 30-day retention |
| `document-list.js`     | `renderDocumentList`                             | document-store, trash-store, word-count-stats, document-search, sidebar, folder-picker, folder-store, i18n, html-escape, in-page-modal, toast-notification, theme | Dashboard/home screen UI with sidebar   |
| `document-search.js`  | `createSearchBar`, `filterDocuments`              | i18n                                | Search bar with debounced filtering and Ctrl/Cmd+K shortcut |
| `standalone-writer.js` | `launchEditor`                                   | 13 student modules, 5 shared modules, document-store, folder-picker, folder-store | Editor orchestrator |
| `word-count-stats.js`  | `showWordCountStats`                             | folder-store, html-escape, i18n     | Statistics overlay with monthly chart  |
| `folder-store.js`      | `PERSONAL_FOLDER_NAME`, `MAX_FOLDER_DEPTH`, `PERSONAL_SUBJECT`, `getSchoolYear`, `getCurrentSchoolYear`, `setCurrentSchoolYear`, `getAvailableSchoolYears`, `createFolder`, `renameFolder`, `deleteFolder`, `moveFolder`, `getAllFolders`, `getRootFolders`, `getChildren`, `getFolderById`, `getFolderPath`, `getFolderDepth`, `buildFolderTree`, `flattenTree`, `addDocToFolder`, `removeDocFromFolder`, `setDocFolders`, `isPersonalFolder`, `isSystemFolder` | school-level | Folder CRUD, tree helpers, doc-folder assignment, school year logic |
| `sidebar.js`           | `createSidebar` (returns `{ destroy, update, setDragActive }`) | folder-store, school-level, onboarding-modal, library-backup, i18n, html-escape, toast-notification, in-page-modal | Collapsible folder tree navigation + change level button + backup download/restore buttons + drag-drop cues |
| `library-backup.js`    | `BACKUP_FORMAT`, `BACKUP_VERSION`, `serializeLibraryBackup`, `downloadLibraryBackup`, `parseLibraryBackup`, `restoreLibraryBackup` | document-store, folder-store | Whole-library export to a `.skriv` JSON file and merge-only restore (folders matched by name+parent and recreated; documents with identical id+updatedAt skipped, everything else imported as new; document HTML with script/event-handler content rejected). Trash and version snapshots are not exported |
| `school-level.js`      | `SCHOOL_LEVELS`, `LEVEL_SUBJECTS`, `SCHOOL_LEVEL_BANDS`, `getSchoolLevelBand`, `getSchoolLevel`, `setSchoolLevel`, `hasSchoolLevel`, `getSubjectsForLevel` | (none) | School level data + localStorage persistence; bands collapse vg1–vg3 to 'vgs' for content differentiation |
| `onboarding-modal.js`  | `showOnboardingModal`                            | school-level, i18n, html-escape, dom-helpers | First-time school level selection modal |
| `folder-picker.js`     | `createFolderPicker`, `createFolderBadges`       | folder-store, school-level, i18n, html-escape | Multi-select folder assignment dropdown + badges. Picker filters system folders by current school level (matches sidebar logic) so previous-curriculum folders don't pollute the list |
| `sw-manager.js`        | `initServiceWorker`                              | i18n, toast-notification            | SW registration, update prompt, dev-mode disable |

## editor-core/shared/ — Cross-product utilities

| Module                    | Exports                                       | Depends on       | Purpose                           |
|-------------------------- |---------------------------------------------- |----------------- |---------------------------------- |
| `i18n.js`                 | `initI18n`, `t`, `setLanguage`, `getCurrentLanguage`, `getDateLocale`, `getSupportedLanguages`, `onLanguageChange`, `renderLanguageSelector`, `PLURAL_RULES` | locales/*  | i18n with pluralization (nb, nn, en) |
| `html-escape.js`          | `escapeHtml`, `escapeAttr`                    | (none)           | XSS prevention                    |
| `dom-helpers.js`          | `getModalParent`                              | (none)           | DOM utility helpers               |
| `frame-elements.js`       | `FRAME_SELECTORS`, `ALL_FRAME_SCAFFOLD`, `isFrameElement`, `isInsideNonEditableBlock`, `getCleanEditorText`, `removeFrameScaffold`, `isImageBlock` | (none) | Editor element selectors & utils |
| `auto-save.js`            | `createAutoSave`                              | (none)           | Debounced save with status display |
| `word-counter.js`         | `attachWordCounter`, `countWords`             | frame-elements   | Real-time word/char counting      |
| `in-page-modal.js`        | `showInPageConfirm`, `showInPagePrompt`, `showInPageContent`, `showInPageAlert` | html-escape, dom-helpers | Dialog system               |
| `toast-notification.js`   | `showToast`                                   | html-escape, dom-helpers | Toast alerts                |
| `theme.js`                | `initTheme`, `setTheme`, `getTheme`, `cycleTheme`, `isDark`, `getThemeIcon`, `getThemeIconSVG` | (none) | Dark/light/system theme toggle. `getThemeIconSVG` returns the moon/sun/monitor SVG markup for toggle buttons (used by document-list and stabekk-page) |
| `aria-live.js`            | `announce`                                        | (none)           | Screen reader announcements via aria-live region |

## editor-core/student/ — Feature modules

Each exports an `init*()` function that returns `{ destroy(), ...api }`.

| Module                    | Init function           | Depends on (shared)            | Purpose                              |
|-------------------------- |------------------------ |------------------------------- |------------------------------------- |
| `editor-toolbar.js`       | `initEditorToolbar`     | i18n, frame-elements, Floating UI (CDN) | Floating formatting bar (B/I/U/lists/H1/H2). Accepts `{ skipAutoDetectAdvanced }` to opt out of auto-enabling advanced mode from existing headings/lists. The special-chars panel was moved out into standalone-writer.js so it can be driven by the leksihjelp bridge directly |
| `matte.js`                | `initMatte`             | i18n                           | Superscript/subscript math formatting |
| `frame-parser.js`         | `parseFrameMarkdown`    | (none)                         | Markdown → structured frame object (incl. spinner-bucket per section/subsection) |
| `frame-guide.js`          | `initFrameGuide`        | i18n, toast-notification, spinner-data-nb/nn/en (dynamic) | Eager-scaffolding sidebar guide: section/paragraph markers in editor, "Mark as done" toggle, "+ New paragraph", "🎲 More suggestions" spinner integration |
| `frame-selector.js`       | `initFrameSelector`, `partitionFramesByLevel` | frame-parser, i18n, in-page-modal | Frame picker dialog; registry carries recommended `levels` bands and the picker groups frames as recommended-for-level / "Flere skriverammer" via the `getLevelBand` option. Frame files resolve per content language (nb/nn/en) via the `getContentLang` option (app layer feeds it the Leksihjelp writing language), falling back to nb |
| `toc-manager.js`          | `initTOC`               | frame-elements, i18n           | Auto-generated Table of Contents     |
| `reference-manager.js`    | `initReferences`        | html-escape, dom-helpers, frame-elements, i18n | Inline citations + bibliography |
| `writing-spinner.js`      | `initWritingSpinner`    | i18n, spinner-data-nb/nn/en    | Random word suggestions              |
| `word-frequency.js`       | `initWordFrequency`     | frame-elements, i18n           | Repetition radar (highlights)        |
| `sentence-length.js`      | `initSentenceLength`    | frame-elements, i18n           | Rhythm bar visualization             |
| `paragraph-map.js`        | `initParagraphMap`      | frame-elements, i18n           | Document minimap overlay             |
| `image-manager.js`        | `initImageManager`      | frame-elements, i18n           | Image upload, resize, captions       |
| `submission-checklist.js` | `showSubmissionChecklist`, `buildChecklistItems` | in-page-modal, i18n | Pre-export checklist dialog; item-building is a pure exported function (tested) |
| `text-export.js`          | `downloadText`, `downloadPDF`, `downloadDocx`, `getCleanHTML` | frame-elements, word-counter, i18n, docx-export, jsPDF (CDN) | TXT/PDF/real-.docx export; getCleanHTML is the tested gate that keeps frame scaffold out of deliverables |
| `docx-export.js`          | `loadDocxLibrary`, `renderHtmlNodeToDocx`, `buildDocxDocument` | vendored `/vendor/docx.iife.js` (lazy, classic script → `window.docx`) | Real OOXML .docx builder ported from Lockdown's besvarelse-render (headings, bold/italic/underline, lists, real Word tables, embedded images with captions, real Word lists — w:numPr bullets + per-list restarting numbering, header/footer with page-number fields); labels injected by caller for i18n |
| `find-replace.js`         | `initFindReplace`       | i18n                           | In-editor search bar logic (CSS Highlight API) |
| `special-chars-panel.js`  | `initSpecialCharsPanel` | (none)                         | Floating column of special chars (ä ö ü ß / é è ê / ñ ¿ ¡ …) anchored to the caret. Driven externally via `setActiveLanguage(lang)` — the embedded leksihjelp bridge in `standalone-writer.js` calls it. The previous self-rendered "Annet språk?" picker was removed (Skrivespråk is now owned by the bridge) |
| `spinner-data-nb.js`      | `SPINNER_DATA_NB`       | (none)                         | Bokmål word suggestion data          |
| `spinner-data-nn.js`      | `SPINNER_DATA_NN`       | (none)                         | Nynorsk word suggestion data         |
| `spinner-data-en.js`      | `starters`, `synonyms`, `stopwords`, `stem` | (none)     | English word suggestion data (English subject; bucket keys shared with nb/nn) |
| `paragraph-trainer.js`    | `initParagraphTrainer`  | i18n, html-escape, word-counter, toast-notification, in-page-modal, ./paragraph-trainer-data, spinner-data-nb/nn (dynamic) | Three-step paragraph drill (trestegsmodellen: temasetning → utdyping → avslutningssetning). Topic deck in localStorage (no repeats until exhausted), three labelled writing fields with sentence-starter chips and live word counts, live checklist (four form checks — one topic sentence, causal marker, example marker, keyword echo in the closing — verified from the text with tips via `evaluateChecks`), assembled-paragraph preview with copy and optional save-as-document (host-provided `onSaveDocument`). Draft persists in localStorage. Finished attempts (copy/save) log to a capped history list (`appendHistoryEntry`, localStorage) shown as a collapsed «Tidligere avsnitt» section. Starter chips use the frame-guide system: authored STEP_STARTERS are the initial fill, "🎲 Flere forslag" draws level-aware extras per step from the writing-spinner word bank (generell + droefting genres) with sliding window + scramble reveal |
| `paragraph-trainer-data.js` | `TRAINER_TOPICS`, `STEP_STARTERS` | (none)             | Genre-neutral practice claims (nb+nn per topic) and per-step sentence starters for the paragraph trainer |
| `sentence-starter-drill.js` | `initSentenceStarterDrill`, `evaluateStarterSentence` | i18n, html-escape, spinner-data-nb/nn/en (dynamic) | Micro-drill (school pages): a topic (trainer deck) + one rhetorical function with a one-line job description + spinner starters as chips; write one sentence, two live checks. No draft/history/save |
| `german-exam-data.js`     | `writingTasks`, `examTasks`, `tasks`, `LEVELS`, `MODES` | lazy `german-exam-svg/*.js`    | Static task corpus for German exam spinner; exam mode includes 9 Tysk I and 9 Tysk II tasks from Udir/exam examples; each task ships `modelAnswers: { simple, rich }` (no glossary) |
| `german-exam-spinner.js`  | `initGermanExamSpinner` | i18n, html-escape, ./german-exam-data | Portable spinner UI; deck logic in localStorage; emits onPickTask callback; preview uses `modelAnswers.simple` |
| `german-hint-drawer.js`   | `initGermanHintDrawer`  | i18n, html-escape              | Slide-in drawer that shows the simple+rich Norwegian drafts; mounted in the editor when doc has `germanHint` metadata |
| `insights-drawer.js`      | `initInsightsDrawer`    | i18n                           | Slide-in drawer for tools/analysis (replaces the old tools dropdown menu) |
| `editor-lang.js`          | `initEditorLang`, `langToTag` | (none)                   | Syncs the editor's `lang` + `spellcheck` attributes with the writing language; native spell-check is disabled while Leksihjelp owns the page |
| `read-aloud.js`           | `initReadAloud`, `splitIntoChunks`, `pickVoice` | i18n, frame-elements, toast-notification, editor-lang | Reads the document aloud (Web Speech API), block by block with highlight + scroll-along; sentence-chunked to dodge Chrome's long-utterance bug; voice matched to the writing language |
| `reading-settings.js`     | `initReadingSettings`, `normalizeSettings` | i18n              | Dyslexia-friendly display panel: easy-read font, text size, line/letter spacing. Inline styles on the editor container only (saved HTML untouched); persisted in `skriv.readingSettings` |
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
| `nb/fortelling.md` | Fortelling (barneskole) | Bokmål |
| `nb/faktatekst.md` | Faktatekst (barneskole) | Bokmål |
| `nb/bokmelding.md` | Bokmelding (barneskole) | Bokmål |
| `nb/soeknad.md` | Søknad | Bokmål |
| `nb/formelt-brev.md` | Formelt brev | Bokmål |
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
| `nn/fortelling.md` | Forteljing (barneskule) | Nynorsk |
| `nn/faktatekst.md` | Faktatekst (barneskule) | Nynorsk |
| `nn/bokmelding.md` | Bokmelding (barneskule) | Nynorsk |
| `nn/soeknad.md` | Søknad | Nynorsk |
| `nn/formelt-brev.md` | Formelt brev | Nynorsk |
| `en/analyse.md`   | Analysis      | English  |
| `en/droefting.md` | Discussion essay | English |
| `en/kronikk.md`   | Opinion piece | English  |
| `en/kaaseri.md`   | Humorous essay | English |
| `en/fagartikkel.md` | Academic article | English |
| `en/leserinnlegg.md` | Letter to the editor | English |
| `en/novelle.md`   | Short story   | English  |
| `en/retorisk-analyse.md` | Rhetorical analysis | English |
| `en/kortsvar.md` | Short answer | English |
| `en/kreativ-tekst.md` | Creative text | English |
| `en/reflekterende-tekst.md` | Reflective essay | English |
| `en/sammenligning.md` | Comparative essay | English |
| `en/fortelling.md` | Story (barneskole) | English |
| `en/faktatekst.md` | Factual text (barneskole) | English |
| `en/bokmelding.md` | Book review (barneskole) | English |
| `en/soeknad.md` | Job application | English |
| `en/formelt-brev.md` | Formal letter | English |
