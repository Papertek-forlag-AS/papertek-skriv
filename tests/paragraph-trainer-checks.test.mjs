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

test('appendHistoryEntry prepends, dedupes consecutive identical texts, and caps', async () => {
    const { appendHistoryEntry } = await import('../public/js/editor-core/student/paragraph-trainer.js');
    const e = (text, ts) => ({ ts, topic: 'T', text, checksPassed: 4, checksTotal: 4, words: 10 });

    let list = appendHistoryEntry([], e('a', '1'));
    assert.equal(list.length, 1);
    list = appendHistoryEntry(list, e('b', '2'));
    assert.deepEqual(list.map(x => x.text), ['b', 'a'], 'newest first');
    // Copy then save of the same paragraph is ONE attempt
    list = appendHistoryEntry(list, e('b', '3'));
    assert.equal(list.length, 2, 'consecutive duplicate text must not double-log');
    // But re-finishing an older text is a new attempt
    list = appendHistoryEntry(list, e('a', '4'));
    assert.equal(list.length, 3);
    // Cap
    for (let i = 0; i < 30; i++) list = appendHistoryEntry(list, e('t' + i, String(i)));
    assert.equal(list.length, 20, 'history is capped at 20 entries');
    // Garbage input tolerated
    assert.equal(appendHistoryEntry('garbage', e('x', '9')).length, 1);
});
