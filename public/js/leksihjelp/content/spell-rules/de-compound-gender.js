/**
 * Spell-check rule: DE compound-noun gender inference (DE-04, priority 71).
 *
 * Phase 8. German compound nouns inherit gender from their LAST component:
 *   "die Haustür" (Tür = f), "das Kinderzimmer" (Zimmer = n)
 *
 * Flags article + noun where the noun is NOT already in nounGenus but the
 * shared decomposition engine (Phase 16) can split it into known noun
 * components — and the article's gender doesn't match the last component's
 * gender.
 *   Wrong:   "das Haustür" (Tür = f → die Haustür)
 *   Correct: "die Haustür"
 *
 * Only fires when:
 *   (a) compound word NOT already in nounGenus (known nouns use de-gender rule)
 *   (b) preceded by a German article (der/die/das/ein/eine/einen/einem/einer)
 *   (c) inferred gender differs from article's gender
 *   (d) decomposition has 'high' confidence (both parts are known nouns)
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Correct nominative article for each genus
  const GENUS_TO_DEF_ARTICLE = { m: 'der', f: 'die', n: 'das' };
  const GENUS_TO_INDEF_ARTICLE = { m: 'ein', f: 'eine', n: 'ein' };

  // ── Lazy-init grammar tables (may not be loaded yet at IIFE time) ──
  let _allArticles = null;
  let _articleToNomGenera = null; // article → Set of possible nominative genders
  let _defArticleCase = null;
  let _indefArticleCase = null;

  function ensureTables() {
    if (_allArticles) return true;
    const tables = host.__lexiGrammarTables;
    if (!tables || !tables.DEF_ARTICLE_CASE) return false;

    _defArticleCase = tables.DEF_ARTICLE_CASE;
    _indefArticleCase = tables.INDEF_ARTICLE_CASE || {};

    _allArticles = new Set([
      ...Object.keys(_defArticleCase),
      ...Object.keys(_indefArticleCase),
    ]);

    // Build article → Set of possible nominative genders.
    // 'ein' can be both m and n nominative — must check all possibilities.
    _articleToNomGenera = {};
    for (const [art, interps] of Object.entries(_defArticleCase)) {
      const genders = new Set();
      for (const i of interps) { if (i.case === 'nominativ') genders.add(i.genus); }
      if (genders.size) _articleToNomGenera[art] = genders;
    }
    for (const [art, interps] of Object.entries(_indefArticleCase)) {
      const genders = _articleToNomGenera[art] || new Set();
      for (const i of interps) { if (i.case === 'nominativ') genders.add(i.genus); }
      if (genders.size) _articleToNomGenera[art] = genders;
    }
    return true;
  }

  const rule = {
    id: 'de-compound-gender',
    languages: ['de'],
    priority: 71,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (de-compound-gender) — Chrome native parity confirmed in 33-03 audit: DE compound gender derived via head-noun lookup; single-token article suggestion",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: (finding) => {
      const suffix = finding.suffix || '';
      const correctArt = finding.fix || '';
      return {
        nb: `<em>${escapeHtml(finding.original)}</em> er feil artikkel — sammensatte substantiv arver kjønn fra siste del (<em>${escapeHtml(suffix)}</em>). Prøv <em>${escapeHtml(correctArt)}</em>.`,
        nn: `<em>${escapeHtml(finding.original)}</em> er feil artikkel — samansette substantiv arvar kjønn frå siste del (<em>${escapeHtml(suffix)}</em>). Prøv <em>${escapeHtml(correctArt)}</em>.`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'de') return [];
      if (!ensureTables()) return [];

      const { tokens, vocab } = ctx;
      const nounGenus = (vocab && vocab.nounGenus) || new Map();
      const out = [];

      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        const prev = tokens[i - 1];

        // Previous token must be a German article
        if (!_allArticles.has(prev.word)) continue;

        // Current token must be capitalized (German nouns are capitalized)
        if (!t.display || t.display[0] !== t.display[0].toUpperCase() ||
            t.display[0] === t.display[0].toLowerCase()) continue;

        // Skip if the noun is already in nounGenus (known noun — de-gender handles it)
        if (nounGenus.has(t.word)) continue;

        // Skip if token is too short to be a compound
        if (t.word.length < 5) continue;

        // Phase 17: delegate to shared decomposeCompound engine (replaces
        // inline suffix-only gender inference). Requires BOTH parts to be
        // known nouns — fewer false positives than suffix-only matching.
        const decompose = vocab.decomposeCompound;
        if (!decompose) continue;
        const decomposition = decompose(t.word);
        if (!decomposition || decomposition.confidence !== 'high') continue;
        const inference = {
          genus: decomposition.gender,
          suffix: decomposition.parts[decomposition.parts.length - 1].word,
        };
        if (!inference.genus) continue;

        // Determine the article's possible genders (nominative context)
        const articleGenera = _articleToNomGenera[prev.word];
        if (!articleGenera) continue;

        // If the inferred gender matches ANY of the article's possible genders, no problem
        if (articleGenera.has(inference.genus)) continue;

        // Check structural suppression
        if (ctx.suppressedFor && ctx.suppressedFor.structural &&
            ctx.suppressedFor.structural.has(prev.start)) continue;

        // Determine correct article (use first genus from the Set for definite/indef lookup)
        const isDef = !!_defArticleCase[prev.word];
        const correctArticle = isDef
          ? GENUS_TO_DEF_ARTICLE[inference.genus]
          : GENUS_TO_INDEF_ARTICLE[inference.genus];
        if (!correctArticle) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: prev.start,
          end: prev.end,
          original: prev.display,
          fix: matchCase ? matchCase(prev.display, correctArticle) : correctArticle,
          suffix: inference.suffix,
          inferredGenus: inference.genus,
          message: `Sammensatt: "${prev.display} ${t.display}" — ${inference.suffix} er ${inference.genus}, riktig artikkel: ${correctArticle}`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
