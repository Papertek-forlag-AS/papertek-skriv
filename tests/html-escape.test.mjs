import test from 'node:test';
import assert from 'node:assert/strict';
import { escapeAttr } from '../public/js/editor-core/shared/html-escape.js';

test('escapeAttr safely escapes attribute special characters', () => {
    assert.equal(escapeAttr('Hello "World"'), 'Hello &quot;World&quot;');
    assert.equal(escapeAttr('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;');
    assert.equal(escapeAttr(''), '');
    assert.equal(escapeAttr(null), '');
    assert.equal(escapeAttr(undefined), '');
});

test('escapeAttr escapes ampersands and single quotes so values round-trip', () => {
    // A reference author typed as "Smith &amp; Co" must come back unchanged
    // from the edit dialog's value="..." attribute, not as "Smith & Co".
    assert.equal(escapeAttr('Smith &amp; Co'), 'Smith &amp;amp; Co');
    assert.equal(escapeAttr('A & B'), 'A &amp; B');
    assert.equal(escapeAttr("O'Brien' onmouseover='x"), 'O&#39;Brien&#39; onmouseover=&#39;x');
});

test('escapeAttr stringifies non-string values instead of throwing', () => {
    assert.equal(escapeAttr(2024), '2024');
    assert.equal(escapeAttr(0), '0');
    assert.equal(escapeAttr(false), 'false');
});
