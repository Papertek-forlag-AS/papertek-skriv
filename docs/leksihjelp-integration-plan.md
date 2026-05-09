# Leksihjelp Integration Plan

> Status: brainstorm → ready for phase planning
> Date: 2026-05-09
> Decision-makers: Geir
> Authoring agent: Claude Opus 4.7

## 1. Goal

Bring leksihjelp's **dictionary** and **spell-check** into Skriv as a built-in
baseline so every Skriv user gets word-lookup and per-language pedagogical
spell-check without installing the extension. Students who need the full
leksihjelp toolkit (TTS, word prediction, floating widget on every page,
side panel, premium voices, subscription) continue to install the extension.
When both are present on `skriv.papertek.app`, the extension wins — Skriv
suppresses its own copies so the student sees one dictionary and one
spell-check, not two.

## 2. Decisions already made

These were settled during brainstorming and lock the design space.

| Decision | Choice |
|----------|--------|
| Integration model | **Coexistence** — Skriv embeds a subset; extension stays a separate product |
| Skriv-embedded features | Dictionary (popup + word-click lookup) + spell-check |
| Extension-only features | TTS, word prediction, floating widget on non-Skriv pages, side panel, premium voices |
| Code source | **Vendor** the same files leksihjelp ships, via a sync script (mirror Lockdown's pattern) |
| Word-click trigger in Skriv | **Liberal (Option A)** — clicking any word opens the dictionary popup, just like the extension's right-click flow |
| Spell-check trigger in Skriv | **Auto-run** as the student types (matches extension default) |
| Vocab data loading | **Option 2** — lazy fetch from `papertek-vocabulary.vercel.app/api/vocab/v1/*`, cached in Skriv's IndexedDB. Requires CORS allowlist for `skriv.papertek.app` |
| Eksamensmodus when extension present | **Hide Skriv's panel** — extension's popup owns the setting (single source of truth, option C from the brainstorm) |
| Skrivespråk vs Oppslagsspråk | **Two independent settings** — same as the extension. Skrivespråk drives spell-check + special-chars; Oppslagsspråk drives dictionary |
| Special-chars panel | **Become passive** — `special-chars-panel.js` loses its "Annet språk?" pill and follows Skrivespråk |
| Mid-document language mixing | **Static Skrivespråk wins** — no per-input auto-detection in Skriv; rare quote cases are accepted as-is |

## 3. What stays unchanged in Skriv

Common confusion-point: leksihjelp does **word-level grammar/typo** (gender,
modal verbs, særskriving, å/og, dialect mixing). Skriv has a **discourse-level
writing coach** (`writing-feedback.js`) that flags passive voice, filler
words, paragraph length, sentence-start repetition, source citations. They
operate on different layers and both stay.

| Skriv module | Status after integration |
|--------------|--------------------------|
| `editor-core/student/writing-feedback.js` (Norwegian writing coach) | **Stays as-is** |
| `editor-core/student/special-chars-panel.js` | **Refactor** — keep the floating panel, drop the picker pill, add `setActiveLanguage(lang)` |
| `editor-core/student/lix-score.js`, `paragraph-map.js`, `argument-flow.js`, `word-frequency.js`, `sentence-length.js` | Stay as-is |
| `editor-core/student/german-hint-drawer.js`, German exam flow | Stays as-is |
| All frame guides, TOC, references, image manager, etc. | Stay as-is |

## 4. Architecture

### 4.1 Vendoring strategy

Mirror what `lockdown-adapter-contract.md` describes for the Lockdown app.

- New directory: `public/js/leksihjelp/` — mirrors the relevant subset of
  `extension/content/` and `extension/data/` from the leksihjelp repo.
- Sync script: `scripts/sync-leksihjelp.js` (Node) — reads from a sibling
  leksihjelp checkout (or a clone path provided via env var), copies the
  whitelisted files, runs basic shape checks, prints a summary. Manual,
  not on a cron — engineer runs it before bumping the cache version.
- Pinned version: a `LEKSIHJELP_VERSION` constant in the sync script + a
  marker file `public/js/leksihjelp/.version` so we can see at a glance
  which leksihjelp release Skriv is currently aligned with.

**Files to vendor (initial cut):**

```
public/js/leksihjelp/
├── i18n/strings.js                # Localised UI strings used by the modules below
├── content/
│   ├── vocab-store.js             # IndexedDB cache + Papertek API fetcher
│   ├── vocab-seam-core.js         # buildIndexes() — pure
│   ├── vocab-seam.js              # Hydration policy + window.__lexiVocab publisher
│   ├── lang-detect.js             # Per-input language auto-detection (used internally)
│   ├── spell-check-core.js        # Pure rule engine
│   ├── spell-check.js             # DOM adapter (renders dots, popovers)
│   └── spell-rules/               # All 80+ rule files, dropped in verbatim
├── popup/
│   ├── dict-state-builder.js      # Pure — builds the dictionary view-model from a vocab entry
│   └── grammar-features-section.js # Renders the Grammatikknivå checkboxes
├── styles/content.css             # Vendored extension CSS (scoped via classname prefix; needs review)
└── data/                          # Empty; vocab is fetched lazily into IndexedDB at runtime
```

**Files NOT vendored** (extension-only):
`background/*`, `popup/popup.{html,js}` (auth, Vipps, subscription),
`floating-widget.js`, `word-prediction.js`, anything `audio/*`.

### 4.2 Detection & suppression

Skriv decides on every editor mount whether to instantiate its own dictionary
+ spell-check or stand down for the extension.

```js
// pseudocode in standalone-writer.js, after editor init
const useExtension = await detectLeksihjelpExtension();
if (useExtension) {
    // Extension owns dictionary + spell-check on this page.
    // Skip Skriv's leksihjelp init. Don't render the leksihjelp settings panel.
} else {
    initSkrivLeksihjelp(editor, { storageKey: 'skriv.leksihjelp' });
}
```

`detectLeksihjelpExtension` — three signals, ANY positive result is enough:

1. `window.__lexiVocab` is present after a 200ms grace period.
2. The extension dispatches an `lexi:hydration` chrome.runtime message that
   leaks onto `window` via the seam's existing emitter (already happens).
3. Extension publishes a small `__lexiPresent` sentinel that Skriv polls for
   (request a one-line addition to leksihjelp's `vocab-seam.js` if not
   already there — cheap to ship).

Skriv also subscribes to late arrivals: if the extension is installed mid-
session, tear down Skriv's local instances and yield. Symmetric for "extension
paused" (Ctrl+Shift+P) — Skriv re-activates its built-ins.

### 4.3 Vocab loading (Option 2)

- First visit / cache miss: `vocab-store.js#fetchBundle(lang)` hits
  `https://papertek-vocabulary.vercel.app/api/vocab/v1/core/{lang}` with the
  semi-public `lk_*` API key, writes the bundle to Skriv's IndexedDB
  (`skriv-leksihjelp-vocab` — separate from `skriv-documents`).
- Subsequent visits: read from cache. Vocab-updater checks for newer
  revisions on a cadence (extension does daily; Skriv can do per-session).
- **Required server-side change:** add `https://skriv.papertek.app` (and
  any preview domains) to the Papertek Vocabulary API CORS allowlist. One
  config tweak in `papertek-vocabulary` repo.
- Norwegian baseline: ship `nb-baseline.json` (~130KB) bundled in
  `public/js/leksihjelp/data/` so Skriv has working spell-check for
  Norwegian even on first load with no network. All other languages
  hydrate lazily.

### 4.4 Settings panel (extension-not-present mode)

A new top-bar button in the editor — `📚 Leksihjelp` — opens a slim right-
side drawer (same pattern as the German `Hjelpetekst` drawer). Four controls:

| Control | Storage key | Drives | Default |
|---------|-------------|--------|---------|
| Eksamensmodus | `skriv.leksihjelp.examMode` | Surface gating per `exam-registry.js` | `false` |
| Skrivespråk | `skriv.leksihjelp.writingLang` | Spell-check + special-chars panel | `nb` |
| Oppslagsspråk | `skriv.leksihjelp.lookupLang` | Dictionary popup + word-click + conjugation | `nb` |
| Grammatikknivå | `skriv.leksihjelp.grammarFeatures.{lang}` (per language) | Which grammar elements render in dictionary results | All on |

When the extension is detected, the button is hidden entirely. Single source
of truth: extension's popup. If users later complain they want to change
settings from inside Skriv, revisit and add a two-way sync via
`externally_connectable` + `chrome.runtime.sendMessage` (Option B from the
brainstorm — small extension change, plus a Skriv update).

### 4.5 Per-document language hint

Some Skriv docs imply a writing language already:

- German exam docs (have `germanHint` metadata) → seed Skrivespråk + Oppslagsspråk to `de` on first open of that doc.
- Frame-based docs (analyse, droefting, kronikk on Norwegian frames) → leave defaults at nb/nn.

This is a soft seed only — if the student changes settings, their choice
sticks per-doc via a lightweight `langOverride` field on the document.

## 5. UX surfaces

### 5.1 Word-click dictionary popup (Option A — liberal)

- Single-click any word in the editor → small floating popup at the click
  point with translation, conjugation, gender/case (per Grammatikknivå).
- Esc closes; click outside closes.
- Visual: same card shape as extension popup — minimal Skriv-side restyle so
  students who use both have muscle-memory parity.
- Implementation: vendored `dict-state-builder.js` builds the view-model;
  Skriv-side renderer matches popup.css's existing card styles (vendored).

### 5.2 Spell-check inline marks (auto-run)

- Vendored `spell-check.js` runs on `editor` debounced (default 1000ms).
- Marks are anchored dots under flagged words; click → popover with rule
  explanation, suggested fix, "Lær mer".
- Same code as extension; the only Skriv-side concern is z-index against
  Skriv's existing panels (LIX, paragraph map, argument flow).

### 5.3 Special-chars panel (passive)

- `special-chars-panel.js` refactored:
  - Drop the "Annet språk?" pill UI (`prompt` button at line ~37).
  - Expose `setActiveLanguage(lang)` and a `destroy()` cleanup.
  - The floating panel renders chars based on the current Skrivespråk.
- nb/nn Skrivespråk → `æ ø å` (and capitalised variants).
- de → adds `ä ö ü ß`.
- es → adds `ñ á é í ó ú ü ¿ ¡`.
- fr → adds `à â ä é è ê ë î ï ô ù û ü ÿ ç œ æ`.

## 6. Phases (rough)

Each is a self-contained Skriv phase. Sequence is roughly dependency order;
some can parallel.

1. **Vocab pipe** — vendor `vocab-store.js` + `vocab-seam-core.js` +
   `vocab-seam.js`. Add CORS for `skriv.papertek.app` on the Vocab API.
   Bundle `nb-baseline.json`. Skriv publishes `window.__lexiVocab` for
   downstream modules. **No user-visible change yet.** ~1 day.
2. **Spell-check** — vendor `spell-check{,-core}.js` + `spell-rules/*` +
   `lang-detect.js`. Wire init in `standalone-writer.js`. CSS audit for
   z-index conflicts with existing panels. **User-visible:** dots appear
   under errors with educational popovers. ~2 days.
3. **Dictionary popup** — vendor `dict-state-builder.js`, build a Skriv-
   styled popup component, wire single-click handler on editor. **User-visible:**
   click any word → popup. ~1.5 days.
4. **Settings panel** — new `📚 Leksihjelp` top-bar button + slim drawer.
   Vendored `grammar-features-section.js` for Grammatikknivå checkboxes.
   localStorage persistence. ~1.5 days.
5. **Special-chars unification** — refactor `special-chars-panel.js`, drop
   the pill, hook into Skrivespråk. ~0.5 day.
6. **Extension detection + suppression** — `detectLeksihjelpExtension`,
   late-arrival listener, hide settings panel when extension present. Coordinate
   with leksihjelp team for a sentinel signal if needed. ~1 day.
7. **Per-document language seeding** — German exam docs auto-set de;
   `langOverride` field on documents; spec update. ~0.5 day.
8. **Sync script + version pinning** — `scripts/sync-leksihjelp.js`,
   `LEKSIHJELP_VERSION` constant, README on how to bump. ~1 day.
9. **QA + polish** — exam-mode wiring through to the registry, dark-mode
   pass on vendored CSS, accessibility (aria), keyboard shortcuts
   (Ctrl+Shift+D for lookup if no extension), edge cases (empty doc, very
   large doc). ~2-3 days.

**Ballpark: 11–13 days** of focused work for the first integrated cut.

## 7. Cross-repo coordination

Some changes need to land outside Skriv. Track in `docs/leksihjelp-integration-followups.md`
once we start.

| Change | Repo | Owner | Why |
|--------|------|-------|-----|
| Add `skriv.papertek.app` to Vocab API CORS allowlist | `papertek-vocabulary` | Geir | Required for Option 2 vocab loading |
| Optional: publish `__lexiPresent` sentinel from `vocab-seam.js` | `leksihjelp` | Geir | Cheap detection signal in addition to `__lexiVocab` |
| Optional later: `externally_connectable` for `skriv.papertek.app` | `leksihjelp` | Geir | Enables two-way settings sync if we decide to add it |

## 8. Open questions / deferred decisions

- **Premium TTS in Skriv** — out of scope for the MVP (TTS is extension-only).
  Revisit if students ask for read-aloud inside Skriv specifically.
- **Word prediction** — out of scope. Extension covers it on every site.
- **Extension's "exam mode" UAT policy** — when Skriv is in exam mode and
  user has the extension, do we *signal* to the extension via postMessage
  so its prediction etc. auto-suppress? Worth a small signal even though
  the extension owns the toggle, because exam-prep contexts are stronger
  in Skriv. Keep on the radar; not blocking.
- **Sidemål switching mid-document** — Skriv has nb/nn frames. Leksihjelp
  has bidirectional nb/nn. If a student switches Skrivespråk between nb
  and nn mid-doc, do we re-spell-check the whole doc? Probably yes; cheap
  given the existing debounce.
- **Storage cleanup** — Skriv's IndexedDB will grow with cached vocab
  bundles. Add a "Clear leksihjelp cache" button somewhere (admin pane?
  sidebar settings?) to nuke `skriv-leksihjelp-vocab` if a student gets
  into a weird state.

## 9. Risks

- **Vendoring drift.** Skriv falls behind leksihjelp's spell-rule
  improvements if the sync script isn't run regularly. Mitigation: include
  the version marker in the editor build; flag in CI if older than N
  weeks. Or simpler: a checklist item on every Skriv milestone.
- **CSS collisions.** Vendored `content.css` was designed to overlay
  arbitrary websites; some selectors may be too generic. Mitigation: scope
  the vendored CSS under a `.skriv-leksihjelp` parent class via a small
  build step in the sync script.
- **Detection false negatives.** If the extension fails to inject (e.g.
  Chrome's "site allowed" toggle is off), Skriv mounts its own version
  while the user thinks the extension is active. Acceptable — the student
  gets a working dictionary either way, just two slightly different ones
  if they later toggle the extension on. Worth a one-time toast: "Bruker
  Skriv sin innebygde leksihjelp" / "Bruker Leksihjelp-utvidelsen".
- **API key rotation.** The `lk_*` key is committed in leksihjelp; when
  it rotates we need to bump Skriv too. Sync script reads it; bumping
  is a one-line change. Document in CONVENTIONS.md.
- **Vocab API outage.** If the Vocab API goes down on first visit, Skriv
  has only nb-baseline available — German/Spanish/French students can't
  use dictionary or full spell-check until network is back. Document this
  failure mode; show a graceful fallback message ("Leksihjelp er ikke
  tilgjengelig akkurat nå").

## 10. Spec touch list

When implementing, these specs need updates per CLAUDE.md rules:

- `specs/ARCHITECTURE.md` — directory structure (add `public/js/leksihjelp/`),
  tech stack (note vendored module set + Vocab API as a runtime dependency),
  cache version note.
- `specs/MODULES.md` — entries for each vendored module + the new Skriv-
  side wrappers (settings panel, dictionary popup, detection).
- `specs/DEPENDENCIES.md` — new graph nodes for the vendored layer; note
  it's a sibling-tree under `public/js/leksihjelp/`, not under
  `editor-core/`.
- `specs/DATA-MODEL.md` — new IndexedDB store `skriv-leksihjelp-vocab`,
  new localStorage keys for settings, possibly new `langOverride` field
  on document records.
- `specs/UI-ROUTES.md` — new top-bar button (`📚 Leksihjelp`) in the
  editor.
- `specs/CONVENTIONS.md` — vendored-module rule (no edits in
  `public/js/leksihjelp/`; all changes go through the sync script).
- `sw.js` — new asset entries for vendored files; cache bump.

## 11. Out of scope for this plan

- Skriv-side login / Vipps integration (Skriv stays auth-free).
- Migrating Skriv's existing IndexedDB schema beyond adding a new store.
- Replacing `writing-feedback.js`, `special-chars-panel.js` rendering
  logic, or any non-leksihjelp Skriv module.
- Mobile / touch optimisation for the dictionary popup (Skriv is desktop-
  first; revisit if usage data shows mobile demand).

---

**Next step:** turn this into a phased plan in `.planning/phases/` (one
per section 6 item) and start with Phase 1 (Vocab pipe), since every
later phase depends on `window.__lexiVocab` being live.
