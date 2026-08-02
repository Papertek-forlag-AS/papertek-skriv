import test from 'node:test';
import assert from 'node:assert/strict';
import { PLURAL_RULES, getDateLocale, getSupportedLanguages } from '../public/js/editor-core/shared/i18n.js';

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
