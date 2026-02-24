# Plan: Folder System with Hierarchy + Multi-Folder Assignment

## Overview

Replace the flat `subject: string | null` system with a proper folder architecture:
- Folders as first-class IndexedDB objects with parent-child hierarchy (max 3 levels deep)
- Documents can belong to multiple folders via `folderIds: string[]`
- Sidebar becomes a collapsible tree view
- Folder picker supports multi-select with hierarchy display

**Depth model** (3 levels max):
```
Norsk/                        ← Level 1 (root)
  Litteratur/                 ← Level 2 (subfolder)
    Ibsen/                    ← Level 3 (max depth)
```

## Future Proposals (not in this plan)

These are deferred for later:
- Folder color/icon customization
- Folder-level word count goals
- Bulk export per folder
- Folder templates per school level (auto-create sensible subfolder trees)

---

## Phase 1: Data Model + IndexedDB Migration

### 1A. New object store: `folders`

Add a `folders` object store to IndexedDB (DB version 4).

**Schema:**
| Field       | Type          | Index     | Notes |
|-------------|---------------|-----------|-------|
| `id`        | string        | keyPath   | UUID via `crypto.randomUUID()` |
| `name`      | string        |           | Display name, max 30 chars |
| `parentId`  | string\|null  | yes       | null = root-level folder |
| `isSystem`  | boolean       |           | true for predefined subjects + personal |
| `schoolYear`| string        | yes       | Scopes folder to a school year |
| `createdAt` | string        |           | ISO 8601 |
| `sortOrder` | number        |           | For manual ordering within siblings |

### 1B. Document field change

Change on documents store:
- **Remove index**: `subject`
- **Add field**: `folderIds: string[]` (default `[]`)
- **Add multiEntry index**: `folderIds` (allows querying "all docs in folder X")
- Keep `subject` field in the record during migration but stop using it

### 1C. Trash store

- Add `folderIds` field to trashed documents (preserved from document)
- Keep `subject` field during migration for backwards compat

### 1D. Migration logic (v3 → v4)

In **`document-store.js`** `onupgradeneeded` handler for version 4:

1. Create `folders` object store with `id` keyPath, indexes on `parentId` and `schoolYear`
2. Seed predefined folders:
   - For each subject in `PREDEFINED_SUBJECTS`: create a folder object `{ id: uuid, name: subject, parentId: null, isSystem: true, schoolYear: null, ... }` (schoolYear null = available in all years)
   - Create `__personal__` folder: `{ id: uuid, name: '__personal__', parentId: null, isSystem: true, schoolYear: null, ... }`
3. Read custom subjects from `localStorage('skriv_custom_subjects')`: create folder objects for each
4. Walk all documents:
   - If `doc.subject === '__personal__'` → set `folderIds: [personalFolderId]`
   - If `doc.subject === someSubjectName` → look up folder by name → set `folderIds: [matchingFolderId]`
   - If `doc.subject === null` → set `folderIds: []`
   - Keep `doc.subject` as-is for rollback safety
5. Create `folderIds` multiEntry index on documents store
6. Repeat same migration logic in **`trash-store.js`** `onupgradeneeded`

**Files modified:** `document-store.js`, `trash-store.js`

### 1E. Sync DB_VERSION

Both `document-store.js` and `trash-store.js` share the same IndexedDB database (`skriv-documents`). Both must update `DB_VERSION` from 3 → 4 and handle the new stores/indexes in their `onupgradeneeded` handlers.

---

## Phase 2: New `folder-store.js` Module

**Replace `subject-store.js`** with a new `folder-store.js`. The old module is deleted (all imports updated).

### Exports:

```js
// Constants
export const PERSONAL_FOLDER_NAME = '__personal__';
export const MAX_FOLDER_DEPTH = 3;

// Folder CRUD
export async function createFolder(name, parentId = null)
export async function renameFolder(folderId, newName)
export async function deleteFolder(folderId)        // only custom, moves children up
export async function moveFolder(folderId, newParentId)  // enforce depth limit

// Folder queries
export async function getAllFolders()                 // returns flat array of all folder objects
export async function getRootFolders()               // parentId === null
export async function getChildren(parentId)          // direct children
export async function getFolderById(id)
export async function getFolderPath(folderId)        // returns [root, ..., folder] ancestor chain
export async function getFolderDepth(folderId)       // 1-based depth (root = 1)

// Tree helpers
export function buildFolderTree(folders)              // flat array → nested tree structure
export function flattenTree(tree)                     // tree → flat array with depth annotations

// Document-folder assignment
export async function addDocToFolder(docId, folderId)
export async function removeDocFromFolder(docId, folderId)
export async function setDocFolders(docId, folderIds)  // replace all

// School year (carried over from subject-store)
export function getSchoolYear(referenceDate)
export function getCurrentSchoolYear()
export function setCurrentSchoolYear(label)
export function getAvailableSchoolYears(docs)

// System folder helpers
export function isPersonalFolder(folder)
export function isSystemFolder(folder)
```

