# Conventions

> Last updated: 2026-08-23

## Feature lifecycle

Editor features expose a named `init*()` function and return an API containing `destroy()`:

```js
export function initMyFeature(editor, options = {}) {
    function destroy() {
        // remove owned DOM, listeners, timers, observers, and pending work
    }

    return { destroy };
}
```

- One feature lives in one kebab-case file.
- `destroy()` is idempotent where practical and owns every resource created by `init*()`.
- Screen APIs may have an asynchronous `destroy()`. The router must `await` it before replacing the screen.
- A failed final editor save rejects teardown; navigation is cancelled and the original URL/screen remains active.
- Pure data/storage modules may export direct functions instead of an initializer.

## Naming

| Thing | Convention | Example |
|---|---|---|
| File | kebab-case | `word-frequency.js` |
| Export | camelCase | `openSkrivDatabase` |
| Initializer | `init` + PascalCase | `initEditorToolbar` |
| Constant | UPPER_SNAKE_CASE | `DB_VERSION` |
| CSS class | Tailwind utility or `skriv-*` custom class | `text-stone-500`, `skriv-sidebar` |
| i18n key | dot-separated namespace | `review.feedbackDesc` |
| Frame | kebab-case Markdown | `reflekterende-tekst.md` |

## Import boundaries

1. `editor-core/shared/` never imports from `student/` or `app/`.
2. `editor-core/student/` may import from `shared/`, its own layer, `config.js`, and `editor-core/vendor/`.
3. `app/` may orchestrate every lower layer.
4. Circular imports are forbidden; update `DEPENDENCIES.md` when an edge changes.
5. Optional editor review tools use literal dynamic imports so the service-worker asset audit can discover them.
6. Floating UI is imported from local ESM files. The locally vendored jsPDF UMD exposes `window.jspdf`; guard that global before use.
7. `public/js/leksihjelp/` is vendored from the Leksihjelp repository. Do not hand-edit it. See "Vendoring Leksihjelp" below. Runtime access stays behind `app/leksihjelp-bridge.js` plus `leksihjelp-loader.js`.

## Vendoring Leksihjelp

**Leksihjelp owns the sync mechanism; the consumer owns the pull.** There is
one implementation of the file sync — `scripts/embed-sync.js` in the
leksihjelp repository — and every consumer calls it with its own options.
Skriv must never grow a second copy of the copying, CSS scoping or audio
stripping; keeping two implementations is exactly how the old sync drifted
from Lockdown's.

- `scripts/sync-leksihjelp.js` in *this* repo is the pull side only: it locates
  the source, refuses unsafe sources, invokes `embed-sync`, and regenerates the
  managed blocks. Run it from here; leksihjelp never writes into this tree.
