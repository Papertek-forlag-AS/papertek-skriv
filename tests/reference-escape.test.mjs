import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/**
 * Regression: the bibliography is rebuilt from the document's `references`
 * array with `entry.innerHTML = ...`. Those references come from the pupil's
 * dialog, but also from stored documents, imported library backups and
 * `.skriv` files opened from Microsoft 365 — so every field must reach the
 * HTML as text. Author and year used to be inserted raw (stored XSS).
 *
 * These tests drive the real initReferences() → loadReferences() →
 * updateRefList() path against a tiny fake DOM that records the HTML strings
 * the module writes. The fake's escaping mirrors what a browser's
 * `div.textContent = s; div.innerHTML` returns, which is what escapeHtml()
 * relies on.
 */

const ELEMENT_NODE = 1;

function browserEscapeText(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/ /g, '&nbsp;');
}

class FakeElement {
    constructor(tag) {
        this.nodeType = ELEMENT_NODE;
        this.tagName = tag.toUpperCase();
        this.className = '';
        this.dataset = {};
        this.childNodes = [];
        this.parentNode = null;
        this.contentEditable = 'inherit';
        this._html = null;
        this._text = null;
        const self = this;
        this.classList = {
            contains: (cls) => self.className.split(/\s+/).includes(cls),
        };
    }

    set textContent(value) {
        this._text = String(value);
        this._html = null;
        this.childNodes = [];
    }

    get textContent() {
        if (this._text !== null) return this._text;
        return this.childNodes.map((c) => c.textContent).join('');
    }

    set innerHTML(value) {
        this._html = String(value);
        this._text = null;
        this.childNodes = [];
    }

    get innerHTML() {
        if (this._html !== null) return this._html;
        if (this._text !== null) return browserEscapeText(this._text);
        return '';
    }

    appendChild(child) {
        if (child.parentNode) child.remove();
        child.parentNode = this;
        this.childNodes.push(child);
        return child;
    }

    insertBefore(child, ref) {
        if (child.parentNode) child.remove();
        child.parentNode = this;
        const i = ref ? this.childNodes.indexOf(ref) : -1;
        if (i === -1) this.childNodes.push(child);
        else this.childNodes.splice(i, 0, child);
        return child;
    }

    remove() {
        if (!this.parentNode) return;
        const siblings = this.parentNode.childNodes;
        siblings.splice(siblings.indexOf(this), 1);
        this.parentNode = null;
    }

    get previousSibling() {
        if (!this.parentNode) return null;
        const siblings = this.parentNode.childNodes;
        return siblings[siblings.indexOf(this) - 1] || null;
    }

    get nextSibling() {
        if (!this.parentNode) return null;
        const siblings = this.parentNode.childNodes;
        return siblings[siblings.indexOf(this) + 1] || null;
    }

