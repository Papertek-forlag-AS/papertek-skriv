import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import {
    MICROSOFT_TARGET_SESSION_KEY,
    MicrosoftStorageError,
    createMicrosoftStorage,
} from '../public/js/app/microsoft-storage.js';
import {
    parseMicrosoftDocument,
    serializeMicrosoftDocument,
} from '../public/js/app/microsoft-document-codec.js';

const CLIENT_ID = '11111111-2222-3333-4444-555555555555';
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SHARE_URL = 'https://contoso.sharepoint.com/:f:/s/Class/token-bearing-share-link';

const ACCOUNT = Object.freeze({
    homeAccountId: 'student-object.school-tenant',
    tenantId: TENANT_ID,
    username: 'student@school.example',
    name: 'Test Student',
});

function createSessionStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        entries() { return Object.fromEntries(values); },
    };
}

function makeDocument(overrides = {}) {
    return {
        id: 'local-doc-1',
        title: 'Min tekst',
        html: '<p>Hei skole</p>',
        plainText: 'Hei skole',
        wordCount: 2,
        writingLanguage: 'nb',
        subject: null,
        folderIds: [],
        schoolYear: '2026/2027',
        createdAt: '2026-08-23T08:00:00.000Z',
        updatedAt: '2026-08-23T09:00:00.000Z',
        ...overrides,
    };
}

function createHarness(overrides = {}) {
    const documents = new Map(
        (overrides.documents || [makeDocument()]).map((doc) => [doc.id, structuredClone(doc)]),
    );
    const trash = new Map(
        (overrides.trash || []).map((doc) => [doc.id, structuredClone(doc)]),
    );
    const saveCalls = [];
    const calls = {
        connect: 0,
        disconnect: 0,
        resolve: [],
        list: [],
        create: [],
        update: [],
        download: [],
    };
    const storage = overrides.storage || createSessionStorage();
    let account = overrides.account === undefined ? { ...ACCOUNT } : overrides.account;
    let createdIndex = 0;
    let remoteIndex = 0;
    let targetItem = overrides.targetItem || {
        id: 'folder-1',
        name: 'Klasse 9A – Skriv',
        folder: { childCount: 0 },
        webUrl: 'https://contoso.sharepoint.com/sites/Class/Documents/Skriv',
        parentReference: { driveId: 'drive-1' },
    };

    const auth = overrides.auth || {
        async getAccount() { return account; },
        async connect() {
            calls.connect += 1;
            account = { ...ACCOUNT };
            return account;
        },
        async disconnect() {
            calls.disconnect += 1;
            account = null;
        },
        async getAccessToken() { return 'not-used-by-fake-graph'; },
    };

    const graph = overrides.graph || {
        async resolveSharedFolder(url) {
            calls.resolve.push(url);
            return structuredClone(targetItem);
        },
        async listSkrivDocuments(target) {
            calls.list.push(structuredClone(target));
            return overrides.remoteList || [];
        },
        async createSkrivDocument(input) {
            calls.create.push(structuredClone(input));
            if (overrides.createError) throw overrides.createError;
            if (overrides.createImplementation) {
                return overrides.createImplementation(input, calls.create.length);
            }
            remoteIndex += 1;
            return {
                id: `remote-${remoteIndex}`,
                name: input.fileName,
                eTag: `etag-${remoteIndex}`,
                cTag: `ctag-${remoteIndex}`,
                webUrl: `https://contoso.sharepoint.com/file-${remoteIndex}`,
                parentReference: { driveId: input.driveId, id: input.folderId },
            };
        },
        async updateSkrivDocument(input) {
            calls.update.push(structuredClone(input));
            if (overrides.updateError) throw overrides.updateError;
            if (overrides.updateImplementation) {
                return overrides.updateImplementation(input, calls.update.length);
            }
            remoteIndex += 1;
            return {
                id: input.itemId,
                name: 'Min tekst--localdoc.skriv',
                eTag: `etag-updated-${remoteIndex}`,
                cTag: `ctag-updated-${remoteIndex}`,
                webUrl: 'https://contoso.sharepoint.com/file-updated',
                parentReference: { driveId: input.driveId, id: 'folder-1' },
            };
        },
        async downloadSkrivDocument(input) {
            calls.download.push(structuredClone(input));
            if (overrides.downloadError) throw overrides.downloadError;
            return structuredClone(overrides.downloaded);
        },
    };

    const dependencies = {
        async getDocument(id) {
            return documents.has(id) ? structuredClone(documents.get(id)) : null;
        },
        async saveDocument(id, updates, options = {}) {
            await overrides.beforeSaveDocument?.({
                documents,
                id,
                updates,
                options,
                saveCalls,
            });
            const existing = documents.get(id);
            if (!existing) throw new Error(`Document ${id} not found`);
            if (options.expectedFields) {
                const unchanged = Object.entries(options.expectedFields).every(
                    ([key, value]) => JSON.stringify(existing[key]) === JSON.stringify(value),
                );
                if (!unchanged) return null;
            }
            const next = {
                ...existing,
                ...structuredClone(updates),
                id,
                updatedAt: options.preserveUpdatedAt
                    ? existing.updatedAt
                    : `2026-08-23T10:00:0${saveCalls.length}.000Z`,
            };
            documents.set(id, next);
            saveCalls.push({ id, updates: structuredClone(updates), options: { ...options } });
            return structuredClone(next);
        },
        async createDocument(title) {
            createdIndex += 1;
            const created = makeDocument({
                id: `imported-local-${createdIndex}`,
                title,
                html: '',
                plainText: '',
                wordCount: 0,
                createdAt: '2026-08-23T10:00:00.000Z',
                updatedAt: '2026-08-23T10:00:00.000Z',
            });
            documents.set(created.id, created);
            return structuredClone(created);
        },
        async listDocuments() {
            return [...documents.values()].map((documentRecord) => structuredClone(documentRecord));
        },
        async listTrashedDocuments() {
            return [...trash.values()].map((documentRecord) => structuredClone(documentRecord));
        },
        async getAllFolders() {
            return structuredClone(overrides.folders || []);
        },
    };
    if (overrides.hashDocument) {
        dependencies.hashMicrosoftDocument = overrides.hashDocument;
    }

    const statuses = [];
    const controller = createMicrosoftStorage({
        config: {
            clientId: CLIENT_ID,
            tenantId: TENANT_ID,
            sharePointHost: 'contoso.sharepoint.com',
            valid: true,
            configured: true,
        },
        auth,
        graph,
        dependencies,
        sessionStorageObject: storage,
        cryptoImplementation: webcrypto,
        now: overrides.now || (() => new Date('2026-08-23T12:00:00.000Z')),
        debounceMs: overrides.debounceMs,
        setTimeoutImpl: overrides.setTimeoutImpl,
        clearTimeoutImpl: overrides.clearTimeoutImpl,
        onStatus: overrides.onStatus || ((event) => statuses.push(event)),
    });

    return {
        controller,
        calls,
        documents,
        trash,
        saveCalls,
        statuses,
        storage,
        graph,
        setAccount(value) { account = value; },
        setTargetItem(value) { targetItem = value; },
    };
}

