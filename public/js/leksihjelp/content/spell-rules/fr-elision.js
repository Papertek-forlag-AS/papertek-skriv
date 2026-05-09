/**
 * Spell-check rule: French elision before vowels and h-muet (FR-01, priority 14).
 *
 * Phase 10. Flags missing mandatory elision of clitics before vowel-initial
 * or h-muet-initial words:
 *   Wrong:   "je ai"    ->  "j'ai"
 *   Wrong:   "le ami"   ->  "l'ami"
 *   Wrong:   "si il"    ->  "s'il"
 *
 * H-aspire exceptions: "le heros" does NOT flag (no elision before h-aspire).
 * SI special case: "si" only elides before "il" and "ils", not other vowels.
 *
 * Severity: error (P1 red dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Vowels and accented vowels that trigger elision
  const VOWELS = new Set('aeiouyàâäéèêëïîôùûüÿœæ'.split(''));

  // H-aspire words: NO elision before these (the "h" is treated as consonant-like)
  const H_ASPIRE = new Set([
    'hache', 'haie', 'haine', 'hall', 'halte', 'hamac', 'hamster',
    'hanche', 'handicap', 'hangar', 'harangue', 'harceler', 'hardi',
    'haricot', 'harpe', 'hasard', 'hausse', 'haut', 'hauteur',
    'heros', 'hibou', 'hockey', 'hollande', 'homard', 'honte',
    'hors', 'housse', 'hublot', 'hurler', 'hutte',
  ]);

  // General clitic -> elided form (before vowel or h-muet)
  const ELISION_MAP = {
    je:  "j'",
    me:  "m'",
    te:  "t'",
    se:  "s'",
    le:  "l'",
    la:  "l'",
    de:  "d'",
    ne:  "n'",
    que: "qu'",
  };

  // SI only elides before il/ils
  const SI_TARGETS = new Set(['il', 'ils']);

  const rule = {
    id: 'fr-elision',
    languages: ['fr'],
    priority: 14,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (fr-elision) — Chrome native parity confirmed in 33-03 audit: FR elision (le→l') is single-token lookup against vowel-initial words",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Bruk elisjon: skriv <em>${escapeHtml(finding.fix)}</em> i staden for <em>${escapeHtml(finding.original)}</em> framfor vokal eller stum h.`,
      nn: `Bruk elisjon: skriv <em>${escapeHtml(finding.fix)}</em> i staden for <em>${escapeHtml(finding.original)}</em> framfor vokal eller stum h.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      const { tokens, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];

        // Skip if cursor is in the vicinity
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= next.end + 1) continue;

        const w = t.word; // lowercase
        const nextW = next.word; // lowercase
        const nextFirstChar = nextW.charAt(0);

        // Handle SI special case
        if (w === 'si') {
          if (SI_TARGETS.has(nextW)) {
            const fix = "s'" + nextW;
            out.push({
              rule_id: rule.id,
              priority: rule.priority,
              start: t.start,
              end: next.end,
              original: t.display + ' ' + next.display,
              fix: matchCase ? matchCase(t.display, fix) : fix,
              message: `Elisjon: "${t.display} ${next.display}" -> "${fix}"`,
            });
          }
          continue;
        }

        // Check general elision map
        const elided = ELISION_MAP[w];
        if (!elided) continue;

        // Next word must start with a vowel or h-muet
        const startsWithVowel = VOWELS.has(nextFirstChar);
        const startsWithH = nextFirstChar === 'h';

        if (!startsWithVowel && !startsWithH) continue;

        // If h-initial, check h-aspire exception
        if (startsWithH && H_ASPIRE.has(nextW)) continue;

        // If h-initial but NOT h-aspire, it's h-muet -> elision applies
        // If vowel-initial -> elision applies
        const fix = elided + nextW;
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: t.start,
          end: next.end,
          original: t.display + ' ' + next.display,
          fix: matchCase ? matchCase(t.display, fix) : fix,
          message: `Elisjon: "${t.display} ${next.display}" -> "${fix}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
