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

  // Vowels and accented vowels that trigger elision. NOTE: 'y' is NOT here —
  // word-initial 'y' is consonantal /j/ (le yoga, le yacht, le yaourt: no
  // elision). The bare pronoun "y" ("j'y vais") is handled as a special case.
  const VOWELS = new Set('aeiouàâäéèêëïîôùûüÿœæ'.split(''));

  // Function words where elision would produce nonsense (e.g. "l'à", "l'ou")
  const NO_ELISION_TARGETS = new Set(['à', 'au', 'ou', 'où']);

  // Vowel-initial words that nonetheless take NO elision (treated as
  // consonant-initial): "le oui", "que oui", "le onze", "le ouistiti".
  const NO_ELISION_NEXT = new Set(['oui', 'ouistiti', 'onze', 'onzième', 'uhlan', 'ululement', 'yaourt', 'oued', 'one-man-show']);

  // H-aspire words: NO elision before these (the "h" is treated as consonant-like).
  // Keys are accent-stripped (the candidate is stripped before lookup).
  const H_ASPIRE = new Set([
    'hache', 'haie', 'haine', 'hall', 'halte', 'hamac', 'hamster',
    'hanche', 'handicap', 'hangar', 'harangue', 'harceler', 'harcelement',
    'harcele', 'hardi', 'haricot', 'harpe', 'hasard', 'hausse',
    'haut', 'haute', 'hauts', 'hautes', 'hauteur', 'hautain',
    'hate', 'hater', 'hatif', 'hative', 'havane', 'havre',
    'heros', 'heroine', 'hetre', 'hibou', 'hierarchie', 'hockey', 'hockey',
    'hollande', 'homard', 'honte', 'honteux', 'hoquet', 'hors', 'housse',
    'hublot', 'huit', 'huitaine', 'huitieme', 'hurler', 'hurlement', 'hutte',
  ]);
  // Productive h-aspire stems — match by prefix so inflections are covered
  // without enumerating every form (haut/haute/hauteur, huit/huitième, …).
  const H_ASPIRE_PREFIXES = ['haut', 'huit', 'harcel', 'hat', 'hai', 'havan'];

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
      const { tokens, cursorPos, text } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];

        // Skip if cursor is in the vicinity
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= next.end + 1) continue;

        // Only elide across a PURE-WHITESPACE gap. A number or quote between the
        // clitic and the word ("de 48 heures", "« le » est") is dropped by the
        // tokenizer, leaving them falsely adjacent — eliding across it produces
        // "d'heures", "l'est". Real elision pairs are separated by one space.
        if (text != null && !/^\s+$/.test(text.slice(t.end, next.start))) continue;

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

        // le/la are articles — they never precede the pronouns "en"/"y"
        // ("rapportez-la en garantie" → la is an object clitic, not an article;
        // "l'en"/"l'y" are not words). je/me/te/se/ne/de/que + en/y DO elide
        // (j'en, qu'en, s'y) and are unaffected.
        if ((w === 'le' || w === 'la') && (nextW === 'en' || nextW === 'y')) continue;

        // Next word must start with a vowel or h-muet — or be the bare pronoun
        // "y" ("je y vais" → j'y). Word-initial "y…" (yoga) is consonantal: no.
        const startsWithVowel = VOWELS.has(nextFirstChar);
        const startsWithH = nextFirstChar === 'h';
        const bareY = nextW === 'y';

        if (!startsWithVowel && !startsWithH && !bareY) continue;

        // Vowel-initial words that still take no elision ("le oui", "que oui").
        if (NO_ELISION_NEXT.has(nextW)) continue;

        // If h-initial, check h-aspire exception. The H_ASPIRE set stores
        // accent-stripped keys (heros), so strip the candidate too — otherwise
        // "héros" (with é) misses the set and "Le héros" → "L'héros" (wrong;
        // h-aspiré takes no elision). A prefix pass covers inflections
        // (haut/haute/hauteur, huit/huitième, harcèl-ement).
        const nextStripped = nextW.normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (startsWithH && (H_ASPIRE.has(nextW) || H_ASPIRE.has(nextStripped)
            || H_ASPIRE_PREFIXES.some((p) => nextStripped.startsWith(p)))) continue;

        // Skip function words where elision is nonsensical
        if (NO_ELISION_TARGETS.has(nextW)) continue;

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
