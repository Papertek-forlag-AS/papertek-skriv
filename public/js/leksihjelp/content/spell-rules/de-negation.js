/**
 * Spell-check rule: German kein vs nicht (de-negation, priority 47).
 *
 * To negate a noun with an indefinite article, German uses the negative
 * article *kein* — NOT *nicht ein*. Norwegian "ikke en/et" maps word-for-word
 * to the wrong "nicht ein":
 *   "Ich habe nicht ein Auto."   → "Ich habe kein Auto."
 *   "Das ist nicht eine Idee."   → "Das ist keine Idee."
 *   "Er hat nicht einen Cent."   → "Er hat keinen Cent."
 *
 * Detection (conservative): `nicht` directly followed by an indefinite article
 * (ein/eine/einen/einem/einer/eines) → replace BOTH words with the matching
 * kein-form. The fix is applied to the article token, and `nicht` is removed by
 * extending the replacement back over it (start = nicht.start).
 *
 * FP guard: contrastive "nicht ein X, sondern Y" ("not a X, but a Y") is
 * correct German — if `sondern` appears later in the sentence, skip. `einmal`
 * is a single token (not "ein"), so "nicht einmal" never matches.
 *
 * Exam classification: safe=false. "nicht ein" is grammatical in the
 * contrastive reading; flagging the negation pattern is contextual grammar
 * guidance with a Lær mer lesson — beyond Chrome native parity.
 *
 * Rule ID: 'de-negation'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const applyCase = typeof matchCase === 'function' ? matchCase : (o, s) => s;

  // Indefinite article → matching kein-form (same gender/case ending).
  const EIN_TO_KEIN = {
    ein: 'kein', eine: 'keine', einen: 'keinen',
    einem: 'keinem', einer: 'keiner', eines: 'keines',
  };

  const rule = {
    id: 'de-negation',
    languages: ['de'],
    priority: 47,
    exam: {
      safe: false,
      reason: 'Contextual kein/nicht guidance with Lær mer pedagogy — "nicht ein" is valid in the contrastive reading; flagging the negation pattern exceeds Chrome native parity',
      category: 'grammar-lookup',
    },
    severity: 'warning',
    explain: (finding) => ({
      nb: `For å nekte et substantiv med ubestemt artikkel bruker tysk <strong>kein</strong>, ikke <em>nicht ein</em> — bruk <em>${esc(finding.fix)}</em>.`,
      nn: `For å nekte eit substantiv med ubestemt artikkel bruker tysk <strong>kein</strong>, ikkje <em>nicht ein</em> — bruk <em>${esc(finding.fix)}</em>.`,
      en: `To negate a noun with an indefinite article, German uses <strong>kein</strong>, not <em>nicht ein</em> — use <em>${esc(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].word !== 'nicht') continue;
        const art = tokens[i + 1].word;
        const kein = EIN_TO_KEIN[art];
        if (!kein) continue;
        // Need a following word (a noun) — bare "nicht ein" at clause end is
        // usually the emphatic "not one", which kein doesn't always fit.
        if (i + 2 >= tokens.length) continue;
        // Contrastive "nicht ein …, sondern …" is correct — skip the whole match.
        let contrastive = false;
        for (let j = i + 2; j < tokens.length; j++) {
          if (tokens[j].word === 'sondern') { contrastive = true; break; }
          if (tokens[j].word === '.' || tokens[j].word === '!' || tokens[j].word === '?') break;
        }
        if (contrastive) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i + 1].end + 1) continue;

        const fix = applyCase(tokens[i].display, kein); // keep the original capitalisation of "nicht"/"Nicht"
        out.push({
          rule_id: 'de-negation',
          priority: rule.priority,
          start: tokens[i].start,                 // span covers "nicht ein"
          end: tokens[i + 1].end,
          original: tokens[i].display + ' ' + tokens[i + 1].display,
          fix,
          message: `«${tokens[i].display} ${tokens[i + 1].display}» → «${fix}»`,
          severity: 'warning',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
