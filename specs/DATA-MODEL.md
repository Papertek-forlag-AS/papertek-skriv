# Data Model

> Last updated: 2026-08-23

Skriv is local-first. Documents, trash, folders, and version snapshots remain in the browser unless the student explicitly downloads a backup or an export. There is no account or server-side copy.

## IndexedDB: `skriv-documents`

- **Database name:** `skriv-documents`
- **Current version:** 4
- **Canonical opener:** `public/js/app/db.js`

Every feature opens this database through `openSkrivDatabase()`. The opener owns the complete schema upgrade chain and performs a post-open repair for records affected by older v4 builds whose competing migration cursors could leave `folderIds` or `schoolYear` unset. The repair preserves a legacy `subject` association by matching it to an existing folder name.

When another tab requests a schema change, the connection dispatches `skriv:before-app-reload` and waits for registered editor flushes before closing. If a flush fails, Skriv keeps the connection open instead of reloading with unsaved writing. A blocked open emits `skriv:database-blocked` so the UI can ask the student to close another Skriv tab.

### Object store: `documents`

Key path: `id`

| Field | Type | Required | Index | Notes |
| --- | --- | --- | --- | --- |
| `id` | string | yes | keyPath | `crypto.randomUUID()` with a local fallback |
| `title` | string | yes | | Student-entered title |
| `html` | string | yes | | Full editor HTML, including inline images |
| `plainText` | string | yes | | Text used for search and counts |
| `wordCount` | number | yes | | Cached count |
| `writingLanguage` | string | yes for new records | | One of `nb`, `nn`, `en`, `de`, `es`, `fr`; belongs to the document, not the interface |
| `createdAt` | string | yes | | ISO 8601 timestamp |
| `updatedAt` | string | yes | yes | ISO 8601; document lists sort descending |
| `references` | array | no | | Citation objects |
| `frameType` | string/null | no | | Active writing-frame ID |
| `schoolYear` | string | no | yes | Label such as `2026/2027` (Aug 1–Jul 31) |
| `folderIds` | string[] | no | yes, multiEntry | Folder membership; an empty array is unfiled |
| `germanHint` | object | no | | `{ simple, rich }` draft pair for German tasks |
| `subject` | string/null | legacy | yes | Retained for compatibility; new UI uses `folderIds` |
| `tags` | array | legacy | | May exist on older records; no longer written |

New documents take their initial `writingLanguage` from the current interface language when supported. Older records are read as Bokmål unless they contain `germanHint`, in which case Skriv infers German. The editor writes the resolved value on the next save.

### Object store: `trash`

Key path: `id`

Trash records preserve the complete document record, including `writingLanguage`, `references`, `frameType`, `folderIds`, `schoolYear`, and `germanHint`, and add:

| Field | Type | Required | Index | Notes |
| --- | --- | --- | --- | --- |
| `trashedAt` | string | yes | yes | ISO 8601 soft-delete time |
| `expiresAt` | string | yes | | ISO 8601 automatic-purge time |

Trash retention is 30 days. Moving a document to trash retains its version snapshots so restore remains complete. Permanent delete, empty trash, and expiry purge also delete snapshots for the affected document IDs.

### Object store: `folders`

Key path: `id`

| Field | Type | Required | Index | Notes |
| --- | --- | --- | --- | --- |
| `id` | string | yes | keyPath | Deterministic for seeded/migrated folders; timestamp-suffixed for new custom folders |
| `name` | string | yes | | Display name |
| `parentId` | string/null | yes | yes | Parent folder or `null` at the root |
| `isSystem` | boolean | yes | | Seeded subject/personal folder flag |
| `schoolYear` | string/null | yes | yes | Reserved for year-scoped folders |
| `sortOrder` | number | yes | | Sibling order |
| `createdAt` | string | yes | | ISO 8601 timestamp |

Folder IDs:

- `sys___personal__` for the built-in personal folder.
- `sys_<normalized-name>` for seeded subjects, for example `sys_norsk`.
- `cust_<normalized-name>` for custom subjects migrated from `skriv_custom_subjects`.
- `cust_<normalized-name>_<timestamp>` for folders created in the current UI.

Normalization lowercases, transliterates æ/ø/å to ae/oe/aa, converts other non-alphanumeric runs to `_`, and trims leading/trailing underscores. The maximum tree depth is three levels (root, child, grandchild).

### Migration history

| Version | Change |
| --- | --- |
| 1 | `documents` with `updatedAt` index |
| 2 | `trash` with `trashedAt` index |
| 3 | `subject` and `schoolYear` indexes on documents; missing values backfilled |
| 4 | `folders`, `folderIds` multiEntry index, deterministic folder seed, legacy subject/custom-subject migration |

The current post-open repair deliberately remains at version 4. Bumping the schema solely to repair data would force active older tabs to close and could endanger unsaved text.

## IndexedDB: `skriv-versions`

- **Database name:** `skriv-versions`
- **Current version:** 1

