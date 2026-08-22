/**
 * Spell-check rule: FR homophone "on" vs "ont" after a plural subject (FR-28, priority 13).
 *
 * "on" (indefinite pronoun) and "ont" (3rd-person plural of avoir) are homophones
 * (/ɔ̃/). Norwegian students hear the sound and write the shorter "on" after a
 * plural subject pronoun, where the verb "ont" is required.
 *
 *   Wrong:   "ils on mangé"     →  "ils ont mangé"
 *   Wrong:   "elles on faim"    →  "elles ont faim"
 *   Correct: "ils ont mangé"    →  no flag
 *   Correct: "on mange bien"    →  no flag ("on" not after ils/elles)
 *   Correct: "et on part"       →  no flag
 *   Correct: "qu'on parle"      →  no flag (tokenises as one token "qu'on")
 *
 * Detection: a subject pronoun "ils"/"elles" immediately followed by the literal
 * "on". That sequence is never grammatical — "on" can only be replaced by the
 * verb "ont". Restricted to pronoun subjects (plural NOUN subjects need plural
 * detection, deferred to the agreement wave).
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-on-ont'
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
    id: 'fr-on-ont',
    languages: ['fr'],
    priority: 13,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'on/ont homophone after plural subject — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `<em>on</em> (man/vi) og <em>ont</em> (har, 3. flertall av <em>avoir</em>) uttales likt. Etter <em>${finding.subject}</em> trengs verbet <em>ont</em>, ikke pronomenet <em>on</em>.`,
      nn: `<em>on</em> (ein/vi) og <em>ont</em> (har, 3. fleirtal av <em>avoir</em>) vert uttala likt. Etter <em>${finding.subject}</em> trengst verbet <em>ont</em>, ikkje pronomenet <em>on</em>.`,
      en: `<em>on</em> (one/we) and <em>ont</em> (have, 3rd-person plural of <em>avoir</em>) sound the same. After <em>${finding.subject}</em> you need the verb <em>ont</em>, not the pronoun <em>on</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const subj = tokens[i];
        const on = tokens[i + 1];

        if (!PLURAL_SUBJECTS.has(subj.word.toLowerCase())) continue;
        if (on.word.toLowerCase() !== 'on') continue;

        if (cursorPos != null && cursorPos >= on.start && cursorPos <= on.end + 1) continue;

        const orig = text.slice(on.start, on.end);
        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: on.start,
          end: on.end,
          original: orig,
          fix: matchCase(orig, 'ont'),
          subject: text.slice(subj.start, subj.end),
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
