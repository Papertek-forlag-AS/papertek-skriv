import test from 'node:test';
import assert from 'node:assert/strict';
import { findLeksihjelpEntry } from '../public/js/app/leksihjelp-dictionary.js';

test('dictionary resolves an inflected verb through the vocabulary seam map', () => {
    const infinitive = {
        word: 'skrive',
        display: 'skrive',
        type: 'verb',
    };
    const vocab = {
        getWordList: () => [infinitive],
        getVerbInfinitive: () => new Map([['skriv', 'skrive']]),
    };

    assert.equal(findLeksihjelpEntry('skriv', vocab), infinitive);
});

test('dictionary ignores a missing or malformed infinitive index safely', () => {
    const vocab = {
        getWordList: () => [],
        getVerbInfinitive: () => ({ skriv: 'skrive' }),
    };

    assert.equal(findLeksihjelpEntry('skriv', vocab), null);
    assert.equal(findLeksihjelpEntry('skriv', null), null);
});