### Object store: `snapshots`

Key path: `id`, auto-incrementing. Indexes: non-unique `docId` and `timestamp`.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | number | Local auto-increment key; ignored when merging backups |
| `docId` | string | Owning live or trashed document |
| `timestamp` | number | `Date.now()` milliseconds at snapshot time |
| `content` | string | Editor HTML at this point in time |
| `wordCount` | number | Count at snapshot time |
| `preview` | string | Short timeline preview |
| `isMajor` | boolean | Marks normal timeline/automatic snapshots; pre-restore safety checkpoints may be `false` |

Snapshots are written only when content changes: at most every five minutes or after 100 additional words. At most 50 snapshots are kept per document. On quota pressure, the module prunes older snapshots and retries once.

## Portable library backup

The downloaded `.skriv` file is UTF-8 JSON:

```json
{
  "format": "papertek-skriv-backup",
  "version": 1,
  "createdAt": "2026-08-22T12:00:00.000Z",
  "data": {
    "documents": [],
    "trash": [],
    "folders": [],
    "versions": [],
    "settings": {}
  }
}
```

Restore is validated before writes and is merge-only: local records are never overwritten. Exact replays are idempotent, deterministic conflict IDs keep related folder/document/version records connected, and version auto-increment IDs do not participate in deduplication. Primary document/folder/trash changes use one transaction; later version/settings phase failures are reported as retryable partial restores. Backup creation fails rather than returning a file that silently omits version history.

The parser applies size/count/depth limits and rejects duplicate identities, missing folder parents, document-to-folder references that do not exist in the backup, invalid folder topology, unsafe active HTML, event attributes, unsafe URL schemes, and network-capable inline CSS. A legacy version snapshot whose `docId` is absent is accepted for portability, then counted as orphaned and skipped during restore.

Only these preferences travel in a library backup: `skriv_language`, `skriv_theme`, legacy `theme`, `skriv_school_year`, `skriv_school_level`, and the three core Leksihjelp language/limited-assistance keys.

## localStorage

### Active application preferences

| Key | Value | Purpose |
| --- | --- | --- |
| `skriv_language` | `nb` / `nn` / `en` | Interface language; first run defaults deterministically to Bokmål |
| `skriv_theme` | `light` / `dark` / `system` | Theme preference |
| `skriv_school_year` | year label | Active library year |
| `skriv_school_level` | `barneskole`, `ungdomsskole`, `vg1`, `vg2`, `vg3` | Selected school level |
| `skriv.leksihjelp.writingLang` | `nb` / `nn` / `en` / `de` / `es` / `fr` | Compatibility mirror for Leksihjelp; the open document is authoritative in the editor |
| `skriv.leksihjelp.lookupLang` | supported language | Dictionary lookup language |
| `skriv.leksihjelp.examMode` | `1` or empty | Technical legacy key for the UI's **Limited assistance** setting; not a secure exam mode or locked browser |
| `skriv.leksihjelp.activeTab` | `dictionary` / `settings` | Last Leksihjelp drawer tab |

The embedded loader keeps `enabledGrammarFeatures` only in its in-memory `chrome.storage.local` shim. Those choices reset on reload and are not localStorage data.

### German task preferences

| Key | Purpose |
| --- | --- |
| `papertek.skriv.germanExam.deck.<writing|exam>.<tysk-1|tysk-2>` | Remaining randomized task IDs |
| `papertek.skriv.germanExam.activeLevel` | Last `tysk-1` / `tysk-2` selection |
| `papertek.skriv.germanExam.activeMode` | Last `writing` / `exam` task collection |
| `germanExam.writeExplainSeen` | `1` after the pre-writing explanation has been shown |
| `germanHintDrawer.variant.<docId>` | `simple` / `rich` hint tab per document |

The word `exam` in these legacy technical keys identifies the German task collection or earlier Leksihjelp integration. It does not imply secure assessment software.

### Dormant opt-in feature preferences

The current minimal editor does not mount progress or tour modules automatically, but the portable modules retain their keys for explicit future use:

| Key | Purpose |
| --- | --- |
| `skriv_daily_goal` | Daily word target |
| `skriv_writing_streak` | Streak count |
| `skriv_last_write_date` | Last streak-update date |
| `skriv_tour_completed` | Completion marker for an explicitly started tour |

### Legacy preference

- `skriv_custom_subjects` is a JSON string array read only during the v4 folder migration. It is no longer written.
- `theme` is retained only as a backup pass-through for older installations. Current theme code reads and writes `skriv_theme`.

## Other local storage

- **Service Worker cache:** current static cache is `skriv-v78`. Critical shell/modules/frames are precached atomically. Vendored Leksihjelp code, styles, metadata, and the compact NB fallback are best-effort precached; larger language data is cache-on-use through the same-origin cache-first fetch handler.
- **Images:** compressed images are stored as base64 data URIs inside document HTML; there is no separate image store.
