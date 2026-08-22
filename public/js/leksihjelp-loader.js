/**
 * Skriv ↔ Leksihjelp loader.
 *
 * Runs as a classic <script> tag in index.html BEFORE every vendored
 * leksihjelp module under /js/leksihjelp/. Two responsibilities:
 *
 *   1. Provide a minimal `chrome.*` API shim so the vendored extension
 *      content scripts run in Skriv's plain-page context. The vendored
 *      modules use:
 *        - `chrome.runtime.getURL(p)`       → bundled JSON paths
 *        - `chrome.runtime.id`              → "is this a real extension?"
 *        - `chrome.runtime.sendMessage`     → cross-script broadcast
 *        - `chrome.runtime.onMessage`       → broadcast subscription
 *        - `chrome.storage.local.{get,set}` → settings (lang.spellcheck etc.)
 *        - `chrome.storage.onChanged`       → live setting reactivity
 *      The shim is in-memory only (no IndexedDB); persistence is the
 *      bridge's responsibility (localStorage).
 *
 *   2. Expose `window.__skrivLeksihjelpShim.bindBridge(bridgeApi)` and
 *      `unbindBridge(bridgeApi)` for `app/leksihjelp-bridge.js` to wire
 *      lifecycle-safe two-way sync between the bridge's settings
 *      (writingLang / lookupLang / examMode) and the
 *      keys the vendored renderer reads (`lang.spellcheck` /
 *      `lang.dictionary` / `examMode`).
 *
 * Important: this loader does NOT set `chrome.runtime.id`. The vendored
 * `vocab-seam.js` relies on that being absent to skip publishing
 * `__lexiPresent = 'extension'` — which is exactly what we want, so
 * Skriv's bridge correctly identifies its own seam as `embedded`, not
 * `extension`. See docs/leksihjelp-integration.md §3.4.
 *
 * Reference: lockdown's `public/js/leksihjelp-loader.js` is the
 * older/heavier sibling of this file (full TTS proxy + Vipps subscription
 * + IndexedDB cache). Skriv's version is intentionally minimal — vocab
 * data is bundled and served from the SW cache, so we don't need IDB.
 */

