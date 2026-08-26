/**
 * Real .docx export — genuine OOXML via the vendored docx library.
 *
 * Ported from Papertek Lockdown's besvarelse-render.js (the docx half),
 * so Skriv and Skriveprøve produce the same Word output. Skriv
 * adaptations: inline images (<figure><img></figure> with data: URIs)
 * become ImageRun paragraphs with captions, header/footer labels are
 * injected by the caller so they can go through i18n, and body lists are
 * REAL Word lists (w:numPr — bullets + restarting numbered lists) rather
 * than text-marker prefixes.
 *
 * The library (docx 9.5.0, MIT, ~800 kB) is not part of the ES-module
 * graph: loadDocxLibrary() injects /vendor/docx.iife.js the first time
 * the pupil exports, so it never weighs on app startup. The service
 * worker's runtime cache keeps it available offline after first use.
 *
 * Font policy (same reasoning as Lockdown): the document NAMES Calibri
 * rather than embedding a font — Calibri ships with every Office install,
 * and a .docx re-wraps on open by definition, so Word is an editing
 * surface, not a fidelity surface.
 */

const DOCX_VENDOR_PATH = '/vendor/docx.iife.js';

const DOCX_FONT = 'Calibri';
const LINE_FACTOR = 1.5;                       // Norwegian school standard
const DOCX_LINE_TWIPS = LINE_FACTOR * 240;     // 360 = 1.5 line spacing

// Gap after each block, in mm — derived from the editor's CSS margins at
// 96 dpi (p 4px, lists/blockquotes 6px, li 2.4px, headings 0.3em = 4.8px).
// Mirrors Lockdown's exam-layout BLOCK_GAP_MM so the two apps' Word
// output stays identical.
const BLOCK_GAP_MM = Object.freeze({
    P:          4   * 25.4 / 96,
    DIV:        0,
    UL:         6   * 25.4 / 96,
    OL:         6   * 25.4 / 96,
    LI:         2.4 * 25.4 / 96,
    BLOCKQUOTE: 6   * 25.4 / 96,
    FIGURE:     6   * 25.4 / 96,
    H1:         4.8 * 25.4 / 96,
    H2:         4.8 * 25.4 / 96,
    H3:         4.8 * 25.4 / 96,
    H4:         4.8 * 25.4 / 96,
    H5:         4.8 * 25.4 / 96,
    H6:         4.8 * 25.4 / 96,
});

// Editor cell padding (6px/8px) in mm — matches the PDF table constants.
const TABLE_CELL_PAD_Y_MM = (6 + 0.5) * 25.4 / 96;
const TABLE_CELL_PAD_X_MM = 8 * 25.4 / 96;

// Max displayed image width in px: 70% of the A4 content width (160 mm at
// 96 dpi ≈ 605 px), matching the editor/export figure styling.
const IMAGE_MAX_WIDTH_PX = Math.round(160 * 96 / 25.4 * 0.7);

/** DOM node types. Spec-fixed values so the walkers also run under test
 *  environments without a global `Node`. */
const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

let docxLoadPromise = null;

/**
 * Lazy-load the vendored docx IIFE bundle. Resolves to the `window.docx`
 * namespace. Safe to call repeatedly — the script is injected once.
 * @returns {Promise<Object>}
 */
export function loadDocxLibrary() {
    if (window.docx) return Promise.resolve(window.docx);
    if (docxLoadPromise) return docxLoadPromise;
    docxLoadPromise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = DOCX_VENDOR_PATH;
        script.onload = () => resolve(window.docx);
        script.onerror = () => {
            docxLoadPromise = null;
            reject(new Error('Failed to load docx library'));
        };
        document.head.appendChild(script);
    });
    return docxLoadPromise;
}

// Bullet ("•") or number ("N.") prefix for a list item. Only used inside
// TABLE CELLS, where a plain text marker is simpler than per-cell
// numbering plumbing; body lists use real Word numbering (see
// flushParagraph / the skriv-ol numbering config in buildDocxDocument).
function listMarker(li) {
    const parent = li.parentElement;
    const tag = parent && parent.tagName ? parent.tagName.toUpperCase() : '';
    if (tag === 'OL') {
        const items = Array.from(parent.children).filter((c) => c.tagName && c.tagName.toUpperCase() === 'LI');
        return `${items.indexOf(li) + 1}.  `;
    }
    if (tag === 'UL') return '•  ';
    return '';
}

/**
 * Recursively walk a DOM node and produce an array of docx Paragraph /
 * Table objects (a docx section accepts both).
 *
 * @param {Object} docxLib - The docx library namespace
 * @param {Node} rootNode - Root DOM node to walk
 * @returns {Array} Array of docx Paragraph/Table objects
 */
