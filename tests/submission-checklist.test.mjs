import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChecklistItems } from '../public/js/editor-core/student/submission-checklist.js';
import { initI18n } from '../public/js/editor-core/shared/i18n.js';

// initI18n touches localStorage and document; give it just enough browser.
const _store = new Map();
Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: (k) => _store.get(k) ?? null, setItem: (k, v) => _store.set(k, String(v)), removeItem: (k) => _store.delete(k) },
});
if (!globalThis.document) globalThis.document = { documentElement: {} };
await initI18n(); // loads the nb locale so t() resolves real strings

test('auto-detected items reflect title, word count and sources', () => {
    const bad = buildChecklistItems({ title: '   ', wordCount: 42, hasReferences: false });
    const [title, words, sources] = bad;
    assert.equal(title.auto, true);
    assert.equal(title.pass, false, 'whitespace-only title must not pass');
    assert.equal(words.pass, false, '42 words is under the 100-word bar');
    assert.equal(sources.pass, false);

    const good = buildChecklistItems({ title: 'Min drøfting', wordCount: 100, hasReferences: true });
    assert.equal(good[0].pass, true);
    assert.equal(good[1].pass, true, 'exactly 100 words passes');
    assert.equal(good[2].pass, true);
});

test('genre frames add four genre items; unknown or missing frames add none', () => {
    const generic = buildChecklistItems({});
    for (const frameType of ['droefting', 'analyse', 'kronikk']) {
        const items = buildChecklistItems({ frameType });
        assert.equal(items.length, generic.length + 4, `${frameType} should add 4 genre checkboxes`);
        const genreItems = items.slice(3, 7);
        assert.ok(genreItems.every(i => i.auto === false), 'genre items are manual checkboxes');
    }
    // Frames without a genre checklist (e.g. fortelling) fall back to generic.
    assert.equal(buildChecklistItems({ frameType: 'fortelling' }).length, generic.length);
    assert.equal(buildChecklistItems({ frameType: null }).length, generic.length);
});

test('generic manual items always close the list', () => {
    const items = buildChecklistItems({ frameType: 'droefting' });
    const lastTwo = items.slice(-2);
    assert.ok(lastTwo.every(i => i.auto === false));
    // Labels come from i18n and must be resolved strings, not raw keys.
    for (const item of items) {
        assert.equal(typeof item.label, 'string');
        assert.ok(!item.label.startsWith('checklist.'), `unresolved i18n key: ${item.label}`);
    }
});
