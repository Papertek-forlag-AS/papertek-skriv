import test from 'node:test';
import assert from 'node:assert/strict';
import {
    VERSION_HISTORY_POLICY,
    deleteSnapshotsForDocument,
    deleteSnapshotsForDocuments,
} from '../public/js/editor-core/student/version-history.js';

function installIndexedDb(records) {
    const original = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
    let closed = false;

    const database = {
        objectStoreNames: { contains: () => true },
        close() { closed = true; },
        transaction() {
            let pendingCursors = 0;
            let completionQueued = false;
            const tx = {
                error: null,
                objectStore() {
                    return {
                        index() {
                            return {
                                openCursor(docId) {
                                    const request = {};
                                    const matches = records.filter(record => record.docId === docId);
                                    let index = 0;
                                    pendingCursors += 1;

                                    const maybeComplete = () => {
                                        if (pendingCursors !== 0 || completionQueued) return;
                                        completionQueued = true;
                                        queueMicrotask(() => tx.oncomplete?.());
                                    };
                                    const advance = () => {
                                        const record = matches[index];
                                        if (!record) {
                                            request.result = null;
                                            request.onsuccess?.();
                                            pendingCursors -= 1;
                                            maybeComplete();
                                            return;
                                        }
                                        request.result = {
                                            delete() {
                                                const recordIndex = records.indexOf(record);
                                                if (recordIndex !== -1) records.splice(recordIndex, 1);
                                            },
                                            continue() {
                                                index += 1;
                                                queueMicrotask(advance);
                                            },
                                        };
                                        request.onsuccess?.();
                                    };
                                    queueMicrotask(advance);
                                    return request;
                                },
                            };
                        },
                    };
                },
            };
            return tx;
        },
    };

    Object.defineProperty(globalThis, 'indexedDB', {
        configurable: true,
        value: {
            open() {
                const request = {};
                queueMicrotask(() => {
                    request.result = database;
                    request.onsuccess?.();
                });
                return request;
            },
        },
    });

    return {
        get closed() { return closed; },
        restore() {
            if (original) Object.defineProperty(globalThis, 'indexedDB', original);
            else delete globalThis.indexedDB;
        },
    };
}

test('version history policy matches its bounded retention contract', () => {
    assert.deepEqual(VERSION_HISTORY_POLICY, {
        snapshotIntervalMs: 5 * 60 * 1000,
        majorWordThreshold: 100,
        maxSnapshotsPerDocument: 50,
    });
});

test('deleteSnapshotsForDocuments removes only snapshots belonging to target documents', async () => {
    const records = [
        { id: 1, docId: 'doc-a' },
        { id: 2, docId: 'doc-b' },
        { id: 3, docId: 'doc-a' },
        { id: 4, docId: 'keep-me' },
    ];
    const fake = installIndexedDb(records);

    try {
        assert.equal(await deleteSnapshotsForDocuments(['doc-a', 'doc-b', 'doc-a']), 3);
        assert.deepEqual(records, [{ id: 4, docId: 'keep-me' }]);
        assert.equal(fake.closed, true);
    } finally {
        fake.restore();
    }
});

test('deleteSnapshotsForDocument is the single-document cleanup API', async () => {
    const records = [{ id: 1, docId: 'gone' }, { id: 2, docId: 'stay' }];
    const fake = installIndexedDb(records);

    try {
        assert.equal(await deleteSnapshotsForDocument('gone'), 1);
        assert.deepEqual(records, [{ id: 2, docId: 'stay' }]);
    } finally {
        fake.restore();
    }
});
