/**
 * Spell-check rule: FR interrogative number agreement (FR-33, priority 10).
 *
 * The interrogative adjective agrees in BOTH gender and number with its noun:
 * quel (m.sg) · quelle (f.sg) · quels (m.pl) · quelles (f.pl). Before a plural
 * noun the correct form is "quels" (masculine) or "quelles" (feminine).
 * Norwegian "hvilke" carries no gender, so students leave the singular form or
 * pick the wrong-gender plural.
 *
 *   Wrong:   "quel livres"    →  "quels livres"   (livres = m.pl)
 *   Wrong:   "quelle livres"  →  "quels livres"   (livres = m.pl)
 *   Wrong:   "quels maisons"  →  "quelles maisons"(maisons = f.pl)
 *   Correct: "quels livres"   →  no flag
 *   Correct: "quelles maisons"→  no flag
 *   Correct: "quel livre"     →  no flag (singular → fr-quel-accord territory)
 *
 * Fires only on UNAMBIGUOUSLY plural nouns — in nounPluralGenus but NOT in
 * nounLemmaGenus — so it stays disjoint from fr-quel-accord (singular gender).
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-quel-pluriel'
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

  const QUEL_FORMS = new Set(['quel', 'quelle', 'quels', 'quelles']);

  const rule = {
    id: 'fr-quel-pluriel',
    languages: ['fr'],
    priority: 10,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Interrogative number agreement via nounPluralGenus lookup — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Spørreordet samsvarer i kjønn og tall med substantivet. <em>${finding.nounWord}</em> er ${finding.nounGenus === 'f' ? 'hunkjønn' : 'hankjønn'} flertall, så det heter <em>${finding.fix} ${finding.nounWord}</em>.`,
      nn: `Spørjeordet samsvarar i kjønn og tal med substantivet. <em>${finding.nounWord}</em> er ${finding.nounGenus === 'f' ? 'hokjønn' : 'hankjønn'} fleirtal, så det heiter <em>${finding.fix} ${finding.nounWord}</em>.`,
      en: `The interrogative agrees in gender and number with the noun. <em>${finding.nounWord}</em> is ${finding.nounGenus === 'f' ? 'feminine' : 'masculine'} plural, so it is <em>${finding.fix} ${finding.nounWord}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const vocab = ctx.vocab || {};
      const nounPluralGenus = vocab.nounPluralGenus;
      const nounLemmaGenus = vocab.nounLemmaGenus;
      if (!nounPluralGenus || !nounPluralGenus.size) return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const quelTok = tokens[i];
        const noun = tokens[i + 1];

        // Avoid flagging the interrogative the user is actively typing.
        if (cursorPos != null && cursorPos >= quelTok.start && cursorPos <= quelTok.end + 1) continue;

        const quelW = quelTok.word.toLowerCase();
        if (!QUEL_FORMS.has(quelW)) continue;

        const nounW = noun.word.toLowerCase();

        // Only fire on UNAMBIGUOUSLY plural nouns (disjoint from fr-quel-accord).
        const genus = nounPluralGenus.get(nounW);
        if (!genus) continue;
        if (nounLemmaGenus && nounLemmaGenus.has(nounW)) continue;

        const correct = genus === 'f' ? 'quelles' : 'quels';
        if (quelW === correct) continue;

        const origQuel = text.slice(quelTok.start, quelTok.end);

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: quelTok.start,
          end: quelTok.end,
          original: origQuel,
          fix: matchCase(origQuel, correct),
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
