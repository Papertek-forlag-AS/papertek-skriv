# Leksihjelp-Side Handoff — for the Skriv AI

> Companion to `docs/leksihjelp-integration.md`. Reflects the
> leksihjelp-side work done on **2026-05-09** by the leksihjelp agent.
> Read this before kicking off **S-6**.

## What landed (leksihjelp side)

### L-1 — DROPPED ❌

The original plan called for adding `skriv.papertek.app` to the
`papertek-vocabulary` Vocab API CORS allowlist so Skriv could lazy-fetch
bundles at runtime. **Dropped** because leksihjelp's Phase 40.2 (already
shipped, post-dating the original integration plan) flipped vocab loading
to **bundle-only** — runtime API fetch is forbidden by the
`check-no-vocab-fetch` release gate. Skriv mirrors that architecture: the
sync script bundles the full vocab tree into `public/js/leksihjelp/data/`
and the runtime never touches `papertek-vocabulary.vercel.app`.

Practical consequence for you: Skriv has **no online dependency** for
leksihjelp. Works offline once the bundle is cached by the SW.

### L-2 — DONE ✅

**Sync script written:** `scripts/sync-leksihjelp.js` (in this Skriv
worktree). Run it with:

```bash
LEKSIHJELP_REPO_PATH=/abs/path/to/leksihjelp node scripts/sync-leksihjelp.js
```

(Or omit the env var if `../leksihjelp` is a sibling checkout.)

**What the script does:**

1. Wipes `public/js/leksihjelp/` first (so files renamed/deleted upstream
   don't linger as stale copies — lockdown learned this the hard way
   with the Phase 43 renames).
2. Copies the file inventory below.
3. Strips per-entry `audio` MP3 references from `data/{de,en,es,fr,nb,nn}.json`
   (saves ~17 MB) since Skriv has no MP3 playback path. Writes minified.
4. Scopes every selector in `styles/content.css` under `.skriv-leksihjelp`
   and writes to `public/js/leksihjelp/styles/leksihjelp.css`.
5. Writes `public/js/leksihjelp/.version` with the upstream version,
   commit SHA, and sync timestamp.
6. Prints a summary table.

**Inventory (post-Phase-43 reality, supersedes integration doc §4):**

| Vendored | Purpose |
|----------|---------|
| `i18n/strings.js` | UI strings (NB/NN/EN) for popovers and dictionary |
| `exam-registry.js` | Surface-gating policy — settings panel reads this |
| `content/vocab-seam-core.js` | Pure index builder — `__lexiVocabCore` |
| `content/vocab-seam.js` | Hydration policy — publishes `__lexiVocab` |
| `content/lang-detect.js` | Per-input language auto-detect (vocab-derived) |
| `content/spell-check-core.js` | Pure rule engine — `__lexiSpellCore` |
| `content/spell-check-engine.js` | **Phase 43 NEW** — engine wrap (must load before renderer) |
| `content/spell-check-renderer.js` | **Phase 43 RENAME** (was `spell-check.js`) — DOM adapter |
| `content/spell-rules/*.js` | 78 rule files; ship verbatim |
| `popup/dict-state-builder.js` | Pure VM builder — Skriv consumes the VM, renders own DOM |
| `popup/grammar-features-section.js` | Grammatikknivå checkbox renderer |
| `styles/leksihjelp.css` | Scoped CSS bundle |
| `data/{de,en,es,fr,nb,nn}.json` | Vocab — audio-stripped + minified |
| `data/grammarfeatures-*.json` | Per-lang grammar feature definitions |
| `data/bigrams-*.json` | Bigram tables for spell-check ranking |
| `data/nb-baseline.json` | NB baseline rules |
| `data/pitfalls-en.json` | EN pitfalls |

**NOT vendored** (extension-only): `floating-widget.js`,
`prediction-engine.js`, `prediction-renderer.js`, `popup/views/*`,
`audio/`, `background/`, `popup/popup.js`, `vocab-store.js` (the latter
is dead code post-Phase-40.2 anyway — Skriv reads `data/*.json` directly
via fetch from the SW-cached bundle).

**Test run output (against leksihjelp v3.0.7):**

```
total bytes:      31.01 MB
data/ (audio stripped + minified)   30.16 MB   saved 17.0 MB vs upstream
content/spell-rules/ (78 files)     528.0 KB
spell-check-renderer.js              85.2 KB
data/* + styles/* + js/*             ~ 868 KB scripts/styles
```

### L-3 — DONE ✅

**Sentinel landed in `vocab-seam.js`:**

```js
try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        self.__lexiPresent = 'extension';
    }
} catch (_) { /* defensive */ }
```

