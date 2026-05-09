/**
 * Spell-check rule: Spanish and French gender article mismatch (priority 15).
 *
 * Flags article-noun pairs where the article's grammatical gender 
 * does not match the noun's gender.
 * 
 * Spanish: el/un (m), la/una (f)
 * French: le/un (m), la/une (f)
 *
 * Rule ID: 'gender'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml, getString } = host.__lexiSpellCore || {};

  const ARTICLE_GENUS = {
    es: { 'el': 'm', 'un': 'm', 'la': 'f', 'una': 'f' },
    fr: { 'le': 'm', 'un': 'm', 'la': 'f', 'une': 'f' },
  };
  const GENUS_ARTICLE = {
    es: { 'm': 'el', 'f': 'la' },
    fr: { 'm': 'le', 'f': 'la' },
  };

  const GENUS_TO_LABEL_KEY = { m: 'gender_label_m', f: 'gender_label_f', n: 'gender_label_n' };

  const rule = {
    id: 'gender',
    languages: ['es', 'fr'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (es-fr-gender) — Chrome native parity confirmed in 33-03 audit: ES/FR article gender lookup against noun gender map; single-token article swap",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      const labelKey = GENUS_TO_LABEL_KEY[finding.actualGenus];
      const nounDisplay = finding.noun_display;
      
      if (!labelKey || !nounDisplay || typeof getString !== 'function') {
        return {
          nb: `<em>${escapeHtml(finding.original)}</em> kan være feil kjønn — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `<em>${escapeHtml(finding.original)}</em> kan vere feil kjønn — prøv <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      const labelNb = getString(labelKey, 'nb');
      const labelNn = getString(labelKey, 'nn');
      return {
        nb: `<em>${escapeHtml(finding.original)}</em> kan være feil kjønn — <em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNb)}. Prøv <em>${escapeHtml(finding.fix)}</em>.`,
        nn: `<em>${escapeHtml(finding.original)}</em> kan vere feil kjønn — <em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNn)}. Prøv <em>${escapeHtml(finding.fix)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const articles = ARTICLE_GENUS[lang];
      const genusArticle = GENUS_ARTICLE[lang];
      if (!articles) return [];
      
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const prev = tokens[i - 1];
        const prevPrev = tokens[i - 2];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        let articleTok = null;
        if (prev && articles[prev.word]) articleTok = prev;
        else if (prevPrev && articles[prevPrev.word]) articleTok = prevPrev;

        if (articleTok && nounGenus.has(t.word)) {
          const expected = articles[articleTok.word];
          const actual = nounGenus.get(t.word);

          if (actual && actual !== expected) {
            // Suggest the correct definite article for definite errors, 
            // and correct indefinite for indefinite errors.
            let correctArticle = null;
            if (articleTok.word === 'un' || articleTok.word === 'una' || articleTok.word === 'une') {
              correctArticle = (lang === 'fr' && actual === 'f') ? 'une' : 'un';
              if (lang === 'es' && actual === 'f') correctArticle = 'una';
            } else {
              correctArticle = genusArticle[actual];
            }

            if (correctArticle) {
              out.push({
                rule_id: 'gender',
                priority: rule.priority,
                start: articleTok.start,
                end: articleTok.end,
                original: articleTok.display,
                noun_display: t.display,
                actualGenus: actual,
                fix: matchCase(articleTok.display, correctArticle),
                message: `Kjønn: "${articleTok.display} ${t.display}" skulle vært "${correctArticle} ${t.display}"`,
              });
            }
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
