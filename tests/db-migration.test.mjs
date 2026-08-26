import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeIndexedDB, settle } from './helpers/fake-idb.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// The v4 migration is deliberately triplicated: whichever of
// document-store, trash-store or folder-store opens the DB first performs
// the FULL upgrade. If one copy drifts, the resulting schema depends on
// module load order — a bug that only shows for some users. These tests
// run each module's real upgrade path against a fake IndexedDB and require
// the outcomes to be identical.

const MODULES = {
    'document-store': { path: '../public/js/app/document-store.js', trigger: (m) => m.listDocuments() },
    'trash-store': { path: '../public/js/app/trash-store.js', trigger: (m) => m.getTrashCount() },
    'folder-store': { path: '../public/js/app/folder-store.js', trigger: (m) => m.getAllFolders() },
};

let cacheBust = 0;

/** Run one module's openDB against a fresh fake environment; return the dump. */
async function migrateWith(moduleKey) {
    const env = installFakeIndexedDB();
    cacheBust += 1;
    const mod = await import(`${MODULES[moduleKey].path}?bust=${cacheBust}`);
    await MODULES[moduleKey].trigger(mod);
    await settle();
    return { env, dump: env.dump() };
}

/** Timestamps differ between runs — strip them before comparing. */
function stripTimestamps(dump) {
    const copy = structuredClone(dump);
    for (const store of Object.values(copy.stores)) {
        for (const row of store.rows) delete row.createdAt;
    }
    return copy;
}

test('fresh install creates the full v4 schema regardless of which store opens first', async () => {
    const dumps = {};
    for (const key of Object.keys(MODULES)) {
        dumps[key] = (await migrateWith(key)).dump;
    }

    for (const [key, dump] of Object.entries(dumps)) {
        assert.deepEqual(
            Object.keys(dump.stores).sort(),
            ['documents', 'folders', 'trash'],
            `${key} did not create all three object stores`
        );
        assert.deepEqual(
            Object.keys(dump.stores.documents.indexes).sort(),
            ['folderIds', 'schoolYear', 'subject', 'updatedAt'],
            `${key} documents indexes diverge`
        );
        assert.ok(dump.stores.documents.indexes.folderIds.options.multiEntry, `${key}: folderIds must be multiEntry`);
        assert.deepEqual(Object.keys(dump.stores.trash.indexes), ['trashedAt'], `${key} trash indexes diverge`);
        assert.deepEqual(
            Object.keys(dump.stores.folders.indexes).sort(),
            ['parentId', 'schoolYear'],
            `${key} folders indexes diverge`
        );
        // 1 personal + 15 subject folders seeded
        assert.equal(dump.stores.folders.rows.length, 16, `${key} seeded wrong folder count`);
        assert.ok(dump.stores.folders.rows.some(f => f.id === 'sys___personal__'), `${key} missing personal folder`);
    }

    // The three migrations must produce IDENTICAL results.
    const [a, b, c] = Object.values(dumps).map(stripTimestamps);
    assert.deepEqual(b, a, 'trash-store migration diverges from document-store');
    assert.deepEqual(c, a, 'folder-store migration diverges from document-store');
});

test('all three stores declare the same DB_VERSION (source-level lock)', () => {
    const versions = {};
    for (const file of ['document-store.js', 'trash-store.js', 'folder-store.js']) {
        const src = readFileSync(join(root, 'public', 'js', 'app', file), 'utf8');
        const m = src.match(/const DB_VERSION = (\d+)/);
        assert.ok(m, `${file}: DB_VERSION not found`);
        versions[file] = Number(m[1]);
    }
    const unique = new Set(Object.values(versions));
    assert.equal(unique.size, 1, `DB_VERSION diverges: ${JSON.stringify(versions)}`);
});

test('v4 cursor walk assigns folderIds from subject on existing documents', async () => {
    // Recreate a v3-era database (documents with subject, no folderIds),
    // then let document-store open it at DB_VERSION 4 so the real
    // oldVersion=3 → 4 migration walks the records.
    const env = installFakeIndexedDB();
    cacheBust += 1;
    const mod = await import(`../public/js/app/document-store.js?bust=${cacheBust}`);

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

    // Now the module opens at DB_VERSION 4 → oldVersion 3 → v4 migration runs.
    await mod.listDocuments();
    await settle();

    const dump = env.dump();
    assert.equal(dump.version, 4);
    const doc1 = dump.stores.documents.rows.find(d => d.id === 'doc1');
    const doc2 = dump.stores.documents.rows.find(d => d.id === 'doc2');
    assert.deepEqual(doc1.folderIds, ['sys_norsk'], 'doc with subject should land in the subject folder');
    assert.deepEqual(doc2.folderIds, [], 'doc without subject gets empty folderIds');
});
