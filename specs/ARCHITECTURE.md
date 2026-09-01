# Architecture

> Last updated: 2026-09-01

## Product boundary

Papertek Skriv is a local-first, deliberately small word processor for school writing. It requires no account and has no Papertek document server, analytics, or tracking. Documents live in the active browser profile; portability is provided by normal document exports and a whole-library `.skriv` backup.

A school deployment may additionally enable the opt-in Microsoft 365 connector. After an explicit pupil sign-in and folder choice, the browser can keep individual native `.skriv` copies in a OneDrive or Teams/SharePoint folder through Microsoft Graph. IndexedDB remains the canonical working copy: local saves complete first and never wait for Microsoft. The connector does not provide Word co-authoring, enumerate Teams/channels, or add a Papertek storage backend.

Local-first reduces data exposure but does not make Skriv a locked browser, a secure exam client, or a complete GDPR assessment on behalf of a school.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Language | Vanilla JavaScript, ES modules | No framework or bundler |
| CSS | Tailwind browser build 3.4.17 + `css/main.css` | Pinned and served locally |
| Document storage | IndexedDB `skriv-documents` v4 | Documents, trash, folders |
| Version storage | IndexedDB `skriv-versions` v1 | Bounded document snapshots |
| Optional school storage | Microsoft Graph v1.0 | Direct delegated browser requests; one `.skriv` file per linked document |
| Optional Microsoft auth | MSAL Browser 5.17.3 | Vendored authorization code + PKCE client and redirect bridge; session-scoped cache |
| PDF export | jsPDF 2.5.1 UMD | Pinned local vendor file |
| Word export | docx 9.5.0 (vendored) | `/vendor/docx.iife.js`; lazy-loaded classic script on first `.docx` export |
| Positioning | Floating UI DOM 1.7.5 | Vendored local ES modules |
| PWA | Manifest + Service Worker | Versioned, atomic offline release cache |
| i18n | Custom module | Bokmål, Nynorsk, English |
| Backend/build | None | Static files served as-is |

The application makes no runtime request to a third-party CDN. `index.html` loads Tailwind, jsPDF, and MSAL Browser from `/vendor/`, and Floating UI DOM from `public/js/editor-core/vendor/`; there is no `cdn.tailwindcss.com`, `cdnjs.cloudflare.com`, or `cdn.jsdelivr.net` reference anywhere in the app. Same-origin release files are normally cached by the service worker. Leksihjelp and MSAL Browser are locally vendored. Only an explicitly enabled Microsoft 365 session makes direct cross-origin requests to Microsoft identity, Microsoft Graph, the configured school SharePoint host, and short-lived upload/download URLs. The dedicated MSAL redirect page/bridge and all cross-origin connector traffic bypass the service-worker and browser HTTP caches. `scripts/serve-local.mjs` supplies the redirect-specific headers required for mock-tenant localhost testing.

## Directory structure

