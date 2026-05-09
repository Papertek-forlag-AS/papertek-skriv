/**
 * Spell-check rule: double-definiteness demonstrative gender mismatch (priority 11).
 *
 * Flags 3-token patterns (demonstrative + adjective + noun) where the
 * demonstrative's gender does not match the noun's gender:
 *   "den stor huset"  → "det stor huset"   (huset = n, needs det)
 *   "det stor boka"   → "den stor boka"    (boka = f, needs den)
 *
 * Complements nb-demonstrative-gender.js which covers 2-token patterns
 * (demonstrative + noun). This rule ONLY fires on the 3-token pattern
 * where the middle token is a known adjective.
 *
 * Rule ID: 'nb-double-definiteness'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml, getString } = host.__lexiSpellCore || {};

  // Demonstrative → expected gender mapping.
  // den/denne = m/f (common gender), det/dette = n.
  const DEM_GENUS = { 'den': 'mf', 'det': 'n', 'denne': 'mf', 'dette': 'n' };

  // Fix mapping: given actual noun genus, which demonstrative to use.
  const GENUS_DEM_SIMPLE   = { m: 'den',   f: 'den',   n: 'det' };
  const GENUS_DEM_PROXIMAL = { m: 'denne', f: 'denne', n: 'dette' };

  // Phase 05.1 Gap C pattern: genus code → i18n label key.
  const GENUS_TO_LABEL_KEY = { m: 'gender_label_m', f: 'gender_label_f', n: 'gender_label_n' };

  /**
   * Determine demonstrative type: 'simple' for den/det, 'proximal' for denne/dette.
   */
  function demType(word) {
    if (word === 'den' || word === 'det') return 'simple';
    if (word === 'denne' || word === 'dette') return 'proximal';
    return null;
  }

  const rule = {
    id: 'nb-double-definiteness',
    languages: ['nb', 'nn'],
    priority: 11,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule — demonstrative gender through adjective; single-token fix",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      const labelKey = GENUS_TO_LABEL_KEY[finding.actualGenus];
      const nounDisplay = finding.noun_display;
      if (!labelKey || !nounDisplay || typeof getString !== 'function') {
        return {
          nb: `<em>${escapeHtml(finding.original)}</em> passer ikke med substantivet — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `<em>${escapeHtml(finding.original)}</em> passar ikkje med substantivet — prøv <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      const labelNb = getString(labelKey, 'nb');
      const labelNn = getString(labelKey, 'nn');
      return {
        nb: `<em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNb)} — bruk <em>${escapeHtml(finding.fix)}</em> i stedet for <em>${escapeHtml(finding.original)}</em>.`,
        nn: `<em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNn)} — bruk <em>${escapeHtml(finding.fix)}</em> i staden for <em>${escapeHtml(finding.original)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const isAdjective = vocab.isAdjective || new Set();
      const validWords = vocab.validWords || new Set();
      const out = [];

      for (let i = 0; i < tokens.length - 2; i++) {
        const dem = tokens[i];
        const adj = tokens[i + 1];
        const noun = tokens[i + 2];

        // Skip 'disse' — plural demonstrative, different pattern.
        if (dem.word === 'disse') continue;

        const demExpected = DEM_GENUS[dem.word];
        if (!demExpected) continue;

        // Middle token must be a known adjective. isAdjective only has
        // base forms (stor, fin, god); inflected/definite forms (store,
        // fine, gode) live in validWords but not isAdjective. Accept
        // either, as long as the middle token is NOT itself a noun.
        if (!isAdjective.has(adj.word) && !validWords.has(adj.word)) continue;
        if (nounGenus.has(adj.word)) continue;

        // Third token must be a known noun with genus.
        const actual = nounGenus.get(noun.word);
        if (!actual) continue;

        // Cursor exclusion: skip if cursor is within the noun token range.
        if (cursorPos != null && cursorPos >= noun.start && cursorPos <= noun.end + 1) continue;

        // Check gender match.
        let matches;
        if (demExpected === 'mf') {
          matches = actual === 'm' || actual === 'f';
        } else {
          matches = actual === demExpected;
        }

        if (!matches) {
          const type = demType(dem.word);
          if (!type) continue;
          const correctDem = (type === 'simple' ? GENUS_DEM_SIMPLE : GENUS_DEM_PROXIMAL)[actual];
          if (correctDem) {
            out.push({
              rule_id: 'nb-double-definiteness',
              priority: rule.priority,
              start: dem.start,
              end: dem.end,
              original: dem.display,
              noun_display: noun.display,
              actualGenus: actual,
              fix: matchCase(dem.display, correctDem),
              message: `Dobbel bestemmelse: "${dem.display} ${adj.display} ${noun.display}" — bruk "${correctDem}" for samsvar med "${noun.display}"`,
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
