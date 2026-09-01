/**
 * Skriv ↔ Leksihjelp host config.
 *
 * Runs as a classic <script> after `/js/leksihjelp/embed/host-runtime.js` and
 * before the vendored bundle. It no longer implements a chrome.* shim: that
 * belongs to leksihjelp now (three-layer architecture, phase 9). What is left
 * here is the part only Skriv can know —
 *
 *   1. Skriv's runtime configuration: where the assets live, which settings
 *      the vendored code should start from, and which capabilities this host
 *      does NOT have.
 *   2. `bindBridge(bridgeApi)` / `unbindBridge(bridgeApi)`, the two-way sync
 *      between Skriv's per-document settings (writingLang / lookupLang /
 *      examMode) and the keys the vendored renderer reads
 *      (`lang.spellcheck` / `lang.dictionary` / `examMode`).
 *
 * Two rules this file must keep:
 *
 *   - NEVER set `runtimeId`. Its absence is the sentinel: vocab-seam.js reads
 *     it to decide whether a real extension owns the page. Setting it would
 *     make Skriv's own bridge think the extension is present and stand down.
 *   - Capabilities stay false/null. Skriv promises to send nothing anywhere,
 *     so network, tts and report are off; policySource and identity are
 *     prepared seams that the runtime requires to be null until they are
 *     actually built.
 */

(function () {
    'use strict';

    if (typeof window === 'undefined') return;
    if (window.__skrivLeksihjelpShim) return; // idempotent

    const runtimeApi = window.__lexiHostRuntime;
    if (!runtimeApi || typeof runtimeApi.createHostRuntime !== 'function') {
        console.error('[leksihjelp-loader] embed/host-runtime.js did not load — '
            + 'Leksihjelp will be unavailable. Re-run scripts/sync-leksihjelp.js.');
        return;
    }

    const { createHostRuntime, createMemoryStore } = runtimeApi;

    // Defaults the renderer reads before the bridge binds. bindBridge replaces
    // the language keys with the open document's actual settings.
    //
    // Note the asymmetry in how the vendored gates read these: spell-check and
    // personalization treat a missing key as ON (`!== false`), so switching
    // them off means seeding false explicitly. Word prediction is opt-in, so
    // it is left unseeded rather than seeded false.
    const store = createMemoryStore({
        'lang.dictionary': 'nb',
        'lang.spellcheck': 'nb',
        'lang.prediction': 'nb',
        'lang.widget': 'nb',
        language: 'nb',
        spellCheckEnabled: true,
        spellCheckAlternatesVisible: true,
        // Skriv has no durable per-pupil storage for a personal dictionary or
        // learning state, so keep those controls hidden while ordinary
        // explanations and corrections stay.
        personalizationEnabled: false,
        examMode: false,
        // No accounts in Skriv; renderer paths that gate on this see an
        // unauthenticated user.
        isAuthenticated: false,
    });

    const runtime = createHostRuntime({
        assetBase: '/js/leksihjelp',
        // Written into the generated block by scripts/sync-leksihjelp.js, so
        // the cache-busting version is derived from .version, never hand-held.
        version: () => window.__skrivLeksihjelpVersion || '',
        store,
        capabilities: { network: false, tts: false, report: false },
        // runtimeId is deliberately absent — see the sentinel rule above.
    });

    try {
        runtime.install();
    } catch (err) {
        // install() throws when a real extension already owns chrome.runtime.id.
        // That is the correct outcome: the embed host yields rather than fights.
        console.warn('[leksihjelp-loader] not installing the embedded runtime:', err && err.message);
    }

    // ── Bridge binder ────────────────────────────────────────────────
    // Mapping:
    //   bridge.writingLang  ↔ store['lang.spellcheck']
    //   bridge.lookupLang   ↔ store['lang.dictionary']
    //   bridge.examMode     ↔ store['examMode']
    let _boundBridge = null;
    let _unsubscribers = [];

    function unbindBridge(bridge) {
        if (bridge && bridge !== _boundBridge) return;
        for (const unsubscribe of _unsubscribers) {
            try { unsubscribe(); } catch (_) { /* bridge may already be destroyed */ }
        }
        _unsubscribers = [];
        _boundBridge = null;
    }

    function bindBridge(bridge) {
        if (!bridge || bridge === _boundBridge) return;

        // Each editor owns its own bridge instance. Rebind when navigation
        // opens another document so the embedded spell-check follows that
        // document's language instead of the first one opened this page.
        unbindBridge();
        _boundBridge = bridge;

        // Initial sync: bridge → store. spellCheckEnabled mirrors bridge
        // status — when the Chrome extension is on the page, the embedded
        // renderer stands down; in 'absent' and 'embedded' it stays live.
        runtime.seedSettings({
            'lang.spellcheck': bridge.getWritingLang(),
            'lang.dictionary': bridge.getLookupLang(),
            examMode: bridge.getExamMode(),
            spellCheckEnabled: bridge.getStatus() !== 'extension',
            // Surfaces Skriv doesn't drive but the renderer reads — mirror
            // writingLang so they stay coherent.
            'lang.prediction': bridge.getWritingLang(),
            'lang.widget': bridge.getWritingLang(),
            language: bridge.getWritingLang(),
        });

        // Bridge → store
        _unsubscribers.push(bridge.onWritingLangChange((lang) => {
            runtime.seedSettings({
                'lang.spellcheck': lang,
                'lang.prediction': lang,
                'lang.widget': lang,
                language: lang,
            });
        }));
        _unsubscribers.push(bridge.onLookupLangChange((lang) => {
            runtime.seedSettings({ 'lang.dictionary': lang });
        }));
        _unsubscribers.push(bridge.onExamModeChange((on) => {
            runtime.seedSettings({ examMode: !!on });
        }));
        _unsubscribers.push(bridge.onStatusChange((status) => {
            runtime.seedSettings({ spellCheckEnabled: status !== 'extension' });
        }));

        // Store → bridge. The renderer's lang-detect can write back to
        // lang.spellcheck on auto-detect; mirror that into the bridge so it
        // persists across reloads.
        _unsubscribers.push(runtime.onSettingChange('lang.spellcheck', (value) => {
            if (value) bridge.setWritingLang(value);
        }));
        _unsubscribers.push(runtime.onSettingChange('lang.dictionary', (value) => {
            if (value) bridge.setLookupLang(value);
        }));
        _unsubscribers.push(runtime.onSettingChange('examMode', (value) => {
            bridge.setExamMode(!!value);
        }));
    }

    // Public surface — keep small.
    window.__skrivLeksihjelpShim = Object.freeze({
        bindBridge,
        unbindBridge,
        get isBound() { return !!_boundBridge; },
        // Exposed for debugging/tests; not for general use.
        runtime,
    });
})();
