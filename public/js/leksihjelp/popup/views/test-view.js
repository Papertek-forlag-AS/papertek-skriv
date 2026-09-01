/**
 * Leksihjelp — Test View Module
 *
 * Paste-text spell-check test surface. Independent of skriv / lockdown / live
 * pages — runs the same rule pipeline used in production directly against
 * pasted text and renders findings inline. Useful for benchmark runs and bug
 * triage without environment-specific shims muddying the signal.
 *
 * @typedef {Object} TestViewDeps
 * @property {Function} runCheck      - async (text, lang) => { findings, validWordsSize, error? }
 * @property {Function} explainOf     - (rule_id, finding) => { nb, nn } | null
 * @property {Function} showView      - (name) => void  (back-button routing)
 * @property {Function} [isRuleExamSafe] - (rule_id) => bool. When provided AND
 *   exam mode is active, findings whose rule_id maps to exam.safe=false are
 *   filtered out of the rendered list. Omit (or pass undefined) to render the
 *   full unfiltered finding set — useful for benchmark/debug surfaces where
 *   the test view is shown outside exam-mode scope.
 *
 * @returns {{ destroy(): void }}
 */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    })[c]);
  }

  function mountTestView(container, deps) {
    if (!container) throw new Error('mountTestView: container required');
    if (!deps) throw new Error('mountTestView: deps required');

    const { runCheck, explainOf, showView, isRuleExamSafe } = deps;

    container.innerHTML = `
      <div class="settings-back">
        <button id="test-back-btn" class="text-btn">← Tilbake</button>
      </div>
      <div class="test-view-header glass">
        <h3>Test rettskriving</h3>
        <p class="settings-note">Lim inn tekst og kjør rettskriving direkte mot innebygde regler — uavhengig av nettsiden du er på.</p>
        <div class="test-controls">
          <label class="test-lang-label">
            Språk
            <select id="test-lang">
              <option value="nb">Bokmål</option>
              <option value="nn">Nynorsk</option>
              <option value="en">English</option>
              <option value="de">Tysk</option>
              <option value="es">Spansk</option>
              <option value="fr">Fransk</option>
            </select>
          </label>
          <textarea id="test-text" rows="8" placeholder="Lim inn benchmark-tekst eller test-setninger her…"></textarea>
          <label class="test-exam-label">
            <input type="checkbox" id="test-exam">
            Eksamenmodus (kun nettleser-likt — typo + grunnleggende grammatikk)
          </label>
          <div class="test-actions">
            <button id="test-run" class="primary-btn">Sjekk</button>
            <button id="test-clear" class="text-btn">Tøm</button>
            <button id="test-copy" class="text-btn" disabled>Kopier funn (JSON)</button>
          </div>
          <p id="test-status" class="test-status"></p>
        </div>
      </div>
      <div id="test-findings" class="test-findings"></div>
    `;

    const langSel = container.querySelector('#test-lang');
    const textArea = container.querySelector('#test-text');
    const examChk = container.querySelector('#test-exam');
    const runBtn = container.querySelector('#test-run');
    const clearBtn = container.querySelector('#test-clear');
    const copyBtn = container.querySelector('#test-copy');
    const statusEl = container.querySelector('#test-status');
    const findingsEl = container.querySelector('#test-findings');
    const backBtn = container.querySelector('#test-back-btn');

    let lastFindings = [];
    let lastText = '';
    let lastValidWordsSize = 0;

    function applyExamFilter(findings) {
      if (!examChk.checked) return findings;
      if (typeof isRuleExamSafe !== 'function') return findings;
      return findings.filter(f => isRuleExamSafe(f.rule_id));
    }

    function renderFindings(findings, text) {
      if (!findings.length) {
        findingsEl.innerHTML = '<p class="test-empty">Ingen funn.</p>';
        return;
      }
      const sorted = [...findings].sort((a, b) => a.start - b.start);
      const html = sorted.map(f => {
        let explainHtml = '';
        try {
          const e = explainOf(f.rule_id, f);
          if (e && e.nb) explainHtml = e.nb;
        } catch (_) { /* swallow per-rule explain errors */ }
        const ctxStart = Math.max(0, f.start - 16);
        const ctxEnd = Math.min(text.length, f.end + 16);
        const before = text.slice(ctxStart, f.start);
        const span = text.slice(f.start, f.end);
        const after = text.slice(f.end, ctxEnd);
        const suggestionsExtra = (f.suggestions && f.suggestions.length > 1)
          ? ` <small class="test-finding-extra">+${f.suggestions.length - 1} til</small>`
          : '';
        return `
          <div class="test-finding">
            <div class="test-finding-head">
              <span class="test-finding-rule">${escapeHtml(f.rule_id)}</span>
              <span class="test-finding-pos">${f.start}–${f.end} · p${f.priority ?? '?'}</span>
            </div>
            <div class="test-finding-fix">
              <code class="test-finding-orig">${escapeHtml(f.original ?? span)}</code>
              <span class="test-finding-arrow">→</span>
              <code class="test-finding-new">${escapeHtml(f.fix ?? '—')}</code>
              ${suggestionsExtra}
            </div>
            <div class="test-finding-ctx">
              …${escapeHtml(before)}<mark>${escapeHtml(span)}</mark>${escapeHtml(after)}…
            </div>
            ${explainHtml ? `<div class="test-finding-explain">${explainHtml}</div>` : ''}
          </div>
        `;
      }).join('');
      findingsEl.innerHTML = html;
    }

    runBtn.addEventListener('click', async () => {
      const text = textArea.value;
      if (!text.trim()) {
        statusEl.textContent = 'Skriv eller lim inn tekst først.';
        return;
      }
      runBtn.disabled = true;
      statusEl.textContent = 'Laster regler og bygger ordliste…';
      findingsEl.innerHTML = '';
      copyBtn.disabled = true;
      try {
        const lang = langSel.value;
        const t0 = performance.now();
        const result = await runCheck(text, lang);
        const ms = Math.round(performance.now() - t0);
        if (result.error) {
          statusEl.textContent = 'Feil: ' + result.error;
          return;
        }
        lastFindings = result.findings || [];
        lastText = text;
        lastValidWordsSize = result.validWordsSize;
        const filtered = applyExamFilter(lastFindings);
        renderFindings(filtered, text);
        const examTag = examChk.checked ? ` · eksamenmodus (${filtered.length}/${lastFindings.length})` : '';
        statusEl.textContent = `${filtered.length} funn · validWords ${result.validWordsSize} · ${ms} ms · ${lang}${examTag}`;
        copyBtn.disabled = filtered.length === 0;
      } catch (e) {
        statusEl.textContent = 'Feil: ' + (e && e.message ? e.message : String(e));
      } finally {
        runBtn.disabled = false;
      }
    });

    clearBtn.addEventListener('click', () => {
      textArea.value = '';
      findingsEl.innerHTML = '';
      statusEl.textContent = '';
      lastFindings = [];
      lastText = '';
      copyBtn.disabled = true;
      textArea.focus();
    });

    examChk.addEventListener('change', () => {
      if (!lastFindings.length) return;
      const filtered = applyExamFilter(lastFindings);
      renderFindings(filtered, lastText);
      const examTag = examChk.checked ? ` · eksamenmodus (${filtered.length}/${lastFindings.length})` : '';
      statusEl.textContent = `${filtered.length} funn · validWords ${lastValidWordsSize} · ${langSel.value}${examTag}`;
      copyBtn.disabled = filtered.length === 0;
    });

    copyBtn.addEventListener('click', async () => {
      const set = applyExamFilter(lastFindings);
      const slim = set.map(f => ({
        rule_id: f.rule_id,
        priority: f.priority,
        start: f.start,
        end: f.end,
        original: f.original,
        fix: f.fix,
        suggestions: f.suggestions,
        message: f.message,
      }));
      const json = JSON.stringify(slim, null, 2);
      try {
        await navigator.clipboard.writeText(json);
        copyBtn.textContent = 'Kopiert ✓';
        setTimeout(() => { copyBtn.textContent = 'Kopier funn (JSON)'; }, 1500);
      } catch (_) {
        statusEl.textContent = 'Kunne ikke kopiere — sjekk konsollen.';
        console.log(json);
      }
    });

    backBtn.addEventListener('click', () => {
      if (typeof showView === 'function') showView('dictionary');
    });

    return {
      destroy() {
        container.innerHTML = '';
      },
    };
  }

  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiTestView = { mount: mountTestView };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mount: mountTestView, mountTestView };
  }
})();
