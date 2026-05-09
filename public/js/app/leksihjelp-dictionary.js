/**
 * Leksihjelp dictionary popup (Skriv-side).
 *
 * Click any word in the editor → floating popup with translation,
 * part-of-speech, and grammar hints. Powered by the vendored leksihjelp
 * vocab seam (`window.__lexiVocab`) and `__lexiDictStateBuilder`.
 *
 * Per docs/leksihjelp-integration.md (Liberal trigger / Option A): the
 * popup fires on a single click on any word, regardless of whether the
 * spell-checker has flagged it. This mirrors the extension's
 * "right-click anywhere" behavior. To suppress accidental popups while
 * the student is positioning the cursor, the popup only opens on a click
 * that lands on a non-empty text node — clicks on empty paragraphs,
 * existing leksihjelp UI, or other Skriv overlays don't fire.
 *
 * Yields entirely when the leksihjelp Chrome extension is detected on
 * the page (bridge.status === 'extension'). The extension already
 * provides its own dictionary surface; running ours alongside would
 * double up.
 *
 * Public API:
 *   initLeksihjelpDictionary(editor, bridge) → { destroy(), close() }
 */

const POPUP_CLASS = 'skriv-leksihjelp-dict-popup';

// Words shorter than this are skipped (1-2 letter pronouns / prepositions
// like "i", "à", "el" exist in the dict but a popup over every "i" is noise).
const MIN_WORD_LEN = 2;

const POS_LABEL_NB = {
    verb: 'verb',
    substantiv: 'substantiv',
    adjektiv: 'adjektiv',
    artikkel: 'artikkel',
    pronomen: 'pronomen',
    tall: 'tallord',
    frase: 'frase',
    ord: 'ord',
    språk: 'språk',
    nasjonalitet: 'nasjonalitet',
    conjugation: 'verbform',
    base: 'oppslagsform',
};

const GENUS_LABEL_NB = {
    m: 'hankjønn (m.)',
    f: 'hunkjønn (f.)',
    n: 'intetkjønn (n.)',
    'm/f': 'hankjønn / hunkjønn',
};

