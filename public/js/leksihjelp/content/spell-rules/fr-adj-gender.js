/**
 * Spell-check rule: French adjective-noun gender agreement (MORPH-02, priority 16).
 *
 * Phase 14. Flags when a pre-nominal adjective disagrees in gender with the
 * following noun. Complements the existing es-fr-gender.js rule (priority 15)
 * which catches article-noun mismatches; this rule targets adjective-noun
 * mismatches.
 *
 * Example: "un bon humeur" -> flags "bon", suggests "bonne"
 *          (humeur is feminine, bon is masculine)
 *
 * Rule ID: 'fr-adj-gender'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase, escapeHtml: coreEscape } = core;

  function escapeHtml(s) {
    if (coreEscape) return coreEscape(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Irregular feminine forms (closed class, inline per data-logic-separation) ──
  const FR_ADJ_FEM_IRREGULARS = {
    bon: 'bonne',
    beau: 'belle',
    bel: 'belle',
    vieux: 'vieille',
    vieil: 'vieille',
    nouveau: 'nouvelle',
    nouvel: 'nouvelle',
    fou: 'folle',
    blanc: 'blanche',
    sec: 'seche',
    long: 'longue',
    gros: 'grosse',
    faux: 'fausse',
    doux: 'douce',
    gentil: 'gentille',
    public: 'publique',
    frais: 'fraiche',
  };

  // ── Reverse map: feminine -> masculine (for reverse-direction errors) ──
  const FR_ADJ_MASC_IRREGULARS = {};
  for (const [masc, fem] of Object.entries(FR_ADJ_FEM_IRREGULARS)) {
    // Only map back to the primary masculine form (skip bel->belle, vieil->vieille etc.)
    if (!FR_ADJ_MASC_IRREGULARS[fem]) {
      FR_ADJ_MASC_IRREGULARS[fem] = masc;
    }
  }

  /**
   * Derive the feminine form of a masculine adjective.
   * 1. Check irregular map first
   * 2. If already ends in 'e', return unchanged (gender-neutral)
   * 3. Apply regular patterns: -er -> -ere, -eux -> -euse, -if -> -ive,
   *    -el/-en/-on -> double consonant + e
   * 4. Default: add 'e'
   */
  function feminize(adj) {
    const lower = adj.toLowerCase();

    // 1. Irregular
    if (FR_ADJ_FEM_IRREGULARS[lower]) return FR_ADJ_FEM_IRREGULARS[lower];

    // 2. Already ends in 'e' -> gender-neutral (petit/petite both handled by regular rule)
    if (lower.endsWith('e')) return lower;

    // 3. Regular patterns
    if (lower.endsWith('er')) return lower.slice(0, -2) + 'ere';
    if (lower.endsWith('eux')) return lower.slice(0, -1) + 'se';
    if (lower.endsWith('if')) return lower.slice(0, -1) + 've';
    if (lower.endsWith('el')) return lower + 'le';
    if (lower.endsWith('en')) return lower + 'ne';
    if (lower.endsWith('on')) return lower + 'ne';
    if (lower.endsWith('et')) return lower + 'te';

    // 4. Default: add 'e'
    return lower + 'e';
  }

  /**
   * Derive the masculine form of a feminine adjective.
   * Reverse of feminize. Returns null if cannot determine.
   */
  function masculinize(adj) {
    const lower = adj.toLowerCase();

    // 1. Irregular reverse
    if (FR_ADJ_MASC_IRREGULARS[lower]) return FR_ADJ_MASC_IRREGULARS[lower];

    // 2. Does not end in 'e' -> already masculine
    if (!lower.endsWith('e')) return lower;

    // 3. Reverse regular patterns
    if (lower.endsWith('ere') && lower.length > 3) return lower.slice(0, -3) + 'er';
    if (lower.endsWith('euse')) return lower.slice(0, -2) + 'x';
    if (lower.endsWith('ive') && lower.length > 3) return lower.slice(0, -2) + 'f';
    if (lower.endsWith('elle') && lower.length > 4) return lower.slice(0, -2);
    if (lower.endsWith('enne') && lower.length > 4) return lower.slice(0, -2);
    if (lower.endsWith('onne') && lower.length > 4) return lower.slice(0, -2);
    if (lower.endsWith('ette') && lower.length > 4) return lower.slice(0, -2);

    // 4. Default: drop trailing 'e'
    if (lower.endsWith('e') && lower.length > 1) return lower.slice(0, -1);

    return null;
  }

  /**
   * Check if a word is a known masculine adjective form.
   * Uses vocab isAdjective set (which contains masculine base forms).
   */
  function isMasculineAdj(word, isAdjective) {
    return isAdjective.has(word);
  }

  /**
   * Check if a word is a known feminine adjective form.
   * A feminine form is recognized if masculinizing it yields a known adjective.
   */
  function isFeminineAdj(word, isAdjective) {
    const masc = masculinize(word);
    return masc !== null && masc !== word && isAdjective.has(masc);
  }

  const rule = {
    id: 'fr-adj-gender',
    languages: ['fr'],
    priority: 16,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (fr-adj-gender) — Chrome native parity confirmed in 33-03 audit: FR adjective gender lookup; single-token feminine/masculine form swap",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      return {
        nb: 'Adjektivet <em>' + escapeHtml(finding.original) + '</em> har feil kjonn — bruk <em>' + escapeHtml(finding.fix) + '</em> foran dette substantivet.',
        nn: 'Adjektivet <em>' + escapeHtml(finding.original) + '</em> har feil kjonn — bruk <em>' + escapeHtml(finding.fix) + '</em> framfor dette substantivet.',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const { tokens, vocab, cursorPos } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const adjSet = vocab.isAdjective || new Set();
      const findings = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const adjTok = tokens[i];
        const nounTok = tokens[i + 1];

        // Skip token under cursor
        if (cursorPos != null && cursorPos >= adjTok.start && cursorPos <= adjTok.end + 1) continue;

        const adjWord = adjTok.word.toLowerCase();
        const nounWord = nounTok.word.toLowerCase();

        // Noun must be known with a gender
        const nounGender = nounGenus.get(nounWord);
        if (!nounGender) continue;

        // Case 1: Masculine adjective before feminine noun
        if (nounGender === 'f' && isMasculineAdj(adjWord, adjSet)) {
          const femForm = feminize(adjWord);
          // Only flag if the feminine form differs from the masculine form
          if (femForm !== adjWord) {
            const fix = matchCase ? matchCase(adjTok.display, femForm) : femForm;
            findings.push({
              rule_id: 'fr-adj-gender',
              priority: rule.priority,
              start: adjTok.start,
              end: adjTok.end,
              original: adjTok.display,
              fix: fix,
              message: 'Kjonn: "' + adjTok.display + '" bor vaere "' + fix + '" foran "' + nounTok.display + '"',
            });
          }
        }

        // Case 2: Feminine adjective before masculine noun
        if (nounGender === 'm' && isFeminineAdj(adjWord, adjSet)) {
          const mascForm = masculinize(adjWord);
          if (mascForm && mascForm !== adjWord) {
            const fix = matchCase ? matchCase(adjTok.display, mascForm) : mascForm;
            findings.push({
              rule_id: 'fr-adj-gender',
              priority: rule.priority,
              start: adjTok.start,
              end: adjTok.end,
              original: adjTok.display,
              fix: fix,
              message: 'Kjonn: "' + adjTok.display + '" bor vaere "' + fix + '" foran "' + nounTok.display + '"',
            });
          }
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
