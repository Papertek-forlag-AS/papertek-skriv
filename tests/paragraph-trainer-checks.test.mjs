import test from 'node:test';
import assert from 'node:assert/strict';

// The trainer module touches i18n at import time only via imports of pure
// modules; evaluateChecks itself is pure.
const { evaluateChecks } = await import('../public/js/editor-core/student/paragraph-trainer.js');

test('check 1: topic sentence must be exactly one sentence', () => {
    const one = evaluateChecks(['Mobilen bør ikke forbys i skoletiden.', '', '']);
    assert.equal(one[0].pass, true);

    const two = evaluateChecks(['Mobilen bør forbys. Det mener jeg virkelig.', '', '']);
    assert.equal(two[0].pass, false);

    const empty = evaluateChecks(['', '', '']);
    assert.equal(empty[0].pass, false);
    assert.equal(empty[0].written, false);
});

test('check 2: support needs a causal marker (nb and nn)', () => {
    assert.equal(evaluateChecks(['', 'Dette er viktig fordi elevene lærer mer.', ''])[1].pass, true);
    assert.equal(evaluateChecks(['', 'Dette er viktig, difor bør vi endre reglane.', ''])[1].pass, true);
    assert.equal(evaluateChecks(['', 'Dette er bare en mening uten grunn.', ''])[1].pass, false);
});

test('check 3: support needs an example marker (nb and nn)', () => {
    assert.equal(evaluateChecks(['', 'Vi ser dette for eksempel i friminuttene.', ''])[2].pass, true);
    assert.equal(evaluateChecks(['', 'Vi ser dette til dømes i friminutta.', ''])[2].pass, true);
    assert.equal(evaluateChecks(['', 'Vi ser dette ofte.', ''])[2].pass, false);
});

test('check 4: closing must echo a keyword from the topic sentence', () => {
    const good = evaluateChecks([
        'Mobilbruk i timene bør reguleres tydelig.',
        '',
        'Tydelige regler for mobilbruk gagner alle.',
    ]);
    assert.equal(good[3].pass, true);

    const bad = evaluateChecks([
        'Mobilbruk i timene bør reguleres tydelig.',
        '',
        'Alt i alt går det nok bra.',
    ]);
    assert.equal(bad[3].pass, false);
});
