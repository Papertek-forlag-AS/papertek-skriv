# Conventions

> Last updated: 2026-02-23

## Module pattern

Every feature module follows this pattern:

```js
// student/my-feature.js

import { t } from '../shared/i18n.js';

/**
 * Initialize the feature.
 * @param {HTMLElement} editor - The contenteditable element
 * @param {Object} [options] - Optional callbacks
 * @returns {{ destroy: Function, ...api }}
 */
export function initMyFeature(editor, options = {}) {
    // Setup: attach listeners, create DOM elements

    function destroy() {
        // Teardown: remove listeners, remove DOM elements
    }

    return { destroy, /* ...public API */ };
}
```

**Rules:**
1. Export a named `init*()` function (not default export)
2. Return an object with at least `destroy()`
3. `destroy()` must fully clean up: remove listeners, remove injected DOM, clear timers
4. Accept the editor element as first param
5. Accept an options object for callbacks (`onSave`, `onInsert`, etc.)

## Naming

| Thing            | Convention         | Example                      |
|----------------- |------------------- |----------------------------- |
| Files            | kebab-case         | `word-frequency.js`          |
| Export functions  | camelCase          | `initWordFrequency`          |
| Init functions   | `init` + PascalCase| `initEditorToolbar`          |
| Constants        | UPPER_SNAKE        | `EDITOR_SEL`, `DB_NAME`     |
| CSS classes      | Tailwind utilities  | `text-stone-500 px-4 py-2`  |
| i18n keys        | dot.separated      | `radar.button`, `skriv.saved`|
| Frame files      | kebab-case .md     | `droefting.md`               |

## Import rules

1. **shared/ never imports from student/ or app/.** This is a hard boundary.
2. **student/ may import from shared/ and from other student/ modules** (e.g., editor-toolbar imports special-chars-panel).
3. **app/ may import from anywhere** below it.
4. **No circular imports.** The dependency graph must remain a DAG.
5. **CDN globals** (jsPDF, FloatingUI) are accessed via `window` — never imported.

## i18n

- All user-visible strings must use `t('key')` from `shared/i18n.js`
- Translation keys are nested: `section.key` (e.g., `skriv.saved`, `radar.button`)
- New keys must be added to all three locale files: `nb.js`, `nn.js`, `en.js`
- Pluralization uses `t('key', { count: n })` — rules defined per language

## Service Worker updates

When adding or removing a JS module or static asset:
1. Add/remove the path from the `ASSETS` array in `sw.js`
2. Bump the cache version (e.g. `skriv-v17` → `skriv-v18`)

## Styling

- Use Tailwind utility classes for all new UI
- Custom CSS goes in `<style>` block in `index.html` only when Tailwind can't express it
- Color palette: emerald (#059669) primary, stone grays for text/borders
- Responsive breakpoints: 768px (tablet), 480px (phone)

## Accessibility (a11y)

- **Modals:** All modals must have `role="dialog"`, `aria-modal="true"`, `aria-labelledby` pointing to a title element, focus trap (Tab/Shift+Tab cycle), and Escape to close. Focus is restored to the triggering element on close.
- **Toolbars:** Use `role="toolbar"` with `aria-label`. Each button needs `aria-label` describing its action. Toggle buttons use `aria-pressed="true/false"`.
- **Lists:** Document card lists use `role="list"` / `role="listitem"`. Each card gets an `aria-label` summarizing title, word count, and last edit time.
- **Announcements:** Use `announce(message)` from `aria-live.js` for dynamic status updates (saves, search results, toast content) so screen readers pick them up.
- **Skip link:** `index.html` has a skip-to-content link targeting `#app` (visible on focus).
- **Landmarks:** `<main id="app" role="main">` wraps the application content.
- **Delete buttons:** Always visible (not hover-only `opacity-0`) to remain keyboard-accessible. Use subtle color (`text-stone-300`) instead of hiding.

## Frame Markdown format

Writing frames in `public/frames/` follow this structure:

```markdown
---
name: Drøfting
description: ...
sections: 4
---

# Section title

> Instruction text for the student

- Bullet point guidance
```

Parsed by `frame-parser.js` into: `{ name, metadata, sections[] }`.
