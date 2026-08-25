import test from 'node:test';
import assert from 'node:assert/strict';
import { langToTag } from '../public/js/editor-core/student/editor-lang.js';
import { splitIntoChunks, pickVoice } from '../public/js/editor-core/student/read-aloud.js';
import { normalizeSettings } from '../public/js/editor-core/student/reading-settings.js';

test('langToTag maps writing languages to BCP 47 tags', () => {
    assert.equal(langToTag('nb'), 'nb-NO');
    assert.equal(langToTag('nn'), 'nn-NO');
    assert.equal(langToTag('en'), 'en');
    assert.equal(langToTag('de'), 'de');
    // Unknown codes pass through; empty falls back to nb-NO.
    assert.equal(langToTag('pt'), 'pt');
    assert.equal(langToTag(''), 'nb-NO');
    assert.equal(langToTag(undefined), 'nb-NO');
});

test('splitIntoChunks keeps whole sentences and never exceeds the limit', () => {
    assert.deepEqual(splitIntoChunks(''), []);
    assert.deepEqual(splitIntoChunks('   '), []);
    assert.deepEqual(splitIntoChunks('En kort setning.'), ['En kort setning.']);

    const chunks = splitIntoChunks('Første setning. Andre setning! Tredje setning?');
    assert.equal(chunks.length, 3);
    assert.equal(chunks[0], 'Første setning.');
    assert.equal(chunks[2], 'Tredje setning?');

    // A single overlong sentence is hard-split, preferring commas.
    const long = 'ord '.repeat(30).trim() + ', ' + 'ord '.repeat(30).trim() + '.';
    const longChunks = splitIntoChunks(long, 150);
    assert.ok(longChunks.length >= 2);
    for (const chunk of longChunks) {
        assert.ok(chunk.length <= 151, `chunk too long: ${chunk.length}`);
    }
    // Nothing lost: word counts survive the split.
    const joined = longChunks.join(' ').replace(/\s+/g, ' ');
    assert.equal((joined.match(/ord/g) || []).length, 60);

    // Whitespace collapses so utterances don't get odd pauses.
    assert.deepEqual(splitIntoChunks('a\n\nb.'), ['a b.']);
});

test('pickVoice matches writing language, treating nb/nn/no as one family', () => {
    const voices = [
        { lang: 'en-US', localService: false, name: 'Eng' },
        { lang: 'no-NO', localService: false, name: 'NoRemote' },
        { lang: 'nb-NO', localService: true, name: 'NbLocal' },
        { lang: 'de-DE', localService: true, name: 'De' },
    ];
    assert.equal(pickVoice(voices, 'nb').name, 'NbLocal');
    // nn has no exact match → falls through nn → no family.
    assert.equal(pickVoice(voices.filter(v => v.lang !== 'nb-NO'), 'nn').name, 'NoRemote');
    assert.equal(pickVoice(voices, 'en').name, 'Eng');
    assert.equal(pickVoice(voices, 'fr'), null);
    assert.equal(pickVoice([], 'nb'), null);
    assert.equal(pickVoice(null, 'nb'), null);
});

test('normalizeSettings keeps valid values and drops everything else', () => {
    const defaults = { font: 'standard', size: 'm', lineHeight: 'normal', letterSpacing: 'normal' };
    assert.deepEqual(normalizeSettings(null), defaults);
    assert.deepEqual(normalizeSettings('garbage'), defaults);
    assert.deepEqual(normalizeSettings({ font: 'comic-sans', size: 9000 }), defaults);
    assert.deepEqual(
        normalizeSettings({ font: 'lettlest', size: 'xl', lineHeight: 'wide', letterSpacing: 'wider', extra: 'x' }),
        { font: 'lettlest', size: 'xl', lineHeight: 'wide', letterSpacing: 'wider' }
    );
});
