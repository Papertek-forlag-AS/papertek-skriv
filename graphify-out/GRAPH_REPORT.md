# Graph Report - skriv  (2026-04-25)

## Corpus Check
- 45 files · ~64,121 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 187 nodes · 285 edges · 13 communities detected
- Extraction: 75% EXTRACTED · 25% INFERRED · 0% AMBIGUOUS · INFERRED: 72 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]

## God Nodes (most connected - your core abstractions)
1. `t()` - 23 edges
2. `launchEditor()` - 17 edges
3. `openDB()` - 12 edges
4. `renderDocumentList()` - 9 edges
5. `init()` - 8 edges
6. `openDB()` - 8 edges
7. `openDB()` - 6 edges
8. `createFolder()` - 6 edges
9. `moveFolder()` - 6 edges
10. `getFolderById()` - 6 edges

## Surprising Connections (you probably didn't know these)
- `showUpdatePrompt()` --calls--> `t()`  [INFERRED]
  public/js/app/sw-manager.js → public/js/editor-core/shared/i18n.js
- `launchEditor()` --calls--> `escapeAttr()`  [INFERRED]
  public/js/app/standalone-writer.js → public/js/editor-core/shared/html-escape.js
- `launchEditor()` --calls--> `attachWordCounter()`  [INFERRED]
  public/js/app/standalone-writer.js → public/js/editor-core/shared/word-counter.js
- `launchEditor()` --calls--> `initFrameSelector()`  [INFERRED]
  public/js/app/standalone-writer.js → public/js/editor-core/student/frame-selector.js
- `createImageBlock()` --calls--> `t()`  [INFERRED]
  public/js/editor-core/student/image-manager.js → public/js/editor-core/shared/i18n.js

## Communities

### Community 0 - "Community 0"
Cohesion: 0.17
Nodes (19): addDocToFolder(), createFolder(), deleteFolder(), getAllFolders(), getAvailableSchoolYears(), getChildren(), getCurrentSchoolYear(), getFolderById() (+11 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (12): createAutoSave(), initEditorToolbar(), buildBreadcrumb(), createFolderBadges(), createFolderPicker(), isPersonalFolder(), initFrameManager(), initReferences() (+4 more)

### Community 2 - "Community 2"
Cohesion: 0.12
Nodes (13): formatRelativeTime(), isFrameElement(), isImageBlock(), getDateLocale(), classifyBlock(), initParagraphMap(), downloadPDF(), downloadText() (+5 more)

### Community 3 - "Community 3"
Cohesion: 0.14
Nodes (11): getThemeIconSVG(), renderDocumentCards(), renderDocumentList(), updateCleanupDesk(), createSearchBar(), getModalParent(), escapeAttr(), escapeHtml() (+3 more)

### Community 4 - "Community 4"
Cohesion: 0.21
Nodes (11): getSupportedLanguages(), initI18n(), interpolate(), loadLanguage(), renderLanguageSelector(), resolveKey(), setLanguage(), t() (+3 more)

### Community 5 - "Community 5"
Cohesion: 0.16
Nodes (7): init(), showOnboardingModal(), hasSchoolLevel(), setSchoolLevel(), initServiceWorker(), isLocalhost(), showUpdatePrompt()

### Community 6 - "Community 6"
Cohesion: 0.18
Nodes (7): getFramePath(), initFrameSelector(), getCurrentLanguage(), initWordFrequency(), loadWordBank(), initWritingSpinner(), loadWordBank()

### Community 7 - "Community 7"
Cohesion: 0.3
Nodes (10): renderTrashView(), emptyTrash(), getRetentionDays(), getTrashCount(), listTrashedDocuments(), openDB(), permanentlyDelete(), purgeExpired() (+2 more)

### Community 8 - "Community 8"
Cohesion: 0.42
Nodes (7): createDocument(), deleteDocument(), generateId(), getDocument(), listDocuments(), openDB(), saveDocument()

### Community 9 - "Community 9"
Cohesion: 0.46
Nodes (6): applyTheme(), cycleTheme(), getTheme(), getThemeIcon(), initTheme(), setTheme()

### Community 10 - "Community 10"
Cohesion: 0.43
Nodes (7): cleanupStaleModals(), createOverlay(), showInPageAlert(), showInPageConfirm(), showInPageContent(), showInPagePrompt(), trapFocus()

### Community 11 - "Community 11"
Cohesion: 0.4
Nodes (1): createImageBlock()

### Community 12 - "Community 12"
Cohesion: 1.0
Nodes (2): announce(), getLiveRegion()

## Knowledge Gaps
- **Thin community `Community 11`** (5 nodes): `compressImage()`, `createImageBlock()`, `initImageManager()`, `validateFile()`, `image-manager.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 12`** (3 nodes): `announce()`, `getLiveRegion()`, `aria-live.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `t()` connect `Community 4` to `Community 1`, `Community 2`, `Community 3`, `Community 5`, `Community 6`, `Community 7`, `Community 11`?**
  _High betweenness centrality (0.470) - this node is a cross-community bridge._
- **Why does `launchEditor()` connect `Community 1` to `Community 0`, `Community 2`, `Community 3`, `Community 4`, `Community 6`, `Community 8`?**
  _High betweenness centrality (0.274) - this node is a cross-community bridge._
- **Why does `renderDocumentList()` connect `Community 3` to `Community 8`, `Community 0`, `Community 4`, `Community 7`?**
  _High betweenness centrality (0.184) - this node is a cross-community bridge._
- **Are the 19 inferred relationships involving `t()` (e.g. with `createFolderBadges()` and `showUpdatePrompt()`) actually correct?**
  _`t()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 16 inferred relationships involving `launchEditor()` (e.g. with `getDocument()` and `t()`) actually correct?**
  _`launchEditor()` has 16 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `renderDocumentList()` (e.g. with `getTrashCount()` and `listDocuments()`) actually correct?**
  _`renderDocumentList()` has 7 INFERRED edges - model-reasoned connections that need verification._
- **Are the 7 inferred relationships involving `init()` (e.g. with `initTheme()` and `initServiceWorker()`) actually correct?**
  _`init()` has 7 INFERRED edges - model-reasoned connections that need verification._