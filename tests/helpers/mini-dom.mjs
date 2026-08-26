/**
 * Minimal DOM implementation for Node tests.
 *
 * Supports exactly the surface getCleanHTML() (text-export.js) touches:
 * cloneNode(true), querySelectorAll with a comma-list of simple selectors
 * (tag, `*`, `.class`, `[attr]`, `[attr="v"]`, `[attr*="v"]`), closest(tag),
 * remove(), classList (iteration/remove/length), attributes, get/removeAttribute,
 * innerHTML get/set(''), appendChild, querySelector.
 *
 * Not a general DOM — extend it when a test needs more, never guess-parse.
 */

const VOID_TAGS = new Set(['IMG', 'BR', 'HR']);

export function el(tag, attrs = {}, children = []) {
    return new MiniElement(tag, attrs, children);
}

export function text(content) {
    return { nodeType: 3, textContent: content, _serialize: () => escapeText(content) };
}

function escapeText(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

class MiniClassList {
    constructor(owner) { this.owner = owner; }
    _list() {
        return (this.owner.attrs.class || '').split(/\s+/).filter(Boolean);
    }
    contains(cls) { return this._list().includes(cls); }
    remove(cls) {
        const next = this._list().filter(c => c !== cls);
        if (next.length) this.owner.attrs.class = next.join(' ');
        else this.owner.attrs.class = '';
    }
    get length() { return this._list().length; }
    [Symbol.iterator]() { return this._list()[Symbol.iterator](); }
}

class MiniElement {
    constructor(tag, attrs = {}, children = []) {
        this.nodeType = 1;
        this.tagName = tag.toUpperCase();
        this.attrs = { ...attrs };
        this.childNodes = [];
        this.parentElement = null;
        this.classList = new MiniClassList(this);
        for (const child of children) this.appendChild(child);
    }

    appendChild(child) {
        if (child.nodeType === 1) child.parentElement = this;
        this.childNodes.push(child);
        return child;
    }

    remove() {
        if (!this.parentElement) return;
        const siblings = this.parentElement.childNodes;
        const i = siblings.indexOf(this);
        if (i !== -1) siblings.splice(i, 1);
        this.parentElement = null;
    }

    get attributes() {
        return Object.entries(this.attrs)
            .filter(([, v]) => v !== '' || true)
            .map(([name, value]) => ({ name, value }));
    }

    getAttribute(name) {
        return name in this.attrs ? String(this.attrs[name]) : null;
    }

    removeAttribute(name) { delete this.attrs[name]; }

    get textContent() {
        return this.childNodes.map(c => c.textContent || '').join('');
    }

    cloneNode(deep) {
        const copy = new MiniElement(this.tagName, this.attrs);
        if (deep) {
            for (const child of this.childNodes) {
                copy.appendChild(child.nodeType === 1 ? child.cloneNode(true) : text(child.textContent));
            }
        }
        return copy;
    }

    closest(selector) {
        let node = this;
        while (node) {
            if (node.nodeType === 1 && matches(node, selector)) return node;
            node = node.parentElement;
        }
        return null;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }

    querySelectorAll(selectorList) {
        const selectors = selectorList.split(',').map(s => s.trim()).filter(Boolean);
        const found = [];
        (function walk(node) {
            for (const child of node.childNodes) {
                if (child.nodeType !== 1) continue;
                if (selectors.some(sel => matches(child, sel))) found.push(child);
                walk(child);
            }
        })(this);
        return found;
    }

    get innerHTML() {
        return this.childNodes.map(c => c.nodeType === 1 ? serialize(c) : c._serialize()).join('');
    }

    set innerHTML(value) {
        if (value !== '') throw new Error('mini-dom: only innerHTML = "" is supported');
        this.childNodes = [];
    }
}

/** Match one simple selector: tag, `*`, `.class`, `[attr]`, `[attr="v"]`, `[attr*="v"]`. */
function matches(node, selector) {
    if (selector === '*') return true;
    if (selector.startsWith('.')) return node.classList.contains(selector.slice(1));
    if (selector.startsWith('[')) {
        const m = selector.match(/^\[([\w-]+)(?:([*^$]?)="?([^"\]]*)"?)?\]$/);
        if (!m) throw new Error(`mini-dom: unsupported selector ${selector}`);
        const [, name, op, value] = m;
        const actual = node.getAttribute(name);
        if (actual === null) return false;
        if (value === undefined) return true;
        if (op === '*') return actual.includes(value);
        if (op === '') return actual === value;
        throw new Error(`mini-dom: unsupported attribute operator in ${selector}`);
    }
    return node.tagName === selector.toUpperCase();
}

function serialize(node) {
    const tag = node.tagName.toLowerCase();
    const attrs = Object.entries(node.attrs)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => ` ${k}="${String(v).replace(/"/g, '&quot;')}"`)
        .join('');
    if (VOID_TAGS.has(node.tagName)) return `<${tag}${attrs}>`;
    return `<${tag}${attrs}>${node.innerHTML}</${tag}>`;
}
