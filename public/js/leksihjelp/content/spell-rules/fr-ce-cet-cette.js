/**
 * Spell-check rule: FR demonstrative adjective gender agreement (FR-21, priority 15).
 *
 * The French demonstrative adjective agrees in gender with its noun:
 * "ce" (masculine) vs "cette" (feminine) before consonant-initial nouns.
 * Norwegian "denne/dette" doesn't map onto French gender, so students pick
 * the wrong form by L1 transfer.
 *
 *   Wrong:   "ce maison"     →  "cette maison"  (maison = f)
 *   Wrong:   "cette livre"   →  "ce livre"      (livre = m)
 *   Correct: "cette femme"   →  no flag (femme = f, cette correct)
 *   Correct: "ce garçon"     →  no flag (garçon = m, ce correct)
 *   Correct: "cet ami"       →  no flag (vowel-initial → "cet", fr-grammar territory)
 *   Correct: "ce que / ce qui" → no flag (pronouns, not in nounLemmaGenus)
 *
 * Only fires on consonant-initial nouns present in the vocabulary. Vowel/h-initial
 * nouns take "cet" and are out of scope (handled by fr-grammar).
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-ce-cet-cette'
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

  // Vowel base letters (NFD) — used to skip vowel/h-initial nouns ("cet" territory).
  const VOWEL_CHARS = new Set('aeiouyàâäéèêëïîôùûüÿœæ'.split(''));

  const rule = {
    id: 'fr-ce-cet-cette',
    languages: ['fr'],
    priority: 15,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Demonstrative gender agreement via nounLemmaGenus lookup — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Det franske påpekende ordet samsvarer i kjønn med substantivet. <em>${finding.fix}</em> er riktig foran ${finding.nounGenus === 'f' ? 'hunkjønnsord' : 'hankjønnsord'}: <em>${finding.fix} ${finding.nounWord}</em>.`,
      nn: `Det franske påpeikande ordet samsvarar i kjønn med substantivet. <em>${finding.fix}</em> er rett framfor ${finding.nounGenus === 'f' ? 'hokjønnsord' : 'hankjønnsord'}: <em>${finding.fix} ${finding.nounWord}</em>.`,
      en: `The French demonstrative agrees in gender with the noun. <em>${finding.fix}</em> is correct before a ${finding.nounGenus === 'f' ? 'feminine' : 'masculine'} noun: <em>${finding.fix} ${finding.nounWord}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const nounLemmaGenus = ctx.vocab && ctx.vocab.nounLemmaGenus;
      if (!nounLemmaGenus || !nounLemmaGenus.size) return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const demTok = tokens[i];
        const noun = tokens[i + 1];

        // Avoid flagging the demonstrative the user is actively typing.
        if (cursorPos != null && cursorPos >= demTok.start && cursorPos <= demTok.end + 1) continue;

        const demW = demTok.word.toLowerCase();
        if (demW !== 'ce' && demW !== 'cette') continue;

        const nounW = noun.word.toLowerCase();

        // Skip vowel/h-initial nouns — they take "cet" (fr-grammar territory).
        const first = (nounW[0] || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (VOWEL_CHARS.has(first) || first === 'h') continue;

        // Skip nouns not in vocab — safest default (rejects "ce que", "ce qui", etc.).
        const genus = nounLemmaGenus.get(nounW);
        if (!genus) continue;

        let fixWord = null;
        if (demW === 'ce' && genus === 'f') fixWord = 'cette';
        else if (demW === 'cette' && genus === 'm') fixWord = 'ce';
        if (!fixWord) continue;

        const origDem = text.slice(demTok.start, demTok.end);

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: demTok.start,
          end: demTok.end,
          original: origDem,
          fix: matchCase(origDem, fixWord),
          nounGenus: genus,
          nounWord: nounW,
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
