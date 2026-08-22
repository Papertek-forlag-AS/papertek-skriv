/**
 * Spell-check rule: NN finite s-passive without modal verb (priority 25).
 *
 * Phase 19 Plan 02 — DEBT-04. Nynorsk restricts s-passive to infinitive
 * form after modal verbs (kan, skal, ma, etc.). Finite s-passive ("Boka
 * lesast av mange") is an error — students should use bli/verte-passive.
 *
 * St-verbs / deponent verbs (synast, lykkast) are excluded — they are
 * lexicalised and not passive constructions.
 *
 * Bli/verte + participle is accepted as valid NN passive (basic acceptance;
 * full gender/number participle agreement is deferred to a future phase).
 *
 * Rule ID: 'nn_passiv_s'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // NN modal verbs that license s-passive infinitive.
  // 'vil' is EXCLUDED per Sprakradet: NN 'vil' = personal will, not future.
  // Include both diacritic forms (må/måtte/bør) AND ASCII fallbacks
  // (ma/matte/bor) — tokens are not normalized before lookup, so the
  // set must contain the surface form the tokenizer emits. Without
  // 'må' the rule false-fires on every valid "må målast" passive.
  const NN_PASSIV_MODALS = new Set([
    'kan', 'kunna', 'kunne',
    'må', 'måtte', 'ma', 'matte',
    'skal', 'skulle',
    'bør', 'burde', 'bor',
    'lyt', 'laut', 'lyte', 'lyta',   // NN «lyta» = must ("den sjuke lyt matast")
  ]);

  // Adverbs allowed between the modal and the s-passive infinitive:
  // "kan IKKJE merkast", "må IKKJE overdrivast", "kan GODT nyttast".
  const MODAL_ADVERBS = new Set([
    'ikkje', 'ikke', 'aldri', 'alltid', 'godt', 'berre', 'bare', 'gjerne',
    'kanskje', 'nok', 'vel', 'også', 'òg', 'framleis', 'truleg',
  ]);

  // Subject pronouns that can sit between modal and s-passive in inversion:
  // "Kan ein skrivast ...?" → modal + pronoun + s-passive = valid.
  const SUBJECT_PRONOUNS = new Set([
    'eg', 'du', 'han', 'ho', 'det', 'den', 'vi', 'de', 'dei',
    'ein', 'man',
  ]);

  // How far back the modal may sit from its s-passive infinitive, counted in
  // tokens. 4 covers the longest adverbial seen on real NN prose ("kan mellom
  // anna brukast" — two intervening tokens) with one to spare; beyond that the
  // odds of borrowing a modal from unrelated material outgrow the gain.
  const MODAL_WINDOW = 4;

  // Subordinators that close a clause — the coordinated-s-passive backscan must
  // not borrow a modal from across one of these (a new clause starts here).
  const CLAUSE_BOUNDARY = new Set([
    'at', 'som', 'fordi', 'når', 'då', 'da', 'medan', 'mens', 'dersom', 'viss',
    'hvis', 'sjølv', 'selv', 'etter', 'før', 'sidan', 'siden', 'men',
  ]);

  // Always-deponent NN s-passive forms. These look like s-passives by surface
  // form but are lexicalised verbs that take no agent and aren't subject to
  // the "infinitive-after-modal-only" restriction. Sprakrådet treats them as
  // independent lemmas. Without this allowlist the rule false-flags every
  // "Det høyrest bra ut" / "Det synest så" idiom in NN documents — the
  // dominant usage pattern by a wide margin.
  //
  // Authoritative source: Norsk Ordbok / Nynorskordboka deponent verb list.
  // If the upstream verbbank gains `isDeponent: true` on these entries the
  // rule's `info.isDeponent` branch will pre-empt this set; the rule-side
  // allowlist remains as the safety net.
  const ALWAYS_DEPONENT = new Set([
    'høyrest', 'høyrast',           // høyrast — "sounds (like)"
    'synest', 'synast', 'syns',     // synast — "seems"
    'finnast', 'finst',             // finnast — "is found / exists"
    'lykkast', 'lukkast',           // lykkast/lukkast — "succeed" (both spellings)
    'mistrivast',                   // mistrivast — "be unhappy"
    'trivast',                      // trivast — "thrive / enjoy"
    'minnast',                      // minnast — "remember"
    // Reciprocals (Ordbank sweep 2026-07): lexicalised mutual-action verbs,
    // standard in finite use — "vi sjåast i morgon", "vi snakkast", "ungane
    // samlast på idrettsplassen", "dei møtast kvar veke".
    'sjåast', 'snakkast', 'samlast', 'møtast', 'skiljast', 'treffast',
  ]);

  const rule = {
    id: 'nn_passiv_s',
    languages: ['nn'],
    priority: 25,
    // exam-audit 33-03: stays safe=false — Cross-token passive-s detection; multi-token reasoning, not single-form lookup
    exam: {
      safe: false,
      reason: "Stays safe=false (nb-nn-passiv-s) — Cross-token passive-s detection; multi-token reasoning, not single-form lookup",
      category: "grammar-lookup",
    },
    severity: 'error',

    explain(/* finding */) {
      const esc = escapeHtml || (s => s);
      return {
        nb: 'S-passiv kan bare brukes i infinitiv etter modalverb pa nynorsk. Bruk bli/verte-passiv i stedet.',
        nn: 'S-passiv kan berre brukast i infinitiv etter modalverb pa nynorsk. Bruk bli/verte-passiv i staden.',
      };
    },

    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const sPassivForms = vocab.sPassivForms || new Map();
      if (sPassivForms.size === 0) return [];
      // A second finite verb between a modal and an s-passive means the modal
      // is governing that verb, not this one. Only UNAMBIGUOUS finite forms
      // count: the verb indexes carry homographs of everyday non-verbs
      // («anna» is listed as a preteritum of «anne», but in «kan mellom anna
      // brukast» it is the neuter of «annan»), and treating those as verbs
      // put correct Nynorsk back under an `error` marker.
      const isUnambiguousFinite = (w) =>
        ((vocab.knownPresens && vocab.knownPresens.has(w)) ||
         (vocab.knownPreteritum && vocab.knownPreteritum.has(w))) &&
        !(vocab.isAdjective && vocab.isAdjective.has(w)) &&
        !(vocab.nounGenus && vocab.nounGenus.has(w));

      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        const info = sPassivForms.get(t.word);
        if (!info) continue;

        // Deponent / st-verbs: never flag (synast, lykkast are lexicalised)
        if (info.isDeponent) continue;
        if (ALWAYS_DEPONENT.has(t.word)) continue;

        // Infinitive marker «å» before the s-form is a valid infinitive use
        // ("dømd til å brennast levande") — no modal needed.
        const prev = tokens[i - 1];
        const prev2 = tokens[i - 2];
        if (prev && prev.word === 'å') continue;
        // Phrase-initial s-form is a headline/dictionary infinitive
        // ("skiljast som gode vener"), not a finite passive.
        if (i === 0) continue;

        // Check if preceded by a modal verb (directly, with pronoun inversion,
        // or with an adverb between — "kan ikkje merkast", "må ikkje
        // overdrivast").
        const directModal = prev && NN_PASSIV_MODALS.has(prev.word);
        const invertedModal = prev2 && prev &&
          NN_PASSIV_MODALS.has(prev2.word) &&
          (SUBJECT_PRONOUNS.has(prev.word) || MODAL_ADVERBS.has(prev.word));

        // Longer adverbial material can sit between the modal and its
        // s-passive infinitive: "kan derimot nyttast", "kan mellom anna
        // brukast", "kan grovt delast inn". Enumerating adverbs never
        // converges — MODAL_ADVERBS missed every one of those on real NN
        // prose, and each miss reported correct Nynorsk as an `error`. So
        // walk back a short window instead and accept the modal unless
        // something in between says its complement is already taken: a
        // clause boundary, punctuation, or another finite verb.
        let windowModal = false;
        for (let j = i - 1, steps = 0; j >= 0 && steps < MODAL_WINDOW; j--, steps++) {
          const gap = ctx.text ? ctx.text.slice(tokens[j].end, tokens[j + 1].start) : ' ';
          if (/[.,;:!?()]/.test(gap)) break;   // comma lists are the coordination path below
          const w = tokens[j].word;
          if (NN_PASSIV_MODALS.has(w)) { windowModal = true; break; }
          if (SUBJECT_PRONOUNS.has(w) || MODAL_ADVERBS.has(w)) continue;  // known-passable
          if (CLAUSE_BOUNDARY.has(w)) break;
          if (isUnambiguousFinite(w)) break;   // the modal already has a complement
        }

        // Coordinated s-passive: a single modal governs both conjuncts —
        // "kan takast av bana og byttast ut" (= can be taken off … and be
        // exchanged). Scan back to the clause start; if a coordinator (og/eller)
        // sits between this s-passive and an earlier modal, it's licensed.
        // Stop at a clause boundary (subordinator, comma, or sentence end) so we
        // don't borrow a modal from a different clause. Real-NN-text FP.
        let coordinatedModal = false;
        let sawCoord = false;
        for (let j = i - 1; j >= 0; j--) {
          const w = tokens[j].word;
          const gap = ctx.text ? ctx.text.slice(tokens[j].end, tokens[j + 1].start) : ' ';
          if (/[.;:!?]/.test(gap)) break;             // sentence boundary
          // A comma between s-passive conjuncts is LIST coordination sharing
          // one modal ("pølser kan kokast, steikjast, røykjast og spekjast") —
          // treat like og/eller instead of breaking. Subordinators still
          // close the clause below.
          if (/,/.test(gap)) sawCoord = true;
          if (CLAUSE_BOUNDARY && CLAUSE_BOUNDARY.has && CLAUSE_BOUNDARY.has(w)) break;
          if (w === 'og' || w === 'eller') sawCoord = true;
          if (sawCoord && NN_PASSIV_MODALS.has(w)) { coordinatedModal = true; break; }
        }

        if (directModal || invertedModal || windowModal || coordinatedModal) continue; // valid: modal + s-passive infinitive

        out.push({
          rule_id: 'nn_passiv_s',
          start: t.start,
          end: t.end,
          original: t.raw,
          fix: null,
          message: 'S-passiv utan modalverb er feil pa nynorsk',
          severity: 'error',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
