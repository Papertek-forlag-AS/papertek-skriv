# UI & Routes

> Last updated: 2026-08-22

## Routing

`main.js` uses a hash router and awaits the active screen's teardown.

| Hash | Screen | Module | Notes |
|---|---|---|---|
| `#/` | Document library | `document-list.js` | Default route |
| `#/doc/{id}` | Editor | `standalone-writer.js` | One local document |
| `#/tysk` | German task spinner | `german-exam-route.js` | Tysk 1/2 practice prompts; not a locked exam environment |

```text
App start
└── no school level → required level picker → #/

#/
├── new text → create in IndexedDB → #/doc/{id}
├── document card → #/doc/{id}
├── trash button → inline trash view
└── German practice → #/tysk → pick task → German document → #/doc/{id}

#/doc/{id}
└── back/hash change → await final save → destination
    └── save failure → cancel route and keep the editor mounted
```

## Document library (`#/`)

The desktop layout has two columns: folder sidebar and one canonical document list. The former cleanup-desk/duplicate orphan column is not rendered. Unfiled documents stay in the main list and are reachable through the “Uten mappe” sidebar filter.

### Header

- App name and short tagline
- Compact visible interface-language selector (NB/NN/EN)
- Theme cycle (system/light/dark)
- Trash with count badge
- “Ny tekst” primary action

### Sidebar

- School-year selector
- All/recent documents
- Collapsible folder tree with descendant counts, maximum depth 3
- Add, rename, nest, move, and delete custom folders
- “Uten mappe” and personal-folder filters
- German writing-practice route
- Change school level
- Download whole-library `.skriv` backup
- Merge/restore a validated `.skriv` backup
- Local-storage/backup disclosure

System folders are filtered by selected school level unless they contain documents. Backup restore never clears the current library and reloads the view after a completed merge.

### Main list

- Search by title/content (`Ctrl/Cmd+K`)
- School year → folder (including descendants) → search filter pipeline
- Document/word summary and optional statistics dialog
- One keyboard-operable card per document: title, preview, word count, edit time, folder badges
- Unfiled cards show a compact folder assignment control
- Cards may be dragged to a sidebar folder
- Soft-delete action moves a document to the 30-day trash

### Mobile

Below 768 px the sidebar becomes an overlay navigation drawer. The hamburger exposes `aria-expanded`/`aria-controls`; the background becomes inert while open; Escape, selection, or backdrop closes it and restores focus.

## Editor (`#/doc/{id}`)

```text
┌──────────────────────────────────────────────────────────┐
│ Back | save | Structure | Review | German help (task only) | Leksihjelp | Export │
├──────────────────────────────────────────────────────────┤
│ Document title                                           │
│ Folder badges/picker                  Writing language   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ contenteditable writing area                             │
│ selection toolbar / optional frame guide                 │
│                                                          │
├──────────────────────────────────────────────────────────┤
│ Word count                                               │
└──────────────────────────────────────────────────────────┘
```

### Top bar buttons

| Button | Module | Behavior |
|---|---|---|
| Back | router/editor autosave | Flush, then return to library |
| Structure | `frame-selector.js` | Level-grouped frame picker; all frames remain available |
| Review | `insights-drawer.js` | Opens review/support actions |
| 💡 Help text | `german-hint-drawer.js` | German-task documents only; simple/richer Norwegian prompt support |
| 📚 Leksihjelp | app Leksihjelp modules | Dictionary/settings, or guidance to the installed extension panel |
| Export | `text-export.js` | TXT, PDF, Word-compatible `.doc` |

Save status is a polite live region. Offline status says the text is saved locally in the browser profile.

### Document metadata

- Title is a labelled input.
- Folder badges open a multi-select folder picker.
- Writing language is stored per document: NB, NN, EN, DE, ES, or FR.
- Writing language updates the editor's `lang` and native spellcheck, Leksihjelp writing language, special-character panel, and frame source.
- NB/NN have native frame files; other languages show an explicit Bokmål-frame fallback message.

### Writing surface

- The contenteditable has textbox/multiline semantics and a localized label.
- Formatting toolbar appears on text selection: bold, italic, underline, bullet/numbered lists, H1, H2.
- Toolbar uses a roving tab stop with arrows, Home/End, and Escape.
- `/` opens the slash menu for headings, lists, references, images, tables, or a literal slash.
- `Ctrl/Cmd+F` opens in-document search.
- References and a generated table of contents live inside the document but are removed/translated appropriately during export.
- The frame guide is side-by-side only above 768 px; on mobile it overlays without shifting the editor.

### Review drawer

The default editor does not initialize pace, streak, tour, or scan-heavy analysis. The drawer, find/replace, and bounded version storage are mounted; scan-heavy review features load only when invoked.

| Action | Loading | Meaning |
|---|---|---|
| Search | already mounted | Find words/phrases |
| Focus | dynamic | Hide surrounding chrome |
| Word spinner | dynamic | Idea/sentence-starter support |
| Text observations | dynamic | Local heuristics, explicitly not grading |
| Version history | mounted | Restore bounded local snapshots |
| Repetition | dynamic | Highlight repeated words |
| Sentence length | dynamic | Visual variation overview |
| Paragraph map | dynamic | Structural overview |
| LIX | dynamic | Rough readability signal |
| Argument flow | dynamic | Pattern support, not assessment |

### Leksihjelp

- Clicking a word may open the embedded dictionary unless the extension owns the surface.
- The settings drawer controls writing language, lookup language, grammar display, and “Limited assistance”.
- Limited assistance disables some suggestions/explanations; UI explicitly states that it is not a secure exam mode or locked browser.

## Export flow

All three exports open a non-blocking self-check dialog. The student may continue regardless of warnings.

- TXT: UTF-8 text with title/date/word count.
- PDF: locally vendored jsPDF.
- Word: Word-compatible HTML with the truthful `.doc` extension; it is not presented as `.docx`.

## PWA behavior

- Installable from `manifest.json`.
- A fully cached release works offline.
- New releases wait behind an explicit update bar; accepting awaits editor save hooks before activation/reload.
- Core release files are served cache-first from one versioned cache to avoid mixing releases.
