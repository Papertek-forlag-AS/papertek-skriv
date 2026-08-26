import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateStarterSentence } from '../public/js/editor-core/student/sentence-starter-drill.js';

test('evaluateStarterSentence requires exactly one finished sentence', () => {
    assert.deepEqual(evaluateStarterSentence(''), { written: false, oneSentence: false, minWords: false });
    // No terminator → not a finished sentence
    assert.equal(evaluateStarterSentence('Jeg mener at skolen').oneSentence, false);
    // One finished sentence
    const good = evaluateStarterSentence('Jeg mener at skolen bør starte senere.');
    assert.deepEqual(good, { written: true, oneSentence: true, minWords: true });
    // Two sentences → fail
    assert.equal(evaluateStarterSentence('Første setning. Andre setning.').oneSentence, false);
    // Terminator mid-text but not at the end → fail
    assert.equal(evaluateStarterSentence('Ferdig. og så litt til').oneSentence, false);
    // ! and … also count as terminators
    assert.equal(evaluateStarterSentence('For et spørsmål dette er!').oneSentence, true);
});

test('evaluateStarterSentence requires at least three words', () => {
    assert.equal(evaluateStarterSentence('Ja.').minWords, false);
    assert.equal(evaluateStarterSentence('Jeg mener det.').minWords, true);
});
