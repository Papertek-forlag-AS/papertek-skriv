(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  // "tout les" is always an error in standard French.
  // Before masculine plural → "tous les"; before feminine plural → "toutes les".
  // Norwegian "alle" is invariant, so students transfer that pattern.

  const rule = {
    id: 'fr-tout-tous',
    languages: ['fr'],
    priority: 25,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Quantifier agreement across gender/number before plural article — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `<em>tout les</em> er aldri korrekt — bytt <em>${finding.original}</em> med <em>${finding.fix}</em> (${finding.genus === 'f' ? 'feminint' : 'maskulint'} flertall).`,
      nn: `<em>tout les</em> er aldri korrekt — byt <em>${finding.original}</em> med <em>${finding.fix}</em> (${finding.genus === 'f' ? 'feminint' : 'maskulint'} fleirtal).`,
      en: `<em>tout les</em> is never correct — change <em>${finding.original}</em> to <em>${finding.fix}</em> (${finding.genus === 'f' ? 'feminine' : 'masculine'} plural).`,
    }),
    check(ctx) {
      const { tokens, text, cursorPos, lang } = ctx;
      if (lang !== 'fr') return [];
      const nounGenus = (ctx.vocab && ctx.vocab.nounGenus instanceof Map) ? ctx.vocab.nounGenus : new Map();
      const nounLemmaGenus = (ctx.vocab && ctx.vocab.nounLemmaGenus instanceof Map) ? ctx.vocab.nounLemmaGenus : new Map();
      if (!nounGenus.size) return [];
      const out = [];
      for (let i = 0; i < tokens.length - 2; i++) {
        if (tokens[i].word.toLowerCase() !== 'tout') continue;
        if (tokens[i + 1].word.toLowerCase() !== 'les') continue;
        const nounTok = tokens[i + 2];
        const w = nounTok.word.toLowerCase();
        if (!nounGenus.has(w) || nounLemmaGenus.has(w)) continue;
        // Verify no punctuation between the three tokens
        const gap1 = text.slice(tokens[i].end, tokens[i + 1].start);
        const gap2 = text.slice(tokens[i + 1].end, nounTok.start);
        if (/[^ \t]/.test(gap1) || /[^ \t]/.test(gap2)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i].end) continue;
        const genus = nounGenus.get(w);
        const correctForm = genus === 'f' ? 'toutes' : 'tous';
        const origTout = text.slice(tokens[i].start, tokens[i].end);
        const fix = origTout[0] >= 'A' && origTout[0] <= 'Z'
          ? correctForm[0].toUpperCase() + correctForm.slice(1)
          : correctForm;
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: tokens[i].start,
          end: tokens[i].end,
          original: origTout,
          fix,
          genus: genus || 'm',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
