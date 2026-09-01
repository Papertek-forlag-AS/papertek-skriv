/**
 * Leksihjelp — TTS word-timing engine (pure)
 *
 * Turns the backend's `wordTimings` into "which word span do I highlight
 * right now?". No DOM, no chrome.*, no network — the floating widget owns
 * all of that and calls in here for the arithmetic.
 *
 * WHY OFFSETS MATTER
 * ------------------
 * The old ElevenLabs path returned one timing per SPOKEN word and the
 * widget highlighted written word number `i` for spoken word number `i`.
 * That works only while the two sequences are the same length. Papertek
 * TTS normalises before synthesis — "14.08." is read as "fjortende
 * august", "kl. 10" as "klokka ti" — so one written token can become two
 * spoken ones and the positional assumption silently breaks: from the
 * first abbreviation onward, the highlight runs ahead of the voice and
 * never recovers. That is not imprecision, it is the wrong word.
 *
 * So each Papertek timing also carries `startOffset`/`endOffset`, which
 * index into the ORIGINAL text the pupil selected. Mapping those onto the
 * spans the widget already built from that same string is exact, and
 * degrades cleanly: no offsets (an ElevenLabs response, or an older
 * backend) falls back to the positional behaviour that shipped before.
 *
 * Dual-export footer mirrors spell-check-engine.js — Node gets
 * module.exports, the browser gets self.__lexiTtsTiming.
 */
(function () {
  'use strict';

  /**
   * Does a timing carry a usable pair of offsets?
   *
   * The backend already drops malformed pairs (see normalizeWordTimings
   * in _tts-papertek.js), so this is a second, cheap gate rather than a
   * duplicate of that validation — a client must never assume its server
   * is the version it was written against.
   */
  function hasOffsets(t) {
    return !!t
      && Number.isInteger(t.startOffset)
      && Number.isInteger(t.endOffset)
      && t.startOffset >= 0
      && t.endOffset > t.startOffset;
  }

  /**
   * Map each timing to the index of the word span it should highlight.
   *
   * @param {Array<{start:number,end:number,startOffset?:number,endOffset?:number}>} wordTimings
   * @param {Array<{charStart:number,charEnd:number}>} wordPositions — as
   *        built by the widget when it rendered the text into spans.
   * @returns {number[]} one span index per timing; -1 means "no span —
   *          keep whatever is currently highlighted".
   *
   * Offset mode is used when AT LEAST ONE timing has offsets. A partial
   * response is the realistic shape: a normalised token may have no
   * counterpart in the original string and so no offsets, while its
   * neighbours do. Falling back to positional mode for the whole array
   * because one entry lacked offsets would throw away the exact
   * information we have for the rest.
   */
  function mapTimingsToSpans(wordTimings, wordPositions) {
    const timings = Array.isArray(wordTimings) ? wordTimings : [];
    const positions = Array.isArray(wordPositions) ? wordPositions : [];
    const n = positions.length;
    if (n === 0) return timings.map(() => -1);

    const useOffsets = timings.some(hasOffsets);

    if (!useOffsets) {
      // Legacy positional mapping, including the clamp the widget used
      // to apply itself: more spoken words than spans means the last
      // span stays lit through the tail rather than going dark.
      return timings.map((_, i) => (i < n ? i : n - 1));
    }

    return timings.map((t) => {
      if (!hasOffsets(t)) return -1;
      // First span that overlaps the spoken range. Half-open intervals on
      // both sides, so a word ending exactly where the next begins does
      // not match both.
      for (let i = 0; i < n; i++) {
        const p = positions[i];
        if (p.charStart < t.endOffset && p.charEnd > t.startOffset) return i;
      }
      return -1;
    });
  }

  /**
   * Which timing is playing at `currentTime`?
   *
   * @returns {number} index into wordTimings, or -1 before the first word.
   *
   * Past the end of the last timing the last word stays selected rather
   * than clearing — audio usually has a short tail after the final
   * syllable, and a highlight that blinks off just before playback ends
   * reads as a bug.
   */
  function findActiveTimingIndex(wordTimings, currentTime) {
    const timings = Array.isArray(wordTimings) ? wordTimings : [];
    if (timings.length === 0) return -1;

    for (let i = 0; i < timings.length; i++) {
      if (currentTime >= timings[i].start && currentTime < timings[i].end) return i;
    }

    const last = timings[timings.length - 1];
    if (currentTime >= last.start) return timings.length - 1;
    return -1;
  }

  const api = { mapTimingsToSpans, findActiveTimingIndex, hasOffsets };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else if (typeof self !== 'undefined') {
    self.__lexiTtsTiming = api;
  }
})();
