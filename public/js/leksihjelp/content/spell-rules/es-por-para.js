/**
 * Spell-check rule: Spanish por/para preposition confusion (ES-02, priority 50).
 *
 * Phase 9. Flags common por/para misuse patterns typical of Norwegian students:
 *   - por + infinitive (purpose) -> para
 *   - por + possessive + human noun (beneficiary) -> para
 *   - por + deadline marker -> para
 *   - para + number + time unit (duration) -> por
 *
 * Safe phrases (por favor, por ejemplo, etc.) are excluded.
 * Trigger data consumed from grammar-tables.js (ES_POR_PARA_TRIGGERS, ES_HUMAN_NOUNS).
 *
 * Severity: warning (P2 amber dot).
 *
 * Phase 32-02: pedagogy strings are sourced from the synced lexicon
 * (`extension/data/es.json` → por_prep.pedagogy / para_prep.pedagogy)
 * via `ctx.vocab.prepPedagogy` (built by vocab-seam-core for any
 * generalbank entry carrying a pedagogy block — language-agnostic). The
 * short popover line returned by explain() is templated per patternType
 * from `pedagogy.subtypes.{patternType}.{nb,nn}` (with `{fix}` / `{wrong}`
 * substitution); the rich Lær mer panel reads `finding.pedagogy` (the
 * full block) directly. The rule file no longer carries inline pedagogy
 * strings — detection logic is byte-for-byte equivalent (the 50-case
 * fixture is the regression lock).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  // ── Safe phrases: never flag por in these ──
  const SAFE_POR_PHRASES = new Set([
    'favor', 'ejemplo', 'eso', 'supuesto', 'fin', 'cierto',
  ]);
  // Multi-word safe phrases starting with "por lo"
  const SAFE_POR_LO = new Set(['menos', 'tanto']);

  // ── Possessive determiners (trigger beneficiary pattern) ──
  const POSSESSIVES = new Set([
    'mi', 'tu', 'su', 'nuestro', 'vuestro',
    'mis', 'tus', 'sus', 'nuestros', 'vuestros',
    'nuestra', 'vuestras', 'nuestras', 'vuestra',
  ]);

  // ── Extended human/family nouns (includes collective "familia") ──
  const FAMILY_COLLECTIVE = new Set(['familia', 'familias']);

  // ── Goal nouns: "estudio por mi trabajo" -> "para mi trabajo" ──
  const GOAL_NOUNS = new Set([
    'trabajo', 'examen', 'futuro', 'carrera', 'salud', 'bienestar',
  ]);

  // ── Deadline markers ──
  const DEADLINE_DAYS = new Set([
    'manana', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes',
    'sabado', 'domingo',
  ]);
  const DEADLINE_MONTHS = new Set([
    'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
    'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  ]);
  const DEADLINE_RELATIVE = new Set(['proximo', 'siguiente', 'proxima', 'siguiente']);

  // ── Duration numbers ──
  const DURATION_NUMBERS = new Set([
    'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho',
    'nueve', 'diez', 'once', 'doce', 'veinte', 'treinta',
    'muchas', 'muchos', 'varias', 'varios', 'algunas', 'algunos',
  ]);
  const TIME_UNITS = new Set([
    'horas', 'dias', 'semanas', 'meses', 'anos', 'minutos',
    'hora', 'dia', 'semana', 'mes', 'ano', 'minuto',
  ]);

  // ── Lazy-init grammar tables ──
  let _tables = null;
  function getTables() {
    if (_tables) return _tables;
    const gt = host.__lexiGrammarTables || {};
    _tables = {
      HUMAN_NOUNS: gt.ES_HUMAN_NOUNS || new Set(),
      POR_PARA_TRIGGERS: gt.ES_POR_PARA_TRIGGERS || [],
    };
    return _tables;
  }

  function isInfinitive(word, vocab) {
    if (!word) return false;
    // Must end in -ar, -er, or -ir
    if (!/(?:ar|er|ir)$/.test(word)) return false;
    // Must be a known verb (in validWords from vocab data)
    if (vocab.validWords && vocab.validWords.has(word)) return true;
    // Also check if it's a value in verbInfinitive (the infinitive form itself)
    if (vocab.verbInfinitive) {
      for (const inf of vocab.verbInfinitive.values()) {
        if (inf === word) return true;
      }
    }
    return false;
  }

  // Phase 32-02: Source the per-patternType nb/nn strings from the synced
  // lexicon's pedagogy.subtypes map. The pedagogy block is keyed by the
  // *suggested* preposition (the rule's `fix`), and the subtype keys mirror
  // the rule's existing `patternType` discriminators. `{fix}` and `{wrong}`
  // tokens in the data are substituted at finding-emit time. Returns null
  // if the data isn't available — caller falls back to a generic line.
  function templateFromSubtype(pedagogy, patternType, fix, wrong) {
    if (!pedagogy || !pedagogy.subtypes) return null;
    const tmpl = pedagogy.subtypes[patternType];
    if (!tmpl) return null;
    const sub = (s) => String(s || '').replace(/\{fix\}/g, fix).replace(/\{wrong\}/g, wrong);
    const nb = sub(tmpl.nb);
    const nn = sub(tmpl.nn);
    if (!nb || !nn) return null;
    return { nb, nn };
  }

  function attachExplain(finding, prepPedagogy, rulePedagogy) {
    // The pedagogy block lives on the *target* preposition (the suggested
    // fix), since pedagogy explains the correct form. Pull from the lexicon
    // map by the lowercase fix word.
    const ped = (prepPedagogy && prepPedagogy.get(String(finding.fix || '').toLowerCase()))
              || (rulePedagogy && rulePedagogy.get('es-por-para'));
    if (!ped) return;
    finding.pedagogy = ped;
    const tmpl = templateFromSubtype(ped, finding.patternType, finding.fix, finding.original);
    if (tmpl) {
      finding.explainNb = tmpl.nb;
      finding.explainNn = tmpl.nn;
    }
  }

  const rule = {
    id: 'es-por-para',
    languages: ['es'],
    priority: 50,
    // exam-audit 33-03: stays safe=false — Lær mer pedagogy popover (por/para semantic categories) exceeds Chrome native parity
    exam: {
      safe: false,
      reason: "Stays safe=false (es-por-para) — Lær mer pedagogy popover (por/para semantic categories) exceeds Chrome native parity",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      // Phase 32-02: explain() reads pre-templated strings off the finding.
      // The strings themselves originate from por_prep.pedagogy.subtypes /
      // para_prep.pedagogy.subtypes (synced from papertek-vocabulary). When
      // pedagogy data is unavailable (synthetic ctx in check-explain-contract,
      // or a future student-typed pattern that fires before the lexicon
      // ships the matching subtype), fall back to the rule's `message`
      // string so the contract { nb: non-empty, nn: non-empty } holds.
      const wrong = finding.original || '';
      const fix = finding.fix || '';
      if (finding.explainNb && finding.explainNn) {
        return { nb: finding.explainNb, nn: finding.explainNn };
      }
      const fallback = (finding.message && String(finding.message))
        || ('Prøv ' + fix + ' i stedet for ' + wrong + '.');
      return { nb: fallback, nn: fallback };
    },
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const { tokens, vocab, cursorPos } = ctx;
      const { HUMAN_NOUNS } = getTables();
      const prepPedagogy = (vocab && vocab.prepPedagogy) || new Map();
      const rulePedagogy = (vocab && vocab.rulePedagogy) || new Map();
      const findings = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        const w = t.word;
        const next = tokens[i + 1];
        const next2 = tokens[i + 2];

        if (w === 'por') {
          // ── Skip safe phrases ──
          if (next && SAFE_POR_PHRASES.has(next.word)) continue;
          // "por lo menos", "por lo tanto"
          if (next && next.word === 'lo' && next2 && SAFE_POR_LO.has(next2.word)) continue;
          // "por la manana" — time expression
          if (next && (next.word === 'la' || next.word === 'el') &&
              next2 && (next2.word === 'manana' || next2.word === 'tarde' || next2.word === 'noche')) continue;
          // "por + determiner + non-human noun" (through/along) — skip
          if (next && (next.word === 'el' || next.word === 'la' || next.word === 'los' || next.word === 'las' || next.word === 'todo')) continue;
          // "por + pronoun object" (por ti, por mi as cause) — skip
          if (next && (next.word === 'ti' || next.word === 'mi' || next.word === 'el' || next.word === 'ella') && !next2) continue;
          // "por + number + time unit" = correct duration — skip
          if (next && (DURATION_NUMBERS.has(next.word) || /^\d+$/.test(next.word)) &&
              next2 && TIME_UNITS.has(next2.word)) continue;

          // ── Pattern: por + infinitive (purpose) -> para ──
          if (next && isInfinitive(next.word, vocab)) {
            const f = {
              rule_id: 'es-por-para',
              start: t.start,
              end: t.end,
              original: t.display,
              fix: 'para',
              patternType: 'purpose',
              message: t.display + ' + infinitivo -> para',
              severity: 'warning',
            };
            attachExplain(f, prepPedagogy, rulePedagogy);
            findings.push(f);
            continue;
          }

          // ── Pattern: por + possessive + human noun (beneficiary) -> para ──
          if (next && POSSESSIVES.has(next.word) && next2 && (HUMAN_NOUNS.has(next2.word) || FAMILY_COLLECTIVE.has(next2.word))) {
            const f = {
              rule_id: 'es-por-para',
              start: t.start,
              end: t.end,
              original: t.display,
              fix: 'para',
              patternType: 'beneficiary',
              message: t.display + ' + ' + next.display + ' ' + next2.display + ' -> para',
              severity: 'warning',
            };
            attachExplain(f, prepPedagogy, rulePedagogy);
            findings.push(f);
            continue;
          }

          // ── Pattern: por + possessive + goal noun -> para ──
          if (next && POSSESSIVES.has(next.word) && next2 && GOAL_NOUNS.has(next2.word)) {
            const f = {
              rule_id: 'es-por-para',
              start: t.start,
              end: t.end,
              original: t.display,
              fix: 'para',
              patternType: 'purpose',
              message: t.display + ' + ' + next.display + ' ' + next2.display + ' -> para',
              severity: 'warning',
            };
            attachExplain(f, prepPedagogy, rulePedagogy);
            findings.push(f);
            continue;
          }

          // ── Pattern: por + deadline marker -> para ──
          if (next && (DEADLINE_DAYS.has(next.word) || DEADLINE_MONTHS.has(next.word) || DEADLINE_RELATIVE.has(next.word))) {
            const f = {
              rule_id: 'es-por-para',
              start: t.start,
              end: t.end,
              original: t.display,
              fix: 'para',
              patternType: 'deadline',
              message: t.display + ' + ' + next.display + ' -> para',
              severity: 'warning',
            };
            attachExplain(f, prepPedagogy, rulePedagogy);
            findings.push(f);
            continue;
          }
        }

        if (w === 'para') {
          // ── Pattern: para + number + time unit (duration) -> por ──
          if (next && (DURATION_NUMBERS.has(next.word) || /^\d+$/.test(next.word)) &&
              next2 && TIME_UNITS.has(next2.word)) {
            const f = {
              rule_id: 'es-por-para',
              start: t.start,
              end: t.end,
              original: t.display,
              fix: 'por',
              patternType: 'duration',
              message: t.display + ' + duracion -> por',
              severity: 'warning',
            };
            attachExplain(f, prepPedagogy, rulePedagogy);
            findings.push(f);
            continue;
          }
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
