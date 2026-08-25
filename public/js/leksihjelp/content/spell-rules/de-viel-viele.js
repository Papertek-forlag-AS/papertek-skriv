/**
 * Spell-check rule: "viel" before a plural noun — should be "viele"
 * (de-viel-viele, priority 26, hint).
 *
 * German uses the inflected "viele" before countable plural nouns:
 *   "Ich habe viel Fragen."    → viele Fragen
 *   "Es gibt viel Probleme."   → viele Probleme
 *   "Viel Grüße!"              → Viele Grüße
 *
 * Correct uses of uninflected "viel" (must NOT fire):
 *   "Viel Glück!"              (uncountable singular)
 *   "Viel Spaß!"               (uncountable singular)
 *   "Viel Erfolg!"             (uncountable singular)
 *   "sehr viel Geld"           (uncountable singular)
 *   "viel besser"              (adverb before comparative)
 *   "viel zu schnell"          (adverb before "zu")
 *   "viel lernen"              (lowercase = verb infinitive)
 *
 * Detection heuristic — plural vs. singular noun:
 *   - Plural forms appear in vocab.nounGenus (inflected forms → genus).
 *   - Singular lemma forms appear in BOTH vocab.nounGenus AND vocab.nounLemmaGenus.
 *   - Therefore: nounGenus.has(w) && !nounLemmaGenus.has(w) = unambiguous plural.
 *   - Same-form nouns (Schüler, Lehrer, Fenster) are in both maps → safely skipped.
 *   - Verb infinitives (fragen, lachen) are lowercase in text → skipped by the
 *     uppercase check (German capitalizes nouns).
 *
 * Rule ID: 'de-viel-viele'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rule = {
    id: 'de-viel-viele',
    languages: ['de'],
    priority: 26,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Contextual grammar hint — viel vs viele before plural nouns; beyond Chrome native parity',
      category: 'grammar-lookup',
    },
    explain: () => ({
      nb: `Foran tellbare substantiv i flertall bruker tysk <strong>viele</strong> (= mange), ikke <em>viel</em>. Eks.: <em>viele Fragen</em> (mange spørsmål), <em>viele Kinder</em> (mange barn), <em>Viele Grüße</em>.`,
      nn: `Framfor teljelege substantiv i fleirtal brukar tysk <strong>viele</strong> (= mange), ikkje <em>viel</em>. Eks.: <em>viele Fragen</em>, <em>viele Kinder</em>, <em>Viele Grüße</em>.`,
      en: `Before countable plural nouns, German uses <strong>viele</strong> (= many), not <em>viel</em>. E.g.: <em>viele Fragen</em> (many questions), <em>viele Kinder</em> (many children), <em>Viele Grüße</em>.`,
    }),
    check(ctx) {
      const { tokens, text, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      if (!tokens || tokens.length < 2 || !text) return [];

      const nounGenus = (ctx.vocab && ctx.vocab.nounGenus instanceof Map)
        ? ctx.vocab.nounGenus : new Map();
      const nounLemmaGenus = (ctx.vocab && ctx.vocab.nounLemmaGenus instanceof Map)
        ? ctx.vocab.nounLemmaGenus : new Map();

      if (!nounGenus.size) return [];

      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].word !== 'viel') continue;

        const vielTok = tokens[i];
        const nextTok = tokens[i + 1];

        // Guard: only whitespace in the gap between viel and the noun
        const gap = text.slice(vielTok.end, nextTok.start);
        if (/[^  \t]/.test(gap)) continue; // non-whitespace in gap → skip

        const origWord = text.slice(nextTok.start, nextTok.end);

        // Must start with uppercase — German capitalizes nouns (not verb infinitives)
        if (!origWord || origWord[0] < 'A' || origWord[0] > 'Z') continue;

        const w = nextTok.word; // lowercased

        // Plural heuristic: in nounGenus (inflected forms) but NOT in nounLemmaGenus (lemmas only)
        // Zero-plural count nouns (Ordbank sweep 2026-07): Fehler/Lehrer/…
        // are their own plural, so the lemma-guard hid them ("viel Fehler"
        // → "viele Fehler"). Curated set — uncountables (Wasser, Geld)
        // stay protected by the lemma-guard.
        const ZERO_PLURAL = ['fehler', 'lehrer', 'schüler', 'spieler',
          'mädchen', 'zimmer', 'fenster', 'brötchen'];
        const zeroPlural = ZERO_PLURAL.indexOf(w) !== -1;
        if (!zeroPlural && (!nounGenus.has(w) || nounLemmaGenus.has(w))) continue;

        // Cursor guard
        if (cursorPos != null && cursorPos >= vielTok.start && cursorPos <= vielTok.end) continue;

        // Determine correct fix: preserve capitalisation of original "viel"
        const origViel = text.slice(vielTok.start, vielTok.end);
        const fix = origViel[0] === 'V' ? 'Viele' : 'viele';

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: vielTok.start,
          end: vielTok.end,
          original: vielTok.display || origViel,
          fix,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
