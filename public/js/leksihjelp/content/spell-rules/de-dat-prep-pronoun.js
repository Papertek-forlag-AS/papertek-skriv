/**
 * Spell-check rule: German nominative personal pronoun after a pure dative
 * preposition (de-dat-prep-pronoun, priority 33).
 *
 * Dative prepositions (aus, bei, mit, nach, seit, von, zu, gegenüber) always
 * govern the dative case. Norwegian has no case on personal pronouns after
 * prepositions, so Norwegian L1 students keep the subject (nominative) form:
 *   "mit ich"  → "mit mir"
 *   "von er"   → "von ihm"
 *   "bei du"   → "bei dir"
 *
 * Safely detectable: ich, du, er, wir — pronouns where nominative ≠ dative.
 * Skipped intentionally:
 *   • ihr — also the dative form of 'sie' (she), so "mit ihr" is CORRECT
 *   • sie, es — accusative = nominative; no reliable error signal
 *
 * Rule ID: 'de-dat-prep-pronoun'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  const DAT_PREPS = new Set([
    'aus', 'bei', 'mit', 'nach', 'seit', 'von', 'zu', 'gegenüber',
  ]);

  // Nominative → dative, only for pronouns where the two forms differ and
  // the nominative form has no legitimate post-preposition reading.
  const NOM_TO_DAT = new Map([
    ['ich', 'mir'],
    ['du',  'dir'],
    ['er',  'ihm'],
    ['wir', 'uns'],
  ]);

  const rule = {
    id: 'de-dat-prep-pronoun',
    languages: ['de'],
    priority: 33,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Grammar hint — dative personal pronoun after preposition; not spellcheck',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      if (!finding || !finding.original) {
        return {
          nb: 'Personlig pronomen i feil kasus etter dativpreposisjon.',
          nn: 'Personleg pronomen i feil kasus etter dativpreposisjon.',
          en: 'Personal pronoun in wrong case after a dative preposition.',
        };
      }
      const prep = finding.prep ? `<em>${esc(finding.prep)}</em>` : 'dativpreposisjonen';
      const orig = esc(finding.original);
      const fix  = esc(finding.fix || '');
      return {
        nb: `Preposisjonen ${prep} styrer alltid dativ — <em>${orig}</em> er subjektsform (nominativ). Prøv <em>${fix}</em>.`,
        nn: `Preposisjonen ${prep} styrer alltid dativ — <em>${orig}</em> er subjektsform (nominativ). Prøv <em>${fix}</em>.`,
        en: `The preposition ${prep} always takes the dative — <em>${orig}</em> is the subject form (nominative). Try <em>${fix}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos } = ctx;
      const out = [];

      for (let i = 1; i < tokens.length; i++) {
        const t    = tokens[i];
        const prev = tokens[i - 1];

        if (cursorPos != null) {
          if (cursorPos >= t.start    && cursorPos <= t.end)    continue;
          if (cursorPos >= prev.start && cursorPos <= prev.end) continue;
        }

        const datFix = NOM_TO_DAT.get(t.word);
        if (!datFix) continue;
        if (!DAT_PREPS.has(prev.word)) continue;

        // Sentence/clause boundary between prep and pronoun means they are
        // not a phrase: "Du kommst mit. Du bist toll." paired mit↔Du across
        // the period (Ordbank sweep 2026-07).
        if (ctx.text && /[.!?,;:]/.test(ctx.text.slice(prev.end, t.start))) continue;

        // "seit" + nominative pronoun + finite verb is the CONJUNCTION
        // reading ("seit er hier wohnt" / student "seit er wohnt hier") —
        // a temporal clause, not a prepositional phrase. Only the noun-
        // phrase reading ("seit dem Sommer") governs dative.
        if (prev.word === 'seit') {
          const nxt = tokens[i + 1];
          const knownFinite = (w) =>
            (ctx.vocab && ctx.vocab.knownPresens && ctx.vocab.knownPresens.has(w)) ||
            (ctx.vocab && ctx.vocab.knownPreteritum && ctx.vocab.knownPreteritum.has(w));
          if (nxt && knownFinite(nxt.word)) continue;
        }

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: datFix,
          prep: prev.display,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
