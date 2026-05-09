/**
 * Spell-check rule: English Homophones and Confused Words (priority 40).
 * 
 * Heuristic checks for classic learner and dyslexic errors:
 * - your vs you're
 * - there vs their vs they're
 * - its vs it's
 * - then vs than
 * 
 * Rule ID: 'homophone'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase } = core;

  const VERB_INDICATORS = new Set([
    'going', 'doing', 'making', 'getting', 'having', 'being', 'seeing', 'saying', 'thinking', 'coming',
    'good', 'bad', 'happy', 'sad', 'ready', 'welcome', 'beautiful', 'smart', 'here', 'there',
    'a', 'an', 'the', 'my', 'his', 'her', 'our', 'their',
    'to', 'too', 'so', 'very', 'really', 'just', 'not', 'always', 'never', 'already'
  ]);

  const NOUN_INDICATORS = new Set([
    'car', 'house', 'dog', 'cat', 'book', 'friend', 'name', 'job', 'time', 'life', 'day', 'way',
    'school', 'work', 'family', 'money', 'problem', 'idea', 'hand', 'eye', 'head', 'face',
    'food', 'water', 'bed', 'toy', 'toys', 'tail'
  ]);

  const rule = {
    id: 'homophone',
    languages: ['en'],
    priority: 40,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (en-homophones) — Chrome native parity confirmed in 33-03 audit: EN homophone bank — single-token lookup; suggestion is one-word swap",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      if (finding.subType === 'your-youre') {
        return {
          nb: `<strong>You're</strong> betyr "you are" (du er). <strong>Your</strong> betyr "din/ditt/dine" (eiendomsord).`,
          en: `<strong>You're</strong> means "you are". <strong>Your</strong> means it belongs to you.`,
        };
      }
      if (finding.subType === 'there-their-theyre') {
        return {
          nb: `<strong>There</strong> betyr "der". <strong>Their</strong> betyr "deres" (eiendomsord). <strong>They're</strong> betyr "they are" (de er).`,
          en: `<strong>There</strong> is a place. <strong>Their</strong> means it belongs to them. <strong>They're</strong> means "they are".`,
        };
      }
      if (finding.subType === 'its-its') {
        const fixLower = (finding.fix || '').toLowerCase();
        if (fixLower === "it's") {
          // User wrote `its`, sentence actually needs the contraction `it's`.
          return {
            nb: `Her passer bare «it is» — derfor sammentrekningen <strong>it's</strong>. <strong>Its</strong> (uten apostrof) er et eiendomsord (dens/dets).`,
            nn: `Her passar berre «it is» — difor samandraget <strong>it's</strong>. <strong>Its</strong> (utan apostrof) er eit eigedomsord (dens/dets).`,
            en: `This sentence needs "it is" — so use the contraction <strong>it's</strong>. <strong>Its</strong> (no apostrophe) is the possessive (belonging to it).`,
          };
        }
        // User wrote `it's`, sentence actually needs the possessive `its`.
        return {
          nb: `Her trengs eiendomsordet <strong>its</strong> (dens/dets). <strong>It's</strong> er bare sammentrekning av «it is» eller «it has».`,
          nn: `Her trengst eigedomsordet <strong>its</strong> (dens/dets). <strong>It's</strong> er berre samandrag av «it is» eller «it has».`,
          en: `This sentence needs the possessive <strong>its</strong> (belonging to it). <strong>It's</strong> is only a contraction of "it is" or "it has".`,
        };
      }
      if (finding.subType === 'then-than') {
        return {
          nb: `<strong>Than</strong> brukes ved sammenligning (større enn). <strong>Then</strong> brukes om tid (og så, deretter).`,
          en: `<strong>Than</strong> is used for comparisons (bigger than). <strong>Then</strong> is used for time (and then).`,
        };
      }
      return { nb: finding.message, en: finding.message };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      const validWords = vocab.validWords || new Set();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        const word = t.word.toLowerCase();
        const prev = i > 0 ? tokens[i - 1].word.toLowerCase() : null;
        const next = i < tokens.length - 1 ? tokens[i + 1].word.toLowerCase() : null;

        // 1. your vs you're
        if (word === 'your' && next) {
          if (VERB_INDICATORS.has(next) || next === 'welcome') {
            out.push({
              rule_id: 'homophone',
              subType: 'your-youre',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, "you're"),
              suggestions: [matchCase(t.display, "you're")],
              message: `Did you mean "you're"?`
            });
            if (suppressed) suppressed.add(i);
          }
        }
        else if (word === "you're" && next) {
          if (NOUN_INDICATORS.has(next)) {
            out.push({
              rule_id: 'homophone',
              subType: 'your-youre',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'your'),
              suggestions: [matchCase(t.display, 'your')],
              message: `Did you mean "your"?`
            });
            if (suppressed) suppressed.add(i);
          }
        }

        // 2. there vs their vs they're
        else if (word === 'there' && next) {
          if (NOUN_INDICATORS.has(next) && prev !== 'hi' && prev !== 'hello') {
            out.push({
              rule_id: 'homophone',
              subType: 'there-their-theyre',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'their'),
              suggestions: [matchCase(t.display, 'their')],
              message: `Did you mean "their"?`
            });
            if (suppressed) suppressed.add(i);
          }
          else if (VERB_INDICATORS.has(next) && next !== 'is' && next !== 'are' && next !== 'was' && next !== 'were' && next !== 'has' && next !== 'have' && next !== 'will' && next !== 'a' && next !== 'an' && next !== 'the') {
             // Heuristic: "there going" -> "they're going"
             if (next.endsWith('ing') || next === 'ready' || next === 'here' || next === 'going') {
                out.push({
                  rule_id: 'homophone',
                  subType: 'there-their-theyre',
                  priority: rule.priority,
                  start: t.start,
                  end: t.end,
                  original: t.display,
                  fix: matchCase(t.display, "they're"),
                  suggestions: [matchCase(t.display, "they're")],
                  message: `Did you mean "they're"?`
                });
                if (suppressed) suppressed.add(i);
             }
          }
        }
        else if (word === 'their') {
          if (!next) {
            out.push({
              rule_id: 'homophone',
              subType: 'there-their-theyre',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'there'),
              suggestions: [matchCase(t.display, 'there')],
              message: `Did you mean "there"?`
            });
            if (suppressed) suppressed.add(i);
          }
          else if (next === 'is' || next === 'are' || next === 'was' || next === 'were' || next === 'has' || next === 'have') {
            out.push({
              rule_id: 'homophone',
              subType: 'there-their-theyre',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'there'),
              suggestions: [matchCase(t.display, 'there')],
              message: `Did you mean "there"?`
            });
            if (suppressed) suppressed.add(i);
          }
          else if (VERB_INDICATORS.has(next) && (next.endsWith('ing') || next === 'ready' || next === 'here')) {
             out.push({
              rule_id: 'homophone',
              subType: 'there-their-theyre',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, "they're"),
              suggestions: [matchCase(t.display, "they're")],
              message: `Did you mean "they're"?`
            });
            if (suppressed) suppressed.add(i);
          }
        }
        else if (word === "they're" && next) {
           if (NOUN_INDICATORS.has(next)) {
             out.push({
              rule_id: 'homophone',
              subType: 'there-their-theyre',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'their'),
              suggestions: [matchCase(t.display, 'their')],
              message: `Did you mean "their"?`
            });
            if (suppressed) suppressed.add(i);
           }
        }

        // 3. its vs it's
        else if (word === 'its' && next) {
          if (next === 'a' || next === 'an' || next === 'the' || next === 'not' || next === 'very' || next === 'so' || next === 'too' || next === 'going' || next === 'been') {
            out.push({
              rule_id: 'homophone',
              subType: 'its-its',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, "it's"),
              suggestions: [matchCase(t.display, "it's")],
              message: `Did you mean "it's"?`
            });
            if (suppressed) suppressed.add(i);
          }
        }
        else if (word === "it's" && next) {
          if (NOUN_INDICATORS.has(next) || (!VERB_INDICATORS.has(next) && !next.endsWith('ing') && next !== 'a' && next !== 'an' && next !== 'the' && next !== 'not' && next !== 'going' && next !== 'been')) {
             out.push({
              rule_id: 'homophone',
              subType: 'its-its',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'its'),
              suggestions: [matchCase(t.display, 'its')],
              message: `Did you mean "its"?`
            });
            if (suppressed) suppressed.add(i);
          }
        }

        // 4. then vs than
        else if (word === 'then' && prev) {
          // Look for comparative adjectives ending in -er (bigger, smaller, faster) or "more" / "less" / "other" / "rather"
          // Phase 40-06: also catch "more <X> then" / "less <X> then" patterns where comparator is two tokens back
          //              (e.g. "more exciting then i thought" → "more exciting than i thought")
          const prev2 = i > 1 ? tokens[i - 2].word.toLowerCase() : null;
          const isComparativePrev = (
            prev === 'more' || prev === 'less' || prev === 'other' || prev === 'rather' || prev === 'better' ||
            (prev.length > 3 && prev.endsWith('er') && validWords.has(prev) && !prev.endsWith('ver') && !prev.endsWith('her'))
          );
          const isComparativePrev2 = (prev2 === 'more' || prev2 === 'less');
          if (isComparativePrev || isComparativePrev2) {
            // Need to be careful not to flag "He went over then" but "He is taller then" is a typo.
            if (prev !== 'over' && prev !== 'under' && prev !== 'after' && prev !== 'never' && prev !== 'ever') {
              out.push({
                rule_id: 'homophone',
                subType: 'then-than',
                priority: rule.priority,
                start: t.start,
                end: t.end,
                original: t.display,
                fix: matchCase(t.display, 'than'),
                suggestions: [matchCase(t.display, 'than')],
                message: `Did you mean "than" for comparison?`
              });
              if (suppressed) suppressed.add(i);
            }
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
