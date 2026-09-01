(function () {
  'use strict';
  // Pure, DOM-free, chrome-free helper (popup-deps-gate safe). Computes which
  // languages a picker should show under the "one foreign language at a time"
  // model shared across every Leksihjelp language picker.
  //
  // A Norwegian student studies ONE foreign language (de/es/fr) at a time. Every
  // picker shows the non-foreign languages (nb/nn/en, minus any host filter) plus
  // a SINGLE foreign-language slot — the student's chosen FL (`studentForeignLang`),
  // or the currently-active FL if that's an FL, or a placeholder when neither is
  // set and the host can open a first-FL picker. `foreignChoices` is the full FL
  // set for a "change which FL is mine" sub-menu.
  //
  // Lifted verbatim from dictionary-view.js rebuildLangSwitcher (Plan 41-01) so
  // the dictionary and the Lær mer picker share one source of truth.
  //
  //   deps: { available:[code], studentForeignLang, currentLang,
  //           allowed:[code]|null, hasFirstFLPicker:boolean }
  //   → { displayLangs:[code], foreignChoices:[code], activeFL:code|null,
  //       showPlaceholder:boolean }
  const FL_LANGS = new Set(['de', 'fr', 'es']);

  function computeLangPickerModel(deps) {
    const {
      available = [], studentForeignLang = null, currentLang = null,
      allowed = null, hasFirstFLPicker = false,
    } = deps || {};

    const filtered = (Array.isArray(allowed) && allowed.length > 0)
      ? available.filter((l) => allowed.includes(l))
      : available.slice();

    const filteredFLs = filtered.filter((l) => FL_LANGS.has(l));

    // ≤1 FL available (e.g. lockdown scopes to NB + one FL): nothing to
    // consolidate — show everything flat, no sub-menu.
    if (filteredFLs.length <= 1) {
      return {
        displayLangs: filtered,
        foreignChoices: [],
        activeFL: filteredFLs[0] || null,
        showPlaceholder: false,
      };
    }

    let activeFL = currentLang;
    let showPlaceholder = false;
    if (!FL_LANGS.has(activeFL)) {
      if (studentForeignLang && filteredFLs.includes(studentForeignLang)) {
        activeFL = studentForeignLang;
      } else if (!studentForeignLang && hasFirstFLPicker) {
        showPlaceholder = true;
        activeFL = null;
      } else {
        activeFL = filteredFLs[0];
      }
    }

    const displayLangs = activeFL
      ? filtered.filter((l) => !FL_LANGS.has(l) || l === activeFL)
      : filtered.filter((l) => !FL_LANGS.has(l));

    return { displayLangs, foreignChoices: filteredFLs.slice(), activeFL, showPlaceholder };
  }

  const host = typeof self !== 'undefined' ? self : globalThis;
  host.computeLangPickerModel = computeLangPickerModel;
  if (typeof module !== 'undefined' && module.exports) module.exports = { computeLangPickerModel };
})();
