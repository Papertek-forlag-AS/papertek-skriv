/**
 * Export written text as a downloadable .txt, .pdf, or .docx file.
 * Supports TOC and reference rendering in PDF.
 */

import { countWords } from '../shared/word-counter.js';
import { showInPageAlert } from '../shared/in-page-modal.js';
import { isFrameElement, isImageBlock } from '../shared/frame-elements.js';
import { t, getDateLocale } from '../shared/i18n.js';

/**
 * Download text as a .txt file with UTF-8 BOM.
 */
export function downloadText({ title, studentName, text }) {
    const date = new Date();
    const dateStr = date.toLocaleDateString(getDateLocale(), {
        year: 'numeric', month: 'long', day: 'numeric'
    });
    const wordCount = countWords(text);

    const header = [
        title || t('export.defaultTitle'),
        t('export.author', { name: studentName || t('export.authorFallback') }),
        t('export.date', { date: dateStr }),
        t('export.wordCount', { count: wordCount }),
        '─'.repeat(40),
        ''
    ].join('\n');

    const content = '﻿' + header + text;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const safeName = (studentName || 'dokument').replace(/[^a-zA-ZæøåÆØÅäöüÄÖÜß0-9]/g, '-');
    const safeTitle = (title || 'skriv').replace(/[^a-zA-ZæøåÆØÅäöüÄÖÜß0-9]/g, '-');
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
        showInPageAlert('PDF', t('export.pdfNotLoaded'));
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
    const marginTop = 25;
    const marginBottom = 25;
    const contentWidth = pageWidth - marginLeft - marginRight;

    let y = marginTop;

    const date = new Date();
    const dateStr = date.toLocaleDateString(getDateLocale(), {
        year: 'numeric', month: 'long', day: 'numeric'
    });
    const wordCount = countWords(text);

    // --- Header ---
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(30, 30, 30);
    const titleText = title || t('export.defaultTitle');
    const titleLines = doc.splitTextToSize(titleText, contentWidth);
    for (const line of titleLines) {
        doc.text(line, marginLeft, y);
        y += 20 * 0.352 * 1.6;
    }
    y += 4;

    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(t('export.author', { name: studentName || t('export.authorFallback') }), marginLeft, y);
    y += 5;
    doc.text(t('export.date', { date: dateStr }), marginLeft, y);
    y += 5;
    doc.text(t('export.wordCount', { count: wordCount }), marginLeft, y);
    y += 7;

    doc.setDrawColor(180, 180, 180);
    doc.setLineWidth(0.3);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 12;

    // --- Body ---
    if (html) {
        const parser = new DOMParser();
        const dom = parser.parseFromString(html, 'text/html');
        const state = {
            x: marginLeft, baseX: marginLeft, y, contentWidth,
            pageHeight, marginTop, marginBottom, pageWidth, marginRight, marginLeft,
            listStack: [], afterHeading: false, isFirstLineOfParagraph: false
        };
        renderHtmlNodeToPDF(doc, dom.body, { bold: false, italic: false, underline: false, heading: null }, state);
    } else {
        doc.setTextColor(30, 30, 30);
        doc.setFontSize(12);
        doc.setFont('times', 'normal');

        const lineHeight = 12 * 0.352 * 1.5;
        const lines = doc.splitTextToSize(text || '', contentWidth);

        for (const line of lines) {
            if (y + lineHeight > pageHeight - marginBottom) {
                doc.addPage();
                addPageNumber(doc, pageWidth, pageHeight, marginBottom);
                y = marginTop;
            }
            doc.text(line, marginLeft, y);
            y += lineHeight;
        }
    }

    // --- Add page numbers to all pages ---
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFont('Helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(150, 150, 150);
        const pageNumText = t('export.page', { num: i });
        const textWidth = doc.getTextWidth(pageNumText);
        doc.text(pageNumText, (pageWidth - textWidth) / 2, pageHeight - 12);
    }

    // --- Download ---
    const safeName = (studentName || 'dokument').replace(/[^a-zA-ZæøåÆØÅäöüÄÖÜß0-9]/g, '-');
    const safeTitle = (title || 'skriv').replace(/[^a-zA-ZæøåÆØÅäöüÄÖÜß0-9]/g, '-');
    doc.save(`skriv-${safeTitle}-${safeName}.pdf`);
}

/**
 * Download content as a .doc file (Word-compatible HTML).
 * @param {HTMLElement} editor - The editor element containing the content
 * @param {Object} options
 * @param {string} [options.title] - Document title
 * @param {string} [options.author] - Author name
 */
