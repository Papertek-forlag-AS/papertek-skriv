/**
 * Spell-check rule: "je [komp] ..., je [komp]" — second "je" should be "desto"
 * (de-je-desto, priority 24, hint).
 *
 * German uses "je … desto" for proportional comparisons. Students who know the
 * construction exists sometimes write "je … je" instead:
 *
 *   "Je schneller, je besser."        → Je schneller, desto besser.
 *   "Je mehr ich lerne, je weniger …" → …, desto weniger …
 *   "Je größer, je besser."           → Je größer, desto besser.
 *
 * Must NOT fire on:
 *   "Je schneller, desto besser."     (already correct)
 *   "Hast du je so etwas gesehen?"    (je = ever — next token not comparative)
 *   "je zwei Stück pro Person"        (je = each/per — not followed by comparative)
 *
 * Detection:
 *   1. Find token "je".
 *   2. Next token must be in vocab.deComparatives OR in EXTRA_COMP (mehr, weniger).
 *      This prevents false positives on "je" meaning "ever" or "per".
 *   3. Scan forward (max 12 tokens) for a comma in the gap text.
 *   4. After the comma, look for the next "je" token.
 *   5. Flag that "je", fix = "desto".
 *
 * Rule ID: 'de-je-desto'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Common comparative adverbs/pronouns that may not be in the adjective bank.
  const EXTRA_COMP = new Set(['mehr', 'weniger', 'öfter', 'lieber', 'eher', 'länger', 'kürzer', 'früher', 'später']);

  const MAX_SCAN = 12;

  const rule = {
    id: 'de-je-desto',
    languages: ['de'],
    priority: 24,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Contextual grammar hint — je…desto correlative construction; beyond Chrome native parity',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const comp = esc(finding && finding.comparative || '');
      return {
        nb: `Tysk bruker <strong>je … desto</strong> for proporsjonale sammenligninger — ikke «je … je». Etter kommaet skal det stå <em>desto</em>${comp ? ` + komparativ (her: <em>${comp}</em>)` : ''}.`,
        nn: `Tysk brukar <strong>je … desto</strong> for proporsjonale samanlikningar — ikkje «je … je». Etter kommaet skal det stå <em>desto</em>${comp ? ` + komparativ (her: <em>${comp}</em>)` : ''}.`,
        en: `German uses <strong>je … desto</strong> for proportional comparisons — not «je … je». After the comma, write <em>desto</em>${comp ? ` + comparative (here: <em>${comp}</em>)` : ''}.`,
      };
    },
    check(ctx) {
      const { tokens, text, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      if (!tokens || tokens.length < 4 || !text) return [];
      const comps = (ctx.vocab && ctx.vocab.deComparatives instanceof Set)
        ? ctx.vocab.deComparatives : new Set();
      const out = [];

      for (let i = 0; i < tokens.length - 2; i++) {
        if (tokens[i].word !== 'je') continue;

        // Guard: next token must be a comparative (prevents "je" = "ever/per" FPs).
        const nextW = tokens[i + 1] && tokens[i + 1].word;
        if (!comps.has(nextW) && !EXTRA_COMP.has(nextW)) continue;

        // Scan forward for a comma in gap text.
        let commaFound = false;
        for (let k = i + 2; k < tokens.length && k <= i + MAX_SCAN; k++) {
          const gap = text.slice(tokens[k - 1].end, tokens[k].start);
          if (/[;.!?]/.test(gap)) break;
          if (/,/.test(gap)) { commaFound = true; }

          if (!commaFound) continue;

          // After comma: look for the next "je".
          if (tokens[k].word !== 'je') continue;

          const jeTok = tokens[k];
          if (cursorPos != null && cursorPos >= jeTok.start && cursorPos <= jeTok.end) break;

          // Find the comparative following this second "je" (for explain context).
          const compTok = tokens[k + 1];
          const compWord = compTok && (comps.has(compTok.word) || EXTRA_COMP.has(compTok.word))
            ? compTok.display : '';

          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: jeTok.start,
            end: jeTok.end,
            original: jeTok.display,
            fix: 'desto',
            comparative: compWord,
          });
          break;
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
