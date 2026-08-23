# Module Registry

> Last updated: 2026-08-23

This registry covers every authored ES module, classic-script integration, vendored module group, locale, and writing frame. Mounted feature and screen initializers return a teardown-capable API unless a row explicitly describes a one-shot action or pure data helper. App-wide boot initializers such as i18n, theme, and service-worker registration are one-shot.

## `app/` — product wiring and storage

| Module | Public exports | Direct dependencies | Purpose |
| --- | --- | --- | --- |
| `cleanup-desk.js` | `getCleanupReasons`, `getCleanupDocuments`, `initCleanupDesk` | document/folder/trash stores, folder picker, shared i18n/escaping/modal/toast/ARIA live | Responsive pedagogical workspace for documents missing a title or folder, with explicit open/assign/trash actions and drag enhancement |
| `db.js` | `DB_NAME`, `DB_VERSION`, `normalizeFolderName`, `getSchoolYearLabel`, `upgradeSkrivDatabase`, `openSkrivDatabase`, `closeSkrivDatabase` | none | Single opener, migration/repair path, blocked/version-change safety for `skriv-documents` |
| `document-list.js` | `renderDocumentList`, `renderTrashView` | cleanup desk, document/trash/search/stats/sidebar/folder modules; Microsoft config/storage/dialog; shared UI/i18n/theme helpers | Responsive library with three-column desktop layout, one canonical list, routed trash screen, mobile folder drawer, optional Microsoft remote import, interface language, and create/open actions |
| `document-search.js` | `createSearchBar`, `filterDocuments` | i18n | Debounced library search and keyboard shortcut |
| `document-store.js` | `DOCUMENT_WRITING_LANGUAGES`, `normalizeWritingLanguage`, `getDocumentWritingLanguage`, `createDocument`, `getDocument`, `saveDocument`, `listDocuments`, `deleteDocument` | `db`, `folder-store`, i18n | Document CRUD and writing-language compatibility; one-transaction read/merge/write with optional `preserveUpdatedAt` and `expectedFields` compare-and-swap guard |
| `folder-picker.js` | `createFolderPicker`, `createFolderBadges` | `folder-store`, `school-level`, i18n, HTML escaping | Multi-folder assignment picker and badges |
| `folder-store.js` | `PERSONAL_FOLDER_NAME`, `PERSONAL_SUBJECT`, `MAX_FOLDER_DEPTH`, `getSchoolYear`, `getCurrentSchoolYear`, `setCurrentSchoolYear`, `getAvailableSchoolYears`, `createFolder`, `renameFolder`, `deleteFolder`, `moveFolder`, `getAllFolders`, `getRootFolders`, `getChildren`, `getFolderById`, `getFolderPath`, `getFolderDepth`, `buildFolderTree`, `flattenTree`, `addDocToFolder`, `removeDocFromFolder`, `setDocFolders`, `isPersonalFolder`, `isSystemFolder` | `db`, `school-level` | Folder tree CRUD, school-year helpers, and document membership |
| `german-exam-route.js` | `renderGermanExamScreen` | German spinner, document/folder stores, shared i18n/modal/escaping | `#/tysk` screen and creation of German-language task documents |
| `leksihjelp-bridge.js` | `initLeksihjelpBridge` | runtime loader globals | Two-way language, lookup, limited-assistance, and extension/embedded state seam |
| `leksihjelp-dictionary.js` | `initLeksihjelpDictionary`, `findLeksihjelpEntry` | runtime `__lexiVocab` and browser selection APIs | In-editor word lookup plus a testable vocabulary-seam adapter; yields when the extension owns the surface |
| `leksihjelp-settings.js` | `initLeksihjelpSettings` | i18n, HTML escaping, runtime Leksihjelp data | Embedded dictionary/settings drawer |
| `library-backup.js` | `buildLibraryRestorePlan`, `buildVersionRestorePlan`, `serializeLibraryBackup`, `parseLibraryBackup`, `LibraryRestorePartialError`, `initLibraryBackup` | `db`, version-history | Validated whole-library `.skriv` backup and deterministic merge-only restore; unsafe-resource HTML is rejected before DOM parsing, Microsoft metadata has an exact schema/unique remote identity, and collision/alias clones drop remote links |
| `main.js` | self-executing entry | i18n, theme, toast, document list, writer, trash, SW manager, school onboarding, German route | Initialization and awaited hash-route teardown |
| `microsoft-auth.js` | `MICROSOFT_GRAPH_SCOPES`, `MSAL_BROWSER_PATH`, `MicrosoftAuthError`, `loadMicrosoftAuthenticationLibrary`, `createMicrosoftAuth` | `microsoft-config` plus runtime vendored `window.msal` | Session-scoped delegated Microsoft authentication with exact `Files.ReadWrite.All` for personal OneDrive and group-owned Teams/SharePoint files within the pupil's existing access, authorization code + PKCE, dedicated redirect bridge, explicit selection when cached identity is ambiguous, token acquisition, and full connector-cache disconnect |
| `microsoft-config.js` | `MICROSOFT_CONFIG_META_NAMES`, `MICROSOFT_SESSION_OVERRIDE_KEYS`, `MicrosoftConfigError`, `isMicrosoftGuid`, `normalizeMicrosoftSharePointHost`, `isMicrosoftSharePointUrlAllowed`, `validateMicrosoftConfig`, `isMicrosoftConfigValid`, `isMicrosoftLocalhost`, `readMicrosoftConfig`, `getMicrosoftConfig`, `setMicrosoftConfigOverrides`, `clearMicrosoftConfigOverrides` | none | Validates production meta configuration and localhost-only session overrides for one Entra client, tenant, and bare global-cloud SharePoint host; builds the dedicated redirect URI and enforces exact tenant/tenant-`-my` HTTPS URLs |
| `microsoft-document-codec.js` | `createMicrosoftDocumentFileName`, `serializeMicrosoftDocument`, `parseMicrosoftDocument`, `isMicrosoftDocumentFile`, `hashMicrosoftDocument` | `library-backup` | Strict native one-document `.skriv` filename, envelope, folder-closure validation, connector-metadata stripping, and exact UTF-8 SHA-256 |
| `microsoft-graph.js` | `MICROSOFT_GRAPH_BASE_URL`, `MicrosoftGraphError`, `MicrosoftGraphAuthenticationError`, `MicrosoftGraphPermissionError`, `MicrosoftGraphNotFoundError`, `MicrosoftGraphConflictError`, `MicrosoftGraphRateLimitError`, `encodeSharingUrl`, `createMicrosoftGraphClient` | none | Narrow no-store Graph v1.0 client for request-scoped Teams/SharePoint sharing-link redemption, bounded folder/list/create/eTag-update/import, moved/renamed-item preflight, authoritative upload-ack fallback, fatal UTF-8 decode, conflicts, list caps, and sub-60 MiB transfers |
| `microsoft-storage.js` | `MICROSOFT_TARGET_SESSION_KEY`, `MicrosoftStorageError`, `createMicrosoftStorage` | Microsoft config/auth/Graph/codec, document/folder/trash stores | Local-authoritative connector orchestration: host-bounded session target, hashed account binding, atomic metadata CAS, queued sync, unique active/trash remote identity, crash-safe **Uten mappe** import, **Keep both**, unlink/disconnect, and teardown |
| `microsoft-storage-dialog.js` | `getMicrosoftStorageErrorKey`, `getMicrosoftSyncStateKey`, `getSafeMicrosoftUrl`, `normalizeRemoteDocuments`, `showMicrosoftStorageDialog` | `microsoft-config`; shared i18n, HTML escaping, DOM helpers | Accessible connector dialog for localhost configuration/cleanup, connect/reconnect/disconnect, host-checked folder selection, import, sync/unlink, and conflict-only **Keep both**; local unlink remains available without config, account, or target |
| `onboarding-modal.js` | `showOnboardingModal` | `school-level`, i18n, HTML escaping, DOM helpers | First-run/change-school-level dialog |
| `school-level.js` | `SCHOOL_LEVELS`, `LEVEL_SUBJECTS`, `SCHOOL_LEVEL_BANDS`, `getSchoolLevelBand`, `getSchoolLevel`, `setSchoolLevel`, `hasSchoolLevel`, `getSubjectsForLevel` | none | Norwegian school-level data and persisted selection |
| `sidebar.js` | `createSidebar` | folders, school level, onboarding, backup, shared i18n/modal/toast/escaping | Desktop folder navigation, year/level controls, backup/restore, drag/drop |
| `standalone-writer.js` | `launchEditor` | app stores/Leksihjelp/Microsoft config-storage-dialog; shared editor utilities; student features | Editor composition, document-language binding, safe local autosave/teardown, independent linked-document Microsoft status/scheduling, and lazy review tools |
| `sw-manager.js` | `initServiceWorker` | i18n, toast | Registration, waiting-worker prompt, explicit flush-before-update, development disable |
| `trash-store.js` | `trashDocument`, `restoreDocument`, `listTrashedDocuments`, `permanentlyDelete`, `emptyTrash`, `getTrashCount`, `purgeExpired`, `getRetentionDays` | `db`, version-history | Atomic soft delete/restore and snapshot-aware permanent cleanup |
| `word-count-stats.js` | `showWordCountStats` | `folder-store`, i18n, HTML escaping | Library word-count overlay |

