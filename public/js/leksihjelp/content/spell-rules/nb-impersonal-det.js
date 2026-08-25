/**
 * Spell-check rule: NB/NN missing expletive "det" with impersonal verbs (priority 22).
 *
 * Norwegian requires the expletive subject "det" with weather and existential
 * verbs. Pro-drop-L1 learners omit it:
 *   Wrong:   "Regner ute i dag."      → "Det regner ute i dag."
 *   Wrong:   "Finnes mange grunner."  → "Det finnes mange grunner."
 *   Correct: "Det regner ute."        → no flag
 *
 * PRECISION — restricted to UNAMBIGUOUSLY impersonal verbs whose only possible
 * subject is "det" (so unlike "Er kaldt", where the dropped subject could be
 * det OR jeg, there is no ambiguity about the fix). Tight guards:
 *   - sentence-INITIAL verb only;
 *   - skip if the expletive is already there (next token det/der);
 *   - skip questions (sentence ends with "?") and "Regner du …" (subject
 *     pronoun follows — inverted clause, not a dropped subject);
 *   - skip "regner med/på" (regne med = calculate, not rain).
 *
 * Severity: warning (P2 amber). Rule ID: 'nb-impersonal-det'.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};

  // Present-tense impersonal verbs only (preterite "regnet"/"snødde" collide
  // with the definite noun "regnet"=the rain, so they are excluded).
  const IMPERSONAL = new Set(['regner', 'snør', 'finnes', 'fins', 'finst']);

  const SUBJECT_PRONOUNS = new Set([
    'jeg', 'eg', 'du', 'han', 'hun', 'ho', 'den', 'det', 'der',
    'vi', 'dere', 'dykk', 'de', 'dei', 'man', 'en', 'ein',
  ]);

  const rule = {
    id: 'nb-impersonal-det',
    languages: ['nb', 'nn'],
    priority: 22,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Missing expletive subject (impersonal det); syntactic, not lookup — exceeds Chrome native spellcheck parity',
      category: 'grammar-lookup',
    },
    explain(finding) {
      const verb = (finding.verb || '').toLowerCase();
      return {
        nb: `Norske setninger med <em>${verb}</em> trenger det formelle subjektet <strong>det</strong>: skriv <em>Det ${verb} …</em>, ikke <em>${verb} …</em>.`,
        nn: `Norske setningar med <em>${verb}</em> treng det formelle subjektet <strong>det</strong>: skriv <em>Det ${verb} …</em>, ikkje <em>${verb} …</em>.`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'nb' && ctx.lang !== 'nn') return [];
      if (!ctx.sentences || !core.tokensInSentence) return [];
      const { tokens, cursorPos } = ctx;
      const out = [];

      for (const sentence of ctx.sentences) {
        const range = core.tokensInSentence(ctx, sentence);
        if (range.end - range.start < 2) continue;

        const verbTok = tokens[range.start];
        if (!verbTok || !IMPERSONAL.has(verbTok.word)) continue;

        const next = tokens[range.start + 1];
        if (!next) continue;
        // Already has an expletive / is an inverted question or clause.
        if (SUBJECT_PRONOUNS.has(next.word)) continue;
        // "regner med/på" = calculate, not weather.
        if ((verbTok.word === 'regner') && (next.word === 'med' || next.word === 'på')) continue;
        // Skip questions (inverted V/S order, expletive may be elided legitimately).
        const sentText = (sentence.text || '').trim();
        if (sentText.endsWith('?')) continue;

        if (cursorPos != null && cursorPos >= verbTok.start && cursorPos <= verbTok.end + 1) continue;

        const verbLower = verbTok.display.toLowerCase();
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: verbTok.start,
          end: verbTok.end,
          original: verbTok.display,
          fix: 'Det ' + verbLower,
          verb: verbTok.display,
          message: `Manglende subjekt: «${verbTok.display} …» → «Det ${verbLower} …» (norsk trenger det formelle subjektet «det»)`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
