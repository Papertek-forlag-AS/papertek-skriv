# Data Model

> Last updated: 2026-02-23

## IndexedDB

- **Database name:** `skriv-documents`
- **Version:** 2

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
| `references` | array    | no       |          | Preserved from document           |
| `frameType`  | string   | no       |          | Preserved from document           |

**Trash retention:** 30 days. `purgeExpired()` runs on app startup and deletes documents where `trashedAt` is older than 30 days.

## localStorage

| Key            | Type   | Purpose                                     |
|--------------- |------- |-------------------------------------------- |
| `skriv-lang`   | string | Selected UI language (nb/nn/en)              |
| `skriv_theme`  | string | Theme preference (`light`, `dark`, `system`) |

## Other storage

- **Service Worker cache:** `skriv-v{N}` — precaches all static assets listed in `sw.js ASSETS[]`.
- **Images:** Stored inline as base64 data URIs within document `html` field. No separate image storage.
