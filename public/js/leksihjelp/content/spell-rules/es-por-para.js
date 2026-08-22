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

  // ── Cause-governing verbs/adjectives ──
  // "por + infinitive" is CAUSE ("for/because of doing"), NOT purpose, when it
  // is governed by a verb of reaction / reward / punishment / emotion:
  //   "lo regañó por llegar tarde", "le llamó la atención por hablar",
  //   "lo felicitaron por aprobar", "famoso por ganar".
  // That por is correct, so the purpose→para flag must be suppressed. The
  // purpose reading (the real student error) follows motion/action verbs
  // ("voy/vengo/trabajo/leo … por estudiar" → para estudiar), which are NOT here.
  const CAUSE_GOVERNORS = new Set([
    // punishment / reprimand / accusation
    'regañar', 'reñir', 'castigar', 'criticar', 'reprender', 'sancionar',
    'multar', 'culpar', 'acusar', 'reprochar', 'condenar', 'denunciar', 'demandar',
    // reward / praise / thanks
    'felicitar', 'premiar', 'agradecer', 'recompensar', 'elogiar', 'alabar',
    // emotion / reaction
    'preocupar', 'preocuparse', 'enfadar', 'enfadarse', 'enojar', 'enojarse',
    'irritar', 'irritarse', 'molestar', 'molestarse', 'alegrar', 'alegrarse',
    'disculpar', 'disculparse', 'quejarse', 'llorar', 'sufrir', 'pelear',
    'protestar', 'preocuparse', 'emocionar', 'emocionarse', 'ilusionar', 'ilusionarse',
    // result / consequence ("perdí el tren por llegar tarde", "lo consideran héroe por…")
    'perder', 'considerar',
    // idioms / fixed cause governors
    'llamar', 'optar', 'votar', 'brindar', 'pagar', 'esforzarse',
  ]);
  // Adjectives that take "por + inf" as cause ("famoso por ganar", "emocionado
  // por empezar", "impacientes por abrir").
  const CAUSE_ADJECTIVES = new Set([
    'famoso', 'famosa', 'conocido', 'conocida', 'responsable', 'castigado', 'castigada',
    'premiado', 'premiada', 'considerado', 'considerada',
    'emocionado', 'emocionada', 'emocionados', 'emocionadas',
    'impaciente', 'impacientes', 'ansioso', 'ansiosa', 'ansiosos', 'ansiosas',
    'contento', 'contenta', 'contentos', 'contentas', 'feliz', 'felices',
    'nervioso', 'nerviosa', 'preocupado', 'preocupada', 'orgulloso', 'orgullosa',
    'agradecido', 'agradecida', 'ilusionado', 'ilusionada', 'deseoso', 'deseosa',
    'loco', 'loca', 'loable', 'loables',
  ]);
  // Nouns that take "por + inf" as cause ("hizo un esfuerzo por…", "le pusieron
  // una multa por…", "una disculpa por…", "gracias … por venir").
  const CAUSE_NOUNS = new Set([
    'esfuerzo', 'esfuerzos', 'disculpa', 'disculpas', 'multa', 'multas',
    'héroe', 'heroe', 'perdón', 'perdon', 'razón', 'razon', 'motivo', 'motivos',
    'castigo', 'premio', 'gracias', 'felicidades', 'enhorabuena',
  ]);
  // Distinctive emotion/reaction verb STEMS — matched by prefix so every
  // conjugation is covered even when the pronominal verb isn't in the bundled
  // verb map ("me preocupo", "se preocupa", "se irrita por …"). Only stems long
  // and unambiguous enough to never prefix a non-target word are listed.
  const CAUSE_STEMS = [
    'preocup', 'irrit', 'enfad', 'enoj', 'molest', 'alegr', 'regan', 'regañ',
    'felicit', 'protest', 'disculp', 'quej', 'reproch', 'castig', 'agradec',
  ];

  // Infinitives that, right after "por", read as cause — restricted to the
  // unambiguous ones: "haber" (perfect infinitive: "por haber llegado tarde" is
  // always cause) and "ser" ("por ser festivo/menor/extranjero"). NOT estar
  // ("por estar en forma" = purpose → para, fixtures es-pp-12/31) and NOT tener
  // (its cause cases are governor-covered: "protestaron por tener…").
  const CAUSE_INFINITIVES = new Set(['ser', 'haber']);
  // Stop the backward scan at clause boundaries so a governor in a previous
  // clause doesn't suppress a fresh por+inf.
  const CLAUSE_BREAKS = new Set([',', ';', ':', 'y', 'pero', 'porque', 'aunque', 'mientras']);

  function strip(w) {
    return String(w || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Look back up to 5 tokens (within the clause) for a cause-governing verb or
  // adjective. Conjugated verbs are resolved to their infinitive via the ES
  // form→verb maps the seam already builds (esPresensToVerb / esPreteritumToVerb).
  function governedByCause(tokens, porIdx, vocab) {
    const pres = vocab && vocab.esPresensToVerb;
    const pret = vocab && vocab.esPreteritumToVerb;
    const lo = Math.max(0, porIdx - 5);
    for (let j = porIdx - 1; j >= lo; j--) {
      const tw = tokens[j].word;
      if (CLAUSE_BREAKS.has(tw)) break;
      if (CAUSE_ADJECTIVES.has(tw) || CAUSE_ADJECTIVES.has(strip(tw))) return true;
      if (CAUSE_NOUNS.has(tw) || CAUSE_NOUNS.has(strip(tw))) return true;
      let info = null;
      if (pres) info = pres.get(tw) || pres.get(strip(tw));
      if (!info && pret) info = pret.get(tw) || pret.get(strip(tw));
      if (info && CAUSE_GOVERNORS.has(info.inf)) return true;
      // bare infinitive governor ("para criticar por …" is rare, but cheap)
      if (CAUSE_GOVERNORS.has(tw)) return true;
      // stem fallback for pronominal emotion verbs absent from the verb map
      const s = strip(tw);
      for (let k = 0; k < CAUSE_STEMS.length; k++) {
        if (s.startsWith(CAUSE_STEMS[k])) return true;
      }
    }
    return false;
  }

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

  // Cache the set of known infinitive forms (verbInfinitive values) so the
  // per-token check is O(1). Rebuilds if the underlying map reference changes.
  let _infSet = null, _infSrc = null;
  function infinitiveSet(vocab) {
    const src = vocab && vocab.verbInfinitive;
    if (!src || typeof src.values !== 'function') return null;
    if (_infSrc === src && _infSet) return _infSet;
    _infSet = new Set(src.values());
    _infSrc = src;
    return _infSet;
  }
  function isInfinitive(word, vocab) {
    if (!word) return false;
    // Must end in -ar, -er, or -ir
    if (!/(?:ar|er|ir)$/.test(word)) return false;
    // Must be a KNOWN VERB infinitive — not merely any valid -ar/-er/-ir word.
    // (cualquier, tercer, mujer, mejor, ayer all end in -er but aren't verbs;
    // the old validWords short-circuit mis-flagged "por cualquier", "por tercer
    // año".) verbInfinitive's values are exactly the infinitive forms.
    const set = infinitiveSet(vocab);
    return !!set && set.has(word);
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
        const prev = tokens[i - 1];
        const next = tokens[i + 1];
        const next2 = tokens[i + 2];

        if (w === 'por') {
          // "gracias por …" is ALWAYS correct (thanks FOR — cause/reason),
          // including "gracias por venir/ayudar/invitar" (infinitive). Without
          // this skip the por+infinitive purpose pattern below mis-fired
          // gracias por venir → para.
          if (prev && prev.word === 'gracias') continue;
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
            // Copula/auxiliary infinitive after por is cause, not purpose
            // ("por ser festivo", "por haber llegado tarde", "por tener osos").
            if (CAUSE_INFINITIVES.has(next.word) || CAUSE_INFINITIVES.has(strip(next.word))) continue;
            // Skip the CAUSE reading ("regañó/felicitó … por hacer algo"):
            // there por is correct, only purpose ("voy por estudiar") is wrong.
            if (governedByCause(tokens, i, vocab)) continue;
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
          // v3.0.130: HUMAN_NOUNS is keyed singular; resolve regular plurals
          // (amigos→amigo, profesores→profesor) so "recuerdos por mis
          // amigos" → para flags (synthetic probe es/syn-04).
          const isHuman = (w) => HUMAN_NOUNS.has(w)
            || (w.endsWith('es') && HUMAN_NOUNS.has(w.slice(0, -2)))
            || (w.endsWith('s') && HUMAN_NOUNS.has(w.slice(0, -1)));
          if (next && POSSESSIVES.has(next.word) && next2 && (isHuman(next2.word) || FAMILY_COLLECTIVE.has(next2.word))) {
            // "se preocupa por sus hijos", "conocido por su madre" — cause, not
            // beneficiary. The governor verb/adjective makes por correct.
            if (governedByCause(tokens, i, vocab)) continue;
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
            // "me preocupo por mi salud", "conocido por su trabajo" — cause.
            if (governedByCause(tokens, i, vocab)) continue;
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
          // ── Pattern: gracias para … -> gracias por (cause/reason) ──
          // Norwegian "takk for" calques to the wrong "gracias para"; thanks
          // takes por. Mirror of the gracias-por skip above.
          if (prev && prev.word === 'gracias') {
            const f = {
              rule_id: 'es-por-para',
              start: t.start,
              end: t.end,
              original: t.display,
              fix: 'por',
              patternType: 'gratitude',
              message: 'gracias ' + t.display + ' -> gracias por',
              severity: 'warning',
            };
            attachExplain(f, prepPedagogy, rulePedagogy);
            findings.push(f);
            continue;
          }
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