async function selectDefaultTarget(harness) {
    return harness.controller.selectTarget(SHARE_URL);
}

test('target selection signs in explicitly and stores only canonical folder coordinates', async () => {
    const harness = createHarness({ account: null });
    const target = await selectDefaultTarget(harness);

    assert.equal(harness.calls.connect, 1);
    assert.deepEqual(harness.calls.resolve, [SHARE_URL]);
    assert.deepEqual(target, {
        version: 1,
        tenantId: TENANT_ID,
        driveId: 'drive-1',
        folderId: 'folder-1',
        folderName: 'Klasse 9A – Skriv',
        folderWebUrl: 'https://contoso.sharepoint.com/sites/Class/Documents/Skriv',
    });

    const stored = harness.storage.entries()[MICROSOFT_TARGET_SESSION_KEY];
    assert.deepEqual(JSON.parse(stored), target);
    assert.equal(stored.includes(SHARE_URL), false, 'the pasted sharing URL/token must not persist');
    assert.deepEqual(harness.controller.getTarget(), target);

    harness.controller.clearTarget();
    assert.equal(harness.controller.getTarget(), null);
    assert.equal(MICROSOFT_TARGET_SESSION_KEY in harness.storage.entries(), false);

    harness.storage.setItem(MICROSOFT_TARGET_SESSION_KEY, JSON.stringify({
        ...target,
        sharingUrl: SHARE_URL,
    }));
    assert.equal(harness.controller.getTarget(), null, 'target shape rejects token-bearing extras');
});

