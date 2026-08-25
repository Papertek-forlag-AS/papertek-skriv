(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Norwegian "er X år" transfers directly: "soy 15 años". In Spanish, age
  // requires *tener* ("tengo 15 años"), not *ser*.
  // Only flag 1sg/2sg/1pl/2pl — "son 15 años" has a legitimate nominal reading
  // ("15 years have passed") so we skip 3rd person to avoid FPs.

  const SER_TO_TENER = {
    soy:    'tengo',
    eres:   'tienes',
    somos:  'tenemos',
    sois:   'tenéis',
  };

  const rule = {
    id: 'es-tener-edad',
    languages: ['es'],
    priority: 20,
    severity: 'warning',
    exam: {
      safe: false,
      reason: '3-token window across ser+number+años — syntactic, not single-token',
      category: 'grammar-lookup',
    },
    explain: () => ({
      nb: 'På spansk bruker man <em>tener</em> (å ha) for alder: <em>tengo 15 años</em>, ikke <em>soy 15 años</em>.',
      nn: 'På spansk brukar ein <em>tener</em> (å ha) for alder: <em>tengo 15 años</em>, ikkje <em>soy 15 años</em>.',
      en: 'Spanish uses <em>tener</em> (to have) for age: <em>tengo 15 años</em>, not <em>soy 15 años</em>.',
    }),
    check(ctx) {
      const { tokens, text, cursorPos } = ctx;
      const out = [];

      // The tokenizer drops pure-number tokens, so "soy 15 años" tokenizes to
      // ["soy", "años"] (the 15 lives only in the raw text). Detect the age
      // number in the text gap between the ser-form and "años" rather than as
      // its own token.
      for (let i = 0; i + 1 < tokens.length; i++) {
        const t0 = tokens[i];
        const t1 = tokens[i + 1];

        const serForm = SER_TO_TENER[t0.word];
        if (!serForm) continue;

        // Next token must be "años" (age is "tener N años").
        if (t1.word !== 'años') continue;

        // The text between must be exactly a number (e.g. " 15 ") — no other
        // words, so "soy casi feliz años" or "soy de 30 años" don't match.
        const gap = text.slice(t0.end, t1.start);
        if (!/^\s+\d+\s*$/.test(gap)) continue;

        // Skip if cursor is within the flagged span (user still typing)
        if (cursorPos != null && cursorPos >= t0.start && cursorPos <= t1.end + 1) continue;

        const fix = matchCase(t0.display, serForm);
        out.push({
          rule_id: 'es-tener-edad',
          priority: rule.priority,
          severity: 'warning',
          start: t0.start,
          end: t0.end,
          original: t0.display,
          fix,
          message: `«${t0.display}${gap}años» → «${fix}${gap}años» (alder bruker tener, ikke ser)`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
