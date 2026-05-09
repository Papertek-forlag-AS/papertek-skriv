# Leksihjelp ↔ Skriv Integration — Cross-Repo Reference

> **Living document.** Source of truth lives in the Skriv repo
> (`papertek-skriv/docs/leksihjelp-integration.md`). The leksihjelp repo
> can link here rather than duplicate.
>
> **Status:** Skriv-side scaffolding landed; leksihjelp-side vendoring
> not started.
> **Last updated:** 2026-05-09
> **Stakeholders:** Geir (product owner), Skriv-side agent, leksihjelp-side agent.

## 1. The integration model in one paragraph

Skriv will embed a **subset** of leksihjelp — dictionary popup +
spell-check — as a built-in baseline. When the leksihjelp Chrome
extension is also installed on `skriv.papertek.app`, Skriv detects it
and **suppresses** its own copy so the extension owns dictionary +
spell-check (and adds TTS, word prediction, floating widget, side panel,
premium voices on top, as it does on every other site). Coexistence,
not integration of state. No shared IndexedDB, no shared auth.

## 2. Decisions (locked)

| Decision | Choice |
|----------|--------|
| Integration model | **Coexistence** — Skriv embeds a subset; extension stays a separate product |
| Skriv-embedded features | Dictionary (popup + word-click lookup) + spell-check |
| Extension-only features | TTS, word prediction, floating widget on non-Skriv pages, side panel, premium voices |
| Code source | **Vendor** identical files into Skriv via a sync script |
| Word-click trigger in Skriv | **Liberal** — clicking any word opens the dictionary popup |
| Spell-check trigger in Skriv | **Auto-run** as the student types (matches extension default) |
| Vocab data loading | **Lazy fetch** from `papertek-vocabulary.vercel.app/api/vocab/v1/*`, cached in Skriv's IndexedDB |
| Eksamensmodus when extension present | **Hide Skriv's settings panel** — extension's popup owns the setting (single source of truth) |
| Skrivespråk vs Oppslagsspråk | **Two independent settings** in Skriv's panel, mirroring the extension |
| Special-chars panel | **Passive** — `special-chars-panel.js` follows Skrivespråk; no separate "Annet språk?" picker |
| Mid-document language mixing | **Static Skrivespråk wins** — no per-input auto-detection in Skriv |
| Restore point | Tag `pre-leksihjelp-integration` in Skriv repo (commit `eedf185`) |

## 3. The seam contract — what Skriv consumes, what leksihjelp publishes

This is the API surface both repos commit to.

### 3.1 What leksihjelp publishes on `window`

When leksihjelp's vendored modules execute on the page (loaded by Skriv
via `<script>` tags in `index.html`, OR injected by the extension as a
content script), they publish:

| Surface | Owner | Used by Skriv to… |
|---------|-------|-------------------|
| `window.__lexiVocabCore` | `vocab-seam-core.js` | Build per-language indexes for spell-check + word-prediction |
| `window.__lexiVocab` | `vocab-seam.js` | Read live indexes after hydration; the *single* surface every consumer (spell-check, dictionary, special-chars driver) reads |
| `window.__lexiSpellCore` | `spell-check-core.js` | Pure rule engine consumed by `spell-check.js` |
| `window.__lexiSpellRules` | each rule file in `spell-rules/` | Self-registering array of rule objects |
| `window.__lexiI18n` | `i18n/strings.js` | UI strings (NB, NN, EN) for popovers and the dictionary popup |
| `window.__lexiExamRegistry` | `exam-registry.js` | Surface-gating policy — which features are exam-safe |

The wrapper object on `window.__lexiVocab` exposes (per
`vocab-seam-core.js :: buildIndexes()`):

```js
{
    wordList:         Array<{word, type, ...}>,    // for word prediction
    validWords:       Set<string>,                  // spell-check known-good
    verbInfinitive:   Map<string, string>,
    nounGenus:        Map<string, string>,
    compoundNouns:    Map<string, object>,
    typoFix:          Map<string, string>,
    freq:             Map<string, number>,          // Zipf
    sisterValidWords: Set<string>,                  // NB/NN cross-dialect
    registerWords:    Map<string, object>,
    collocations:     Array<object>,
    redundancyPhrases: Array<object>,
    bigrams:          Map<string, number>,
    pitfalls:         object,
    isFeatureEnabled: function(id) -> boolean,      // Grammatikknivå gate
}
```

### 3.2 What Skriv publishes back to leksihjelp