test('target selection rejects links and resolved folders outside the school SharePoint host', async () => {
    const externalLink = createHarness();
    await assert.rejects(
        () => externalLink.controller.selectTarget('https://other.sharepoint.com/sites/Class'),
        (error) => error instanceof MicrosoftStorageError
            && error.code === 'folder-host'
            && error.state === 'target-mismatch',
    );
    assert.equal(externalLink.calls.resolve.length, 0, 'foreign links never reach Graph');

    const externalTarget = createHarness({
        targetItem: {
            id: 'folder-external',
            name: 'External',
            folder: {},
            webUrl: 'https://other.sharepoint.com/sites/External/Documents/Skriv',
            parentReference: { driveId: 'drive-external' },
        },
    });
    await assert.rejects(
        () => selectDefaultTarget(externalTarget),
        (error) => error instanceof MicrosoftStorageError && error.code === 'folder-host',
    );
    assert.equal(externalTarget.calls.resolve.length, 1);
    assert.equal(externalTarget.controller.getTarget(), null);
});

test('remote imports require complete selected-folder parent coordinates', async () => {
    for (const [label, parentReference] of [
        ['drive ID', { id: 'folder-1' }],
        ['folder ID', { driveId: 'drive-1' }],
    ]) {
        const harness = createHarness();
        await selectDefaultTarget(harness);
        await assert.rejects(
            harness.controller.importRemoteDocument({
                id: `missing-${label}`,
                name: 'Mangelfull.skriv',
                file: {},
                parentReference,
            }),
            (error) => error instanceof MicrosoftStorageError
                && error.code === 'target-mismatch',
            `missing ${label} must fail closed`,
        );
        assert.equal(harness.calls.download.length, 0);
    }
});

test('explicit first sync creates one native remote file and preserves local writing time', async () => {
    const harness = createHarness();
    await selectDefaultTarget(harness);
    const before = structuredClone(harness.documents.get('local-doc-1'));

    const result = await harness.controller.syncDocument('local-doc-1');

    assert.equal(result.state, 'synced');
    assert.equal(result.linked, true);
    assert.equal(harness.calls.create.length, 1);
    assert.equal(harness.calls.update.length, 0);
    assert.match(harness.calls.create[0].fileName, /^Min tekst--[a-z0-9]{12}\.skriv$/);
    const remote = parseMicrosoftDocument(harness.calls.create[0].content);
    assert.equal(remote.document.id, before.id);
    assert.equal(remote.document.html, before.html);
    assert.equal(remote.createdAt, before.createdAt, 'serialization uses stable document createdAt');

    const saved = harness.documents.get('local-doc-1');
    assert.equal(saved.updatedAt, before.updatedAt, 'metadata saves preserve updatedAt');
    assert.equal(saved.microsoft365.itemId, 'remote-1');
    assert.equal(saved.microsoft365.remoteDocumentId, before.id);
    assert.match(saved.microsoft365.accountBinding, /^[a-f0-9]{64}$/);
    assert.equal('homeAccountId' in saved.microsoft365, false);
    assert.equal('accountLabel' in saved.microsoft365, false);
    assert.equal(saved.microsoft365.lastSyncedAt, '2026-08-23T12:00:00.000Z');
    assert.match(saved.microsoft365.lastSyncedHash, /^[a-f0-9]{64}$/);
    assert.deepEqual(harness.statuses.map((event) => event.state), ['pending', 'synced']);
    assert.ok(harness.saveCalls.every((call) => call.options.preserveUpdatedAt === true));

    const unchanged = await harness.controller.syncDocument('local-doc-1');
    assert.equal(unchanged.state, 'synced');
    assert.equal(harness.calls.create.length, 1, 'unchanged bytes do not upload again');
    assert.equal(harness.calls.update.length, 0);
});

test('an edited linked document updates with the last eTag', async () => {
    const harness = createHarness();
    await selectDefaultTarget(harness);
    await harness.controller.syncDocument('local-doc-1');
    const linked = harness.documents.get('local-doc-1');
    harness.documents.set('local-doc-1', {
        ...linked,
        html: '<p>Hei, redigert skole</p>',
        plainText: 'Hei, redigert skole',
        wordCount: 3,
        updatedAt: '2026-08-23T13:00:00.000Z',
    });

    const result = await harness.controller.syncDocument('local-doc-1');

    assert.equal(result.state, 'synced');
    assert.equal(harness.calls.update.length, 1);
    assert.equal(harness.calls.update[0].itemId, 'remote-1');
    assert.equal(harness.calls.update[0].eTag, 'etag-1');
    assert.equal(parseMicrosoftDocument(harness.calls.update[0].content).document.wordCount, 3);
    assert.equal(harness.documents.get('local-doc-1').updatedAt, '2026-08-23T13:00:00.000Z');
});

