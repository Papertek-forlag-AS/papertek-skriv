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
    'natthimmel',
    // Educational compounds common in student writing — add inflected forms
    // because the rule concat-matches prev.word + t.word directly.
    'hovedsetning', 'hovedsetningen', 'hovedsetninger', 'hovedsetningene',
    'bisetning', 'bisetningen', 'bisetninger', 'bisetningene',
    'læringsmal', 'læringsmål', 'læringsmålet', 'læringsmåler',
  ]);

  const SARSKRIVING_BLOCKLIST = new Set([
    // Function words
    'i', 'på', 'av', 'til', 'med', 'for', 'om', 'er', 'og', 'å', 'at',
    // Phase 48 C5: coordinating conjunctions never form compound first-elements.
    // Without this, "forskjellig, men ingen er …" merged "men ingen" → "meningen".
    'men', 'eller',
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
    // Degree adverb + verb particles (Ordbank sweep 2026-07): «ikke så pen»
    // merged to «såpen»; «legge ut gift» to «utgift»; «slett ingen helgen»
    // to «slettingen».
    'så', 'ut', 'opp', 'inn', 'ned', 'slett',
    // Common adjectives that can collide with compoundNouns as the left half
    'stor', 'liten', 'god', 'dårlig', 'ny', 'gammel', 'gamal', 'lang',
    'kort', 'varm', 'kald', 'fin', 'snill', 'tom', 'full', 'ren', 'rein',
    'skitten', 'rød', 'blå', 'hvit', 'kvit', 'svart', 'grønn', 'gul',
    'syk', 'frisk', 'rask', 'sen', 'sein', 'hard', 'myk', 'våt', 'tørr',
    'tynn', 'tykk', 'tjukk', 'bred', 'brei', 'smal', 'høy', 'høg', 'lav',
    'låg', 'tung', 'lett', 'mye', 'litt', 'noen', 'noire', 'alle', 'hver',
    'kvar', 'begge', 'selv', 'sjølv',
    // v3.0.119: language adjectives. The likestilte data sync added the
    // language NAMES as nouns (engelsk = the subject/language), so "en
    // engelsk bok" decomposed as noun+noun → engelskbok FP. Attributive
    // use dominates overwhelmingly in student text.
    'norsk', 'engelsk', 'tysk', 'fransk', 'spansk', 'svensk', 'dansk',
    'samisk', 'amerikansk', 'italiensk', 'russisk', 'polsk', 'arabisk',
    'kinesisk', 'japansk',
  ]);

  // v3.0.120: tokens that put the following word in VERB position.
  const VERB_SUBJECT_CUES = new Set([
    'jeg', 'eg', 'du', 'han', 'hun', 'ho', 'vi', 'me', 'de', 'dei', 'dere', 'dykk',
    'og', 'eller', 'så', 'da', 'då',
  ]);

  // Norwegian modal verbs that take a bare infinitive complement (no «å»).
  // When the token two positions back is a modal, the token immediately before
  // the candidate noun is the infinitive complement of that modal — not a
  // compound first-element. "Han vil drikke vann" must not become "drikkevann".
  // The existing «å»-lookback guard covers explicit infinitive constructions
  // ("prøver å drikke vann"); this set covers the bare-infinitive modal case.
  // Includes past-tense modal forms ("ville", "skulle", …) — they behave
  // identically. Does NOT cover the accusative+infinitive pattern ("lar eleven
  // skrive oppgave") where a noun phrase intervenes between modal and
  // infinitive — that is rarer and would require a wider look-back.
  const MODAL_VERBS = new Set([
    'vil', 'ville',    // will / want to
    'kan', 'kunne',    // can
    'skal', 'skulle',  // shall
    'må', 'måtte',     // must
    'bør', 'burde',    // should
    'tør',             // dare (NB: same form pres/past)
    'får', 'fikk',     // may / get to
    'lar', 'lot',      // let
  ]);

  // Cardinal numbers (NB + NN). A number before a noun is a quantified phrase
  // ("tre borna" = three children), never a compound first-element — and a
  // number after "klokka" is a clock time ("klokka fem"). Used to block both
  // false-positive classes below. ("tre" is also the noun "tree", but the
  // numeral reading dominates before a noun, and real tree-compounds are
  // already written closed, so skipping number-left is safe.)
  const CARDINALS = new Set([
    'ein', 'éin', 'eit', 'ei', 'en', 'to', 'tre', 'fire', 'fem', 'seks',
    'sju', 'sjau', 'syv', 'åtte', 'ni', 'ti', 'elleve', 'tolv', 'tretten',
    'fjorten', 'femten', 'seksten', 'sytten', 'atten', 'nitten', 'tjue',
    'tjuge', 'tretti', 'tredve', 'førti', 'femti', 'seksti', 'sytti',
    'åtti', 'nitti', 'hundre', 'tusen', 'million', 'millionar', 'millioner'
  ]);

  // v3.0.137 (Wikipedia corpus): measure/classifier nouns whose bare-noun
  // complement is a phrase, never a split compound first-element: «antall
  // timer», «en type hus», «en rekke saker». As SECOND element they stay
  // pairable («bolig type» → boligtype is a real student error), so this
  // is checked on the LEFT token only — not via SARSKRIVING_BLOCKLIST,
  // which blocks both sides.
  const MEASURE_FIRST = new Set([
    'antall', 'antal', 'mengde', 'mengd', 'type', 'slags', 'par',
    'rekke', 'rekkje',
  ]);

  // Measure / container nouns. As the LEFT word these head a partitive phrase
  // ("eit glass vatn" = a glass of water; "ein kopp kaffi"; "to liter mjølk"),
  // not a compound — so the decompose fallback must not merge them with the
  // following noun ("glass vatn" → "glassvatn" is a false positive). Real
  // measure-noun compounds (glasskål, kaffikopp) are curated in compoundNouns,
  // so the fallback skip is safe. Only blocks when the measure noun is LEFT;
  // "kaffi kopp" → "kaffikopp" (measure noun on the right) still fires.
  const MEASURE_NOUNS = new Set([
    'glass', 'kopp', 'krus', 'kanne', 'flaske', 'skål', 'boks', 'pose',
    'kar', 'spann', 'skei', 'skeie', 'bit', 'skive', 'stykke', 'par',
    'kilo', 'liter', 'gram', 'desiliter', 'centiliter', 'dl', 'cl', 'kg',
    'klype', 'neve', 'dusin', 'porsjon', 'dose',
  ]);

  // Left-parts that take a SEPARATE noun complement, never a plain-concat
  // compound: titles, extra containers/quantifiers, weekdays, months, and a few
  // fixed-phrase heads. Surfaced by the Ordbank/Wikipedia sweep ("herr
  // president", "frøken Dal", "eske fyrstikker", "flokk sauer", "fredag aften",
  // "april måned", "i anledning dagen", "i tilfelle systemet").
  const NON_COMPOUND_LEFT = new Set([
    // titles / address
    'herr', 'fru', 'frøken', 'frue', 'dr', 'professor', 'doktor', 'sankt',
    'sankta', 'sir', 'lord', 'lady', 'konge', 'dronning', 'prins', 'prinsesse',
    // containers / quantifiers not already in MEASURE_NOUNS
    'eske', 'flokk', 'bunt', 'haug', 'gjeng', 'klynge', 'rekke', 'mengde',
    'stabel', 'bunke', 'klase', 'ansamling', 'samling',
    // weekdays
    'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag',
    'måndag', 'tysdag', 'onsdag', 'torsdag', 'fredag', 'laurdag', 'sundag',
    // months
    'januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august',
    'september', 'oktober', 'november', 'desember',
    // fixed-phrase heads
    'anledning', 'tilfelle', 'helg', 'begynnelse', 'begynnelsen',
    // more containers / quantifiers
    'håndfull', 'fat', 'kartong', 'kasse', 'rad', 'kurv', 'sekk', 'bøtte',
    'krukke', 'tønne', 'kilo', 'meter', 'bunke',
    // partitive measures (Ordbank sweep 2026-07): «en spade sand», «en teskje
    // humor», «et parti sjakk», «masse slim», «pund sterling»
    'spade', 'teskje', 'masse', 'parti', 'pund',
    // second wave: «en tube tannkrem», «en sum penger», «et utall ganger»,
    // «bli nummer tre», «stereo hodetelefoner»
    'tube', 'sum', 'utall', 'nummer', 'stereo',
  ]);

  // Weekdays + months as a RIGHT part are time adverbials («fant sted
  // tirsdag»), never a compound tail in split form.
  const WEEKDAY_MONTH = new Set([
    'mandag', 'tirsdag', 'onsdag', 'torsdag', 'fredag', 'lørdag', 'søndag',
    'måndag', 'tysdag', 'laurdag', 'sundag',
    'januar', 'februar', 'mars', 'april', 'mai', 'juni', 'juli', 'august',
    'september', 'oktober', 'november', 'desember',
  ]);

  // Compound/participle adjectives absent from the isAdjective index (present
  // participles and multi-part adjectives): "videregående opplæring", "fullskala
  // atomkrig", "smertestillende tabletter", "narkoman bror", "halv time", "annen
  // plass". Modifiers, not compound first-elements.
  const SUPP_ADJECTIVES = new Set([
    'videregående', 'fullskala', 'smertestillende', 'betennelsesdempende',
    'narkoman', 'halv', 'halve', 'annen', 'anna', 'samme', 'same',
    'reseptfrie', 'reseptfri', 'innendørs', 'utendørs', 'blandet', 'splittet',
    'fryktet', 'lokal', 'lokale', 'alternativ', 'alternative',
  ]);

  // Common attributive adjective forms (varme, store, gode, kalde, …) are the
  // -e/-t inflection of a blocklisted base adjective (varm, stor, god, kald).
  // The base is already in SARSKRIVING_BLOCKLIST, but the inflected form slips
  // through and — when it is also a noun homograph (varme = heat) — passes the
  // fallback's nounLemmaGenus gate, producing adj+noun FPs ("varme stader" →
  // "varmestader"). Treat such forms as adjectives on the fallback path.
  function isInflectedBlocklistedAdj(word) {
    if (!/[et]$/.test(word)) return false;
    return SARSKRIVING_BLOCKLIST.has(word.slice(0, -1));
  }

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
      // v3.0.137: curated denylist of pairs that look decomposable but are
      // NOT compounds (Phase 45 data file, previously only consumed by the
      // dormant tentative rule). Wikipedia corpus run surfaced confident-
      // rule FPs of exactly this class («videregående skole», «rett tid»).
      const nonCompoundPairs = vocab.nonCompoundPairs || new Set();
      // Phase 17-06: decomposition fallback removed — it produced FPs on
      // verb+noun ("Far arbeider"), adj+noun, number+noun, and cross-sentence
      // pairs without POS-aware gating. Compounds not yet in nounbank are
      // covered by SUPPLEMENTARY_COMPOUNDS above. Sarskriving expansion via
      // decomposition deferred to Phase 19 (Pitfall 4: FP storm).
      const out = [];
      const sourceText = ctx.text || '';
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const prev = tokens[i - 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        // Phase 4 / SC-02 + SC-04: skip if EITHER current or previous token
        // is suppressed — the finding spans both so both must be eligible.
        if (suppressed && (suppressed.has(i) || (i > 0 && suppressed.has(i - 1)))) continue;
        // Phase 48 C5: never merge across clause-boundary punctuation
        // (comma, semicolon, colon, em/en dash, question, exclamation,
        // period). Tokenizer drops punctuation, so check the raw source
        // between prev.end and t.start. Without this, "en bok, ser ikke
        // overfladisk" merged "bok, ser" → "bokser" across the comma.
        if (prev && sourceText) {
          const gap = sourceText.slice(prev.end, t.start);
          // v3.0.137: \n\r added — a line break is a paragraph/heading
          // boundary, not a compound split («familie\nFamilien» merged to
          // «familiefamilien» on the Wikipedia corpus).
          if (/[,;:!?.—–\n\r]/.test(gap)) continue;
        }
        // v3.0.137 (Wikipedia corpus): curated non-compound pair denylist.
        if (prev && nonCompoundPairs.has(prev.word + '|' + t.word)) continue;
        // v3.0.137: measure/classifier nouns take a bare noun complement
        // («antall timer», «en type hus», «en rekke saker») — never a
        // compound first-element in split form.
        if (prev && MEASURE_FIRST.has(prev.word)) continue;
        // v3.0.137: «for/til eksempel X» — fixed phrase, X is not a
        // compound tail of «eksempel».
        if (prev && prev.word === 'eksempel' && tokens[i - 2] &&
            (tokens[i - 2].word === 'for' || tokens[i - 2].word === 'til')) continue;
        // Phase 48 C5: when the token before prev is the infinitive marker
        // "å", prev is an infinitive verb in a verb-object construction,
        // not a compound first-element. "begynner å skrive oppgaven" must
        // not become "begynner å skriveoppgaven". The infinitive itself
        // isn't a key in verbInfinitive (which is inflected→infinitive),
        // so we rely on the "å" cue alone — it's high-precision in NB.
        if (prev && tokens[i - 2] && tokens[i - 2].word === 'å') continue;
        // Modal + bare infinitive: "Han vil drikke vann" / "Skal skrive bok".
        // Norwegian modals take a bare infinitive (no «å»), so the «å»-guard
        // above misses them. When i-2 is a modal, i-1 (prev) is the infinitive
        // complement — not a compound first-element.
        if (prev && tokens[i - 2] && MODAL_VERBS.has(tokens[i - 2].word)) continue;
        // v3.0.120: verb-position guard. When prev is ALSO a finite verb
        // form (NN "drikk" = both noun and presens) and the token before it
        // is a subject pronoun or coordinator, prev is the VERB of a
        // verb-object phrase ("eg drikk vatn", "og drikk vatn") — not a
        // compound first-element. Surfaced when the NN data cleanup added
        // "drikk" as a noun and "og drikk vatn" flagged → drikkevatn.
        if (prev && tokens[i - 2] && VERB_SUBJECT_CUES.has(tokens[i - 2].word)
            && vocab.knownPresens && vocab.knownPresens.has(prev.word)) continue;
        // Number + noun is a quantified phrase ("tre borna"), not a compound.
        if (prev && CARDINALS.has(prev.word)) continue;
        // "klokka/klokken" + number is a clock time ("middag klokka fem",
        // "middag klokken fem"), not the compound "middagsklokka" (dinner
        // bell). Covers NN "klokka" + NB definite "klokken" + base "klokke".
        if ((t.word === 'klokka' || t.word === 'klokken' || t.word === 'klokke') &&
            tokens[i + 1] && CARDINALS.has(tokens[i + 1].word)) continue;
        // ── Ordbank-sweep shared guards (apply to BOTH the curated-compound
        //    path and the decompose fallback; the earlier gates lived only on
        //    the fallback, so curated pairs like «gå tur»→gåtur, «sende bud»→
        //    sendebud, «lørdag kveld»→lørdagskveld fired ungated). ──
        if (prev) {
          // Hyphen already joins the pair («opp-turen») — valid compound spelling.
          if (sourceText && /-/.test(sourceText.slice(prev.end, t.start))) continue;
          // Digit context before the left word («1. person flertall») — the
          // pair sits inside a numeric/ordinal expression, not a compound.
          if (tokens[i - 2] && sourceText &&
              /\d/.test(sourceText.slice(tokens[i - 2].end, prev.start))) continue;
          // Proper-noun left: capitalized mid-sentence («skapte Gud himmelen»,
          // «topper Brann tabellen», «på Sentrum kino») — a name is never a
          // split-compound first element.
          if (prev.display && /^[A-ZÆØÅ]/.test(prev.display) && i - 1 > 0) {
            const gapB = tokens[i - 2] ? sourceText.slice(tokens[i - 2].end, prev.start) : '';
            if (!/[.!?]/.test(gapB)) continue;
          }
          // Verb left-part: the left word is a verb form and not introduced by
          // an article — verb+object phrase, not a split compound («sende bud»,
          // «gå tur», «farge garn», «spille tiden», «driver overvåking»,
          // «strekker hånden», «drev storfe»). An article before keeps the
          // compound reading («en fotball bane» still flags).
          const ART_BEFORE = new Set(['en', 'ei', 'et', 'ein', 'eit', 'den', 'det', 'de', 'dei']);
          const prevIsVerbForm = (vocab.verbForms && vocab.verbForms.has(prev.word)) ||
            (vocab.knownPresens && vocab.knownPresens.has(prev.word)) ||
            (vocab.knownPreteritum && vocab.knownPreteritum.has(prev.word));
          // Exception: an article OR adjective before the pair keeps the
          // compound reading — "en fotball bane" and "rent drikke vann"
          // (drikkevann) are split compounds; a verb can't follow an
          // attributive adjective.
          const beforePair = tokens[i - 2];
          const beforeKeepsCompound = beforePair && (ART_BEFORE.has(beforePair.word) ||
            (vocab.isAdjective && vocab.isAdjective.has(beforePair.word)) ||
            (vocab.adjLemma && vocab.adjLemma.has(beforePair.word)));
          if (prevIsVerbForm && !beforeKeepsCompound) continue;
          // Adjective left-part (incl. declined/nominalised and the
          // participle/multi-part supplement) — modifier, not compound head.
          if ((vocab.isAdjective && vocab.isAdjective.has(prev.word)) ||
              (vocab.adjLemma && vocab.adjLemma.has(prev.word)) ||
              SUPP_ADJECTIVES.has(prev.word)) continue;
          // Titles/containers/weekdays/months as left («lørdag kveld», «spade
          // sand», «teskje humor», «parti sjakk») — separate complement.
          if (NON_COMPOUND_LEFT.has(prev.word)) continue;
          // Weekday/month as RIGHT part («fant sted tirsdag») — a time
          // adverbial, never a compound tail in split form.
          if (WEEKDAY_MONTH.has(t.word)) continue;
          // Right word is a finite past verb («en høy og blå himmel hvelvet
          // seg») — subject + predicate, not a compound.
          if (!/ar$/.test(t.word) &&
              ((vocab.knownPreteritum && vocab.knownPreteritum.has(t.word)) ||
               (vocab.knownParticiples && vocab.knownParticiples.has(t.word)))) continue;
          // Cardinal right + «ganger/gang» («spille bingo tre ganger i uka»).
          if (CARDINALS.has(t.word) && tokens[i + 1] &&
              /^(ganger|gongen|gonger|gang)$/.test(tokens[i + 1].word)) continue;
          // Adverbial right-word: rett/midt/helt followed by a preposition or
          // adjective is an adverbial, not a compound tail («pes rett før
          // fristen», «ball midt i planeten», «hjem helt utmattet»). Genuine
          // tails (middagsrett, superhelt) are not followed by a preposition.
          if ((t.word === 'rett' || t.word === 'midt' || t.word === 'helt') && tokens[i + 1]) {
            const nx = tokens[i + 1].word;
            const ADVERBIAL_NEXT = new Set(['før', 'på', 'i', 'fra', 'frå', 'utenfor',
              'utanfor', 'etter', 'over', 'under', 'ved', 'til', 'mot', 'bak', 'foran']);
            if (ADVERBIAL_NEXT.has(nx) ||
                (vocab.isAdjective && vocab.isAdjective.has(nx)) ||
                (vocab.adjLemma && vocab.adjLemma.has(nx))) continue;
          }
          // Partitive «en time skriving» — time + verbal -ing noun is an
          // amount-of-activity phrase, not the compound (timeskriving =
          // time-logging). Genuine «time plan»→timeplan keeps flagging
          // (plan is not an -ing noun).
          if (prev.word === 'time' && /ing(en|a|er|ene)?$/.test(t.word)) continue;
          // «tur og retur» idiom («ha billett tur og retur»).
          if (t.word === 'tur' && tokens[i + 1] && tokens[i + 1].word === 'og' &&
              tokens[i + 2] && tokens[i + 2].word === 'retur') continue;
          // klokka + digit time («avspark klokka 18.00») — digits are dropped
          // by the tokenizer, so the CARDINALS word-number check missed them.
          if ((t.word === 'klokka' || t.word === 'klokken') && sourceText &&
              /^\s*\d/.test(sourceText.slice(t.end))) continue;
        }
        if (
          prev &&
          prev.word.length >= 2 && t.word.length >= 2 &&
          !SARSKRIVING_BLOCKLIST.has(prev.word) &&
          !SARSKRIVING_BLOCKLIST.has(t.word)
        ) {
          // Phase 45-02 follow-up: try plain concat first (most common), then
          // fuge-e and fuge-s variants. NN compounds like 'katteseng',
          // 'julegåve', 'hundehus' use fuge-e; 'matpakke' uses zero; some
          // (rådmannsskap) use fuge-s. The confident rule was only checking
          // plain concat so fuge-linker compounds in compoundNouns were
          // silently invisible to it. Phase 17-06's FP concern doesn't apply
          // here — we still REQUIRE the compound to be in the curated set.
          let canonical = null;
          for (const linker of ['', 'e', 's']) {
            const candidate = prev.word + linker + t.word;
            if (compoundNouns.has(candidate) || SUPPLEMENTARY_COMPOUNDS.has(candidate)) {
              canonical = { joined: candidate, linker };
              break;
            }
          }
          // Plan 50-04 sub-step B: plural-compound fallback via
          // decomposeCompound. Gated on nounLemmaGenus.has(prev.word)
          // so LEFT is a pure noun lemma — blocks adj+noun / verb+noun
          // FPs (adjectives/verbs are not in nounLemmaGenus). Probed
          // against all 30+ saerskriving acceptance cases: 0 FPs.
          if (!canonical && vocab.nounLemmaGenus && typeof vocab.decomposeCompound === 'function') {
            const nounGenusAll = vocab.nounGenus || new Map();
            const verbForms = vocab.verbForms || new Map();
            const verbInfinitive = vocab.verbInfinitive || new Map();
            const knownPresens = vocab.knownPresens || new Set();
            const knownPreteritum = vocab.knownPreteritum || new Set();
            const knownParticiples = vocab.knownParticiples || new Set();
            // Plan 50-04 follow-up: identical-token doubling
            // ('helt helt') is the redundancy rule's territory. Verb
            // gate: prev must NOT be a verb form — Phase 17-06 removed
            // the unguarded decomposition path because of verb+noun FPs
            // ('leser bøker', 'kan drikke kaffe'). verbForms keys by
            // infinitive ('drikke' / 'lese'); knownPresens covers
            // present forms ('leser'); knownPreteritum + knownParticiples
            // cover past tenses for completeness.
            const prevIsVerb = verbForms.has(prev.word) ||
                               verbInfinitive.has(prev.word) ||
                               knownPresens.has(prev.word) ||
                               knownPreteritum.has(prev.word) ||
                               knownParticiples.has(prev.word);
            // NN a-verb present forms end in -ar and are homographs of -ar
            // agent nouns ("spelar" = plays / a player). When the verb is
            // missing from the lexicon (e.g. "å spele" is absent), prevIsVerb
            // is falsely false and the decompose fallback merges verb+object
            // ("spelar fotball" → "spelarfotball"). Skip -ar left-words on the
            // FALLBACK path only — real -ar agent-noun compounds are caught by
            // the curated compoundNouns path above. (nn/nb-internal: -ar
            // lemmas in nounLemmaGenus are agent nouns, not plurals.)
            const prevLooksAVerb = (ctx.lang === 'nn' || ctx.lang === 'nb') && /ar$/.test(prev.word);
            // Verb-tail guard: the RIGHT word being a finite verb form means
            // this is subject + predicate, not a compound ("kamp varer" = "a
            // match lasts"; "språk vert snakka" = "languages are spoken"). The
            // -ar exclusion preserves -ar agent-noun compound heads (which are
            // a-verb-present homographs: "fotball spelar" → "fotballspelar").
            const tIsVerb = !/ar$/.test(t.word) &&
                            (knownPresens.has(t.word) || knownPreteritum.has(t.word) ||
                             knownParticiples.has(t.word) || verbForms.has(t.word));
            // Direction/place adverbs as the right word are adverbial, not
            // compound tails ("land vest på halvøya" = "land [to the] west").
            const DIRECTION_ADV = new Set(['nord', 'sør', 'aust', 'vest', 'øst',
              'opp', 'ned', 'inn', 'ut', 'heim', 'hit', 'dit', 'fram', 'attende', 'bort']);
            // Adjacency guard: only merge textually-adjacent words. Numbers are
            // dropped from the token stream, so "juni 1867 gifta" yields the
            // consecutive TOKENS juni|gifta with a number between them in the
            // source — merging them ("junigifta") is wrong. Require the gap to
            // be whitespace only.
            const gapBetween = sourceText.slice(prev.end, t.start);
            const textuallyAdjacent = /^\s+$/.test(gapBetween);
            // "som" + noun is an adverbial/comparative phrase ("som regel" = as
            // a rule; "som barn" = as a child), so the noun after it is a
            // separate constituent, not a compound left-part: "skil som regel
            // mat" is not "regelmat". Don't merge when prev follows "som".
            const beforePrev = tokens[i - 2];
            const prevAfterSom = beforePrev && beforePrev.word === 'som';
            // An ADJECTIVE left-part is a modifier, not a compound first-element:
            // "eldre personer", "onde tanker", "rett format", "dyr affære",
            // "lokale festivaler", "videregående opplæring". Many are also
            // nominalised nouns (de eldre / den onde), so they slip past the
            // nounLemmaGenus gate — check the adjective index directly. Genuine
            // adj-homograph noun compounds (dyrehage, rettssak) are covered by
            // the curated compoundNouns path above; the fallback needn't chase them.
            const prevIsAdjWord = (vocab.isAdjective && vocab.isAdjective.has(prev.word))
              || (vocab.adjLemma && vocab.adjLemma.has(prev.word))
              || SUPP_ADJECTIVES.has(prev.word);
            // Titles, containers/quantifiers, and weekday/month left-parts take a
            // separate noun complement, never a plain-concat compound: "herr
            // president", "frøken Dal", "eske fyrstikker", "flokk sauer", "fredag
            // aften", "april måned".
            const prevIsNonCompoundLeft = NON_COMPOUND_LEFT.has(prev.word);
            if (prev.word !== t.word &&
                textuallyAdjacent &&
                !prevAfterSom &&
                !prevIsAdjWord &&
                !prevIsNonCompoundLeft &&
                !MEASURE_NOUNS.has(prev.word) &&
                !isInflectedBlocklistedAdj(prev.word) &&
                vocab.nounLemmaGenus.has(prev.word) &&
                !prevIsVerb &&
                !prevLooksAVerb &&
                !tIsVerb &&
                !DIRECTION_ADV.has(t.word) &&
                // A likestilt VARIANT spelling on the right is not evidence of a
                // compound. v3.8.23 put variant spellings into nounGenus so the
                // dictionary can decompose «bjerketre» — the same index this
                // fallback probes — and `jus` (a spelling of `juss`) promptly
                // turned «første avdeling jus» into a missing compound. The
                // curated compoundNouns path above is unaffected: a real
                // variant-spelled compound is caught there, with evidence.
                !(vocab.variantSpellings && vocab.variantSpellings.has(t.word)) &&
                nounGenusAll.has(t.word)) {
              // Which joint, not just whether to join. This path used to emit a
              // bare concatenation, and a bare concatenation is wrong for every
              // first element the norm joins with a fuge: «avdeling» takes -s in
              // 73 of its 77 attested compounds, so «avdelingleder» would be a
              // misspelling offered as the fix for a misspelling. Prefer a
              // linker whose joined form is ATTESTED — evidence beats a rule of
              // thumb, and the evidence is already bundled.
              const LINKERS = ['s', 'e'];
              let linked = null;
              for (const lk of LINKERS) {
                const cand = prev.word + lk + t.word;
                if (vocab.validWords && vocab.validWords.has(cand)) { linked = { joined: cand, linker: lk }; break; }
              }
              if (linked) {
                canonical = linked;
              } else {
                const dc = vocab.decomposeCompound(prev.word + t.word);
                if (dc && dc.confidence === 'high' && Array.isArray(dc.parts) && dc.parts.length === 2) {
                  canonical = { joined: prev.word + t.word, linker: '' };
                }
              }
            }
          }

          if (canonical) {
            // Preserve original casing on the left-half display; lowercase
            // the right-half (or the linker+right-half) to match existing
            // sarskriving fix-shape behavior.
            const fixDisplay = prev.display + canonical.linker + t.display.toLowerCase();
            out.push({
              rule_id: 'sarskriving',
              priority: rule.priority,
              start: prev.start,
              end: t.end,
              original: `${prev.display} ${t.display}`,
              fix: fixDisplay,
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
