/**
 * Spell-check rule: German possessive pronoun missing accusative -n ending
 * after a pure accusative preposition + masculine noun (priority 32).
 *
 * Accusative prepositions (durch, für, gegen, ohne, um, wider) always take
 * accusative. For masculine nouns, possessives need an -n ending:
 *   "für mein Vater"   → "für meinen Vater"
 *   "ohne sein Bruder" → "ohne seinen Bruder"
 *
 * Coverage is intentionally narrow: feminine and neuter possessives are
 * identical in nominative and accusative ("für meine Mutter" ✓, "für mein
 * Kind" ✓), so this rule only fires when the following noun is masculine.
 *
 * Detection: [acc-prep] [poss-nominative] [uppercase-noun with genus='m']
 * Fix: the accusative masculine form (meinen, deinen, seinen, …).
 *
 * Rule ID: 'de-accusative-possessive'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Pure accusative prepositions — always take accusative case.
  const ACCUSATIVE_PREPS = new Set([
    'durch', 'für', 'gegen', 'ohne', 'um', 'wider',
  ]);

  // Nominative (and feminine/neuter accusative) base forms — maps to the
  // accusative masculine fix. Keyed by lowercased token.word.
  // Excludes already-correct masculine accusative forms (meinen, deinen, …).
  const POSS_NOM = new Map([
    ['mein',   'meinen'],
    ['meine',  'meinen'],
    ['dein',   'deinen'],
    ['deine',  'deinen'],
    ['sein',   'seinen'],
    ['seine',  'seinen'],
    ['ihr',    'ihren'],
    ['ihre',   'ihren'],
    ['unser',  'unseren'],
    ['unsere', 'unseren'],
    ['euer',   'euren'],
    ['eure',   'euren'],
  ]);

  const rule = {
    id: 'de-accusative-possessive',
    languages: ['de'],
    priority: 32,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Grammar hint — accusative masculine possessive case; not spellcheck',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      if (!finding || !finding.original) {
        return {
          nb: 'Possessivpronomen mangler akkusativ -n-endelse (maskulinum).',
          nn: 'Possessivpronomen manglar akkusativ -n-ending (maskulinum).',
          en: 'Possessive pronoun missing accusative -n ending (masculine).',
        };
      }
      const prep = finding.prep ? `<em>${esc(finding.prep)}</em>` : 'akkusativpreposisjonen';
      const orig = esc(finding.original);
      const fix  = esc(finding.fix || '');
      return {
        nb: `Preposisjonen ${prep} styrer alltid akkusativ — maskuline substantiver krever <em>-n</em>-endelse på possesivet. Prøv <em>${fix}</em> i stedet for <em>${orig}</em>.`,
        nn: `Preposisjonen ${prep} styrer alltid akkusativ — maskuline substantiv krev <em>-n</em>-ending på possessiven. Prøv <em>${fix}</em> i staden for <em>${orig}</em>.`,
        en: `The preposition ${prep} always takes the accusative — masculine nouns require the <em>-n</em> ending on the possessive. Try <em>${fix}</em> instead of <em>${orig}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      // All plural noun surface forms. Accusative PLURAL of a possessive is
      // "ihre/meine/…" (identical to nominative), so a plural noun after the
      // possessive is NOT the masculine-singular -n context this rule targets:
      // "für ihre Kunden/Patienten/Träume" is correct (the head nouns are
      // masc-SINGULAR der Kunde/Patient/Traum, but here they are plural).
      const allPluralForms = (function () {
        if (vocab.__deAccPluralForms) return vocab.__deAccPluralForms;
        const all = new Set();
        const nf = vocab.nounForms;
        if (nf && typeof nf.values === 'function') {
          for (const forms of nf.values()) {
            if (forms && forms.plural) for (const p of forms.plural) all.add(String(p).toLowerCase());
          }
        }
        vocab.__deAccPluralForms = all;
        return all;
      })();
      const out = [];

      for (let i = 1; i < tokens.length - 1; i++) {
        const t    = tokens[i];
        const prev = tokens[i - 1];
        const next = tokens[i + 1];

        if (cursorPos != null) {
          if (cursorPos >= t.start    && cursorPos <= t.end)    continue;
          if (cursorPos >= prev.start && cursorPos <= prev.end) continue;
          if (cursorPos >= next.start && cursorPos <= next.end) continue;
        }

        const accFix = POSS_NOM.get(t.word);
        if (!accFix) continue;

        // Left token must be a pure accusative preposition.
        if (!ACCUSATIVE_PREPS.has(prev.word)) continue;

        // Right token must be an uppercase noun.
        const nextIsUpper = next.display &&
          next.display[0] === next.display[0].toUpperCase() &&
          next.display[0] !== next.display[0].toLowerCase();
        if (!nextIsUpper) continue;

        // Plural noun → acc plural possessive is "ihre/meine/…" (= nominative),
        // not the masc-sg -n form. Skip ("für ihre Kunden" is correct).
        if (allPluralForms.has(next.word)) continue;

        // Only fire for masculine nouns — f/n accusative is identical to nominative.
        let genus = nounGenus.get(next.word);
        if (!genus && next.word.length >= 6) {
          for (let cut = next.word.length - 3; cut >= 3; cut--) {
            const g = nounGenus.get(next.word.slice(cut));
            if (g) { genus = g; break; }
          }
        }
        if (genus !== 'm') continue;

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
