# German Exam Spinner — Design

**Status:** Proof of concept
**Date:** 2026-05-04
**Owner:** geirjr

## Goal

Give German learners a low-friction way to practise writing tasks from real Udir eksamensoppgaver. Student picks **Tysk 1** or **Tysk 2**, spins, and lands on a randomised exam writing task. Optionally reveals a simple-Norwegian model answer to translate into German. Where the original Udir task includes an image that is part of the task, we reproduce it as inline SVG so the feature stays fully offline.

This is a **proof of concept**: ship the mechanism with a small seed corpus (5–10 tasks per level), prove the format, expand later.

## Non-goals (explicit YAGNI)

- Filters (year/theme), tagging
- Nynorsk model answers
- Multiple model-answer formats (outline / sentence-by-sentence)
- Locked/protected prompt blocks in the editor
- Tracking which tasks the student completed
- Inline German grammar help, vocabulary lookups
- Sharing/export of completed answers
- Audio/listening tasks
- Teacher-side task editor / task authoring UI

## Architecture

New feature, isolated per project rules:

```
public/js/editor-core/student/
  german-exam-spinner.js       # spinner UI + deck logic + post-spin flow trigger
  german-exam-data.js          # task corpus (seed: 5–10 per level)
  german-exam-svg/
    bildbeschreibung-01.js     # exports default '<svg>…</svg>' (one file per image)
    …
public/js/app/
  german-exam-route.js         # route handler, sidebar entry, screen wiring
```

- `german-exam-spinner.js` is the standalone, portable feature module. It follows the standard init/destroy lifecycle and returns `{ destroy, … }`. It must work standalone when copied into Skriveprove. It does NOT import from `app/`.
- `german-exam-route.js` lives in `app/` because it wires the spinner into this app's routing/sidebar — that wiring is app-specific.
- Data is plain JS modules (matching the existing `spinner-data-nb.js`/`spinner-data-nn.js` pattern). SVG strings live in their own files under `german-exam-svg/` so they load lazily only when the task that needs them is shown.

### Dependency direction

```
app/german-exam-route.js
  └─→ editor-core/student/german-exam-spinner.js
        ├─→ editor-core/student/german-exam-data.js
        │     └─→ (lazy) editor-core/student/german-exam-svg/*.js
        ├─→ editor-core/shared/i18n.js
        └─→ editor-core/student/folder-store.js, document-store.js
              (used via spinner's post-spin callback — see below)
```

To preserve `editor-core/student/`'s portability, the spinner does not directly create documents. Instead it exposes an `onPickTask(task)` callback that the route handler implements, calling `folder-store` and `document-store` from the app side. (folder-store and document-store currently live under `editor-core/student/` but are app-data modules — keeping the spinner free of them keeps the boundary clean for the Skriveprove copy.)

## Task data shape

```js
// german-exam-data.js
export const tasks = {
    'tysk-1': [
        {
            id: 'tysk1-v2023-2',          // stable id, used as deck key
            year: 2023,
            term: 'vår',                   // 'vår' | 'høst'
            part: 'Del 2 – Skriftlig produksjon',
            title: 'Mein Lieblingsfest',
            prompt: 'Schreibe einen Text…', // German task text, markdown allowed (paragraphs, lists)
            image: null,                   // null OR () => import('./german-exam-svg/xxx.js')
            modelAnswer: 'På norsk: …',    // simple bokmål paragraph, ~80–150 words
            attribution: 'Udir, Tysk 1, vår 2023',
        },
    ],
    'tysk-2': [ … ],
};
```

- `image` is a lazy-import function returning a promise resolving to `{ default: '<svg>…</svg>' }`. Loaded only when the task is rendered.
- `modelAnswer` is plain bokmål for PoC — no nynorsk variant yet.
- `attribution` is rendered as small print on the task card.

## Spinner screen

Reached via a new sidebar entry **"Tysk eksamenstrening"** placed below the existing document list section. Routing follows the same pattern as `standalone-writer`.

Layout, top to bottom:

