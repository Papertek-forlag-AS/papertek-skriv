/**
 * Spell-check rule: ES gustar-class syntax flagger (PRON-02, priority 60).
 *
 * Phase 12. Flags gustar-class verbs used without a preceding dative clitic.
 * Norwegian students transfer SVO structure ("El gusta ayudar") instead of
 * the required dative experiencer pattern ("Le gusta ayudar").
 *
 *   Wrong:   "El no gusta ayudar."  (missing dative clitic "le")
 *   Fix:     "A él no le gusta ayudar."
 *
 * Gustar-class verbs (gustar, encantar, interesar, importar, molestar, etc.)
 * require an indirect-object (dative) clitic: me, te, le, nos, os, les.
 *
 * Detection: find conjugated forms of gustar-class verbs, walk backward up to
 * 3 tokens looking for a dative clitic. If none found, flag.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { tokensInSentence } = core;

  function escapeHtml(s) {
    const fn = core.escapeHtml;
    if (fn) return fn(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Dative clitics that must precede gustar-class verbs.
  const DATIVE_CLITICS = new Set(['me', 'te', 'le', 'nos', 'os', 'les']);

  // Tokens allowed between dative clitic and verb (negation).
  const NEGATION_WORDS = new Set(['no', 'nunca', 'tampoco', 'ya']);

  // Phase 32-03: Spanish preposition/verb-form collisions. After gustar-class
  // expanded to include `sobrar` (Phase 32-03), the preteritum form `sobré`
  // accent-strips to `sobre` — which is also the very common preposition
  // "about". Without this guard, "Pienso sobre mi familia" would flag `sobre`
  // as a misconjugated gustar-class verb. Same risk for any future expansion:
  // `bastar` would collide with no real preposition but `costar` → `costo`
  // collides with the noun "costo" (none of these are gustar-class today).
  // This list is the closed set of Spanish prepositions that surface-collide
  // with gustar-class verb forms after accent-stripping.
  const PREPOSITION_COLLISIONS = new Set(['sobre', 'a', 'de', 'en', 'con', 'por', 'para']);

  // Subject pronouns that precede gustar-class verbs in wrong SVO pattern.
  // Map from pronoun (lowercase accent-stripped) to the appropriate dative clitic.
  const PRONOUN_TO_CLITIC = {
    yo: 'me',
    tu: 'te',
    el: 'le',
    ella: 'le',
    nosotros: 'nos',
    nosotras: 'nos',
    vosotros: 'os',
    vosotras: 'os',
    ellos: 'les',
    ellas: 'les',
    usted: 'le',
    ustedes: 'les',
  };

  // Phase 32-03: class membership + pedagogy now sourced from vocab.
  //   - ctx.vocab.gustarClassVerbs is built from verb_class: "gustar-class"
  //     markers on verbbank entries (lexical-entry-driven, not inline list).
  //   - ctx.vocab.gustarPedagogy is the shared grammarbank.pedagogy.gustar_class
  //     teaching block — surfaced via the "Lær mer" panel through explain().
  //
  // The pedagogy is cached at module scope on first check() call so explain()
  // can read it without a ctx (the explain-contract release gate calls
  // rule.explain(fakeFinding) outside any ctx). NOT attached to findings —
  // gustar-class is not a case-prep, so it would fail check-pedagogy-shape's
  // VALID_CASES validator. The "Lær mer" surface reads explain().pedagogy.
  let _cachedPedagogy = null;
  function getGustarVerbs(ctx) {
    if (ctx && ctx.vocab && ctx.vocab.gustarClassVerbs && ctx.vocab.gustarClassVerbs.size) {
      return ctx.vocab.gustarClassVerbs;
    }
    return new Set();
  }

  const rule = {
    id: 'es-gustar',
    languages: ['es'],
    priority: 60,
    // exam-audit 33-03: stays safe=false — Lær mer pedagogy popover (gustar-class verb_class) exceeds Chrome native parity
    exam: {
      safe: false,
      reason: "Stays safe=false (es-gustar) — Lær mer pedagogy popover (gustar-class verb_class) exceeds Chrome native parity",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      const original = finding.original || '';
      const fix = finding.fix || '';
      // Phase 32-03: pedagogy sourced from the module-level cache populated
      // on first check() call. Returns {nb, nn} short strings for the dot-
      // popover plus an optional `pedagogy` field for the "Lær mer" panel.
      // When the cache is empty (gate test path before any check() call),
      // we fall back to a summary baked from the inline catch-all string.
      const ped = _cachedPedagogy;
      const summaryNb = (ped && ped.summary && ped.summary.nb) || 'Gustar-klassen behandler tingen som subjekt og personen som dativ-klitikon (me/te/le/nos/os/les).';
      const summaryNn = (ped && ped.summary && ped.summary.nn) || 'Gustar-klassen handsamar tingen som subjekt og personen som dativ-klitikon (me/te/le/nos/os/les).';
      const out = {
        nb: 'Verbet <em>' + escapeHtml(original) + '</em> brukes med indirekte objekt (dativ) paa spansk: <em>' + escapeHtml(fix) + '</em>. ' + summaryNb,
        nn: 'Verbet <em>' + escapeHtml(original) + '</em> blir brukt med indirekte objekt (dativ) paa spansk: <em>' + escapeHtml(fix) + '</em>. ' + summaryNn,
        severity: 'warning',
      };
      if (ped) out.pedagogy = ped;
      return out;
    },
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      if (!ctx.sentences || !tokensInSentence) return [];

      const gustarVerbs = getGustarVerbs(ctx);
      if (!gustarVerbs.size) return [];

      // Phase 32-03: cache the shared pedagogy block on first run so explain()
      // (called by the popover surface, sometimes outside any ctx) can render
      // the "Lær mer" structured content without re-reading vocab.
      if (!_cachedPedagogy && ctx.vocab) {
        _cachedPedagogy = ctx.vocab.gustarPedagogy || (ctx.vocab.rulePedagogy && (ctx.vocab.rulePedagogy.get('gustar_class') || ctx.vocab.rulePedagogy.get('es-gustar')));
      }

      const presensToVerb = ctx.vocab && ctx.vocab.esPresensToVerb;
      const preteritumToVerb = ctx.vocab && ctx.vocab.esPreteritumToVerb;
      if ((!presensToVerb || !presensToVerb.size) &&
          (!preteritumToVerb || !preteritumToVerb.size)) return [];

      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        if (range.end - range.start < 2) continue;

        for (let i = range.start; i < range.end; i++) {
          const tokenWord = ctx.tokens[i].word; // lowercase
          const stripped = stripAccents(tokenWord);

          // Phase 32-03: skip surface forms that collide with common Spanish
          // prepositions. Prevents `sobre` (preposition) being misread as a
          // sobrar-class verb form (sobré → sobre after accent-strip).
          if (PREPOSITION_COLLISIONS.has(tokenWord) || PREPOSITION_COLLISIONS.has(stripped)) continue;

          // Check if this token is a conjugated form of a gustar-class verb
          let verbInfo = null;
          if (presensToVerb) {
            verbInfo = presensToVerb.get(tokenWord) || presensToVerb.get(stripped);
          }
          if (!verbInfo && preteritumToVerb) {
            verbInfo = preteritumToVerb.get(tokenWord) || preteritumToVerb.get(stripped);
          }
          if (!verbInfo) continue;
          if (!gustarVerbs.has(verbInfo.inf)) continue;

          // Found a gustar-class verb. Walk backward up to 3 tokens looking
          // for a dative clitic.
          let hasDative = false;
          const scanBack = Math.max(range.start, i - 3);
          for (let j = i - 1; j >= scanBack; j--) {
            const prevWord = ctx.tokens[j].word;
            const prevStripped = stripAccents(prevWord);
            if (DATIVE_CLITICS.has(prevWord) || DATIVE_CLITICS.has(prevStripped)) {
              hasDative = true;
              break;
            }
            // Allow negation words between clitic and verb
            if (NEGATION_WORDS.has(prevWord) || NEGATION_WORDS.has(prevStripped)) {
              continue;
            }
            // If we hit a non-negation, non-clitic word, keep looking back
            // (could be subject pronoun or article before the verb).
          }

          if (hasDative) continue;

          // No dative clitic found. Determine the appropriate clitic from
          // the preceding subject pronoun (if any).
          let clitic = 'le'; // default suggestion
          for (let j = i - 1; j >= scanBack; j--) {
            const prevWord = ctx.tokens[j].word;
            const prevStripped = stripAccents(prevWord);
            const mappedClitic = PRONOUN_TO_CLITIC[prevStripped];
            if (mappedClitic) {
              clitic = mappedClitic;
              break;
            }
          }

          const verbDisplay = ctx.tokens[i].display;
          const suggestion = clitic + ' ' + verbDisplay.toLowerCase();

          findings.push({
            rule_id: 'es-gustar',
            start: ctx.tokens[i].start,
            end: ctx.tokens[i].end,
            original: verbDisplay,
            fix: suggestion,
            message: verbDisplay + ' requires dative clitic: ' + suggestion,
            severity: 'warning',
            pedagogy: _cachedPedagogy,
          });
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