```text
public/
├── index.html                  SPA shell
├── microsoft-auth-redirect.html  network-only MSAL popup response bridge
├── whitepaper.html             transparency and portability notes
├── school.html                 standalone per-school one-pager (paragraph trainer; `?skole=<id>` picks config)
├── stabekk.html                redirect to school.html?skole=stabekk, kept for shared links/QR
├── manifest.json               PWA manifest
├── sw.js                       Service Worker, current cache `skriv-v95`
├── css/main.css                app/editor CSS and responsive rules
├── icons/                      install icon
├── vendor/                     pinned Tailwind, jsPDF, MSAL Browser, and docx distributions
├── frames/
│   ├── nb/                     17 Bokmål writing frames
│   ├── nn/                     17 Nynorsk writing frames
│   └── en/                     17 English writing frames (the English subject)
└── js/
    ├── app/                    routing, storage, screens, backup
    │   ├── main.js             router, init
    │   ├── db.js               canonical `skriv-documents` opener
    │   ├── document-store.js
    │   ├── document-list.js
    │   ├── document-search.js
    │   ├── trash-store.js
    │   ├── cleanup-desk.js     pedagogical missing-title/folder workspace
    │   ├── standalone-writer.js  editor orchestrator
    │   ├── word-count-stats.js
    │   ├── folder-store.js       folder CRUD, tree helpers, school year logic
    │   ├── sidebar.js            collapsible folder tree navigation
    │   ├── folder-picker.js      multi-select folder assignment dropdown
    │   ├── school-level.js       school level data + persistence
    │   ├── onboarding-modal.js   first-time level selection modal
    │   ├── library-backup.js     whole-library `.skriv` backup/restore
    │   ├── german-exam-route.js  route + screen wiring for #/tysk
    │   ├── paragraph-trainer-route.js  route + screen wiring for #/avsnitt
    │   ├── school-page.js        entry point for school.html (standalone paragraph trainer, config-driven school)
    │   ├── leksihjelp-bridge.js  brokers leksihjelp status + Skrivespråk/Oppslagsspråk
    │   ├── leksihjelp-settings.js  slide-in drawer with the leksihjelp controls
    │   ├── leksihjelp-dictionary.js  in-editor word lookup popup
    │   ├── microsoft-config.js, microsoft-auth.js, microsoft-graph.js,
    │   │   microsoft-document-codec.js, microsoft-storage.js,
    │   │   microsoft-storage-dialog.js  opt-in Microsoft 365 connector
    │   └── sw-manager.js         service-worker registration/update prompt
    ├── editor-core/
    │   ├── config.js
    │   ├── shared/             portable utilities
    │   ├── student/            one editor feature per module
    │   ├── locales/            nb, nn, en
    │   └── vendor/             Floating UI ESM graph
    ├── leksihjelp-loader.js    browser-extension API shim
    └── leksihjelp/             generated upstream vendor snapshot; do not hand-edit
```

## Layers and boundaries

```text
app/main.js
├── app/document-list.js
│   ├── app/cleanup-desk.js
│   ├── app/microsoft-storage.js
│   └── app/microsoft-storage-dialog.js
├── app/german-exam-route.js
└── app/standalone-writer.js
    ├── app/microsoft-storage.js
    ├── app/microsoft-storage-dialog.js
    ├── editor-core/student/*
    └── editor-core/shared/*
```

1. `app/` owns screens, routes, browser storage, and product wiring.
2. `editor-core/student/` owns portable editor features and imports only its own layer or `shared/`.
3. `editor-core/shared/` never imports upward from `student/` or `app/`.
4. `editor-core/` must remain copyable into Papertek Skriveprøve without implicit app state.

The dependency graph is a DAG. Storage access to `skriv-documents` is centralized in `app/db.js`; the historical v4 data repair runs after open without forcing a new schema version while an older editor tab may be dirty.

## Runtime model

- `main.js` initializes theme, service-worker updates, interface language, school-level onboarding, and the hash router.
- Screen teardown is awaited. The editor flushes its latest state before route changes, database upgrades, or an accepted app update.
- Autosaves are serialized and coalesced; only one IndexedDB write runs at once.
- An optional Microsoft sync observes completed local saves and runs independently. Navigation and editor teardown await the local flush, never a remote request. Microsoft failures change only the separate remote status and cannot make the local document uneditable.
- The connector requires delegated `Files.ReadWrite.All` so it can reach both the pupil's own OneDrive files and Teams' group-owned SharePoint files that the signed-in pupil can already access. It also requires exact tenant/client configuration and a bare global-cloud SharePoint host. Pasted and Graph-resolved URLs must use exactly `<tenant>.sharepoint.com` or its matching `<tenant>-my.sharepoint.com` companion.
- Its selected target and MSAL account/token cache are session-scoped. A local document stores only a SHA-256 pseudonymous account binding plus remote identity, eTag, sync state, and a nullable in-progress attempt ID; it never stores the Microsoft home-account ID or email address.
- A linked document is serialized as a validated one-document `.skriv` envelope. Before update/download, Graph metadata must still identify the same `.skriv` item in the selected folder; moved or renamed items fail closed. Updates use the remote eTag with `If-Match`; Graph `409` and `412` become explicit conflicts and the safe resolution is to create a separate “keep both” copy rather than overwrite either version.
- A remote transfer must remain below 60 MiB. Import rejects oversized drive-item metadata or `Content-Length` and bounds the response stream before UTF-8 decoding, so a missing/false length cannot create an unbounded in-memory read.
- Connector metadata acknowledgements use an atomic IndexedDB compare-and-swap guard. They cannot overwrite a newer autosave, unlink, or trash transition. An edit or explicit sync arriving during an upload queues one coalesced follow-up pass, so the acknowledged remote hash cannot hide newer local content.
- Browser backup restore strictly validates the exact Microsoft link schema, rejects duplicate remote item identities, and strips a link when that item is already owned by a different local document.
- The default editor mounts the writing essentials plus the review drawer, find/replace, and bounded version storage. Scan-heavy optional review modules are dynamically imported only when the student opens them.
- Writing language belongs to each document and drives native `lang`/spellcheck, Leksihjelp, special characters, and frame language independently of interface language.
- Version history keeps at most 50 snapshots per document, taken no more often than five minutes unless the text grows by 100 words.

