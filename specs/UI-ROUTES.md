# UI & Routes

> Last updated: 2026-02-23

## Routing

Hash-based SPA routing in `main.js`. No history API.

| Hash             | Screen          | Module               | Description                    |
|----------------- |---------------- |--------------------- |------------------------------- |
| `#/`             | Document list   | `document-list.js`   | Home dashboard, list of docs   |
| `#/doc/{id}`     | Editor          | `standalone-writer.js`| Writing editor for one doc    |

**Navigation flow:**

```
#/ (Document list)
  ├── Click document → #/doc/{id}
  ├── Create new doc → creates doc in IndexedDB → #/doc/{id}
  └── Open trash    → inline trash panel (same screen)

#/doc/{id} (Editor)
  └── Back button   → saves → #/
```

## Document list screen (`#/`)

**Components:**
- Header with app title, language selector, create-new button
- Search bar (`document-search.js`) — filters documents by title and content, `Ctrl/Cmd+K` shortcut
- Stats bar (document count, total word count → opens statistics overlay)
- Document cards (title, word count, last edited, frame type badge)
- "No results" state when search matches nothing
- Trash section (expandable, shows soft-deleted docs)
- Restore / permanent delete actions on trashed docs

## Editor screen (`#/doc/{id}`)

**Layout:**
```
┌─────────────────────────────────────────────┐
│ ← Back  [save status]  [toolbar buttons...] │  ← Top bar
├─────────────────────────────────────────────┤
│ Document title input                         │
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
