/**
 * Leksihjelp bridge.
 *
 * Skriv-side broker between the editor's UI surfaces and whichever copy
 * of leksihjelp is active on the page. Three modes:
 *
 *   - 'absent'    — no leksihjelp on the page at all. Settings persist
 *                   in localStorage, drive Skriv's own surfaces (e.g. the
 *                   special-chars panel).
 *   - 'embedded'  — Skriv's own vendored copy of leksihjelp loaded from
 *                   public/js/leksihjelp/. window.__lexiVocab is present.
 *                   Settings persist in localStorage AND the seam runs
 *                   spell-check + dictionary inside Skriv.
 *   - 'extension' — the leksihjelp Chrome extension is active on this
 *                   page (window.__lexiPresent === 'extension'). Skriv
 *                   yields entirely; the extension owns the seam, the
 *                   dictionary, the popovers, the settings popup.
 *
 * Detection is conservative: we wait DETECT_GRACE_MS after init for the
 * extension's content scripts to finish injecting. If __lexiPresent is
 * set, status = 'extension'. If __lexiVocab appears without the
 * sentinel, status = 'embedded' (Skriv's own seam). Otherwise 'absent'.
 *
 * The bridge is intentionally NOT an ES module singleton — call
 * initLeksihjelpBridge() once from main.js (or wherever) and pass the
 * returned object around. That keeps the shape testable.
 *
 * Cross-repo contract: see docs/leksihjelp-integration.md, section 6.
 */

const STORAGE = {
    writingLang: 'skriv.leksihjelp.writingLang',
    lookupLang:  'skriv.leksihjelp.lookupLang',
    examMode:    'skriv.leksihjelp.examMode',
};

const SUPPORTED_LANGS = ['nb', 'nn', 'en', 'de', 'es', 'fr'];
const DEFAULT_LANG = 'nb';

const DETECT_GRACE_MS = 250;

function readLang(key) {
    try {
        const v = localStorage.getItem(key);
        return SUPPORTED_LANGS.includes(v) ? v : DEFAULT_LANG;
    } catch (_) {
        return DEFAULT_LANG;
    }
}

function writeLang(key, lang) {
    if (!SUPPORTED_LANGS.includes(lang)) return;
    try { localStorage.setItem(key, lang); } catch (_) { /* ignore */ }
}

function readBool(key) {
    try { return localStorage.getItem(key) === '1'; } catch (_) { return false; }
}

function writeBool(key, on) {
    try { localStorage.setItem(key, on ? '1' : ''); } catch (_) { /* ignore */ }
}

/**
 * Initialise the bridge. Returns the API the rest of Skriv consumes.
 *
 * @param {Object} [options]
 * @param {number} [options.detectGraceMs=250]  Override detection delay (testing only).
 * @returns {{
 *   getStatus(): 'absent'|'embedded'|'extension',
 *   onStatusChange(fn: (status: string) => void): () => void,
 *   getWritingLang(): string,
 *   setWritingLang(lang: string): void,
 *   onWritingLangChange(fn: (lang: string) => void): () => void,
 *   getLookupLang(): string,
 *   setLookupLang(lang: string): void,
 *   onLookupLangChange(fn: (lang: string) => void): () => void,
 *   getExamMode(): boolean,
 *   setExamMode(on: boolean): void,
 *   onExamModeChange(fn: (on: boolean) => void): () => void,
 *   destroy(): void,
 * }}
 */
