/**
 * Spell-check rule: German possessive pronoun in wrong case after a pure dative
 * preposition (priority 30).
 *
 * Pure dative prepositions (aus, bei, mit, nach, seit, von, zu, gegenüber)
 * always require the dative case. Students (especially Norwegian L1) often
 * place the possessive in nominative/accusative base form instead:
 *   "mit meine Mutter"  → "mit meiner Mutter"
 *   "mit mein Vater"    → "mit meinem Vater"
 *
 * Detection pattern: [dative-prep] [poss-nominative] [uppercase-noun]
 * Only nominative/accusative base forms are flagged. Dative forms
 * (meiner/meinem) and genitive forms (meines) are left alone.
 *
 * Rule ID: 'de-dative-possessive'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Pure dative prepositions — always require dative, no ambiguity.
  const DATIVE_PREPS = new Set([
    'aus', 'bei', 'mit', 'nach', 'seit', 'von', 'zu', 'gegenüber',
  ]);

  // Nominative/accusative base forms. Keyed by lowercased token.word.
  // Maps to the dative form (dat_mn = masc/neut, dat_f = fem/pl).
  const POSS_NOM = new Map([
    ['mein',   { dat_mn: 'meinem',  dat_f: 'meiner'  }],
    ['meine',  { dat_mn: 'meinem',  dat_f: 'meiner'  }],
    ['dein',   { dat_mn: 'deinem',  dat_f: 'deiner'  }],
    ['deine',  { dat_mn: 'deinem',  dat_f: 'deiner'  }],
    ['sein',   { dat_mn: 'seinem',  dat_f: 'seiner'  }],
    ['seine',  { dat_mn: 'seinem',  dat_f: 'seiner'  }],
    ['ihr',    { dat_mn: 'ihrem',   dat_f: 'ihrer'   }],
    ['ihre',   { dat_mn: 'ihrem',   dat_f: 'ihrer'   }],
    ['unser',  { dat_mn: 'unserem', dat_f: 'unserer' }],
    ['unsere', { dat_mn: 'unserem', dat_f: 'unserer' }],
    ['euer',   { dat_mn: 'eurem',   dat_f: 'eurer'   }],
    ['eure',   { dat_mn: 'eurem',   dat_f: 'eurer'   }],
  ]);

  const rule = {
    id: 'de-dative-possessive',
    languages: ['de'],
    priority: 30,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Grammar hint — dative possessive case suggestion; not spellcheck',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      if (!finding || !finding.original) {
        return {
          nb: 'Possessivpronomen i feil kasus etter dativpreposisjon.',
          nn: 'Possessivpronomen i feil kasus etter dativpreposisjon.',
          en: 'Possessive pronoun in wrong case after a dative preposition.',
        };
      }
      const prep = finding.prep ? `<em>${esc(finding.prep)}</em>` : 'dativpreposisjonen';
      const orig = esc(finding.original);
      const fix  = esc(finding.fix || '');
      return {
        nb: `Preposisjonen ${prep} styrer alltid dativ — <em>${orig}</em> er i nominativform. Prøv <em>${fix}</em>.`,
        nn: `Preposisjonen ${prep} styrer alltid dativ — <em>${orig}</em> er i nominativform. Prøv <em>${fix}</em>.`,
        en: `The preposition ${prep} always takes the dative — <em>${orig}</em> is in nominative form. Try <em>${fix}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
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

        const poss = POSS_NOM.get(t.word);
        if (!poss) continue;

        // Left token must be a pure dative preposition
        if (!DATIVE_PREPS.has(prev.word)) continue;

        // Right token must be an uppercase noun (German mandatory capitalisation)
        const nextIsUpper = next.display &&
          next.display[0] === next.display[0].toUpperCase() &&
          next.display[0] !== next.display[0].toLowerCase();
        if (!nextIsUpper) continue;

        // Look up the genus of the right-side noun.
        // Compound-suffix scan: "Lieblingsserie" → "serie" → 'f'.
        let genus = nounGenus.get(next.word);
        if (!genus && next.word.length >= 6) {
          for (let cut = next.word.length - 3; cut >= 3; cut--) {
            const g = nounGenus.get(next.word.slice(cut));
            if (g) { genus = g; break; }
          }
        }

        const datForm = genus ? (genus === 'f' ? poss.dat_f : poss.dat_mn) : null;
        if (!datForm) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: datForm,
          prep: prev.display,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
