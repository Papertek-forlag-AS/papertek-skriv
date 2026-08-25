/**
 * Spell-check rule: FR avoir-idiom (être→avoir) (AVOIR-01).
 *
 * French expresses many states with avoir (to have) where Norwegian/English use
 * "be": j'ai faim (I'm hungry), j'ai soif, j'ai peur, j'ai raison. Students
 * calque "I am hungry" → "je suis faim", which is ungrammatical (faim is a noun).
 *
 *   Flagged:  "je suis faim"  → "j'ai"   (j'ai faim)
 *   Flagged:  "Tu es soif"     → "Tu as"
 *   OK:       "j'ai faim"       (already avoir)
 *   OK:       "je suis content" (content is an adjective — être is correct)
 *
 * Precision-first: fires only on [subject pronoun] + [être form] + [an
 * unambiguous avoir-idiom NOUN]. The trigger nouns (faim, soif, peur, raison,
 * tort, sommeil, honte, envie, besoin) are ungrammatical with être, so there is
 * no ambiguity. froid/chaud are deliberately EXCLUDED (être froid = emotionally
 * cold / object temperature is valid). Closed-class logic.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  const SUBJECTS = new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles']);
  const ETRE_TO_AVOIR = {
    suis: 'ai', es: 'as', est: 'a', sommes: 'avons',
    'êtes': 'avez', etes: 'avez', sont: 'ont',
  };
  // Unambiguous avoir-idiom nouns (never grammatical with être).
  const AVOIR_NOUNS = new Set([
    'faim', 'soif', 'peur', 'raison', 'tort', 'sommeil',
    'honte', 'envie', 'besoin', 'sommeils',
  ]);

  const rule = {
    id: 'fr-avoir-idiom',
    languages: ['fr'],
    priority: 19,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'être→avoir idiom across pronoun+copula+noun — syntactic, not single-token',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `På fransk bruker man <em>avoir</em> (å ha) for slike tilstander, ikke <em>être</em> (å være): <em>${finding.fix} ${finding.noun}</em>, ikke <em>${finding.original} ${finding.noun}</em>.`,
      nn: `På fransk brukar ein <em>avoir</em> (å ha) for slike tilstandar, ikkje <em>être</em> (å vere): <em>${finding.fix} ${finding.noun}</em>, ikkje <em>${finding.original} ${finding.noun}</em>.`,
      en: `French uses <em>avoir</em> (to have) for these states, not <em>être</em> (to be): <em>${finding.fix} ${finding.noun}</em>, not <em>${finding.original} ${finding.noun}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      const { tokens, text, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i + 2 < tokens.length; i++) {
        if (!SUBJECTS.has(tokens[i].word)) continue;
        const avoirForm = ETRE_TO_AVOIR[tokens[i + 1].word];
        if (!avoirForm) continue;
        if (!AVOIR_NOUNS.has(tokens[i + 2].word)) continue;

        // Require pronoun–être–noun adjacency (only whitespace between).
        const g1 = text.slice(tokens[i].end, tokens[i + 1].start);
        const g2 = text.slice(tokens[i + 1].end, tokens[i + 2].start);
        if (/[^ \t]/.test(g1) || /[^ \t]/.test(g2)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i + 1].end) continue;

        const pron = tokens[i].display;
        let fix;
        if (tokens[i].word === 'je') {
          fix = (pron[0] === 'J' ? "J'" : "j'") + avoirForm; // elision: je + ai → j'ai
        } else {
          fix = pron + ' ' + avoirForm;
        }

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          start: tokens[i].start,
          end: tokens[i + 1].end,
          original: pron + ' ' + tokens[i + 1].display,
          fix,
          noun: tokens[i + 2].display,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