export function renderHtmlNodeToDocx(docxLib, rootNode) {
    const {
        Paragraph, TextRun, ImageRun, Table, TableRow, TableCell,
        WidthType, BorderStyle, AlignmentType,
    } = docxLib;
    const out = [];
    let currentRuns = [];
    let currentTag = 'P';

    // Real Word lists: track the enclosing UL/OL while walking. Each OL
    // gets its own numbering INSTANCE so every list restarts at 1.
    const listStack = [];         // { type: 'UL'|'OL', instance }
    let olInstances = 0;
    let currentListCtx = null;    // captured at LI entry, consumed by flushParagraph

    /** mm → OOXML twips (twentieths of a point; 1440 per inch). */
    const twips = (mmVal) => Math.round(mmVal / 25.4 * 1440);

    function flushParagraph() {
        if (currentRuns.length > 0) {
            const props = {
                children: currentRuns,
                spacing: {
                    line: DOCX_LINE_TWIPS,
                    lineRule: 'auto',
                    after: twips(BLOCK_GAP_MM[currentTag] ?? BLOCK_GAP_MM.P),
                },
            };
            // List items become genuine Word list paragraphs: numbered
            // lists reference the skriv-ol config (per-list instance →
            // numbering restarts), bullets use the library's built-in
            // bullet numbering. Word then handles continuation, renumbering
            // and indentation natively when the pupil keeps editing.
            if (currentTag === 'LI' && currentListCtx) {
                if (currentListCtx.type === 'OL') {
                    props.numbering = {
                        reference: 'skriv-ol',
                        level: currentListCtx.level,
                        instance: currentListCtx.instance,
                    };
                } else {
                    props.bullet = { level: currentListCtx.level };
                }
            }
            out.push(new Paragraph(props));
            currentRuns = [];
        }
    }

    // Tag → formatting. Headings render bold, matching the PDF/editor.
    const fmtOf = (tag, fmt) => ({
        bold: fmt.bold || tag === 'B' || tag === 'STRONG' || /^H[1-6]$/.test(tag || ''),
        italic: fmt.italic || tag === 'I' || tag === 'EM',
        underline: fmt.underline || tag === 'U',
    });

    function makeRun(text, fmt) {
        return new TextRun({
            text,
            font: DOCX_FONT,
            bold: fmt.bold,
            italics: fmt.italic,
            underline: fmt.underline ? {} : undefined,
            size: 24, // 12pt = 24 half-points
        });
    }

    // --- Images (Skriv addition) ---
    // The cleaned editor HTML carries <figure><img src="data:image/..."/>
    // <figcaption>…</figcaption></figure>. The image becomes a centered
    // ImageRun paragraph; the caption a small italic paragraph below it.
    function pushImageBlock(figureNode) {
        const img = figureNode.querySelector ? figureNode.querySelector('img') : null;
        const caption = figureNode.querySelector ? figureNode.querySelector('figcaption') : null;

        if (img) {
            const src = img.getAttribute('src') || '';
            const match = /^data:image\/(png|jpe?g|gif|bmp);base64,([\s\S]+)$/i.exec(src);
            if (match) {
                try {
                    const type = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
                    const binary = atob(match[2]);
                    const bytes = new Uint8Array(binary.length);
                    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

                    let width = img.naturalWidth || parseInt(img.getAttribute('width') || '', 10) || 480;
                    let height = img.naturalHeight || parseInt(img.getAttribute('height') || '', 10) || Math.round(width * 3 / 4);
                    if (width > IMAGE_MAX_WIDTH_PX) {
                        height = Math.round(height * IMAGE_MAX_WIDTH_PX / width);
                        width = IMAGE_MAX_WIDTH_PX;
                    }

                    out.push(new Paragraph({
                        alignment: AlignmentType.CENTER,
                        spacing: { after: twips(BLOCK_GAP_MM.FIGURE) },
                        children: [new ImageRun({
                            type,
                            data: bytes,
                            transformation: { width, height },
                        })],
                    }));
                } catch (e) {
                    console.warn('docx image embed failed, skipping image:', e);
                }
            }
        }

        const captionText = caption ? (caption.textContent || '').trim() : '';
        if (captionText) {
            out.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: twips(BLOCK_GAP_MM.FIGURE) },
                children: [new TextRun({
                    text: captionText,
                    font: DOCX_FONT,
                    italics: true,
                    size: 20, // 10pt
                    color: '555555',
                })],
            }));
        }
    }

    // Render one table cell's inline content into an array of Paragraphs
    // (a TableCell requires at least one Paragraph child).
    function renderCellParagraphs(cell, isHeader) {
        const paras = [];
        let runs = [];
        const flush = () => { paras.push(new Paragraph({ children: runs })); runs = []; };
        (function walk(node, fmt) {
            if (node.nodeType === TEXT_NODE) {
                const parts = (node.textContent || '').split('\n');
                parts.forEach((p, i) => {
                    if (i > 0) flush();
                    if (p) runs.push(makeRun(p, { ...fmt, bold: fmt.bold || isHeader }));
                });
                return;
            }
            if (node.nodeType !== ELEMENT_NODE) return;
            const tag = node.tagName?.toUpperCase();
            if (tag === 'BR') { flush(); return; }
            const nf = fmtOf(tag, fmt);
            const isBlock = tag === 'P' || tag === 'DIV' || tag === 'LI' || /^H[1-6]$/.test(tag || '');
            if (isBlock && runs.length) flush();
            if (tag === 'LI') runs.push(makeRun(listMarker(node), { ...fmt, bold: fmt.bold || isHeader }));
            for (const c of node.childNodes) walk(c, nf);
            if (isBlock && runs.length) flush();
        })(cell, { bold: false, italic: false, underline: false });
        if (runs.length) flush();
        if (!paras.length) paras.push(new Paragraph({ children: [] }));
        return paras;
    }

    const BORDER = { style: BorderStyle.SINGLE, size: 4, color: 'D6D3D1' };
    const CELL_BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

    // Build a real docx Table from an HTML <table>. Column widths are taken
    // from pinned width attributes (proportional); the table fills the text
    // width.
    function buildTable(tableNode) {
        const rowEls = Array.from(tableNode.querySelectorAll('tr'));
        if (!rowEls.length) return null;
        const firstCells = Array.from(rowEls[0].children);
        const widths = firstCells.map((c) => parseInt(c.getAttribute('width') || '', 10));
        const haveWidths = widths.length > 0 && widths.every((w) => Number.isFinite(w) && w > 0);
        const total = haveWidths ? widths.reduce((a, b) => a + b, 0) : 0;
        const CONTENT_TWIPS = 9000; // ~ A4 content width (proportions scale to 100%)
        const columnWidths = haveWidths ? widths.map((w) => Math.round((w / total) * CONTENT_TWIPS)) : undefined;
        const rows = rowEls.map((tr) => new TableRow({
            children: Array.from(tr.children).map((cell, i) => new TableCell({
                children: renderCellParagraphs(cell, cell.tagName?.toUpperCase() === 'TH'),
                // A row may carry more cells than the header row; an
                // over-count cell simply gets no pinned width (auto-sized)
                // instead of making docx throw on {size: undefined}.
                width: columnWidths?.[i] != null ? { size: columnWidths[i], type: WidthType.DXA } : undefined,
                borders: CELL_BORDERS,
                margins: {
                    top: twips(TABLE_CELL_PAD_Y_MM), bottom: twips(TABLE_CELL_PAD_Y_MM),
                    left: twips(TABLE_CELL_PAD_X_MM), right: twips(TABLE_CELL_PAD_X_MM),
                },
            })),
        }));
        return new Table({
            rows,
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths,
        });
    }

    function walkNode(node, fmt) {
        if (node.nodeType === TEXT_NODE) {
            const content = node.textContent;
            if (!content) return;
            const parts = content.split('\n');
            for (let i = 0; i < parts.length; i++) {
                if (i > 0) flushParagraph();
                if (parts[i]) currentRuns.push(makeRun(parts[i], fmt));
            }
            return;
        }
        if (node.nodeType !== ELEMENT_NODE) return;
        const tag = node.tagName?.toUpperCase();
        if (tag === 'BR') { currentRuns.push(new TextRun({ break: 1, font: DOCX_FONT })); return; }
        if (tag === 'FIGURE' || tag === 'IMG') {
            flushParagraph();
            pushImageBlock(tag === 'FIGURE' ? node : { querySelector: (sel) => (sel === 'img' ? node : null) });
            return;
        }
        if (tag === 'TABLE') {
            flushParagraph();
            try {
                const t = buildTable(node);
                if (t) {
                    out.push(t);
                    // Word needs a paragraph after a table (else adjacent
                    // tables merge / a trailing table confuses the renderer).
                    out.push(new Paragraph({ children: [] }));
                    return;
                }
            } catch (e) {
                console.warn('docx table build failed, flattening:', e);
                // fall through to the recurse-and-flatten behavior
            }
        }
        if (tag === 'UL' || tag === 'OL') {
            flushParagraph();
            listStack.push({ type: tag, instance: tag === 'OL' ? olInstances++ : 0 });
            for (const child of node.childNodes) walkNode(child, fmt);
            listStack.pop();
            currentListCtx = null;
            return;
        }
        const newFmt = fmtOf(tag, fmt);
        const isBlock = ['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag);
        // flushParagraph reads currentTag, so set it AFTER flushing what the
        // previous block accumulated and reset it once this block is closed.
        if (isBlock) { flushParagraph(); currentTag = tag; }
        if (tag === 'LI') {
            const top = listStack[listStack.length - 1];
            // Deeper nesting than Word's three common levels flattens to level 2.
            currentListCtx = top
                ? { type: top.type, level: Math.min(listStack.length - 1, 2), instance: top.instance }
                : null;
        }
        for (const child of node.childNodes) walkNode(child, newFmt);
        if (isBlock) { flushParagraph(); currentTag = 'P'; if (tag === 'LI') currentListCtx = null; }
    }

    walkNode(rootNode, { bold: false, italic: false, underline: false });
    flushParagraph();
    if (out.length === 0) out.push(new Paragraph({ children: [] }));
    return out;
}

