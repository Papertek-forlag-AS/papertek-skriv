/**
 * Spell-check rule: German nominative personal pronoun after a Wechselpräposition
 * (de-wechsel-prep-pronoun, priority 22).
 *
 * The nine two-way prepositions (in, an, auf, über, unter, vor, hinter, neben,
 * zwischen) take accusative for direction/motion and dative for location/state.
 * A nominative pronoun after any of them is always wrong — but which case to
 * suggest depends on the same verb-class heuristic as de-wechselpraep:
 *
 *   Stative verb (sein, sitzen, liegen, …) + Wechselpräp + nominative pronoun
 *     → location context → dative form:
 *       "Ich sitze neben er."  → "Ich sitze neben ihm."
 *
 *   Put verb (stellen, legen, setzen, stecken) + Wechselpräp + nominative pronoun
 *     → placement context → accusative form:
 *       "Ich stelle es vor er."  → "Ich stelle es vor ihn."
 *
 *   Motion/ambiguous verb or no classifiable verb → flag the nominative error
 *     but emit no specific fix (explain both options in Lær mer).
 *
 * Special case: wir → uns is the same in both dative and accusative, so "uns"
 * is always suggested regardless of verb context.
 *
 * Skipped pronouns:
 *   • ihr  — also the correct dative form of 'sie' (she): "neben ihr" is valid
 *   • sie, es — accusative = nominative; no reliable error signal
 *
 * Verb-class constants and clause-boundary scan copied from de-wechselpraep.js
 * to keep rules self-contained.
 *
 * Rule ID: 'de-wechsel-prep-pronoun'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  const WECHSEL = new Set([
    'in', 'an', 'auf', 'über', 'unter', 'vor', 'hinter', 'neben', 'zwischen',
  ]);

  // Verb classification — identical to de-wechselpraep.js.
  // 'hängen' deliberately excluded (Wechsel-ambiguous).
  const STATIVE_INF = new Set([
    'sein', 'bleiben', 'stehen', 'liegen', 'sitzen', 'wohnen', 'leben',
    'arbeiten', 'lernen', 'studieren', 'warten', 'schlafen', 'stattfinden',
    'spielen', 'essen', 'kochen', 'lesen', 'schreiben',
  ]);
  const PUT_INF = new Set(['stellen', 'legen', 'setzen', 'stecken']);
  const MOTION_INF = new Set([
    'gehen', 'fahren', 'kommen', 'laufen', 'rennen', 'fliegen', 'reisen',
    'steigen', 'springen', 'fallen', 'klettern', 'ziehen', 'bringen', 'tragen',
  ]);
  const SEIN_FORMS = new Set([
    'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart',
  ]);

  function verbClass(word, verbInf) {
    if (SEIN_FORMS.has(word)) return 'stative';
    const inf = (verbInf && verbInf.get(word)) || word;
    if (STATIVE_INF.has(inf)) return 'stative';
    if (PUT_INF.has(inf)) return 'put';
    if (MOTION_INF.has(inf)) return 'motion';
    return null;
  }

  // Nominative → {dat, acc}. Only pronouns where nominative ≠ both object forms.
  // wir→uns is identical for both cases; canAlwaysFix handles this below.
  const NOM_PRONOUNS = new Map([
    ['ich', { dat: 'mir',  acc: 'mich' }],
    ['du',  { dat: 'dir',  acc: 'dich' }],
    ['er',  { dat: 'ihm',  acc: 'ihn'  }],
    ['wir', { dat: 'uns',  acc: 'uns'  }],
  ]);

  const CLAUSE_COORD = new Set(['und', 'oder', 'aber', 'sondern', 'denn']);

  const rule = {
    id: 'de-wechsel-prep-pronoun',
    languages: ['de'],
    priority: 22,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Grammar hint — Wechselpräposition pronoun case; semantic check, not spellcheck',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      if (!finding || !finding.original) {
        return {
          nb: 'Personlig pronomen i feil kasus etter wechselpreposisjon.',
          nn: 'Personleg pronomen i feil kasus etter wechselpreposisjon.',
          en: 'Personal pronoun in wrong case after a two-way preposition.',
        };
      }
      const prep = finding.prep ? `<em>${esc(finding.prep)}</em>` : 'preposisjonen';
      const orig = esc(finding.original);
      const fix  = esc(finding.fix || '');
      const datFix = esc(finding.datFix || '');
      const accFix = esc(finding.accFix || '');

      if (finding.expectedCase === 'dativ') {
        return {
          nb: `${prep} er en wechselpreposisjon. Verbet tyder på <strong>plassering (dativ)</strong> — prøv <em>${fix}</em> i stedet for <em>${orig}</em>.`,
          nn: `${prep} er ein wechselpreposisjon. Verbet tyder på <strong>plassering (dativ)</strong> — prøv <em>${fix}</em> i staden for <em>${orig}</em>.`,
          en: `${prep} is a two-way preposition. The verb suggests <strong>location (dative)</strong> — try <em>${fix}</em> instead of <em>${orig}</em>.`,
        };
      }
      if (finding.expectedCase === 'akkusativ') {
        return {
          nb: `${prep} er en wechselpreposisjon. Verbet tyder på <strong>bevegelse (akkusativ)</strong> — prøv <em>${fix}</em> i stedet for <em>${orig}</em>.`,
          nn: `${prep} er ein wechselpreposisjon. Verbet tyder på <strong>rørsle (akkusativ)</strong> — prøv <em>${fix}</em> i staden for <em>${orig}</em>.`,
          en: `${prep} is a two-way preposition. The verb suggests <strong>direction (accusative)</strong> — try <em>${fix}</em> instead of <em>${orig}</em>.`,
        };
      }
      // No verb context — explain both options.
      return {
        nb: `${prep} er en wechselpreposisjon. <em>${orig}</em> er subjektsform — bruk objektsform. Er det <strong>bevegelse</strong> (akkusativ: <em>${accFix}</em>) eller <strong>plassering</strong> (dativ: <em>${datFix}</em>)?`,
        nn: `${prep} er ein wechselpreposisjon. <em>${orig}</em> er subjektsform — bruk objektsform. Er det <strong>rørsle</strong> (akkusativ: <em>${accFix}</em>) eller <strong>plassering</strong> (dativ: <em>${datFix}</em>)?`,
        en: `${prep} is a two-way preposition. <em>${orig}</em> is the subject form — use an object form. Is it <strong>direction</strong> (accusative: <em>${accFix}</em>) or <strong>location</strong> (dative: <em>${datFix}</em>)?`,
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
          if (!WECHSEL.has(tokens[i].word)) continue;
          const prepTok = tokens[i];

          // Check if the immediately following token is a nominative pronoun.
          const ni = i + 1;
          if (ni >= sEnd) continue;
          const t = tokens[ni];
          const pronForms = NOM_PRONOUNS.get(t.word);
          if (!pronForms) continue;

          if (cursorPos != null) {
            if (cursorPos >= t.start    && cursorPos <= t.end)    continue;
            if (cursorPos >= prepTok.start && cursorPos <= prepTok.end) continue;
          }

          // Nearest classified verb before the preposition, same-clause only
          // (identical clause-boundary logic to de-wechselpraep.js).
          let vClass = null;
          let sawSich = false;
          for (let k = i - 1; k >= sStart; k--) {
            if (CLAUSE_COORD.has(tokens[k].word)) break;
            if (k < i) {
              const between = ctx.text ? ctx.text.slice(tokens[k].end, tokens[k + 1].start) : '';
              if (/[,;:]/.test(between)) break;
            }
            if (tokens[k].word === 'sich') sawSich = true;
            const c = verbClass(tokens[k].word, verbInf);
            if (c) { vClass = c; break; }
          }
          // Reflexive verb with prepositional government has fixed case — skip.
          if (sawSich) continue;

          // wir→uns is identical in both cases: always fixable.
          const canAlwaysFix = pronForms.dat === pronForms.acc;

          let expectedCase = null;
          let fix = canAlwaysFix ? pronForms.dat : null;
          if (vClass === 'stative') {
            expectedCase = 'dativ';
            fix = pronForms.dat;
          } else if (vClass === 'put') {
            expectedCase = 'akkusativ';
            fix = pronForms.acc;
          }
          // motion or no verb → fix remains null; explain() shows both options.

          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: t.start,
            end: t.end,
            original: t.display,
            fix: fix || null,
            prep: prepTok.display,
            expectedCase,
            // Extra fields for the "no verb context" explain branch:
            datFix: pronForms.dat,
            accFix: pronForms.acc,
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
