/**
 * Spell-check rule: FR irregular comparative *plus bon → meilleur* (PLUSBON-01).
 *
 * French has suppletive comparatives: the comparative of "bon" is "meilleur"
 * (not *plus bon), and of "bien" is "mieux" (not *plus bien). Norwegian/English
 * build them regularly ("mer god"/"more good"), so learners write *plus bon:
 *
 *   Flagged:  "plus bon"    → "meilleur"
 *   Flagged:  "plus bonne"   → "meilleure"
 *   Flagged:  "plus bien"    → "mieux"
 *   OK:       "Il n'est plus bon."  (ne … plus = "no longer", not a comparative)
 *   OK:       "plus bon marché"     (fixed idiom = cheaper)
 *
 * Precision-first: closed map of bon/bonne/bons/bonnes/bien. Two guards remove the
 * only ambiguous readings — a preceding ne/n'/non ("ne … plus" = no longer; "non
 * plus" = neither) and a following "marché" (bon marché idiom). Superlative "le
 * plus bon" → "le meilleur" still corrects correctly (the article is untouched).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase } = host.__lexiSpellCore || {};

  const COMP = {
    bon: 'meilleur', bonne: 'meilleure', bons: 'meilleurs', bonnes: 'meilleures',
    bien: 'mieux',
  };
  // A preceding negator turns "plus" into "no longer" (ne … plus) or "neither"
  // (non plus). The elided "ne" is glued to the verb by the tokenizer ("n'est"),
  // so match the n'-prefix too, not just the bare particles.
  function isNegator(w) {
    return w === 'ne' || w === 'non' || (w.length > 1 && w.charCodeAt(0) === 110 && w.charCodeAt(1) === 39);
  }

  const rule = {
    id: 'fr-plus-bon',
    languages: ['fr'],
    priority: 16,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Irregular comparative (plus bon→meilleur) — multi-token syntactic check',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Fransk har uregelrette komparativer: <em>bon</em> → <strong>meilleur</strong> og <em>bien</em> → <strong>mieux</strong> (ikke «plus bon»/«plus bien»). Skriv <em>${finding.fix}</em>.`,
      nn: `Fransk har uregelrette komparativar: <em>bon</em> → <strong>meilleur</strong> og <em>bien</em> → <strong>mieux</strong> (ikkje «plus bon»/«plus bien»). Skriv <em>${finding.fix}</em>.`,
      en: `French has suppletive comparatives: <em>bon</em> → <strong>meilleur</strong> and <em>bien</em> → <strong>mieux</strong> (not "plus bon"/"plus bien"). Write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      const { tokens, text, cursorPos } = ctx;
      const out = [];
      for (let i = 0; i + 1 < tokens.length; i++) {
        if (tokens[i].word !== 'plus') continue;
        const comp = COMP[tokens[i + 1].word];
        if (!comp) continue;

        // ne … plus / non plus → "plus" means "no longer/neither", not comparative.
        let negated = false;
        for (let k = 1; k <= 3 && i - k >= 0; k++) {
          if (isNegator(tokens[i - k].word)) { negated = true; break; }
        }
        if (negated) continue;
        // "plus bon marché" (cheaper) is a fixed idiom — leave it.
        if (tokens[i + 2] && tokens[i + 2].word === 'marché') continue;

        const gap = text.slice(tokens[i].end, tokens[i + 1].start);
        if (/[^ \t]/.test(gap)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i + 1].end) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          start: tokens[i].start,
          end: tokens[i + 1].end,
          original: text.slice(tokens[i].start, tokens[i + 1].end),
          fix: typeof matchCase === 'function' ? matchCase(tokens[i].display, comp) : comp,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