    querySelectorAll(selector) {
        if (!/^\.[\w-]+$/.test(selector)) throw new Error(`fake DOM: unsupported selector ${selector}`);
        const cls = selector.slice(1);
        const found = [];
        (function walk(node) {
            for (const child of node.childNodes) {
                if (child.classList.contains(cls)) found.push(child);
                walk(child);
            }
        })(this);
        return found;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    addEventListener() {}
    removeEventListener() {}
}

globalThis.Node ??= { ELEMENT_NODE: 1, TEXT_NODE: 3 };
globalThis.document ??= {
    createElement: (tag) => new FakeElement(tag),
    querySelectorAll: () => [],
};

const { initReferences } = await import('../public/js/editor-core/student/reference-manager.js');

/** Editor with one inline marker per given ref id, in order. */
function editorWithMarkers(ids) {
    const editor = new FakeElement('div');
    const p = new FakeElement('p');
    for (const id of ids) {
        const marker = new FakeElement('span');
        marker.className = 'skriv-ref';
        marker.dataset.refId = id;
        marker.textContent = '[?]';
        p.appendChild(marker);
    }
    editor.appendChild(p);
    return editor;
}

/** Render the given references and return each bibliography entry's innerHTML. */
function renderEntries(references, markerIds = references.map((r) => r?.id)) {
    const editor = editorWithMarkers(markerIds.filter(Boolean));
    const api = initReferences(editor, {});
    api.loadReferences(references);
    const list = editor.querySelector('.skriv-references');
    assert.ok(list, 'bibliography block was rendered');
    const entries = list.querySelectorAll('.ref-entry').map((entry) => entry.innerHTML);
    api.destroy();
    return { entries, api };
}

/** Decode the entities a browser would decode in text content. */
function decodeText(html) {
    return html
        .replace(/<\/?i>/g, '')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&');
}

/** Every tag in the entry HTML must be the book-title italics, nothing else. */
function assertOnlyItalicTags(html) {
    const tags = html.match(/<[^>]*>/g) || [];
    for (const tag of tags) {
        assert.ok(tag === '<i>' || tag === '</i>', `unexpected markup in bibliography entry: ${tag}`);
    }
}

test('author and year with markup are rendered as text, never as HTML', () => {
    const { entries } = renderEntries([{
        id: 'ref-a',
        author: '<img src=x onerror=alert(1)>',
        year: '<script>alert(2)</script>',
        title: 'Tittel',
        url: '',
        publisher: '',
        type: 'web',
    }]);

    assert.equal(entries.length, 1);
    const [html] = entries;
    assert.doesNotMatch(html, /<img/i);
    assert.doesNotMatch(html, /<script/i);
    assertOnlyItalicTags(html);
    assert.equal(
        decodeText(html),
        '[1] <img src=x onerror=alert(1)> (<script>alert(2)</script>). Tittel.',
    );
});

test('author without year (trailing full stop branch) is escaped too', () => {
    const { entries } = renderEntries([{
        id: 'ref-a',
        author: '<svg onload=alert(1)>',
        year: '',
        title: '',
        type: 'web',
    }]);
    assertOnlyItalicTags(entries[0]);
    assert.equal(decodeText(entries[0]), '[1] <svg onload=alert(1)>.');
});

test('orphaned references (no marker in the text) are escaped the same way', () => {
    const { entries } = renderEntries(
        [
            { id: 'ref-placed', author: 'Hansen, K.', year: '2024', title: 'Plassert', type: 'web' },
            { id: 'ref-orphan', author: '<img src=x onerror=alert(1)>', year: '<b>1999</b>', title: 'Løs', type: 'web' },
        ],
        ['ref-placed'],
    );
    assert.equal(entries.length, 2);
    for (const html of entries) assertOnlyItalicTags(html);
    assert.equal(decodeText(entries[1]), '[?] <img src=x onerror=alert(1)> (<b>1999</b>). Løs.');
});

test('title, publisher, url and type with markup stay text; book titles keep their italics', () => {
    const { entries } = renderEntries([{
        id: 'ref-a',
        author: 'A',
        year: '2020',
        title: '<i>x</i><img src=x onerror=alert(1)>',
        publisher: '"><script>alert(3)</script>',
        url: 'https://example.no/?a=1&b=<x>',
        type: 'book',
    }]);
    const [html] = entries;
    assert.ok(html.startsWith('[1] A (2020). <i>'), 'book title is wrapped in <i>');
    assertOnlyItalicTags(html);
    assert.equal(
        decodeText(html),
        '[1] A (2020). <i>x</i><img src=x onerror=alert(1)>. "><script>alert(3)</script>. https://example.no/?a=1&b=<x>',
    );
});

test('a javascript: URL is shown as plain text and never becomes a live link', () => {
    const { entries } = renderEntries([{
        id: 'ref-a',
        author: 'Nordmann, O.',
        year: '2023',
        title: 'Kilde',
        url: 'javascript:alert(document.cookie)',
        type: 'web',
    }]);
    const [html] = entries;
    assert.doesNotMatch(html, /<a\b/i);
    assert.doesNotMatch(html, /href/i);
    assertOnlyItalicTags(html);
    assert.equal(decodeText(html), '[1] Nordmann, O. (2023). Kilde. javascript:alert(document.cookie)');
});

test('normal references render exactly as before (simplified APA)', () => {
    const { entries } = renderEntries([
        { id: 'r1', author: 'Hansen, K.', year: '2024', title: 'Skriving i skolen', publisher: 'Cappelen Damm', url: '', type: 'book' },
        { id: 'r2', author: 'Nordmann, O.', year: '2023', title: 'Kildebruk på nett', publisher: '', url: 'https://example.no/a?b=1&c=2', type: 'web' },
        { id: 'r3', author: '', year: '', title: 'Uten forfatter', publisher: '', url: '', type: 'article' },
        { id: 'r4', author: 'Berg', year: '', title: 'Artikkel', publisher: 'Tidsskrift', url: '', type: 'article' },
    ]);
    assert.deepEqual(entries, [
        '[1] Hansen, K. (2024). <i>Skriving i skolen</i>. Cappelen Damm.',
        '[2] Nordmann, O. (2023). Kildebruk på nett. https://example.no/a?b=1&amp;c=2',
        '[3] Uten forfatter.',
        '[4] Berg. Artikkel. Tidsskrift.',
    ]);
});

test('non-string fields from storage are coerced safely instead of breaking or leaking', () => {
    const hostile = { toString() { return '<img src=x onerror=alert(1)>'; } };
    const { entries, api } = renderEntries([{
        id: 'ref-a',
        author: hostile,
        year: 2024,
        title: ['<b>array</b>'],
        publisher: null,
        url: undefined,
        type: 'web',
    }]);
    const [html] = entries;
    assertOnlyItalicTags(html);
    assert.doesNotMatch(html, /<img|<b>/i);
    assert.equal(decodeText(html), '[1] (2024).');

    for (const ref of api.getReferences()) {
        for (const field of ['id', 'author', 'year', 'title', 'url', 'publisher', 'type']) {
            assert.equal(typeof ref[field], 'string', `${field} is a string after load`);
        }
    }
});

test('loadReferences tolerates a non-array or entries that are not objects', () => {
    const editor = editorWithMarkers([]);
    const api = initReferences(editor, {});
    assert.doesNotThrow(() => api.loadReferences(null));
    assert.doesNotThrow(() => api.loadReferences({ length: 1, 0: { id: 'x' } }));
    assert.doesNotThrow(() => api.loadReferences([null, 'text', 42, { id: 'ok', author: 'A', title: 'T' }]));
    assert.deepEqual(api.getReferences().map((r) => r.id), ['ok']);
    api.destroy();
});

test('reference-manager never writes a reference field into HTML without escaping', async () => {
    const source = await readFile(
        new URL('../public/js/editor-core/student/reference-manager.js', import.meta.url),
        'utf8',
    );
    // The dialog's input values go through escapeAttr; markers are found by
    // comparing dataset values, never by building a selector from an id.
    assert.ok(!/value="\$\{(?!escapeAttr\()/.test(source), 'dialog input value without escapeAttr');
    assert.ok(!/data-ref-id="\$\{/.test(source), 'selector built from a stored reference id');
});
