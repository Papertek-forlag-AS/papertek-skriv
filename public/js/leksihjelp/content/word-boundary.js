/**
 * Leksihjelp — word-boundary helper (content script, pure)
 *
 * Exposes self.__lexiExpandToWord(text, offset): given a text-node string and a
 * caret offset, returns { word, start, end } for the surrounding word (empty
 * word when the offset sits on a boundary). start/end always satisfy
 * text.slice(start, end) === word. Used by floating-widget.js's wordAtPoint
 * (right-click "Slå opp") and by the Lockdown host menu. Pure, no DOM —
 * node-testable via a vm sandbox.
 */
(function () {
  'use strict';

  // A "word character": any Unicode letter or digit (covers æøå/ä/ö via \p{L}),
  // plus intra-word apostrophe/hyphen. Includes U+2019 (smart apostrophe) — the
  // macOS/iOS/Word auto-replacement — so "don’t" stays one word, mirroring
  // the U+2019 handling in spell-check-core.js. Everything else is a boundary.
  const WORD_CHAR = /[\p{L}\p{N}]/u;
  const INTRA = "'’-"; // straight apostrophe (U+0027), smart apostrophe (U+2019), hyphen
  function isIntra(ch) { return INTRA.indexOf(ch) !== -1; }
  function isWordChar(ch) { return WORD_CHAR.test(ch) || isIntra(ch); }

  function expandToWord(text, offset) {
    if (typeof text !== 'string' || text.length === 0) return { word: '', start: 0, end: 0 };
    let o = offset | 0;
    if (o < 0) o = 0;
    if (o > text.length) o = text.length;

    let start = o;
    let end = o;
    while (start > 0 && isWordChar(text[start - 1])) start--;
    while (end < text.length && isWordChar(text[end])) end++;

    // Trim lone leading/trailing intra-word punctuation in lockstep with the
    // offsets so a bare "-"/"'" isn't a word AND text.slice(start,end) === word.
    while (start < end && isIntra(text[start])) start++;
    while (end > start && isIntra(text[end - 1])) end--;

    const word = text.slice(start, end);
    if (!word) return { word: '', start: o, end: o };
    return { word, start, end };
  }

  self.__lexiExpandToWord = expandToWord;
})();
