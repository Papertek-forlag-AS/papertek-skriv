/**
 * Spell-check rule: Norwegian å/og confusion detection (priority 15).
 *
 * The single most common writing error for Norwegian students:
 * - "og" used where "å" (infinitive marker) is needed
 * - "å" used where "og" (conjunction) is needed
 *
 * Handles posture-verb exceptions ("sitter og leser" is correct).
 *
 * Rule ID: 'aa_og'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase, escapeHtml } = core;

  // Verbs and adjectives that take an infinitive complement (X å gjøre).
  // When "og" appears between one of these and a verb form, it should be "å".
  const INFINITIVE_TRIGGERS = new Set([
    // Verbs (present + preteritum forms)
    'liker', 'likte', 'pleier', 'pleide', 'begynner', 'begynte',
    'prøver', 'prøvde', 'ønsker', 'ønsket', 'elsker', 'elsket',
    'hater', 'hatet', 'slutter', 'sluttet', 'fortsetter', 'fortsatte',
    'kommer', 'kom', 'lærer', 'lærte', 'trenger', 'trengte',
    'hjelper', 'hjalp', 'klarer', 'klarte', 'husker', 'husket',
    'nekter', 'nektet', 'nekta', 'håper', 'håpet', 'håpa',
    'forsøker', 'forsøkte', 'velger', 'valgte', 'bestemmer', 'bestemte',
    'lover', 'lovet', 'lova', 'glemmer', 'glemte',
    'gidder', 'gadd', 'orker', 'orket', 'orka',
    'våger', 'våget', 'våga', 'tør', 'turte', 'turde',
    'rekker', 'rakk',
    // Adjective/adverb triggers (det er X å gjøre)
    'godt', 'fint', 'viktig', 'vanskelig', 'lett', 'moro', 'gøy',
    'kjedelig', 'umulig', 'klart', 'farlig', 'trygt', 'morsomt',
    'enkelt', 'nødvendig', 'mulig', 'greit', 'dumt', 'lurt', 'rart', 'vanlig',
  ]);

  // Posture/motion verbs — "sitter og leser" is grammatically correct
  // (progressive aspect). Both NB and NN present + preteritum forms.
  const POSTURE_VERBS = new Set([
    // sitte
    'sitter', 'sit', 'satt', 'sat',
    // stå
    'står', 'staar', 'stod', 'sto',
    // ligge
    'ligger', 'ligg', 'lå', 'la', 'laag', 'låg',
    // gå
    'går', 'gikk', 'gjekk',
    // henge
    'henger', 'heng', 'hang', 'hengte',
  ]);

  // Tokens after "å" that indicate it should be "og" (conjunction, not infinitive marker).
  const PRONOUNS = new Set([
    'jeg', 'eg', 'du', 'han', 'hun', 'ho', 'vi', 'dere', 'de', 'dei', 'man',
  ]);
  const ARTICLES_POSSESSIVES = new Set([
    'en', 'ei', 'et', 'eit', 'den', 'det', 'de', 'dei',
    'min', 'mi', 'mitt', 'mine', 'din', 'di', 'ditt', 'dine',
    'vår', 'vårt', 'våre', 'hans', 'hennes', 'hennar', 'deres', 'deira',
  ]);
  const PREPOSITIONS = new Set(['i', 'på', 'med', 'til', 'fra', 'for', 'om', 'av', 'ut', 'inn', 'opp', 'ned']);

  const rule = {
    id: 'aa_og',
    languages: ['nb', 'nn'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (nb-aa-og) — Chrome native parity confirmed in 33-03 audit: NB å/og confusion is single-token typo lookup; Chrome native flags neither but fix is single-token",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `<strong>Å</strong> er infinitivsmerke (foran verb). <strong>Og</strong> er bindeord (binder like ledd). Bytt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `<strong>Å</strong> er infinitivsmerke (føre verb). <strong>Og</strong> er bindeord (bind like ledd). Byt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      const verbForms = vocab.verbForms || new Map();
      const validWords = vocab.validWords || new Set();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        const word = t.word.toLowerCase();
        const prev = i > 0 ? tokens[i - 1].word.toLowerCase() : null;
        const next = i < tokens.length - 1 ? tokens[i + 1].word.toLowerCase() : null;

        // ── Direction 1: "og" should be "å" ──
        if (word === 'og' && next && prev) {
          // Check posture verb exception first: V_posture + og + V → correct
          if (POSTURE_VERBS.has(prev)) continue;
          // Also check prev-prev for subject pronoun intervening: "hun sitter og leser"
          if (i > 1) {
            const prevPrev = tokens[i - 2].word.toLowerCase();
            if (POSTURE_VERBS.has(prevPrev) && PRONOUNS.has(prev)) continue;
          }

          // Check if next is a verb form and prev is an infinitive trigger.
          // V2-inversion case: "Om kvelden prøvde jeg og skrive" — the
          // subject pronoun (jeg) sits between trigger (prøvde) and og.
          // When prev is a pronoun, peek one further back for a trigger.
          const nextIsVerb = verbForms.has(next) || validWords.has('å ' + next);
          let triggerHit = INFINITIVE_TRIGGERS.has(prev);
          if (!triggerHit && PRONOUNS.has(prev) && i > 1) {
            const prevPrev = tokens[i - 2].word.toLowerCase();
            if (INFINITIVE_TRIGGERS.has(prevPrev)) triggerHit = true;
          }
          if (nextIsVerb && triggerHit) {
            out.push({
              rule_id: 'aa_og',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'å'),
              suggestions: [matchCase(t.display, 'å')],
              message: `Forveksling: "og" etter verb/adjektiv som tar infinitiv. Prøv "å".`,
            });
            if (suppressed) suppressed.add(i);
          }
        }

        // ── Direction 2: "å" should be "og" ──
        else if (word === 'å' && next) {
          // Sentence-initial "å" + verb → valid infinitive marker ("Å lese er gøy")
          if (i === 0) {
            const nextIsVerb = verbForms.has(next) || validWords.has('å ' + next);
            if (nextIsVerb) continue;
          }

          // If "å" is followed by a verb, it's a valid infinitive marker — skip
          const nextIsVerb = verbForms.has(next) || validWords.has('å ' + next);
          if (nextIsVerb) continue;

          // "å" followed by article, pronoun, or preposition → likely "og"
          if (ARTICLES_POSSESSIVES.has(next) || PRONOUNS.has(next) || PREPOSITIONS.has(next)) {
            out.push({
              rule_id: 'aa_og',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'og'),
              suggestions: [matchCase(t.display, 'og')],
              message: `Forveksling: "å" foran ikke-verb. Prøv "og".`,
            });
            if (suppressed) suppressed.add(i);
            continue;
          }

          // "å" between two non-verb words (noun å noun pattern like "kaffe å kake")
          if (prev && !verbForms.has(prev) && !validWords.has('å ' + prev) &&
              !INFINITIVE_TRIGGERS.has(prev) && !POSTURE_VERBS.has(prev)) {
            // prev is not a verb, next is not a verb → coordinate structure
            out.push({
              rule_id: 'aa_og',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'og'),
              suggestions: [matchCase(t.display, 'og')],
              message: `Forveksling: "å" mellom to ikke-verb. Prøv "og".`,
            });
            if (suppressed) suppressed.add(i);
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
