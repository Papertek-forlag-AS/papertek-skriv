/**
 * Spell-check rule: NN noun-form leakage detection (priority 39).
 *
 * Flags NB-only definite noun forms (singular OR plural) used in an NN
 * document. Two detection paths:
 *
 *  1. Confident map path (covers boken→boka, døren→døra, læreren→læraren,
 *     and definite plurals like abonnementene→abonnementa): token is in
 *     vocab.nbToNnNouns with field 'bestemt_entall' / 'bestemt_flertall'
 *     AND the NN form differs from the typed form. Fires with auto-fix.
 *
 *  2. Suffix fallback (catches NB-only plurals outside the map): token
 *     ends in a typical NB definite-plural suffix (-ene/-erne/-enne) that
 *     differs in NN (-ane/-arane). Fires without auto-fix.
 *
 * Complements dialect-mix (priority 35) which handles a curated set of
 * high-confidence cross-dialect pairs. Skips words already covered there.
 *
 * Rule ID: 'nn-plural-leakage' — preserved for back-compat with the
 * pedagogy entry in papertek-vocabulary's NB-side learn-more bank (the
 * rule_id is the lookup key). Scope is now noun-form leakage in general.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // NB definite-plural suffixes that differ from NN (-ane/-ene split)
  const NB_PLURAL_RE = /(?:ene|erne|enne)$/;

  // Avoid double-flagging with dialect-mix rule — NB side of the curated map.
  // Keep in sync with nb-dialect-mix.js NB_TO_NN keys.
  const DIALECT_MIX_NB_KEYS = new Set([
    'jeg', 'hun', 'de', 'dere', 'ikke', 'bare', 'noen', 'noe', 'mye',
    'hva', 'hvor', 'hvordan', 'hvem', 'hvorfor', 'være', 'vært', 'ble',
    'mente', 'mener', 'mene', 'høre', 'hører', 'hørt', 'sier', 'vet',
    'bytt', 'hjem', 'hjemme', 'nå', 'sammen', 'gjør', 'gjøre', 'fikk',
  ]);

  // A capital that opens a sentence is just an ordinary word wearing a
  // capital; anywhere else it is a name. Quotes and brackets count as
  // sentence-opening material («Foreldra ...», "Bilane ...").
  function isSentenceInitial(text, startPos) {
    if (!text) return true;             // no text in ctx — assume the safe reading
    const before = text.slice(0, startPos).replace(/[\s«»"'“”‘’(\[]+$/u, '');
    return before === '' || /[.!?:\n…]$/.test(before);
  }

  const rule = {
    id: 'nn-plural-leakage',
    languages: ['nn'],
    priority: 39,
    severity: 'warning',
    exam: {
      safe: true,
      reason: "Cross-language noun-form lookup; single-token; same class as dialect-mix",
      category: "grammar-lookup",
    },
    explain: (finding) => {
      const msg = `<em>${escapeHtml(finding.original)}</em> er bokmålsform — bruk nynorskforma.`;
      return { nb: msg, nn: msg };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang, suppressed } = ctx;
      if (lang !== 'nn') return [];

      // Curated (lexicon-only) accept-set, NOT the Ordbank-merged validWords:
      // the permissive Ordbank list carries NB-leaning sideforms that would
      // silence genuine leakage (e.g. "bilene", "skolen").
      const nnValid = vocab.curatedValidWords || vocab.validWords || new Set();
      const sisterValid = vocab.sisterValidWords || new Set();
      const nbToNnNouns = vocab.nbToNnNouns || new Map();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        // Valid NN word — nothing to flag
        if (nnValid.has(t.word)) continue;

        // Not valid in NB either — not a leakage, probably a typo
        if (!sisterValid.has(t.word)) continue;

        // Already covered by dialect-mix curated map
        if (DIALECT_MIX_NB_KEYS.has(t.word)) continue;

        // Proper nouns are names, not noun-form leakage: «Strømmen» the
        // place («fødd på Strømmen»), «Notre Dame-skolen» the school. A
        // name keeps its own spelling regardless of which standard the
        // text is written in. Only mid-sentence capitals count — a
        // sentence-initial «Foreldrene» is an ordinary word and must
        // still be flagged.
        if (/^\p{Lu}/u.test(t.display) && !isSentenceInitial(ctx.text, t.start)) continue;
        // Second element of a hyphenated name («Notre Dame-skolen»): the
        // token itself is lowercase, so the capital sits on the element
        // before the hyphen.
        const prevTok = tokens[i - 1];
        if (prevTok && ctx.text &&
            ctx.text.slice(prevTok.end, t.start) === '-' &&
            /^\p{Lu}/u.test(prevTok.display)) continue;

        // Goal-loop 2 (2026-06-12): gang/gong homograph. The nbToNnNouns
        // cross-mapping carries gang→gong (the OCCASION sense), but «gang»
        // (hallway/corridor, m) is normert NN per Ordbank and ordbokene —
        // «skulesekken står i gangen» was FP-flagged →gongen. Flag the
        // gang-forms only in occasion contexts (preceded by an ordinal/
        // quantifier determiner: «denne gangen» → gongen); the locative
        // hallway reading («i gangen») stays silent.
        if (t.word === 'gangen' || t.word === 'gangar' || t.word === 'gangane') {
          const prev = tokens[i - 1];
          const OCCASION_DETS = new Set(['denne', 'førre', 'kvar', 'første', 'fyrste', 'siste', 'neste', 'andre', 'tredje', 'éin', 'ein']);
          if (!prev || !OCCASION_DETS.has(prev.word)) continue;
        }

        // Genus-aware acceptance (Ordbank sweep 2026-07, adjudicated against
        // the official Nynorskordboka API):
        // - FEMININE bestemt flertall is -ene in NN («utgiftene», «årene»,
        //   «redslene», «høgtidene» are standard; only MASCULINE -ene is
        //   leakage: bilene→bilane, guttene→gutane).
        // - MASCULINE bestemt entall is -en in NN («kelneren», «bremsen»,
        //   «reporteren» are standard per their official paradigms; only
        //   FEMININE -en is leakage: boken→boka, døren→døra).
        const nounLemmaGenus = vocab.nounLemmaGenus || new Map();
        const nounGenus = vocab.nounGenus || new Map();
        const stemGenus = (stem) => {
          const direct = nounLemmaGenus.get(stem) || nounGenus.get(stem);
          if (direct) return direct;
          // Compound tail («jobbsøknaden» → søknad): genus follows the head.
          for (let c = 1; c <= stem.length - 4; c++) {
            const tail = stem.slice(c);
            const g = nounLemmaGenus.get(tail) || nounGenus.get(tail);
            if (g) return g;
          }
          return '';
        };
        if (/ene$/.test(t.word)) {
          const g1 = String(stemGenus(t.word.slice(0, -3)));  // utgift-ene
          const g2 = String(stemGenus(t.word.slice(0, -2)));  // redsle-ne / åre-ne
          if (g1.split('/').includes('f') || g2.split('/').includes('f')) continue;
        } else if (/en$/.test(t.word)) {
          const g = String(stemGenus(t.word.slice(0, -2)));   // kelner-en
          if (g.split('/').includes('m')) continue;
        }
        // Verb homographs («undre seg», «å møblere», «tenne ei lykt», «bli
        // ofra», «naboar heiser flagget») — verb forms, not NB noun leakage.
        const isVerbish = (vocab.verbForms && vocab.verbForms.has(t.word)) ||
          (vocab.verbInfinitive && vocab.verbInfinitive.has(t.word)) ||
          (vocab.knownPresens && vocab.knownPresens.has(t.word)) ||
          (vocab.knownPreteritum && vocab.knownPreteritum.has(t.word)) ||
          (vocab.knownParticiples && vocab.knownParticiples.has(t.word)) ||
          (vocab.sPassivForms && vocab.sPassivForms.has && vocab.sPassivForms.has(t.word));
        if (isVerbish) continue;

        const xref = nbToNnNouns.get(t.word);

        // Path 1 (confident map): definite singular/plural or ubestemt
        // plural with a differing NN form. Covers boken→boka, døren→døra,
        // abonnementene→abonnementa, elever→elevar, bilene→bilane.
        // The "differs from typed form" check skips shared forms like
        // huset (same in NB and NN). ubestemt_entall is excluded because
        // it overlaps with the bare lemma — flagging it would fire on
        // shared base forms (bil, bok) where the typed form is fine in
        // NN (just the definite/plural differs).
        let fix = null;
        let shouldFlag = false;
        if (xref &&
            (xref.field === 'bestemt_entall' ||
             xref.field === 'bestemt_flertall' ||
             xref.field === 'ubestemt_flertall') &&
            xref.nnForm && xref.nnForm !== t.word) {
          shouldFlag = true;
          fix = xref.nnForm;
        } else if (NB_PLURAL_RE.test(t.word)) {
          // Path 2 (suffix fallback): NB definite-plural outside the map.
          // Auto-fix unavailable; flag without a fix.
          shouldFlag = true;
          fix = xref ? xref.nnForm : null;
        }
        if (!shouldFlag) continue;

        out.push({
          rule_id: 'nn-plural-leakage',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix,
          message: fix
            ? `Bokmålsform: "${t.display}" → "${fix}"`
            : `Bokmålsform: "${t.display}" — bruk nynorskforma`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