### Key behaviors:

- `createFolder`: validates name length (max 30), checks for duplicates among siblings, enforces depth ≤ 3
- `deleteFolder`: only allowed for non-system folders. Reassigns children to deleted folder's parent (or root). Documents in deleted folder keep other folder assignments; if it was their only folder, `folderIds` becomes `[]` (orphan)
- `moveFolder`: validates target depth won't exceed 3 (considering subtree depth of the moved folder)
- `buildFolderTree`: pure function, takes flat `folders[]`, returns `[{ ...folder, children: [...] }]`

### Dependencies:
- `school-level.js` (for `getSubjectsForLevel` — used during initialization)
- `document-store.js` (for `saveDocument` — used in `addDocToFolder` etc.)

**Files created:** `folder-store.js`
**Files deleted:** `subject-store.js`

---

## Phase 3: Sidebar Tree View

**Rewrite `sidebar.js`** to render a collapsible folder tree instead of a flat list.

### UI structure:

```
School Year: [2025/2026 ▼]
─────────────────────────
◷ Siste dokumenter         12
─────────────────────────
FAG
▸ Norsk                     5    ← click arrow to expand
  ▸ Litteratur              3
    • Ibsen                  1
  • Grammatikk              2
▸ Matematikk                3
• Engelsk                   4    ← no children, no arrow
[+ Legg til mappe]
─────────────────────────
? Uten mappe                2
🔒 Personlig                1
─────────────────────────
🎓 Bytt trinn
```

### Changes:

