/**
 * Spell-check rule: English A/An Article Agreement (priority 9).
 *
 * Flags "a" before vowel-sound words and "an" before consonant-sound words:
 *   "a apple" → "an apple"
 *   "an book" → "a book"
 *
 * Handles phonetic exceptions:
 *   - Silent-H words: hour, honest, honour, heir → use "an"
 *   - Consonant-U words: uniform, university, unique → use "a"
 *   - "one"/"once" start with "w" sound → use "a"
 *
 * Rule ID: 'en-a-an'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

  // Words starting with 'u' that have consonant "yoo" sound — use "a"
  const U_CONSONANT = new Set([
    'uniform', 'university', 'united', 'unique', 'unit', 'union', 'universal',
    'usual', 'usually', 'useful', 'used', 'user', 'usage', 'unicorn', 'unanimous',
    'uranium', 'utensil', 'ukulele', 'utopia', 'utility', 'utilize',
  ]);
  // Wikipedia-corpus wave 2 (2026-06-12): the exact-word set above can't
  // keep up with derivations («a Uruguayan», «a Ugandan», «a Unionist» all
  // flagged →an; the 'a' is correct — /ju/ sound). Prefix classes cover the
  // productive /ju/- and /j/-initial families; 'eu' covers European/euro.
  const U_CONSONANT_PREFIXES = ['uni', 'use', 'usu', 'usa', 'ute', 'uti', 'ubi', 'ura', 'uru', 'uga', 'ukr', 'uto', 'eu'];

  // Words starting with consonant but vowel sound — use "an"
  const SILENT_H = new Set([
    'hour', 'hours', 'honest', 'honestly', 'honor', 'honour', 'honourable', 'heir', 'heirloom',
  ]);
  // Wave 2: productive silent-h families («an Honorary Professor» flagged
  // →a; the 'an' is correct).
  const SILENT_H_PREFIXES = ['hour', 'honest', 'honor', 'honou', 'heir'];

  // "one"/"once" start with "w" sound — use "a"
  const ONE_WORDS = new Set(['one', 'once']);

  const isUConsonant = (w) => U_CONSONANT.has(w) || U_CONSONANT_PREFIXES.some(p => w.startsWith(p));
  const isSilentH = (w) => SILENT_H.has(w) || SILENT_H_PREFIXES.some(p => w.startsWith(p));

  // All-caps abbreviations: pronounced letter-by-letter, so the FIRST letter's
  // letter-name vowel sound rules. F/H/L/M/N/R/S/X start with a vowel sound
  // (eff/aitch/ell/em/en/ar/ess/ex) and take "an"; U starts with a consonant
  // "yoo" sound and takes "a". Other consonants take "a"; AEIO vowels take "an".
  const ABBR_VOWEL_SOUND_INITIALS = new Set(['F', 'H', 'L', 'M', 'N', 'R', 'S', 'X']);
  const ABBR_CONSONANT_SOUND_INITIALS = new Set(['U']);  // "yoo"

  // Phase 42: uncountable nouns from papertek-vocabulary articlesbank
  // (articleUsage.form === null). Flagging "a/an + uncountable" → drop article
  // or use "some". Source: en/articlesbank.json synced 2026-05-06.
  const UNCOUNTABLE = new Set([
    'accommodation', 'advice', 'air', 'baggage', 'behavior', 'behaviour',
    'bread', 'butter', 'cheese', 'coffee', 'equipment', 'evidence',
    'feedback', 'furniture', 'hardware', 'health', 'homework',
    'information', 'knowledge', 'luggage', 'milk', 'money', 'music',
    'news', 'oil', 'pepper', 'progress', 'research', 'rice', 'salt',
    'software', 'sugar', 'tea', 'traffic', 'transport', 'violence',
    'vocabulary', 'water', 'wealth', 'weather',
  ]);

  const rule = {
    id: 'en-a-an',
    languages: ['en'],
    priority: 9,
    exam: {
      safe: true,
      reason: 'Article phonetic agreement; 2-token window; at browser-native spellcheck parity',
      category: 'grammar-lookup',
    },
    severity: 'warning',
    explain: (finding) => {
      if (finding.subType === 'uncountable') {
        return {
          nb: `<em>${escapeHtml(finding.nextWord)}</em> er et utellelig substantiv på engelsk — bruk det uten artikkel (eller med <em>some</em>/<em>the</em>).`,
          nn: `<em>${escapeHtml(finding.nextWord)}</em> er eit uteljeleg substantiv på engelsk — bruk det utan artikkel (eller med <em>some</em>/<em>the</em>).`,
        };
      }
      if (finding.fix === 'an' || finding.fix === 'An') {
        return {
          nb: `Bruk <em>an</em> foran vokal-lyd: <em>an ${escapeHtml(finding.nextWord)}</em>.`,
          nn: `Bruk <em>an</em> framfor vokal-lyd: <em>an ${escapeHtml(finding.nextWord)}</em>.`,
        };
      }
      return {
        nb: `Bruk <em>a</em> foran konsonant-lyd: <em>a ${escapeHtml(finding.nextWord)}</em>.`,
        nn: `Bruk <em>a</em> framfor konsonant-lyd: <em>a ${escapeHtml(finding.nextWord)}</em>.`,
      };
    },
    check(ctx) {
      const { text, tokens, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (!next) continue;
        if (t.word !== 'a' && t.word !== 'an') continue;
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= next.end + 1) continue;

        // Wave 2 (2026-06-12): adjacency guard. The tokenizer skips digits
        // and symbols, so «a 1989 American movie» paired a↔American and
        // flagged a→an; same shape for «a 10% uncertainty», the 'A' inside
        // «S.p.A. is an Italian», «A4», and «A&E». If anything non-space
        // sits between the article and its candidate word, the pairing is
        // wrong — skip. Also skip single-letter article tokens glued to
        // abbreviation dots (char right before is '.').
        if (/\S/.test(text.slice(t.end, next.start))) continue;
        if (t.start > 0 && text[t.start - 1] === '.') continue;

        // Skip metalinguistic mentions: "a" / "an" wrapped in quotes
        const prevCh = text[t.start - 1];
        const nextCh = text[t.end];
        if ((prevCh === '"' || prevCh === '“' || prevCh === '”') &&
            (nextCh === '"' || nextCh === '“' || nextCh === '”')) continue;

        const nextWord = next.word;

        // Phase 42: uncountable-noun check. "a information" / "an advice" → drop article.
        // Wave 2 (2026-06-12): attributive guard — «a water tank», «a traffic
        // accident», «a health disturbance» use the uncountable as a COMPOUND
        // MODIFIER of a countable head noun; the article is correct. Skip when
        // the token after the uncountable is a lowercase content word
        // (validWords hit that isn't a function word / -ly adverb).
        const FUNC_WORDS = rule.__funcWords || (rule.__funcWords = new Set([
          'about', 'above', 'after', 'against', 'and', 'as', 'at', 'before',
          'but', 'by', 'during', 'for', 'from', 'in', 'into', 'is', 'it',
          'of', 'on', 'or', 'over', 'that', 'the', 'this', 'to', 'under',
          'was', 'when', 'which', 'who', 'with', 'are', 'were', 'has',
          'have', 'had', 'can', 'will', 'would', 'should', 'could', 'not',
        ]));
        const afterTok = tokens[i + 2];
        const validWords = (ctx.vocab && ctx.vocab.validWords) || new Set();
        const attributive = afterTok
          && /^[a-z]/.test(afterTok.display)
          && !FUNC_WORDS.has(afterTok.word)
          && !afterTok.word.endsWith('ly')
          && validWords.has(afterTok.word)
          && !/\S/.test(text.slice(next.end, afterTok.start));
        // Serving idiom (Ordbank sweep 2026-07): "a coffee" / "a tea" /
        // "a water" = one serving — standard English ("He ordered a coffee").
        // Don't flag these as uncountable-with-article.
        const SERVABLE = rule.__servable || (rule.__servable = new Set([
          'coffee', 'tea', 'water', 'beer', 'juice',
        ]));
        if (UNCOUNTABLE.has(nextWord) && !attributive && !SERVABLE.has(nextWord)) {
          out.push({
            rule_id: 'en-a-an',
            subType: 'uncountable',
            priority: rule.priority,
            start: t.start, end: t.end,
            original: t.display,
            // Suggest dropping the article entirely. Fix is empty string; runner
            // should treat it as "remove this token". For markup, emit "—".
            fix: '',
            suggestion: '',
            nextWord: next.display,
            message: `"${nextWord}" er utellelig — utelat ${t.display === 'an' ? '"an"' : '"a"'}`,
          });
          continue;  // Don't also fire the a/an phonetic check on the same token.
        }

        const firstChar = nextWord[0];

        // All-caps abbreviations (FBI, NASA, URL, …) — decide by FIRST letter's
        // letter-name sound, not the spelling vowel. Cap initial drives the rule;
        // multi-char acronyms only (single-char "A"/"I" are pronouns, not acronyms).
        const isAllCaps = next.display.length > 1 && next.display === next.display.toUpperCase();
        // Wave 2 (2026-06-12): hyphenated initials («an X-Man», «a D-Day»)
        // are pronounced by letter name just like acronyms. The tokenizer
        // splits on the hyphen, so a single capital letter glued to '-' in
        // the raw text is the letter-initial shape.
        const isLetterInitial = /^[A-Z][-&]/.test(next.display)
          || (next.display.length === 1 && /^[A-Z]$/.test(next.display) && text[next.end] === '-');
        let startsWithVowel;
        if (isAllCaps || isLetterInitial) {
          const firstUpper = next.display[0];
          if (ABBR_VOWEL_SOUND_INITIALS.has(firstUpper)) startsWithVowel = true;
          else if (ABBR_CONSONANT_SOUND_INITIALS.has(firstUpper)) startsWithVowel = false;
          else startsWithVowel = VOWELS.has(firstChar);
        } else {
          startsWithVowel = VOWELS.has(firstChar);
        }

        let shouldBeAn = false;
        let shouldBeA = false;

        // Ordbank sweep 2026-07: the lexical exception sets (U_CONSONANT,
        // SILENT_H, ONE_WORDS) describe SPELLED-OUT words. For letter-named
        // abbreviations they misfire — the 'eu' prefix (european/euro) caught
        // the acronym "EU", flagging correct "an EU" → "a" ("EU" = "ee-yoo",
        // vowel letter-name). The abbr branch above already decided by
        // letter-name sound; skip the lexical exceptions entirely.
        const isAbbr = isAllCaps || isLetterInitial;

        if (t.word === 'a') {
          // "a" before vowel-starting word → should be "an"
          if (startsWithVowel) {
            // Exceptions: U_CONSONANT and ONE_WORDS keep "a" (spelled words only)
            if (isAbbr || (!isUConsonant(nextWord) && !ONE_WORDS.has(nextWord))) {
              shouldBeAn = true;
            }
          }
          // "a" before silent-H word → should be "an"
          if (!isAbbr && isSilentH(nextWord)) {
            shouldBeAn = true;
          }
        }

        if (t.word === 'an') {
          // "an" before consonant-starting word → should be "a"
          if (!startsWithVowel) {
            // Exception: SILENT_H keeps "an" (spelled words only)
            if (isAbbr || !isSilentH(nextWord)) {
              shouldBeA = true;
            }
          }
          if (!isAbbr) {
            // "an" before U_CONSONANT word → should be "a"
            if (isUConsonant(nextWord)) {
              shouldBeA = true;
            }
            // "an" before ONE_WORDS → should be "a"
            if (ONE_WORDS.has(nextWord)) {
              shouldBeA = true;
            }
          }
        }

        if (shouldBeAn) {
          const fix = matchCase(t.display, 'an');
          out.push({
            rule_id: 'en-a-an', priority: rule.priority,
            start: t.start, end: t.end,
            original: t.display, fix: fix, suggestion: fix,
            nextWord: next.display,
            message: `Artikkel: Bruk "an" foran "${next.display}"`,
          });
        } else if (shouldBeA) {
          const fix = matchCase(t.display, 'a');
          out.push({
            rule_id: 'en-a-an', priority: rule.priority,
            start: t.start, end: t.end,
            original: t.display, fix: fix, suggestion: fix,
            nextWord: next.display,
            message: `Artikkel: Bruk "a" foran "${next.display}"`,
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
