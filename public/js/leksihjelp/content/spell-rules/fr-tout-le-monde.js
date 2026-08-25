/**
 * Spell-check rule: FR 'tout le monde' takes a singular verb (FR-17, priority 19).
 *
 * Norwegian students use plural conjugations after "tout le monde" because the
 * Norwegian equivalent "alle" ("everyone") is grammatically plural.
 *
 *   Wrong:   "tout le monde sont contents"  →  "tout le monde est content"
 *   Wrong:   "tout le monde ont faim"        →  "tout le monde a faim"
 *   Wrong:   "tout le monde veulent partir"  →  "tout le monde veut partir"
 *   Correct: "tout le monde est content"     →  no flag (est = il/elle → singular)
 *   Correct: "tout le monde a faim"          →  no flag (a = il/elle → singular)
 *
 * Detection: "tout" + "le" + "monde" (3 consecutive tokens) immediately followed
 * by a verb in frPresensToVerb with person "ils/elles" (3rd plural).
 * Fix: replace the plural form with the corresponding "il/elle" (singular) form.
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-tout-le-monde'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  const rule = {
    id: 'fr-tout-le-monde',
    languages: ['fr'],
    priority: 19,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Singular agreement with "tout le monde" — grammatical (verb-lookup)',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `<em>Tout le monde</em> er entall i fransk — bruk <em>${finding.fix}</em> i stedet for <em>${finding.original}</em>.`,
      nn: `<em>Tout le monde</em> er eintal i fransk — bruk <em>${finding.fix}</em> i staden for <em>${finding.original}</em>.`,
      en: `<em>Tout le monde</em> is grammatically singular in French — use <em>${finding.fix}</em> instead of <em>${finding.original}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const frPresensToVerb = ctx.vocab && ctx.vocab.frPresensToVerb;
      if (!frPresensToVerb || !frPresensToVerb.size) return [];

      // Build inf → singular (il/elle) form map once per invocation.
      const infTo3s = new Map();
      for (const [form, entry] of frPresensToVerb) {
        if (entry.person === 'il/elle') infTo3s.set(entry.inf, form);
      }

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 3 < tokens.length; i++) {
        if (tokens[i].word.toLowerCase() !== 'tout') continue;
        if (tokens[i + 1].word.toLowerCase() !== 'le') continue;
        if (tokens[i + 2].word.toLowerCase() !== 'monde') continue;

        const verbTok = tokens[i + 3];
        if (!verbTok) continue;

        // Avoid flagging while the user is typing the verb token.
        if (cursorPos != null && cursorPos >= verbTok.start && cursorPos <= verbTok.end + 1) continue;

        const verbW = verbTok.word.toLowerCase();
        const entry = frPresensToVerb.get(verbW);
        if (!entry || entry.person !== 'ils/elles') continue;

        // Find the singular counterpart for the same infinitive.
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
