/**
 * Spell-check rule: NB/NN comma before coordinating conjunction (priority 55).
 *
 * Norwegian requires a comma before "men" (but) when it joins two
 * independent clauses. Also flags missing comma before "for" (because)
 * and "eller" (or) in compound sentences with different subjects.
 *
 * Heuristic: look for conjunction token without preceding comma, where
 * a subject pronoun appears both before the conjunction (in the same
 * sentence) AND after it — strong signal for two independent clauses.
 *
 * Rule ID: 'nb-comma'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  const CONJUNCTIONS = new Set(['men', 'for', 'eller']);

  const SUBJECT_PRONOUNS_NB = new Set([
    'jeg', 'du', 'han', 'hun', 'den', 'det', 'vi', 'dere', 'de', 'man',
  ]);
  const SUBJECT_PRONOUNS_NN = new Set([
    'eg', 'du', 'han', 'ho', 'den', 'det', 'vi', 'dykk', 'dei', 'ein',
  ]);

  // "men" joining adjectives/adverbs — no comma needed
  // Pattern: adj + "men" + adj (e.g. "ung men modig")
  const COMMON_ADJ_NB = new Set([
    'stor', 'liten', 'god', 'dårlig', 'fin', 'pen', 'stygg', 'ung', 'gammel',
    'ny', 'lang', 'kort', 'høy', 'lav', 'bred', 'smal', 'tung', 'lett',
    'varm', 'kald', 'sterk', 'svak', 'rask', 'sakte', 'rik', 'fattig',
    'lykkelig', 'trist', 'glad', 'sint', 'redd', 'modig', 'snill', 'dum',
    'smart', 'flittig', 'lat', 'travel', 'enkel', 'vanskelig', 'viktig',
    'morsom', 'kjedelig', 'interessant', 'billig', 'dyr',
    'store', 'lille', 'gode', 'fine', 'pene', 'unge', 'nye', 'lange', 'korte',
    'høye', 'lave', 'varme', 'kalde', 'sterke', 'svake', 'raske', 'rike',
    'modige', 'snille', 'smarte', 'enkle', 'viktige', 'morsomme', 'billige', 'dyre',
    'hyggelig', 'hyggelige', 'praktisk', 'praktiske', 'effektiv', 'effektive',
  ]);

  function getSubjectPronouns(lang) {
    return lang === 'nn' ? SUBJECT_PRONOUNS_NN : SUBJECT_PRONOUNS_NB;
  }

  const rule = {
    id: 'nb-comma',
    languages: ['nb', 'nn'],
    priority: 55,
    exam: {
      safe: true,
      reason: "Pattern-matched comma rule — flags missing comma before coordinating conjunction between independent clauses",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: (finding) => {
      const conj = finding.conjunction || 'men';
      if (conj === 'men') {
        return {
          nb: `Det skal som regel være komma foran <em>men</em> når det skiller to setninger.`,
          nn: `Det skal som regel vere komma framfor <em>men</em> når det skil to setningar.`,
        };
      }
      if (conj === 'for') {
        return {
          nb: `Det skal være komma foran <em>for</em> når det betyr «fordi» og innleder en ny setning.`,
          nn: `Det skal vere komma framfor <em>for</em> når det tyder «fordi» og innleier ei ny setning.`,
        };
      }
      return {
        nb: `Det skal være komma foran <em>${escapeHtml(conj)}</em> når det skiller to setninger med ulikt subjekt.`,
        nn: `Det skal vere komma framfor <em>${escapeHtml(conj)}</em> når det skil to setningar med ulikt subjekt.`,
      };
    },
    check(ctx) {
      const { tokens, text, cursorPos, lang, suppressed } = ctx;
      const subjects = getSubjectPronouns(lang);
      const out = [];

      for (let i = 1; i < tokens.length - 1; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        // Do NOT check ctx.suppressed — comma placement is structural, not
        // token-spelling level. Codeswitch suppression would silence this
        // rule on short sentences where many tokens are "unknown" in the
        // fixture vocab.

        const word = t.word.toLowerCase();
        if (!CONJUNCTIONS.has(word)) continue;

        // Already has comma before? Check the raw text between prev token end and this token start.
        const prevT = tokens[i - 1];
        const gap = text.slice(prevT.end, t.start);
        if (gap.includes(',')) continue;

        // "men" joining adjectives — no comma needed
        if (word === 'men') {
          const prevWord = prevT.word.toLowerCase();
          const nextWord = tokens[i + 1].word.toLowerCase();
          if (COMMON_ADJ_NB.has(prevWord) && COMMON_ADJ_NB.has(nextWord)) continue;
        }

        // Heuristic: look for subject pronoun before AND after the conjunction
        // (within the same sentence boundaries). Sentence-end punctuation
        // (.!?;) lives in inter-token gaps because the tokenizer only emits
        // letter sequences — so we inspect text gaps, not token strings.
        let hasSubjectBefore = false;
        let hasSubjectAfter = false;

        // Scan backward for subject pronoun (max 15 tokens, stop at sentence boundary)
        for (let j = i - 1; j >= Math.max(0, i - 15); j--) {
          // Gap between this token and the next token toward the conjunction.
          const gapStart = tokens[j].end;
          const gapEnd = (j + 1 <= i) ? tokens[j + 1].start : t.start;
          const gap = text.slice(gapStart, gapEnd);
          if (/[.!?;]/.test(gap)) break;
          const w = tokens[j].word.toLowerCase();
          if (CONJUNCTIONS.has(w) && j !== i) break;
          if (subjects.has(w)) { hasSubjectBefore = true; break; }
        }

        // Scan forward for subject pronoun (max 5 tokens)
        for (let j = i + 1; j <= Math.min(tokens.length - 1, i + 5); j++) {
          const gapStart = (j - 1 >= i) ? t.end : tokens[j - 1].end;
          const gap = text.slice(gapStart, tokens[j].start);
          if (/[.!?;]/.test(gap)) break;
          const w = tokens[j].word.toLowerCase();
          if (subjects.has(w)) { hasSubjectAfter = true; break; }
        }

        if (!hasSubjectBefore || !hasSubjectAfter) continue;

        // "for" is ambiguous (preposition vs conjunction). Only flag when followed
        // by a subject pronoun immediately or within 2 tokens.
        if (word === 'for') {
          // "for at ..." is a subordinator construction ("so that"), not "because".
          // "for å ..." is "in order to".  Skip both — they're not the
          // independent-clause "for" (= because) we're targeting.
          const nextWord = tokens[i + 1].word.toLowerCase();
          if (nextWord === 'at' || nextWord === 'å') continue;
          let nearSubject = false;
          for (let j = i + 1; j <= Math.min(tokens.length - 1, i + 2); j++) {
            if (subjects.has(tokens[j].word.toLowerCase())) { nearSubject = true; break; }
          }
          if (!nearSubject) continue;
        }

        out.push({
          rule_id: 'nb-comma',
          conjunction: word,
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: ', ' + t.display,
          message: `Mangler komma foran «${t.display}»`,
        });
        if (suppressed) suppressed.add(i);
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
