# Leksihjelp ↔ Skriv integration

> **Status:** active, local-only integration
>
> **Current pin:** see `public/js/leksihjelp/.version`
>
> **Last reviewed:** 2026-08-22

## Purpose

Skriv embeds the dictionary and writing-check subset of Papertek Leksihjelp so
students get Norwegian and foreign-language support without an account, server,
or runtime third-party request. The Chrome extension remains a separate product.
When it is present, Skriv yields its dictionary and inline marks to the extension
instead of showing two competing surfaces.

## Runtime model

- All executable code and vocabulary data lives under
  `public/js/leksihjelp/`.
- `public/js/leksihjelp/embed/host-runtime.js` is Leksihjelp's own shared embed
  runtime. It provides the `chrome.runtime` / `chrome.storage` compatibility
  API, the capability contract, and the store and dataSource seams. Skriv no
  longer maintains a hand-written shim for any of this.
- `public/js/leksihjelp-loader.js` is Skriv's *configuration* of that runtime:
  asset base, seeded settings, capabilities, and the two-way bridge binding.
  It must never set `runtimeId` — its absence is how `vocab-seam` tells an
  embedded host from a real extension — and its capabilities stay false/null.
- The generated block in `public/index.html` is derived from
  `public/js/leksihjelp/load-order.json`, which upstream derives from
  `extension/manifest.json`.
- Upstream scripts communicate through explicit `window.__lexi*` globals.
  Skriv's authored integration stays behind `app/leksihjelp-bridge.js`,
  `app/leksihjelp-settings.js`, `app/leksihjelp-view-host.js`, and
  `app/leksihjelp-dictionary.js`.
