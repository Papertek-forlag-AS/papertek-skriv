import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLibraryBackup, BACKUP_FORMAT } from '../public/js/app/library-backup.js';

function makeBackup(overrides = {}) {
    return JSON.stringify({
        format: BACKUP_FORMAT,
        version: 1,
        exportedAt: '2026-08-25T12:00:00.000Z',
        documents: [
            { id: 'a1', title: 'Drøfting', html: '<p>Hei</p>', plainText: 'Hei', updatedAt: '2026-08-20T10:00:00.000Z' },
        ],
        folders: [
            { id: 'f1', name: 'Norsk', parentId: null },
        ],
        ...overrides,
    });
}

test('parseLibraryBackup accepts a valid backup', () => {
    const { documents, folders } = parseLibraryBackup(makeBackup());
    assert.equal(documents.length, 1);
    assert.equal(documents[0].id, 'a1');
    assert.equal(folders.length, 1);
});

test('parseLibraryBackup rejects non-JSON and wrong formats', () => {
    assert.throws(() => parseLibraryBackup('not json'), /invalid/);
    assert.throws(() => parseLibraryBackup('{"format":"other"}'), /invalid/);
    assert.throws(
        () => parseLibraryBackup(JSON.stringify({ format: BACKUP_FORMAT })),
        /invalid/
    );
});

test('parseLibraryBackup drops documents with active HTML content', () => {
    const hostile = makeBackup({
        documents: [
            { id: 'x1', title: 'Ond', html: '<p><script>alert(1)</script></p>', updatedAt: 'now' },
            { id: 'x2', title: 'Ond2', html: '<img src=x onerror=alert(1)>', updatedAt: 'now' },
            { id: 'x3', title: 'Ond3', html: '<a href="javascript:alert(1)">l</a>', updatedAt: 'now' },
            { id: 'ok', title: 'Grei', html: '<p>Vanlig tekst om online-undervisning</p>', updatedAt: 'now' },
        ],
    });
    const { documents } = parseLibraryBackup(hostile);
    assert.deepEqual(documents.map(d => d.id), ['ok']);
});

test('parseLibraryBackup tolerates missing folders array', () => {
    const { folders } = parseLibraryBackup(makeBackup({ folders: undefined }));
    assert.deepEqual(folders, []);
});
