/**
 * Spell-check rule: Norwegian anglicism loan-verb detector (priority 45).
 *
 * Flags Norwegianised English loan-verbs (e.g. "downloade", "chiller",
 * "streamet") and suggests idiomatic Norwegian alternatives. The rule
 * strips Norwegian verb suffixes (-e, -er, -et, -a, -ing, -inga) to
 * find the English stem, then looks it up in a curated Map.
 *
 * Severity: hint (stylistic, not grammatical).
 *
 * Rule ID: 'nb-anglicism'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // The stem → { inf, past, present } map is now data-driven: it comes from the
  // curated anglicismbank in papertek-vocabulary, built into ctx.vocab.anglicismMap
  // by the seam (verb entries only). No inline word list — single source of truth.
  // Resolved per-call from ctx so the bank is the only place the list lives.

  // Norwegian verb suffixes to strip, longest first.
  const SUFFIXES = ['inga', 'ing', 'er', 'et', 'en', 'ar', 'a', 'e'];
  // Past-tense suffixes — when matched, suggest the past form.
  const PAST_SUFFIXES = new Set(['et', 'a']);
  // Present-tense suffixes. Bokmål marks present with -er, nynorsk with -ar
  // (and -er for e-verbs). The seam has carried `present` all along and the
  // rule never read it, so «Vi boostar innlegget» was answered with the
  // infinitive «forsterke» — a suggestion the student cannot paste into the
  // sentence they are writing. -a stays PAST: it is the nynorsk preterite
  // («chatta»), and the past branch is tried first.
  const PRESENT_SUFFIXES = new Set(['er', 'ar']);

  // Determiners + possessives that establish a nominal context. When the
  // token at i-1 (or i-2 for "den/det + adj + N") is one of these, the
  // candidate token is most plausibly a noun form, not a verb — even if
  // its surface matches an anglicism stem-plus-suffix pattern. Without
  // this guard, every loanword that has a noun reading but no NB nominal
  // entry in the lexicon (data gap) gets a verb anglicism suggestion
  // (e.g. "gamet" → "spilte" for "the game"). The guard is bilingual
  // NB+NN; both share the same articles.
  const NOMINAL_PRECEDERS = new Set([
    // Articles + demonstratives
    'en', 'et', 'ei', 'ein', 'eit', 'den', 'det', 'denne', 'dette', 'disse', 'desse', 'dei',
    // Possessives — singular + plural across NB+NN
    'min', 'mi', 'mitt', 'mine', 'din', 'di', 'ditt', 'dine',
    'sin', 'si', 'sitt', 'sine', 'vår', 'vårt', 'våre',
    'hans', 'hennes', 'hennar', 'deres',
    // Quantifiers commonly preceding nouns
    'noen', 'nokon', 'noko', 'nokre', 'mange', 'få', 'all', 'alle', 'hver', 'kvar',
  ]);

  function stripSuffix(word) {
    for (const suf of SUFFIXES) {
      if (word.length > suf.length && word.endsWith(suf)) {
        return { stem: word.slice(0, -suf.length), suffix: suf };
      }
    }
    return null;
  }

  const rule = {
    id: 'nb-anglicism',
    languages: ['nb', 'nn'],
    // priority 45: between typo-curated (40) and typo-fuzzy (50). Wins
    // dedupeOverlapping over typo-fuzzy when an anglicism stem matches —
    // without this, "chille" gets typo's wrong "Chile" guess kept.
    priority: 45,
    exam: {
      safe: true,
      reason: "Single-token curated lookup — same complexity class as typo-curated",
      category: "spellcheck",
    },
    severity: 'hint',
    explain: (finding) => ({
      nb: `<em>${escapeHtml(finding.original)}</em> er et engelsk lånord. Et norsk alternativ er <em>${escapeHtml(finding.fix)}</em> — men dette er bare et tips, du velger selv.`,
      nn: `<em>${escapeHtml(finding.original)}</em> er eit engelsk lånord. Eit norsk alternativ er <em>${escapeHtml(finding.fix)}</em> — men dette er berre eit tips, du vel sjølv.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      // Data-driven: the anglicism list lives in the papertek anglicismbank,
      // surfaced as ctx.vocab.anglicismMap by the seam. Silent if absent.
      const ANGLICISMS = (vocab && vocab.anglicismMap instanceof Map) ? vocab.anglicismMap : null;
      if (!ANGLICISMS || !ANGLICISMS.size) return [];
      const validWords = vocab.validWords || new Set();
      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        // Skip words that are valid Norwegian vocabulary
        if (validWords.has(t.word)) continue;

        // Nominal-context guard: when preceded by an article/possessive/
        // quantifier (with optional adjacent adjective slot), the token is
        // most plausibly a noun. Skip — anglicism rule targets verbs.
        // Covers both "et game" and "et nytt game" / "din gamle iPhone".
        if (i > 0) {
          const prev = tokens[i - 1];
          if (prev && NOMINAL_PRECEDERS.has(prev.word)) continue;
          if (i > 1) {
            const prev2 = tokens[i - 2];
            if (prev2 && NOMINAL_PRECEDERS.has(prev2.word)) continue;
          }
        }

        // Try exact stem match first (bare stem, e.g. "download" used as-is)
        if (ANGLICISMS.has(t.word)) {
          const entry = ANGLICISMS.get(t.word);
          out.push({
            rule_id: 'nb-anglicism',
            priority: rule.priority,
            severity: 'hint',
            start: t.start,
            end: t.end,
            original: t.display,
            fix: entry.inf,
            // Advisory only — no one-click "Fiks". The alternative is often a
            // separable verb/multiword ("laste ned"), so an auto token-swap
            // produces wrong word order ("laste ned det"). Like the V2 rule:
            // tell the student what they can do, don't auto-rewrite.
            noAutoFix: true,
            message: `Engelsk lånord: «${t.display}». Norsk alternativ: «${entry.inf}» (tips).`,
          });
          continue;
        }

        // Try stripping Norwegian verb suffixes
        const stripped = stripSuffix(t.word);
        if (!stripped) continue;

        // Direct stem lookup, then try stem + 'e' for stems like "google"
        // where the -e is part of the stem (googler → googl → google).
        let entry = ANGLICISMS.get(stripped.stem);
        if (!entry) entry = ANGLICISMS.get(stripped.stem + 'e');
        if (!entry) continue;

        const isPast = PAST_SUFFIXES.has(stripped.suffix);
        const isPresent = !isPast && PRESENT_SUFFIXES.has(stripped.suffix);
        const suggestion = (isPast && entry.past) ? entry.past
          : (isPresent && entry.present) ? entry.present
            : entry.inf;

        out.push({
          rule_id: 'nb-anglicism',
          priority: rule.priority,
          severity: 'hint',
          start: t.start,
          end: t.end,
          original: t.display,
          fix: suggestion,
          noAutoFix: true, // advisory only — see the bare-stem push above
          message: `Engelsk lånord: «${t.display}». Norsk alternativ: «${suggestion}» (tips).`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
