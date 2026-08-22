/**
 * Spell-check rule: FR homophone "son" vs "sont" after a plural subject (FR-29, priority 12).
 *
 * "son" (possessive his/her) and "sont" (3rd-person plural of être) are homophones
 * (/sɔ̃/). Norwegian students write the shorter "son" after a plural subject pronoun,
 * where the verb "sont" is required.
 *
 *   Wrong:   "ils son contents"   →  "ils sont contents"
 *   Wrong:   "elles son parties"  →  "elles sont parties"
 *   Correct: "ils sont contents"  →  no flag
 *   Correct: "il aime son père"   →  no flag ("son" = possessive, not after ils/elles)
 *   Correct: "c'est son livre"     →  no flag
 *
 * Detection: a subject pronoun "ils"/"elles" immediately followed by the literal
 * "son". That sequence is never grammatical — "son" can only be replaced by the
 * verb "sont". Restricted to pronoun subjects (plural NOUN subjects need plural
 * detection, deferred to the agreement wave).
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-son-sont'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase: coreMatchCase } = core;

  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original && original[0] >= 'A' && original[0] <= 'Z') {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  const PLURAL_SUBJECTS = new Set(['ils', 'elles']);

  const rule = {
    id: 'fr-son-sont',
    languages: ['fr'],
    priority: 12,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'son/sont homophone after plural subject — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `<em>son</em> (hans/hennes) og <em>sont</em> (er, 3. flertall av <em>être</em>) uttales likt. Etter <em>${finding.subject}</em> trengs verbet <em>sont</em>, ikke eiendomsordet <em>son</em>.`,
      nn: `<em>son</em> (hans/hennar) og <em>sont</em> (er, 3. fleirtal av <em>être</em>) vert uttala likt. Etter <em>${finding.subject}</em> trengst verbet <em>sont</em>, ikkje eigedomsordet <em>son</em>.`,
      en: `<em>son</em> (his/her) and <em>sont</em> (are, 3rd-person plural of <em>être</em>) sound the same. After <em>${finding.subject}</em> you need the verb <em>sont</em>, not the possessive <em>son</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const subj = tokens[i];
        const son = tokens[i + 1];

        if (!PLURAL_SUBJECTS.has(subj.word.toLowerCase())) continue;
        if (son.word.toLowerCase() !== 'son') continue;

        if (cursorPos != null && cursorPos >= son.start && cursorPos <= son.end + 1) continue;

        const orig = text.slice(son.start, son.end);
        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: son.start,
          end: son.end,
          original: orig,
          fix: matchCase(orig, 'sont'),
          subject: text.slice(subj.start, subj.end),
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
