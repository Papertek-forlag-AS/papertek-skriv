# Module Registry

> Last updated: 2026-09-01

This registry covers every authored ES module, classic-script integration, vendored module group, locale, and writing frame. Mounted feature and screen initializers return a teardown-capable API unless a row explicitly describes a one-shot action or pure data helper. App-wide boot initializers such as i18n, theme, and service-worker registration are one-shot.

## `app/` — product wiring and storage

| Module | Public exports | Direct dependencies | Purpose |
| --- | --- | --- | --- |
| `cleanup-desk.js` | `getCleanupReasons`, `getCleanupDocuments`, `initCleanupDesk` | document/folder/trash stores, folder picker, shared i18n/escaping/modal/toast/ARIA live | Responsive pedagogical workspace for documents missing a title or folder, with explicit open/assign/trash actions and drag enhancement |
| `db.js` | `DB_NAME`, `DB_VERSION`, `normalizeFolderName`, `getSchoolYearLabel`, `upgradeSkrivDatabase`, `openSkrivDatabase`, `closeSkrivDatabase` | none | Single opener, migration/repair path, blocked/version-change safety for `skriv-documents` |
| `document-list.js` | `renderDocumentList`, `renderTrashView` | cleanup desk, document/trash/search/stats/sidebar/folder modules; Microsoft config/storage/dialog; shared UI/i18n/theme helpers | Responsive library with three-column desktop layout, one canonical list, routed trash screen, mobile folder drawer, optional Microsoft remote import, interface language, and create/open actions |
| `document-search.js` | `createSearchBar`, `filterDocuments` | i18n | Debounced library search and keyboard shortcut |
| `document-store.js` | `DOCUMENT_WRITING_LANGUAGES`, `normalizeWritingLanguage`, `getDocumentWritingLanguage`, `createDocument`, `getDocument`, `saveDocument`, `listDocuments`, `deleteDocument` | `db`, `folder-store`, i18n | Document CRUD and writing-language compatibility; one-transaction read/merge/write with optional `preserveUpdatedAt` and `expectedFields` compare-and-swap guard |
| `folder-picker.js` | `createFolderPicker`, `createFolderBadges` | `folder-store`, `school-level`, i18n, HTML escaping | Multi-folder assignment picker and badges; filters system folders by current school level (matches sidebar logic) so previous-curriculum folders don't pollute the list |
| `folder-store.js` | `PERSONAL_FOLDER_NAME`, `PERSONAL_SUBJECT`, `MAX_FOLDER_DEPTH`, `getSchoolYear`, `getCurrentSchoolYear`, `setCurrentSchoolYear`, `getAvailableSchoolYears`, `createFolder`, `renameFolder`, `deleteFolder`, `moveFolder`, `getAllFolders`, `getRootFolders`, `getChildren`, `getFolderById`, `getFolderPath`, `getFolderDepth`, `buildFolderTree`, `flattenTree`, `addDocToFolder`, `removeDocFromFolder`, `setDocFolders`, `isPersonalFolder`, `isSystemFolder` | `db`, `school-level` | Folder tree CRUD, school-year helpers, and document membership |
| `german-exam-route.js` | `renderGermanExamScreen` | German spinner, document/folder stores, shared i18n/modal/escaping | `#/tysk` screen; ensures a "Tysk" folder, creates a document on pick, and attaches `germanHint: { simple, rich }` metadata instead of seeding draft content into the HTML |
| `leksihjelp-bridge.js` | `initLeksihjelpBridge` | runtime loader globals | Detects whether the Leksihjelp Chrome extension is active on the page (`window.__lexiPresent` / `window.__lexiVocab`); brokers Skrivespråk, Oppslagsspråk, and Eksamensmodus as the single source of truth for the special-chars panel and dictionary modules. Also exposes `requestExtensionPanel()`, firing `skriv:leksihjelp:openPanel` so the extension can open its own side panel |
| `leksihjelp-dictionary.js` | `initLeksihjelpDictionary`, `findLeksihjelpEntry` | runtime `__lexiVocab` and browser selection APIs | Clicking a word in the editor opens a floating popup with translation, part-of-speech, gender, and base-form lookup (`caretRangeFromPoint` for word-boundary detection); yields entirely when the extension owns the surface |
| `leksihjelp-settings.js` | `initLeksihjelpSettings` | i18n, HTML escaping, `leksihjelp-view-host.js` | Slide-in drawer with two tabs. Ordbok hosts Leksihjelp's shared dictionary view (see below); Innstillinger keeps the host-owned controls — Eksamensmodus toggle, Skrivespråk/Oppslagsspråk pickers, and a Grammatikknivå section built on the vendored `grammar-features-section.js` with preset pills (Lite/Middels/Mye/Alt). Hidden when the bridge reports `status === 'extension'` |
| `leksihjelp-view-host.js` | `mountLeksihjelpDictionary` | i18n, HTML escaping, runtime `__lexi*` globals | Mounts Leksihjelp's shared `dictionary-view` into the drawer, so the dictionary is the same surface in Skriv, Lockdown and the extension. Declares only the inclusion contract — the deps the view needs — and the four places Skriv differs: vocabulary is bundled (not IndexedDB-cached), no audio, no external links, and language pills are dictionary-scoped so they change the lookup language without touching what the pupil is writing in |
| `library-backup.js` | `buildLibraryRestorePlan`, `buildVersionRestorePlan`, `serializeLibraryBackup`, `parseLibraryBackup`, `LibraryRestorePartialError`, `initLibraryBackup` | `db`, version-history | Validated whole-library `.skriv` backup and deterministic merge-only restore; unsafe-resource HTML is rejected before DOM parsing, Microsoft metadata has an exact schema/unique remote identity, and collision/alias clones drop remote links |
| `main.js` | self-executing entry | i18n, theme, toast, document list, writer, trash, SW manager, school onboarding, German route, paragraph-trainer route | Initialization and awaited hash-route teardown; gates the school-level onboarding modal per route rather than at init — shown on first navigation into every screen except `#/avsnitt`, since level has no function there |
| `microsoft-auth.js` | `MICROSOFT_GRAPH_SCOPES`, `MSAL_BROWSER_PATH`, `MicrosoftAuthError`, `loadMicrosoftAuthenticationLibrary`, `createMicrosoftAuth` | `microsoft-config` plus runtime vendored `window.msal` | Session-scoped delegated Microsoft authentication with exact `Files.ReadWrite.All` for personal OneDrive and group-owned Teams/SharePoint files within the pupil's existing access, authorization code + PKCE, dedicated redirect bridge, explicit selection when cached identity is ambiguous, token acquisition, and full connector-cache disconnect |
| `microsoft-config.js` | `MICROSOFT_CONFIG_META_NAMES`, `MICROSOFT_SESSION_OVERRIDE_KEYS`, `MicrosoftConfigError`, `isMicrosoftGuid`, `normalizeMicrosoftSharePointHost`, `isMicrosoftSharePointUrlAllowed`, `validateMicrosoftConfig`, `isMicrosoftConfigValid`, `isMicrosoftLocalhost`, `readMicrosoftConfig`, `getMicrosoftConfig`, `setMicrosoftConfigOverrides`, `clearMicrosoftConfigOverrides` | none | Validates production meta configuration and localhost-only session overrides for one Entra client, tenant, and bare global-cloud SharePoint host; builds the dedicated redirect URI and enforces exact tenant/tenant-`-my` HTTPS URLs |
| `microsoft-document-codec.js` | `createMicrosoftDocumentFileName`, `serializeMicrosoftDocument`, `parseMicrosoftDocument`, `isMicrosoftDocumentFile`, `hashMicrosoftDocument` | `library-backup` | Strict native one-document `.skriv` filename, envelope, folder-closure validation, connector-metadata stripping, and exact UTF-8 SHA-256 |
| `microsoft-graph.js` | `MICROSOFT_GRAPH_BASE_URL`, `MicrosoftGraphError`, `MicrosoftGraphAuthenticationError`, `MicrosoftGraphPermissionError`, `MicrosoftGraphNotFoundError`, `MicrosoftGraphConflictError`, `MicrosoftGraphRateLimitError`, `encodeSharingUrl`, `createMicrosoftGraphClient` | none | Narrow no-store Graph v1.0 client for request-scoped Teams/SharePoint sharing-link redemption, bounded folder/list/create/eTag-update/import, moved/renamed-item preflight, authoritative upload-ack fallback, fatal UTF-8 decode, conflicts, list caps, and sub-60 MiB transfers |
| `microsoft-storage.js` | `MICROSOFT_TARGET_SESSION_KEY`, `MicrosoftStorageError`, `createMicrosoftStorage` | Microsoft config/auth/Graph/codec, document/folder/trash stores | Local-authoritative connector orchestration: host-bounded session target, hashed account binding, atomic metadata CAS, queued sync, unique active/trash remote identity, crash-safe **Uten mappe** import, **Keep both**, unlink/disconnect, and teardown |
| `microsoft-storage-dialog.js` | `getMicrosoftStorageErrorKey`, `getMicrosoftSyncStateKey`, `getSafeMicrosoftUrl`, `normalizeRemoteDocuments`, `showMicrosoftStorageDialog` | `microsoft-config`; shared i18n, HTML escaping, DOM helpers | Accessible connector dialog for localhost configuration/cleanup, connect/reconnect/disconnect, host-checked folder selection, import, sync/unlink, and conflict-only **Keep both**; local unlink remains available without config, account, or target |
| `onboarding-modal.js` | `showOnboardingModal` | `school-level`, i18n, HTML escaping, DOM helpers | First-run/change-school-level dialog |
| `paragraph-trainer-route.js` | `renderParagraphTrainerScreen` | `editor-core/student/paragraph-trainer`, document-store, i18n, html-escape, school-level | Route + screen wiring for `#/avsnitt`; hosts the portable three-step paragraph trainer, passes `getLevel`, and provides `onSaveDocument` (creates a document from the finished paragraph and opens the editor); drafts still live in localStorage inside the trainer |
| `school-level.js` | `SCHOOL_LEVELS`, `LEVEL_SUBJECTS`, `SCHOOL_LEVEL_BANDS`, `getSchoolLevelBand`, `getSchoolLevel`, `setSchoolLevel`, `hasSchoolLevel`, `getSubjectsForLevel` | none | Norwegian school-level data and persisted selection; `getSchoolLevelBand()` returns `null` for an unset/unknown level so level-aware pickers fall back to showing everything |
| `school-page.js` | self-executing entry | i18n, theme, toast-notification, `editor-core/student/paragraph-trainer` | Entry point for `school.html` — standalone per-school one-pager hosting the paragraph trainer without the Skriv shell (no router, sidebar, onboarding, or service-worker registration). School identity (name, fixed level, accent palette remapping the emerald scale, theme-color) comes from the `SKRIV_SCHOOLS` config map in `school.html`, resolved via `?skole=<id>`; adding a school is one config entry. `stabekk.html` is a static redirect to `school.html?skole=stabekk`. No `onSaveDocument` is passed, so the trainer's save button stays hidden here |
| `sidebar.js` | `createSidebar` (returns `{ destroy, update, setDragActive }`) | folders, school level, onboarding, backup, shared i18n/modal/toast/escaping | Desktop folder navigation, year/level controls, backup/restore, drag/drop |
| `standalone-writer.js` | `launchEditor` | app stores/Leksihjelp/Microsoft config-storage-dialog; shared editor utilities; student features | Editor composition, document-language binding, safe local autosave/teardown, independent linked-document Microsoft status/scheduling, and lazy review tools |
| `sw-manager.js` | `initServiceWorker` | i18n, toast | Registration, waiting-worker prompt, explicit flush-before-update, development disable |
| `trash-store.js` | `trashDocument`, `restoreDocument`, `listTrashedDocuments`, `permanentlyDelete`, `emptyTrash`, `getTrashCount`, `purgeExpired`, `getRetentionDays` | `db`, version-history | Atomic soft delete/restore and snapshot-aware permanent cleanup |
| `word-count-stats.js` | `showWordCountStats` | `folder-store`, i18n, HTML escaping | Library word-count overlay |

