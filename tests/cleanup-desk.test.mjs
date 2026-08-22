import test from 'node:test';
import assert from 'node:assert/strict';
import { getCleanupDocuments, getCleanupReasons } from '../public/js/app/cleanup-desk.js';
import nb from '../public/js/editor-core/locales/nb.js';
import nn from '../public/js/editor-core/locales/nn.js';
import en from '../public/js/editor-core/locales/en.js';

test('cleanup reasons distinguish missing titles and folders', () => {
    assert.deepEqual(getCleanupReasons({ title: '', folderIds: [] }), ['title', 'folder']);
    assert.deepEqual(getCleanupReasons({ title: '   ', folderIds: ['norsk'] }), ['title']);
    assert.deepEqual(getCleanupReasons({ title: 'Essay', folderIds: [] }), ['folder']);
    assert.deepEqual(getCleanupReasons({ title: 'Essay' }), ['folder']);
    assert.deepEqual(getCleanupReasons({ title: 'Essay', folderIds: ['norsk'] }), []);
});

test('cleanup desk uses the complete selected school year', () => {
    const docs = [
        { id: 'clean', title: 'Ferdig', folderIds: ['norsk'], schoolYear: '2026/2027' },
        { id: 'title', title: ' ', folderIds: ['norsk'], schoolYear: '2026/2027' },
        { id: 'folder', title: 'Uten mappe', folderIds: [], schoolYear: '2026/2027' },
        { id: 'old', title: '', folderIds: [], schoolYear: '2025/2026' },
    ];

    assert.deepEqual(
        getCleanupDocuments(docs, '2026/2027').map(doc => doc.id),
        ['title', 'folder']
    );
    assert.deepEqual(getCleanupDocuments(docs, '2025/2026').map(doc => doc.id), ['old']);
});

test('cleanup pedagogy is translated in every supported interface language', () => {
    const requiredKeys = [
        'cleanupDesk', 'cleanupDeskHint', 'cleanupCount', 'cleanupDocuments',
        'cleanupNeedsTitle', 'cleanupNeedsFolder', 'cleanupRemaining',
        'cleanupOpenAndName', 'cleanupOpenDocument', 'cleanupDeleteDocument',
        'cleanupFolderUpdated', 'cleanupMovedToTrash', 'cleanupActionError',
        'allOrganized', 'allOrganizedHint', 'cleanupTrashHint',
    ];

    for (const translations of [nb, nn, en]) {
        for (const key of requiredKeys) {
            assert.ok(translations.sidebar[key], `missing sidebar.${key}`);
        }
        assert.ok(translations.sidebar.cleanupCount.one);
        assert.ok(translations.sidebar.cleanupCount.other);
        assert.match(translations.sidebar.cleanupOpenAndName, /\{\{position\}\}/);
    }
});
