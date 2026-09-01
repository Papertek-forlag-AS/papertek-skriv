/**
 * Leksihjelp — Settings View Module (Phase 30-01)
 *
 * Mountable settings view: UI language picker, dark mode, prediction toggle,
 * spellcheck-alternates toggle.
 *
 * Account/auth, exam mode, access-code, target-language download list, and
 * grammar features remain owned by the host (popup.js) — they live inside the
 * same `#view-settings` DOM section but their wiring is extension-specific
 * (calls into vocab-store download paths, access-code verify endpoint, exam
 * registry). Lockdown's sidepanel will pass `showSection: { uiLanguage: true,
 * darkmode: true }` and skip the rest.
 *
 * @typedef {Object} SettingsViewDeps
 * @property {Object} storage      - { get(key), set(obj) }
 * @property {Object} runtime      - { sendMessage }
 * @property {Function} t          - i18n resolver
 * @property {Function} getUiLanguage
 * @property {Function} setUiLanguage
 * @property {Function} applyTranslations - re-paint i18n strings on UI lang change
 * @property {Function} [onUiLanguageChange] - host hook to refresh dynamic UI
 * @property {Object}  [showSection] - { uiLanguage, darkmode, prediction,
 *                                       spellcheckAlternates } booleans
 *                                     (default all true).
 *
 * @returns {{ destroy(): void }}
 */