1. **Tree rendering**: Recursive `renderFolderItem(folder, depth)` function
   - Indent based on depth level (pl-{depth * 4})
   - Show expand/collapse chevron only if folder has children
   - Show doc count badge (includes children's counts recursively)
   - Active filter state stored as `folderId` string instead of subject name

2. **Expand/collapse state**: Track in a `Set<folderId>` kept in memory (no need to persist)

3. **"Add folder" button**: Context-aware
   - At root: creates root folder
   - Inside expanded folder (depth < 3): "Legg til undermappe" button appears
   - At depth 3: no add button

4. **Context menu on custom folders** (right-click or ... button):
   - Rename
   - Add subfolder (if depth < 3)
   - Delete (with confirmation)
   - Move to... (parent selector)

5. **Drag-drop targets**: Each folder item is a drop target
   - `dragover`/`drop` handlers on folder items
   - Visual highlight on drag hover
   - On drop: add document to target folder via `addDocToFolder()`
   - Toast: "Flyttet til Norsk › Litteratur"

6. **Counts**: `getSubjectCounts()` → `getFolderCounts(docs, folders, schoolYear)`:
   - Build a map of `folderId → count`
   - For tree display, each parent shows sum of own + all descendants
   - Orphan count = docs where `folderIds.length === 0`

### Dependencies change:
- Remove imports from `subject-store.js`
- Import from new `folder-store.js`

**Files modified:** `sidebar.js`

---

## Phase 4: Folder Picker (replaces Subject Picker)

**Rewrite `subject-picker.js`** → rename to **`folder-picker.js`**.

### New behavior:

1. **Multi-select**: Checkboxes instead of radio-style selection
2. **Hierarchy display**: Show folders indented with tree structure
3. **Breadcrumb display**: In editor, show "Norsk › Litteratur" instead of flat badge
4. **"Done" button**: Close picker and apply changes (instead of immediate close on click)

### Exports:

```js
export function createFolderPicker(trigger, currentFolderIds, onChange)
// onChange receives: string[] of selected folder IDs

export function createFolderBadges(folderIds, folders)
// Returns an array of badge elements, one per folder, each showing breadcrumb path
// If folderIds is empty, returns a single "Velg mappe" prompt badge
```

### UI in the dropdown:

```
☑ Norsk
  ☑ Litteratur
    ☐ Ibsen
  ☐ Grammatikk
☐ Matematikk
☐ Engelsk
──────────
☐ Personlig
──────────
✕ Fjern alle
──────────
[Ferdig]
```

- Checking a parent does NOT auto-check children (document belongs to that specific folder)
- Unchecking a folder with subfolders only unchecks that folder, not the children

### Dependencies:
- `folder-store.js` (replaces `subject-store.js`)
- `i18n.js`, `html-escape.js`

**Files created:** `folder-picker.js`
**Files deleted:** `subject-picker.js`

---

## Phase 5: Document List + Editor Updates

### 5A. `document-list.js`

1. **Filter logic** (`applyFilters`):
   ```js
   // Old:
   filtered = filtered.filter(d => d.subject === currentSubjectFilter);
   // New:
   if (currentFolderFilter === 'orphans') {
       filtered = filtered.filter(d => !d.folderIds || d.folderIds.length === 0);
   } else if (currentFolderFilter === 'personal') {
       filtered = filtered.filter(d => d.folderIds?.includes(personalFolderId));
   } else if (currentFolderFilter !== 'all') {
       // Include docs in this folder OR any descendant folder
       const descendantIds = getDescendantIds(currentFolderFilter, allFolders);
       filtered = filtered.filter(d =>
           d.folderIds?.some(fid => descendantIds.has(fid))
       );
   }
   ```

2. **Document cards**: Show multiple folder badges instead of single subject badge
   - Each badge shows folder name (or "Parent › Child" breadcrumb if subfolder)
   - Orphan cards show multi-select "Velg mappe" button

3. **Sidebar options**: Pass `folders` array to sidebar, receive `folderId` in filter callback

4. **Drag-drop**: Already has dragstart; no changes needed on cards

### 5B. `standalone-writer.js`

1. Replace `createSubjectPicker` / `createSubjectBadge` imports → `createFolderPicker` / `createFolderBadges`
2. Change subject row to folder row:
   - Show multiple badges (one per assigned folder)
   - Click on badges area opens multi-select folder picker
3. Auto-save state: change `subject: currentSubject` → `folderIds: currentFolderIds`
4. Destroy: clean up folder picker API

### 5C. `word-count-stats.js`

- Minor: receives `docs` array, which now has `folderIds` instead of `subject`
- If grouping by folder is desired later (future proposal), no changes needed now
- The stats panel doesn't currently group by subject, so no changes required

**Files modified:** `document-list.js`, `standalone-writer.js`
**Files unchanged:** `word-count-stats.js`

---

## Phase 6: Locales (i18n)

### New/changed keys (add to all three: nb.js, nn.js, en.js):

```
// Rename "sidebar" section → keep key prefix for minimal churn
sidebar.title:              "Mapper" / "Mapper" / "Folders"
sidebar.addFolder:          "Legg til mappe" / "Legg til mappe" / "Add folder"
sidebar.addSubfolder:       "Legg til undermappe" / "Legg til undermappe" / "Add subfolder"
sidebar.renameFolder:       "Endre navn" / "Endre namn" / "Rename"
sidebar.deleteFolder:       "Slett mappe" / "Slett mappe" / "Delete folder"
sidebar.deleteFolderConfirm: "Slette «{{name}}»? Dokumenter flyttes til overmappe." / ... / ...
sidebar.moveFolder:         "Flytt til..." / "Flytt til..." / "Move to..."
sidebar.maxDepthReached:    "Maks mappenivå nådd" / "Maks mappenivå nådd" / "Maximum folder depth reached"
sidebar.chooseFolder:       "Velg mappe" / "Vel mappe" / "Choose folder"
sidebar.chooseFolders:      "Velg mapper" / "Vel mapper" / "Choose folders"
sidebar.removeAllFolders:   "Fjern alle" / "Fjern alle" / "Remove all"
sidebar.folderPickerDone:   "Ferdig" / "Ferdig" / "Done"
sidebar.orphans:            "Uten mappe" / "Utan mappe" / "No folder"
sidebar.moved:              "Lagt til i {{folder}}" / "Lagt til i {{folder}}" / "Added to {{folder}}"
sidebar.folderLabel:        "Mappe" / "Mappe" / "Folder"
sidebar.folderNamePlaceholder: "Mappenavn..." / "Mappenamn..." / "Folder name..."
sidebar.noFolder:           "Ingen mappe" / "Ingen mappe" / "No folder"
```

**Remove** old keys that are fully replaced:
- `sidebar.addSubject`, `sidebar.removeSubject`, `sidebar.chooseSubject`
- `sidebar.customSubjectPlaceholder`, `sidebar.deleteSubject`, `sidebar.deleteSubjectConfirm`
- `sidebar.subjectLabel`, `sidebar.noSubject`

**Keep** unchanged keys: `sidebar.schoolYear`, `sidebar.recentDocs`, `sidebar.personalFolder`, `sidebar.personalDesc`, `sidebar.dragHint`, `sidebar.dropHere`, `sidebar.showAllSubjects`, `sidebar.hideSubjects`

**Files modified:** `nb.js`, `nn.js`, `en.js`

---

## Phase 7: Module Registry + Specs + SW

### 7A. Update all spec files:

| Spec file | Changes |
|-----------|---------|
| `DATA-MODEL.md` | New `folders` store schema, `folderIds` on documents, migration v4, new localStorage notes |
| `MODULES.md` | Replace `subject-store.js` → `folder-store.js`, replace `subject-picker.js` → `folder-picker.js`, update exports/deps for all changed modules |
| `DEPENDENCIES.md` | Update dependency graph for renamed modules |
| `ARCHITECTURE.md` | Update directory listing, note DB version is now 4 |
| `UI-ROUTES.md` | Update sidebar layout description (tree view), update editor layout (folder badges) |
| `CONVENTIONS.md` | No changes expected |

### 7B. Update `sw.js`

- Remove `subject-store.js` and `subject-picker.js` from `ASSETS[]`
- Add `folder-store.js` and `folder-picker.js` to `ASSETS[]`
- Bump cache version (currently v22 → v23)

### 7C. Update imports across the codebase

Every file that imports from `subject-store.js` or `subject-picker.js` must be updated:

| File | Old import | New import |
|------|-----------|------------|
| `document-store.js` | `subject-store.js` | `folder-store.js` |
| `document-list.js` | `subject-store.js`, `subject-picker.js` | `folder-store.js`, `folder-picker.js` |
| `sidebar.js` | `subject-store.js` | `folder-store.js` |
| `standalone-writer.js` | `subject-picker.js` | `folder-picker.js` |
| `word-count-stats.js` | `subject-store.js` | `folder-store.js` |

---

## Implementation Order

Work in this sequence to keep the app functional at each commit:

1. **Create `folder-store.js`** with all exports + school-year functions ported from `subject-store.js`. Keep `subject-store.js` alive temporarily.
2. **Update `document-store.js`** — DB v4 migration, `folders` store, `folderIds` field + index
3. **Update `trash-store.js`** — DB v4 matching migration
4. **Rewrite `sidebar.js`** — tree view, expand/collapse, counts, drag-drop, context menu
5. **Create `folder-picker.js`** — multi-select, hierarchy display, breadcrumb badges
6. **Update `document-list.js`** — filtering, badges, orphan logic
7. **Update `standalone-writer.js`** — wire up folder picker, folder badges, auto-save folderIds
8. **Update locales** — add new keys, remove obsolete keys (nb.js, nn.js, en.js)
9. **Delete `subject-store.js` and `subject-picker.js`** — after all imports are switched
10. **Update all 5 spec files** + `sw.js` asset list + cache version bump

---

## Risk Considerations

- **IndexedDB migration**: Must be tested carefully. The v3→v4 migration seeds folders from existing subject strings and rewrites every document record. If the migration fails midway, documents could be left in an inconsistent state. Consider wrapping in a try/catch with console.error logging.
- **Two modules open the same DB**: Both `document-store.js` and `trash-store.js` open `skriv-documents`. Both must specify `DB_VERSION = 4` and handle the same `onupgradeneeded` logic. Currently they duplicate v2/v3 upgrade code — same pattern continues for v4.
- **localStorage cleanup**: After successful migration, `skriv_custom_subjects` localStorage key becomes obsolete (custom subjects are now in IndexedDB). Can be cleaned up in migration but not critical.
- **Orphan handling**: Documents with `folderIds: []` are orphans. Filtering must use array length check, not null check.
