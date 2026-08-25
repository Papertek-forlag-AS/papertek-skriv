# UI & Routes

> Last updated: 2026-08-25

## Routing

Hash-based SPA routing in `main.js`. No history API.

| Hash             | Screen          | Module               | Description                    |
|----------------- |---------------- |--------------------- |------------------------------- |
| `#/`             | Document list   | `document-list.js`   | Home dashboard, list of docs   |
| `#/doc/{id}`     | Editor          | `standalone-writer.js`| Writing editor for one doc    |
| `#/tysk`         | German exam spinner | `german-exam-route.js` (`renderGermanExamScreen`) | Tysk 1 / Tysk 2 randomised writing-task spinner; on pick creates a doc in folder "Tysk" and routes to `#/doc/{id}` |
| `#/avsnitt`      | Paragraph trainer | `paragraph-trainer-route.js` (`renderParagraphTrainerScreen`) | Three-step paragraph drill (trestegsmodellen): random topic deck, three labelled writing fields, self-check checklist, assembled-paragraph preview. No documents created — attempt persists in localStorage |

## Standalone pages (outside the SPA router)

| Path               | Module            | Description |
|------------------- |------------------ |------------ |
| `/stabekk.html`    | `stabekk-page.js` | Stabekk one-pager: hosts the paragraph trainer without the Skriv shell (no router, sidebar, or onboarding). Slim header with school badge and its own theme-cycle button. School level is fixed via the `STABEKK_LEVEL` constant in the module. Stabekk accent colors come from the page's own Tailwind config, which remaps the emerald scale (anchored in Pantone 640 C `#0082ba`, Akershus fylkeskommune's main brand color) — the trainer module is shared with `#/avsnitt` unchanged. Same origin, so trainer draft/deck in localStorage is shared with `#/avsnitt` |
| `/whitepaper.html` | (static HTML)     | Legal/transparency page |

**Navigation flow:**

```
App init → route()
  └── First visit (no school level) → Onboarding modal (must pick level)
        ├── Gated per route: shown for every screen EXCEPT #/avsnitt —
        │   deep links to the paragraph trainer skip the question (the
        │   level has no function there; trainer falls back to the 'us'
        │   starter tier). Modal appears on first navigation into the
        │   app proper instead.
        └── Picks level → saves to localStorage → continues to the route

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
- Collapsible folder tree — hierarchical folders (up to 3 levels), with document count badges (includes descendants)
- "+ Legg til mappe" — inline input to create folders at root level
- Context menu on custom folders: rename, add subfolder (if depth < 3), delete
- "Uten mappe" — orphan documents (`folderIds.length === 0`), amber indicator when count > 0
- "Personlig mappe" — personal folder (`folderIds` includes `sys___personal__`)
- "Tysk eksamenstrening" — navigates to `#/tysk` (German exam spinner)
- "Avsnittstrening" — navigates to `#/avsnitt` (three-step paragraph trainer)
- "Bytt trinn" — change school level button at bottom, opens onboarding modal (cancellable)
- Level-aware filtering: only shows system folders relevant to selected school level (or folders with documents)

**Mobile (< 768px):** Sidebar is hidden; hamburger button opens it as an overlay drawer.

**Main content:**
- Header with app title, theme toggle, trash button, create-new button
- Search bar (`document-search.js`) — filters documents by title and content, `Ctrl/Cmd+K` shortcut
- Stats bar (document count, total word count → opens statistics overlay)
- Document cards (title, preview, word count, last edited, folder badges)
  - Cards with no folder show a "Velg mappe" button with folder picker dropdown (multi-select)
  - Cards are `draggable="true"` with `data-doc-id` — drag to sidebar folders to assign
- "No results" state when filters match nothing
- Trash view — separate screen (replaces document list) with restore/permanent delete actions

**Filter pipeline:** school year → folder (with descendant inclusion) → tag → search

## Editor screen (`#/doc/{id}`)

**Layout:**
```
┌─────────────────────────────────────────────┐
│ ← Back  [save status]  [toolbar buttons...] │  ← Top bar
├─────────────────────────────────────────────┤
│ Document title input                         │
│ Mappe: [folder badges/picker]                 │  ← Folder picker row (multi-select)
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
| 💡 Hjelpetekst  | german-hint-drawer.js   | (German exam docs only) Opens simple/rich Norwegian draft drawer |
| 📚 Leksihjelp   | leksihjelp-settings.js  | Opens settings drawer (Eksamensmodus, Skrivespråk, Oppslagsspråk, Grammatikknivå). When the Leksihjelp Chrome extension is detected, the button stays visible but fires `requestExtensionPanel()` (a `skriv:leksihjelp:openPanel` window message) and shows a guidance toast pointing the user to the extension's side panel |
| Verktøy ▼       | standalone-writer.js    | Opens advanced tools menu when Avansert is on |
| Eksporter ▼     | text-export.js          | Dropdown: TXT, PDF, or Word export |

**Advanced tools menu:**
| Button          | Module                  | Behavior                          |
|---------------- |------------------------ |---------------------------------- |
| Ordspinner      | writing-spinner.js      | Shows random word suggestion      |
| Gjentakelse     | word-frequency.js       | Toggles repetition highlighting   |
| Setningslengde  | sentence-length.js      | Toggles rhythm bar visualization  |
| Avsnittskart    | paragraph-map.js        | Toggles document minimap          |
| Tabell          | table-manager.js        | Opens table insertion dialog      |
| Tilbakemelding  | writing-feedback.js     | Toggles local writing feedback panel |
| Versjonshistorikk | version-history.js    | Toggles saved snapshot timeline   |
| LIX             | lix-score.js            | Toggles readability score panel   |
| Argumentflyt    | argument-flow.js        | Toggles argument flow panel       |

**Formatting toolbar (floating, on text selection):**
- Bold, Italic, Underline
- Superscript, Subscript (via matte.js)
- H1, H2 (when advanced mode is on)
- Ordered list, Unordered list (when advanced mode is on)
- Special characters panel

**Editor surfaces driven by leksihjelp (when integrated):**
- Spell-check dots — inline under flagged words; click → popover with rule
  explanation + suggestions (`#lexi-spell-overlay`, owned by vendored
  spell-check-renderer.js).
- Dictionary popup — single-click any word → floating popup with
  translation + grammar (`leksihjelp-dictionary.js`). Yields when the
  Chrome extension is detected.
- Special-chars panel — driven by Skrivespråk (`special-chars-panel.js`).

## PWA behavior

- Installable via `manifest.json`
- Offline via Service Worker (`sw.js`)
- Display: standalone (no browser chrome)
- Orientation: any
- Theme color: #059669 (emerald)
