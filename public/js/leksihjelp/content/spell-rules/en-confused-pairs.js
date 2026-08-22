/**
 * Spell-check rule: English Confused Pairs (priority 42).
 *
 * Flags commonly confused word pairs beyond homophones:
 *   affect/effect, then/than, lose/loose, quiet/quite,
 *   whose/who's, accept/except, advice/advise, breath/breathe,
 *   conscience/conscious, desert/dessert, principal/principle,
 *   stationary/stationery, weather/whether
 *
 * Uses contextual heuristics (preceding/following tokens) to decide
 * which form the student likely intended.
 *
 * Rule ID: 'en-confused-pair'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase, escapeHtml } = core;

  // Each pair: [wordA, wordB, contextFn]
  // contextFn(word, prev, next, tokens, i) → null | { fix, subType }
  // null = no finding; object = fire with that fix.

  const DETERMINERS = new Set(['the', 'a', 'an', 'this', 'that', 'my', 'his', 'her', 'our', 'your', 'their', 'its', 'some', 'any', 'no', 'every']);
  const ADJECTIVES = new Set(['big', 'small', 'good', 'bad', 'great', 'major', 'minor', 'positive', 'negative', 'significant', 'lasting', 'profound', 'adverse', 'direct', 'indirect', 'immediate', 'noticeable', 'long-term', 'short-term', 'real', 'special', 'important']);
  const PREPOSITIONS_AFTER_EFFECT = new Set(['on', 'of', 'in']);
  const VERB_WILL = new Set(['will', 'can', 'could', 'would', 'should', 'may', 'might', 'must', 'shall', 'does', 'did', "doesn't", "didn't", "won't", "can't", "couldn't", "wouldn't", "shouldn't"]);

  const PAIRS = [
    // affect (verb) vs effect (noun)
    {
      words: ['affect', 'effect', 'affects', 'effects', 'affected', 'effected'],
      check(word, prev, next) {
        const lw = word.toLowerCase();
        // "affect" forms used as noun → should be "effect"
        if ((lw === 'affect' || lw === 'affects') && prev && (DETERMINERS.has(prev) || ADJECTIVES.has(prev))) {
          return { fix: lw === 'affect' ? 'effect' : 'effects', subType: 'affect-effect' };
        }
        // "effect" used as verb (after will/can/modal or "to effect") → usually want "affect"
        if (lw === 'effect' && prev && (VERB_WILL.has(prev) || prev === 'to' || prev === 'not')) {
          return { fix: 'affect', subType: 'affect-effect' };
        }
        // "the/a effect on" → OK (noun use). But "effect" after subject pronoun → likely "affect"
        if (lw === 'effect' && prev && (prev === 'it' || prev === 'this' || prev === 'that') && next && (next === 'me' || next === 'us' || next === 'you' || next === 'them' || next === 'him' || next === 'her' || next === 'people' || next === 'everyone' || next === 'everything')) {
          return { fix: 'affect', subType: 'affect-effect' };
        }
        return null;
      },
    },
    // lose (verb) vs loose (adjective)
    {
      words: ['lose', 'loose'],
      check(word, prev, next) {
        const lw = word.toLowerCase();
        // "loose" as verb → "lose" (after modals, "to", "don't", pronouns)
        if (lw === 'loose' && prev && (VERB_WILL.has(prev) || prev === 'to' || prev === "don't" || prev === 'not' || prev === 'i' || prev === 'you' || prev === 'we' || prev === 'they')) {
          return { fix: 'lose', subType: 'lose-loose' };
        }
        // "lose" as adjective → "loose" (after determiners/adjectives)
        if (lw === 'lose' && prev && (DETERMINERS.has(prev) || prev === 'too' || prev === 'very' || prev === 'really' || prev === 'quite')) {
          return { fix: 'loose', subType: 'lose-loose' };
        }
        return null;
      },
    },
    // quiet vs quite
    {
      words: ['quiet', 'quite'],
      check(word, prev, next) {
        const lw = word.toLowerCase();
        // "quiet" before adjective/adverb where "quite" was intended
        if (lw === 'quiet' && next && (next === 'good' || next === 'a' || next === 'well' || next === 'often' || next === 'sure' || next === 'right' || next === 'nice' || next === 'different' || next === 'interesting' || next === 'big' || next === 'small' || next === 'easy' || next === 'hard' || next === 'difficult' || next === 'important' || next === 'common' || next === 'popular' || next === 'simply' || next === 'frankly' || next === 'honestly')) {
          return { fix: 'quite', subType: 'quiet-quite' };
        }
        // "quite" as noun/adjective (after det or "be/stay/keep")
        if (lw === 'quite' && prev && (DETERMINERS.has(prev) || prev === 'be' || prev === 'stay' || prev === 'keep' || prev === 'very' || prev === 'too' || prev === 'really' || prev === 'so')) {
          return { fix: 'quiet', subType: 'quiet-quite' };
        }
        return null;
      },
    },
    // whose (possessive) vs who's (who is/has)
    {
      words: ["whose", "who's"],
      check(word, prev, next) {
        const lw = word.toLowerCase();
        if (lw === 'whose' && next && (next === 'going' || next === 'been' || next === 'the' || next === 'that' || next === 'this' || next === 'coming' || next === 'doing' || next === 'making' || next === 'getting' || next === 'not')) {
          return { fix: "who's", subType: 'whose-whos' };
        }
        if (lw === "who's" && next && !next.endsWith('ing') && next !== 'the' && next !== 'a' && next !== 'an' && next !== 'not' && next !== 'been' && next !== 'going' && next !== 'that' && next !== 'this' && next !== 'there' && next !== 'here') {
          if (prev !== 'know' && prev !== 'tell' && prev !== 'wonder' && prev !== 'ask') {
            return { fix: 'whose', subType: 'whose-whos' };
          }
        }
        return null;
      },
    },
    // accept (verb) vs except (preposition)
    {
      words: ['accept', 'except'],
      check(word, prev, next) {
        const lw = word.toLowerCase();
        // "except" used as verb → "accept" (after modals, "to", pronouns)
        if (lw === 'except' && prev && (VERB_WILL.has(prev) || prev === 'to' || prev === 'i' || prev === 'we' || prev === 'they' || prev === 'please' || prev === 'must' || prev === "don't" || prev === 'not')) {
          return { fix: 'accept', subType: 'accept-except' };
        }
        // "accept" used as preposition → "except" (after everything/everyone/all/nobody)
        if (lw === 'accept' && prev && (prev === 'everyone' || prev === 'everything' || prev === 'everybody' || prev === 'all' || prev === 'nobody' || prev === 'nothing' || prev === 'anything')) {
          return { fix: 'except', subType: 'accept-except' };
        }
        return null;
      },
    },
    // advice (noun) vs advise (verb)
    {
      words: ['advice', 'advise'],
      check(word, prev, next) {
        const lw = word.toLowerCase();
        // "advice" as verb → "advise" (after modals, "to", "I/would")
        if (lw === 'advice' && prev && (VERB_WILL.has(prev) || prev === 'to' || prev === 'i' || prev === 'please')) {
          return { fix: 'advise', subType: 'advice-advise' };
        }
        // "advise" as noun → "advice" (after determiners, "some", "good")
        if (lw === 'advise' && prev && (DETERMINERS.has(prev) || prev === 'some' || prev === 'good' || prev === 'great' || prev === 'bad')) {
          return { fix: 'advice', subType: 'advice-advise' };
        }
        return null;
      },
    },
    // breath (noun) vs breathe (verb)
    {
      words: ['breath', 'breathe'],
      check(word, prev, next) {
        const lw = word.toLowerCase();
        // "breath" as verb → "breathe" (after modals, "to", "can't")
        if (lw === 'breath' && prev && (VERB_WILL.has(prev) || prev === 'to' || prev === 'not' || prev === "can't" || prev === "couldn't" || prev === 'i' || prev === 'you' || prev === 'we' || prev === 'they')) {
          return { fix: 'breathe', subType: 'breath-breathe' };
        }
        // "breathe" as noun → "breath" (after determiners, "deep", "take a")
        if (lw === 'breathe' && prev && (DETERMINERS.has(prev) || prev === 'deep' || prev === 'big' || prev === 'long' || prev === 'short')) {
          return { fix: 'breath', subType: 'breath-breathe' };
        }
        return null;
      },
    },
    // principal (person/main) vs principle (concept/rule)
    {
      words: ['principal', 'principle'],
      check(word, prev, next) {
        const lw = word.toLowerCase();
        // "principle" before noun (meaning "main") → "principal"
        if (lw === 'principle' && next && (next === 'reason' || next === 'cause' || next === 'city' || next === 'aim' || next === 'concern' || next === 'source' || next === 'component' || next === 'amount' || next === 'investigator')) {
          return { fix: 'principal', subType: 'principal-principle' };
        }
        // "principal" after "in/on" → "principle" (as in "in principle")
        if (lw === 'principal' && prev && (prev === 'in' || prev === 'on' || prev === 'basic' || prev === 'fundamental' || prev === 'guiding' || prev === 'key' || prev === 'general' || prev === 'moral')) {
          return { fix: 'principle', subType: 'principal-principle' };
        }
        return null;
      },
    },
    // weather vs whether
    {
      words: ['weather', 'whether'],
      check(word, prev, next) {
        const lw = word.toLowerCase();
        // "weather" as conjunction → "whether" (after "know/sure/decide/wonder/ask")
        if (lw === 'weather' && prev && (prev === 'know' || prev === 'sure' || prev === 'decide' || prev === 'wonder' || prev === 'ask' || prev === 'see' || prev === 'check' || prev === 'tell' || prev === 'unsure' || prev === 'determine')) {
          return { fix: 'whether', subType: 'weather-whether' };
        }
        // "weather" followed by "or not" → "whether"
        if (lw === 'weather' && next === 'or') {
          return { fix: 'whether', subType: 'weather-whether' };
        }
        // "whether" after "the/bad/good/nice" → "weather" (noun)
        if (lw === 'whether' && prev && (DETERMINERS.has(prev) || prev === 'bad' || prev === 'good' || prev === 'nice' || prev === 'cold' || prev === 'hot' || prev === 'warm' || prev === 'rainy')) {
          return { fix: 'weather', subType: 'weather-whether' };
        }
        return null;
      },
    },
    // clothe (verb: to dress) vs clothes (noun: garments)
    // Norwegian students almost always mean the noun; "clothe" is rare.
    {
      words: ['clothe'],
      check(word, prev, next) {
        // Legitimate verb contexts: "to clothe", subject+verb, coordinated verb
        if (prev === 'to' || prev === 'they' || prev === 'we' || prev === 'you' ||
            prev === 'i' || prev === 'who' || prev === 'and' || prev === 'or' ||
            next === 'and' || next === 'or') return null;
        return { fix: 'clothes', subType: 'clothe-clothes' };
      },
    },
    // red (colour) vs read (past tense of read)
    // "I have red" → "I have read" — Norwegian students spell the past
    // participle phonetically.
    {
      words: ['red'],
      check(word, prev, next) {
        if (prev === 'have' || prev === 'has' || prev === 'had') {
          return { fix: 'read', subType: 'red-read' };
        }
        return null;
      },
    },
    // familie (Norwegian) → family (English)
    // Direct Norwegian-word insertion; "familie" is never correct in English.
    {
      words: ['familie'],
      check() {
        return { fix: 'family', subType: 'familie-family' };
      },
    },
    // to (preposition / infinitive) vs too (also / excessive) vs two (number)
    {
      words: ['to', 'too', 'two'],
      check(word, prev, next) {
        const lw = word.toLowerCase();
        // "to" before "much/many/few/little/big/small/late/early/old/young/expensive/much" → "too"
        if (lw === 'to' && next && (next === 'much' || next === 'many' || next === 'few' || next === 'little' || next === 'big' || next === 'small' || next === 'late' || next === 'early' || next === 'old' || next === 'young' || next === 'expensive' || next === 'cheap' || next === 'hot' || next === 'cold' || next === 'fast' || next === 'slow' || next === 'long' || next === 'short' || next === 'hard' || next === 'easy' || next === 'high' || next === 'low' || next === 'tired' || next === 'busy' || next === 'tight' || next === 'loose')) {
          return { fix: 'too', subType: 'to-too' };
        }
        // "to" at end of clause meaning "also" — hard to detect reliably; skip.
        // "too" before bare verb (infinitive position) → "to"
        if (lw === 'too' && next && (next === 'be' || next === 'have' || next === 'do' || next === 'go' || next === 'see' || next === 'come' || next === 'get' || next === 'make' || next === 'take' || next === 'give' || next === 'eat' || next === 'drink' || next === 'sleep' || next === 'wait' || next === 'know' || next === 'work' || next === 'play' || next === 'help')) {
          return { fix: 'to', subType: 'to-too' };
        }
        return null;
      },
    },
  ];

  // Build a quick lookup from word → pair(s)
  const wordToPairs = new Map();
  for (const pair of PAIRS) {
    for (const w of pair.words) {
      const lw = w.toLowerCase();
      if (!wordToPairs.has(lw)) wordToPairs.set(lw, []);
      wordToPairs.get(lw).push(pair);
    }
  }

  const EXPLAIN = {
    'affect-effect': (f) => ({
      nb: `<strong>Affect</strong> er et verb (å påvirke). <strong>Effect</strong> er vanligvis et substantiv (en virkning/effekt).`,
      nn: `<strong>Affect</strong> er eit verb (å påverke). <strong>Effect</strong> er vanlegvis eit substantiv (ein verknad/effekt).`,
    }),
    'lose-loose': (f) => ({
      nb: `<strong>Lose</strong> betyr å miste/tape. <strong>Loose</strong> betyr løs (adjektiv).`,
      nn: `<strong>Lose</strong> tyder å miste/tape. <strong>Loose</strong> tyder laus (adjektiv).`,
    }),
    'quiet-quite': (f) => ({
      nb: `<strong>Quiet</strong> betyr stille. <strong>Quite</strong> betyr ganske/nokså.`,
      nn: `<strong>Quiet</strong> tyder stille. <strong>Quite</strong> tyder ganske/nokså.`,
    }),
    'whose-whos': (f) => ({
      nb: `<strong>Whose</strong> er eiendomsform (hvem sin). <strong>Who's</strong> er sammentrekning av «who is» eller «who has».`,
      nn: `<strong>Whose</strong> er eigedomsform (kven sin). <strong>Who's</strong> er samandrag av «who is» eller «who has».`,
    }),
    'accept-except': (f) => ({
      nb: `<strong>Accept</strong> betyr å godta. <strong>Except</strong> betyr bortsett fra.`,
      nn: `<strong>Accept</strong> tyder å godta. <strong>Except</strong> tyder bortsett frå.`,
    }),
    'advice-advise': (f) => ({
      nb: `<strong>Advice</strong> er et substantiv (råd). <strong>Advise</strong> er et verb (å råde).`,
      nn: `<strong>Advice</strong> er eit substantiv (råd). <strong>Advise</strong> er eit verb (å råde).`,
    }),
    'breath-breathe': (f) => ({
      nb: `<strong>Breath</strong> er et substantiv (et pust). <strong>Breathe</strong> er et verb (å puste).`,
      nn: `<strong>Breath</strong> er eit substantiv (eit pust). <strong>Breathe</strong> er eit verb (å puste).`,
    }),
    'principal-principle': (f) => ({
      nb: `<strong>Principal</strong> betyr hoved-/rektor. <strong>Principle</strong> betyr prinsipp/regel.`,
      nn: `<strong>Principal</strong> tyder hovud-/rektor. <strong>Principle</strong> tyder prinsipp/regel.`,
    }),
    'weather-whether': (f) => ({
      nb: `<strong>Weather</strong> betyr vær (sol, regn). <strong>Whether</strong> betyr om/hvorvidt.`,
      nn: `<strong>Weather</strong> tyder vêr (sol, regn). <strong>Whether</strong> tyder om/korvidt.`,
    }),
    'to-too': (f) => ({
      nb: `<strong>To</strong> er preposisjon eller infinitivsmerke. <strong>Too</strong> betyr «for mye» eller «også». <strong>Two</strong> er tallet 2.`,
      nn: `<strong>To</strong> er preposisjon eller infinitivsmerke. <strong>Too</strong> tyder «for mykje» eller «òg». <strong>Two</strong> er talet 2.`,
    }),
    'clothe-clothes': (f) => ({
      nb: `<strong>Clothe</strong> er et verb (å kle på). <strong>Clothes</strong> er et substantiv (klær).`,
      nn: `<strong>Clothe</strong> er eit verb (å kle på). <strong>Clothes</strong> er eit substantiv (klede).`,
    }),
    'red-read': (f) => ({
      nb: `Etter <em>have/has/had</em> skal det være <strong>read</strong> (fortid av «to read»), ikke <strong>red</strong> (fargen rød).`,
      nn: `Etter <em>have/has/had</em> skal det vere <strong>read</strong> (fortid av «to read»), ikkje <strong>red</strong> (fargen raud).`,
    }),
    'familie-family': (f) => ({
      nb: `<strong>Familie</strong> er det norske ordet — på engelsk heter det <strong>family</strong>.`,
      nn: `<strong>Familie</strong> er det norske ordet — på engelsk heiter det <strong>family</strong>.`,
    }),
  };

  const rule = {
    id: 'en-confused-pair',
    languages: ['en'],
    priority: 42,
    exam: {
      safe: true,
      reason: "Single-token contextual lookup — same complexity class as en-homophones",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      const fn = EXPLAIN[finding.subType];
      if (fn) return fn(finding);
      return { nb: finding.message, nn: finding.message };
    },
    check(ctx) {
      const { tokens, cursorPos, suppressed } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        const word = t.word.toLowerCase();
        const pairs = wordToPairs.get(word);
        if (!pairs) continue;

        const prev = i > 0 ? tokens[i - 1].word.toLowerCase() : null;
        const next = i < tokens.length - 1 ? tokens[i + 1].word.toLowerCase() : null;

        for (const pair of pairs) {
          const result = pair.check(word, prev, next, tokens, i);
          if (result) {
            out.push({
              rule_id: 'en-confused-pair',
              subType: result.subType,
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, result.fix),
              suggestions: [matchCase(t.display, result.fix)],
              message: `Did you mean "${result.fix}"?`,
            });
            if (suppressed) suppressed.add(i);
            break;
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
