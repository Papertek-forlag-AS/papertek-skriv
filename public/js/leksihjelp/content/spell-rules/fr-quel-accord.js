/**
 * Spell-check rule: FR interrogative adjective gender agreement (FR-22, priority 14).
 *
 * The French interrogative adjective agrees in gender with its noun:
 * "quel" (masculine) vs "quelle" (feminine). Norwegian "hvilken/hvilket"
 * doesn't map onto French noun gender, so students pick the wrong form.
 *
 *   Wrong:   "quel heure"   →  "quelle heure"  (heure = f)
 *   Wrong:   "quelle film"  →  "quel film"     (film = m)
 *   Correct: "quelle heure est-il" → no flag (heure = f, quelle correct)
 *   Correct: "quel âge"     →  no flag (âge = m, quel correct)
 *   Correct: "quel est ton nom" → no flag (est not a noun in nounLemmaGenus)
 *
 * Unlike the demonstrative (ce/cet/cette), there is no vowel-initial exception:
 * "quelle heure" agrees even before a vowel. Singular forms only — the plural
 * "quels"/"quelles" are out of scope (number agreement, not handled here).
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-quel-accord'
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

  const rule = {
    id: 'fr-quel-accord',
    languages: ['fr'],
    priority: 14,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Interrogative gender agreement via nounLemmaGenus lookup — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Det franske spørreordet samsvarer i kjønn med substantivet. <em>${finding.fix}</em> er riktig foran ${finding.nounGenus === 'f' ? 'hunkjønnsord' : 'hankjønnsord'}: <em>${finding.fix} ${finding.nounWord}</em>.`,
      nn: `Det franske spørjeordet samsvarar i kjønn med substantivet. <em>${finding.fix}</em> er rett framfor ${finding.nounGenus === 'f' ? 'hokjønnsord' : 'hankjønnsord'}: <em>${finding.fix} ${finding.nounWord}</em>.`,
      en: `The French interrogative agrees in gender with the noun. <em>${finding.fix}</em> is correct before a ${finding.nounGenus === 'f' ? 'feminine' : 'masculine'} noun: <em>${finding.fix} ${finding.nounWord}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const nounLemmaGenus = ctx.vocab && ctx.vocab.nounLemmaGenus;
      if (!nounLemmaGenus || !nounLemmaGenus.size) return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const quelTok = tokens[i];
        const noun = tokens[i + 1];

        // Avoid flagging the interrogative the user is actively typing.
        if (cursorPos != null && cursorPos >= quelTok.start && cursorPos <= quelTok.end + 1) continue;

        const quelW = quelTok.word.toLowerCase();
        if (quelW !== 'quel' && quelW !== 'quelle') continue;

        const nounW = noun.word.toLowerCase();

        // Skip non-nouns (rejects "quel est", "quel que", etc.).
        const genus = nounLemmaGenus.get(nounW);
        if (!genus) continue;

        let fixWord = null;
        if (quelW === 'quel' && genus === 'f') fixWord = 'quelle';
        else if (quelW === 'quelle' && genus === 'm') fixWord = 'quel';
        if (!fixWord) continue;

        const origQuel = text.slice(quelTok.start, quelTok.end);

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: quelTok.start,
          end: quelTok.end,
          original: origQuel,
          fix: matchCase(origQuel, fixWord),
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
