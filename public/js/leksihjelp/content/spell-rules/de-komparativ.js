/**
 * Spell-check rule: German "wie" after a comparative should be "als"
 * (priority 47, warning).
 *
 * After a COMPARATIVE adjective, German uses "als" for comparison, not "wie"
 * (a common Norwegian-influenced error, since Norwegian "enn" maps loosely):
 *   "Er ist größer wie ich."      → als
 *   "Sie läuft schneller wie er." → als
 *   "Das ist besser wie das."     → als
 *
 * It MUST NOT fire on:
 *   "Er ist so groß wie ich."     (equality: BASE adjective + wie — groß is
 *                                  not a comparative, so it's not in the set)
 *   "Ein schneller Wagen wie deiner …"  (attributive comparative — a noun
 *                                  sits between it and "wie", so adjacency fails)
 *   "Wie heißt du?" / "Wie geht es?"     (question word — nothing comparative
 *                                  precedes it)
 *   "Er ist größer als ich."      (already correct — no "wie")
 *
 * Detection is data-driven: vocab.deComparatives is a Set of every adjective's
 * lowercased comparative (komparativ) form. The rule flags "wie" only when the
 * IMMEDIATELY-preceding token is in that set. The adjacency (i-1) prevents the
 * attributive false positive; set membership prevents the "so groß wie" one.
 *
 * Exam classification: safe=false. This is a contextual grammar correction
 * (correct words, wrong comparison particle) beyond Chrome native parity.
 *
 * Rule ID: 'de-komparativ'
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

  const rule = {
    id: 'de-komparativ',
    languages: ['de'],
    priority: 47,
    exam: {
      safe: false,
      reason: 'Contextual comparison-particle correction — "wie"/"als" are both real words; flagging the wrong one after a comparative exceeds Chrome native parity',
      category: 'grammar-lookup',
    },
    severity: 'warning',
    explain: (finding) => ({
      nb: `Etter en komparativ (<em>${esc(finding.comparative || '')}</em>) bruker tysk <em>als</em>, ikke <em>wie</em>.`,
      nn: `Etter ein komparativ (<em>${esc(finding.comparative || '')}</em>) brukar tysk <em>als</em>, ikkje <em>wie</em>.`,
      en: `After a comparative (<em>${esc(finding.comparative || '')}</em>), German uses <em>als</em>, not <em>wie</em>.`,
    }),
    check(ctx) {
      const { tokens, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      const comps = (ctx.vocab && ctx.vocab.deComparatives instanceof Set)
        ? ctx.vocab.deComparatives : null;
      if (!comps) return [];
      const out = [];

      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.word !== 'wie') continue;
        if (!comps.has(tokens[i - 1].word)) continue;
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        const fix = applyCase(t.display, 'als');
        out.push({
          rule_id: 'de-komparativ',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix,
          comparative: tokens[i - 1].display,
          message: `Etter komparativ «${tokens[i - 1].display}» → «${fix}», ikke «${t.display}»`,
          severity: 'warning',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
