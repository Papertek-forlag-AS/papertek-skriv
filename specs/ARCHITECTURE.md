# Architecture

> Last updated: 2026-08-22

## Product boundary

Papertek Skriv is a local-first, deliberately small word processor for school writing. It has no account, document server, analytics, or tracking. Documents live in the active browser profile; portability is provided by normal document exports and a whole-library `.skriv` backup.

Local-first reduces data exposure but does not make Skriv a locked browser, a secure exam client, or a complete GDPR assessment on behalf of a school.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Language | Vanilla JavaScript, ES modules | No framework or bundler |
| CSS | Tailwind browser build 3.4.17 + `css/main.css` | Pinned and served locally |
| Document storage | IndexedDB `skriv-documents` v4 | Documents, trash, folders |
| Version storage | IndexedDB `skriv-versions` v1 | Bounded document snapshots |
| PDF export | jsPDF 2.5.1 UMD | Pinned local vendor file |
| Positioning | Floating UI DOM 1.7.5 | Vendored local ES modules |
| PWA | Manifest + Service Worker | Versioned, atomic offline release cache |
| i18n | Custom module | Bokmål, Nynorsk, English |
| Backend/build | None | Static files served as-is |

The application makes no runtime request to a third-party CDN. Same-origin files are cached by the service worker. Leksihjelp is a locally vendored browser bundle.

## Directory structure

```text
public/
├── index.html                  SPA shell
├── whitepaper.html             transparency and portability notes
├── manifest.json               PWA manifest
├── sw.js                       Service Worker, current cache `skriv-v77`
├── css/main.css                app/editor CSS and responsive rules
├── icons/                      install icon
├── vendor/                     pinned Tailwind and jsPDF distributions
├── frames/
│   ├── nb/                     12 Bokmål writing frames
│   ├── nn/                     12 Nynorsk writing frames
│   └── *.md                    three legacy Bokmål paths
└── js/
    ├── app/                    routing, storage, screens, backup
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
├── app/german-exam-route.js
└── app/standalone-writer.js
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
- The default editor mounts the writing essentials plus the review drawer, find/replace, and bounded version storage. Scan-heavy optional review modules are dynamically imported only when the student opens them.
- Writing language belongs to each document and drives native `lang`/spellcheck, Leksihjelp, special characters, and frame language independently of interface language.
- Version history keeps at most 50 snapshots per document, taken no more often than five minutes unless the text grows by 100 words.

## PWA and update safety

The current cache is `skriv-v77`.

1. The service worker atomically precaches the critical app shell and full ES-module graph.
2. Vendored Leksihjelp code, styles, metadata, and the compact NB fallback are cached best-effort per file. Larger language data is cached on first use by the same-origin fetch handler so installing the word processor does not eagerly download every language.
3. Same-origin release assets are cache-first, preventing mixed old/new module graphs.
4. A new worker remains waiting. The student explicitly accepts the update.
5. Every mounted editor registers an awaited flush before `SKIP_WAITING` and reload.
6. Activation removes only older `skriv-v*` caches, never unrelated origin caches.

## Design principles

1. One feature equals one file.
2. Writing and recovery take priority over convenience features.
3. The first view is quiet: no automatic tour, streak, pace, or progress overlay.
4. Pedagogical analysis is described as local observations and support, never as grading.
5. No build step; pinned third-party distributions are checked in under `public/vendor/` or `editor-core/vendor/`.
6. All visible strings use i18n and all interactive UI is keyboard-operable.
7. Browser-profile storage is not a backup; the product exposes `.skriv` library export/merge restore.

## Routes

| Route | Screen | Entry point |
|---|---|---|
| `#/` | Document library | `document-list.js` |
| `#/doc/{id}` | Editor | `standalone-writer.js` |
| `#/tysk` | German task spinner | `german-exam-route.js` |
