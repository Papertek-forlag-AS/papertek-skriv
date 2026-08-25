/**
 * Spell-check rule: FR cedilla omission (CEDILLE-01).
 *
 * Norwegian keyboards lack ç, so students drop the cedilla: "francais"→"français",
 * "garcon"→"garçon", "facon"→"façon", "recu"→"reçu". The cedilla keeps the /s/
 * sound of c before a/o/u; without it the word reads /k/ and is a non-word, so
 * the restoration is unambiguous — flagging can never be a false positive.
 *
 *   Flagged:  "Le garcon joue."  → "garçon"
 *   OK:       "Le garçon joue."  (already correct)
 *   OK:       "Cette place..."   (place is a real word — not a ç-word's stripped form)
 *
 * Data-driven from the derived frCedilleMap (built in the seam from the FR
 * dictionary's canonical forms). No hardcoded word list; ça/ca-type collisions
 * are excluded at build time.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const rule = {
    id: 'fr-cedille',
    languages: ['fr'],
    priority: 15,
    severity: 'error',
    exam: {
      safe: true,
      reason: 'ç-omission is a single-token diacritic spelling fix — Chrome native parity',
      category: 'spellcheck',
    },
    explain: (finding) => ({
      nb: `Norske tastatur mangler <em>ç</em>, så cedillen faller lett bort. <em>ç</em> gir c-en en s-lyd foran a/o/u — uten den blir ordet feil. Skriv <em>${finding.fix}</em>.`,
      nn: `Norske tastatur manglar <em>ç</em>, så cedillen fell lett bort. <em>ç</em> gjev c-en ein s-lyd framfor a/o/u — utan han blir ordet feil. Skriv <em>${finding.fix}</em>.`,
      en: `Norwegian keyboards lack <em>ç</em>, so the cedilla is easily dropped. <em>ç</em> gives c an /s/ sound before a/o/u — without it the word is wrong. Write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      const map = (ctx.vocab && ctx.vocab.frCedilleMap instanceof Map) ? ctx.vocab.frCedilleMap : null;
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
