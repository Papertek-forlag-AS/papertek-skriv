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
      return {
        nb: 'Preposisjonen <em>' + escapeHtml(prepDisplay) + '</em> styrer ' + escapeHtml(caseLabel) + '. Bruk <em>' + escapeHtml(finding.fix) + '</em> i stedet for <em>' + escapeHtml(finding.original) + '</em>.',
        nn: 'Preposisjonen <em>' + escapeHtml(prepDisplay) + '</em> styrer ' + escapeHtml(caseLabel) + '. Bruk <em>' + escapeHtml(finding.fix) + '</em> i staden for <em>' + escapeHtml(finding.original) + '</em>.',
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

          // Scan next 1–3 tokens for an article
          const scanEnd = Math.min(i + 4, range.end);
          for (let j = i + 1; j < scanEnd; j++) {
            const artWord = ctx.tokens[j].word;
            const defReadings = DEF_ARTICLE_CASE[artWord];
            const indefReadings = INDEF_ARTICLE_CASE[artWord];
            if (!defReadings && !indefReadings) continue;

            const readings = defReadings || indefReadings;
            const isDef = !!defReadings;

            // Look for a noun after the article (skip up to 1 adjective)
            let nounGender = null;
            for (let k = j + 1; k < Math.min(j + 3, range.end); k++) {
              const nw = ctx.tokens[k].word;
              const g = nounGenus.get(nw);
              if (g) {
                nounGender = g;
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
                message: ctx.tokens[i].display + ' + ' + ctx.tokens[j].display + ' → ' + suggestion,
                severity: 'error',
              };
              const pkey1 = (ctx.tokens[i].word || '').toLowerCase();
              f1.pedagogy = prepPedagogy.get(pkey1) || rulePedagogy.get('de-prep-case') || PEDAGOGY_FALLBACK[pkey1] || null;
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
                  message: ctx.tokens[i].display + ' + ' + ctx.tokens[j].display + ' → ' + suggestion,
                  severity: 'error',
                };
                const pkey2 = (ctx.tokens[i].word || '').toLowerCase();
                f2.pedagogy = prepPedagogy.get(pkey2) || rulePedagogy.get('de-prep-case') || PEDAGOGY_FALLBACK[pkey2] || null;
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
