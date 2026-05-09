/**
 * grammar-features-section.js — minimal grammar-features renderer
 * (Phase 30-04 Task 5, scoped down from full popup.js extraction)
 *
 * Mountable function for downstream embedders (lockdown sidepanel host today,
 * skriveokt-zero in the future) that need to expose grammar-feature toggles
 * without inheriting popup.js's full preset+customize-toggle UI.
 *
 * The extension popup itself does NOT yet use this module — it keeps its
 * richer popup/popup.js renderer with preset pills and per-language
 * collapse/expand behavior. Sharing those between popup.js and downstream
 * is deferred (significant refactor with regression risk in the popup).
 *
 * What this module renders:
 *  - One section per category (verbs / nouns / adjectives / etc.)
 *  - One checkbox per feature inside each category
 *  - Persists to chrome.storage.local.enabledGrammarFeatures (same key as popup)
 *  - Broadcasts GRAMMAR_FEATURES_CHANGED via deps.runtime.sendMessage so
 *    spell-check and word-prediction pick up the new state
 *
 * Usage:
 *   host.__lexiGrammarFeaturesSection.mount(containerEl, {
 *     storage,                 // { get(key), set(obj) }
 *     runtime,                 // { sendMessage(msg) }
 *     loadGrammarFeatures,     // async (lang) => grammarFeatures shape
 *     getCurrentLanguage,      // () => 'nb' | 'nn' | 'en' | ...
 *   });
 *
 * Returns { destroy(), refresh(lang) }.
 */
(function () {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  async function readEnabledFeatures(storage) {
    const stored = await storage.get('enabledGrammarFeatures');
    if (!stored || typeof stored !== 'object') return new Set();
    // popup.js stores either a Set-shaped object (with keys as feature ids → true)
    // or an array. Accept both.
    if (Array.isArray(stored)) return new Set(stored);
    return new Set(Object.keys(stored).filter(k => stored[k] === true || stored[k] === 1));
  }

  async function writeEnabledFeatures(storage, enabled) {
    const obj = {};
    for (const id of enabled) obj[id] = true;
    await storage.set({ enabledGrammarFeatures: obj });
  }

  function mountGrammarFeaturesSection(container, deps) {
    if (!container) throw new Error('mountGrammarFeaturesSection: container required');
    if (!deps) throw new Error('mountGrammarFeaturesSection: deps required');

    const { storage, runtime, loadGrammarFeatures, getCurrentLanguage } = deps;

    let cleanups = [];
    function clearListeners() {
      cleanups.forEach(fn => { try { fn(); } catch {} });
      cleanups = [];
    }

    async function render(lang) {
      clearListeners();
      container.innerHTML = '<div class="grammar-features-loading" style="opacity:0.6; font-size:12px;">…</div>';
      const features = await loadGrammarFeatures(lang);
      if (!features) {
        container.innerHTML = '<div style="opacity:0.6; font-size:12px;">Ingen grammatikkfunksjoner for dette språket.</div>';
        return;
      }
      const enabled = await readEnabledFeatures(storage);

      const byCategory = {};
      for (const feat of (features.features || [])) {
        const cat = feat.category || 'other';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(feat);
      }

      const cats = features.categories || Object.keys(byCategory).map(id => ({ id, name: id }));
      let html = '';
      for (const cat of cats) {
        const list = byCategory[cat.id] || [];
        if (list.length === 0) continue;
        html += `<div class="grammar-category">
          <h4 class="grammar-category-title">${escapeHtml(cat.name)}</h4>
          <div class="grammar-features-list">`;
        for (const feat of list) {
          const checked = enabled.has(feat.id) ? 'checked' : '';
          html += `<label class="grammar-feature-item">
            <input type="checkbox" data-feature-id="${escapeHtml(feat.id)}" ${checked}>
            <span class="grammar-feature-name">${escapeHtml(feat.name)}</span>
          </label>`;
        }
        html += `</div></div>`;
      }
      container.innerHTML = html;

      container.querySelectorAll('input[type="checkbox"][data-feature-id]').forEach(cb => {
        const onChange = async () => {
          const id = cb.dataset.featureId;
          if (cb.checked) enabled.add(id); else enabled.delete(id);
          await writeEnabledFeatures(storage, enabled);
          try { runtime.sendMessage({ type: 'GRAMMAR_FEATURES_CHANGED' }); } catch {}
        };
        cb.addEventListener('change', onChange);
        cleanups.push(() => cb.removeEventListener('change', onChange));
      });
    }

    // Initial render
    render(getCurrentLanguage());

    return {
      destroy() {
        clearListeners();
        container.innerHTML = '';
      },
      refresh(lang) {
        render(lang || getCurrentLanguage());
      },
    };
  }

  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiGrammarFeaturesSection = { mount: mountGrammarFeaturesSection };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mount: mountGrammarFeaturesSection };
  }
})();
