# Data Model

> Last updated: 2026-05-11

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
| `tags`       | array    | no       |          | **Legacy.** No longer written by UI. May exist on older documents. |
| `frameType`  | string   | no       |          | Active writing frame (`analyse`, `droefting`, `kronikk`, or `null`) |
| `subject`    | string   | no       | yes      | **Legacy.** Subject name or `null`. Kept for backward compat; no longer written by UI. Use `folderIds` instead. Added in v3. |
| `schoolYear` | string   | no       | yes      | School year label e.g. `'2025/2026'`. Aug 1 – Jul 31. Added in v3. |
| `folderIds`  | array    | no       | yes (multiEntry) | Array of folder IDs the document belongs to (default `[]`). Orphan = empty array. Added in v4. |
| `germanHint` | object   | no       |          | German exam draft pair `{ simple: string, rich: string }`. Set by `german-exam-route.js` when seeding a Tysk task; read by `german-hint-drawer.js` in the editor. Absent on non-German docs. Schemaless — no DB version bump required. |

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
| `skriv_language`         | string | Selected UI language (nb/nn/en)              |
| `skriv_theme`            | string | Theme preference (`light`, `dark`, `system`) |
| `skriv_custom_subjects`  | string | **Legacy.** JSON array of student-created subject names. Read during v4 migration to seed custom folders. No longer written. |
| `skriv_school_year`      | string | Active school year label e.g. `'2025/2026'`  |
| `skriv_school_level`     | string | Selected school level ID (`barneskole`, `ungdomsskole`, `vg1`, `vg2`, `vg3`) |
| `papertek.skriv.germanExam.deck.writing.tysk-1` | string | JSON array of remaining writing-mode Tysk 1 task ids; auto-shuffles on exhaustion |
| `papertek.skriv.germanExam.deck.writing.tysk-2` | string | JSON array of remaining writing-mode Tysk 2 task ids; auto-shuffles on exhaustion |
| `papertek.skriv.germanExam.deck.exam.tysk-1` | string | JSON array of remaining exam-mode Tysk 1 task ids; auto-shuffles on exhaustion |
| `papertek.skriv.germanExam.deck.exam.tysk-2` | string | JSON array of remaining exam-mode Tysk 2 task ids; auto-shuffles on exhaustion |
| `papertek.skriv.germanExam.activeLevel` | string | `'tysk-1'` or `'tysk-2'`; persists last selected level on the spinner screen |
| `papertek.skriv.germanExam.activeMode`  | string | `'writing'` or `'exam'`; persists last selected German spinner mode |
| `germanExam.writeExplainSeen`           | string | `'1'` once the user has seen the explain dialog before "Skriv svar" creates a doc |
| `papertek.skriv.paragraphTrainer.deck`  | string | JSON array of remaining paragraph-trainer topic ids; auto-shuffles on exhaustion |
| `papertek.skriv.paragraphTrainer.draft` | string | JSON `{ topicId, steps: [string×3], checks: [bool×4] }` — in-progress paragraph-trainer attempt, restored on next visit |
| `papertek.skriv.paragraphTrainer.history` | string | JSON. Finished trainer attempts, newest first, capped at 20: `[{ts, topic, text, checksPassed, checksTotal, words}]`. Logged on copy/save only |
| `germanHintDrawer.variant.<docId>`      | string | `'simple'` or `'rich'`; per-document tab selection in the editor hint drawer |
| `skriv_daily_goal`       | string | Writing-progress daily word goal             |
| `skriv_writing_streak`   | string | Writing-progress streak count                |
| `skriv_last_write_date`  | string | ISO date string for last streak update       |
| `skriv_tour_completed`   | string | `'true'` when editor onboarding tour has been completed |
| `skriv.leksihjelp.writingLang`          | string | Skrivespråk — drives spell-check + special-chars panel. One of `nb`/`nn`/`en`/`de`/`es`/`fr` |
| `skriv.leksihjelp.lookupLang`           | string | Oppslagsspråk — drives dictionary popup language |
| `skriv.leksihjelp.examMode`             | string | `'1'` when eksamensmodus is on, `''` otherwise |
| `skriv.leksihjelp.grammarFeatures.{lang}` | string | JSON. Per-language grammar feature checkbox state for the dictionary view |
| `skriv.leksihjelp.activeTab`              | string | `'dictionary'` or `'settings'`; persists last active tab in the Leksihjelp drawer |
| `skriv.readingSettings`                 | string | JSON. Lesevisning display settings: `{ font, size, lineHeight, letterSpacing }` (see reading-settings.js) |

## Other storage

- **Service Worker cache:** `skriv-v{N}` — precaches all static assets listed in `sw.js ASSETS[]` (atomic) plus `LEKSIHJELP_ASSETS[]` and `OPTIONAL_ASSETS[]` (best-effort, individual failures don't block install). Current version: `skriv-v91`.
- **Images:** Stored inline as base64 data URIs within document `html` field. No separate image storage.
- **Persistent storage:** `main.js` calls `navigator.storage.persist()` at startup so the browser treats the origin's IndexedDB as protected rather than best-effort (Safari otherwise purges it after 7 days without a visit).
- **Backup file (`.skriv`):** `library-backup.js` exports `{ format: 'skriv-library-backup', version: 1, exportedAt, documents[], folders[] }` as JSON. Restore is merge-only: folders matched by name+parent (missing ones recreated depth-first), documents with identical `id`+`updatedAt` skipped, everything else imported as a new document with remapped `folderIds`. Trash and version snapshots are not included.
- **Version snapshots (`skriv-versions` DB):** one snapshot at most per 60 s of editing (major snapshot each 5 min or +100 words), capped at 300 snapshots per document — snapshots store the full editor HTML, so the cap bounds quota usage.
