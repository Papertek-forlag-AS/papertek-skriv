/**
 * Spell-check rule: English spelling-variety enforcement (en-spelling-variety,
 * priority 21, error band).
 *
 * DORMANT BY DEFAULT. Only active when the student (or a lockdown teacher
 * profile) selects a strict variety via the `enSpellingVariety` setting
 * ('br' | 'am'; anything else = the default "Begge" policy where both
 * varieties are accepted and en-spelling-consistency coaches mixing).
 *
 * In strict mode the OTHER variety's exclusive forms flag as spelling
 * errors with the precise sibling suggestion (color → colour). This is
 * exactly Chrome's native en-GB / en-US dictionary behaviour, so the rule
 * is exam-safe at native parity (category "spellcheck").
 *
 * Direction asymmetry (deliberate):
 *  - British mode flags only crossSafe American surfaces: homograph
 *    American forms (check, story, tire, program, meter, …) are valid
 *    British words in other senses, and -ize is valid Oxford British —
 *    neither may flag.
 *  - American mode flags every British surface: British spellings
 *    (colour, centre, organise, cheque, tyre, …) have no American reading.
 *
 * Pair data comes from en-spelling-consistency's varietyPair(), published
 * on the host as __lexiVarietyPair (manifest loads consistency first).
 *
 * Rule ID: 'en-spelling-variety'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml, matchCase } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const rule = {
    id: 'en-spelling-variety',
    languages: ['en'],
    priority: 21,
    severity: 'error',
    exam: {
      safe: true,
      reason: "Native-dictionary parity: Chrome's en-GB/en-US dictionaries flag the other variety as a spelling error; rule is dormant unless a strict variety is selected",
      category: 'spellcheck',
    },
    explain(finding) {
      const a = esc(finding.original || '');
      const b = esc(finding.fix || '');
      if (finding.variety === 'am') {
        return {
          nb: `<em>${a}</em> er amerikansk stavemåte. Du har valgt britisk engelsk — skriv <em>${b}</em>.`,
          nn: `<em>${a}</em> er amerikansk stavemåte. Du har valt britisk engelsk — skriv <em>${b}</em>.`,
          en: `<em>${a}</em> is the American spelling. You have selected British English — write <em>${b}</em>.`,
        };
      }
      return {
        nb: `<em>${a}</em> er britisk stavemåte. Du har valgt amerikansk engelsk — skriv <em>${b}</em>.`,
        nn: `<em>${a}</em> er britisk stavemåte. Du har valt amerikansk engelsk — skriv <em>${b}</em>.`,
        en: `<em>${a}</em> is the British spelling. You have selected American English — write <em>${b}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang } = ctx;
      if (lang !== 'en' || !tokens) return [];
      const mode = vocab && vocab.enSpellingVariety;
      if (mode !== 'br' && mode !== 'am') return [];
      const varietyPair = host.__lexiVarietyPair;
      if (typeof varietyPair !== 'function') return [];
      const validWords = vocab.validWords || new Set();
      if (!validWords.size) return [];

      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.word.length < 4) continue;
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        const pair = varietyPair(t.word, validWords);
        if (!pair) continue;

        let fixWord = null;
        let variety = null;
        if (mode === 'br' && t.word === pair.am && pair.crossSafe) {
          // American surface in British mode — homographs and Oxford -ize
          // are excluded via crossSafe.
          fixWord = pair.br;
          variety = 'am';
        } else if (mode === 'am' && t.word === pair.br) {
          // British surfaces have no American reading — always flag.
          fixWord = pair.am;
          variety = 'br';
        }
        if (!fixWord) continue;

        const fix = matchCase ? matchCase(t.display, fixWord) : fixWord;
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix,
          suggestion: fix,
          variety,
          severity: rule.severity,
          message: variety === 'am'
            ? `Amerikansk stavemåte: «${t.display}» → «${fix}» (britisk valgt)`
            : `Britisk stavemåte: «${t.display}» → «${fix}» (amerikansk valgt)`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
