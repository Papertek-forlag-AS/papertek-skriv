/**
 * Document-drift rule: NB bokmal/riksmal register mixing (DOC-03, priority 203).
 *
 * Phase 13 Plan 03. Detects inconsistent register within a NB document:
 * when a text mixes modern bokmal forms (boka, gata, etter) with
 * conservative riksmal forms (boken, gaten, efter), the minority register's
 * tokens are flagged with a fix suggestion toward the dominant register.
 *
 * Uses BOKMAL_RIKSMAL_MAP from grammar-tables.js (Plan 01) for high-confidence
 * riksmal<->bokmal form pairs. Both lexical markers (efter/etter, sne/sno,
 * nu/na) and morphological markers (boken/boka, gaten/gata) are detected.
 *
 * Design: fresh-recompute per checkDocument() call. No module-level mutable
 * state. The text IS the state.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml, matchCase } = host.__lexiSpellCore || {};

  // Lazy access: grammar-tables.js may load after this file alphabetically.
  function getDetectDrift() {
    return host.__lexiGrammarTables && host.__lexiGrammarTables.detectDrift;
  }
  function getMap() {
    return host.__lexiGrammarTables && host.__lexiGrammarTables.BOKMAL_RIKSMAL_MAP;
  }
  function getLexicalForms() {
    return (host.__lexiGrammarTables && host.__lexiGrammarTables.LEXICAL_RIKSMAL_FORMS) || new Set();
  }

  // Reverse map (bokmal-form -> riksmal-form) built lazily on first call.
  // Deterministic derivation from immutable BOKMAL_RIKSMAL_MAP — safe to cache.
  let _reverseMap = null;
  function getReverseMap() {
    if (_reverseMap) return _reverseMap;
    const map = getMap();
    if (!map) return null;
    _reverseMap = new Map();
    for (const [riksmal, bokmal] of map) {
      _reverseMap.set(bokmal, riksmal);
    }
    return _reverseMap;
  }

  const rule = {
    id: 'doc-drift-nb-register',
    kind: 'document',
    languages: ['nb'],
    priority: 203,
    // exam-audit 33-03: stays safe=false — Doc-drift detection: register-consistency across whole document
    exam: {
      safe: false,
      reason: "Stays safe=false (doc-drift-nb-register) — Doc-drift detection: register-consistency across whole document",
      category: "grammar-lookup",
    },
    severity: 'warning',

    explain(finding) {
      const esc = escapeHtml || (s => s);
      const word = finding.original || '';
      const fix = finding.fix || '';
      const earlier = finding.earlierForm || fix;
      const dom = finding.dominant || 'bokmal';
      const base = `<em>${esc(word)}</em>`;
      // Two emission shapes: intra-pair conflict (earlierForm is a real
      // earlier-seen surface form) vs cross-pair tilt (earlierForm is the
      // suggested fix only). They differ visually in the popover wording.
      const isIntraPair = !!finding.earlierForm
        && finding.earlierForm.toLowerCase() !== fix.toLowerCase()
        && finding.earlierForm.toLowerCase() !== word.toLowerCase();
      let nb, nn;
      if (isIntraPair) {
        nb = `Du har brukt både <em>${esc(earlier)}</em> og ${base} i samme tekst. Velg én form og hold den gjennom hele teksten — endre ${base} til <em>${esc(fix)}</em>.`;
        nn = `Du har brukt både <em>${esc(earlier)}</em> og ${base} i same teksten. Vel éi form og hald henne gjennom heile teksten — endre ${base} til <em>${esc(fix)}</em>.`;
      } else {
        nb = `Resten av teksten er ${dom === 'bokmal' ? 'bokmål' : 'riksmål'} — ${base} skiller seg ut. Mente du <em>${esc(fix)}</em>?`;
        nn = `Resten av teksta er ${dom === 'bokmal' ? 'bokmål' : 'riksmål'} — ${base} skil seg ut. Meinte du <em>${esc(fix)}</em>?`;
      }
      // Inline mini-pedagogy ("Lær mer" content). The popover renderer reads
      // .pedagogy off the finding when present; until papertek-vocabulary
      // ships authored entries, we provide a baked-in explanation here so
      // the educational surface works today.
      const pedagogy = {
        summary: {
          nb: 'Bokmål tillater både -a (jenta) og -en (jenten) for hokjønnsord. Velg én form og hold deg til den gjennom hele teksten.',
          nn: 'Bokmål tillèt både -a (jenta) og -en (jenten) for hokjønnsord. Vel éi form og hald henne gjennom heile teksten.',
          en: 'Bokmål allows both -a (jenta) and -en (jenten) feminine definite forms. Pick one and use it consistently throughout the text.',
        },
        explanation: {
          nb: 'Bokmål har flere valgfrie former. Hokjønnsord kan ende på <code>-a</code> (jenta, boka, gata) eller <code>-en</code> (jenten, boken, gaten). Begge er lov i bokmål, men <code>-en</code>-formene tilhører <em>riksmål</em> — en mer konservativ tradisjon. Det som teller er at du er konsekvent: ikke bytt mellom formene midt i en tekst.',
          nn: 'Bokmål har fleire valfrie former. Hokjønnsord kan ende på <code>-a</code> (jenta, boka, gata) eller <code>-en</code> (jenten, boken, gaten). Begge er lov, men <code>-en</code>-formene høyrer til <em>riksmål</em> — ein meir konservativ tradisjon. Det som tel er at du er konsekvent.',
          en: 'Bokmål has multiple optional forms. Feminine nouns can end in <code>-a</code> (jenta, boka, gata) or <code>-en</code> (jenten, boken, gaten). Both are valid bokmål, but the <code>-en</code> forms belong to <em>riksmål</em>, a more conservative tradition. What matters is consistency — don’t switch between forms within one text.',
        },
      };
      return { nb, nn, severity: 'warning', pedagogy };
    },

    check(/* ctx */) {
      return [];
    },

    checkDocument(ctx, findings) {
      const detectDrift = getDetectDrift();
      const MAP = getMap();
      const REVERSE = getReverseMap();
      const LEXICAL = getLexicalForms();
      if (!MAP || !REVERSE || !detectDrift) return [];

      const suppStruct = ctx.suppressedFor && ctx.suppressedFor.structural;

      // Already-flagged spans from pass-1 — don't emit on top of those.
      const flaggedSpans = new Set();
      for (const f of findings) {
        flaggedSpans.add(f.start + ':' + f.end);
      }

      // Lexical riksmal forms (efter, sne, nu, fandt, sagde) are handled by
      // the dedicated `nb-riksmal-lexical` rule (priority 40) — skip them
      // entirely so they can't tip a doc into being labelled "majority
      // riksmal", which would wrongly flag valid bokmal forms like Jenta or
      // gata as needing conversion to jenten/gaten.
      //
      // Two layered detections, in order:
      //
      // 1. INTRA-PAIR CONFLICT (high-confidence): if a single lemma-pair
      //    appears in BOTH forms within the document (e.g. "Jenta" then
      //    "jenten"), flag every later occurrence of whichever form differs
      //    from the FIRST-seen one. This is exactly the "use one form
      //    consistently" feedback students need.
      //
      // 2. CROSS-PAIR REGISTER TILT (fallback): markers in pairs that did
      //    NOT trigger conflict detection feed into the original "majority
      //    register, flag minority" heuristic with minCount=3. Catches the
      //    "everything is bokmal except this one boken" case where intra-
      //    pair detection wouldn't fire (only one side of the boka/boken
      //    pair appears).
      //
      // pairKey = canonical bokmal form (right-hand column of the map).
      function pairKeyOf(w) {
        if (LEXICAL.has(w)) return null;
        if (MAP.has(w)) return MAP.get(w);
        if (REVERSE.has(w)) return w;
        return null;
      }

      const allMarkers = [];
      const firstByPair = new Map();
      const conflictedPairs = new Set();

      for (let i = 0; i < ctx.tokens.length; i++) {
        if (suppStruct && suppStruct.has(i)) continue;
        const tok = ctx.tokens[i];
        const w = tok.word;
        if (LEXICAL.has(w)) continue;

        const isRiksmal = MAP.has(w);
        const isBokmal = REVERSE.has(w);
        if (!isRiksmal && !isBokmal) continue;

        const key = pairKeyOf(w);
        if (!key) continue;
        const register = isRiksmal ? 'riksmal' : 'bokmal';
        const counterpart = isRiksmal ? MAP.get(w) : REVERSE.get(w);
        const marker = {
          register, key, counterpart,
          tokenIndex: i,
          start: tok.start,
          end: tok.end,
          display: tok.display,
        };
        allMarkers.push(marker);
        const first = firstByPair.get(key);
        if (!first) {
          firstByPair.set(key, marker);
        } else if (first.register !== register) {
          conflictedPairs.add(key);
        }
      }

      const out = [];

      // Detection 1: intra-pair conflicts. Flag every later occurrence whose
      // register differs from the first-seen marker for that pair.
      for (const m of allMarkers) {
        if (!conflictedPairs.has(m.key)) continue;
        const first = firstByPair.get(m.key);
        if (m === first) continue;
        if (m.register === first.register) continue;
        if (flaggedSpans.has(m.start + ':' + m.end)) continue;
        const fixSurface = matchCase ? matchCase(m.display, first.display.toLowerCase()) : first.display.toLowerCase();
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: m.start,
          end: m.end,
          original: m.display,
          dominant: first.register,
          fix: fixSurface,
          earlierForm: first.display,
          message: `Inkonsekvent register: tidligere brukte du "${first.display}", men her står "${m.display}".`,
        });
      }

      // Detection 2: cross-pair register tilt over markers that didn't hit
      // an intra-pair conflict. Reuses Phase-13 detectDrift with minCount=3
      // — preserves prior behaviour for "3 bokmal + 1 riksmal" style cases.
      const remaining = allMarkers.filter(m => !conflictedPairs.has(m.key));
      const drift = detectDrift(remaining, 3);
      if (drift) {
        for (const m of drift.minority) {
          if (flaggedSpans.has(m.start + ':' + m.end)) continue;
          const fixSurface = matchCase ? matchCase(m.display, m.counterpart) : m.counterpart;
          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: m.start,
            end: m.end,
            original: m.display,
            dominant: drift.dominant,
            fix: fixSurface,
            earlierForm: m.counterpart,
            message: `Registerblanding: "${m.display}" er ${m.register}, men teksten bruker mest ${drift.dominant}`,
          });
        }
      }

      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
