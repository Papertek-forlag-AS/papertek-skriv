/**
 * Spell-check rule: demonstrative-gender mismatch (priority 12).
 *
 * Phase 18. Flags demonstrative + noun pairs where the demonstrative's
 * grammatical gender does not match the noun's gender:
 *   "Det boka" -> "Den boka"  (boka = f, needs den)
 *   "Denne huset" -> "Dette huset" (huset = n, needs dette)
 *
 * Checks both immediately next word and 2-ahead (catches adjective gap:
 * "Det store boka" where an adjective sits between).
 *
 * In Bokmal, feminine nouns accept the common-gender demonstrative "den"/"denne"
 * too: "den boka" and "denne boka" are both correct. Only flags strict mismatches.
 *
 * Trigger words: den, det, denne, dette — DISJOINT from nb-gender.js articles
 * (en/ei/et for NB, ein/ei/eit for NN). No collision possible.
 *
 * Rule ID: 'nb-demonstrative-gender'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml, getString } = host.__lexiSpellCore || {};

  // Demonstrative -> expected gender mapping per language.
  // den/denne = m/f (common gender in NB), det/dette = n.
  const DEM_GENUS = {
    nb: { 'den': 'mf', 'det': 'n', 'denne': 'mf', 'dette': 'n' },
    nn: { 'den': 'mf', 'det': 'n', 'denne': 'mf', 'dette': 'n' },
  };

  // Fix mapping: given actual noun genus, which demonstrative to use.
  const GENUS_DEM = {
    simple:  { m: 'den',   f: 'den',   n: 'det' },
    proximal: { m: 'denne', f: 'denne', n: 'dette' },
  };

  // Phase 05.1 Gap C pattern: genus code -> i18n label key.
  const GENUS_TO_LABEL_KEY = { m: 'gender_label_m', f: 'gender_label_f', n: 'gender_label_n' };

  /**
   * Determine demonstrative type: 'simple' for den/det, 'proximal' for denne/dette.
   */
  function demType(word) {
    if (word === 'den' || word === 'det') return 'simple';
    if (word === 'denne' || word === 'dette') return 'proximal';
    return null;
  }

  /**
   * Check if a demonstrative's expected gender matches the actual noun gender.
   * 'mf' = common gender, accepts both m and f.
   * NB common-gender tolerance: 'den'/'denne' accept f nouns in NB.
   */
  function genderMatch(demExpected, actual, lang) {
    if (demExpected === 'mf') {
      // den/denne expects m or f
      return actual === 'm' || actual === 'f';
    }
    if (demExpected === 'n') {
      return actual === 'n';
    }
    return false;
  }

  const rule = {
    id: 'nb-demonstrative-gender',
    languages: ['nb', 'nn'],
    priority: 12,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (nb-demonstrative-gender) — Chrome native parity confirmed in 33-03 audit: NB demonstrative gender lookup against noun gender map; single-token suggestion",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      const labelKey = GENUS_TO_LABEL_KEY[finding.actualGenus];
      const nounDisplay = finding.noun_display;
      if (!labelKey || !nounDisplay || typeof getString !== 'function') {
        return {
          nb: `<em>${escapeHtml(finding.original)}</em> kan vare feil kjonn — prov <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `<em>${escapeHtml(finding.original)}</em> kan vere feil kjonn — prov <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      const labelNb = getString(labelKey, 'nb');
      const labelNn = getString(labelKey, 'nn');
      return {
        nb: `<em>${escapeHtml(finding.original)}</em> kan vare feil kjonn — <em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNb)}. Prov <em>${escapeHtml(finding.fix)}</em>.`,
        nn: `<em>${escapeHtml(finding.original)}</em> kan vere feil kjonn — <em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNn)}. Prov <em>${escapeHtml(finding.fix)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const verbInfinitive = vocab.verbInfinitive || new Map();
      // Quantifiers/determiners that don't form a "Det <adj> N" chain.
      const NON_BRIDGING = new Set(['kvar', 'kver', 'hver', 'hvert', 'kvart']);
      const demGenus = DEM_GENUS[lang];
      if (!demGenus) return [];
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const demExpected = demGenus[t.word];
        if (!demExpected) continue;

        // Look ahead: next token (i+1) or 2-ahead (i+2) for adjective gap.
        let nounTok = null;
        const next = tokens[i + 1];
        const twoAhead = tokens[i + 2];

        if (next && nounGenus.has(next.word)) {
          // Skip when the candidate noun is also a known verb form — "Det
          // skjer", "Det går", "Det blir" all have homograph noun entries
          // but the verb reading is the only sensible one after a clausal
          // "Det/det".
          if (verbInfinitive.has(next.word)) continue;
          nounTok = next;
        } else if (twoAhead && nounGenus.has(twoAhead.word) && next) {
          // 2-ahead is for adjective-gap ("Det store boka"). Reject when
          // the intervening word is a verb form ("Det var natt luft") or a
          // quantifier ("gjør det kvar dag") — the demonstrative isn't
          // actually modifying the 2-ahead noun in those clauses.
          if (verbInfinitive.has(next.word)) continue;
          if (NON_BRIDGING.has(next.word)) continue;
          nounTok = twoAhead;
        }

        if (!nounTok) continue;

        // Cursor exclusion: skip if cursor is within the noun token range.
        if (cursorPos != null && cursorPos >= nounTok.start && cursorPos <= nounTok.end + 1) continue;

        const actual = nounGenus.get(nounTok.word);
        if (!actual) continue;

        if (!genderMatch(demExpected, actual, lang)) {
          const type = demType(t.word);
          if (!type) continue;
          const correctDem = GENUS_DEM[type][actual];
          if (correctDem) {
            out.push({
              rule_id: 'nb-demonstrative-gender',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              noun_display: nounTok.display,
              actualGenus: actual,
              fix: matchCase(t.display, correctDem),
              message: `Pekepronomen: "${t.display} ${nounTok.display}" skulle vart "${correctDem} ${nounTok.display}"`,
            });
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
