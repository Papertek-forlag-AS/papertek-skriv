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
 * @returns {{ schedule: Function, saveNow: Function, destroy: Function }}
 */
export function createAutoSave({ saveFn, getState, statusEl, debounceMs = 1000, labels = {} }) {
    const {
        saving = 'Lagrer...',
        saved  = 'Lagret',
        error  = 'Feil',
    } = labels;

    let timer = null;
    let lastSavedHash = '';

    function setStatus(text, clearAfter = 0) {
        if (!statusEl) return;
        statusEl.textContent = text;
        if (clearAfter > 0) {
            setTimeout(() => {
                if (statusEl.textContent === text) {
                    statusEl.textContent = '';
                }
            }, clearAfter);
        }
    }

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
            setStatus(saved, 2000);
        } catch (err) {
            console.error('Auto-save failed:', err);
            setStatus(error);
        }
    }

    function schedule() {
        if (timer) clearTimeout(timer);
        timer = setTimeout(saveNow, debounceMs);
    }

    // Save on page unload
    function onBeforeUnload() {
        saveNow();
    }
    window.addEventListener('beforeunload', onBeforeUnload);

    function destroy() {
        if (timer) clearTimeout(timer);
        window.removeEventListener('beforeunload', onBeforeUnload);
    }

    /**
     * Set the initial hash so we don't save unchanged state.
     */
    function setInitialHash(state) {
        lastSavedHash = JSON.stringify(state);
    }

    return { schedule, saveNow, destroy, setInitialHash };
}
