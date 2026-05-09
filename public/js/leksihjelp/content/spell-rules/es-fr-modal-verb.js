/**
 * Spell-check rule: Spanish and French modal verb form (priority 20).
 *
 * Spanish and French modal verbs (poder, deber, querer / pouvoir, devoir, vouloir) 
 * take an infinitive.
 * 
 * Flags inflected forms after a modal: "puedo hablo" -> "puedo hablar".
 *
 * Rule ID: 'modal_form'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const MODAL_VERBS = {
    es: new Set([
      'puedo', 'puedes', 'puede', 'podemos', 'podéis', 'pueden', 'pude', 'pudiste', 'pudo', 'pudimos', 'pudisteis', 'pudieron',
      'debo', 'debes', 'debe', 'debemos', 'debéis', 'deben', 'debí', 'debiste', 'debió', 'debimos', 'debisteis', 'debieron',
      'quiero', 'quieres', 'quiere', 'queremos', 'queréis', 'quieren', 'quise', 'quisiste', 'quiso', 'quisimos', 'quisisteis', 'quisieron'
    ]),
    fr: new Set([
      'peux', 'peut', 'pouvons', 'pouvez', 'peuvent', 'pouvais', 'pouvait', 'pouvions', 'pouviez', 'pouvaient',
      'dois', 'doit', 'devons', 'devez', 'doivent', 'devais', 'devait', 'devions', 'deviez', 'devaient',
      'veux', 'veut', 'voulons', 'voulez', 'veulent', 'voulais', 'voulait', 'voulions', 'vouliez', 'voulaient'
    ])
  };

  const rule = {
    id: 'modal_form',
    languages: ['es', 'fr'],
    priority: 20,
    // exam-audit 33-03: stays safe=false — Multi-token modal+infinitive rewrite across ES/FR; syntactic
    exam: {
      safe: false,
      reason: "Stays safe=false (es-fr-modal-verb) — Multi-token modal+infinitive rewrite across ES/FR; syntactic",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Etter modalverb skal hovedverbet stå i infinitiv — bytt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `Etter modalverb skal hovudverbet stå i infinitiv — byt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
      en: `After a modal verb, the main verb should be in the infinitive — replace <em>${escapeHtml(finding.original)}</em> with <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, lang } = ctx;
      const verbInfinitive = vocab.verbInfinitive || new Map();
      const validWords = vocab.validWords || new Set();
      const modals = MODAL_VERBS[lang];
      if (!modals) return [];

      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const prev = tokens[i - 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        if (prev && modals.has(prev.word) && verbInfinitive.has(t.word)) {
          const inf = verbInfinitive.get(t.word);
          if (inf && inf !== t.word) {
            // Check if it's already a valid infinitive (some forms overlap)
            // In Spanish/French, infinitives have clear endings: -ar, -er, -ir, etc.
            const isProbablyInfinitive = (lang === 'es' && (t.word.endsWith('ar') || t.word.endsWith('er') || t.word.endsWith('ir'))) ||
                                          (lang === 'fr' && (t.word.endsWith('er') || t.word.endsWith('ir') || t.word.endsWith('re')));

            if (!isProbablyInfinitive) {
              out.push({
                rule_id: 'modal_form',
                priority: rule.priority,
                start: t.start,
                end: t.end,
                original: t.display,
                fix: matchCase(t.display, inf),
                message: `Etter "${prev.display}" skal verbet stå i infinitiv: "${inf}"`,
              });
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