## PWA and update safety

The current cache is `skriv-v95`.

1. The service worker atomically precaches the critical app shell and full ES-module graph.
2. Vendored Leksihjelp code, styles, metadata, and the compact NB fallback are cached best-effort per file. Larger language data is cached on first use by the same-origin fetch handler so installing the word processor does not eagerly download every language.
3. Same-origin release assets are cache-first, preventing mixed old/new module graphs.
4. A new worker remains waiting. The student explicitly accepts the update.
5. Every mounted editor registers an awaited flush before `SKIP_WAITING` and reload.
6. Activation removes only older `skriv-v*` caches, never unrelated origin caches.
7. Cross-origin Microsoft identity, Graph API, SharePoint, and pre-authenticated upload/download URLs bypass the service-worker cache.
8. `/microsoft-auth-redirect.html` and `/vendor/msal-redirect-bridge-5.17.3.min.js` are same-origin but explicitly network-only. Hosting must serve both with `Cache-Control: no-store` and no `Cross-Origin-Opener-Policy` response header so MSAL 5 can return a popup response to its opener.

## Design principles

1. One feature equals one file.
2. Writing and recovery take priority over convenience features.
3. The first view is quiet: no automatic tour, streak, pace, or progress overlay.
4. Pedagogical analysis is described as local observations and support, never as grading.
5. No build step; pinned third-party distributions are checked in under `public/vendor/` or `editor-core/vendor/`.
6. All visible strings use i18n and all interactive UI is keyboard-operable.
7. Browser-profile storage is not a backup; the product exposes `.skriv` library export/merge restore.
8. Optional integrations preserve the local-first baseline: explicit enablement, least privilege, no Papertek document/token service, no tracking, and no remote action that can block or delete local writing.

## Routes

| Route | Screen | Entry point |
|---|---|---|
| `#/` | Document library | `document-list.js` |
| `#/trash` | Recoverable trash | `document-list.js` |
| `#/doc/{id}` | Editor (optional `?focus=title`) | `standalone-writer.js` |
| `#/tysk` | German task spinner | `german-exam-route.js` |
| `#/avsnitt` | Paragraph trainer | `paragraph-trainer-route.js` |

### Standalone pages (outside the hash router)

| Path | Purpose |
|---|---|
| `index.html` | SPA shell |
| `whitepaper.html` | Transparency and portability notes |
| `school.html?skole=<id>` | Per-school one-pager hosting the paragraph trainer without the Skriv shell; config-driven via `school-page.js` |
| `stabekk.html` | Static redirect to `school.html?skole=stabekk`, kept for shared links/QR codes |
| `microsoft-auth-redirect.html` | Network-only MSAL popup response bridge |

There is no CDN dependency table here by design: every third-party library Skriv loads is pinned and vendored under `public/vendor/` or `public/js/editor-core/vendor/`. See `DEPENDENCIES.md` for the exact versions, local paths, and consumers.
