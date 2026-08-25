(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Norwegian "skal studere" → students use "ir + infinitive" but forget the
  // required "a": "voy estudiar" instead of "voy a estudiar".
  //
  // "ir + a + infinitive" is the canonical Spanish future periphrasis. The
  // "a" is obligatory and not optional like in Portuguese.
  //
  // Infinitive detection: word ends in -ar/-er/-ir AND is not a noun (nounGenus
  // guard). Exception list covers common adverbs/words that share the endings.

  const IR_FORMS = new Set(['voy', 'vas', 'va', 'vamos', 'vais', 'van']);

  // Words ending in -ar/-er/-ir that are NOT infinitives in student context.
  const NOT_INFINITIVE = new Set([
    'ayer',   // adverb (yesterday)
    'peor',   // comparative adjective (worse) — ends in -or, but guard anyway
    'mejor',  // comparative adjective (better)
    'exterior', 'interior', 'anterior', 'posterior', 'superior', 'inferior',
    'similar', 'familiar', 'singular', 'regular', 'particular', 'popular',
    'nuclear', 'solar', 'lunar', 'polar', 'linear',
  ]);

  const INFINITIVE_RE = /(?:ar|er|ir)$/i;

  const rule = {
    id: 'es-ir-a-infinitivo',
    languages: ['es'],
    priority: 22,
    severity: 'warning',
    exam: {
      safe: false,
      reason: '2-token window: ir form + infinitive — syntactic dependency',
      category: 'grammar-lookup',
    },
    explain: () => ({
      nb: 'Bruk <em>ir + a + infinitiv</em> for fremtid på spansk: <em>voy a estudiar</em>, ikke <em>voy estudiar</em>.',
      nn: 'Bruk <em>ir + a + infinitiv</em> for framtid på spansk: <em>voy a estudiar</em>, ikkje <em>voy estudiar</em>.',
      en: 'Use <em>ir + a + infinitive</em> for future in Spanish: <em>voy a estudiar</em>, not <em>voy estudiar</em>.',
    }),
    check(ctx) {
      const { tokens, text, cursorPos } = ctx;
      const nounGenus = ctx.vocab && ctx.vocab.nounGenus ? ctx.vocab.nounGenus : new Map();
      const out = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const t0 = tokens[i];
        const t1 = tokens[i + 1];

        if (!IR_FORMS.has(t0.word)) continue;

        // "a" is already present — correct usage
        if (t1.word === 'a' || t1.word === 'al') continue;

        // Check there is no punctuation between the two tokens
        if (/[.,;:!?¡¿]/.test(text.slice(t0.end, t1.start))) continue;

        // Skip if cursor is within the flagged span
        if (cursorPos != null && cursorPos >= t0.start && cursorPos <= t1.end + 1) continue;

        const w = t1.word;

        // Must look like a Spanish infinitive
        if (!INFINITIVE_RE.test(w)) continue;
        if (NOT_INFINITIVE.has(w)) continue;
        // Nouns share some endings (-ar, -er) — skip if nounGenus knows it
        if (nounGenus.has(w)) continue;

        const irPart = t0.display;
        const infPart = t1.display;
        const fix = `${irPart} a ${infPart}`;
        out.push({
          rule_id: 'es-ir-a-infinitivo',
          priority: rule.priority,
          severity: 'warning',
          start: t0.start,
          end: t1.end,
          original: `${irPart} ${infPart}`,
          fix,
          message: `«${irPart} ${infPart}» → «${fix}» (mangler «a» i ir + a + infinitiv)`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
