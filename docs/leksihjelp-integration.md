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
- `public/js/leksihjelp-loader.js` runs first and provides the narrow
  `chrome.runtime` and `chrome.storage` compatibility API expected by the
  upstream classic scripts.
- The generated classic-script block in `public/index.html` follows the
  dependency order in upstream `extension/manifest.json`.
- Upstream scripts communicate through explicit `window.__lexi*` globals.
  Skriv's authored integration stays behind `app/leksihjelp-bridge.js`,
  `app/leksihjelp-settings.js`, and `app/leksihjelp-dictionary.js`.
- Vocabulary JSON is fetched only from Skriv's own origin. There is no runtime
  vocabulary API, CDN, analytics, or authentication dependency.

The embedded subset deliberately omits TTS, prediction, the floating widget,
extension background code, account UI, and remote synchronization. Upstream's
personal dictionary and learning-state controls are also disabled in the Skriv
shim until Skriv has a durable, product-owned storage and UI contract for them.

## Classic-script dependency order

The sync script filters the upstream manifest to this shape:

1. i18n and exam registry
2. vocabulary core, vocabulary seam, and language detection
3. rule-feature gating and spell-check core
4. every manifest-listed `content/spell-rules/*.js`, in manifest order
5. spell-check engine
6. pedagogy renderer and personalization store required by the current renderer
7. spell-check renderer
8. Skriv's two vendored popup helpers

The loader remains immediately before the managed block; `app/main.js` remains
immediately after it. A rule copied to disk but absent from this ordered block
does not execute, so the order and inventory are generated and tested together.

## Vendoring contract

`scripts/sync-leksihjelp.js` is the only supported way to change the generated
snapshot. Do not hand-edit `public/js/leksihjelp/`, the marked Leksihjelp block
in `public/index.html`, or the marked Leksihjelp asset block in `public/sw.js`.

The script:

1. Locates a sibling Leksihjelp checkout or reads `LEKSIHJELP_REPO_PATH`.
2. Parses `extension/manifest.json` once for version and classic-script order.
3. Validates required files and managed markers before replacing the old
   snapshot.
4. Copies the exact manifest-listed rule set plus required seam, renderer, and
   popup-helper files.
5. Copies bundled vocabulary data, strips unused audio metadata from the six
   main language payloads, and scopes upstream CSS under `.skriv-leksihjelp`.
6. Writes `.version` with the upstream version, commit, complete generated file
   inventory, classic-script order, and sync timestamp.
7. Regenerates the managed HTML and service-worker inventories.

Run from the Skriv repository root:

```sh
node scripts/sync-leksihjelp.js
```

Or select a checkout explicitly:

```sh
LEKSIHJELP_REPO_PATH=/absolute/path/to/leksihjelp node scripts/sync-leksihjelp.js
```

The script pins the source checkout's current `HEAD`; updating or fetching that
checkout is a separate, deliberate step. Always inspect its branch, status, and
remote tracking state before syncing.

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
in-page storage shim. Writing language is document-owned and also drives the
editor `lang`, native spellcheck, special characters, and frame selection.

The persistent key contract is documented in `specs/DATA-MODEL.md`. The shim's
additional upstream settings are in-memory compatibility state, not new Skriv
storage.

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
