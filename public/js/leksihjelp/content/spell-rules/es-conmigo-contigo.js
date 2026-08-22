/**
 * Spell-check rule: ES conmigo/contigo/consigo contraction (CONM-01).
 *
 * Spanish has obligatory portmanteau forms for "con" + the pronouns mí/ti/sí:
 *   con + mí → conmigo, con + ti → contigo, con + sí → consigo
 * The full forms "con mí / con ti / con sí" are always wrong. Norwegian has no
 * equivalent, so students write them out.
 *
 *   Flagged:  "Ven con mí."        → "conmigo"
 *   Flagged:  "Voy con ti."         → "contigo"
 *   OK:       "Vivo con mi familia." (mi = unaccented possessive, not the pronoun)
 *   OK:       "Hablo con él."        (con + él is correct)
 *
 * Precision-first: fires only on "con" + the ACCENTED pronouns mí/sí (so the
 * possessive "mi" is never touched) or "ti" (which has no possessive homograph).
 * Closed, deterministic — these contractions are mandatory, so 0 FP by grammar.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const PRON = { 'mí': 'conmigo', 'ti': 'contigo', 'sí': 'consigo' };

  const rule = {
    id: 'es-conmigo-contigo',
    languages: ['es'],
    priority: 16,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Obligatory con+pronoun contraction across two tokens — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `På spansk smelter <em>con</em> sammen med <em>mí/ti/sí</em> til faste former: <em>conmigo, contigo, consigo</em>. Skriv <em>${finding.fix}</em>, ikke <em>${finding.original}</em>.`,
      nn: `På spansk smeltar <em>con</em> saman med <em>mí/ti/sí</em> til faste former: <em>conmigo, contigo, consigo</em>. Skriv <em>${finding.fix}</em>, ikkje <em>${finding.original}</em>.`,
      en: `In Spanish, <em>con</em> merges with <em>mí/ti/sí</em> into fixed forms: <em>conmigo, contigo, consigo</em>. Write <em>${finding.fix}</em>, not <em>${finding.original}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const { tokens, text, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i + 1 < tokens.length; i++) {
        if (tokens[i].word !== 'con') continue;
        const contraction = PRON[tokens[i + 1].word];
        if (!contraction) continue;

        const gap = text.slice(tokens[i].end, tokens[i + 1].start);
        if (/[^ \t]/.test(gap)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i + 1].end) continue;

        const orig = text.slice(tokens[i].start, tokens[i + 1].end);
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          start: tokens[i].start,
          end: tokens[i + 1].end,
          original: orig,
          fix: typeof matchCase === 'function' ? matchCase(tokens[i].display, contraction) : contraction,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