An earlier draft of this table gave `library-backup.js` a different, smaller export list (`BACKUP_FORMAT`, `downloadLibraryBackup`, `restoreLibraryBackup`, etc.) — those names do not exist in the current module; the row above matches the actual exports in `public/js/app/library-backup.js`. `js/leksihjelp-loader.js` and the vendored `js/leksihjelp/**` classic-script group are covered in their own table further down, under "Classic-script application integration".

### Microsoft connector factory APIs

- `createMicrosoftAuth()` returns `{ initialize, connect, getAccessToken, getAccount, isConnected, disconnect }`. Background token requests pass `allowPopup: false`; only explicit connect/token UI may open a popup.
- `createMicrosoftGraphClient()` returns `{ resolveSharedFolder, listSkrivDocuments, createSkrivDocument, updateSkrivDocument, downloadSkrivDocument }`.
- `createMicrosoftStorage()` returns `{ isConfigured, getConfig, getAccount, connect, disconnect, getTarget, selectTarget, clearTarget, listRemoteDocuments, syncDocument, scheduleDocumentSync, importRemoteDocument, unlinkDocument, getDocumentSyncState, destroy }`.
- `showMicrosoftStorageDialog({ storage, documentId?, onImported?, onDocumentChanged?, onConfigurationChanged? })` resolves when its accessible modal closes. Omitting `documentId` selects library/import mode; supplying it selects editor/link-sync mode.

