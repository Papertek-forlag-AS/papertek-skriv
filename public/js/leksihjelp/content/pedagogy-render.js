(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;

  // Phase 50-07: shared pedagogy-panel renderer.
  // Extracted from spell-check-renderer.js so the Lær mer library view
  // can reuse it without depending on the renderer IIFE's closure.
  //
  // deps shape:
  //   { t, escapeHtml, escapeAttr, sanitize, wechselAlwaysWarn }
  //   - t(key) → translated string
  //   - escapeHtml(s) → HTML-escaped string
  //   - escapeAttr(s) → attribute-safe string
  //   - sanitize(html) → allow-listed HTML passthrough (maps to sanitizeWarning)
  //   - wechselAlwaysWarn → boolean for the de-wechselpraep checkbox state

  function renderPedagogyPanelHtml(pedagogy, uiLang, ruleId, deps) {
    const { t, escapeHtml, escapeAttr, sanitize, wechselAlwaysWarn } = deps;
    if (!pedagogy) return '';
    const pick = (obj) => {
      if (!obj) return '';
      return (typeof obj[uiLang] === 'string' && obj[uiLang]) ||
             (typeof obj.nb === 'string' && obj.nb) ||
             (typeof obj.en === 'string' && obj.en) || '';
    };

    // Build content into logical pages
    const page1 = []; // Explanation + visual
    const page2 = []; // Examples
    const page3 = []; // Extra + wechsel + colloquial

    // --- Page 1: Explanation ---

    // Case badge (only for morphological rules)
    if (pedagogy.case) {
      const caseKey = pedagogy.case;
      const badgeLabel = t('case_label_' + caseKey) || caseKey.toUpperCase();
      page1.push(`<div class="lh-spell-pedagogy-header">
        <span class="lh-spell-pedagogy-case-badge lh-spell-pedagogy-case-badge--${escapeAttr(caseKey)}">${escapeHtml(badgeLabel)}</span>`);
      if (pedagogy.contraction && pedagogy.contraction.from && pedagogy.contraction.article) {
        page1.push(`<span class="lh-spell-pedagogy-contraction">= ${escapeHtml(pedagogy.contraction.from)} + ${escapeHtml(pedagogy.contraction.article)}</span>`);
      }
      page1.push(`</div>`);
    }

    const summary = pick(pedagogy.summary);
    if (summary) page1.push(`<p class="lh-spell-pedagogy-summary">${sanitize(summary)}</p>`);
    const explanation = pick(pedagogy.explanation);
    if (explanation) page1.push(`<p class="lh-spell-pedagogy-explanation">${sanitize(explanation)}</p>`);
    const noteMain = pick(pedagogy.note);
    if (noteMain) page1.push(`<p class="lh-spell-pedagogy-explanation">${sanitize(noteMain)}</p>`);

    if (pedagogy.visual && pedagogy.visual.svg) {
      const caption = pick(pedagogy.visual.caption);
      page1.push(`<div class="lh-spell-pedagogy-visual">
        <div class="lh-spell-pedagogy-svg-wrapper">${sanitize(pedagogy.visual.svg)}</div>
        ${caption ? `<div class="lh-spell-pedagogy-visual-caption">${sanitize(caption)}</div>` : ''}
      </div>`);
    }

    // --- Page 2: Examples ---

    const examples = Array.isArray(pedagogy.examples) ? pedagogy.examples : [];
    for (const ex of examples) {
      if (!ex) continue;
      const xlate = pick(ex.translation);
      const note = pick(ex.note);
      page2.push(`<div class="lh-spell-pedagogy-example">`);
      if (ex.correct) {
        page2.push(`<div class="lh-spell-pedagogy-example-correct">✓ <strong>${sanitize(ex.correct)}</strong></div>`);
      }
      if (ex.incorrect) {
        page2.push(`<div class="lh-spell-pedagogy-example-incorrect">✗ ${sanitize(ex.incorrect)}</div>`);
      }
      if (xlate) {
        page2.push(`<div class="lh-spell-pedagogy-example-translation">${sanitize(xlate)}</div>`);
      }
      if (note) {
        page2.push(`<div class="lh-spell-pedagogy-example-note"><em>${sanitize(note)}</em></div>`);
      }
      page2.push(`</div>`);
    }

    // --- Page 3: Extra + wechsel + colloquial ---

    const extra = pick(pedagogy.extra);
    if (extra) {
      page3.push(`<div class="lh-spell-pedagogy-extra">${sanitize(extra)}</div>`);
    }

    // nb-anglicism: link to the browsable full anglicism list (the anglicismbank).
    if (ruleId === 'nb-anglicism') {
      const label = t('anglicism_view_all');
      page3.push(`<div class="lh-anglicism-viewer-cta"><button type="button" class="lh-anglicism-viewer-btn">${escapeHtml(label)}</button></div>`);
    }

    // en-false-friend / de-false-friends: link to the browsable full false-friends
    // list (the active language's falsefriendsbank, surfaced via the seam).
    if (ruleId === 'en-false-friend' || ruleId === 'de-false-friends') {
      const label = t('falsefriend_view_all');
      page3.push(`<div class="lh-falsefriend-viewer-cta"><button type="button" class="lh-falsefriend-viewer-btn">${escapeHtml(label)}</button></div>`);
    }

    if (pedagogy.case === 'wechsel' && pedagogy.wechsel_pair) {
      const wp = pedagogy.wechsel_pair;
      const renderSide = (side, cls, labelKey, glyph) => {
        if (!side) return '';
        const t1 = pick(side.translation);
        const n1 = pick(side.note);
        const out = [];
        out.push(`<div class="${cls}">`);
        out.push(`<div class="lh-spell-pedagogy-wechsel-label">${glyph} ${escapeHtml(t(labelKey))}</div>`);
        if (side.sentence) out.push(`<div class="lh-spell-pedagogy-wechsel-sentence">${escapeHtml(side.sentence)}</div>`);
        if (t1) out.push(`<div class="lh-spell-pedagogy-example-translation">${sanitize(t1)}</div>`);
        if (n1) out.push(`<div class="lh-spell-pedagogy-example-note"><em>${sanitize(n1)}</em></div>`);
        out.push(`</div>`);
        return out.join('');
      };
      page3.push(`<div class="lh-spell-pedagogy-wechsel">`);
      page3.push(renderSide(wp.motion,   'lh-spell-pedagogy-wechsel-motion',   'wechsel_motion_label',   '→'));
      page3.push(renderSide(wp.location, 'lh-spell-pedagogy-wechsel-location', 'wechsel_location_label', '●'));
      page3.push(`</div>`);
    }

    const colloq = pick(pedagogy.colloquial_note);
    if (colloq) {
      page3.push(`<aside class="lh-spell-pedagogy-colloquial">${escapeHtml(t('colloquial_aside_prefix'))}<em>${escapeHtml(colloq)}</em></aside>`);
    }

    // de-wechselpraep: in-popover opt-in toggle for the Layer-2 "always warn"
    // self-check. Checked state reads the live module flag; the change is
    // written to chrome.storage by the pages click delegation, and onChanged
    // re-runs the check so hints appear/disappear immediately.
    if (ruleId === 'de-wechselpraep') {
      const lbl = t('wechsel_always_warn_label') || 'Varsle meg alltid ved wechselpreposisjoner';
      page3.push(`<label class="lh-spell-pedagogy-toggle"><input type="checkbox" class="lh-spell-wechsel-toggle"${wechselAlwaysWarn ? ' checked' : ''}> ${escapeHtml(lbl)}</label>`);
    }

    // Collect non-empty pages
    const pages = [page1, page2, page3].filter(p => p.length > 0);

    // Single page or empty — add expand/speak buttons but no prev/next
    if (pages.length <= 1) {
      const content = pages.map(p => p.join('')).join('');
      const toolsHtml = `<div class="lh-spell-pedagogy-nav lh-spell-pedagogy-nav--tools-only">
        <span class="lh-spell-pedagogy-nav-spacer"></span>
        <button type="button" class="lh-spell-pedagogy-speak" title="${t('pedagogy_speak_title') || 'Les høyt'}">&#x1F50A;</button>
        <button type="button" class="lh-spell-pedagogy-expand" title="${t('pedagogy_expand_title') || 'Forstørr'}">&#x2922;</button>
      </div>`;
      return `<div class="lh-spell-pedagogy-pages" data-current="0" data-total="1">${content}${toolsHtml}</div>`;
    }

    // Multi-page: wrap in slideshow
    const pageLabels = [t('pedagogy_page_explain') || 'Forklaring', t('pedagogy_page_examples') || 'Eksempler', t('pedagogy_page_extra') || 'Mer'];
    const allPages = [page1, page2, page3];
    let pageIdx = 0;
    const pageHtml = [];
    for (let i = 0; i < allPages.length; i++) {
      if (allPages[i].length === 0) continue;
      const hidden = pageIdx > 0 ? ' hidden' : '';
      pageHtml.push(`<div class="lh-spell-pedagogy-page" data-page-idx="${pageIdx}"${hidden}>${allPages[i].join('')}</div>`);
      pageIdx++;
    }

    const navHtml = `<div class="lh-spell-pedagogy-nav">
      <button type="button" class="lh-spell-pedagogy-prev" disabled>&larr;</button>
      <span class="lh-spell-pedagogy-indicator">1 / ${pages.length}</span>
      <button type="button" class="lh-spell-pedagogy-next">&rarr;</button>
      <span class="lh-spell-pedagogy-nav-spacer"></span>
      <button type="button" class="lh-spell-pedagogy-speak" title="${t('pedagogy_speak_title') || 'Les høyt'}">&#x1F50A;</button>
      <button type="button" class="lh-spell-pedagogy-expand" title="${t('pedagogy_expand_title') || 'Forstørr'}">&#x2922;</button>
    </div>`;

    return `<div class="lh-spell-pedagogy-pages" data-current="0" data-total="${pages.length}">${navHtml}${pageHtml.join('')}</div>`;
  }

  // ── Browsable anglicism viewer ───────────────────────────────────────────
  // Opened from the "Se hele lista →" button in the nb-anglicism lesson. Reads
  // the full list from the seam (self.__lexiVocab.getAnglicismList()) and renders
  // a self-contained modal (inline styles so it works in popup, playground, and
  // the lockdown host without depending on any stylesheet). Wired once via a
  // delegated document click listener so every lesson surface gets it for free.
  const CAT_LABEL = { verb: 'Verb', noun: 'Substantiv', adjective: 'Adjektiv', expression: 'Uttrykk', ord: 'Andre ord' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  // Shared dismiss wiring for the browsable viewers (anglicism + false-friend):
  // ✕ button, backdrop click, and Escape each tear down BOTH the overlay and the
  // document keydown listener. Previously only the Escape path removed the
  // listener, so closing via ✕/backdrop left a dormant keydown handler behind
  // each time the viewer was opened and closed.
  function wireViewerDismiss(back, closeBtn) {
    const onKey = (e) => { if (e.key === 'Escape') dismiss(); };
    function dismiss() { back.remove(); document.removeEventListener('keydown', onKey); }
    if (closeBtn) closeBtn.addEventListener('click', dismiss);
    back.addEventListener('click', (e) => { if (e.target === back) dismiss(); });
    document.addEventListener('keydown', onKey);
  }

  function openAnglicismViewer() {
    if (typeof document === 'undefined') return;
    let list = [];
    try { const v = self.__lexiVocab; if (v && typeof v.getAnglicismList === 'function') list = v.getAnglicismList() || []; } catch (_) {}
    const old = document.getElementById('lh-anglicism-viewer'); if (old) old.remove();

    const back = document.createElement('div');
    back.id = 'lh-anglicism-viewer';
    back.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:2147483647;';
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;max-width:640px;width:92%;max-height:84vh;display:flex;flex-direction:column;box-shadow:0 16px 50px rgba(0,0,0,.3);overflow:hidden;font-family:system-ui,-apple-system,sans-serif;';
    const head = document.createElement('div');
    head.style.cssText = 'padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;';
    head.innerHTML = '<div><div style="font-size:18px;font-weight:700;color:#0f172a;">Vanlige anglisismer</div><div style="font-size:13px;color:#64748b;">Engelske lånord og norske alternativer (' + list.length + ')</div></div>';
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = '✕';
    close.style.cssText = 'border:none;background:none;font-size:20px;color:#64748b;cursor:pointer;padding:4px 8px;';
    head.appendChild(close);
    card.appendChild(head);

    const body = document.createElement('div');
    body.style.cssText = 'padding:8px 0;overflow-y:auto;';
    const groups = {};
    for (const it of list) { (groups[it.category] = groups[it.category] || []).push(it); }
    const order = ['verb', 'noun', 'adjective', 'expression', 'ord'];
    const cats = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
    if (!list.length) {
      body.innerHTML = '<div style="padding:24px;color:#64748b;text-align:center;">Lista er ikke lastet ennå.</div>';
    } else {
      let html = '';
      for (const cat of cats) {
        html += '<div style="padding:10px 20px 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#11B49A;">' + esc(CAT_LABEL[cat] || cat) + '</div>';
        for (const it of groups[cat]) {
          html += '<div style="padding:8px 20px;border-bottom:1px solid #f1f5f9;">'
            + '<div style="font-size:15px;"><span style="color:#c0392b;text-decoration:line-through;">' + esc(it.word) + '</span> <span style="color:#94a3b8;">→</span> <strong style="color:#0f172a;">' + esc(it.alt) + '</strong></div>'
            + (it.example ? '<div style="font-size:13px;color:#64748b;font-style:italic;margin-top:2px;">' + esc(it.example) + '</div>' : '')
            + '</div>';
        }
      }
      body.innerHTML = html;
    }
    card.appendChild(body);
    const foot = document.createElement('div');
    foot.style.cssText = 'padding:10px 20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;';
    foot.textContent = 'Anglisismer er bare tips — du velger selv.';
    card.appendChild(foot);
    back.appendChild(card);
    wireViewerDismiss(back, close);
    document.body.appendChild(back);
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !host.__lexiAnglicismViewerWired) {
    host.__lexiAnglicismViewerWired = true;
    document.addEventListener('click', (e) => {
      const t = e.target && e.target.closest && e.target.closest('.lh-anglicism-viewer-btn');
      if (t) { e.preventDefault(); e.stopPropagation(); openAnglicismViewer(); }
    }, true);
  }

  // ── Browsable false-friends viewer ───────────────────────────────────────
  // Opened from the "Se hele lista →" button in the en-false-friend lesson.
  // Reads the full list from the seam (self.__lexiVocab.getFalseFriendsList())
  // and renders a self-contained modal (inline styles so it works in popup,
  // playground, and the lockdown host without depending on any stylesheet).
  // Mirrors openAnglicismViewer end-to-end. Wired once via a delegated
  // document click listener so every lesson surface gets it for free.
  const FF_CAT_LABEL = { verb: 'Verb', noun: 'Substantiv', adjective: 'Adjektiv', expression: 'Uttrykk', ord: 'Andre ord' };

  function ffT(key, fallback) {
    try {
      const i18n = self.__lexiI18n;
      if (i18n && typeof i18n.t === 'function') {
        const v = i18n.t(key);
        if (v && v !== key) return v;
      }
    } catch (_) {}
    return fallback;
  }

  function openFalseFriendViewer() {
    if (typeof document === 'undefined') return;
    let list = [];
    try { const v = self.__lexiVocab; if (v && typeof v.getFalseFriendsList === 'function') list = v.getFalseFriendsList() || []; } catch (_) {}
    let ffLang = 'en';
    try { const v = self.__lexiVocab; if (v && typeof v.getLanguage === 'function') ffLang = v.getLanguage() || 'en'; } catch (_) {}
    const old = document.getElementById('lh-falsefriend-viewer'); if (old) old.remove();

    const back = document.createElement('div');
    back.id = 'lh-falsefriend-viewer';
    back.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.5);display:flex;align-items:center;justify-content:center;z-index:2147483647;';
    const card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:14px;max-width:640px;width:92%;max-height:84vh;display:flex;flex-direction:column;box-shadow:0 16px 50px rgba(0,0,0,.3);overflow:hidden;font-family:system-ui,-apple-system,sans-serif;';
    const head = document.createElement('div');
    head.style.cssText = 'padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;';
    head.innerHTML = '<div><div style="font-size:18px;font-weight:700;color:#0f172a;">' + esc(ffT('falsefriend_modal_title', 'Falske venner')) + '</div><div style="font-size:13px;color:#64748b;">' + esc(ffT(ffLang === 'de' ? 'falsefriend_modal_subtitle_de' : 'falsefriend_modal_subtitle', ffLang === 'de' ? 'Tyske ord som ligner norske, men betyr noe annet' : 'Engelske ord som ligner norske, men betyr noe annet')) + ' (' + list.length + ')</div></div>';
    const close = document.createElement('button');
    close.type = 'button'; close.textContent = '✕';
    close.style.cssText = 'border:none;background:none;font-size:20px;color:#64748b;cursor:pointer;padding:4px 8px;';
    head.appendChild(close);
    card.appendChild(head);

    const body = document.createElement('div');
    body.style.cssText = 'padding:8px 0;overflow-y:auto;';
    const meansLbl = esc(ffT('falsefriend_col_means', 'betyr på engelsk'));
    const confusedLbl = esc(ffT('falsefriend_col_confused', 'forveksles med (norsk)'));
    const suggestionLbl = esc(ffT('falsefriend_col_suggestion', 'mente du kanskje'));
    if (!list.length) {
      body.innerHTML = '<div style="padding:24px;color:#64748b;text-align:center;">' + esc(ffT('falsefriend_modal_empty', 'Lista er ikke lastet ennå.')) + '</div>';
    } else {
      // Group by category (like the anglicism viewer), entries sorted alphabetically by word.
      const groups = {};
      for (const it of list) { (groups[it.category || 'ord'] = groups[it.category || 'ord'] || []).push(it); }
      const order = ['verb', 'noun', 'adjective', 'expression', 'ord'];
      const cats = Object.keys(groups).sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));
      let html = '';
      for (const cat of cats) {
        const entries = groups[cat].slice().sort((a, b) => String(a.word || '').localeCompare(String(b.word || '')));
        html += '<div style="padding:10px 20px 4px;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#11B49A;">' + esc(FF_CAT_LABEL[cat] || cat) + '</div>';
        for (const it of entries) {
          const ex = Array.isArray(it.examples) && it.examples[0] ? it.examples[0] : null;
          html += '<div style="padding:10px 20px;border-bottom:1px solid #f1f5f9;">'
            + '<div style="font-size:15px;"><strong style="color:#0f172a;">' + esc(it.word) + '</strong>'
            + (it.enMeaning ? ' <span style="color:#94a3b8;">' + meansLbl + ':</span> <span style="color:#334155;">' + esc(it.enMeaning) + '</span>' : '')
            + '</div>'
            + (it.nbWord ? '<div style="font-size:13px;color:#64748b;margin-top:3px;">' + confusedLbl + ': <span style="color:#c0392b;">' + esc(it.nbWord) + '</span></div>' : '')
            + (it.suggestion ? '<div style="font-size:13px;color:#64748b;margin-top:1px;">' + suggestionLbl + ': <strong style="color:#11B49A;">' + esc(it.suggestion) + '</strong></div>' : '')
            + (ex ? '<div style="font-size:13px;color:#64748b;font-style:italic;margin-top:4px;">' + esc(ex.sentence) + (ex.translation ? ' <span style="color:#94a3b8;">— ' + esc(ex.translation) + '</span>' : '') + '</div>' : '')
            + '</div>';
        }
      }
      body.innerHTML = html;
    }
    card.appendChild(body);
    const foot = document.createElement('div');
    foot.style.cssText = 'padding:10px 20px;border-top:1px solid #e2e8f0;font-size:12px;color:#94a3b8;';
    foot.textContent = ffT('falsefriend_modal_footer', 'Falske venner er bare tips — du velger selv.');
    card.appendChild(foot);
    back.appendChild(card);
    wireViewerDismiss(back, close);
    document.body.appendChild(back);
  }

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function' && !host.__lexiFalseFriendViewerWired) {
    host.__lexiFalseFriendViewerWired = true;
    document.addEventListener('click', (e) => {
      const t = e.target && e.target.closest && e.target.closest('.lh-falsefriend-viewer-btn');
      if (t) { e.preventDefault(); e.stopPropagation(); openFalseFriendViewer(); }
    }, true);
  }

  host.__lexiPedagogyRender = { renderPedagogyPanelHtml, openAnglicismViewer, openFalseFriendViewer };
  if (typeof module !== 'undefined' && module.exports) module.exports = { renderPedagogyPanelHtml, openAnglicismViewer, openFalseFriendViewer };
})();