function escapeHtml(s) {
    return String(s ?? '')
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// Pull the word the user clicked. Uses caretRangeFromPoint (or the
// Firefox fallback caretPositionFromPoint) to find the text node + offset
// at the click coords, then extracts the word boundary around it.
function extractWordAt(editor, clientX, clientY) {
    let range;
    if (typeof document.caretRangeFromPoint === 'function') {
        range = document.caretRangeFromPoint(clientX, clientY);
    } else if (typeof document.caretPositionFromPoint === 'function') {
        const pos = document.caretPositionFromPoint(clientX, clientY);
        if (pos) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
        }
    }
    if (!range || !editor.contains(range.startContainer)) return null;
    const node = range.startContainer;
    if (node.nodeType !== Node.TEXT_NODE) return null;
    const text = node.nodeValue || '';
    if (!text) return null;

    const offset = range.startOffset;
    // Word boundary: letters + apostrophes + Norwegian/German/Spanish/French diacritics.
    const wordChar = /[\p{L}'’]/u;
    let start = offset;
    let end = offset;
    while (start > 0 && wordChar.test(text[start - 1])) start--;
    while (end < text.length && wordChar.test(text[end])) end++;
    if (start === end) return null;
    const word = text.slice(start, end).trim();
    if (word.length < MIN_WORD_LEN) return null;

    // Build a Range around the word so we can position the popup against it.
    const wordRange = document.createRange();
    wordRange.setStart(node, start);
    wordRange.setEnd(node, end);
    return { word, range: wordRange };
}

// Find the dictionary entry for a word. Tries the lookupLang first
// (the language the student is *looking up*); falls back to the writing
// language. Matches the displayed form first, then a lowercased version,
// then the inflection index (so clicking "kommer" surfaces the "komme"
// verb entry).
function findEntry(word, vocab) {
    if (!vocab || typeof vocab.getWordList !== 'function') return null;
    const list = vocab.getWordList();
    if (!Array.isArray(list)) return null;
    const lower = word.toLowerCase();

    // Direct match by word OR display form.
    for (const e of list) {
        if (!e) continue;
        if ((e.word || '').toLowerCase() === lower) return e;
        if ((e.display || '').toLowerCase() === lower) return e;
    }
    // Try the verb-infinitive map for cases the wordList itself doesn't index.
    if (typeof vocab.getVerbInfinitive === 'function') {
        const inf = vocab.getVerbInfinitive(lower);
        if (inf) {
            for (const e of list) {
                if (!e) continue;
                if ((e.word || '').toLowerCase() === inf.toLowerCase()) return e;
            }
        }
    }
    return null;
}

function ensureStylesheet() {
    if (document.getElementById('skriv-leksihjelp-dict-styles')) return;
    const style = document.createElement('style');
    style.id = 'skriv-leksihjelp-dict-styles';
    style.textContent = `
        .${POPUP_CLASS} {
            position: fixed;
            z-index: 2147483646;
            min-width: 180px;
            max-width: 320px;
            background: #ffffff;
            color: #1c1917;
            border: 1px solid #d6d3d1;
            border-radius: 0.5rem;
            box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
            padding: 0.75rem 0.875rem;
            font-size: 0.85rem;
            line-height: 1.45;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            user-select: text;
        }
        html.dark .${POPUP_CLASS} {
            background: #292524;
            color: #e7e5e4;
            border-color: #44403c;
        }
        .${POPUP_CLASS} .dict-head {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 0.5rem;
            margin-bottom: 0.25rem;
        }
        .${POPUP_CLASS} .dict-word {
            font-weight: 700;
            font-size: 1rem;
            color: #1c1917;
        }
        html.dark .${POPUP_CLASS} .dict-word { color: #fafaf9; }
        .${POPUP_CLASS} .dict-pos {
            font-size: 0.7rem;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            color: #78716c;
            font-weight: 500;
        }
        .${POPUP_CLASS} .dict-translation {
            margin: 0.25rem 0 0;
            color: #44403c;
        }
        html.dark .${POPUP_CLASS} .dict-translation { color: #d6d3d1; }
        .${POPUP_CLASS} .dict-genus,
        .${POPUP_CLASS} .dict-grammar {
            margin-top: 0.375rem;
            font-size: 0.75rem;
            color: #78716c;
        }
        .${POPUP_CLASS} .dict-empty {
            color: #a8a29e;
            font-style: italic;
        }
        .${POPUP_CLASS} .dict-close {
            background: none;
            border: none;
            color: #a8a29e;
            font-size: 1rem;
            line-height: 1;
            cursor: pointer;
            padding: 0;
            margin-left: 0.5rem;
        }
        .${POPUP_CLASS} .dict-close:hover { color: #44403c; }
        html.dark .${POPUP_CLASS} .dict-close:hover { color: #fafaf9; }
    `;
    document.head.appendChild(style);
}

function renderPopupHTML(word, entry, lookupLang) {
    if (!entry) {
        return `
            <div class="dict-head">
                <span class="dict-word">${escapeHtml(word)}</span>
                <button type="button" class="dict-close" aria-label="Lukk">×</button>
            </div>
            <div class="dict-empty">Ikke i ordboken${lookupLang && lookupLang !== 'nb' ? ' (' + escapeHtml(lookupLang) + ')' : ''}.</div>
        `;
    }
    const display = entry.display || entry.word || word;
    const pos = POS_LABEL_NB[entry.partOfSpeech] || POS_LABEL_NB[entry.type] || '';
    const translation = entry.translation || '';
    const genus = entry.genus ? (GENUS_LABEL_NB[entry.genus] || entry.genus) : null;
    const grammar = entry.grammar || null;
    const baseWord = entry.baseWord && entry.baseWord !== entry.word ? entry.baseWord : null;

    const parts = [];
    parts.push(`
        <div class="dict-head">
            <span class="dict-word">${escapeHtml(display)}</span>
            <span class="dict-pos">${escapeHtml(pos)}</span>
        </div>
    `);
    if (translation) {
        parts.push(`<p class="dict-translation">${escapeHtml(translation)}</p>`);
    } else {
        parts.push(`<p class="dict-translation dict-empty">Ingen oversettelse tilgjengelig.</p>`);
    }
    if (baseWord) {
        parts.push(`<div class="dict-grammar">Grunnform: <em>${escapeHtml(baseWord)}</em></div>`);
    }
    if (genus) {
        parts.push(`<div class="dict-genus">${escapeHtml(genus)}</div>`);
    }
    if (grammar) {
        parts.push(`<div class="dict-grammar">${escapeHtml(grammar)}</div>`);
    }
    parts.push(`
        <div class="dict-head" style="margin-top:0.5rem; margin-bottom:0;">
            <span style="flex:1"></span>
            <button type="button" class="dict-close" aria-label="Lukk">× Lukk</button>
        </div>
    `);
    return parts.join('');
}

export function initLeksihjelpDictionary(editor, bridge) {
    if (!editor || !bridge) return { destroy() {}, close() {} };
    ensureStylesheet();

    let popup = null;

    function close() {
        if (popup) {
            popup.remove();
            popup = null;
            document.removeEventListener('keydown', onDocKey);
            document.removeEventListener('mousedown', onDocMousedown, true);
        }
    }

    function onDocKey(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }

    function onDocMousedown(e) {
        if (popup && !popup.contains(e.target)) close();
    }

    function positionAgainst(rect) {
        if (!popup) return;
        const margin = 8;
        const pw = popup.offsetWidth || 220;
        const ph = popup.offsetHeight || 100;
        const vw = window.innerWidth;
        const vh = window.innerHeight;

        // Default: below the word, left-aligned with the word.
        let left = rect.left;
        let top  = rect.bottom + margin;
        // Flip up if it would overflow the bottom.
        if (top + ph > vh - margin) top = Math.max(margin, rect.top - ph - margin);
        // Clamp horizontally.
        if (left + pw > vw - margin) left = Math.max(margin, vw - pw - margin);
        if (left < margin) left = margin;

        popup.style.left = `${Math.round(left)}px`;
        popup.style.top  = `${Math.round(top)}px`;
    }

    function open(word, range) {
        close();
        const vocab = window.__lexiVocab;
        const lookupLang = bridge.getLookupLang();
        const entry = findEntry(word, vocab);

        popup = document.createElement('div');
        popup.className = POPUP_CLASS;
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-label', 'Ordbok-oppslag');
        popup.innerHTML = renderPopupHTML(word, entry, lookupLang);
        document.body.appendChild(popup);
        positionAgainst(range.getBoundingClientRect());

        popup.addEventListener('click', (e) => {
            if (e.target.closest('.dict-close')) close();
        });
        document.addEventListener('keydown', onDocKey);
        // capture-phase mousedown so we close on outside-click before
        // any other handler runs (e.g. the spell-check popover taking over).
        document.addEventListener('mousedown', onDocMousedown, true);
    }

    function onEditorClick(e) {
        // Yield to the extension entirely.
        if (bridge.getStatus() === 'extension') return;
        // Don't fire on clicks that hit existing leksihjelp UI (spell-check
        // dots/popovers, the Aa button, the dictionary popup itself).
        if (e.target.closest('[id^="lexi-"], [class*="lh-"], .' + POPUP_CLASS)) return;
        // Need the click to come from the editable area.
        if (!editor.contains(e.target)) return;
        // Suppress when the user is dragging a selection across multiple
        // characters — they're highlighting, not clicking a word.
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) return;

        const hit = extractWordAt(editor, e.clientX, e.clientY);
        if (!hit) { close(); return; }
        open(hit.word, hit.range);
    }

    editor.addEventListener('click', onEditorClick);

    return {
        close,
        destroy() {
            close();
            editor.removeEventListener('click', onEditorClick);
        },
    };
}
