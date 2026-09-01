(function () {
  'use strict';
  // Shared flag picker. deps: { languages:[code], current, flags:{code:emoji},
  // labels:{code:name}, onPick(code) }. No chrome.* — popup-deps gate safe.
  function mountLanguagePicker(container, deps) {
    if (!container) throw new Error('mountLanguagePicker: container required');
    // foreignChoices + onChooseForeignLang (optional): under the "one foreign
    // language at a time" model, `languages` already holds the single chosen FL
    // + non-FL languages; foreignChoices is the full FL set, so the open list can
    // offer a "Bytt fremmedspråk" sub-section to switch which FL is the student's.
    // Absent → today's behavior (a plain flat list).
    const { languages, flags = {}, labels = {}, onPick, foreignChoices = [], onChooseForeignLang } = deps;
    let current = deps.current;
    let open = false;
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    function render() {
      const list = languages.map(code =>
        `<button type="button" class="lh-langpick-option${code === current ? ' active' : ''}" data-lang="${esc(code)}">
          <span class="lh-langpick-flag">${flags[code] || ''}</span>${esc(labels[code] || code)}
        </button>`).join('');
      // Offer the FLs that aren't the currently-shown one as "change my FL" picks.
      const otherFLs = (onChooseForeignLang && Array.isArray(foreignChoices))
        ? foreignChoices.filter(c => !languages.includes(c)) : [];
      const flSection = otherFLs.length ? `<div class="lh-langpick-flsub">
        <div class="lh-langpick-flsub-label">Bytt fremmedspråk</div>
        ${otherFLs.map(code => `<button type="button" class="lh-langpick-fl-option" data-flpick="${esc(code)}">
          <span class="lh-langpick-flag">${flags[code] || ''}</span>${esc(labels[code] || code)}
        </button>`).join('')}
      </div>` : '';
      container.innerHTML = `<div class="lh-langpick">
        <button type="button" class="lh-langpick-current" aria-expanded="${open}">
          <span class="lh-langpick-flag">${flags[current] || ''}</span>
          <span class="lh-langpick-caret">▾</span>
        </button>
        <div class="lh-langpick-list"${open ? '' : ' hidden'}>${list}${flSection}</div>
      </div>`;
    }

    function onClick(e) {
      const cur = e.target.closest && e.target.closest('.lh-langpick-current');
      if (cur) { open = !open; render(); return; }
      const flOpt = e.target.closest && e.target.closest('.lh-langpick-fl-option');
      if (flOpt) {
        const code = flOpt.dataset.flpick;
        open = false;
        if (onChooseForeignLang) onChooseForeignLang(code);
        render();
        return;
      }
      const opt = e.target.closest && e.target.closest('.lh-langpick-option');
      if (opt) {
        const lang = opt.dataset.lang;
        open = false;
        if (lang !== current) { current = lang; if (onPick) onPick(lang); }
        render();
      }
    }

    container.addEventListener('click', onClick);
    render();
    return {
      setCurrent(code) { current = code; render(); },
      destroy() { container.removeEventListener('click', onClick); container.innerHTML = ''; },
    };
  }

  const host = typeof self !== 'undefined' ? self : globalThis;
  host.mountLanguagePicker = mountLanguagePicker;
  if (typeof module !== 'undefined' && module.exports) module.exports = { mountLanguagePicker };
})();
