# Papertek Skriv — AI Instructions

## Read specs first

Before making changes, read the relevant spec files in `specs/`:

- `specs/ARCHITECTURE.md` — System overview, tech stack, directory structure, design principles
- `specs/MODULES.md` — Every module with exports, dependencies, and purpose
- `specs/DATA-MODEL.md` — IndexedDB schema, storage contracts, localStorage keys
- `specs/DEPENDENCIES.md` — External CDN libs, internal dependency graph
- `specs/UI-ROUTES.md` — Screens, routing, navigation flow, editor layout
- `specs/CONVENTIONS.md` — Module pattern, naming, import rules, i18n, SW updates

## Spec update rules

**You MUST update specs when you make any of these changes:**

| Change type                    | Update these specs                                |
|------------------------------- |-------------------------------------------------- |
| Add/remove/rename a JS module  | `MODULES.md`, `DEPENDENCIES.md` (graph), `sw.js ASSETS[]` |
| Change a module's exports      | `MODULES.md`                                      |
| Change a module's imports      | `MODULES.md` (depends on), `DEPENDENCIES.md` (graph) |
| Add/remove a CDN library       | `DEPENDENCIES.md`, `ARCHITECTURE.md` (tech stack) |
| Change IndexedDB schema        | `DATA-MODEL.md`                                   |
| Add/remove localStorage keys   | `DATA-MODEL.md`                                   |
| Add/remove a route             | `UI-ROUTES.md`                                    |
| Add/remove a top-bar button    | `UI-ROUTES.md` (editor layout)                    |
| Add/remove a writing frame     | `MODULES.md` (frames table)                       |
| Change a coding convention     | `CONVENTIONS.md`                                  |
| Add a new directory            | `ARCHITECTURE.md` (directory structure)            |
| Bump SW cache version          | `ARCHITECTURE.md` (note current version)           |

**When in doubt, update the spec.** Stale specs are worse than no specs.

## Architecture rules (do not violate)

1. **One feature = one file.** Never merge features into a single module.
2. **shared/ never imports from student/ or app/.** Hard boundary.
3. **No circular imports.** Dependency graph must be a DAG.
4. **init/destroy lifecycle.** Every feature module returns `{ destroy(), ...api }`.
5. **No build step.** Serve ES6 modules directly. CDN for third-party.
6. **No server, no tracking.** All data stays in IndexedDB. Zero network calls (except CDN libs).
7. **All UI strings via `t('key')`.** Add keys to all three locales (nb, nn, en).
8. **Update sw.js** when adding/removing static assets. Bump cache version.

## Portability

Modules in `editor-core/` will eventually be copied into Papertek Skriveprove. They must work standalone — no implicit coupling to `app/` layer.
