/**
 * Spell-check rule: "trotz" used as a conjunction before a subject pronoun
 * (de-trotz-conjunction, priority 26, hint).
 *
 * "Trotz" is a preposition (governs the genitive) meaning "despite":
 *   "Trotz des Regens ging er spazieren."  ← correct, preposition + genitive
 *
 * Norwegian "til tross for at" / "selv om" → students use "trotz" as a
 * conjunction followed directly by a subject pronoun:
 *   "Trotz er müde ist, geht er schwimmen."  → Obwohl er müde ist, …
 *   "Trotz ich krank bin, gehe ich zur Schule." → Obwohl ich krank bin, …
 *
 * Must NOT fire on:
 *   "Trotz des Regens …"   (trotz + article → preposition use)
 *   "Trotz allem …"        (trotz + pronoun "allem" is gen. of "alles" → preposition)
 *   "trotzdem …"           (single word "trotzdem" = nevertheless — different token)
 *
 * Detection:
 *   Find "trotz" (lowercased, standalone token) immediately followed by a
 *   subject personal pronoun (ich, du, er, sie, es, wir, ihr, Sie).
 *   Flag "trotz", fix = "obwohl".
 *
 *   FP guard: if the next token is an article (der/die/das/des/dem/den/ein/eine …)
 *   or "allem"/"allem" → do NOT fire (legitimate preposition use).
 *
 * Rule ID: 'de-trotz-conjunction'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Subject personal pronouns that follow "trotz" in the conjunction-misuse pattern.
  const SUBJ_PRON = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'sie']);
  // "Sie" (formal) — handled by lowercasing

  // Tokens that signal legitimate preposition use (articles, demonstratives, etc.).
  const PREP_MARKERS = new Set([
    'der', 'die', 'das', 'des', 'dem', 'den',
    'ein', 'eine', 'eines', 'einer', 'einem', 'einen',
    'kein', 'keine', 'keines', 'keiner', 'keinem', 'keinen',
    'allem', 'seines', 'ihrer', 'meines',
    'dieses', 'dieses', 'meiner', 'seiner',
    'vieler', 'trotzdem',
  ]);

  const rule = {
    id: 'de-trotz-conjunction',
    languages: ['de'],
    priority: 26,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Contextual grammar hint — trotz (preposition) used as conjunction; beyond Chrome native parity',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const pron = esc(finding && finding.pronoun || '');
      return {
        nb: `<em>Trotz</em> er preposisjon (+ genitiv), ikke konjunksjon. Foran et subjektspronomen${pron ? ` som <em>${pron}</em>` : ''} brukes <strong>obwohl</strong> (= selv om). Merk at <em>obwohl</em> sender verbet til slutten av setningsleddet.`,
        nn: `<em>Trotz</em> er preposisjon (+ genitiv), ikkje konjunksjon. Framfor eit subjektspronomen${pron ? ` som <em>${pron}</em>` : ''} brukast <strong>obwohl</strong> (= sjølv om). Merk at <em>obwohl</em> sender verbet til slutten av leddet.`,
        en: `<em>Trotz</em> is a preposition (+ genitive), not a conjunction. Before a subject pronoun${pron ? ` like <em>${pron}</em>` : ''}, use <strong>obwohl</strong> (= even though / although). Note that <em>obwohl</em> sends the verb to the end of the clause.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      if (!tokens || tokens.length < 2) return [];
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].word !== 'trotz') continue;
        const trotzTok = tokens[i];

        const nextW = tokens[i + 1].word;

        // Legitimate preposition: followed by article or "allem" etc.
        if (PREP_MARKERS.has(nextW)) continue;

        // Conjunction misuse: followed by a subject pronoun.
        if (!SUBJ_PRON.has(nextW)) continue;

        if (cursorPos != null && cursorPos >= trotzTok.start && cursorPos <= trotzTok.end) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: trotzTok.start,
          end: trotzTok.end,
          original: trotzTok.display,
          fix: trotzTok.display[0] === trotzTok.display[0].toUpperCase() ? 'Obwohl' : 'obwohl',
          pronoun: tokens[i + 1].display,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
