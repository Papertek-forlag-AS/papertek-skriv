/**
 * Leksihjelp — pause-by-domain (content-script shared module)
 *
 * Storage shape: chrome.storage.local.pausedDomains = {
 *   [host: string]: { until: number /* epoch ms *\/ }
 * }
 *
 * The chip menu in spell-check.js writes entries with offsets of 1h / 4h / 24h.
 * Spell-check / word-prediction / floating-widget read isPausedNow() each
 * cycle and bail early when the active host is paused. Auto-resume happens
 * naturally when Date.now() exceeds `until` (no reload needed).
 *
 * Keys are URL.host (NOT full URL) so query strings don't multiply entries.
 *
 * Exam mode: this module does NOT consult exam state. Callers (chip menu)
 * are responsible for hiding the pause UI when exam mode is active. The
 * bail-out itself is fine to run in exam mode — if a paused entry survives
 * an exam-mode toggle the surface stays suppressed, which is the safe default.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'pausedDomains';
  let cache = {}; // {host: {until}}
  let hydrated = false;
  const listeners = new Set();

  function currentHost() {
    try { return location.host || ''; } catch (_) { return ''; }
  }

  function hydrate() {
    return new Promise(resolve => {
      try {
        chrome.storage.local.get(STORAGE_KEY, (r) => {
          cache = (r && r[STORAGE_KEY]) || {};
          hydrated = true;
          resolve();
        });
      } catch (_) {
        hydrated = true;
        resolve();
      }
    });
  }

  // An entry is "active" when it has no expiry (until === null → indefinite,
  // "until I turn it back on") OR its epoch-ms expiry is still in the future.
  function isActiveEntry(entry) {
    if (!entry) return false;
    if (entry.until === null || entry.until === undefined) return true;
    return Date.now() <= Number(entry.until);
  }

  function isPausedNow(host) {
    const h = host || currentHost();
    if (!h) return false;
    const entry = cache[h];
    if (!entry) return false;
    if (!isActiveEntry(entry)) {
      // Expired — clear lazily; don't await.
      delete cache[h];
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: { ...cache } });
      } catch (_) {}
      return false;
    }
    return true;
  }

  function getPauseFor(host) {
    const h = host || currentHost();
    const entry = cache[h];
    if (!isActiveEntry(entry)) return null;
    return { until: entry.until === null || entry.until === undefined ? null : Number(entry.until) };
  }

  // pause(hours, host): a numeric `hours` sets a timed pause; `null`/`undefined`
  // sets an indefinite pause (until:null) that only ends when the user resumes
  // (settings list or the right-click "Gjenoppta" item).
  function pause(hours, host) {
    const h = host || currentHost();
    if (!h) return Promise.resolve();
    const until = (hours === null || hours === undefined)
      ? null
      : Date.now() + Math.max(0, Number(hours)) * 3600 * 1000;
    cache = { ...cache, [h]: { until } };
    return new Promise(resolve => {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: { ...cache } }, resolve);
      } catch (_) { resolve(); }
    });
  }

  // Snapshot of every currently-active paused host (for the settings list).
  // Prunes expired timed entries in passing. Returns [{host, until}] where
  // until is null for indefinite pauses.
  function listPaused() {
    const out = [];
    let mutated = false;
    for (const h of Object.keys(cache)) {
      const entry = cache[h];
      if (isActiveEntry(entry)) {
        out.push({ host: h, until: entry.until === null || entry.until === undefined ? null : Number(entry.until) });
      } else {
        delete cache[h];
        mutated = true;
      }
    }
    if (mutated) {
      try { chrome.storage.local.set({ [STORAGE_KEY]: { ...cache } }); } catch (_) {}
    }
    return out;
  }

  function resume(host) {
    const h = host || currentHost();
    if (!h) return Promise.resolve();
    const next = { ...cache };
    delete next[h];
    cache = next;
    return new Promise(resolve => {
      try {
        chrome.storage.local.set({ [STORAGE_KEY]: { ...cache } }, resolve);
      } catch (_) { resolve(); }
    });
  }

  function onChange(cb) {
    if (typeof cb !== 'function') return () => {};
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function notify() {
    for (const cb of listeners) {
      try { cb(); } catch (_) {}
    }
  }

  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      cache = changes[STORAGE_KEY].newValue || {};
      notify();
    });
  } catch (_) { /* outside extension context */ }

  // Kick off hydration immediately; readers can poll `hydrated` if they want
  // a guarantee, but isPausedNow() returning false on a not-yet-hydrated
  // surface is fine — the worst case is one cycle of stale "not paused"
  // before the storage callback fires.
  hydrate();

  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiPause = {
    isPausedNow,
    getPauseFor,
    pause,
    resume,
    listPaused,
    onChange,
    isHydrated: () => hydrated,
    waitHydrated: () => hydrated ? Promise.resolve() : hydrate(),
  };
})();
