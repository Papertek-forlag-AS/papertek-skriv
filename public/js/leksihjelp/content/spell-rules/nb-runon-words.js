/**
 * Spell-check rule: NB/NN run-on words (priority 45).
 *
 * Phase 48 Wave B-6. Detects two real words written without a space
 * between them:
 *   "ungdommenemå rope"  → "ungdommene må rope"
 *   "hanharsett"         → "han har sett"
 *
 * Distinct from nb-sarskriving (which detects the inverse: a valid
 * compound written as two words). The run-on case typically pairs a
 * noun/pronoun + a short modal/auxiliary the student forgot to
 * separate.
 *
 * Detection: token is unknown to validWords, ≥ 6 chars, and splits at
 * exactly one boundary where left ∈ validWords AND right ∈ a curated
 * short-function-word set (modals, auxiliaries, common short adverbs).
 * The right-hand set is curated rather than "anything in validWords"
 * because two-noun concatenations are productive compounds that
 * nb-typo-fuzzy's compound-suppression already handles silently.
 *
 * Priority 45 sits between curated typos (40) and fuzzy (50), so the
 * run-on finding wins overlap with the fuzzy fallback's wrong
 * suggestion.
 *
 * Rule ID: 'typo' (reuses the existing typo dot colour + popover
 * styling; the finding's fix shows the split form).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml, matchCase, editDistance, candidateIndex } = host.__lexiSpellCore || {};

  // A run-on requires TWO whole words jammed together. If the unknown token
  // is within a SINGLE edit of a real word, the one-typo explanation is far
  // more likely than two words mashed together — e.g. "vakner" is one edit
  // from "vaknar" (NN present of `vakne`), not "vakn" + "er". When such a
  // neighbour exists, the run-on rule stands down and lets nb-typo-fuzzy
  // (priority 50) surface the real single-word correction. Mirrors fuzzy's
  // candidate scan (same first char, length within ±1) to stay cheap.
  function hasSingleEditNeighbor(word, validWords) {
    if (typeof editDistance !== 'function') return false;
    const len = word.length;
    const first = word[0];
    // Ytelse (27.08.2026): samme fulle validWords-skanning som fuzzy hadde.
    // Her er svaret en boolsk «finnes det én?», så rekkefølgen betyr
    // ingenting — bøttene gir nøyaktig samme mengde å lete i.
    const cIdx = typeof candidateIndex === 'function' ? candidateIndex(validWords) : null;
    if (cIdx) {
      for (let cl = len - 1; cl <= len + 1; cl++) {
        if (cl < 1) continue;
        const b = cIdx.bucket(first, cl);
        if (!b) continue;
        for (let i = 0; i < b.words.length; i++) {
          const cand = b.words[i];
          if (cand === word) continue;
          if (editDistance(word, cand, 1) <= 1) return true;
        }
      }
      return false;
    }
    for (const cand of validWords) {
      if (cand === word) continue;
      if (cand[0] !== first) continue;
      if (Math.abs(cand.length - len) > 1) continue;
      if (editDistance(word, cand, 1) <= 1) return true;
    }
    return false;
  }

  // Curated set of short function words students commonly run together
  // with the preceding word. Each ≤ 4 chars to keep the heuristic high
  // precision — longer "right" parts almost always indicate a productive
  // compound (handled by nb-typo-fuzzy's compound-suppression).
  const RIGHT_TAILS_NB = new Set([
    // modals
    'må', 'kan', 'vil', 'skal', 'bør',
    // auxiliaries
    'har', 'er', 'var', 'ble', 'blir',
    // short adverbs / particles
    'ikke', 'kun', 'jo', 'nå', 'da',
    // pronouns (subject)
    'jeg', 'han', 'hun', 'vi', 'de', 'det', 'den',
  ]);
  const RIGHT_TAILS_NN = new Set([
    // NN variants
    'må', 'kan', 'vil', 'skal', 'bør',
    'har', 'er', 'var', 'vart', 'blir', 'vert',
    'ikkje', 'kun', 'jo', 'no', 'då',
    'eg', 'han', 'ho', 'vi', 'dei', 'det', 'den',
  ]);

  function tails(lang) {
    return lang === 'nn' ? RIGHT_TAILS_NN : RIGHT_TAILS_NB;
  }

  const rule = {
    id: 'nb-runon-words',
    languages: ['nb', 'nn'],
    priority: 45,
    exam: {
      safe: true,
      reason: "Pattern-matched run-on detection — splits unknown token into known-word + curated-function-word",
      category: "spellcheck",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Det ser ut som to ord er klistret sammen. Skriv <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `Det ser ut som to ord er klistra saman. Skriv <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed, lang } = ctx;
      if (lang !== 'nb' && lang !== 'nn') return [];
      const validWords = vocab.validWords || new Set();
      const rightSet = tails(lang);
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;
        const w = t.word;
        if (w.length < 6) continue;
        if (validWords.has(w)) continue;

        // Try each split point. Cap right.length at 4 — beyond that we're
        // in productive-compound territory (handled elsewhere).
        let bestLeft = null;
        let bestRight = null;
        for (let s = w.length - 4; s <= w.length - 2; s++) {
          if (s < 3) continue;
          const left = w.slice(0, s);
          const right = w.slice(s);
          if (!rightSet.has(right)) continue;
          if (!validWords.has(left)) continue;
          // Prefer the LONGEST left (most specific match); on ties prefer
          // the shorter right tail.
          if (bestLeft == null || left.length > bestLeft.length) {
            bestLeft = left;
            bestRight = right;
          }
        }
        if (bestLeft == null) continue;

        // Single-edit-typo precedence: skip the run-on split when the whole
        // token is one edit from a real word (let fuzzy suggest that word).
        if (hasSingleEditNeighbor(w, validWords)) continue;

        const fix = matchCase(t.display, bestLeft) + ' ' + bestRight;
        out.push({
          rule_id: 'typo',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: fix,
          message: `Manglende mellomrom: «${t.display}» → «${fix}»`,
        });
        if (suppressed) suppressed.add(i);
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
