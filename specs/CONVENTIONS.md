# Conventions

> Last updated: 2026-08-22

## Feature lifecycle

Editor features expose a named `init*()` function and return an API containing `destroy()`:

```js
export function initMyFeature(editor, options = {}) {
    function destroy() {
        // remove owned DOM, listeners, timers, observers, and pending work
    }

    return { destroy };
}
```

- One feature lives in one kebab-case file.
- `destroy()` is idempotent where practical and owns every resource created by `init*()`.
- Screen APIs may have an asynchronous `destroy()`. The router must `await` it before replacing the screen.
- A failed final editor save rejects teardown; navigation is cancelled and the original URL/screen remains active.
- Pure data/storage modules may export direct functions instead of an initializer.

## Naming

| Thing | Convention | Example |
|---|---|---|
| File | kebab-case | `word-frequency.js` |
| Export | camelCase | `openSkrivDatabase` |
| Initializer | `init` + PascalCase | `initEditorToolbar` |
| Constant | UPPER_SNAKE_CASE | `DB_VERSION` |
| CSS class | Tailwind utility or `skriv-*` custom class | `text-stone-500`, `skriv-sidebar` |
| i18n key | dot-separated namespace | `review.feedbackDesc` |
| Frame | kebab-case Markdown | `reflekterende-tekst.md` |

## Import boundaries

1. `editor-core/shared/` never imports from `student/` or `app/`.
2. `editor-core/student/` may import from `shared/`, its own layer, `config.js`, and `editor-core/vendor/`.
3. `app/` may orchestrate every lower layer.
4. Circular imports are forbidden; update `DEPENDENCIES.md` when an edge changes.
5. Optional editor review tools use literal dynamic imports so the service-worker asset audit can discover them.
6. Floating UI is imported from local ESM files. The locally vendored jsPDF UMD exposes `window.jspdf`; guard that global before use.
7. `public/js/leksihjelp/` is generated from the upstream Leksihjelp repository. Do not hand-edit it. It is loaded as ordered classic scripts and accessed through `app/leksihjelp-bridge.js` plus `leksihjelp-loader.js`.

## Localization and language

- Every visible string uses `t('key')`; add each key to `nb.js`, `nn.js`, and `en.js`.
- Bokmål is the predictable first-run interface language. A visible selector persists explicit changes under `skriv_language`.
- Interface language and document writing language are separate concepts.
- A document writing-language change must update the editor `lang`, native spellcheck, Leksihjelp bridge, special characters, frame language, and persisted document state.
- Plural strings use `t(key, { count })` and plural objects in locale files.
- Pedagogical metrics must use cautious language: observations/support, not grading or authoritative assessment.
- “Limited assistance” must never be presented as a secure exam mode or locked browser.

## Storage safety

- All `skriv-documents` access goes through `app/db.js`; never add a second `indexedDB.open('skriv-documents', ...)` implementation.
- Schema migrations and post-open repairs must be idempotent and preserve recoverable legacy associations.
- Autosaves are serialized. A feature calls `schedule()` after content changes and awaits `flush()`/`destroy()` before destructive lifecycle events.
- A database `versionchange` participates in the same awaited editor-flush event as an app update before closing the connection.
- Soft delete keeps version snapshots. Permanent delete, empty trash, and expiry purge remove the associated snapshots.
- Backup restore is merge-only: it must validate before writes, never overwrite a local collision, remap relationships, and be safe to retry.
- Browser-profile IndexedDB is not durable backup media. UI and documentation must continue to disclose the `.skriv` backup option.

## Service-worker changes

When adding, removing, or renaming a runtime asset:

1. Update `ASSETS` or the managed Leksihjelp inventory in `sw.js`.
2. Bump `CACHE_NAME`.
3. Update the current cache version in `ARCHITECTURE.md` and `DATA-MODEL.md`.
4. Run the offline closure test so all static and dynamic module imports exist in the cache.

Never call `skipWaiting()` during install. A worker waits until an explicit update action completes all registered `skriv:before-app-reload` promises. Fetches for pinned same-origin release assets are cache-first.

## Styling and responsive UI

- Use Tailwind utilities for local layout; put reusable or stateful rules in `public/css/main.css`.
- Primary palette: emerald with stone neutrals.
- Main breakpoints: 768 px and 480 px.
- Pointer targets on coarse/touch devices should be at least 44 px.
- Respect `prefers-reduced-motion`.
- The mobile frame guide overlays the editor; it must not leave a desktop-width content offset.

## Accessibility

- Modals: `role="dialog"`, `aria-modal="true"`, labelled title, Escape, focus trap, and focus restoration.
- Toolbars: `role="toolbar"`, localized labels, roving tab stop, arrow/Home/End navigation, Escape back to the editor.
- Drawers: expose expanded state, make hidden content inert, and restore a usable focus target when closed.
- Save status uses a polite live status region.
- Document cards use list semantics and keyboard activation.
- Delete actions stay visible and have document-specific accessible names.
- The skip link targets the `#app` main landmark.

## Frame Markdown

Frames under `public/frames/{nb,nn}/` use front matter followed by sections:

```markdown
---
name: Drøfting
description: ...
sections: 4
---

# Section title

> Instruction for the student

- Guidance or sentence starter
```

The registry in `frame-selector.js` owns broad level recommendations (`barneskole`, `ungdomsskole`, `vgs`). Recommendations reorder/group choices; they never hide the remaining frames.

