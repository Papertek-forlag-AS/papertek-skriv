/**
 * Spell-check rule: curated typo lookup (priority 40).
 *
 * Looks up the token in the curated typoFix Map (sourced from the Papertek
 * vocabulary `typos` arrays). Skips tokens that are themselves valid words
 * to avoid false-positive corrections on legitimate spellings that happen
 * to also appear as typos for another word.
 *
 * Rule ID: 'typo' — preserved verbatim from pre-INFRA-03 inline rule.
 *
 * Co-fires with the fuzzy rule (priority 50) on the same span. dedupeOverlapping
 * keeps THIS finding (lower priority = runs first = wins overlap), so curated
 * suggestions take precedence over fuzzy guesses on the same token.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};
  const isLikelyProperNoun =
    typeof (host.__lexiSpellCore || {}).isLikelyProperNoun === 'function'
      ? host.__lexiSpellCore.isLikelyProperNoun
      : function fallbackIsProperNoun() { return false; };

  const GLOBAL_WHITELIST = new Set(['will', 'die', 'der', 'das', 'den', 'ein', 'eine']);

  // Phase 46 (NN spell-check quality loop, round 2): "Lær mer" pedagogy
  // for NN noun-plural-class typos. Attaches when in NN context, the
  // original token ends with a plural-shaped suffix, and the fix is a
  // known noun lemma — i.e. the student is confusing the NN plural class
  // (gutar/jenter/hus/-a) of a specific noun. Surfaced via finding.pedagogy
  // and rendered by spell-check-renderer's "Lær mer" panel.
  //
  // Pedagogy content sourced from papertek-vocabulary:
  //   vocabulary/lexicon/nn/grammarbank.json → pedagogy.nn_noun_plurals
  // The seam (vocab-seam-core.js) walks grammarbank.pedagogy and surfaces
  // each entry under vocab.rulePedagogy keyed by entry id. Same architecture
  // as es-gustar (Phase 32-03). No inline fallback — if the entry is missing
  // from the bundled data, no pedagogy attaches and the typo finding falls
  // back to the plain explain() output (no broken UI).
  const NN_PLURAL_SUFFIX_RE = /(?:ar|er|ane|ene|a)$/i;

  const rule = {
    id: 'typo',
    languages: ['nb', 'nn', 'en', 'de', 'es', 'fr'],
    priority: 40,
    exam: {
      safe: true,
      reason: "Token-level curated typo correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    // F48-1A (v3.0.40): softer phrasing — the curated typo bank mixes pure
    // spelling errors (`farvell` → `farvel`) with register-class transfers
    // (`dems` → `deres`, a dialect/NN-leakage shape, not a misspelling per se).
    // "kan være" lets both classes read naturally; categorical phrasing per
    // typo entry is deferred to F48-1B (Phase 45-adjacent, needs a `category`
    // field on the upstream typo bank).
    explain: (finding) => ({
      nb: `<em>${escapeHtml(finding.original)}</em> kan være en vanlig skrivefeil — prøv <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `<em>${escapeHtml(finding.original)}</em> kan vere ein vanleg skrivefeil — prøv <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed, lang } = ctx;
      const validWords = vocab.validWords || new Set();
      const sisterValidWords = vocab.sisterValidWords || new Set(); // Phase 4 / SC-03
      const typoFix = vocab.typoFix || new Map();
      // Use nounGenus (lemma + inflected forms) not nounLemmaGenus — the
      // latter is built in vocab-seam-core but EXEMPT from the seam
      // exposure (closure-bound, used only for compound decomposition).
      // nounGenus is exposed via VOCAB.getNounGenus() and reaches the
      // browser rule ctx. Catches both lemma fixes ("hus") and inflected
      // fixes ("guten") emitted by the typo bank.
      const nounGenus = vocab.nounGenus || new Map();
      const rulePedagogy = vocab.rulePedagogy || new Map();
      const nnNounPluralPedagogy = lang === 'nn' ? rulePedagogy.get('nn_noun_plurals') : null;
      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue; // Phase 4 / SC-02 + SC-04

        // Goal-loop 2 (2026-06-12): contextual real-word confusables. Both
        // words are valid (and sister-valid), so the typo bank and every
        // validity guard below would skip them — the context disambiguates.
        // hvert/vært is THE classic NB homophone error («Vi har hvert på
        // hytta») and is invisible to Hunspell-class checkers. Conservative
        // closed patterns only; placed BEFORE the validity early-exits.
        if (lang === 'nb') {
          const prevW = i > 0 ? tokens[i - 1].word : '';
          const nextW = tokens[i + 1] ? tokens[i + 1].word : '';
          let confFix = null;
          // ha-form + hvert → vært («har hvert på hytta»)
          if (t.word === 'hvert' && (prevW === 'har' || prevW === 'hadde' || prevW === 'ha')) confFix = 'vært';
          // vært + eneste → hvert («vært eneste sommer»)
          else if (t.word === 'vært' && nextW === 'eneste') confFix = 'hvert';
          if (confFix) {
            out.push({
              // Lær mer wave (2026-06-13): emit rule_id 'homophone', not
              // 'typo' — hvert/vært ARE homophones, so the central
              // pedagogy attach (spell-check-core.js: rulePedagogy.get) wires
              // the existing 'homophone' Lær mer lesson + dot colour for
              // free. A bare 'typo' carries no lesson (no generic typo key,
              // by design). type === rule_id, so the dot paints lh-spell-
              // homophone (already CSS-wired + popover-surfacing).
              rule_id: 'homophone',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, confFix),
              message: `Lett å forveksle: "${t.display}" → "${confFix}"`,
            });
            continue;
          }
        }

        if (GLOBAL_WHITELIST.has(t.word)) continue;

        // Abbreviation guard — same one as nb-typo-fuzzy, because the two
        // typo rules split the work and «prof. Hansen» was caught by this
        // one while «cand. jur.» was caught by the other. Fixing only the
        // rule that happened to appear in the first test would have looked
        // like a fix and left half the class live.
        if (ctx.text && ctx.text[t.end] === '.') {
          const abbrevFor = host.__lexiAbbrev && host.__lexiAbbrev.setFor;
          if (abbrevFor && abbrevFor(ctx.lang).has((t.word + '.').toLowerCase())) continue;
        }
        // Phase 4 / SC-03 + Phase 05.1 Gap D co-existence: the cross-dialect
        // early-exit is preserved as a data-gap shield. Tokens in
        // sisterValidWords fall into two buckets: (a) genuine cross-dialect
        // markers captured by the nb-dialect-mix CROSS_DIALECT_MAP (priority
        // 35 — wins over this rule via dedupeOverlapping) and (b)
        // morphologically shared forms missing from the current dialect's
        // data (kjøkkenet, klokka, kaldt — still genuine Norwegian). The
        // early-exit keeps Phase 4's silent-tolerance shield for bucket (b);
        // dedupeOverlapping surfaces bucket (a) as dialect-mix.
        if (sisterValidWords.has(t.word)) continue;
        // v3.0.118: the uppercase single letter "I" is the English pronoun —
        // ES carries a curated i→y entry (Norwegian "i" for Spanish "y") that
        // would otherwise fire on English sentences quoted/pasted in any
        // language ("I go to school"). Single-letter cross-language
        // corrections on capitalized I are FP-prone everywhere.
        if (t.display === 'I') continue;
        // v3.0.137 (Wikipedia corpus): mid-sentence capitalized token is a
        // proper noun — curated typo keys collide with names («Chris Slade»
        // hit skade_verb's typo «slade» → suggested «Skade»). NB/NN only:
        // German capitalizes all nouns, so the cue is meaningless there.
        if ((lang === 'nb' || lang === 'nn') &&
            isLikelyProperNoun(t, i, tokens, ctx.text)) continue;
        // Anglicismbank loanwords — owned by nb-anglicism, not the typo bank
        // (mirrors the nb-typo-fuzzy skip; curated typo keys can collide with
        // loanword surface forms like "basic"/"random").
        if ((lang === 'nb' || lang === 'nn') &&
            vocab.anglicismWords && vocab.anglicismWords.has(t.word)) continue;
        // FR elided clitic ("m'intéresse", "s'ouvre", "s'arrête", "qu'elle"):
        // the typo bank sometimes lists the valid reflexive/elided form as a
        // "typo" of the bare infinitive (the typo-generator-valid-forms bug),
        // and the whole clitic token isn't enumerated in validWords. Accept
        // when the post-apostrophe base is a valid word. Mirrors the guard in
        // nb-typo-fuzzy.js.
        if (lang === 'fr') {
          const mEl = t.word.match(/^(?:[jlmtscdn]|qu)['’](.+)$/i);
          if (mEl && validWords.has(mEl[1])) continue;
        }
        // ES enclitic: a verb with attached object pronoun(s) — "convencerle",
        // "reinícialo", "sírveme". The typo bank lists these valid forms as
        // typos of the bare infinitive. Accept when stripping a trailing
        // enclitic cluster leaves a valid verb form (de-accented, to absorb the
        // stress accent that enclisis adds: reinícialo → reinicia).
        if (lang === 'es' && t.word.length >= 5) {
          const deAcc = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
          const ES_ENCL = ['noslos', 'noslas', 'oslos', 'oslas', 'melos', 'melas', 'telos', 'telas', 'selos', 'selas',
            'noslo', 'nosla', 'oslo', 'osla', 'melo', 'mela', 'telo', 'tela', 'selo', 'sela',
            'nos', 'los', 'las', 'les', 'me', 'te', 'se', 'lo', 'la', 'le', 'os'];
          let enclOk = false;
          for (const enc of ES_ENCL) {
            if (t.word.endsWith(enc)) {
              const base = t.word.slice(0, -enc.length);
              if (base.length >= 3 && (validWords.has(base) || validWords.has(deAcc(base)))) { enclOk = true; break; }
            }
          }
          if (enclOk) continue;
        }
        if (typoFix.has(t.word) && !validWords.has(t.word)) {
          const correct = typoFix.get(t.word);
          const finding = {
            rule_id: 'typo',
            priority: rule.priority,
            start: t.start,
            end: t.end,
            original: t.display,
            fix: matchCase(t.display, correct),
            message: `Skrivefeil: "${t.display}" → "${correct}"`,
          };
          // Phase 46 round 2: attach NN noun-plural pedagogy when this typo
          // looks like a plural-class confusion — original ends with a
          // plural-shaped suffix AND fix is a known noun lemma. Limited to
          // NN context so we don't surface the NN-plural-by-gender table
          // on NB or other-language typos.
          if (nnNounPluralPedagogy &&
              NN_PLURAL_SUFFIX_RE.test(t.word) &&
              nounGenus.has(correct.toLowerCase())) {
            finding.pedagogy = nnNounPluralPedagogy;
          }
          out.push(finding);
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
