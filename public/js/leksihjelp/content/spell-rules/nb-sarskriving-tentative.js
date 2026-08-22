/**
 * Spell-check rule: tentative compound detection via POS-gated decomposition.
 *
 * Phase 45. Complements `nb-sarskriving` (priority 30, confident — requires
 * explicit nounbank entry). This rule (priority 31) catches productive
 * compounds NOT yet curated, behind a POS gate that suppresses the FP storm
 * that caused Phase 17-06 to remove decomposition-based sarskriving.
 *
 * Fires `severity: 'hint'` (amber dot, sub-warning) with `noAutoFix: true`.
 * The popover (renderer-side, plan 45-02) surfaces "Ja, dette er eit
 * samansatt ord" / "Nei, det er feil" buttons; clicks emit SEND_REPORT
 * payloads that flow into the curator queue.
 *
 * Priority 31 means dedupeOverlapping prefers the confident rule (30) when
 * both fire on the same span — known compounds stay confident.
 *
 * POS gate (all must hold for tentative to fire):
 *   1. Token at i-2 is an ARTICLE or POSSESSIVE (the slot one before the
 *      candidate compound's left half). The compound structure is
 *      "[article] [N1] [N2]" wanting to become "[article] [N1N2]". This
 *      single check filters most Phase 17-06 FP classes: "Far arbeider"
 *      (no article precedes Far), "Han tek" (subject pronoun, not article),
 *      sentence-initial bare nouns.
 *   2. Neither left nor right is a known finite verb form. Filters "kom
 *      og gjekk" style ambiguities the article check missed.
 *   3. The pair "left|right" (lowercased) is NOT in the nonCompoundPairs
 *      denylist (curated FPs the article gate can't catch — "stor by",
 *      "ein far dag" idioms).
 *
 * Decomposition contract: `decomposeCompound(prev+next)` must return high
 * confidence. The function bails if the joined form is itself in nounGenus
 * (it would be caught by the confident rule via compoundNouns), so this
 * rule only fires on UNCURATED productive compounds.
 *
 * Rule ID: 'sarskriving-tentative' — distinct rule_id so fixtures and the
 * benchmark grouping stay clean. Same explain-contract shape as sarskriving.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Article-like left contexts that license a noun-noun compound reading.
  // Limited to high-confidence determiners + possessives to avoid the adj+noun
  // FP class ("stor by" → not a compound). The structure "[article] [N1] [N2]"
  // → "[article] [N1N2]" holds in nb/nn AND German ("die Haus tür" → "Haustür").
  const ARTICLE_LIKE_NO = new Set([
    // NB + NN articles/demonstratives (one shared set, harmless overlap)
    'en', 'ei', 'et', 'den', 'det', 'de', 'ein', 'eit', 'dei',
    // shared possessives
    'min', 'mi', 'mitt', 'mine', 'din', 'di', 'ditt', 'dine',
    'vår', 'vårt', 'våre', 'sin', 'si', 'sitt', 'sine',
    'hans', 'hennes', 'hennar', 'deira', 'deres',
  ]);
  const ARTICLE_LIKE_DE = new Set([
    'der', 'die', 'das', 'dem', 'den', 'des',
    'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
    'kein', 'keine', 'keinen', 'keinem', 'keiner', 'keines',
    'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines',
    'dein', 'deine', 'deinen', 'deinem', 'deiner', 'deines',
    'sein', 'seine', 'seinen', 'seinem', 'seiner', 'seines',
    'ihr', 'ihre', 'ihren', 'ihrem', 'ihrer', 'ihres',
    'unser', 'unsere', 'unseren', 'unserem', 'unserer', 'unseres',
    'euer', 'eure', 'euren', 'eurem', 'eurer', 'eures',
  ]);
  const ARTICLE_LIKE_BY_LANG = { nb: ARTICLE_LIKE_NO, nn: ARTICLE_LIKE_NO, de: ARTICLE_LIKE_DE };
  // Compound fuge-linker candidates per language (longest-first). German has
  // the richer inventory (Sonne+n+Schein, Kind+er+Garten, Arbeit+s+Platz).
  const LINKERS_BY_LANG = { nb: ['e', 's', ''], nn: ['e', 's', ''], de: ['en', 'es', 'er', 'n', 's', 'e', ''] };

  // Closed-class function words (nb+nn) that may sit as the LEFT half of a
  // false-friend phrase whose join is a valid word ("hver dag"→"hverdag",
  // "til stede"→"tilstede", "i morgen"→"imorgen", "over alt"→"overalt"). A
  // genuine split compound has a CONTENT word (noun / verb-stem) on the left,
  // never one of these. This closed-class exclusion + the isAdjective gate is
  // what lets the known-compound (joined ∈ validWords) path stay precise
  // without an article context. Empirically 12/12 on the adversarial false set.
  const FUNCTION_WORDS_NO = new Set([
    // prepositions
    'i', 'på', 'til', 'fra', 'frå', 'med', 'mot', 'om', 'av', 'for', 'ved',
    'etter', 'før', 'under', 'over', 'mellom', 'blant', 'bak', 'foran', 'hos',
    'gjennom', 'uten', 'utan', 'mot', 'rundt', 'kring',
    // adverbs / particles that collide (fram/over/opp/…)
    'fram', 'frem', 'ut', 'inn', 'opp', 'ned', 'bort', 'hit', 'dit', 'her',
    'der', 'nå', 'no', 'da', 'då', 'så', 'enn', 'jo', 'nok', 'da', 'igjen',
    // determiners / quantifiers
    'hver', 'hvert', 'kvar', 'kvart', 'all', 'alle', 'alt', 'begge', 'både',
    'noen', 'noe', 'nokon', 'noko', 'ingen', 'inga', 'ikkje', 'ikke', 'mye',
    'mykje', 'mange', 'fleire', 'flere', 'få', 'samme', 'same', 'annen', 'anna',
    'annet', 'andre', 'slik', 'sånn', 'den', 'det', 'de', 'dei', 'denne',
    'dette', 'desse', 'disse', 'en', 'et', 'ei', 'ein', 'eit',
    // conjunctions
    'og', 'eller', 'men', 'som', 'at', 'fordi', 'når', 'viss', 'hvis', 'enten',
    // pronouns
    'jeg', 'eg', 'du', 'han', 'hun', 'ho', 'vi', 'dere', 'dykk', 'man',
  ]);
  // Language/nationality adjectives that the bundled isAdjective index misses
  // (they double as noun forms). As the LEFT half they head an adj+noun phrase
  // ("en engelsk bok"), not a compound — same role as isAdjective in the gate.
  const ADJ_SUPPLEMENT = new Set([
    'engelsk', 'norsk', 'tysk', 'fransk', 'spansk', 'svensk', 'dansk',
    'italiensk', 'russisk', 'kinesisk', 'japansk', 'amerikansk', 'britisk',
    'europeisk', 'afrikansk', 'asiatisk', 'gresk', 'latinsk',
  ]);
  // Measure / container nouns — "et glass vann", "en kopp kaffe" are measure
  // phrases (correctly two words), not compounds.
  const MEASURE_NOUNS = new Set([
    'glass', 'kopp', 'flaske', 'boks', 'pose', 'skje', 'skei', 'bit', 'stykke',
    'par', 'kilo', 'liter', 'gram', 'meter', 'dråpe', 'klype', 'neve', 'haug',
    'flokk', 'gjeng', 'rekke', 'kurv', 'sekk', 'spann', 'bøtte', 'fat', 'krus',
  ]);

  const rule = {
    id: 'sarskriving-tentative',
    languages: ['nb', 'nn', 'de'],
    priority: 31,
    severity: 'hint',
    exam: {
      safe: true,
      reason: "Tentative compound suggestion behind POS gate; sub-warning severity; same risk class as sarskriving with stricter gating",
      category: "spellcheck",
    },
    explain: (finding) => ({
      nb: `Sannsynleg samansatt ord — <em>${escapeHtml(finding.original)}</em> kan vere <em>${escapeHtml(finding.fix)}</em>. Stemmer det?`,
      nn: `Sannsynleg samansatt ord — <em>${escapeHtml(finding.original)}</em> kan vere <em>${escapeHtml(finding.fix)}</em>. Stemmer det?`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, suppressed } = ctx;
      // Phase 45-01: rule lands DORMANT. The settings toggle that wakes it
      // up + the popover Ja/Nei UI both land in Plan 45-02. The fixture
      // runner and current browser sessions never set this flag, so the
      // rule short-circuits and existing fixtures stay green.
      //
      // To smoke-test manually: set `vocab.sarskrivingTentativeEnabled = true`
      // before calling spell.check(...). See plan 45-01 verification block.
      if (!vocab.sarskrivingTentativeEnabled) return [];

      const decomposeCompound = vocab.decomposeCompound;
      if (!decomposeCompound) return [];

      const compoundNouns = vocab.compoundNouns || new Set();
      const nonCompoundPairs = vocab.nonCompoundPairs || new Set();
      const knownPresens = vocab.knownPresens || new Set();
      const knownPreteritum = vocab.knownPreteritum || new Set();
      const nounGenus = vocab.nounGenus || new Map();
      const validWords = vocab.validWords || new Set();
      const isAdjective = vocab.isAdjective || new Set();
      const funcWords = FUNCTION_WORDS_NO;
      const articleSet = ARTICLE_LIKE_BY_LANG[ctx.lang] || ARTICLE_LIKE_NO;
      const linkers = LINKERS_BY_LANG[ctx.lang] || ['e', 's', ''];
      // Vocab indexes are lowercase for every language (German nouns are
      // normalised to lowercase in the bundle), so compound lookups stay
      // lowercase. German display, however, capitalises the compound (Haustür).
      const isDe = ctx.lang === 'de';
      const capFirst = (s) => s.charAt(0).toUpperCase() + s.slice(1);
      const out = [];

      // Phase 45-02 follow-up: infer the canonical compound linker per modifier
      // by tallying existing curated compounds. katt → fuge-e (kattemat);
      // stein → zero (steinalder); Sonne → fuge-n (Sonnenschein); Kind → fuge-er
      // (Kindergarten). Cached per-check. Generalised over the language's linker
      // inventory; a non-zero linker is only chosen if it out-counts zero.
      const linkerCache = new Map();
      function inferLinker(modifier) {
        if (linkerCache.has(modifier)) return linkerCache.get(modifier);
        const counts = {};
        for (const noun of compoundNouns) {
          if (!noun.startsWith(modifier) || noun === modifier) continue;
          const rest = noun.slice(modifier.length);
          if (!rest) continue;
          for (const lk of linkers) { // longest-first
            if (rest.startsWith(lk) && rest.length > lk.length && nounGenus.has(rest.slice(lk.length))) {
              counts[lk] = (counts[lk] || 0) + 1;
              break;
            }
          }
        }
        const zeroCount = counts[''] || 0;
        let bestLk = '', bestC = 0;
        for (const lk of linkers) { if (lk === '') continue; const c = counts[lk] || 0; if (c > bestC) { bestC = c; bestLk = lk; } }
        const chosen = bestC > zeroCount ? bestLk : '';
        linkerCache.set(modifier, chosen);
        return chosen;
      }

      for (let i = 2; i < tokens.length; i++) {
        const prePrev = tokens[i - 2];
        const prev = tokens[i - 1];
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && (suppressed.has(i) || suppressed.has(i - 1))) continue;
        if (prev.word.length < 2 || t.word.length < 2) continue;

        const left = prev.word.toLowerCase();
        const right = t.word.toLowerCase();
        const article = prePrev.word.toLowerCase();

        // POS gate: neither half can be a known finite verb form (applies to
        // both licensing paths below — filters "kom og gjekk" ambiguities).
        if (knownPresens.has(left) || knownPreteritum.has(left)) continue;
        if (knownPresens.has(right) || knownPreteritum.has(right)) continue;

        // Denylist hit silences this pair (both paths).
        if (nonCompoundPairs.has(left + '|' + right)) continue;

        // Build the compound in the language's casing: German capitalizes the
        // modifier (Haus) and lowercases the head inside the word (Haustür);
        // nb/nn are all-lowercase (kattemat). Infer the canonical linker from
        // existing compoundNouns starting with the same modifier.
        const modifier = left;
        const linker = inferLinker(modifier);
        const joined = modifier + linker + right;

        // If the joined form is already curated/known, the confident rule (30)
        // owns it — tentative never co-fires.
        if (compoundNouns.has(joined)) continue;
        if (compoundNouns.has(modifier + right)) continue;
        if (nounGenus.has(joined)) continue;
        if (nounGenus.has(modifier + right)) continue;

        // Two licensing paths — either suffices:
        //  A. Article path (original Phase 45): "[article] [N1] [N2]" with a
        //     high-confidence decomposition. Covers compounds NOT in Ordbank.
        //  B. Known-compound path (data-efficient): the joined form is itself a
        //     valid word (Norsk Ordbank already knows the compound), both halves
        //     are valid words, and the left half is a CONTENT word — not a
        //     function word or adjective, which head the "hver dag"→"hverdag" /
        //     "stor by"→"storby" false friends. No article context needed;
        //     Ordbank membership is the signal. nb/nn only (German casing +
        //     noun handling differ; it keeps the article path).
        // Sentence-boundary guard (all languages): never join a pair that
        // straddles sentence punctuation ("hund. Skulen" ≠ hundeskulen).
        const midGap = ctx.text ? ctx.text.slice(prev.end, t.start) : ' ';
        if (/[.!?:;]/.test(midGap)) continue;

        // nb/nn-specific false-friend guards. German is excluded: it capitalizes
        // the compound head (Haus+Tür → Haustür), and its genitive/measure
        // patterns differ — so a capitalized right half and these left-half
        // checks would wrongly suppress legitimate German compounds.
        if (ctx.lang === 'nb' || ctx.lang === 'nn') {
          // Right half of a nb/nn compound is lowercase; a capitalized right
          // token is a sentence start / proper noun, not a compound tail.
          if (/^[A-ZÆØÅ]/.test(t.display)) continue;
          // Genitive phrase ("dagens hendelser"): left ends in -s with a known
          // noun stem. (Trades the rarer fuge-s split "arbeids plass" to protect
          // the common genitive — the precision-first call for a hint tier.)
          if (left.endsWith('s') && nounGenus.has(left.slice(0, -1))) continue;
          // Measure phrase ("et glass vann", "en kopp kaffe") — two words.
          if (MEASURE_NOUNS.has(left)) continue;
          // Left half must be a content word — not a function word or adjective
          // (heads adj+noun false friends "mørk skog", "engelsk bok"). Applies
          // to both licensing paths.
          if (funcWords.has(left) || isAdjective.has(left) || ADJ_SUPPLEMENT.has(left)) continue;
        }

        const decomp = decomposeCompound(joined);
        const articlePath = articleSet.has(article) && decomp && decomp.confidence === 'high';
        const isNoNn = ctx.lang === 'nb' || ctx.lang === 'nn';
        // Noun-phrase context: an article/possessive OR an adjective at i-2
        // licenses the noun reading of N1 and disambiguates noun-verb
        // homographs ("nye hopp skiene" → hopp is a noun here, not "jump!").
        // Without it, verb+object phrases ("[å] lese bøker", "[å] ringe
        // byrået") and measure phrases ("[ti] år gammel") false-fire.
        const npContext = articleSet.has(article) || isAdjective.has(article);
        const knownCompoundPath = isNoNn && npContext &&
          validWords.has(joined) && validWords.has(left) && validWords.has(right) &&
          nounGenus.has(right);
        if (!articlePath && !knownCompoundPath) continue;

        // Build finding. noAutoFix=true; the renderer surfaces Ja/Nei buttons
        // (plan 45-02) before applying the fix. Preserve original casing on
        // left-half display; lowercase right-half (matching sarskriving's
        // fix-shape convention).
        const fixDisplay = (isDe ? capFirst(prev.display) : prev.display) + linker + t.display.toLowerCase();
        out.push({
          rule_id: 'sarskriving-tentative',
          priority: rule.priority,
          start: prev.start,
          end: t.end,
          original: `${prev.display} ${t.display}`,
          fix: fixDisplay,
          message: `Sannsynleg samansatt ord: "${prev.display} ${t.display}" kan vere "${fixDisplay}"`,
          severity: 'hint',
          noAutoFix: true,
          tentative: true,
          // Renderer-side fields for the SEND_REPORT payload (plan 45-02).
          left: left,
          right: right,
          linker: linker,
          suggestedGender: decomp ? (decomp.gender || null) : null,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
