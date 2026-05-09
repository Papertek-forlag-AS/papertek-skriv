/**
 * Spell-check rule: English Grammar Advanced (priority 21).
 *
 * Includes intellectual grammar rules NOT allowed in exams.
 * - Double Negative Check
 * - Much vs. Many
 * - Tense Consistency (past -> past)
 * - Modal "of" (should of -> should have)
 * - Pronoun Case (subject vs object, initial "Me and")
 *
 * Rule ID: 'en-grammar' (Matches en-grammar for fixture compatibility)
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const MODAL_VERBS = new Set(['can', 'could', 'must', 'shall', 'should', 'will', 'would', 'may', 'might']);

  const rule = {
    id: 'en-grammar', // Kept as 'en-grammar' for fixture compatibility
    languages: ['en'],
    priority: 21,
    exam: {
      safe: false,
      reason: "Advanced grammatical reasoning (en-grammar-advanced) — provides intellectual support beyond simple typo correction.",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: (finding) => {
      if (finding.subType === 'double-negative') {
        return {
          nb: `Dobbelt nektelse: Bruk «anything» i stedet for «nothing» etter «don't».`,
          nn: `Dobbelt nektelse: Bruk «anything» i staden for «nothing» etter «don't».`,
          en: `Double negative: Use "anything" instead of "nothing" after "don't".`,
        };
      }
      if (finding.subType === 'tense-mix') {
        return {
          nb: `Det ser ut som du blander tider. Siden «${escapeHtml(finding.prev)}» er i fortid, bør kanskje «${escapeHtml(finding.original)}» også være det, eller endres til infinitiv.`,
          nn: `Det ser ut som du blandar tider. Sidan «${escapeHtml(finding.prev)}» er i fortid, bør kanskje «${escapeHtml(finding.original)}» også vere det, eller endrast til infinitiv.`,
          en: `You might be mixing tenses. Since "${escapeHtml(finding.prev)}" is in the past, "${escapeHtml(finding.original)}" should probably be too, or change to an infinitive.`,
        };
      }
      if (finding.subType === 'much-many') {
        return {
          nb: `Bruk <em>${escapeHtml(finding.fix)}</em> foran ${finding.is_countable ? 'tellbare' : 'utellbare'} substantiv.`,
          nn: `Bruk <em>${escapeHtml(finding.fix)}</em> føre ${finding.is_countable ? 'telbare' : 'uteljbare'} substantiv.`,
          en: `Use <em>${escapeHtml(finding.fix)}</em> before ${finding.is_countable ? 'countable' : 'uncountable'} nouns.`,
        };
      }
      if (finding.subType === 'pronoun-case') {
        return {
          nb: `Bruk objektsform av personlig pronomen («${escapeHtml(finding.fix)}») etter verb eller preposisjon.`,
          nn: `Bruk objektsform av personleg pronomen («${escapeHtml(finding.fix)}») etter verb eller preposisjon.`,
          en: `Use the object form of the personal pronoun ("${escapeHtml(finding.fix)}") after a verb or preposition.`,
        };
      }
      if (finding.subType === 'modal-of') {
        return {
          nb: `Modalverb som <em>${escapeHtml(finding.modal)}</em> tar alltid <em>have</em>, aldri <em>of</em> — dette er en vanlig feil fra uttalen av sammendraget "should've".`,
          nn: `Modalverb som <em>${escapeHtml(finding.modal)}</em> tek alltid <em>have</em>, aldri <em>of</em> — dette er ein vanleg feil frå uttalen av samandraget "should've".`,
          en: `Modal verbs like <em>${escapeHtml(finding.modal)}</em> always take <em>have</em>, never <em>of</em> — a common mistake driven by the spoken contraction "should've".`,
        };
      }
      if (finding.subType === 'pronoun-initial') {
        return {
          nb: `Som subjekt skal det være «I», ikke «me». Prøv «John and I».`,
          nn: `Som subjekt skal det vere «I», ikkje «me». Prøv «John and I».`,
          en: `As a subject, use "I" instead of "me". Try "John and I".`,
        };
      }
      return { nb: finding.message, nn: finding.message, en: finding.message };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const verbInfinitive = vocab.verbInfinitive || new Map();
      const knownPresens = vocab.knownPresens || new Set();
      const knownPreteritum = vocab.knownPreteritum || new Set();
      const verbForms = vocab.verbForms || new Map();
      const out = [];

      const PRONOUN_OBJ_MAP = {
        'i': 'me', 'he': 'him', 'she': 'her', 'we': 'us', 'they': 'them',
      };

      const PREPOSITIONS = new Set(['to', 'for', 'with', 'from', 'at', 'in', 'on', 'by', 'about']);

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        // 1. Double Negative Check
        if (t.word === 'dont' || t.word === "don't" || t.word === 'doesnt' || t.word === "doesn't") {
          for (let j = i + 1; j < Math.min(i + 5, tokens.length); j++) {
            if (tokens[j].word === 'nothing') {
              out.push({
                rule_id: 'en-grammar', subType: 'double-negative', priority: rule.priority,
                start: tokens[j].start, end: tokens[j].end, original: tokens[j].display,
                fix: 'anything', suggestion: 'anything',
                message: 'Dobbelt nektelse: Bruk "anything" i stedet for "nothing".',
              });
            }
          }
        }

        // 2. Pronoun Case (Object form after verb/prep)
        if (next && PRONOUN_OBJ_MAP[next.word]) {
          const isVerb = knownPresens.has(t.word) || knownPreteritum.has(t.word);
          const isPrep = PREPOSITIONS.has(t.word);
          if (isVerb || isPrep) {
             const fix = PRONOUN_OBJ_MAP[next.word];
             const fixWithCase = matchCase(next.display, fix);
             out.push({
              rule_id: 'en-grammar', subType: 'pronoun-case', priority: rule.priority,
              start: next.start, end: next.end, original: next.display,
              fix: fixWithCase, suggestion: fixWithCase,
              message: `Objektsform: Bruk "${fix}" etter "${t.display}"`,
            });
          }
        }

        // 3. Tense Consistency
        if (i > 1 && t.word === 'and' && next && knownPresens.has(next.word)) {
          const prev = tokens[i - 1];
          if (knownPreteritum.has(prev.word)) {
            const inf = verbInfinitive.get(next.word) || next.word;
            let pastForm = null;
            const forms = verbForms.get(inf);
            if (forms && forms.past && forms.past.size > 0) {
              pastForm = Array.from(forms.past)[0];
            }
            if (pastForm) {
               out.push({
                rule_id: 'en-grammar', subType: 'tense-mix', priority: rule.priority,
                start: t.start, end: next.end, original: `${t.display} ${next.display}`,
                prev: prev.display, fix: `${matchCase(next.display, pastForm)} / to ${inf}`,
                suggestion: `${matchCase(next.display, pastForm)} / to ${inf}`,
                message: `Tidssamsvar: "${prev.display}" er fortid.`,
              });
            }
          }
        }

        // 4. Much vs. Many
        if ((t.word === 'much' || t.word === 'many') && next) {
          const looksCountable = next.word.endsWith('s') && next.word.length > 3;
          const expected = looksCountable ? 'many' : 'much';
          if (t.word !== expected) {
            out.push({
              rule_id: 'en-grammar', subType: 'much-many', priority: rule.priority,
              start: t.start, end: t.end, original: t.display,
              fix: matchCase(t.display, expected), suggestion: matchCase(t.display, expected),
              is_countable: looksCountable,
              message: `Bruk "${expected}" foran "${next.display}"`,
            });
          }
        }

        // 5. "should/could/would of" -> "have"
        if (MODAL_VERBS.has(t.word) && next && next.word === 'of') {
          out.push({
            rule_id: 'en-grammar', subType: 'modal-of', priority: rule.priority,
            start: next.start, end: next.end, original: next.display,
            fix: matchCase(next.display, 'have'), suggestion: matchCase(next.display, 'have'),
            modal: t.display,
            message: `"${t.display} of" er en vanlig feil — det skal være "${t.display} have".`,
          });
        }

        // 6. Initial "Me and" -> "I and"
        if (i === 0 && t.word === 'me' && next && next.word === 'and') {
          out.push({
            rule_id: 'en-grammar', subType: 'pronoun-initial', priority: rule.priority,
            start: t.start, end: t.end, original: t.display,
            fix: 'I', suggestion: 'I',
            message: `Som subjekt skal det være "I", ikke "me".`,
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