(The `editor-core/shared/` module table lives in its own section below; it is not duplicated here.)

### Classic-script application integration

| File/group | Publishes | Depends on | Purpose |
| --- | --- | --- | --- |
| `js/leksihjelp/embed/host-runtime.js` | `window.__lexiHostRuntime` (`createHostRuntime`, `createMemoryStore`, `CAPABILITY_KEYS`) | none | Vendored. Leksihjelp's shared embed runtime (layer 2.5): the `chrome.*` shim, the capability contract, and the store/dataSource seams. Deliberately absent from the upstream extension manifest, so it is absent from `load-order.json` and the host loads it first |
| `js/leksihjelp-loader.js` | `window.__skrivLeksihjelpShim` (`bindBridge`, `unbindBridge`, `isBound`, `runtime`) | `window.__lexiHostRuntime` | Skriv's host config for that runtime: asset base, seeded settings, capabilities, and the two-way bridge binding. It no longer implements a `chrome.*` shim. Two rules: never set `runtimeId` (its absence is the sentinel that keeps `vocab-seam` treating Skriv as an embedded host, not an extension), and keep capabilities false/null |
| `js/leksihjelp/**` | generated `window.__lexi*` globals | host runtime, then upstream-ordered sibling scripts | Vendored Leksihjelp 3.8.136 snapshot (commit `665ff87f0d71f82b3cf60411b0004bd93b720e85`), 254 files, profile `no-audio`, scoped `.skriv-leksihjelp`, no subset — Skriv takes the shared layer-2 views too. Written by leksihjelp's `embed-sync` via `scripts/sync-leksihjelp.js`; never hand-edited. `public/js/leksihjelp/.version` is authoritative for the version |
| `microsoft-auth-redirect.html` + `vendor/msal-redirect-bridge-5.17.3.min.js` | `globalThis.msalRedirectBridge` in the popup response page | no app module; vendored MSAL bridge | Dedicated network-only popup response relay; hosting must send `Cache-Control: no-store` and no `Cross-Origin-Opener-Policy` header for both resources |

