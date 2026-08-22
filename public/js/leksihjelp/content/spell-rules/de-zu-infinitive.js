/**
 * Spell-check rule: missing "zu" before an infinitive after a zu-governing
 * verb (de-zu-infinitive, priority 26).
 *
 * In German, a class of verbs (versuchen, hoffen, planen, versprechen,
 * beginnen, beschließen) require "zu + Infinitiv" for their complement.
 * Norwegian students omit the "zu" by analogy with Norwegian bare-infinitive
 * constructions ("prøve å lære" → "versuchen zu lernen", not "versuchen lernen").
 *
 * Detection:
 *   1. Find a token that maps (via verbInfinitive) to a zu-governing verb.
 *   2. Scan forward in the same clause for the first infinitive token.
 *   3. If "zu" was seen before the infinitive → no error.
 *   4. If infinitive found WITHOUT preceding "zu" → flag the infinitive,
 *      fix = "zu " + infinitive.display.
 *
 * Clause boundary stops: CLAUSE_COORD tokens (und/oder/aber/sondern/denn)
 * OR a comma/semicolon/colon/period in the inter-token gap. This means
 * "Ich versuche, gut zu lernen." (comma → stop → no fire) is correctly
 * skipped, and so is "Ich versuche gut zu lernen." (zu found → no fire).
 *
 * Infinitive detection: token.word ends in "-en", length > 3, display
 * starts lowercase (rules out noun use "Lernen ist wichtig"), AND the
 * verbInfinitive map resolves the word to itself (= it IS the infinitive
 * form) or the word itself ends in -en with no verbInfinitive contradiction.
 *
 * Excluded: separable-prefix zu (anfangen → "anzufangen") — the interposed
 * prefix makes detection unreliable without full morphology; these verbs
 * are NOT in ZU_VERB_INF.
 *
 * Rule ID: 'de-zu-infinitive'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Verbs that require zu + Infinitiv. Non-separable only; separable
  // verbs (anfangen, aufhören, vorhaben) need prefix-interposed "zu"
  // which requires morphological decomposition — excluded here.
  const ZU_VERB_INF = new Set([
    'versuchen', 'hoffen', 'planen', 'versprechen', 'beginnen', 'beschließen', 'vergessen',
  ]);

  const CLAUSE_STOP = new Set(['und', 'oder', 'aber', 'sondern', 'denn']);

  // Nominative subject pronouns — signal a finite (dass-less V2) complement
  // clause after the matrix verb ("Ich hoffe wir fliegen"), where no zu belongs.
  const SUBJ_PRONOUNS = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man']);

  // Separable prefixes: if the complement infinitive starts with one of
  // these, the correct "zu" form is interposed (ab-zu-fahren, an-zu-rufen),
  // which requires morphological decomposition. Skip those to avoid
  // suggesting the wrong "zu anrufen" instead of "anzurufen".
  const SEP_PREFIXES = [
    'ab','an','auf','aus','bei','durch','ein','fest','her','hin',
    'los','mit','nach','vor','weg','weiter','zu','zurück','zusammen',
  ];
  function isSeparable(word) {
    return SEP_PREFIXES.some(p => word.startsWith(p) && word.length > p.length + 2);
  }

  function isZuVerb(word, verbInf) {
    const inf = (verbInf && verbInf.get(word)) || word;
    return ZU_VERB_INF.has(inf);
  }

  function isInfinitive(tok, verbInf) {
    // Uppercase first char → noun use ("Das Lernen ist wichtig") — skip.
    const first = tok.display.charAt(0);
    if (first === first.toUpperCase() && first !== first.toLowerCase()) return false;
    if (tok.word.length <= 3) return false;
    if (!tok.word.endsWith('en')) return false;
    // Confirm via verbInfinitive. Ordbank sweep 2026-07: require a POSITIVE
    // match — unknown -en words ("morgen" the adverb) used to slip through
    // and produce "zu morgen". Infinitives are map VALUES (keys are the
    // conjugated forms), so test membership in the value set (cached).
    if (verbInf) {
      const mapped = verbInf.get(tok.word);
      if (mapped && mapped !== tok.word) return false; // conjugated form
      if (isInfinitive.__src !== verbInf) {
        isInfinitive.__src = verbInf;
        isInfinitive.__set = new Set(verbInf.values());
      }
      return isInfinitive.__set.has(tok.word);
    }
    return true;
  }

  const rule = {
    id: 'de-zu-infinitive',
    languages: ['de'],
    priority: 26,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Grammar hint — zu + Infinitiv construction; semantic, not a spelling error',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      const verb = finding && finding.zuVerb ? `<em>${esc(finding.zuVerb)}</em>` : 'dette verbet';
      const inf  = finding && finding.infinitive ? `<em>${esc(finding.infinitive)}</em>` : 'infinitiven';
      return {
        nb: `Etter ${verb} krever tysk <em>zu</em> foran infinitiven: «… zu ${esc(finding && finding.infinitive || '')}». På norsk bruker vi «å», men ${verb} krever «zu + infinitiv», ikke bare infinitiv.`,
        nn: `Etter ${verb} krev tysk <em>zu</em> framfor infinitiven: «… zu ${esc(finding && finding.infinitive || '')}». På norsk brukar vi «å», men ${verb} krev «zu + infinitiv», ikkje berre infinitiv.`,
        en: `After ${verb}, German requires <em>zu</em> before the infinitive: «… zu ${esc(finding && finding.infinitive || '')}». Norwegian uses «å», but ${verb} requires «zu + infinitive», not a bare infinitive.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, text } = ctx;
      if (!tokens || tokens.length < 2 || !text) return [];
      const vocab = ctx.vocab || {};
      const verbInf = vocab.verbInfinitive instanceof Map ? vocab.verbInfinitive : null;
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const zuTok = tokens[i];
        if (!isZuVerb(zuTok.word, verbInf)) continue;

        // Forward scan for the first infinitive in the same clause.
        let sawZu = false;
        let found = false;

        for (let k = i + 1; k < tokens.length; k++) {
          // Clause coordinator → stop.
          if (CLAUSE_STOP.has(tokens[k].word)) break;

          // Comma/semicolon/colon/period in gap → stop.
          const gap = text.slice(tokens[k - 1].end, tokens[k].start);
          if (/[,;:.]/.test(gap)) break;

          // Subject pronoun after the matrix verb opens a FINITE complement
          // clause ("Ich hoffe wir fliegen" — dass-less V2 complement, no zu):
          // "fliegen" there agrees with "wir", it isn't a bare infinitive.
          if (SUBJ_PRONOUNS.has(tokens[k].word)) break;

          if (tokens[k].word === 'zu') { sawZu = true; continue; }

          if (!isInfinitive(tokens[k], verbInf)) continue;
          if (isSeparable(tokens[k].word)) break; // interposed zu needed — can't auto-fix

          // Found an infinitive.
          if (sawZu) break; // "zu" already present — correct

          // Missing "zu" before infinitive.
          const infTok = tokens[k];
          if (cursorPos != null && cursorPos >= infTok.start && cursorPos <= infTok.end) break;

          const zuVerbInf = (verbInf && verbInf.get(zuTok.word)) || zuTok.word;
          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: infTok.start,
            end: infTok.end,
            original: infTok.display,
            fix: 'zu ' + infTok.display,
            zuVerb: zuVerbInf,
            infinitive: infTok.display,
          });
          found = true;
          break;
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
