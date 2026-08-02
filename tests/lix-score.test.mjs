import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateLix, getLixCategory, isAppropriateForLevel } from '../public/js/editor-core/student/lix-score.js';

test('calculateLix returns null for empty or ultra-short text', () => {
    assert.equal(calculateLix(''), null);
    assert.equal(calculateLix('   '), null);
});

test('calculateLix correctly computes readability breakdown', () => {
    const text = 'Dette er en enkel test. Setningen har noen lange ord som overstiger grensen for treff.';
    const result = calculateLix(text);
    assert.notEqual(result, null);
    assert.equal(result.sentenceCount, 2);
    assert.ok(result.wordCount > 10);
    assert.ok(result.lix > 0);
    assert.equal(typeof result.avgSentenceLength, 'number');
    assert.equal(typeof result.longWordPct, 'number');
});

test('getLixCategory categorizes LIX scores into appropriate difficulty buckets', () => {
    assert.equal(getLixCategory(20).key, 'veryEasy');
    assert.equal(getLixCategory(30).key, 'easy');
    assert.equal(getLixCategory(40).key, 'medium');
    assert.equal(getLixCategory(50).key, 'difficult');
    assert.equal(getLixCategory(60).key, 'veryDifficult');
});

test('isAppropriateForLevel validates LIX targets per school level', () => {
    assert.equal(isAppropriateForLevel(30, 'ungdomsskole'), true);
    assert.equal(isAppropriateForLevel(55, 'ungdomsskole'), false);
    assert.equal(isAppropriateForLevel(40, 'vg1'), true);
    assert.equal(isAppropriateForLevel(20, 'vg1'), false);
});
