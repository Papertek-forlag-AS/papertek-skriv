/**
 * Spell-check rule: NN verb leakage detection (priority 38).
 *
 * Flags NB-only verb forms used in an NN document context. Fires when a
 * token is valid in NB (sisterValidWords) but NOT valid in NN (validWords),
 * and has a typical Norwegian verb suffix (preteritum / past participle
 * patterns: -te, -et, -de, -dde, -tte, -t, -er, -ste).
 *
 * Complements dialect-mix (priority 35) which handles a curated set of
 * high-confidence cross-dialect pairs with auto-fix. This rule catches the
 * REMAINING NB-only verb forms that fall outside the curated map, without
 * auto-fix (we lack sisterVerbInfinitive to suggest the NN form).
 *
 * Skips words already covered by dialect-mix's NB_TO_NN map.
 *
 * Rule ID: 'nn-verb-leakage'.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml, matchCase } = host.__lexiSpellCore || {};
  const applyCase = typeof matchCase === 'function' ? matchCase : (orig, s) => s;

  // Verb-like suffix patterns (lowercase). Covers most NB preteritum,
  // perfektum, and present tense endings.
  const VERB_SUFFIXES = /(?:te|et|de|dde|tte|ste|er|lte|nte|ndte)$/;

  // Words already handled by dialect-mix NB_TO_NN map — skip to avoid
  // double-flagging. This is the NB side of the map (NB words that map
  // to NN equivalents). Keep in sync with nb-dialect-mix.js NB_TO_NN keys.
  const DIALECT_MIX_NB_KEYS = new Set([
    'jeg', 'hun', 'de', 'dere', 'ikke', 'bare', 'noen', 'noe', 'mye',
    'hva', 'hvor', 'hvordan', 'hvem', 'hvorfor', 'være', 'vært', 'ble',
    'mente', 'mener', 'mene', 'høre', 'hører', 'hørt', 'sier', 'vet',
    'bytt', 'hjem', 'hjemme', 'nå', 'sammen', 'gjør', 'gjøre', 'fikk',
  ]);

  // Perfect-tense auxiliaries (NB + NN). A perfect participle is only a verb
  // form when one of these precedes it; otherwise the -et word is a noun/adj.
  const NN_PERF_AUX = new Set([
    'har', 'hadde', 'er', 'var', 'vart', 'vore', 'vorte', 'vere', 'blei', 'blitt',
  ]);

  // Distinct-leak tokens that are ALSO valid Nynorsk via a NON-verb lemma —
  // mostly plural nouns coinciding with an NB present-verb form. The noun
  // indexes don't carry these (plural forms / auto-nb noise), so they're listed
  // explicitly. Keep accepted (do not flag as leakage). Grown from the NN
  // Wikipedia precision gate.
  const OVERRIDE_KEEP = new Set([
    'lover',   // = lover (laws), plural of "lov"  (NB verb: lover = promises)
  ]);

  const rule = {
    id: 'nn-verb-leakage',
    languages: ['nn'],
    priority: 38,
    severity: 'warning',
    exam: {
      safe: true,
      reason: "Cross-language verb-form lookup; single-token; same class as dialect-mix",
      category: "grammar-lookup",
    },
    explain: (finding) => {
      const msg = `<em>${escapeHtml(finding.original)}</em> er bokmålsform — bruk nynorskforma.`;
      return { nb: msg, nn: msg };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang, suppressed } = ctx;
      if (lang !== 'nn') return [];

      // Curated (lexicon-only) accept-set, NOT the Ordbank-merged validWords:
      // the permissive Ordbank list carries NB-leaning sideforms that would
      // silence genuine leakage (e.g. "snakket", "bilene").
      const nnValid = vocab.curatedValidWords || vocab.validWords || new Set();
      const sisterValid = vocab.sisterValidWords || new Set();
      const nounGenus = vocab.nounGenus || new Map();
      const nbToNnVerbs = vocab.nbToNnVerbs || new Map();
      const nbToNnNouns = vocab.nbToNnNouns || new Map();
      const sisterVerbForms = vocab.sisterVerbForms || null;
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        // A high-confidence leakage signal: the token maps to a DISTINCT Nynorsk
        // verb form (liker→likar, betaler→betalar). Some NB present forms slip
        // into the NN accept-set (Ordbank sideforms + sister-tolerance), so a
        // bare "valid NN" check silences them. We override the accept-skip for a
        // distinct-leak — UNLESS the token is independently a real NN NOUN form
        // (nounGenus): "lover" = laws, "været" = the weather. Genuine NN VERB
        // homographs ("ber" = carries) are already safe a different way: they
        // carry NO nbToNnVerbs mapping, so isDistinctLeak is false and the
        // accept-skip is never overridden. We deliberately do NOT guard on
        // verbInfinitive: the NN verbbank has auto-nb entries, so it contains the
        // very NB forms (liker, betaler) we need to flag — using it would silence
        // exactly the leakage. See project_nn_auto_nb_data_class.
        // Restrict the accept-override to PRESENT-TENSE leakage (liker→likar):
        // that is the class the curatedValidWords skip wrongly silenced. The map
        // also holds infinitive a/e variants ("bade"→"bada") — a valid NN choice,
        // NOT leakage — and preterites ("måtte") that are valid NN; overriding on
        // those false-fired. Non-present leakage keeps its original path below.
        const xref0 = nbToNnVerbs.get(t.word);
        const isDistinctLeak = !!(xref0 && xref0.nnForm && xref0.nnForm !== t.word && xref0.field === 'presens');
        // nounGenus only carries base/singular noun forms, so plural-noun
        // homographs of an NB verb form (e.g. "lover" = laws, plural of "lov")
        // slip through. They're not derivable from the NN noun indexes either
        // (the auto-nb data muddies them), so keep a small curated keep-set of
        // distinct-leak tokens that ARE valid NN for a non-verb lemma. Guarded
        // by the NN Wikipedia precision gate — add the next miss here when it
        // surfaces.
        const nnHomograph = nounGenus.has(t.word) || OVERRIDE_KEEP.has(t.word);

        // Ordbank NN validwords gate (2026-07 sweep). Verified against the
        // official Nynorskordboka API (ord.uib.no): dual-conjugation e-verb
        // presents are STANDARD NN (like → liker el. likar; betale → betaler
        // el. betalar), and definite-noun homographs (salet, krysset, fanget,
        // liket, tunet) are ordinary nouns — flagging any of these as
        // bokmålsform mis-teaches official Nynorsk. BUT the fullform list also
        // carries non-standard rows ('snakket', 'kastet'), so membership alone
        // can't be trusted; two syntactic exemptions keep the genuine catches:
        //  (a) perfektum-partisipp xref with an auxiliary before ("har løpet
        //      eit maraton" — verb context; løpet-the-noun never follows har),
        //  (b) a subject pronoun directly before ("ho snakket") — the verb
        //      reading dominates; noun readings follow prepositions/articles
        //      ("over krysset", "på fanget", "ei manet").
        const fullNNValid = vocab.validWords;
        if (fullNNValid && typeof fullNNValid.has === 'function' && fullNNValid.has(t.word)
            && fullNNValid !== nnValid) {
          const xrefG = nbToNnVerbs.get(t.word);
          const prevG = i > 0 ? tokens[i - 1] : null;
          const NN_SUBJ = new Set(['eg', 'du', 'han', 'ho', 'vi', 'me', 'de', 'dei',
            'ein', 'nokon', 'alle', 'jeg', 'hun']);
          const perfCtx = xrefG && xrefG.field === 'perfektum_partisipp' &&
            prevG && NN_PERF_AUX.has(prevG.word);
          // Subject-context exemption is scoped to the -et weak-preterite
          // shape ONLY — the one class where the fullform list is polluted
          // ("ho snakket" must still flag). Its -er presens rows match the
          // official norm exactly ("eg liker fisk" stays accepted), and its
          // -te preterites are genuine standard NN homographs ("han talte så
          // lågt" — tale→talte; "han passerte" — passere→passerte).
          const subjCtx = prevG && NN_SUBJ.has(prevG.word) && /et$/.test(t.word);
          if (!perfCtx && !subjCtx) continue;
        }

        // Valid NN word — nothing to flag (but a distinct-leak non-homograph
        // still gets checked below).
        if (nnValid.has(t.word) && !(isDistinctLeak && !nnHomograph)) continue;

        // Not valid in NB either — not a leakage, probably a typo
        if (!sisterValid.has(t.word)) continue;

        // Already covered by dialect-mix curated map
        if (DIALECT_MIX_NB_KEYS.has(t.word)) continue;

        // Skip noun forms (NN noun lexicon)
        if (nounGenus.has(t.word)) continue;

        // Skip NB-side noun cross-ref matches: bordet, været etc. are NB
        // noun forms (definite singular, plural) — not verb leakage.
        if (nbToNnNouns.has(t.word)) continue;

        // Heuristic: only flag words with typical verb suffixes
        if (!VERB_SUFFIXES.test(t.word)) continue;

        // Positive verb-evidence gate: when the seam exposes sisterVerbForms
        // (the union of every conjugated form of every NB verb), require
        // the token to appear in it. This eliminates FPs on NB nouns,
        // adverbs, and conjunctions that happen to end in -te/-et/-de/-er
        // (e.g. 'borte', 'lenger', 'både') but aren't verbs at all. The
        // existing nbToNnVerbs xref still drives the auto-fix suggestion.
        // Falls back gracefully when sisterVerbForms is absent.
        if (sisterVerbForms && !sisterVerbForms.has(t.word)) continue;

        const xref = nbToNnVerbs.get(t.word);
        let fix = xref ? xref.nnForm : null;

        // Perfect-participle leakage (e.g. løpet→sprunge) only counts as a verb
        // form when a perfect auxiliary precedes it. Without one, the -et word
        // is a noun or adjective — "i løpet av" = "during" (løpet = the course),
        // not "har løpet". Real-NN-text finding. Require har/hadde/er/var/vart/…
        // immediately before. (NB→NN-mapped non-participle forms are unaffected.)
        if (xref && xref.field === 'perfektum_partisipp') {
          const prevTok = i > 0 ? tokens[i - 1] : null;
          if (!prevTok || !NN_PERF_AUX.has(prevTok.word)) continue;
        }

        // When the map's NN form is identical to the typed word, it's a shared
        // NB/NN form, not leakage (e.g. e-verb presents that coincide).
        if (fix && fix === t.word) continue;

        // No map entry: the unambiguous NB "-et" weak preterite/participle maps
        // regularly to the NN "-a" form (snakket→snakka, hentet→henta,
        // sluttet→slutta). Derive it and require that the "-a" form is itself a
        // valid Nynorsk word (Ordbank). This (a) supplies a concrete fix — no
        // blank "bruk nynorskforma" popover with a dead Fiks button — and
        // (b) gates the flag to cases where the NN form genuinely exists.
        // Shared/ambiguous endings (notably "-er" present, which NN also uses
        // for e-verbs: lurer, kjøper) need a confident map entry, else there's
        // no evidence of leakage.
        if (!fix) {
          if (!/et$/.test(t.word)) continue;
          const derived = t.word.slice(0, -2) + 'a';
          const fullNN = vocab.validWords || nnValid;
          if (!(fullNN && typeof fullNN.has === 'function' && fullNN.has(derived))) continue;
          fix = derived;
        }

        out.push({
          rule_id: 'nn-verb-leakage',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: applyCase(t.display, fix),
          message: `Bokmålsform: "${t.display}" → "${applyCase(t.display, fix)}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