For the seam to behave correctly inside Skriv (no extension), the
vendored `vocab-store.js` will need to read/write through Skriv's
IndexedDB rather than the extension's. The contract gives leksihjelp
three options for the cache adapter:

```js
vocabStore.getCachedBundle(lang)   // async (lang) -> {schema_version, revision, payload} | null
vocabStore.putCachedBundle(lang, entry)
vocabStore.fetchBundle(lang, opts)
vocabStore.getCachedRevisions()
```

Skriv's wrapper does not need to override these — Skriv runs the
extension's exact `vocab-store.js`, which already targets a webapp-
compatible IndexedDB store name (`lexi-vocab`). Two stores will
coexist on the Skriv origin: `skriv-documents` (Skriv's existing data)
and `lexi-vocab` (the vendored cache).

### 3.3 Hydration messages

Skriv's bridge module listens for the existing `lexi:hydration` events
(`{lang, state: 'fetching' | 'ready' | 'error', revision?, reason?}`)
emitted by `vocab-seam.js` so Skriv can show a loading spinner / error
toast on first visit while the bundle downloads.

### 3.4 Detection from Skriv's side

Skriv's `leksihjelp-bridge.js` checks three signals to decide who owns
the dictionary + spell-check on the page (see Section 6 for the full
algorithm):

1. `window.__lexiVocab` present after a 200ms grace period.
2. A `lexi:hydration` event has been observed.
3. (Optional, depends on a small leksihjelp change) A
   `window.__lexiPresent === 'extension'` sentinel set by the extension's
   content script. If set, Skriv yields unconditionally. If absent and
   the seam is present anyway, Skriv assumes its own vendored copy
   loaded and runs normally.

The sentinel is the cleanest way to disambiguate "Skriv's own seam" from
"extension's injected seam". See Leksihjelp-side task **L-3** below.

## 4. Vendored file inventory

Files Skriv expects to find under `public/js/leksihjelp/`. The
**leksihjelp-side claude is responsible** for getting these into Skriv
via the sync script (Task **L-2**). All paths relative to the leksihjelp
repo's `extension/` directory, except where noted.

| Skriv path | Leksihjelp source | Notes |
|------------|-------------------|-------|
| `i18n/strings.js` | `i18n/strings.js` | UI strings, multi-language |
| `content/vocab-store.js` | `content/vocab-store.js` | IndexedDB cache + Vocab API fetcher |
| `content/vocab-seam-core.js` | `content/vocab-seam-core.js` | Pure index builder |
| `content/vocab-seam.js` | `content/vocab-seam.js` | Hydration policy, publishes `__lexiVocab` |
| `content/lang-detect.js` | `content/lang-detect.js` | Per-input language auto-detect |
| `content/spell-check-core.js` | `content/spell-check-core.js` | Pure rule engine |
| `content/spell-check.js` | `content/spell-check.js` | DOM adapter (dots, popovers) |
| `content/spell-rules/*.js` | `content/spell-rules/*.js` | All ~80 rule files, drop in verbatim |
| `popup/dict-state-builder.js` | `popup/dict-state-builder.js` | Pure — builds dictionary view-model |
| `popup/grammar-features-section.js` | `popup/grammar-features-section.js` | Renders Grammatikknivå checkboxes |
| `styles/content.css` | `styles/content.css` | Vendored CSS (must be scoped under a parent class — see L-2 below) |
| `data/nb-baseline.json` | `data/nb-baseline.json` | Norwegian baseline shipped for offline first-load |
| `exam-registry.js` | `exam-registry.js` | Surface-gating policy |

**Files NOT vendored** (extension-only): `background/*`, `popup/popup.html`,
`popup/popup.js` (auth + Vipps + subscription UI), `floating-widget.js`,
`word-prediction.js`, `audio/*`.

## 5. Leksihjelp-side tasks

Tasks owned by the leksihjelp repo. Each links a path back to Skriv's
expectations.

### L-1. Add `https://skriv.papertek.app` to the Vocab API CORS allowlist

**Where:** `Papertek-forlag-AS/papertek-vocabulary` repo (sibling of
leksihjelp).

**What:** the `/api/vocab/v1/*` endpoints currently allow the extension
origin and the leksihjelp.no domain. Add `skriv.papertek.app` and any
preview domains so Skriv can fetch bundles directly from
`papertek-vocabulary.vercel.app/api/vocab/v1/core/{lang}` without a
proxy.

**Done when:** a curl from `skriv.papertek.app` returns the bundle with
`Access-Control-Allow-Origin: https://skriv.papertek.app` (or `*` if
the policy permits).

### L-2. Write the sync script `scripts/sync-leksihjelp.js`

**Where:** the **Skriv** repo's `scripts/` directory — even though the
leksihjelp claude writes it, the script lives in Skriv (it's Skriv's
build step that pulls files in). Suggest: clone leksihjelp, parse the
`extension/manifest.json` for the version, `cp` the whitelisted file
list into `public/js/leksihjelp/`, write a `.version` marker.

**Required behaviour:**

1. Read `LEKSIHJELP_REPO_PATH` env var (defaults to a sibling
   `../leksihjelp` checkout).
2. Read leksihjelp's `extension/manifest.json` to extract `version`
   and the latest commit SHA from `git rev-parse HEAD` in that repo.
3. Copy the file list in §4 into `public/js/leksihjelp/`.
4. **Scope the CSS:** wrap every selector in `styles/content.css` under
   a `.skriv-leksihjelp` parent class to prevent collisions with Skriv's
   existing UI. (Trivial regex: prefix all selectors that aren't already
   inside a media query / keyframe.)
5. Strip or shim any `chrome.*` API calls that block in non-extension
   contexts. The seam's emission code already handles this gracefully
   (`if (typeof chrome !== 'undefined' && chrome.runtime…)`); but
   `service-worker.js` references in `vocab-store.js` need a quick scan.
6. Write `public/js/leksihjelp/.version` with the leksihjelp version +
   commit SHA + sync timestamp.
7. Print a summary table: which files copied, total bytes, version pin.

The Lockdown sync script (`scripts/sync-leksihjelp.js` in the Lockdown
codebase) is a working reference; mirror its shape if available.

**Done when:**

- Running the sync script populates `public/js/leksihjelp/` with all
  files in §4.
- `public/js/leksihjelp/.version` matches leksihjelp's manifest version.
- A `<script src="/js/leksihjelp/content/vocab-seam.js">` loaded in
  Skriv publishes `window.__lexiVocab` after hydration.

### L-3. Publish a `__lexiPresent` sentinel in the extension

**Where:** `Papertek-forlag-AS/leksihjelp` repo,
`extension/content/vocab-seam.js` (or earliest content script that runs).

**What:** a one-line addition like:

```js
self.__lexiPresent = 'extension';
```

This lets Skriv's bridge cleanly distinguish "extension is injecting on
this page" from "Skriv's own vendored seam is running". Without it,
Skriv has to fall back to heuristics.

**Done when:** opening DevTools on any page with the extension active
shows `window.__lexiPresent === 'extension'`.

### L-4. (Optional, deferred) Allow Skriv to push settings via `externally_connectable`

**Where:** `Papertek-forlag-AS/leksihjelp` repo, `extension/manifest.json`
+ `background/service-worker.js`.

**What:** add `"externally_connectable": { "matches": ["https://skriv.papertek.app/*"] }`
and a message handler so Skriv can push setting changes (Eksamensmodus,
target language, grammar features) to the extension and have them sync
back. Initially OUT OF SCOPE — Skriv's first cut hides its own settings
panel when the extension is detected (single source of truth, extension
owns it). Revisit only if users complain.

**Done when:** N/A — deferred.

### L-5. (Optional) Update leksihjelp docs to point to this file

**Where:** `Papertek-forlag-AS/leksihjelp` repo,
`.planning/lockdown-adapter-contract.md` or a new
`.planning/skriv-adapter-contract.md`.

**What:** a short pointer doc that says "Skriv consumes the same seam
as Lockdown; see [skriv repo URL]/docs/leksihjelp-integration.md".

## 6. Skriv-side tasks

State after the current commit:

### S-1. ✅ Plan + restore point

- Tag `pre-leksihjelp-integration` at commit `eedf185`.
- This document.

### S-2. ✅ Bridge module — `public/js/app/leksihjelp-bridge.js`

Detects whether leksihjelp is "live" on the page and, if so, who owns
it (extension vs Skriv's own vendored copy). Brokers the active
Skrivespråk to consumers (special-chars panel, future spell-check).

Contract:

```js
import { initLeksihjelpBridge } from './leksihjelp-bridge.js';
const bridge = initLeksihjelpBridge();
bridge.getStatus(); // 'absent' | 'extension' | 'embedded'
bridge.onStatusChange(fn);
bridge.getWritingLang(); // 'nb' | 'nn' | 'de' | 'en' | 'es' | 'fr'
bridge.setWritingLang(lang); // only valid in 'absent' or 'embedded' status
bridge.onWritingLangChange(fn);
bridge.getLookupLang();
bridge.setLookupLang(lang);
bridge.getExamMode(); // boolean
bridge.setExamMode(on);
```

In **`absent`** status, settings persist in localStorage. In
**`embedded`**, settings persist in localStorage AND drive the vendored
seam. In **`extension`**, getters proxy to the extension (read-only for
now; setters become no-ops with a console warning).

### S-3. ✅ Settings panel — `public/js/app/leksihjelp-settings.js`

Slim slide-in drawer triggered by a `📚 Leksihjelp` top-bar button in
the editor. Four controls (Eksamensmodus, Skrivespråk, Oppslagsspråk,
Grammatikknivå). The Grammatikknivå section is a placeholder until the
vendored `grammar-features-section.js` arrives.

Hidden entirely when bridge status is `extension`.

### S-4. ✅ Top-bar button + drawer mount in `standalone-writer.js`

Renders the `📚 Leksihjelp` button between Hjelpetekst (when present)
and Verktøy. Visibility tracks `bridge.getStatus()`.

### S-5. ✅ Refactor `special-chars-panel.js` to be passive

- Drops the "Annet språk?" pill UI.
- Exposes `setActiveLanguage(lang)` and `destroy()`.
- Initial language comes from `bridge.getWritingLang()`.
- Updates whenever `bridge.onWritingLangChange` fires.

### S-6. ✅ Vendored bundle wired into Skriv

Once the leksihjelp claude completed L-2 (sync script + initial vendor)
and L-3 (`__lexiPresent` sentinel guarded on `chrome.runtime.id`):

- `public/js/leksihjelp-loader.js` provides a minimal `chrome.runtime` /
  `chrome.storage` shim so the vendored content scripts run in Skriv's
  plain-page context. `bindBridge(api)` keeps `lang.spellcheck` /
  `lang.dictionary` / `examMode` in lockstep with the bridge.
- `index.html` loads the bundle in dependency order: loader → i18n →
  exam-registry → vocab seam → spell-check core → 78 rules → lang-detect
  → engines → renderer → popup helpers. Loader runs BEFORE every
  vendored module so the shim is already in place. `<main id="app">`
  is wrapped with `class="skriv-leksihjelp"` so the scoped CSS applies.
- `sw.js` cache bumped to `skriv-v55`. Vendored paths live in a separate
  `LEKSIHJELP_ASSETS[]` precached **best-effort** (individual misses don't
  block install — the existing fetch handler lazy-caches anything missed
  on first hit). Keeps Skriv resilient to vendoring drift.
- L-1 was dropped (Phase 40.2 made vocab bundle-only — no Vocab API
  fetch at runtime). See `docs/leksihjelp-integration-handoff.md`.

### S-7. ⏳ Spell-check inline marks (next phase)

Once vendored files exist:

- Wire `spell-check.js` into the editor lifecycle.
- CSS audit for z-index conflicts with LIX, paragraph map, argument flow.
- Verify the popovers render correctly in Skriv's typography.

### S-8. ⏳ Dictionary popup (next phase)

- Skriv-styled popup component using vendored `dict-state-builder.js`.
- Single-click handler on words in the editor → popup at click point.

### S-9. ⏳ Per-document language seeding

- German exam docs (have `germanHint`) → seed `bridge.setWritingLang('de')` + `setLookupLang('de')` on first open.
- Other docs default to `nb` / `nn` based on the active document language.
- Soft seed only; user changes persist per-document.

## 7. Storage keys

### localStorage

| Key | Type | Used by | Purpose |
|-----|------|---------|---------|
| `skriv.leksihjelp.writingLang` | string | bridge | Spell-check + special-chars target |
| `skriv.leksihjelp.lookupLang` | string | bridge | Dictionary target |
| `skriv.leksihjelp.examMode` | string ('1' or '') | bridge | Eksamensmodus toggle |
| `skriv.leksihjelp.grammarFeatures.{lang}` | JSON | settings panel | Per-language grammar feature checkbox state |
| `skriv.leksihjelp.settingsSeen` | string | settings panel | One-time onboarding flag |

### IndexedDB

| DB name | Owner | Purpose |
|---------|-------|---------|
| `skriv-documents` | Existing Skriv module | Documents, folders, trash (unchanged) |
| `lexi-vocab` | Vendored `vocab-store.js` | Vocab bundle cache per language |

## 8. UI surfaces in Skriv (post-integration)

| Surface | Where | Trigger | Visible when |
|---------|-------|---------|--------------|
| `📚 Leksihjelp` button | Editor top bar | Click → opens settings drawer | Always (drawer hides when status === 'extension') |
| Settings drawer | Slide-in right panel | Triggered by button | Status ∈ {'absent', 'embedded'} |
| Dictionary popup | Floating, anchored to clicked word | Click any word in editor | Status ∈ {'embedded', 'extension'} (extension renders its own) |
| Spell-check dots | Inline under words | Auto, debounced | Status ∈ {'embedded', 'extension'} |
| Special-chars floating panel | Bottom of editor | Auto-shows when Skrivespråk requires foreign chars | Always (driven by bridge.writingLang) |

## 9. Risks & open questions

- **Vendoring drift.** Skriv falls behind leksihjelp's spell-rule
  improvements if the sync script isn't run regularly. Mitigation:
  include the leksihjelp version marker in Skriv's editor (e.g. footer
  info), flag in CI if older than N weeks.
- **CSS collisions.** Vendored `content.css` was designed to overlay
  arbitrary websites; some selectors may be too generic for Skriv.
  Mitigation: the sync script wraps everything under a
  `.skriv-leksihjelp` parent class (Task L-2.4). If that's too coarse,
  fall back to BEM-prefixing each rule.
- **Detection false negatives.** If the extension fails to inject
  (Chrome's "site allowed" toggle is off), Skriv mounts its own version
  while the user thinks the extension is active. Acceptable — they get
  a working dictionary either way. Worth a one-time toast for
  transparency: "Bruker Skriv sin innebygde leksihjelp" /
  "Bruker Leksihjelp-utvidelsen".
- **API key rotation.** The `lk_*` Vocab API key is committed in
  leksihjelp; when it rotates, Skriv needs to bump too. Sync script
  reads it; bumping is automatic.
- **Vocab API outage.** If `papertek-vocabulary.vercel.app` goes down
  on first visit, Skriv has only `nb-baseline.json` available — German
  / Spanish / French students can't use dictionary or full spell-check
  until network is back. Show a graceful fallback message.
- **Schema-version mismatch.** If leksihjelp ships a new vocab schema
  before Skriv re-syncs, the seam emits `state: 'error'`. Skriv should
  surface this as "Leksihjelp må oppdateres — kontakt skoleadmin"
  rather than silently failing.

## 10. Out of scope

- Skriv-side login / Vipps integration (Skriv stays auth-free).
- Premium TTS in Skriv (extension only).
- Word prediction in Skriv (extension only — coverage on every page is
  an extension-strength feature; replicating it inside Skriv is more
  noise than benefit).
- Mobile / touch-optimised dictionary popup (Skriv is desktop-first).

## 11. Cross-repo task tracking

Quick checklist either side can scan:

- [x] ~~**L-1**~~ — *Dropped* (Phase 40.2 made vocab bundle-only — no online dep)
- [x] **L-2** — Sync script + initial vendor pass (`scripts/sync-leksihjelp.js`)
- [x] **L-3** — `__lexiPresent` sentinel guarded on `chrome.runtime.id`
- [ ] **L-4** — `externally_connectable` for Skriv (deferred)
- [x] **L-5** — Pointer doc in leksihjelp planning
- [x] **S-1** — Plan + restore point
- [x] **S-2** — Bridge module (`leksihjelp-bridge.js`)
- [x] **S-3** — Settings panel (`leksihjelp-settings.js`)
- [x] **S-4** — Top-bar button in editor
- [x] **S-5** — Special-chars panel refactor
- [x] **S-6** — Loader + chrome shim + bundle wired into index.html + SW bump
- [ ] **S-7** — Spell-check wire-up (depends on S-6)
- [ ] **S-8** — Dictionary popup (depends on S-6)
- [ ] **S-9** — Per-document language seeding (depends on S-2..S-5; can ship after S-2)

## 12. References

- Skriv repo: `https://github.com/Papertek-forlag-AS/papertek-skriv`
- Leksihjelp repo: `https://github.com/Papertek-forlag-AS/leksihjelp`
- Lockdown adapter contract (template for this work):
  `https://github.com/Papertek-forlag-AS/leksihjelp/blob/main/.planning/lockdown-adapter-contract.md`
- Restore point in Skriv: tag `pre-leksihjelp-integration` (commit
  `eedf185`)
