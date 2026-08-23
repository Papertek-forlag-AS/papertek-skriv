import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';

import {
    createMicrosoftDocumentFileName,
    hashMicrosoftDocument,
    isMicrosoftDocumentFile,
    parseMicrosoftDocument,
    serializeMicrosoftDocument,
} from '../public/js/app/microsoft-document-codec.js';
import { serializeLibraryBackup } from '../public/js/app/library-backup.js';

const rootFolder = {
    id: 'folder-root',
    name: 'Norsk',
    parentId: null,
    isSystem: true,
    schoolYear: null,
    sortOrder: 1,
    createdAt: '2026-08-01T08:00:00.000Z',
    microsoft365: { itemId: 'must-not-travel' },
};

const childFolder = {
    id: 'folder-child',
    name: 'Stil',
    parentId: rootFolder.id,
    isSystem: false,
    schoolYear: '2026/2027',
    sortOrder: 2,
    createdAt: '2026-08-02T08:00:00.000Z',
};

const unrelatedFolder = {
    id: 'folder-unrelated',
    name: 'Matematikk',
    parentId: null,
    isSystem: true,
    schoolYear: null,
    sortOrder: 3,
    createdAt: '2026-08-03T08:00:00.000Z',
};

const validMicrosoftLink = {
    version: 1,
    tenantId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    accountBinding: 'a'.repeat(64),
    driveId: 'drive',
    folderId: 'folder',
    folderName: 'Skriv',
    folderWebUrl: 'https://contoso.sharepoint.com/sites/Class/Documents/Skriv',
    remoteDocumentId: 'remote-document',
    itemId: 'remote-item',
    fileName: 'document.skriv',
    webUrl: 'https://contoso.sharepoint.com/sites/Class/Documents/Skriv/document.skriv',
    eTag: 'etag',
    cTag: 'ctag',
    lastSyncedAt: '2026-08-23T12:00:00.000Z',
    lastSyncedHash: 'b'.repeat(64),
    state: 'synced',
    errorCode: null,
    attemptId: null,
};

function documentRecord(overrides = {}) {
    return {
        id: '2ca32d05-e8de-4133-b5d5-d31a124a7a9e',
        title: 'Min tekst',
        html: '<h1>Hei</h1><p>Trygg tekst.</p>',
        plainText: 'Hei Trygg tekst.',
        wordCount: 3,
        writingLanguage: 'nb',
        createdAt: '2026-08-20T10:00:00.000Z',
        updatedAt: '2026-08-23T10:00:00.000Z',
        references: [{ id: 'r1', author: 'Ibsen', title: 'Et dukkehjem' }],
        frameType: 'analyse',
        schoolYear: '2026/2027',
        folderIds: [childFolder.id],
        germanHint: { simple: 'Planlegg', rich: 'Planlegg grundig' },
        subject: null,
        microsoft365: {
            driveId: 'drive-secret-to-this-profile',
            itemId: 'item-secret-to-this-profile',
            eTag: 'etag-secret-to-this-profile',
        },
        ...overrides,
    };
}