test('an edit made during an in-flight upload queues a second pass with the newest text', async () => {
    let releaseFirstUpdate;
    let markFirstUpdateStarted;
    const firstUpdateStarted = new Promise((resolve) => { markFirstUpdateStarted = resolve; });
    const firstUpdateGate = new Promise((resolve) => { releaseFirstUpdate = resolve; });
    const harness = createHarness({
        async updateImplementation(input, callNumber) {
            if (callNumber === 1) {
                markFirstUpdateStarted();
                await firstUpdateGate;
            }
            return {
                id: input.itemId,
                name: 'Min tekst--localdoc.skriv',
                eTag: `etag-update-${callNumber}`,
                cTag: `ctag-update-${callNumber}`,
                webUrl: 'https://contoso.sharepoint.com/file-updated',
                parentReference: { driveId: input.driveId, id: 'folder-1' },
            };
        },
    });
    await selectDefaultTarget(harness);
    await harness.controller.syncDocument('local-doc-1');

    harness.documents.set('local-doc-1', {
        ...harness.documents.get('local-doc-1'),
        html: '<p>Første endring</p>',
        plainText: 'Første endring',
        updatedAt: '2026-08-23T13:00:00.000Z',
    });
    const first = harness.controller.syncDocument('local-doc-1');
    await firstUpdateStarted;

    harness.documents.set('local-doc-1', {
        ...harness.documents.get('local-doc-1'),
        html: '<p>Nyeste endring</p>',
        plainText: 'Nyeste endring',
        updatedAt: '2026-08-23T13:01:00.000Z',
    });
    const queued = harness.controller.syncDocument('local-doc-1');
    releaseFirstUpdate();

    assert.equal((await first).state, 'synced');
    assert.equal((await queued).state, 'synced');
    assert.equal(harness.calls.update.length, 2);
    assert.equal(
        parseMicrosoftDocument(harness.calls.update[1].content).document.html,
        '<p>Nyeste endring</p>',
    );
    assert.equal(harness.calls.update[1].eTag, 'etag-update-1');
    assert.equal(harness.documents.get('local-doc-1').microsoft365.state, 'synced');
    assert.equal(harness.documents.get('local-doc-1').microsoft365.attemptId, null);
});

test('unlinking during an in-flight upload cannot restore the Microsoft link', async () => {
    let releaseUpdate;
    let markUpdateStarted;
    const updateStarted = new Promise((resolve) => { markUpdateStarted = resolve; });
    const updateGate = new Promise((resolve) => { releaseUpdate = resolve; });
    const harness = createHarness({
        async updateImplementation(input) {
            markUpdateStarted();
            await updateGate;
            return {
                id: input.itemId,
                name: 'Min tekst--localdoc.skriv',
                eTag: 'etag-after-unlink',
                cTag: 'ctag-after-unlink',
                webUrl: 'https://contoso.sharepoint.com/file-after-unlink',
                parentReference: { driveId: input.driveId, id: 'folder-1' },
            };
        },
    });
    await selectDefaultTarget(harness);
    await harness.controller.syncDocument('local-doc-1');

    harness.documents.set('local-doc-1', {
        ...harness.documents.get('local-doc-1'),
        html: '<p>Endring før frakobling</p>',
        plainText: 'Endring før frakobling',
        updatedAt: '2026-08-23T13:02:00.000Z',
    });
    const inFlight = harness.controller.syncDocument('local-doc-1');
    await updateStarted;

    const unlinked = await harness.controller.unlinkDocument('local-doc-1');
    releaseUpdate();
    const completed = await inFlight;

    assert.equal(unlinked.state, 'local-only');
    assert.equal(completed.state, 'local-only');
    assert.equal(completed.superseded, true);
    assert.equal(harness.documents.get('local-doc-1').microsoft365, null);
    assert.equal(harness.calls.update.length, 1);
});

