/**
 * Spell-check rule: Spanish grammar (priority 15).
 *
 * Includes:
 * - muy vs. mucho article mismatch
 *
 * Rule ID: 'es-grammar'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const rule = {
    id: 'es-grammar',
    languages: ['es'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (es-grammar) — Chrome native parity confirmed in 33-03 audit: ES grammar typo bank — single-token lookup against curated form list",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      if (finding.subType === 'muy-mucho') {
        return {
          nb: `Bruk <em>muy</em> foran adjektiv og adverb — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `Bruk <em>muy</em> føre adjektiv og adverb — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          en: `Use <em>muy</em> before adjectives and adverbs — try <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      if (finding.subType === 'mucho-muy') {
        return {
          nb: `Bruk <em>mucho</em> foran substantiv — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `Bruk <em>mucho</em> føre substantiv — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          en: `Use <em>mucho</em> before nouns — try <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      return {
        nb: finding.message,
        nn: finding.message,
        en: finding.message,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const isAdjective = vocab.isAdjective || new Set();
      const out = [];

      // v3.0.121 (synthetic-corpus probe "a el colegio" scored 0): the
      // obligatory Spanish contractions a + el → al, de + el → del. The
      // uncontracted sequence is always wrong; the only exception (proper
      // names: "de El Salvador") capitalizes El and is skipped.
      for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i];
        const n = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= n.end + 1) continue;
        if ((t.word === 'a' || t.word === 'de') && n.word === 'el' && n.display === 'el') {
          const fix = t.word === 'a' ? 'al' : 'del';
          out.push({
            rule_id: 'es-grammar',
            priority: rule.priority,
            start: t.start,
            end: n.end,
            original: `${t.display} ${n.display}`,
            fix: matchCase(t.display, fix),
            subType: 'contraction',
            message: `«${t.display} ${n.display}» → «${fix}»`,
            severity: 'error',
          });
        }
      }

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        if (next) {
          const nextWord = next.word;
          
          // 1. mucho + adjective -> muy
          // Only fire when the next word is UNAMBIGUOUSLY an adjective: skip
          // noun/adjective homographs ("mucho frío", "muchos jóvenes" — frío/
          // jóvenes are nouns) and comparatives ("mucho mejor/más" is correct —
          // mucho intensifies comparatives, never muy).
          const COMPARATIVES = new Set(['mejor', 'mejores', 'peor', 'peores', 'mayor', 'mayores', 'menor', 'menores', 'más', 'mas', 'menos']);
          // Singular mucho/mucha only: the "mucho bueno → muy bueno" error is
          // singular. Plural "muchos/muchas + word" is almost always "many +
          // plural noun" (muchos jóvenes), not "very" (muy is invariable). Also
          // skip when an adjective precedes a following noun ("mucha buena
          // suerte" — mucha modifies suerte, not buena).
          const afterNext = tokens[i + 2];
          const afterIsNoun = afterNext && nounGenus.has(afterNext.word.toLowerCase());
          if ((t.word === 'mucho' || t.word === 'mucha')
              && isAdjective.has(nextWord) && !nounGenus.has(nextWord)
              && !COMPARATIVES.has(nextWord) && !afterIsNoun) {
             out.push({
              rule_id: 'es-grammar',
              subType: 'muy-mucho',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'muy'),
              message: `Bruk "muy" foran adjektivet "${next.display}"`,
            });
          }
          
          // 2. muy + noun -> mucho/a/os/as
          // Guard: adverb homographs of nouns. "tarde/temprano/pronto" are
          // nouns in nounGenus (la tarde) but after "muy" they read as adverbs
          // ("muy tarde" = very late, correct). Don't flag muy + adverb.
          const ADVERB_HOMOGRAPHS = new Set(['tarde', 'temprano', 'pronto']);
          // Only fire when the next word is UNAMBIGUOUSLY a noun: skip noun/
          // adjective homographs ("muy conocido", "muy originales" — conocido/
          // original are adjectives, so muy is correct).
          if (t.word === 'muy' && nounGenus.has(nextWord) && !ADVERB_HOMOGRAPHS.has(nextWord)
              && !isAdjective.has(nextWord)) {
            const genus = nounGenus.get(nextWord);
            // Default to 'mucho' if unknown plural, but this is a good start
            const fix = (genus === 'f') ? 'mucha' : 'mucho';
             out.push({
              rule_id: 'es-grammar',
              subType: 'mucho-muy',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, fix),
              message: `Bruk "mucho" foran substantivet "${next.display}"`,
            });
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
