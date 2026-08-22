/**
 * Spell-check rule: English Preposition Transfer from Norwegian (priority 16).
 *
 * Flags Norwegian "for å" interference patterns:
 *   "for buy" → "to buy"   (NB: "for å kjøpe")
 *   "for to read" → "to read"  (NB: "for å lese")
 *
 * Rule ID: 'en-preposition'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Determiners — "for the/a/my/..." is legitimate
  const DETERMINERS = new Set([
    'the', 'a', 'an', 'my', 'your', 'his', 'her', 'our', 'their', 'its',
    'this', 'that', 'these', 'those', 'some', 'any', 'no', 'every', 'each',
  ]);

  // Pronouns — "for me/you/him/..." is legitimate
  const PRONOUNS = new Set([
    'me', 'you', 'him', 'her', 'us', 'them', 'it',
    'myself', 'everyone', 'everything', 'something', 'nothing', 'anything',
  ]);

  const rule = {
    id: 'en-preposition',
    languages: ['en'],
    priority: 16,
    exam: {
      safe: true,
      reason: 'Mechanical preposition correction — Norwegian interference pattern.',
      category: 'grammar-lookup',
    },
    severity: 'warning',
    explain: (finding) => {
      if (finding.subType === 'for-to-verb') {
        return {
          nb: `På engelsk bruker man <em>to</em> + verb, ikke <em>for to</em>. Norsk «for å» oversettes bare med <em>to</em>: <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `På engelsk brukar ein <em>to</em> + verb, ikkje <em>for to</em>. Norsk «for å» vert omsett berre med <em>to</em>: <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      return {
        nb: `På engelsk bruker man <em>to</em> foran infinitiv, ikke <em>for</em>. Norsk «for å» oversettes med <em>to</em>: <em>${escapeHtml(finding.fix)}</em>.`,
        nn: `På engelsk brukar ein <em>to</em> framfor infinitiv, ikkje <em>for</em>. Norsk «for å» vert omsett med <em>to</em>: <em>${escapeHtml(finding.fix)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const out = [];

      // v3.0.121 (synthetic-corpus probes scored 0/3): Norwegian "på"
      // transfer. Three curated, guarded patterns:
      //  - good/bad/better/best/great + on → at  ("god på" → good AT gaming)
      //  - on (the) school + clause-continuing pronoun → at school
      //    ("on the school I have math"; "on the school bus" stays legal)
      //  - live(s/d) on a/the … town/city/village → in
      //    ("live on a farm/island" stays legal — head-noun gated)
      const QUALITY_ADJ = new Set(['good', 'bad', 'better', 'best', 'great', 'terrible']);
      const CLAUSE_PRONOUNS = new Set(['i', 'we', 'you', 'he', 'she', 'they', 'there', 'it']);
      const IN_PLACES = new Set(['town', 'city', 'village']);
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.word !== 'on') continue;
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        const prev = tokens[i - 1];
        const next = tokens[i + 1];
        const emit = (fix, note) => out.push({
          rule_id: 'en-preposition',
          subType: 'paa-transfer',
          priority: rule.priority,
          start: t.start, end: t.end,
          original: t.display,
          fix,
          message: `«${t.display}» → «${fix}» — ${note}`,
          severity: 'warning',
        });
        // Idiom exception: "looked good ON PAPER" — on is correct there.
        const afterOn = tokens[i + 1];
        if (prev && QUALITY_ADJ.has(prev.word) && !(afterOn && afterOn.word === 'paper')) { emit('at', 'norsk «på» blir «at» her (good at)'); continue; }
        if (next && (next.word === 'school' || (next.word === 'the' && tokens[i + 2] && tokens[i + 2].word === 'school'))) {
          const after = next.word === 'school' ? tokens[i + 2] : tokens[i + 3];
          if (after && CLAUSE_PRONOUNS.has(after.word)) { emit('at', 'norsk «på skolen» blir «at school»'); continue; }
        }
        if (prev && /^lived?s?$/.test(prev.word) && next && ['a', 'an', 'the'].includes(next.word)) {
          for (let k = i + 2; k < Math.min(i + 5, tokens.length); k++) {
            if (IN_PLACES.has(tokens[k].word)) { emit('in', 'norsk «på» blir «in» foran by/sted'); break; }
            if (!tokens[k].word.match(/^[a-z-]+$/)) break;
          }
        }
      }

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.word !== 'for') continue;

        const next = tokens[i + 1];
        if (!next) continue;

        // Skip if cursor is near this token
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= (tokens[i + 2] || next).end + 1) continue;

        // Pattern 1: "for to VERB" → "to VERB"
        if (next.word === 'to') {
          const verbToken = tokens[i + 2];
          if (verbToken && vocab.verbForms && vocab.verbForms.has(verbToken.word)) {
            const fix = 'to ' + verbToken.display;
            out.push({
              rule_id: 'en-preposition',
              subType: 'for-to-verb',
              priority: rule.priority,
              start: t.start,
              end: verbToken.end,
              original: t.display + ' ' + next.display + ' ' + verbToken.display,
              fix: fix,
              suggestion: fix,
              message: `Preposisjon: Bruk "to ${verbToken.display}", ikke "for to ${verbToken.display}"`,
            });
            i += 2; // skip past matched tokens
            continue;
          }
        }

        // Pattern 2: "for VERB" → "to VERB"
        const nextWord = next.word;

        // Guards: skip determiners, pronouns, numbers, gerunds
        if (DETERMINERS.has(nextWord)) continue;
        if (PRONOUNS.has(nextWord)) continue;
        if (/^\d+$/.test(nextWord)) continue;
        if (nextWord.endsWith('ing')) continue;

        // Check if next token is a known verb base form
        if (vocab.verbForms && vocab.verbForms.has(nextWord)) {
          // Ordbank sweep 2026-07: verb/NOUN homographs ("ask for help",
          // "look for work", "leave for work", "instructions for use", "for
          // last month", "for dry skin", "for repeat offenders") are ordinary
          // for+noun PPs. For homograph words, the infinitive reading needs a
          // determiner/pronoun OBJECT after ("came for help me" still flags);
          // verb-only words (buy, write, see) keep flagging freely
          // ("for buy food").
          const HOMOGRAPH_NOUNS = new Set(['work', 'help', 'use', 'last', 'dry',
            'repeat', 'rest', 'play', 'sleep', 'change', 'support', 'love',
            'hope', 'need', 'talk', 'walk', 'visit', 'call', 'answer', 'offer',
            'start', 'end', 'stop', 'break', 'plan', 'study', 'travel', 'shop',
            'stay', 'record', 'review', 'test', 'fun', 'show', 'watch']);
          if (HOMOGRAPH_NOUNS.has(nextWord)) {
            const objTok = tokens[i + 2];
            const OBJ_STARTERS = new Set(['a', 'an', 'the', 'my', 'your', 'his',
              'her', 'our', 'their', 'this', 'that', 'these', 'those', 'me',
              'him', 'us', 'them', 'it', 'some']);
            if (!objTok || !OBJ_STARTERS.has(objTok.word)) continue;
            // "for work THIS YEAR" — this/that + time word is a temporal
            // adverbial, not the infinitive's object.
            const TIMEW = new Set(['year', 'month', 'week', 'time', 'morning',
              'evening', 'afternoon', 'summer', 'winter', 'spring', 'autumn', 'weekend']);
            const objNext = tokens[i + 3];
            if ((objTok.word === 'this' || objTok.word === 'that') &&
                objNext && TIMEW.has(objNext.word)) continue;
            // Punctuation between kills the object reading ("for work, she…").
            if (ctx.text && /[,.;:!?]/.test(ctx.text.slice(next.end, objTok.start))) continue;
          }
          const fix = 'to ' + next.display;
          out.push({
            rule_id: 'en-preposition',
            subType: 'for-verb',
            priority: rule.priority,
            start: t.start,
            end: next.end,
            original: t.display + ' ' + next.display,
            fix: fix,
            suggestion: fix,
            message: `Preposisjon: Bruk "to ${next.display}", ikke "for ${next.display}"`,
          });
          i += 1; // skip past matched token
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
