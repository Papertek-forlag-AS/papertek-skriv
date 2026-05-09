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

  // Each entry: stem → { inf: Norwegian infinitive, past: Norwegian past form (optional) }
  // When past form is absent, inf is used for all suffixes.
  const ANGLICISMS = new Map([
    ['download',   { inf: 'laste ned',      past: 'lastet ned' }],
    ['upload',     { inf: 'laste opp',      past: 'lastet opp' }],
    ['forward',    { inf: 'videresende',    past: 'videresendte' }],
    ['boost',      { inf: 'forsterke',      past: 'forsterket' }],
    ['chill',      { inf: 'slappe av',      past: 'slappet av' }],
    ['game',       { inf: 'spille',         past: 'spilte' }],
    ['hike',       { inf: 'gå tur' }],
    ['brainstorm', { inf: 'idédugnad' }],
    ['update',     { inf: 'oppdatere',      past: 'oppdaterte' }],
    ['stream',     { inf: 'strømme',        past: 'strømmet' }],
    ['google',     { inf: 'søke opp',       past: 'søkte opp' }],
    ['cancel',     { inf: 'avlyse',         past: 'avlyste' }],
    ['share',      { inf: 'dele',           past: 'delte' }],
    ['scroll',     { inf: 'bla',            past: 'bladde' }],
    ['swipe',      { inf: 'sveipe',         past: 'sveipet' }],
    ['binge',      { inf: 'marathon-se',    past: 'marathon-så' }],
    ['ghost',      { inf: 'ignorere',       past: 'ignorerte' }],
    ['stalk',      { inf: 'snoke',          past: 'snoket' }],
    ['spam',       { inf: 'masesende',      past: 'masesendte' }],
    ['crush',      { inf: 'knuse',          past: 'knuste' }],
  ]);

  // Norwegian verb suffixes to strip, longest first.
  const SUFFIXES = ['inga', 'ing', 'er', 'et', 'en', 'ar', 'a', 'e'];
  // Past-tense suffixes — when matched, suggest the past form.
  const PAST_SUFFIXES = new Set(['et', 'a']);

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
      nb: `<em>${escapeHtml(finding.original)}</em> er et anglisisme — prøv <em>${escapeHtml(finding.fix)}</em> i stedet.`,
      nn: `<em>${escapeHtml(finding.original)}</em> er eit anglisisme — prøv <em>${escapeHtml(finding.fix)}</em> i staden.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      const validWords = vocab.validWords || new Set();
      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        // Skip words that are valid Norwegian vocabulary
        if (validWords.has(t.word)) continue;

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
            message: `Anglisisme: «${t.display}» → «${entry.inf}»`,
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
        const suggestion = (isPast && entry.past) ? entry.past : entry.inf;

        out.push({
          rule_id: 'nb-anglicism',
          priority: rule.priority,
          severity: 'hint',
          start: t.start,
          end: t.end,
          original: t.display,
          fix: suggestion,
          message: `Anglisisme: «${t.display}» → «${suggestion}»`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
