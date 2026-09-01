/**
 * Leksihjelp — Vocabulary Store (Phase 40.2: audio-only adapter)
 *
 * Phase 40.2 stripped the runtime API-fetch surface from this module. Vocab
 * data is now bundled in `extension/data/<lang>.json` and loaded directly via
 * `chrome.runtime.getURL` from `vocab-seam.js` and `popup.js`. The IDB
 * `bundles` object store is dropped on schema bump (DB_VERSION 3 → 4).
 *
 * What remains:
 *   - STORE_AUDIO IDB cache (key '{lang}/{filename}', value Blob) — preserved
 *     verbatim for the future audio-pack phase. The dictionary-view audio
 *     button (extension/popup/views/dictionary-view.js) consumes
 *     hasAudioCached / getAudioFile through the popup vocab adapter.
 *   - Back-compat no-op stubs (getCachedLanguage, getCachedGrammarFeatures,
 *     listCachedLanguages, deleteLanguage, getCachedVersion) so any consumer
 *     still wired to the old surface collapses gracefully to "no cached
 *     language" / empty-list results. Future v3.3 audit may delete these.
 *
 * Sandbox compatibility (Pitfall 2): The IIFE must load cleanly under
 *   (a) extension content-script context (window present, IDB present),
 *   (b) lockdown's `leksihjelp-loader.js` shim (no IDB),
 *   (c) Node sandbox (no chrome global).
 * IDB-touching code is wrapped so it only throws at call time, never at
 * import time. Callers that hit IDB in a no-IDB environment catch and return
 * null/[] gracefully.
 *
 * Network: ZERO fetch calls in this module. Phase 40.2 closed BUNDLE-06.
 */

(function () {
  'use strict';

  // ── Constants ──
  const DB_NAME = 'lexi-vocab';
  const DB_VERSION = 4;                // Phase 40.2: bumped from 3 to drop bundles store
  const STORE_AUDIO = 'audio';         // key '{lang}/{filename}', value Blob

  // ── IndexedDB queue + open ──
  // openDB lazily initializes the IDB connection. Wrapped in try/catch so
  // contexts without indexedDB (Node sandbox, some lockdown shim states) fail
  // at call time, not at module-load time.
  let _dbPromise = null;

  function openDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        if (typeof indexedDB === 'undefined') {
          reject(new Error('indexedDB unavailable'));
          return;
        }
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (e) {
        reject(e);
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        // Phase 40.2: drop the legacy 'bundles' store. Bundled JSON shipping
        // in the extension zip means we no longer cache per-language payloads
        // in IDB.
        if (db.objectStoreNames.contains('bundles')) {
          db.deleteObjectStore('bundles');
        }
        // Drop other legacy stores from earlier schemas (e.g. 'languages').
        for (const legacy of ['languages']) {
          if (db.objectStoreNames.contains(legacy)) {
            db.deleteObjectStore(legacy);
          }
        }
        if (!db.objectStoreNames.contains(STORE_AUDIO)) {
          db.createObjectStore(STORE_AUDIO);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return _dbPromise;
  }

  function txDo(storeName, mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      let result;
      try {
        const r = fn(store);
        if (r && typeof r === 'object' && 'onsuccess' in r) {
          r.onsuccess = () => { result = r.result; };
          r.onerror = () => reject(r.error);
        } else {
          result = r;
        }
      } catch (e) {
        reject(e);
        return;
      }
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    }));
  }

  // ── Audio cache helpers (preserved verbatim from legacy implementation) ──

  async function hasAudioCached(lang) {
    // Phase 40.2: previously gated on a cached `_audioVersion` in the bundled
    // payload. With bundles gone, we conservatively report false until the
    // future audio-pack phase wires this up against STORE_AUDIO directly.
    void lang;
    return false;
  }

  async function getAudioFile(lang, filename) {
    try {
      const key = `${lang}/${filename}`;
      const blob = await txDo(STORE_AUDIO, 'readonly', store => store.get(key));
      return blob || null;
    } catch (e) {
      console.warn('Leksihjelp: getAudioFile failed', e);
      return null;
    }
  }

  // Audio pack download is currently dormant (future audio-pack phase will
  // wire it). We keep the function reference so manifest loaders that
  // reference window.__lexiVocabStore.downloadAudioPack don't TypeError.
  async function downloadAudioPack(/* lang, zipUrl, onProgress */) {
    console.warn('Leksihjelp: downloadAudioPack is not wired in Phase 40.2; deferred to future audio-pack phase');
    return 0;
  }

  // ── Back-compat no-op stubs (Phase 40.2 RESEARCH §2 / Pitfall 5 atomicity) ──
  // Consumers (popup.js buildVocabAdapter pass-through, service-worker.js
  // VOCAB_GET_CACHED handler, etc.) still reference these. Returning
  // null/[]/no-op here means their branches collapse to "bundled-only / no
  // cached language" naturally. Future v3.3 audit may delete callers and
  // these stubs together.

  async function getCachedLanguage(/* lang */) {
    return null;
  }

  async function getCachedGrammarFeatures(/* lang */) {
    return null;
  }

  async function listCachedLanguages() {
    return [];
  }

  async function deleteLanguage(/* lang */) {
    // No-op — there's no per-language IDB bundle to delete in Phase 40.2.
    return;
  }

  async function getCachedVersion(/* lang */) {
    return null;
  }

  // ── Expose API ──
  const api = {
    // Audio cache (preserved for future audio-pack phase)
    hasAudioCached,
    getAudioFile,
    downloadAudioPack,
    // Back-compat no-op stubs
    getCachedLanguage,
    getCachedGrammarFeatures,
    listCachedLanguages,
    deleteLanguage,
    getCachedVersion,
  };

  const host = (typeof window !== 'undefined' ? window
              : typeof self !== 'undefined' ? self
              : globalThis);
  host.__lexiVocabStore = api;
})();
