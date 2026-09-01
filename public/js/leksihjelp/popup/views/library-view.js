(function () {
  'use strict';
  function mountLibraryView(container, deps) {
    if (!container) throw new Error('mountLibraryView: container required');
    if (!deps) throw new Error('mountLibraryView: deps required');
    const { lang, studentFacingIds, personalization, openLesson, uiLang, t,
            isFeatureEnabled, ruleFeatures, personalizationEnabled } = deps;
    const perso = personalizationEnabled !== false;   // default on
    let knownBoxOpen = false;                          // "Dette kan jeg" collapsed by default
    let learningBoxOpen = false;                       // "Læringsbunken" collapsed by default
    // Diff state: the library view OWNS the migrate animation, driven by what
    // changed bucket since the last render — so every entry path (sidebar
    // button, lesson pop-out, in-page modal, writing popover) animates the same
    // way via onChange→render, not just the in-list click.
    let prevKnown = null;       // Set|null — null = first render, never animates
    let prevLearning = null;
    const animating = new Map();  // id → { kind:'learned'|'bunked', src:'main'|'learning'|'known' }
    let lastHtml = null;          // skip redundant DOM writes so an in-flight CSS animation isn't restarted
    const RF = ruleFeatures || {};
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    let guardState = false;
    let ownWordsOpen = false; // "Mine ord" collapsible: preserved across re-renders
    let lastRenderLang = null;
    let activeCefrFilter = null; // null = all levels, or 'A1'|'A2'|'B1'|'B2'|'C1'

    function focusRowHtml(focusOn, guardActive) {
      const subtitle = (focusOn && !guardActive)
        ? `<p class="lh-library-focus-subtitle">${esc(t('focus_mode_subtitle'))}</p>` : '';
      const guard = guardActive
        ? `<p class="lh-library-focus-guard">${esc(t('focus_mode_guard'))}</p>` : '';
      return `<div class="lh-library-focus-row">
    <label class="toggle-row">
      <span class="lh-library-focus-label">${esc(t('focus_mode_label'))}</span>
      <input type="checkbox" id="lh-focus-mode-toggle"${focusOn ? ' checked' : ''}>
      <span class="toggle-slider"></span>
    </label>
    ${subtitle}${guard}
  </div>`;
    }

    function inScope(id) {
      let req = RF[id];
      // Pedagogy-variant keys (e.g. de-prep-case-akkusativ) inherit the scope of
      // their base rule (de-prep-case) — match the longest base-rule prefix.
      if (!req) {
        const base = Object.keys(RF).filter(k => id.startsWith(k + '-')).sort((a, b) => b.length - a.length)[0];
        if (base) req = RF[base];
      }
      if (!req) return true;                                 // always-on basic
      if (!isFeatureEnabled) return true;                    // permissive default
      return Array.isArray(req) ? req.some(f => isFeatureEnabled(f)) : isFeatureEnabled(req);
    }

    // state: 'main' | 'learning' | 'known' | 'locked'. anim: 'learned'|'bunked'|undefined.
    function rowHtml(id, opts) {
      const state = (opts && opts.state) || 'main';
      const anim = opts && opts.anim;
      const animCls = anim === 'learned' ? ' lh-library-row--learned'
        : anim === 'bunked' ? ' lh-library-row--bunked' : '';
      const btn = (action, label, extraCls, title) =>
        `<button type="button" class="lh-library-toggle${extraCls ? ' ' + extraCls : ''}" data-action="${action}" data-rule="${esc(id)}"${title ? ` title="${esc(title)}"` : ''}>${esc(label)}</button>`;
      let badge = '', actions = '';
      if (state === 'locked') {
        badge = `<span class="lh-library-badge locked">${esc(t('lesson_locked_note'))}</span>`;
      } else if (perso) {
        if (state === 'known') {
          badge = `<span class="lh-library-badge known">${esc(t('library_known_badge'))}</span>`;
          actions = btn('demote', t('personal_demote'));                       // known → læringsbunken
        } else if (state === 'learning') {
          actions = btn('mark', t('library_mark_known'))                       // → mastered
            + btn('unlearn', '✕', 'lh-library-unlearn', t('library_learning_remove'));
        } else {
          actions = btn('learn', t('library_mark_learning'), 'lh-library-learn') // → læringsbunken
            + btn('mark', t('library_mark_known'));                            // → mastered
        }
      }
      const pedEntry = deps.pedagogy[id];
      const displayTitle = (pedEntry && pedEntry.title && (pedEntry.title[uiLang] || pedEntry.title.nb)) || id;
      return `<div class="lh-library-row${state === 'locked' ? ' locked' : ''}${animCls}" data-rule="${esc(id)}" role="button" tabindex="0">
    <span class="lh-library-title" title="${esc(id)}">${esc(displayTitle)}</span>${badge}${actions}
  </div>`;
    }

    function ownWordsHtml() {
      const words = personalization.getPersonalWords(lang);
      // Collapsible <details> pinned at the top of Lær mer. Collapsed by
      // default so it never pushes the lessons down; the count in the
      // summary makes it informative even when closed. Open/closed state is
      // preserved across re-renders via ownWordsOpen (see onClick).
      const body = words.length
        ? `<ul class="lh-library-wordlist">${words.map(w =>
            `<li>${esc(w)} <button type="button" class="lh-library-remove-word" data-word="${esc(w)}">✕</button></li>`).join('')}</ul>`
        : `<p class="lh-library-dict-empty">${esc(t('library_my_words_empty'))}</p>`;
      return `<details class="lh-library-dict"${ownWordsOpen ? ' open' : ''}>` +
        `<summary class="lh-library-dict-summary">${esc(t('library_my_words'))} <span class="lh-library-dict-count">${words.length}</span></summary>` +
        body + `</details>`;
    }

    // A lesson is shown only if it has real content (a non-empty note); empty
    // placeholder entries (e.g. de `explanation`/`examples`) are filtered out.
    function hasContent(id) {
      const e = deps.pedagogy[id];
      if (!e) return false;
      const n = e.note;
      if (typeof n === 'string') return n.trim().length > 0;
      return !!(n && (n.nb || n.nn || n.en));
    }
    // Curriculum difficulty (easy→hard). Entries without one sort last.
    function difficultyOf(id) {
      const d = deps.pedagogy[id] && deps.pedagogy[id].difficulty;
      return typeof d === 'number' ? d : Infinity;
    }
    function cefrOf(id) {
      return (deps.pedagogy[id] && deps.pedagogy[id].cefr) || null;
    }

    const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1'];
    function cefrFilterHtml(availableCefr) {
      const pills = CEFR_ORDER.filter(l => availableCefr.has(l));
      if (pills.length < 2) return ''; // don't show filter if only one level present
      const allActive = !activeCefrFilter;
      return `<div class="lh-library-cefr-filter">
        <button type="button" class="lh-library-cefr-pill lh-cefr-all${allActive ? ' active' : ''}" data-cefr="all">Alle</button>
        ${pills.map(l => `<button type="button" class="lh-library-cefr-pill lh-cefr-${l.toLowerCase()}${activeCefrFilter === l ? ' active' : ''}" data-cefr="${esc(l)}">${esc(l)}</button>`).join('')}
      </div>`;
    }

    function wireToggle() {
      const cb = container.querySelector('#lh-focus-mode-toggle');
      if (!cb) return;
      cb.addEventListener('change', async (e) => {
        const wantOn = e.target.checked;
        if (wantOn) {
          const known    = personalization.getKnownLessons(lang);
          const learning = personalization.getLearningLessons(lang);
          if (!known.length && !learning.length) {
            // Guard: empty sets — don't enable
            cb.checked = false;
            guardState = true;
            render();
            return;
          }
        }
        guardState = false;
        try {
          await personalization.setFocusMode(lang, wantOn);
        } catch (_) {
          cb.checked = !wantOn; // revert checkbox on failure
        }
        // setFocusMode → persist → onChange → render() fires automatically
        // via the store's onChange subscription. Re-render here too so
        // the subtitle updates even if onChange doesn't fire.
        render();
      });
    }

    function render() {
      if (lang !== lastRenderLang) {
        guardState = false;
        activeCefrFilter = null;
        lastRenderLang = lang;
      }
      const all = studentFacingIds
        .filter(hasContent)
        .sort((a, b) => difficultyOf(a) - difficultyOf(b));
      const ids = all.filter(inScope);
      const locked = all.filter(id => !inScope(id));
      const focusPrefix = perso ? focusRowHtml(personalization.isFocusModeEnabled(lang), guardState) : '';

      // CEFR filter — which levels exist and which are active
      const availableCefr = new Set(ids.map(cefrOf).filter(Boolean));
      const filteredIds = activeCefrFilter ? ids.filter(id => cefrOf(id) === activeCefrFilter) : ids;

      if (all.length === 0) {
        const emptyHtml = focusPrefix + `<div class="lh-library"><p class="lh-library-empty">${esc(t('library_empty_lang'))}</p></div>`;
        if (emptyHtml !== lastHtml) { container.innerHTML = emptyHtml; lastHtml = emptyHtml; wireToggle(); }
        prevKnown = prevLearning = null;
        return;
      }

      const knownSet = perso ? new Set(personalization.getKnownLessons(lang)) : new Set();
      const learningSet = perso ? new Set(personalization.getLearningLessons(lang)) : new Set();

      // Detect bucket changes since the last render → start a migrate animation.
      // Capture the SOURCE bucket NOW (prevKnown/prevLearning still reflect the
      // pre-change state); storing it keeps placement stable across the several
      // redundant renders a single click can trigger (onChange + .then +
      // storage echo), so the CSS animation isn't restarted or the row bounced
      // between boxes. Auto-open the destination box so the lesson lands visibly.
      if (perso && prevKnown) {
        for (const id of ids) {
          if (animating.has(id)) continue;
          const src = prevKnown.has(id) ? 'known' : prevLearning.has(id) ? 'learning' : 'main';
          if (knownSet.has(id) && !prevKnown.has(id)) {
            animating.set(id, { kind: 'learned', src }); knownBoxOpen = true; scheduleSettle(id);
          } else if (learningSet.has(id) && !prevLearning.has(id) && !knownSet.has(id)) {
            animating.set(id, { kind: 'bunked', src }); learningBoxOpen = true; scheduleSettle(id);
          }
        }
      }

      // Three partitions: still-to-learn (main), læringsbunken (active learning),
      // mastered ("Dette kan jeg"). learning ⊥ known is enforced by the store.
      // A lesson mid-animation pulses in its captured SOURCE bucket before the
      // settle re-render moves it to its new home. CEFR filter applied.
      const mainIds = [], learningIds = [], knownIds = [];
      for (const id of filteredIds) {
        const bucket = animating.has(id) ? animating.get(id).src
          : knownSet.has(id) ? 'known'
            : learningSet.has(id) ? 'learning' : 'main';
        (bucket === 'known' ? knownIds : bucket === 'learning' ? learningIds : mainIds).push(id);
      }

      let overview = '';
      if (perso) {
        const trueKnown = ids.filter(id => knownSet.has(id)).length;
        const txt = t('library_overview').replace('{known}', trueKnown).replace('{total}', ids.length);
        overview = `<div class="lh-library-overview">${esc(txt === t('library_overview') ? (trueKnown + '/' + ids.length) : txt)}</div>`;
      } else {
        const txt = t('library_lesson_count').replace('{count}', ids.length);
        overview = `<div class="lh-library-count">${esc(txt === t('library_lesson_count') ? String(ids.length) : txt)}</div>`;
      }

      const animKind = (id) => { const a = animating.get(id); return a && a.kind; };
      const cefrFilter = cefrFilterHtml(availableCefr);
      const rows = (perso ? mainIds : filteredIds)
        .map(id => rowHtml(id, { state: 'main', anim: animKind(id) })).join('');

      // "Læringsbunken" — collapsible box of lessons the student is actively
      // practising. Sits between the main list and the mastered box.
      const learningBox = learningIds.length
        ? `<section class="lh-library-learning-box${learningBoxOpen ? ' open' : ''}">
        <button type="button" class="lh-library-learning-toggle">
          <span class="lh-library-learning-icon" aria-hidden="true">📚</span>
          <span class="lh-library-learning-title">${esc(t('library_learning_box'))}</span>
          <span class="lh-library-learning-count">${learningIds.length}</span>
          <span class="lh-library-learning-chev" aria-hidden="true">▾</span>
        </button>
        <div class="lh-library-learning-body">${learningIds.map(id => rowHtml(id, { state: 'learning', anim: animKind(id) })).join('')}</div>
      </section>`
        : '';

      // "Dette kan jeg" — collapsible box of mastered lessons.
      const knownBox = knownIds.length
        ? `<section class="lh-library-known-box${knownBoxOpen ? ' open' : ''}">
        <button type="button" class="lh-library-known-toggle">
          <span class="lh-library-known-title">${esc(t('library_known_box'))}</span>
          <span class="lh-library-known-count">${knownIds.length}</span>
          <span class="lh-library-known-chev" aria-hidden="true">▾</span>
        </button>
        <div class="lh-library-known-body">${knownIds.map(id => rowHtml(id, { state: 'known', anim: animKind(id) })).join('')}</div>
      </section>`
        : '';

      const lockedHtml = locked.length
        ? `<section class="lh-library-locked"><h3>${esc(t('library_locked_section'))}</h3>${locked.map(id => rowHtml(id, { state: 'locked' })).join('')}</section>`
        : '';
      const dict = perso ? ownWordsHtml() : '';
      // dict pinned FIRST (top of Lær mer) so the personal word list is
      // discoverable without scrolling past every lesson.
      const html = focusPrefix + `<div class="lh-library">${dict}${overview}${cefrFilter}${rows}${learningBox}${knownBox}${lockedHtml}</div>`;
      // Only touch the DOM when the markup actually changed — a single click can
      // fan out into several renders (store onChange + the click's own .then +
      // the extension's storage.onChanged echo); rewriting identical innerHTML
      // would restart the in-flight CSS migrate animation and it'd never play.
      if (html !== lastHtml) { container.innerHTML = html; lastHtml = html; wireToggle(); }

      prevKnown = knownSet;
      prevLearning = learningSet;
    }

    function scheduleSettle(id) {
      // After the CSS migrate animation finishes, drop the row from its source
      // bucket and re-render so it lands in its new home.
      setTimeout(() => { animating.delete(id); render(); }, 560);
    }

    function onClick(e) {
      const closest = (sel) => e.target.closest && e.target.closest(sel);
      // CEFR level filter tabs
      const cefrPill = closest('.lh-library-cefr-pill');
      if (cefrPill) {
        e.stopPropagation();
        const level = cefrPill.dataset.cefr;
        activeCefrFilter = level === 'all' ? null : level;
        render();
        return;
      }
      // Expand/collapse the boxes (no re-render — CSS animates the height).
      const knownToggle = closest('.lh-library-known-toggle');
      if (knownToggle) {
        e.stopPropagation();
        knownBoxOpen = !knownBoxOpen;
        const box = knownToggle.closest('.lh-library-known-box');
        if (box) box.classList.toggle('open', knownBoxOpen);
        return;
      }
      const learnToggle = closest('.lh-library-learning-toggle');
      if (learnToggle) {
        e.stopPropagation();
        learningBoxOpen = !learningBoxOpen;
        const box = learnToggle.closest('.lh-library-learning-box');
        if (box) box.classList.toggle('open', learningBoxOpen);
        return;
      }
      // State-change action buttons. The animation is driven by render()'s diff,
      // so we just mutate the store and re-render.
      const toggle = closest('.lh-library-toggle');
      if (toggle) {
        e.stopPropagation();
        const id = toggle.dataset.rule;
        const fn = ({ learn: 'markLearning', mark: 'markKnown', demote: 'markLearning', unlearn: 'unmarkLearning' })[toggle.dataset.action];
        if (fn) Promise.resolve(personalization[fn](lang, id)).then(render);
        return;
      }
      const rm = closest('.lh-library-remove-word');
      if (rm) { e.stopPropagation(); Promise.resolve(personalization.removeWord(lang, rm.dataset.word)).then(render); return; }
      // "Mine ord" summary: mirror the native <details> toggle into our
      // preserved flag so a later re-render keeps the same open/closed state.
      // Don't preventDefault (let the browser toggle) and don't render here.
      const dictSummary = closest('.lh-library-dict-summary');
      if (dictSummary) { ownWordsOpen = !ownWordsOpen; return; }
      const row = closest('.lh-library-row');
      if (row && openLesson) { openLesson(row.dataset.rule); }
    }

    container.addEventListener('click', onClick);
    const unsub = personalization.onChange(render);
    render();
    return { destroy() { container.removeEventListener('click', onClick); unsub(); } };
  }

  const host = typeof self !== 'undefined' ? self : globalThis;
  host.mountLibraryView = mountLibraryView;
  if (typeof module !== 'undefined' && module.exports) module.exports = { mountLibraryView };
})();
