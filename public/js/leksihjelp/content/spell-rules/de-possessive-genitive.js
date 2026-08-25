/**
 * Spell-check rule: German possessive pronoun in wrong case after a noun (priority 28).
 *
 * Detects the pattern: [uppercase-noun] [poss-nominative] [uppercase-noun]
 * e.g. "Das Auto meine Mutter" — "meine" is nominative but genitive is required.
 *
 * Only nominative/accusative base forms (mein, meine, dein, etc.) are flagged.
 * Genitive forms (meines, meiner, …) and dative forms (meinem, …) are left alone.
 *
 * Severity: hint — offers the "von + dative" alternative as the simplest fix,
 * and mentions the genitive form in the explain text.
 *
 * Rule ID: 'de-possessive-genitive'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Nominative/accusative base forms that are wrong as attributive possessives
  // after a noun. token.word is always lowercase (the tokenizer lowercases).
  // Genitive (meines/meiner) and dative (meinem/meiner) forms are intentionally
  // absent — they may be correct and must not trigger this rule.
  const POSS_NOM = new Map([
    ['mein',   { gen_mn: 'meines', gen_f: 'meiner', dat_mn: 'meinem', dat_f: 'meiner' }],
    ['meine',  { gen_mn: 'meines', gen_f: 'meiner', dat_mn: 'meinem', dat_f: 'meiner' }],
    ['dein',   { gen_mn: 'deines', gen_f: 'deiner', dat_mn: 'deinem', dat_f: 'deiner' }],
    ['deine',  { gen_mn: 'deines', gen_f: 'deiner', dat_mn: 'deinem', dat_f: 'deiner' }],
    ['sein',   { gen_mn: 'seines', gen_f: 'seiner', dat_mn: 'seinem', dat_f: 'seiner' }],
    ['seine',  { gen_mn: 'seines', gen_f: 'seiner', dat_mn: 'seinem', dat_f: 'seiner' }],
    ['ihr',    { gen_mn: 'ihres',  gen_f: 'ihrer',  dat_mn: 'ihrem',  dat_f: 'ihrer'  }],
    ['ihre',   { gen_mn: 'ihres',  gen_f: 'ihrer',  dat_mn: 'ihrem',  dat_f: 'ihrer'  }],
    ['unser',  { gen_mn: 'unseres', gen_f: 'unserer', dat_mn: 'unserem', dat_f: 'unserer' }],
    ['unsere', { gen_mn: 'unseres', gen_f: 'unserer', dat_mn: 'unserem', dat_f: 'unserer' }],
    ['euer',   { gen_mn: 'eures',  gen_f: 'eurer',  dat_mn: 'eurem',  dat_f: 'eurer'  }],
    ['eure',   { gen_mn: 'eures',  gen_f: 'eurer',  dat_mn: 'eurem',  dat_f: 'eurer'  }],
  ]);

  // Temporal/locative nouns that commonly head time adverbials ("heute Abend",
  // "am Morgen", "jeden Tag") and are therefore NOT the head of a genitive NP.
  // "Abend meine Hausaufgaben" fires the [noun][poss][noun] pattern but here
  // "Abend" is the tail of "heute Abend" and "meine" is the determiner of
  // "Hausaufgaben" — two separate constituents, not a genitive construction.
  const TEMPORAL_NOUNS = new Set([
    'abend', 'morgen', 'mittag', 'nacht', 'nachmittag', 'vormittag',
    'tag', 'tage', 'woche', 'monat', 'monate', 'jahr', 'jahre',
    'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag',
    'januar', 'februar', 'märz', 'april', 'mai', 'juni',
    'juli', 'august', 'september', 'oktober', 'november', 'dezember',
    'uhr', 'stunde', 'minute', 'moment', 'zeitpunkt',
  ]);

  // Finite copula / auxiliary / modal forms (sein/haben/werden/modals are
  // irregular and may be absent from the conjugated-form → infinitive map).
  const FINITE_VERB = new Set([
    'ist', 'sind', 'bist', 'bin', 'seid', 'war', 'waren', 'warst', 'wart',
    'hat', 'habe', 'hast', 'haben', 'habt', 'hatte', 'hatten', 'hattest',
    'wird', 'werden', 'wirst', 'werde', 'werdet', 'wurde', 'wurden',
    'kann', 'kannst', 'können', 'könnt', 'konnte', 'konnten',
    'muss', 'musst', 'müssen', 'müsst', 'musste', 'mussten',
    'will', 'willst', 'wollen', 'wollt', 'wollte', 'wollten',
    'soll', 'sollst', 'sollen', 'sollt', 'sollte', 'sollten',
    'mag', 'magst', 'mögen', 'darf', 'darfst', 'dürfen', 'dürft',
  ]);

  // Determiners that head the possessed NP in the target error shape
  // "[Det Noun] [nom-poss Noun]" ("Das Auto meine Mutter"). Requiring one
  // before the head noun narrows the rule to that canonical construction and
  // excludes bare-subject relative clauses ("… bei denen Schüler ihre Kulturen
  // präsentieren" — Schüler has no determiner, it's the clause subject).
  const DETERMINERS = new Set([
    'der', 'die', 'das', 'den', 'dem', 'des',
    'ein', 'eine', 'einen', 'einem', 'eines', 'einer',
    'dieser', 'diese', 'dieses', 'diesen', 'diesem',
    'jener', 'jene', 'jenes', 'jenen', 'jenem',
    'welcher', 'welche', 'welches', 'welchen', 'welchem',
  ]);

  const rule = {
    id: 'de-possessive-genitive',
    languages: ['de'],
    priority: 28,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Grammar hint — possessive case suggestion; not spellcheck',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      if (!finding || !finding.original) {
        return {
          nb: 'Possessivpronomen i feil kasus etter substantiv.',
          nn: 'Possessivpronomen i feil kasus etter substantiv.',
          en: 'Possessive pronoun in wrong case after a noun.',
        };
      }
      const orig = esc(finding.original);
      const genF = finding.genFix ? `<em>${esc(finding.genFix)}</em>` : null;
      const vonF = finding.vonFix ? `<em>${esc(finding.vonFix)}</em>` : null;
      const altNb = genF && vonF ? `${genF} eller ${vonF}` : genF || vonF || 'en genitivform';
      const altNn = genF && vonF ? `${genF} eller ${vonF}` : genF || vonF || 'ein genitivform';
      const altEn = genF && vonF ? `${genF} or ${vonF}` : genF || vonF || 'a genitive form';
      return {
        nb: `<em>${orig}</em> er i nominativform — på tysk skal possessivpronomen stå i genitiv etter et substantiv. Prøv ${altNb}.`,
        nn: `<em>${orig}</em> er i nominativform — på tysk skal possessivpronomen stå i genitiv etter eit substantiv. Prøv ${altNn}.`,
        en: `<em>${orig}</em> is in nominative form — in German, possessive pronouns must be in the genitive case after a noun. Try ${altEn}.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const verbInf = vocab.verbInfinitive || new Map();
      const out = [];

      const isFiniteVerb = (w) => FINITE_VERB.has(w) || verbInf.has(w);

      for (let i = 1; i < tokens.length - 1; i++) {
        const t    = tokens[i];
        const prev = tokens[i - 1];
        const next = tokens[i + 1];

        if (cursorPos != null) {
          if (cursorPos >= t.start    && cursorPos <= t.end)    continue;
          if (cursorPos >= prev.start && cursorPos <= prev.end) continue;
          if (cursorPos >= next.start && cursorPos <= next.end) continue;
        }

        const poss = POSS_NOM.get(t.word);
        if (!poss) continue;

        // Left token must be an uppercase noun (German mandatory capitalisation)
        const prevIsUpper = prev.display &&
          prev.display[0] === prev.display[0].toUpperCase() &&
          prev.display[0] !== prev.display[0].toLowerCase();
        if (!prevIsUpper) continue;

        // …and it must actually BE a noun, not merely capitalised. Sentence-
        // initial verbs and prepositions are capitalised too ("Buchstabiere
        // dein Name", "Vergiss deine Badesachen", "Für ihre Leistungen") — the
        // bare prevIsUpper check misread them as the head of a genitive NP.
        // Exact noun-lexicon membership only: the compound-suffix fallback the
        // fix generator uses for `next` false-matches noun substrings inside
        // verbs ("buchstabiere" → "biere"/Bier), so it is NOT used here.
        if (!nounGenus.has(prev.word)) continue;

        // prev and the possessive must be in the SAME clause. A sentence- or
        // clause-boundary in the raw gap means prev belongs to a different
        // constituent ("Ich habe Pech! Mein Fahrrad …"; "den Schülern, ihr
        // Handy …") — not a genitive NP.
        const gapPrev = ctx.text ? ctx.text.slice(prev.end, t.start) : ' ';
        if (/[,;:.!?…()„“”"–—]/.test(gapPrev)) continue;

        // German V2: if a finite verb precedes prev within this clause, prev is
        // the POST-VERBAL SUBJECT and [poss][next] is the verb's object, not a
        // genitive of prev ("Hat der Lehrer deine E-Mail…", "zerstört der Junge
        // sein Spielzeug", "küsst die Mutter ihr Kind"). The genuine genitive
        // error ("Das Auto meine Mutter ist blau") has NO finite verb before
        // the head noun. Scan back to the clause boundary.
        let hasFiniteVerbBefore = false;
        for (let b = i - 1; b >= 0; b--) {
          if (b < i - 1) {
            const g = ctx.text ? ctx.text.slice(tokens[b].end, tokens[b + 1].start) : ' ';
            if (/[,;:.!?…]/.test(g)) break; // clause boundary — stop scanning
          }
          if (isFiniteVerb(tokens[b].word)) { hasFiniteVerbBefore = true; break; }
        }
        if (hasFiniteVerbBefore) continue;

        // The head noun must be introduced by a determiner ("Das Auto …") — the
        // canonical genitive-error shape. Excludes bare-subject clauses.
        if (!(i >= 2 && DETERMINERS.has(tokens[i - 2].word))) continue;

        // An infinitival "zu + Infinitiv" later in the clause means [prev] and
        // [poss next] are both objects of that infinitive, not a genitive NP
        // ("… dem Chef ihre Meinung zu sagen"). Skip.
        let hasZuInfinitiveAfter = false;
        for (let a = i + 2; a < tokens.length - 1; a++) {
          const g = ctx.text ? ctx.text.slice(tokens[a - 1].end, tokens[a].start) : ' ';
          if (/[,;:.!?…]/.test(g)) break; // clause boundary
          if (tokens[a].word === 'zu') {
            const vb = tokens[a + 1] && tokens[a + 1].word;
            if (vb && /(?:en|ln|rn)$/.test(vb)) { hasZuInfinitiveAfter = true; break; }
          }
        }
        if (hasZuInfinitiveAfter) continue;

        // Skip when prev is a temporal/locative noun — it's the tail of a time
        // adverbial ("heute Abend", "am Morgen") and the possessive is a
        // determiner of the next noun, not a genitive marker of prev.
        if (TEMPORAL_NOUNS.has(prev.word)) continue;

        // Right token must be an uppercase noun
        const nextIsUpper = next.display &&
          next.display[0] === next.display[0].toUpperCase() &&
          next.display[0] !== next.display[0].toLowerCase();
        if (!nextIsUpper) continue;

        // Look up the genus of the right-side noun for fix generation.
        // Fall back to compound-suffix scan (e.g. "Lieblingsserie" → "serie" → 'f').
        let genus = nounGenus.get(next.word);
        if (!genus && next.word.length >= 6) {
          for (let cut = next.word.length - 3; cut >= 3; cut--) {
            const g = nounGenus.get(next.word.slice(cut));
            if (g) { genus = g; break; }
          }
        }

        let vonFix = null;
        let genFix = null;
        if (genus) {
          const datForm = genus === 'f' ? poss.dat_f : poss.dat_mn;
          vonFix = `von ${datForm} ${next.display}`;
          if (genus === 'f') {
            genFix = `${poss.gen_f} ${next.display}`;
          } else {
            // Masculine/neuter genitive: possessive + noun + -s (-es after sibilants)
            const last = next.word[next.word.length - 1];
            const nounGs = ['s', 'ß', 'x', 'z'].includes(last)
              ? next.display + 'es'
              : next.display + 's';
            genFix = `${poss.gen_mn} ${nounGs}`;
          }
        }

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: t.start,
          end: next.end,
          original: t.display + ' ' + next.display,
          fix: vonFix,
          vonFix,
          genFix,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
