/**
 * Spell-check rule: ES ñ-omission (ENYE-01).
 *
 * Norwegian keyboards lack ñ, so students drop the tilde: "nino" → "niño",
 * "manana" → "mañana", "pequeno" → "pequeño". This is a pure diacritic-omission
 * spelling error (Chrome's Spanish spellcheck catches it too → exam-safe).
 *
 * Data-driven from the curated esEnyeMap (papertek es/enyebank.json): keys are
 * ascii forms that are GENUINE NON-WORDS, so flagging them can never be a false
 * positive. Ambiguous pairs where the ascii form IS a real Spanish word are
 * deliberately excluded from the data (año/ano, uña/una, campaña/campana,
 * piña/pina, caña/cana…), so this rule never has to disambiguate by context.
 *
 *   Flagged:  "Veo un nino."   → "niño"
 *   OK:       "El niño juega."  (already correct)
 *   OK:       "Tengo un ano."   (ano is a real word — excluded from the data)
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const rule = {
    id: 'es-enye',
    languages: ['es'],
    priority: 15,
    severity: 'error',
    exam: {
      safe: true,
      reason: 'ñ-omission is a single-token diacritic spelling fix — Chrome native parity',
      category: 'spellcheck',
    },
    explain: (finding) => ({
      nb: `Norske tastatur mangler <em>ñ</em>, så den faller lett bort. Spansk <em>n</em> og <em>ñ</em> er to forskjellige bokstaver — skriv <em>${finding.fix}</em>.`,
      nn: `Norske tastatur manglar <em>ñ</em>, så han fell lett bort. Spansk <em>n</em> og <em>ñ</em> er to ulike bokstavar — skriv <em>${finding.fix}</em>.`,
      en: `Norwegian keyboards lack <em>ñ</em>, so it's easy to drop. Spanish <em>n</em> and <em>ñ</em> are two different letters — write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const enye = (ctx.vocab && ctx.vocab.esEnyeMap instanceof Map) ? ctx.vocab.esEnyeMap : null;
      if (!enye || !enye.size) return [];
      const { tokens, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const tok = tokens[i];
        const correct = enye.get(tok.word);
        if (!correct) continue;
        if (cursorPos != null && cursorPos >= tok.start && cursorPos <= tok.end) continue;
        const fix = typeof matchCase === 'function' ? matchCase(tok.display, correct) : correct;
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          start: tok.start,
          end: tok.end,
          original: tok.display,
          fix,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
