/**
 * Spell-check rule: FR near-future "aller" must be followed by an infinitive (FR-20, priority 16).
 *
 * The French near future (futur proche) is "aller (conjugated) + INFINITIVE".
 * Norwegian students conjugate the second verb too, by L1 transfer — Norwegian
 * "skal" is followed by a bare infinitive but students over-apply agreement, or
 * simply re-use a present-tense form they already know.
 *
 *   Wrong:   "je vais mange"     →  "je vais manger"   (mange = il/elle present)
 *   Wrong:   "il va vient"       →  "il va venir"      (vient = il/elle present)
 *   Wrong:   "nous allons mange" →  "nous allons manger"
 *   Correct: "je vais manger"    →  no flag (manger = infinitive, not in present map)
 *   Correct: "il va bien"        →  no flag (bien not a verb form)
 *   Correct: "on va au cinéma"   →  no flag (au not a verb form)
 *
 * Detection: a conjugated form of "aller" (va/vais/vas/allons/allez/vont — all
 * carry inf="aller" in frPresensToVerb) immediately followed by another token in
 * frPresensToVerb whose person is a finite person (≠ "infinitiv"). The suggested
 * fix is the infinitive stored on that finite entry (entry.inf is the spelled
 * infinitive form, e.g. "mange" → "manger").
 *
 * The bare "a" homograph is excluded: "va a Paris" is overwhelmingly a typo for
 * "va à Paris" (à/a confusion is the most common NB-student slip), not "va avoir".
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-aller-infinitif'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  // Next-token forms that are far more likely a different slip than a near-future error.
  // "a" → almost always a typo for the preposition "à" ("va a Paris" → "va à Paris").
  const EXCLUDE_NEXT = new Set(['a']);

  const rule = {
    id: 'fr-aller-infinitif',
    languages: ['fr'],
    priority: 16,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Near-future aller + infinitive — grammatical (verb-lookup)',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Nær framtid på fransk er <em>aller</em> + infinitiv. Etter <em>${finding.aller}</em> skal verbet stå i infinitiv: <em>${finding.fix}</em>, ikke <em>${finding.original}</em>.`,
      nn: `Nær framtid på fransk er <em>aller</em> + infinitiv. Etter <em>${finding.aller}</em> skal verbet stå i infinitiv: <em>${finding.fix}</em>, ikkje <em>${finding.original}</em>.`,
      en: `The French near future is <em>aller</em> + infinitive. After <em>${finding.aller}</em> the verb must be an infinitive: <em>${finding.fix}</em>, not <em>${finding.original}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const frPresensToVerb = ctx.vocab && ctx.vocab.frPresensToVerb;
      if (!frPresensToVerb || !frPresensToVerb.size) return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const allerTok = tokens[i];
        const verbTok = tokens[i + 1];

        const allerEntry = frPresensToVerb.get(allerTok.word.toLowerCase());
        if (!allerEntry || allerEntry.inf !== 'aller') continue;

        // Avoid flagging while the user is still typing the second token.
        if (cursorPos != null && cursorPos >= verbTok.start && cursorPos <= verbTok.end + 1) continue;

        const verbW = verbTok.word.toLowerCase();
        if (EXCLUDE_NEXT.has(verbW)) continue;

        const verbEntry = frPresensToVerb.get(verbW);
        // Must be a finite (conjugated) form — a real infinitive isn't in the present map.
        if (!verbEntry || verbEntry.person === 'infinitiv') continue;

        const fix = verbEntry.inf;
        if (!fix || fix === verbW) continue;

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: verbTok.start,
          end: verbTok.end,
          original: text.slice(verbTok.start, verbTok.end),
          fix,
          aller: text.slice(allerTok.start, allerTok.end),
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
