# Skriveramme tool rework — design

Date: 2026-05-04
Module: `public/js/editor-core/student/frame-guide.js` (+ supporting modules)

## Problem

Four issues with the current writing-frame guide:

1. **Insertion bug.** Sentence starters and "Merk som ferdig" dividers are inserted at the top of the document instead of at the student's current writing position. Root cause: `insertStarter`/`insertDivider` call `editor.focus()` without restoring the editor's last selection, so the caret resets to the editor start.
2. **Single-paragraph sections.** Sections are treated as one paragraph each. A student writing the body of an analysis can't extend Tolkning to multiple paragraphs without leaving the frame structure.
3. **Markers only appear after "Ferdig".** In-text section dividers are inserted only when a section is marked complete. While writing, students can't see where they are in the structure.
4. **Limited starter variation.** Each frame section/subsection ships with 1–2 prompts. Students reuse the same openings; the existing word-spinner's larger pool isn't reachable from inside the frame.

## Solution overview

Rework the frame guide around an **eagerly-scaffolded** editor model: when a frame is applied, all section markers (and default paragraph slots within each section) are inserted into the editor up front and remain visible while the guide is open. "Merk som ferdig" toggles a state attribute on the existing marker. A "+ Nytt avsnitt" action adds extra paragraph slots within a section. The writing-spinner's word bank becomes reachable per-section through a "🎲 Flere forslag" affordance.

Both the standalone spinner and the frame guide remain independently usable.

## Components

### 1. Selection preservation (bug fix)

Add a `lastRange` capture in `frame-guide.js`:

- A `selectionchange` listener on `document` updates `lastRange` only while the active selection is anchored inside `editor`.
- Before any insertion (`insertStarter`, "+ Nytt avsnitt", spinner-generated starter), restore `lastRange` after `editor.focus()` so `execCommand('insertText')` lands at the right caret position.
- For starter clicks: if `lastRange` is in a *different* section than the starter belongs to, place the caret at the end of that starter's section (just before the next section marker) before inserting. This handles "I'm in Analyse but click an Innledning starter" without surprising the student.

Tracked range survives normal click-and-blur cycles. If no range was ever captured (fresh document, never focused), default to end-of-section for the starter's section.

### 2. Eager section scaffold

When `applyFrame(data, type)` runs and the editor contains **no** existing `.skriv-frame-divider` elements, scaffold the structure:

For each section, in order, insert:

```html
<div class="skriv-frame-divider section-marker"
     contenteditable="false"
     data-section-index="{i}"
     data-paragraph-index="0"
     data-completed="false">
  <span class="frame-divider-label">{label}</span>
</div>
<p><br></p>     <!-- one writable slot -->
<!-- ...repeat <p><br></p> + sub-marker per additional default slot... -->
```

