/**
 * Spell-check rule: collocation error detection (REG-02, priority 65).
 *
 * Phase 6. Data-driven rule that flags wrong-verb bigrams and other
 * collocation errors in English. Sources data from vocab-seam collocationbank;
 * falls back to inline SEED_COLLOCATIONS when the bank is absent.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Phase 42: SEED_COLLOCATIONS removed — collocationbank in
  // papertek-vocabulary is now the canonical source for all six languages
  // (verified 2026-05-06: 34 EN, 13 NB, 22 DE, 29 ES, 33 FR entries; NN
  // falls back to NB via the lang-resolution below). The rule reads
  // ctx.vocab.collocations populated by the vocab seam.

  const COLLOC_NOUN_DETERMINERS = new Set(['el','la','los','las','un','una','unos','unas','mi','tu','su','mis','tus','sus','nuestro','nuestra','vuestro','vuestra','sin','con','de','del','este','esta','ese','esa']);

  const rule = {
    id: 'collocation',
    languages: ['en', 'nb', 'nn', 'de', 'es', 'fr'],
    priority: 65,
    exam: {
      safe: true,
      reason: "Lexical collocation correction at lookup level; at-or-below browser native parity",
      category: "spellcheck",
    },
    severity: 'warning',
    explain: function (finding) {
      return {
        nb: 'På dette språket sier man <em>' + escapeHtml(finding.fix) + '</em>, ikke <em>' + escapeHtml(finding.original) + '</em>. Dette er en fast kollokasjon.',
        nn: 'På dette språket seier ein <em>' + escapeHtml(finding.fix) + '</em>, ikkje <em>' + escapeHtml(finding.original) + '</em>. Dette er ein fast kollokasjon.',
      };
    },
    check(ctx) {
      // Phase 42: vocab-seam is now the only source. NN doesn't ship its own
      // collocationbank yet, but the seam resolves NN context against NB
      // collocations upstream (see vocab seam loadVocab fallback).
      const collocations = ctx.vocab && ctx.vocab.collocations;
      if (!collocations || collocations.length === 0) return [];
      if (!ctx.sentences) return [];

      const findings = [];

      for (const sentence of ctx.sentences) {
        const sentLower = sentence.text.toLowerCase();

        for (const entry of collocations) {
          if (!entry.trigger || !entry.fix) continue;
          const triggerLower = entry.trigger.toLowerCase();
          let searchStart = 0;

          while (searchStart < sentLower.length) {
            const idx = sentLower.indexOf(triggerLower, searchStart);
            if (idx === -1) break;

            // Word-boundary check (Ordbank sweep 2026-07): the substring match
            // hit inside larger words — "a money" inside "extrA MONEY",
            // "a news" inside "a NEWSpaper". Require non-letter/edge on both sides.
            const beforeCh = idx > 0 ? sentLower[idx - 1] : ' ';
            const afterCh = idx + triggerLower.length < sentLower.length
              ? sentLower[idx + triggerLower.length] : ' ';
            if (/[a-zà-öø-ÿ]/.test(beforeCh) || /[a-zà-öø-ÿ]/.test(afterCh)) {
              searchStart = idx + 1; continue;
            }

            const absStart = sentence.start + idx;
            const absEnd = absStart + entry.trigger.length;

            // Compound-modifier guard: "a research GRANT", "a music CLASS",
            // "a traffic JAM" — the uncountable noun modifies a following noun
            // and the article belongs to the compound head. Skip when a plain
            // word (not a verb/connector) directly follows the match.
            if (/^an? [a-z]+$/.test(triggerLower)) {
              let nxW = null;
              for (let ti = 0; ti < ctx.tokens.length; ti++) {
                if (ctx.tokens[ti].start >= absEnd) { nxW = ctx.tokens[ti]; break; }
              }
              const NOT_HEAD = new Set(['is', 'are', 'was', 'were', 'that', 'which',
                'and', 'or', 'to', 'in', 'on', 'at', 'for', 'with', 'from', 'about',
                'because', 'but', 'so', 'when', 'while', 'after', 'before']);
              if (nxW && /^[a-z]/.test(nxW.word) && !NOT_HEAD.has(nxW.word) &&
                  !/[,.;:!?]/.test(ctx.text.slice(absEnd, nxW.start))) {
                searchStart = idx + 1; continue;
              }
            }

            // Noun-homograph guard: when the trigger's first word is preceded by
            // a determiner/possessive it is functioning as a NOUN, not the verb
            // the collocation targets ("su sueño de publicar" = his dream of;
            // the entry "sueño de → soñar con" is for the verb "yo sueño de…").
            // ES-only: the determiner set is Spanish; 'tu' collides with the
            // French subject pronoun ("Tu penses de…" is exactly the error
            // the FR entries target — Ordbank sweep 2026-07 regression).
            if (ctx.lang === 'es') {
              let prevW = '';
              for (let ti = ctx.tokens.length - 1; ti >= 0; ti--) {
                if (ctx.tokens[ti].end <= absStart) { prevW = ctx.tokens[ti].word.toLowerCase(); break; }
              }
              if (COLLOC_NOUN_DETERMINERS.has(prevW)) { searchStart = idx + 1; continue; }
            }

            // Check structural suppression for any token in the match span.
            let suppressed = false;
            if (ctx.suppressedFor && ctx.suppressedFor.structural) {
              for (let ti = 0; ti < ctx.tokens.length; ti++) {
                const tok = ctx.tokens[ti];
                if (tok.end > absStart && tok.start < absEnd && ctx.suppressedFor.structural.has(ti)) {
                  suppressed = true;
                  break;
                }
              }
            }

            if (!suppressed) {
              const f = {
                rule_id: 'collocation',
                start: absStart,
                end: absEnd,
                original: ctx.text.slice(absStart, absEnd),
                fix: entry.fix,
                message: entry.trigger + ' → ' + entry.fix,
                severity: 'warning',
              };
              if (entry.examples && entry.examples.length > 0) {
                f.pedagogy = {
                  note: {
                    nb: '<em>' + escapeHtml(entry.fix) + '</em> er en fast kollokasjon — preposisjonen hører til uttrykket og kan ikke byttes ut med en norsk oversettelse.',
                    nn: '<em>' + escapeHtml(entry.fix) + '</em> er ein fast kollokasjon — preposisjonen høyrer til uttrykket og kan ikkje bytast ut med ei norsk omsetjing.',
                  },
                  examples: entry.examples.map(ex => ({
                    correct: ex.sentence || '',
                    translation: { nb: ex.translation || '', nn: ex.translation || '' },
                  })),
                };
              }
              findings.push(f);
            }

            searchStart = idx + 1;
          }
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
