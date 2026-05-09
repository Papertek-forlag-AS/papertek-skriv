/**
 * Spell-check rule: NB/NN compound-noun gender mismatch (COMP-04, priority 71).
 *
 * Phase 17. Norwegian compound nouns inherit gender from their LAST component:
 *   "en fotballsko" (sko = m), "et fotballsko" is wrong
 *
 * Flags article + noun where the noun is NOT already in nounGenus but the
 * shared decomposition engine (Phase 16) can split it into known noun
 * components with high confidence — and the article's gender doesn't match
 * the last component's gender.
 *
 * Only fires when:
 *   (a) compound word NOT already in nounGenus (known nouns use nb-gender at priority 10)
 *   (b) preceded by an NB or NN article (en/ei/et for NB, ein/ei/eit for NN)
 *   (c) decomposition has 'high' confidence (both parts are known nouns)
 *   (d) inferred gender differs from article's gender
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Article-to-gender mapping for NB and NN
  const ARTICLE_GENDER = {
    'en': 'm', 'ei': 'f', 'et': 'n',    // NB
    'ein': 'm', 'eit': 'n',              // NN (ei = f, shared with NB)
  };

  // Gender-to-correct-article lookup, keyed by lang then genus
  const GENUS_ARTICLE = {
    nb: { 'm': 'en', 'f': 'ei', 'n': 'et' },
    nn: { 'm': 'ein', 'f': 'ei', 'n': 'eit' },
  };

  // Gender label for student-friendly messages
  const GENUS_LABEL = {
    nb: { 'm': 'hankjønn', 'f': 'hunkjønn', 'n': 'intetkjønn' },
    nn: { 'm': 'hankjønn', 'f': 'hokjønn', 'n': 'inkjekjønn' },
  };

  const rule = {
    id: 'nb-compound-gender',
    languages: ['nb', 'nn'],
    priority: 71,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (nb-compound-gender) — Chrome native parity confirmed in 33-03 audit: NB compound gender derived via lookup against gender map; single-token suggestion",
      category: "grammar-lookup",
    },
    severity: 'warning',

    explain: (finding) => {
      const noun = finding.noun_display || 'ordet';
      const genusNb = (GENUS_LABEL.nb[finding.actualGenus]) || 'ukjent kjønn';
      const genusNn = (GENUS_LABEL.nn[finding.actualGenus]) || 'ukjent kjønn';
      const fixText = finding.fix || '';
      return {
        nb: `Substantivet <em>${escapeHtml(noun)}</em> er ${escapeHtml(genusNb)} (fra <em>${escapeHtml(finding.suffix || '')}</em>). Prøv <em>${escapeHtml(fixText)}</em>.`,
        nn: `Substantivet <em>${escapeHtml(noun)}</em> er ${escapeHtml(genusNn)} (frå <em>${escapeHtml(finding.suffix || '')}</em>). Prøv <em>${escapeHtml(fixText)}</em>.`,
      };
    },

    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed, lang } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const decompose = vocab.decomposeCompound;
      if (!decompose) return [];
      const out = [];

      const effectiveLang = (lang === 'nb' || lang === 'nn') ? lang : 'nb';
      const genusArticle = GENUS_ARTICLE[effectiveLang] || GENUS_ARTICLE.nb;

      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        const prev = tokens[i - 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        const articleGender = ARTICLE_GENDER[prev.word];
        if (!articleGender) continue;

        // Only fire for nouns NOT in nounGenus (known nouns handled by nb-gender at priority 10)
        if (nounGenus.has(t.word)) continue;

        const decomposition = decompose(t.word);
        if (!decomposition || decomposition.confidence !== 'high') continue;

        const inferredGender = decomposition.gender;
        if (!inferredGender || inferredGender === articleGender) continue;

        // NB allows 'en' for feminine nouns (common gender tolerance)
        if (effectiveLang === 'nb' && inferredGender === 'f' && prev.word === 'en') continue;

        // Gender mismatch — flag it
        const correctArticle = genusArticle[inferredGender];
        if (!correctArticle) continue;

        const lastPart = decomposition.parts[decomposition.parts.length - 1];
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          severity: rule.severity,
          tokenIndex: i - 1,
          start: prev.start,
          end: t.end,
          original: prev.display + ' ' + t.display,
          fix: (matchCase ? matchCase(prev.display, correctArticle) : correctArticle) + ' ' + t.display,
          noun_display: t.display,
          actualGenus: inferredGender,
          suffix: lastPart.word,
          message: `Kjønnsfeil: "${t.display}" er ${inferredGender} (fra "${lastPart.word}") — bruk "${correctArticle}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
