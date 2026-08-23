# Data Model

> Last updated: 2026-08-23

Skriv is local-first. Documents, trash, folders, and version snapshots remain in the browser unless the student explicitly downloads a backup/export or opts into a school-enabled Microsoft 365 connection. There is no Papertek account or server-side document copy. Even when a remote `.skriv` copy is linked, the IndexedDB document remains the canonical working copy and every edit is saved locally first.

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
| `microsoft365` | object/null | no | | Pseudonymous account binding plus target/item/eTag/sync metadata for an explicitly linked remote copy; never contains a token, email, Microsoft home-account ID, or pasted folder link |
| `subject` | string/null | legacy | yes | Retained for compatibility; new UI uses `folderIds` |
| `tags` | array | legacy | | May exist on older records; no longer written |

New documents take their initial `writingLanguage` from the current interface language when supported. Older records are read as Bokmål unless they contain `germanHint`, in which case Skriv infers German. The editor writes the resolved value on the next save.

`microsoft365`, when non-null, is a version 1 link descriptor:

| Field | Type | Meaning |
| --- | --- | --- |
| `version` | number | Link schema version, currently `1` |
| `tenantId` | string | Required configured school tenant ID |
| `accountBinding` | string | Required lowercase SHA-256 of the tenant-scoped MSAL account identity with a Skriv domain prefix; prevents another account from reusing the link without storing its home-account ID or email |
| `driveId`, `folderId`, `folderName`, `folderWebUrl` | string | Resolved canonical target; never the pasted sharing URL |
| `remoteDocumentId` | string/null | Stable document identity carried inside the remote file; retained across local import ID changes |
| `itemId`, `fileName`, `webUrl`, `eTag`, `cTag` | string/null | Acknowledged drive-item metadata; nullable before the first successful create |
| `lastSyncedAt`, `lastSyncedHash` | string/null | Successful acknowledgement time and exact serialized UTF-8 SHA-256 |
| `state`, `errorCode` | string/null | Pupil-facing state and non-sensitive operational code; never a raw Graph response/body |
| `attemptId` | string/null | Unique compare-and-swap token while one upload attempt is pending; cleared on acknowledgement/error and nullable otherwise |

Persisted sync states are `pending`, `synced`, `conflict`, `error`, `needs-sign-in`, `permission-denied`, `remote-missing`, `account-mismatch`, `target-required`, and `target-mismatch`. A document with no valid link is `local-only` at runtime. `destroyed`, `cancelled`, `unlinked`, and `superseded` may appear only as transient operation results.

Asynchronous connector acknowledgements call `saveDocument(..., { preserveUpdatedAt: true, expectedFields: { microsoft365: ... } })`. The document store performs the read, deep expected-field comparison, merge, and write in one IndexedDB transaction. A failed comparison returns `null` without writing, so a late upload acknowledgement cannot overwrite a newer autosave, unlink, or removal. Explicit unlink instead atomically clears the current `microsoft365` field without a stale expected value, and background sync re-checks that a link exists when its timer executes, so opt-out wins across controllers/tabs. If another edit/sync request arrives while the document upload is in flight, the controller coalesces it into one queued follow-up pass after the current attempt settles.

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

Restore is validated before writes and is merge-only: local records are never overwritten. Exact replays are idempotent, deterministic conflict IDs keep related folder/document/version records connected, and version auto-increment IDs do not participate in deduplication. Microsoft metadata must match the exact version 1 key/type/length/URL/state schema; unknown identity/credential-like fields and duplicate `(tenantId, driveId, itemId)` identities across live/trash records are rejected. A restored collision or remote identity already owned by another local record drops `microsoft365`, because two local identities must not autosync the same drive item. Primary document/folder/trash changes use one transaction; later version/settings phase failures are retryable partial restores.

The parser applies size/count/depth limits and rejects duplicate identities, missing folder parents, document-to-folder references that do not exist in the backup, invalid folder topology, unsafe active HTML, event attributes, unsafe URL schemes, and network-capable inline CSS. A legacy version snapshot whose `docId` is absent is accepted for portability, then counted as orphaned and skipped during restore.

Only these preferences travel in a library backup: `skriv_language`, `skriv_theme`, legacy `theme`, `skriv_school_year`, `skriv_school_level`, and the three core Leksihjelp language/limited-assistance keys.

