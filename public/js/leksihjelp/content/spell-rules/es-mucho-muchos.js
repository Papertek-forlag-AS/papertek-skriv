(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  // Quantifiers that must agree with plural nouns in number and gender.
  // Norwegian 'mye'/'lite' are invariant — students transfer that pattern.
  const QUANTIFIERS = {
    mucho: { m: 'muchos', f: 'muchas' },
    poco:  { m: 'pocos',  f: 'pocas'  },
  };

  const rule = {
    id: 'es-mucho-muchos',
    languages: ['es'],
    priority: 25,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Quantifier-noun agreement lookup across gender/number — syntactic, not single-token',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Foran flertallssubstantiv bøyes <em>${finding.base}</em> etter kjønn og tall — bytt <em>${finding.original}</em> med <em>${finding.fix}</em>.`,
      nn: `Framfor fleirtalsssubstantiv vert <em>${finding.base}</em> bøygd etter kjønn og tal — byt <em>${finding.original}</em> med <em>${finding.fix}</em>.`,
      en: `Before plural nouns, <em>${finding.base}</em> inflects for gender and number — change <em>${finding.original}</em> to <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      const { tokens, text, cursorPos, lang } = ctx;
      if (lang !== 'es') return [];
      const nounGenus = (ctx.vocab && ctx.vocab.nounGenus instanceof Map) ? ctx.vocab.nounGenus : new Map();
      const nounLemmaGenus = (ctx.vocab && ctx.vocab.nounLemmaGenus instanceof Map) ? ctx.vocab.nounLemmaGenus : new Map();
      if (!nounGenus.size) return [];
      const out = [];
      for (let i = 0; i < tokens.length - 1; i++) {
        const qTok = tokens[i];
        const qMap = QUANTIFIERS[qTok.word];
        if (!qMap) continue;
        const nextTok = tokens[i + 1];
        const gap = text.slice(qTok.end, nextTok.start);
        if (/[^ \t]/.test(gap)) continue;
        const w = nextTok.word;
        if (!nounGenus.has(w) || nounLemmaGenus.has(w)) continue;
        if (cursorPos != null && cursorPos >= qTok.start && cursorPos <= qTok.end) continue;
        const genus = nounGenus.get(w);
        const correctForm = qMap[genus] || qMap.m;
        const origQ = text.slice(qTok.start, qTok.end);
        const fix = origQ[0] >= 'A' && origQ[0] <= 'Z'
          ? correctForm[0].toUpperCase() + correctForm.slice(1)
          : correctForm;
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: qTok.start,
          end: qTok.end,
          original: origQ,
          fix,
          base: qTok.word,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
