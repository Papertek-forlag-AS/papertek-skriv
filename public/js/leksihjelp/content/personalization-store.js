/**
 * Leksihjelp — Personalization store (Phase 1, local-first).
 *
 * Per-language personal dictionary + known-lesson ids over a storage adapter.
 * Sync reads from an in-memory mirror (loaded via load()), async writes.
 * Phase 2 swaps the storage adapter for a Firebase-sync-backed one behind the
 * SAME interface. This file is NOT a spell-check* file, so SC-06 does not scan
 * it; it touches chrome.storage.local only, never the network.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;

  const LANGS = ['nb', 'nn', 'de', 'en', 'es', 'fr'];
  const SCHEMA_VERSION = 1;
  // Per-language single-token letter pattern (lowercased input).
  // NB/NN include common loanword accented chars (café, résumé, Pokémon, …).
  const WORD_RE = {
    nb: /^[a-zæøåàáâäéèêëíîïóôöúùûüý]+$/,
    nn: /^[a-zæøåàáâäéèêëíîïóôöúùûüý]+$/,
    de: /^[a-zäöüß]+$/, en: /^[a-z]+$/,
    es: /^[a-záéíóúüñ]+$/, fr: /^[a-zàâäçéèêëîïôöùûüÿœæ]+$/,
  };

  function emptyByLang(dflt = []) { const o = {}; for (const l of LANGS) o[l] = Array.isArray(dflt) ? [] : dflt; return o; }

  function blankState() {
    return { schemaVersion: SCHEMA_VERSION, personalDict: emptyByLang(), knownLessons: emptyByLang(), learningLessons: emptyByLang(), focusMode: emptyByLang(false) };
  }

  function migrate(raw) {
    const s = blankState();
    if (raw && typeof raw === 'object') {
      for (const l of LANGS) {
        if (Array.isArray(raw.personalDict && raw.personalDict[l])) s.personalDict[l] = raw.personalDict[l].slice();
        if (Array.isArray(raw.knownLessons && raw.knownLessons[l])) s.knownLessons[l] = raw.knownLessons[l].slice();
        if (Array.isArray(raw.learningLessons && raw.learningLessons[l])) s.learningLessons[l] = raw.learningLessons[l].slice();
        if (typeof raw.focusMode?.[l] === 'boolean') s.focusMode[l] = raw.focusMode[l];
      }
    }
    return s;
  }

  function normalizeWord(lang, word) {
    if (typeof word !== 'string') return null;
    const w = word.trim().toLowerCase();
    if (w.length < 2 || w.length > 40) return null;
    const re = WORD_RE[lang];
    if (!re || !re.test(w)) return null;
    return w;
  }

  function createPersonalizationStore({ storage }) {
    let state = blankState();
    let loaded = false;
    let writing = false;
    const handlers = new Set();
    function emit() { for (const h of handlers) { try { h(); } catch (_) {} } }
    async function persist() {
      writing = true;
      try { await storage.write(JSON.parse(JSON.stringify(state))); } finally { writing = false; }
      emit();
    }

    return {
      async load() {
        const raw = await storage.read();
        state = migrate(raw);
        loaded = true;
        if (storage.subscribe) {
          // Only handle external updates (Phase 2 Firebase sync); skip our own writes.
          storage.subscribe((next) => { if (!writing) { state = migrate(next); emit(); } });
        }
      },
      isLoaded() { return loaded; },
      getPersonalWords(lang) { return (state.personalDict[lang] || []).slice(); },
      hasPersonalWord(lang, word) {
        const w = normalizeWord(lang, word);
        return !!w && (state.personalDict[lang] || []).includes(w);
      },
      async addWord(lang, word) {
        const w = normalizeWord(lang, word);
        if (!w) return false;
        const list = state.personalDict[lang] || (state.personalDict[lang] = []);
        if (list.includes(w)) return false;
        list.push(w);
        await persist();
        return true;
      },
      async removeWord(lang, word) {
        const w = (typeof word === 'string') ? word.trim().toLowerCase() : '';
        const list = state.personalDict[lang] || [];
        const i = list.indexOf(w);
        if (i >= 0) { list.splice(i, 1); await persist(); }
      },
      isLessonKnown(lang, ruleId) { return (state.knownLessons[lang] || []).includes(ruleId); },
      getKnownLessons(lang) { return (state.knownLessons[lang] || []).slice(); },
      async markKnown(lang, ruleId) {
        // A lesson is in at most one of {learning, known}: mastering evicts it
        // from the active-learning stack (læringsbunken).
        const list = state.knownLessons[lang] || (state.knownLessons[lang] = []);
        const learn = state.learningLessons[lang] || [];
        const li = learn.indexOf(ruleId);
        let changed = false;
        if (li >= 0) { learn.splice(li, 1); changed = true; }
        if (!list.includes(ruleId)) { list.push(ruleId); changed = true; }
        if (changed) await persist();
      },
      async unmarkKnown(lang, ruleId) {
        const list = state.knownLessons[lang] || [];
        const i = list.indexOf(ruleId);
        if (i >= 0) { list.splice(i, 1); await persist(); }
      },
      // ── Læringsbunken (active-learning stack) — the lessons a student is
      // deliberately practising right now. Mutually exclusive with known. ──
      isLessonLearning(lang, ruleId) { return (state.learningLessons[lang] || []).includes(ruleId); },
      getLearningLessons(lang) { return (state.learningLessons[lang] || []).slice(); },
      async markLearning(lang, ruleId) {
        const list = state.learningLessons[lang] || (state.learningLessons[lang] = []);
        const known = state.knownLessons[lang] || [];
        const ki = known.indexOf(ruleId);
        let changed = false;
        if (ki >= 0) { known.splice(ki, 1); changed = true; }   // demote: known → læringsbunken
        if (!list.includes(ruleId)) { list.push(ruleId); changed = true; }
        if (changed) await persist();
      },
      async unmarkLearning(lang, ruleId) {
        const list = state.learningLessons[lang] || [];
        const i = list.indexOf(ruleId);
        if (i >= 0) { list.splice(i, 1); await persist(); }
      },
      isFocusModeEnabled(lang) {
        return state.focusMode[lang] === true;
      },
      async setFocusMode(lang, bool) {
        if (typeof bool !== 'boolean') return;
        if (state.focusMode[lang] === bool) return;
        state.focusMode[lang] = bool;
        await persist();
      },
      onChange(handler) { handlers.add(handler); return () => handlers.delete(handler); },
    };
  }

  host.__lexiPersonalization = { createPersonalizationStore };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { createPersonalizationStore };
  }
})();
