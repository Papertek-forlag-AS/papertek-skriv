import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeIndexedDB, settle } from './helpers/fake-idb.mjs';

// The trash lifecycle against the module's real IndexedDB code:
// trashDocument stamps retention metadata, restoreDocument strips it,
// purgeExpired deletes exactly the expired documents.

let cacheBust = 0;
async function freshTrashStore() {
    const env = installFakeIndexedDB();
    cacheBust += 1;
    const mod = await import(`../public/js/app/trash-store.js?bust=${cacheBust}`);
    return { env, mod };
}

test('trashDocument stamps trashedAt + expiresAt 30 days out and moves the doc', async () => {
    const { env, mod } = await freshTrashStore();
    await mod.getTrashCount(); // trigger openDB/migration
    await settle();
    env.store('documents').put({ id: 'd1', title: 'Min tekst', updatedAt: '2026-01-01' });
    await settle();

    const before = Date.now();
    const trashed = await mod.trashDocument({ id: 'd1', title: 'Min tekst', updatedAt: '2026-01-01' });
    await settle();

    assert.ok(trashed.trashedAt, 'trashedAt must be stamped');
    assert.ok(trashed.expiresAt, 'expiresAt must be stamped');
    const expectedExpiry = before + mod.getRetentionDays() * 86400000;
    const actualExpiry = new Date(trashed.expiresAt).getTime();
    assert.ok(Math.abs(actualExpiry - expectedExpiry) < 10000, 'expiresAt should be RETENTION_DAYS from now');

    const dump = env.dump();
    assert.equal(dump.stores.documents.rows.length, 0, 'doc must leave the documents store');
    assert.equal(dump.stores.trash.rows.length, 1, 'doc must land in trash');
});

test('restoreDocument strips trash metadata and moves the doc back', async () => {
    const { env, mod } = await freshTrashStore();
    await mod.trashDocument({ id: 'd2', title: 'Angre meg', html: '<p>x</p>' });
    await settle();

    const restored = await mod.restoreDocument('d2');
    await settle();

    assert.equal(restored.trashedAt, undefined, 'trashedAt must not survive restore');
    assert.equal(restored.expiresAt, undefined, 'expiresAt must not survive restore');
    assert.equal(restored.title, 'Angre meg');
    assert.ok(restored.updatedAt, 'restore should refresh updatedAt');

    const dump = env.dump();
    assert.equal(dump.stores.trash.rows.length, 0);
    assert.equal(dump.stores.documents.rows.length, 1);
    assert.equal(dump.stores.documents.rows[0].trashedAt, undefined, 'stored doc must not carry trash metadata');
});

test('purgeExpired deletes only documents past their expiresAt', async () => {
    const { env, mod } = await freshTrashStore();
    await mod.getTrashCount();
    await settle();

    const past = new Date(Date.now() - 86400000).toISOString();
    const future = new Date(Date.now() + 86400000).toISOString();
    env.store('trash').put({ id: 'old', trashedAt: past, expiresAt: past });
    env.store('trash').put({ id: 'fresh', trashedAt: past, expiresAt: future });
    // Legacy row without expiresAt (pre-retention data): documents current
    // behavior — it is never purged.
    env.store('trash').put({ id: 'legacy', trashedAt: past });
    await settle();

    const purged = await mod.purgeExpired();
    await settle();

    assert.equal(purged, 1, 'exactly one expired doc should be purged');
    const ids = env.dump().stores.trash.rows.map(r => r.id).sort();
    assert.deepEqual(ids, ['fresh', 'legacy']);
});

test('emptyTrash clears everything; getTrashCount tracks it', async () => {
    const { env, mod } = await freshTrashStore();
    await mod.trashDocument({ id: 'a', title: 'A' });
    await mod.trashDocument({ id: 'b', title: 'B' });
    await settle();
    assert.equal(await mod.getTrashCount(), 2);

    await mod.emptyTrash();
    await settle();
    assert.equal(await mod.getTrashCount(), 0);
    assert.equal(env.dump().stores.trash.rows.length, 0);
});
