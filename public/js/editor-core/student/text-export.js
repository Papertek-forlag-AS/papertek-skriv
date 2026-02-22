/**
 * Export written text as a downloadable .txt or .pdf file.
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
 */
export function downloadPDF({ title, studentName, text, html }) {
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
        const state = { x: marginLeft, y, contentWidth, pageHeight, marginTop, marginBottom };
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

    if (tag === 'BR') {
        state.y += 12 * 0.352 * 1.5;
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