- The drawer's Ordbok tab mounts Leksihjelp's own `dictionary-view` through
  `app/leksihjelp-view-host.js`, so the dictionary is the same surface here as
  in Lockdown and the extension. Skriv no longer renders search results from
  the view-model itself, which also retires the standing risk that a change in
  what `dict-state-builder` returns breaks Skriv's renderer silently.
  Host-owned differences, declared as deps rather than forked code:
  vocabulary is bundled rather than IndexedDB-cached, audio and external
  dictionary links are off, and the language pills are dictionary-scoped —
  switching one changes the lookup language (mirrored into the bridge, so
  Skriv's own Oppslagsspråk select agrees) and never the language the pupil is
  writing in.
- The Innstillinger tab stays Skriv's: Eksamensmodus, Skrivespråk,
  Oppslagsspråk and Grammatikknivå are host policy, not shared UI.
- Vocabulary JSON is fetched only from Skriv's own origin. There is no runtime
  vocabulary API, CDN, analytics, or authentication dependency.

Capabilities are declared `{ network: false, tts: false, report: false }`, with
`policySource` and `identity` left `null`. Those two are prepared seams for
teacher-managed settings and optional Leksihjelp sign-in; the runtime refuses
any non-null value until they are actually built, so a half-wired feature fails
loudly instead of pretending to work. Upstream's personal dictionary and
learning-state controls stay disabled until Skriv has a durable,
product-owned storage and UI contract for them.

## Load order

The order is a contract, generated — never hand-held:

1. the vendored version, as a global, so the runtime can cache-bust its fetches
2. `embed/host-runtime.js` — layer 2.5, deliberately absent from the upstream
   manifest and therefore from `load-order.json`, so the host loads it itself
3. `js/leksihjelp-loader.js` — Skriv's config, which installs the runtime and
   so must run after it exists but before anything vendored reads `chrome.*`
4. every `contentScripts` entry from `load-order.json`, in upstream order
   (i18n, host capabilities, exam registry, vocabulary seam, language
   detection, rule gating, spell-check core, every `content/spell-rules/*.js`,
   the engine, then the renderers)
5. the shared `views` from `load-order.json`

`app/main.js` remains immediately after the block. A rule copied to disk but
absent from this ordered block does not execute, so the order and the file
inventory are generated and tested together
(`tests/leksihjelp-vendor-contract.test.mjs`).

## Vendoring contract

`scripts/sync-leksihjelp.js` is the only supported way to change the generated
snapshot. Do not hand-edit `public/js/leksihjelp/`, the marked Leksihjelp block
in `public/index.html`, or the marked Leksihjelp asset block in `public/sw.js`.

**Leksihjelp owns the sync mechanism; Skriv owns the pull.** The file sync
itself is `scripts/embed-sync.js` in the Leksihjelp repository — one
implementation shared by every embed consumer. Skriv must not grow a second
copy of the copying, CSS scoping or audio stripping.

`scripts/sync-leksihjelp.js` here is the pull side:

1. Locates a sibling Leksihjelp checkout or reads `LEKSIHJELP_REPO_PATH`, and
   reports its branch, version and commit.
2. Refuses to pull from anything but a release branch (`staging`, `main`), or
   from a dirty working tree. `embed-sync` mirrors the *working copy*, not a
   branch you name, so a checkout parked on a feature branch would silently
   vendor unreleased code. Override with `--allow-any-branch` / `--force` only
   deliberately.
3. Runs `embed-sync` with Skriv's options: `--profile no-audio --scope
   .skriv-leksihjelp --without pdf-viewer`, and no `--subset` — Skriv takes the
   shared layer-2 views as well as the engine. Audio stripping, CSS scoping and
   the pdf-viewer strip all happen upstream.
4. Regenerates the managed blocks in `index.html` and `sw.js` from the
   `load-order.json` that `embed-sync` wrote.

Upstream writes `.version` (version, commit, profile, scope and a per-file hash
inventory) and `load-order.json` (content scripts and shared views). Both are
generated; `.version` is also the divergence guard's baseline, so a locally
edited vendored file stops the next sync until the change is ported upstream.

Always dry-run first — the report buckets changes per layer, so a pure engine
update can be pulled as routine while anything touching layer 2 is checked in a
browser:

```sh
node scripts/sync-leksihjelp.js --dry-run
node scripts/sync-leksihjelp.js
```

Select a checkout explicitly when the shared one is busy or on a feature
branch (a `git worktree` pinned to `staging` works well):

```sh
LEKSIHJELP_REPO_PATH=/absolute/path/to/leksihjelp node scripts/sync-leksihjelp.js
```

Bump `CACHE_NAME` in `public/sw.js` afterwards.

## Offline policy

Skriv's critical shell and ES-module graph are atomically precached. Vendored
Leksihjelp JavaScript, scoped CSS, `.version`, and the compact Bokmål fallback
are best-effort precached so a vendor-file problem cannot prevent Skriv itself
from installing. The much larger full-language files are cached on first use by
the same-origin cache-first fetch handler. This avoids downloading every school
language during install while preserving offline use for languages already
opened on the device.

Every vendor resync changes runtime assets and therefore requires:

- a `CACHE_NAME` bump in `public/sw.js`;
- matching cache-version updates in `specs/ARCHITECTURE.md` and
  `specs/DATA-MODEL.md`;
- pin updates in `specs/DEPENDENCIES.md` and `specs/MODULES.md`;
- the full offline and vendor-contract test suite.

## Skriv bridge and ownership

The bridge reports `absent`, `embedded`, or `extension` status. The extension
signals ownership through the shared DOM attribute `data-lexi-present`; a
main-world JavaScript sentinel is insufficient because Chrome content scripts
run in an isolated world. In extension mode, Skriv hides its settings surface
and posts the best-effort `skriv:leksihjelp:openPanel` request when the student
uses the Leksihjelp button.

In embedded mode, the bridge mirrors the active document's writing language,
the dictionary lookup language, and the limited-assistance flag into the
runtime's store. Writing language is document-owned and also drives the editor
`lang`, native spellcheck, special characters, and frame selection.

The binding is two-way, and the direction that is easy to get wrong is the
return path: the runtime's memory store fires a change on *every* write, including
one that sets a key to the value it already held. The old hand-written shim
skipped no-op writes; this one does not. What keeps
bridge → store → bridge from looping is that every bridge setter returns early
when the value is unchanged. Preserve that property in any new setter.

The persistent key contract is documented in `specs/DATA-MODEL.md`. The
runtime's additional upstream settings are in-memory compatibility state, not
new Skriv storage.

## Verification after a sync

At minimum:

1. Run the complete Skriv Node test suite.
2. Confirm the vendor-contract test sees the same rule count and order on disk,
   in `.version`, in `index.html`, and in the eager service-worker inventory.
3. Open a fresh editor with no console errors and switch writing language
   between Bokmål and Nynorsk without reloading.
4. Verify the regression sentence
   `Dette er ein kort tekst om skulen. Eg skriv for å undersøkje korleis språk fungerer.`
   produces no Leksihjelp finding.
5. Verify a real contrast still works: `Dette er eit kort tekst om skulen.`
   should suggest `ein`, while `Dette er eit kort svar.` is accepted.
6. Exercise dictionary lookup and grammar-level settings for at least one
   Norwegian and one foreign language.
7. Reload once online before testing offline, then confirm the used language
   still works with the network disabled.

## Cross-repository references

- Skriv: `https://github.com/Papertek-forlag-AS/papertek-skriv`
- Leksihjelp: `https://github.com/Papertek-forlag-AS/leksihjelp`
