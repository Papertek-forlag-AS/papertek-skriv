/**
 * Spell-check rule: FR demonstrative number agreement (FR-32, priority 11).
 *
 * The singular demonstratives "ce" / "cet" / "cette" all become "ces" in the
 * plural. Norwegian "disse" gives no cue that French collapses gender in the
 * plural, so students keep the singular form before a plural noun.
 *
 *   Wrong:   "ce livres"     →  "ces livres"   (livres = plural)
 *   Wrong:   "cette maisons" →  "ces maisons"  (maisons = plural)
 *   Wrong:   "cet amis"      →  "ces amis"     (amis = plural)
 *   Correct: "ces livres"    →  no flag (already plural)
 *   Correct: "ce livre"      →  no flag (singular → fr-ce-cet-cette territory)
 *
 * Fires only on tokens that are UNAMBIGUOUSLY plural — present in
 * nounPluralGenus but NOT in nounLemmaGenus. This keeps the rule disjoint from
 * fr-ce-cet-cette (which only ever inspects nounLemmaGenus singulars), so the
 * two never double-fire on the same demonstrative, and number-ambiguous nouns
 * that live in both indexes are skipped rather than guessed.
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-ce-ces'
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

  const SINGULAR_DEM = new Set(['ce', 'cet', 'cette']);

  const rule = {
    id: 'fr-ce-ces',
    languages: ['fr'],
    priority: 11,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Demonstrative number agreement via nounPluralGenus lookup — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `I flertall blir alle de påpekende ordene (<em>ce</em>, <em>cet</em>, <em>cette</em>) til <em>ces</em>. <em>${finding.nounWord}</em> er flertall, så det heter <em>ces ${finding.nounWord}</em>.`,
      nn: `I fleirtal blir alle dei påpeikande orda (<em>ce</em>, <em>cet</em>, <em>cette</em>) til <em>ces</em>. <em>${finding.nounWord}</em> er fleirtal, så det heiter <em>ces ${finding.nounWord}</em>.`,
      en: `In the plural every demonstrative (<em>ce</em>, <em>cet</em>, <em>cette</em>) becomes <em>ces</em>. <em>${finding.nounWord}</em> is plural, so it is <em>ces ${finding.nounWord}</em>.`,
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
        const demTok = tokens[i];
        const noun = tokens[i + 1];

        // Avoid flagging the demonstrative the user is actively typing.
        if (cursorPos != null && cursorPos >= demTok.start && cursorPos <= demTok.end + 1) continue;

        const demW = demTok.word.toLowerCase();
        if (!SINGULAR_DEM.has(demW)) continue;

        const nounW = noun.word.toLowerCase();

        // Only fire on UNAMBIGUOUSLY plural nouns: in the plural index, and not
        // also a singular lemma (keeps us disjoint from fr-ce-cet-cette).
        if (!nounPluralGenus.has(nounW)) continue;
        if (nounLemmaGenus && nounLemmaGenus.has(nounW)) continue;

        const origDem = text.slice(demTok.start, demTok.end);

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: demTok.start,
          end: demTok.end,
          original: origDem,
          fix: matchCase(origDem, 'ces'),
          nounWord: nounW,
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
