import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LibraryRestorePartialError,
    buildLibraryRestorePlan,
    buildVersionRestorePlan,
    initLibraryBackup,
    parseLibraryBackup,
    serializeLibraryBackup,
} from '../public/js/app/library-backup.js';

function libraryData(overrides = {}) {
    return {
        documents: [],
        trash: [],
        folders: [],
        versions: [],
        settings: {},
        ...overrides,
    };
}

function backupText(data) {
    return serializeLibraryBackup(libraryData(data), {
        createdAt: '2026-08-22T20:00:00.000Z',
    });
}

function microsoftLink(overrides = {}) {
    return {
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
        eTag: 'remote-etag',
        cTag: 'remote-ctag',
        lastSyncedAt: '2026-08-23T12:00:00.000Z',
        lastSyncedHash: 'b'.repeat(64),
        state: 'synced',
        errorCode: null,
        attemptId: null,
        ...overrides,
    };
}

test('library backup round-trips all supported stores', () => {
    const data = {
        documents: [{ id: 'doc-1', title: 'Tekst', html: '<p>Hei</p>' }],
        trash: [{ id: 'doc-2', title: 'Slettet' }],
        folders: [{ id: 'sys_norsk', name: 'Norsk' }],
        versions: [{ id: 1, docId: 'doc-1', html: '<p>Før</p>' }],
        settings: { skriv_school_level: 'ungdomsskole' },
    };

    const serialized = serializeLibraryBackup(data, { createdAt: '2026-08-22T20:00:00.000Z' });
    const parsed = parseLibraryBackup(serialized);

    assert.equal(parsed.format, 'papertek-skriv-backup');
    assert.equal(parsed.version, 1);
    assert.equal(parsed.createdAt, '2026-08-22T20:00:00.000Z');
    assert.deepEqual(parsed.data, data);
});

test('library backup rejects arbitrary JSON and unsupported versions', () => {
    assert.throws(() => parseLibraryBackup('{not json'), /invalid-json/);
    assert.throws(() => parseLibraryBackup(JSON.stringify({ format: 'something-else', version: 1 })), /unsupported-backup/);
    assert.throws(() => parseLibraryBackup(JSON.stringify({
        format: 'papertek-skriv-backup',
        version: 2,
        data: {},
    })), /unsupported-backup/);
});

test('library backup validates each collection before restore', () => {
    assert.throws(() => parseLibraryBackup(JSON.stringify({
        format: 'papertek-skriv-backup',
        version: 1,
        data: {
            documents: {},
            trash: [],
            folders: [],
            versions: [],
            settings: {},
        },
    })), /invalid-backup/);
});

test('library backup validates record types and unique live/trash document IDs', () => {
    assert.throws(() => parseLibraryBackup(backupText({
        documents: [{ id: 'same', html: '<p>Live</p>' }],
        trash: [{ id: 'same', html: '<p>Trash</p>' }],
    })), /invalid-backup:duplicate-document-id/);

    assert.throws(() => parseLibraryBackup(backupText({
        documents: [{ id: 'doc', html: '<p>Hei</p>', wordCount: 'mange' }],
    })), /invalid-backup:documents-wordCount/);

    assert.throws(() => parseLibraryBackup(backupText({
        documents: [{ id: 'doc', html: '<p>Hei</p>', references: [null] }],
    })), /invalid-backup:documents-reference-record/);

    assert.throws(() => parseLibraryBackup(backupText({
        settings: { skriv_theme: 42 },
    })), /invalid-backup:setting-skriv_theme/);
});

test('library backup strictly validates Microsoft metadata and unique remote identities', () => {
    assert.throws(() => parseLibraryBackup(backupText({
        documents: [{
            id: 'unknown-key',
            microsoft365: { ...microsoftLink(), accessToken: 'must-never-persist' },
        }],
    })), /invalid-backup:documents-microsoft365-shape/);

    assert.throws(() => parseLibraryBackup(backupText({
        documents: [{
            id: 'raw-account',
            microsoft365: microsoftLink({ accountBinding: 'student@school.example' }),
        }],
    })), /invalid-backup:documents-microsoft365-accountBinding/);

    assert.throws(() => parseLibraryBackup(backupText({
        documents: [{ id: 'live', microsoft365: microsoftLink() }],
        trash: [{ id: 'trash', microsoft365: microsoftLink() }],
    })), /invalid-backup:duplicate-microsoft-item/);
});

