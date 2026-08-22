/**
 * Spell-check rule: German strong-verb stem-vowel errors (priority 46, error).
 *
 * Many common German verbs change their stem vowel in the 2nd/3rd-person
 * singular present (a→ä, e→i, e→ie). Norwegian students regularize them:
 *   "Du fahrst zu schnell."  → fährst   (a→ä)
 *   "Er gebt mir das."       → gibt      (e→i)
 *   "Du sprechst gut."       → sprichst
 *   "Er lest ein Buch."      → liest      (e→ie)
 *   "Du nehmst den Bus."     → nimmst
 *
 * Detection is data-driven: vocab.deStrongPresent maps the mechanically-
 * regularized 2/3sg form a student would wrongly write → [{fix, pron}] of the
 * real stem-changed form, built only for verbs whose curated paradigm differs
 * from the regularized form (genuine strong verbs). The rule requires the
 * IMMEDIATELY-preceding token to be a matching-person pronoun:
 *   du → 'du'; er/es/man → 'er'. "sie" is deliberately EXCLUDED (ambiguous
 *   3sg/3pl) to avoid false positives. Without a matching pronoun it stays
 *   silent, so "Ihr fahrt", "Wir geben", and the bare noun "Die Fahrt" never
 *   flag, and a correct "Du fährst" is not in the index at all.
 *
 * Exam classification: safe=false. The regularized form is a contextual
 * grammar error (correct verb, wrong inflection) — beyond Chrome native
 * spellcheck parity, same class as de-subject-verb / de-wann-wenn.
 *
 * Rule ID: 'de-strong-verb'
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

  // Preceding-pronoun → person class. "sie" deliberately omitted (3sg/3pl
  // ambiguity would create false positives on plural subjects).
  const PRONOUN_CLASS = {
    du: 'du',
    er: 'er',
    es: 'er',
    man: 'er',
  };

  const rule = {
    id: 'de-strong-verb',
    languages: ['de'],
    priority: 46,
    exam: {
      safe: false,
      reason: 'Contextual strong-verb stem-change guidance — the regularized form is a real word; flagging the wrong inflection exceeds Chrome native parity',
      category: 'grammar-lookup',
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `<em>${esc(finding.original)}</em> er feil bøyning av et sterkt verb — stammevokalen skifter i 2./3. person entall. Bruk <em>${esc(finding.fix)}</em>.`,
      nn: `<em>${esc(finding.original)}</em> er feil bøying av eit sterkt verb — stammevokalen skiftar i 2./3. person eintal. Bruk <em>${esc(finding.fix)}</em>.`,
      en: `<em>${esc(finding.original)}</em> is the wrong form of a strong verb — the stem vowel changes in the 2nd/3rd-person singular. Use <em>${esc(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      const strong = (ctx.vocab && ctx.vocab.deStrongPresent instanceof Map)
        ? ctx.vocab.deStrongPresent : null;
      if (!strong) return [];
      const out = [];

      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        const entries = strong.get(t.word);
        if (!entries) continue;
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        const cls = PRONOUN_CLASS[tokens[i - 1].word];
        if (!cls) continue;

        const entry = entries.find((e) => e.pron === cls);
        if (!entry) continue;

        const fix = applyCase(t.display, entry.fix);
        out.push({
          rule_id: 'de-strong-verb',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix,
          verb: t.display,
          message: `«${t.display}» → «${fix}» — sterkt verb, stammevokalen skifter`,
          severity: 'error',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
