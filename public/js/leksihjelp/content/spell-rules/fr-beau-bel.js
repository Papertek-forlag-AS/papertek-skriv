/**
 * Spell-check rule: FR euphonic prenominal adjectives (BEL-01).
 *
 * Before a masculine noun beginning with a vowel sound, French uses the special
 * prenominal forms bel/nouvel/vieil/fol/mol instead of beau/nouveau/vieux/fou/mou
 * (for the liaison): "un bel ami", "un nouvel appartement", "un vieil arbre".
 * Students keep the consonant form:
 *
 *   Flagged:  "un beau ami"          → "bel"
 *   Flagged:  "un nouveau appartement" → "nouvel"
 *   OK:       "un beau jardin"        (consonant-initial noun → beau)
 *   OK:       "un bel ami"            (already correct)
 *
 * Precision-first: fires only on beau/nouveau/vieux/fou/mou + a MASCULINE
 * vowel-initial NOUN (nounGenus = 'm'). h-initial nouns are skipped (h-aspiré
 * like "héros" blocks the liaison and would be a false positive); the masculine
 * guard prevents "beau" + feminine (which would be "belle", not "bel").
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const FORMS = { beau: 'bel', nouveau: 'nouvel', vieux: 'vieil', fou: 'fol', mou: 'mol' };
  const VOWEL_INITIAL = /^[aàâäeéèêëiîïoôöuùûüœ]/;

  const rule = {
    id: 'fr-beau-bel',
    languages: ['fr'],
    priority: 16,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Euphonic prenominal form before a vowel — two-token syntactic check',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Foran et hankjønnsord som begynner med vokal bruker fransk <em>bel/nouvel/vieil</em> i stedet for <em>beau/nouveau/vieux</em> (for bindingen): <em>un bel ami</em>. Skriv <em>${finding.fix}</em>.`,
      nn: `Framfor eit hankjønnsord som byrjar med vokal brukar fransk <em>bel/nouvel/vieil</em> i staden for <em>beau/nouveau/vieux</em> (for bindinga): <em>un bel ami</em>. Skriv <em>${finding.fix}</em>.`,
      en: `Before a masculine noun starting with a vowel, French uses <em>bel/nouvel/vieil</em> instead of <em>beau/nouveau/vieux</em> (for the liaison): <em>un bel ami</em>. Write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      const v = ctx.vocab || {};
      const nounGenus = v.nounGenus instanceof Map ? v.nounGenus : null;
      if (!nounGenus || !nounGenus.size) return [];
      const { tokens, text, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i + 1 < tokens.length; i++) {
        const repl = FORMS[tokens[i].word];
        if (!repl) continue;
        const nw = tokens[i + 1].word;
        if (!VOWEL_INITIAL.test(nw)) continue;      // vowel-initial only (skips h/y/consonants)
        if (nounGenus.get(nw) !== 'm') continue;    // masculine noun (else it'd be belle, not bel)

        const gap = text.slice(tokens[i].end, tokens[i + 1].start);
        if (/[^ \t]/.test(gap)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i].end) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          start: tokens[i].start,
          end: tokens[i].end,
          original: tokens[i].display,
          fix: typeof matchCase === 'function' ? matchCase(tokens[i].display, repl) : repl,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
