/**
 * Spell-check rule: NB/NN missing sentence-boundary punctuation (priority 56).
 *
 * Detects two independent clauses run together with no period/!/? between
 * them. Conservative heuristic — high precision over recall:
 *
 *   1. Token N is a capitalised subject pronoun (Det/Han/Hun/Jeg/Vi/...)
 *   2. Token N is NOT at position 0 (start of input)
 *   3. Token N+1 is a finite verb form (er/var/har/hadde/kan/skal/vil/...)
 *   4. Token N-1 does NOT end with .!?:; (no existing sentence boundary)
 *   5. Token N-1 is NOT a coordinating conjunction (og/men/for/eller/så)
 *   6. There is no '"' or ')' immediately before token N (skip dialogue/parens)
 *
 * Fix: insert period before the capital pronoun.
 *
 * Rule ID: 'nb-sentence-boundary'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  const CAPITAL_SUBJECTS_NB = new Set([
    'Jeg', 'Du', 'Han', 'Hun', 'Den', 'Det', 'Vi', 'Dere', 'De', 'Man',
  ]);
  const CAPITAL_SUBJECTS_NN = new Set([
    'Eg', 'Du', 'Han', 'Ho', 'Den', 'Det', 'Vi', 'Dykk', 'Dei', 'Ein',
  ]);

  // Finite verb forms after a subject pronoun — strong "new clause" signal.
  // Limit to high-frequency forms to keep precision high.
  const FINITE_VERBS = new Set([
    // copula / aux
    'er', 'var', 'har', 'hadde', 'blir', 'ble', 'vart', 'vert',
    // modals
    'kan', 'kunne', 'skal', 'skulle', 'vil', 'ville', 'må', 'måtte',
    'bør', 'burde',
    // pro-form / common
    'gjør', 'gjorde', 'gjer',
  ]);

  // Coordinating conjunctions — if previous token IS one of these, the
  // capital pronoun is conjoined, not a new sentence.
  const CONJUNCTIONS_PREV = new Set(['og', 'men', 'for', 'eller', 'så']);

  function getCapitalSubjects(lang) {
    return lang === 'nn' ? CAPITAL_SUBJECTS_NN : CAPITAL_SUBJECTS_NB;
  }

  const rule = {
    id: 'nb-sentence-boundary',
    languages: ['nb', 'nn'],
    priority: 56,
    exam: {
      safe: true,
      reason: "Pattern-matched sentence boundary — flags only the highest-precision case (capital subject pronoun + finite verb without preceding punctuation)",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: (finding) => ({
      nb: `Det mangler punktum (eller ! / ?) foran <em>${escapeHtml(finding.original)}</em>. To setninger må skilles med stort tegn, ikke kjøres sammen.`,
      nn: `Det manglar punktum (eller ! / ?) framfor <em>${escapeHtml(finding.original)}</em>. To setningar må skiljast med stort teikn, ikkje køyrast saman.`,
    }),
    check(ctx) {
      const { tokens, text, cursorPos, lang } = ctx;
      const capitals = getCapitalSubjects(lang);
      const out = [];

      for (let i = 1; i < tokens.length - 1; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        // 1. Token must be a capitalised subject pronoun (case-sensitive)
        if (!capitals.has(t.display)) continue;

        // 3. Next token must be a finite verb (lowercase match)
        const nextT = tokens[i + 1];
        if (!FINITE_VERBS.has(nextT.word.toLowerCase())) continue;

        // 4 & 5. Inspect the gap between previous token and current token.
        const prevT = tokens[i - 1];
        const gap = text.slice(prevT.end, t.start);
        // Already has sentence-end punctuation in the gap? Skip.
        if (/[.!?:;]/.test(gap)) continue;
        // Quotation marks or closing paren immediately before? Skip (dialogue / aside).
        if (/["»\)\]]/.test(gap)) continue;

        // Previous token is itself sentence-final punctuation (e.g. on its own)?
        if (/^[.!?:;]+$/.test(prevT.display)) continue;
        // Previous token is a coordinating conjunction → it's a conjoined clause,
        // not a missing-period case.
        if (CONJUNCTIONS_PREV.has(prevT.word.toLowerCase())) continue;

        out.push({
          rule_id: 'nb-sentence-boundary',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: '. ' + t.display,
          message: `Mangler punktum foran «${t.display}»`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
