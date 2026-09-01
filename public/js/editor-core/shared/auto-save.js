/**
 * Auto-save module.
 * Debounced, serialized saves with a flushable lifecycle.
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
 *   saver.schedule();       // schedule a debounced save
 *   await saver.saveNow();  // save immediately
 *   await saver.flush();    // wait until the latest state is persisted
 *   await saver.destroy();  // flush and clean up listeners
 */

/**
 * @param {Object} opts
 * @param {Function} opts.saveFn - Async function that receives state and persists it
 * @param {Function} opts.getState - Returns the current state to save
 * @param {HTMLElement} [opts.statusEl] - Element to show save status
 * @param {number} [opts.debounceMs=1000] - Debounce interval
 * @param {{ saving: string, saved: string, error: string, offline?: string }} [opts.labels]
 * @param {Function} [opts.onError] - Called with the error when a save fails
 *   (once per failure streak, so the caller can alert loudly without spam)
 * @returns {{ schedule: Function, saveNow: Function, flush: Function, destroy: Function, setInitialHash: Function, isDirty: Function }}
 */
export function createAutoSave({ saveFn, getState, statusEl, debounceMs = 1000, labels = {}, onError }) {
    const {
        saving = 'Lagrer...',
        saved  = 'Lagret',
        error  = 'Feil',
    } = labels;

    const win = typeof window !== 'undefined' ? window : null;
    const doc = typeof document !== 'undefined' ? document : null;

    let timer = null;
    let statusTimer = null;
    let lastSavedHash = '';
    let queuedSave = null;
    let activeHash = null;
    let drainPromise = null;
    let scheduledDirty = false;
    let destroying = false;
    let destroyed = false;
    let destroyPromise = null;
    let failing = false;

    function setStatus(html, clearAfter = 0) {
        if (!statusEl || destroyed) return;
        if (statusTimer) {
            clearTimeout(statusTimer);
            statusTimer = null;
        }
        statusEl.innerHTML = html;
        if (clearAfter > 0) {
            statusTimer = setTimeout(() => {
                statusTimer = null;
                if (!destroyed && statusEl.innerHTML === html) {
                    statusEl.innerHTML = '';
                }
            }, clearAfter);
        }
    }

    function checkOffline() {
        if (typeof navigator === 'undefined') return;
        if (!navigator.onLine && labels.offline) {
            setStatus(labels.offline);
        } else if (navigator.onLine && statusEl && statusEl.innerHTML === labels.offline) {
            setStatus(labels.saved);
        }
    }

    function clearScheduledSave() {
        if (!timer) return;
        clearTimeout(timer);
        timer = null;
    }

    /**
     * Capture the latest state. If a write is already active, even a state
     * equal to the previously saved state may need to be queued because the
     * active write is about to replace it.
     */
    function queueLatestState() {
        const state = getState();
        const hash = JSON.stringify(state);
        scheduledDirty = false;

        if (activeHash !== null) {
            if (hash === activeHash) {
                // The active write already represents the latest state.
                queuedSave = null;
            } else if (!queuedSave || queuedSave.hash !== hash) {
                queuedSave = { state, hash };
            }
            return;
        }

        if (hash === lastSavedHash) {
            queuedSave = null;
        } else if (!queuedSave || queuedSave.hash !== hash) {
            queuedSave = { state, hash };
        }
    }

    async function drainQueue() {
        let allSaved = true;

        while (queuedSave) {
            const current = queuedSave;
            queuedSave = null;
            activeHash = current.hash;
            setStatus(saving);

            try {
                await saveFn(current.state);
                lastSavedHash = current.hash;
                failing = false;
            } catch (err) {
                console.error('Auto-save failed:', err);
                // Preserve the newest state for a later retry. If nothing
                // newer arrived while this write ran, retry this state.
                if (!queuedSave) queuedSave = current;
                setStatus(error);
                // Once per failure streak, so the caller can alert loudly
                // without spamming on every retry.
                if (!failing) {
                    failing = true;
                    if (onError) {
                        try { onError(err); } catch (_) { /* alerts must not break saving */ }
                    }
                }
                allSaved = false;
                break;
            } finally {
                activeHash = null;
            }
        }

        if (allSaved) setStatus(saved, 2000);
        return allSaved;
    }

    function startDrain() {
        if (!queuedSave) return drainPromise || Promise.resolve(true);
        if (drainPromise) return drainPromise;

        drainPromise = drainQueue().finally(() => {
            drainPromise = null;
        });
        return drainPromise;
    }

    async function saveNow() {
        if (destroyed) return true;
        clearScheduledSave();
        queueLatestState();
        return startDrain();
    }

    function schedule() {
        if (destroyed) return;
        scheduledDirty = true;

        // Teardown is already awaiting the active drain. Capture edits made
        // during that short window immediately so they join the same drain
        // instead of being stranded behind a new debounce timer.
        if (destroying) {
            void saveNow();
            return;
        }

        clearScheduledSave();
        timer = setTimeout(() => {
            timer = null;
            void saveNow();
        }, debounceMs);
    }

    function isDirty() {
        return scheduledDirty || timer !== null || queuedSave !== null || activeHash !== null || drainPromise !== null;
    }

    // Browsers cannot await async storage from beforeunload. Start the flush,
    // and request the native leave-page confirmation while work is pending.
    function onBeforeUnload(event) {
        if (!isDirty()) return;
        void saveNow();
        if (event) {
            event.preventDefault?.();
            event.returnValue = '';
        }
    }

    function onPageHide() {
        if (isDirty()) void saveNow();
    }

    function onVisibilityChange() {
        if (doc?.visibilityState === 'hidden' && isDirty()) {
            void saveNow();
        }
    }

    win?.addEventListener('offline', checkOffline);
    win?.addEventListener('online', checkOffline);
    win?.addEventListener('beforeunload', onBeforeUnload);
    win?.addEventListener('pagehide', onPageHide);
    doc?.addEventListener('visibilitychange', onVisibilityChange);

    /** Wait until the latest editor state has been persisted. */
    function flush() {
        return saveNow();
    }

    /** Flush pending work, then remove every listener owned by this instance. */
    function destroy() {
        if (destroyPromise) return destroyPromise;
        destroying = true;

        destroyPromise = (async () => {
            const didSave = await flush();
            if (!didSave) {
                // Keep the instance alive so the caller can remain on the
                // editor screen and retry instead of silently losing work.
                destroying = false;
                destroyPromise = null;
                return false;
            }

            win?.removeEventListener('offline', checkOffline);
            win?.removeEventListener('online', checkOffline);
            win?.removeEventListener('beforeunload', onBeforeUnload);
            win?.removeEventListener('pagehide', onPageHide);
            doc?.removeEventListener('visibilitychange', onVisibilityChange);

            destroyed = true;
            clearScheduledSave();
            if (statusTimer) {
                clearTimeout(statusTimer);
                statusTimer = null;
            }
            return didSave;
        })();

        return destroyPromise;
    }

    /** Set the initial hash so unchanged loaded state is not saved. */
    function setInitialHash(state) {
        lastSavedHash = JSON.stringify(state);
        queuedSave = null;
        scheduledDirty = false;
    }

    return { schedule, saveNow, flush, destroy, setInitialHash, isDirty };
}