An optional `document.microsoft365` object is ordinary document metadata and therefore travels with that document in a whole-library backup. It contains no token, email address, Microsoft home-account ID, or pasted folder sharing link. It does include a pseudonymous SHA-256 `accountBinding` and remote organizational metadata such as tenant/drive/folder/item IDs, names, canonical URLs, eTags, timestamps, hashes, state/error codes, and possibly a nullable in-progress `attemptId`. These are not credentials, but they can still be personal or school-organizational metadata, so a library backup must be protected accordingly. Restore does not initiate authentication or remote traffic: the connector must be configured, the matching account must be present, and a target must be selected in the current session before sync can resume.

## Portable Microsoft 365 document

The optional connector stores one live document per remote `.skriv` file. It reuses the validated `papertek-skriv-backup` version 1 JSON envelope, narrowed to exactly:

- one live document with `microsoft365` removed;
- only the document's referenced folders and their ancestor closure;
- empty `trash` and `versions` arrays; and
- an empty `settings` object.

Serialization and import reuse the library backup's size, topology, identity, HTML, URL, and inline-style safety validation; active/resource markup is rejected before browser DOM parsing, and any `microsoft365` field in a remote payload is rejected. The initial readable filename combines a sanitized title with a stable document-ID suffix. The SHA-256 hash covers the exact UTF-8 serialization. Upload and download remain below 60 MiB; download enforces drive-item size, `Content-Length`, a bounded byte stream, and fatal UTF-8 decoding.

Remote item identity and the upload acknowledgement's eTag stay in the local document record; a follow-up metadata GET may enrich other fields but cannot substitute its eTag, a failed enrichment read cannot turn a committed upload into a retry, and a different eTag reports a conflict. Update/download preflight verifies the item remains a `.skriv` file in the selected folder. Updates use `If-Match`; Graph `409`/`412` record conflicts. **Keep both** relinks to a separate file. Import's first local write already records the source item/eTag so interruption cannot make recovery create a new remote file; it otherwise uses current school year, clears legacy `subject`, and enters **Uten mappe**. Skriv does not delete remote files.

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

## sessionStorage

Microsoft connection state is deliberately scoped to the current browser tab/session:

| Key / owner | Value | Purpose |
| --- | --- | --- |
| `skriv.microsoft.clientId` | Entra application GUID | Localhost-only development override; production uses HTML metadata |
| `skriv.microsoft.tenantId` | Entra directory GUID | Localhost-only development override; production uses HTML metadata |
| `skriv.microsoft.sharePointHost` | Bare `<tenant>.sharepoint.com` hostname | Localhost-only global-cloud SharePoint boundary; schemes, paths, ports, wildcards, and a configured `-my` host are invalid |
| `skriv.microsoft.target.v1` | `{ version: 1, tenantId, driveId, folderId, folderName, folderWebUrl }` JSON | Current tenant-bound resolved drive/folder target; the pasted sharing URL is not retained |
| MSAL Browser | library-owned session keys | Account and delegated token cache; Skriv auto-resumes only one unambiguous cached account and clears the connector's complete app cache on disconnect |

Production reads public client ID, tenant ID, and bare SharePoint host from `skriv:microsoft-client-id`, `skriv:microsoft-tenant-id`, and `skriv:microsoft-sharepoint-host` meta tags instead. The connector requests delegated `Files.ReadWrite` only. Passwords, MFA codes, access/refresh tokens, client secrets, raw MSAL account identifiers, emails, and pasted folder links are never application data and must not be persisted or backed up.

## Other local storage

- **Service Worker cache:** current static cache is `skriv-v80`. Critical shell/modules/frames, the Microsoft connector modules, and the main vendored MSAL Browser distribution are precached atomically. Vendored Leksihjelp code, styles, metadata, and the compact NB fallback are best-effort precached; larger language data is cache-on-use through the same-origin cache-first fetch handler. Cross-origin Microsoft traffic is not cached. The same-origin `/microsoft-auth-redirect.html` and `/vendor/msal-redirect-bridge-5.17.3.min.js` resources also bypass the worker and must be served network-only with `Cache-Control: no-store` and no `Cross-Origin-Opener-Policy` response header.
- **Images:** compressed images are stored as base64 data URIs inside document HTML; there is no separate image store.
