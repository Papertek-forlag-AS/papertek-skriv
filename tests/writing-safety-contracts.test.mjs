import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../public/js/', import.meta.url);

test('router and writer await the final save before tearing down the editor', async () => {
    const [main, writer] = await Promise.all([
        readFile(new URL('app/main.js', root), 'utf8'),
        readFile(new URL('app/standalone-writer.js', root), 'utf8'),
    ]);

    assert.match(main, /await previousScreen\.destroy\(\)/);
    assert.match(main, /window\.history\.replaceState\(null, '', renderedHash\)/);
    assert.match(writer, /const didSave = await autoSave\.destroy\(\)/);
    assert.match(writer, /if \(!didSave\)[\s\S]*?throw new Error\('Could not save document before leaving the editor'\)/);
});

test('moving a document to trash uses one atomic store transaction', async () => {
    const documentList = await readFile(new URL('app/document-list.js', root), 'utf8');

    assert.match(documentList, /await trashDocument\(fullDoc\)/);
    assert.doesNotMatch(documentList, /deleteDocument\s*\(/);
});
