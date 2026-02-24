# Data Model

> Last updated: 2026-02-24

## IndexedDB

- **Database name:** `skriv-documents`
- **Version:** 3

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
| `subject`    | string   | no       | yes      | Subject folder name, `'__personal__'`, or `null` (orphan). Added in v3. |
| `schoolYear` | string   | no       | yes      | School year label e.g. `'2025/2026'`. Aug 1 – Jul 31. Added in v3. |

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
| `subject`    | string   | no       |          | Preserved from document           |
| `schoolYear` | string   | no       |          | Preserved from document           |

**Trash retention:** 30 days. `purgeExpired()` runs on app startup and deletes documents where `expiresAt` has passed.

### DB migration history

| Version | Changes |
|---------|---------|
| 1       | `documents` store with `updatedAt` index |
| 2       | `trash` store with `trashedAt` index |
| 3       | `subject` and `schoolYear` indexes on `documents`. Backfill: existing docs get `subject: null`, `schoolYear` derived from `createdAt`. |

## localStorage

| Key                      | Type   | Purpose                                     |
|------------------------- |------- |-------------------------------------------- |
| `skriv-lang`             | string | Selected UI language (nb/nn/en)              |
| `skriv_theme`            | string | Theme preference (`light`, `dark`, `system`) |
| `skriv_custom_subjects`  | string | JSON array of student-created subject names  |
| `skriv_school_year`      | string | Active school year label e.g. `'2025/2026'`  |
| `skriv_school_level`     | string | Selected school level ID (`barneskole`, `ungdomsskole`, `vg1`, `vg2`, `vg3`) |

## Other storage

- **Service Worker cache:** `skriv-v{N}` — precaches all static assets listed in `sw.js ASSETS[]`.
- **Images:** Stored inline as base64 data URIs within document `html` field. No separate image storage.
