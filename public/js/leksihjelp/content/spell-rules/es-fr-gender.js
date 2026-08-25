/**
 * Spell-check rule: Spanish and French gender article mismatch (priority 15).
 *
 * Flags article-noun pairs where the article's grammatical gender 
 * does not match the noun's gender.
 * 
 * Spanish: el/un (m), la/una (f)
 * French: le/un (m), la/une (f)
 *
 * Rule ID: 'gender'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml, getString } = host.__lexiSpellCore || {};

  const ARTICLE_GENUS = {
    es: { 'el': 'm', 'un': 'm', 'la': 'f', 'una': 'f' },
    fr: { 'le': 'm', 'un': 'm', 'la': 'f', 'une': 'f' },
  };
  const GENUS_ARTICLE = {
    es: { 'm': 'el', 'f': 'la' },
    fr: { 'm': 'le', 'f': 'la' },
  };

  const GENUS_TO_LABEL_KEY = { m: 'gender_label_m', f: 'gender_label_f', n: 'gender_label_n' };

  // Degree adverbs (FR + ES). In "la plus proche", "la más alta" the word after
  // the article is a superlative/comparative marker, so the following adjective
  // is nominalized and agrees with an elided head noun — never pair the article
  // with it as if it were the head noun.
  const DEGREE_WORDS = new Set([
    'plus', 'moins', 'aussi', 'si', 'très', 'tres', 'bien', 'plutôt', 'plutot',
    'tout', 'toute', 'fort', 'trop', 'assez', 'más', 'mas', 'menos', 'muy', 'tan',
  ]);

  // v3.0.121: feminine nouns with stressed initial a — el agua class.
  const ES_TONIC_A = new Set(['agua', 'águila', 'alma', 'hambre', 'aula', 'área', 'arma', 'ala', 'hacha', 'ave']);

  // ES épicène / common-gender nouns: the SAME form is masculine or feminine
  // depending on the referent, so both "el/la policía" and "un/una colega" are
  // correct. nounGenus stores only one default gender, so flagging the article
  // produces false positives ("la policía" → el). Irregulars listed here; the
  // productive -ista/-ante/-ente suffixes are matched by regex below.
  const ES_EPICENE = new Set([
    'policía', 'colega', 'guía', 'modelo', 'testigo', 'atleta', 'espía',
    'vigía', 'mártir', 'joven', 'cómplice', 'rehén', 'recluta', 'centinela',
    'profesional', 'profesionales',
    // Ambiguous-gender nouns: both el/la are correct (the meaning shifts but the
    // article is never an agreement error) — el/la final, el/la orden, el/la mar.
    'final', 'finales', 'orden', 'mar', 'mares', 'arte', 'azúcar', 'azucar',
  ]);

  // FR épicène nouns: identical form for both genders, so BOTH "un/une élève"
  // are correct. nounGenus stores only a single (here masculine) value, so the
  // gender rule wrongly flags "une élève" → un. Skip these. Curated common set
  // (the proper fix is data-side "both"-genus support; logged). Many -iste /
  // -aire professionals are épicène, but the suffix is not reliable enough to
  // blanket-skip (dictionnaire is masculine-only), so this stays a closed list.
  const FR_EPICENE = new Set([
    'élève', 'enfant', 'artiste', 'camarade', 'collègue', 'touriste',
    'secrétaire', 'journaliste', 'dentiste', 'pianiste', 'partenaire',
    'adulte', 'athlète', 'libraire', 'propriétaire', 'locataire',
    'malade', 'responsable', 'adversaire', 'élève', 'gosse', 'concierge',
    'fonctionnaire', 'collégien', 'bénévole', 'interprète', 'guide',
    // Professions/roles usable for either sex — traditionally one gender but
    // both "un/une … " occur (or fully épicène like scientifique/spécialiste).
    // The rule can't know the referent's sex, so never flag the article.
    'scientifique', 'spécialiste', 'médecin', 'peintre', 'témoin', 'prestataire',
    'architecte', 'juge', 'ministre', 'maire', 'chef', 'sculpteur',
    'photographe', 'cinéaste', 'gymnaste', 'diplomate', 'complice',
    'aide', 'stagiaire', 'militaire', 'domestique', 'esclave', 'membre',
  ]);

  // FR nouns whose gender is a HOMOGRAPH pair — the same spelling is masculine
  // OR feminine with a different meaning, so the article is never an agreement
  // error ("le mode d'emploi" vs "la mode", "la tour" vs "le tour", "la poste"
  // vs "le poste"). nounGenus stores only one, so flagging FPs; skip these.
  // (livre/page deliberately excluded — fixtures pin them to one gender, and
  // they didn't surface as FPs. Add a homograph here only when it actually FPs.)
  const FR_AMBIGUOUS_GENDER = new Set([
    'mode', 'tour', 'poste', 'manche', 'voile', 'somme', 'poêle', 'poele',
    'vase', 'moule', 'mémoire', 'memoire', 'œuvre', 'oeuvre',
  ]);

  const rule = {
    id: 'gender',
    languages: ['es', 'fr'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (es-fr-gender) — Chrome native parity confirmed in 33-03 audit: ES/FR article gender lookup against noun gender map; single-token article swap",
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
      const { tokens, vocab, cursorPos, lang } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const articles = ARTICLE_GENUS[lang];
      const genusArticle = GENUS_ARTICLE[lang];
      if (!articles) return [];
      
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const prev = tokens[i - 1];
        const prevPrev = tokens[i - 2];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        let articleTok = null;
        if (prev && articles[prev.word]) articleTok = prev;
        // The two-token lookback ("la NOUVELLE maison") may only skip a KNOWN
        // ADJECTIVE. Previously it also paired across any word NOT in nounGenus,
        // so a noun missing from the lexicon ("Le graphique montre…", "un par
        // semaine") made the article bind to a later homograph noun (montre =
        // watch) — a large FP class. Require prev to be a real adjective.
        // (Requiring prev be a real adjective already blocks the ES "Por la
        // tarde juego" mis-pairing — tarde isn't an adjective — so no separate
        // verb-guard on t is needed; t is the head noun after the adjective,
        // even when it is a noun/verb homograph like "porte"/"place".)
        // …and the intermediate must NOT itself be a known noun. Spanish
        // adjectives usually FOLLOW the noun ("La cultura local", "por la tarde
        // suelo…"), so the intermediate ("cultura"/"tarde") is the HEAD noun —
        // even though it also lands in isAdjective — and the article agrees with
        // it, not with the following word. A genuine pre-nominal adjective
        // ("La nueva casa") is not a noun, so it still pairs.
        else if (prevPrev && articles[prevPrev.word] && prev
                 && vocab.isAdjective && vocab.isAdjective.has(prev.word)
                 // ES only: adjectives FOLLOW the noun, so a noun-in-the-middle
                 // is the head ("La cultura local"). FR adjectives PRECEDE, so a
                 // noun-homograph adjective ("une nouvelle film") is still the
                 // pre-nominal adjective and must pair with the following noun.
                 && !(lang === 'es' && nounGenus.has(prev.word))
                 && !DEGREE_WORDS.has(prev.word)) articleTok = prevPrev;

        // v3.0.121: Spanish tonic-a feminines take EL in the singular —
        // "el agua", "el águila" are correct despite feminine genus.
        if (lang === 'es' && articleTok && (articleTok.word === 'el' || articleTok.word === 'un') && ES_TONIC_A.has(t.word)) continue;

        // ES épicène nouns accept both genders of article — never flag.
        if (lang === 'es' && (ES_EPICENE.has(t.word) || /(?:ista|ante|ente)$/.test(t.word))) continue;

        // FR épicène nouns accept both un/une — never flag the article gender.
        if (lang === 'fr' && FR_EPICENE.has(t.word)) continue;

        // FR gender-homograph nouns (le/la mode, la/le tour) — both articles are
        // valid with different meanings; never an agreement error.
        if (lang === 'fr' && FR_AMBIGUOUS_GENDER.has(t.word)) continue;

        // FR object pronoun le/la/l' directly before a verb is NOT an article
        // ("ne la laisse pas", "je te le demande" — laisse/demande are verbs
        // that also have noun homographs the rule would otherwise pair with).
        if (lang === 'fr' && articleTok && (articleTok.word === 'le' || articleTok.word === 'la')
            && vocab.frPresensToVerb && vocab.frPresensToVerb.has(t.word)) continue;

        // Quoted/metalinguistic token between the article and the noun ("un
        // «gracias»", "un «Buenas tardes»"): the quoted word is a mention, not
        // the article's head noun.
        if (articleTok && ctx.text && /[«»“”"„]/.test(ctx.text.slice(articleTok.end, t.start))) continue;

        if (articleTok && nounGenus.has(t.word)) {
          const expected = articles[articleTok.word];
          const actual = nounGenus.get(t.word);

          // 'both' = épicène / gender-homograph (seam-marked): no agreement
          // error possible — both articles are valid.
          if (actual && actual !== 'both' && actual !== expected) {
            // Suggest the correct definite article for definite errors, 
            // and correct indefinite for indefinite errors.
            let correctArticle = null;
            if (articleTok.word === 'un' || articleTok.word === 'una' || articleTok.word === 'une') {
              correctArticle = (lang === 'fr' && actual === 'f') ? 'une' : 'un';
              if (lang === 'es' && actual === 'f') correctArticle = 'una';
            } else {
              correctArticle = genusArticle[actual];
            }

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
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