1. **Level toggle** — segmented control: `[ Tysk 1 | Tysk 2 ]`. Persists choice in localStorage.
2. **Deck status** — `"3 av 8 oppgaver igjen"` with a small `↻ Stokk om` button.
3. **Spin button** — large, with the same scramble-reveal animation used by `writing-spinner.js` (visual consistency across the app's two spinners).
4. **Task card** (revealed after spin):
   - Attribution line, small print: `"Udir, Tysk 1, vår 2023"`
   - German prompt rendered as markdown (paragraphs, lists allowed)
   - Inline SVG image if `task.image` is non-null
   - Toggle: **"Vis forslag på enkel norsk"** → expands a collapsible block containing the Norwegian model answer paragraph
   - Primary button: **"Skriv svar"**

Empty deck state: spin button text becomes **"Stokk om og start på nytt"**; clicking it reshuffles all task ids for the current level.

## Deck logic

Per level, persisted in localStorage:

- Key: `papertek.skriv.germanExam.deck.tysk-1` (and `.tysk-2`)
- Value: JSON array of remaining task ids (shuffled, not yet seen)

Behaviour:

- On first ever spin for a level: seed deck = all task ids for that level, shuffled.
- On spin: pop the head id, look up the task, render it. Persist the shortened deck.
- When deck empties after a spin: spinner button switches to reshuffle mode.
- Switching level: independent deck per level. No cross-contamination.
- Tasks that have been seen are NOT tracked across reshuffles (PoC: simplicity over telemetry).

## Post-spin flow ("Skriv svar")

When the student clicks **Skriv svar** on a task card, the route handler (`app/german-exam-route.js`) runs the following:

1. Ensure a folder named **"Tysk"** exists at the top level of the student's document tree, using `folder-store.js`. Create it if missing.
2. Create a new document via `document-store.js`, parented to the "Tysk" folder, with:
   - **Title**: `"<level> – <term> <year> – <task title>"` (e.g. `"Tysk 1 – vår 2023 – Mein Lieblingsfest"`)
   - **Body** (single editable document, no protected blocks):
     - Heading: the task title
     - Attribution line as small print
     - The German prompt as paragraphs / lists
     - The inline SVG (if present)
     - A collapsible block containing the Norwegian model answer
     - A blank line / writing area below where the student starts writing
3. Navigate to the standalone-writer route with the newly created document loaded.

The prompt block is **editable** like the rest of the document. Locking individual blocks is a new editor concept we don't currently have, and out of scope for PoC. If a student deletes the prompt accidentally, they can re-spin and produce a new document.

The collapsible Norwegian-answer block uses the editor's existing rendering — if no native collapsible block exists, the simplest fallback is a heading like `"Forslag på enkel norsk (klikk for å vise/skjule)"` with the model answer beneath it, optionally inserted as already-collapsed using whatever block-folding mechanism the editor already has. **Implementation detail to resolve during planning**: confirm what collapsible primitives the existing editor exposes; pick the lightest one that works. If none, render the answer as plain content under a clearly labelled heading.

## i18n

All UI chrome strings go through `t('key')` with entries in nb, nn, and en:

- `germanExam.sidebar` — "Tysk eksamenstrening"
- `germanExam.level.tysk1` — "Tysk 1"
- `germanExam.level.tysk2` — "Tysk 2"
- `germanExam.deck.remaining` — "{n} av {total} oppgaver igjen"
- `germanExam.deck.reshuffle` — "Stokk om"
- `germanExam.deck.reshuffleAndRestart` — "Stokk om og start på nytt"
- `germanExam.spin` — "Spin"
- `germanExam.showModelAnswer` — "Vis forslag på enkel norsk"
- `germanExam.hideModelAnswer` — "Skjul forslag"
- `germanExam.writeAnswer` — "Skriv svar"
- `germanExam.modelAnswerHeading` — "Forslag på enkel norsk"
- `germanExam.folderName` — "Tysk"

Task content (German prompts, Norwegian model answers, attribution) is **not** translated — it is pedagogical content and lives verbatim in the data file.

## Spec updates required

Per `CLAUDE.md`:

- `specs/MODULES.md` — add `german-exam-spinner.js`, `german-exam-data.js`, `german-exam-route.js`, plus a note about `german-exam-svg/`
- `specs/DEPENDENCIES.md` — add nodes to the graph; document the SVG lazy-import edge
- `specs/UI-ROUTES.md` — add the new route and sidebar entry
- `specs/DATA-MODEL.md` — document `papertek.skriv.germanExam.deck.tysk-1` and `…tysk-2` localStorage keys
- `specs/ARCHITECTURE.md` — add the new directory `public/js/editor-core/student/german-exam-svg/`
- `sw.js` — add the new module files and SVG files to `ASSETS[]`; bump cache version

## Image-to-SVG workflow

For each Udir task that includes an image essential to the prompt:

1. Source image acquired from Udir (PDF or image asset).
2. Look at the image and hand-write SVG that reproduces its content (shapes, labels, arrows, comics, simple figures).
3. Save SVG as a single-export module under `german-exam-svg/<slug>.js`.
4. Wire the task's `image` field to the lazy import.

For PoC, expect 1–3 SVGs total. No auto-tracing — auto-traced output is unreadable for diagrams with text. Photographs are out of scope; if a writing task is photo-based, skip the task or describe the photo in text in the prompt.

## Seed corpus (PoC)

5–10 tasks per level. Pick from recent public Udir eksamensoppgaver (writing parts only — skip listening/reading). Tasks chosen during implementation; no need to lock the exact list at design time.

## Open questions resolved during brainstorming

- **Where it lives:** dedicated route, sidebar entry "Tysk eksamenstrening" (option B).
- **Corpus scope:** small seed (option D), grow over time.
- **Image strategy:** SVG only when image is part of the task; hand-written SVG by Claude, no auto-tracing.
- **Model-answer format:** single short bokmål paragraph (~80–150 words), option A.
- **Spin mechanic:** deck (no repeats until exhausted), option B; with scramble animation.
- **Post-spin:** opens standalone-writer with prompt + collapsible model answer pre-populated; auto-saved into a "Tysk" folder.
