# Data Model

> Last updated: 2026-02-26

## IndexedDB

- **Database name:** `skriv-documents`
- **Version:** 4

### Object store: `documents`

Key path: `id`

| Field        | Type     | Required | Index    | Notes                             |
|------------- |--------- |--------- |--------- |---------------------------------- |
| `id`         | string   | yes      | keyPath  | UUID via `crypto.randomUUID()`    |
| `title`      | string   | yes      |          | User-entered document title       |
| `html`       | string   | yes      |          | Full editor innerHTML             |
| `plainText`  | string   | yes      |          | Stripped text (for search/count)  |
| `wordCount`  | number   | yes      |          | Cached word count                 |
| `createdAt`  | string   | yes      |          | ISO 8601 timestamp                |
| `updatedAt`  | string   | yes      | yes      | ISO 8601, sorted descending       |
| `references` | array    | no       |          | Array of citation objects          |
| `tags`       | array    | no       |          | Array of user-defined tag strings (default `[]`) |
| `frameType`  | string   | no       |          | Active writing frame (`analyse`, `droefting`, `kronikk`, or `null`) |
| `subject`    | string   | no       | yes      | **Legacy.** Subject name or `null`. Kept for backward compat; no longer written by UI. Use `folderIds` instead. Added in v3. |
| `schoolYear` | string   | no       | yes      | School year label e.g. `'2025/2026'`. Aug 1 – Jul 31. Added in v3. |
| `folderIds`  | array    | no       | yes (multiEntry) | Array of folder IDs the document belongs to (default `[]`). Orphan = empty array. Added in v4. |

### Object store: `trash`

Key path: `id`

| Field        | Type     | Required | Index    | Notes                             |
|------------- |--------- |--------- |--------- |---------------------------------- |
| `id`         | string   | yes      | keyPath  | Same ID as original document      |
| `title`      | string   | yes      |          | Preserved from document           |
| `html`       | string   | yes      |          | Preserved from document           |
| `plainText`  | string   | yes      |          | Preserved from document           |
| `wordCount`  | number   | yes      |          | Preserved from document           |
| `createdAt`  | string   | yes      |          | Preserved from document           |
| `updatedAt`  | string   | yes      |          | Preserved from document           |
| `trashedAt`  | string   | yes      | yes      | ISO 8601 — when it was trashed    |
| `expiresAt`  | string   | yes      |          | ISO 8601 — when auto-purge fires  |
| `references` | array    | no       |          | Preserved from document           |
| `frameType`  | string   | no       |          | Preserved from document           |
| `subject`    | string   | no       |          | Legacy. Preserved from document   |
| `schoolYear` | string   | no       |          | Preserved from document           |
| `folderIds`  | array    | no       |          | Preserved from document. Added in v4. |

**Trash retention:** 30 days. `purgeExpired()` runs on app startup and deletes documents where `expiresAt` has passed.

### Object store: `folders`

Key path: `id`

| Field        | Type     | Required | Index    | Notes                             |
|------------- |--------- |--------- |--------- |---------------------------------- |
| `id`         | string   | yes      | keyPath  | Deterministic: `sys_<norm>` for system, `cust_<norm>` for custom, `usr_<uuid>` for user-created |
| `name`       | string   | yes      |          | Display name (e.g. `'Norsk'`, `'Personlig mappe'`) |
| `parentId`   | string   | no       | yes      | Parent folder ID, or `null` for root |
| `isSystem`   | boolean  | yes      |          | `true` for seeded system/subject folders |
| `schoolYear` | string   | no       | yes      | Reserved for future per-year folders |
| `sortOrder`  | number   | yes      |          | Display order within siblings     |
| `createdAt`  | string   | yes      |          | ISO 8601 timestamp                |

**Folder ID convention:**
- `sys___personal__` — Personal folder (system)
- `sys_<normalized_name>` — Predefined subject folders (e.g. `sys_norsk`, `sys_matematikk`)
- `cust_<normalized_name>` — Migrated custom subjects from localStorage
- `usr_<uuid>` — User-created folders after migration

**Normalization:** lowercase, Norwegian chars transliterated (æ→ae, ø→oe, å→aa), non-alphanumeric → `_`, collapsed.

**Max depth:** 3 levels (root → child → grandchild).

### DB migration history

| Version | Changes |
|---------|---------|
| 1       | `documents` store with `updatedAt` index |
| 2       | `trash` store with `trashedAt` index |
| 3       | `subject` and `schoolYear` indexes on `documents`. Backfill: existing docs get `subject: null`, `schoolYear` derived from `createdAt`. |
| 4       | `folders` store with `parentId` and `schoolYear` indexes. `folderIds` multiEntry index on `documents`. Seed system folders from hardcoded subject list + `skriv_custom_subjects` localStorage. Walk all documents and trash: map `subject` → folder ID → set `folderIds`. |

## localStorage

| Key                      | Type   | Purpose                                     |
|------------------------- |------- |-------------------------------------------- |
| `skriv-lang`             | string | Selected UI language (nb/nn/en)              |
| `skriv_theme`            | string | Theme preference (`light`, `dark`, `system`) |
| `skriv_custom_subjects`  | string | **Legacy.** JSON array of student-created subject names. Read during v4 migration to seed custom folders. No longer written. |
| `skriv_school_year`      | string | Active school year label e.g. `'2025/2026'`  |
| `skriv_school_level`     | string | Selected school level ID (`barneskole`, `ungdomsskole`, `vg1`, `vg2`, `vg3`) |

## Other storage

- **Service Worker cache:** `skriv-v{N}` — precaches all static assets listed in `sw.js ASSETS[]`.
- **Images:** Stored inline as base64 data URIs within document `html` field. No separate image storage.
