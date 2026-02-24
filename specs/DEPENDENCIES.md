# Dependencies

> Last updated: 2026-02-24

## External (CDN)

These are the only external dependencies. There is no `package.json` or npm.

| Library         | Version | Loaded from                                                   | Used by              | Purpose               |
|---------------- |-------- |-------------------------------------------------------------- |--------------------- |---------------------- |
| Tailwind CSS    | latest  | `https://cdn.tailwindcss.com`                                 | index.html           | Utility-first CSS     |
| jsPDF           | 2.5.1   | `https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js` | text-export.js | PDF generation |
| Floating UI DOM | 1.7.5   | `https://cdn.jsdelivr.net/npm/@floating-ui/dom@1.7.5/+esm`   | editor-toolbar.js    | Toolbar positioning   |

**Rules for adding external dependencies:**
- Must be loaded from a public CDN (no npm, no bundler)
- Must be pinned to a specific version (except Tailwind)
- Must be added to the Service Worker `ASSETS[]` array if it's a local file, or left out if CDN (CDN requests are not cached by SW)

## Internal dependency graph

```
app/main.js
  ├── shared/i18n.js
  ├── shared/theme.js
  ├── app/school-level.js
  ├── app/onboarding-modal.js
  │     ├── app/school-level.js
  │     ├── shared/i18n.js
  │     ├── shared/html-escape.js
  │     └── shared/dom-helpers.js
  ├── app/document-list.js
  │     ├── app/document-store.js
  │     │     └── app/subject-store.js
  │     ├── app/trash-store.js
  │     ├── app/document-search.js
  │     │     └── shared/i18n.js
  │     ├── app/document-tags.js
  │     │     ├── shared/i18n.js
  │     │     └── shared/html-escape.js
  │     ├── app/word-count-stats.js
  │     │     ├── app/subject-store.js
  │     │     ├── shared/html-escape.js
  │     │     └── shared/i18n.js
  │     ├── app/sidebar.js
  │     │     ├── app/subject-store.js
  │     │     │     └── app/school-level.js
  │     │     ├── app/school-level.js
  │     │     ├── app/onboarding-modal.js
  │     │     ├── shared/i18n.js
  │     │     └── shared/html-escape.js
  │     ├── app/subject-picker.js
  │     │     ├── app/subject-store.js
  │     │     ├── shared/i18n.js
  │     │     └── shared/html-escape.js
  │     ├── app/subject-store.js
  │     │     └── app/school-level.js
  │     ├── shared/i18n.js
  │     ├── shared/html-escape.js
  │     ├── shared/in-page-modal.js
  │     ├── shared/toast-notification.js
  │     └── shared/theme.js
  ├── app/standalone-writer.js
  │     ├── app/document-store.js
  │     ├── app/document-tags.js
  │     ├── app/subject-picker.js
  │     ├── shared/i18n.js
  │     ├── shared/html-escape.js
  │     ├── shared/word-counter.js
  │     ├── shared/auto-save.js
  │     ├── shared/toast-notification.js
  │     ├── student/editor-toolbar.js
  │     │     ├── shared/i18n.js
  │     │     ├── shared/frame-elements.js
  │     │     ├── config.js
  │     │     ├── student/special-chars-panel.js
  │     │     └── [CDN] Floating UI
  │     ├── student/matte.js
  │     ├── student/toc-manager.js
  │     ├── student/reference-manager.js
  │     ├── student/frame-manager.js
  │     ├── student/frame-selector.js
  │     ├── student/writing-spinner.js
  │     ├── student/word-frequency.js
  │     ├── student/sentence-length.js
  │     ├── student/paragraph-map.js
  │     ├── student/image-manager.js
  │     ├── student/submission-checklist.js
  │     └── student/text-export.js
  │           └── [CDN] jsPDF
  └── app/trash-store.js
```

**Invariant:** No circular dependencies. No upward imports (shared never imports from student or app).
