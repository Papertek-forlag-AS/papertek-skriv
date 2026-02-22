/**
 * Export written text as a downloadable .txt or .pdf file.
 * Supports TOC and reference rendering in PDF.
 */

import { countWords } from '../shared/word-counter.js';
import { showInPageAlert } from '../shared/in-page-modal.js';

/**
 * Download text as a .txt file with UTF-8 BOM.
 */
export function downloadText({ title, studentName, text }) {
    const date = new Date();
    const dateStr = date.toLocaleDateString('nb-NO', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
    const wordCount = countWords(text);

    const header = [
        `${title || 'Dokument'}`,
        `Forfatter: ${studentName || 'Ukjent'}`,
        `Dato: ${dateStr}`,
        `Antall ord: ${wordCount}`,
        '\u2500'.repeat(40),
        ''
    ].join('\n');

    const content = '\uFEFF' + header + text;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const safeName = (studentName || 'dokument').replace(/[^a-zA-Z\u00e6\u00f8\u00e5\u00c6\u00d8\u00c5\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df0-9]/g, '-');
    const safeTitle = (title || 'skriv').replace(/[^a-zA-Z\u00e6\u00f8\u00e5\u00c6\u00d8\u00c5\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df0-9]/g, '-');
    const filename = `skriv-${safeTitle}-${safeName}.txt`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Download text as a formatted PDF.
 * Uses jsPDF (loaded via CDN in HTML).
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.studentName
 * @param {string} opts.text
 * @param {string} opts.html
 * @param {Array} [opts.references] - Array of reference objects
 */
export function downloadPDF({ title, studentName, text, html, references }) {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
        showInPageAlert('PDF', 'PDF-biblioteket er ikke lastet. Prøv å laste ned som .txt i stedet.');
        return;
    }

    const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 25;
    const marginRight = 25;
    const marginTop = 30;
    const marginBottom = 25;
    const contentWidth = pageWidth - marginLeft - marginRight;

    let y = marginTop;

    const date = new Date();
    const dateStr = date.toLocaleDateString('nb-NO', {
        year: 'numeric', month: 'long', day: 'numeric'
    });
    const wordCount = countWords(text);

    // --- Header ---
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(18);
    doc.text(title || 'Dokument', marginLeft, y);
    y += 10;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(`Forfatter: ${studentName || 'Ukjent'}`, marginLeft, y);
    y += 5;
    doc.text(`Dato: ${dateStr}`, marginLeft, y);
    y += 5;
    doc.text(`Antall ord: ${wordCount}`, marginLeft, y);
    y += 5;

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 10;

    // --- Body ---
    if (html) {
        const parser = new DOMParser();
        const dom = parser.parseFromString(html, 'text/html');
        const state = { x: marginLeft, baseX: marginLeft, y, contentWidth, pageHeight, marginTop, marginBottom, pageWidth, marginRight, listStack: [] };
        renderHtmlNodeToPDF(doc, dom.body, { bold: false, italic: false, underline: false, heading: null }, state);
    } else {
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(12);
        doc.setFont('times', 'normal');

        const lines = doc.splitTextToSize(text || '', contentWidth);

        for (const line of lines) {
            if (y + 7 > pageHeight - marginBottom) {
                doc.addPage();
                y = marginTop;
            }
            doc.text(line, marginLeft, y);
            y += 7;
        }
    }

    // --- Download ---
    const safeName = (studentName || 'dokument').replace(/[^a-zA-Z\u00e6\u00f8\u00e5\u00c6\u00d8\u00c5\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df0-9]/g, '-');
    const safeTitle = (title || 'skriv').replace(/[^a-zA-Z\u00e6\u00f8\u00e5\u00c6\u00d8\u00c5\u00e4\u00f6\u00fc\u00c4\u00d6\u00dc\u00df0-9]/g, '-');
    doc.save(`skriv-${safeTitle}-${safeName}.pdf`);
}

/**
 * Recursively walk a DOM node and render text into jsPDF with formatting.
 * Skips TOC and reference blocks (they are rendered separately within the walk).
 */
function renderHtmlNodeToPDF(doc, node, fmt, state) {
    if (node.nodeType === Node.TEXT_NODE) {
        const content = node.textContent;
        if (!content || !content.trim()) return;

        const fontStyle = fmt.bold && fmt.italic ? 'bolditalic'
            : fmt.bold ? 'bold'
            : fmt.italic ? 'italic'
            : 'normal';

        const fontFamily = fmt.heading ? 'helvetica' : 'times';
        const fontSize = fmt.heading === 'H1' ? 16 : fmt.heading === 'H2' ? 14 : 12;
        const lineHeight = fontSize * 0.352 * 1.5;

        doc.setFont(fontFamily, fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(30, 30, 30);

        const lines = doc.splitTextToSize(content, state.contentWidth);
        for (const line of lines) {
            if (state.y + lineHeight > state.pageHeight - state.marginBottom) {
                doc.addPage();
                state.y = state.marginTop;
            }
            doc.text(line, state.x, state.y);

            if (fmt.underline) {
                const textWidth = doc.getTextWidth(line);
                doc.setDrawColor(30, 30, 30);
                doc.setLineWidth(0.2);
                doc.line(state.x, state.y + 0.7, state.x + textWidth, state.y + 0.7);
            }

            state.y += lineHeight;
        }
        return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName?.toUpperCase();
    const el = node;

    // --- Skip frame scaffold elements (section headers, subsections, untouched prompts) ---
    if (el.classList?.contains('skriv-frame-section')) return;
    if (el.classList?.contains('skriv-frame-subsection')) return;
    if (el.classList?.contains('skriv-frame-prompt')) return;

    // --- Skip TOC block, render formatted TOC instead ---
    if (el.classList?.contains('skriv-toc')) {
        renderTocToPDF(doc, el, state);
        return;
    }

    // --- Skip references block, render formatted references instead ---
    if (el.classList?.contains('skriv-references')) {
        renderReferencesToPDF(doc, el, state);
        return;
    }

    // --- Skip inline reference markers, render as [n] text ---
    if (el.classList?.contains('skriv-ref')) {
        const markerText = el.textContent || '';
        const fontSize = 12;
        const lineHeight = fontSize * 0.352 * 1.5;

        doc.setFont('times', 'normal');
        doc.setFontSize(fontSize);
        doc.setTextColor(30, 30, 30);

        if (state.y + lineHeight > state.pageHeight - state.marginBottom) {
            doc.addPage();
            state.y = state.marginTop;
        }
        doc.text(markerText, state.x + doc.getTextWidth(' ') * 0, state.y);
        // The marker is inline, so we add its width to the next text
        // For simplicity, just render it inline
        const w = doc.getTextWidth(markerText);
        // We won't advance y, the next text will flow after. But since jsPDF is line-based,
        // just render it as part of the text flow.
        return;
    }

    if (tag === 'BR') {
        state.y += 12 * 0.352 * 1.5;
        return;
    }

    // --- List handling ---
    if (tag === 'UL' || tag === 'OL') {
        state.listStack.push({ type: tag, counter: 0 });
        for (const child of node.childNodes) {
            renderHtmlNodeToPDF(doc, child, fmt, state);
        }
        state.listStack.pop();
        // Add spacing after list (only for top-level lists)
        if (state.listStack.length === 0) {
            state.y += 2;
        }
        return;
    }

    if (tag === 'LI') {
        const depth = state.listStack.length;
        const indent = 8 * depth; // 8mm per nesting level
        const currentList = state.listStack[state.listStack.length - 1];

        if (currentList) {
            currentList.counter++;

            const fontSize = 12;
            const lineHeight = fontSize * 0.352 * 1.5;

            // Page break check
            if (state.y + lineHeight > state.pageHeight - state.marginBottom) {
                doc.addPage();
                state.y = state.marginTop;
            }

            // Render bullet or number prefix
            doc.setFont('times', 'normal');
            doc.setFontSize(fontSize);
            doc.setTextColor(30, 30, 30);

            const prefixX = state.baseX + indent - 5;
            if (currentList.type === 'UL') {
                const bulletChar = depth <= 1 ? '\u2022' : depth === 2 ? '\u25E6' : '\u25AA';
                doc.text(bulletChar, prefixX, state.y);
            } else {
                doc.text(`${currentList.counter}.`, prefixX, state.y);
            }
        }

        // Indent content
        const savedX = state.x;
        const savedContentWidth = state.contentWidth;
        state.x = state.baseX + indent;
        state.contentWidth = savedContentWidth - indent;

        const newFmt = { ...fmt };
        for (const child of node.childNodes) {
            renderHtmlNodeToPDF(doc, child, newFmt, state);
        }

        // Restore x position and content width
        state.x = savedX;
        state.contentWidth = savedContentWidth;
        state.y += 1; // Small spacing between list items
        return;
    }

    const newFmt = {
        bold: fmt.bold || tag === 'B' || tag === 'STRONG' || tag === 'H1' || tag === 'H2',
        italic: fmt.italic || tag === 'I' || tag === 'EM',
        underline: fmt.underline || tag === 'U',
        heading: ['H1', 'H2'].includes(tag) ? tag : fmt.heading,
    };

    for (const child of node.childNodes) {
        renderHtmlNodeToPDF(doc, child, newFmt, state);
    }

    if (['P', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
        state.y += 3;
    }
}

/**
 * Render the TOC block into the PDF.
 */
function renderTocToPDF(doc, tocEl, state) {
    // TOC title
    const lineHeight = 14 * 0.352 * 1.5;

    if (state.y + lineHeight > state.pageHeight - state.marginBottom) {
        doc.addPage();
        state.y = state.marginTop;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(30, 30, 30);

    const titleEl = tocEl.querySelector('.toc-title');
    if (titleEl) {
        doc.text(titleEl.textContent, state.x, state.y);
        state.y += lineHeight + 2;
    }

    // TOC entries
    const entries = tocEl.querySelectorAll('.toc-entry');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const entryLineHeight = 11 * 0.352 * 1.5;

    entries.forEach(entry => {
        if (state.y + entryLineHeight > state.pageHeight - state.marginBottom) {
            doc.addPage();
            state.y = state.marginTop;
        }

        const isH2 = entry.classList.contains('toc-h2');
        const indent = isH2 ? 8 : 0;

        doc.setTextColor(30, 30, 30);
        doc.text(entry.textContent, state.x + indent, state.y);
        state.y += entryLineHeight;
    });

    // Divider line after TOC
    state.y += 3;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(state.x, state.y, state.x + state.contentWidth, state.y);
    state.y += 8;
}

/**
 * Render the references/bibliography block into the PDF.
 */
function renderReferencesToPDF(doc, refEl, state) {
    const lineHeight = 14 * 0.352 * 1.5;

    // Add some spacing before references
    state.y += 5;

    if (state.y + lineHeight > state.pageHeight - state.marginBottom) {
        doc.addPage();
        state.y = state.marginTop;
    }

    // Divider before references
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(state.x, state.y, state.x + state.contentWidth, state.y);
    state.y += 5;

    // Title
    const titleEl = refEl.querySelector('.ref-title');
    if (titleEl) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(30, 30, 30);
        doc.text(titleEl.textContent, state.x, state.y);
        state.y += lineHeight + 2;
    }

    // Reference entries
    const entries = refEl.querySelectorAll('.ref-entry');
    doc.setFont('times', 'normal');
    doc.setFontSize(10);
    const entryLineHeight = 10 * 0.352 * 1.8;

    entries.forEach(entry => {
        const text = entry.textContent;
        const lines = doc.splitTextToSize(text, state.contentWidth - 5);

        lines.forEach((line, i) => {
            if (state.y + entryLineHeight > state.pageHeight - state.marginBottom) {
                doc.addPage();
                state.y = state.marginTop;
            }

            doc.setTextColor(30, 30, 30);
            const indent = i > 0 ? 8 : 0; // Hanging indent for wrapped lines
            doc.text(line, state.x + indent, state.y);
            state.y += entryLineHeight;
        });

        state.y += 1; // Small gap between entries
    });
}
