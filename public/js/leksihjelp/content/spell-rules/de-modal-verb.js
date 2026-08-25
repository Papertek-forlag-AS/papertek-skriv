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

  // Function words (politeness particles, possessives, negation determiner) that
  // happen to be homographs of a present verb form — "bitte"=bitten, "danke"=
  // danken, "meine"=meinen, … After a modal these are NEVER the misplaced main
  // verb, so flagging them ("Kannst du bitte helfen?" → bitte→bitten) is a pure
  // false positive. Capitalized nouns ("eine Frage stellen" → fragen) are caught
  // separately by the lowercase-only guard below, since German finite verbs are
  // lowercase mid-clause.
  const NON_VERB_HOMOGRAPHS = new Set([
    'bitte', 'danke',
    'meine', 'deine', 'seine', 'keine', 'ihre', 'eure', 'unsere',
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
      const { text, tokens, vocab, cursorPos } = ctx;
      const verbInfinitive = vocab.verbInfinitive || new Map();
      const validWords = vocab.validWords || new Set();
      const out = [];

      // Stops the lookahead at sentence/clause boundaries — the rule was
      // crossing into the next sentence and flagging unrelated verbs (e.g.
      // "Kann Leksihjelp unterscheiden? Ich denke, …" → flagged "denke").
      const SENTENCE_BREAK_RE = /[.!?;,\n]/;

      for (let i = 0; i < tokens.length; i++) {
        const modalTok = tokens[i];
        if (!MODAL_VERBS.has(modalTok.word)) continue;

        // Look ahead for an inflected verb that should be an infinitive.
        // We stop at sentence-ending punctuation or if we find a valid infinitive.
        for (let j = i + 1; j < Math.min(i + 6, tokens.length); j++) {
          const t = tokens[j];

          if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) break;

          // Sentence boundary between the previous token and this one ends
          // the modal's reach. Inspecting the raw inter-token slice catches
          // ".", "?", "!", ";", and newlines without depending on
          // Intl.Segmenter's per-language sentence model.
          const prevEnd = tokens[j - 1].end;
          if (text && SENTENCE_BREAK_RE.test(text.slice(prevEnd, t.start))) break;

          // Coordinating conjunction opens a new conjunct with its own finite
          // verb ("mag kein Gemüse und isst nur Obst") — the modal's reach
          // ends here (Ordbank sweep 2026-07).
          if (t.word === 'und' || t.word === 'oder' || t.word === 'aber' ||
              t.word === 'sondern' || t.word === 'denn') break;

          // Passive infinitive: participle + werden ("muss geschützt werden")
          // is the correct modal complement — not a misplaced finite verb.
          if (tokens[j + 1] && (tokens[j + 1].word === 'werden' || tokens[j + 1].word === 'worden')) break;

          // If we find an inflected form that has a known infinitive
          if (verbInfinitive.has(t.word)) {
            // Homograph guards — the look-alike is not the misplaced main verb,
            // so keep scanning for a real one rather than flagging it:
            //  (a) capitalized mid-clause token = a noun ("eine Frage"/"eine
            //      Reise"); German finite verbs are lowercase here.
            //  (b) curated function-word homograph ("bitte"/"meine"/…).
            const isCapNoun = t.display && t.display[0] !== t.display[0].toLowerCase();
            if (isCapNoun || NON_VERB_HOMOGRAPHS.has(t.word)) continue;

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
                modal: modalTok.display,
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