## `editor-core/config.js`

| Module | Exports | Purpose |
| --- | --- | --- |
| `config.js` | `SPECIAL_CHAR_GROUPS` | Portable special-character groups by writing language |

## `editor-core/shared/` — portable utilities

| Module | Public exports | Direct dependencies | Purpose |
| --- | --- | --- | --- |
| `aria-live.js` | `announce` | none | Shared screen-reader live announcements |
| `auto-save.js` | `createAutoSave` | none | Serialized, coalesced, retryable debounced saves with `flush()`/async teardown |
| `dom-helpers.js` | `getModalParent` | none | Chooses a safe overlay parent |
| `frame-elements.js` | `FRAME_SELECTORS`, `ALL_FRAME_SCAFFOLD`, `isFrameElement`, `isInsideNonEditableBlock`, `getCleanEditorText`, `removeFrameScaffold`, `isImageBlock` | none | Identifies/removes non-writing editor scaffold |
| `html-escape.js` | `escapeHtml`, `escapeAttr` | none | Text and attribute escaping |
| `i18n.js` | `PLURAL_RULES`, `initI18n`, `t`, `getCurrentLanguage`, `getDateLocale`, `getSupportedLanguages`, `setLanguage`, `onLanguageChange`, `renderLanguageSelector` | locale modules | Bokmål/Nynorsk/English localization and visible language selector |
| `in-page-modal.js` | `showInPageConfirm`, `showInPagePrompt`, `showInPageContent`, `showInPageAlert` | HTML escaping, DOM helpers | Promise-based accessible dialogs |
| `theme.js` | `getTheme`, `setTheme`, `cycleTheme`, `isDark`, `initTheme`, `getThemeIcon` | none | Light/dark/system preference and media-query binding |
| `toast-notification.js` | `showToast` | HTML escaping, DOM helpers | Short non-blocking feedback |
| `word-counter.js` | `countWords`, `attachWordCounter` | i18n, frame-elements | Scaffold-aware word/character counting |