test('library backup rejects missing, cyclic, too-deep, and dangling folder references', () => {
    const invalidCases = [
        {
            name: 'missing parent',
            folders: [{ id: 'child', name: 'Barn', parentId: 'missing' }],
            reason: /missing-folder-parent/,
        },
        {
            name: 'cycle',
            folders: [
                { id: 'a', name: 'A', parentId: 'b' },
                { id: 'b', name: 'B', parentId: 'a' },
            ],
            reason: /folder-cycle/,
        },
        {
            name: 'depth',
            folders: [
                { id: 'a', name: 'A' },
                { id: 'b', name: 'B', parentId: 'a' },
                { id: 'c', name: 'C', parentId: 'b' },
                { id: 'd', name: 'D', parentId: 'c' },
            ],
            reason: /folder-depth/,
        },
        {
            name: 'document reference',
            documents: [{ id: 'doc', html: '<p>Hei</p>', folderIds: ['missing'] }],
            reason: /missing-document-folder/,
        },
    ];

    for (const invalidCase of invalidCases) {
        const { name, reason, ...data } = invalidCase;
        assert.throws(
            () => parseLibraryBackup(backupText(data)),
            reason,
            name,
        );
    }
});

test('library backup bounds nested record data', () => {
    const nested = {};
    let cursor = nested;
    for (let depth = 0; depth < 22; depth++) {
        cursor.next = {};
        cursor = cursor.next;
    }
    assert.throws(() => parseLibraryBackup(backupText({
        documents: [{ id: 'doc', html: '<p>Hei</p>', futureMetadata: nested }],
    })), /invalid-backup:documents-depth/);
});

test('library backup accepts normal editor markup and rejects active HTML', () => {
    assert.doesNotThrow(() => parseLibraryBackup(backupText({
        documents: [{
            id: 'safe',
            html: '<h2>Overskrift</h2><p style="color:#123">Hei <a href="https://example.test">verden</a></p><img src="data:image/png;base64,AAAA">',
        }],
    })));

    const unsafeHtml = [
        '<script>alert(1)</script>',
        '<img src="x" onerror="alert(1)">',
        '<a href="jav&#x61;script:alert(1)">trykk</a>',
        '<img src="https://tracker.example/pixel.png">',
        '<div style="background-image:url&lpar;javascript:alert(1)&rpar;">x</div>',
        '<img src="safe.png" srcset="javascript:alert(1) 2x">',
        '<form action="https://example.test"><input autofocus></form>',
    ];
    for (const html of unsafeHtml) {
        assert.throws(
            () => parseLibraryBackup(backupText({ documents: [{ id: 'unsafe', html }] })),
            /invalid-backup:unsafe-html/,
            html,
        );
    }
});

test('remote resources are rejected before a browser DOMParser can fetch them', () => {
    const hadDomParser = Object.hasOwn(globalThis, 'DOMParser');
    const originalDomParser = globalThis.DOMParser;
    let constructed = 0;
    globalThis.DOMParser = class UnsafeConstructionSentinel {
        constructor() {
            constructed += 1;
            throw new Error('DOMParser must not see resource-bearing markup');
        }
    };

    try {
        for (const html of [
            '<img src="https://tracker.example/pupil.png">',
            '<iframe src="https://internal.example/action"></iframe>',
        ]) {
            assert.throws(
                () => parseLibraryBackup(backupText({ documents: [{ id: 'unsafe', html }] })),
                /invalid-backup:unsafe-html/,
            );
        }
        assert.equal(constructed, 0);
    } finally {
        if (hadDomParser) globalThis.DOMParser = originalDomParser;
        else delete globalThis.DOMParser;
    }
});

test('folder conflicts use a stable map without overwriting local folders', () => {
    const data = libraryData({
        folders: [
            { id: 'sys_norsk', name: 'Norsk', parentId: null, isSystem: true, createdAt: 'backup' },
            { id: 'cust_shared', name: 'Fra backup', parentId: null, isSystem: false },
            { id: 'child', name: 'Barn', parentId: 'cust_shared', isSystem: false },
        ],
        documents: [{ id: 'doc', title: 'Tekst', folderIds: ['sys_norsk', 'cust_shared', 'child'] }],
        trash: [{ id: 'trash', title: 'Slettet', folderIds: ['child'] }],
    });
    const existing = libraryData({
        folders: [
            { id: 'sys_norsk', name: 'Norsk', parentId: null, isSystem: true, createdAt: 'local' },
            { id: 'cust_shared', name: 'Lokal mappe', parentId: null, isSystem: false },
        ],
    });

    const first = buildLibraryRestorePlan(data, existing);
    const mappedRoot = first.folderIdMap.get('cust_shared');
    const child = first.folderWrites.find(folder => folder.id === 'child');
    const document = first.documentWrites[0];

    assert.notEqual(mappedRoot, 'cust_shared');
    assert.match(mappedRoot, /^restored_folder_/);
    assert.equal(first.folderIdMap.get('sys_norsk'), 'sys_norsk');
    assert.equal(child.parentId, mappedRoot);
    assert.deepEqual(document.folderIds, ['sys_norsk', mappedRoot, 'child']);
    assert.equal(first.trashWrites[0].folderIds[0], 'child');
    assert.equal(first.folderWrites.some(folder => folder.id === 'cust_shared'), false);
    assert.equal(first.folderWrites.some(folder => folder.id === 'sys_norsk'), false);

    const afterFirstRestore = libraryData({
        folders: [...existing.folders, ...first.folderWrites],
        documents: first.documentWrites,
        trash: first.trashWrites,
    });
    const retry = buildLibraryRestorePlan(data, afterFirstRestore);
    assert.equal(retry.folderWrites.length, 0);
    assert.equal(retry.documentWrites.length, 0);
    assert.equal(retry.trashWrites.length, 0);
    assert.equal(retry.imported, 0);
    assert.equal(retry.documentIdMap.get('doc'), 'doc');
    assert.equal(retry.folderIdMap.get('cust_shared'), mappedRoot);

    const afterOriginalFolderWasDeleted = libraryData({
        folders: afterFirstRestore.folders.filter(folder => folder.id !== 'cust_shared'),
        documents: first.documentWrites,
        trash: first.trashWrites,
    });
    const resumedAfterDeletion = buildLibraryRestorePlan(data, afterOriginalFolderWasDeleted);
    assert.equal(resumedAfterDeletion.folderWrites.length, 0);
    assert.equal(resumedAfterDeletion.folderIdMap.get('cust_shared'), mappedRoot);
});

