/**
 * Spell-check rule: FR adjective irregular plural -al→-aux (ADJPLUR-FR-01).
 *
 * Most French adjectives ending in -al form their masculine plural in -aux:
 * national→nationaux, local→locaux, social→sociaux. Students apply the regular
 * -s and write a non-word:
 *
 *   Flagged:  "problèmes locals"     → "locaux"
 *   Flagged:  "journaux nationals"    → "nationaux"
 *   OK:       "problèmes locaux"      (already correct)
 *   OK:       "combats navals"        (naval genuinely takes -als — not mapped)
 *
 * Data-driven from frAdjPluralMap (seam-built from the FR adjective bank: every
 * -al adjective the data confirms takes -aux maps its wrong -als form → the -aux
 * form). The wrong -als forms are non-words → 0 FP; the -als exceptions
 * (naval/banal/fatal/final/idéal) aren't in the map. The suggestion is computed
 * from the headword so accents are preserved.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const rule = {
    id: 'fr-adj-plural',
    languages: ['fr'],
    priority: 15,
    severity: 'error',
    exam: {
      safe: true,
      reason: 'Irregular adjective-plural spelling fix (locals→locaux) — single-token, Chrome native parity',
      category: 'spellcheck',
    },
    explain: (finding) => ({
      nb: `Franske adjektiv på <em>-al</em> får uregelrett flertall på <em>-aux</em> i hankjønn, ikke <em>-als</em>. Skriv <em>${finding.fix}</em>.`,
      nn: `Franske adjektiv på <em>-al</em> får uregelrett fleirtal på <em>-aux</em> i hankjønn, ikkje <em>-als</em>. Skriv <em>${finding.fix}</em>.`,
      en: `French adjectives ending in <em>-al</em> form an irregular masculine plural in <em>-aux</em>, not <em>-als</em>. Write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      const map = (ctx.vocab && ctx.vocab.frAdjPluralMap instanceof Map) ? ctx.vocab.frAdjPluralMap : null;
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
