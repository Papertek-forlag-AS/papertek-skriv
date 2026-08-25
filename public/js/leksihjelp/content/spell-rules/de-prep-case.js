/**
 * Spell-check rule: German preposition-case governance (DE-01, priority 68).
 *
 * Phase 8. Flags article forms that mismatch the case required by the
 * preceding preposition, optionally cross-checking the noun's gender.
 *
 *   Wrong:   "mit den Schule" (den = m.acc, but mit requires dative; Schule is f → der)
 *   Correct: "mit der Schule"
 *
 * Two-way prepositions (in/auf/an etc.) flag at warn severity only since
 * motion/location ambiguity makes the required case context-dependent.
 * Genitive prepositions (wegen/statt/trotz/während) flag at warn severity
 * because colloquial dative is widespread.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { tokensInSentence, escapeHtml: coreEscape, matchCase: coreMatchCase } = core;

  function escapeHtml(s) {
    if (coreEscape) return coreEscape(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original[0] === original[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  // Case name mapping: grammar-tables uses full German case names
  const CASE_ALIAS = {
    acc: 'akkusativ',
    dat: 'dativ',
    gen: 'genitiv',
    nom: 'nominativ',
  };

  // Lazy-init: grammar-tables.js may load after this file in the Node fixture
  // runner (alphabetical sort). Read tables at first check() call instead of
  // IIFE time, so both browser (manifest-ordered) and Node (alphabetical) work.
  let _tables = null;
  function getTables() {
    if (_tables) return _tables;
    const gt = host.__lexiGrammarTables || {};
    const PREP_CASE = gt.PREP_CASE || {};
    const DEF_ARTICLE_CASE = gt.DEF_ARTICLE_CASE || {};
    const INDEF_ARTICLE_CASE = gt.INDEF_ARTICLE_CASE || {};

    // Reverse lookup: (genus, caseName) → correct definite article
    const DEF_CORRECT = {};
    for (const [art, readings] of Object.entries(DEF_ARTICLE_CASE)) {
      for (const r of readings) {
        const key = r.genus + '.' + r.case;
        if (!DEF_CORRECT[key]) DEF_CORRECT[key] = art;
      }
    }

    // Reverse lookup for indefinite articles
    const INDEF_CORRECT = {};
    for (const [art, readings] of Object.entries(INDEF_ARTICLE_CASE)) {
      for (const r of readings) {
        const key = r.genus + '.' + r.case;
        if (!INDEF_CORRECT[key]) INDEF_CORRECT[key] = art;
      }
    }

    _tables = { PREP_CASE, DEF_ARTICLE_CASE, INDEF_ARTICLE_CASE, DEF_CORRECT, INDEF_CORRECT };
    return _tables;
  }

  // ── Pedagogy data fallback (Phase 39) ──
  const PEDAGOGY_FALLBACK = {
    aus: {
      case: 'dativ',
      note: {
        nb: 'Preposisjonen <em>aus</em> styrer alltid dativ.',
        nn: 'Preposisjonen <em>aus</em> styrer alltid dativ.',
        en: 'The preposition <em>aus</em> always takes the dative case.',
      },
      examples: [
        { correct: 'aus der Schule', incorrect: 'aus die Schule', translation: { nb: 'fra skolen', nn: 'frå skulen', en: 'from school' } },
        { correct: 'aus dem Haus', incorrect: 'aus das Haus', translation: { nb: 'ut av huset', nn: 'ut av huset', en: 'out of the house' } },
      ]
    },
    bei: {
      case: 'dativ',
      note: {
        nb: 'Preposisjonen <em>bei</em> styrer alltid dativ.',
        nn: 'Preposisjonen <em>bei</em> styrer alltid dativ.',
        en: 'The preposition <em>bei</em> always takes the dative case.',
      },
      examples: [
        { correct: 'bei dem Lehrer', incorrect: 'bei den Lehrer', translation: { nb: 'hos læreren', nn: 'hos læraren', en: 'at the teacher\'s' } },
      ]
    },
    mit: {
      case: 'dativ',
      note: {
        nb: 'Preposisjonen <em>mit</em> styrer alltid dativ.',
        nn: 'Preposisjonen <em>mit</em> styrer alltid dativ.',
        en: 'The preposition <em>mit</em> always takes the dative case.',
      },
      examples: [
        { correct: 'mit dem Auto', incorrect: 'mit das Auto', translation: { nb: 'med bilen', nn: 'med bilen', en: 'with the car' } },
      ]
    },
    nach: {
      case: 'dativ',
      note: {
        nb: 'Preposisjonen <em>nach</em> styrer alltid dativ.',
        nn: 'Preposisjonen <em>nach</em> styrer alltid dativ.',
        en: 'The preposition <em>nach</em> always takes the dative case.',
      },
      examples: [
        { correct: 'nach dem Essen', incorrect: 'nach das Essen', translation: { nb: 'etter maten', nn: 'etter maten', en: 'after the meal' } },
      ]
    },
    seit: {
      case: 'dativ',
      note: {
        nb: 'Preposisjonen <em>seit</em> styrer alltid dativ.',
        nn: 'Preposisjonen <em>seit</em> styrer alltid dativ.',
        en: 'The preposition <em>seit</em> always takes the dative case.',
      },
      examples: [
        { correct: 'seit einem Jahr', incorrect: 'seit ein Jahr', translation: { nb: 'siden et år', nn: 'sidan eit år', en: 'for a year' } },
      ]
    },
    von: {
      case: 'dativ',
      note: {
        nb: 'Preposisjonen <em>von</em> styrer alltid dativ.',
        nn: 'Preposisjonen <em>von</em> styrer alltid dativ.',
        en: 'The preposition <em>von</em> always takes the dative case.',
      },
      examples: [
        { correct: 'von dem Freund', incorrect: 'von den Freund', translation: { nb: 'fra vennen', nn: 'frå venen', en: 'from the friend' } },
      ]
    },
    zu: {
      case: 'dativ',
      note: {
        nb: 'Preposisjonen <em>zu</em> styrer alltid dativ.',
        nn: 'Preposisjonen <em>zu</em> styrer alltid dativ.',
        en: 'The preposition <em>zu</em> always takes the dative case.',
      },
      examples: [
        { correct: 'zu der Oma', incorrect: 'zu die Oma', translation: { nb: 'til bestemor', nn: 'til bestemor', en: 'to grandma' } },
      ]
    },
    durch: {
      case: 'akkusativ',
      note: {
        nb: 'Preposisjonen <em>durch</em> styrer alltid akkusativ.',
        nn: 'Preposisjonen <em>durch</em> styrer alltid akkusativ.',
        en: 'The preposition <em>durch</em> always takes the accusative case.',
      },
      examples: [
        { correct: 'durch den Wald', incorrect: 'durch dem Wald', translation: { nb: 'gjennom skogen', nn: 'gjennom skogen', en: 'through the forest' } },
      ]
    },
    'für': {
      case: 'akkusativ',
      note: {
        nb: 'Preposisjonen <em>für</em> styrer alltid akkusativ.',
        nn: 'Preposisjonen <em>für</em> styrer alltid akkusativ.',
        en: 'The preposition <em>für</em> always takes the accusative case.',
      },
      examples: [
        { correct: 'für den Vater', incorrect: 'für dem Vater', translation: { nb: 'til/for faren', nn: 'til/for faren', en: 'for the father' } },
      ]
    },
    gegen: {
      case: 'akkusativ',
      note: {
        nb: 'Preposisjonen <em>gegen</em> styrer alltid akkusativ.',
        nn: 'Preposisjonen <em>gegen</em> styrer alltid akkusativ.',
        en: 'The preposition <em>gegen</em> always takes the accusative case.',
      },
      examples: [
        { correct: 'gegen den Strom', incorrect: 'gegen dem Strom', translation: { nb: 'mot strømmen', nn: 'mot straumen', en: 'against the current' } },
      ]
    },
    ohne: {
      case: 'akkusativ',
      note: {
        nb: 'Preposisjonen <em>ohne</em> styrer alltid akkusativ.',
        nn: 'Preposisjonen <em>ohne</em> styrer alltid akkusativ.',
        en: 'The preposition <em>ohne</em> always takes the accusative case.',
      },
      examples: [
        { correct: 'ohne den Hund', incorrect: 'ohne dem Hund', translation: { nb: 'uten hunden', nn: 'utan hunden', en: 'without the dog' } },
      ]
    },
    um: {
      case: 'akkusativ',
      note: {
        nb: 'Preposisjonen <em>um</em> styrer alltid akkusativ.',
        nn: 'Preposisjonen <em>um</em> styrer alltid akkusativ.',
        en: 'The preposition <em>um</em> always takes the accusative case.',
      },
      examples: [
        { correct: 'um den Tisch', incorrect: 'um dem Tisch', translation: { nb: 'rundt bordet', nn: 'rundt bordet', en: 'around the table' } },
      ]
    }
  };

  // Shared closing note for every DATIVE-governing preposition: lists the full
  // set, gives extra examples, and the common article contractions. Injected
  // into the "Lær mer" panel (renders on the last page) for dativ-case findings
  // that don't already carry their own `extra`. Authored here rather than
  // repeated per-preposition.
  const DATIVE_EXTRA = {
    nb: 'Disse preposisjonene styrer <strong>alltid dativ</strong> — uansett om det er bevegelse eller ikke: <em>aus, außer, bei, gegenüber, mit, nach, seit, von, zu</em>. Flere eksempler: <em>mit dem Bus</em>, <em>aus der Schweiz</em>, <em>bei der Arbeit</em>, <em>seit einem Jahr</em>. Vanlige sammentrekninger: <em>zu dem → zum</em>, <em>zu der → zur</em>, <em>von dem → vom</em>, <em>bei dem → beim</em>.',
    nn: 'Desse preposisjonane styrer <strong>alltid dativ</strong> — same om det er rørsle eller ikkje: <em>aus, außer, bei, gegenüber, mit, nach, seit, von, zu</em>. Fleire døme: <em>mit dem Bus</em>, <em>aus der Schweiz</em>, <em>bei der Arbeit</em>, <em>seit einem Jahr</em>. Vanlege samandragingar: <em>zu dem → zum</em>, <em>zu der → zur</em>, <em>von dem → vom</em>, <em>bei dem → beim</em>.',
    en: 'These prepositions <strong>always take the dative</strong> — whether there is motion or not: <em>aus, außer, bei, gegenüber, mit, nach, seit, von, zu</em>. More examples: <em>mit dem Bus</em>, <em>aus der Schweiz</em>, <em>bei der Arbeit</em>, <em>seit einem Jahr</em>. Common contractions: <em>zu dem → zum</em>, <em>zu der → zur</em>, <em>von dem → vom</em>, <em>bei dem → beim</em>.',
  };

  // Attach the shared dative closing note when a finding's pedagogy is a
  // dativ-case block without its own `extra`. Clones so the shared
  // PEDAGOGY_FALLBACK / lexicon objects are never mutated.
  function withDativeExtra(ped) {
    if (ped && ped.case === 'dativ' && !ped.extra) {
      return Object.assign({}, ped, { extra: DATIVE_EXTRA });
    }
    return ped;
  }

  // Check if an article's possible case readings overlap with required cases
  function hasOverlap(articleReadings, requiredCases) {
    for (const r of articleReadings) {
      if (requiredCases.has(r.case)) return true;
    }
    return false;
  }

  // Check if any reading of the article matches the required case AND the noun's gender
  function hasGenderCaseMatch(articleReadings, requiredCases, nounGender) {
    for (const r of articleReadings) {
      if (requiredCases.has(r.case) && r.genus === nounGender) return true;
    }
    return false;
  }

  // Finite copula / auxiliary / modal forms. A preposition's noun phrase never
  // spans the clause's finite verb, so reaching one during the article scan
  // means the prep's government ended (the article we'd otherwise grab belongs
  // to a predicate: "von Energieimporten IST ein großes Problem" — «ein» is the
  // predicate nominative, not von's object).
  const FINITE_VERB_STOP = new Set([
    'ist', 'sind', 'bist', 'bin', 'seid', 'war', 'waren', 'warst', 'wart',
    'hat', 'habe', 'hast', 'haben', 'habt', 'hatte', 'hatten', 'hattest',
    'wird', 'werden', 'wirst', 'werde', 'werdet', 'wurde', 'wurden', 'wurdest',
    'kann', 'kannst', 'können', 'könnt', 'konnte', 'konnten',
    'muss', 'musst', 'müssen', 'müsst', 'musste', 'mussten',
    'will', 'willst', 'wollen', 'wollt', 'wollte', 'wollten',
    'soll', 'sollst', 'sollen', 'sollt', 'sollte', 'sollten',
    'mag', 'magst', 'mögen', 'darf', 'darfst', 'dürfen', 'dürft',
  ]);

  // Lowercase noun-homographs that are NOT the prep's noun when written
  // lowercase: separable verb prefixes ("…nahmen an der Versammlung teil" —
  // der-Teil homograph; "fand … statt"), and fixed lowercase idioms where the
  // noun-homograph is officially written small ("er hat recht", "tut mir
  // leid", "es ist mir ernst"). A lowercase KNOWN noun outside this set is
  // treated as a student-mis-cased real noun (see the scan below).
  const LOWER_NOUN_HOMOGRAPHS = new Set([
    'teil', 'statt', 'halt', 'mal', 'morgen', 'recht', 'ernst', 'leid',
    'schuld', 'angst', 'wert', 'pleite', 'not', 'weile',
  ]);

  // Positional/local adverbs. "von oben", "von unten", "nach außen" etc. are
  // fixed adverbials — a genitive that follows is an attribute, not the prep's
  // object ("von oben des Turms" — des Turms modifies oben, not von).
  const ADVERB_STOP = new Set([
    'oben', 'unten', 'außen', 'innen', 'vorn', 'vorne', 'hinten',
    'links', 'rechts', 'drüben', 'drinnen', 'draußen', 'nebenan',
  ]);

  // Set of every verb-infinitive value in the lexicon, cached on the vocab
  // object. Used to recognise a nominalised infinitive ("das Spielen", "beim
  // Duschen" — neuter singular) whose surface form is ALSO a plural noun
  // ("die Spiele" → dat pl "Spielen"), so the exclusive-plural override doesn't
  // mis-read it as a plural and flag a singular article.
  function getVerbInfinitiveSet(vocab) {
    if (vocab.__deInfinitiveSet) return vocab.__deInfinitiveSet;
    const s = new Set();
    const vi = vocab.verbInfinitive;
    if (vi && typeof vi.values === 'function') {
      for (const inf of vi.values()) if (inf) s.add(String(inf).toLowerCase());
    }
    vocab.__deInfinitiveSet = s;
    return s;
  }

  const rule = {
    id: 'de-prep-case',
    languages: ['de'],
    priority: 68,
    // exam-audit 33-03: stays safe=false — Lær mer pedagogy popover (case explanation) exceeds Chrome native parity
    exam: {
      safe: false,
      reason: "Stays safe=false (de-prep-case) — Lær mer pedagogy popover (case explanation) exceeds Chrome native parity",
      category: "grammar-lookup",
    },
    severity: 'warning',
    // Phase 27-01: dual exam marker — the dot/correction surface inherits
    // rule.exam (grammar-lookup, safe=false), but the Lær mer pedagogy
    // popover rendered via this explain() additionally exceeds browser
    // native parity, so it carries its own marker on the function object.
    explain: Object.assign(function explain(finding) {
      const prepDisplay = finding.prep || '';
      const caseLabel = finding.requiredCase || '';
      const fix = escapeHtml(finding.fix);
      const orig = escapeHtml(finding.original);

      if (finding.genderMismatch && finding.nounDisplay) {
        const noun = escapeHtml(finding.nounDisplay);
        const genderMap = { m: 'maskulinum', f: 'femininum', n: 'nøytrum' };
        const genderLabel = genderMap[finding.nounGender] || finding.nounGender;
        if (finding.isTwoWay) {
          return {
            nb: '<em>' + noun + '</em> er ' + genderLabel + ' — bruk <em>' + fix + '</em> i stedet for <em>' + orig + '</em>. Preposisjonen <em>' + escapeHtml(prepDisplay) + '</em> er en vekselpreposisjon: akkusativ ved bevegelse, dativ ved plassering.',
            nn: '<em>' + noun + '</em> er ' + genderLabel + ' — bruk <em>' + fix + '</em> i staden for <em>' + orig + '</em>. Preposisjonen <em>' + escapeHtml(prepDisplay) + '</em> er ein vekselpreposisjon: akkusativ ved rørsle, dativ ved plassering.',
          };
        }
        return {
          nb: '<em>' + noun + '</em> er ' + genderLabel + ' — bruk <em>' + fix + '</em> (' + escapeHtml(caseLabel) + ') i stedet for <em>' + orig + '</em>.',
          nn: '<em>' + noun + '</em> er ' + genderLabel + ' — bruk <em>' + fix + '</em> (' + escapeHtml(caseLabel) + ') i staden for <em>' + orig + '</em>.',
        };
      }

      if (finding.isTwoWay) {
        return {
          nb: 'Preposisjonen <em>' + escapeHtml(prepDisplay) + '</em> er en vekselpreposisjon: akkusativ ved bevegelse, dativ ved plassering. Bruk <em>' + fix + '</em> i stedet for <em>' + orig + '</em>.',
          nn: 'Preposisjonen <em>' + escapeHtml(prepDisplay) + '</em> er ein vekselpreposisjon: akkusativ ved rørsle, dativ ved plassering. Bruk <em>' + fix + '</em> i staden for <em>' + orig + '</em>.',
        };
      }

      return {
        nb: 'Preposisjonen <em>' + escapeHtml(prepDisplay) + '</em> styrer ' + escapeHtml(caseLabel) + '. Bruk <em>' + fix + '</em> i stedet for <em>' + orig + '</em>.',
        nn: 'Preposisjonen <em>' + escapeHtml(prepDisplay) + '</em> styrer ' + escapeHtml(caseLabel) + '. Bruk <em>' + fix + '</em> i staden for <em>' + orig + '</em>.',
      };
    }, {
      exam: {
        safe: false,
        reason: 'Lær mer pedagogy popover; exceeds browser native parity',
        category: 'pedagogy',
      },
    }),
    check(ctx) {
      if (ctx.lang !== 'de') return [];
      if (!ctx.sentences || !tokensInSentence) return [];

      const { PREP_CASE, DEF_ARTICLE_CASE, INDEF_ARTICLE_CASE, DEF_CORRECT, INDEF_CORRECT } = getTables();
      if (!PREP_CASE || Object.keys(PREP_CASE).length === 0) return [];

      const nounGenus = (ctx.vocab && ctx.vocab.nounGenus) || new Map();
      const isAdjective = (ctx.vocab && ctx.vocab.isAdjective) || new Set();
      // Track D (Phase 47): lazy plural-form cache — same pattern as de-gender.
      // When the noun after a preposition is a known plural form, treat its
      // effective genus as 'pl' so article readings with `{genus:'pl', ...}`
      // (e.g. `den` as dat.pl, `die` as nom.pl/akk.pl) can match. Without this,
      // "von den Kindern" reads as den(m.akk) + Kindern(genus=n, lemma genus)
      // and the rule flags den→dem even though dat.pl is correct.
      // Track D (Phase 47): a noun form is treated as unambiguously plural only
      // if it appears in some lemma's plural bucket AND NOT in any singular
      // bucket. Forms like "Regen" (masculine singular AND plurale-tantum
      // plural) appear in both buckets and must fall through to the lemma-
      // genus reading, so "trotz dem Regen" still suggests des (m.gen).
      function getPluralForms(vocab) {
        if (vocab.__dePluralFormsExclusive) return vocab.__dePluralFormsExclusive;
        const pluralSet = new Set();
        const singularSet = new Set();
        const nf = vocab.nounForms;
        if (nf && typeof nf.values === 'function') {
          for (const forms of nf.values()) {
            if (!forms) continue;
            if (forms.plural) for (const p of forms.plural) pluralSet.add(p);
            if (forms.singular) for (const s of forms.singular) singularSet.add(s);
          }
        }
        const exclusive = new Set();
        for (const w of pluralSet) if (!singularSet.has(w)) exclusive.add(w);
        vocab.__dePluralFormsExclusive = exclusive;
        return exclusive;
      }
      const pluralForms = getPluralForms(ctx.vocab || {});
      // Non-exclusive plural set: EVERY plural surface form, even ones that are
      // ALSO a singular ("der Schüler" sg / "die Schüler" pl; Lehrer, Spieler,
      // Mädchen — the -er/-en Nullplural class). Used only to ACCEPT a
      // plural-capable article ("die"/"den") before such a noun, never to flag.
      function getAllPluralForms(vocab) {
        if (vocab.__deAllPluralForms) return vocab.__deAllPluralForms;
        const all = new Set();
        const nf = vocab.nounForms;
        if (nf && typeof nf.values === 'function') {
          for (const forms of nf.values()) {
            if (forms && forms.plural) for (const p of forms.plural) all.add(p);
          }
        }
        vocab.__deAllPluralForms = all;
        return all;
      }
      const allPluralForms = getAllPluralForms(ctx.vocab || {});
      const infinitiveSet = getVerbInfinitiveSet(ctx.vocab || {});
      const verbInfMap = (ctx.vocab && ctx.vocab.verbInfinitive) || new Map();
      // Phase 26-01: pedagogy lookup is additive — when the lexicon carries
      // a pedagogy block for the flagged preposition, attach it to the
      // finding so spell-check-popover.js can render the "Lær mer" panel.
      // Contract: explain(finding) still returns {nb, nn} unchanged
      // (check-explain-contract gate). The pedagogy block rides on the
      // finding object directly, NOT through explain().
      const prepPedagogy = (ctx.vocab && ctx.vocab.prepPedagogy) || new Map();
      const rulePedagogy = (ctx.vocab && ctx.vocab.rulePedagogy) || new Map();
      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        if (range.end - range.start < 2) continue;

        for (let i = range.start; i < range.end - 1; i++) {
          if (ctx.suppressedFor && ctx.suppressedFor.structural && ctx.suppressedFor.structural.has(i)) continue;

          const prepWord = ctx.tokens[i].word;
          const reqSpec = PREP_CASE[prepWord];
          if (!reqSpec) continue;

          // "um … zu + Infinitiv" is the infinitival conjunction (in order to),
          // NOT the accusative preposition: "um den Gästen zu gefallen" — «um»
          // introduces a purpose clause, «den Gästen» is gefallen's dative
          // object. When a "zu + infinitive" follows «um» in the sentence, skip.
          if (prepWord === 'um') {
            let umZu = false;
            for (let z = i + 2; z < range.end - 1; z++) {
              if (ctx.tokens[z].word === 'zu') {
                const vb = ctx.tokens[z + 1] && ctx.tokens[z + 1].word;
                if (vb && (infinitiveSet.has(vb) || /(?:en|ln|rn)$/.test(vb))) { umZu = true; break; }
              }
            }
            if (umZu) continue;
          }

          // Case-specific Lær mer: a fixed-case preposition shows the lesson for
          // ITS case (DOGFU → akkusativ; aus/bei/mit/… → dativ), so the student
          // sees the rule they actually broke. Two-way preps keep the
          // de-wechselpraep lesson; genitive preps have no dedicated lesson yet.
          const caseLessonKey = reqSpec === 'acc' ? 'de-prep-case-akkusativ'
            : reqSpec === 'dat' ? 'de-prep-case-dativ' : null;

          const isTwoWay = reqSpec === 'acc/dat';
          const isGenitive = reqSpec === 'gen';

          // Build set of required case names
          const requiredCases = new Set();
          if (isTwoWay) {
            requiredCases.add(CASE_ALIAS.acc);
            requiredCases.add(CASE_ALIAS.dat);
          } else {
            const parts = reqSpec.split('/');
            for (const p of parts) {
              if (CASE_ALIAS[p]) requiredCases.add(CASE_ALIAS[p]);
            }
          }

          // Scan next 1–3 tokens for an article. Break if we cross another
          // preposition — its NP is a separate prepositional phrase, not the
          // complement of the current prep. Pre-fix, "zu Fuß in die Stadt"
          // had "zu" (dat-governing) grab "die Stadt" three tokens later and
          // (mis)suggest die→der; "zu schwer für das Kind" had "zu" grab
          // "das Kind" past "schwer für". The cross-prep break closes both
          // false-positive classes by respecting PP boundaries.
          const scanEnd = Math.min(i + 4, range.end);
          for (let j = i + 1; j < scanEnd; j++) {
            // Wikipedia-corpus wave 2 (2026-06-12): boundary break. The scan
            // crossed commas into appositions («in der Nähe von Sindlbach,
            // heute ein Gemeindeteil» — von grabbed «ein») and crossed
            // tokenizer-skipped numerals («seit 1992 Mitglied des
            // Weltschachbunds» — seit grabbed «des», whose genitive is
            // correct for Mitglied). Any comma-class punctuation, digit, or
            // quote in the raw gap means the prep's government ended.
            const gap = ctx.text.slice(ctx.tokens[j - 1].end, ctx.tokens[j].start);
            if (/[,;:()„“”"–—\d]/.test(gap)) break;
            const scanWord = ctx.tokens[j].word;
            // Cross-preposition break — the article scan must not jump
            // across a sibling preposition. Includes the current word `prepWord`
            // index check (j > i+1 implies a real cross, since i+1 is the
            // first token after the active prep itself).
            if (PREP_CASE[scanWord]) break;
            const artWord = scanWord;
            const defReadings = DEF_ARTICLE_CASE[artWord];
            const indefReadings = INDEF_ARTICLE_CASE[artWord];
            if (!defReadings && !indefReadings) {
              // Not an article. A def/indef article always PRECEDES its noun,
              // so if we reach the prep's bare-NP noun (or a genitive attribute
              // like «Fragen des Lebens») before finding any article, or hit the
              // clause's finite verb, the prep's government has ended — stop.
              // Kills the "grab a later genitive attribute / predicate article"
              // FP class ("mit großen Fragen des Lebens" → des; "mit modernen
              // Möbeln ein" → ein; "von Energieimporten ist ein …" → ein).
              if (nounGenus.has(scanWord) || pluralForms.has(scanWord) || allPluralForms.has(scanWord)) break;
              const scanLc = scanWord.toLowerCase();
              // Finite verb (predicate boundary) — copula/aux/modal via the
              // curated set, plus ANY conjugated form the lexicon maps to an
              // infinitive ("stellt"→stellen, "zeigt"→zeigen). A prep's NP never
              // spans a finite verb, so the article after it is a predicate:
              // "…stellt die Stühle…", "von Anna zeigt ein schönes Haus".
              if (FINITE_VERB_STOP.has(scanLc) || verbInfMap.has(scanLc) || verbInfMap.has(scanWord)) break;
              // Coordinating conjunction — "aus und stellt die …" (here "aus" is
              // a separable verb prefix, richtet…aus). A preposition is never
              // followed by und/oder/aber/sondern, so this ends its government.
              if (scanLc === 'und' || scanLc === 'oder' || scanLc === 'aber' || scanLc === 'sondern') break;
              // Positional adverb — "von oben/unten/außen …" is a fixed adverbial
              // and any following genitive ("von oben des Turms") is an attribute,
              // not the prep's object. Stop the scan.
              if (ADVERB_STOP.has(scanLc)) break;
              continue;
            }

            const readings = defReadings || indefReadings;
            const isDef = !!defReadings;

            // "während" is also a subordinating conjunction ("während die
            // Technologie modernisiert wird") — the genitive PREPOSITION can only
            // govern genitive (standard) or dative (colloquial), never nom/akk.
            // So when the following article can ONLY be nom/akk (die, das),
            // «während» is the conjunction, not the preposition → skip the whole
            // preposition. Colloquial dative "während dem Urlaub" keeps its
            // genitive-government warning (dem HAS a dativ reading), as intended.
            if (prepWord === 'während'
                && !readings.some(function (r) { return r.case === CASE_ALIAS.gen || r.case === CASE_ALIAS.dat; })) {
              break;
            }

            // Look for a noun after the article (skip up to 1 adjective)
            let nounGender = null;
            let nounDisplay = null;
            for (let k = j + 1; k < Math.min(j + 3, range.end); k++) {
              // Wave 2: same boundary break for the article→noun pairing.
              const nounGap = ctx.text.slice(ctx.tokens[k - 1].end, ctx.tokens[k].start);
              if (/[,;:()„“”"–—\d]/.test(nounGap)) break;
              const nw = ctx.tokens[k].word;
              // German common nouns are properly capitalised, so a CAPITALISED
              // token is a safe noun candidate. A lowercase token is usually a
              // verb, separable prefix, adverb, or adjective homograph ("…in
              // der Aula teil" → «teil» is teilnehmen's prefix, a der-Teil
              // homograph) — BUT student text routinely mis-cases real nouns
              // ("zu der supermarkt"), and losing the noun loses the Case-2
              // gender check entirely (benchmark de.29.b regression). Accept a
              // lowercase candidate ONLY when it is a known noun and not a
              // prefix/adverb noun-homograph; the isAdjective and infinitiveSet
              // guards below still apply to it.
              const nc0 = ctx.tokens[k].display.charAt(0);
              const kIsCap = nc0 !== nc0.toLowerCase() && nc0 === nc0.toUpperCase();
              if (!kIsCap) {
                if (!nounGenus.has(nw)) continue;
                if (LOWER_NOUN_HOMOGRAPHS.has(nw)) continue;
                // Finite-verb noun-homographs: "waren" (sein) vs Waren (goods),
                // "essen" vs das Essen. Properly-cased German disambiguates by
                // capitalisation; for a lowercase token the verb reading wins.
                if (FINITE_VERB_STOP.has(nw) || verbInfMap.has(nw)) continue;
              }
              // Adjective inflection, even when capitalised at sentence start
              // ("Alten") — skip to the head noun.
              if (isAdjective.has(nw) || isAdjective.has(nw.toLowerCase())) continue;
              // Hyphenated compound ("Internet-Anschluss"): German compound
              // gender is the HEAD (last) element, so skip a modifier that is
              // directly hyphen-joined to the next token and let the scan reach
              // the head noun ("…den Internet-Anschluss" → gender of Anschluss).
              if (k + 1 < range.end && ctx.text.slice(ctx.tokens[k].end, ctx.tokens[k + 1].start) === '-') continue;
              // Track D (Phase 47): plural-form override — if the noun token
              // is a known plural form, signal 'pl' so article readings with
              // genus:'pl' can match.
              // Nominalised infinitive ("nach dem Spielen", "beim Duschen") is
              // neuter singular even though its surface is ALSO a plural noun
              // form ("Spielen" = dat pl of «Spiel»). Skip the plural override
              // for it — leave the genus to nounGenus (usually unresolved →
              // no gender-mismatch flag), so the singular article stands.
              if (infinitiveSet.has(nw.toLowerCase())) { break; }  // leave nounGender null → no flag
              if (pluralForms.has(nw)) { nounGender = 'pl'; nounDisplay = ctx.tokens[k].display; break; }
              // Non-exclusive plural (der Schüler sg / die Schüler pl; Lehrer,
              // Spieler, Mädchen — the -er/-en Nullplural class): read as plural
              // ONLY when THIS article is itself plural-capable in a required
              // case, so "die/den + Schüler" is a valid plural NP rather than a
              // false masculine-singular gender mismatch. When the article is a
              // singular one ("mit dem Schüler") it has no 'pl' reading, so this
              // guard stays inert and the singular genus below is used.
              if (allPluralForms.has(nw)
                  && readings.some(function (r) { return r.genus === 'pl' && requiredCases.has(r.case); })) {
                nounGender = 'pl'; nounDisplay = ctx.tokens[k].display; break;
              }
              const g = nounGenus.get(nw);
              if (g) {
                nounGender = g;
                nounDisplay = ctx.tokens[k].display;
                break;
              }
            }

            // Case 1: Article's possible cases have ZERO overlap with required cases
            if (!hasOverlap(readings, requiredCases)) {
              let suggestion = artWord;
              if (nounGender) {
                const targetCase = isTwoWay ? CASE_ALIAS.dat : Array.from(requiredCases)[0];
                const lookupKey = nounGender + '.' + targetCase;
                const correct = isDef ? DEF_CORRECT[lookupKey] : INDEF_CORRECT[lookupKey];
                if (correct) suggestion = matchCase(ctx.tokens[j].display, correct);
              } else {
                const firstGenus = readings[0].genus;
                const targetCase = isTwoWay ? CASE_ALIAS.dat : Array.from(requiredCases)[0];
                const lookupKey = firstGenus + '.' + targetCase;
                const correct = isDef ? DEF_CORRECT[lookupKey] : INDEF_CORRECT[lookupKey];
                if (correct) suggestion = matchCase(ctx.tokens[j].display, correct);
              }

              const caseDisplayMap = { akkusativ: 'akkusativ', dativ: 'dativ', genitiv: 'genitiv' };
              const caseNames = Array.from(requiredCases).map(function(c) { return caseDisplayMap[c] || c; });
              const f1 = {
                rule_id: 'de-prep-case',
                start: ctx.tokens[j].start,
                end: ctx.tokens[j].end,
                original: ctx.tokens[j].display,
                fix: suggestion,
                prep: ctx.tokens[i].display,
                requiredCase: caseNames.join('/'),
                isTwoWay: isTwoWay,
                message: ctx.tokens[i].display + ' + ' + ctx.tokens[j].display + ' → ' + suggestion,
                severity: 'error',
              };
              const pkey1 = (ctx.tokens[i].word || '').toLowerCase();
              // Wechselpräpositionen (in, an, auf, …) have no per-preposition
              // pedagogy block — the shared grammarbank lesson keyed
              // 'de-wechselpraep' (acc = movement / dat = location) IS the
              // right lesson for them, so two-way findings fall back to it.
              // Without this, "In + der → dem" rendered with no Lær mer.
              f1.pedagogy = withDativeExtra(prepPedagogy.get(pkey1)
                || (caseLessonKey ? rulePedagogy.get(caseLessonKey) : null)
                || rulePedagogy.get('de-prep-case') || PEDAGOGY_FALLBACK[pkey1]
                || (isTwoWay ? rulePedagogy.get('de-wechselpraep') : null) || null);
              findings.push(f1);
              break;
            }

            // Case 2: Article has a valid case reading but wrong gender for the noun
            if (nounGender && !hasGenderCaseMatch(readings, requiredCases, nounGender)) {
              const targetCase = isTwoWay ? CASE_ALIAS.dat : Array.from(requiredCases)[0];
              const lookupKey = nounGender + '.' + targetCase;
              const correct = isDef ? DEF_CORRECT[lookupKey] : INDEF_CORRECT[lookupKey];
              if (correct && correct !== artWord) {
                const suggestion = matchCase(ctx.tokens[j].display, correct);
                const caseDisplayMap = { akkusativ: 'akkusativ', dativ: 'dativ', genitiv: 'genitiv' };
                const caseNames = Array.from(requiredCases).map(function(c) { return caseDisplayMap[c] || c; });
                const f2 = {
                  rule_id: 'de-prep-case',
                  start: ctx.tokens[j].start,
                  end: ctx.tokens[j].end,
                  original: ctx.tokens[j].display,
                  fix: suggestion,
                  prep: ctx.tokens[i].display,
                  requiredCase: caseNames.join('/'),
                  isTwoWay: isTwoWay,
                  genderMismatch: true,
                  nounDisplay: nounDisplay,
                  nounGender: nounGender,
                  message: ctx.tokens[i].display + ' + ' + ctx.tokens[j].display + ' → ' + suggestion,
                  severity: 'error',
                };
                const pkey2 = (ctx.tokens[i].word || '').toLowerCase();
                // Same wechsel-lesson fallback as f1 above.
                f2.pedagogy = withDativeExtra(prepPedagogy.get(pkey2)
                  || (caseLessonKey ? rulePedagogy.get(caseLessonKey) : null)
                  || rulePedagogy.get('de-prep-case') || PEDAGOGY_FALLBACK[pkey2]
                  || (isTwoWay ? rulePedagogy.get('de-wechselpraep') : null) || null);
                findings.push(f2);
              }
              break;
            }

            // If we get here, article is compatible — stop scanning for this preposition
            break;
          }
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
