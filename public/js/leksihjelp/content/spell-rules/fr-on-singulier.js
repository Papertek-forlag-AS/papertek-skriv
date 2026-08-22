/**
 * Spell-check rule: FR "on" always takes a singular (il/elle) verb form (FR-18, priority 18).
 *
 * Norwegian students use plural or "nous" verb forms after "on" because the
 * Norwegian equivalent "vi" (we) is grammatically 1st-person plural. In French,
 * "on" is always conjugated in the 3rd person singular (il/elle form).
 *
 *   Wrong:   "on parlons ensemble"   →  "on parle ensemble"
 *   Wrong:   "on sont contents"      →  "on est contents"  (also see fr-tout-le-monde)
 *   Wrong:   "on mangent bien"       →  "on mange bien"
 *   Correct: "on parle ensemble"     →  no flag (parle = il/elle)
 *   Correct: "on est arrivé"         →  no flag (est = il/elle)
 *   Correct: "on va partir"          →  no flag (va = il/elle)
 *
 * Detection: token "on" immediately followed by a verb form in frPresensToVerb
 * whose person is "nous", "vous", or "ils/elles". Those forms are never
 * correct after "on" in standard French.
 * Fix: replace the plural/nous/vous form with the il/elle (3s) form of the same verb.
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-on-singulier'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  const BAD_PERSONS = new Set(['nous', 'vous', 'ils/elles']);

  const rule = {
    id: 'fr-on-singulier',
    languages: ['fr'],
    priority: 18,
    severity: 'warning',
    exam: {
      safe: false,
      reason: '"on" singular agreement — grammatical (verb-lookup)',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `<em>On</em> bøyes alltid i tredje person entall i fransk. Bruk <em>${finding.fix}</em> i stedet for <em>${finding.original}</em>.`,
      nn: `<em>On</em> vert alltid bøygd i tredje person eintal i fransk. Bruk <em>${finding.fix}</em> i staden for <em>${finding.original}</em>.`,
      en: `<em>On</em> always takes a third-person singular verb in French. Use <em>${finding.fix}</em> instead of <em>${finding.original}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const frPresensToVerb = ctx.vocab && ctx.vocab.frPresensToVerb;
      if (!frPresensToVerb || !frPresensToVerb.size) return [];

      // Build inf → il/elle form map once per invocation.
      const infTo3s = new Map();
      for (const [form, entry] of frPresensToVerb) {
        if (entry.person === 'il/elle') infTo3s.set(entry.inf, form);
      }

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        if (tokens[i].word.toLowerCase() !== 'on') continue;

        const verbTok = tokens[i + 1];
        if (!verbTok) continue;

        // Avoid flagging while the user is still typing.
        if (cursorPos != null && cursorPos >= verbTok.start && cursorPos <= verbTok.end + 1) continue;

        const verbW = verbTok.word.toLowerCase();
        const entry = frPresensToVerb.get(verbW);
        if (!entry || !BAD_PERSONS.has(entry.person)) continue;

        const fix = infTo3s.get(entry.inf);
        if (!fix) continue;

        const origVerb = text.slice(verbTok.start, verbTok.end);

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: verbTok.start,
          end: verbTok.end,
          original: origVerb,
          fix,
          inf: entry.inf,
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
