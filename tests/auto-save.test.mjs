import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoSave } from '../public/js/editor-core/shared/auto-save.js';

test('createAutoSave saves state and deduplicates identical saves', async () => {
    const savedStates = [];
    let currentState = { title: 'Test Document', text: 'Hello' };

    // Mock window event listener registration
    globalThis.window = {
        addEventListener() {},
        removeEventListener() {},
    };

    try {
        const saver = createAutoSave({
            saveFn: async (state) => {
                savedStates.push(state);
            },
            getState: () => currentState,
            debounceMs: 50,
        });

        // First save should execute
        await saver.saveNow();
        assert.equal(savedStates.length, 1);
        assert.deepEqual(savedStates[0], { title: 'Test Document', text: 'Hello' });

        // Second save with identical state should be skipped
        await saver.saveNow();
        assert.equal(savedStates.length, 1);

        // Modify state and save again -> should execute
        currentState = { title: 'Updated Document', text: 'Hello World' };
        await saver.saveNow();
        assert.equal(savedStates.length, 2);
        assert.equal(savedStates[1].title, 'Updated Document');

        saver.destroy();
    } finally {
        delete globalThis.window;
    }
});

test('createAutoSave setInitialHash prevents saving initial unchanged state', async () => {
    const savedStates = [];
    const initialState = { title: 'Initial', text: 'Content' };

    globalThis.window = {
        addEventListener() {},
        removeEventListener() {},
    };

    try {
        const saver = createAutoSave({
            saveFn: async (state) => { savedStates.push(state); },
            getState: () => initialState,
            debounceMs: 50,
        });

        saver.setInitialHash(initialState);

        // Immediate save should be skipped because hash matches initial hash
        await saver.saveNow();
        assert.equal(savedStates.length, 0);

        saver.destroy();
    } finally {
        delete globalThis.window;
    }
});
