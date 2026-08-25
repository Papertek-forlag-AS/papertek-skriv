/**
 * Spell-check rule: French prepositional contraction (priority 15).
 *
 * Flags missing mandatory contractions of prepositions with articles:
 *   de le  -> du       a le  -> au
 *   de les -> des      a les -> aux
 *
 * NOTE: le/la + vowel elision (l') is handled by fr-elision.js (Plan 02).
 *
 * Rule ID: 'fr-contraction'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Preposition + article -> contracted form. The preposition is "à" (accented):
  // "a" (no accent) is the verb avoir, NOT a preposition — "Il a le bras" = HAS,
  // never "au". Matching "à" (which the tokenizer preserves) excludes the verb.
  const CONTRACTIONS = {
    'de le': 'du',
    'à le': 'au',
    'de les': 'des',
    'à les': 'aux',
  };

  const PREPOSITIONS = new Set(['de', 'à']);
  const ARTICLES = new Set(['le', 'les']);

  // After "de/à + le/les", the next token decides whether le/les is an ARTICLE
  // ("de le livre" → du livre) or an OBJECT CLITIC ("de le mettre" → no
  // contraction, le = "it"). A clitic is followed by an infinitive; an article
  // by a noun. In CORRECT French "de le/les" never appears as prep+article
  // (always du/des), so this is what separates a real error from a clitic.
  let _infSet = null, _infSrc = null;
  function infinitiveSet(vocab) {
    const src = vocab && vocab.verbInfinitive;
    if (!src || typeof src.values !== 'function') return null;
    if (_infSrc === src && _infSet) return _infSet;
    _infSet = new Set(src.values());
    _infSrc = src;
    return _infSet;
  }
  function isCliticInfinitive(w, vocab) {
    if (!w) return false;
    const ng = vocab && vocab.nounGenus;
    if (ng && ng.has && ng.has(w)) return false; // a known noun → article reading ("de le livre")
    const set = infinitiveSet(vocab);
    if (set && set.has(w)) return true;           // known infinitive ("de le mettre")
    return /(?:er|ir|re|oir)$/.test(w);           // morphological infinitive (revoir, couper)
  }

  const rule = {
    id: 'fr-contraction',
    languages: ['fr'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (fr-contraction) — Chrome native parity confirmed in 33-03 audit: FR contraction (de+le→du) is deterministic single-token lookup",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Bruk samantrekning <em>${escapeHtml(finding.fix)}</em> i staden for <em>${escapeHtml(finding.original)}</em>.`,
      nn: `Bruk samantrekking <em>${escapeHtml(finding.fix)}</em> i staden for <em>${escapeHtml(finding.original)}</em>.`,
      en: `Use the contraction <em>${escapeHtml(finding.fix)}</em> instead of <em>${escapeHtml(finding.original)}</em>.`,
    }),
    check(ctx) {
      const { tokens, cursorPos, vocab } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= next.end + 1) continue;

        const prep = t.word;
        const art = next.word;

        if (!PREPOSITIONS.has(prep) || !ARTICLES.has(art)) continue;

        // le/les before an infinitive is an OBJECT CLITIC ("avant de le mettre",
        // "de les couper"), not an article — no contraction. Only article+noun
        // contracts ("de le livre" → du).
        const after = tokens[i + 2];
        if (after && isCliticInfinitive(after.word, vocab)) continue;

        const key = prep + ' ' + art;
        const contracted = CONTRACTIONS[key];
        if (!contracted) continue;

        out.push({
          rule_id: 'fr-contraction',
          priority: rule.priority,
          start: t.start,
          end: next.end,
          original: `${t.display} ${next.display}`,
          fix: contracted,
          message: `Samantrekning: "${contracted}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
