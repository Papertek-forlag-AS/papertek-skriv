import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeIndexedDB, settle } from './helpers/fake-idb.mjs';
import { closeSkrivDatabase, openSkrivDatabase } from '../public/js/app/db.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// The v4 upgrade used to be triplicated across document-store, trash-store
// and folder-store, so the resulting schema depended on module load order.
// db.js now owns the single opener; these tests exercise that one real
// upgrade path against a fake IndexedDB.

/** Fresh fake environment with no connection carried over from a prior test. */
function freshEnv() {
    const env = installFakeIndexedDB();
    closeSkrivDatabase();
    return env;
}

test('fresh install creates the full v4 schema', async () => {
    const env = freshEnv();
    await openSkrivDatabase();
    await settle();
    const dump = env.dump();

    assert.deepEqual(
        Object.keys(dump.stores).sort(),
        ['documents', 'folders', 'trash'],
        'did not create all three object stores'
    );
    assert.deepEqual(
        Object.keys(dump.stores.documents.indexes).sort(),
        ['folderIds', 'schoolYear', 'subject', 'updatedAt'],
        'documents indexes diverge'
    );
    assert.ok(dump.stores.documents.indexes.folderIds.options.multiEntry, 'folderIds must be multiEntry');
    assert.deepEqual(Object.keys(dump.stores.trash.indexes), ['trashedAt'], 'trash indexes diverge');
    assert.deepEqual(
        Object.keys(dump.stores.folders.indexes).sort(),
        ['parentId', 'schoolYear'],
        'folders indexes diverge'
    );
    // 1 personal + 15 subject folders seeded
    assert.equal(dump.stores.folders.rows.length, 16, 'seeded wrong folder count');
    assert.ok(dump.stores.folders.rows.some(f => f.id === 'sys___personal__'), 'missing personal folder');
});

test('db.js is the only place a schema version is declared', () => {
    const dbSource = readFileSync(join(root, 'public', 'js', 'app', 'db.js'), 'utf8');
    assert.match(dbSource, /const DB_VERSION = \d+/, 'db.js must declare the schema version');

    for (const file of ['document-store.js', 'trash-store.js', 'folder-store.js']) {
        const src = readFileSync(join(root, 'public', 'js', 'app', file), 'utf8');
        assert.doesNotMatch(
            src,
            /const DB_VERSION = \d+/,
            `${file} declares its own DB_VERSION — the version belongs to db.js alone`
        );
    }
});

test('v4 cursor walk assigns folderIds from subject on existing documents', async () => {
    // Recreate a v3-era database (documents with subject, no folderIds), then
    // let db.js open it at DB_VERSION 4 so the real 3 → 4 migration walks the
    // records.
    const env = freshEnv();

    const pre = globalThis.indexedDB.open('skriv-documents', 3);
    pre.onupgradeneeded = (e) => {
        const db = e.target.result;
        const docs = db.createObjectStore('documents', { keyPath: 'id' });
        docs.createIndex('updatedAt', 'updatedAt', { unique: false });
        docs.createIndex('subject', 'subject', { unique: false });
        docs.createIndex('schoolYear', 'schoolYear', { unique: false });
        db.createObjectStore('trash', { keyPath: 'id' }).createIndex('trashedAt', 'trashedAt', { unique: false });
    };
    await settle();
    env.store('documents').put({ id: 'doc1', subject: 'Norsk', schoolYear: '2025/2026', updatedAt: '2026-01-01' });
    env.store('documents').put({ id: 'doc2', subject: null, schoolYear: '2025/2026', updatedAt: '2026-01-02' });
    await settle();

    await openSkrivDatabase();
    await settle();

    const dump = env.dump();
    assert.equal(dump.version, 4);
    const doc1 = dump.stores.documents.rows.find(d => d.id === 'doc1');
    const doc2 = dump.stores.documents.rows.find(d => d.id === 'doc2');
    assert.deepEqual(doc1.folderIds, ['sys_norsk'], 'doc with subject should land in the subject folder');
    assert.deepEqual(doc2.folderIds, [], 'doc without subject gets empty folderIds');
});
