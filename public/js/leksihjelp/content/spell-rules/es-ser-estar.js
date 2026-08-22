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
      if (finding.profession) {
        return {
          nb: 'Yrkesbetegnelser brukes med <em>ser</em> (permanent egenskap), ikke <em>estar</em>. Skriv <em>' + escapeHtml(correctCopula) + '</em>.',
          nn: 'Yrkesnemningar vert brukt med <em>ser</em> (permanent eigenskap), ikkje <em>estar</em>. Skriv <em>' + escapeHtml(correctCopula) + '</em>.',
        };
      }
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

      // Resolve adjective to its masculine-singular base form in COPULA_ADJ.
      // The table keys on masculine singular (cansado, enfermo, alto, ...), so
      // we normalize gender/number before lookup:
      //   feminine sing  -a  -> -o   (enferma  -> enfermo)
      //   feminine plural -as -> -o   (enfermas -> enfermo)
      //   masculine plural -os -> -o  (cansados -> cansado, via the -s strip)
      //   invariant plural -es/-s     (jovenes  -> joven, altos -> alto)
      // Note: entries already keyed feminine (e.g. embarazada) hit the first
      // exact-match branch before the -a normalization, so they still resolve.
      function resolveAdj(w) {
        if (w in COPULA_ADJ) return w;
        // feminine plural: enfermas -> enfermo
        if (w.endsWith('as') && (w.slice(0, -2) + 'o' in COPULA_ADJ)) return w.slice(0, -2) + 'o';
        // feminine singular: enferma -> enfermo
        if (w.endsWith('a') && (w.slice(0, -1) + 'o' in COPULA_ADJ)) return w.slice(0, -1) + 'o';
        if (w.endsWith('es') && (w.slice(0, -2) in COPULA_ADJ)) return w.slice(0, -2);
        if (w.endsWith('s') && (w.slice(0, -1) in COPULA_ADJ)) return w.slice(0, -1);
        return null;
      }

      // Profession nouns that require ser (not estar).
  // Stored as masculine-singular base forms; feminine/plural resolved by suffix-stripping.
  // Pattern: estar + [optional article] + profession noun → flag (use ser instead).
  const PROFESSION_NOUNS = new Set([
    // core school-level professions (A1–B1 curriculum)
    'profesor', 'maestro', 'director', 'secretario', 'decano',
    'médico', 'medico', 'enfermero', 'dentista', 'cirujano', 'veterinario',
    'abogado', 'juez', 'fiscal', 'notario',
    'ingeniero', 'arquitecto', 'programador', 'informático', 'informatico',
    'economista', 'contable', 'contador', 'funcionario',
    'periodista', 'escritor', 'pintor', 'fotógrafo', 'fotografo',
    'actor', 'cantante', 'bailarín', 'bailarin', 'músico', 'musico',
    'cocinero', 'camarero', 'panadero', 'carnicero', 'jardinero', 'peluquero',
    'taxista', 'piloto', 'mecánico', 'mecanico', 'electricista', 'fontanero', 'carpintero',
    'policía', 'policia', 'bombero', 'militar', 'soldado',
    'deportista', 'futbolista', 'atleta',
    'psicólogo', 'psicologo', 'fisioterapeuta', 'farmacéutico', 'farmaceutico',
    'filósofo', 'filosofo', 'político', 'politico',
    'artista', 'diseñador', 'disenador', 'detective',
    'estudiante', 'alumno',
    'guía', 'guia', 'gerente', 'jefe',
  ]);
  function resolveProf(w) {
    if (PROFESSION_NOUNS.has(w)) return w;
    // feminine plural: two patterns — consonant-stem (profesoras→profesor) and
    // -o stem (cocineras→cocinero).
    if (w.endsWith('as')) {
      if (PROFESSION_NOUNS.has(w.slice(0, -2))) return w.slice(0, -2);          // profesoras→profesor
      if (PROFESSION_NOUNS.has(w.slice(0, -2) + 'o')) return w.slice(0, -2) + 'o'; // cocineras→cocinero
    }
    // feminine singular: profesora→profesor (remove -a) OR cocinera→cocinero (-a→-o).
    if (w.endsWith('a')) {
      if (PROFESSION_NOUNS.has(w.slice(0, -1))) return w.slice(0, -1);          // profesora→profesor
      if (PROFESSION_NOUNS.has(w.slice(0, -1) + 'o')) return w.slice(0, -1) + 'o'; // cocinera→cocinero
    }
    // masculine plural -es: jueces -> juez (irregular — handle common case)
    if (w.endsWith('es') && PROFESSION_NOUNS.has(w.slice(0, -2))) return w.slice(0, -2);
    // masculine plural -s: profesores -> profesor
    if (w.endsWith('s') && PROFESSION_NOUNS.has(w.slice(0, -1))) return w.slice(0, -1);
    return null;
  }

  // v3.0.130: food/drink subjects for the temperature pattern below.
      // frío/caliente are genuinely 'both' in general Spanish ("el invierno
      // es frío" is correct ser — inherent climate), so they can't live in
      // COPULA_ADJ. But with a FOOD/DRINK subject the temperature is the
      // current state of the served item — estar is the A2-curriculum norm
      // ("La sopa estaba fría"). Closed noun set keeps precision structural.
      const FOOD_DRINK_NOUNS = new Set([
        'sopa', 'comida', 'cena', 'desayuno', 'almuerzo', 'plato',
        'café', 'cafe', 'té', 'leche', 'agua', 'chocolate',
        'pizza', 'pasta', 'arroz', 'carne', 'pescado', 'pan', 'tortilla',
      ]);
      const TEMP_ADJ = new Set(['frío', 'frio', 'caliente', 'templado', 'tibio', 'helado']);
      function resolveTempAdj(w) {
        if (TEMP_ADJ.has(w)) return w;
        if (w.endsWith('as') && TEMP_ADJ.has(w.slice(0, -2) + 'o')) return w.slice(0, -2) + 'o';
        if (w.endsWith('a') && TEMP_ADJ.has(w.slice(0, -1) + 'o')) return w.slice(0, -1) + 'o';
        if (w.endsWith('es') && TEMP_ADJ.has(w.slice(0, -2))) return w.slice(0, -2);
        if (w.endsWith('s') && TEMP_ADJ.has(w.slice(0, -1))) return w.slice(0, -1);
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

          // Food/drink + ser + temperature adjective → estar (synthetic
          // probe es/syn-03: "La sopa era fría" → estaba).
          if (usedCopula === 'ser' && i > range.start) {
            const subj = ctx.tokens[i - 1].word;
            if (FOOD_DRINK_NOUNS.has(subj) || (subj.endsWith('s') && FOOD_DRINK_NOUNS.has(subj.slice(0, -1)))) {
              let tIdx = -1, tBase = null;
              const tScanEnd = Math.min(i + 4, range.end);
              for (let j = i + 1; j < tScanEnd; j++) {
                const w = ctx.tokens[j].word;
                if (SKIP_WORDS.has(w)) continue;
                tBase = resolveTempAdj(w);
                if (tBase) tIdx = j;
                break;
              }
              if (tIdx !== -1) {
                const fixBase = COPULA_FORM_MAP[word];
                if (fixBase) {
                  const fix = matchCase(ctx.tokens[i].display, fixBase);
                  findings.push({
                    rule_id: 'es-ser-estar',
                    start: ctx.tokens[i].start,
                    end: ctx.tokens[i].end,
                    original: ctx.tokens[i].display,
                    fix: fix,
                    adj: tBase,
                    correctCopula: 'estar',
                    wrongCopula: 'ser',
                    message: ctx.tokens[i].display + ' + ' + ctx.tokens[tIdx].display + ' → ' + fix,
                    severity: 'warning',
                  });
                  continue;
                }
              }
            }
          }

          // estar + profession noun (direct adjacency) → use ser instead.
          // Requires no article between copula and noun to avoid FPs on
          // locative questions: "¿Está el médico aquí?" should not flag.
          // "estar de profesora" (temporary role) also excluded since 'de'
          // is not a profession noun.
          if (usedCopula === 'estar') {
            const nextTok = ctx.tokens[i + 1];
            if (nextTok) {
              const profBase = resolveProf(nextTok.word);
              if (profBase) {
                const fixBase = COPULA_FORM_MAP[word];
                if (fixBase) {
                  const fix = matchCase(ctx.tokens[i].display, fixBase);
                  findings.push({
                    rule_id: 'es-ser-estar',
                    start: ctx.tokens[i].start,
                    end: ctx.tokens[i].end,
                    original: ctx.tokens[i].display,
                    fix,
                    adj: nextTok.word,
                    correctCopula: 'ser',
                    wrongCopula: 'estar',
                    profession: true,
                    message: ctx.tokens[i].display + ' + ' + nextTok.display + ' → ' + fix,
                    severity: 'warning',
                  });
                  continue;
                }
              }
            }
          }

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

          // Passive / compound voice: "El puesto ha sido ocupado" is ser +
          // past participle (passive), not copula + adjective. The participle
          // copula forms sido/estado followed by another participle (-ado/-ido)
          // are an auxiliary chain — skip to avoid flagging the passive.
          if ((word === 'sido' || word === 'estado') && /(?:ad[oa]s?|id[oa]s?)$/.test(ctx.tokens[adjIdx].word)) continue;

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