The guard on `chrome.runtime.id` is critical: it ensures the sentinel
fires only in the real extension context. Skriv's vendored copy of
`vocab-seam.js` runs the exact same code but the guard fails (no
`chrome.runtime.id` outside extension context), so the sentinel stays
unset → your bridge correctly identifies Skriv's own seam as `embedded`.

Your bridge's `DETECT_GRACE_MS = 250` window is fine — `__lexiPresent`
is set very early in the IIFE, before any async work.

### L-4 — Deferred (per original plan).

### L-5 — DONE ✅

Pointer doc landed at `leksihjelp/.planning/skriv-adapter-contract.md`.
Lists synced surfaces, re-sync trigger, and the `[skriv-resync-needed]`
commit-message marker convention.

## What you (Skriv AI) need to do — S-6 onward

### S-6: Wire the vendored modules into Skriv

**Run the sync script first:**

```bash
LEKSIHJELP_REPO_PATH=/Users/geirforbord/Papertek/leksihjelp node scripts/sync-leksihjelp.js
```

Confirms `public/js/leksihjelp/` populates with ~31 MB of vendored
assets and `.version` pins to leksihjelp v3.0.7.

**Add `<script>` tags to `public/index.html` in this exact order**
(BEFORE Skriv's `main.js`):

```html
<!-- Leksihjelp vendored bundle — load BEFORE Skriv's main.js. -->
<!-- Order matters: rule files self-register on __lexiSpellRules at -->
<!-- import time; the renderer reads that array. -->
<script src="/js/leksihjelp/i18n/strings.js"></script>
<script src="/js/leksihjelp/exam-registry.js"></script>
<script src="/js/leksihjelp/content/vocab-seam-core.js"></script>
<script src="/js/leksihjelp/content/vocab-seam.js"></script>
<script src="/js/leksihjelp/content/lang-detect.js"></script>
<script src="/js/leksihjelp/content/spell-check-core.js"></script>
<!-- All 78 rule files. Use a small helper or list them out — see -->
<!-- lockdown's leksihjelp-loader.js LEKSI_BUNDLE for the canonical -->
<!-- order (it splits rules by lang block: nb/de/en/es/fr/nn + doc-drift). -->
<script src="/js/leksihjelp/content/spell-rules/grammar-tables.js"></script>
<script src="/js/leksihjelp/content/spell-rules/quotation-suppression.js"></script>
<!-- ...etc, all 78 files... -->
<script src="/js/leksihjelp/content/spell-check-engine.js"></script>
<script src="/js/leksihjelp/content/spell-check-renderer.js"></script>
<script src="/js/leksihjelp/popup/dict-state-builder.js"></script>
<script src="/js/leksihjelp/popup/grammar-features-section.js"></script>
<link rel="stylesheet" href="/js/leksihjelp/styles/leksihjelp.css">
```

**Reference for the rule-file order:** lockdown's
`/Users/geirforbord/Papertek/lockdown/public/js/leksihjelp-loader.js`
lines 517–605 list the canonical bundle order. Copy that into a
`LEKSI_BUNDLE` array in Skriv's `index.html` script-tag generation (or
inline the `<script>` tags by hand).

**The CSS is scoped.** Wrap the editor surface (or a high-level Skriv
container) with `class="skriv-leksihjelp"` so the leksihjelp dots,
popovers, and dictionary popup get their styles. Without that wrapper,
none of the leksihjelp UI will render correctly.

**Update `sw.js`:**

1. Bump the cache version (the existing `CACHE_VERSION` constant or
   equivalent).
2. Append all `/js/leksihjelp/**` paths to `ASSETS[]`. The 78 rule files
   + 13 vocab JSONs + the engine/renderer pair + the seam files = ~100
   entries. Generate this list programmatically if possible:

   ```js
   // sw.js (or build step)
   const LEKSIHJELP_ASSETS = [
       '/js/leksihjelp/.version',
       '/js/leksihjelp/i18n/strings.js',
       '/js/leksihjelp/exam-registry.js',
       '/js/leksihjelp/content/vocab-seam-core.js',
       // ...etc
   ];
   const ASSETS = [
       ...EXISTING_ASSETS,
       ...LEKSIHJELP_ASSETS,
   ];
   ```

3. The `.version` file change is what the SW uses to detect a new sync —
   bumping the cache version after sync forces re-install.

### S-7: Spell-check inline marks

Once `<script>` tags load and `vocab-seam.js` hydrates, the renderer
auto-attaches to focused text inputs. For Skriv's editor:

- The renderer expects to find an editable surface (input, textarea, or
  `contenteditable=true`) on focus. If Skriv's editor is a custom
  `contenteditable`, ensure it's reachable via standard focus events.