(function () {
    'use strict';

    if (typeof window === 'undefined') return;
    if (window.__skrivLeksihjelpShim) return; // idempotent

    const ASSET_BASE = '/js/leksihjelp';

    // ── In-memory storage ────────────────────────────────────────────
    // Seeded with reasonable defaults. The bridge mirrors writingLang →
    // lang.spellcheck and lookupLang → lang.dictionary on `bindBridge`,
    // so by the time the renderer reads these (after init), they reflect
    // the student's actual settings.
    const _store = {
        // Per-surface language keys (Phase 43, leksihjelp ≥ v3.0):
        'lang.dictionary': 'nb',
        'lang.spellcheck': 'nb',
        'lang.prediction': 'nb',
        'lang.widget':     'nb',
        // Legacy single-key (some older code paths still read this):
        'language': 'nb',
        // Spell-check feature flags:
        'spellCheckEnabled': true,
        'spellCheckAlternatesVisible': true,
        // Word prediction is extension-only in Skriv — keep off so any
        // residual code paths in the vendored bundle stay quiet.
        'predictionEnabled': false,
        // Exam mode (mirrored from bridge.examMode):
        'examMode': false,
        // Auth flag — we have no Vipps in Skriv. Renderer paths that
        // gate on this just see an unauthenticated user.
        'isAuthenticated': false,
    };

    const _storageListeners = [];
    const _messageListeners = [];

    function _emitStorageChange(changes, area) {
        for (const fn of _storageListeners) {
            try { fn(changes, area); } catch (e) { console.warn('[leksihjelp-shim] storage listener threw', e); }
        }
    }

    function _writeStore(data) {
        const changes = {};
        for (const [k, v] of Object.entries(data)) {
            if (_store[k] === v) continue; // skip no-op writes
            changes[k] = { oldValue: _store[k], newValue: v };
            _store[k] = v;
        }
        if (Object.keys(changes).length > 0) {
            _emitStorageChange(changes, 'local');
        }
    }

    // ── Chrome API shim ──────────────────────────────────────────────
    // Note: do NOT set chrome.runtime.id. Its absence is how vocab-seam.js
    // distinguishes "real extension" (sets __lexiPresent = 'extension')
    // from "embedded webapp" (sentinel stays unset). See L-3 in the
    // integration handoff.
    if (!window.chrome) window.chrome = {};
    if (!window.chrome.runtime) window.chrome.runtime = {};
    if (!window.chrome.storage) window.chrome.storage = {};

    Object.assign(window.chrome.runtime, {
        // chrome.runtime.id is intentionally undefined.
        getURL(path) {
            // Strip a leading slash so '/data/x.json' and 'data/x.json'
            // both resolve cleanly.
            const clean = String(path).replace(/^\/+/, '');
            return `${ASSET_BASE}/${clean}`;
        },
        sendMessage(msg, cb) {
            // Broadcast to in-page listeners. The vendored seam emits
            // `lexi:hydration` here; spell-check + dictionary listen.
            // sendMessage in the extension is fire-and-forget for the
            // sender; we mirror that by ignoring the cb beyond invoking
            // it with no response (some callers expect a response).
            const respond = typeof cb === 'function' ? cb : null;
            queueMicrotask(() => {
                for (const fn of _messageListeners) {
                    try { fn(msg, { id: 'skriv' }, () => {}); }
                    catch (e) { console.warn('[leksihjelp-shim] message listener threw', e); }
                }
                if (respond) respond();
            });
        },
        onMessage: {
            addListener(fn) {
                if (typeof fn !== 'function') return;
                _messageListeners.push(fn);
            },
            removeListener(fn) {
                const i = _messageListeners.indexOf(fn);
                if (i !== -1) _messageListeners.splice(i, 1);
            },
            hasListener(fn) {
                return _messageListeners.indexOf(fn) !== -1;
            },
        },
        get lastError() { return null; },
    });

    Object.assign(window.chrome.storage, {
        local: {
            get(keys, cb) {
                const out = {};
                if (keys == null) {
                    Object.assign(out, _store);
                } else if (typeof keys === 'string') {
                    if (keys in _store) out[keys] = _store[keys];
                } else if (Array.isArray(keys)) {
                    for (const k of keys) if (k in _store) out[k] = _store[k];
                } else if (typeof keys === 'object') {
                    // {keyA: defaultA, keyB: defaultB} shape — chrome falls
                    // back to the default if the key is absent.
                    for (const [k, fallback] of Object.entries(keys)) {
                        out[k] = (k in _store) ? _store[k] : fallback;
                    }
                }
                if (typeof cb === 'function') cb(out);
                return Promise.resolve(out);
            },
            set(data, cb) {
                _writeStore(data || {});
                if (typeof cb === 'function') cb();
                return Promise.resolve();
            },
            remove(keys, cb) {
                const ks = Array.isArray(keys) ? keys : [keys];
                const changes = {};
                for (const k of ks) {
                    if (k in _store) {
                        changes[k] = { oldValue: _store[k], newValue: undefined };
                        delete _store[k];
                    }
                }
                if (Object.keys(changes).length > 0) {
                    _emitStorageChange(changes, 'local');
                }
                if (typeof cb === 'function') cb();
                return Promise.resolve();
            },
        },
        onChanged: {
            addListener(fn) {
                if (typeof fn !== 'function') return;
                _storageListeners.push(fn);
            },
            removeListener(fn) {
                const i = _storageListeners.indexOf(fn);
                if (i !== -1) _storageListeners.splice(i, 1);
            },
            hasListener(fn) {
                return _storageListeners.indexOf(fn) !== -1;
            },
        },
    });

    // ── Bridge binder ────────────────────────────────────────────────
    // The Skriv-side bridge calls `bindBridge(api)` after it has loaded
    // settings from localStorage. Two-way sync from then on:
    //   bridge → shim store: when the user changes Skrivespråk in the
    //     settings drawer, write to lang.spellcheck so the renderer
    //     re-runs in the new language.
    //   shim store → bridge: when the renderer auto-detects a language
    //     and writes back to lang.spellcheck, push that value into the
    //     bridge so it persists in localStorage.
    //
    // Mapping:
    //   bridge.writingLang  ↔ store['lang.spellcheck']
    //   bridge.lookupLang   ↔ store['lang.dictionary']
    //   bridge.examMode     ↔ store['examMode']
    let _boundBridge = null;
    let _bridgeUnsubscribers = [];
    let _storeToBridgeListener = null;

    function unbindBridge(bridge) {
        if (bridge && bridge !== _boundBridge) return;

        for (const unsubscribe of _bridgeUnsubscribers) {
            try { unsubscribe(); } catch (_) { /* bridge may already be destroyed */ }
        }
        _bridgeUnsubscribers = [];

        if (_storeToBridgeListener) {
            const index = _storageListeners.indexOf(_storeToBridgeListener);
            if (index !== -1) _storageListeners.splice(index, 1);
            _storeToBridgeListener = null;
        }

        _boundBridge = null;
    }

    function bindBridge(bridge) {
        if (!bridge || bridge === _boundBridge) return;

        // Each editor owns its own bridge instance. Rebind when navigation
        // opens another document so the embedded spell-check follows that
        // document's language instead of the first document opened this page.
        unbindBridge();
        _boundBridge = bridge;

        // Initial sync: bridge → shim. The shim was seeded with 'nb'
        // defaults; replace with the bridge's localStorage-persisted
        // values so renderer reads the right language on first hydration.
        // spellCheckEnabled mirrors bridge.status: when the leksihjelp
        // Chrome extension is detected on the page, the embedded renderer
        // yields to it (writing spellCheckEnabled=false flips the
        // already-running renderer off via chrome.storage.onChanged).
        _writeStore({
            'lang.spellcheck':  bridge.getWritingLang(),
            'lang.dictionary':  bridge.getLookupLang(),
            'examMode':         bridge.getExamMode(),
            'spellCheckEnabled': bridge.getStatus() !== 'extension',
            // Surfaces that Skriv doesn't drive but the renderer reads —
            // mirror writingLang so they stay coherent.
            'lang.prediction':  bridge.getWritingLang(),
            'lang.widget':      bridge.getWritingLang(),
            'language':         bridge.getWritingLang(),
        });

        // Bridge → shim
        _bridgeUnsubscribers.push(bridge.onWritingLangChange((lang) => {
            _writeStore({
                'lang.spellcheck': lang,
                'lang.prediction': lang,
                'lang.widget':     lang,
                'language':        lang,
            });
        }));
        _bridgeUnsubscribers.push(bridge.onLookupLangChange((lang) => {
            _writeStore({ 'lang.dictionary': lang });
        }));
        _bridgeUnsubscribers.push(bridge.onExamModeChange((on) => {
            _writeStore({ 'examMode': !!on });
        }));
        _bridgeUnsubscribers.push(bridge.onStatusChange((status) => {
            // Embedded renderer stays live in 'absent' (no leksihjelp anywhere
            // — Skriv IS leksihjelp here) and 'embedded' (Skriv's own copy).
            // It only stands down when the Chrome extension takes over.
            _writeStore({ 'spellCheckEnabled': status !== 'extension' });
        }));

        // Shim → bridge. The renderer's lang-detect can write back to
        // lang.spellcheck on auto-detect; mirror that into the bridge so
        // it persists across reloads.
        _storeToBridgeListener = (changes) => {
            if (changes['lang.spellcheck'] && changes['lang.spellcheck'].newValue) {
                bridge.setWritingLang(changes['lang.spellcheck'].newValue);
            }
            if (changes['lang.dictionary'] && changes['lang.dictionary'].newValue) {
                bridge.setLookupLang(changes['lang.dictionary'].newValue);
            }
            if (changes['examMode']) {
                bridge.setExamMode(!!changes['examMode'].newValue);
            }
        };
        _storageListeners.push(_storeToBridgeListener);
    }

    // Public surface — keep small.
    window.__skrivLeksihjelpShim = Object.freeze({
        bindBridge,
        unbindBridge,
        get isBound() { return !!_boundBridge; },
        // Expose for debugging/tests; do not document for general use.
        _store,
    });
})();
