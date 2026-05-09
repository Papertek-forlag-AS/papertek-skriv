/**
 * Shared grammar tables for DE case/agreement (Phase 8),
 * ES ser/estar, por/para, personal-a rules (Phase 9),
 * FR avoir/etre auxiliary selection (Phase 10),
 * and Phase 13 document-drift helpers (detectDrift, BOKMAL_RIKSMAL_MAP).
 *
 * Prefers synced grammarbank data from papertek-vocabulary (via vocab-seam).
 * Falls back to inline constants when the grammarbank is not yet synced.
 *
 * Exports onto self.__lexiGrammarTables as an IIFE so all rule files
 * loaded after this script can read the tables without duplication.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;

  // Try reading synced grammar tables from vocab-seam
  const vocab = host.__lexiVocab || {};
  const synced = (typeof vocab.getGrammarTables === 'function') ? vocab.getGrammarTables() : {};
  const has = (key) => synced[key] && (Array.isArray(synced[key]) ? synced[key].length > 0 : Object.keys(synced[key]).length > 0);

  // ── Preposition → required case ──
  const PREP_CASE = has('prep_case') ? synced.prep_case : {
    // Accusative prepositions
    durch: 'acc',
    für: 'acc',
    gegen: 'acc',
    ohne: 'acc',
    um: 'acc',
    // Dative prepositions
    aus: 'dat',
    bei: 'dat',
    mit: 'dat',
    nach: 'dat',
    seit: 'dat',
    von: 'dat',
    zu: 'dat',
    // Two-way prepositions (accusative or dative depending on motion/location)
    an: 'acc/dat',
    auf: 'acc/dat',
    hinter: 'acc/dat',
    in: 'acc/dat',
    neben: 'acc/dat',
    über: 'acc/dat',
    unter: 'acc/dat',
    vor: 'acc/dat',
    zwischen: 'acc/dat',
    // Genitive prepositions
    wegen: 'gen',
    statt: 'gen',
    trotz: 'gen',
    während: 'gen',
  };

  const DEF_ARTICLE_CASE = has('def_article_case') ? synced.def_article_case : {
    der: [
      { genus: 'm', case: 'nominativ' },
      { genus: 'f', case: 'dativ' },
      { genus: 'f', case: 'genitiv' },
    ],
    die: [
      { genus: 'f', case: 'nominativ' },
      { genus: 'f', case: 'akkusativ' },
      { genus: 'pl', case: 'nominativ' },
      { genus: 'pl', case: 'akkusativ' },
    ],
    das: [
      { genus: 'n', case: 'nominativ' },
      { genus: 'n', case: 'akkusativ' },
    ],
    den: [
      { genus: 'm', case: 'akkusativ' },
      { genus: 'pl', case: 'dativ' },
    ],
    dem: [
      { genus: 'm', case: 'dativ' },
      { genus: 'n', case: 'dativ' },
    ],
    des: [
      { genus: 'm', case: 'genitiv' },
      { genus: 'n', case: 'genitiv' },
    ],
  };

  const INDEF_ARTICLE_CASE = has('indef_article_case') ? synced.indef_article_case : {
    ein: [
      { genus: 'm', case: 'nominativ' },
      { genus: 'n', case: 'nominativ' },
      { genus: 'n', case: 'akkusativ' },
    ],
    eine: [
      { genus: 'f', case: 'nominativ' },
      { genus: 'f', case: 'akkusativ' },
    ],
    einen: [
      { genus: 'm', case: 'akkusativ' },
    ],
    einem: [
      { genus: 'm', case: 'dativ' },
      { genus: 'n', case: 'dativ' },
    ],
    einer: [
      { genus: 'f', case: 'dativ' },
      { genus: 'f', case: 'genitiv' },
    ],
    eines: [
      { genus: 'm', case: 'genitiv' },
      { genus: 'n', case: 'genitiv' },
    ],
  };

  const SEPARABLE_PREFIXES = has('separable_prefixes') ? new Set(synced.separable_prefixes) : new Set([
    'ab', 'an', 'auf', 'aus', 'bei', 'ein', 'fest', 'her', 'hin',
    'los', 'mit', 'nach', 'um', 'vor', 'weg', 'zu', 'zurück',
    'zusammen', 'weiter', 'vorbei', 'herum', 'heraus', 'hinaus',
  ]);

  const SEIN_VERBS = has('sein_verbs') ? new Set(synced.sein_verbs) : new Set([
    'gehen', 'kommen', 'fahren', 'fliegen', 'laufen', 'fallen',
    'sterben', 'werden', 'sein', 'bleiben', 'passieren', 'geschehen',
    'wachsen', 'entstehen', 'verschwinden', 'reisen', 'wandern',
    'erscheinen', 'gelingen', 'begegnen', 'ankommen', 'abfahren',
    'aufstehen', 'einschlafen', 'aufwachen', 'umziehen', 'zurückkehren',
    'eintreten', 'auswandern', 'stattfinden', 'rennen', 'springen',
    'steigen', 'sinken', 'schwimmen', 'treten', 'ziehen', 'schmelzen',
    'gleiten', 'kriechen', 'rutschen', 'stolpern',
  ]);

  const BOTH_AUX_VERBS = has('both_aux_verbs') ? new Set(synced.both_aux_verbs) : new Set([
    'fahren', 'fliegen', 'laufen', 'schwimmen', 'ausziehen', 'wegfahren',
  ]);

  // ═══════════════════════════════════════════════════════════
  // ── ES: Ser/Estar conjugated forms ──
  // ═══════════════════════════════════════════════════════════

  const ES_SER_FORMS = has('ser_forms') ? new Set(synced.ser_forms) : new Set([
    'soy', 'eres', 'es', 'somos', 'sois', 'son',
    'era', 'eras', 'éramos', 'eramos', 'erais', 'eran',
    'fui', 'fuiste', 'fue', 'fuimos', 'fuisteis', 'fueron',
    'sido',
  ]);

  const ES_ESTAR_FORMS = has('estar_forms') ? new Set(synced.estar_forms) : new Set([
    'estoy', 'estás', 'estas', 'está', 'esta', 'estamos',
    'estáis', 'estais', 'están', 'estan',
    'estaba', 'estabas', 'estábamos', 'estabamos', 'estabais', 'estaban',
    'estuve', 'estuviste', 'estuvo', 'estuvimos', 'estuvisteis', 'estuvieron',
    'estado',
  ]);

  const ES_COPULA_ADJ = has('copula_adj') ? synced.copula_adj : {
    // estar-only (temporary states, conditions, results)
    cansado: 'estar', enfermo: 'estar', contento: 'estar', muerto: 'estar',
    sentado: 'estar', dormido: 'estar', despierto: 'estar', preocupado: 'estar',
    enamorado: 'estar', embarazada: 'estar', harto: 'estar', enojado: 'estar',
    asustado: 'estar', sorprendido: 'estar', ocupado: 'estar', roto: 'estar',
    abierto: 'estar', cerrado: 'estar', encendido: 'estar', apagado: 'estar',
    mojado: 'estar', seco: 'estar', lleno: 'estar', vacio: 'estar',
    limpio: 'estar', sucio: 'estar',
    // ser-only (inherent qualities)
    alto: 'ser', bajo: 'ser', grande: 'ser', pequeno: 'ser',
    inteligente: 'ser', tonto: 'ser', rico: 'ser', pobre: 'ser',
    joven: 'ser', viejo: 'ser', guapo: 'ser', feo: 'ser',
    delgado: 'ser', gordo: 'ser', fuerte: 'ser', debil: 'ser',
    importante: 'ser', necesario: 'ser', posible: 'ser', imposible: 'ser',
    dificil: 'ser', facil: 'ser', obvio: 'ser', claro: 'ser',
    cierto: 'ser', falso: 'ser', justo: 'ser', injusto: 'ser',
    // both (meaning changes with copula)
    aburrido: 'both', listo: 'both', malo: 'both', bueno: 'both',
    verde: 'both', vivo: 'both', seguro: 'both', atento: 'both',
    orgulloso: 'both',
  };

  const ES_POR_PARA_TRIGGERS = has('por_para_triggers') ? synced.por_para_triggers : [
    { id: 'por_beneficiary', wrongPrep: 'por', correctPrep: 'para',
      context: 'beneficiary', detect: 'por + human noun/pronoun (beneficiary: "por mi familia" → "para mi familia")' },
    { id: 'por_purpose_inf', wrongPrep: 'por', correctPrep: 'para',
      context: 'purpose', detect: 'por + infinitive verb (purpose: "por leer" → "para leer")' },
    { id: 'para_duration', wrongPrep: 'para', correctPrep: 'por',
      context: 'duration', detect: 'para + duration expression (duration: "para dos horas" → "por dos horas")' },
    { id: 'para_cause', wrongPrep: 'para', correctPrep: 'por',
      context: 'cause', detect: 'para + cause marker (cause: "para eso llegué tarde" → "por eso llegué tarde")' },
    { id: 'por_deadline', wrongPrep: 'por', correctPrep: 'para',
      context: 'deadline', detect: 'por + deadline marker (deadline: "por mañana" → "para mañana")' },
    { id: 'por_destination', wrongPrep: 'por', correctPrep: 'para',
      context: 'destination', detect: 'por + destination (destination: "voy por Madrid" → "voy para Madrid")' },
    { id: 'para_exchange', wrongPrep: 'para', correctPrep: 'por',
      context: 'exchange', detect: 'para + price/exchange ("lo compré para 10 euros" → "lo compré por 10 euros")' },
    { id: 'por_recipient', wrongPrep: 'por', correctPrep: 'para',
      context: 'recipient', detect: 'por + recipient ("un regalo por ti" → "un regalo para ti")' },
    { id: 'para_reason', wrongPrep: 'para', correctPrep: 'por',
      context: 'reason', detect: 'para + reason/emotion ("gritó para miedo" → "gritó por miedo")' },
    { id: 'por_goal', wrongPrep: 'por', correctPrep: 'para',
      context: 'goal', detect: 'por + goal noun ("estudio por el examen" → "estudio para el examen")' },
    { id: 'para_means', wrongPrep: 'para', correctPrep: 'por',
      context: 'means', detect: 'para + communication means ("hablar para teléfono" → "hablar por teléfono")' },
    { id: 'por_opinion', wrongPrep: 'por', correctPrep: 'para',
      context: 'opinion', detect: 'por + personal opinion ("por mí, es fácil" → "para mí, es fácil")' },
  ];

  const ES_HUMAN_NOUNS = has('human_nouns') ? new Set(synced.human_nouns) : new Set([
    'madre', 'padre', 'hermano', 'hermana', 'hijo', 'hija',
    'amigo', 'amiga', 'profesor', 'profesora', 'maestro', 'maestra',
    'doctor', 'doctora', 'nino', 'nina', 'hombre', 'mujer',
    'chico', 'chica', 'abuelo', 'abuela', 'primo', 'prima',
    'vecino', 'vecina', 'companero', 'companera',
  ]);

  const ES_COPULA_VERBS = has('copula_verbs') ? new Set(synced.copula_verbs) : new Set([
    'ser', 'estar', 'parecer', 'resultar', 'quedarse',
  ]);

  // ═══════════════════════════════════════════════════════════
  // ── FR: Avoir/Etre conjugated forms (Phase 10) ──
  // ═══════════════════════════════════════════════════════════

  const FR_AVOIR_FORMS = has('avoir_forms') ? synced.avoir_forms : {
    // Present
    ai:      { person: '1s', tense: 'present' },
    as:      { person: '2s', tense: 'present' },
    a:       { person: '3s', tense: 'present' },
    avons:   { person: '1p', tense: 'present' },
    avez:    { person: '2p', tense: 'present' },
    ont:     { person: '3p', tense: 'present' },
    // Imparfait
    avais:   { person: '1s/2s', tense: 'imparfait' },
    avait:   { person: '3s', tense: 'imparfait' },
    avions:  { person: '1p', tense: 'imparfait' },
    aviez:   { person: '2p', tense: 'imparfait' },
    avaient: { person: '3p', tense: 'imparfait' },
  };

  const FR_ETRE_FORMS = has('etre_forms') ? synced.etre_forms : {
    // Present
    suis:    { person: '1s', tense: 'present' },
    es:      { person: '2s', tense: 'present' },
    est:     { person: '3s', tense: 'present' },
    sommes:  { person: '1p', tense: 'present' },
    etes:    { person: '2p', tense: 'present' },
    êtes:    { person: '2p', tense: 'present' },
    sont:    { person: '3p', tense: 'present' },
    // Imparfait (accented)
    étais:   { person: '1s/2s', tense: 'imparfait' },
    était:   { person: '3s', tense: 'imparfait' },
    étions:  { person: '1p', tense: 'imparfait' },
    étiez:   { person: '2p', tense: 'imparfait' },
    étaient: { person: '3p', tense: 'imparfait' },
    // Imparfait (accent-stripped)
    etais:   { person: '1s/2s', tense: 'imparfait' },
    etait:   { person: '3s', tense: 'imparfait' },
    etions:  { person: '1p', tense: 'imparfait' },
    etiez:   { person: '2p', tense: 'imparfait' },
    etaient: { person: '3p', tense: 'imparfait' },
  };

  const FR_ETRE_VERBS = has('etre_verbs') ? new Set(synced.etre_verbs) : new Set([
    'aller', 'arriver', 'descendre', 'devenir', 'entrer', 'monter',
    'mourir', 'naitre', 'naître', 'partir', 'passer', 'rentrer',
    'rester', 'retourner', 'revenir', 'sortir', 'tomber', 'venir',
  ]);

  const FR_ETRE_PARTICIPLES = has('etre_participles') ? synced.etre_participles : {
    // aller
    'allé': 'aller', alle: 'aller', 'allée': 'aller', allee: 'aller',
    'allés': 'aller', alles: 'aller', 'allées': 'aller', allees: 'aller',
    // arriver
    'arrivé': 'arriver', arrive: 'arriver', 'arrivée': 'arriver', arrivee: 'arriver',
    'arrivés': 'arriver', arrives: 'arriver', 'arrivées': 'arriver', arrivees: 'arriver',
    // descendre
    descendu: 'descendre', descendue: 'descendre', descendus: 'descendre', descendues: 'descendre',
    // devenir
    devenu: 'devenir', devenue: 'devenir', devenus: 'devenir', devenues: 'devenir',
    // entrer
    'entré': 'entrer', entre: 'entrer', 'entrée': 'entrer', entree: 'entrer',
    'entrés': 'entrer', entres: 'entrer', 'entrées': 'entrer', entrees: 'entrer',
    // monter
    'monté': 'monter', monte: 'monter', 'montée': 'monter', montee: 'monter',
    'montés': 'monter', montes: 'monter', 'montées': 'monter', montees: 'monter',
    // mourir
    mort: 'mourir', morte: 'mourir', morts: 'mourir', mortes: 'mourir',
    // naitre
    'né': 'naitre', ne: 'naitre', 'née': 'naitre', nee: 'naitre',
    'nés': 'naitre', nes: 'naitre', 'nées': 'naitre', nees: 'naitre',
    // partir
    parti: 'partir', partie: 'partir', partis: 'partir', parties: 'partir',
    // passer
    'passé': 'passer', passe: 'passer', 'passée': 'passer', passee: 'passer',
    'passés': 'passer', passes: 'passer', 'passées': 'passer', passees: 'passer',
    // rentrer
    'rentré': 'rentrer', rentre: 'rentrer', 'rentrée': 'rentrer', rentree: 'rentrer',
    'rentrés': 'rentrer', rentres: 'rentrer', 'rentrées': 'rentrer', rentrees: 'rentrer',
    // rester
    'resté': 'rester', reste: 'rester', 'restée': 'rester', restee: 'rester',
    'restés': 'rester', restes: 'rester', 'restées': 'rester', restees: 'rester',
    // retourner
    'retourné': 'retourner', retourne: 'retourner', 'retournée': 'retourner', retournee: 'retourner',
    'retournés': 'retourner', retournes: 'retourner', 'retournées': 'retourner', retournees: 'retourner',
    // revenir
    revenu: 'revenir', revenue: 'revenir', revenus: 'revenir', revenues: 'revenir',
    // sortir
    sorti: 'sortir', sortie: 'sortir', sortis: 'sortir', sorties: 'sortir',
    // tomber
    'tombé': 'tomber', tombe: 'tomber', 'tombée': 'tomber', tombee: 'tomber',
    'tombés': 'tomber', tombes: 'tomber', 'tombées': 'tomber', tombees: 'tomber',
    // venir
    venu: 'venir', venue: 'venir', venus: 'venir', venues: 'venir',
  };

  const ES_SUBJUNTIVO_TRIGGERS = has('subjuntivo_triggers') ? new Set(synced.subjuntivo_triggers) : new Set([
    'quiero que', 'quiere que', 'queremos que',
    'espero que', 'espera que', 'esperamos que',
    'dudo que', 'duda que', 'dudamos que',
    'es importante que', 'es necesario que', 'es posible que',
    'es imposible que', 'es mejor que', 'es probable que',
    'me alegra que', 'me sorprende que', 'me molesta que',
    'no creo que', 'no pienso que',
    'ojala que', 'ojalá que',
    'pido que', 'pide que',
    'prefiero que', 'prefiere que',
    'recomiendo que', 'recomienda que',
    'sugiero que', 'sugiere que',
  ]);

  const ES_PRETERITO_ADVERBS = has('preterito_adverbs') ? new Set(synced.preterito_adverbs) : new Set(['ayer', 'anteayer', 'anoche']);
  const ES_PRETERITO_PHRASES = has('preterito_phrases') ? synced.preterito_phrases : [
    'la semana pasada', 'el mes pasado', 'el ano pasado', 'el año pasado',
    'el lunes pasado', 'el martes pasado',
    'una vez', 'de repente',
  ];
  const ES_IMPERFECTO_ADVERBS = has('imperfecto_adverbs') ? new Set(synced.imperfecto_adverbs) : new Set([
    'siempre', 'normalmente', 'generalmente', 'frecuentemente',
  ]);
  const ES_IMPERFECTO_PHRASES = has('imperfecto_phrases') ? synced.imperfecto_phrases : [
    'cada dia', 'cada día', 'cada semana', 'cada mes', 'cada ano', 'cada año',
    'todos los dias', 'todos los días', 'a menudo', 'a veces', 'de vez en cuando',
  ];

  const FR_SUBJONCTIF_TRIGGERS = has('subjonctif_triggers') ? new Set(synced.subjonctif_triggers) : new Set([
    'il faut que', 'il faudrait que',
    'avant que', 'pour que', 'afin que',
    'bien que', 'quoique',
    'sans que', 'a moins que', 'à moins que',
    'je veux que', 'il veut que', 'elle veut que',
    'je souhaite que', 'il souhaite que',
    'je doute que', 'il doute que',
    'il est important que', 'il est possible que',
    'il est necessaire que', 'il est nécessaire que',
  ]);

  const ES_GUSTAR_CLASS_VERBS = has('gustar_class_verbs') ? new Set(synced.gustar_class_verbs) : new Set([
    'gustar', 'encantar', 'interesar', 'importar', 'molestar',
    'fascinar', 'aburrir', 'doler', 'faltar', 'sobrar',
    'parecer', 'quedar', 'apetecer', 'costar', 'bastar',
  ]);

  // ═══════════════════════════════════════════════════════════
  // ── Phase 13: Document-drift helpers ──
  // ═══════════════════════════════════════════════════════════

  /**
   * Majority-vote drift detector. Pure function — no mutable state.
   *
   * Takes an array of register markers: {register, tokenIndex, start, end, display}
   * Returns null if:
   *   - fewer than minCount markers (insufficient evidence)
   *   - all markers are the same register (no drift)
   *   - tie between top two registers (no clear dominant)
   * Otherwise returns { dominant: string, minority: marker[] }.
   */
  function detectDrift(markers, minCount) {
    if (typeof minCount === 'undefined') minCount = 3;
    if (markers.length < minCount) return null;

    // Tally per register
    const tally = {};
    for (const m of markers) {
      tally[m.register] = (tally[m.register] || 0) + 1;
    }

    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
    if (sorted.length < 2) return null; // all same register — no drift

    // Tie: top two registers have equal counts — no clear dominant
    if (sorted[0][1] === sorted[1][1]) return null;

    const dominant = sorted[0][0];
    const minority = markers.filter(m => m.register !== dominant);
    return { dominant, minority };
  }

  const BOKMAL_RIKSMAL_MAP = has('bokmal_riksmal_map') ? new Map(Object.entries(synced.bokmal_riksmal_map)) : new Map([
    // Spelling differences
    ['efter', 'etter'],
    ['sne', 'snø'],
    ['nu', 'nå'],
    // Preteritum forms
    ['fandt', 'fant'],
    ['sagde', 'sa'],
    // Feminine definite -en (riksmal) vs -a (bokmal)
    ['boken', 'boka'],
    ['gaten', 'gata'],
    ['jenten', 'jenta'],
    ['klokken', 'klokka'],
    ['solen', 'sola'],
    ['døren', 'døra'],
  ]);

  // Lexical riksmal markers — old-fashioned spellings/words that are nearly
  // never the intended modern bokmal form. These are flagged unconditionally
  // by `nb-riksmal-lexical` (priority 40, wins over typo-fuzzy's wrong-direction
  // neighbour guess) and EXCLUDED from `doc-drift-nb-register`'s majority
  // tally (so a sprinkling of these words can't tip the document into being
  // labelled "majority riksmal", which would wrongly flag valid bokmal forms
  // like "Jenta"/"gata" as needing conversion to "jenten"/"gaten").
  const LEXICAL_RIKSMAL_FORMS = new Set([
    'efter', 'sne', 'nu', 'fandt', 'sagde',
  ]);

  // Morphological riksmal/bokmal pairs — both sides are valid Norwegian; the
  // student must just be CONSISTENT within a document. Used by
  // doc-drift-nb-register to detect inconsistency (e.g. Jenta in §1, jenten
  // in §3 → flag the later occurrence).
  const MORPHOLOGICAL_RIKSMAL_PAIRS = new Map([
    ['boken', 'boka'],
    ['gaten', 'gata'],
    ['jenten', 'jenta'],
    ['klokken', 'klokka'],
    ['solen', 'sola'],
    ['døren', 'døra'],
  ]);

  const tables = {
    // DE tables
    PREP_CASE,
    DEF_ARTICLE_CASE,
    INDEF_ARTICLE_CASE,
    SEPARABLE_PREFIXES,
    SEIN_VERBS,
    BOTH_AUX_VERBS,
    // ES tables
    ES_SER_FORMS,
    ES_ESTAR_FORMS,
    ES_COPULA_ADJ,
    ES_POR_PARA_TRIGGERS,
    ES_HUMAN_NOUNS,
    ES_COPULA_VERBS,
    // Phase 11: ES mood/aspect tables
    ES_SUBJUNTIVO_TRIGGERS,
    ES_PRETERITO_ADVERBS,
    ES_PRETERITO_PHRASES,
    ES_IMPERFECTO_ADVERBS,
    ES_IMPERFECTO_PHRASES,
    // Phase 12: ES pronoun table
    ES_GUSTAR_CLASS_VERBS,
    // FR tables
    FR_AVOIR_FORMS,
    FR_ETRE_FORMS,
    FR_ETRE_VERBS,
    FR_ETRE_PARTICIPLES,
    // Phase 11: FR mood table
    FR_SUBJONCTIF_TRIGGERS,
    // Phase 13: Document-drift helpers
    detectDrift,
    BOKMAL_RIKSMAL_MAP,
    // Register-redesign split: lexical (always-flag) vs morphological
    // (inconsistency-only). See LEXICAL_RIKSMAL_FORMS comment above.
    LEXICAL_RIKSMAL_FORMS,
    MORPHOLOGICAL_RIKSMAL_PAIRS,
  };

  host.__lexiGrammarTables = tables;
  if (typeof module !== 'undefined' && module.exports) module.exports = tables;

  // ── Phase 10 consumer documentation ──
  // FR_AVOIR_FORMS, FR_ETRE_FORMS: consumed by fr-etre-avoir.js (Plan 02)
  // FR_ETRE_VERBS, FR_ETRE_PARTICIPLES: fallback data for verbs missing
  //   passe_compose.auxiliary in fr.json vocab data.
})();