export function initLeksihjelpBridge(options = {}) {
    const detectGraceMs = options.detectGraceMs ?? DETECT_GRACE_MS;

    let status = 'absent';
    let writingLang = readLang(STORAGE.writingLang);
    let lookupLang = readLang(STORAGE.lookupLang);
    let examMode = readBool(STORAGE.examMode);

    const statusListeners = new Set();
    const writingLangListeners = new Set();
    const lookupLangListeners = new Set();
    const examModeListeners = new Set();

    function emitStatus() { for (const fn of statusListeners) try { fn(status); } catch (_) {} }
    function emitWriting() { for (const fn of writingLangListeners) try { fn(writingLang); } catch (_) {} }
    function emitLookup() { for (const fn of lookupLangListeners) try { fn(lookupLang); } catch (_) {} }
    function emitExam() { for (const fn of examModeListeners) try { fn(examMode); } catch (_) {} }

    function detectStatus() {
        // Sentinel from the extension's content script (leksihjelp task L-3).
        // If set, the extension is the source of truth. We yield without
        // checking __lexiVocab, because the extension may still be hydrating.
        if (typeof window !== 'undefined' && window.__lexiPresent === 'extension') {
            return 'extension';
        }
        // Skriv's own vendored seam? It publishes __lexiVocab too. We treat
        // any __lexiVocab without the sentinel as Skriv's embedded copy.
        if (typeof window !== 'undefined' && window.__lexiVocab) {
            return 'embedded';
        }
        return 'absent';
    }

    function setStatus(next) {
        if (next === status) return;
        status = next;
        emitStatus();
    }

    // Run detection once after the grace period; re-run whenever the
    // window emits a hint that the seam state changed.
    let detectTimer = setTimeout(() => setStatus(detectStatus()), detectGraceMs);

    // The vendored vocab-seam emits chrome.runtime messages with
    // type === 'lexi:hydration'. In a non-extension context those become
    // window-level CustomEvents (the seam's emitter calls
    // chrome.runtime.sendMessage but the call no-ops). To pick up state
    // changes regardless, also listen on a window message channel.
    function onWindowMessage(e) {
        if (!e || !e.data || e.data.type !== 'lexi:hydration') return;
        // A hydration event implies the seam is alive. Re-evaluate status.
        setStatus(detectStatus());
    }
    if (typeof window !== 'undefined') {
        window.addEventListener('message', onWindowMessage);
    }

    // Re-detect on focus — the user may have toggled the extension's
    // pause shortcut (Ctrl/Cmd+Shift+P) while the tab was backgrounded.
    function onFocus() { setStatus(detectStatus()); }
    if (typeof window !== 'undefined') {
        window.addEventListener('focus', onFocus);
    }

    const api = {
        getStatus: () => status,
        onStatusChange(fn) {
            statusListeners.add(fn);
            return () => statusListeners.delete(fn);
        },

        getWritingLang: () => writingLang,
        setWritingLang(lang) {
            if (!SUPPORTED_LANGS.includes(lang) || lang === writingLang) return;
            if (status === 'extension') {
                console.warn('[leksihjelp-bridge] setWritingLang ignored — extension owns settings');
                return;
            }
            writingLang = lang;
            writeLang(STORAGE.writingLang, lang);
            emitWriting();
        },
        onWritingLangChange(fn) {
            writingLangListeners.add(fn);
            return () => writingLangListeners.delete(fn);
        },

        getLookupLang: () => lookupLang,
        setLookupLang(lang) {
            if (!SUPPORTED_LANGS.includes(lang) || lang === lookupLang) return;
            if (status === 'extension') {
                console.warn('[leksihjelp-bridge] setLookupLang ignored — extension owns settings');
                return;
            }
            lookupLang = lang;
            writeLang(STORAGE.lookupLang, lang);
            emitLookup();
        },
        onLookupLangChange(fn) {
            lookupLangListeners.add(fn);
            return () => lookupLangListeners.delete(fn);
        },

        getExamMode: () => examMode,
        setExamMode(on) {
            const next = !!on;
            if (next === examMode) return;
            if (status === 'extension') {
                console.warn('[leksihjelp-bridge] setExamMode ignored — extension owns settings');
                return;
            }
            examMode = next;
            writeBool(STORAGE.examMode, next);
            emitExam();
        },
        onExamModeChange(fn) {
            examModeListeners.add(fn);
            return () => examModeListeners.delete(fn);
        },

        destroy() {
            clearTimeout(detectTimer);
            if (typeof window !== 'undefined') {
                window.removeEventListener('message', onWindowMessage);
                window.removeEventListener('focus', onFocus);
            }
            statusListeners.clear();
            writingLangListeners.clear();
            lookupLangListeners.clear();
            examModeListeners.clear();
        },

        SUPPORTED_LANGS: [...SUPPORTED_LANGS],
    };

    // Wire two-way sync with the chrome.* shim (leksihjelp-loader.js) so the
    // vendored renderer reads `lang.spellcheck` / `lang.dictionary` /
    // `examMode` consistent with the bridge, and renderer-side language
    // auto-detect updates flow back into bridge.localStorage. The shim is
    // a no-op in test environments where window.__skrivLeksihjelpShim isn't
    // set up.
    if (typeof window !== 'undefined'
        && window.__skrivLeksihjelpShim
        && typeof window.__skrivLeksihjelpShim.bindBridge === 'function') {
        try { window.__skrivLeksihjelpShim.bindBridge(api); }
        catch (e) { console.warn('[leksihjelp-bridge] shim bindBridge failed:', e); }
    }

    return api;
}
