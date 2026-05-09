/**
 * Spell-check rule: ES pro-drop overuse hint (PRON-01, priority 65).
 *
 * Phase 12. Flags redundant subject pronouns (yo, tu) before conjugated
 * verbs whose person already encodes the subject. Spanish is a pro-drop
 * language; Norwegian students habitually transfer "Jeg + verb" to
 * "Yo + verb" when the pronoun is unnecessary.
 *
 *   Flagged:  "Yo voy al mercado."  (yo is redundant — voy already = 1sg)
 *   OK:       "Voy al mercado."     (verb alone is standard pro-drop)
 *
 * Conservative start: only yo (1sg) and tu (2sg) are flagged. Third-person
 * pronouns (el, ella, etc.) are skipped due to higher false-positive risk
 * (disambiguation, emphasis is more natural with 3rd person).
 *
 * Severity: hint (P3 grey dot). Pedagogical awareness — not a hard error.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { tokensInSentence } = core;

  function escapeHtml(s) {
    const fn = core.escapeHtml;
    if (fn) return fn(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Map pronoun (accent-stripped lowercase) to the person label used in
  // esPresensToVerb / esPreteritumToVerb. Only yo and tu initially.
  const PRONOUN_TO_PERSON = {
    yo: 'yo',
    tu: 'tú',   // accent-stripped "tu" maps to accented label "tú"
  };

  // Tokens allowed between pronoun and verb (negation/adverb fillers).
  const FILLER_WORDS = new Set([
    'no', 'nunca', 'tampoco', 'también', 'tambien', 'siempre',
    'ya', 'solo', 'sólo', 'aún', 'aun',
  ]);

  const rule = {
    id: 'es-pro-drop',
    languages: ['es'],
    priority: 65,
    // exam-audit 33-03: stays safe=false — Stateful cross-sentence pro-drop reasoning; exceeds Chrome native parity
    exam: {
      safe: false,
      reason: "Stays safe=false (es-pro-drop) — Stateful cross-sentence pro-drop reasoning; exceeds Chrome native parity",
      category: "grammar-lookup",
    },
    severity: 'hint',
    explain: function (finding) {
      const pronoun = finding.pronoun || 'yo';
      return {
        nb: 'Paa spansk er subjektpronomenet <em>' + escapeHtml(pronoun) + '</em> vanligvis unodvendig naar verbformen allerede viser personen. Prov aa skrive uten <em>' + escapeHtml(pronoun) + '</em>.',
        nn: 'Paa spansk er subjektpronomenet <em>' + escapeHtml(pronoun) + '</em> vanlegvis unodvendig naar verbforma allereie viser personen. Prov aa skrive utan <em>' + escapeHtml(pronoun) + '</em>.',
        severity: 'hint',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      if (!ctx.sentences || !tokensInSentence) return [];

      const presensToVerb = ctx.vocab && ctx.vocab.esPresensToVerb;
      const preteritumToVerb = ctx.vocab && ctx.vocab.esPreteritumToVerb;
      if ((!presensToVerb || !presensToVerb.size) &&
          (!preteritumToVerb || !preteritumToVerb.size)) return [];

      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        if (range.end - range.start < 2) continue; // need pronoun + verb

        for (let i = range.start; i < range.end; i++) {
          const tokenWord = ctx.tokens[i].word; // already lowercase
          const stripped = stripAccents(tokenWord);

          const expectedPerson = PRONOUN_TO_PERSON[stripped];
          if (!expectedPerson) continue;

          // Check if the NEXT token is a noun (article + noun = "el gato", not pronoun "el")
          // For "yo" and "tu" this is less of a concern since they are unambiguous,
          // but we still do the verb scan.

          // Scan forward up to 2 tokens for a matching verb
          const scanLimit = Math.min(i + 3, range.end); // pronoun + up to 2 tokens
          let found = false;

          for (let j = i + 1; j < scanLimit; j++) {
            const verbWord = ctx.tokens[j].word;
            const verbStripped = stripAccents(verbWord);

            // Check if this is a filler word (negation/adverb)
            if (FILLER_WORDS.has(verbWord) || FILLER_WORDS.has(verbStripped)) {
              continue; // skip fillers, keep scanning
            }

            // Look up in presens
            let verbInfo = null;
            if (presensToVerb) {
              verbInfo = presensToVerb.get(verbWord) || presensToVerb.get(verbStripped);
            }
            // Look up in preteritum if not found in presens
            if (!verbInfo && preteritumToVerb) {
              verbInfo = preteritumToVerb.get(verbWord) || preteritumToVerb.get(verbStripped);
            }

            if (verbInfo) {
              // Check person match
              if (verbInfo.person === expectedPerson) {
                findings.push({
                  rule_id: 'es-pro-drop',
                  start: ctx.tokens[i].start,
                  end: ctx.tokens[i].end,
                  original: ctx.tokens[i].display,
                  fix: '',
                  pronoun: ctx.tokens[i].display,
                  message: ctx.tokens[i].display + ' is redundant before ' + ctx.tokens[j].display,
                  severity: 'hint',
                });
                found = true;
              }
              break; // stop scanning after first verb (matching or not)
            }

            // Not a filler, not a verb — stop scanning
            break;
          }
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
