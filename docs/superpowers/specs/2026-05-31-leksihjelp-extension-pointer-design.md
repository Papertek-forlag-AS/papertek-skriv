# Leksihjelp → extension side-panel pointer

**Date:** 2026-05-31
**Status:** Approved, ready for planning
**Scope:** `skriv/` repo only. The extension side is specified here as a contract for the agent working in the leksihjelp repo; this work does **not** touch that repo.

## Problem

When the leksihjelp Chrome extension is active on a Skriv page, Skriv already
detects it (`window.__lexiPresent === 'extension'`) and yields completely: the
📚 Leksihjelp button is hidden, the settings drawer refuses to open, and the
dictionary/spell-check surfaces stand down. See
[`leksihjelp-bridge.js`](../../../public/js/app/leksihjelp-bridge.js) and
`refreshLeksihjelpBtn()` in
[`standalone-writer.js`](../../../public/js/app/standalone-writer.js).

The suppression is **silent** — the button just disappears. The user gets no
signal that the richer extension experience exists or that they should open it
in the browser side panel. We want Skriv to instead *point the user at the
extension*.

## Hard constraint

A web page **cannot** open a Chrome extension's side panel. `chrome.sidePanel.open()`
is only callable from the extension's own scripts and only inside a user-gesture
handler in the extension's context. Page JavaScript (Skriv) has no `chrome.sidePanel`
access. Therefore Skriv can only:

1. Fire a **best-effort signal** the extension may act on, and
2. Show **guidance text** as the reliable fallback.

## Behavior

When `bridge.getStatus() === 'extension'`:

- The 📚 Leksihjelp button **stays visible** (today it is hidden).
- Clicking it:
  1. Calls `bridge.requestExtensionPanel()` — fires the best-effort open signal.
  2. Shows a short guidance toast (the reliable fallback).
- The settings drawer is **not** opened (the extension owns settings, unchanged).

When status is `embedded` or `absent`, the button behaves exactly as today —
clicking opens the settings drawer. No change.

## Components (Skriv side)

### `public/js/app/leksihjelp-bridge.js`
Add one method to the returned API:

```js
requestExtensionPanel() {
    if (typeof window === 'undefined') return;
    window.postMessage(
        { type: 'skriv:leksihjelp:openPanel', source: 'skriv' },
        window.location.origin
    );
}
```

- Lives in the bridge because the bridge already owns the cross-repo seam and
  already listens on the `window` `message` channel (for `lexi:hydration`).
- No status guard required, but it is only *wired to a click* in extension mode.
  Document that it is a no-op signal when no extension is listening.
- Update the JSDoc API shape block at the top of `initLeksihjelpBridge`.

### `public/js/app/standalone-writer.js`
- `refreshLeksihjelpBtn()`: **remove** the `extension`-mode hide. The button is
  always shown now. (If a visual marker is desired later it can be added; not in
  scope — YAGNI.)
- The button click handler branches on live status:

```js
leksihjelpBtn.addEventListener('click', () => {
    if (leksihjelpBridge.getStatus() === 'extension') {
        leksihjelpBridge.requestExtensionPanel();
        showToast(t('leksihjelp.openPanelHint'), { duration: 4000 });
    } else {
        leksihjelpSettingsApi.toggle();
    }
});
```

### i18n
New key `leksihjelp.openPanelHint` added to **all three** locales (nb, nn, en).
Suggested copy:

- **nb:** "Leksihjelp-utvidelsen er aktiv — åpner sidepanelet. Du kan også klikke på utvidelsesikonet i nettleseren."
- **nn:** "Leksihjelp-utvidinga er aktiv — opnar sidepanelet. Du kan òg klikke på utvidingsikonet i nettlesaren."
- **en:** "The Leksihjelp extension is active — opening the side panel. You can also click the extension icon in your browser."

## Contract for the extension agent (NOT implemented here)

Add a new entry to the seam contract and a cross-repo task. The extension agent
implements their side independently.

**Message:** Skriv posts on `window`:

```js
{ type: 'skriv:leksihjelp:openPanel', source: 'skriv' }
```

**Extension responsibility:** its already-injected content script listens for
this `message`, forwards to the service worker, which attempts
`chrome.sidePanel.open({ tabId })`.

**Caveat to flag for them:** `chrome.sidePanel.open()` requires a user gesture
in the *extension's* context. A postMessage relay loses that gesture, so the
programmatic open may be rejected by Chrome. Recommend they also set
`chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` so a click
on the toolbar icon (which Skriv's toast tells the user about) reliably opens the
panel. The postMessage path is a best-effort enhancement, not the guarantee.

This becomes task **L-6** in `docs/leksihjelp-integration.md`.

## Spec updates required (per CLAUDE.md rules)

- `specs/UI-ROUTES.md` — top-bar Leksihjelp button now visible in extension mode;
  click fires the open signal + guidance toast instead of being hidden.
- `specs/MODULES.md` — bridge gains `requestExtensionPanel()` export.
- `docs/leksihjelp-integration.md` — add `skriv:leksihjelp:openPanel` to the seam
  contract (§3), add task **L-6**, update the UI-surfaces table (§8: button no
  longer hidden when status === 'extension').
- **No** new module → no `sw.js` change. **No** IndexedDB/localStorage change.

## Testing

- Bridge unit test: `requestExtensionPanel()` posts a `message` with shape
  `{ type: 'skriv:leksihjelp:openPanel', source: 'skriv' }` and a matching
  `targetOrigin`. (Spy/stub `window.postMessage`.)
- Existing bridge detection tests stay green (no change to detection logic).

## Out of scope

- Any change in the leksihjelp extension repo.
- L-4 `externally_connectable` / `chrome.runtime.sendMessage` path (rejected in
  favor of `window.postMessage` — lower coupling, no extension ID).
- A persistent visual marker / relabel on the button in extension mode.
