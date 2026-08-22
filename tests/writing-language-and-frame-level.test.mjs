import test from 'node:test';
import assert from 'node:assert/strict';

import {
    DOCUMENT_WRITING_LANGUAGES,
    getDocumentWritingLanguage,
    normalizeWritingLanguage,
} from '../public/js/app/document-store.js';
import { getSchoolLevelBand } from '../public/js/app/school-level.js';
import {
    DEFAULT_FRAME_REGISTRY,
    partitionFramesByLevel,
    resolveFrameLanguage,
    resolveFramePath,
} from '../public/js/editor-core/student/frame-selector.js';
import nb from '../public/js/editor-core/locales/nb.js';
import nn from '../public/js/editor-core/locales/nn.js';
import en from '../public/js/editor-core/locales/en.js';

test('document writing language accepts supported values and uses a safe fallback', () => {
    assert.deepEqual(DOCUMENT_WRITING_LANGUAGES, ['nb', 'nn', 'en', 'de', 'es', 'fr']);
    assert.equal(normalizeWritingLanguage('nn'), 'nn');
    assert.equal(normalizeWritingLanguage('unsupported', 'en'), 'en');
    assert.equal(normalizeWritingLanguage(undefined, 'unsupported'), 'nb');
});

test('legacy documents get deterministic writing-language defaults', () => {
    assert.equal(getDocumentWritingLanguage({ title: 'Older document' }), 'nb');
    assert.equal(getDocumentWritingLanguage({ title: 'Older document' }, 'nn'), 'nn');
    assert.equal(getDocumentWritingLanguage({ writingLanguage: 'en' }, 'nn'), 'en');
    assert.equal(getDocumentWritingLanguage({ germanHint: { simple: 'Ein Text' } }), 'de');
});

test('school levels map to broad frame bands', () => {
    assert.equal(getSchoolLevelBand('barneskole'), 'barneskole');
    assert.equal(getSchoolLevelBand('ungdomsskole'), 'ungdomsskole');
    assert.equal(getSchoolLevelBand('vg1'), 'vgs');
    assert.equal(getSchoolLevelBand('vg3'), 'vgs');
    assert.equal(getSchoolLevelBand('unknown'), null);
});

test('frame recommendations prioritize age-appropriate choices without hiding the rest', () => {
    const primary = partitionFramesByLevel(DEFAULT_FRAME_REGISTRY, 'barneskole');
    assert.deepEqual(
        primary.recommended.map(frame => frame.id),
        ['leserinnlegg', 'novelle', 'kreativ-tekst'],
    );
    assert.equal(primary.recommended.length + primary.additional.length, DEFAULT_FRAME_REGISTRY.length);
    assert.ok(primary.additional.some(frame => frame.id === 'kortsvar'));

    const upperSecondary = partitionFramesByLevel(DEFAULT_FRAME_REGISTRY, 'vgs');
    assert.equal(upperSecondary.recommended.length, DEFAULT_FRAME_REGISTRY.length);
    assert.equal(upperSecondary.additional.length, 0);
});

test('frame paths follow document language and disclose a Bokmål fallback', () => {
    assert.equal(resolveFrameLanguage('nn'), 'nn');
    assert.equal(resolveFrameLanguage('en'), 'nb');
    assert.equal(resolveFramePath('/frames/{{lang}}/novelle.md', 'nn'), '/frames/nn/novelle.md');
    assert.equal(resolveFramePath('/frames/{{lang}}/novelle.md', 'de'), '/frames/nb/novelle.md');
});

test('writing-language and level-aware frame UI strings exist in every locale', () => {
    for (const locale of [nb, nn, en]) {
        assert.ok(locale.language.writing);
        assert.ok(locale.language.writingHint);
        for (const code of DOCUMENT_WRITING_LANGUAGES) assert.ok(locale.language[code]);
        assert.ok(locale.skriv.frameRecommendedForLevel);
        assert.ok(locale.skriv.frameMoreOptions);
        assert.ok(locale.skriv.frameLanguageFallback);
    }
});