/**
 * Build the Word document. Returns the docx Document — pack it with
 * Packer.toBlob (browser) or Packer.toBuffer (tests/server).
 *
 * @param {Object} docxLib - The docx library namespace
 * @param {Object} params
 * @param {string} params.title - Document title (rendered in header)
 * @param {Node} [params.body] - Parsed body element (preferred — preserves formatting)
 * @param {string} [params.text] - Plain text fallback when body is absent
 * @param {Object} params.labels - i18n'd chrome text
 * @param {string} params.labels.dateStr - Formatted date for the header
 * @param {string} params.labels.wordCount - e.g. "Antall ord: 312"
 * @param {string} params.labels.page - e.g. "Side"
 * @param {string} params.labels.pageOf - e.g. "av"
 * @returns {Object} the docx Document
 */
export function buildDocxDocument(docxLib, { title, body, text, labels }) {
    const { Document, Paragraph, TextRun, Header, Footer, AlignmentType, PageNumber, LevelFormat } = docxLib;

    let bodyParagraphs;
    if (body) {
        bodyParagraphs = renderHtmlNodeToDocx(docxLib, body);
    } else {
        const lines = (text || '').split('\n');
        // Each entry is one LINE, not a paragraph — the 1.5 line spacing
        // does all the work, so no inter-paragraph gap on top.
        bodyParagraphs = lines.map(line => new Paragraph({
            children: [new TextRun({ text: line, font: DOCX_FONT, size: 24 })],
            spacing: { line: DOCX_LINE_TWIPS, lineRule: 'auto', after: 0 },
        }));
    }

    const headerRun = (t) => new TextRun({ text: t, font: DOCX_FONT, size: 16, color: '8C8C8C' });
    const makeHeader = (withWordCount) => new Header({
        children: [new Paragraph({
            children: [
                headerRun(title),
                headerRun('    |    '),
                headerRun(withWordCount ? `${labels.dateStr}  |  ${labels.wordCount}` : labels.dateStr),
            ],
        })],
    });

    const footerRun = (opts) => new TextRun({ font: DOCX_FONT, size: 14, color: 'AAAAAA', ...opts });
    const makeFooterParagraph = () => new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
            footerRun({ text: `${labels.page} ` }),
            footerRun({ children: [PageNumber.CURRENT] }),
            footerRun({ text: ` ${labels.pageOf} ` }),
            footerRun({ children: [PageNumber.TOTAL_PAGES] }),
        ],
    });

    // Numbered-list definition for body lists (see renderHtmlNodeToDocx).
    // Levels: 1. / a. / i. — Word's conventional outline progression.
    const olFormats = [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN];
    const numberingConfig = {
        config: [{
            reference: 'skriv-ol',
            levels: [0, 1, 2].map((level) => ({
                level,
                format: olFormats[level],
                text: `%${level + 1}.`,
                alignment: AlignmentType.START,
                style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
            })),
        }],
    };

    return new Document({
        numbering: numberingConfig,
        sections: [{
            properties: {
                titlePage: true,
                page: {
                    margin: { top: 1440, bottom: 1134, left: 1418, right: 1418 },
                    pageNumbers: { start: 1 },
                },
            },
            headers: {
                first: makeHeader(true),
                default: makeHeader(false),
            },
            footers: {
                first: new Footer({ children: [makeFooterParagraph()] }),
                default: new Footer({ children: [makeFooterParagraph()] }),
            },
            children: bodyParagraphs,
        }],
    });
}