`shared/` has no import from `student/` or `app/`.

## `editor-core/student/` — one feature per module

| Module | Public exports | Direct dependencies | Purpose / default state |
| --- | --- | --- | --- |
| `argument-flow.js` | `initArgumentFlow` | i18n, frame-elements | Local argument-marker overview; lazy review tool |
| `docx-export.js` | `loadDocxLibrary`, `renderHtmlNodeToDocx`, `buildDocxDocument` | vendored `/vendor/docx.iife.js` (lazy, classic script → `window.docx`) | Real OOXML `.docx` builder ported from Lockdown's besvarelse-render: headings, bold/italic/underline, lists (real Word `w:numPr` bullets with per-list restarting numbering), real Word tables, embedded images with captions, header/footer with page-number fields; labels injected by the caller for i18n |
| `drag-handle.js` | `initDragHandle` | i18n | Pointer and keyboard paragraph-block reordering with owned listener cleanup |
| `editor-lang.js` | `initEditorLang`, `langToTag` | none | Syncs the editor's `lang` + `spellcheck` attributes with the writing language; native spell-check is disabled while Leksihjelp owns the page |
| `editor-toolbar.js` | `initEditorToolbar` | local Floating UI, i18n, modal, frame-elements | Selection formatting toolbar with roving keyboard navigation; accepts `{ skipAutoDetectAdvanced }` to opt out of auto-enabling advanced mode from existing headings/lists |
| `find-replace.js` | `initFindReplace` | i18n | In-document find/replace surface (CSS Highlight API) |
| `focus-mode.js` | `initFocusMode` | i18n | Distraction-reduced writing view; lazy |
| `frame-guide.js` | `initFrameGuide` | i18n, toast; lazy spinner data (nb/nn/en) | Responsive writing-frame guide and paragraph prompts |
| `frame-parser.js` | `parseFrameMarkdown` | none | Parses Markdown frame definitions, including a spinner-bucket per section/subsection |
| `frame-selector.js` | `DEFAULT_FRAME_REGISTRY`, `resolveFrameLanguage`, `resolveFramePath`, `partitionFramesByLevel`, `initFrameSelector` | i18n, modal, frame-parser | Language/level-aware frame picker over all 17 genres; the registry carries recommended `levels` bands, grouped as recommended-for-level vs. "Flere skriverammer" via the `getLevelBand` option; frame files resolve per writing language (nb/nn/en) via the `getWritingLanguage` option, explicitly falling back to Bokmål for any other document language |
| `german-exam-data.js` | `writingTasks`, `examTasks`, `tasks`, `LEVELS`, `MODES` | lazy German SVG modules | German task corpus and model-draft metadata; exam mode includes 9 Tysk I and 9 Tysk II tasks from Udir/exam examples, each with `modelAnswers: { simple, rich }` |
| `german-exam-spinner.js` | `initGermanExamSpinner` | i18n, HTML escaping, German data | Non-repeating Tysk 1/Tysk 2 task spinner; deck logic in localStorage, emits an `onPickTask` callback, preview uses `modelAnswers.simple` |
| `german-hint-drawer.js` | `initGermanHintDrawer` | i18n, HTML escaping | Simple/rich Norwegian planning-hint drawer for German tasks |
| `image-manager.js` | `initImageManager` | i18n, toast, frame-elements | Local image upload/compression, caption, resize, scoped undo |
| `insights-drawer.js` | `initInsightsDrawer` | i18n | Entry surface for explicitly opened review tools |
| `keyboard-shortcuts.js` | `initKeyboardShortcuts` | i18n | Editor shortcuts and shortcut help |
| `lix-score.js` | `calculateLix`, `getLixCategory`, `isAppropriateForLevel`, `initLixScore` | i18n | Rough readability observation; lazy and not grading |
| `matte.js` | `initMatte` | i18n | Superscript/subscript formatting; portable but currently not mounted |
| `onboarding-tour.js` | `initOnboardingTour` | none | Explicit opt-in tour; never auto-started by the default editor |
| `paragraph-map.js` | `initParagraphMap` | i18n, frame-elements | Document minimap; lazy |
| `paragraph-trainer.js` | `evaluateChecks`, `appendHistoryEntry`, `initParagraphTrainer` | i18n, HTML escaping, word-counter, toast, in-page-modal, `./paragraph-trainer-data`, lazy spinner-data-nb/nn | Three-step paragraph drill (trestegsmodellen: temasetning → utdyping → avslutningssetning). Topic deck in localStorage (no repeats until exhausted); three labelled writing fields with sentence-starter chips and live word counts; live checklist of four form checks (topic sentence, causal marker, example marker, keyword echo in the closing) verified via `evaluateChecks`; assembled-paragraph preview with copy and an optional host-provided `onSaveDocument`. Finished attempts log to a capped history list (`appendHistoryEntry`) shown as a collapsed "Tidligere avsnitt" section. "🎲 Flere forslag" draws level-aware starter chips from the writing-spinner word bank |
| `paragraph-trainer-data.js` | `TRAINER_TOPICS`, `STEP_STARTERS` | none | Genre-neutral practice claims (nb+nn per topic) and per-step sentence starters for the paragraph trainer |
| `read-aloud.js` | `initReadAloud`, `splitIntoChunks`, `pickVoice` | i18n, frame-elements, toast, `editor-lang` | Reads the document aloud (Web Speech API) block by block with highlight + scroll-along; sentence-chunked to dodge Chrome's long-utterance bug; voice matched to the writing language |
| `reading-settings.js` | `initReadingSettings`, `normalizeSettings` | i18n | Dyslexia-friendly display panel: easy-read font, text size, line/letter spacing; applies inline styles to the editor container only (saved HTML untouched), persisted in `skriv.readingSettings` |
| `reference-manager.js` | `initReferences` | i18n, escaping, DOM/modal helpers, frame-elements | Inline citations and bibliography |
| `sentence-length.js` | `initSentenceLength` | i18n, frame-elements | Sentence-rhythm visualization; lazy |
| `slash-menu.js` | `initSlashMenu` | i18n, HTML escaping | Slash-command insertion menu |
| `special-chars-panel.js` | `initSpecialCharsPanel` | none | Caret-aware characters for the active document language, driven externally via `setActiveLanguage(lang)` from the embedded Leksihjelp bridge |
| `spinner-data-nb.js` | `starters`, `synonyms`, `stopwords`, `stem` | none | Bokmål suggestion/repetition language data |
| `spinner-data-nn.js` | `starters`, `synonyms`, `stopwords`, `stem` | none | Nynorsk suggestion/repetition language data |
| `spinner-data-en.js` | `starters`, `synonyms`, `stopwords`, `stem` | none | English suggestion/repetition language data (English subject; bucket keys shared with nb/nn) |
| `submission-checklist.js` | `showSubmissionChecklist`, `buildChecklistItems` | i18n, HTML escaping, DOM helpers | One-shot accessible pre-export checklist for PDF/TXT/`.docx`; `buildChecklistItems` is a pure, separately tested function |
| `table-manager.js` | `initTableManager` | i18n | Simple table insertion/editing; lazy |
| `text-export.js` | `downloadText`, `downloadPDF`, `downloadDocx`, `getCleanHTML` | word-counter, modal, frame-elements, i18n, `docx-export` (lazy), local jsPDF global | TXT, PDF, and real-`.docx` export; `getCleanHTML` is the tested gate that keeps frame scaffold out of deliverables |
| `toc-manager.js` | `initTOC` | i18n, frame-elements | Heading-derived table of contents |
| `version-history.js` | `VERSION_HISTORY_POLICY`, `VERSION_HISTORY_STORE_NAME`, `openVersionHistoryDatabase`, `deleteSnapshotsForDocuments`, `deleteSnapshotsForDocument`, `initVersionHistory` | i18n, word-counter, toast | Bounded local snapshots, timeline, restore, deletion helpers |
| `word-frequency.js` | `initWordFrequency` | i18n, frame-elements; lazy spinner data (nb/nn/en) | Repetition observation/highlights; lazy |
| `writing-feedback.js` | `initWritingFeedback` | i18n, frame-elements | Rule-based local writing observations; lazy and not grading |
| `writing-progress.js` | `initWritingProgress` | i18n, word-counter | Optional goal/streak/progress UI; not mounted by default |
| `writing-spinner.js` | `initWritingSpinner` | i18n, frame-elements; lazy spinner data (nb/nn/en) | Contextual writing suggestions; lazy |

