/**
 * Spell-check rule: NB/NN possessive + definite-form noun (priority 13).
 *
 * Flags "possessive pronoun + definite-form noun" — a very common Norwegian
 * student error:
 *   "min bilen" → fix to "min bil" (also mention "bilen min" as alternative)
 *   "hans huset" → fix to "hans hus"
 *
 * Detection: closed set of possessive pronouns followed by a noun whose
 * definite suffix (-en, -a, -et) can be stripped to yield a known stem.
 *
 * Severity: warning (amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const POSSESSIVES = new Set([
    'min', 'mi', 'mitt', 'mine',
    'din', 'di', 'ditt', 'dine',
    'sin', 'si', 'sitt', 'sine',
    'hans', 'hennes',
    'vår', 'vårt', 'våre',
    'deres',
  ]);

  // Subject pronouns (NB + NN) — used to disambiguate verb-homographs: after
  // one of these, an -et token is the clause's verb ("han dekket sin part"),
  // not a definite noun head.
  const SUBJECT_PRONOUNS = new Set([
    'jeg', 'du', 'han', 'hun', 'vi', 'de', 'dere', 'man', 'en',
    'eg', 'ho', 'dei', 'me', 'nokon', 'noen', 'alle',
  ]);

  // Plan 50-04 sub-step C: gender-agreement table for post-posed
  // possessives. 'mf' = shared masculine/feminine form, 'f' = feminine
  // only, 'n' = neuter, 'pl' = plural. hans/hennes/deres are invariant.
  const POSSESSIVE_GENDER = new Map([
    ['min', 'mf'],  ['mitt', 'n'],  ['mi', 'f'],   ['mine', 'pl'],
    ['din', 'mf'],  ['ditt', 'n'],  ['di', 'f'],   ['dine', 'pl'],
    ['sin', 'mf'],  ['sitt', 'n'],  ['si', 'f'],   ['sine', 'pl'],
    ['vår', 'mf'],  ['vårt', 'n'],                 ['våre', 'pl'],
  ]);

  function possessiveFamily(form) {
    if (form === 'min' || form === 'mitt' || form === 'mi' || form === 'mine') return 'min';
    if (form === 'din' || form === 'ditt' || form === 'di' || form === 'dine') return 'din';
    if (form === 'sin' || form === 'sitt' || form === 'si' || form === 'sine') return 'sin';
    if (form === 'vår' || form === 'vårt' || form === 'våre') return 'vår';
    return null;
  }

  function possessiveFor(family, nounGender) {
    // family in {'min', 'din', 'sin', 'vår'} — these are the masculine
    // (and shared masc/fem) form. Map feminine→drop the final 'n' (mi,
    // di, si). Neuter→add 't' (mitt, ditt, sitt). vår is special-cased
    // because the feminine form is shared with masc; only neuter
    // ('vårt') differs.
    if (family === 'vår') return nounGender === 'n' ? 'vårt' : 'vår';
    const root = family; // 'min' | 'din' | 'sin'
    if (nounGender === 'f') return root.slice(0, -1);        // 'min'→'mi'
    if (nounGender === 'n') return root.slice(0, -1) + 'tt'; // 'min'→'mitt', 'sin'→'sitt'
    return root;
  }

  function genderCompatible(possGender, nounGender) {
    if (!possGender || !nounGender) return true;
    // Dual-genus nouns ("f/m" — bok, mor, søster accept both genders in NB)
    // are compatible when ANY listed genus agrees; without the split, correct
    // "boka mi" flagged because 'f' !== 'f/m' string-compared.
    const genders = String(nounGender).split('/');
    if (possGender === 'mf') return genders.some(g => g === 'm' || g === 'f' || g === 'mf');
    return genders.some(g => g === possGender);
  }

  /**
   * Try to strip a definite-singular suffix and return the indefinite stem.
   * Returns null if the word is not a recognised definite-form noun.
   */
  function getIndefiniteStem(word, nounGenus, validWords) {
    for (const suffix of ['et', 'en', 'a']) {
      if (word.length > suffix.length + 1 && word.endsWith(suffix)) {
        const stem = word.slice(0, -suffix.length);
        if (nounGenus.has(stem) || validWords.has(stem)) return stem;
      }
    }
    return null;
  }

  const rule = {
    id: 'nb-possessive-definite',
    languages: ['nb', 'nn'],
    priority: 13,
    severity: 'warning',
    exam: {
      safe: true,
      reason: "Possessive-noun agreement; 2-token lookup; single-token fix",
      category: "grammar-lookup",
    },

    explain: (finding) => {
      // Plan 50-04 sub-step C: gender-mismatch branch.
      if (finding.genderMismatch) {
        const genderNb = finding.nounGender === 'f' ? 'hokjønn (ei/ei)' :
                         finding.nounGender === 'n' ? 'intetkjønn (et/et)' :
                         'hankjønn (en/en)';
        const genderNn = finding.nounGender === 'f' ? 'hokjønn (ei/ei)' :
                         finding.nounGender === 'n' ? 'inkjekjønn (eit/eit)' :
                         'hankjønn (ein/ein)';
        return {
          nb: `Eiendomsordet må samsvare i kjønn med substantivet. Her er substantivet ${genderNb}, så vi skriver <em>${escapeHtml(finding.fix)}</em> (ikke <em>${escapeHtml(finding.original)}</em>).`,
          nn: `Eigedomsordet må samsvare i kjønn med substantivet. Her er substantivet ${genderNn}, så vi skriv <em>${escapeHtml(finding.fix)}</em> (ikkje <em>${escapeHtml(finding.original)}</em>).`,
        };
      }
      const poss = finding.possessive || '';
      return {
        nb: `Etter eiendomsord bruker vi ubestemt form: <em>${escapeHtml(poss)} ${escapeHtml(finding.fix)}</em>, ikke <em>${escapeHtml(poss)} ${escapeHtml(finding.original)}</em>. Du kan også skrive <em>${escapeHtml(finding.original)} ${escapeHtml(poss)}</em>.`,
        nn: `Etter eigedomsord bruker vi ubestemt form: <em>${escapeHtml(poss)} ${escapeHtml(finding.fix)}</em>, ikkje <em>${escapeHtml(poss)} ${escapeHtml(finding.original)}</em>. Du kan også skrive <em>${escapeHtml(finding.original)} ${escapeHtml(poss)}</em>.`,
      };
    },

    check(ctx) {
      const { text, tokens, vocab, cursorPos, suppressed } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const nounLemmaGenus = vocab.nounLemmaGenus || new Map();
      const validWords = vocab.validWords || new Set();
      const knownPreteritum = vocab.knownPreteritum || new Set();
      const knownParticiples = vocab.knownParticiples || new Set();
      const verbInfinitive = vocab.verbInfinitive || new Map();
      // Verb-preterite/participle homographs of -et definites: "Datamaskinen
      // hans krasjet" (crashed, not "the crash"), "Niesen min tegnet" (drew),
      // "han dekket sin part" (covered, not "the tablecloth"). After a
      // possessive-marked subject, the verb reading wins.
      const isVerbHomograph = (w) => knownPreteritum.has(w) || knownParticiples.has(w) || verbInfinitive.has(w);
      // Surface forms that are their OWN lemma are not definite forms of a
      // shorter noun: "hans saga" (en saga, not sag+a), "vår verden" (verden,
      // not verd+en). Genuine definites (bilen, huset) are never lemma keys.
      const isOwnLemma = (w) => nounLemmaGenus.has(w);
      const out = [];

      // Plan 50-04 sub-step C: post-posed possessive gender-agreement.
      // Pattern: def-noun + possessive (the canonical NB ordering).
      // Detects 'søsteren mitt' (feminine head + neuter possessive) →
      // suggest 'mi'. Pre-posed 'min bilen' shape is handled by the
      // second loop below.
      //
      // Phase 51-01 Task 3 / Finding § 5 — DESIGN NOTE (definite-suffix gender).
      // The gender-resolution branch below reads `nounLemmaGenus.get(stem)`
      // — i.e. the lemma's gender from the nounbank. In NB, many feminine
      // nouns (søster, jente, …) accept BOTH a common-gender definite
      // suffix (-en → søsteren) and a feminine definite suffix (-a →
      // søstera). When the writer has already chosen `-en` for the head
      // noun, the strongest LOCAL signal is the suffix itself, not the
      // lemma-bank gender — agreeing with the lemma would impose a
      // register/dialect choice the writer made differently. Future work:
      // if the head noun carries `-en`, prefer the common-gender
      // possessive (`min`) over the feminine (`mi`) even when the lemma is
      // tagged feminine. Reproducer: `søsteren min` is suggested over
      // `søstera mi`. Document for future maintainers — no code change in
      // this plan; the current shipping behavior already agrees with the
      // -en suffix because `nounLemmaGenus` returns the canonical
      // common-gender tag for søster/søsteren via the nounbank merge.
      for (let i = 0; i < tokens.length - 1; i++) {
        const nounA = tokens[i];
        const possA = tokens[i + 1];
        if (cursorPos != null && cursorPos >= nounA.start && cursorPos <= nounA.end + 1) continue;
        if (cursorPos != null && cursorPos >= possA.start && cursorPos <= possA.end + 1) continue;
        if (suppressed && (suppressed.has(i) || suppressed.has(i + 1))) continue;
        const gapA = text ? text.slice(nounA.end, possA.start) : '';
        if (/[.!?,;:]/.test(gapA)) continue;
        const possLowerA = possA.word;
        const possGender = POSSESSIVE_GENDER.get(possLowerA);
        if (!possGender || possGender === 'pl') continue;
        const nounLowerA = nounA.word;
        if (!nounGenus.has(nounLowerA)) continue;
        if (isOwnLemma(nounLowerA)) continue;
        // Verb-homograph skip ONLY when a subject pronoun precedes — then the
        // token is the clause's verb ("han dekket sin part" — covered), not a
        // noun head. Bare "huset mi" (no subject before) keeps flagging.
        if (isVerbHomograph(nounLowerA) && i > 0 && SUBJECT_PRONOUNS.has(tokens[i - 1].word)) continue;
        const stemA = getIndefiniteStem(nounLowerA, nounGenus, validWords);
        if (!stemA) continue;
        const nounLemmaG = nounLemmaGenus.get(stemA);
        if (!nounLemmaG) continue;
        if (genderCompatible(possGender, nounLemmaG)) continue;
        const family = possessiveFamily(possLowerA);
        if (!family) continue;
        const fixLowerA = possessiveFor(family, nounLemmaG);
        if (!fixLowerA || fixLowerA === possLowerA) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: possA.start,
          end: possA.end,
          original: possA.display,
          fix: matchCase(possA.display, fixLowerA),
          possessive: possA.display,
          nounGender: nounLemmaG,
          genderMismatch: true,
          message: `Eiendomsord-kjønn: "${nounA.display} ${possA.display}" → "${nounA.display} ${matchCase(possA.display, fixLowerA)}"`,
        });
      }

      for (let i = 0; i < tokens.length - 1; i++) {
        const poss = tokens[i];
        const noun = tokens[i + 1];

        // Cursor gating on both tokens
        if (cursorPos != null && cursorPos >= poss.start && cursorPos <= poss.end + 1) continue;
        if (cursorPos != null && cursorPos >= noun.start && cursorPos <= noun.end + 1) continue;
        if (suppressed && (suppressed.has(i) || suppressed.has(i + 1))) continue;

        // Sentence-boundary guard: don't pair a sentence-final possessive
        // ("...far min.") with the next sentence's opening noun ("Boka som...").
        // Also block comma (Phase 48 C9): "Hans, broren til X" is an
        // appositive, not "Hans's brother". Without comma, the rule fired
        // "broren → bror" on the appositive.
        const between = text ? text.slice(poss.end, noun.start) : '';
        if (/[.!?,;:]/.test(between)) continue;

        const possLower = poss.word;
        if (!POSSESSIVES.has(possLower)) continue;
        // Phase 48 C9: proper-noun guard. `hans` is also the male given
        // name "Hans". Mid-sentence capitalization is a strong proper-noun
        // signal — refuse to treat as possessive. Sentence-initial "Hans"
        // could be either; check the gap before the token for sentence-end
        // punctuation to detect sentence boundary.
        if (poss.display && poss.display[0] !== poss.display[0].toLowerCase()) {
          const gapBefore = text ? text.slice(0, poss.start) : '';
          const isSentenceStart = /[.!?]\s*$/.test(gapBefore) || gapBefore.trim() === '';
          if (!isSentenceStart) continue;
        }

        const nounLower = noun.word;
        // Must be a known noun form
        if (!nounGenus.has(nounLower)) continue;
        if (isOwnLemma(nounLower)) continue;
        // Verb-homograph skip ONLY when the possessive is POST-nominal (a
        // known noun precedes it): "Datamaskinen hans krasjet" — the NP is
        // complete, so the -et token after it is the clause's verb. Pre-nominal
        // "Hans huset er stort" (nothing/non-noun before) keeps flagging.
        if (isVerbHomograph(nounLower) && i > 0 && nounGenus.has(tokens[i - 1].word)) continue;

        const stem = getIndefiniteStem(nounLower, nounGenus, validWords);
        if (!stem) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: noun.start,
          end: noun.end,
          original: noun.display,
          fix: matchCase(noun.display, stem),
          possessive: poss.display,
          message: `Eiendomsord + bestemt form: "${poss.display} ${noun.display}" → "${poss.display} ${matchCase(noun.display, stem)}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
