/**
 * Spell-check rule: German Getrenntschreibung / Zusammenschreibung (priority 30).
 *
 * Flags adjacent tokens whose concatenation is a known German compound noun:
 * "Fahr rad" → "Fahrrad". Uses German mandatory noun capitalisation as a
 * disambiguation signal across three tiers:
 *
 *   1. verb(lowercase) + Noun(UPPERCASE) mid-sentence → SUPPRESS.
 *      German verbs are lowercase in mid-sentence; nouns are always uppercase.
 *      "fahr Rad zur Schule" is an unambiguous imperative phrase — not split
 *      compound. Detection via vocab.verbInfinitive (conjugated forms like
 *      "sucht" → suchen) plus DE_VERB_IMPERATIV_OVERLAPS (bare du-Imperativ
 *      stems like "fahr" that are absent from conjugation tables).
 *
 *   2. Verb(UPPERCASE) + Noun(UPPERCASE) at sentence start, pair in HINT_PAIRS
 *      → HINT (rule_id: 'sarskriving_de_hint').
 *      "Fahr Rad zur Schule" — both are capitalised, so it could be a correct
 *      imperative sentence OR a split compound with correct noun casing. The
 *      popover explains the ambiguity rather than asserting an error.
 *
 *   3. Everything else with a compound match → HARD ERROR (rule_id: 'sarskriving_de').
 *      Includes: noun lowercase (German nouns must be uppercase), Noun(UPPERCASE) +
 *      Noun(UPPERCASE) split where no natural imperative reading exists.
 *
 * Two rule objects are registered so the explain-contract gate can validate
 * each explain independently. The hint rule's check() returns [] — findings
 * are emitted by the main rule with rule_id: 'sarskriving_de_hint'.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Words that should never be the LEFT side of a sarskriving finding.
  // Covers articles, pronouns, prepositions, conjunctions, and common
  // adjectives whose concatenation with a noun COULD match a compound.
  const SARSKRIVING_BLOCKLIST_DE = new Set([
    // Articles and determiners
    'der', 'die', 'das', 'dem', 'den', 'des',
    'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
    'kein', 'keine', 'keinen', 'keinem', 'keiner', 'keines',
    // Personal pronouns
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr',
    'mich', 'dich', 'sich', 'uns', 'euch',
    // Possessives
    'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines',
    'dein', 'deine', 'deinen', 'deinem', 'deiner', 'deines',
    'sein', 'seine', 'seinen', 'seinem', 'seiner', 'seines',
    'ihr', 'ihre', 'ihren', 'ihrem', 'ihrer', 'ihres',
    'unser', 'unsere', 'unseren', 'unserem', 'unserer', 'unseres',
    'euer', 'eure', 'euren', 'eurem', 'eurer', 'eures',
    // Prepositions
    'in', 'an', 'auf', 'bei', 'durch', 'für', 'gegen', 'ohne',
    'um', 'mit', 'nach', 'seit', 'von', 'vor', 'zu', 'ab',
    'zwischen', 'über', 'unter', 'hinter', 'neben',
    'aus', 'außer', 'bis', 'entlang', 'gegenüber',
    // Conjunctions and particles
    'und', 'oder', 'aber', 'doch', 'nicht', 'auch', 'noch', 'schon',
    'nur', 'sehr', 'mehr', 'immer', 'nie', 'hier', 'da', 'so',
    'ja', 'nein', 'denn', 'weil', 'wenn', 'dass', 'als', 'ob',
    // Common adjectives that can collide with compound left-halves
    'groß', 'gross', 'klein', 'neu', 'alt', 'lang', 'kurz',
    'gut', 'schlecht', 'schön', 'hoch', 'tief', 'warm', 'kalt',
    'voll', 'leer', 'jung', 'stark', 'schwach', 'schnell', 'langsam',
    'hell', 'dunkel', 'laut', 'leise', 'hart', 'weich',
    // Language adjectives
    'deutsch', 'englisch', 'französisch', 'spanisch', 'norwegisch',
    'schwedisch', 'dänisch', 'russisch', 'chinesisch', 'japanisch',
  ]);

  // du-Imperativ bare stems that are NOT in vocab.verbInfinitive (the
  // conjugation tables only include present/past/participle — imperatives are
  // absent). These stems happen to also be the left-half of common compounds.
  // "fahr" is the du-Imperativ of "fahren" AND the left-half of "Fahrrad",
  // "Fahrplan", "Fahrbahn", etc.
  const DE_VERB_IMPERATIV_OVERLAPS = new Set([
    'fahr',   // fahren — "Fahr Rad!", "Fahr Plan!", "Fahr Bahn!"
    'geh',    // gehen  — "Geh weg!" (go away); also left-half of "Gehweg"
    'kauf',   // kaufen — "Kauf Haus!" (buy a house)
  ]);

  // Verb infinitives that also appear as compound right-halves. vocab.verbInfinitive
  // maps conjugated → infinitive but does NOT include the infinitive itself as a key
  // (e.g. "essen" is not a key — "esse", "isst", "aß" are). These need separate
  // detection to avoid the FP: "Am Abend essen wir" → "Abendessen".
  // When the right token is lowercase AND matches one of these infinitives, it is
  // unambiguously a verb (German nouns are always uppercase).
  const DE_VERB_INFINITIVE_OVERLAPS = new Set([
    'essen',  // Abendessen, Mittagessen — "Am Abend essen wir" is never sarskriving
  ]);

  // Pairs where the sentence-start ambiguity is high enough to warrant a HINT
  // instead of a hard error. "Fahr Rad" at sentence start is a natural
  // imperative ("Fahr Rad zur Schule!") AND the exact casing a student would
  // produce when splitting "Fahrrad". "Sucht Mittel" likewise ("Sucht Mittel
  // gegen die Kälte!" = ihr-Imperativ). Without this, both would be flagged
  // as hard errors at sentence start despite being valid German sentences.
  const HINT_PAIRS = new Set([
    'fahr|rad',     // "Fahr Rad!" vs. "Fahrrad" (bicycle)
    'sucht|mittel', // "Sucht Mittel!" (ihr-form: search for resources) vs. "Suchtmittel"
  ]);

  // German fuge-linker candidates in longest-first order.
  // Sonne+n+Schein, Kind+er+Garten, Arbeit+s+Platz, Buch+e+Regal variant.
  const FUGE_LINKERS = ['en', 'es', 'er', 'n', 's', 'e', ''];

  function check(ctx) {
    const { tokens, vocab, cursorPos, suppressed, lang } = ctx;
    if (lang !== 'de') return [];
    const compoundNouns = vocab.compoundNouns || new Set();
    const nonCompoundPairs = vocab.nonCompoundPairs || new Set();
    // verbInfinitive maps conjugated form → infinitive ('sucht' → 'suchen').
    // Used to detect 3sg / 2sg / plural verb forms mid-sentence so that
    // "er sucht Mittel" (verb + object) isn't flagged as "Suchtmittel".
    const verbInfinitive = vocab.verbInfinitive || new Map();
    const out = [];
    const sourceText = ctx.text || '';

    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const prev = tokens[i - 1];
      if (!prev) continue;
      if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
      if (suppressed && (suppressed.has(i) || suppressed.has(i - 1))) continue;

      // Never merge across clause-boundary punctuation
      if (sourceText) {
        const gap = sourceText.slice(prev.end, t.start);
        if (/[,;:!?.—–\n\r]/.test(gap)) continue;
      }

      // Curated denylist — pairs where capitalization cannot disambiguate.
      // geh|weg: "Geh weg!" (go away) uses "weg" as a lowercase direction
      // particle, so the noun-uppercase guard fails; both readings use the
      // same token sequence and casing.
      if (nonCompoundPairs.has(prev.word + '|' + t.word)) continue;

      if (
        prev.word.length >= 2 && t.word.length >= 2 &&
        !SARSKRIVING_BLOCKLIST_DE.has(prev.word) &&
        !SARSKRIVING_BLOCKLIST_DE.has(t.word)
      ) {
        // Try German fuge-linker variants. Most common is zero linker
        // (Spielplatz = Spiel+Platz), but -n-, -en-, -s-, -es-, -er-, -e-
        // all occur in the nounbank.
        let canonical = null;
        for (const linker of FUGE_LINKERS) {
          const candidate = prev.word + linker + t.word;
          if (compoundNouns.has(candidate)) {
            canonical = { joined: candidate, linker };
            break;
          }
        }
        if (!canonical) continue;

        // Casing-based disambiguation using German's mandatory noun
        // capitalisation rule. `prev.display` and `t.display` preserve
        // original casing; `prev.word` / `t.word` are tokeniser-lowercased.
        const prevDisplay = prev.display || sourceText.slice(prev.start, prev.end) || prev.word;
        const tDisplay    = t.display    || sourceText.slice(t.start, t.end)       || t.word;
        const prevIsLower = prevDisplay.length > 0 &&
                            prevDisplay[0] === prevDisplay[0].toLowerCase() &&
                            prevDisplay[0] !== prevDisplay[0].toUpperCase();
        const tIsUpper    = tDisplay.length > 0 &&
                            tDisplay[0] === tDisplay[0].toUpperCase() &&
                            tDisplay[0] !== tDisplay[0].toLowerCase();

        // Verb detection: verbInfinitive covers conjugated forms ("sucht");
        // DE_VERB_IMPERATIV_OVERLAPS covers bare imperatives absent from tables;
        // DE_VERB_INFINITIVE_OVERLAPS covers infinitives like "essen" that share
        // form with compound right-halves.
        const prevIsVerbForm = verbInfinitive.has(prev.word) ||
                               DE_VERB_IMPERATIV_OVERLAPS.has(prev.word) ||
                               DE_VERB_INFINITIVE_OVERLAPS.has(prev.word);
        const tIsVerbForm = verbInfinitive.has(t.word) ||
                            DE_VERB_INFINITIVE_OVERLAPS.has(t.word);

        // Right token is lowercase + known verb form → it is functioning as a verb
        // in the clause, not as the right-half of a split compound noun.
        // "Am Abend essen wir" — "essen" lowercase = verb; not "Abendessen".
        if (!tIsUpper && tIsVerbForm) continue;

        // Left token is a known verb form AND right token is lowercase: the right
        // token cannot be a noun (German nouns are always uppercase) so this is
        // a verb+particle/adverb phrase, not a split compound.
        // "geh weg" (go away) — "weg" lowercase particle, not part of "Gehweg".
        // "Geh weg" (sentence start, both uppercase) is handled by Tier 1.
        if (prevIsVerbForm && !tIsUpper) continue;

        const pairKey = prev.word + '|' + t.word;

        // Tier 1: mid-sentence verb (lowercase) + noun (uppercase) → SUPPRESS.
        // A verb in mid-sentence position is correctly lowercase in German;
        // its object is correctly uppercase. "fahr Rad", "sucht Mittel" etc.
        if (prevIsLower && tIsUpper && prevIsVerbForm) continue;

        // Tier 2: sentence-start position (prev uppercase) + noun uppercase
        // + known natural imperative pair → HINT.
        // At sentence start both words are uppercase — the verb because it
        // opens the sentence, the noun by the capitalisation rule. We can't
        // be certain without wider context.
        if (!prevIsLower && tIsUpper && prevIsVerbForm && HINT_PAIRS.has(pairKey)) {
          const fixDisplay = prevDisplay + canonical.linker + tDisplay.toLowerCase();
          out.push({
            rule_id: 'sarskriving_de_hint',
            priority: 30,
            start: prev.start,
            end: t.end,
            original: `${prevDisplay} ${tDisplay}`,
            fix: fixDisplay,
            message: `Mögl. Zusammenschreibung: „${prevDisplay} ${tDisplay}" → „${fixDisplay}"?`,
          });
          continue;
        }

        // Tier 3: hard error — noun is lowercase (German nouns must be
        // capitalised), or noun+noun split with no natural imperative reading.
        const fixDisplay = prevDisplay + canonical.linker + tDisplay.toLowerCase();
        out.push({
          rule_id: 'sarskriving_de',
          priority: 30,
          start: prev.start,
          end: t.end,
          original: `${prevDisplay} ${tDisplay}`,
          fix: fixDisplay,
          message: `Zusammenschreibung: „${prevDisplay} ${tDisplay}" → „${fixDisplay}"`,
        });
      }
    }
    return out;
  }

  // ── Main rule: hard errors ────────────────────────────────────────────────
  const ruleMain = {
    id: 'sarskriving_de',
    languages: ['de'],
    priority: 30,
    severity: 'error',
    exam: {
      safe: true,
      reason: 'Lookup-shaped grammar rule — Getrenntschreibung detection; single-token rejoin suggestion; same exam-risk class as nb-sarskriving',
      category: 'spellcheck',
    },
    explain: (finding) => {
      if (!finding || !finding.original || !finding.fix) {
        return {
          nb: 'To ord som kanskje hører sammen.',
          nn: 'To ord som kanskje høyrer saman.',
        };
      }
      const orig = escapeHtml(finding.original);
      const fix  = escapeHtml(finding.fix);
      return {
        nb: `<em>${orig}</em> skrives kanskje som ett ord: <em>${fix}</em>.`,
        nn: `<em>${orig}</em> skrivast kanskje som eitt ord: <em>${fix}</em>.`,
        en: `<em>${orig}</em> might be written as one word: <em>${fix}</em>.`,
      };
    },
    check,
  };

  // ── Hint rule: ambiguous imperative + noun at sentence start ─────────────
  // check() returns [] — findings are emitted by ruleMain with
  // rule_id: 'sarskriving_de_hint'. This object exists only so the
  // explain-contract gate can validate the hint explain independently.
  const ruleHint = {
    id: 'sarskriving_de_hint',
    languages: ['de'],
    priority: 30,
    severity: 'hint',
    exam: {
      safe: true,
      reason: 'Soft compound hint with pedagogy explain — user decides; same risk class as sarskriving-tentative',
      category: 'spellcheck',
    },
    explain: (finding) => {
      const orig = finding && finding.original ? escapeHtml(finding.original) : '…';
      const fix  = finding && finding.fix      ? escapeHtml(finding.fix)      : '…';
      return {
        nb: `<strong>Vær forsiktig:</strong> «${orig}» kan enten være et sammensatt substantiv (<em>${fix}</em>) eller en korrekt imperativsetning.<br><br>Mener du <em>kjøretøyet / tingen</em>? Skriv <em>${fix}</em> som ett ord. Mener du en ordre eller oppfordring? Da er «${orig}» riktig.`,
        nn: `<strong>Ver forsiktig:</strong> «${orig}» kan anten vere eit samansett substantiv (<em>${fix}</em>) eller ein korrekt imperativsetning.<br><br>Meiner du <em>kjøretøyet / tingen</em>? Skriv <em>${fix}</em> som eitt ord. Meiner du ein ordre eller oppmoding? Då er «${orig}» riktig.`,
        en: `<strong>Careful:</strong> "${orig}" could be a compound noun (<em>${fix}</em>) or a correct imperative sentence.<br><br>Do you mean <em>the object/thing</em>? Write <em>${fix}</em> as one word. Do you mean a command or request? Then "${orig}" is correct.`,
      };
    },
    check() { return []; },
  };

  host.__lexiSpellRules.push(ruleMain);
  host.__lexiSpellRules.push(ruleHint);
  if (typeof module !== 'undefined' && module.exports) module.exports = ruleMain;
})();