`removeFrame()` continues to strip every `.skriv-frame-divider`. The trailing empty `<p>` slots are left in place (they're valid editor content; the document save layer can compact them on its own terms).

#### Slot count rule (default 3 in body sections)

- First section in `frameData.sections`: 1 slot.
- Last section: 1 slot.
- All sections in between (`hoveddel`): 3 slots, **except** sections that declare their own subsections — those use `subsections.length` slots instead, so labels can map 1:1 (analyse.md's `Analyse` has 3 subsections → 3 slots, naturally aligned).

#### Marker labels

- Single-slot section: marker label is the section title (e.g. "Innledning").
- Multi-slot section, paragraph index N (zero-based):
  - If the section has subsections and `N < subsections.length`: label is `"{section.title} — {subsection[N].title}"` (e.g. "Analyse — Virkemidler").
  - Otherwise: label is `"{section.title} — avsnitt {N+1}"` (e.g. "Tolkning — avsnitt 1").

Subsection-derived labels apply only to the *initial* default slots. New paragraphs added via "+ Nytt avsnitt" use generic numbering with their **own counter**, independent of the subsection slots. So a 3-subsection Analyse with two added paragraphs reads:

> Analyse — Oppbygging og struktur
> Analyse — Virkemidler
> Analyse — Tematikk
> Analyse — avsnitt 1
> Analyse — avsnitt 2

This keeps the subsection-driven labels stable and lets students add extra body paragraphs without renumbering breaking their meaning.

#### Section-completed visual

`data-completed="true"` toggles an `.is-completed` class on the section marker. Sub-paragraph markers inherit visual completion from their parent section via CSS (`.section-marker[data-completed="true"] ~ .skriv-frame-divider[data-section-index="{i}"]`). Crossing-out moves from the *sidebar list item* to the *in-text marker*.

### 3. "Merk som ferdig" → toggle, not insert

`doneBtn` click handler updates state:

- `state.completed = !state.completed`
- Find the section's primary marker via `[data-section-index="{i}"][data-paragraph-index="0"]`, set `data-completed`, and toggle the `.is-completed` class.
- On marking complete, collapse the section in the sidebar and auto-expand the next incomplete section (current behavior).

No DOM nodes are inserted or removed — eliminating the second symptom of the caret bug entirely for this action.

### 4. "+ Nytt avsnitt" button

A second button below "Merk som ferdig" in each expanded section's sidebar content. Visible only while the section is not marked complete. Click handler:

1. Compute next paragraph index for the section: max existing `data-paragraph-index` in editor for this section + 1.
2. Build a new sub-marker with class `paragraph-marker`, label `"{section.title} — avsnitt {n+1}"`, attributes `data-section-index="{i}"` and `data-paragraph-index="{n}"`.
3. Find the next section's primary marker. Insert sub-marker + `<p><br></p>` immediately *before* it. If no next section, append to editor.
4. Place caret in the new empty paragraph and focus the editor.

"+ Nytt avsnitt" tracks its own counter per section (separate from subsection-derived slots) so added paragraphs are labeled "avsnitt 1", "avsnitt 2", … starting at 1 regardless of how many subsection-named slots came before. Implementation: counter is `1 + (count of paragraph markers in this section whose label starts with "{section.title} — avsnitt ")`.

### 5. Spinner integration

#### Bucket-mapping rule (hybrid)

For each section/subsection in the frame data, compute a spinner bucket key:

1. **Override:** if the markdown declares `spinner: <bucket>` directly under the heading, use it.
2. **Subsection name match** (case-insensitive substring) — applies only at subsection level:
   - matches "virkemiddel" or "virkemidler" → `verkemiddel`
   - matches "tolkning" or "tematikk" → `tolkning`
3. **Inherit from parent** if subsection has no explicit/derived bucket.
4. **Position default** at section level:
   - index 0 → `innledning`
   - index `length - 1` → `avslutning`
   - everything else → `hoveddel`

Mapping for analyse.md with no markdown edits:

| Heading                                | Bucket        |
|----------------------------------------|---------------|
| Innledning                             | innledning    |
| Analyse (parent)                       | hoveddel      |
| Analyse → Oppbygging og struktur       | hoveddel      |
| Analyse → Virkemidler                  | verkemiddel   |
| Analyse → Tematikk                     | tolkning      |
| Tolkning                               | tolkning      |
| Avslutning                             | avslutning    |

Implementation lives in `frame-parser.js` (compute bucket alongside title/instruction/prompts during parse) so the rest of the system reads `section.spinnerBucket` / `subsection.spinnerBucket` directly. The parser is extended to read a `spinner: <bucket>` line wherever an instruction or prompt line could appear.

#### Sidebar UI

Beneath each section's and subsection's existing prompts, add a single small button: **🎲 Flere forslag**.

Click handler:

1. Look up the spinner bucket for that section/subsection. Look up `frameType` (genre key) and current school level via `options.getLevel`/`options.getActiveFrame`.
2. Pull a random starter from `starters[frameType][level][bucket]` that hasn't already been used in the *current sidebar render* (track in-memory per-section).
3. Append a new starter button below the existing ones, animating in with the spinner's `scrambleReveal`.
4. The new starter behaves identically to a markdown-declared one — clicking it inserts at the preserved caret position.

If the bucket has no remaining unused starters, briefly disable the button with a "Ingen flere forslag" tooltip until next render.

Generated starters are stored in-memory on `sectionStates[i].spinnerStarters` (and per subsection on a parallel structure), so re-renders triggered by toggling/expanding sections preserve them. They are **not** persisted to the document — closing and reopening the frame guide regenerates a fresh, empty pool. This keeps the frame markdown as the single source of truth for *base* prompts and lets the spinner act as an unlimited supplement pool.

If `frameType` has no entry in the spinner data (e.g. a future frame), the "🎲 Flere forslag" button is hidden for that section.

#### Module wiring

`initFrameGuide` gains two new options, mirroring `initWritingSpinner`:

- `getLevel: () => 'us' | 'vgs'` — required for spinner integration; if absent, button is hidden.
- The frame guide imports the spinner's `loadWordBank` (extracted to a small shared helper if it isn't already exported) so the two features share one cached word-bank load per language.

Standalone `initWritingSpinner` is unchanged.

### 6. Rehydration

`rehydrate()` is updated to handle two cases:

- **Eager scaffold present** (any marker has `data-paragraph-index`): read all markers, derive `sectionStates[i].completed` from the section marker's `data-completed`, and from the set of paragraph markers compute each section's slot count for relabel purposes. No re-scaffolding.
- **Legacy doc** (markers exist without `data-paragraph-index`): treat each as a completed section marker (current behavior). Don't retroactively scaffold — the document was authored under the old model and has student writing in it; we don't insert fresh markers around existing prose.

`applyFrame` inserts the scaffold only when the editor has zero `.skriv-frame-divider` nodes, preventing duplicate scaffolding on re-application.

### 7. i18n

New keys (added to `nb`, `nn`, `en`):

- `frameGuideMarkDone` — "Merk som ferdig" / "Merk som ferdig" / "Mark as done"
- `frameGuideMarkDoneActive` — "✓ Ferdig" / "✓ Ferdig" / "✓ Done"
- `frameGuideAddParagraph` — "+ Nytt avsnitt" / "+ Nytt avsnitt" / "+ New paragraph"
- `frameGuideMoreSuggestions` — "🎲 Flere forslag" / "🎲 Fleire forslag" / "🎲 More suggestions"
- `frameGuideNoMoreSuggestions` — "Ingen flere forslag" / "Ingen fleire forslag" / "No more suggestions"
- `frameGuideParagraphSuffix` — "{section} — avsnitt {n}" / "{section} — avsnitt {n}" / "{section} — paragraph {n}"

The hardcoded `'Merk som ferdig'`/`'✓ Ferdig'` in `frame-guide.js` move to `t()`.

### 8. CSS additions

- `.skriv-frame-divider.section-marker[data-completed="true"]` — strikethrough label, opacity reduction.
- `.skriv-frame-divider.paragraph-marker .frame-divider-label` — slightly smaller font, lighter color, distinguishes from section markers.
- `.frame-guide-add-paragraph-btn` — same dashed-border style as `.frame-guide-done-btn` for visual coherence; smaller/secondary.
- `.frame-guide-spinner-btn` — small text button under prompts; matches existing `.frame-guide-starter` palette but with a play/dice glyph and lighter background.

## Out of scope

- Migrating existing partially-written legacy documents into the eager-scaffold model. Legacy docs keep working; only new frame applications get scaffolding.
- Persisting spinner-generated starters in the frame markdown.
- Adding a "remove paragraph" affordance for accidentally-added "+ Nytt avsnitt" slots. The student can delete the marker manually for now; a Phase 2 button can be added later if needed.
- Adding `spinner:` overrides to existing frame markdown files. The position-based default already maps analyse.md correctly.

## Files changed

- `public/js/editor-core/student/frame-guide.js` — primary rework: scaffold, selection preservation, paragraph adding, spinner button, i18n.
- `public/js/editor-core/student/frame-parser.js` — parse `spinner: <bucket>` lines; compute default bucket per section/subsection.
- `public/js/editor-core/locales/{nb,nn,en}.js` — new i18n keys.
- `specs/MODULES.md` — note the model change in the `frame-guide` row (new options, new dependency on spinner data).

No new files. No new IndexedDB or localStorage keys. No `sw.js` cache list change.

## Open questions

None at design time. Implementation plan to follow.
