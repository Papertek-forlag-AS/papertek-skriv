# UI & Routes

> Last updated: 2026-09-01

## Routing

`main.js` uses a hash router and awaits the active screen's teardown.

| Hash | Screen | Module | Notes |
|---|---|---|---|
| `#/` | Document library | `document-list.js` | Default route |
| `#/trash` | Recoverable trash | `document-list.js` | Soft-deleted documents and permanent-delete controls |
| `#/doc/{id}` | Editor (optional `?focus=title`) | `standalone-writer.js` | One local document |
| `#/tysk` | German task spinner | `german-exam-route.js` (`renderGermanExamScreen`) | Tysk 1/2 practice prompts; not a locked exam environment. On pick, creates a document in folder "Tysk" and routes to `#/doc/{id}` |
| `#/avsnitt` | Paragraph trainer | `paragraph-trainer-route.js` (`renderParagraphTrainerScreen`) | Three-step paragraph drill (trestegsmodellen): random topic deck, three labelled writing fields, self-check checklist, assembled-paragraph preview. `onSaveDocument` optionally creates a document from the finished paragraph; the attempt itself persists in localStorage regardless |

## Standalone pages (outside the SPA router)

| Path | Module | Description |
|---|---|---|
| `index.html` | (SPA shell) | Loads `app/main.js` and the hash router |
| `/whitepaper.html` | (static HTML) | Legal/transparency page |
| `/school.html?skole=<id>` | `school-page.js` | Per-school one-pager: hosts the paragraph trainer without the Skriv shell (no router, sidebar, onboarding, or service worker). Slim header with school badge and its own theme-cycle button. School identity (name, fixed level, accent palette remapping the emerald scale, theme-color) comes from the `SKRIV_SCHOOLS` config map in `school.html` — adding a school is one config entry; the trainer module is shared with `#/avsnitt` unchanged, and no `onSaveDocument` is passed so the trainer's save button stays hidden here. Same origin, so trainer draft/deck in localStorage is shared with `#/avsnitt`. Stabekk's palette is anchored in Pantone 640 C `#0082ba` (Akershus fylkeskommune) |
| `/stabekk.html` | (static redirect) | Redirects to `/school.html?skole=stabekk` — kept for links/QR codes already in the wild |
| `/microsoft-auth-redirect.html` | (network-only MSAL bridge) | Dedicated popup response relay for the Microsoft 365 connector; see `ARCHITECTURE.md` and `DEPENDENCIES.md` |

```text
App init → route()
└── First navigation into a screen (no school level saved yet) → Onboarding modal (must pick level)
      ├── Gated per route rather than at init: shown before every screen EXCEPT #/avsnitt —
      │   a deep link straight to the paragraph trainer skips the question, since level has
      │   no function there. If no level is ever set, `paragraph-trainer-route.js`'s
      │   `getLevel` returns null and the trainer defaults to the 'ungdomsskole' level,
      │   i.e. the 'us' (not 'vgs') starter-chip tier.
      └── Picks level → saves to localStorage → continues to the route
            (or "Velg senere" defers the question for the rest of the session)

#/
├── new text → create in IndexedDB → #/doc/{id}
├── document card → #/doc/{id}
├── Microsoft 365 (when configured/localhost) → connect/select folder/list remote `.skriv`
│   └── import → validate → new local **Uten mappe** document → #/doc/{id}
├── cleanup title action → #/doc/{id}?focus=title → title field focused
├── trash button → #/trash → back → #/
└── German practice → #/tysk → pick task → German document → #/doc/{id}

#/doc/{id}
└── back/hash change → await final save → destination
    └── save failure → cancel route and keep the editor mounted
```

## Document library (`#/`)

At 1024 px and wider, the desktop layout has three columns: folder sidebar, a narrow cleanup desk, and one canonical document list. The cleanup desk is a pedagogical workspace rather than a second library: it shows every document in the selected school year that has a blank title or no folder. Search and folder filters never hide cleanup work. Unfiled documents also stay in the main list and remain reachable through the folder-specific “Uten mappe” sidebar filter.

