# `public/js/leksihjelp/` — Vendored from leksihjelp

This tree is **vendored** from the Papertek leksihjelp Chrome extension repo
(`Papertek-forlag-AS/leksihjelp`). **Do not edit files in this directory by
hand.** Changes happen upstream in the leksihjelp repo and are pulled in
via `scripts/sync-leksihjelp.js`.

See [docs/leksihjelp-integration.md](../../../docs/leksihjelp-integration.md)
for the full contract: which files belong here, the seam shape Skriv
expects (`window.__lexiVocab`), the version-pinning protocol, and the
list of cross-repo follow-up tasks.

Current pin: see `.version` in this directory (upstream version + commit
SHA + sync timestamp).

If this directory is empty, the leksihjelp side has not been pulled in
yet — run `node scripts/sync-leksihjelp.js` from the repo root.
