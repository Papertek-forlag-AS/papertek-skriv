/**
 * Spell-check rule: ES preterito/imperfecto aspectual hint (MOOD-02, priority 65).
 *
 * Phase 11. Educational hint when a temporal adverb suggests one aspect
 * (preterito or imperfecto) but the verb is conjugated in the other.
 *
 *   Hint: "Ayer yo caminaba por el parque" (imperfecto with preterito adverb
 *          -> suggest preterito "camine")
 *   Hint: "Siempre yo comi en ese restaurante" (preterito with imperfecto
 *          adverb -> suggest imperfecto "comia")
 *
 * Adverb sets consumed from grammar-tables.js (ES_PRETERITO_ADVERBS,
 * ES_PRETERITO_PHRASES, ES_IMPERFECTO_ADVERBS, ES_IMPERFECTO_PHRASES).
 * Verb form resolution uses vocab-seam indexes esPreteritumToVerb and
 * esImperfectoForms. A lazy reverse map (imperfecto form -> {inf, person})
 * is built on first check call since vocab-seam does not export it directly.
 *
 * "Mientras" guard: bare "mientras" triggers imperfecto hint; "mientras que"
 * (contrastive) does NOT trigger.
 *
 * Severity: hint (P3 dashed/muted dot). NEVER warning or error.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { tokensInSentence, matchCase: coreMatchCase } = core;

  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original && original[0] === original[0].toUpperCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  function escapeHtml(s) {
    const fn = core.escapeHtml;
    if (fn) return fn(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Lazy-init grammar tables
  let _tables = null;
  function getTables() {
    if (_tables) return _tables;
    const gt = host.__lexiGrammarTables || {};
    _tables = {
      PRETERITO_ADVERBS: gt.ES_PRETERITO_ADVERBS || new Set(),
      PRETERITO_PHRASES: gt.ES_PRETERITO_PHRASES || [],
      IMPERFECTO_ADVERBS: gt.ES_IMPERFECTO_ADVERBS || new Set(),
      IMPERFECTO_PHRASES: gt.ES_IMPERFECTO_PHRASES || [],
    };
    return _tables;
  }

  // Lazy reverse map: imperfecto form -> { inf, person }
  // Built on first call from esImperfectoForms (inf|person -> form).
  let _imperfectoToVerb = null;
  function getImperfectoToVerb(esImperfectoForms) {
    if (_imperfectoToVerb) return _imperfectoToVerb;
    _imperfectoToVerb = new Map();
    for (const [key, form] of esImperfectoForms) {
      const sep = key.indexOf('|');
      if (sep === -1) continue;
      const inf = key.slice(0, sep);
      const person = key.slice(sep + 1);
      const lc = form.toLowerCase();
      _imperfectoToVerb.set(lc, { inf, person });
      const stripped = stripAccents(lc);
      if (stripped !== lc) _imperfectoToVerb.set(stripped, { inf, person });
    }
    return _imperfectoToVerb;
  }

  const rule = {
    id: 'es-imperfecto-hint',
    languages: ['es'],
    priority: 65,
    // exam-audit 33-03: stays safe=false — Pedagogy hint that teaches imperfecto vs preterito aspect; not a single-token correction
    exam: {
      safe: false,
      reason: "Stays safe=false (es-imperfecto-hint) — Pedagogy hint that teaches imperfecto vs preterito aspect; not a single-token correction",
      category: "grammar-lookup",
    },
    severity: 'hint',
    explain: function (finding) {
      const adverb = finding.adverb || '';
      const expectedAspect = finding.expectedAspect || '';
      const fix = finding.fix || '';
      const aspectName = expectedAspect === 'preterito' ? 'preterito (fortid, enkelt handling)' : 'imperfecto (fortid, gjentatt/vedvarende)';
      return {
        nb: 'Tidsuttrykket <em>' + escapeHtml(adverb) + '</em> antyder at verbet burde vaere i ' + aspectName + '-form: <em>' + escapeHtml(fix) + '</em>.',
        nn: 'Tidsuttrykket <em>' + escapeHtml(adverb) + '</em> tyder paa at verbet burde vera i ' + aspectName + '-form: <em>' + escapeHtml(fix) + '</em>.',
        severity: 'hint',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      if (!ctx.sentences || !tokensInSentence) return [];

      const tables = getTables();
      const preteritumToVerb = ctx.vocab && ctx.vocab.esPreteritumToVerb;
      const imperfectoForms = ctx.vocab && ctx.vocab.esImperfectoForms;
      if (!preteritumToVerb || !preteritumToVerb.size) return [];
      if (!imperfectoForms || !imperfectoForms.size) return [];

      const imperfectoToVerb = getImperfectoToVerb(imperfectoForms);

      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        if (range.end - range.start < 2) continue;

        // Pass 1: Find adverb markers in this sentence
        const adverbHits = []; // { type: 'preterito'|'imperfecto', adverb: string, tokenIdx: number }

        for (let i = range.start; i < range.end; i++) {
          const word = ctx.tokens[i].word;
          const stripped = stripAccents(word);

          // "mientras" guard: bare "mientras" = imperfecto, "mientras que" = contrastive (skip)
          if (word === 'mientras' || stripped === 'mientras') {
            if (i + 1 < range.end && ctx.tokens[i + 1].word === 'que') {
              continue; // "mientras que" — contrastive, skip
            }
            adverbHits.push({ type: 'imperfecto', adverb: ctx.tokens[i].display, tokenIdx: i });
            continue;
          }

          // Single-word preterito adverbs
          if (tables.PRETERITO_ADVERBS.has(word) || tables.PRETERITO_ADVERBS.has(stripped)) {
            adverbHits.push({ type: 'preterito', adverb: ctx.tokens[i].display, tokenIdx: i });
            continue;
          }

          // Single-word imperfecto adverbs
          if (tables.IMPERFECTO_ADVERBS.has(word) || tables.IMPERFECTO_ADVERBS.has(stripped)) {
            adverbHits.push({ type: 'imperfecto', adverb: ctx.tokens[i].display, tokenIdx: i });
            continue;
          }

          // Multi-word preterito phrases
          for (const phrase of tables.PRETERITO_PHRASES) {
            const words = phrase.split(' ');
            if (i + words.length > range.end) continue;
            let match = true;
            for (let k = 0; k < words.length; k++) {
              const tw = ctx.tokens[i + k].word;
              const ts = stripAccents(tw);
              if (tw !== words[k] && ts !== words[k]) { match = false; break; }
            }
            if (match) {
              const display = [];
              for (let k = 0; k < words.length; k++) display.push(ctx.tokens[i + k].display);
              adverbHits.push({ type: 'preterito', adverb: display.join(' '), tokenIdx: i });
              break;
            }
          }

          // Multi-word imperfecto phrases
          for (const phrase of tables.IMPERFECTO_PHRASES) {
            const words = phrase.split(' ');
            if (i + words.length > range.end) continue;
            let match = true;
            for (let k = 0; k < words.length; k++) {
              const tw = ctx.tokens[i + k].word;
              const ts = stripAccents(tw);
              if (tw !== words[k] && ts !== words[k]) { match = false; break; }
            }
            if (match) {
              const display = [];
              for (let k = 0; k < words.length; k++) display.push(ctx.tokens[i + k].display);
              adverbHits.push({ type: 'imperfecto', adverb: display.join(' '), tokenIdx: i });
              break;
            }
          }
        }

        if (adverbHits.length === 0) continue;

        // Pass 2: For each adverb hit, scan for mismatched verb forms
        for (const hit of adverbHits) {
          for (let j = range.start; j < range.end; j++) {
            if (j === hit.tokenIdx) continue;
            const word = ctx.tokens[j].word;
            const stripped = stripAccents(word);

            if (hit.type === 'preterito') {
              // Preterito adverb found — look for imperfecto verb forms
              const verbInfo = imperfectoToVerb.get(word) || imperfectoToVerb.get(stripped);
              if (verbInfo) {
                // Verb is imperfecto but adverb suggests preterito
                // Look up the preterito form for this verb+person
                const pretKey = verbInfo.inf + '|' + verbInfo.person;
                // We need preterito form from the forward map. But we only have
                // preteritumToVerb (reverse). We need to find the preteritum form.
                // Scan preteritumToVerb values... or better, use a different approach:
                // iterate esPreteritumToVerb entries to find one with same inf+person.
                // This is expensive, so build a lazy forward map.
                const pretForm = findPreteritumForm(preteritumToVerb, verbInfo.inf, verbInfo.person);
                if (pretForm && pretForm !== word && pretForm !== stripped) {
                  const fixCased = matchCase(ctx.tokens[j].display, pretForm);
                  findings.push({
                    rule_id: 'es-imperfecto-hint',
                    start: ctx.tokens[j].start,
                    end: ctx.tokens[j].end,
                    original: ctx.tokens[j].display,
                    fix: fixCased,
                    adverb: hit.adverb,
                    expectedAspect: 'preterito',
                    message: ctx.tokens[j].display + ' -> ' + fixCased + ' (adverb: ' + hit.adverb + ')',
                    severity: 'hint',
                  });
                }
                break; // Only flag first mismatched verb per adverb
              }
            } else {
              // Imperfecto adverb found — look for preterito verb forms
              const verbInfo = preteritumToVerb.get(word) || preteritumToVerb.get(stripped);
              if (verbInfo) {
                // Verb is preterito but adverb suggests imperfecto
                const impForm = imperfectoForms.get(verbInfo.inf + '|' + verbInfo.person);
                if (impForm && impForm !== word && impForm !== stripped) {
                  const fixCased = matchCase(ctx.tokens[j].display, impForm);
                  findings.push({
                    rule_id: 'es-imperfecto-hint',
                    start: ctx.tokens[j].start,
                    end: ctx.tokens[j].end,
                    original: ctx.tokens[j].display,
                    fix: fixCased,
                    adverb: hit.adverb,
                    expectedAspect: 'imperfecto',
                    message: ctx.tokens[j].display + ' -> ' + fixCased + ' (adverb: ' + hit.adverb + ')',
                    severity: 'hint',
                  });
                }
                break; // Only flag first mismatched verb per adverb
              }
            }
          }
        }
      }

      return findings;
    },
  };

  // Lazy forward map for preterito: inf+person -> form
  let _preteritoForward = null;
  function findPreteritumForm(preteritumToVerb, inf, person) {
    if (!_preteritoForward) {
      _preteritoForward = new Map();
      for (const [form, info] of preteritumToVerb) {
        const key = info.inf + '|' + info.person;
        if (!_preteritoForward.has(key)) {
          _preteritoForward.set(key, form);
        }
      }
    }
    return _preteritoForward.get(inf + '|' + person);
  }

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
