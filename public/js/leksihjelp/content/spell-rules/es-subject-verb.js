/**
 * Spell-check rule: Spanish subject–verb agreement (priority 14).
 *
 * Synthetic-corpus probes scored 0/2 before this rule: "Nosotros tiene una
 * cabaña" (→ tenemos), "Las flores era bonitas" (→ eran). Norwegian has no
 * verb-person inflection at all, so person agreement is one of the hardest
 * habits for Norwegian students.
 *
 * Wave-1 scope is deliberately CLOSED-PARADIGM only: the eight highest-
 * frequency irregular verbs (ser, estar, tener, ir, haber, hacer, poder,
 * querer) in presens + the ser/estar imperfecto rows. Closed paradigms
 * have no homograph ambiguity, so precision is structural. Regular -ar/
 * -er/-ir derivation is a future wave.
 *
 * Subjects: personal pronouns, plus det+noun number agreement for the
 * copulas (las flores ERA → eran; mi hermano SON → es).
 *
 * Rule ID: 'es-subject-verb'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const applyCase = typeof matchCase === 'function' ? matchCase : (o, s) => s;

  // Person classes: 1s yo, 2s tú, 3s él/ella/usted, 1p nosotros, 2p vosotros, 3p ellos/ellas/ustedes
  const SUBJECT_CLASS = {
    yo: '1s', 'tú': '2s', 'él': '3s', ella: '3s', usted: '3s',
    nosotros: '1p', nosotras: '1p', vosotros: '2p', vosotras: '2p',
    ellos: '3p', ellas: '3p', ustedes: '3p',
  };

  // Closed paradigms — presens of the high-frequency irregulars + the
  // copula imperfecto rows (era/estaba class drives "Las flores era").
  const PARADIGMS = {
    ser: { '1s': 'soy', '2s': 'eres', '3s': 'es', '1p': 'somos', '2p': 'sois', '3p': 'son' },
    ser_impf: { '1s': 'era', '2s': 'eras', '3s': 'era', '1p': 'éramos', '2p': 'erais', '3p': 'eran' },
    estar: { '1s': 'estoy', '2s': 'estás', '3s': 'está', '1p': 'estamos', '2p': 'estáis', '3p': 'están' },
    estar_impf: { '1s': 'estaba', '2s': 'estabas', '3s': 'estaba', '1p': 'estábamos', '2p': 'estabais', '3p': 'estaban' },
    tener: { '1s': 'tengo', '2s': 'tienes', '3s': 'tiene', '1p': 'tenemos', '2p': 'tenéis', '3p': 'tienen' },
    ir: { '1s': 'voy', '2s': 'vas', '3s': 'va', '1p': 'vamos', '2p': 'vais', '3p': 'van' },
    haber: { '1s': 'he', '2s': 'has', '3s': 'ha', '1p': 'hemos', '2p': 'habéis', '3p': 'han' },
    hacer: { '1s': 'hago', '2s': 'haces', '3s': 'hace', '1p': 'hacemos', '2p': 'hacéis', '3p': 'hacen' },
    poder: { '1s': 'puedo', '2s': 'puedes', '3s': 'puede', '1p': 'podemos', '2p': 'podéis', '3p': 'pueden' },
    querer: { '1s': 'quiero', '2s': 'quieres', '3s': 'quiere', '1p': 'queremos', '2p': 'queréis', '3p': 'quieren' },
  };

  // form → { lemma, person }. Ambiguous forms (era 1s+3s, estaba 1s+3s)
  // map their PERSON SET — agreement only fires when the subject's class
  // is outside the set.
  const FORM_INDEX = new Map();
  for (const [lemma, forms] of Object.entries(PARADIGMS)) {
    for (const [cls, form] of Object.entries(forms)) {
      if (!FORM_INDEX.has(form)) FORM_INDEX.set(form, { lemma, classes: new Set() });
      FORM_INDEX.get(form).classes.add(cls);
    }
  }

  // Determiner number for noun-phrase subjects (copula path).
  const DET_SG = new Set(['el', 'la', 'mi', 'tu', 'su', 'este', 'esta', 'ese', 'esa', 'un', 'una']);
  const DET_PL = new Set(['los', 'las', 'mis', 'tus', 'sus', 'estos', 'estas', 'esos', 'esas', 'unos', 'unas']);

  // Prepositions: a determiner right after one heads a prepositional MODIFIER,
  // never the subject — "La contaminación del aire en LAS CIUDADES es…" agrees
  // with contaminación (sing), not ciudades. (del/al are the contractions.)
  const PREPOSITIONS = new Set([
    'de', 'del', 'en', 'con', 'a', 'al', 'por', 'para', 'sin', 'sobre',
    'entre', 'hacia', 'hasta', 'desde', 'ante', 'bajo', 'contra', 'según', 'tras',
  ]);
  // Object/reflexive clitics — after a subject pronoun these are NOT the verb
  // ("Ella se quedó" — se is reflexive, the verb is "quedó"). Prevents the
  // accent-stripped form index reading "se" as "sé"→saber, "la"→ verb, etc.
  const CLITIC_PRONOUNS = new Set(['me', 'te', 'se', 'nos', 'os', 'lo', 'la', 'los', 'las', 'le', 'les']);
  // Demonstratives + time nouns: a fronted "demonstrative + time noun" is a
  // temporal adverbial, not the subject ("Esta noche van a congelar…" — the
  // subject is postposed). Article+time-noun ("los días son largos") is a real
  // subject and must still flag, so this is restricted to demonstratives.
  const DEMONSTRATIVES = new Set(['este', 'esta', 'estos', 'estas', 'ese', 'esa', 'esos', 'esas', 'aquel', 'aquella', 'aquellos', 'aquellas']);
  const TIME_NOUNS = new Set([
    'noche', 'noches', 'mañana', 'tarde', 'tardes', 'día', 'días', 'semana', 'semanas',
    'mes', 'meses', 'año', 'años', 'hora', 'horas', 'momento', 'vez', 'veces',
    'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo',
  ]);

  // ── Regular-verb agreement (data-driven from vocab.esPresensToVerb) ──
  // The closed PARADIGMS above cover 8 irregulars; this extends the pronoun
  // path to EVERY verb in the bank. esPresensToVerb maps a present form →
  // { inf, person }, where `person` is the bank's conjugations.presens.former
  // key. Map those labels to the rule's person classes; non-person keys
  // (infinitiv/presens/…, occasional bank noise) map to nothing and are skipped.
  const PERSON_LABEL_TO_CLASS = {
    'yo': '1s', 'tú': '2s', 'tu': '2s',
    'él/ella': '3s', 'él/ella/usted': '3s', 'él': '3s', 'ella': '3s', 'usted': '3s',
    'nosotros': '1p', 'nosotras': '1p', 'nosotros/nosotras': '1p',
    'vosotros': '2p', 'vosotras': '2p', 'vosotros/vosotras': '2p',
    'ellos/ellas': '3p', 'ellos/ellas/ustedes': '3p', 'ellos': '3p', 'ellas': '3p', 'ustedes': '3p',
  };
  function stripAccentsEs(s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, ''); }
  // Lazy reverse index: inf → { class → correct present form }. Built once from
  // esPresensToVerb and cached on the vocab object. Prefers the accented
  // surface form when both accented + stripped variants map to one slot, so the
  // suggested fix carries the right accents (estudiáis, not estudiais).
  function regReverse(vocab) {
    if (vocab.__esRegReverse) return vocab.__esRegReverse;
    const rev = new Map();
    const m = vocab.esPresensToVerb;
    if (m && typeof m.forEach === 'function') {
      m.forEach((info, form) => {
        const cls = PERSON_LABEL_TO_CLASS[info.person];
        if (!cls) return;
        let slot = rev.get(info.inf);
        if (!slot) { slot = {}; rev.set(info.inf, slot); }
        const cur = slot[cls];
        const accented = form !== stripAccentsEs(form);
        if (!cur || (accented && cur === stripAccentsEs(cur))) slot[cls] = form;
      });
    }
    vocab.__esRegReverse = rev;
    return rev;
  }

  // Regular presens endings per conjugation class — shared by the three
  // locale variants of pedagogy.extra below (table is locale-independent).
  const ENDINGS_TABLE =
    '<table class="lh-pedagogy-table">' +
    '<tr><th></th><th>-ar</th><th>-er</th><th>-ir</th></tr>' +
    '<tr><th>yo</th><td>-o</td><td>-o</td><td>-o</td></tr>' +
    '<tr><th>tú</th><td>-as</td><td>-es</td><td>-es</td></tr>' +
    '<tr><th>él/ella</th><td>-a</td><td>-e</td><td>-e</td></tr>' +
    '<tr><th>nosotros</th><td>-amos</td><td>-emos</td><td>-imos</td></tr>' +
    '<tr><th>vosotros</th><td>-áis</td><td>-éis</td><td>-ís</td></tr>' +
    '<tr><th>ellos/ellas</th><td>-an</td><td>-en</td><td>-en</td></tr>' +
    '</table>';

  const rule = {
    id: 'es-subject-verb',
    languages: ['es'],
    priority: 14,
    exam: {
      safe: false,
      reason: 'Subject–verb agreement is a syntactic check, not a single-token spelling lookup (mirrors de-subject-verb)',
      category: 'grammar-lookup',
    },
    severity: 'error',
    pedagogy: {
      note: {
        nb: 'Spanske verb bøyes etter <strong>person</strong> — hver person har sin egen form. Norsk har bare én form («vi har, han har»), så dette må trenes: <em>tengo, tienes, tiene, tenemos, tenéis, tienen</em>.',
        nn: 'Spanske verb vert bøygde etter <strong>person</strong> — kvar person har si eiga form. Norsk har berre éi form («vi har, han har»), så dette må trenast: <em>tengo, tienes, tiene, tenemos, tenéis, tienen</em>.',
        en: 'Spanish verbs inflect for <strong>person</strong> — each person has its own form. Norwegian has just one («vi har, han har»), so this needs practice: <em>tengo, tienes, tiene, tenemos, tenéis, tienen</em>.',
      },
      examples: [
        {
          correct: 'Nosotros tenemos una cabaña.',
          incorrect: 'Nosotros tiene una cabaña.',
          translation: { nb: 'Vi har en hytte.', nn: 'Vi har ei hytte.', en: 'We have a cabin.' },
        },
        {
          correct: 'Las flores eran bonitas.',
          incorrect: 'Las flores era bonitas.',
          translation: { nb: 'Blomstene var fine.', nn: 'Blomane var fine.', en: 'The flowers were pretty.' },
        },
      ],
      // Full presens endings table (v3.0.134) — same treatment as the
      // de-subject-verb grammarbank note. All six persons, per
      // conjugation class (-ar/-er/-ir), the canonical school-book
      // presentation. Pronoun/label cells are <th> (styled by
      // .lh-pedagogy-table th in content.css); sanitizeWarning table
      // whitelist shipped in v3.0.132.
      extra: {
        nb: `I presens får regelrette verb disse endelsene: ${ENDINGS_TABLE}`,
        nn: `I presens får regelrette verb desse endingane: ${ENDINGS_TABLE}`,
        en: `In the present tense, regular verbs take these endings: ${ENDINGS_TABLE}`,
      },
    },
    explain: (finding) => ({
      nb: `«${esc(finding.original)}» passer ikke til subjektet «${esc(finding.subject)}» — bruk <em>${esc(finding.fix)}</em>.`,
      nn: `«${esc(finding.original)}» passar ikkje til subjektet «${esc(finding.subject)}» — bruk <em>${esc(finding.fix)}</em>.`,
      en: `«${esc(finding.original)}» does not agree with the subject «${esc(finding.subject)}» — use <em>${esc(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { text, tokens, vocab, cursorPos, lang } = ctx;
      if (lang !== 'es') return [];
      const nounGenus = vocab.nounGenus || new Map();
      const esPresensToVerb = vocab.esPresensToVerb || new Map();
      const out = [];

      const emit = (verbTok, subjDisplay, expected) => {
        if (cursorPos != null && cursorPos >= verbTok.start && cursorPos <= verbTok.end + 1) return;
        const fix = applyCase(verbTok.display, expected);
        out.push({
          rule_id: 'es-subject-verb',
          priority: rule.priority,
          start: verbTok.start,
          end: verbTok.end,
          original: verbTok.display,
          fix,
          subject: subjDisplay,
          message: `«${verbTok.display}» passer ikke til «${subjDisplay}» — bruk «${fix}»`,
          severity: 'error',
        });
      };

      for (let i = 0; i < tokens.length - 1; i++) {
        const a = tokens[i];
        const b = tokens[i + 1];
        // Sentence/clause boundary OR quote marks between the two tokens: a
        // quoted («Ellos» es…) or metalinguistic mention is not the subject.
        if (text && /[.!?,;:«»“”"]/.test(text.slice(a.end, b.start))) continue;

        // Pronoun + closed-paradigm verb: "Nosotros tiene" → tenemos.
        // Coordinated subjects ("Mi madre y yo vamos") make the person
        // plural — the conjunction before the pronoun disables the check.
        const cls = SUBJECT_CLASS[a.word];
        if (cls && i > 0 && ['y', 'e', 'o', 'ni'].includes(tokens[i - 1].word)) continue;
        if (cls) {
          // The token after the pronoun is a clitic ("Ella se quedó") or a
          // determiner/demonstrative ("tú esta vez" — esta = "this", not
          // "está"): the verb comes later, so this token isn't it.
          if (CLITIC_PRONOUNS.has(b.word) || DET_SG.has(b.word) || DET_PL.has(b.word)) continue;
          const info = FORM_INDEX.get(b.word);
          if (info) {
            // Closed paradigm (8 high-frequency irregulars) — hand-verified.
            if (!info.classes.has(cls)) {
              const expected = PARADIGMS[info.lemma][cls];
              if (expected && expected !== b.word) emit(b, a.display, expected);
            }
            continue;
          }
          // Regular-verb fallback: any other bank verb, data-driven from
          // esPresensToVerb. Flag only a clear person MISMATCH and only when a
          // gender/person-correct form exists to suggest. A subject pronoun
          // directly before the verb makes a noun-homograph (trabajo/cena)
          // read as the verb, so "él trabajo" → trabaja is sound (never valid).
          const reg = esPresensToVerb.get(b.word);
          if (reg) {
            // Skip gustar-class verbs (gustar/encantar/interesar/doler/…): their
            // syntax is inverted — the pre-verb pronoun is a dative experiencer,
            // not the subject ("A ellos les gusta" — gusta agrees with the thing
            // liked). The es-gustar rule owns that construction.
            const gustarVerbs = vocab.gustarClassVerbs;
            if (gustarVerbs && gustarVerbs.has && gustarVerbs.has(reg.inf)) { continue; }
            const formCls = PERSON_LABEL_TO_CLASS[reg.person];
            if (formCls && formCls !== cls) {
              const slot = regReverse(vocab).get(reg.inf);
              const expected = slot && slot[cls];
              if (expected && expected !== b.word) emit(b, a.display, expected);
            }
          }
          continue;
        }

        // Det + noun number + copula/haber/tener: "Las flores era" → eran.
        // Closed to 3s↔3p on the high-frequency verbs; the determiner fixes
        // the number, so no noun-morphology guessing is needed.
        const detPl = DET_PL.has(a.word);
        const detSg = DET_SG.has(a.word);
        // PP-modifier guard: a determiner preceded by a preposition is inside a
        // prepositional phrase, not the subject ("…del aire en LAS CIUDADES es",
        // "…con LOS CLIENTES es") — the verb agrees with the NP head upstream.
        if ((detPl || detSg) && i > 0 && PREPOSITIONS.has(tokens[i - 1].word)) continue;
        // Fronted temporal adverbial ("Esta noche van a congelar…"): a
        // demonstrative + time noun is not the (postposed) subject.
        if (detSg && DEMONSTRATIVES.has(a.word) && TIME_NOUNS.has(b.word)) continue;
        // Relative-clause VS subject: "Las figuras que hace SU ABUELA son…" —
        // "su abuela" is the subject of the relative verb "hace"; the main verb
        // "son" agrees with the antecedent (figuras). Pattern: que + verb + det.
        if ((detPl || detSg) && i > 1 && tokens[i - 2].word === 'que'
            && (FORM_INDEX.has(tokens[i - 1].word) || esPresensToVerb.has(tokens[i - 1].word))) continue;
        // Coordinated subject ("La pera y la naranja están" / "Mi padre y mi
        // madre tienen") makes the verb plural, so a SINGULAR-determiner conjunct
        // preceded by a coordinating conjunction must not be downgraded to a 3s
        // suggestion. Mirrors the pronoun-path guard above. Restricted to detSg:
        // a plural determiner already agrees with a plural verb (no FP), and a
        // genuine "y las naranjas está → están" error should still flag.
        if (detSg && i > 0 && ['y', 'e', 'o', 'ni'].includes(tokens[i - 1].word)) continue;
        if ((detPl || detSg) && nounGenus.has(b.word) && i + 2 < tokens.length) {
          const verbTok = tokens[i + 2];
          if (text && /[.!?,;:]/.test(text.slice(b.end, verbTok.start))) continue;
          const info = FORM_INDEX.get(verbTok.word);
          if (!info) continue;
          const want = detPl ? '3p' : '3s';
          if (!info.classes.has(want)) {
            // only flag the 3s↔3p axis — a 1p/2p reading is never the
            // det+noun subject's verb
            const otherAxis = detPl ? '3s' : '3p';
            if (info.classes.has(otherAxis)) {
              const expected = PARADIGMS[info.lemma][want];
              if (expected && expected !== verbTok.word) emit(verbTok, `${a.display} ${b.display}`, expected);
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