test('412 becomes an explicit conflict and keep-both creates and relinks a copy', async () => {
    const conflict = Object.assign(new Error('precondition failed'), {
        status: 412,
        code: 'preconditionFailed',
        kind: 'conflict',
    });
    const harness = createHarness({ updateError: conflict });
    await selectDefaultTarget(harness);
    await harness.controller.syncDocument('local-doc-1');
    const linked = harness.documents.get('local-doc-1');
    harness.documents.set('local-doc-1', {
        ...linked,
        html: '<p>Lokal endring</p>',
        plainText: 'Lokal endring',
        updatedAt: '2026-08-23T13:00:00.000Z',
    });

    const conflicted = await harness.controller.syncDocument('local-doc-1');
    assert.equal(conflicted.state, 'conflict');
    assert.equal(conflicted.link.itemId, 'remote-1');
    assert.equal(conflicted.link.eTag, 'etag-1');
    assert.equal(harness.calls.create.length, 1, 'conflict never silently creates or overwrites');

    const kept = await harness.controller.syncDocument('local-doc-1', {
        conflictStrategy: 'keep-both',
    });
    assert.equal(kept.state, 'synced');
    assert.equal(harness.calls.create.length, 2);
    assert.match(harness.calls.create[1].fileName, /kopi--/);
    assert.equal(kept.link.itemId, 'remote-2');
    assert.equal(kept.link.remoteDocumentId, 'local-doc-1');
});

test('a 409 filename collision offers keep-both recovery for a first upload', async () => {
    const collision = Object.assign(new Error('name already exists'), {
        status: 409,
        code: 'nameAlreadyExists',
        kind: 'conflict',
    });
    const harness = createHarness({
        createImplementation(input, callNumber) {
            if (callNumber === 1) throw collision;
            return {
                id: 'remote-recovered',
                name: input.fileName,
                eTag: 'etag-recovered',
                cTag: 'ctag-recovered',
                webUrl: 'https://contoso.sharepoint.com/recovered',
                parentReference: { driveId: input.driveId, id: input.folderId },
            };
        },
    });
    await selectDefaultTarget(harness);

    const conflicted = await harness.controller.syncDocument('local-doc-1');
    assert.equal(conflicted.state, 'conflict');
    assert.equal(conflicted.link.errorCode, 'nameAlreadyExists');

    const recovered = await harness.controller.syncDocument('local-doc-1', { keepBoth: true });
    assert.equal(recovered.state, 'synced');
    assert.equal(recovered.link.itemId, 'remote-recovered');
    assert.match(harness.calls.create[1].fileName, /kopi--/);
});

test('network failure resolves to metadata state without changing local content', async () => {
    const offline = Object.assign(new Error('offline'), {
        code: 'network-error',
        kind: 'network',
    });
    const harness = createHarness({ createError: offline });
    await selectDefaultTarget(harness);
    const before = structuredClone(harness.documents.get('local-doc-1'));

    const result = await harness.controller.syncDocument('local-doc-1');

    assert.equal(result.state, 'error');
    assert.equal(result.link.errorCode, 'network-error');
    const after = harness.documents.get('local-doc-1');
    assert.equal(after.html, before.html);
    assert.equal(after.plainText, before.plainText);
    assert.equal(after.updatedAt, before.updatedAt);
    assert.equal(harness.calls.create.length, 1);
});

test('account and selected-target mismatches require deliberate recovery', async () => {
    const harness = createHarness();
    await selectDefaultTarget(harness);
    await harness.controller.syncDocument('local-doc-1');

    harness.setAccount({ ...ACCOUNT, homeAccountId: 'different-student.school-tenant' });
    let result = await harness.controller.syncDocument('local-doc-1');
    assert.equal(result.state, 'account-mismatch');
    assert.equal(harness.calls.update.length, 0);

    harness.setAccount({ ...ACCOUNT, tenantId: '' });
    result = await harness.controller.syncDocument('local-doc-1');
    assert.equal(result.state, 'account-mismatch', 'an account without a tenant claim is rejected');
    assert.equal(harness.calls.update.length, 0);

    harness.setAccount({ ...ACCOUNT });
    harness.setTargetItem({
        id: 'folder-2',
        name: 'A different class',
        folder: {},
        webUrl: 'https://contoso.sharepoint.com/sites/Class/Documents/Other',
        parentReference: { driveId: 'drive-2' },
    });
    await harness.controller.selectTarget('https://contoso.sharepoint.com/new-folder-link');
    result = await harness.controller.syncDocument('local-doc-1');
    assert.equal(result.state, 'target-mismatch');
    assert.equal(harness.calls.update.length, 0);
    assert.equal(result.link.driveId, 'drive-1', 'a mismatch never silently rebinds the document');
});

