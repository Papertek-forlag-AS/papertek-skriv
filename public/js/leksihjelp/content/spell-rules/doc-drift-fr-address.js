/**
 * Spell-check rule: FR tu/vous address drift (DOC-02, priority 202).
 *
 * Phase 13. Document-level rule that flags whole-document register
 * inconsistency when a French text mixes tu-address (informal) and
 * vous-address (formal) forms. Pedagogical simplification for A1-B1:
 * tu = informal, vous = formal (ignoring the plural-vous distinction).
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

  // ── Informal markers (tu-address) ──
  const INFORMAL_WORDS = new Set([
    'tu', 'te', 'toi', 'ton', 'ta', 'tes',
  ]);

  // ── Formal markers (vous-address) ──
  const FORMAL_WORDS = new Set([
    'vous', 'votre', 'vos',
  ]);

  // ── Suggestion maps ──
  const FORMAL_TO_INFORMAL = {
    'vous': 'tu', 'votre': 'ton', 'vos': 'tes',
  };
  const INFORMAL_TO_FORMAL = {
    'tu': 'vous', 'te': 'vous', 'toi': 'vous',
    'ton': 'votre', 'ta': 'votre', 'tes': 'vos',
  };

  /**
   * Collect address register markers from FR text.
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

      // Informal pronouns/possessives
      if (INFORMAL_WORDS.has(w)) {
        markers.push({
          register: 'informal', tokenIndex: i,
          start: tok.start, end: tok.end, display: d,
        });
        continue;
      }

      // t' elision: tokenizer keeps "t'aime" as one token
      if (w.startsWith("t'") || w.startsWith("t’")) {
        markers.push({
          register: 'informal', tokenIndex: i,
          start: tok.start, end: tok.start + 1, display: d[0],
        });
        continue;
      }

      // Formal pronouns/possessives
      if (FORMAL_WORDS.has(w)) {
        markers.push({
          register: 'formal', tokenIndex: i,
          start: tok.start, end: tok.end, display: d,
        });
        continue;
      }
    }

    return markers;
  }

  const rule = {
    id: 'doc-drift-fr-address',
    kind: 'document',
    languages: ['fr'],
    priority: 202,
    // exam-audit 33-03: stays safe=false — Doc-drift detection: cross-sentence tu/vous register consistency; multi-sentence reasoning
    exam: {
      safe: false,
      reason: "Stays safe=false (doc-drift-fr-address) — Doc-drift detection: cross-sentence tu/vous register consistency; multi-sentence reasoning",
      category: "grammar-lookup",
    },
    severity: 'warning',

    explain(finding) {
      const esc = escapeHtml || (s => String(s || ''));
      const dom = finding.dominant === 'informal' ? 'tu-form (uformell)' : 'vous-form (formell)';
      return {
        nb: `Du blander tu-form og vous-form i teksten. Mesteparten bruker ${dom}. Endre <em>${esc(finding.original)}</em> til <em>${esc(finding.fix)}</em>.`,
        nn: `Du blandar tu-form og vous-form i teksten. Mesteparten brukar ${dom}. Endre <em>${esc(finding.original)}</em> til <em>${esc(finding.fix)}</em>.`,
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
          fix = FORMAL_TO_INFORMAL[m.display.toLowerCase()] || 'tu';
        } else {
          fix = INFORMAL_TO_FORMAL[m.display.toLowerCase()] || 'vous';
        }

        out.push({
          rule_id: 'doc-drift-fr-address',
          start: m.start,
          end: m.end,
          fix,
          original: m.display,
          dominant: result.dominant,
          message: result.dominant === 'informal'
            ? 'Teksten bruker mest tu-form. Her bruker du vous-form.'
            : 'Teksten bruker mest vous-form. Her bruker du tu-form.',
        });
      }

      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
