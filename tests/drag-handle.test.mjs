import test from 'node:test';
import assert from 'node:assert/strict';
import { initDragHandle } from '../public/js/editor-core/student/drag-handle.js';
import nb from '../public/js/editor-core/locales/nb.js';
import nn from '../public/js/editor-core/locales/nn.js';
import en from '../public/js/editor-core/locales/en.js';

class FakeEventTarget {
    constructor() {
        this.listeners = new Map();
    }

    addEventListener(type, handler) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type).add(handler);
    }

    removeEventListener(type, handler) {
        this.listeners.get(type)?.delete(handler);
    }

    dispatch(type, event = {}) {
        event.type = type;
        event.target ??= this;
        event.currentTarget = this;
        for (const handler of [...(this.listeners.get(type) || [])]) handler(event);
        return event;
    }

    listenerCount() {
        return [...this.listeners.values()].reduce((total, handlers) => total + handlers.size, 0);
    }
}

class FakeClassList {
    constructor(owner) {
        this.owner = owner;
    }

    add(...tokens) {
        tokens.forEach(token => this.owner.classes.add(token));
    }

    remove(...tokens) {
        tokens.forEach(token => this.owner.classes.delete(token));
    }

    toggle(token, force) {
        const shouldAdd = force === undefined ? !this.owner.classes.has(token) : force;
        if (shouldAdd) this.owner.classes.add(token);
        else this.owner.classes.delete(token);
        return shouldAdd;
    }

    contains(token) {
        return this.owner.classes.has(token);
    }
}

class FakeElement extends FakeEventTarget {
    constructor(tagName, ownerDocument) {
        super();
        this.nodeType = 1;
        this.tagName = tagName.toUpperCase();
        this.ownerDocument = ownerDocument;
        this.parentNode = null;
        this.children = [];
        this.attributes = new Map();
        this.dataset = {};
        this.style = {};
        this.classes = new Set();
        this.classList = new FakeClassList(this);
        this._innerHTML = '';
        this.textContent = '';
        this.tabIndex = 0;
    }

    set className(value) {
        this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    }

    get className() {
        return [...this.classes].join(' ');
    }

    set innerHTML(value) {
        this._innerHTML = String(value);
    }

    get innerHTML() {
        return this._innerHTML;
    }

    get childNodes() {
        return this.children;
    }

    get nextSibling() {
        if (!this.parentNode) return null;
        const index = this.parentNode.children.indexOf(this);
        return this.parentNode.children[index + 1] || null;
    }

    get previousElementSibling() {
        if (!this.parentNode) return null;
        const index = this.parentNode.children.indexOf(this);
        for (let i = index - 1; i >= 0; i -= 1) {
            if (this.parentNode.children[i].nodeType === 1) return this.parentNode.children[i];
        }
        return null;
    }

    get nextElementSibling() {
        if (!this.parentNode) return null;
        const index = this.parentNode.children.indexOf(this);
        for (let i = index + 1; i < this.parentNode.children.length; i += 1) {
            if (this.parentNode.children[i].nodeType === 1) return this.parentNode.children[i];
        }
        return null;
    }

    appendChild(child) {
        return this.insertBefore(child, null);
    }

    insertBefore(child, reference) {
        if (reference === child) return child;
        if (reference !== null && reference.parentNode !== this) {
            throw new Error('Reference is not a child');
        }
        if (child.parentNode) {
            const oldIndex = child.parentNode.children.indexOf(child);
            child.parentNode.children.splice(oldIndex, 1);
        }
        const index = reference === null ? this.children.length : this.children.indexOf(reference);
        this.children.splice(index, 0, child);
        child.parentNode = this;
        return child;
    }

    remove() {
        if (!this.parentNode) return;
        const index = this.parentNode.children.indexOf(this);
        this.parentNode.children.splice(index, 1);
        this.parentNode = null;
    }

    setAttribute(name, value) {
        this.attributes.set(name, String(value));
    }

    getAttribute(name) {
        return this.attributes.get(name) ?? null;
    }

    contains(node) {
        if (!node) return false;
        if (node === this) return true;
        return this.children.some(child => child.contains(node));
    }

    focus() {
        this.ownerDocument.activeElement = this;
    }

    getBoundingClientRect() {
        const index = Math.max(0, this.parentNode?.children.indexOf(this) ?? 0);
        const top = index * 40;
        return { left: 100, top, bottom: top + 24, width: 400, height: 24 };
    }
}

class FakeDocument extends FakeEventTarget {
    constructor() {
        super();
        this.head = new FakeElement('head', this);
        this.body = new FakeElement('body', this);
        this.activeElement = null;
        this.selection = { rangeCount: 0, anchorNode: null };
    }

    createElement(tagName) {
        return new FakeElement(tagName, this);
    }

    getSelection() {
        return this.selection;
    }
}

function createKeyboardEvent(key, modifiers = {}) {
    return {
        key,
        altKey: false,
        ctrlKey: false,
        metaKey: false,
        defaultPrevented: false,
        propagationStopped: false,
        preventDefault() { this.defaultPrevented = true; },
        stopPropagation() { this.propagationStopped = true; },
        ...modifiers,
    };
}