### Microsoft connector factory APIs

- `createMicrosoftAuth()` returns `{ initialize, connect, getAccessToken, getAccount, isConnected, disconnect }`. Background token requests pass `allowPopup: false`; only explicit connect/token UI may open a popup.
- `createMicrosoftGraphClient()` returns `{ resolveSharedFolder, listSkrivDocuments, createSkrivDocument, updateSkrivDocument, downloadSkrivDocument }`.
- `createMicrosoftStorage()` returns `{ isConfigured, getConfig, getAccount, connect, disconnect, getTarget, selectTarget, clearTarget, listRemoteDocuments, syncDocument, scheduleDocumentSync, importRemoteDocument, unlinkDocument, getDocumentSyncState, destroy }`.
- `showMicrosoftStorageDialog({ storage, documentId?, onImported?, onDocumentChanged?, onConfigurationChanged? })` resolves when its accessible modal closes. Omitting `documentId` selects library/import mode; supplying it selects editor/link-sync mode.

### Classic-script application integration

| File/group | Publishes | Depends on | Purpose |
| --- | --- | --- | --- |
| `js/leksihjelp-loader.js` | `window.__skrivLeksihjelpShim` | none | Narrow `chrome.runtime`/`chrome.storage` shim and bridge binder; loaded before Leksihjelp |
| `js/leksihjelp/**` | generated `window.__lexi*` globals | loader shim and upstream-manifest-ordered sibling scripts | Vendored Leksihjelp 3.8.87 snapshot; generated by `scripts/sync-leksihjelp.js`, never hand-edited |
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
| `drag-handle.js` | `initDragHandle` | i18n | Pointer and keyboard paragraph-block reordering with owned listener cleanup |
| `editor-toolbar.js` | `initEditorToolbar` | local Floating UI, i18n, modal, frame-elements | Selection formatting toolbar with roving keyboard navigation |
| `find-replace.js` | `initFindReplace` | i18n | In-document find/replace surface |
| `focus-mode.js` | `initFocusMode` | i18n | Distraction-reduced writing view; lazy |
| `frame-guide.js` | `initFrameGuide` | i18n, toast; lazy spinner data | Responsive writing-frame guide and paragraph prompts |
| `frame-manager.js` | `initFrameManager` | frame-elements | Portable scaffold-in-editor frame implementation; currently not mounted by Skriv |
| `frame-parser.js` | `parseFrameMarkdown` | none | Parses Markdown frame definitions |
| `frame-selector.js` | `DEFAULT_FRAME_REGISTRY`, `resolveFrameLanguage`, `resolveFramePath`, `partitionFramesByLevel`, `initFrameSelector` | i18n, modal, frame-parser | Language/level-aware frame picker; non-NB/NN documents explicitly fall back to Bokmål frames |
| `german-exam-data.js` | `writingTasks`, `examTasks`, `tasks`, `LEVELS`, `MODES` | lazy German SVG modules | German task corpus and model-draft metadata |
| `german-exam-spinner.js` | `initGermanExamSpinner` | i18n, HTML escaping, German data | Non-repeating Tysk 1/Tysk 2 task spinner |
| `german-hint-drawer.js` | `initGermanHintDrawer` | i18n, HTML escaping | Simple/rich Norwegian planning-hint drawer for German tasks |
| `image-manager.js` | `initImageManager` | i18n, toast, frame-elements | Local image upload/compression, caption, resize, scoped undo |
| `insights-drawer.js` | `initInsightsDrawer` | i18n | Entry surface for explicitly opened review tools |
| `keyboard-shortcuts.js` | `initKeyboardShortcuts` | i18n | Editor shortcuts and shortcut help |
| `lix-score.js` | `calculateLix`, `getLixCategory`, `isAppropriateForLevel`, `initLixScore` | i18n | Rough readability observation; lazy and not grading |
| `matte.js` | `initMatte` | i18n | Superscript/subscript formatting; portable but currently not mounted |
| `onboarding-tour.js` | `initOnboardingTour` | none | Explicit opt-in tour; never auto-started by the default editor |
| `paragraph-map.js` | `initParagraphMap` | i18n, frame-elements | Document minimap; lazy |
| `reference-manager.js` | `initReferences` | i18n, escaping, DOM/modal helpers, frame-elements | Inline citations and bibliography |
| `sentence-length.js` | `initSentenceLength` | i18n, frame-elements | Sentence-rhythm visualization; lazy |
| `slash-menu.js` | `initSlashMenu` | i18n, HTML escaping | Slash-command insertion menu |
| `special-chars-panel.js` | `initSpecialCharsPanel` | none | Caret-aware characters for the active document language |
| `spinner-data-nb.js` | `starters`, `synonyms`, `stopwords`, `stem` | none | Bokmål suggestion/repetition language data |
| `spinner-data-nn.js` | `synonyms`, `starters`, `stopwords`, `stem` | none | Nynorsk suggestion/repetition language data |
| `submission-checklist.js` | `showSubmissionChecklist` | i18n, HTML escaping, DOM helpers | One-shot accessible pre-export checklist for PDF/TXT/Word-compatible DOC |
| `table-manager.js` | `initTableManager` | i18n | Simple table insertion/editing; lazy |
| `text-export.js` | `downloadText`, `downloadPDF`, `downloadDocx` | word-counter, modal, frame-elements, i18n, local jsPDF global | TXT, PDF, and Word-compatible HTML `.doc` downloads |
| `toc-manager.js` | `initTOC` | i18n, frame-elements | Heading-derived table of contents |
| `version-history.js` | `VERSION_HISTORY_POLICY`, `VERSION_HISTORY_STORE_NAME`, `openVersionHistoryDatabase`, `deleteSnapshotsForDocuments`, `deleteSnapshotsForDocument`, `initVersionHistory` | i18n, word-counter, toast | Bounded local snapshots, timeline, restore, deletion helpers |
| `word-frequency.js` | `initWordFrequency` | i18n, frame-elements; lazy spinner data | Repetition observation/highlights; lazy |
| `writing-feedback.js` | `initWritingFeedback` | i18n, frame-elements | Rule-based local writing observations; lazy and not grading |
| `writing-progress.js` | `initWritingProgress` | i18n, word-counter | Optional goal/streak/progress UI; not mounted by default |
| `writing-spinner.js` | `initWritingSpinner` | i18n, frame-elements; lazy spinner data | Contextual writing suggestions; lazy |

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

