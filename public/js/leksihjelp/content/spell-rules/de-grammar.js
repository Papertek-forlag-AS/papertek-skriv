/**
 * Spell-check rule: German grammar (priority 15).
 *
 * Includes:
 * - Formal vs. Informal (Sie vs. du) mismatch
 *
 * Rule ID: 'de-grammar'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const rule = {
    id: 'de-grammar',
    languages: ['de'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (de-grammar) — Chrome native parity confirmed in 33-03 audit: DE grammar typo bank — single-token lookup against curated form list",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      if (finding.subType === 'formal-informal') {
        const correctPronouns = finding.original === 'sind' || finding.original === 'haben' ? '«wir» eller «sie/Sie»' : '«du»';
        return {
          nb: `Blanding av formell (Sie) og uformell (du) form. Verbet <em>${escapeHtml(finding.original)}</em> brukes sammen med ${correctPronouns} — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `Blanding av formell (Sie) og uformell (du) form. Verbet <em>${escapeHtml(finding.original)}</em> brukast saman med ${correctPronouns} — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          en: `Mixing formal (Sie) and informal (du) forms. The verb <em>${escapeHtml(finding.original)}</em> belongs with ${correctPronouns} — try <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      if (finding.subType === 'accusative-der' || finding.subType === 'accusative-ein') {
        return {
          nb: `Bruk akkusativ (<em>${escapeHtml(finding.fix)}</em>) her. Verbet «${escapeHtml(finding.verb)}» tar direkte objekt, og «${escapeHtml(finding.noun)}» er et hankjønnsord.`,
          nn: `Bruk akkusativ (<em>${escapeHtml(finding.fix)}</em>) her. Verbet «${escapeHtml(finding.verb)}» tar direkte objekt, og «${escapeHtml(finding.noun)}» er eit hankjønnsord.`,
          en: `Use the accusative (<em>${escapeHtml(finding.fix)}</em>) here. The verb "${escapeHtml(finding.verb)}" takes a direct object, and "${escapeHtml(finding.noun)}" is a masculine noun.`,
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
      const out = [];

      const TRANSITIVE_VERBS = new Set([
        'habe', 'hast', 'hat', 'haben', 'habt',
        'sehe', 'siehst', 'sieht', 'sehen', 'seht',
        'esse', 'isst', 'essen', 'esst',
        'trinke', 'trinkst', 'trinken', 'trinkt',
        'kaufe', 'kaufst', 'kaufen', 'kauft',
        'finde', 'findest', 'findet', 'finden',
        'mache', 'machst', 'macht', 'machen',
        'liebe', 'liebst', 'liebt', 'lieben',
        'suche', 'suchst', 'sucht', 'suchen',
        'besuche', 'besuchst', 'besucht', 'besuchen'
      ]);

      const DATIVE_PREPS = new Set(['aus', 'bei', 'mit', 'nach', 'seit', 'von', 'zu']);
      const DATIVE_ARTICLES = new Set([
        'dem', 'der', 'einem', 'einer',
        'meinem', 'meiner', 'deinem', 'deiner', 'seinem', 'seiner',
        'unserem', 'unserer', 'eurem', 'eurer', 'ihrem', 'ihrer'
      ]);

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        const nextNext = tokens[i + 2];
        const nextNextNext = tokens[i + 3];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        if (next) {
          // 3. Adjective Endings (Dative Weak/Mixed Declension)
          // Pattern: Prep (Dative) + Article (Dative) + Adjective + Noun
          // Example: "mit dem großem Hund" -> "großen"
          if (DATIVE_PREPS.has(t.word) && DATIVE_ARTICLES.has(next.word) && nextNext && nextNextNext) {
            const adj = nextNext;
            // If it ends in -em or -er, it might be a strong declension form used incorrectly after an article
            if ((adj.word.endsWith('em') || adj.word.endsWith('er')) && adj.word.length > 3) {
               const fix = adj.word.slice(0, -2) + 'en';
               out.push({
                rule_id: 'de-grammar',
                subType: 'adj-ending-dative',
                priority: rule.priority,
                start: adj.start,
                end: adj.end,
                original: adj.display,
                fix: matchCase(adj.display, fix),
                suggestion: matchCase(adj.display, fix),
                message: `Etter artikkelen "${next.display}" skal adjektivet ha svak bøying (-en).`,
              });
            }
          }
          // 1. Formal vs. Informal
          if (t.word === 'sie' && t.display === 'Sie') {
            if (next.word === 'bist') {
              out.push({
                rule_id: 'de-grammar',
                subType: 'formal-informal',
                priority: rule.priority,
                start: next.start,
                end: next.end,
                original: next.display,
                fix: matchCase(next.display, 'sind'),
                message: 'Sie + sind',
              });
            } else if (next.word === 'hast') {
              out.push({
                rule_id: 'de-grammar',
                subType: 'formal-informal',
                priority: rule.priority,
                start: next.start,
                end: next.end,
                original: next.display,
                fix: matchCase(next.display, 'haben'),
                message: 'Sie + haben',
              });
            }
          }
          if (t.word === 'du') {
             if (next.word === 'sind') {
              out.push({
                rule_id: 'de-grammar',
                subType: 'formal-informal',
                priority: rule.priority,
                start: next.start,
                end: next.end,
                original: next.display,
                fix: matchCase(next.display, 'bist'),
                message: 'du + bist',
              });
            } else if (next.word === 'haben') {
              out.push({
                rule_id: 'de-grammar',
                subType: 'formal-informal',
                priority: rule.priority,
                start: next.start,
                end: next.end,
                original: next.display,
                fix: matchCase(next.display, 'hast'),
                message: 'du + hast',
              });
            }
          }

          // 2. Accusative 'den/einen' after transitive verbs
          // Example: "Ich habe der Ball" -> "den Ball", "Ich habe ein Ball" -> "einen Ball"
          if (TRANSITIVE_VERBS.has(t.word)) {
            if (next.word === 'der') {
              out.push({
                rule_id: 'de-grammar',
                subType: 'accusative-der',
                priority: rule.priority,
                start: next.start,
                end: next.end,
                original: next.display,
                fix: matchCase(next.display, 'den'),
                suggestion: matchCase(next.display, 'den'),
                verb: t.display,
                noun: nextNext ? nextNext.display : next.display,
                message: `Akkusativ: "${t.display} den"`,
              });
            } else if (next.word === 'ein') {
              // We only flag 'ein' -> 'einen' if the NEXT word is a known masculine noun
              const nextNext = tokens[i + 2];
              if (nextNext && vocab.nounGenus && vocab.nounGenus.get(nextNext.word) === 'm') {
                out.push({
                  rule_id: 'de-grammar',
                  subType: 'accusative-ein',
                  priority: rule.priority,
                  start: next.start,
                  end: next.end,
                  original: next.display,
                  fix: matchCase(next.display, 'einen'),
                  suggestion: matchCase(next.display, 'einen'),
                  verb: t.display,
                  noun: nextNext.display,
                  message: `Akkusativ: "${t.display} einen"`,
                });
              }
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
