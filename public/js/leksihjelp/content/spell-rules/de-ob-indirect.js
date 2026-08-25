/**
 * Spell-check rule: "dass" in an indirect yes/no question after "fragen"
 * (de-ob-indirect, priority 27, hint).
 *
 * In German, indirect yes/no questions use "ob" (whether), not "dass" (that).
 * Norwegian students use "at" for both, and transfer "that" → "dass" where
 * German requires "ob":
 *
 *   "Ich frage, dass er kommt."           → ob er kommt
 *   "Sie fragt, dass es regnet."          → ob es regnet
 *   "Ich frage mich, dass er pünktlich kommt." → ob er pünktlich kommt
 *
 * Must NOT fire on:
 *   "Ich frage, ob er kommt."             (already correct)
 *   "Er sagt, dass er kommt."             (sagen → statement verb, not flagged)
 *   "Ich glaube, dass er kommt."          (glauben → statement verb, not flagged)
 *
 * FP analysis: The four-verb set originally proposed ({fragen, wissen,
 * verstehen, wundern}) was narrowed to {fragen} only because:
 *   • "Ich weiß, dass er kommt." — valid German; wissen fires on correct dass.
 *   • "Er versteht, dass das wichtig ist." — valid; verstehen+dass is correct.
 *   • "Ich wundere mich, dass das passiert." — valid; wundern+dass = surprised that.
 * All three fail the FP gate (≥ 3 plausible real-sentence FPs). "fragen" alone
 * is safe: "Ich frage, dass …" is essentially ungrammatical in standard German.
 *
 * Detection:
 *   1. Find a token whose infinitive (via vocab.verbInfinitive) is "fragen".
 *   2. Scan forward (max 10 tokens) for a comma in gap text.
 *   3. After the comma, find the next "dass" token.
 *   4. Guard: if "ob" appears in the scan window before "dass" → already correct.
 *   5. Flag "dass", fix = "ob".
 *
 * Rule ID: 'de-ob-indirect'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const ASK_VERBS = new Set(['fragen']);
  const MAX_SCAN = 10;

  function isAskVerb(word, verbInf) {
    const inf = (verbInf && verbInf.get(word)) || word;
    return ASK_VERBS.has(inf);
  }

  const rule = {
    id: 'de-ob-indirect',
    languages: ['de'],
    priority: 27,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Contextual grammar hint — ob vs dass in indirect yes/no questions; beyond Chrome native parity',
      category: 'grammar-lookup',
    },
    explain: () => ({
      nb: `I indirekte ja/nei-spørsmål bruker tysk <strong>ob</strong> (= om/hvorvidt), ikke <em>dass</em>. «Dass» innleder påstandssetninger; «ob» innleder spørresetninger.`,
      nn: `I indirekte ja/nei-spørsmål brukar tysk <strong>ob</strong> (= om/kvifor), ikkje <em>dass</em>. «Dass» innleier påstandssetningar; «ob» innleier spørjesetningar.`,
      en: `In indirect yes/no questions, German uses <strong>ob</strong> (= whether), not <em>dass</em>. «Dass» introduces statement clauses; «ob» introduces question clauses.`,
    }),
    check(ctx) {
      const { tokens, text, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      if (!tokens || tokens.length < 3 || !text) return [];
      const verbInf = (ctx.vocab && ctx.vocab.verbInfinitive instanceof Map)
        ? ctx.vocab.verbInfinitive : null;
      const out = [];

      for (let i = 0; i < tokens.length - 2; i++) {
        if (!isAskVerb(tokens[i].word, verbInf)) continue;

        let commaFound = false;
        let obFound = false;

        for (let k = i + 1; k < tokens.length && k <= i + MAX_SCAN; k++) {
          const gap = text.slice(tokens[k - 1].end, tokens[k].start);
          if (/[.!?;]/.test(gap)) break;
          if (/,/.test(gap)) commaFound = true;

          const w = tokens[k].word;

          // If "ob" seen before "dass" → already correct or nested structure.
          if (w === 'ob') { obFound = true; break; }

          if (!commaFound) continue;
          if (w !== 'dass') continue;

          // Found "fragen ... , ... dass" — flag it.
          const dassTok = tokens[k];
          if (cursorPos != null && cursorPos >= dassTok.start && cursorPos <= dassTok.end) break;

          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: dassTok.start,
            end: dassTok.end,
            original: dassTok.display,
            fix: 'ob',
          });
          break;
        }
        void obFound;
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
