/**
 * Leksihjelp — RSVP reader (the overlay).
 *
 * Owns the clock, the DOM and the keyboard. All arithmetic lives in
 * rsvp-engine.js; all knowledge of where the text came from lives in the
 * source adapter. This file must therefore stay boring: schedule the next
 * frame, paint it, keep the meter honest.
 *
 * Elapsed time EXCLUDES pauses. "How fast did you read" is not the same
 * question as "how long was the reader open".
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  const RSVP = host.__lexiRsvp;
  const t = (key, vars) => (host.__lexiI18n ? host.__lexiI18n.t(key, vars) : key);

  const MIN_WPM = 100;
  const MAX_WPM = 700;
  const STEP_WPM = 25;
  const DEFAULT_WPM = 250;
  // The challenge adds this much speed every this-many words. Gentle enough
  // that the pupil does not notice the ramp until the number appears.
  const CHALLENGE_STEP_WPM = 10;
  const CHALLENGE_STEP_WORDS = 40;
  // Two thresholds, because they answer two different questions. Below the
  // first, RSVP is pointless — a pupil reads a sentence faster with their eyes
  // than word by word — so the widget does not offer the button at all. Below
  // the second, the measured average is startup and stop with nothing between
  // (21 words at 366 wpm is 3.4 seconds), so it may be shown but must not set
  // a default speed or a record. ~100 words is 15–20 s of actual reading.
  const MIN_WORDS_TO_OFFER = 30;
  const MIN_WORDS_TO_TRUST = 100;

  // Per language, because a pupil reads Norwegian and German at genuinely
  // different speeds and one shared record would be either unreachable or
  // meaningless. The key is the standard — nb and nn are separate, unlike the
  // 'no' the TTS voice path collapses them into.
  const SPEED_KEY = 'rsvpSpeedByLang';
  const RECORD_KEY = 'rsvpRecordByLang';

  const store = {
    async load(langCode) {
      try {
        const got = await chrome.storage.local.get([SPEED_KEY, RECORD_KEY]);
        return {
          wpm: (got[SPEED_KEY] || {})[langCode] || DEFAULT_WPM,
          record: (got[RECORD_KEY] || {})[langCode] || null,
        };
      } catch (_) {
        return { wpm: DEFAULT_WPM, record: null };
      }
    },
    async saveSpeed(langCode, wpm) {
      try {
        const got = await chrome.storage.local.get([SPEED_KEY]);
        const map = got[SPEED_KEY] || {};
        map[langCode] = wpm;
        await chrome.storage.local.set({ [SPEED_KEY]: map });
      } catch (_) { /* best-effort */ }
    },
    async saveRecord(langCode, entry) {
      try {
        const got = await chrome.storage.local.get([RECORD_KEY]);
        const map = got[RECORD_KEY] || {};
        map[langCode] = entry;
        await chrome.storage.local.set({ [RECORD_KEY]: map });
      } catch (_) { /* best-effort */ }
    },
  };

  let el = null;          // overlay root
  let session = null;
  let source = null;
  let timer = null;
  let lang = 'nb';
  let state = null;

  function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }

  function readMs() {
    // Accumulated reading time, excluding pauses.
    if (!state) return 0;
    const running = state.playing ? (Date.now() - state.startedAt) : 0;
    return state.accumulatedMs + running;
  }

  function build() {
    el = document.createElement('div');
    el.id = 'lexi-rsvp';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', t('rsvp_open_title'));
    el.innerHTML = `
      <div class="lh-rsvp-stage">
        <div class="lh-rsvp-word"><span class="lh-rsvp-pre"></span><span class="lh-rsvp-pivot"></span><span class="lh-rsvp-post"></span></div>
        <div class="lh-rsvp-tick"></div>
        <div class="lh-rsvp-sentence" hidden></div>
      </div>
      <div class="lh-rsvp-bar">
        <button class="lh-rsvp-toggle" title="${t('rsvp_pause')}">${t('rsvp_pause')}</button>
        <div class="lh-rsvp-progress"><div class="lh-rsvp-progress-fill"></div></div>
        <span class="lh-rsvp-para"></span>
        <span class="lh-rsvp-meter"><strong class="lh-rsvp-wpm"></strong> ${t('rsvp_wpm')}<span class="lh-rsvp-record" hidden></span></span>
        <button class="lh-rsvp-challenge" title="${t('rsvp_challenge_title')}">${t('rsvp_challenge')}</button>
        <button class="lh-rsvp-close" title="${t('rsvp_close')}">&times;</button>
      </div>
      <div class="lh-rsvp-hint">${t('rsvp_keys_hint')}</div>
      <div class="lh-rsvp-result" hidden></div>
    `;
    (document.fullscreenElement || document.documentElement).appendChild(el);
    el.querySelector('.lh-rsvp-toggle').addEventListener('click', toggle);
    el.querySelector('.lh-rsvp-close').addEventListener('click', close);
    el.querySelector('.lh-rsvp-challenge').addEventListener('click', startChallenge);
  }

  // The challenge restarts from the top on a FRESH session: seeking back to
  // paragraph 0 would leave the words already read in the ordinary run on the
  // counter, and the challenge's average is words-read over challenge-time.
  // A ramp that began halfway through would report an average over a stretch
  // the pupil had already read.
  function startChallenge() {
    clearTimer();
    session = RSVP.createSession({ paragraphs: state.paragraphs, chunkSize: state.chunkSize });
    state.playing = false;
    state.challenge = true;
    state.accumulatedMs = 0;
    state.pendingFrame = null;
    state.lastFrame = null;
    el.querySelector('.lh-rsvp-challenge').disabled = true;
    el.querySelector('.lh-rsvp-sentence').hidden = true;
    paintProgress(0);
    updateMeter();
    play();
  }

  // Paragraph counter + progress bar, and the single place state.paragraphIndex
  // is set. Split out of paint() because a jump made while paused moves the
  // paragraph without painting a word. The reader tracks the paragraph itself
  // rather than asking session.progress() for it: progress() reports the
  // paragraph of the frame BEFORE the cursor, which right after a seek is the
  // paragraph we just left — so jump() would compute its target from a stale
  // number while the counter beside it already showed the new one.
  function paintProgress(paragraphIndex) {
    state.paragraphIndex = paragraphIndex;
    el.querySelector('.lh-rsvp-para').textContent =
      t('rsvp_paragraph_of', { current: paragraphIndex + 1, total: state.paragraphCount });
    el.querySelector('.lh-rsvp-progress-fill').style.width =
      Math.round(session.progress().fraction * 100) + '%';
  }

  function paint(frame) {
    const word = frame.text;
    const p = Math.min(frame.pivotIndex, Math.max(0, word.length - 1));
    el.querySelector('.lh-rsvp-pre').textContent = word.slice(0, p);
    el.querySelector('.lh-rsvp-pivot').textContent = word.slice(p, p + 1);
    el.querySelector('.lh-rsvp-post').textContent = word.slice(p + 1);
    state.lastFrame = frame;
    paintProgress(frame.paragraphIndex);
  }

  function currentWpm() {
    if (!state.challenge) return state.wpm;
    const steps = Math.floor(session.progress().wordsRead / CHALLENGE_STEP_WORDS);
    return Math.min(MAX_WPM, state.wpm + steps * CHALLENGE_STEP_WPM);
  }

  function tick() {
    // A frame pulled from the session but not yet painted is held in
    // state.pendingFrame. next() has already counted its words, so fetching a
    // new one on resume would charge the pupil for a word they never saw —
    // and at a paragraph boundary the lead-in leaves a 480 ms window at
    // 250 wpm in which pause() does exactly that.
    const frame = state.pendingFrame || session.next();
    if (!frame) return finish();
    state.pendingFrame = frame;
    const wpm = currentWpm();
    const show = () => {
      state.pendingFrame = null;
      paint(frame);
      timer = setTimeout(tick, session.durationMs(frame, wpm));
    };
    if (frame.isParagraphStart) {
      source.highlight(frame.paragraphId);
      source.reveal(frame.paragraphId);
    }
    const lead = session.pauseBeforeMs(frame, wpm);
    if (lead > 0) { timer = setTimeout(show, lead); } else { show(); }
  }

  function play() {
    if (state.playing || state.finished) return;
    // Never run the clock in a hidden tab — see onVisibility. The listener
    // only catches transitions, so this covers the tab that was already in
    // the background when the reader opened.
    if (document.hidden) {
      el.querySelector('.lh-rsvp-toggle').textContent = t('rsvp_resume');
      return;
    }
    state.playing = true;
    state.startedAt = Date.now();
    el.querySelector('.lh-rsvp-toggle').textContent = t('rsvp_pause');
    el.querySelector('.lh-rsvp-sentence').hidden = true;
    tick();
  }

  function pause() {
    if (!state.playing) return;
    clearTimer();
    state.accumulatedMs += Date.now() - state.startedAt;
    state.playing = false;
    el.querySelector('.lh-rsvp-toggle').textContent = t('rsvp_resume');
    showSentence();
    // Pausing a challenge means "I lost it" — report what was read up to here.
    if (state.challenge) finish();
  }

  function toggle() { state.playing ? pause() : play(); }

  /**
   * The sentence around the frame that is on screen, with that frame's own
   * words marked. A single word alone gives no orientation and the whole
   * paragraph gives too much — on a long article paragraph it is a wall of
   * text with no indication of where the pupil is.
   *
   * Built from text nodes, never innerHTML: this string is page content.
   */
  function showSentence(frame) {
    const f = frame || state.lastFrame;
    const box = el.querySelector('.lh-rsvp-sentence');
    const para = f ? state.paragraphs[f.paragraphIndex] : null;
    if (!para) { box.hidden = true; return; }
    const parts = RSVP.sentenceAround(para.text, f.charStart, f.charEnd);
    const mark = document.createElement('strong');
    mark.className = 'lh-rsvp-sentence-word';
    mark.textContent = parts.word;
    box.textContent = '';
    box.appendChild(document.createTextNode(parts.before));
    box.appendChild(mark);
    box.appendChild(document.createTextNode(parts.after));
    box.hidden = false;
  }

  function finish() {
    // Re-entrant: tick() ends the text, and a challenge that is paused on its
    // last frame would otherwise report twice — and save the record twice.
    if (!state || state.finished) return;
    clearTimer();
    if (state.playing) {
      state.accumulatedMs += Date.now() - state.startedAt;
      state.playing = false;
    }
    state.finished = true;
    source.highlight(null);
    // The speed is persisted here and in close(), not on every arrow press:
    // four quick nudges used to interleave four get/set pairs on one storage
    // key, and a stale read could win and lose the pupil's speed.
    store.saveSpeed(lang, state.wpm);
    renderResult(session.summary(readMs()));
  }

  // A hidden tab throttles setTimeout to roughly one call per second, so a
  // reader left running in the background steps through the text at ~60 wpm
  // with nobody watching — and the clock, which is honest by design, reports
  // that as the pupil's reading speed. Measured: a 100 ms timer took 676 ms in
  // a backgrounded tab. Pausing on hide protects the one number the whole
  // feature rests on. During a challenge this ends the run, same as any pause.
  function onVisibility() {
    if (document.hidden) pause();
  }

  function close() {
    clearTimer();
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('visibilitychange', onVisibility);
    if (state) store.saveSpeed(lang, state.wpm);
    host.__lexiRsvpOpen = false;
    if (state && state.widgetWasVisible && typeof host.__lexiWidgetReturn === 'function') {
      host.__lexiWidgetReturn();
    }
    if (source) source.dispose();
    if (el && el.parentNode) el.parentNode.removeChild(el);
    el = null; session = null; source = null; state = null;
  }

  function onKey(e) {
    if (!el || !state) return;
    // Once the result is up the reader is over: only Escape still means
    // something. Space would otherwise resume into an exhausted session,
    // re-finish it, and report a slower average over the same words.
    if (state.finished && e.key !== 'Escape') return;
    const handled = {
      ' ': () => toggle(),
      'Escape': () => close(),
      'ArrowLeft': () => jump(-1),
      'ArrowRight': () => jump(1),
      'ArrowUp': () => nudge(STEP_WPM),
      'ArrowDown': () => nudge(-STEP_WPM),
    }[e.key];
    if (!handled) return;
    e.preventDefault();
    e.stopPropagation();
    handled();
  }

  // A challenge run is sequential by construction: no seeking and no
  // re-speeding while it is running. A challenge that can be jumped past or
  // nudged faster is not measuring the pupil — and ↑/↓ would silently shift
  // the ramp's base while the meter is hidden.
  function jump(delta) {
    if (state.challenge) return;
    const target = state.paragraphIndex + delta;
    if (target < 0 || target >= state.paragraphCount) return;
    clearTimer();
    // Dropping a pending frame that next() has already counted over-reports by
    // one word — but only when the jump lands inside a paragraph lead-in, and
    // jumping is refused in the only mode that keeps a record.
    state.pendingFrame = null;
    session.seekParagraph(target);
    source.highlight(state.paragraphs[target].id);
    source.reveal(state.paragraphs[target].id);
    paintProgress(target);
    if (state.playing) {
      tick();
    } else {
      // Nothing is painted at the new position yet, so mark the word the next
      // frame will show: the target paragraph's first token.
      const first = RSVP.tokenize(state.paragraphs[target].text)[0];
      state.lastFrame = first
        ? { paragraphIndex: target, charStart: first.start, charEnd: first.end }
        : null;
      showSentence();
    }
  }

  function nudge(delta) {
    if (state.challenge) return;
    state.wpm = Math.min(MAX_WPM, Math.max(MIN_WPM, state.wpm + delta));
    updateMeter();
  }

  function updateMeter() {
    const meter = el.querySelector('.lh-rsvp-meter');
    meter.hidden = !!state.challenge;
    el.querySelector('.lh-rsvp-wpm').textContent = String(state.wpm);
    // The record sits next to the speed — the number the pupil is chasing is
    // only worth chasing if it is in view while they read.
    const rec = el.querySelector('.lh-rsvp-record');
    const showRecord = !!state.record && !state.challenge;
    rec.textContent = showRecord ? t('rsvp_record', { wpm: state.record.wpm }) : '';
    rec.hidden = !showRecord;
  }

  function renderResult(summary) { result.render(el, summary, state, lang); }

  function formatDuration(ms) {
    const total = Math.round(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m > 0 ? `${m} min ${s} s` : `${s} s`;
  }

  const result = {
    /**
     * ONLY A CHALLENGE RUN CAN SET A RECORD. During ordinary playback the
     * elapsed time is generated from state.wpm — every frame lasts exactly as
     * long as the speed setting says — so the reported average is the speed
     * dial divided by the mean frame weight. Set 700, leave the tab, come back
     * to a "record" nobody read. Ordinary playback therefore gets the same
     * result screen minus the record framing, as the spec's «End of text»
     * section asks.
     */
    render(root, summary, st, langCode) {
      const box = root.querySelector('.lh-rsvp-result');
      // 21 words at 366 wpm is 3.4 seconds — startup and stop with nothing in
      // between. Below the threshold the number is still shown, because seeing
      // it is the fun part, but it is not allowed to change anything.
      const trustworthy = summary.words >= MIN_WORDS_TO_TRUST;
      const ranked = !!st.challenge && trustworthy;
      const beaten = ranked && summary.words > 0 && (!st.record || summary.averageWpm > st.record.wpm);
      let recordLine = '';
      if (beaten) {
        recordLine = `<div class="lh-rsvp-result-detail">${t('rsvp_result_new_record')}</div>`;
      } else if (ranked && st.record) {
        recordLine = `<div class="lh-rsvp-result-detail">${t('rsvp_result_previous', { wpm: st.record.wpm })}</div>`;
      }
      box.innerHTML = `
        <div class="lh-rsvp-result-lead">${t('rsvp_result_lead')}</div>
        <div class="lh-rsvp-result-number">${summary.averageWpm}</div>
        <div class="lh-rsvp-result-detail">${t('rsvp_wpm')} — ${t('rsvp_result_detail', {
          words: summary.words, duration: formatDuration(summary.elapsedMs),
        })}</div>
        ${recordLine}
        ${trustworthy ? '' : `<div class="lh-rsvp-result-detail">${t('rsvp_result_too_short', { words: MIN_WORDS_TO_TRUST })}</div>`}
        <div class="lh-rsvp-result-actions">
          ${trustworthy ? `<button class="lh-rsvp-accept">${t('rsvp_result_use_speed', { wpm: summary.averageWpm })}</button>` : ''}
          <button class="lh-rsvp-dismiss">${t('rsvp_close')}</button>
        </div>
      `;
      box.hidden = false;
      const accept = box.querySelector('.lh-rsvp-accept');
      if (accept) accept.addEventListener('click', () => {
        // Hand the new speed to close(), which owns the single storage write.
        // Writing it here as well would race close()'s read-modify-write.
        st.wpm = Math.min(MAX_WPM, Math.max(MIN_WPM, summary.averageWpm));
        close();
      });
      box.querySelector('.lh-rsvp-dismiss').addEventListener('click', close);
      if (beaten) {
        store.saveRecord(langCode, { wpm: summary.averageWpm, words: summary.words, at: new Date().toISOString() });
      }
    },
  };

  function open(opts) {
    if (el) close();
    source = opts.source;
    lang = opts.lang || 'nb';
    const paragraphs = source.getParagraphs();
    if (!paragraphs.length) { source.dispose(); source = null; return false; }
    const chunkSize = opts.chunkSize || 1;
    session = RSVP.createSession({ paragraphs, chunkSize });
    if (session.totalFrames === 0) { source.dispose(); source = null; session = null; return false; }
    state = {
      wpm: opts.wpm || DEFAULT_WPM,
      chunkSize,
      challenge: !!opts.challenge,
      paragraphs,
      paragraphCount: paragraphs.length,
      // The reader's own cursor, kept in step by paintProgress(). See jump().
      paragraphIndex: 0,
      // Pulled from the session but not yet painted; see tick().
      pendingFrame: null,
      // The frame currently on screen, for the paused sentence view.
      lastFrame: null,
      accumulatedMs: 0,
      startedAt: 0,
      playing: false,
      finished: false,
      record: opts.record || null,
    };
    build();
    updateMeter();
    // Ask the TTS bubble to step aside — it sits above this overlay and would
    // otherwise cover it. Optional hook: the reader works without it.
    state.widgetWasVisible = typeof host.__lexiWidgetStepAside === 'function' &&
      host.__lexiWidgetStepAside() === true;
    // Tells the bubble's selection handler to stay down: the pupil's selection
    // is still live, so every click inside the reader would otherwise re-show it.
    host.__lexiRsvpOpen = true;
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVisibility);
    play();
    return true;
  }

  host.__lexiRsvpReader = { open, close, MIN_WPM, MAX_WPM, DEFAULT_WPM, MIN_WORDS_TO_OFFER, MIN_WORDS_TO_TRUST };

  // Convenience wrapper: reads the pupil's stored speed and record for this
  // language, then opens. Call sites should prefer this over open().
  host.__lexiRsvpReader.openFor = async function openFor(opts) {
    const saved = await store.load(opts.lang || 'nb');
    return open(Object.assign({}, opts, { wpm: saved.wpm, record: saved.record }));
  };
})();
