# UI & Routes

> Last updated: 2026-02-24

## Routing

Hash-based SPA routing in `main.js`. No history API.

| Hash             | Screen          | Module               | Description                    |
|----------------- |---------------- |--------------------- |------------------------------- |
| `#/`             | Document list   | `document-list.js`   | Home dashboard, list of docs   |
| `#/doc/{id}`     | Editor          | `standalone-writer.js`| Writing editor for one doc    |

**Navigation flow:**

```
App init
  └── First visit (no school level) → Onboarding modal (must pick level)
        └── Picks level → saves to localStorage → continues to #/

#/ (Document list)
  ├── Click document → #/doc/{id}
  ├── Create new doc → creates doc in IndexedDB → #/doc/{id}
  └── Open trash    → inline trash panel (same screen)

#/doc/{id} (Editor)
  └── Back button   → saves → #/
```

## Document list screen (`#/`)

**Layout:** Two-column: sidebar (left) + main content (right).

**Sidebar** (`sidebar.js`):
- School year selector (`<select>`, Aug–Jul, auto-detects current year)
- "Siste dokumenter" — all documents (default view)
- Subject folders — one per subject, with document count badge
- "+ Legg til fag" — inline input to create custom subjects
- "Uten fag" — orphan documents (no subject assigned), amber indicator when count > 0
- "Personlig mappe" — personal folder (`subject === '__personal__'`)
- "Bytt trinn" — change school level button at bottom, opens onboarding modal (cancellable)

**Mobile (< 768px):** Sidebar is hidden; hamburger button opens it as an overlay drawer.

**Main content:**
- Header with app title, theme toggle, trash button, create-new button
- Search bar (`document-search.js`) — filters documents by title and content, `Ctrl/Cmd+K` shortcut
- Tag filter chips (`document-tags.js`)
- Stats bar (document count, total word count → opens statistics overlay)
- Document cards (title, preview, word count, last edited, subject badge, tags)
  - Cards with no subject show a "Velg fag" button with subject picker dropdown
  - Cards are `draggable="true"` with `data-doc-id` (prep for future drag-drop)
- "No results" state when filters match nothing
- Trash view — separate screen (replaces document list) with restore/permanent delete actions

**Filter pipeline:** school year → subject → tag → search

## Editor screen (`#/doc/{id}`)

**Layout:**
```
┌─────────────────────────────────────────────┐
│ ← Back  [save status]  [toolbar buttons...] │  ← Top bar
├─────────────────────────────────────────────┤
│ Document title input                         │
│ + Ny merkelapp (tag editor)                  │
│ Fag: [subject badge/picker]                  │  ← Subject picker row
├─────────────────────────────────────────────┤
│                                              │
│  [contenteditable editor]                    │  ← Scrollable
│                                              │
│  [floating formatting toolbar appears        │
│   on text selection]                         │
│                                              │
├─────────────────────────────────────────────┤
│ Word count: 342 / Tegn: 2,108               │  ← Word counter bar
└─────────────────────────────────────────────┘
```

**Top bar buttons:**
| Button          | Module                  | Behavior                          |
|---------------- |------------------------ |---------------------------------- |
| Struktur        | frame-selector.js       | Opens frame picker dialog         |
| Avansert        | editor-toolbar.js       | Toggles H1/H2/lists in toolbar   |
| Kilder          | reference-manager.js    | Opens citation dialog             |
| Bilde           | image-manager.js        | Opens file picker for images      |
| Ordspinner      | writing-spinner.js      | Shows random word suggestion      |
| Ordradar        | word-frequency.js       | Toggles repetition highlighting   |
| Setningslengde  | sentence-length.js      | Toggles rhythm bar visualization  |
| Avsnittskart    | paragraph-map.js        | Toggles document minimap          |
| Eksporter ▼     | text-export.js          | Dropdown: TXT or PDF export       |

**Formatting toolbar (floating, on text selection):**
- Bold, Italic, Underline
- Superscript, Subscript (via matte.js)
- H1, H2 (when advanced mode is on)
- Ordered list, Unordered list (when advanced mode is on)
- Special characters panel

## PWA behavior

- Installable via `manifest.json`
- Offline via Service Worker (`sw.js`)
- Display: standalone (no browser chrome)
- Orientation: any
- Theme color: #059669 (emerald)
