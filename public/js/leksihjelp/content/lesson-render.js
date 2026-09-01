(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;

  // Full lesson HTML. deps: { pedagogy, uiLang, id, t, personalizationEnabled,
  // known, learning, locked, escapeHtml?, escapeAttr?, sanitize? }. No chrome.*.
  function renderLessonHtml(deps) {
    const { pedagogy, uiLang, id, t, personalizationEnabled, known, learning, locked } = deps;
    const esc = deps.escapeHtml || ((s) => String(s == null ? '' : s));
    const panel = host.__lexiPedagogyRender.renderPedagogyPanelHtml(pedagogy, uiLang, id, {
      t, escapeHtml: esc, escapeAttr: deps.escapeAttr || esc, sanitize: deps.sanitize || esc,
    });
    const btn = (action, label, extraCls) =>
      `<button type="button" class="lh-lesson-mark${extraCls ? ' ' + extraCls : ''}" data-action="${action}">${esc(label)}</button>`;
    let action;
    if (locked) {
      action = `<p class="lh-lesson-locked-note">${esc(t('lesson_locked_note'))}</p>`;
    } else if (!personalizationEnabled) {
      action = '';
    } else if (known) {
      action = btn('demote', t('personal_demote'));                                   // → læringsbunken
    } else if (learning) {
      action = `<p class="lh-lesson-learning-note">${esc(t('personal_learning_note'))}</p>`
        + btn('mark', t('personal_mark_known'));                                       // → mastered
    } else {
      action = btn('learn', t('personal_mark_learning'), 'lh-lesson-learn')            // → læringsbunken
        + btn('mark', t('personal_mark_known'));                                       // → mastered
    }
    return `<div class="lh-lesson" data-rule="${esc(id)}">
      <header class="lh-lesson-head"><h2 class="lh-lesson-title">${esc(id)}</h2></header>
      <div class="lh-lesson-body">${panel}</div>
      <footer class="lh-lesson-foot">${action}</footer>
    </div>`;
  }

  // Wire the lesson footer's mark/learn/demote buttons over a personalization
  // store. Plays a brief click-flash for feedback, then runs the store op and
  // calls onDone (the host closes the modal or repaints the pop-out). The
  // library view animates its own row independently via its onChange diff.
  // deps: { store, lang, id, onDone }.
  function wireLessonMark(rootEl, deps) {
    const { store, lang, id, onDone } = deps;
    const ACTIONS = { mark: 'markKnown', learn: 'markLearning', demote: 'markLearning' };
    rootEl.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.lh-lesson-mark');
      if (!btn) return;
      const fn = ACTIONS[btn.dataset.action];
      if (!fn || !store[fn]) return;
      btn.classList.add('lh-lesson-mark--flash');
      Promise.resolve(store[fn](lang, id)).then(() => {
        setTimeout(() => { if (onDone) onDone(); }, 300);
      });
    });
  }

  // Wire pagination + speak inside a rendered lesson root. deps: { speak(text) }.
  // Own small wiring — independent of the popover's wirePedagogyNav.
  function wireLessonControls(rootEl, deps) {
    const speak = deps && deps.speak;
    rootEl.addEventListener('click', (e) => {
      const pages = rootEl.querySelector('.lh-spell-pedagogy-pages');
      const nav = e.target.closest && e.target.closest('.lh-spell-pedagogy-prev, .lh-spell-pedagogy-next');
      if (nav && pages) {
        const cur = parseInt(pages.getAttribute('data-current') || '0', 10);
        const total = parseInt(pages.getAttribute('data-total') || '1', 10);
        const next = nav.classList.contains('lh-spell-pedagogy-next') ? cur + 1 : cur - 1;
        if (next < 0 || next >= total) return;
        pages.setAttribute('data-current', String(next));
        [...pages.querySelectorAll('.lh-spell-pedagogy-page')].forEach((p, i) => { p.hidden = i !== next; });
        const prevB = pages.querySelector('.lh-spell-pedagogy-prev');
        const nextB = pages.querySelector('.lh-spell-pedagogy-next');
        if (prevB) prevB.disabled = next === 0;
        if (nextB) nextB.disabled = next === total - 1;
        const ind = pages.querySelector('.lh-spell-pedagogy-indicator');
        if (ind) ind.textContent = (next + 1) + ' / ' + total;
        return;
      }
      const sp = e.target.closest && e.target.closest('.lh-spell-pedagogy-speak');
      if (sp && speak) {
        // Single-page lessons aren't wrapped in .lh-spell-pedagogy-page, so fall
        // back to the pages container (mirrors the popover's visiblePage || pagesEl).
        const page = (pages && pages.querySelector('.lh-spell-pedagogy-page:not([hidden])')) || pages;
        speak((page && page.textContent || '').trim());
      }
    });
  }

  host.__lexiLessonRender = { renderLessonHtml, wireLessonControls, wireLessonMark };
  if (typeof module !== 'undefined' && module.exports) module.exports = { renderLessonHtml, wireLessonControls, wireLessonMark };
})();
