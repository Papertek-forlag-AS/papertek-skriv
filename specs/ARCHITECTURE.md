# Architecture

> Last updated: 2026-02-23

## What is this?

Papertek Skriv is a privacy-first PWA for student writing in Norwegian schools. No server, no login, no tracking. All data stays in the browser (IndexedDB).

## Tech stack

| Layer        | Choice                  | Notes                          |
|------------- |------------------------ |------------------------------- |
| Language     | Vanilla JS (ES6 modules)| No framework, no bundler       |
| CSS          | Tailwind CSS (CDN)      | `https://cdn.tailwindcss.com`  |
| Storage      | IndexedDB               | Database: `skriv-documents`    |
| PDF export   | jsPDF 2.5.1 (CDN)       | cdnjs.cloudflare.com           |
| Positioning  | Floating UI 1.7.5 (CDN) | For toolbar popover            |
| PWA          | Service Worker + manifest| Offline-first, installable     |
| i18n         | Custom module            | nb, nn, en with pluralization  |
| Build system | None                    | Served as-is, no compilation   |
| Backend      | None                    | 100% client-side               |

## Directory structure

```
public/
├── index.html              ← Single entry point (SPA)
├── manifest.json           ← PWA manifest
├── whitepaper.html         ← Legal/transparency page
├── sw.js                   ← Service Worker (cache v20)
├── icons/                  ← PWA icons (192, 512)
├── frames/                 ← Writing frame templates (Markdown)
│   ├── analyse.md
│   ├── droefting.md
│   ├── kronikk.md
│   ├── nb/                 ← Bokmål copies
│   └── nn/                 ← Nynorsk copies
└── js/
    ├── app/                ← App-level orchestration
    │   ├── main.js         ← Router, init
    │   ├── document-store.js
    │   ├── document-list.js
    │   ├── document-search.js
    │   ├── document-tags.js
    │   ├── trash-store.js
    │   ├── standalone-writer.js  ← Editor orchestrator
    │   ├── word-count-stats.js
    │   ├── subject-store.js      ← Subject list + school year logic
    │   ├── sidebar.js            ← Subject folder navigation
    │   └── subject-picker.js     ← Subject assignment dropdown
    └── editor-core/
        ├── config.js       ← Constants (special chars)
        ├── shared/         ← Cross-product utilities (8 modules)
        ├── student/        ← Student editor features (16 modules)
        └── locales/        ← Translation files (nb, nn, en)
```

## Module layers

```
┌─────────────────────────────────────────┐
│  app/main.js  (router)                  │
│    ├── document-list.js   (home screen) │
│    └── standalone-writer.js (editor)    │
│         ├── editor-core/student/*       │
│         └── editor-core/shared/*        │
└─────────────────────────────────────────┘
```

**Three layers, strict top-down dependency:**

1. **app/** — Orchestration. Knows about routes, screens, and storage. Imports from `editor-core/`.
2. **editor-core/student/** — Feature modules (toolbar, spinner, radar, etc.). Imports from `shared/` only.
3. **editor-core/shared/** — Zero-dependency utilities (i18n, escaping, DOM helpers). Never imports upward.

## Design principles

1. **One feature = one file.** Every module is self-contained.
2. **Portable.** Modules will be copied into Papertek Skriveprove — no hidden coupling allowed.
3. **init/destroy lifecycle.** Every feature module exports `init*()` returning an API object with a `destroy()` method.
4. **No globals.** All modules use named ES6 exports. No window pollution.
5. **No build step.** Files are served directly. CDN for third-party libs.
6. **Privacy by architecture.** No server calls, no analytics, no cookies. IndexedDB only.

## Screens

| Route           | Screen         | Entry point             |
|---------------- |--------------- |------------------------ |
| `#/`            | Document list  | `document-list.js`      |
| `#/doc/{id}`    | Editor         | `standalone-writer.js`  |

## CDN dependencies

| Library          | Version | CDN URL                                                      |
|----------------- |-------- |------------------------------------------------------------- |
| Tailwind CSS     | latest  | `https://cdn.tailwindcss.com`                                |
| jsPDF            | 2.5.1   | `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` |
| Floating UI DOM  | 1.7.5   | `https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.7.5/`      |
