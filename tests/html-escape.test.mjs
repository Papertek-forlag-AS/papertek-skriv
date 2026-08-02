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
