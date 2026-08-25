/**
 * Spell-check rule: German nominative personal pronoun after a pure accusative
 * preposition (de-acc-prep-pronoun, priority 34).
 *
 * Accusative prepositions (durch, für, gegen, ohne, um, wider) always govern
 * the accusative case. Norwegian L1 students often keep the subject form:
 *   "für ich"   → "für mich"
 *   "ohne er"   → "ohne ihn"
 *   "gegen du"  → "gegen dich"
 *
 * Safely detectable: ich, du, er, wir — pronouns where nominative ≠ accusative.
 * Skipped intentionally:
 *   • ihr — also the dative form of 'sie' (she); ambiguous after any preposition
 *   • sie, es — accusative = nominative for these pronouns
 *
 * Rule ID: 'de-acc-prep-pronoun'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  const ACC_PREPS = new Set([
    'durch', 'für', 'gegen', 'ohne', 'um', 'wider',
  ]);

  // Nominative → accusative, only for pronouns where the two forms differ.
  const NOM_TO_ACC = new Map([
    ['ich', 'mich'],
    ['du',  'dich'],
    ['er',  'ihn'],
    ['wir', 'uns'],
  ]);

  const rule = {
    id: 'de-acc-prep-pronoun',
    languages: ['de'],
    priority: 34,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Grammar hint — accusative personal pronoun after preposition; not spellcheck',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      if (!finding || !finding.original) {
        return {
          nb: 'Personlig pronomen i feil kasus etter akkusativpreposisjon.',
          nn: 'Personleg pronomen i feil kasus etter akkusativpreposisjon.',
          en: 'Personal pronoun in wrong case after an accusative preposition.',
        };
      }
      const prep = finding.prep ? `<em>${esc(finding.prep)}</em>` : 'akkusativpreposisjonen';
      const orig = esc(finding.original);
      const fix  = esc(finding.fix || '');
      return {
        nb: `Preposisjonen ${prep} styrer alltid akkusativ — <em>${orig}</em> er subjektsform (nominativ). Prøv <em>${fix}</em>.`,
        nn: `Preposisjonen ${prep} styrer alltid akkusativ — <em>${orig}</em> er subjektsform (nominativ). Prøv <em>${fix}</em>.`,
        en: `The preposition ${prep} always takes the accusative — <em>${orig}</em> is the subject form (nominative). Try <em>${fix}</em>.`,
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

        const accFix = NOM_TO_ACC.get(t.word);
        if (!accFix) continue;
        if (!ACC_PREPS.has(prev.word)) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: accFix,
          prep: prev.display,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
