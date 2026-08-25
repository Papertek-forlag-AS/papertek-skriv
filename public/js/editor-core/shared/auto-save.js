/**
 * Auto-save module.
 * Debounced save with status indicator and beforeunload handler.
 * Portable: can be used in any app with a save function and status display.
 *
 * Usage:
 *   import { createAutoSave } from './auto-save.js';
 *   const saver = createAutoSave({
 *       saveFn: async (data) => { ... },
 *       getState: () => ({ html, title, ... }),
 *       statusEl: document.querySelector('#save-status'),
 *       debounceMs: 1000,
 *       labels: { saving: 'Lagrer...', saved: 'Lagret', error: 'Feil' },
 *   });
 *   saver.schedule();   // schedule a debounced save
 *   saver.saveNow();    // save immediately
 *   saver.destroy();    // cleanup
 */

/**
 * @param {Object} opts
 * @param {Function} opts.saveFn - Async function that receives state and persists it
 * @param {Function} opts.getState - Returns the current state to save
 * @param {HTMLElement} [opts.statusEl] - Element to show save status
 * @param {number} [opts.debounceMs=1000] - Debounce interval
 * @param {{ saving: string, saved: string, error: string }} [opts.labels]
 * @param {Function} [opts.onError] - Called with the error when a save fails
 *   (once per failure streak, so the caller can alert loudly without spam)
 * @returns {{ schedule: Function, saveNow: Function, destroy: Function }}
 */
export function createAutoSave({ saveFn, getState, statusEl, debounceMs = 1000, labels = {}, onError }) {
    const {
        saving = 'Lagrer...',
        saved  = 'Lagret',
        error  = 'Feil',
    } = labels;

    let timer = null;
    let lastSavedHash = '';
    let failing = false;

    function setStatus(html, clearAfter = 0) {
        if (!statusEl) return;
        statusEl.innerHTML = html;
        if (clearAfter > 0) {
            setTimeout(() => {
                if (statusEl.innerHTML === html) {
                    statusEl.innerHTML = '';
                }
            }, clearAfter);
        }
    }

    function checkOffline() {
        if (!navigator.onLine && labels.offline) {
            setStatus(labels.offline);
        } else if (navigator.onLine && statusEl && statusEl.innerHTML === labels.offline) {
            setStatus(labels.saved);
        }
    }

    window.addEventListener('offline', checkOffline);
    window.addEventListener('online', checkOffline);

    async function saveNow() {
        if (timer) { clearTimeout(timer); timer = null; }

        const state = getState();
        const hash = JSON.stringify(state);

        // Skip if nothing changed
        if (hash === lastSavedHash) return;

        setStatus(saving);

        try {
            await saveFn(state);
            lastSavedHash = hash;
            failing = false;
            setStatus(saved, 2000);
        } catch (err) {
            console.error('Auto-save failed:', err);
            setStatus(error);
            // Alert loudly on the first failure of a streak — a pupil can
            // otherwise type for a long time into a store that is throwing
            // (e.g. quota exceeded) with only a subtle status change.
            if (!failing) {
                failing = true;
                if (onError) {
                    try { onError(err); } catch (_) { /* alerts must not break saving */ }
                }
            }
        }
    }

    function schedule() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(saveNow, debounceMs);
    }

    // Save on page unload. beforeunload cannot await an async IndexedDB
    // write, so also flush as soon as the tab is hidden — that runs the
    // write while the page is still alive and covers most closes.
    function onBeforeUnload() {
        saveNow();
    }
    function onVisibilityChange() {
        if (document.visibilityState === 'hidden') saveNow();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
    }

    function destroy() {
        if (timer) clearTimeout(timer);
        window.removeEventListener('beforeunload', onBeforeUnload);
        if (typeof document !== 'undefined') {
            document.removeEventListener('visibilitychange', onVisibilityChange);
        }
    }

    /**
     * Set the initial hash so we don't save unchanged state.
     */
    function setInitialHash(state) {
        lastSavedHash = JSON.stringify(state);
    }

    return { schedule, saveNow, destroy, setInitialHash };
}
