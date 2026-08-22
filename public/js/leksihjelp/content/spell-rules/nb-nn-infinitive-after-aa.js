/**
 * Spell-check rule: finite verb form after the infinitive marker "å"
 * (priority 35). NB + NN.
 *
 * NB path: uses verbInfinitive directly (clean — NB seam has no sister
 * pollution in this direction).
 *
 * NN path (Phase 46 round 4): the NN seam's verbInfinitive map carries
 * sister-dialect pollution — canonical NN infinitives like `sjå`/`velje`
 * get tagged as inflections of their NB counterparts (`se`/`velge`). To
 * avoid suggesting NB-form fixes to NN students, the NN side gates on
 * `vocab.nnCanonicalInfinitives` (a trusted Set built directly from NN
 * verbbank entry.word fields in vocab-seam-core's
 * buildNNCanonicalInfinitives). Two filters apply only in NN context:
 *   1. The candidate token is skipped if it's IN nnCanonicalInfinitives
 *      (it's already a NN infinitive — verbInfinitive may have a stale
 *      NB lemma mapping for it but no correction is needed).
 *   2. The fix form (verbInfinitive.get value) is required to be IN
 *      nnCanonicalInfinitives — otherwise we'd be suggesting NB
 *      infinitives like "se"/"velge" instead of NN "sjå"/"velje".
 *
 * Pedagogical target — students often inflect the verb after the
 * infinitive marker "å" instead of using the infinitive form:
 *
 *   "Eg likar å gjekk"   → "Eg likar å gå"        (gjekk is preteritum)
 *   "Han prøvde å spiser" → "Han prøvde å spise"  (spiser is present)
 *   "Vi planlegg å las"  → "Vi planlegg å lese"   (las is preteritum)
 *
 * Detection: the token "å" followed (directly) by a known inflected
 * verb form. Recognition relies on vocab.verbInfinitive — a finite-form
 * → infinitive map built by vocab-seam-core. If the word is a known
 * inflection AND isn't itself a canonical infinitive surface form AND
 * isn't a homograph noun, flag it with the infinitive as the fix.
 *
 * Negative gates (V1, conservative):
 *   - Skip if "å" is sentence-initial (interjection: "Å nei!")
 *   - Skip if the preceding token is a comma or other sentence-internal
 *     break (still interjection: "..., å vel.")
 *   - Skip if the target word is itself a canonical infinitive surface
 *     form anywhere in the verbbank (handles phrasal-verb pollution:
 *     verbInfinitive may map 'lese' → 'lese høyt' due to the phrasal-
 *     verb entry sharing the bare stem of the simplex entry)
 *   - Skip if the target word is also a known noun (homograph dodge)
 *   - Skip if the verbInfinitive value is multi-word (no single-token
 *     replacement available — would require splicing, out of scope V1)
 *
 * Rule ID: 'nb-nn-infinitive-after-aa'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml, matchCase } = host.__lexiSpellCore || {};

  // Memoized per-call: built once per check from vocab.verbInfinitive.
  // Cached against the Map identity so repeat checks within the same
  // session reuse the index without rebuild.
  let cachedFor = null;
  let cachedSet = null;
  function buildCanonicalInfinitiveSet(verbInfinitive) {
    if (cachedFor === verbInfinitive && cachedSet) return cachedSet;
    const out = new Set();
    for (const inf of verbInfinitive.values()) {
      if (typeof inf !== 'string') continue;
      out.add(inf);
      // Phrasal-verb pollution mitigation: first word of multi-word
      // infinitives (`lese høyt` → adds `lese`) so a bare-stem token
      // that's also the simplex lemma doesn't get false-flagged.
      const space = inf.indexOf(' ');
      if (space > 0) out.add(inf.slice(0, space));
    }
    cachedFor = verbInfinitive;
    cachedSet = out;
    return out;
  }

  const rule = {
    id: 'nb-nn-infinitive-after-aa',
    languages: ['nb', 'nn'],
    priority: 35,
    exam: {
      safe: false,
      reason: "Two-token grammatical pattern (infinitive marker + finite verb form) — multi-token grammatical reasoning, not single-form lookup",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain(finding) {
      const esc = escapeHtml || (s => s);
      const orig = esc(finding.original || '');
      const fix = esc(finding.fix || '');
      const nb = `Etter infinitivsmerket <em>å</em> skal verbet stå i infinitiv. Bytt <em>${orig}</em> med infinitivsforma <em>${fix}</em>.`;
      const nn = `Etter infinitivsmerket <em>å</em> skal verbet stå i infinitiv. Bytt <em>${orig}</em> med infinitivsforma <em>${fix}</em>.`;
      return { nb, nn };
    },

    check(ctx) {
      const { tokens, vocab, lang, cursorPos, suppressed } = ctx;
      if (lang !== 'nb' && lang !== 'nn') return [];

      const verbInfinitive = vocab.verbInfinitive || new Map();
      const nounGenus = vocab.nounGenus || new Map();
      if (verbInfinitive.size === 0) return [];

      const canonicalInfinitives = buildCanonicalInfinitiveSet(verbInfinitive);
      // Phase 46 round 4: trusted NN canonical-infinitive set, drawn
      // straight from raw.verbbank in the seam (no sister pollution).
      // Empty Set in NB context — every NN-side filter below is a no-op
      // when isNN is false.
      const isNN = lang === 'nn';
      const nnCanonicalInfinitives = isNN ? (vocab.nnCanonicalInfinitives || new Set()) : null;
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const tA = tokens[i];
        if (tA.word !== 'å') continue;
        if (suppressed && suppressed.has(i)) continue;

        // Skip interjection contexts. A sentence-initial "å" is almost
        // always an interjection (Å nei, Å, kva no?). The sentences[]
        // array may not exist in all test contexts; fall back to
        // checking whether the previous non-skip token is a sentence-
        // ending punctuation mark.
        if (i === 0) continue;
        const prev = tokens[i - 1];
        if (prev && (prev.word === ',' || prev.word === '.' || prev.word === '!' || prev.word === '?' || prev.word === ';')) continue;
        // Sentence-internal capitalization on "Å" — also likely an
        // interjection appearing mid-paragraph after a sentence break
        // the tokenizer didn't preserve.
        if (tA.display && tA.display[0] === 'Å') continue;

        const tB = tokens[i + 1];
        if (!tB) continue;
        if (cursorPos != null && cursorPos >= tB.start && cursorPos <= tB.end + 1) continue;

        const fixForm = verbInfinitive.get(tB.word);
        if (!fixForm) continue;
        if (fixForm === tB.word) continue;          // already infinitive
        if (fixForm.indexOf(' ') !== -1) continue;   // multi-word; can't single-token-replace
        if (canonicalInfinitives.has(tB.word)) continue; // tB is itself a canonical infinitive
        if (nounGenus.has(tB.word)) continue;       // homograph noun — too risky
        // s-passive infinitive after å is CORRECT ("dømt til å brennes",
        // "trenger å byttes ut") — never suggest the active infinitive.
        if ((vocab.sPassivForms && vocab.sPassivForms.has(tB.word)) ||
            (tB.word.endsWith('s') && tB.word === fixForm + 's')) continue;
        // Phase 46 round 4 NN guard: skip if tB is already a NN canonical
        // infinitive (verbInfinitive may carry a stale NB-side mapping for
        // it via cross-dialect entry merging); also skip if the proposed
        // fix isn't a NN canonical infinitive (don't suggest NB-form fixes
        // to NN students). Both checks are no-ops in NB context.
        if (isNN && nnCanonicalInfinitives.has(tB.word)) continue;
        if (isNN && !nnCanonicalInfinitives.has(fixForm.toLowerCase())) continue;
        // a-infinitiv («å satsa», «å utnytta», «å sykla») is a fully valid
        // Nynorsk norm choice, but nnCanonicalInfinitives is built from the
        // verbbank's e-forms only — so the guard above never fires for it
        // and the a-form reads as an inflection. Treat the token as an
        // a-infinitive when swapping -a → -e lands in the canonical set.
        // Safe against the rule's real targets, which don't end in -a
        // («å gjekk», «å spiser», «å las»). Weak preteritums are ambiguous
        // («å kasta»); we resolve in favour of skipping, because the valid
        // reading exists and the rule cannot tell the two apart.
        // The durable fix is data — a-forms in the NN verbbank upstream.
        if (isNN && tB.word.endsWith('a') &&
            nnCanonicalInfinitives.has(tB.word.slice(0, -1) + 'e')) continue;

        const fix = matchCase ? matchCase(tB.display, fixForm) : fixForm;
        out.push({
          rule_id: 'nb-nn-infinitive-after-aa',
          priority: rule.priority,
          severity: 'warning',
          start: tB.start,
          end: tB.end,
          original: tB.display,
          fix,
          message: `Etter "å" skal verbet stå i infinitiv: "${tB.display}" → "${fix}".`,
        });
      }

      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
