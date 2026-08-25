/**
 * Spell-check rule: English Subject-Verb Agreement (priority 14).
 *
 * Flags pronoun + verb disagreement:
 *   "he go"   → "he goes"
 *   "they goes" → "they go"
 *   "she have" → "she has"
 *   "I is"    → "I am"
 *
 * Skips after modal verbs (can, will, should, etc.) where base form is correct.
 *
 * Rule ID: 'en-subject-verb'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const THIRD_SG = new Set(['he', 'she', 'it']);
  const FIRST_SG = new Set(['i']);
  const NON_THIRD_SG = new Set(['you', 'we', 'they']);

  const MODALS = new Set([
    'can', 'could', 'will', 'would', 'shall', 'should', 'may', 'might', 'must',
  ]);

  // Closed-set adverb whitelist for ≤1-adverb tolerance between subject and
  // verb: "she always make dinner" should still fire en-subject-verb. We
  // consume at most one adverb (no chain/recursion) to keep the surface
  // narrow — two-adverb sequences are explicitly out-of-scope.
  const ADVERB_TOLERANCE = new Set([
    'always', 'never', 'often', 'sometimes', 'usually', 'rarely', 'just', 'only',
    'last', 'first',  // "she last visited", "he first met" (Ordbank sweep)
  ]);

  // Irregular verbs whose past-simple form is spelled identically to the base
  // form. For these, "She read", "He put", "It cost" can be valid past-tense
  // sentences, so we cannot disambiguate from "She reads" / "He puts" / "It
  // costs" without parsing tense — out of scope for a token-window rule. Skip
  // 3sg flagging on these to avoid false positives. Trade-off: misses real
  // errors like "She read every day" (present-habitual sense), which is a
  // narrower failure mode than the false positives.
  const PAST_BASE_HOMOGRAPHS = new Set([
    'read', 'put', 'set', 'hit', 'cut', 'cost', 'hurt', 'let', 'shut',
    'spread', 'beat', 'bid', 'burst', 'cast', 'quit', 'rid', 'slit',
    'split', 'thrust', 'upset', 'wed', 'broadcast', 'forecast',
    // Ordbank sweep 2026-07: past forms that are ALSO another verb's base —
    // "He bet his colleague" (past of bet), "He lay awake" (past of lie),
    // "She found a sense of belonging" (past of find / base of found-establish).
    'bet', 'lay', 'found',
  ]);

  // Curated irregular verb forms: base, 3sg, optional 1sg special
  const VERB_FORMS = new Map([
    ['be',   { base: 'are', sg3: 'is', sg1: 'am' }],
    ['have', { base: 'have', sg3: 'has' }],
    ['do',   { base: 'do', sg3: 'does' }],
    ['go',   { base: 'go', sg3: 'goes' }],
  ]);

  // Build reverse lookup: any form → { inf, type }
  const FORM_LOOKUP = new Map();
  for (const [inf, forms] of VERB_FORMS) {
    FORM_LOOKUP.set(forms.base, { inf, type: 'base' });
    FORM_LOOKUP.set(forms.sg3, { inf, type: 'sg3' });
    if (forms.sg1) {
      FORM_LOOKUP.set(forms.sg1, { inf, type: 'sg1' });
    }
  }

  /**
   * Try to identify a regular verb form from vocab indexes.
   * Returns { inf, type, sg3Form, baseForm } or null.
   */
  function identifyRegularVerb(word, knownPresens, validWords) {
    if (!knownPresens) return null;

    // Check if it's a 3sg form (ends in -s/-es/-ies)
    if (word.endsWith('ies') && word.length > 4) {
      const base = word.slice(0, -3) + 'y';
      if ((knownPresens.has(base) || (validWords && validWords.has(base)))) {
        return { inf: base, type: 'sg3', sg3Form: word, baseForm: base };
      }
    }
    // Check plain -s before -es: "writes"→"write" not "writ", "uses"→"use" not "us".
    // Words that truly add -es (watch→watches, fix→fixes) have no valid -1-stripped
    // base in knownPresens, so they fall through to the -es branch correctly.
    if (word.endsWith('s') && !word.endsWith('ss') && word.length > 2) {
      const base = word.slice(0, -1);
      if (knownPresens.has(base) || (validWords && validWords.has(base))) {
        return { inf: base, type: 'sg3', sg3Form: word, baseForm: base };
      }
    }
    if (word.endsWith('es') && word.length > 3) {
      const base = word.slice(0, -2);
      if (knownPresens.has(base) || (validWords && validWords.has(base))) {
        return { inf: base, type: 'sg3', sg3Form: word, baseForm: base };
      }
    }

    // Check if it's a base form (no -s ending, in knownPresens)
    if (!word.endsWith('s') && knownPresens.has(word)) {
      // Only if base + "s" is also known (conservative check)
      const sg3Candidate = word + 's';
      if (knownPresens.has(sg3Candidate)) {
        return { inf: word, type: 'base', sg3Form: sg3Candidate, baseForm: word };
      }
    }

    return null;
  }

  const rule = {
    id: 'en-subject-verb',
    languages: ['en'],
    priority: 14,
    severity: 'warning',
    exam: {
      safe: true,
      reason: 'Pronoun-verb agreement; 2-token window; single-token fix',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const pronoun = finding.pronoun || '';
      return {
        nb: `Etter <em>${escapeHtml(pronoun)}</em> bruker vi <em>${escapeHtml(finding.fix)}</em>, ikke <em>${escapeHtml(finding.original)}</em>.`,
        nn: `Etter <em>${escapeHtml(pronoun)}</em> bruker vi <em>${escapeHtml(finding.fix)}</em>, ikkje <em>${escapeHtml(finding.original)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, vocab } = ctx;
      const knownPresens = vocab.knownPresens || new Set();
      const validWords = vocab.validWords || new Set();
      const out = [];

      // v3.0.121 (synthetic-corpus probes scored 0/6): det + noun subjects.
      // "My father work in a bank", "the lessons is difficult". Number from
      // the noun (plural = -s with a known stem); aux mismatches
      // (is/are/was/were) flag unconditionally, lexical verbs only when the
      // token AFTER the candidate isn't itself a finite verb — that
      // disambiguates noun-noun compounds ("my school work starts": work is
      // a noun there, starts is the verb).
      const EN_DETS = new Set(['the', 'my', 'your', 'his', 'her', 'our', 'their', 'this', 'that']);
      // v3.0.121 guards: aux/causative frames before the det mean the verb
      // slot is a base-form complement; pronouns and quantifier-adjectives
      // are not det+NOUN subjects; irregular plurals count as plural.
      const AUX_FRAME_WORDS = new Set(['does', 'do', 'did', 'to', 'help', 'let', 'watch', 'see', 'make']);
      const NOT_NOUN_SUBJECTS = new Set(['we', 'you', 'they', 'i', 'he', 'she', 'it', 'us', 'them', 'whole', 'same', 'only']);
      const IRREGULAR_PLURALS = new Set(['children', 'people', 'men', 'women', 'feet', 'teeth', 'mice',
        // Collective/zero plurals (Ordbank sweep 2026-07): "The police say …"
        'police', 'staff', 'cattle']);
      const IRREG_PAST = new Set(['gave', 'held', 'made', 'left', 'told', 'said',
        'saw', 'got', 'took', 'kept', 'felt', 'brought', 'thought', 'showed',
        'went', 'came', 'knew', 'gave', 'sent', 'built', 'found', 'heard',
        'meant', 'paid', 'sold', 'stood', 'wore', 'won', 'wrote', 'chose',
        'drove', 'spoke', 'threw', 'grew', 'drew', 'flew', 'ran', 'sat', 'lost']);
      const isFiniteish = (w) => !!(w && (FORM_LOOKUP.get(w) || knownPresens.has(w) ||
        ['is', 'are', 'was', 'were', 'has', 'have', 'had', 'does', 'do', 'be', 'been'].includes(w) ||
        IRREG_PAST.has(w) ||
        (/ed$/.test(w) && w.length > 4 &&
          (validWords.has(w.slice(0, -2)) || validWords.has(w.slice(0, -1)) ||
           validWords.has(w.slice(0, -3))))));
      // Ordbank sweep 2026-07: structural guards for the det+noun+verb branch.
      const EN_PREPS = new Set(['in', 'at', 'on', 'for', 'to', 'of', 'with', 'by',
        'from', 'about', 'during', 'through', 'after', 'before', 'under', 'over',
        'into', 'onto', 'between', 'behind', 'near', 'against', 'without',
        'around', 'along', 'beside', 'beneath', 'across', 'toward', 'towards',
        'within', 'among', 'outside', 'inside', 'since', 'until', 'till', 'off']);
      const FUNC_NOT_NOUN = new Set(['to', 'of', 'in', 'at', 'for', 'with', 'on',
        'by', 'from', 'and', 'or', 'a', 'an', 'as', 'if', 'so']);
      const TIME_AFTER_LAST = new Set(['week', 'month', 'year', 'night', 'weekend',
        'time', 'spring', 'summer', 'autumn', 'fall', 'winter', 'monday', 'tuesday',
        'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january',
        'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
        'october', 'november', 'december']);
      for (let i = 0; i < tokens.length - 2; i++) {
        if (!EN_DETS.has(tokens[i].word)) continue;
        if (i > 0 && (MODALS.has(tokens[i - 1].word)
          || AUX_FRAME_WORDS.has(tokens[i - 1].word))) continue; // "does my father work"
        // Coordinated subject: "the USA and the UK are …" — the preceding "and"
        // makes the subject plural, so deriving number from this single noun is
        // unreliable and false-flags the (correct) plural verb. Skip.
        if (i > 0 && tokens[i - 1].word === 'and') continue;
        // SUBJECT position only: a preposition directly before the det means
        // the NP is a PP object ("in the park", "at that bakery", "about the
        // job offer") — agreement belongs to the real subject elsewhere. A
        // finite verb ANYWHERE earlier in the clause means this det-NP is an
        // object/complement ("She thought about…", "We walked through…").
        if (i > 0 && EN_PREPS.has(tokens[i - 1].word)) continue;
        // Gerund PP: "for assembling the furniture" — the det-NP is the
        // gerund's object, not the clause subject.
        if (i > 0 && /ing$/.test(tokens[i - 1].word) && tokens[i - 1].word.length > 5) continue;
        {
          let objPosition = false;
          for (let k = i - 1; k >= 0; k--) {
            const gapK = ctx.text ? ctx.text.slice(tokens[k].end, tokens[k + 1].start) : ' ';
            if (/[.!?;]/.test(gapK)) break;
            if (isFiniteish(tokens[k].word)) { objPosition = true; break; }
          }
          if (objPosition) continue;
        }
        const nounT = tokens[i + 1];
        const verbT2 = tokens[i + 2];
        if (!nounT || !verbT2) continue;
        // Punctuation inside the pattern ("during the test, raise your hand")
        // means the verb candidate starts a new clause (often an imperative).
        if (ctx.text && (/[,;:.!?]/.test(ctx.text.slice(tokens[i].end, nounT.start))
          || /[,;:.!?]/.test(ctx.text.slice(nounT.end, verbT2.start)))) continue;
        // Temporal "last + timeword" is an adverbial, not a missing -s verb
        // ("the concert last week").
        if (verbT2.word === 'last' && tokens[i + 3] && TIME_AFTER_LAST.has(tokens[i + 3].word)) continue;
        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= verbT2.end + 1) continue;
        if (!validWords.has(nounT.word)) continue;
        if (NOT_NOUN_SUBJECTS.has(nounT.word)) continue;
        // Temporal adverbial NP mid-clause ("High temperatures this summer
        // have broken records") — this/that/last/every + time word is not the
        // clause subject.
        if (['this', 'that', 'last', 'every'].includes(tokens[i].word)
            && (TIME_AFTER_LAST.has(nounT.word) || nounT.word === 'morning'
                || nounT.word === 'evening' || nounT.word === 'afternoon')) continue;
        // Function words in the noun slot ("her to stay" — 'her' is a det
        // homograph and 'to' passed validWords) are never subject heads.
        if (FUNC_NOT_NOUN.has(nounT.word)) continue;
        // Wikipedia-corpus precision (E2, 2026-06-12): adjective in the
        // noun slot — «the official start of the season» flagged
        // start→starts because `official` passed the validWords check.
        // A det + ADJECTIVE bigram means the real noun comes later; the
        // 2-token window can't see it, so skip.
        const isAdjective = vocab.isAdjective || new Set();
        if (isAdjective.has(nounT.word)) continue;
        // E2: plural detection — the bare -s strip missed -ies plurals
        // («his philosophies are» → is), -es plurals (classes, boxes) and
        // Latin -ae plurals («The larvae eat» → eats, treated as singular).
        const w = nounT.word;
        // Singular -s nouns (news; -ics fields) and junk short stems ("bus" →
        // 'bu' passed validWords) must not read as plurals.
        const NEVER_PLURAL = new Set(['news', 'lens', 'series', 'species', 'chess', 'tennis']);
        const plural = !NEVER_PLURAL.has(w) && !/ics$/.test(w) && (IRREGULAR_PLURALS.has(w)
          || (w.endsWith('s') && w.length >= 4 && validWords.has(w.slice(0, -1)))
          || (w.endsWith('ies') && w.length > 4 && validWords.has(w.slice(0, -3) + 'y'))
          || (w.endsWith('es') && w.length > 3 && validWords.has(w.slice(0, -2)))
          || (w.endsWith('ae') && w.length > 3));
        let fix2 = null;
        if (!plural && verbT2.word === 'are') fix2 = 'is';
        else if (!plural && verbT2.word === 'were') fix2 = 'was';
        else if (plural && verbT2.word === 'is') fix2 = 'are';
        else if (plural && verbT2.word === 'was') fix2 = 'were';
        else if (!plural && !PAST_BASE_HOMOGRAPHS.has(verbT2.word)) {
          const after = tokens[i + 3];
          // Lexical-verb branch needs a continuation — a clause-final
          // candidate ("the whole book.") is a noun, not a missing-s verb.
          // E2 (2026-06-12): an `of` continuation marks a noun phrase
          // («the world record of …»), not a verb missing -s; students'
          // real dropped-s errors continue with in/at/for/objects.
          let laterFinite = false;
          for (let k = i + 3; k < Math.min(tokens.length, i + 10); k++) {
            const gk = ctx.text ? ctx.text.slice(tokens[k - 1].end, tokens[k].start) : ' ';
            if (/[.!?;]/.test(gk)) break;
            if (isFiniteish(tokens[k].word)) { laterFinite = true; break; }
          }
          if (after && !isFiniteish(after.word) && after.word !== 'of' && !laterFinite) {
            let vi = FORM_LOOKUP.get(verbT2.word);
            let sg3 = null;
            if (vi && vi.type === 'base') sg3 = VERB_FORMS.get(vi.inf).sg3;
            else if (!vi) {
              const reg = identifyRegularVerb(verbT2.word, knownPresens, validWords);
              if (reg && reg.type === 'base') sg3 = reg.sg3Form;
            }
            if (sg3 && sg3 !== verbT2.word) fix2 = sg3;
          }
        }
        if (fix2) {
          const fixCased = matchCase ? matchCase(verbT2.display, fix2) : fix2;
          out.push({
            rule_id: 'en-subject-verb',
            priority: rule.priority,
            start: verbT2.start, end: verbT2.end,
            original: verbT2.display, fix: fixCased, suggestion: fixCased,
            pronoun: nounT.display,
            message: `Samsvar: Etter "${nounT.display}" bruker vi "${fixCased}", ikke "${verbT2.display}"`,
          });
        }
      }

      for (let i = 0; i < tokens.length - 1; i++) {
        const pronT = tokens[i];
        let verbT = tokens[i + 1];
        // ≤1-adverb tolerance: "she always make" → shift verb candidate to tokens[i+2]
        if (verbT && ADVERB_TOLERANCE.has(verbT.word) && tokens[i + 2]) {
          verbT = tokens[i + 2];
        }
        const pWord = pronT.word;

        // Must be a known pronoun
        const is3sg = THIRD_SG.has(pWord);
        const is1sg = FIRST_SG.has(pWord);
        const isNon3sg = NON_THIRD_SG.has(pWord);
        if (!is3sg && !is1sg && !isNon3sg) continue;

        // Partitive "neither/some/all of you|us|them" — the pronoun is the
        // preposition's object; agreement belongs to the quantifier.
        if (i > 0 && tokens[i - 1].word === 'of') continue;
        // Skip if verb is a modal (modal + base form is always correct)
        if (MODALS.has(verbT.word)) continue;

        // Skip if previous token is a modal (pronoun follows modal — rare but skip)
        if (i > 0 && MODALS.has(tokens[i - 1].word)) continue;
        // Aux-question inversion: "Does it snow much…", "What did she say…" —
        // the base form after do/does/did is correct.
        if (i > 0 && ['do', 'does', 'did'].includes(tokens[i - 1].word)) continue;
        // Causative/perception frame: "makes it feel", "let him go", "watched
        // her dance" — the following verb is a bare-infinitive complement.
        if (i > 0 && ['make', 'makes', 'made', 'let', 'lets', 'help', 'helps',
          'helped', 'watch', 'watches', 'watched', 'see', 'sees', 'saw',
          'hear', 'hears', 'heard'].includes(tokens[i - 1].word)) continue;

        // Special case: "he/she/it don't" → "doesn't". The contraction is its
        // own auxiliary, not derivable from the regular-verb heuristic.
        if (THIRD_SG.has(pWord) && (verbT.word === "don't" || verbT.word === 'dont')) {
          const fix = matchCase ? matchCase(verbT.display, "doesn't") : "doesn't";
          out.push({
            rule_id: 'en-subject-verb',
            priority: rule.priority,
            start: verbT.start, end: verbT.end,
            original: verbT.display, fix, suggestion: fix,
            pronoun: pronT.display,
            message: `Samsvar: Etter "${pronT.display}" bruker vi "${fix}", ikke "${verbT.display}"`,
          });
          continue;
        }

        // Past-tense be (2026-06-12, surfaced by fixture en-ff-003): without
        // explicit handling, «I was» fell through to identifyRegularVerb,
        // which stripped the -s and found 'wa' in validwords-en — suggesting
        // the nonsense fix «wa». was/were agreement is a closed pair; handle
        // it here and never let be-forms reach the heuristic.
        if (verbT.word === 'was' || verbT.word === 'were') {
          let beFix = null;
          if (verbT.word === 'was' && isNon3sg) beFix = 'were';
          // «I were» stays unflagged — subjunctive («if I were») is common
          // and correct; the FP outweighs the rare real error.
          else if (verbT.word === 'were' && is3sg) beFix = 'was';
          if (beFix && !(cursorPos != null && cursorPos >= pronT.start && cursorPos <= verbT.end + 1)) {
            const fixCased = matchCase ? matchCase(verbT.display, beFix) : beFix;
            out.push({
              rule_id: 'en-subject-verb',
              priority: rule.priority,
              start: verbT.start, end: verbT.end,
              original: verbT.display, fix: fixCased, suggestion: fixCased,
              pronoun: pronT.display,
              message: `Samsvar: Etter "${pronT.display}" bruker vi "${fixCased}", ikke "${verbT.display}"`,
            });
          }
          continue;
        }

        // Skip 3sg flagging on past-base homographs (read, put, set, hit, …):
        // "She read the book" is ambiguous — could be past-tense (correct) or
        // present-habitual missing -s (error). Without tense disambiguation we
        // can't tell, so we accept a false negative on the present-habitual
        // reading rather than a false positive on the past-tense reading.
        if (THIRD_SG.has(pWord) && PAST_BASE_HOMOGRAPHS.has(verbT.word)) continue;

        // Skip if cursor is near the tokens
        if (cursorPos != null && cursorPos >= pronT.start && cursorPos <= verbT.end + 1) continue;

        // Identify verb form
        let verbInfo = FORM_LOOKUP.get(verbT.word);
        let sg3Form, baseForm, sg1Form;

        if (verbInfo) {
          const forms = VERB_FORMS.get(verbInfo.inf);
          sg3Form = forms.sg3;
          baseForm = forms.base;
          sg1Form = forms.sg1 || null;
        } else {
          // Try regular verb heuristic
          const reg = identifyRegularVerb(verbT.word, knownPresens, validWords);
          if (!reg) continue;
          verbInfo = { inf: reg.inf, type: reg.type };
          sg3Form = reg.sg3Form;
          baseForm = reg.baseForm;
          sg1Form = null;
        }

        let fix = null;

        if (is3sg) {
          // he/she/it needs sg3 form
          if (verbInfo.type === 'base') {
            fix = sg3Form;
          } else if (verbInfo.type === 'sg1') {
            // "he am" → "he is"
            fix = sg3Form;
          }
        } else if (is1sg) {
          // I needs base form (or sg1 special for 'be')
          if (verbInfo.type === 'sg3') {
            if (verbT.word === 'is') {
              fix = 'am';
            } else {
              fix = baseForm;
            }
          }
        } else if (isNon3sg) {
          // you/we/they need base form
          if (verbInfo.type === 'sg3') {
            fix = baseForm;
          } else if (verbInfo.type === 'sg1') {
            // "they am" → "they are"
            fix = baseForm;
          }
        }

        if (fix && fix !== verbT.word) {
          const fixCased = matchCase ? matchCase(verbT.display, fix) : fix;
          out.push({
            rule_id: 'en-subject-verb',
            priority: rule.priority,
            start: verbT.start,
            end: verbT.end,
            original: verbT.display,
            fix: fixCased,
            suggestion: fixCased,
            pronoun: pronT.display,
            message: `Samsvar: Etter "${pronT.display}" bruker vi "${fixCased}", ikke "${verbT.display}"`,
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