- The renderer reads `lang.spellcheck` from `chrome.storage.local`. In
  Skriv's seam-only context (no extension), there's no chrome.storage.
  You'll need a tiny shim — see lockdown's loader lines 100–225 for the
  reference (the `_storageData` object + `chrome.storage.local.get/set`
  proxy). Skriv's bridge already tracks the writing-lang in localStorage;
  the shim should mirror that into the renderer-expected key
  `lang.spellcheck`.

### S-8: Dictionary popup

`dict-state-builder.js` exports a pure function that takes a query +
language and returns a view-model object. Skriv's popup component
renders that VM. The integration doc §6 gives the click-anywhere
trigger; the bridge already gates this on status.

### S-9: Per-document language seeding

Bridge already exposes `setWritingLang` / `setLookupLang`. On document
open, inspect the doc metadata and call these. Soft seed only —
`localStorage` per-document override wins.

## Things that changed since the integration doc was written

The integration doc is dated 2026-05-09 but predates today's leksihjelp
work. Specifically:

1. **Phase 43 split:** `spell-check.js` → `spell-check-renderer.js` +
   `spell-check-engine.js`. The engine MUST load before the renderer.
   The doc's §4 inventory lists the old name; the sync script handles
   both correctly.
2. **Phase 43 per-surface language keys:** leksihjelp now uses
   `lang.dictionary` / `lang.spellcheck` / `lang.prediction` /
   `lang.widget` instead of a shared `language` key. The renderer reads
   `lang.spellcheck`. Skriv's bridge already tracks `writingLang` /
   `lookupLang` — wire `writingLang → lang.spellcheck` and
   `lookupLang → lang.dictionary` in the chrome.storage shim.
3. **Phase 40.2 vocab bundling:** see L-1 dropped above.
4. **Audio metadata strip:** see L-2 step 3 above.
5. **`prediction-engine.js` exists** but is NOT vendored — Skriv decided
   in §10 that word prediction is extension-only.

## Re-sync workflow

When leksihjelp ships changes that touch a synced surface, Skriv re-syncs:

```bash
cd <skriv repo>
LEKSIHJELP_REPO_PATH=/path/to/leksihjelp node scripts/sync-leksihjelp.js
git diff --stat public/js/leksihjelp/  # review changes
# bump sw.js cache version, commit, deploy
```

The leksihjelp side commits with `[skriv-resync-needed]` in the message
when the surface is touched (paired with `[lockdown-resync-needed]` when
both downstream consumers are affected).

## Open questions for Skriv

1. **Editor focus model.** Does Skriv's writer surface a single
   `contenteditable` div, or per-paragraph children? The renderer
   anchors dots to the focused element's bounding box; deeply nested
   editor structures may need a small adapter.
2. **Coexistence with LIX / paragraph map / argument flow overlays.**
   Audit z-index in the scoped CSS — `.skriv-leksihjelp .lh-spell-marker`
   needs to sit above the editor but below modal dialogs. Lockdown solves
   this with `z-index: 2147483646` on the spell overlay; Skriv may want
   lower.
3. **Mobile / touch.** §10 says desktop-first, but if Skriv has any
   touch testing, the popovers are designed for hover/click — taps work
   but lack the hover-preview affordance.

## Files I touched (for your reference)

In **leksihjelp** repo:
- `extension/content/vocab-seam.js` — added `__lexiPresent` sentinel
  with `chrome.runtime.id` guard.
- `.planning/skriv-adapter-contract.md` — pointer doc (new file).

In **skriv** repo (this worktree):
- `scripts/sync-leksihjelp.js` — sync script (new file).
- `public/js/leksihjelp/**` — generated by the sync script (~31 MB).
- `docs/leksihjelp-integration-handoff.md` — this file.

I did NOT touch:
- `public/js/app/leksihjelp-bridge.js` — your code, untouched.
- `public/js/app/leksihjelp-settings.js` — your code, untouched.
- `public/index.html` — left for S-6.
- `public/sw.js` — left for S-6.
- Any worktree branches other than `claude/tender-spence-6e1913`.

## Quick sanity check before you start S-6

Run these to confirm the sync output is healthy:

```bash
ls public/js/leksihjelp/                              # 5 dirs + .version
cat public/js/leksihjelp/.version                     # JSON pin
grep -c '__lexiPresent' public/js/leksihjelp/content/vocab-seam.js  # 1
grep -c 'chrome.runtime.id' public/js/leksihjelp/content/vocab-seam.js  # 1+
head -3 public/js/leksihjelp/styles/leksihjelp.css    # rules prefixed with .skriv-leksihjelp
grep -c '"audio"' public/js/leksihjelp/data/de.json   # 0
ls public/js/leksihjelp/content/spell-rules/ | wc -l  # 78
```

If anything's off, the sync script's summary table (last lines of stdout)
shows what was copied + size + any warnings.
