(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  // "todo los" / "todo las" / "toda las" are always errors in Spanish.
  // The article (los/las) tells us the required agreement form.
  // Norwegian "alle" is invariant — students transfer that pattern.

  const ART_FIX = { los: 'todos', las: 'todas' };

  const rule = {
    id: 'es-todo-todos',
    languages: ['es'],
    priority: 25,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Determiner agreement before plural noun phrase — syntactic',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `<em>${finding.original} ${finding.article}</em> er alltid feil — bytt <em>${finding.original}</em> med <em>${finding.fix}</em>.`,
      nn: `<em>${finding.original} ${finding.article}</em> er alltid feil — byt <em>${finding.original}</em> med <em>${finding.fix}</em>.`,
      en: `<em>${finding.original} ${finding.article}</em> is always wrong — change <em>${finding.original}</em> to <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      const { tokens, text, cursorPos, lang } = ctx;
      if (lang !== 'es') return [];
      const nounGenus = (ctx.vocab && ctx.vocab.nounGenus instanceof Map) ? ctx.vocab.nounGenus : new Map();
      const nounLemmaGenus = (ctx.vocab && ctx.vocab.nounLemmaGenus instanceof Map) ? ctx.vocab.nounLemmaGenus : new Map();
      if (!nounGenus.size) return [];
      const out = [];
      for (let i = 0; i < tokens.length - 2; i++) {
        const tw = tokens[i].word;
        if (tw !== 'todo' && tw !== 'toda') continue;
        const artTok = tokens[i + 1];
        const correctForm = ART_FIX[artTok.word];
        if (!correctForm) continue;
        if (tw === 'toda' && artTok.word !== 'las') continue;
        const nounTok = tokens[i + 2];
        const w = nounTok.word;
        if (!nounGenus.has(w) || nounLemmaGenus.has(w)) continue;
        const gap1 = text.slice(tokens[i].end, artTok.start);
        const gap2 = text.slice(artTok.end, nounTok.start);
        if (/[^ \t]/.test(gap1) || /[^ \t]/.test(gap2)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i].end) continue;
        const origTodo = text.slice(tokens[i].start, tokens[i].end);
        const fix = origTodo[0] >= 'A' && origTodo[0] <= 'Z'
          ? correctForm[0].toUpperCase() + correctForm.slice(1)
          : correctForm;
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: tokens[i].start,
          end: tokens[i].end,
          original: origTodo,
          fix,
          article: artTok.display,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
