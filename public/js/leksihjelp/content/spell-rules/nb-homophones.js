/**
 * Spell-check rule: Norwegian Homophones and Confused Words (priority 40).
 *
 * Heuristic checks for classic dyslexic and learner errors:
 * - da vs når
 * - gjerne vs hjerne
 * - vær vs hver
 *
 * Note: å/og confusion moved to dedicated nb-aa-og.js rule (Phase 22).
 *
 * Rule ID: 'homophone'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase, escapeHtml } = core;

  const PRONOUNS = new Set(['jeg', 'eg', 'du', 'han', 'hun', 'ho', 'vi', 'dere', 'de', 'dei', 'man']);
  const ARTICLES_POSSESSIVES = new Set(['en', 'ei', 'et', 'eit', 'den', 'det', 'de', 'dei', 'min', 'mi', 'mitt', 'mine', 'din', 'di', 'ditt', 'dine', 'vår', 'vårt', 'våre', 'hans', 'hennes', 'hennar', 'deres', 'deira']);
  
  const MODALS_INTENTIONS = new Set(['vil', 'ville', 'skal', 'skulle', 'kan', 'kunne', 'må', 'måtte', 'bør', 'burde', 'veldig', 'så', 'for', 'altfor']);
  
  const TIME_NOUNS = new Set(['gang', 'gong', 'dag', 'uke', 'veke', 'måned', 'månad', 'år', 'kveld', 'morgen', 'morgon', 'natt', 'time', 'minutt', 'sekund', 'andre']);
  const WEATHER_ADJ = new Set(['fint', 'dårlig', 'dårleg', 'pent', 'stygt', 'kaldt', 'varmt', 'godt']);
  // NOTE (Lær mer wave 2026-06-13): a de/dem object-case detector was
  // prototyped here (preposition + «de» → «dem») and REJECTED. On the NB
  // Wikipedia corpus it was 0% precision (22/22 FPs): «preposition + de +
  // adjective/noun» is the dominant — and correct — determiner reading
  // («av de ulike», «under de olympiske leker», «selv om de utfører»),
  // while the object-pronoun error («til de.») is vanishingly rare in
  // edited prose and not separable without real syntactic parsing. The
  // de/dem distinction is still TAUGHT via the homophone Lær mer lesson
  // (which lists de/dem); only the auto-detection was dropped.

  const rule = {
    id: 'homophone',
    languages: ['nb', 'nn'],
    priority: 40,
    exam: {
      safe: true,
      reason: "Token-level homophone correction correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: (finding) => {
      if (finding.subType === 'da-naar') {
        return {
          nb: `Huskeregel: "Den gang <strong>da</strong>, hver gang <strong>når</strong>". Bruk <em>da</em> om en enkelt hendelse i fortiden.`,
          nn: `Hugseregel: "Den gong <strong>då</strong>, kvar gong <strong>når</strong>". Bruk <em>då</em> om ei einskild hending i fortida.`,
        };
      }
      if (finding.subType === 'gjerne-hjerne') {
        return {
          nb: `<strong>Hjerne</strong> er organet inne i hodet. <strong>Gjerne</strong> betyr "med glede" eller "frivillig".`,
          nn: `<strong>Hjerne</strong> er organet inne i hovudet. <strong>Gjerne</strong> tyder "med glede" eller "frivillig".`,
        };
      }
      if (finding.subType === 'hver-vaer') {
        return {
          nb: `<strong>Vær</strong> handler om meteorologi (regn, sol). <strong>Hver</strong> betyr "alle enkeltvis" (hver dag).`,
          nn: `<strong>Vêr</strong> handlar om meteorologi (regn, sol). <strong>Kvar</strong> tyder "alle einskildvis" (kvar dag).`,
        };
      }
      return { nb: finding.message, nn: finding.message };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      const verbForms = vocab.verbForms || new Map();
      const knownPresens = vocab.knownPresens || new Set();
      const knownPreteritum = vocab.knownPreteritum || new Set();
      const out = [];

      // Which sentence each token belongs to.
      //
      // The da/når patterns read two and three tokens ahead, and without this
      // they read straight through a full stop. Reported 2026-08-13:
      //     "Hva skjer da? Jeg skriver nå sammenhengende tekst."
      // «da» here is the ADVERB ("what happens then?") and ends its sentence;
      // «Jeg skriver» opens the next one. The rule saw da + pronoun + present
      // tense, matched, and told a pupil their correct Norwegian was wrong.
      //
      // A sentence boundary is not a heuristic for this — «da» as a temporal
      // subjunction introduces a subordinate clause, so its clause CANNOT
      // continue past the terminator. Anything after it is a different
      // sentence and says nothing about how «da» was used.
      const sentenceOf = new Array(tokens.length).fill(0);
      if (Array.isArray(ctx.sentences) && ctx.sentences.length > 1) {
        let s = 0;
        for (let i = 0; i < tokens.length; i++) {
          while (s < ctx.sentences.length - 1 && tokens[i].start >= ctx.sentences[s].end) s++;
          sentenceOf[i] = s;
        }
      }
      const sameSentence = (a, b) => sentenceOf[a] === sentenceOf[b];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        const word = t.word.toLowerCase();
        const prev = i > 0 ? tokens[i - 1].word.toLowerCase() : null;
        const next = i < tokens.length - 1 ? tokens[i + 1].word.toLowerCase() : null;
        const nextNext = i < tokens.length - 2 ? tokens[i + 2].word.toLowerCase() : null;

        // 1. da vs når (å/og moved to dedicated nb-aa-og.js rule)
        if (word === 'da' && next && nextNext && sameSentence(i, i + 2)) {
          // da jeg går -> når jeg går
          if (PRONOUNS.has(next) && knownPresens.has(nextNext)) {
            out.push({
              rule_id: 'homophone',
              subType: 'da-naar',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'når'),
              suggestions: [matchCase(t.display, 'når')],
              message: `Forveksling: "da" brukt med nåtid. Prøv "når".`
            });
            if (suppressed) suppressed.add(i);
          }
        }
        else if (word === 'når' && next && nextNext && sameSentence(i, i + 2)) {
          // når jeg var liten -> da jeg var liten
          if (PRONOUNS.has(next) && (nextNext === 'var' || nextNext === 'ble' || nextNext === 'blei') &&
             (i + 3 < tokens.length && sameSentence(i, i + 3) &&
              (tokens[i+3].word.toLowerCase() === 'liten' || tokens[i+3].word.toLowerCase() === 'ung' || tokens[i+3].word.toLowerCase() === 'barn'))) {
            out.push({
              rule_id: 'homophone',
              subType: 'da-naar',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'da'), // Note: 'då' in NN, handled by matchCase/localization if needed, but 'da' is base. Actually NN should suggest 'då'.
              suggestions: [matchCase(t.display, ctx.lang === 'nn' ? 'då' : 'da')],
              message: `Forveksling: "når" om en enkelt hendelse i fortiden. Prøv "${ctx.lang === 'nn' ? 'då' : 'da'}".`
            });
            if (suppressed) suppressed.add(i);
          }
        }

        // 3. gjerne vs hjerne
        else if (word === 'hjerne' && prev) {
          if (MODALS_INTENTIONS.has(prev)) {
            out.push({
              rule_id: 'homophone',
              subType: 'gjerne-hjerne',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'gjerne'),
              suggestions: [matchCase(t.display, 'gjerne')],
              message: `Forveksling: "hjerne" brukt som adverb. Prøv "gjerne".`
            });
            if (suppressed) suppressed.add(i);
          }
        }
        else if (word === 'gjerne' && prev) {
          const prevPrev = i > 1 ? tokens[i - 2].word.toLowerCase() : null;
          if (ARTICLES_POSSESSIVES.has(prev) || (prevPrev && ARTICLES_POSSESSIVES.has(prevPrev))) {
            out.push({
              rule_id: 'homophone',
              subType: 'gjerne-hjerne',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, 'hjerne'),
              suggestions: [matchCase(t.display, 'hjerne')],
              message: `Forveksling: "gjerne" brukt som substantiv. Prøv "hjerne".`
            });
            if (suppressed) suppressed.add(i);
          }
        }

        // 4. vær vs hver (og vêr/kvar i NN)
        else if ((word === 'vær' || word === 'vêr') && next) {
          if (TIME_NOUNS.has(next)) {
            const fix = ctx.lang === 'nn' ? 'kvar' : 'hver';
            out.push({
              rule_id: 'homophone',
              subType: 'hver-vaer',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, fix),
              suggestions: [matchCase(t.display, fix)],
              message: `Forveksling: "${t.display}" brukt foran tidsangivelse. Prøv "${fix}".`
            });
            if (suppressed) suppressed.add(i);
          }
        }
        else if ((word === 'hver' || word === 'kvar') && prev) {
          if (WEATHER_ADJ.has(prev)) {
            const fix = ctx.lang === 'nn' ? 'vêr' : 'vær';
            out.push({
              rule_id: 'homophone',
              subType: 'hver-vaer',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, fix),
              suggestions: [matchCase(t.display, fix)],
              message: `Forveksling: "${t.display}" brukt om meteorologi. Prøv "${fix}".`
            });
            if (suppressed) suppressed.add(i);
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
