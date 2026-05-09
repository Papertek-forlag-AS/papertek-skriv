/**
 * Spell-check rule: ES ser/estar copula-adjective mismatch (ES-01, priority 50).
 *
 * Phase 9. Flags when a conjugated ser form precedes an estar-only adjective
 * (or vice versa), based on a closed-set lookup table in grammar-tables.js.
 *
 *   Wrong:   "Soy cansado" (cansado requires estar -> "Estoy cansado")
 *   Correct: "Estoy cansado"
 *
 * Adjectives tagged 'both' (aburrido, listo, etc.) never produce a finding.
 * Accent-stripped copula forms (esta, estan) are recognized as estar conjugations.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { tokensInSentence, matchCase: coreMatchCase } = core;

  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original[0] === original[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  function escapeHtml(s) {
    const fn = core.escapeHtml;
    if (fn) return fn(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Conjugation form mapping: ser <-> estar ──
  // Maps each ser form to the corresponding estar form (same person/number/tense)
  // and vice versa.
  const COPULA_FORM_MAP = {
    // ser -> estar (present)
    soy: 'estoy', eres: 'estas', es: 'esta', somos: 'estamos', sois: 'estais', son: 'estan',
    // ser -> estar (imperfect)
    era: 'estaba', eras: 'estabas', eramos: 'estabamos', erais: 'estabais', eran: 'estaban',
    // ser -> estar (preterite)
    fui: 'estuve', fuiste: 'estuviste', fue: 'estuvo', fuimos: 'estuvimos', fuisteis: 'estuvisteis', fueron: 'estuvieron',
    // ser -> estar (participle)
    sido: 'estado',
    // estar -> ser (present)
    estoy: 'soy', estas: 'eres', esta: 'es', estamos: 'somos', estais: 'sois', estan: 'son',
    // accented estar forms -> ser (present)
    'estás': 'eres', 'está': 'es', 'estáis': 'sois', 'están': 'son',
    // estar -> ser (imperfect)
    estaba: 'era', estabas: 'eras', estabamos: 'eramos', estabais: 'erais', estaban: 'eran',
    'estábamos': 'eramos',
    // estar -> ser (preterite)
    estuve: 'fui', estuviste: 'fuiste', estuvo: 'fue', estuvimos: 'fuimos', estuvisteis: 'fuisteis', estuvieron: 'fueron',
    // estar -> ser (participle)
    estado: 'sido',
  };

  // Adverbs and particles that may appear between copula and adjective
  const SKIP_WORDS = new Set([
    'muy', 'tan', 'bastante', 'realmente', 'demasiado',
    'no', 'ya', 'todavia', 'todavía',
  ]);

  // Lazy-init grammar tables
  let _tables = null;
  function getTables() {
    if (_tables) return _tables;
    const gt = host.__lexiGrammarTables || {};
    _tables = {
      SER_FORMS: gt.ES_SER_FORMS || new Set(),
      ESTAR_FORMS: gt.ES_ESTAR_FORMS || new Set(),
      COPULA_ADJ: gt.ES_COPULA_ADJ || {},
    };
    return _tables;
  }

  const rule = {
    id: 'es-ser-estar',
    languages: ['es'],
    priority: 50,
    // exam-audit 33-03: stays safe=false — Ser/estar choice is semantic + context dependent; not single-token lookup
    exam: {
      safe: false,
      reason: "Stays safe=false (es-ser-estar) — Ser/estar choice is semantic + context dependent; not single-token lookup",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      const adj = finding.adj || '';
      const correctCopula = finding.correctCopula || '';
      const wrongCopula = finding.wrongCopula || '';
      return {
        nb: 'Adjektivet <em>' + escapeHtml(adj) + '</em> brukes med <em>' + escapeHtml(correctCopula) + '</em>, ikke <em>' + escapeHtml(wrongCopula) + '</em>.',
        nn: 'Adjektivet <em>' + escapeHtml(adj) + '</em> vert brukt med <em>' + escapeHtml(correctCopula) + '</em>, ikkje <em>' + escapeHtml(wrongCopula) + '</em>.',
        severity: 'warning',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      if (!ctx.sentences || !tokensInSentence) return [];

      const { SER_FORMS, ESTAR_FORMS, COPULA_ADJ } = getTables();
      if (!SER_FORMS.size && !ESTAR_FORMS.size) return [];

      // Resolve adjective to its singular base form in COPULA_ADJ.
      // Spanish plurals: -es ending (jovenes->joven), -s ending (altos->alto).
      function resolveAdj(w) {
        if (w in COPULA_ADJ) return w;
        if (w.endsWith('es') && (w.slice(0, -2) in COPULA_ADJ)) return w.slice(0, -2);
        if (w.endsWith('s') && (w.slice(0, -1) in COPULA_ADJ)) return w.slice(0, -1);
        return null;
      }

      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        if (range.end - range.start < 2) continue;

        for (let i = range.start; i < range.end - 1; i++) {
          const word = ctx.tokens[i].word; // already lowercased
          let usedCopula = null;

          if (SER_FORMS.has(word)) {
            usedCopula = 'ser';
          } else if (ESTAR_FORMS.has(word)) {
            usedCopula = 'estar';
          }
          if (!usedCopula) continue;

          // Scan next 1-3 tokens for an adjective in COPULA_ADJ
          let adjIdx = -1;
          let adjBase = null;
          const scanEnd = Math.min(i + 4, range.end);
          for (let j = i + 1; j < scanEnd; j++) {
            const nextWord = ctx.tokens[j].word;
            if (SKIP_WORDS.has(nextWord)) continue;
            // Check if it's a copula adjective (singular or plural form)
            const base = resolveAdj(nextWord);
            if (base) {
              adjIdx = j;
              adjBase = base;
            }
            break; // stop after first non-skip token
          }

          if (adjIdx === -1) continue;

          const adjWord = adjBase;
          const requiredCopula = COPULA_ADJ[adjWord];

          // Skip 'both' adjectives — ambiguous, no flag
          if (requiredCopula === 'both') continue;
          // Skip if copula is already correct
          if (requiredCopula === usedCopula) continue;

          // Build fix: map the used form to the correct copula form
          const fixBase = COPULA_FORM_MAP[word];
          if (!fixBase) continue;
          const fix = matchCase(ctx.tokens[i].display, fixBase);

          findings.push({
            rule_id: 'es-ser-estar',
            start: ctx.tokens[i].start,
            end: ctx.tokens[i].end,
            original: ctx.tokens[i].display,
            fix: fix,
            adj: adjWord,
            correctCopula: requiredCopula,
            wrongCopula: usedCopula,
            message: ctx.tokens[i].display + ' + ' + ctx.tokens[adjIdx].display + ' → ' + fix,
            severity: 'warning',
          });
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
