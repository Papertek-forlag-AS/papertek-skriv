/**
 * Spell-check rule: særskriving compound noun (priority 30).
 *
 * Flags two adjacent words whose concatenation is a known compound noun:
 * "skole sekk" → "skolesekk". A blocklist of common short words (i, på,
 * av, til, …) prevents false positives where the concatenation happens to
 * match a compound but the surface form is a normal preposition phrase.
 *
 * Rule ID: 'sarskriving' — preserved verbatim from pre-INFRA-03 inline rule.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Words that should never trigger særskriving even when the concatenation
  // happens to exist as a compound. Tuned conservatively to avoid false
  // positives.
  //
  // Two classes of entries:
  //   1. Function words (prepositions, articles, pronouns, conjunctions) —
  //      grammar should never glue these to the next noun.
  //   2. Common adjectives whose concatenation with a following noun ALSO
  //      happens to exist in compoundNouns (e.g., `stor` + `by` = `storby`
  //      which IS a real Norwegian compound, but "Hun bor i en stor by"
  //      means "She lives in a big city" — adjective phrase, not compound).
  //      Surfaced by Plan 04-03 fixture expansion as a real false-positive
  //      class on adjective+noun acceptance cases.
  // Phase 17-06: supplementary compounds not yet in the nounbank but verified
  // as real Norwegian compounds by the decomposition engine. These were
  // previously caught by the decomposeCompoundStrict fallback (Plan 17-03/05),
  // which is now removed because it also produced FPs on verb+noun, adj+noun,
  // number+noun, measure-phrase, and cross-sentence pairs without POS gating.
  // Remove entries as they're added to the Papertek vocabulary nounbank.
  const SUPPLEMENTARY_COMPOUNDS = new Set([
    'husvegg', 'bordlampe', 'steinvegg', 'glasstak', 'brevpost',
    'trapptrinn', 'sandstrand', 'steinmur', 'glassdør', 'hustak',
    'gatelys', 'brevboks', 'stormvind', 'murstein', 'nattluft',
    'natthimmel'
  ]);

  const SARSKRIVING_BLOCKLIST = new Set([
    // Function words
    'i', 'på', 'av', 'til', 'med', 'for', 'om', 'er', 'og', 'å', 'at',
    // Temporal prepositions — "etter middag" / "før kveld" / "uten lunsj"
    // can be PP+noun (correct) or split-compound (error). Without semantic
    // context the rule can't disambiguate, so we blocklist these as
    // left-side to avoid the FP. Trades off some real split-compound
    // catches (etterskrift, førhåndsregel) for cleaner default behaviour.
    'etter', 'før', 'uten', 'under', 'over', 'mellom', 'gjennom',
    'rundt', 'siden', 'mot', 'fra',
    'som', 'en', 'ei', 'et', 'ein', 'eit', 'det', 'den', 'de', 'dei',
    'du', 'jeg', 'eg', 'han', 'hun', 'ho', 'vi', 'dere', 'dykk', 'meg',
    'deg', 'oss', 'dem', 'seg', 'min', 'din', 'sin', 'vår', 'ikke',
    'ikkje', 'nei', 'ja',
    // Common adjectives that can collide with compoundNouns as the left half
    'stor', 'liten', 'god', 'dårlig', 'ny', 'gammel', 'gamal', 'lang',
    'kort', 'varm', 'kald', 'fin', 'snill', 'tom', 'full', 'ren', 'rein',
    'skitten', 'rød', 'blå', 'hvit', 'kvit', 'svart', 'grønn', 'gul',
    'syk', 'frisk', 'rask', 'sen', 'sein', 'hard', 'myk', 'våt', 'tørr',
    'tynn', 'tykk', 'tjukk', 'bred', 'brei', 'smal', 'høy', 'høg', 'lav',
    'låg', 'tung', 'lett', 'mye', 'litt', 'noen', 'noire', 'alle', 'hver',
    'kvar', 'begge', 'selv', 'sjølv'
  ]);

  const rule = {
    id: 'sarskriving',
    languages: ['nb', 'nn'],
    priority: 30,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (nb-sarskriving) — Chrome native parity confirmed in 33-03 audit: NB särskrivning split-compound lookup; single-token rejoin suggestion",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      if (!finding.original || !finding.fix) {
        return {
          nb: 'To ord som kanskje hører sammen.',
          nn: 'To ord som kanskje høyrer saman.',
        };
      }
      return {
        nb: `<em>${escapeHtml(finding.original)}</em> kan være to ord som hører sammen som <em>${escapeHtml(finding.fix)}</em>.`,
        nn: `<em>${escapeHtml(finding.original)}</em> kan vere to ord som høyrer saman som <em>${escapeHtml(finding.fix)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      const compoundNouns = vocab.compoundNouns || new Set();
      // Phase 17-06: decomposition fallback removed — it produced FPs on
      // verb+noun ("Far arbeider"), adj+noun, number+noun, and cross-sentence
      // pairs without POS-aware gating. Compounds not yet in nounbank are
      // covered by SUPPLEMENTARY_COMPOUNDS above. Sarskriving expansion via
      // decomposition deferred to Phase 19 (Pitfall 4: FP storm).
      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const prev = tokens[i - 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        // Phase 4 / SC-02 + SC-04: skip if EITHER current or previous token
        // is suppressed — the finding spans both so both must be eligible.
        if (suppressed && (suppressed.has(i) || (i > 0 && suppressed.has(i - 1)))) continue;
        if (
          prev &&
          prev.word.length >= 2 && t.word.length >= 2 &&
          !SARSKRIVING_BLOCKLIST.has(prev.word) &&
          !SARSKRIVING_BLOCKLIST.has(t.word)
        ) {
          const concat = prev.word + t.word;
          const isKnownCompound = compoundNouns.has(concat) || SUPPLEMENTARY_COMPOUNDS.has(concat);

          if (isKnownCompound) {
            out.push({
              rule_id: 'sarskriving',
              priority: rule.priority,
              start: prev.start,
              end: t.end,
              original: `${prev.display} ${t.display}`,
              fix: prev.display + t.display.toLowerCase(),
              message: `Særskriving: "${prev.display} ${t.display}" skrives som ett ord`,
            });
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
