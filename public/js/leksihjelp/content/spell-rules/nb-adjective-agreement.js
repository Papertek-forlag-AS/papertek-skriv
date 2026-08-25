/**
 * Spell-check rule: NB/NN attributive neuter adjective agreement (priority 14).
 *
 * A neuter (et-) noun requires the -t neuter form of the adjective:
 *   Wrong:   "et rød eple"   → "et rødt eple"
 *   Wrong:   "et stor hus"   → "et stort hus"
 *   Correct: "et rødt eple"  → no flag
 *   Correct: "et viktig møte" → no flag (viktig is invariant)
 *
 * PRECISION (data-driven, attributive slice only):
 *   - Frame is exactly [et][adjective][neuter noun] — the indefinite-neuter
 *     article confirms the agreement context. Predicative agreement ("eplet er
 *     rød") is NOT handled (needs subject-gender resolution).
 *   - The neuter form comes from vocab.adjNeuter (maskulin→noytrum, built ONLY
 *     where they differ), so invariant + -ig/-sk + already-neuter adjectives
 *     (viktig, norsk, absurd, svart) have no entry and never fire, and irregular
 *     forms (blå→blått, ny→nytt) get the correct suffix — not a naive +t.
 *   - Fires only when the noun is genuinely neuter (so "et stor bil" — wrong
 *     ARTICLE, not adjective — is left to the gender rule).
 *
 * Severity: warning (P2 amber). Rule ID: 'nb-adjective-agreement'.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase: coreMatchCase } = core;
  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original && original[0] >= 'A' && original[0] <= 'Z') return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
  }

  function genusIsNeuter(raw) {
    if (!raw) return false;
    return String(raw).split('/').includes('n');
  }

  const rule = {
    id: 'nb-adjective-agreement',
    languages: ['nb', 'nn'],
    priority: 14,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Attributive neuter adjective agreement; grammatical, not lookup — exceeds Chrome native spellcheck parity',
      category: 'grammar-lookup',
    },
    explain(finding) {
      const fix = finding.fix || '';
      const orig = finding.original || '';
      return {
        nb: `Intetkjønnsord (<em>et</em>-ord) krever <strong>-t</strong> på adjektivet: skriv <em>et ${fix}</em>, ikke <em>et ${orig}</em>.`,
        nn: `Inkjekjønnsord (<em>eit</em>-ord) krev <strong>-t</strong> på adjektivet: skriv <em>eit ${fix}</em>, ikkje <em>eit ${orig}</em>.`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'nb' && ctx.lang !== 'nn') return [];
      const { tokens, cursorPos } = ctx;
      if (!tokens || tokens.length < 3) return [];
      const vocab = ctx.vocab || {};
      const adjNeuter = vocab.adjNeuter;
      const nounGenus = vocab.nounGenus;
      if (!adjNeuter || adjNeuter.size === 0 || !nounGenus) return [];
      const knownPresens = vocab.knownPresens || new Set();
      const verbInfinitive = vocab.verbInfinitive || new Set();
      const out = [];

      for (let i = 0; i + 2 < tokens.length; i++) {
        const art = tokens[i];
        if (art.word !== 'et' && art.word !== 'eit') continue; // indefinite neuter article (nb/nn)

        const adj = tokens[i + 1];
        const neuter = adjNeuter.get(adj.word);
        if (!neuter) continue;                                  // invariant / already -t / not an adj key
        if (neuter.toLowerCase() === adj.word) continue;        // already neuter
        if (knownPresens.has(adj.word) || verbInfinitive.has(adj.word)) continue; // verb homograph guard

        const noun = tokens[i + 2];
        if (!genusIsNeuter(nounGenus.get(noun.word))) continue; // noun must really be neuter

        if (cursorPos != null && cursorPos >= adj.start && cursorPos <= adj.end + 1) continue;

        const fix = matchCase(adj.display, neuter);
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: adj.start,
          end: adj.end,
          original: adj.display,
          fix,
          message: `Intetkjønn: «et ${adj.display} ${noun.display}» → «et ${fix} ${noun.display}» (adjektivet trenger -t)`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
