/**
 * Spell-check rule: German noun capitalization (priority 20).
 *
 * German nouns must always start with a capital letter. This rule flags
 * tokens found in the nounGenus index that start with a lowercase letter.
 *
 * Rule ID: 'de-capitalization'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Idiomatic predicate-noun phrases where lowercase is also accepted.
  // "recht haben" (be right), "angst haben" (be afraid), "schuld sein" (be
  // at fault), "leid tun" (feel sorry) are conventional fixed expressions
  // — flagging them disrupts students. Both lowercase and capitalized are
  // valid post-2006 reform. The auxiliary verb (haben/sein/tun) typically
  // appears immediately before the noun in main clauses ("Du hast recht")
  // and after it in subordinate clauses ("dass sie recht hat").
  // Full sein paradigm incl. Konjunktiv I/II — "schuld/recht/klasse" sein is
  // valid in "Er WÄRE schuld", "Das SEI recht", not just the indicative.
  const SEIN_FORMS = ['sein', 'bin', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart',
    'wäre', 'wärst', 'wärest', 'wären', 'wäret', 'sei', 'seist', 'seien', 'seiet', 'gewesen'];
  const HABEN_FORMS = ['haben', 'hat', 'hatte', 'hatten', 'hattest', 'hattet', 'hast', 'habt', 'habe',
    'hätte', 'hätten', 'hättest', 'hättet'];
  const IDIOM_NOUN_PARTNERS = {
    // "recht haben" AND "jdm recht sein" ("Das ist/wäre mir recht") are both valid.
    recht:  new Set([...HABEN_FORMS, ...SEIN_FORMS]),
    angst:  new Set(HABEN_FORMS),
    schuld: new Set(SEIN_FORMS),
    leid:   new Set(['tun', 'tut', 'tat', 'taten', ...SEIN_FORMS]),  // "leid tun" + "es ist mir leid"
    klasse: new Set(SEIN_FORMS),                                      // colloquial "Das ist klasse"
  };
  // One pronoun may sit between the copula/licensing verb and the predicate word:
  // a dative experiencer ("Das wäre MIR recht", "Es tut DIR leid") or an inverted
  // subject ("Vielleicht sei ER schuld"). Safe to skip past — these idiom words
  // are predicate ADJECTIVES, never predicate nouns, so this never hides a real
  // "ist er lehrer"-style miscapitalization (lehrer isn't an idiom partner).
  const COPULA_GAP_PRONOUNS = new Set([
    'mir', 'dir', 'ihm', 'ihr', 'uns', 'euch', 'ihnen',          // dative experiencers
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'man',                // inverted subjects
  ]);
  // Short intensifiers/adverbs that can sit between the copula and the predicate
  // word: "wäre er SELBST schuld", "ist wohl recht", "tut mir auch leid".
  const COPULA_GAP_ADVERBS = new Set([
    'selbst', 'selber', 'wohl', 'auch', 'nicht', 'wirklich', 'ja', 'schon', 'eben', 'halt', 'vielleicht',
  ]);

  // F47-2 (v3.0.40): closed set of lowercase time/weekday adverbs. The
  // forms `morgens`, `abends`, `samstags`, etc. are adverbs derived from
  // the masculine noun + genitive -s. They look like nouns to the cap rule
  // (the bare noun `Morgen`/`Samstag` is in nounGenus, and the -s/-gs
  // form ends up there too via plural / nounform seeding), but they're
  // grammatically adverbs and stay lowercase ("um acht Uhr morgens",
  // "samstags ist die Bibliothek geschlossen"). Pre-fix the cap rule
  // emitted `Morgens`, which is wrong direction (capital Morgens exists
  // only as part of "guten Morgens" — a noun-genitive form, not the
  // adverb the student wrote). Source: Duden adverb list + DWDS.
  // v3.0.119: determiners after which a noun reading is CERTAIN (a finite
  // verb can never directly follow these) — used to override the Track D
  // verb-homograph skip below.
  const DET_NOUN_CERTAIN = new Set([
    'der', 'dem', 'des', 'zur', 'zum', 'im', 'am', 'beim', 'vom', 'ins', 'ans',
    'einer', 'einem', 'eines',
    'meiner', 'meinem', 'deiner', 'deinem', 'seiner', 'seinem',
    'ihrer', 'ihrem', 'unserer', 'unserem', 'eurer', 'eurem',
  ]);

  // v3.0.119: prepositions colliding with declined noun forms in nounGenus.
  const DE_PREP_HOMOGRAPHS = new Set([
    'wegen', 'während', 'trotz', 'dank', 'kraft', 'mangels', 'mittels',
    'seitens', 'zwecks', 'angesichts', 'anstelle', 'aufgrund',
  ]);

  const DE_LOWERCASE_TIME_ADVERBS = new Set([
    'morgen', 'gestern', 'heute', 'vorgestern', 'übermorgen',
    'morgens', 'vormittags', 'mittags', 'nachmittags', 'abends', 'nachts',
    'montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags',
    'samstags', 'sonnabends', 'sonntags',
    'werktags', 'sonntäglich', 'anfangs',
  ]);

  // Spatial/manner/degree adverbs and separable-verb particles that are
  // homographs of nouns (der Weg / weg, das Fest / fest, die Mitte / mitten,
  // links / die Linke). They stay LOWERCASE — "nach links", "steht fest",
  // "ist weg", "mitten in der Stadt". Without this the cap rule read them as
  // the noun and suggested Links/Fest/Weg/Mitten.
  const DE_LOWERCASE_ADVERBS = new Set([
    'links', 'rechts', 'weg', 'fest', 'mitten', 'oben', 'unten', 'vorne',
    'vorn', 'hinten', 'drinnen', 'draußen', 'drüben', 'geradeaus', 'rückwärts',
    'vorwärts', 'seitwärts', 'aufwärts', 'abwärts', 'los', 'fort', 'her', 'hin',
    'quer', 'längs', 'ringsum', 'bergauf', 'bergab', 'stromabwärts',
  ]);

  // Wikipedia-corpus precision (D3, 2026-06-12): separable-verb particles
  // colliding with nouns. «nahmen an dem Turnier teil» put teil→Teil — but
  // teil here is the clause-final particle of teilnehmen. Mirror the
  // IDIOM_NOUN_PARTNERS pattern: skip when a finite form of the particle's
  // partner verb appears earlier in the sentence.
  const PARTICLE_VERB_PARTNERS = {
    teil:  new Set(['nehme', 'nimmst', 'nimmt', 'nehmen', 'nehmt', 'nahm', 'nahmst', 'nahmen', 'nahmt', 'nähme', 'nähmen']),
    statt: new Set(['finde', 'findest', 'findet', 'finden', 'fand', 'fandst', 'fanden', 'fändet', 'fände', 'fänden']),
    preis: new Set(['gebe', 'gibst', 'gibt', 'geben', 'gebt', 'gab', 'gabst', 'gaben', 'gabt']),
    acht:  new Set(['gebe', 'gibst', 'gibt', 'geben', 'gebt', 'gab', 'gabst', 'gaben', 'gabt']),
  };

  // D3: lowercase language adjectives in the parenthetical-gloss convention
  // «Backlash (deutsch „Gegenschlag“)», «Borowo (deutsch Borowo)». The
  // language NOUN (Deutsch) lives in nounGenus, but directly after «(» the
  // lowercase adjective is the established gloss idiom — never flag there.
  const DE_LANG_ADJECTIVES = new Set([
    'deutsch', 'englisch', 'französisch', 'spanisch', 'italienisch',
    'russisch', 'polnisch', 'türkisch', 'norwegisch', 'dänisch', 'schwedisch',
    'niederländisch', 'lateinisch', 'griechisch', 'arabisch', 'chinesisch',
    'japanisch', 'portugiesisch', 'tschechisch', 'ungarisch', 'finnisch',
  ]);

  const rule = {
    id: 'de-capitalization',
    languages: ['de'],
    priority: 20,
    exam: {
      safe: true,
      reason: "Token-level capitalization correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `<em>${escapeHtml(finding.original)}</em> er et substantiv. På tysk skal alle substantiv ha stor forbokstav — prøv <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `<em>${escapeHtml(finding.original)}</em> er eit substantiv. På tysk skal alle substantiv ha stor førebokstav — prøv <em>${escapeHtml(finding.fix)}</em>.`,
      en: `<em>${escapeHtml(finding.original)}</em> is a noun. In German, all nouns must be capitalized — try <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { text, tokens, vocab, cursorPos, suppressed } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const participleToAux = vocab.participleToAux || new Map();
      const verbForms = vocab.verbForms || new Map();       // keyed by infinitive
      const verbInf = vocab.verbInfinitive instanceof Map ? vocab.verbInfinitive : new Map(); // conjugated → inf
      const isAdjective = vocab.isAdjective || new Set();
      const out = [];

      // Track B (Phase 47): auxiliary forms that signal "this lowercase token is
      // probably a past participle, not a noun". Mirrors the lookup the
      // de-perfekt-aux rule does. Without this, "Ich habe gefahren ..." flags
      // gefahren→Gefahren (the plural of Gefahr) — wrong direction.
      const AUX_FORMS = new Set([
        'habe', 'hast', 'hat', 'haben', 'habt',
        'hatte', 'hattest', 'hatten', 'hattet',
        'bin', 'bist', 'ist', 'sind', 'seid',
        'war', 'warst', 'waren', 'wart',
        // D3 (2026-06-12): werden forms — the passive («wurde in den Kader
        // berufen») puts a participle clause-final exactly like the Perfekt,
        // and berufen→Berufen was flagged because the Track B lookback only
        // knew haben/sein.
        'werde', 'wirst', 'wird', 'werden', 'werdet',
        'wurde', 'wurdest', 'wurden', 'wurdet', 'worden',
      ]);

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        // Track B (Phase 47): if this token is also a known past participle
        // AND a haben/sein form appears earlier in the same sentence, treat
        // it as a participle (lowercase is correct) and skip.
        // v3.0.123: the lookback runs to the sentence start, not a fixed 6
        // tokens — the Satzklammer puts the participle clause-FINAL, so the
        // aux can sit arbitrarily far back ("Letzten Sommer bin ich mit
        // meiner Familie nach Deutschland gefahren" has 7 tokens between
        // bin and gefahren, and the old window flagged gefahren→Gefahren).
        if (participleToAux.has(t.word)) {
          let hasAux = false;
          for (let k = i - 1; k >= 0; k--) {
            const between = text ? text.slice(tokens[k].end, tokens[k + 1].start) : '';
            if (/[.!?]/.test(between)) break;
            if (AUX_FORMS.has(tokens[k].word)) { hasAux = true; break; }
          }
          // Subordinate clause is verb-final, so the auxiliary can FOLLOW the
          // participle ("…, weil er zu schnell gefahren ist"). Scan forward too.
          if (!hasAux) {
            for (let k = i + 1; k < tokens.length; k++) {
              const between = text ? text.slice(tokens[k - 1].end, tokens[k].start) : '';
              if (/[.!?]/.test(between)) break;
              if (AUX_FORMS.has(tokens[k].word)) { hasAux = true; break; }
            }
          }
          if (hasAux) continue;
        }

        // Track D (Phase 47): if this token is a known finite present-tense or
        // preteritum verb form (e.g. "spielen", "sehen", "geht"), skip the
        // capitalization flag. The DE noun-form emission via dative plural
        // ("den Spielen", "den Sehen") populates nounGenus with the same
        // lowercased string the verb uses, so a lowercase finite verb mid-
        // sentence reads as a noun under the cap rule's nounGenus lookup.
        // Trade-off: substantivized infinitive examples ("Beim essen reden
        // wir nicht") no longer flag from this rule; verb-position FPs are
        // far worse for student writing than missed substantivized infinitives.
        const knownPresens = vocab.knownPresens || new Set();
        const knownPreteritum = vocab.knownPreteritum || new Set();
        // v3.0.119: determiner override for the verb-homograph skip. After an
        // unambiguous determiner a finite verb cannot appear, so the noun
        // reading is certain — "in der nähe" must flag nähe→Nähe even though
        // "nähe" is also 1sg of nähen (same for liebe/frage/reise). die/das/
        // den stay OUT of the set: they double as demonstrative pronouns
        // directly before real verbs ("die essen viel", "den nehme ich").
        const detPrev = tokens[i - 1] && DET_NOUN_CERTAIN.has(tokens[i - 1].word);
        // Track D + F: verb forms — finite (knownPresens/Preteritum), infinitive
        // (verbForms is keyed by infinitive: anrufen, beweisen, erfolgen,
        // trauern, lagern), and any other conjugated form the lexicon maps to an
        // infinitive (verbInf keys, e.g. "tat"→tun). A determiner-certain noun
        // context ("zum Anrufen") overrides — then the noun reading is sure.
        if (!detPrev && (knownPresens.has(t.word) || knownPreteritum.has(t.word)
            || verbForms.has(t.word) || verbInf.has(t.word))) continue;

        // Spatial/manner/degree adverbs & separable particles (links, weg, fest,
        // mitten …) — noun homographs that stay lowercase. Determiner-certain
        // context still flags a genuine noun ("der Weg", "das Fest").
        if (!detPrev && DE_LOWERCASE_ADVERBS.has(t.word)) continue;

        // Adjectives stay lowercase — attributive ("meiner alten Schulfreundin",
        // even after a determiner) and predicate ("ist orange"). Declined forms
        // absent from the set are caught by stripping a declension ending onto a
        // known adjective ("orangen" → orange). Substantivized adjectives (das
        // Gute) are the rare exception: flagged only in determiner-certain
        // context with no following noun.
        let isAdj = isAdjective.has(t.word);
        if (!isAdj && t.word.length >= 5) {
          for (const suf of ['en', 'em', 'er', 'es', 'e', 'n']) {
            if (t.word.endsWith(suf) && isAdjective.has(t.word.slice(0, -suf.length))) { isAdj = true; break; }
          }
        }
        if (isAdj) {
          const nx = tokens[i + 1];
          // A capitalized word after an adjective is the head noun (German caps
          // all nouns), even compounds absent from nounGenus ("alten
          // Schulfreundin"). Attributive → skip. Predicate/general (no preceding
          // determiner) → skip. Only a substantivized adjective in a
          // determiner-certain slot with no following noun stays flaggable.
          const nextIsNoun = nx && /^\p{Lu}/u.test(nx.display);
          if (nextIsNoun || !detPrev) continue;
        }

        // v3.0.119: preposition homographs of DECLINED noun forms. The seam
        // generates dative plurals into nounGenus ("den Wegen" → 'wegen' m),
        // so the preposition "wegen" reads as a lowercase noun. These are
        // overwhelmingly prepositions in student text — never flag.
        if (DE_PREP_HOMOGRAPHS.has(t.word)) continue;

        // F47-2 (v3.0.40): suppress lowercase time/weekday adverbs (morgens,
        // samstags, abends, …). They surface in nounGenus because the base
        // noun form is German, but the -s/-gs suffix shape is a fixed
        // adverbial idiom that stays lowercase by orthographic convention.
        if (DE_LOWERCASE_TIME_ADVERBS.has(t.word)) continue;

        // If it's in the noun dictionary and starts with a lowercase letter
        if (nounGenus.has(t.word)) {
          // Skip idiomatic predicate-noun phrases where lowercase is conventional.
          const partners = IDIOM_NOUN_PARTNERS[t.word];
          if (partners) {
            const prev = tokens[i - 1];
            const next = tokens[i + 1];
            if ((prev && partners.has(prev.word)) || (next && partners.has(next.word))) continue;
            // The licensing verb can sit a couple of tokens back, past a pronoun
            // and/or a short intensifier/adverb: "Das wäre MIR recht", "Vielleicht
            // wäre er SELBST schuld", "Es tut dir leid". Scan back up to 3 tokens
            // over allowed gap-fillers (pronouns + selbst/wohl/auch/nicht/…) for
            // a partner verb.
            let found = false;
            for (let k = i - 1; k >= Math.max(0, i - 3); k--) {
              if (partners.has(tokens[k].word)) { found = true; break; }
              if (!COPULA_GAP_PRONOUNS.has(tokens[k].word) && !COPULA_GAP_ADVERBS.has(tokens[k].word)) break;
            }
            if (found) continue;
          }

          // D3 (2026-06-12): hyphen-continuation compounds — «Fußballspieler
          // und -trainer» tokenizes the continuation as a bare lowercase
          // noun, but the leading hyphen marks it as a compound tail that
          // (correctly) inherits no capital. Skip when the char immediately
          // before the token is a hyphen.
          if (text && t.start > 0 && text[t.start - 1] === '-') continue;

          // D3: separable-verb particle at clause end — skip when the
          // partner verb's finite form appears earlier in the sentence
          // («nahmen an dem Turnier teil»). Same lookback shape as Track B.
          const particlePartners = PARTICLE_VERB_PARTNERS[t.word];
          if (particlePartners) {
            let hasPartner = false;
            for (let k = i - 1; k >= 0; k--) {
              const between = text ? text.slice(tokens[k].end, tokens[k + 1].start) : '';
              if (/[.!?]/.test(between)) break;
              if (particlePartners.has(tokens[k].word)) { hasPartner = true; break; }
            }
            if (hasPartner) continue;
          }

          // D3: parenthetical language gloss — «(deutsch „Gegenschlag“)».
          if (DE_LANG_ADJECTIVES.has(t.word)) {
            const before = text ? text.slice(0, t.start).trimEnd() : '';
            if (before.endsWith('(')) continue;
          }

          // D3: attributive adjective before a known capitalized noun —
          // «der namentlich bekannte Graf». A lowercase nounGenus homograph
          // directly followed by a capitalized known noun is reading as the
          // ADJECTIVE, not the noun (bekannte = Bekannte homograph). Real
          // student miscapitalizations («der deutsche lehrer») keep firing
          // on the lowercase noun itself.
          const nextTok = tokens[i + 1];
          if (nextTok && /^\p{Lu}/u.test(nextTok.display) && nounGenus.has(nextTok.word)) continue;

          // Track E: bare du-imperative homographs. "Bitte spiel mit mir." — spiel
          // is the imperative of spielen, not the noun Spiel. The bare du-imperative
          // = du-present minus -st ("spielst" → "spiel"), which Track D doesn't
          // cover (Track D only checks knownPresens forms, not stems). Guard on
          // common imperative softeners (bitte/mal/doch/…) to avoid suppressing
          // genuine noun miscapitalizations like "das spiel".
          const IMPERATIVE_SOFTENERS = new Set([
            'bitte', 'mal', 'doch', 'ruhig', 'endlich', 'nur', 'also', 'bitte mal',
          ]);
          const prevW = tokens[i - 1] && tokens[i - 1].word;
          if (
            IMPERATIVE_SOFTENERS.has(prevW) &&
            (knownPresens.has(t.word + 'st') || knownPresens.has(t.word + 'est'))
          ) continue;

          const firstChar = t.display[0];
          if (firstChar && firstChar === firstChar.toLowerCase() && firstChar !== firstChar.toUpperCase()) {
            const capitalized = t.display[0].toUpperCase() + t.display.slice(1);
            out.push({
              rule_id: 'de-capitalization',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: capitalized,
              message: `Stor forbokstav: "${t.display}" → "${capitalized}"`,
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
