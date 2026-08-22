import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import nb from '../public/js/editor-core/locales/nb.js';
import nn from '../public/js/editor-core/locales/nn.js';
import en from '../public/js/editor-core/locales/en.js';

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('the editor default is compact and optional review tools load on demand', async () => {
    const source = await readSource('../public/js/app/standalone-writer.js');

    assert.doesNotMatch(source, /^import .*writing-progress/m);
    assert.doesNotMatch(source, /^import .*onboarding-tour/m);
    assert.doesNotMatch(source, /^import .*writing-feedback/m);
    assert.match(source, /import\('\.\.\/editor-core\/student\/writing-feedback\.js'\)/);
    assert.match(source, /import\('\.\.\/editor-core\/student\/focus-mode\.js'\)/);
    assert.doesNotMatch(source, /id="btn-advanced"|id="tools-wrapper"/);
    assert.match(source, /t\('review\.feedbackDesc'\)/);
});

test('portable editor shortcuts do not retain a hidden advanced mode', async () => {
    const source = await readSource('../public/js/editor-core/student/keyboard-shortcuts.js');

    assert.doesNotMatch(source, /isAdvancedMode|formatBlock\('h3'\)/);
});

test('home restores the cleanup desk without duplicating the canonical document list', async () => {
    const source = await readSource('../public/js/app/document-list.js');

    assert.match(source, /initCleanupDesk\(/);
    assert.match(source, /layout\.appendChild\(cleanupDesk\.desktopElement\)/);
    assert.match(source, /listEl\.appendChild\(cleanupDesk\.compactElement\)/);
    assert.match(source, /getCleanupDocuments\(docs, currentSchoolYear\)/);
    assert.doesNotMatch(source, /getCleanupDocuments\(filtered/);
    assert.match(source, /aria-controls="mobile-folder-navigation"/);
    assert.match(source, /mobileSidebar\.inert = true/);
    assert.match(source, /event\.key === 'Escape'/);
    assert.match(source, /return \{ destroy: destroyScreen \}/);
});

test('cleanup title work and trash navigation preserve focus and screen ownership', async () => {
    const [cleanup, list, main, writer, sidebar] = await Promise.all([
        readSource('../public/js/app/cleanup-desk.js'),
        readSource('../public/js/app/document-list.js'),
        readSource('../public/js/app/main.js'),
        readSource('../public/js/app/standalone-writer.js'),
        readSource('../public/js/app/sidebar.js'),
    ]);

    assert.match(cleanup, /onOpenDocument\(doc\.id, \{ focusTitle: needsTitle \}\)/);
    assert.match(main, /\?focus=title/);
    assert.match(writer, /options\.initialFocus === 'title'/);
    assert.match(writer, /titleInput\.focus\(\)/);

    assert.match(list, /window\.location\.hash = '#\/trash'/);
    assert.match(main, /hash === '#\/trash'/);
    assert.match(main, /renderTrashView\(app/);
    assert.match(list, /owner\.destroyed \|\| renderVersion !== owner\.version/);
    assert.match(list, /if \(!isStale\(\)\) await refresh\(\)/);
    assert.match(list, /fileDragController\.abort\(\)/);
    assert.match(list, /onLibraryChanged:/);
    assert.match(sidebar, /state\.onLibraryChanged\?\./);
});

test('limited assistance is never presented as a secure exam environment', () => {
    for (const translations of [nb, nn, en]) {
        assert.doesNotMatch(translations.leksihjelp.examMode, /exam mode|eksamensmodus/i);
        assert.match(translations.leksihjelp.examModeHint, /not|ikkje|ikke/i);
        assert.match(translations.leksihjelp.examModeHint, /locked browser|låst nettlesar|låst nettleser/i);
    }
});

test('Word-compatible export is labelled as .doc throughout the export flow', async () => {
    const [writer, checklist, exporter] = await Promise.all([
        readSource('../public/js/app/standalone-writer.js'),
        readSource('../public/js/editor-core/student/submission-checklist.js'),
        readSource('../public/js/editor-core/student/text-export.js'),
    ]);

    assert.match(writer, /exportType: 'doc'/);
    assert.match(checklist, /doc: t\('skriv\.downloadDocx'\)/);
    assert.match(exporter, /a\.download = `\$\{safeTitle\}\.doc`/);
    assert.doesNotMatch(exporter.split('\n')[1] || '', /\.docx/);
});

test('backup restore distinguishes invalid, partial, and storage failures', async () => {
    const source = await readSource('../public/js/app/sidebar.js');

    assert.match(source, /error instanceof LibraryRestorePartialError/);
    assert.match(source, /t\('backup\.partial'\)/);
    assert.match(source, /startsWith\('invalid-backup:'\)/);
    assert.match(source, /t\('backup\.restoreError'\)/);
});