`frame-manager.js` appeared in an earlier draft of this table (`initFrameManager`, portable scaffold-in-editor implementation). It was removed upstream and no longer exists in `public/js/editor-core/student/`; it has been dropped from this registry.

### German SVG leaf modules

Each file exports one default SVG string and imports nothing:

`berlin.js`, `birthday.js`, `city.js`, `environment.js`, `friends.js`, `future.js`, `hotel-complaints.js`, `journey.js`, `lost-bag.js`, `multicultural.js`, `poster-choice.js`, `school.js`, `social-media.js`, `summer-job.js`, `vacation-photos.js`, and `youth-center-poster.js`.

## `editor-core/vendor/` — pinned Floating UI 1.7.5

| Module | Upstream exports/dependencies | Purpose |
| --- | --- | --- |
| `floating-ui-dom.js` | `arrow`, `autoPlacement`, `autoUpdate`, `computePosition`, `detectOverflow`, `flip`, `getOverflowAncestors`, `hide`, `inline`, `limitShift`, `offset`, `platform`, `shift`, `size`; imports core, utils, DOM utils | Browser positioning entry used by toolbar |
| `floating-ui-core.js` | `arrow`, `autoPlacement`, `computePosition`, `detectOverflow`, `flip`, `hide`, `inline`, `limitShift`, `offset`, `rectToClientRect`, `shift`, `size`; imports utils | Platform-neutral positioning engine |
| `floating-ui-utils-dom.js` | `getComputedStyle`, `getContainingBlock`, `getDocumentElement`, `getFrameElement`, `getNearestOverflowAncestor`, `getNodeName`, `getNodeScroll`, `getOverflowAncestors`, `getParentNode`, `getWindow`, `isContainingBlock`, `isElement`, `isHTMLElement`, `isLastTraversableNode`, `isNode`, `isOverflowElement`, `isShadowRoot`, `isTableElement`, `isTopLayer`, `isWebKit`; leaf | DOM-specific primitives |
| `floating-ui-utils.js` | `alignments`, `clamp`, `createCoords`, `evaluate`, `expandPaddingObject`, `floor`, `getAlignment`, `getAlignmentAxis`, `getAlignmentSides`, `getAxisLength`, `getExpandedPlacements`, `getOppositeAlignmentPlacement`, `getOppositeAxis`, `getOppositeAxisPlacements`, `getOppositePlacement`, `getPaddingObject`, `getSide`, `getSideAxis`, `max`, `min`, `placements`, `rectToClientRect`, `round`, `sides`; leaf | Shared positioning math/utilities |