test('remote filenames keep a readable safe title and stable short document id', () => {
    const doc = documentRecord({ title: '  Norsk: vår / høst?  ' });
    const first = createMicrosoftDocumentFileName(doc);
    const second = createMicrosoftDocumentFileName({ ...doc });

    assert.equal(first, second);
    assert.match(first, /^Norsk- vår - høst--[a-z0-9]{12}\.skriv$/);
    assert.doesNotMatch(first, /["*:<>?\\|]/);
    assert.match(createMicrosoftDocumentFileName(documentRecord({ title: 'CON' })), /^skriv-CON--/);
    assert.match(createMicrosoftDocumentFileName(documentRecord({ title: '   ' })), /^untitled--/);
    assert.throws(() => createMicrosoftDocumentFileName({ title: 'No ID' }), /invalid-microsoft-document:id/);
});

test('serialization contains one live document and only its folder ancestor closure', () => {
    const sourceDocument = documentRecord();
    const sourceFolders = [unrelatedFolder, childFolder, rootFolder];
    const serialized = serializeMicrosoftDocument(sourceDocument, sourceFolders, {
        createdAt: '2026-08-23T12:00:00.000Z',
    });
    const raw = JSON.parse(serialized);

    assert.equal(raw.format, 'papertek-skriv-backup');
    assert.equal(raw.data.documents.length, 1);
    assert.deepEqual(raw.data.trash, []);
    assert.deepEqual(raw.data.versions, []);
    assert.deepEqual(raw.data.settings, {});
    assert.deepEqual(raw.data.folders.map((folder) => folder.id), [childFolder.id, rootFolder.id]);
    assert.equal('microsoft365' in raw.data.documents[0], false);
    assert.equal('microsoft365' in raw.data.folders[1], false);

    const parsed = parseMicrosoftDocument(serialized);
    assert.equal(parsed.createdAt, '2026-08-23T12:00:00.000Z');
    assert.equal(parsed.document.html, sourceDocument.html);
    assert.deepEqual(parsed.document.references, sourceDocument.references);
    assert.deepEqual(parsed.document.germanHint, sourceDocument.germanHint);
    assert.deepEqual(parsed.folders.map((folder) => folder.id), [childFolder.id, rootFolder.id]);

    assert.deepEqual(sourceDocument.microsoft365, {
        driveId: 'drive-secret-to-this-profile',
        itemId: 'item-secret-to-this-profile',
        eTag: 'etag-secret-to-this-profile',
    }, 'serialization must not mutate the source document');
    assert.deepEqual(rootFolder.microsoft365, { itemId: 'must-not-travel' }, 'serialization must not mutate source folders');
});

test('serialization validates missing ancestors and unsafe document HTML', () => {
    assert.throws(
        () => serializeMicrosoftDocument(documentRecord(), [childFolder]),
        /invalid-microsoft-document:missing-folder/,
    );
    assert.throws(
        () => serializeMicrosoftDocument(documentRecord({ html: '<script>alert(1)</script>' }), [rootFolder, childFolder]),
        /invalid-backup:unsafe-html/,
    );
});

test('parser rejects library backups that are not exactly one native live document', () => {
    const base = documentRecord({ folderIds: [], microsoft365: undefined });
    const serialize = (data) => serializeLibraryBackup({
        documents: [base],
        trash: [],
        folders: [],
        versions: [],
        settings: {},
        ...data,
    }, { createdAt: '2026-08-23T12:00:00.000Z' });

    assert.throws(() => parseMicrosoftDocument(serialize({ documents: [] })), /invalid-microsoft-document:document-count/);
    assert.throws(
        () => parseMicrosoftDocument(serialize({ documents: [base, { ...base, id: 'second' }] })),
        /invalid-microsoft-document:document-count/,
    );
    assert.throws(
        () => parseMicrosoftDocument(serialize({ documents: [], trash: [{ ...base, trashedAt: '2026-08-23T12:00:00.000Z' }] })),
        /invalid-microsoft-document:document-count/,
    );
    assert.throws(
        () => parseMicrosoftDocument(serialize({ settings: { skriv_language: 'nb' } })),
        /invalid-microsoft-document:settings/,
    );
    assert.throws(
        () => parseMicrosoftDocument(serialize({ folders: [unrelatedFolder] })),
        /invalid-microsoft-document:folder-closure/,
    );
    assert.throws(
        () => parseMicrosoftDocument(serialize({
            documents: [{ ...base, microsoft365: validMicrosoftLink }],
        })),
        /invalid-microsoft-document:connector-metadata/,
    );

    const withExtraShape = JSON.parse(serialize({}));
    withExtraShape.data.account = {};
    assert.throws(
        () => parseMicrosoftDocument(JSON.stringify(withExtraShape)),
        /invalid-microsoft-document:data-shape/,
    );
});

test('candidate file detection is extension-based and case insensitive', () => {
    assert.equal(isMicrosoftDocumentFile('Essay--abc123.skriv'), true);
    assert.equal(isMicrosoftDocumentFile({ name: 'Essay.SKRIV' }), true);
    assert.equal(isMicrosoftDocumentFile('Essay.skriv.download'), false);
    assert.equal(isMicrosoftDocumentFile('.skriv'), false);
    assert.equal(isMicrosoftDocumentFile(null), false);
});

test('document hashing is deterministic SHA-256 over exact UTF-8 text', async () => {
    assert.equal(
        await hashMicrosoftDocument('hello', webcrypto),
        '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
    assert.equal(
        await hashMicrosoftDocument('hei på deg', webcrypto.subtle),
        await hashMicrosoftDocument('hei på deg', webcrypto),
    );
    await assert.rejects(() => hashMicrosoftDocument(new Uint8Array(), webcrypto), /invalid-microsoft-document:hash-input/);
    await assert.rejects(() => hashMicrosoftDocument('text', {}), /invalid-microsoft-document:crypto/);
});