function setupDom() {
    const previousDocument = globalThis.document;
    const previousWindow = globalThis.window;
    const previousWarn = console.warn;
    const document = new FakeDocument();
    const window = new FakeEventTarget();
    window.scrollX = 0;
    window.scrollY = 0;
    globalThis.document = document;
    globalThis.window = window;
    console.warn = () => {};

    const editor = document.createElement('div');
    editor.className = 'skriv-editor-content';
    document.body.appendChild(editor);

    function addBlock(text) {
        const block = document.createElement('p');
        block.innerHTML = text;
        editor.appendChild(block);
        return block;
    }

    function restore() {
        globalThis.document = previousDocument;
        globalThis.window = previousWindow;
        console.warn = previousWarn;
    }

    return { document, window, editor, addBlock, restore };
}

test('drag handle is a localized semantic button with discoverable keyboard shortcuts', t => {
    const dom = setupDom();
    const api = initDragHandle(dom.editor);
    t.after(() => {
        api.destroy();
        dom.restore();
    });

    const handle = dom.document.body.children.find(child => child.tagName === 'BUTTON');
    assert.ok(handle);
    assert.equal(handle.type, 'button');
    assert.equal(handle.getAttribute('aria-label'), 'dragHandle.label');
    assert.equal(handle.getAttribute('aria-description'), 'dragHandle.keyboardHint');
    assert.equal(handle.getAttribute('title'), 'dragHandle.keyboardHint');
    assert.equal(handle.getAttribute('aria-keyshortcuts'), 'Alt+ArrowUp Alt+ArrowDown');
    assert.equal(handle.tabIndex, -1, 'inactive handle should not be in the tab order');
});

test('drag-handle label and keyboard hint exist in every interface locale', () => {
    for (const [language, translations] of Object.entries({ nb, nn, en })) {
        assert.equal(typeof translations.dragHandle?.label, 'string', `${language}: dragHandle.label`);
        assert.ok(translations.dragHandle.label.length > 0, `${language}: non-empty dragHandle.label`);
        assert.equal(typeof translations.dragHandle?.keyboardHint, 'string', `${language}: dragHandle.keyboardHint`);
        assert.match(translations.dragHandle.keyboardHint, /Alt/i, `${language}: shortcut is discoverable`);
    }
});

test('Alt+Arrow moves the selected block, schedules persistence, and preserves focus', t => {
    const dom = setupDom();
    const first = dom.addBlock('First');
    const second = dom.addBlock('Second');
    const third = dom.addBlock('Third');
    let moveCount = 0;
    const api = initDragHandle(dom.editor, { onDragDrop: () => { moveCount += 1; } });
    t.after(() => {
        api.destroy();
        dom.restore();
    });

    dom.document.selection = { rangeCount: 1, anchorNode: second };
    dom.document.activeElement = dom.editor;
    dom.document.dispatch('selectionchange');

    const moveUp = createKeyboardEvent('ArrowUp', { altKey: true });
    dom.editor.dispatch('keydown', moveUp);
    assert.deepEqual(dom.editor.children, [second, first, third]);
    assert.equal(moveCount, 1);
    assert.equal(moveUp.defaultPrevented, true);
    assert.equal(dom.document.activeElement, dom.editor);

    const nativeUndo = createKeyboardEvent('z', { ctrlKey: true });
    dom.editor.dispatch('keydown', nativeUndo);
    assert.deepEqual(dom.editor.children, [second, first, third]);
    assert.equal(moveCount, 1);
    assert.equal(nativeUndo.defaultPrevented, false, 'native undo shortcuts must not be intercepted');

    const handle = dom.document.body.children.find(child => child.tagName === 'BUTTON');
    handle.focus();
    const moveDown = createKeyboardEvent('ArrowDown');
    handle.dispatch('keydown', moveDown);
    assert.deepEqual(dom.editor.children, [first, second, third]);
    assert.equal(moveCount, 2);
    assert.equal(moveDown.defaultPrevented, true);
    assert.equal(dom.document.activeElement, handle);
});

test('destroy removes every owned listener, timer, element, and style', async t => {
    const dom = setupDom();
    t.after(dom.restore);
    const first = dom.addBlock('First');
    const second = dom.addBlock('Second');
    const api = initDragHandle(dom.editor);

    dom.document.selection = { rangeCount: 1, anchorNode: first };
    dom.document.dispatch('selectionchange');
    const handle = dom.document.body.children.find(child => child.tagName === 'BUTTON');
    const dataTransfer = {
        effectAllowed: '',
        dropEffect: '',
        setData() {},
        setDragImage() {},
    };
    handle.dispatch('dragstart', {
        dataTransfer,
        preventDefault() {},
    });
    dom.editor.dispatch('dragover', {
        target: second,
        clientY: 100,
        dataTransfer,
        preventDefault() {},
    });

    assert.equal(dom.document.head.children.length, 1);
    assert.equal(dom.document.body.children.length, 3, 'editor, handle, and drop line are mounted');
    assert.ok(dom.editor.listenerCount() > 0);
    assert.ok(dom.document.listenerCount() > 0);
    assert.ok(dom.window.listenerCount() > 0);

    api.destroy();
    api.destroy();
    await new Promise(resolve => setTimeout(resolve, 5));

    assert.equal(dom.editor.listenerCount(), 0);
    assert.equal(dom.document.listenerCount(), 0);
    assert.equal(dom.window.listenerCount(), 0);
    assert.equal(handle.listenerCount(), 0);
    assert.equal(dom.document.head.children.length, 0);
    assert.deepEqual(dom.document.body.children, [dom.editor]);
    assert.equal(first.classList.contains('opacity-30'), false, 'cleared timer must not dim a block after teardown');
});
