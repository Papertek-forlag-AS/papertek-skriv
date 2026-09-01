/**
 * Leksihjelp — RSVP source adapter over a DOM root.
 *
 * The reader asks this for paragraphs, and tells it which one is active. Two
 * call sites configure it: the page hands over the clicked paragraph's
 * container, the web app hands over #test-input.
 *
 * HIGHLIGHTING NEVER MUTATES THE TREE. Wrapping the active paragraph in a span
 * would dirty the pupil's document and its undo stack inside a contenteditable,
 * and would break framework-rendered pages. The CSS Custom Highlight API paints
 * a Range without touching the DOM; where it is missing we simply do not
 * highlight, and the reader still works.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;

  const HIGHLIGHT_NAME = 'lh-rsvp-paragraph';
  const BLOCK_TAGS = new Set(['P', 'DIV', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6',
    'BLOCKQUOTE', 'TD', 'TH', 'DD', 'DT', 'FIGCAPTION', 'PRE']);

  function hasHighlightApi() {
    return typeof CSS !== 'undefined' && CSS && CSS.highlights &&
      typeof Highlight === 'function' && typeof Range === 'function';
  }

  function create(root) {
    const entries = [];
    let seq = 0;

    const kids = (root && root.children) ? Array.from(root.children) : [];
    for (const child of kids) {
      if (!BLOCK_TAGS.has(child.tagName)) continue;
      const text = (child.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      entries.push({ id: 'rsvp-' + (seq++), text, el: child });
    }
    // A container holding one long paragraph (or none at all) is still worth
    // reading — fall back to the root itself rather than returning nothing.
    if (entries.length === 0 && root) {
      const text = (root.textContent || '').replace(/\s+/g, ' ').trim();
      if (text) entries.push({ id: 'rsvp-0', text, el: root });
    }

    const byId = new Map(entries.map(e => [e.id, e]));

    function highlight(paragraphId) {
      if (!hasHighlightApi()) return;
      if (paragraphId == null) { CSS.highlights.delete(HIGHLIGHT_NAME); return; }
      const entry = byId.get(paragraphId);
      if (!entry) return;
      try {
        const range = new Range();
        range.selectNodeContents(entry.el);
        CSS.highlights.set(HIGHLIGHT_NAME, new Highlight(range));
      } catch (_) { /* a detached node — leave the previous highlight alone */ }
    }

    return {
      getParagraphs() { return entries.map(e => ({ id: e.id, text: e.text })); },
      /**
       * The id of the paragraph containing `node`, or null. A right-click
       * usually lands on an inline node — a link, a <strong> — rather than on
       * the paragraph itself, and two paragraphs on one page can read exactly
       * the same, so the caller must not identify the starting paragraph by
       * its text. Identity is the adapter's business; it answers here.
       */
      idAt(node) {
        if (!node) return null;
        for (const e of entries) {
          if (e.el === node) return e.id;
          if (e.el && typeof e.el.contains === 'function' && e.el.contains(node)) return e.id;
        }
        return null;
      },
      reveal(paragraphId) {
        const entry = byId.get(paragraphId);
        if (!entry || !entry.el || typeof entry.el.scrollIntoView !== 'function') return;
        entry.el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      },
      highlight,
      dispose() {
        if (hasHighlightApi()) CSS.highlights.delete(HIGHLIGHT_NAME);
        entries.length = 0;
        byId.clear();
      },
    };
  }

  // BLOCK_TAGS is exported so a caller deciding which container to read can
  // climb to a block by the same definition the adapter uses, rather than
  // keeping a second copy of the set that would quietly drift from this one.
  const api = { create, HIGHLIGHT_NAME, BLOCK_TAGS };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
    if (typeof self !== 'undefined') self.__lexiRsvpSourceDom = api;
  } else {
    host.__lexiRsvpSourceDom = api;
  }
})();