test('document conflict IDs are deterministic and verify prior restore content', () => {
    const data = libraryData({
        documents: [{
            id: 'doc',
            title: 'Backup',
            html: '<p>Backup</p>',
            folderIds: [],
            microsoft365: microsoftLink(),
        }],
    });
    const existing = libraryData({
        documents: [{ id: 'doc', title: 'Local', html: '<p>Local</p>', folderIds: [] }],
    });
    const initial = buildLibraryRestorePlan(data, existing);
    const firstCandidate = initial.documentWrites[0].id;

    const occupied = libraryData({
        documents: [
            ...existing.documents,
            { id: firstCandidate, title: 'Unrelated local record', html: '<p>Keep</p>', folderIds: [] },
        ],
    });
    const restore = buildLibraryRestorePlan(data, occupied);
    const restored = restore.documentWrites[0];
    assert.equal(restored.id, `${firstCandidate}_2`);
    assert.equal(restored.title, 'Backup (gjenopprettet)');
    assert.equal(restored.microsoft365, undefined, 'a conflict clone needs fresh cloud opt-in');

    const afterRestore = libraryData({ documents: [...occupied.documents, restored] });
    const retry = buildLibraryRestorePlan(data, afterRestore);
    assert.equal(retry.documentWrites.length, 0);
    assert.equal(retry.documentIdMap.get('doc'), restored.id);
    assert.equal(retry.skipped, 1);

    const retryAfterOriginalWasDeleted = buildLibraryRestorePlan(
        data,
        libraryData({ documents: [occupied.documents[1], restored] }),
    );
    assert.equal(retryAfterOriginalWasDeleted.documentWrites.length, 0);
    assert.equal(retryAfterOriginalWasDeleted.documentIdMap.get('doc'), restored.id);
});

test('restore strips a remote link already owned by another local document', () => {
    const link = microsoftLink();
    const data = libraryData({
        documents: [{ id: 'incoming', title: 'Backup', folderIds: [], microsoft365: link }],
    });
    const existing = libraryData({
        documents: [{ id: 'local-owner', title: 'Local', folderIds: [], microsoft365: link }],
    });

    const first = buildLibraryRestorePlan(data, existing);
    assert.equal(first.documentWrites.length, 1);
    assert.equal(first.documentWrites[0].id, 'incoming');
    assert.equal(first.documentWrites[0].microsoft365, undefined);

    const retry = buildLibraryRestorePlan(
        data,
        libraryData({ documents: [...existing.documents, ...first.documentWrites] }),
    );
    assert.equal(retry.documentWrites.length, 0, 'the local-only collision is idempotent');
    assert.equal(retry.documentIdMap.get('incoming'), 'incoming');
});

test('version restore maps document IDs and deduplicates snapshots across retries', () => {
    const documentIdMap = new Map([['source', 'restored-doc']]);
    const existing = [{
        id: 99,
        docId: 'restored-doc',
        timestamp: 1,
        content: '<p>A</p>',
        wordCount: 1,
    }];
    const versions = [
        { id: 1, docId: 'source', timestamp: 1, content: '<p>A</p>', wordCount: 1 },
        { id: 2, docId: 'source', timestamp: 1, content: '<p>A</p>', wordCount: 1 },
        { id: 3, docId: 'source', timestamp: 2, content: '<p>B</p>', wordCount: 1 },
        { id: 4, docId: 'orphan', timestamp: 3, content: '<p>C</p>', wordCount: 1 },
    ];

    const first = buildVersionRestorePlan(versions, documentIdMap, existing);
    assert.equal(first.imported, 1);
    assert.equal(first.skipped, 2);
    assert.equal(first.orphaned, 1);
    assert.equal(first.writes[0].docId, 'restored-doc');
    assert.equal('id' in first.writes[0], false);

    const retry = buildVersionRestorePlan(
        versions,
        documentIdMap,
        [...existing, { ...first.writes[0], id: 100 }],
    );
    assert.equal(retry.imported, 0);
    assert.equal(retry.skipped, 3);
    assert.equal(retry.orphaned, 1);
});

