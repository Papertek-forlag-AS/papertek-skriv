/**
 * Spell-check rule: NB/NN deprecated run-together temporal adverbials
 * (nb-adverbial-split, priority 15).
 *
 * The 2005 Bokmål reform standardised the temporal "i"-adverbials as TWO
 * words. Students routinely write the old run-together forms:
 *   idag → i dag, imorgen → i morgen, ikveld → i kveld, ifjor → i fjor, …
 *
 * This is a closed curated set, NOT a general "i" + noun pattern — a pattern
 * would false-positive on the many valid one-word i-compounds (igjen, imot,
 * istedenfor, ifølge, iallfall, ihjel …). Precision-first: only the listed
 * temporal forms flag.
 *
 * Why a rule and not N lexicon typos: (1) one place for the whole class;
 * (2) it runs at priority 15 and adds each hit to ctx.suppressed, so the
 * fuzzy typo rule (priority 50) can't fire its nonsense edit-distance guesses
 * on these (it was suggesting "iår → igår" and "ivinter → idioter"); (3) it
 * doesn't depend on the Ordbank-derived accept-list, which still tags several
 * of these as "normert" from the pre-2005 dump.
 *
 * Severity: warning (amber). Auto-fixable (whole-token → two-word split).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  // Closed map: deprecated run-together temporal adverbial → correct split.
  const SPLIT = {
    idag: 'i dag',
    igår: 'i går',
    imorgen: 'i morgen',
    imorges: 'i morges',
    ikveld: 'i kveld',
    inatt: 'i natt',
    iaften: 'i aften',
    ifjor: 'i fjor',
    iår: 'i år',
    ihøst: 'i høst',
    ivinter: 'i vinter',
    isommer: 'i sommer',
    ivår: 'i vår',
  };

  const rule = {
    id: 'nb-adverbial-split',
    languages: ['nb', 'nn'],
    priority: 15,
    // Orthography (spelling of a temporal adverbial) — at browser-spellcheck
    // parity, so it stays visible in exam mode. Mirrors nb-typo-curated.
    exam: {
      safe: true,
      reason: "Token-level orthography correction (deprecated run-together temporal adverbial); at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'warning',
    explain: function (finding) {
      const fix = (finding && finding.fix) || 'i …';
      return {
        nb: `Tidsuttrykk med <em>i</em> skrives i to ord etter rettskrivinga fra 2005. Skriv <em>${fix}</em>.`,
        nn: `Tidsuttrykk med <em>i</em> vert skrivne i to ord. Skriv <em>${fix}</em>.`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'nb' && ctx.lang !== 'nn') return [];
      const { tokens, cursorPos, suppressed } = ctx;
      if (!tokens) return [];
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const key = t.word.toLowerCase();
        if (!Object.prototype.hasOwnProperty.call(SPLIT, key)) continue;
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        let split = SPLIT[key];
        // Preserve leading capital: "Idag" → "I dag".
        const first = t.display.charAt(0);
        if (first && first !== first.toLowerCase()) {
          split = split.charAt(0).toUpperCase() + split.slice(1);
        }

        out.push({
          rule_id: 'nb-adverbial-split',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: split,
          message: `«${t.display}» skrives i to ord: «${split}»`,
          severity: 'warning',
        });
        // Claim the token so the fuzzy/curated typo rules (priority 40/50)
        // don't also fire a (often nonsensical) edit-distance guess on it.
        if (suppressed) suppressed.add(i);
      }

      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