test('remote import validates first, uses a fresh local ID, and intentionally enters cleanup desk', async () => {
    const folder = {
        id: 'foreign-folder',
        name: 'Foreign subject',
        parentId: null,
        isSystem: false,
        schoolYear: null,
        sortOrder: 1,
        createdAt: '2026-08-01T08:00:00.000Z',
    };
    const payloadDocument = makeDocument({
        id: 'remote-payload-id',
        title: 'Fra Teams',
        folderIds: [folder.id],
        schoolYear: '2024/2025',
        subject: 'Engelsk',
        createdAt: '2026-08-20T08:00:00.000Z',
        updatedAt: '2026-08-22T08:00:00.000Z',
    });
    const remoteText = serializeMicrosoftDocument(payloadDocument, [folder], {
        createdAt: payloadDocument.createdAt,
    });
    const remoteItem = {
        id: 'remote-import-1',
        name: 'Fra Teams.skriv',
        eTag: 'etag-import',
        cTag: 'ctag-import',
        webUrl: 'https://contoso.sharepoint.com/imported-file',
        file: { mimeType: 'application/json' },
        parentReference: { driveId: 'drive-1', id: 'folder-1' },
    };
    const harness = createHarness({
        downloaded: { item: remoteItem, text: remoteText },
    });
    await selectDefaultTarget(harness);

    const result = await harness.controller.importRemoteDocument(remoteItem);

    assert.equal(result.state, 'synced');
    assert.equal(result.document.id, 'imported-local-1');
    assert.equal(result.document.title, 'Fra Teams');
    assert.deepEqual(result.document.folderIds, [], 'foreign folder IDs do not bypass cleanup pedagogy');
    assert.equal(result.document.schoolYear, '2026/2027', 'imports enter the current school year');
    assert.equal(result.document.subject, null, 'legacy remote subjects do not bypass folder cleanup');
    assert.equal(result.link.remoteDocumentId, 'remote-payload-id');
    assert.equal(result.link.itemId, 'remote-import-1');
    assert.equal(harness.calls.download.length, 1);

    const invalidHarness = createHarness({
        downloaded: { item: remoteItem, text: '{not valid skriv json' },
    });
    await selectDefaultTarget(invalidHarness);
    const beforeInvalid = invalidHarness.documents.size;
    await assert.rejects(
        () => invalidHarness.controller.importRemoteDocument(remoteItem),
        (error) => error instanceof MicrosoftStorageError
            && error.code === 'invalid-remote-document',
    );
    assert.equal(invalidHarness.documents.size, beforeInvalid, 'invalid input creates no local record');
});

test('repeat remote import reopens one active identity and never aliases a trashed link', async () => {
    const payloadDocument = makeDocument({ id: 'remote-payload-id', title: 'Same Teams file' });
    const remoteText = serializeMicrosoftDocument(payloadDocument, [], {
        createdAt: payloadDocument.createdAt,
    });
    const remoteItem = {
        id: 'remote-repeat-1',
        name: 'Same Teams file.skriv',
        eTag: 'etag-repeat',
        file: { mimeType: 'application/json' },
        webUrl: 'https://contoso.sharepoint.com/repeat-file',
        parentReference: { driveId: 'drive-1', id: 'folder-1' },
    };
    const harness = createHarness({
        downloaded: { item: remoteItem, text: remoteText },
    });
    await selectDefaultTarget(harness);

    const first = await harness.controller.importRemoteDocument(remoteItem);
    const repeated = await harness.controller.importRemoteDocument(remoteItem);
    assert.equal(repeated.alreadyImported, true);
    assert.equal(repeated.document.id, first.document.id);
    assert.equal(harness.calls.download.length, 1, 'the existing local identity is reused before download');
    assert.equal(
        [...harness.documents.values()].filter(doc => doc.microsoft365?.itemId === remoteItem.id).length,
        1,
    );

    harness.documents.delete(first.document.id);
    harness.trash.set(first.document.id, {
        ...first.document,
        trashedAt: '2026-08-23T12:30:00.000Z',
        expiresAt: '2026-09-22T12:30:00.000Z',
    });
    await assert.rejects(
        () => harness.controller.importRemoteDocument(remoteItem),
        (error) => error instanceof MicrosoftStorageError
            && error.code === 'remote-document-in-trash'
            && error.state === 'conflict',
    );
    assert.equal(harness.calls.download.length, 1, 'trash identity is detected before download');
    assert.equal(harness.documents.size, 1, 'only the unrelated original live document remains');
});