These are distribution files and are not hand-edited.

## `editor-core/locales/`

| File | Language | Export |
| --- | --- | --- |
| `nb.js` | Norsk Bokmål | default translation object |
| `nn.js` | Norsk Nynorsk | default translation object |
| `en.js` | English | default translation object |

All three objects must have matching key paths. Every visible application string uses `t('key')`.

## `frames/` — writing definitions

The registry in `frame-selector.js` (`DEFAULT_FRAME_REGISTRY`) drives the picker, resolving each frame's `/frames/{{lang}}/<stem>.md` path template against the document's writing language (nb, nn, or en — falling back to Bokmål for any other language). There are 17 genres, each present in all three languages (`public/frames/nb/`, `public/frames/nn/`, `public/frames/en/`), 51 files total. The legacy language-less root paths (`/frames/analyse.md`, `/frames/droefting.md`, `/frames/kronikk.md`) that an earlier draft of this doc described as "retained for compatibility" were removed upstream and no longer exist — every frame is reached through its per-language path.

| ID / file stem | Genre (nb / nn / en) | Recommended school bands |
| --- | --- | --- |
| `fortelling` | Fortelling / Forteljing / Story | barneskole, ungdomsskole |
| `faktatekst` | Faktatekst / Faktatekst / Factual text | barneskole, ungdomsskole |
| `bokmelding` | Bokmelding / Bokmelding / Book review | barneskole, ungdomsskole |
| `droefting` | Drøfting / Drøfting / Discussion essay | ungdomsskole, vgs |
| `analyse` | Analyse / Analyse / Analysis | ungdomsskole, vgs |
| `kronikk` | Kronikk / Kronikk / Opinion piece | vgs |
| `kaaseri` | Kåseri / Kåseri / Humorous essay | ungdomsskole, vgs |
| `fagartikkel` | Fagartikkel / Fagartikkel / Academic article | ungdomsskole, vgs |
| `leserinnlegg` | Leserinnlegg / Lesarinnlegg / Letter to the editor | barneskole, ungdomsskole, vgs |
| `soeknad` | Søknad / Søknad / Job application | ungdomsskole, vgs |
| `formelt-brev` | Formelt brev / Formelt brev / Formal letter | ungdomsskole, vgs |
| `novelle` | Novelle / Novelle / Short story | barneskole, ungdomsskole, vgs |
| `retorisk-analyse` | Retorisk analyse / Retorisk analyse / Rhetorical analysis | ungdomsskole, vgs |
| `kortsvar` | Kortsvar / Kortsvar / Short answer | vgs |
| `kreativ-tekst` | Kreativ tekst / Kreativ tekst / Creative text | barneskole, ungdomsskole, vgs |
| `reflekterende-tekst` | Reflekterende tekst / Reflekterande tekst / Reflective essay | ungdomsskole, vgs |
| `sammenligning` | Sammenlignende tekst / Samanliknande tekst / Comparative essay | ungdomsskole, vgs |

Frames outside the selected level remain available under additional choices ("Flere skriverammer"); level metadata recommends rather than prohibits. `getSchoolLevelBand()` returns `null` for an unset/unknown level, so an unset level shows every frame ungrouped.
