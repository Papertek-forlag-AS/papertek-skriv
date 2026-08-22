/**
 * Spell-check rule: ES possessive number agreement (POSS-01).
 *
 * Spanish short possessives agree with the POSSESSED noun in number:
 * mi→mis, tu→tus, su→sus before a plural noun. Norwegian "min/mi/mitt/mine"
 * agrees differently, so learners leave the singular form:
 *
 *   Flagged:  "mi libros"  → "mis"
 *   Flagged:  "su casas"    → "sus"
 *   OK:       "mi libro"    (singular — agrees)
 *   OK:       "mis libros"  (already plural)
 *   OK:       "Tú eres mi amigo." (accented tú is the pronoun; mi amigo is singular)
 *
 * Precision-first: fires only on mi/tu/su immediately followed by a PLURAL noun.
 * Plurality uses the proven (nounGenus AND NOT nounLemmaGenus) heuristic — a
 * surface form that exists but is not a singular lemma. The accented pronouns
 * mí/tú keep their accent as distinct tokens, so they never match.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const POSS = { mi: 'mis', tu: 'tus', su: 'sus' };

  const rule = {
    id: 'es-possessive-number',
    languages: ['es'],
    priority: 18,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Possessive–noun number agreement across two tokens — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Spanske eiendomsord retter seg etter substantivets tall. Foran flertall må <em>${finding.original}</em> bli <em>${finding.fix}</em>.`,
      nn: `Spanske eigedomsord rettar seg etter talet på substantivet. Framfor fleirtal må <em>${finding.original}</em> bli <em>${finding.fix}</em>.`,
      en: `Spanish possessives agree with the noun's number. Before a plural, <em>${finding.original}</em> must become <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const v = ctx.vocab || {};
      const nounGenus = v.nounGenus instanceof Map ? v.nounGenus : null;
      const nounLemmaGenus = v.nounLemmaGenus instanceof Map ? v.nounLemmaGenus : null;
      if (!nounGenus || !nounGenus.size || !nounLemmaGenus) return [];
      // Only "tu" has a subject-pronoun homograph (tú): "tu sales temprano" is
      // "tú sales" (you leave), not "your salts". mi/su are unambiguously
      // possessive, so they need no verb guard.
      const presens = v.esPresensToVerb instanceof Map ? v.esPresensToVerb : null;
      const preterit = v.esPreteritumToVerb instanceof Map ? v.esPreteritumToVerb : null;
      const { tokens, text, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const word = tokens[i].word;
        const fix = POSS[word];
        if (!fix) continue;

        const nw = tokens[i + 1].word;
        // Plural = a known noun surface form that is NOT a singular lemma.
        if (!nounGenus.has(nw) || nounLemmaGenus.has(nw)) continue;
        // For "tu", skip when the next token is a verb form (subject pronoun + verb).
        if (word === 'tu' && ((presens && presens.has(nw)) || (preterit && preterit.has(nw)))) continue;

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
          fix: typeof matchCase === 'function' ? matchCase(tokens[i].display, fix) : fix,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
