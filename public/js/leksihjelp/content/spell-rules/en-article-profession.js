(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Norwegian predicative nouns take no article: "Hun er lærer."
  // Students transfer this directly: "She is teacher" → "She is a teacher."
  //
  // Detection: copula immediately followed by a singular countable profession
  // noun with no preceding article. 2-token window: copula + profession.
  // Article-free title uses (president, director, captain) are excluded from
  // the profession list to avoid FPs ("She became president").
  //
  // Plural forms are not flagged — "They are teachers" is correct.
  // Modifier-before-noun cases ("She is very good doctor") are also missed
  // (adjective sits between copula and noun); this is acceptable narrow scope.

  const COPULAS = new Set(['am', 'is', 'are', 'was', 'were']);

  // Singular countable profession nouns that always require a/an in predicative
  // position. Excludes titles that are legitimately article-free (president,
  // director, manager, captain, officer).
  const PROFESSIONS = new Set([
    'actor', 'actress', 'accountant', 'architect', 'artist', 'athlete', 'author',
    'baker', 'barber', 'biologist',
    'carpenter', 'chef', 'chemist', 'coach', 'cook',
    'dentist', 'designer', 'developer', 'doctor', 'driver',
    'economist', 'editor', 'electrician', 'engineer',
    'farmer', 'firefighter',
    'gardener', 'guard',
    'journalist', 'judge',
    'lawyer', 'lecturer', 'librarian',
    'mechanic', 'musician',
    'nurse',
    'painter', 'pharmacist', 'photographer', 'pilot', 'plumber', 'poet',
      'policeman', 'policewoman', 'programmer', 'professor',
    'researcher',
    'scientist', 'singer', 'soldier', 'surgeon',
    'teacher', 'therapist', 'translator',
    'veterinarian', 'volunteer',
    'waiter', 'waitress', 'writer',
    'student',
  ]);

  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

  const rule = {
    id: 'en-article-profession',
    languages: ['en'],
    priority: 19,
    severity: 'warning',
    exam: {
      safe: true,
      reason: '2-token copula + profession lookup — closed-set, at grammar-lookup parity',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `På engelsk trenger yrkesbetegnelser artikkelen <em>a/an</em> etter «to be»: <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `På engelsk treng yrkesnemningar artikkelen <em>a/an</em> etter «to be»: <em>${escapeHtml(finding.fix)}</em>.`,
      en: `Profession nouns need <em>a/an</em> after «to be» in English: <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const t0 = tokens[i];
        const t1 = tokens[i + 1];

        if (!COPULAS.has(t0.word)) continue;
        if (!PROFESSIONS.has(t1.word)) continue;

        // Skip if the profession is capitalised (title/proper noun usage)
        if (t1.display[0] !== t1.display[0].toLowerCase()) continue;

        // Skip if cursor is within the flagged span (still typing)
        if (cursorPos != null && cursorPos >= t0.start && cursorPos <= t1.end + 1) continue;

        const article = VOWELS.has(t1.word[0]) ? 'an' : 'a';
        const fix = `${t0.display} ${article} ${t1.display}`;
        out.push({
          rule_id: 'en-article-profession',
          priority: rule.priority,
          severity: 'warning',
          start: t0.start,
          end: t1.end,
          original: `${t0.display} ${t1.display}`,
          fix,
          message: `«${t0.display} ${t1.display}» → «${fix}» (mangler artikkel «${article}»)`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
