import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoSave } from '../public/js/editor-core/shared/auto-save.js';

function createEventTarget() {
    const listeners = new Map();
    return {
        addEventListener(type, listener) {
            if (!listeners.has(type)) listeners.set(type, new Set());
            listeners.get(type).add(listener);
        },
        removeEventListener(type, listener) {
            listeners.get(type)?.delete(listener);
        },
        dispatch(type, event = {}) {
            for (const listener of listeners.get(type) || []) listener(event);
        },
        listenerCount(type) {
            return listeners.get(type)?.size || 0;
        },
    };
}

function installBrowserGlobals() {
    const originalDescriptors = new Map(
        ['window', 'document', 'navigator'].map((key) => [
            key,
            Object.getOwnPropertyDescriptor(globalThis, key),
        ])
    );
    const windowTarget = createEventTarget();
    const documentTarget = createEventTarget();
    documentTarget.visibilityState = 'visible';

    Object.defineProperty(globalThis, 'window', {
        value: windowTarget,
        configurable: true,
        writable: true,
    });
    Object.defineProperty(globalThis, 'document', {
        value: documentTarget,
        configurable: true,
        writable: true,
    });
    Object.defineProperty(globalThis, 'navigator', {
        value: { onLine: true },
        configurable: true,
        writable: true,
    });

    return {
        windowTarget,
        documentTarget,
        restore() {
            for (const [key, descriptor] of originalDescriptors) {
                if (descriptor) Object.defineProperty(globalThis, key, descriptor);
                else delete globalThis[key];
            }
        },
    };
}

test('createAutoSave saves state and deduplicates identical saves', async () => {
    const browser = installBrowserGlobals();
    const savedStates = [];
    let currentState = { title: 'Test Document', text: 'Hello' };

    try {
        const saver = createAutoSave({
            saveFn: async (state) => {
                savedStates.push(state);
            },
            getState: () => currentState,
            debounceMs: 50,
        });

        assert.equal(await saver.saveNow(), true);
        assert.equal(savedStates.length, 1);
        assert.deepEqual(savedStates[0], { title: 'Test Document', text: 'Hello' });

        assert.equal(await saver.saveNow(), true);
        assert.equal(savedStates.length, 1);

        currentState = { title: 'Updated Document', text: 'Hello World' };
        assert.equal(await saver.saveNow(), true);
        assert.equal(savedStates.length, 2);
        assert.equal(savedStates[1].title, 'Updated Document');

        await saver.destroy();
    } finally {
        browser.restore();
    }
});

test('createAutoSave setInitialHash prevents saving initial unchanged state', async () => {
    const browser = installBrowserGlobals();
    const savedStates = [];
    const initialState = { title: 'Initial', text: 'Content' };

    try {
        const saver = createAutoSave({
            saveFn: async (state) => { savedStates.push(state); },
            getState: () => initialState,
            debounceMs: 50,
        });

        saver.setInitialHash(initialState);
        assert.equal(await saver.saveNow(), true);
        assert.equal(savedStates.length, 0);

        await saver.destroy();
    } finally {
        browser.restore();
    }
});

test('createAutoSave serializes writes and coalesces queued edits to the latest state', async () => {
    const browser = installBrowserGlobals();
    let currentState = { text: 'A' };
    let releaseFirst;
    const firstWrite = new Promise(resolve => { releaseFirst = resolve; });
    const savedTexts = [];
    let activeWrites = 0;
    let maxActiveWrites = 0;

    try {
        const saver = createAutoSave({
            getState: () => currentState,
            saveFn: async (state) => {
                activeWrites += 1;
                maxActiveWrites = Math.max(maxActiveWrites, activeWrites);
                savedTexts.push(state.text);
                if (state.text === 'A') await firstWrite;
                activeWrites -= 1;
            },
        });

        const first = saver.saveNow();
        currentState = { text: 'B' };
        const second = saver.saveNow();
        currentState = { text: 'C' };
        const third = saver.saveNow();

        releaseFirst();
        assert.deepEqual(await Promise.all([first, second, third]), [true, true, true]);
        assert.equal(maxActiveWrites, 1);
        assert.deepEqual(savedTexts, ['A', 'C']);

        await saver.destroy();
    } finally {
        browser.restore();
    }
});

test('createAutoSave retains a failed write for an explicit retry', async () => {
    const browser = installBrowserGlobals();
    const originalConsoleError = console.error;
    let attempts = 0;

    try {
        console.error = () => {};
        const saver = createAutoSave({
            getState: () => ({ text: 'Keep me' }),
            saveFn: async () => {
                attempts += 1;
                if (attempts === 1) throw new Error('temporary storage failure');
            },
        });

        assert.equal(await saver.saveNow(), false);
        assert.equal(saver.isDirty(), true);
        assert.equal(await saver.flush(), true);
        assert.equal(attempts, 2);
        assert.equal(saver.isDirty(), false);

        await saver.destroy();
    } finally {
        console.error = originalConsoleError;
        browser.restore();
    }
});

test('createAutoSave flushes on destroy and removes all lifecycle listeners', async () => {
    const browser = installBrowserGlobals();
    const savedStates = [];

    try {
        const saver = createAutoSave({
            getState: () => ({ text: 'Pending' }),
            saveFn: async state => { savedStates.push(state); },
            debounceMs: 10000,
        });

        saver.schedule();
        assert.equal(saver.isDirty(), true);
        assert.equal(await saver.destroy(), true);
        assert.deepEqual(savedStates, [{ text: 'Pending' }]);
        assert.equal(saver.isDirty(), false);

        for (const type of ['offline', 'online', 'beforeunload', 'pagehide']) {
            assert.equal(browser.windowTarget.listenerCount(type), 0, `${type} listener removed`);
        }
        assert.equal(browser.documentTarget.listenerCount('visibilitychange'), 0);
    } finally {
        browser.restore();
    }
});

test('createAutoSave includes an edit made while teardown is flushing', async () => {
    const browser = installBrowserGlobals();
    let state = { text: 'First' };
    let releaseFirst;
    const firstWrite = new Promise(resolve => { releaseFirst = resolve; });
    const savedTexts = [];

    try {
        const saver = createAutoSave({
            getState: () => state,
            saveFn: async current => {
                savedTexts.push(current.text);
                if (current.text === 'First') await firstWrite;
            },
        });

        const destroying = saver.destroy();
        state = { text: 'Typed during flush' };
        saver.schedule();
        releaseFirst();

        assert.equal(await destroying, true);
        assert.deepEqual(savedTexts, ['First', 'Typed during flush']);
    } finally {
        browser.restore();
    }
});

test('createAutoSave protects a dirty page while starting its unload flush', async () => {
    const browser = installBrowserGlobals();
    let saves = 0;

    try {
        const saver = createAutoSave({
            getState: () => ({ text: 'Unsaved' }),
            saveFn: async () => { saves += 1; },
            debounceMs: 10000,
        });
        saver.schedule();

        let prevented = false;
        const event = {
            preventDefault() { prevented = true; },
            returnValue: undefined,
        };
        browser.windowTarget.dispatch('beforeunload', event);
        await saver.flush();

        assert.equal(prevented, true);
        assert.equal(event.returnValue, '');
        assert.equal(saves, 1);
        await saver.destroy();
    } finally {
        browser.restore();
    }
});
