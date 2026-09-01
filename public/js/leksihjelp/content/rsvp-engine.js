/**
 * Leksihjelp — RSVP reading engine (pure).
 *
 * Turns paragraphs into timed frames: "which slice of text is on screen now,
 * and for how long". No DOM, no chrome.*, no timers, no clock — rsvp-reader.js
 * owns all of that and calls in here for the arithmetic. Enforced by
 * check-engine-purity, which scans every *-engine.js.
 *
 * Dual-export footer mirrors tts-timing-engine.js: Node gets module.exports,
 * the browser gets self.__lexiRsvp.
 */
(function () {
  'use strict';

  const LETTERS = /[\p{L}\p{N}]/gu;

  function letterCount(token) {
    const m = String(token).match(LETTERS);
    return m ? m.length : 0;
  }

  // The optimal recognition point: the eye fixates a little left of centre, so
  // the word is offset to put this letter at a fixed x. Steps rather than a
  // ratio because a ratio jitters between neighbouring word lengths.
  function pivotIndex(token) {
    const n = letterCount(token);
    if (n <= 1) return 0;
    if (n <= 5) return 1;
    if (n <= 9) return 2;
    return 3;
  }

  function tokenize(text) {
    const out = [];
    const re = /\S+/g;
    let m;
    while ((m = re.exec(String(text || '')))) {
      out.push({ text: m[0], start: m.index, end: m.index + m[0].length });
    }
    return out;
  }

  // A closing quote or bracket may follow the stop: «... hus.»
  const PUNCT_FULL = /[.!?…][»"')\]]?$/;
  const PUNCT_HALF = /[,;:][»"')\]]?$/;

  // ── Sentence boundaries (for the paused view) ──────────────────────────
  // A DELIBERATE COPY of the abbreviation set and protected-period test in
  // tts-segmentation-engine.js. Not a shared module: check-engine-purity
  // treats every *-engine.js as a standalone unit and neither engine may
  // require the other, and the two answer different questions (that one
  // divides long text into fetchable portions, this one finds the sentence
  // around one word). If you add an abbreviation here, add it there too.
  const ABBREVIATIONS = new Set([
    'dr.', 'mr.', 'mrs.', 'ms.', 'prof.', 'sr.', 'sra.', 'srta.',
    'f.eks.', 'dvs.', 'bl.a.', 'osv.', 'ca.', 'kl.', 'nr.',
    'e.g.', 'i.e.', 'etc.', 'z.b.', 'bzw.', 'usw.', 'u.a.',
    'm.', 'mme.', 'mlle.',
  ]);
  const SENTENCE_END = '.!?…';
  const TRAILING_CLOSERS = /['"»”\])]/u;

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

  // Index just past a sentence terminator at `i`, swallowing any closing
  // quote or bracket that belongs to it — or -1 when `i` is not a terminator.
  function terminatorEnd(text, i) {
    const ch = text[i];
    if (!SENTENCE_END.includes(ch)) return -1;
    if (ch === '.' && isProtectedPeriod(text, i)) return -1;
    let end = i + 1;
    while (TRAILING_CLOSERS.test(text[end] || '')) end++;
    return end;
  }

  /**
   * The sentence containing [charStart, charEnd), split around it.
   *
   * Returns { before, word, after } — `word` is exactly the slice the reader
   * was showing, so the view can mark it without re-finding it. The sentence
   * is bounded by . ! ? … or the ends of the paragraph. Leading whitespace is
   * trimmed off `before` so the rendered sentence starts on its first letter.
   */
  function sentenceAround(text, charStart, charEnd) {
    const s = String(text || '');
    const a = Math.max(0, Math.min(s.length, charStart | 0));
    const b = Math.max(a, Math.min(s.length, charEnd | 0));

    let start = 0;
    for (let i = a - 1; i >= 0; i--) {
      const end = terminatorEnd(s, i);
      if (end === -1) continue;
      start = Math.min(end, a);
      break;
    }

    // Scan forward from `a`, not from `b`: the current word usually CARRIES
    // the stop that ends its sentence ("hus."), and starting at `b` would
    // step over it and run the paused view on into the next sentence.
    let stop = s.length;
    for (let i = a; i < s.length; i++) {
      const end = terminatorEnd(s, i);
      if (end === -1) continue;
      stop = Math.max(b, end);
      break;
    }

    return {
      before: s.slice(start, a).replace(/^\s+/, ''),
      word: s.slice(a, b),
      after: s.slice(b, stop),
    };
  }

  // Constant-tick RSVP reads badly: long words need more time than "og". The
  // weight is a multiplier on the base tick, clamped so one absurd compound
  // cannot stall the reader.
  function wordWeight(token) {
    const n = letterCount(token);
    let w = 0.6 + 0.4 * (n / 5);
    if (w < 0.6) w = 0.6;
    if (w > 2.2) w = 2.2;
    if (PUNCT_FULL.test(token)) w += 1.0;
    else if (PUNCT_HALF.test(token)) w += 0.5;
    return Math.round(w * 100) / 100;
  }

  function buildFrames(paragraphs, chunkSize) {
    const frames = [];
    paragraphs.forEach((p, pi) => {
      const words = tokenize(p && p.text);
      for (let i = 0; i < words.length; i += chunkSize) {
        const group = words.slice(i, i + chunkSize);
        const isParagraphStart = i === 0;
        frames.push({
          text: group.map(w => w.text).join(' '),
          paragraphIndex: pi,
          paragraphId: p.id,
          charStart: group[0].start,
          charEnd: group[group.length - 1].end,
          wordCount: group.length,
          pivotIndex: pivotIndex(group[0].text),
          isParagraphStart,
          weight: group.reduce((sum, w) => sum + wordWeight(w.text), 0),
          // The very first paragraph gets no lead-in — the reader has just
          // opened and the pupil is already looking at it.
          pauseBeforeWeight: isParagraphStart && pi > 0 ? 2 : 0,
        });
      }
    });
    return frames;
  }

  function createSession(opts) {
    const o = opts || {};
    const chunkSize = Math.max(1, o.chunkSize || 1);
    const frames = buildFrames(o.paragraphs || [], chunkSize);
    let cursor = 0;
    let wordsRead = 0;

    return {
      totalFrames: frames.length,
      next() {
        if (cursor >= frames.length) return null;
        const f = frames[cursor++];
        wordsRead += f.wordCount;
        return f;
      },
      durationMs(frame, wpm) { return (60000 / wpm) * frame.weight; },
      pauseBeforeMs(frame, wpm) { return (60000 / wpm) * frame.pauseBeforeWeight; },
      // Moves the cursor and NOTHING ELSE. wordsRead counts frames actually
      // handed out by next(); it is deliberately not recomputed from the
      // frames a seek skipped over. Otherwise jumping to the last paragraph
      // would report the whole text as read, and the number the pupil is
      // chasing would be one ArrowRight away from meaningless.
      seekParagraph(index) {
        const i = frames.findIndex(f => f.paragraphIndex === index && f.isParagraphStart);
        if (i === -1) return false;
        cursor = i;
        return true;
      },
      progress() {
        const prev = frames[cursor - 1];
        return {
          paragraphIndex: prev ? prev.paragraphIndex : 0,
          wordsRead,
          fraction: frames.length ? cursor / frames.length : 0,
        };
      },
      // FLOOR, not round. A meter that rounds up in the pupil's favour stops
      // meaning anything by the third session — and the whole feature rests on
      // the number being worth chasing. Asserted in the engine tests.
      summary(elapsedMs) {
        const minutes = elapsedMs / 60000;
        return {
          words: wordsRead,
          elapsedMs,
          averageWpm: minutes > 0 ? Math.floor(wordsRead / minutes) : 0,
        };
      },
    };
  }

  const api = { tokenize, pivotIndex, letterCount, wordWeight, sentenceAround, createSession };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof self !== 'undefined') {
    self.__lexiRsvp = api;
  }
})();
