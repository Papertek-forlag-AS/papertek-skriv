import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    getSchoolYearLabel,
    normalizeFolderName,
} from '../public/js/app/db.js';

test('school years change on 1 August', () => {
    assert.equal(getSchoolYearLabel(new Date(2026, 6, 31, 12)), '2025/2026');
    assert.equal(getSchoolYearLabel(new Date(2026, 7, 1, 0)), '2026/2027');
});

test('folder ids normalize Norwegian names deterministically', () => {
    assert.equal(normalizeFolderName('Kunst og håndverk'), 'kunst_og_haandverk');
    assert.equal(normalizeFolderName('  Språk / samfunn  '), 'spraak_samfunn');
    assert.equal(normalizeFolderName('__Norsk__'), 'norsk');
});

test('every primary store uses the single database opener', async () => {
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    for (const file of ['document-store.js', 'trash-store.js', 'folder-store.js']) {
        const source = await readFile(path.join(repoRoot, 'public/js/app', file), 'utf8');
        assert.match(source, /openSkrivDatabase/);
        assert.doesNotMatch(source, /indexedDB\.open\s*\(/);
    }
});
