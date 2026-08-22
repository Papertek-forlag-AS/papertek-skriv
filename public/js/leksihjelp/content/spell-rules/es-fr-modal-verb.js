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

  // Subject/clitic pronouns that can follow a modal — in inversion
  // ("Peux-tu fermer…?", "Puede usted venir") the pronoun is the SUBJECT, not
  // the infinitive complement. "tu" also collides with the past participle of
  // "se taire", so without this guard "Peux-tu" flagged tu → "se taire".
  const PRONOUNS_AFTER_MODAL = {
    es: new Set(['yo', 'tú', 'él', 'ella', 'usted', 'nosotros', 'vosotros', 'ellos', 'ellas', 'ustedes', 'me', 'te', 'se', 'lo', 'la', 'le', 'nos', 'os', 'les']),
    fr: new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'le', 'la', 'les', 'lui', 'leur', 'y', 'en']),
  };

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
    // v3.0.121 Lær mer: modal_form (es,fr) was on the no-pedagogy gap list.
    pedagogy: {
      note: {
        nb: 'Etter modalverb (<em>quiero, puedo, debo / je veux, je peux, je dois</em>) står hovedverbet i <strong>infinitiv</strong> — akkurat som på norsk: «jeg vil <em>spise</em>», ikke «jeg vil <em>spiser</em>».',
        nn: 'Etter modalverb (<em>quiero, puedo, debo / je veux, je peux, je dois</em>) står hovudverbet i <strong>infinitiv</strong> — akkurat som på norsk: «eg vil <em>ete</em>», ikkje «eg vil <em>et</em>».',
        en: 'After a modal verb (<em>quiero, puedo, debo / je veux, je peux, je dois</em>) the main verb is an <strong>infinitive</strong> — just like Norwegian: «jeg vil <em>spise</em>».',
      },
      examples: [
        { correct: 'Quiero comer pizza.', incorrect: 'Quiero como pizza.', translation: { nb: 'Jeg vil spise pizza.', nn: 'Eg vil ete pizza.', en: 'I want to eat pizza.' } },
        { correct: 'Je veux manger une pizza.', incorrect: 'Je veux mange une pizza.', translation: { nb: 'Jeg vil spise en pizza.', nn: 'Eg vil ete ein pizza.', en: 'I want to eat a pizza.' } },
      ],
      extra: {
        nb: 'Infinitiven kjenner du igjen på endelsen: spansk <em>-ar/-er/-ir</em> (comer, hablar, vivir), fransk <em>-er/-ir/-re</em> (manger, finir, prendre).',
        nn: 'Infinitiven kjenner du att på endinga: spansk <em>-ar/-er/-ir</em> (comer, hablar, vivir), fransk <em>-er/-ir/-re</em> (manger, finir, prendre).',
        en: 'Spot the infinitive by its ending: Spanish <em>-ar/-er/-ir</em> (comer, hablar, vivir), French <em>-er/-ir/-re</em> (manger, finir, prendre).',
      },
    },
    explain: (finding) => {
      const mw = finding.modal ? `<em>${escapeHtml(finding.modal)}</em>` : '';
      const nbPre = finding.modal ? `Etter modalverbet ${mw}` : 'Etter modalverb';
      const enPre = finding.modal ? `After the modal verb ${mw}` : 'After a modal verb';
      return {
        nb: `${nbPre} skal hovedverbet stå i infinitiv — bytt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
        nn: `${nbPre} skal hovudverbet stå i infinitiv — byt <em>${escapeHtml(finding.original)}</em> med <em>${escapeHtml(finding.fix)}</em>.`,
        en: `${enPre}, the main verb should be in the infinitive — replace <em>${escapeHtml(finding.original)}</em> with <em>${escapeHtml(finding.fix)}</em>.`,
      };
    },
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

        const pronouns = PRONOUNS_AFTER_MODAL[lang];
        if (prev && modals.has(prev.word) && verbInfinitive.has(t.word)
            && !(pronouns && pronouns.has(t.word))) {
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
                modal: prev.display,
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
