import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderHtmlNodeToDocx, buildDocxDocument } from '../public/js/editor-core/student/docx-export.js';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

// Load the vendored IIFE bundle in Node — it evaluates cleanly and returns
// the same namespace the browser gets on window.docx.
const docxLib = new Function(
    readFileSync(join(root, 'public/vendor/docx.iife.js'), 'utf8') + '; return docx;'
)();

// --- Minimal fake DOM (the walkers only touch this subset) ---

function textNode(text) {
    return { nodeType: 3, textContent: text };
}

function el(tag, attrs = {}, childNodes = []) {
    const node = {
        nodeType: 1,
        tagName: tag.toUpperCase(),
        attrs,
        childNodes,
        parentElement: null,
        getAttribute: (name) => (attrs[name] != null ? String(attrs[name]) : null),
        get children() {
            return childNodes.filter((c) => c.nodeType === 1);
        },
        get textContent() {
            return childNodes.map((c) => c.textContent || '').join('');
        },
        querySelector(sel) {
            return this.querySelectorAll(sel)[0] || null;
        },
        querySelectorAll(sel) {
            const want = sel.toUpperCase();
            const found = [];
            (function walk(n) {
                for (const c of n.childNodes || []) {
                    if (c.nodeType === 1) {
                        if (c.tagName === want) found.push(c);
                        walk(c);
                    }
                }
            })(node);
            return found;
        },
    };
    for (const c of childNodes) {
        if (c.nodeType === 1) c.parentElement = node;
    }
    return node;
}

const TINY_PNG =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function sampleBody() {
    return el('div', {}, [
        el('h1', {}, [textNode('Overskrift')]),
        el('p', {}, [
            textNode('Vanlig tekst med '),
            el('strong', {}, [textNode('fet')]),
            textNode(' og '),
            el('em', {}, [textNode('kursiv')]),
            textNode(' skrift.'),
        ]),
        el('ul', {}, [
            el('li', {}, [textNode('Første punkt')]),
            el('li', {}, [textNode('Andre punkt')]),
        ]),
        el('figure', {}, [
            el('img', { src: `data:image/png;base64,${TINY_PNG}`, width: 100, height: 80 }),
            el('figcaption', {}, [textNode('Bildetekst her')]),
        ]),
        el('table', {}, [
            el('tr', {}, [
                el('th', { width: 50 }, [textNode('Kolonne A')]),
                el('th', { width: 50 }, [textNode('Kolonne B')]),
            ]),
            el('tr', {}, [
                el('td', {}, [textNode('Celle 1')]),
                el('td', {}, [textNode('Celle 2')]),
            ]),
        ]),
    ]);
}

const LABELS = { dateStr: '25. august 2026', wordCount: 'Antall ord: 12', page: 'Side', pageOf: 'av' };

test('renderHtmlNodeToDocx produces paragraphs, a table and an image', () => {
    const out = renderHtmlNodeToDocx(docxLib, sampleBody());
    assert.ok(out.length >= 5, `expected several blocks, got ${out.length}`);
    const hasTable = out.some((o) => o instanceof docxLib.Table);
    assert.ok(hasTable, 'expected a docx Table in the output');
});

test('buildDocxDocument packs to a valid OOXML zip with the content intact', async () => {
    const doc = buildDocxDocument(docxLib, { title: 'Testtittel', body: sampleBody(), labels: LABELS });
    const buffer = await docxLib.Packer.toBuffer(doc);

    // Zip magic
    assert.equal(buffer[0], 0x50); // P
    assert.equal(buffer[1], 0x4b); // K

    const dir = mkdtempSync(join(tmpdir(), 'skriv-docx-'));
    const file = join(dir, 'test.docx');
    writeFileSync(file, buffer);

    let listing, documentXml;
    try {
        listing = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
        documentXml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
    } catch (err) {
        // No unzip binary on this machine — the magic-byte check above stands.
        return;
    }

    assert.match(listing, /\[Content_Types\]\.xml/);
    assert.match(listing, /word\/document\.xml/);
    assert.match(listing, /word\/media\//); // embedded image part

    assert.match(documentXml, /Vanlig tekst med /);
    assert.match(documentXml, /Overskrift/);
    assert.match(documentXml, /Bildetekst her/);
    assert.match(documentXml, /Kolonne A/);
    assert.match(documentXml, /<w:tbl>/);      // real Word table
    assert.match(documentXml, /<a:blip/);      // real embedded image reference
    assert.match(documentXml, /Calibri/);      // named font policy
});


test('body lists become real Word lists — bullets and restarting numbering, no text markers', async () => {
    const body = el('div', {}, [
        el('ul', {}, [
            el('li', {}, [textNode('Kulepunkt en')]),
            el('li', {}, [textNode('Kulepunkt to')]),
        ]),
        el('ol', {}, [
            el('li', {}, [textNode('Steg en')]),
            el('li', {}, [textNode('Steg to')]),
        ]),
        el('p', {}, [textNode('Mellomtekst.')]),
        el('ol', {}, [
            el('li', {}, [textNode('Ny liste starter her')]),
        ]),
    ]);
    const doc = buildDocxDocument(docxLib, { title: 'Lister', body, labels: LABELS });
    const buffer = await docxLib.Packer.toBuffer(doc);

    const dir = mkdtempSync(join(tmpdir(), 'skriv-docx-lists-'));
    const file = join(dir, 'lists.docx');
    writeFileSync(file, buffer);

    let documentXml, numberingXml;
    try {
        documentXml = execFileSync('unzip', ['-p', file, 'word/document.xml'], { encoding: 'utf8' });
        numberingXml = execFileSync('unzip', ['-p', file, 'word/numbering.xml'], { encoding: 'utf8' });
    } catch (err) {
        return; // no unzip binary — covered on machines that have it
    }

    // Real list paragraphs: every item carries w:numPr, none carries a
    // text marker prefix.
    const numPrCount = (documentXml.match(/<w:numPr>/g) || []).length;
    assert.equal(numPrCount, 5, 'all five list items must be real list paragraphs');
    assert.ok(!documentXml.includes('\u2022'), 'no literal bullet characters');
    assert.ok(!/>1\.\s\s/.test(documentXml), 'no text number prefixes');

    // The two OLs use DIFFERENT concrete numbering ids so the second
    // restarts at 1 instead of continuing 3, 4, ...
    const numIds = [...documentXml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map(m => m[1]);
    assert.equal(numIds.length, 5);
    assert.ok(new Set(numIds).size >= 3, 'bullets + two separate OL instances need distinct numbering ids');

    // The numbering part defines our decimal config.
    assert.match(numberingXml, /w:numFmt w:val="decimal"/);
    assert.match(numberingXml, /%1\./);
});

test('buildDocxDocument falls back to plain text when no body is given', async () => {
    const doc = buildDocxDocument(docxLib, { title: 'T', text: 'linje en\nlinje to', labels: LABELS });
    const buffer = await docxLib.Packer.toBuffer(doc);
    assert.ok(buffer.length > 1000);
});
