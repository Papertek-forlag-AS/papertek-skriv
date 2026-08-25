/**
 * Spell-check rule: English Capitalization of days, months, languages, nationalities (priority 8).
 *
 * Norwegian does NOT capitalize these word classes; students transfer the pattern to English.
 * Flags lowercase tokens that match closed sets and suggests the capitalized form.
 *
 * Special handling:
 *   - "may" is excluded (too ambiguous as modal verb)
 *   - "march" is only flagged when preceded by month-context words (in, of, last, next, etc.)
 *
 * Rule ID: 'en-capitalization'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  const DAYS = new Set([
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  ]);

  // "may" excluded — too ambiguous as modal verb
  const MONTHS_SAFE = new Set([
    'january', 'february', 'april', 'june', 'july', 'august',
    'september', 'october', 'november', 'december',
  ]);

  // "march" only flagged with month-context
  const MARCH_CONTEXT = new Set([
    'in', 'of', 'last', 'next', 'every', 'since', 'until', 'before', 'after',
  ]);

  const LANGUAGES = new Set([
    'english', 'norwegian', 'german', 'spanish', 'french', 'chinese', 'japanese',
    'arabic', 'russian', 'swedish', 'danish', 'finnish', 'italian', 'portuguese',
    'dutch', 'polish', 'korean', 'turkish',
  ]);

  const NATIONALITIES = new Set([
    'american', 'british', 'european', 'african', 'asian', 'norwegian', 'swedish',
    'danish', 'finnish', 'icelandic', 'german', 'french', 'spanish', 'italian',
    'portuguese', 'dutch', 'polish', 'russian', 'chinese', 'japanese', 'korean',
    'mexican', 'canadian', 'australian', 'irish', 'scottish', 'turkish',
    'brazilian', 'argentinian', 'indian',
  ]);

  function capitalize(word) {
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  function getCategory(word) {
    if (DAYS.has(word)) return 'day';
    if (MONTHS_SAFE.has(word)) return 'month';
    if (LANGUAGES.has(word)) return 'language';
    if (NATIONALITIES.has(word)) return 'nationality';
    return null;
  }

  const CATEGORY_EXPLAIN = {
    day: {
      nb: 'På engelsk skrives ukedager med stor forbokstav.',
      nn: 'På engelsk skriv ein vekedagar med stor forbokstav.',
    },
    month: {
      nb: 'På engelsk skrives månedsnavn med stor forbokstav.',
      nn: 'På engelsk skriv ein månadsnavn med stor forbokstav.',
    },
    language: {
      nb: 'På engelsk skrives språknavn med stor forbokstav.',
      nn: 'På engelsk skriv ein språknamn med stor forbokstav.',
    },
    nationality: {
      nb: 'På engelsk skrives nasjonaliteter med stor forbokstav.',
      nn: 'På engelsk skriv ein nasjonalitetar med stor forbokstav.',
    },
  };

  const rule = {
    id: 'en-capitalization',
    languages: ['en'],
    priority: 8,
    exam: {
      safe: true,
      reason: 'Mechanical capitalization of proper nouns (days, months, languages, nationalities) — at browser-native spellcheck parity.',
      category: 'spellcheck',
    },
    severity: 'warning',
    explain: (finding) => {
      const cat = finding.capCategory || 'language';
      const exp = CATEGORY_EXPLAIN[cat] || CATEGORY_EXPLAIN.language;
      const word = finding.original || '';
      const fix = finding.fix || capitalize(word);
      return {
        nb: `${exp.nb} Skriv <em>${escapeHtml(fix)}</em>, ikke <em>${escapeHtml(word)}</em>.`,
        nn: `${exp.nn} Skriv <em>${escapeHtml(fix)}</em>, ikkje <em>${escapeHtml(word)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        // Skip if already capitalized
        if (t.display[0] !== t.display[0].toLowerCase() || t.display[0] === t.display[0].toUpperCase()) {
          // If first char is uppercase, skip
          if (t.display[0] === t.display[0].toUpperCase() && t.display[0] !== t.display[0].toLowerCase()) continue;
        }
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        const word = t.word;

        // Check "march" with context
        if (word === 'march') {
          const prev = i > 0 ? tokens[i - 1] : null;
          const prevWord = prev ? prev.word : '';
          // Check if previous token is a digit or a month-context word
          if (MARCH_CONTEXT.has(prevWord) || /^\d+$/.test(prevWord)) {
            const fix = capitalize(t.display);
            out.push({
              rule_id: 'en-capitalization',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: fix,
              suggestion: fix,
              capCategory: 'month',
              message: `Stor forbokstav: "${fix}" (månedsnavn)`,
            });
          }
          continue;
        }

        const cat = getCategory(word);
        if (!cat) continue;

        const fix = capitalize(t.display);
        out.push({
          rule_id: 'en-capitalization',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: fix,
          suggestion: fix,
          capCategory: cat,
          message: `Stor forbokstav: "${fix}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
