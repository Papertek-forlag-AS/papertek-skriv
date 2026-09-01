import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const publicUrl = new URL('../public/', import.meta.url);

async function readPublic(relativePath) {
    return readFile(new URL(relativePath, publicUrl), 'utf8');
}

test('production Microsoft identifiers are explicit, public, and disabled by default', async () => {
    const index = await readPublic('index.html');

    assert.match(index, /<meta name="skriv:microsoft-client-id" content="">/);
    assert.match(index, /<meta name="skriv:microsoft-tenant-id" content="">/);
    assert.match(index, /<meta name="skriv:microsoft-sharepoint-host" content="">/);
    assert.doesNotMatch(index, /client[_-]?secret|access[_-]?token|refresh[_-]?token/i);
});

test('folder selection is bounded to the configured school SharePoint host', async () => {
    const [config, dialog] = await Promise.all([
        readPublic('js/app/microsoft-config.js'),
        readPublic('js/app/microsoft-storage-dialog.js'),
    ]);

    assert.match(config, /skriv:microsoft-sharepoint-host/);
    assert.match(config, /skriv\.microsoft\.sharePointHost/);
    assert.match(config, /isMicrosoftSharePointUrlAllowed/);
    assert.match(dialog, /isMicrosoftSharePointUrlAllowed\(/);
    assert.match(dialog, /data-microsoft-sharepoint-host/);
});

test('editor saves locally before scheduling an optional Microsoft copy', async () => {
    const source = await readPublic('js/app/standalone-writer.js');
    const saveStart = source.indexOf('saveFn: async (state) =>');
    const saveEnd = source.indexOf('getState: getDocumentState', saveStart);
    const saveBlock = source.slice(saveStart, saveEnd);

    assert.ok(saveStart >= 0 && saveEnd > saveStart);
    assert.ok(saveBlock.indexOf('await saveDocument(docId, state)') >= 0);
    assert.ok(
        saveBlock.indexOf('await saveDocument(docId, state)')
            < saveBlock.indexOf('microsoftStorage.scheduleDocumentSync(docId)'),
        'the local write must finish before remote work is scheduled',
    );

    const destroyStart = source.indexOf('const destroyScreen = () =>');
    const destroyEnd = source.indexOf('// --- Back button ---', destroyStart);
    const destroyBlock = source.slice(destroyStart, destroyEnd);
    assert.match(destroyBlock, /const didSave = await autoSave\.destroy\(\)/);
    assert.match(
        destroyBlock,
        /microsoftStorage\.syncDocument\(docId, \{\s*requireExistingLink: true/,
    );
    assert.ok(
        destroyBlock.indexOf('await autoSave.destroy()')
            < destroyBlock.indexOf('microsoftStorage.syncDocument(docId'),
        'the final remote pass starts only after the authoritative local flush',
    );
    assert.match(destroyBlock, /\.finally\(\(\) => \{[\s\S]*?microsoftStorage\.destroy/);
    assert.doesNotMatch(destroyBlock, /await microsoftStorage/);
});

test('Microsoft storage is available from both the library and editor without replacing local save status', async () => {
    const [library, editor] = await Promise.all([
        readPublic('js/app/document-list.js'),
        readPublic('js/app/standalone-writer.js'),
    ]);

    for (const source of [library, editor]) {
        assert.match(source, /id="btn-microsoft"/);
        assert.match(source, /showMicrosoftStorageDialog/);
    }
    assert.match(editor, /id="save-status"/);
    assert.match(editor, /data-microsoft-state-dot/);
});