test('an interrupted import keeps the acknowledged source item identity for safe recovery', async () => {
    const payloadDocument = makeDocument({ id: 'remote-payload-id', title: 'Recovery import' });
    const remoteText = serializeMicrosoftDocument(payloadDocument, [], {
        createdAt: payloadDocument.createdAt,
    });
    const remoteItem = {
        id: 'remote-recovery-1',
        name: 'Recovery import.skriv',
        eTag: 'etag-recovery',
        cTag: 'ctag-recovery',
        file: { mimeType: 'application/json' },
        webUrl: 'https://contoso.sharepoint.com/recovery-file',
        parentReference: { driveId: 'drive-1', id: 'folder-1' },
    };
    const harness = createHarness({
        downloaded: { item: remoteItem, text: remoteText },
        async hashDocument(value) {
            if (String(value).startsWith('skriv-microsoft-account:')) return 'a'.repeat(64);
            throw new Error('hash-interrupted');
        },
    });
    await selectDefaultTarget(harness);

    await assert.rejects(
        () => harness.controller.importRemoteDocument(remoteItem),
        /hash-interrupted/,
    );
    const interrupted = harness.documents.get('imported-local-1');
    assert.equal(interrupted.microsoft365.itemId, remoteItem.id);
    assert.equal(interrupted.microsoft365.eTag, remoteItem.eTag);
    assert.equal(interrupted.microsoft365.remoteDocumentId, payloadDocument.id);
    assert.equal(interrupted.microsoft365.state, 'pending');
});

test('remote listing is target-scoped and defensively returns only .skriv files', async () => {
    const harness = createHarness({
        remoteList: [
            { id: 'a', name: 'A.skriv', file: {} },
            { id: 'b', name: 'B.SKRIV', file: {} },
            { id: 'c', name: 'notes.docx', file: {} },
            { id: 'd', name: '.skriv', file: {} },
        ],
    });
    await selectDefaultTarget(harness);

    const listed = await harness.controller.listRemoteDocuments();

    assert.deepEqual(listed.map((item) => item.id), ['a', 'b']);
    assert.deepEqual(harness.calls.list[0], harness.controller.getTarget());
});

test('autosave scheduling is opt-in, debounced, non-rejecting, and cancelled on destroy', async () => {
    const timers = new Map();
    let timerId = 0;
    const setTimeoutImpl = (callback) => {
        timerId += 1;
        timers.set(timerId, callback);
        return timerId;
    };
    const clearTimeoutImpl = (id) => timers.delete(id);
    const harness = createHarness({ setTimeoutImpl, clearTimeoutImpl, debounceMs: 2500 });
    await selectDefaultTarget(harness);

    const localOnly = await harness.controller.scheduleDocumentSync('local-doc-1');
    assert.equal(localOnly.state, 'local-only');
    assert.equal(timers.size, 0);
    assert.equal(harness.calls.create.length, 0, 'selecting a target never uploads unrelated documents');

    await harness.controller.syncDocument('local-doc-1');
    const linked = harness.documents.get('local-doc-1');
    harness.documents.set('local-doc-1', {
        ...linked,
        html: '<p>Autosave edit</p>',
        plainText: 'Autosave edit',
        updatedAt: '2026-08-23T14:00:00.000Z',
    });

    const first = harness.controller.scheduleDocumentSync('local-doc-1');
    // Let the async link preflight arm its timer before rescheduling.
    await Promise.resolve();
    const second = harness.controller.scheduleDocumentSync('local-doc-1');
    await Promise.resolve();
    assert.equal(timers.size, 1);
    const callback = [...timers.values()][0];
    timers.clear();
    await callback();
    assert.equal((await first).state, 'synced');
    assert.equal((await second).state, 'synced');
    assert.equal(harness.calls.update.length, 1);

    harness.documents.set('local-doc-1', {
        ...harness.documents.get('local-doc-1'),
        html: '<p>Cancelled edit</p>',
        updatedAt: '2026-08-23T15:00:00.000Z',
    });
    const cancelled = harness.controller.scheduleDocumentSync('local-doc-1');
    await Promise.resolve();
    harness.controller.destroy();
    assert.equal((await cancelled).state, 'cancelled');
    assert.equal(timers.size, 0);
    assert.equal(harness.calls.update.length, 1);
});