export function downloadDocx(editor, options = {}) {
    const { title = 'Dokument', author = '' } = options;

    const content = getCleanHTML(editor);

    const docHtml = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <!--[if gte mso 9]>
    <xml>
        <w:WordDocument>
            <w:View>Print</w:View>
            <w:Zoom>100</w:Zoom>
        </w:WordDocument>
    </xml>
    <![endif]-->
    <style>
        @page { margin: 2.5cm; }
        body { font-family: 'Times New Roman', serif; font-size: 12pt; line-height: 1.5; }
        h1 { font-size: 16pt; font-weight: bold; margin-top: 24pt; margin-bottom: 12pt; }
        h2 { font-size: 14pt; font-weight: bold; margin-top: 18pt; margin-bottom: 8pt; }
        h3 { font-size: 12pt; font-weight: bold; margin-top: 12pt; margin-bottom: 6pt; }
        p { margin-top: 0; margin-bottom: 6pt; text-indent: 0.5cm; }
        h1 + p, h2 + p, h3 + p { text-indent: 0; }
        ul, ol { margin-left: 1cm; margin-bottom: 6pt; }
        li { margin-bottom: 3pt; }
        blockquote { margin-left: 2cm; margin-right: 1cm; font-style: italic; border-left: 2pt solid #ccc; padding-left: 0.5cm; }
        figure { text-align: center; margin: 12pt 0; }
        figure img { max-width: 70%; height: auto; }
        figcaption { font-style: italic; font-size: 10pt; text-align: center; margin-top: 4pt; color: #555; }
        table { border-collapse: collapse; width: 100%; margin: 6pt 0; }
        td, th { border: 1px solid #999; padding: 4pt 6pt; }
        th { background-color: #f0f0f0; font-weight: bold; }
    </style>
</head>
<body>
${content}
</body>
</html>`;

    const blob = new Blob(['﻿' + docHtml], { type: 'application/vnd.ms-word;charset=utf-8' });
    const url = URL.createObjectURL(blob);

    const safeTitle = (title || 'dokument').replace(/[^a-zA-ZæøåÆØÅäöüÄÖÜß0-9]/g, '-');

    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeTitle}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

/**
 * Extract clean HTML from the editor, stripping frame scaffolding and editor artifacts.
 * @param {HTMLElement} editor - The editor element
 * @returns {string} Clean HTML string
 */
function getCleanHTML(editor) {
    const clone = editor.cloneNode(true);

    // Remove frame scaffolding elements
    clone.querySelectorAll('[data-frame-section], [data-frame-header], [data-frame-prompt]').forEach(el => el.remove());
    clone.querySelectorAll('[contenteditable="false"]').forEach(el => {
        // Keep images and figures, remove other non-editable elements (toolbars, controls)
        if (!el.closest('figure') && el.tagName !== 'FIGURE' && el.tagName !== 'IMG') {
            el.remove();
        }
    });

    // Remove image resize handles and toolbar artifacts
    clone.querySelectorAll('.skriv-resize-handle, .skriv-image-toolbar, .skriv-toolbar, .ProseMirror-gapcursor').forEach(el => el.remove());

    // Remove skriv-specific classes but keep the elements
    clone.querySelectorAll('[class*="skriv-"]').forEach(el => {
        const classes = [...el.classList];
        classes.forEach(cls => {
            if (cls.startsWith('skriv-')) {
                el.classList.remove(cls);
            }
        });
        if (el.classList.length === 0) {
            el.removeAttribute('class');
        }
    });

    // Remove data-* attributes
    clone.querySelectorAll('*').forEach(el => {
        [...el.attributes].forEach(attr => {
            if (attr.name.startsWith('data-')) {
                el.removeAttribute(attr.name);
            }
        });
    });

    // Convert image blocks to proper figure elements for Word
    clone.querySelectorAll('figure').forEach(fig => {
        const img = fig.querySelector('img');
        const caption = fig.querySelector('figcaption');
        if (img) {
            // Keep figure structure clean
            fig.innerHTML = '';
            fig.appendChild(img);
            if (caption) fig.appendChild(caption);
        }
    });

    return clone.innerHTML;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Helper: add page number placeholder (used during page breaks in plain text mode).
 */
function addPageNumber(doc, pageWidth, pageHeight, marginBottom) {
    // Page numbers are added in bulk after rendering; this is a no-op placeholder
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
        const fontSize = fmt.heading === 'H1' ? 18 : fmt.heading === 'H2' ? 15 : 12;
        const lineHeight = fontSize * 0.352 * 1.5;

        doc.setFont(fontFamily, fontStyle);
        doc.setFontSize(fontSize);
        doc.setTextColor(30, 30, 30);

        // Calculate indent for first line of paragraph (not after headings)
        const indent = state.isFirstLineOfParagraph && !state.afterHeading ? 5 : 0;
        const effectiveWidth = state.contentWidth - indent;

        const lines = doc.splitTextToSize(content, effectiveWidth);
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (state.y + lineHeight > state.pageHeight - state.marginBottom) {
                doc.addPage();
                state.y = state.marginTop;
            }
            // Only indent the very first line
            const lineIndent = (i === 0 && indent > 0) ? indent : 0;
            doc.text(line, state.x + lineIndent, state.y);

            if (fmt.underline) {
                const textWidth = doc.getTextWidth(line);
                doc.setDrawColor(30, 30, 30);
                doc.setLineWidth(0.2);
                doc.line(state.x + lineIndent, state.y + 0.7, state.x + lineIndent + textWidth, state.y + 0.7);
            }

            state.y += lineHeight;
        }

        // After rendering text, no longer first line
        state.isFirstLineOfParagraph = false;
        return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;

    const tag = node.tagName?.toUpperCase();
    const el = node;

    // --- Skip frame scaffold elements (section headers, subsections, untouched prompts) ---
    if (isFrameElement(el)) return;

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

    // --- Image blocks: render image + caption/side-text/dual-image to PDF ---
    if (isImageBlock(el)) {
        const imgs = el.querySelectorAll('img');
        const sideTextEl = el.querySelector('.skriv-image-sidetext');
        if (imgs[0]?.src) {
            const img = imgs[0];
            const naturalW = img.naturalWidth || 400;
            const naturalH = img.naturalHeight || 300;
            const aspectRatio = naturalH / naturalW;

            const wrappers = Array.from(el.querySelectorAll('.skriv-image-wrapper'));
            const sideTexts = Array.from(el.querySelectorAll('.skriv-image-sidetext'));
            const sideItems = Array.from(el.querySelectorAll('.skriv-image-wrapper, .skriv-image-sidetext'));

            if (sideItems.length > 1) {
                const count = Math.min(3, sideItems.length);
                const containerRect = el.getBoundingClientRect();
                const containerWidth = containerRect.width || 1;
                const gap = 10;
                let maxColHeight = 0;
                let currentX = state.x;

                // Pre-calculate proportions based on inline styles since the DOM is detached
                const proportions = [];
                let usedProportion = 0;
                let unstyledCount = 0;

                for (let i = 0; i < count; i++) {
                    const item = sideItems[i];
                    let prop = 0;
                    if (item.style.width && item.style.width.endsWith('%')) {
                        prop = parseFloat(item.style.width) / 100;
                    } else if (item.style.flex && item.style.flex.includes('%')) {
                        const match = item.style.flex.match(/([\d.]+)%/);
                        if (match) prop = parseFloat(match[1]) / 100;
                    }
                    if (prop > 0) {
                        proportions[i] = prop;
                        usedProportion += prop;
                    } else {
                        unstyledCount++;
                    }
                }
                
                // Distribute remaining space equally among unstyled items
                const remaining = Math.max(0, 1 - usedProportion);
                for (let i = 0; i < count; i++) {
                    if (proportions[i] === undefined) {
                        proportions[i] = unstyledCount > 0 ? remaining / unstyledCount : 1 / count;
                    }
                }

                for (let i = 0; i < count; i++) {
                    const item = sideItems[i];
                    const proportion = proportions[i] || (1 / count);
                    
                    const availablePdfWidth = state.contentWidth - ((count - 1) * gap);
                    const colWidth = availablePdfWidth * proportion;
                    const colX = currentX;

                    if (item.classList.contains('skriv-image-wrapper')) {
                        const itemImg = item.querySelector('img');
                        if (itemImg) {
                            const aspect = (itemImg.naturalHeight || itemImg.height || 100) / (itemImg.naturalWidth || itemImg.width || 100);
                            const h = colWidth * aspect;
                            maxColHeight = Math.max(maxColHeight, h);
                            try {
                                doc.addImage(itemImg.src, colX, state.y, colWidth, h);
                            } catch (e) {
                                console.warn('PDF export image failed:', e);
                            }
                        }
                    } else if (item.classList.contains('skriv-image-sidetext')) {
                        doc.setFont('times', 'normal');
                        doc.setFontSize(11);
                        doc.setTextColor(40, 40, 40);
                        const textLines = doc.splitTextToSize(item.textContent.trim(), colWidth);
                        let textY = state.y + 6;
                        for (const line of textLines) {
                            doc.text(line, colX, textY);
                            textY += 11 * 0.352 * 1.4;
                        }
                        maxColHeight = Math.max(maxColHeight, textLines.length * 11 * 0.352 * 1.4);
                    }
                    
                    currentX += colWidth + gap;
                }
                state.y += maxColHeight + 10;
            } else {
                // Standard full/centered image
                const maxImgWidth = state.contentWidth * 0.7;
                const pdfWidth = Math.min(maxImgWidth, state.contentWidth);
                const pdfHeight = pdfWidth * aspectRatio;
                const estimatedTotal = pdfHeight + 15;

                if (state.y + estimatedTotal > state.pageHeight - state.marginBottom) {
                    doc.addPage();
                    state.y = state.marginTop;
                }

                const imgX = state.x + (state.contentWidth - pdfWidth) / 2;

                try {
                    doc.addImage(img.src, imgX, state.y, pdfWidth, pdfHeight);
                    state.y += pdfHeight + 3;
                } catch (e) {
                    console.warn('Image PDF export failed:', e);
                }

                // Caption
                const caption = el.querySelector('.skriv-image-caption') || el.querySelector('figcaption');
                if (caption?.textContent?.trim()) {
                    doc.setFont('times', 'italic');
                    doc.setFontSize(10);
                    doc.setTextColor(100, 100, 100);
                    const captionLines = doc.splitTextToSize(caption.textContent.trim(), state.contentWidth);
                    for (const line of captionLines) {
                        if (state.y + 5 > state.pageHeight - state.marginBottom) {
                            doc.addPage();
                            state.y = state.marginTop;
                        }
                        const captionWidth = doc.getTextWidth(line);
                        const captionX = state.x + (state.contentWidth - captionWidth) / 2;
                        doc.text(line, captionX, state.y);
                        state.y += 10 * 0.352 * 1.5;
                    }
                    state.y += 4;
                } else {
                    state.y += 4;
                }
            }
        }
        state.afterHeading = false;
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
        doc.text(markerText, state.x, state.y);
        return;
    }

    if (tag === 'BR') {
        state.y += 12 * 0.352 * 1.5;
        return;
    }

    // --- Heading spacing ---
    if (tag === 'H1' || tag === 'H2') {
        // Add space before headings
        const spaceBefore = tag === 'H1' ? 10 : 7;
        state.y += spaceBefore;

        // Page break if heading would be near bottom
        if (state.y + 15 > state.pageHeight - state.marginBottom) {
            doc.addPage();
            state.y = state.marginTop;
        }
    }

    // --- Paragraph handling ---
    if (tag === 'P') {
        state.isFirstLineOfParagraph = true;

        // Widow/Orphan control: Estimate paragraph height.
        // If only 1-2 lines fit on this page, push the entire paragraph to the next page.
        const rawText = el.textContent || '';
        if (rawText.trim()) {
            const fontSize = 12;
            const lineHeight = fontSize * 0.352 * 1.5;
            doc.setFont('times', 'normal');
            doc.setFontSize(fontSize);
            const lines = doc.splitTextToSize(rawText, state.contentWidth);
            const estimatedHeight = lines.length * lineHeight;
            const remainingSpace = (state.pageHeight - state.marginBottom) - state.y;

            if (estimatedHeight > remainingSpace && remainingSpace < lineHeight * 2.5) {
                doc.addPage();
                state.y = state.marginTop;
            }
        }
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
            state.y += 3;
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
                const bulletChar = depth <= 1 ? '•' : depth === 2 ? '◦' : '▪';
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

    // --- Blockquote handling ---
    if (tag === 'BLOCKQUOTE') {
        const savedX = state.x;
        const savedContentWidth = state.contentWidth;
        const startY = state.y;
        const startPage = doc.internal.getCurrentPageInfo().pageNumber;

        state.x = state.baseX + 8;
        state.contentWidth = savedContentWidth - 12;

        const newFmt = { ...fmt, italic: true };
        for (const child of node.childNodes) {
            renderHtmlNodeToPDF(doc, child, newFmt, state);
        }

        const endY = state.y;
        const endPage = doc.internal.getCurrentPageInfo().pageNumber;

        if (startPage === endPage && endY > startY) {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(1);
            doc.line(state.baseX + 3, startY, state.baseX + 3, endY);
        }

        state.x = savedX;
        state.contentWidth = savedContentWidth;
        state.y += 3;
        return;
    }

    // --- Table handling ---
    if (tag === 'TABLE') {
        renderTableToPDF(doc, el, fmt, state);
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

    if (tag === 'H1' || tag === 'H2') {
        state.y += 4;
        state.afterHeading = true;
    } else if (tag === 'P' || tag === 'DIV') {
        state.y += 3;
        state.afterHeading = false;
    } else if (['H3', 'H4', 'H5', 'H6'].includes(tag)) {
        state.y += 3;
        state.afterHeading = true;
    }
}

/**
 * Render the TOC block into the PDF with dot leaders.
 */
function renderTocToPDF(doc, tocEl, state) {
    const lineHeight = 14 * 0.352 * 1.5;

    // Space before TOC
    state.y += 4;

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
        state.y += lineHeight + 4;
    }

    // TOC entries with dot leaders
    const entries = tocEl.querySelectorAll('.toc-entry');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    const entryLineHeight = 11 * 0.352 * 1.8;

    entries.forEach((entry, idx) => {
        if (state.y + entryLineHeight > state.pageHeight - state.marginBottom) {
            doc.addPage();
            state.y = state.marginTop;
        }

        const isH2 = entry.classList.contains('toc-h2');
        const indent = isH2 ? 8 : 0;
        const entryText = entry.textContent.trim();

        doc.setTextColor(30, 30, 30);
        if (!isH2) {
            doc.setFont('helvetica', 'bold');
        } else {
            doc.setFont('helvetica', 'normal');
        }
        doc.text(entryText, state.x + indent, state.y);

        // Dot leaders
        const textWidth = doc.getTextWidth(entryText);
        const dotStart = state.x + indent + textWidth + 2;
        const dotEnd = state.x + state.contentWidth;
        if (dotEnd - dotStart > 5) {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(150, 150, 150);
            const dotChar = ' .';
            const dotWidth = doc.getTextWidth(dotChar);
            let dx = dotStart;
            while (dx + dotWidth < dotEnd) {
                doc.text('.', dx, state.y);
                dx += dotWidth;
            }
        }

        state.y += entryLineHeight;
    });

    // Divider line after TOC
    state.y += 4;
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.2);
    doc.line(state.x, state.y, state.x + state.contentWidth, state.y);
    state.y += 10;
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

/**
 * Render an HTML table into the PDF natively.
 */
function renderTableToPDF(doc, tableEl, fmt, state) {
    const rows = Array.from(tableEl.querySelectorAll('tr'));
    if (rows.length === 0) return;

    // Calculate column widths
    let numCols = 0;
    rows.forEach(row => {
        const cols = row.querySelectorAll('td, th');
        numCols = Math.max(numCols, cols.length);
    });
    if (numCols === 0) return;

    const colWidth = state.contentWidth / numCols;
    const padding = 3;
    const fontSize = 10;
    const lineHeight = fontSize * 0.352 * 1.5;

    state.y += 5; // space before table

    rows.forEach(row => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        let maxRowHeight = lineHeight + (padding * 2);

        // Pre-calculate heights
        const cellData = cells.map(cell => {
            const isHeader = cell.tagName.toUpperCase() === 'TH';
            doc.setFont('times', isHeader ? 'bold' : 'normal');
            doc.setFontSize(fontSize);
            const textLines = doc.splitTextToSize(cell.textContent.trim(), colWidth - (padding * 2));
            const h = (textLines.length * lineHeight) + (padding * 2);
            maxRowHeight = Math.max(maxRowHeight, h);
            return { textLines, isHeader };
        });

        // Page break if row doesn't fit
        if (state.y + maxRowHeight > state.pageHeight - state.marginBottom) {
            doc.addPage();
            state.y = state.marginTop;
        }

        let currentX = state.x;
        cellData.forEach((cell) => {
            doc.setDrawColor(200, 200, 200);
            doc.setLineWidth(0.2);
            if (cell.isHeader) {
                doc.setFillColor(245, 245, 245);
                doc.rect(currentX, state.y, colWidth, maxRowHeight, 'FD');
            } else {
                doc.rect(currentX, state.y, colWidth, maxRowHeight, 'S');
            }

            doc.setFont('times', cell.isHeader ? 'bold' : 'normal');
            doc.setFontSize(fontSize);
            doc.setTextColor(30, 30, 30);
            let textY = state.y + padding + (lineHeight * 0.75); // baseline adjustment
            cell.textLines.forEach(line => {
                doc.text(line, currentX + padding, textY);
                textY += lineHeight;
            });
            currentX += colWidth;
        });

        state.y += maxRowHeight;
    });

    state.y += 5; // space after table
}
