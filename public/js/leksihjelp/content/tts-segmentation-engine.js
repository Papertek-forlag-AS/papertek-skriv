/**
 * Leksihjelp long-form TTS segmentation (pure).
 *
 * Piper must finish a request before the current JSON API can play it. Long
 * passages can therefore exceed the gateway deadline even though every
 * sentence is individually cheap. This engine divides long text into source-
 * mapped portions so the player can fetch one portion ahead while the current
 * one is speaking.
 */
(function () {
  'use strict';

  const DEFAULT_TARGET = 180;
  const DEFAULT_MAX = 240;
  const DEFAULT_MIN = 70;
  const ABBREVIATIONS = new Set([
    'dr.', 'mr.', 'mrs.', 'ms.', 'prof.', 'sr.', 'sra.', 'srta.',
    'f.eks.', 'dvs.', 'bl.a.', 'osv.', 'ca.', 'kl.', 'nr.',
    'e.g.', 'i.e.', 'etc.', 'z.b.', 'bzw.', 'usw.', 'u.a.',
    'm.', 'mme.', 'mlle.',
  ]);

  function isProtectedPeriod(text, index) {
    const before = text.slice(Math.max(0, index - 16), index + 1);
    const tokenMatch = before.match(/(?:^|\s)(\S+)$/);
    const token = tokenMatch ? tokenMatch[1].toLocaleLowerCase() : '';
    if (ABBREVIATIONS.has(token)) return true;
    if (/(?:^|\s)[A-Za-zÆØÅæøå]\.$/u.test(before)) return true;
    if (/(?:[A-Za-z]\.){2,}$/u.test(token)) return true;
    if (/\d{1,2}\.\d{1,2}\.$/.test(before)) return true;
    if (/\d\.$/.test(before) && /\d/.test(text[index + 1] || '')) return true;
    return false;
  }

  function boundaryCandidates(text) {
    const boundaries = [];
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      const next = text[i + 1] || '';
      if (ch === '\n') {
        boundaries.push(i + 1);
        continue;
      }
      if (!'.!?;:'.includes(ch)) continue;
      if (ch === '.' && isProtectedPeriod(text, i)) continue;
      let end = i + 1;
      while (/['"»”\])]/u.test(text[end] || '')) end++;
      if (!text[end] || /\s/.test(text[end])) boundaries.push(end);
    }
    return boundaries;
  }

  function trimSpan(text, start, end) {
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    return start < end ? { text: text.slice(start, end), startOffset: start, endOffset: end } : null;
  }

  function lastWhitespace(text, start, limit) {
    for (let i = Math.min(limit, text.length); i > start; i--) {
      if (/\s/.test(text[i - 1])) return i;
    }
    return -1;
  }

  function segmentText(input, options = {}) {
    const text = String(input || '');
    if (!text.trim()) return [];

    const target = Math.max(40, Number(options.targetCharacters) || DEFAULT_TARGET);
    const max = Math.max(target, Number(options.maxCharacters) || DEFAULT_MAX);
    const min = Math.min(target, Math.max(1, Number(options.minCharacters) || DEFAULT_MIN));
    if (text.length <= max) return [trimSpan(text, 0, text.length)].filter(Boolean);

    const boundaries = boundaryCandidates(text);
    const segments = [];
    let start = 0;

    while (start < text.length) {
      while (start < text.length && /\s/.test(text[start])) start++;
      if (start >= text.length) break;
      if (text.length - start <= max) {
        const tail = trimSpan(text, start, text.length);
        if (tail) segments.push(tail);
        break;
      }

      const targetEnd = start + target;
      const maxEnd = Math.min(text.length, start + max);
      const eligible = boundaries.filter((point) => point > start + min && point <= maxEnd);
      const atOrBeforeTarget = eligible.filter((point) => point <= targetEnd);
      let end = atOrBeforeTarget.at(-1) || eligible[0] || -1;
      if (end < 0) end = lastWhitespace(text, start, maxEnd);
      if (end <= start) end = maxEnd;

      const segment = trimSpan(text, start, end);
      if (segment) segments.push(segment);
      start = end;
    }
    return segments;
  }

  function sourcePositions(text) {
    const positions = [];
    const pattern = /\S+/g;
    let match;
    while ((match = pattern.exec(text))) {
      positions.push({ start: match.index, end: match.index + match[0].length });
    }
    return positions;
  }

  function offsetTimings(wordTimings, segment) {
    const timings = Array.isArray(wordTimings) ? wordTimings : [];
    const base = Number.isInteger(segment?.startOffset) ? segment.startOffset : 0;
    const fallbackPositions = sourcePositions(segment?.text || '');
    return timings.map((timing, index) => {
      const copy = { ...timing };
      if (Number.isInteger(timing?.startOffset) && Number.isInteger(timing?.endOffset)) {
        copy.startOffset = base + timing.startOffset;
        copy.endOffset = base + timing.endOffset;
      } else if (fallbackPositions[index]) {
        copy.startOffset = base + fallbackPositions[index].start;
        copy.endOffset = base + fallbackPositions[index].end;
      }
      return copy;
    });
  }

  const api = { segmentText, offsetTimings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else if (typeof self !== 'undefined') self.__lexiTtsSegmentation = api;
})();
