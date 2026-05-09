/**
 * Spell-check rule: English Word-Family POS-Slot Confusion (priority 18).
 *
 * Flags the common Norwegian-student error of using the base verb form
 * after have/has/had instead of the past participle:
 *   "I have improve" -> "I have improved"
 *   "she has create" -> "she has created"
 *
 * Uses a closed WORD_FAMILIES map (~50 common verb families) keyed by
 * base verb form, each mapping to its past participle (pp) form.
 *
 * Rule ID: 'en-word-family'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Closed set of common verb families where Norwegian students confuse
  // base form with past participle after have/has/had.
  // Key = base verb form (lowercase), Value = past participle
  const VERB_TO_PP = new Map([
    ['improve', 'improved'],
    ['create', 'created'],
    ['succeed', 'succeeded'],
    ['decide', 'decided'],
    ['develop', 'developed'],
    ['explain', 'explained'],
    ['compete', 'competed'],
    ['communicate', 'communicated'],
    ['educate', 'educated'],
    ['organize', 'organized'],
    ['produce', 'produced'],
    ['contribute', 'contributed'],
    ['describe', 'described'],
    ['achieve', 'achieved'],
    ['prepare', 'prepared'],
    ['complete', 'completed'],
    ['introduce', 'introduced'],
    ['include', 'included'],
    ['inspire', 'inspired'],
    ['reduce', 'reduced'],
    ['involve', 'involved'],
    ['ignore', 'ignored'],
    ['examine', 'examined'],
    ['compare', 'compared'],
    ['realize', 'realized'],
    ['generate', 'generated'],
    ['encourage', 'encouraged'],
    ['recognize', 'recognized'],
    ['appreciate', 'appreciated'],
    ['participate', 'participated'],
    ['investigate', 'investigated'],
    ['demonstrate', 'demonstrated'],
    ['negotiate', 'negotiated'],
    ['celebrate', 'celebrated'],
    ['evaluate', 'evaluated'],
    ['illustrate', 'illustrated'],
    ['indicate', 'indicated'],
    ['eliminate', 'eliminated'],
    ['motivate', 'motivated'],
    ['translate', 'translated'],
    ['estimate', 'estimated'],
    ['operate', 'operated'],
    ['separate', 'separated'],
    ['dominate', 'dominated'],
    ['concentrate', 'concentrated'],
    ['associate', 'associated'],
    ['accumulate', 'accumulated'],
    ['accommodate', 'accommodated'],
    ['analyze', 'analyzed'],
    ['apologize', 'apologized'],
  ]);

  // Auxiliary verbs that trigger the have+pp pattern
  const HAVE_AUX = new Set(['have', 'has', 'had']);

  // Adverbs/particles that can appear between have and the verb
  const INTERVENING = new Set(['not', 'also', 'already', 'just', 'never', 'always', 'ever', 'yet', 'still', 'even', 'really', 'often', 'finally', 'recently', 'actually']);

  const rule = {
    id: 'en-word-family',
    languages: ['en'],
    priority: 18,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (en-word-family) — Chrome native parity confirmed in 33-03 audit: EN word-family typo bank — single-token lookup",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: (finding) => {
      const fix = escapeHtml(finding.fix);
      const orig = escapeHtml(finding.original);
      const aux = escapeHtml(finding.auxiliary || 'have');
      return {
        nb: `Feil ordform etter <em>${aux}</em> — bruk partisipp <em>${fix}</em> i stedet for <em>${orig}</em>.`,
        nn: `Feil ordform etter <em>${aux}</em> — bruk partisipp <em>${fix}</em> i staden for <em>${orig}</em>.`,
        en: `Wrong form after <em>${aux}</em> — use past participle <em>${fix}</em> instead of <em>${orig}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        const lower = t.word;

        // Check if this token is a base verb that appears after have/has/had
        const pp = VERB_TO_PP.get(lower);
        if (!pp) continue;

        // Already the correct participle form? Skip.
        if (lower === pp) continue;

        // Look backwards for have/has/had (allowing intervening adverbs)
        let foundAux = null;
        let searchBack = i - 1;
        // Allow up to 3 tokens back to handle "have not yet decide"
        const maxBack = Math.max(0, i - 4);
        while (searchBack >= maxBack) {
          const prev = tokens[searchBack];
          if (HAVE_AUX.has(prev.word)) {
            foundAux = prev;
            break;
          }
          if (INTERVENING.has(prev.word)) {
            searchBack--;
            continue;
          }
          break; // Not an adverb or auxiliary, stop looking
        }

        if (!foundAux) continue;

        const fix = matchCase ? matchCase(t.display, pp) : pp;

        out.push({
          rule_id: 'en-word-family',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          auxiliary: foundAux.display,
          fix: fix,
          suggestion: fix,
          message: `Etter «${foundAux.display}» skal verbet stå i partisippform: «${fix}».`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
