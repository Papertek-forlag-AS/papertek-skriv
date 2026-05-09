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
    if (word.endsWith('es') && word.length > 3) {
      const base = word.slice(0, -2);
      if (knownPresens.has(base) || (validWords && validWords.has(base))) {
        return { inf: base, type: 'sg3', sg3Form: word, baseForm: base };
      }
    }
    if (word.endsWith('s') && !word.endsWith('ss') && word.length > 2) {
      const base = word.slice(0, -1);
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

        // Skip if verb is a modal (modal + base form is always correct)
        if (MODALS.has(verbT.word)) continue;

        // Skip if previous token is a modal (pronoun follows modal — rare but skip)
        if (i > 0 && MODALS.has(tokens[i - 1].word)) continue;

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
