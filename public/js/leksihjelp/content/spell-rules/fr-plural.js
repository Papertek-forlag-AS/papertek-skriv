/**
 * Spell-check rule: FR irregular plural (PLUR-FR-01).
 *
 * French nouns ending in -al/-au/-eau/-eu form irregular plurals in -aux/-eaux/
 * -eux (animal→animaux, bateau→bateaux, cheveu→cheveux). Norwegian/English add a
 * regular -s, so students write the wrong (non-word) plural:
 *
 *   Flagged:  "Les animals"  → "animaux"
 *   Flagged:  "les journals" → "journaux"
 *   OK:       "les animaux"  (already correct)
 *   OK:       "les festivals" (festival genuinely takes -s — not in the map)
 *
 * Data-driven from the derived frPluralMap (built in the seam from the FR
 * dictionary: for every noun whose plural is -aux/-eaux/-eux, the regular -s
 * form maps to the correct plural). The wrong -s forms are non-words, so this
 * never has a false positive; nouns that really take -s (festival/bal/carnaval)
 * aren't in the map, and ciels/lieus collisions are excluded at build time.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const rule = {
    id: 'fr-plural',
    languages: ['fr'],
    priority: 15,
    severity: 'error',
    exam: {
      safe: true,
      reason: 'Irregular-plural spelling fix (animals→animaux) — single-token, Chrome native parity',
      category: 'spellcheck',
    },
    explain: (finding) => ({
      nb: `Franske substantiv på <em>-al/-au/-eau/-eu</em> får uregelrett flertall på <em>-aux/-eaux/-eux</em>, ikke <em>-s</em>. Skriv <em>${finding.fix}</em>.`,
      nn: `Franske substantiv på <em>-al/-au/-eau/-eu</em> får uregelrett fleirtal på <em>-aux/-eaux/-eux</em>, ikkje <em>-s</em>. Skriv <em>${finding.fix}</em>.`,
      en: `French nouns ending in <em>-al/-au/-eau/-eu</em> form an irregular plural in <em>-aux/-eaux/-eux</em>, not <em>-s</em>. Write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      const map = (ctx.vocab && ctx.vocab.frPluralMap instanceof Map) ? ctx.vocab.frPluralMap : null;
      if (!map || !map.size) return [];
      const { tokens, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        const correct = map.get(tok.word);
        if (!correct) continue;
        if (cursorPos != null && cursorPos >= tok.start && cursorPos <= tok.end) continue;
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          start: tok.start,
          end: tok.end,
          original: tok.display,
          fix: typeof matchCase === 'function' ? matchCase(tok.display, correct) : correct,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
