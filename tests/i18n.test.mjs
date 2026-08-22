import test from 'node:test';
import assert from 'node:assert/strict';
import { PLURAL_RULES, getDateLocale, getSupportedLanguages } from '../public/js/editor-core/shared/i18n.js';
import nb from '../public/js/editor-core/locales/nb.js';
import nn from '../public/js/editor-core/locales/nn.js';
import en from '../public/js/editor-core/locales/en.js';

test('getDateLocale returns BCP 47 locale string', () => {
    assert.equal(getDateLocale(), 'nb-NO');
});

test('getSupportedLanguages returns list of supported locales', () => {
    const langs = getSupportedLanguages();
    assert.ok(Array.isArray(langs));
    assert.equal(langs.length, 3);
    assert.deepEqual(langs.map(l => l.code), ['nb', 'nn', 'en']);
});

test('PLURAL_RULES handles Norwegian/English one vs other', () => {
    assert.equal(PLURAL_RULES.nb(1), 'one');
    assert.equal(PLURAL_RULES.nb(0), 'other');
    assert.equal(PLURAL_RULES.nb(5), 'other');

    assert.equal(PLURAL_RULES.nn(1), 'one');
    assert.equal(PLURAL_RULES.nn(2), 'other');

    assert.equal(PLURAL_RULES.en(1), 'one');
    assert.equal(PLURAL_RULES.en(10), 'other');
});

test('PLURAL_RULES handles Ukrainian Slavic plural rules (one, few, many)', () => {
    // one: 1, 21, 31, 101 (mod 10 === 1 && mod 100 !== 11)
    assert.equal(PLURAL_RULES.uk(1), 'one');
    assert.equal(PLURAL_RULES.uk(21), 'one');
    assert.equal(PLURAL_RULES.uk(101), 'one');
    assert.equal(PLURAL_RULES.uk(11), 'many'); // 11 is exception -> many

    // few: 2, 3, 4, 22, 23, 24
    assert.equal(PLURAL_RULES.uk(2), 'few');
    assert.equal(PLURAL_RULES.uk(3), 'few');
    assert.equal(PLURAL_RULES.uk(4), 'few');
    assert.equal(PLURAL_RULES.uk(23), 'few');
    assert.equal(PLURAL_RULES.uk(12), 'many'); // 12 is exception -> many

    // many: 0, 5-20, 25-30
    assert.equal(PLURAL_RULES.uk(0), 'many');
    assert.equal(PLURAL_RULES.uk(5), 'many');
    assert.equal(PLURAL_RULES.uk(10), 'many');
    assert.equal(PLURAL_RULES.uk(20), 'many');
});

test('PLURAL_RULES handles Sámi dual number rules (one, two, other)', () => {
    assert.equal(PLURAL_RULES.se(1), 'one');
    assert.equal(PLURAL_RULES.se(2), 'two');
    assert.equal(PLURAL_RULES.se(3), 'other');
    assert.equal(PLURAL_RULES.se(0), 'other');
});

test('accessibility and backup strings exist in every supported UI locale', () => {
    const locales = { nb, nn, en };
    const requiredToolbarKeys = [
        'label', 'bold', 'italic', 'underline', 'bulletList', 'numberedList', 'heading1', 'heading2',
    ];
    const requiredBackupKeys = [
        'download', 'downloaded', 'restore', 'restored', 'error', 'tooLarge',
        'restoreConfirmTitle', 'restoreConfirmMessage', 'invalid', 'partial',
        'restoreError', 'localHint',
    ];
    const requiredFrameGuideKeys = [
        'frameGuideLabel', 'frameGuideClose', 'frameGuideProgressLabel',
        'frameGuideProgressText', 'frameGuideInsertStarter',
    ];
    const requiredProgressKeys = [
        'title', 'openLabel', 'triggerText', 'thisSession', 'sessionSummary', 'paceLabel',
    ];
    const requiredVersionKeys = [
        'title', 'words', 'restore', 'restoreConfirm', 'restored', 'preview', 'close', 'empty',
        'playTimeline', 'openVersion', 'previous', 'next', 'play', 'pause', 'snapshotPosition',
        'timelineSlider', 'jumpCurrent', 'timeLabel', 'wordChange', 'previewContent',
    ];

    for (const [language, translations] of Object.entries(locales)) {
        assert.equal(typeof translations.a11y?.skipToContent, 'string', `${language}: a11y.skipToContent`);
        for (const key of requiredToolbarKeys) {
            assert.equal(typeof translations.editorToolbar?.[key], 'string', `${language}: editorToolbar.${key}`);
        }
        for (const key of requiredBackupKeys) {
            assert.equal(typeof translations.backup?.[key], 'string', `${language}: backup.${key}`);
        }
        for (const key of requiredFrameGuideKeys) {
            assert.equal(typeof translations.skriv?.[key], 'string', `${language}: skriv.${key}`);
        }
        for (const key of requiredProgressKeys) {
            assert.equal(typeof translations.progress?.[key], 'string', `${language}: progress.${key}`);
        }
        for (const key of requiredVersionKeys) {
            const value = translations.versions?.[key];
            const localizable = typeof value === 'string'
                || (value && typeof value === 'object' && typeof value.other === 'string');
            assert.equal(Boolean(localizable), true, `${language}: versions.${key}`);
        }
    }
});
