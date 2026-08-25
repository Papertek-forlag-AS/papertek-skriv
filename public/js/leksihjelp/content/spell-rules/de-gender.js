/**
 * Spell-check rule: German gender article mismatch (priority 15).
 *
 * Flags Nominative article-noun pairs where the article's grammatical gender 
 * does not match the noun's gender.
 * 
 * Target articles: der (m), die (f), das (n), eine (f), keine (f).
 * Manual gendered checks also fire on bare `ein` (masc/neut) + feminine noun
 * and bare `kein` (masc/neut) + feminine noun (Phase 36-01 / F36-3, F36-4).
 *
 * Rule ID: 'gender'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml, getString } = host.__lexiSpellCore || {};

  const ARTICLE_GENUS = {
    'der': 'm',
    'die': 'f',
    'das': 'n',
    'eine': 'f',
    'keine': 'f', // F36-4: negative indefinite, feminine + plural
  };
  const GENUS_ARTICLE = {
    'm': 'der',
    'f': 'die',
    'n': 'das',
  };

  // F36-4: indefinite-negative paradigm. When the original article is keine/kein
  // (negative indefinite), suggest within the same paradigm rather than crossing
  // over to definite ('der'/'die'/'das'). Mirrors how the existing 'ein' check
  // suggests 'eine' (not 'die') for feminine mismatches.
  const KEIN_PARADIGM = { 'm': 'kein', 'f': 'keine', 'n': 'kein' };

  const GENUS_TO_LABEL_KEY = { m: 'gender_label_m', f: 'gender_label_f', n: 'gender_label_n' };

  // Determiners that, when sitting between a candidate article and the noun,
  // mean the earlier word is NOT the noun's article — the noun already has its
  // own determiner. e.g. "Ist das dein Hund?" — `das` is the demonstrative
  // subject ("Is THAT your dog?"), `dein` is Hund's article. Without this, the
  // one-token lookback below pairs das(n) with Hund(m) and false-flags das→der.
  // (Adjectives are NOT determiners, so "die alte Frau" still resolves.)
  // v3.0.118: endingless possessives — wrong before any feminine noun.
  const BARE_POSSESSIVES = new Set(['mein', 'dein', 'sein', 'ihr', 'unser', 'euer', 'kein']);

  // v3.0.119: a copula between candidate article and noun means the article
  // is a DEMONSTRATIVE PRONOUN subject, not the noun's article — "Das ist
  // Fisch" was false-flagging das→der across "ist". Predicative nouns after
  // sein don't agree with the demonstrative.
  const COPULA_FORMS = new Set(['ist', 'sind', 'war', 'waren', 'wird', 'werden', 'bin', 'bist', 'seid']);

  const INTERVENING_DETERMINERS = new Set([
    'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines',
    'dein', 'deine', 'deinen', 'deinem', 'deiner', 'deines',
    'sein', 'seine', 'seinen', 'seinem', 'seiner', 'seines',
    'ihr', 'ihre', 'ihren', 'ihrem', 'ihrer', 'ihres',
    'unser', 'unsere', 'unseren', 'unserem', 'unserer', 'unseres',
    'euer', 'eure', 'euren', 'eurem', 'eurer', 'eures',
    'der', 'die', 'das', 'den', 'dem', 'des',
    'ein', 'eine', 'einen', 'einem', 'einer', 'eines', 'kein', 'keine',
    'dieser', 'diese', 'dieses', 'diesen', 'diesem', 'jener', 'jene', 'jenes',
  ]);

  // Wave 2 (2026-06-12): gemäß/gegenüber/samt/nebst/entsprechend added —
  // «gemäß der Verordnung» flagged der→die on the Wikipedia corpus because
  // the dative-governing set only had the school-list seven + Wechsel preps.
  const DATIVE_PREPS = new Set(['aus', 'bei', 'mit', 'nach', 'seit', 'von', 'zu', 'an', 'auf', 'hinter', 'in', 'neben', 'über', 'unter', 'vor', 'zwischen', 'gemäß', 'gegenüber', 'samt', 'nebst', 'entsprechend', 'zufolge', 'ab', 'bis']);

  // Track A (Phase 47): genitive-governing prepositions. After these,
  // `der` is the correct article for feminine singular ("Während der
  // Pause") and `des` for masculine/neuter singular. Mirrors the
  // existing dative-fem suppression below.
  const GENITIVE_PREPS = new Set(['während', 'wegen', 'trotz', 'statt', 'anstatt', 'kraft', 'mittels', 'laut', 'zugunsten', 'innerhalb', 'außerhalb', 'oberhalb', 'unterhalb', 'diesseits', 'jenseits', 'angesichts', 'aufgrund', 'dank', 'infolge', 'einschließlich', 'ausschließlich', 'zwecks', 'anlässlich', 'hinsichtlich', 'bezüglich']);

  // Lazy plural-form cache. The seam exposes `nounForms` as
  // Map<base, {singular: Set, plural: Set}>; we invert it once per
  // vocab to get O(1) "is this token a plural form?" lookup. Cached
  // on the vocab object itself so cost is paid once per session.
  function getPluralForms(vocab) {
    if (vocab.__dePluralForms) return vocab.__dePluralForms;
    const set = new Set();
    const nf = vocab.nounForms;
    if (nf && typeof nf.values === 'function') {
      for (const forms of nf.values()) {
        if (forms && forms.plural) {
          for (const p of forms.plural) set.add(p);
        }
      }
    }
    vocab.__dePluralForms = set;
    return set;
  }

  const rule = {
    id: 'gender',
    languages: ['de'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (de-gender) — Chrome native parity confirmed in 33-03 audit: DE gender lookup against noun gender map; single-token article suggestion",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => {
      const labelKey = GENUS_TO_LABEL_KEY[finding.actualGenus];
      const nounDisplay = finding.noun_display;
      
      if (!labelKey || !nounDisplay || typeof getString !== 'function') {
        return {
          nb: `<em>${escapeHtml(finding.original)}</em> kan være feil kjønn — prøv <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `<em>${escapeHtml(finding.original)}</em> kan vere feil kjønn — prøv <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      const labelNb = getString(labelKey, 'nb');
      const labelNn = getString(labelKey, 'nn');
      return {
        nb: `<em>${escapeHtml(finding.original)}</em> kan være feil kjønn — <em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNb)}. Prøv <em>${escapeHtml(finding.fix)}</em>.`,
        nn: `<em>${escapeHtml(finding.original)}</em> kan vere feil kjønn — <em>${escapeHtml(nounDisplay)}</em> er ${escapeHtml(labelNn)}. Prøv <em>${escapeHtml(finding.fix)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const isAdjective = vocab.isAdjective || new Set();
      const verbInf = vocab.verbInfinitive instanceof Map ? vocab.verbInfinitive : null;

      // Dative-governing verbs. After one, feminine "der" is the correct DATIVE
      // article ("Ich folge der Anleitung", "höre der Professorin zu", "berichtet
      // der Polizei") — the same suppression the DATIVE_PREPS list already gives,
      // but for verb government, which isn't visible from the token before "der".
      const DATIVE_VERBS = new Set([
        'folgen', 'helfen', 'danken', 'antworten', 'gehören', 'gefallen',
        'zuhören', 'berichten', 'gratulieren', 'begegnen', 'vertrauen',
        'glauben', 'dienen', 'passen', 'schaden', 'bewilligen', 'verschreiben',
        'zustimmen', 'widersprechen', 'gehorchen', 'ähneln', 'entsprechen',
        'zusehen', 'zuschauen', 'nützen', 'schmecken', 'fehlen', 'begegnen',
      ]);
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const prev = tokens[i - 1];
        const prevPrev = tokens[i - 2];
        const prevPrevPrev = tokens[i - 3];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        // v3.0.118 (synthetic-corpus probe "Mein Freundin" scored 0): bare
        // possessive + FEMININE noun. The endingless possessive (mein, dein,
        // sein, ihr, unser, euer, kein) is never correct directly before a
        // feminine noun in ANY case (nom/acc need -e, dat/gen need -er), so
        // this is a case-free high-precision flag. Masculine/neuter bare
        // possessives are correct nominatives ("mein Vater", "mein Haus") and
        // are never touched.
        let bareGenus = prev && BARE_POSSESSIVES.has(prev.word) ? nounGenus.get(t.word) : undefined;
        // Compounds inherit the LAST element's genus ("Lieblingsserie" →
        // Serie f). Suffix scan instead of decomposeCompound — the first
        // element may be unknown ("liebling s serie" fails to decompose) but
        // German compound genus is determined by the tail alone.
        if (prev && BARE_POSSESSIVES.has(prev.word) && bareGenus === undefined && t.word.length >= 8) {
          for (let cut = t.word.length - 4; cut >= 3; cut--) {
            const tail = t.word.slice(cut);
            const g = nounGenus.get(tail);
            if (g) { bareGenus = g; break; }
          }
        }
        if (prev && BARE_POSSESSIVES.has(prev.word) && bareGenus === 'f'
            && t.display && t.display[0] !== t.display[0].toLowerCase()) {
          const fixCased = matchCase(prev.display, prev.word + 'e');
          out.push({
            rule_id: 'gender',
            priority: rule.priority,
            start: prev.start,
            end: prev.end,
            original: prev.display,
            fix: fixCased,
            noun: t.display,
            nounGenus: 'f',
            message: `«${prev.display}» + «${t.display}» → «${fixCased}» (${t.display} er hunkjønn)`,
          });
          continue;
        }

        // Attributive adjective, not the noun: "die junge Generation" — «junge»
        // is an adjective that is ALSO a noun-homograph (der Junge), so treating
        // it as the noun false-flags die→der. Skip it as a noun candidate when
        // an actual noun follows (the real head is checked on its own iteration,
        // and the lookback below spans this adjective).
        const nextTok = tokens[i + 1];
        if (isAdjective.has(t.word) && nextTok
            && nextTok.display && /^\p{Lu}/u.test(nextTok.display)
            && nounGenus.has(nextTok.word)) {
          continue;
        }

        let articleTok = null;
        let artIdx = -1;
        if (prev && ARTICLE_GENUS[prev.word]) {
          articleTok = prev;
          artIdx = i - 1;
        } else if (prevPrev && ARTICLE_GENUS[prevPrev.word] && prev
            && (isAdjective.has(prev.word) || (!nounGenus.has(prev.word) && !INTERVENING_DETERMINERS.has(prev.word) && !COPULA_FORMS.has(prev.word)))) {
          // Track A (Phase 47): only allow the article→noun lookback to
          // span one token if that intermediate token is NOT itself a noun.
          // Otherwise "Während der Pause essen" reads as der(m) + (Pause adj) +
          // essen(n=substantivized infinitive) and flags der→das on essen,
          // even though der Pause is correctly genitive feminine.
          articleTok = prevPrev;
          artIdx = i - 2;
        }

        if (articleTok && nounGenus.has(t.word)) {
          const expected = ARTICLE_GENUS[articleTok.word];
          const actual = nounGenus.get(t.word);

          if (actual && actual !== expected) {
            // Check for Dative Feminine: Prep + der + [adj] + noun(f)
            const preArt = tokens[artIdx - 1];
            const isDativeFem = actual === 'f' && articleTok.word === 'der' && preArt && DATIVE_PREPS.has(preArt.word);

            // Track A (Phase 47): Genitive Feminine — Prep + der + [adj] + noun(f).
            // "Während der Pause", "Trotz der Hitze". `der` is the correct
            // feminine singular genitive article after genitive-governing
            // prepositions; without this suppression the rule misreads it
            // as the masculine nominative `der`.
            const isGenitiveFem = actual === 'f' && articleTok.word === 'der' && preArt && GENITIVE_PREPS.has(preArt.word);

            // Track A (Phase 47): plural noun forms. `die` is the universal
            // nom/acc plural article (gender-neutral), but the seam stores
            // each plural form's genus as the lemma's singular genus, so
            // "die Kinder" reads as die(f) + Kinder(n) and falsely flags.
            // Suppress when the noun token is a known plural form.
            const isPluralForm = getPluralForms(vocab).has(t.word);

            // Wikipedia-corpus wave 2 (2026-06-12): ADNOMINAL genitive —
            // «die Ausbreitung der Araber», «Innovation der Freien»,
            // «Gebiet der aufgehobenen Territorialabtei». When `der`
            // directly follows a capitalized word (a noun — German
            // capitalizes all nouns), it's the genitive chain article:
            // correct for feminine singular AND all genitive plurals. The
            // 90-finding corpus class was overwhelmingly this shape. Real
            // student gender errors («ich sehe der Frau» / «Der Frau ist
            // nett») have a lowercase verb or sentence start before the
            // article and keep firing.
            const isAdnominalGenitive = articleTok.word === 'der'
              && preArt && /^\p{Lu}/u.test(preArt.display)
              && artIdx > 0; // sentence-initial capitalized word ≠ noun signal

            // Feminine "der" as a DATIVE object of a dative-governing verb
            // earlier in the clause ("Ich folge der Anleitung", "höre der
            // Professorin zu", "berichtet der Polizei"). Scan back to a clause
            // boundary for such a verb.
            let isDativeVerbFem = false;
            if (actual === 'f' && articleTok.word === 'der') {
              const isDatV = (kw) => {
                const inf = (verbInf && verbInf.get(kw)) || kw;
                return DATIVE_VERBS.has(inf) || DATIVE_VERBS.has(kw);
              };
              // Backward: "Ich folge der Anleitung".
              for (let k = artIdx - 1; k >= 0; k--) {
                const bw = tokens[k + 1] && ctx.text ? ctx.text.slice(tokens[k].end, tokens[k + 1].start) : '';
                if (/[,;:.!?]/.test(bw)) break;
                if (isDatV(tokens[k].word)) { isDativeVerbFem = true; break; }
              }
              // Forward: passive/perfect where the dative verb (as a participle)
              // follows ("wurde der Frau bewilligt", "hat sich der Nachhaltigkeit
              // verschrieben"), or a clause-final "zu" reveals separable zuhören
              // ("höre der Professorin zu").
              if (!isDativeVerbFem) {
                const DATIVE_PARTICIPLES = new Set([
                  'geholfen', 'gedankt', 'gefolgt', 'geglaubt', 'gedient', 'gehorcht',
                  'gehört', 'zugehört', 'bewilligt', 'verschrieben', 'zugestimmt',
                  'widersprochen', 'gefallen', 'begegnet', 'gratuliert', 'ähnelt',
                  'entsprochen', 'geschadet',
                ]);
                for (let k = artIdx + 1; k < tokens.length; k++) {
                  const bw = ctx.text ? ctx.text.slice(tokens[k - 1].end, tokens[k].start) : '';
                  if (/[,;.!?]/.test(bw)) break;
                  const kw = tokens[k].word;
                  // clause-final "zu" (nothing more, or only punctuation after) →
                  // separable prefix of zuhören.
                  if (kw === 'zu' && (k === tokens.length - 1
                      || !tokens[k + 1] || /^[.!?,;]/.test(tokens[k + 1].display || ''))) {
                    isDativeVerbFem = true; break;
                  }
                  if (DATIVE_PARTICIPLES.has(kw)) { isDativeVerbFem = true; break; }
                }
              }
            }

            if (!isDativeFem && !isGenitiveFem && !isPluralForm && !isAdnominalGenitive && !isDativeVerbFem) {
              // F36-4: stay in the kein-paradigm when the original was keine/kein.
              const inKeinParadigm = articleTok.word === 'keine' || articleTok.word === 'kein';
              const correctArticle = inKeinParadigm
                ? KEIN_PARADIGM[actual]
                : GENUS_ARTICLE[actual];
              if (correctArticle) {
                out.push({
                  rule_id: 'gender',
                  priority: rule.priority,
                  start: articleTok.start,
                  end: articleTok.end,
                  original: articleTok.display,
                  noun_display: t.display,
                  actualGenus: actual,
                  fix: matchCase(articleTok.display, correctArticle),
                  message: `Kjønn: "${articleTok.display} ${t.display}" skulle vært "${correctArticle} ${t.display}"`,
                });
              }
            }
          }
        }
        
        // Manual check for 'ein' vs feminine nouns
        if (prev && prev.word === 'ein' && nounGenus.get(t.word) === 'f') {
           out.push({
            rule_id: 'gender',
            priority: rule.priority,
            start: prev.start,
            end: prev.end,
            original: prev.display,
            noun_display: t.display,
            actualGenus: 'f',
            fix: matchCase(prev.display, 'eine'),
            message: `Kjønn: "${prev.display} ${t.display}" skulle vært "eine ${t.display}"`,
          });
        }

        // F36-3: Manual check for bare 'kein' (masc/neut form) before a
        // feminine noun. Mirrors the 'ein' patch above. The reverse direction
        // (feminine 'keine' before a masc/neut noun, F36-4) is handled by the
        // main loop because 'keine' is now in ARTICLE_GENUS.
        if (prev && prev.word === 'kein' && nounGenus.get(t.word) === 'f') {
          out.push({
            rule_id: 'gender',
            priority: rule.priority,
            start: prev.start,
            end: prev.end,
            original: prev.display,
            noun_display: t.display,
            actualGenus: 'f',
            fix: matchCase(prev.display, 'keine'),
            message: `Kjønn: "${prev.display} ${t.display}" skulle vært "keine ${t.display}"`,
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
