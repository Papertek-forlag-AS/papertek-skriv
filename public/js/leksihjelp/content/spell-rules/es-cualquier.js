/**
 * Spell-check rule: ES cualquiera→cualquier apocope (CUAL-01).
 *
 * Spanish "cualquiera" shortens to "cualquier" directly before a singular noun
 * (either gender): "cualquier momento", "cualquier persona". The full form
 * "cualquiera" is kept as a standalone pronoun ("cualquiera puede") and after a
 * noun ("una persona cualquiera"). Students leave the long form before a noun:
 *
 *   Flagged:  "cualquiera momento"  → "cualquier"
 *   Flagged:  "cualquiera persona"  → "cualquier"
 *   OK:       "cualquiera puede"    (pronoun, followed by a verb)
 *   OK:       "persona cualquiera"  (postnominal)
 *
 * Precision-first: fires only on "cualquiera" + a noun (nounGenus). The pronoun
 * uses ("cualquiera de", "cualquiera que", "cualquiera puede") are never nouns,
 * so they are untouched. Deterministic — "cualquiera + noun" is always apocopated.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const rule = {
    id: 'es-cualquier',
    languages: ['es'],
    priority: 17,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'cualquiera→cualquier apocope before a noun — two-token syntactic check',
      category: 'grammar-lookup',
    },
    explain: () => ({
      nb: `På spansk kortes <em>cualquiera</em> ned til <strong>cualquier</strong> rett foran et substantiv i entall: <em>cualquier momento</em>, <em>cualquier persona</em>. Den fulle formen <em>cualquiera</em> brukes alene (som pronomen) og etter substantivet.`,
      nn: `På spansk vert <em>cualquiera</em> korta ned til <strong>cualquier</strong> rett framfor eit substantiv i eintal: <em>cualquier momento</em>, <em>cualquier persona</em>. Den fulle forma <em>cualquiera</em> vert brukt åleine (som pronomen) og etter substantivet.`,
      en: `In Spanish, <em>cualquiera</em> shortens to <strong>cualquier</strong> directly before a singular noun: <em>cualquier momento</em>, <em>cualquier persona</em>. The full form <em>cualquiera</em> is kept on its own (as a pronoun) and after the noun.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const v = ctx.vocab || {};
      const nounGenus = v.nounGenus instanceof Map ? v.nounGenus : null;
      if (!nounGenus || !nounGenus.size) return [];
      const { tokens, text, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i + 1 < tokens.length; i++) {
        if (tokens[i].word !== 'cualquiera') continue;
        const next = tokens[i + 1];
        if (!nounGenus.has(next.word)) continue;

        const gap = text.slice(tokens[i].end, next.start);
        if (/[^ \t]/.test(gap)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i].end) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          start: tokens[i].start,
          end: tokens[i].end,
          original: tokens[i].display,
          fix: typeof matchCase === 'function' ? matchCase(tokens[i].display, 'cualquier') : 'cualquier',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