(function () {
  'use strict';

  // ── Personalization export/import (pure, testable) ──────────
  // Kept self-contained inside this synced view module (no external helper
  // import) so lockdown/skriveokt-zero, which copy this file verbatim, don't
  // need a companion file. buildPersonalizationExport is deliberately pure:
  // it takes already-gathered plain data + an ISO timestamp (no Date.now(),
  // no chrome, no DOM) so it's deterministic under test.
  const PERSONALIZATION_LANGS = ['nb', 'nn', 'en', 'de', 'es', 'fr'];
  const IMPORT_EXPORT_VERSION = 1;
  const MAX_IMPORT_WORD_LEN = 200;   // reject absurdly long strings (untrusted input)
  const MAX_IMPORT_TOTAL = 20000;    // total entries cap across all fields/langs

  function buildPersonalizationExport(data, exportedAtIso) {
    const src = (data && typeof data === 'object') ? data : {};
    const pickField = (field) => {
      const obj = (src[field] && typeof src[field] === 'object') ? src[field] : {};
      const out = {};
      for (const lang of PERSONALIZATION_LANGS) {
        out[lang] = Array.isArray(obj[lang]) ? obj[lang].slice() : [];
      }
      return out;
    };
    const focusSrc = (src.focusMode && typeof src.focusMode === 'object') ? src.focusMode : {};
    const focusMode = {};
    for (const lang of PERSONALIZATION_LANGS) {
      focusMode[lang] = focusSrc[lang] === true;
    }
    return {
      _meta: { version: IMPORT_EXPORT_VERSION, exportedAt: exportedAtIso || null },
      words: pickField('words'),
      knownLessons: pickField('knownLessons'),
      learningLessons: pickField('learningLessons'),
      focusMode,
    };
  }

  function parsePersonalizationImport(text) {
    let root;
    try { root = JSON.parse(text); }
    catch (_) { return { ok: false, error: 'not-json' }; }
    if (!root || typeof root !== 'object' || Array.isArray(root)) {
      return { ok: false, error: 'bad-shape' };
    }
    const langSet = new Set(PERSONALIZATION_LANGS);
    const fields = ['words', 'knownLessons', 'learningLessons'];
    const result = { words: {}, knownLessons: {}, learningLessons: {} };
    let total = 0;
    try {
      for (const field of fields) {
        const raw = root[field];
        if (raw === undefined || raw === null) continue;      // missing → empty
        if (typeof raw !== 'object' || Array.isArray(raw)) throw { code: 'bad-shape' };
        for (const lang of Object.keys(raw)) {
          if (!langSet.has(lang)) throw { code: 'bad-language' };
          const arr = raw[lang];
          if (!Array.isArray(arr)) throw { code: 'bad-shape' };
          const seen = new Set();
          const clean = [];
          for (const item of arr) {
            if (typeof item !== 'string') throw { code: 'non-string' };
            const s = item.trim();
            if (!s) continue;
            if (s.length > MAX_IMPORT_WORD_LEN) throw { code: 'too-long' };
            total += 1;
            if (total > MAX_IMPORT_TOTAL) throw { code: 'oversized' };
            if (!seen.has(s)) { seen.add(s); clean.push(s); }
          }
          if (clean.length) result[field][lang] = clean;
        }
      }
      // Optional focusMode: { lang: boolean } map. Absent → omitted. Present but
      // not a plain object → reject (bad-focus). Unknown languages ignored;
      // each value coerced to a strict boolean.
      const rawFocus = root.focusMode;
      if (rawFocus !== undefined && rawFocus !== null) {
        if (typeof rawFocus !== 'object' || Array.isArray(rawFocus)) throw { code: 'bad-focus' };
        const focus = {};
        for (const lang of Object.keys(rawFocus)) {
          if (!langSet.has(lang)) continue;   // ignore unknown langs
          focus[lang] = rawFocus[lang] === true;
        }
        result.focusMode = focus;
      }
    } catch (e) {
      return { ok: false, error: (e && e.code) || 'invalid' };
    }
    const out = {
      ok: true,
      words: result.words,
      knownLessons: result.knownLessons,
      learningLessons: result.learningLessons,
    };
    if (result.focusMode) out.focusMode = result.focusMode;
    return out;
  }

  function mountSettingsView(container, deps) {
    if (!container) throw new Error('mountSettingsView: container required');
    if (!deps) throw new Error('mountSettingsView: deps required');

    const {
      storage, runtime, t,
      getUiLanguage, setUiLanguage, applyTranslations,
      onUiLanguageChange,
      personalization, personalizationEnabled,
    } = deps;
    const showSection = deps.showSection || {
      uiLanguage: true, darkmode: true, prediction: true, spellcheckAlternates: true, widget: true, ttsWidget: true,
    };

    const cleanups = [];
    function bind(el, ev, handler) {
      if (!el) return;
      el.addEventListener(ev, handler);
      cleanups.push(() => el.removeEventListener(ev, handler));
    }

    // ── UI language picker ─────────────────────────────
    if (showSection.uiLanguage !== false) {
      const uiSelector = container.querySelector('#ui-language-selector');
      if (uiSelector) {
        const currentUi = getUiLanguage();
        uiSelector.querySelectorAll('.ui-lang-option').forEach(btn => {
          btn.classList.toggle('active', btn.dataset.uiLang === currentUi);
          const onClick = async () => {
            const lang = btn.dataset.uiLang;
            if (lang === getUiLanguage()) return;
            uiSelector.querySelectorAll('.ui-lang-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setUiLanguage(lang);
            await storage.set({ uiLanguage: lang });
            if (typeof applyTranslations === 'function') applyTranslations();
            if (typeof onUiLanguageChange === 'function') onUiLanguageChange(lang);
            runtime.sendMessage({ type: 'UI_LANGUAGE_CHANGED', uiLanguage: lang });
          };
          btn.addEventListener('click', onClick);
          cleanups.push(() => btn.removeEventListener('click', onClick));
        });
      }
    }

    // ── Dark mode toggle ───────────────────────────────
    if (showSection.darkmode !== false) {
      (async () => {
        const toggle = container.querySelector('#setting-darkmode');
        if (!toggle) return;
        const stored = await storage.get('darkMode');
        const docEl = container.ownerDocument.documentElement;

        if (stored === true) {
          docEl.setAttribute('data-theme', 'dark');
          toggle.checked = true;
        } else if (stored === false) {
          docEl.removeAttribute('data-theme');
          toggle.checked = false;
        } else {
          const win = container.ownerDocument.defaultView;
          if (win && win.matchMedia && win.matchMedia('(prefers-color-scheme: dark)').matches) {
            docEl.setAttribute('data-theme', 'dark');
            toggle.checked = true;
          }
        }

        bind(toggle, 'change', async () => {
          if (toggle.checked) {
            docEl.setAttribute('data-theme', 'dark');
            await storage.set({ darkMode: true });
          } else {
            docEl.removeAttribute('data-theme');
            await storage.set({ darkMode: false });
          }
        });
      })();
    }

    // ── Word-prediction toggle ─────────────────────────
    if (showSection.prediction !== false) {
      (async () => {
        const toggle = container.querySelector('#setting-prediction');
        if (!toggle) return;
        const enabled = await storage.get('predictionEnabled');
        toggle.checked = enabled === true;
        bind(toggle, 'change', async () => {
          await storage.set({ predictionEnabled: toggle.checked });
          runtime.sendMessage({ type: 'PREDICTION_TOGGLED', enabled: toggle.checked });
        });
      })();
    }

    // ── Widget toggle (Hurtigoppslag — double-click lookup card) ──
    if (showSection.widget !== false) {
      (async () => {
        const toggle = container.querySelector('#setting-widget');
        if (!toggle) return;
        const enabled = await storage.get('widgetEnabled');
        // Default to true if never set
        toggle.checked = enabled !== false;
        bind(toggle, 'change', async () => {
          await storage.set({ widgetEnabled: toggle.checked });
          runtime.sendMessage({ type: 'WIDGET_ENABLED_CHANGED', enabled: toggle.checked });
        });
      })();
    }

    // ── TTS-widget toggle (Uttaleknapp on text selection) ──
    // Independent of Hurtigoppslag — pausing the on-page TTS bubble must
    // not also kill the double-click lookup card. Migrates from legacy
    // widgetEnabled if ttsWidgetEnabled has never been written, so users
    // who had the combined toggle off keep both surfaces off.
    if (showSection.ttsWidget !== false) {
      (async () => {
        const toggle = container.querySelector('#setting-tts-widget');
        if (!toggle) return;
        const stored = await storage.get('ttsWidgetEnabled');
        if (stored === undefined || stored === null) {
          const legacy = await storage.get('widgetEnabled');
          toggle.checked = legacy !== false;
        } else {
          toggle.checked = stored !== false;
        }
        bind(toggle, 'change', async () => {
          await storage.set({ ttsWidgetEnabled: toggle.checked });
          runtime.sendMessage({ type: 'TTS_WIDGET_ENABLED_CHANGED', enabled: toggle.checked });
        });
      })();
    }

    // ── Spellcheck-alternates toggle ───────────────────
    if (showSection.spellcheckAlternates !== false) {
      (async () => {
        const toggle = container.querySelector('#setting-spellcheck-alternates');
        if (!toggle) return;
        const stored = await storage.get('spellCheckAlternatesVisible');
        // Default ON: only an explicit `false` flips the toggle off.
        toggle.checked = stored !== false;
        bind(toggle, 'change', async () => {
          await storage.set({ spellCheckAlternatesVisible: toggle.checked });
        });
      })();
    }

    // ── Sarskriving-tentative toggle (Phase 45-03) ─────
    // ON by default (opt-out). When on, spell-check-renderer surfaces the
    // tentative compound-recognition tier (nb/nn/de) with Ja/Nei vote buttons.
    // Live-applies via chrome.storage.onChanged in spell-check-renderer.js.
    if (showSection.sarskrivingTentative !== false) {
      (async () => {
        const toggle = container.querySelector('#setting-sarskriving-tentative');
        if (!toggle) return;
        const stored = await storage.get('sarskrivingTentativeEnabled');
        toggle.checked = stored !== false;
        bind(toggle, 'change', async () => {
          await storage.set({ sarskrivingTentativeEnabled: toggle.checked });
        });
      })();
    }

    // ── EN spelling-variety picker (2026-07) ───────────
    // 'both' (default) | 'br' | 'am'. A strict variety activates the
    // en-spelling-variety rule (other-variety forms flag as spelling
    // errors, native en-GB/en-US parity) and supersedes the consistency
    // hint. Live-applies via chrome.storage.onChanged in
    // spell-check-renderer.js. The storage key is also the lockdown
    // teacher-profile override point.
    if (showSection.enVariety !== false) {
      (async () => {
        const sel = container.querySelector('#setting-en-variety');
        if (!sel) return;
        const stored = await storage.get('enSpellingVariety');
        sel.value = (stored === 'br' || stored === 'am') ? stored : 'both';
        bind(sel, 'change', async () => {
          await storage.set({ enSpellingVariety: sel.value });
        });
      })();
    }

    // ── Pausede nettsteder (paused-sites list) ─────────
    // Reads chrome.storage.local.pausedDomains (host → {until}); lists every
    // currently-active pause with a resume ✕. Resuming writes the pruned map
    // back — the content-script __lexiPause onChanged listener re-activates the
    // surfaces on that host live. The group stays hidden when nothing is paused.
    if (showSection.pausedSites !== false) {
      (async () => {
        const group = container.querySelector('#paused-sites-group');
        const list = container.querySelector('#paused-sites-list');
        if (!group || !list) return;
        const doc = container.ownerDocument;

        const fmtRemaining = (until) => {
          if (until === null || until === undefined) return t('settings_paused_indefinite');
          const min = Math.max(0, Math.ceil((Number(until) - Date.now()) / 60000));
          if (min < 60) return t('settings_paused_remaining', { time: `${min} min` });
          const h = Math.floor(min / 60), m = min % 60;
          return t('settings_paused_remaining', { time: m > 0 ? `${h} t ${m} min` : `${h} t` });
        };

        async function render() {
          const map = (await storage.get('pausedDomains')) || {};
          const now = Date.now();
          const active = Object.keys(map)
            .map((host) => ({ host, until: (map[host] && map[host].until != null) ? map[host].until : null }))
            .filter((e) => e.until === null || Number(e.until) > now);
          list.textContent = '';
          if (!active.length) { group.hidden = true; return; }
          group.hidden = false;
          for (const { host, until } of active) {
            const row = doc.createElement('div');
            row.className = 'paused-site-row';
            const info = doc.createElement('div');
            info.className = 'paused-site-info';
            const name = doc.createElement('span');
            name.className = 'paused-site-host';
            name.textContent = host;
            const meta = doc.createElement('span');
            meta.className = 'paused-site-meta';
            meta.textContent = fmtRemaining(until);
            info.appendChild(name);
            info.appendChild(meta);
            const resume = doc.createElement('button');
            resume.type = 'button';
            resume.className = 'paused-site-resume';
            resume.setAttribute('aria-label', t('settings_paused_resume', { host }));
            resume.textContent = '×';
            bind(resume, 'click', async () => {
              const cur = (await storage.get('pausedDomains')) || {};
              const next = { ...cur };
              delete next[host];
              await storage.set({ pausedDomains: next });
              render();
            });
            row.appendChild(info);
            row.appendChild(resume);
            list.appendChild(row);
          }
        }
        render();
        // Live update: the settings view mounts once at popup load, so without
        // this a pause set afterwards would never appear (UAT 1.9). Re-render
        // whenever pausedDomains changes.
        if (typeof deps.onStorageChanged === 'function') {
          const unsub = deps.onStorageChanged((changes) => {
            if (changes && changes.pausedDomains) render();
          });
          if (typeof unsub === 'function') cleanups.push(unsub);
        }
      })();
    }

    // ── Min ordliste (personal word list, all languages) ──
    // Lists every word the student chose to keep, across all 6 languages,
    // each with a ✕ remove. Mirrors the library-view store API
    // (getPersonalWords / removeWord / onChange). Self-gated OFF in exam
    // mode — a personal dictionary is an answer-loading vector (see
    // exam-registry.js personalization.settingsWordList). The group stays
    // hidden when nothing is stored or when exam mode is on.
    if (showSection.personalWords !== false) {
      (async () => {
        const group = container.querySelector('#personal-words-group');
        const list = container.querySelector('#personal-words-list');
        if (!group || !list || !personalization || personalizationEnabled === false) return;
        const doc = container.ownerDocument;
        const LANGS = ['nb', 'nn', 'en', 'de', 'es', 'fr'];
        // Collapse per LANGUAGE BLOCK, not across the whole group: a pupil with
        // 200 Bokmål words and 3 German ones should only have Bokmål folded.
        // Held outside render() so the open/closed choice survives the
        // re-render that every add/remove triggers via onChange.
        const COLLAPSED_COUNT = 5;
        const expanded = new Set();

        async function render() {
          const examMode = !!(await storage.get('examMode'));
          list.textContent = '';
          if (examMode) { group.hidden = true; return; }

          const byLang = LANGS
            .map((lang) => ({ lang, words: personalization.getPersonalWords(lang) || [] }))
            .filter((e) => e.words.length > 0);
          if (!byLang.length) { group.hidden = true; return; }
          group.hidden = false;

          for (const { lang, words } of byLang) {
            const block = doc.createElement('div');
            block.className = 'personal-words-lang';
            const label = doc.createElement('span');
            label.className = 'personal-words-lang-label';
            label.textContent = t('lang_' + lang);
            block.appendChild(label);
            const ul = doc.createElement('ul');
            ul.className = 'personal-words-ul';
            const isOpen = expanded.has(lang);
            let index = -1;
            for (const word of words) {
              index += 1;
              const li = doc.createElement('li');
              li.className = 'personal-word-row';
              // Rendered but hidden rather than omitted, so the ✕ handler and
              // the row markup stay identical in both states.
              if (!isOpen && index >= COLLAPSED_COUNT) li.hidden = true;
              const wordEl = doc.createElement('span');
              wordEl.className = 'personal-word';
              wordEl.textContent = word;
              const remove = doc.createElement('button');
              remove.type = 'button';
              remove.className = 'personal-word-remove';
              remove.dataset.lang = lang;
              remove.dataset.word = word;
              remove.setAttribute('aria-label', t('settings_personal_words_remove', { word }));
              remove.textContent = '×';
              li.appendChild(wordEl);
              li.appendChild(remove);
              ul.appendChild(li);
            }
            block.appendChild(ul);
            if (words.length > COLLAPSED_COUNT) {
              const toggle = doc.createElement('button');
              toggle.type = 'button';
              toggle.className = 'personal-words-toggle';
              toggle.dataset.lang = lang;
              toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
              toggle.textContent = isOpen
                ? t('settings_personal_words_show_fewer')
                : t('settings_personal_words_show_all', { count: words.length });
              block.appendChild(toggle);
            }
            list.appendChild(block);
          }
        }
        render();
        // Single delegated click listener on the list container (bound once,
        // lands in cleanups exactly once). removeWord → store persist → emit →
        // onChange(render), so re-render is driven solely by onChange — no
        // explicit render() here (that would double-rebuild).
        bind(list, 'click', (e) => {
          // Vis alle / Vis færre — checked first, and it re-renders itself.
          // Unlike remove, nothing in the store changes, so onChange never
          // fires and render() has to be called here.
          const toggle = e.target.closest('.personal-words-toggle');
          if (toggle && list.contains(toggle)) {
            const lang = toggle.dataset.lang;
            if (!lang) return;
            if (expanded.has(lang)) expanded.delete(lang);
            else expanded.add(lang);
            render();
            return;
          }
          const btn = e.target.closest('.personal-word-remove');
          if (!btn || !list.contains(btn)) return;
          const { lang, word } = btn.dataset;
          if (!lang || !word) return;
          personalization.removeWord(lang, word);
        });
        // Live update: re-render when the personal store changes (add/remove
        // from anywhere) and when exam mode flips.
        if (typeof personalization.onChange === 'function') {
          const unsub = personalization.onChange(render);
          if (typeof unsub === 'function') cleanups.push(unsub);
        }
        if (typeof deps.onStorageChanged === 'function') {
          const unsub = deps.onStorageChanged((changes) => {
            if (changes && changes.examMode) render();
          });
          if (typeof unsub === 'function') cleanups.push(unsub);
        }
      })();
    }

    // ── Dine data (eksport + import av personlig ordliste) ──
    // Export = GDPR "download my data" + portability; Import = additive merge
    // (union only, never overwrites). Self-gated OFF in exam mode — same reason
    // as Min ordliste (a personal dictionary is an answer-loading vector). The
    // group stays hidden when personalization is absent (lockdown/exam) or when
    // exam mode is on. All logic is self-contained (no non-synced import).
    if (showSection.personalData !== false) {
      (async () => {
        const group = container.querySelector('#personal-data-group');
        const exportBtn = container.querySelector('#setting-export-data');
        const importBtn = container.querySelector('#setting-import-data');
        const fileInput = container.querySelector('#setting-import-file');
        const msgEl = container.querySelector('#setting-import-msg');
        if (!group || !exportBtn || !importBtn || !fileInput
            || !personalization || personalizationEnabled === false) return;
        const doc = container.ownerDocument;
        const win = doc.defaultView || (typeof self !== 'undefined' ? self : globalThis);
        const LANGS = ['nb', 'nn', 'en', 'de', 'es', 'fr'];

        async function refreshVisibility() {
          const examMode = !!(await storage.get('examMode'));
          group.hidden = examMode;
        }
        refreshVisibility();

        function showMsg(text, isError) {
          if (!msgEl) return;
          msgEl.textContent = text;
          msgEl.hidden = false;
          msgEl.classList.toggle('personal-data-error', !!isError);
        }

        // Export: gather per-language words + known/learning lessons, build the
        // pure export object, and trigger a JSON download via a Blob + <a>.
        bind(exportBtn, 'click', () => {
          const data = { words: {}, knownLessons: {}, learningLessons: {}, focusMode: {} };
          for (const lang of LANGS) {
            data.words[lang] = personalization.getPersonalWords(lang) || [];
            data.knownLessons[lang] = (typeof personalization.getKnownLessons === 'function'
              ? personalization.getKnownLessons(lang) : []) || [];
            data.learningLessons[lang] = (typeof personalization.getLearningLessons === 'function'
              ? personalization.getLearningLessons(lang) : []) || [];
            data.focusMode[lang] = (typeof personalization.isFocusModeEnabled === 'function'
              ? personalization.isFocusModeEnabled(lang) : false) === true;
          }
          const payload = buildPersonalizationExport(data, new Date().toISOString());
          const json = JSON.stringify(payload, null, 2);
          const blob = new win.Blob([json], { type: 'application/json' });
          const url = win.URL.createObjectURL(blob);
          const a = doc.createElement('a');
          a.href = url;
          a.download = 'leksihjelp-ordliste.json';
          group.appendChild(a);
          a.click();
          a.remove();
          win.URL.revokeObjectURL(url);
        });

        // Import: open the file picker, read as text, validate strictly, then
        // replay into the store (add words, mark lessons). Merge only.
        bind(importBtn, 'click', () => { fileInput.value = ''; fileInput.click(); });
        bind(fileInput, 'change', () => {
          const file = fileInput.files && fileInput.files[0];
          if (!file) return;
          const reader = new win.FileReader();
          reader.onload = async () => {
            const parsed = parsePersonalizationImport(String(reader.result || ''));
            if (!parsed.ok) { showMsg(t('settings_import_error'), true); return; }
            for (const lang of LANGS) {
              for (const w of (parsed.words[lang] || [])) {
                try { await personalization.addWord(lang, w); } catch (_) { /* skip */ }
              }
              if (typeof personalization.markKnown === 'function') {
                for (const id of (parsed.knownLessons[lang] || [])) {
                  try { await personalization.markKnown(lang, id); } catch (_) { /* skip */ }
                }
              }
              if (typeof personalization.markLearning === 'function') {
                for (const id of (parsed.learningLessons[lang] || [])) {
                  try { await personalization.markLearning(lang, id); } catch (_) { /* skip */ }
                }
              }
              if (parsed.focusMode && typeof personalization.setFocusMode === 'function'
                  && Object.prototype.hasOwnProperty.call(parsed.focusMode, lang)) {
                try { await personalization.setFocusMode(lang, parsed.focusMode[lang] === true); } catch (_) { /* skip */ }
              }
            }
            showMsg(t('settings_import_ok'), false);
          };
          reader.onerror = () => showMsg(t('settings_import_error'), true);
          reader.readAsText(file);
        });

        // Re-evaluate visibility when exam mode flips.
        if (typeof deps.onStorageChanged === 'function') {
          const unsub = deps.onStorageChanged((changes) => {
            if (changes && changes.examMode) refreshVisibility();
          });
          if (typeof unsub === 'function') cleanups.push(unsub);
        }
      })();
    }

    // Suppress unused warning for `t` — kept as a dep for future i18n strings
    // the view may render directly (today the labels are static via data-i18n).
    void t;

    return {
      destroy() {
        for (const fn of cleanups) {
          try { fn(); } catch (_) { /* best-effort */ }
        }
        cleanups.length = 0;
      },
    };
  }

  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSettingsView = { mount: mountSettingsView };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      mount: mountSettingsView,
      mountSettingsView,
      buildPersonalizationExport,
      parsePersonalizationImport,
    };
  }
})();