### Header

- App name and short tagline
- Compact visible interface-language selector (NB/NN/EN)
- Microsoft 365 button when the deployment is configured (always available on localhost for test configuration)
- Theme cycle (system/light/dark)
- Trash with count badge
- “Ny tekst” primary action

### Sidebar (`sidebar.js`)

- School-year selector (`<select>`, Aug–Jul, auto-detects current year)
- "Siste dokumenter" — all/recent documents (default view)
- Collapsible folder tree with descendant counts, maximum depth 3; "+ Legg til mappe" inline input creates root-level folders
- Context menu on custom folders: rename, add subfolder (if depth < 3), delete
- "Uten mappe" (orphan documents, `folderIds.length === 0`, amber indicator when count > 0) and "Personlig mappe" (`folderIds` includes `sys___personal__`) filters
- "Tysk eksamenstrening" — navigates to `#/tysk` (German exam spinner)
- "Avsnittstrening" — navigates to `#/avsnitt` (three-step paragraph trainer)
- "Bytt trinn" — change school level button at the bottom, opens the onboarding modal (cancellable)
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

### Cleanup desk

- A document remains on the desk while its title is blank/whitespace or its folder list is empty
- Each card states “Mangler tittel”, “Mangler mappe”, or both; color is not the only signal
- Opening the document is the title-fixing path; missing folders have an explicit picker
- Each card has an explicit, confirmed soft-delete action; dragging to a folder or trash is an enhancement
- The count and contents come from all documents in the selected school year, independently of library search/folder filters
- Resolving the final item leaves a persistent green “Alt ryddig!” reward state instead of hiding the desk
- Actions are real keyboard-operable buttons, changes use a polite live announcement, and touch targets are at least 44 px

### Mobile

Below 768 px the sidebar becomes an overlay navigation drawer. The hamburger exposes `aria-expanded`/`aria-controls`; the background becomes inert while open; Escape, selection, or backdrop closes it and restores focus. Below 1024 px the cleanup desk becomes an expandable section above search and the canonical list; its all-tidy reward remains visible as a compact strip.

## Editor (`#/doc/{id}`)

