/**
 * Spell-check rule: FR missing 'ne' in written negation (FR-14, priority 22).
 *
 * Norwegian students use a single negation particle ("ikke") placed after
 * the verb. French requires the two-part construction ne … pas. They drop
 * "ne" by L1 transfer and exposure to spoken French where ne is often elided.
 *
 *   Wrong:   "je sais pas"         →  "je ne sais pas"
 *   Wrong:   "il aime pas"         →  "il n'aime pas"
 *   Wrong:   "tu comprends pas"    →  "tu ne comprends pas"
 *   Correct: "je ne sais pas"      →  no flag (ne is present)
 *   Correct: "elle n'aime pas"     →  no flag (n' is present)
 *   Correct: "Pas du tout"         →  no flag (no verb immediately before pas)
 *
 * Detection scope: present-tense conjugated verbs only (frPresensToVerb).
 * Passé composé auxiliaries and imperatives are excluded in v1 to avoid
 * word-order fix errors ("j'ai pas dit" → complex clitic reordering needed).
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-negation'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { tokensInSentence } = core;

  // Subject pronouns (direct form and contracted j' / c')
  const SUBJECT_PRONOUNS = new Set([
    'je', "j'", '’', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
    'ce', "c'", 'ça',
  ]);

  // Vowels for ne → n' elision before verb
  const VOWELS_INIT = new Set('aeiouyàâäéèêëïîôùûüÿœæ'.split(''));

  const rule = {
    id: 'fr-negation',
    languages: ['fr'],
    priority: 22,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Multi-token negation insertion — syntactic (ne … pas)',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `I skriftlig fransk er negasjon alltid <em>ne … pas</em> (to deler). Sett inn <em>${finding.neForm}</em> foran verbet: <em>${finding.fix}</em>.`,
      nn: `I skriftleg fransk er negasjon alltid <em>ne … pas</em> (to delar). Set inn <em>${finding.neForm}</em> framfor verbet: <em>${finding.fix}</em>.`,
      en: `Written French always uses the two-part negation <em>ne … pas</em>. Insert <em>${finding.neForm}</em> before the verb: <em>${finding.fix}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      if (!ctx.sentences || !tokensInSentence) return [];

      const frPresensToVerb = ctx.vocab && ctx.vocab.frPresensToVerb;
      if (!frPresensToVerb || !frPresensToVerb.size) return [];

      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        if (range.end - range.start < 2) continue;

        const toks = ctx.tokens;

        for (let i = range.start + 1; i < range.end; i++) {
          if (toks[i].word.toLowerCase() !== 'pas') continue;

          // Token immediately before 'pas' must be a recognized present-tense verb
          const verbIdx = i - 1;
          const verbW = toks[verbIdx].word.toLowerCase();
          if (!frPresensToVerb.has(verbW)) continue;

          // Scan the sentence for ne / n' — if found, already correct. The
          // elided "n'" also fuses onto a vowel-initial clitic as ONE token
          // ("n'y a pas", "n'en ai pas") or onto the verb ("n'aime pas"), so any
          // token beginning with "n'" counts as the negation being present.
          let neFound = false;
          for (let j = range.start; j < i; j++) {
            const w = toks[j].word.toLowerCase();
            if (w === 'ne' || w.startsWith("n'") || w.startsWith('n’')) {
              neFound = true;
              break;
            }
          }
          if (neFound) continue;

          // Require a subject pronoun somewhere in the sentence before the verb
          let hasSubject = false;
          for (let j = range.start; j < verbIdx; j++) {
            if (SUBJECT_PRONOUNS.has(toks[j].word.toLowerCase())) {
              hasSubject = true;
              break;
            }
          }
          if (!hasSubject) continue;

          // Determine ne/n' form
          const firstChar = verbW[0] || '';
          const neForm = VOWELS_INIT.has(firstChar) ? "n'" : 'ne';

          // Span: [verb.start, pas.end]; fix = neForm + space? + verb + ' pas'
          const verbDisplay = toks[verbIdx].display || toks[verbIdx].word;
          const particleDisplay = toks[i].display || toks[i].word;
          const fix = neForm === "n'"
            ? neForm + verbDisplay + ' ' + particleDisplay
            : neForm + ' ' + verbDisplay + ' ' + particleDisplay;

          findings.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: toks[verbIdx].start,
            end: toks[i].end,
            original: ctx.text.slice(toks[verbIdx].start, toks[i].end),
            fix,
            neForm,
            particle: 'pas',
          });
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