The picker uses the per-language paths. The three root files (`analyse.md`, `droefting.md`, `kronikk.md`) are retained only for compatibility.

| ID / file stem | Genre | Available languages | Recommended school bands |
| --- | --- | --- | --- |
| `droefting` | Drøfting | nb, nn | ungdomsskole, vgs |
| `analyse` | Analyse | nb, nn | ungdomsskole, vgs |
| `kronikk` | Kronikk | nb, nn | vgs |
| `kaaseri` | Kåseri | nb, nn | ungdomsskole, vgs |
| `fagartikkel` | Fagartikkel | nb, nn | ungdomsskole, vgs |
| `leserinnlegg` | Leser-/lesarinnlegg | nb, nn | barneskole, ungdomsskole, vgs |
| `novelle` | Novelle | nb, nn | barneskole, ungdomsskole, vgs |
| `retorisk-analyse` | Retorisk analyse | nb, nn | ungdomsskole, vgs |
| `kortsvar` | Kortsvar | nb, nn | vgs |
| `kreativ-tekst` | Kreativ tekst | nb, nn | barneskole, ungdomsskole, vgs |
| `reflekterende-tekst` | Reflekterende tekst | nb, nn | ungdomsskole, vgs |
| `sammenligning` | Sammenlignende/samanliknande tekst | nb, nn | ungdomsskole, vgs |

Frames outside the selected level remain available under additional choices; level metadata recommends rather than prohibits. Document writing language selects NB or NN independently of interface language.