test('a scheduled sync cannot recreate a link removed by another controller', async () => {
    const timers = new Map();
    let timerId = 0;
    const harness = createHarness({
        setTimeoutImpl(callback) {
            timerId += 1;
            timers.set(timerId, callback);
            return timerId;
        },
        clearTimeoutImpl(id) { timers.delete(id); },
    });
    await selectDefaultTarget(harness);
    await harness.controller.syncDocument('local-doc-1');
    const remoteCalls = harness.calls.create.length + harness.calls.update.length;

    harness.documents.set('local-doc-1', {
        ...harness.documents.get('local-doc-1'),
        html: '<p>Venter på planlagt synk</p>',
        updatedAt: '2026-08-23T15:05:00.000Z',
    });
    const scheduled = harness.controller.scheduleDocumentSync('local-doc-1');
    await Promise.resolve();
    const callback = [...timers.values()][0];
    assert.equal(typeof callback, 'function');

    // Simulate an explicit unlink committed by a second tab/controller after
    // this controller armed its timer but before the timer executes.
    harness.documents.set('local-doc-1', {
        ...harness.documents.get('local-doc-1'),
        microsoft365: null,
    });
    timers.clear();
    await callback();

    const result = await scheduled;
    assert.equal(result.state, 'local-only');
    assert.equal(result.linked, false);
    assert.equal(harness.documents.get('local-doc-1').microsoft365, null);
    assert.equal(
        harness.calls.create.length + harness.calls.update.length,
        remoteCalls,
        'background work cannot opt a document back into Microsoft storage',
    );
});

test('disconnect clears session target and marks every link needs-sign-in without remote deletion', async () => {
    const harness = createHarness({
        documents: [makeDocument(), makeDocument({ id: 'local-doc-2', title: 'Tekst 2' })],
    });
    await selectDefaultTarget(harness);
    await harness.controller.syncDocument('local-doc-1');
    await harness.controller.syncDocument('local-doc-2');
    const timestamps = new Map(
        [...harness.documents].map(([id, doc]) => [id, doc.updatedAt]),
    );

    await harness.controller.disconnect();

    assert.equal(harness.calls.disconnect, 1);
    assert.equal(harness.controller.getTarget(), null);
    for (const [id, documentRecord] of harness.documents) {
        assert.equal(documentRecord.microsoft365.state, 'needs-sign-in');
        assert.equal(documentRecord.microsoft365.errorCode, 'not-connected');
        assert.equal(documentRecord.updatedAt, timestamps.get(id));
    }
    assert.equal('deleteSkrivDocument' in harness.graph, false, 'the controller has no remote delete path');
});

test('unlink is local-only and status callback failures cannot break a successful sync', async () => {
    const harness = createHarness({
        onStatus() { throw new Error('UI rendering failed'); },
    });
    await selectDefaultTarget(harness);
    const synced = await harness.controller.syncDocument('local-doc-1');
    assert.equal(synced.state, 'synced');
    const remoteCalls = harness.calls.create.length + harness.calls.update.length;
    const timestamp = harness.documents.get('local-doc-1').updatedAt;

    const unlinked = await harness.controller.unlinkDocument('local-doc-1');

    assert.equal(unlinked.state, 'local-only');
    assert.equal(unlinked.linked, false);
    assert.equal(harness.documents.get('local-doc-1').microsoft365, null);
    assert.equal(harness.documents.get('local-doc-1').updatedAt, timestamp);
    assert.equal(harness.calls.create.length + harness.calls.update.length, remoteCalls);
});

test('unlink remains authoritative when sync metadata changes concurrently', async () => {
    let injectConcurrentChange = false;
    const harness = createHarness({
        beforeSaveDocument({ documents, id, updates }) {
            if (!injectConcurrentChange || updates.microsoft365 !== null) return;
            injectConcurrentChange = false;
            const current = documents.get(id);
            documents.set(id, {
                ...current,
                microsoft365: {
                    ...current.microsoft365,
                    state: 'pending',
                    attemptId: 'concurrent-attempt',
                },
            });
        },
    });
    await selectDefaultTarget(harness);
    await harness.controller.syncDocument('local-doc-1');
    injectConcurrentChange = true;

    const result = await harness.controller.unlinkDocument('local-doc-1');

    assert.equal(result.state, 'local-only');
    assert.equal(result.linked, false);
    assert.equal(harness.documents.get('local-doc-1').microsoft365, null);
});
