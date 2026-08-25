/**
 * Spell-check rule: German "nach Hause" (going home) vs "zu Hause" (being at home)
 * (de-nach-hause, priority 24).
 *
 * Norwegian uses a single word "hjem" (or "hjemme") for both the motion toward
 * home and the static state of being home. German distinguishes:
 *   • nach Hause — direction, motion toward home (accusative idiom)
 *   • zu Hause   — location, being/staying at home (dative idiom)
 *
 * This rule detects the mismatch using the same stative/motion verb heuristic
 * as de-wechselpraep and de-wo-wohin:
 *
 *   "Ich gehe zu Hause."    → verb gehen is motion → should be "nach Hause"
 *   "Ich fahre zu Hause."   → verb fahren is motion → should be "nach Hause"
 *   "Ich bin nach Hause."   → verb sein is stative  → should be "zu Hause"
 *   "Ich bleibe nach Hause."→ verb bleiben is stative → should be "zu Hause"
 *
 * 'kommen' is excluded from the motion set — "Ich komme nach Hause"
 * (I am coming home) is correct German and must not fire.
 *
 * Detection: find "zu Hause" or "nach Hause" as two adjacent tokens, then
 * backward-scan for the nearest classified verb in the same sentence.
 * The finding spans both tokens [prep.start, Hause.end] and replaces the
 * whole phrase ("zu Hause" → "nach Hause" or vice versa).
 *
 * Rule ID: 'de-nach-hause'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  const STATIVE_INF = new Set([
    'sein', 'bleiben', 'stehen', 'liegen', 'sitzen', 'wohnen', 'leben',
    'arbeiten', 'lernen', 'studieren', 'warten', 'schlafen', 'stattfinden',
    'spielen', 'essen', 'kochen', 'lesen', 'schreiben',
  ]);
  // 'kommen' excluded — "Ich komme nach Hause" is correct.
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
    id: 'de-nach-hause',
    languages: ['de'],
    priority: 24,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Grammar hint — directional vs locative idiom; semantic check',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      const orig = esc(finding && finding.original || '');
      const fix  = esc(finding && finding.fix || '');
      const verb = finding && finding.verb ? ` (<em>${esc(finding.verb)}</em>)` : '';

      if (finding && finding.expectedClass === 'motion') {
        return {
          nb: `Verbet${verb} uttrykker bevegelse <em>mot</em> hjemsted → bruk <strong>${fix}</strong> (retning), ikke <em>${orig}</em> (plassering).`,
          nn: `Verbet${verb} uttrykkjer rørsle <em>mot</em> heimstad → bruk <strong>${fix}</strong> (retning), ikkje <em>${orig}</em> (plassering).`,
          en: `The verb${verb} expresses motion <em>toward</em> home → use <strong>${fix}</strong> (direction), not <em>${orig}</em> (location).`,
        };
      }
      return {
        nb: `Verbet${verb} uttrykker plassering/tilstand <em>hjemme</em> → bruk <strong>${fix}</strong> (plassering), ikke <em>${orig}</em> (retning).`,
        nn: `Verbet${verb} uttrykkjer plassering/tilstand <em>heime</em> → bruk <strong>${fix}</strong> (plassering), ikkje <em>${orig}</em> (retning).`,
        en: `The verb${verb} expresses being/staying <em>at</em> home → use <strong>${fix}</strong> (location), not <em>${orig}</em> (direction).`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, text, sentences } = ctx;
      if (!tokens || !text || !sentences) return [];
      const vocab = ctx.vocab || {};
      const verbInf = vocab.verbInfinitive instanceof Map ? vocab.verbInfinitive : null;
      const out = [];

      const sentenceOf = (tok) => sentences.find(s => tok.start >= s.start && tok.end <= s.end);

      for (let i = 0; i < tokens.length - 1; i++) {
        const prepTok  = tokens[i];
        const hauseTok = tokens[i + 1];

        const isZuHause   = prepTok.word === 'zu'   && hauseTok.word === 'hause';
        const isNachHause = prepTok.word === 'nach'  && hauseTok.word === 'hause';
        if (!isZuHause && !isNachHause) continue;

        // Hause must start uppercase (it is a dative noun, not an adverb variant)
        if (hauseTok.display.charAt(0).toLowerCase() === hauseTok.display.charAt(0)) continue;

        if (cursorPos != null &&
            cursorPos >= prepTok.start && cursorPos <= hauseTok.end) continue;

        // Backward scan for the nearest classified verb in the same sentence.
        const sent = sentenceOf(prepTok);
        let vClass = null;
        let verbDisplay = null;

        for (let k = i - 1; k >= 0; k--) {
          const tok = tokens[k];
          if (sent && tok.start < sent.start) break;
          if (CLAUSE_STOP.has(tok.word)) break;
          const gap = text.slice(tok.end, tokens[k + 1].start);
          if (/[,;:.]/.test(gap)) break;
          const c = verbClass(tok.word, verbInf);
          if (c) { vClass = c; verbDisplay = tok.display; break; }
        }

        if (!vClass) continue;

        // Perfect-tense bracket (Ordbank sweep 2026-07): sein is the perfect
        // AUXILIARY of motion verbs — "Wir sind nach Hause gegangen" was
        // classified stative off "sind" and mis-flagged toward "zu Hause".
        // When the backward verb is a sein-form, forward-scan for a motion
        // participle; if found, the clause is motion.
        if (vClass === 'stative' && SEIN_FORMS.has(verbDisplay && verbDisplay.toLowerCase())) {
          for (let k = i + 2; k < tokens.length; k++) {
            const tok = tokens[k];
            if (sent && tok.end > sent.end) break;
            if (CLAUSE_STOP.has(tok.word)) break;
            const gap = text.slice(tokens[k - 1].end, tok.start);
            if (/[,;:.]/.test(gap) && k > i + 2) break;
            const inf = (verbInf && verbInf.get(tok.word)) || null;
            if (inf && MOTION_INF.has(inf)) { vClass = 'motion'; verbDisplay = tok.display; break; }
          }
        }

        const originalText = text.slice(prepTok.start, hauseTok.end);

        // "zu Hause" + motion verb → should be "nach Hause"
        if (isZuHause && vClass === 'motion') {
          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: prepTok.start,
            end: hauseTok.end,
            original: originalText,
            fix: 'nach Hause',
            verb: verbDisplay,
            expectedClass: 'motion',
          });
        }

        // "nach Hause" + stative verb → should be "zu Hause"
        if (isNachHause && vClass === 'stative') {
          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: prepTok.start,
            end: hauseTok.end,
            original: originalText,
            fix: 'zu Hause',
            verb: verbDisplay,
            expectedClass: 'stative',
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
