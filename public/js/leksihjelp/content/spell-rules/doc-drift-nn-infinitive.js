/**
 * Document-drift rule: NN a-/e-infinitiv mixing (DOC-04, priority 204).
 *
 * Phase 13 Plan 03. Detects inconsistent infinitive register within a NN
 * document: when a text mixes a-infinitiv forms (akseptera, arbeida) with
 * e-infinitiv forms (akseptere, arbeide), the minority class is flagged
 * with a fix suggestion toward the dominant class.
 *
 * CRITICAL: Classification is DATA-DRIVEN, not regex-driven. Only tokens
 * that match known dual-form infinitives from the NN verbbank are counted.
 * Verbs with only one infinitive form are register-neutral (not counted).
 * Non-verb words ending in -a (nouns, adjectives) are NOT classified.
 *
 * The infinitive classification map (nnInfinitiveClasses) is built by
 * vocab-seam-core.js during buildIndexes() and passed via ctx.vocab.
 *
 * Design: fresh-recompute per checkDocument() call. No module-level mutable
 * state. The text IS the state.
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

  // POS-context gate: a token only counts as an infinitive register marker
  // when it appears in an infinitive context. The -a / -e ending alone is
  // ambiguous in NN (preteritum / perfektum participle / f-gender definite
  // noun all also surface in -a), so context-free classification produces
  // FPs on homographs (måtte=preteritum-of-må, auka=past, merke=noun, etc.).
  //
  // An infinitive context requires the immediate preceding non-skip token
  // to be either 'å' (the infinitive marker) or a finite modal/catenative
  // that licenses a bare infinitive. Adverbs and negation between licensor
  // and infinitive are allowed.
  const INF_LICENSORS = new Set([
    // Present-tense modals
    'kan', 'kann', 'skal', 'vil', 'må', 'bør', 'lyt',
    // Past-tense modals (also infinitives themselves — only counted as
    // licensor for the FOLLOWING token; their own classification still
    // requires the same gate applied to them)
    'kunne', 'skulle', 'ville', 'måtte', 'burde', 'laut',
    // High-frequency catenatives that take bare infinitive complements
    'prøver', 'prøvde', 'prøvar', 'prøvde',
    'byrjar', 'byrja',
    'plar', 'pla',
    'brukar', 'bruka',
    'held', 'heldt',
    'fekk', 'får',
    'torer', 'torde',
    'orkar', 'orka',
    'lærer', 'lærte',
  ]);

  const INF_INTERVENORS = new Set(['ikkje', 'ikke', 'berre', 'bare', 'alltid', 'aldri', 'gjerne', 'no', 'då', 'da']);

  function hasInfinitiveContext(tokens, i) {
    // Walk backwards up to 4 tokens; skip permissible adverbs/negation.
    // First non-skip token must be 'å' or a licensor.
    for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
      const w = tokens[j].word;
      if (INF_INTERVENORS.has(w)) continue;
      if (w === 'å') return true;
      if (INF_LICENSORS.has(w)) return true;
      return false;
    }
    return false;
  }

  const rule = {
    id: 'doc-drift-nn-infinitive',
    kind: 'document',
    languages: ['nn'],
    priority: 204,
    // exam-audit 33-03: stays safe=false — Doc-drift detection: e/a-infinitive consistency across whole document
    exam: {
      safe: false,
      reason: "Stays safe=false (doc-drift-nn-infinitive) — Doc-drift detection: e/a-infinitive consistency across whole document",
      category: "grammar-lookup",
    },
    severity: 'warning',

    explain(finding) {
      const esc = escapeHtml || (s => s);
      const dom = finding.dominant || 'e-infinitiv';
      const word = finding.original || '';
      const fix = finding.fix || '';
      const base = `<em>${esc(word)}</em>`;
      const nb = `Teksten blandar a-infinitiv og e-infinitiv. Mesteparten brukar ${dom}. Endre ${base} til <em>${esc(fix)}</em>.`;
      const nn = `Teksta blandar a-infinitiv og e-infinitiv. Mesteparten nyttar ${dom}. Endre ${base} til <em>${esc(fix)}</em>.`;
      return { nb, nn, severity: 'warning' };
    },

    check(/* ctx */) {
      return [];
    },

    checkDocument(ctx, findings) {
      const detectDrift = getDetectDrift();
      if (!detectDrift) return [];

      // nnInfinitiveClasses: Map<string, {register, counterpart}>
      // Built by vocab-seam-core.js from raw NN verbbank data.
      const infMap = ctx.vocab && ctx.vocab.nnInfinitiveClasses;
      if (!infMap || infMap.size === 0) return [];

      const suppStruct = ctx.suppressedFor && ctx.suppressedFor.structural;
      const markers = [];

      // Build a set of already-flagged spans from pass-1
      const flaggedSpans = new Set();
      for (const f of findings) {
        flaggedSpans.add(f.start + ':' + f.end);
      }

      for (let i = 0; i < ctx.tokens.length; i++) {
        if (suppStruct && suppStruct.has(i)) continue;
        const tok = ctx.tokens[i];
        const entry = infMap.get(tok.word);
        if (!entry) continue;

        // POS-context gate: skip homograph matches that aren't in an
        // infinitive position (e.g. måtte as preteritum-of-må, auka as
        // perfektum participle, merke as noun in idioms).
        if (!hasInfinitiveContext(ctx.tokens, i)) continue;

        markers.push({
          register: entry.register,
          tokenIndex: i,
          start: tok.start,
          end: tok.end,
          display: tok.display,
          counterpart: entry.counterpart,
        });
      }

      const drift = detectDrift(markers, 3);
      if (!drift) return [];

      const out = [];
      for (const m of drift.minority) {
        if (flaggedSpans.has(m.start + ':' + m.end)) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: m.start,
          end: m.end,
          original: m.display,
          dominant: drift.dominant,
          fix: m.counterpart,
          message: `Infinitivblanding: "${m.display}" er ${m.register}, men teksten bruker mest ${drift.dominant}`,
        });
      }

      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