```text
┌──────────────────────────────────────────────────────────┐
│ Back | local save | Structure | Review | German help (task only) | Leksihjelp | Microsoft 365 | Export │
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
| Structure | `frame-selector.js` | Level-grouped frame picker over all 17 genres; all frames remain available |
| Review | `insights-drawer.js` | Opens review/support actions |
| 💡 Help text | `german-hint-drawer.js` | German-task documents only; simple/richer Norwegian prompt support |
| 📚 Leksihjelp | app Leksihjelp modules | Dictionary/settings, or guidance to the installed extension panel |
| Microsoft 365 | `microsoft-storage-dialog.js` | Optional account/folder setup, link/sync state, unlink, and conflict-safe **Keep both** |
| Export | `text-export.js` | TXT, PDF, real `.docx` (an earlier draft of this row said "Word-compatible `.doc`" — that predates the real OOXML `.docx` export added by `docx-export.js`) |

**Advanced tools menu** (lazy-loaded review tools, opened from the Review drawer):

| Button | Module | Behavior |
|---|---|---|
| Ordspinner | `writing-spinner.js` | Shows random word suggestion |
| Gjentakelse | `word-frequency.js` | Toggles repetition highlighting |
| Setningslengde | `sentence-length.js` | Toggles rhythm bar visualization |
| Avsnittskart | `paragraph-map.js` | Toggles document minimap |
| Tabell | `table-manager.js` | Opens table insertion dialog |
| Tilbakemelding | `writing-feedback.js` | Toggles local writing feedback panel |
| Versjonshistorikk | `version-history.js` | Toggles saved snapshot timeline |
| LIX | `lix-score.js` | Toggles readability score panel |
| Argumentflyt | `argument-flow.js` | Toggles argument flow panel |
| Opplesing | `read-aloud.js` | Toggles read-aloud control bar (Web Speech API; block highlight + scroll-along; voice matched to the writing language) |
| Lesevisning | `reading-settings.js` | Toggles dyslexia-friendly display panel (font, size, line/letter spacing) |

**Editor accessibility (no button):** `editor-lang.js` keeps the contenteditable's `lang` attribute in sync with the writing language and turns the native `spellcheck` off while Leksihjelp owns spell-checking.

Local save status is a polite live region. Offline status says the text is saved locally in the browser profile. Microsoft status is separate: a delayed, denied, signed-out, missing, or conflicting remote copy never changes the local-saved message or blocks typing/navigation.

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

### Optional Microsoft 365 dialog

The connector appears when enabled by valid client ID, tenant ID, and bare SharePoint-host metadata, except on localhost where the dialog provides session-only test configuration. A document that already contains local Microsoft metadata keeps its editor button if deployment configuration is removed, so local opt-out never disappears. Local writing remains usable when the connector is absent or disconnected.

- Sign-in is an explicit popup using the configured school tenant, delegated `Files.ReadWrite.All` for personal OneDrive and group-owned Teams/SharePoint files within the pupil's existing access, and the dedicated redirect page. Skriv auto-resumes only one unambiguous account; multiple cached pupils require popup selection. An expired token shows explicit reconnect. Disconnect clears the connector's MSAL app cache without claiming to end browser-wide Microsoft SSO.
- The student pastes one approved OneDrive or Teams/SharePoint folder link. Before Graph resolution and again on Graph's canonical result, Skriv accepts only credential-free HTTPS URLs on the configured `<tenant>.sharepoint.com` host or its matching `<tenant>-my.sharepoint.com` companion. It uses Graph's request-scoped sharing-link redemption when necessary, resolves the link to a drive/folder target for the session, and does not browse or enumerate Teams and channels.
- From the library, the dialog lists only `.skriv` files in that folder, bounded to five Graph pages and 200 files. Import uses strict UTF-8 and validation, keeps current school year, clears foreign organization, and enters **Uten mappe**/cleanup desk. Importing the same active item opens its existing local record; an identity in trash must be restored rather than aliased.
- From the editor, the first explicit link creates one native `.skriv` remote file. Merely connecting, selecting a folder, or firing a stale background timer never opts a local-only document in. Later local saves schedule a non-blocking 2.5-second sync only for already linked documents; unchanged hashes skip upload and later syncs update the same drive item with the upload acknowledgement's eTag. An edit or explicit sync during an in-flight upload queues one follow-up pass. Route teardown first flushes the authoritative local save, then starts one fire-and-forget, existing-link-only final pass before releasing the controller; navigation never waits for Graph.
- Graph `409 Conflict` and `412 Precondition Failed` become visible conflicts. **Keep both** creates a separately named remote copy and relinks this local document; Skriv never silently forces an overwrite.
- Stop syncing atomically clears the local link and wins over in-flight acknowledgements or stale timers. It is shown before configuration/account/target prerequisites, so the pupil never signs in or reselects a folder to revoke local sync consent. Local trash/delete and disconnect keep the Microsoft file; remote deletion is not offered.
- Native remote `.skriv` files are not Word documents, live Office co-authoring, Teams tabs, or Assignment submissions.

## Export flow

All three exports open a non-blocking self-check dialog. The student may continue regardless of warnings.

- TXT: UTF-8 text with title/date/word count.
- PDF: locally vendored jsPDF.
- Word: a real OOXML `.docx` file built by `docx-export.js` from the vendored `docx` 9.5.0 library (lazy-loaded classic script), not a renamed HTML `.doc`. An earlier draft of this note described a Word-compatible `.doc` fallback; that predates the real `.docx` export.

## PWA behavior

- Installable from `manifest.json`.
- A fully cached release works offline.
- New releases wait behind an explicit update bar; accepting awaits editor save hooks before activation/reload.
- Core release files are served cache-first from one versioned cache to avoid mixing releases.
- The MSAL redirect page/bridge are network-only exceptions and therefore unavailable offline; hosting serves both with `Cache-Control: no-store` and no `Cross-Origin-Opener-Policy` header.
