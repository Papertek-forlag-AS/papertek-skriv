/**
 * Spell-check rule: German modal verb form (priority 20).
 *
 * German modal verbs (können, müssen, sollen, wollen, dürfen, mögen, möchte) 
 * take an infinitive, usually at the end of the clause.
 * 
 * This rule flags inflected verb forms that appear shortly after a modal
 * if they should have been an infinitive.
 *
 * Rule ID: 'modal_form'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const MODAL_VERBS = new Set([
    'kann', 'kannst', 'können', 'könnt', 'konnte', 'konntest', 'konnten',
    'muss', 'musst', 'müssen', 'müsst', 'musste', 'musstest', 'mussten',
    'soll', 'sollst', 'sollen', 'sollt', 'sollte', 'solltest', 'sollten',
    'will', 'willst', 'wollen', 'wollt', 'wollte', 'wolltest', 'wollten',
    'darf', 'darfst', 'dürfen', 'dürft', 'durfte', 'durftest', 'durften',
    'mag', 'magst', 'mögen', 'mögt', 'mochte', 'mochtest', 'mochten',
    'möchte', 'möchtest', 'möchten', 'möchtet'
  ]);

  const rule = {
    id: 'modal_form',
    languages: ['de'],
    priority: 20,
    // exam-audit 33-03: stays safe=false — Multi-token modal+infinitive rewrite; syntactic, not single-token lookup
    exam: {
      safe: false,
      reason: "Stays safe=false (de-modal-verb) — Multi-token modal+infinitive rewrite; syntactic, not single-token lookup",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Etter modalverb skal hovedverbet stå i infinitiv — bytt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `Etter modalverb skal hovudverbet stå i infinitiv — byt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
      en: `After a modal verb, the main verb should be in the infinitive — replace <em>${escapeHtml(finding.original)}</em> with <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const verbInfinitive = vocab.verbInfinitive || new Map();
      const validWords = vocab.validWords || new Set();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const modalTok = tokens[i];
        if (!MODAL_VERBS.has(modalTok.word)) continue;

        // Look ahead for an inflected verb that should be an infinitive.
        // We stop at punctuation or if we find a valid infinitive.
        for (let j = i + 1; j < Math.min(i + 6, tokens.length); j++) {
          const t = tokens[j];
          
          if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) break;

          // If we find an inflected form that has a known infinitive
          if (verbInfinitive.has(t.word)) {
            const inf = verbInfinitive.get(t.word);
            
            // If the word is NOT already a valid infinitive (e.g. 'kommen' is both)
            // In German, infinitives usually end in -en or -n.
            const isProbablyInfinitive = t.word.endsWith('en') || t.word.endsWith('n');
            
            if (inf && inf !== t.word && !isProbablyInfinitive) {
              out.push({
                rule_id: 'modal_form',
                priority: rule.priority,
                start: t.start,
                end: t.end,
                original: t.display,
                fix: matchCase(t.display, inf),
                message: `Etter "${modalTok.display}" skal verbet stå i infinitiv: "${inf}"`,
              });
            }
            // Once we find a verb (correct or not), we stop looking for this modal
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
