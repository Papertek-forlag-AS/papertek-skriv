/**
 * Spell-check rule: DE du/Sie address drift (DOC-01, priority 201).
 *
 * Phase 13. Document-level rule that flags whole-document register
 * inconsistency when a German text mixes du-address (informal) and
 * Sie-address (formal) forms. Complements the existing de-grammar
 * adjacent-pair du/Sie checks (priority 15).
 *
 * Severity: warning (P2 amber dot).
 * Kind: document (runs in Phase 13 post-pass after all token-level rules).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Lazy access: grammar-tables.js may load after this file alphabetically.
  function getDetectDrift() {
    return host.__lexiGrammarTables && host.__lexiGrammarTables.detectDrift;
  }

  // ── Informal pronoun / possessive markers (always lowercase match) ──
  const INFORMAL_WORDS = new Set([
    'du', 'dein', 'deine', 'deinem', 'deinen', 'deiner', 'dir', 'dich',
  ]);

  // ── Formal pronoun / possessive markers ──
  // These require CAPITAL first letter in display AND mid-sentence position.
  // "Sie" at sentence start is ambiguous (could be "sie" = they).
  const FORMAL_DISPLAY = new Set([
    'Sie', 'Ihnen', 'Ihr', 'Ihre', 'Ihrem', 'Ihren', 'Ihrer',
  ]);

  // ── Suggestion maps: formal -> informal equivalent ──
  const FORMAL_TO_INFORMAL = {
    'Sie': 'du', 'Ihnen': 'dir', 'Ihr': 'Dein', 'Ihre': 'Deine',
    'Ihrem': 'deinem', 'Ihren': 'deinen', 'Ihrer': 'deiner',
  };
  const INFORMAL_TO_FORMAL = {
    'du': 'Sie', 'Du': 'Sie', 'dein': 'Ihr', 'Dein': 'Ihr',
    'deine': 'Ihre', 'Deine': 'Ihre', 'deinem': 'Ihrem', 'Deinem': 'Ihrem',
    'deinen': 'Ihren', 'Deinen': 'Ihren', 'deiner': 'Ihrer', 'Deiner': 'Ihrer',
    'dir': 'Ihnen', 'Dir': 'Ihnen', 'dich': 'Sie', 'Dich': 'Sie',
  };

  /**
   * Check if a token is at the start of a sentence.
   * Sentence-start "Sie" is ambiguous between formal-you and they.
   */
  function isSentenceStart(tok, sentences) {
    for (const s of sentences) {
      // Find the first non-whitespace position in this sentence
      const sentText = s.text || '';
      const leadingWs = sentText.search(/\S/);
      const firstCharPos = leadingWs >= 0 ? s.start + leadingWs : s.start;
      if (tok.start === firstCharPos) return true;
    }
    return false;
  }

  /**
   * Collect address register markers from DE text.
   * Returns array of {register, tokenIndex, start, end, display}.
   */
  function collectMarkers(ctx) {
    const markers = [];
    const suppStruct = ctx.suppressedFor && ctx.suppressedFor.structural;

    for (let i = 0; i < ctx.tokens.length; i++) {
      if (suppStruct && suppStruct.has(i)) continue;

      const tok = ctx.tokens[i];
      const w = tok.word;   // lowercased
      const d = tok.display; // original case

      // Informal pronouns/possessives (case-insensitive via lowercased word)
      if (INFORMAL_WORDS.has(w)) {
        markers.push({
          register: 'informal', tokenIndex: i,
          start: tok.start, end: tok.end, display: d,
        });
        continue;
      }

      // Formal markers: must have capital letter in display AND be mid-sentence
      if (FORMAL_DISPLAY.has(d)) {
        // Skip sentence-start "Sie" — ambiguous with "sie" (they)
        if (d === 'Sie' && isSentenceStart(tok, ctx.sentences)) continue;
        markers.push({
          register: 'formal', tokenIndex: i,
          start: tok.start, end: tok.end, display: d,
        });
        continue;
      }

      // 2sg verb forms ending in -st (hast, bist, kommst) as informal markers
      // Only if in knownPresens to avoid false positives on non-verb -st words
      if (w.length > 3 && w.endsWith('st') &&
          ctx.vocab.knownPresens && ctx.vocab.knownPresens.has(w)) {
        markers.push({
          register: 'informal', tokenIndex: i,
          start: tok.start, end: tok.end, display: d,
        });
      }
    }

    return markers;
  }

  const rule = {
    id: 'doc-drift-de-address',
    kind: 'document',
    languages: ['de'],
    priority: 201,
    // exam-audit 33-03: stays safe=false — Doc-drift detection: cross-sentence du/Sie register consistency; multi-sentence reasoning
    exam: {
      safe: false,
      reason: "Stays safe=false (doc-drift-de-address) — Doc-drift detection: cross-sentence du/Sie register consistency; multi-sentence reasoning",
      category: "grammar-lookup",
    },
    severity: 'warning',

    explain(finding) {
      const esc = escapeHtml || (s => String(s || ''));
      const dom = finding.dominant === 'informal' ? 'du-form (uformell)' : 'Sie-form (formell)';
      return {
        nb: `Du blander du-form og Sie-form i teksten. Mesteparten bruker ${dom}. Endre <em>${esc(finding.original)}</em> til <em>${esc(finding.fix)}</em>.`,
        nn: `Du blandar du-form og Sie-form i teksten. Mesteparten brukar ${dom}. Endre <em>${esc(finding.original)}</em> til <em>${esc(finding.fix)}</em>.`,
        severity: 'warning',
      };
    },

    check(ctx) { return []; },

    checkDocument(ctx, findings) {
      const detectDrift = getDetectDrift();
      if (!detectDrift) return [];

      const markers = collectMarkers(ctx);
      const result = detectDrift(markers, 3);
      if (!result) return [];

      // Build set of already-flagged spans from pass-1
      const flagged = new Set();
      for (const f of findings) {
        flagged.add(f.start + ':' + f.end);
      }

      const out = [];
      for (const m of result.minority) {
        const key = m.start + ':' + m.end;
        if (flagged.has(key)) continue;

        // Suggest the dominant-register equivalent
        let fix;
        if (result.dominant === 'informal') {
          fix = FORMAL_TO_INFORMAL[m.display] || 'du';
        } else {
          fix = INFORMAL_TO_FORMAL[m.display] || 'Sie';
        }

        out.push({
          rule_id: 'doc-drift-de-address',
          start: m.start,
          end: m.end,
          fix,
          original: m.display,
          dominant: result.dominant,
          message: result.dominant === 'informal'
            ? 'Teksten bruker mest du-form. Her bruker du Sie-form.'
            : 'Teksten bruker mest Sie-form. Her bruker du du-form.',
        });
      }

      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
