/**
 * Spell-check rule: "sehr" before a comparative adjective — should be "viel"
 * (de-sehr-komparativ, priority 22, hint).
 *
 * German uses "viel" to intensify a comparative, not "sehr":
 *   "Er ist sehr größer als ich."   → viel größer
 *   "Das ist sehr besser als das."  → viel besser
 *   "Sie spricht sehr schneller."   → viel schneller
 *
 * Norwegian "mye" / "veldig" → students transfer "veldig/mye" → "sehr",
 * but German requires "viel" in the comparative context.
 *
 * Detection:
 *   1. Find token "sehr" (lowercased).
 *   2. Check if the IMMEDIATELY FOLLOWING token (lowercased) is in vocab.deComparatives.
 *   3. If yes → flag "sehr", fix = "viel".
 *
 * FP guards:
 *   - Only the NEXT adjacent token is checked (prevents "sehr ... [later comparative]" misfire).
 *   - deComparatives contains only BASE comparative forms (größer, schneller, besser…),
 *     NOT base adjectives (groß, schnell, gut) → "sehr gut" never fires.
 *   - Cursor guard: skip if cursor is on "sehr".
 *
 * Rule ID: 'de-sehr-komparativ'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rule = {
    id: 'de-sehr-komparativ',
    languages: ['de'],
    priority: 22,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Contextual grammar hint — sehr vs viel before comparatives; beyond Chrome native parity',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const comp = esc(finding && finding.comparative || '');
      return {
        nb: `Foran en komparativ (<em>${comp}</em>) bruker tysk <strong>viel</strong>, ikke <em>sehr</em>. «Sehr» forsterker grunnformen (sehr groß), mens «viel» forsterker komparativet (viel größer).`,
        nn: `Framfor ein komparativ (<em>${comp}</em>) brukar tysk <strong>viel</strong>, ikkje <em>sehr</em>. «Sehr» forsterkar grunnforma (sehr groß), medan «viel» forsterkar komparativet (viel größer).`,
        en: `Before a comparative (<em>${comp}</em>), German uses <strong>viel</strong>, not <em>sehr</em>. «Sehr» intensifies the base form (sehr groß), while «viel» intensifies the comparative (viel größer).`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      if (!tokens || tokens.length < 2) return [];
      const comps = (ctx.vocab && ctx.vocab.deComparatives instanceof Set)
        ? ctx.vocab.deComparatives : null;
      if (!comps || comps.size === 0) return [];
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].word !== 'sehr') continue;
        const sehrTok = tokens[i];
        if (cursorPos != null && cursorPos >= sehrTok.start && cursorPos <= sehrTok.end) continue;

        const nextTok = tokens[i + 1];
        if (!comps.has(nextTok.word)) continue;

        // Attributive declension homograph (Ordbank sweep 2026-07): "ein
        // sehr netter Mann" — -er here is the masculine ending on the
        // POSITIVE, not a comparative. A capitalized noun directly after
        // the candidate means attributive position → skip; the true
        // comparative shape ("sehr schneller als er") continues lowercase.
        const afterTok = tokens[i + 2];
        if (afterTok && /^\p{Lu}/u.test(afterTok.display)) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: sehrTok.start,
          end: sehrTok.end,
          original: sehrTok.display,
          fix: 'viel',
          comparative: nextTok.display,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
