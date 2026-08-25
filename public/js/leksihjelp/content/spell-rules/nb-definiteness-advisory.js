/**
 * Spell-check rule: NB/NN double-definiteness REFLECTIVE ADVISORY (priority 70, hint).
 *
 * The double-definiteness SUFFIX error ("det store hus" → "det store huset")
 * cannot be auto-flagged: Norwegian "enkel bestemmelse" makes the bare form
 * CORRECT in fixed/formal expressions and proper names ("det norske folk",
 * "Den norske kirke", "Det hvite hus"). A deterministic error flag therefore
 * false-positives on correct formal Norwegian (~2.8% measured — the rule that
 * tried it was reverted).
 *
 * This rule takes a different stance: it never marks anything as WRONG. Instead,
 * when the SAME bare-noun pattern appears ≥2 times in one text (a tell that the
 * writer may be systematically dropping the definite suffix, not using formal
 * register), it surfaces a gentle, dismissable HINT asking the student to CHECK
 * and reflect — explaining that the bare form is sometimes right. No auto-fix.
 *
 * Frame: [den/det/denne/dette][adjective][bare singular noun] where the noun's
 * genus AGREES with the demonstrative (a gender MISMATCH is a different error,
 * owned by nb-double-definiteness). Detection uses nounLemmaGenus, which is
 * keyed by INDEFINITE lemma only — so "huset" (already definite) never matches
 * and the advisory does not nag on correct "det store huset".
 *
 * Severity: hint (P3, dismissable, no auto-fix). Document-gated (≥2).
 * Rule ID: 'nb-definiteness-advisory'.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  // Singular demonstratives → expected genus. den/denne = common (m/f),
  // det/dette = neuter. (Plural de/disse excluded — messier, lower value.)
  const DEM_GENUS = { 'den': 'mf', 'det': 'n', 'denne': 'mf', 'dette': 'n' };

  // Expletive/cleft "det" ("det er", "det finnes") is not a demonstrative — the
  // genus-agreement + adjective-middle + bare-noun frame already excludes those,
  // but keep a small verb guard for the middle slot below.
  const MIN_OCCURRENCES = 2;

  function genusAgrees(expected, actualRaw) {
    if (!actualRaw) return false;
    const actual = String(actualRaw).split('/');
    if (expected === 'mf') return actual.includes('m') || actual.includes('f');
    return actual.includes(expected);
  }

  const rule = {
    id: 'nb-definiteness-advisory',
    languages: ['nb', 'nn'],
    priority: 70,
    severity: 'hint',
    noAutoFix: true,
    exam: {
      safe: false,
      reason: 'Reflective grammar advisory (double definiteness); pedagogical nudge, suppressed in exam',
      category: 'grammar-lookup',
    },
    explain() {
      return {
        nb: 'Du har brukt mønsteret <em>den/det + adjektiv + substantiv</em> uten bestemt form på substantivet flere ganger. Ofte skal det hete <em>det store hus<strong>et</strong></em> (<strong>dobbel bestemthet</strong>). Men noen faste, høytidelige uttrykk er riktige uten ending: <em>det norske folk</em>, <em>Det hvite hus</em>. Dette er bare et tips — sjekk og vurder selv om substantivet trenger <em>-et/-en</em>.',
        nn: 'Du har brukt mønsteret <em>den/det + adjektiv + substantiv</em> utan bestemt form på substantivet fleire gonger. Ofte skal det heite <em>det store hus<strong>et</strong></em> (<strong>dobbel bestemtheit</strong>). Men nokre faste, høgtidelege uttrykk er rette utan ending: <em>det norske folk</em>. Dette er berre eit tips — sjekk og vurder sjølv om substantivet treng <em>-et/-en</em>.',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'nb' && ctx.lang !== 'nn') return [];
      const { tokens, cursorPos } = ctx;
      if (!tokens || tokens.length < 3) return [];
      const vocab = ctx.vocab || {};
      const lemmaGenus = vocab.nounLemmaGenus;
      const isAdjective = vocab.isAdjective;
      if (!lemmaGenus || lemmaGenus.size === 0 || !isAdjective || isAdjective.size === 0) return [];
      const knownPresens = vocab.knownPresens || new Set();
      const verbInfinitive = vocab.verbInfinitive || new Set();
      const validWords = vocab.validWords || new Set();

      // The attributive adjective after a demonstrative is the WEAK form
      // (store/gamle/norske/åpne …, ending -e or -a). isAdjective misses some
      // weak forms (e.g. "norske"), so also accept a valid -e/-a word that is
      // not a noun lemma or verb.
      function isWeakAdjective(w) {
        if (knownPresens.has(w) || verbInfinitive.has(w) || lemmaGenus.has(w)) return false;
        if (isAdjective.has(w)) return true;
        return /[ea]$/.test(w) && validWords.has(w);
      }

      // Pass 1: collect every [dem][adj][bare-noun, genus-agrees] match.
      const matches = [];
      for (let i = 0; i + 2 < tokens.length; i++) {
        const dem = tokens[i];
        const adj = tokens[i + 1];
        const noun = tokens[i + 2];
        const expected = DEM_GENUS[dem.word];
        if (!expected) continue;

        // Middle slot must be a genuine (weak) adjective, not a verb/noun homograph.
        if (!isWeakAdjective(adj.word)) continue;

        // Third slot must be a BARE (indefinite-lemma) noun whose genus agrees
        // with the demonstrative. nounLemmaGenus is lemma-only, so a definite
        // "huset" is not a key → correct "det store huset" never matches.
        const nounGen = lemmaGenus.get(noun.word);
        if (!nounGen) continue;
        if (!genusAgrees(expected, nounGen)) continue;

        matches.push({ dem, adj, noun });
      }

      // Document gate: only surface when the pattern recurs (≥2).
      if (matches.length < MIN_OCCURRENCES) return [];

      const out = [];
      for (const m of matches) {
        const { dem, adj, noun } = m;
        if (cursorPos != null && cursorPos >= noun.start && cursorPos <= noun.end + 1) continue;
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: noun.start,
          end: noun.end,
          original: noun.display,
          severity: 'hint',
          noAutoFix: true,
          message: `Tips: «${dem.display} ${adj.display} ${noun.display}» — sjekk om «${noun.display}» skal stå i bestemt form (dobbel bestemthet). Noen faste uttrykk er likevel riktige uten ending.`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
