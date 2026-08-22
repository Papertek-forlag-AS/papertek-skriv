import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const imageManagerUrl = new URL('../public/js/editor-core/student/image-manager.js', import.meta.url);

test('image history yields to native undo after editor input and never intercepts outside the editor', async () => {
    const source = await readFile(imageManagerUrl, 'utf8');

    assert.match(source, /function handleNativeEditorInput\(\)[\s\S]*?undoStack\.length = 0;[\s\S]*?redoStack\.length = 0;/);
    assert.match(source, /editor\.addEventListener\('input', handleNativeEditorInput\)/);
    assert.doesNotMatch(source, /document\.addEventListener\('keydown', handleKeyDown/);
});
