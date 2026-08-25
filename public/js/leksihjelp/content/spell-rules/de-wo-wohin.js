/**
 * Spell-check rule: German wo (location) vs wohin (direction) confusion
 * (de-wo-wohin, priority 23).
 *
 * Norwegian uses "hvor" for both location (where) and direction (where to).
 * German distinguishes:
 *   • wo     — asks about a LOCATION (static situation, dative context)
 *   • wohin  — asks about a DIRECTION or DESTINATION (motion, accusative context)
 *
 * This rule detects mismatches between the question word and the verb's
 * movement/location class, using the same stative/motion verb heuristic
 * as de-wechselpraep:
 *
 *   "Wo gehst du?"      → verb gehen is directional → should be "Wohin"
 *   "Wohin wohnst du?"  → verb wohnen is stative    → should be "Wo"
 *
 * 'kommen' is deliberately excluded from the motion set here — "Wo kommst du
 * her?" (where do you come from?) is correct German and would be a false
 * positive if kommen triggered a wohin suggestion.
 *
 * Verb-class constants and scan logic copied from de-wechselpraep.js.
 *
 * Rule ID: 'de-wo-wohin'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Stative — asks WHERE someone/something IS.
  const STATIVE_INF = new Set([
    'sein', 'bleiben', 'stehen', 'liegen', 'sitzen', 'wohnen', 'leben',
    'arbeiten', 'lernen', 'studieren', 'warten', 'schlafen', 'stattfinden',
    'spielen', 'essen', 'kochen', 'lesen', 'schreiben',
  ]);
  // Motion / directional — asks WHERE TO.
  // Note: 'kommen' excluded — "Wo kommst du her?" is correct.
  const MOTION_INF = new Set([
    'gehen', 'fahren', 'laufen', 'rennen', 'fliegen', 'reisen',
    'steigen', 'springen', 'fallen', 'klettern', 'ziehen', 'bringen', 'tragen',
  ]);
  const SEIN_FORMS = new Set([
    'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart',
  ]);
  const CLAUSE_STOP = new Set(['und', 'oder', 'aber', 'sondern', 'denn']);

  function verbClass(word, verbInf) {
    if (SEIN_FORMS.has(word)) return 'stative';
    const inf = (verbInf && verbInf.get(word)) || word;
    if (STATIVE_INF.has(inf)) return 'stative';
    if (MOTION_INF.has(inf)) return 'motion';
    return null;
  }

  const rule = {
    id: 'de-wo-wohin',
    languages: ['de'],
    priority: 23,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Grammar hint — question word direction vs location; semantic check',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      if (!finding) {
        return {
          nb: 'Bruk wo for plassering (dativ) og wohin for retning/bevegelse (akkusativ).',
          nn: 'Bruk wo for plassering (dativ) og wohin for retning/rørsle (akkusativ).',
          en: 'Use wo for location (dative) and wohin for direction/motion (accusative).',
        };
      }
      const orig = esc(finding.original);
      const fix  = esc(finding.fix || '');
      const verb = finding.verb ? ` (<em>${esc(finding.verb)}</em>)` : '';

      if (finding.expectedClass === 'motion') {
        return {
          nb: `Verbet${verb} uttrykker bevegelse mot et mål → bruk <strong>${fix}</strong> (retning), ikke <em>${orig}</em> (plassering).`,
          nn: `Verbet${verb} uttrykkjer rørsle mot eit mål → bruk <strong>${fix}</strong> (retning), ikkje <em>${orig}</em> (plassering).`,
          en: `The verb${verb} expresses motion toward a destination → use <strong>${fix}</strong> (direction), not <em>${orig}</em> (location).`,
        };
      }
      return {
        nb: `Verbet${verb} uttrykker plassering/tilstand → bruk <strong>${fix}</strong> (plassering), ikke <em>${orig}</em> (retning).`,
        nn: `Verbet${verb} uttrykkjer plassering/tilstand → bruk <strong>${fix}</strong> (plassering), ikkje <em>${orig}</em> (retning).`,
        en: `The verb${verb} expresses location/state → use <strong>${fix}</strong> (location), not <em>${orig}</em> (direction).`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, sentences } = ctx;
      if (!tokens || !sentences) return [];
      const vocab = ctx.vocab || {};
      const verbInf = vocab.verbInfinitive instanceof Map ? vocab.verbInfinitive : null;
      const out = [];

      const tokensInSentence = (s) => {
        let first = tokens.findIndex(t => t.start >= s.start);
        if (first === -1) return [0, 0];
        let last = first;
        while (last < tokens.length && tokens[last].end <= s.end) last++;
        return [first, last];
      };

      for (const sentence of sentences) {
        const [sStart, sEnd] = tokensInSentence(sentence);
        for (let i = sStart; i < sEnd; i++) {
          const qTok = tokens[i];
          const isWo    = qTok.word === 'wo';
          const isWohin = qTok.word === 'wohin';
          if (!isWo && !isWohin) continue;

          if (cursorPos != null && cursorPos >= qTok.start && cursorPos <= qTok.end) continue;

          // Forward scan for the first classified verb in the clause.
          let vClass = null;
          let verbDisplay = null;
          for (let k = i + 1; k < sEnd; k++) {
            if (CLAUSE_STOP.has(tokens[k].word)) break;
            if (k > i + 1) {
              const gap = ctx.text ? ctx.text.slice(tokens[k - 1].end, tokens[k].start) : '';
              if (/[,;:.]/.test(gap)) break;
            }
            const c = verbClass(tokens[k].word, verbInf);
            if (c) { vClass = c; verbDisplay = tokens[k].display; break; }
          }

          if (!vClass) continue;

          // wo + motion verb → should be wohin
          if (isWo && vClass === 'motion') {
            const fix = qTok.display.charAt(0) === qTok.display.charAt(0).toUpperCase() &&
                        qTok.display.charAt(0) !== qTok.display.charAt(0).toLowerCase()
              ? 'Wohin' : 'wohin';
            out.push({
              rule_id: rule.id,
              priority: rule.priority,
              start: qTok.start,
              end: qTok.end,
              original: qTok.display,
              fix,
              verb: verbDisplay,
              expectedClass: 'motion',
            });
          }

          // wohin + stative verb → should be wo
          if (isWohin && vClass === 'stative') {
            const fix = qTok.display.charAt(0) === qTok.display.charAt(0).toUpperCase() &&
                        qTok.display.charAt(0) !== qTok.display.charAt(0).toLowerCase()
              ? 'Wo' : 'wo';
            out.push({
              rule_id: rule.id,
              priority: rule.priority,
              start: qTok.start,
              end: qTok.end,
              original: qTok.display,
              fix,
              verb: verbDisplay,
              expectedClass: 'stative',
            });
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