test('restore reports a retryable partial result and resumes safely', async () => {
    let attempt = 0;
    let settingsCalls = 0;
    const backup = backupText({
        documents: [{ id: 'doc', title: 'Tekst', html: '<p>Hei</p>' }],
        versions: [{ id: 1, docId: 'doc', content: '<p>Før</p>' }],
        settings: { skriv_theme: 'dark' },
    });
    const api = initLibraryBackup({
        storage: {},
        async mergeDocumentData() {
            const firstAttempt = attempt++ === 0;
            return {
                documentIdMap: new Map([['doc', 'doc']]),
                imported: firstAttempt ? 1 : 0,
                skipped: firstAttempt ? 0 : 1,
                conflicts: 0,
                foldersImported: 0,
                foldersSkipped: 0,
                folderConflicts: 0,
            };
        },
        async mergeVersions() {
            if (attempt === 1) throw new Error('version-db-unavailable');
            return { imported: 1, skipped: 0, orphaned: 0 };
        },
        async restoreSettings() { settingsCalls++; },
    });

    await assert.rejects(api.restoreFromText(backup), (error) => {
        assert.equal(error instanceof LibraryRestorePartialError, true);
        assert.equal(error.code, 'partial-restore');
        assert.equal(error.canRetry, true);
        assert.deepEqual(error.phases, {
            documents: 'complete',
            versions: 'failed',
            settings: 'pending',
        });
        assert.equal(error.result.imported, 1);
        assert.match(error.cause.message, /version-db-unavailable/);
        return true;
    });
    assert.equal(settingsCalls, 0);

    const resumed = await api.restoreFromText(backup);
    assert.equal(resumed.status, 'complete');
    assert.equal(resumed.canRetry, false);
    assert.equal(resumed.imported, 0);
    assert.equal(resumed.skipped, 1);
    assert.equal(resumed.versions, 1);
    assert.deepEqual(resumed.phases, {
        documents: 'complete',
        versions: 'complete',
        settings: 'complete',
    });
    assert.equal(settingsCalls, 1);
});

test('backup export includes version history and fails as a whole when collection fails', async () => {
    const complete = libraryData({
        documents: [{ id: 'doc', html: '<p>Nå</p>' }],
        versions: [{ id: 7, docId: 'doc', content: '<p>Før</p>' }],
    });
    const api = initLibraryBackup({
        storage: {},
        async collectLibraryData() { return complete; },
    });
    const blob = await api.createBackupBlob();
    assert.deepEqual(parseLibraryBackup(await blob.text()).data.versions, complete.versions);

    const failingApi = initLibraryBackup({
        storage: {},
        async collectLibraryData() { throw new Error('version-read-failed'); },
    });
    await assert.rejects(failingApi.createBackupBlob(), /version-read-failed/);
});

test('download keeps its object URL alive until a later task', async () => {
    const originalUrl = Object.getOwnPropertyDescriptor(globalThis, 'URL');
    const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
    const originalSetTimeout = globalThis.setTimeout;
    let clicked = false;
    let revoked = false;
    let scheduled = null;

    Object.defineProperty(globalThis, 'URL', {
        configurable: true,
        value: {
            createObjectURL() { return 'blob:backup'; },
            revokeObjectURL(url) {
                assert.equal(url, 'blob:backup');
                revoked = true;
            },
        },
    });
    Object.defineProperty(globalThis, 'document', {
        configurable: true,
        value: {
            body: { appendChild() {} },
            createElement() {
                return {
                    click() { clicked = true; },
                    remove() {},
                };
            },
        },
    });
    globalThis.setTimeout = (callback, delay) => {
        scheduled = { callback, delay };
        return 1;
    };

    try {
        const api = initLibraryBackup({
            storage: {},
            async collectLibraryData() { return libraryData(); },
        });
        await api.downloadBackup();
        assert.equal(clicked, true);
        assert.equal(revoked, false);
        assert.equal(scheduled.delay, 1000);
        scheduled.callback();
        assert.equal(revoked, true);
    } finally {
        globalThis.setTimeout = originalSetTimeout;
        if (originalUrl) Object.defineProperty(globalThis, 'URL', originalUrl);
        else delete globalThis.URL;
        if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
        else delete globalThis.document;
    }
});
