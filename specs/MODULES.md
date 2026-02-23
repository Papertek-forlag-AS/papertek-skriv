# Module Registry

> Last updated: 2026-02-23

Every module in the codebase. When you add, remove, or rename a module — update this file.

## app/ — Application layer

| Module                 | Exports                                          | Depends on                          | Purpose                                |
|----------------------- |------------------------------------------------- |------------------------------------ |--------------------------------------- |
| `main.js`              | (self-executing)                                 | i18n, document-list, standalone-writer, trash-store | Hash router, app init         |
| `document-store.js`    | `createDocument`, `getDocument`, `saveDocument`, `listDocuments`, `deleteDocument` | (none) | IndexedDB CRUD for documents           |
| `trash-store.js`       | `moveToTrash`, `restoreFromTrash`, `listTrash`, `purgeExpired`, `deletePermanently` | (none) | Soft-delete with 30-day retention |
| `document-list.js`     | `renderDocumentList`                             | document-store, trash-store, word-count-stats, document-search, i18n, toast-notification | Dashboard/home screen UI   |
| `document-search.js`  | `createSearchBar`, `filterDocuments`              | i18n                                | Search bar with debounced filtering and Ctrl/Cmd+K shortcut |
| `document-tags.js`    | `createTagFilter`, `collectTags`, `filterByTag`, `createTagEditor` | i18n, html-escape | Tag chips for filtering + inline tag editor |
| `standalone-writer.js` | `launchEditor`                                   | 13 student modules, 5 shared modules, document-store, document-tags | Editor orchestrator |
| `word-count-stats.js`  | `showWordCountStats`                             | document-store, i18n                | Statistics overlay with monthly chart  |

## editor-core/shared/ — Cross-product utilities

| Module                    | Exports                                       | Depends on       | Purpose                           |
|-------------------------- |---------------------------------------------- |----------------- |---------------------------------- |
| `i18n.js`                 | `initI18n`, `t`, `setLanguage`, `getLanguage`, `getDateLocale` | locales/*  | i18n with pluralization (nb, nn, en) |
| `html-escape.js`          | `escapeHtml`, `escapeAttr`                    | (none)           | XSS prevention                    |
| `dom-helpers.js`          | `qs`, `qsa`, `on`, `off`                     | (none)           | DOM query/event shortcuts         |
| `frame-elements.js`       | `EDITOR_SEL`, `FRAME_SECTION_SEL`, `getEditorEl`, `isFrameSection` | (none) | Editor element selectors & utils |
| `auto-save.js`            | `createAutoSave`                              | (none)           | Debounced save with status display |
| `word-counter.js`         | `attachWordCounter`, `countWords`             | frame-elements   | Real-time word/char counting      |
| `in-page-modal.js`        | `showModal`, `closeModal`                     | html-escape, dom-helpers | Dialog system               |
| `toast-notification.js`   | `showToast`                                   | html-escape, dom-helpers | Toast alerts                |
| `theme.js`                | `initTheme`, `setTheme`, `getTheme`, `cycleTheme`, `isDark`, `getThemeIcon` | (none) | Dark/light/system theme toggle |
| `aria-live.js`            | `announce`                                        | (none)           | Screen reader announcements via aria-live region |

## editor-core/student/ — Feature modules

Each exports an `init*()` function that returns `{ destroy(), ...api }`.

| Module                    | Init function           | Depends on (shared)            | Purpose                              |
|-------------------------- |------------------------ |------------------------------- |------------------------------------- |
| `editor-toolbar.js`       | `initEditorToolbar`     | i18n, config, frame-elements, special-chars-panel, Floating UI (CDN) | Floating formatting bar (B/I/U/lists/H1/H2) |
| `matte.js`                | `initMatte`             | i18n                           | Superscript/subscript math formatting |
| `frame-parser.js`         | `parseFrame`            | (none)                         | Markdown → structured frame object   |
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
| `special-chars-panel.js`  | `initSpecialCharsPanel` | config, i18n                   | Language-specific character picker    |
| `spinner-data-nb.js`      | `SPINNER_DATA_NB`       | (none)                         | Bokmål word suggestion data          |
| `spinner-data-nn.js`      | `SPINNER_DATA_NN`       | (none)                         | Nynorsk word suggestion data         |

## editor-core/locales/ — Translation files

| File    | Language         | Exports           |
|-------- |----------------- |------------------ |
| `nb.js` | Norsk Bokmål     | `default` (object)|
| `nn.js` | Norsk Nynorsk    | `default` (object)|
| `en.js` | English          | `default` (object)|

## frames/ — Writing templates (Markdown)

| File              | Genre       | Language |
|------------------ |------------ |--------- |
| `analyse.md`      | Analyse     | nb (legacy path) |
| `droefting.md`    | Drøfting    | nb (legacy path) |
| `kronikk.md`      | Kronikk     | nb (legacy path) |
| `nb/analyse.md`   | Analyse     | Bokmål   |
| `nb/droefting.md` | Drøfting    | Bokmål   |
| `nb/kronikk.md`   | Kronikk     | Bokmål   |
| `nn/analyse.md`   | Analyse     | Nynorsk  |
| `nn/droefting.md` | Drøfting    | Nynorsk  |
| `nn/kronikk.md`   | Kronikk     | Nynorsk  |