- Skriv's options are `--profile no-audio --scope .skriv-leksihjelp --without
  pdf-viewer`, and deliberately **no `--subset`** — Skriv takes the shared
  layer-2 views, not just the engine.
- **Always `--dry-run` first.** The report buckets changes per layer. A pure
  engine update is routine; anything touching layer 2 or 2.5 changes visible
  surface and should be checked in a browser before it lands.
- **Pull only from a release branch.** `embed-sync` mirrors the *working copy*
  of the leksihjelp checkout, not a branch you name, so a checkout parked on a
  feature branch silently vendors unreleased code. The script refuses anything
  that is not on `staging` or `main`; when the shared checkout is busy, point
  `LEKSIHJELP_REPO_PATH` at a worktree pinned to a release branch.
- **Fix upstream, then pull.** A bug found through Skriv is fixed in the
  leksihjelp repository and re-synced. The divergence guard compares each file
  against `.version` and stops the sync if a vendored file was edited locally.
- The sync owns the generated blocks in `index.html` and `sw.js`, derived from
  `load-order.json`: the version global, `embed/host-runtime.js`,
  `leksihjelp-loader.js`, then the content scripts and shared views in upstream
  order. That ordering is a contract — the runtime must exist before Skriv's
  config installs it, and both before anything vendored reads `chrome.*`.
  Bump `CACHE_NAME` in `sw.js` afterwards.

## Localization and language

- Every visible string uses `t('key')`; add each key to `nb.js`, `nn.js`, and `en.js`.
- Bokmål is the predictable first-run interface language. A visible selector persists explicit changes under `skriv_language`.
- Interface language and document writing language are separate concepts.
- A document writing-language change must update the editor `lang`, native spellcheck, Leksihjelp bridge, special characters, frame language, and persisted document state.
- Plural strings use `t(key, { count })` and plural objects in locale files.
- Pedagogical metrics must use cautious language: observations/support, not grading or authoritative assessment.
- “Limited assistance” must never be presented as a secure exam mode or locked browser.

## Storage safety

- All `skriv-documents` access goes through `app/db.js`; never add a second `indexedDB.open('skriv-documents', ...)` implementation.
- Schema migrations and post-open repairs must be idempotent and preserve recoverable legacy associations.
- Autosaves are serialized. A feature calls `schedule()` after content changes and awaits `flush()`/`destroy()` before destructive lifecycle events.
- A database `versionchange` participates in the same awaited editor-flush event as an app update before closing the connection.
- Soft delete keeps version snapshots. Permanent delete, empty trash, and expiry purge remove the associated snapshots.
- Backup restore is merge-only: it must validate before writes, never overwrite a local collision, remap relationships, and be safe to retry. A collision clone has a new local identity and must drop `microsoft365` so it cannot target the source document's remote item without fresh opt-in.
- Browser-profile IndexedDB is not durable backup media. UI and documentation must continue to disclose the `.skriv` backup option.

## Optional Microsoft 365 connector

- Microsoft 365 is opt-in and deployment-configured. Missing/invalid client ID, tenant ID, or SharePoint-host metadata must leave the complete local editor usable without starting authentication or Graph requests.
- Browser authentication uses the checked-in MSAL Browser distribution, authorization code + PKCE, the deployment's exact tenant, delegated `Files.ReadWrite.All` only, and exactly `{origin}/microsoft-auth-redirect.html`. The `.All` suffix is required because Teams channel files belong to a group-owned SharePoint site rather than the pupil's personal drive; delegated access still cannot exceed the signed-in pupil's own access. Never add a client secret, application permission, Teams/directory scope, or a Papertek token proxy to the SPA.
- `Files.ReadWrite.All` is broader than one folder. Skriv's code enforces the selected-folder boundary; governance, consent, and DPIA must assess the actual delegated grant rather than describe it as folder-scoped.
- Never select an arbitrary entry from MSAL's account cache. Auto-resume only when one account is unambiguous; otherwise require the pupil's explicit popup selection. Disconnect clears the connector's complete MSAL application cache for the tab/session.
- Production configuration comes from the documented client/tenant/SharePoint-host meta tags. Only localhost may use the three documented session overrides. The host is a bare global-cloud `<tenant>.sharepoint.com` hostname: reject schemes, paths, ports, wildcards, IPs, arbitrary subdomains, and a configured `-my` host.
- Before and after Graph resolution, accept folder/item URLs only when they are credential-free HTTPS URLs whose hostname equals the configured `<tenant>.sharepoint.com` or its derived `<tenant>-my.sharepoint.com` companion. Never trust Graph to enforce this application boundary on Skriv's behalf.
- Public configuration values may be deployed in HTML, but secrets, passwords, MFA codes, tokens, folder links, raw MSAL account identifiers, emails, and pupil data never belong in source, logs, screenshots, chat, IndexedDB, or backups.
- IndexedDB is authoritative. A content edit is saved locally before remote work is scheduled; route teardown and app updates wait for the local flush only. After that flush, editor teardown starts a fire-and-forget final sync only for an existing link and releases the controller when it settles; navigation never waits for Graph. Remote errors must never reject local autosave or make writing unavailable.
- Keep local-save and Microsoft-sync status separate in the UI. Offline, sign-in, permission, missing-item, rate-limit, and conflict states must say that the local copy is still safe.
- Remote update/download first verifies that the drive item is still a `.skriv` file in the selected drive/folder with a canonical SharePoint URL. Moved, renamed, foreign, or changed items fail closed. Updates require the last acknowledged eTag through `If-Match`. The upload acknowledgement's eTag is authoritative for the bytes just sent; a failed enrichment read does not invalidate a committed upload, a differing read is immediately a conflict, and Graph `409`/`412` never retry as an unconditional overwrite. The safe resolution is **Keep both**.
- Asynchronous metadata acknowledgements use `saveDocument`'s atomic `expectedFields` compare-and-swap guard and preserve `updatedAt`. A late request must resolve as superseded rather than overwrite a newer edit/unlink/trash transition. Explicit unlink atomically clears the current link without a stale guard so pupil opt-out wins; scheduled/background sync must require a link again at execution time. A sync request arriving while one upload is in flight must coalesce into a follow-up pass rather than be mistaken for the in-flight result.
- A selected Microsoft folder and the MSAL account/token cache are session-scoped. `document.microsoft365` may contain only the exact versioned schema with a SHA-256 pseudonymous account binding, bounded remote identity/sync metadata, and a nullable attempt ID; it must not contain tokens, the pasted sharing URL, home-account ID, username, email, display label, or unknown fields. Backup restore rejects duplicate remote identities and removes a link when that item is already owned locally.
- Native remote files use the validated one-document `.skriv` codec. Decode exact UTF-8, reject connector metadata, and validate HTML/resource safety before browser DOM parsing. Preserve current school year, clear legacy subject, and import into pedagogical **Uten mappe**. Reopening one remote item reuses its active local identity; a trashed identity must be restored instead. Bound folder listing to five Graph pages and 200 `.skriv` files.
- Local unlink is an unconditional opt-out and must remain available for a linked document without valid deployment configuration, sign-in, or a selected session target. An expired token offers explicit interactive reconnect; localhost test configuration can always be disconnected and cleared from a configured dialog.
- Remote delete is intentionally outside this connector. Unlinking, local trash, permanent local deletion, or Microsoft disconnect must never delete the Microsoft copy.
- Cross-origin Microsoft identity, Graph, SharePoint, and pre-authenticated upload/download requests must bypass the Skriv service worker and browser HTTP cache. Fetches omit ambient credentials and referrer data.
- `/microsoft-auth-redirect.html` and `/vendor/msal-redirect-bridge-5.17.3.min.js` are same-origin exceptions: they must remain outside `ASSETS`, bypass the fetch handler, and be served by the host with `Cache-Control: no-store` and no `Cross-Origin-Opener-Policy` response header. HTML meta directives do not replace these response headers.

## Service-worker changes

When adding, removing, or renaming a runtime asset:

1. Update `ASSETS`, the explicit network-only bypass set, or the managed Leksihjelp inventory in `sw.js`, as appropriate.
2. Bump `CACHE_NAME`.
3. Update the current cache version in `ARCHITECTURE.md` and `DATA-MODEL.md`.
4. Run the offline closure test so all static and dynamic module imports exist in the cache.

Never call `skipWaiting()` during install. A worker waits until an explicit update action completes all registered `skriv:before-app-reload` promises. Fetches for pinned same-origin release assets are cache-first except for the two documented MSAL response resources; cross-origin connector traffic is never intercepted or cached.

## Styling and responsive UI

- Use Tailwind utilities for local layout; put reusable or stateful rules in `public/css/main.css`.
- Primary palette: emerald with stone neutrals.
- Main breakpoints: 768 px and 480 px.
- Pointer targets on coarse/touch devices should be at least 44 px.
- Respect `prefers-reduced-motion`.
- The mobile frame guide overlays the editor; it must not leave a desktop-width content offset.

## Accessibility

- Modals: `role="dialog"`, `aria-modal="true"`, labelled title, Escape, focus trap, and focus restoration.
- Toolbars: `role="toolbar"`, localized labels, roving tab stop, arrow/Home/End navigation, Escape back to the editor.
- Drawers: expose expanded state, make hidden content inert, and restore a usable focus target when closed.
- Save status uses a polite live status region.
- Document cards use list semantics and keyboard activation.
- Delete actions stay visible and have document-specific accessible names.
- The skip link targets the `#app` main landmark.

## Frame Markdown

Frames under `public/frames/{nb,nn}/` use front matter followed by sections:

```markdown
---
name: Drøfting
description: ...
sections: 4
---

# Section title

> Instruction for the student

- Guidance or sentence starter
```

The registry in `frame-selector.js` owns broad level recommendations (`barneskole`, `ungdomsskole`, `vgs`). Recommendations reorder/group choices; they never hide the remaining frames.
