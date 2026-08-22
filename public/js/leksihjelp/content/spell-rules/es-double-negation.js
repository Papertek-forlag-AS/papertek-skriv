/**
 * Spell-check rule: ES double-negation (NEG-01).
 *
 * Spanish requires a preverbal negator (no/ni/sin/tampoco/nunca…) when the
 * clause also carries a postverbal negative word (nada, nadie, nunca, jamás).
 * Norwegian and English use a single negation, so students drop the "no":
 *
 *   Flagged:  "Veo nada."        → "No veo nada."   (no preverbal negator)
 *   Flagged:  "Ella dice nada."  → "Ella no dice nada."
 *   OK:       "No veo nada."     (already negated)
 *   OK:       "Nada es imposible." (nada is the preverbal subject)
 *   OK:       "Más que nada…"    (idiom — nada not verb-adjacent)
 *
 * Precision-first: the candidate verb must be clause-initial OR immediately
 * preceded by a subject pronoun, the negative word must be the very next token
 * (only whitespace between), and NO preverbal negator may appear earlier in the
 * clause. This keeps idioms (de nada, para nada, más que nada, es como nada)
 * and preverbal-subject uses (nada/nunca + verb) out of scope.
 *
 * Logic-only: the verb membership/person comes from the shared es present +
 * preterite indexes (data lives in papertek-vocabulary). No hardcoded verbs.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { tokensInSentence } = core;

  function stripAccents(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  function lcFirst(s) {
    return s ? s[0].toLowerCase() + s.slice(1) : s;
  }

  // Postverbal negatives that REQUIRE a preverbal negator (accent-stripped).
  const NEG_WORDS = new Set(['nada', 'nadie', 'nunca', 'jamas']);
  // Any of these appearing before the verb means the clause is already
  // negated (or the negative word is the subject) — suppress.
  const PREVERBAL_NEGATORS = new Set([
    'no', 'ni', 'sin', 'tampoco', 'nunca', 'jamas',
    'nada', 'nadie', 'ninguno', 'ninguna', 'ningun',
  ]);
  // Subject pronouns that may legitimately sit between clause start and the verb.
  const SUBJECT_PRONOUNS = new Set([
    'yo', 'tu', 'el', 'ella', 'usted',
    'nosotros', 'nosotras', 'vosotros', 'vosotras',
    'ellos', 'ellas', 'ustedes',
  ]);

  const rule = {
    id: 'es-double-negation',
    languages: ['es'],
    priority: 23,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Sentence-level negative-concord syntax — exceeds Chrome native parity',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `På spansk må <em>no</em> stå foran verbet når setningen også har et nektende ord som <em>nada, nadie, nunca</em>. På norsk holder det med én nekting — derfor faller <em>no</em> lett bort. Skriv <em>${finding.fix}</em>.`,
      nn: `På spansk må <em>no</em> stå framfor verbet når setninga òg har eit nektande ord som <em>nada, nadie, nunca</em>. På norsk held det med éi nekting — difor fell <em>no</em> lett bort. Skriv <em>${finding.fix}</em>.`,
      en: `Spanish needs <em>no</em> before the verb when the clause also has a negative word like <em>nada, nadie, nunca</em>. Norwegian uses a single negation, so the <em>no</em> is easy to drop. Write <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      if (!ctx.sentences || !tokensInSentence) return [];
      const tokens = ctx.tokens;
      const text = ctx.text;
      const cursorPos = ctx.cursorPos;

      const presens = (ctx.vocab && ctx.vocab.esPresensToVerb) || null;
      const preterit = (ctx.vocab && ctx.vocab.esPreteritumToVerb) || null;
      if ((!presens || !presens.size) && (!preterit || !preterit.size)) return [];

      const isVerb = (w) => {
        const s = stripAccents(w);
        return !!((presens && (presens.get(w) || presens.get(s))) ||
                  (preterit && (preterit.get(w) || preterit.get(s))));
      };

      const out = [];
      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        const s = range.start, e = range.end;
        if (e - s < 2) continue;

        for (let v = s; v < e - 1; v++) {
          if (!isVerb(tokens[v].word)) continue;

          // Left context: clause-initial OR preceded by a subject pronoun.
          if (v > s) {
            const prev = stripAccents(tokens[v - 1].word);
            if (!SUBJECT_PRONOUNS.has(prev)) continue;
          }

          // Next token must be an immediately-adjacent postverbal negative.
          const n = v + 1;
          const negWord = stripAccents(tokens[n].word);
          if (!NEG_WORDS.has(negWord)) continue;
          const gap = text.slice(tokens[v].end, tokens[n].start);
          if (/[^ \t]/.test(gap)) continue;

          // No preverbal negator earlier in the clause.
          let alreadyNegated = false;
          for (let k = s; k < v; k++) {
            if (PREVERBAL_NEGATORS.has(stripAccents(tokens[k].word))) { alreadyNegated = true; break; }
          }
          if (alreadyNegated) continue;

          // Don't nag while the cursor is inside the verb the user is typing.
          if (cursorPos != null && cursorPos >= tokens[v].start && cursorPos <= tokens[v].end) continue;

          const orig = text.slice(tokens[v].start, tokens[v].end);
          const cap = orig[0] !== orig[0].toLowerCase();
          const fix = cap ? ('No ' + lcFirst(orig)) : ('no ' + orig);

          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: tokens[v].start,
            end: tokens[v].end,
            original: orig,
            fix,
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
