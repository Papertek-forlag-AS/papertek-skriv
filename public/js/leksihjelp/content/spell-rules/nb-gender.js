/**
 * Spell-check rule: gender article mismatch (priority 10).
 *
 * Flags article-noun pairs where the article's grammatical gender does not
 * match the noun's gender. Checks both immediately previous word and 2-back
 * (catches "en stor hus" where an adjective sits between).
 *
 * In Bokmål, feminine nouns accept the common-gender article "en" too:
 * "en bok" and "ei bok" are both correct. Only flags strict mismatches.
 *
 * Rule ID: 'gender' — preserved verbatim from pre-INFRA-03 inline rule.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml, getString } = host.__lexiSpellCore || {};

  // NN's article set includes NB-leaked articles (en/et) too: when a student
  // writes "et stor handlevogn" in NN, the gender mismatch is the primary
  // error (handlevogn is feminine — should be "ei stor handlevogn"). Without
  // the NB articles here, the rule ignores the article-noun pair entirely
  // and the student gets no signal. Dialect-mix handles register separately;
  // gender wins on the article token via priority 10 < 35 in dedupe.
  const ARTICLE_GENUS = {
    nb: { 'en': 'm', 'ei': 'f', 'et': 'n' },
    nn: { 'ein': 'm', 'ei': 'f', 'eit': 'n', 'en': 'm', 'et': 'n' },
  };
  const GENUS_ARTICLE = {
    nb: { 'm': 'en', 'f': 'ei', 'n': 'et' },
    nn: { 'm': 'ein', 'f': 'ei', 'n': 'eit' },
  };

  // Phase 05.1 Gap C: maps the genus code carried on each finding
  // (actualGenus field) to the i18n key for that gender class's canonical
  // label. The label resolves per-target-register via __lexiSpellCore.getString
  // — NB: hankjønn / hunkjønn / intetkjønn; NN: hankjønn / hokjønn / inkjekjønn.
  const GENUS_TO_LABEL_KEY = { m: 'gender_label_m', f: 'gender_label_f', n: 'gender_label_n' };

  const rule = {
    id: 'gender',
    languages: ['nb', 'nn'],
    priority: 10,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (nb-gender) — Chrome native parity confirmed in 33-03 audit: NB lookup against gender/article map; single-token replacement; no pedagogy popover",
      category: "grammar-lookup",
    },
    severity: 'error',
    // Phase 05.1 Gap C: three-beat copy — names the target gender class
    // ("<em>by</em> er hankjønn") so the student learns the classification,
    // not just the fix. Falls back to the Phase 5 two-beat copy when the new
    // fields (noun_display, actualGenus) are missing — defensive against
    // external finding-shape mutation, older findings flowing through, and
    // the check-explain-contract fake-finding path (which omits both fields).
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
      const { text, tokens, vocab, cursorPos, lang } = ctx;
      const nounGenus = vocab.nounGenus || new Map();
      const validWords = vocab.validWords || new Set();
      const articles = ARTICLE_GENUS[lang];
      const genusArticle = GENUS_ARTICLE[lang];
      const out = [];
      const isAdjective = vocab.isAdjective || new Set();
      // For the NN-side NB-leak recognition (ARTICLE_GENUS.nn includes en/et),
      // we need two guards. (1) NN `et` collides with the 3sg present of `ete`
      // (to eat) — "Eg et frukost" is verb usage, not article. Skip when the
      // candidate article is en/et AND the immediately preceding token is a
      // subject pronoun. (2) No sentence-boundary punctuation between the
      // article candidate and the noun — "vi et. Familien" would otherwise
      // misread the period-separated "et" as the article for "Familien".
      const NN_SUBJ_PRONOUNS = new Set(['eg', 'du', 'han', 'ho', 'den', 'det', 'vi', 'dykk', 'dei', 'ein']);
      // Coordinating conjunctions: "et" right after one is the verb `ete` in a
      // coordinated predicate ("vaknar og et frukost"), not the neuter article.
      const NN_COORD_CONJ = new Set(['og', 'eller', 'men', 'for', 'så', 'samt']);
      const isNBLeakArticle = (w) => lang === 'nn' && (w === 'en' || w === 'et');
      // Words that frequently sit between an article and an adjective + noun
      // chain ("et veldig stor kø"). Limited to high-frequency degree adverbs
      // to keep the search constrained and avoid spurious i-3 matches.
      const DEGREE_ADVERBS = new Set([
        'veldig', 'svært', 'ganske', 'helt', 'litt', 'temmelig', 'meget',
        'kjempe', 'super', 'utrolig', 'altfor', 'for', 'så', 'mer', 'mest',
      ]);
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const prev = tokens[i - 1];
        const prevPrev = tokens[i - 2];
        const prev3 = tokens[i - 3];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        let articleTok = null;
        if (prev && articles[prev.word]) articleTok = prev;
        // ARTICLE + ADJ + NOUN — require intervening token to actually be
        // an adjective so we don't false-flag NOUN-NOUN sequences like
        // "et tog stasjon" (where the student left out the compound — the
        // saerskriving rule handles that; gender shouldn't pair the
        // article with the second noun, skipping over the first noun).
        else if (prevPrev && articles[prevPrev.word] && prev
                 && (isAdjective.has(prev.word) || isAdjective.has(prev.word + 't'))) {
          articleTok = prevPrev;
        }
        // Three-back lookup: ARTICLE + DEGREE_ADV + ADJ + NOUN
        // ("et veldig stor kø"). Only fires when both intervening tokens
        // fit the expected categories — keeps i-3 search precise.
        else if (prev3 && articles[prev3.word]
                 && prevPrev && DEGREE_ADVERBS.has(prevPrev.word)
                 && prev && (isAdjective.has(prev.word) || isAdjective.has(prev.word + 't'))) {
          articleTok = prev3;
        }
        if (articleTok && nounGenus.has(t.word)) {
          // Adjacency: a digit between the article and the noun means the
          // article belongs to the NUMBER phrase, not the noun ("en 17 år
          // gammel gutt" — the tokenizer drops digits, so 'en' and 'år'
          // looked adjacent and flagged en→et against år (n)).
          {
            const aIdx = tokens.indexOf(articleTok);
            let hasDigitGap = false;
            for (let k = aIdx; k < i; k++) {
              if (/\d/.test(text.slice(tokens[k].end, tokens[k + 1].start))) { hasDigitGap = true; break; }
            }
            if (hasDigitGap) continue;
          }
          // Genitive-s head: "etter en tids forløp" — the intervening token is
          // a genitive ('tids'), so the article agrees with the GENITIVE OWNER
          // (en tid), not the following noun (forløp, n). The genitive form
          // leaks into isAdjective ('tids'), which is how the ART+ADJ+NOUN
          // path picked it up.
          if (articleTok === prevPrev && prev && prev.word.length >= 3
              && prev.word.endsWith('s') && nounGenus.has(prev.word.slice(0, -1))) continue;
          // Impersonal "ein/en" (= one): after a subordinator/comparative or a
          // finite verb it is the PRONOUN, not an article — "gjere som ein
          // lyster", "ete så mykje ein lyster", "korleis seier ein god natt",
          // "at ein heile tida har". The following word is that clause's verb
          // or a greeting, not the pronoun's noun.
          if (articleTok.word === 'ein' || articleTok.word === 'en') {
            const aIdx2 = tokens.indexOf(articleTok);
            const beforeA = aIdx2 > 0 ? tokens[aIdx2 - 1] : null;
            const IMPERSONAL_CUES = new Set(['som', 'mykje', 'mye', 'kva', 'hva',
              'korleis', 'hvordan', 'at', 'viss', 'hvis', 'når', 'dersom']);
            const WH_CUES = new Set(['kva', 'hva', 'korleis', 'hvordan', 'kvifor', 'hvorfor']);
            // wh-word + finite verb + ein = inverted impersonal question
            // ("korleis seier ein god natt på spansk?"). A bare verb before
            // the article is NOT enough — "kjøper en bil" is ordinary SVO.
            const whInverted = beforeA && ctx.vocab.knownPresens
              && ctx.vocab.knownPresens.has(beforeA.word)
              && aIdx2 >= 2 && WH_CUES.has(tokens[aIdx2 - 2].word);
            if (beforeA && (IMPERSONAL_CUES.has(beforeA.word) || whInverted)) continue;
          }
          // Phase 48 C4: head-noun lookup past adjective. When the current
          // token is BOTH a known adjective AND a known noun (kort = adj
          // "short" / neuter noun "card"; lang = adj "long" / m noun
          // "tendency"; …) and a plausible head-noun follows, prefer the
          // adjective interpretation and let the actual head noun be the
          // gender source. Without this, "en kort tegneseriestripe" fired
          // as "en kort" → "et kort" (treating kort as a neuter card).
          // The next-token signal: at least 3 chars, no clause-boundary
          // punctuation in between, AND not itself an article/pronoun/
          // preposition (those would never be heads).
          // Hyphen-compound modifier: the noun candidate is joined by '-' to
          // the next token ("et kult gaming-setup") — gender belongs to the
          // compound HEAD, not this modifier. Skip.
          {
            const nx = tokens[i + 1];
            if (nx && /-/.test(text.slice(t.end, nx.start))) continue;
          }
          // Adjectives missing from the isAdjective index (multi-part /
          // indeclinable): "et innendørs fullskala idrettsanlegg" paired the
          // article with «fullskala» (a noun homograph). Same supplement set
          // nb-sarskriving needed.
          const SUPP_ADJ_G = new Set(['fullskala', 'innendørs', 'utendørs',
            'smertestillende', 'videregående',
            // NN spellings + noun-homograph adjectives (Ordbank sweep 2026-07)
            'smertestillande', 'vidaregåande', 'narkoman', 'midlertidig',
            'mellombels']);
          if (isAdjective.has(t.word) || SUPP_ADJ_G.has(t.word)) {
            const next = tokens[i + 1];
            if (next && next.word && next.word.length >= 3
                && !articles[next.word]) {
              const gap = text.slice(t.end, next.start);
              if (!/[.!?,;:]/.test(gap)) continue;
              // Coordinated attributive adjectives: "en kort, svart kjole" —
              // the comma joins two adjectives before the real head noun, so
              // the adjective reading still wins across it.
              if (/,/.test(gap) && isAdjective.has(next.word)) continue;
            }
          }
          // NN NB-leak guards: suppress verb-collision and cross-sentence FPs.
          if (isNBLeakArticle(articleTok.word)) {
            // (1) Verb-`et` collision: "Eg et frukost" — `et` after a subject
            // pronoun is the verb of `ete`, not the neuter article. Ordbank
            // sweep 2026-07: NOUN subjects too ("Familien et frukost",
            // "Elevane et lunsj") — any known-noun before `et` means the verb
            // reading.
            const beforeArticle = tokens[tokens.indexOf(articleTok) - 1];
            if (beforeArticle && NN_SUBJ_PRONOUNS.has(beforeArticle.word)) continue;
            if (beforeArticle && articleTok.word === 'et' && nounGenus.has(beforeArticle.word)) continue;
            // "et"/"en" right after a coordinating conjunction is a coordinated
            // verb ("vaknar og et frukost" = …and eat[s] breakfast), not an
            // article. Only relevant for the verb-homograph "et" (ete present).
            if (beforeArticle && articleTok.word === 'et' && NN_COORD_CONJ.has(beforeArticle.word)) continue;
            // (2) Cross-sentence boundary: don't treat a period-separated
            // article candidate as licensing a downstream noun's gender.
            const articleIdx = tokens.indexOf(articleTok);
            let crossesSentence = false;
            for (let k = articleIdx; k < i; k++) {
              const between = text.slice(tokens[k].end, tokens[k + 1].start);
              if (/[.!?]/.test(between)) { crossesSentence = true; break; }
            }
            if (crossesSentence) continue;
          }
          // Goal-loop 1 (2026-06-12): særskriving interplay. «ein fjell tur»
          // paired ein↔fjell(n) and suggested eit — but the student's
          // intended word is the COMPOUND (fjelltur, m), which nb-sarskriving
          // already flags on the «fjell tur» pair. When the noun and its
          // successor concatenate to a known word, defer to the særskriving
          // coaching; a residual genus error resurfaces after the merge.
          const after = tokens[i + 1];
          if (after && validWords.has(t.word + after.word)
              && !/[.!?,;:]/.test(text.slice(t.end, after.start))) continue;

          const expected = articles[articleTok.word];
          const actual = nounGenus.get(t.word);
          // Multi-genus nouns (e.g. handlevogn = "f/m", bord = "m/n") list
          // every valid grammatical gender separated by `/`. The article is
          // acceptable if it matches ANY listed gender — but must fire if
          // it matches NONE. Before this split, the rule treated multi-
          // genus codes as opaque strings, so `et handlevogn` (neuter,
          // when listed genders are f and m) was silently allowed because
          // `"n" !== "f/m"` AND `genusArticle["f/m"]` was undefined,
          // short-circuiting the fire. Suggestion uses the first listed
          // gender's canonical article.
          const actualSet = actual ? actual.split('/') : [];
          const acceptable = actualSet.includes(expected)
            || (lang === 'nb' && actualSet.includes('f') && articleTok.word === 'en');
          if (actual && !acceptable) {
            const correctArticle = genusArticle[actualSet[0]];
            if (correctArticle) {
              out.push({
                rule_id: 'gender',
                priority: rule.priority,
                start: articleTok.start,
                end: articleTok.end,
                original: articleTok.display,
                noun_display: t.display,   // Phase 05.1 Gap C — cased noun form for three-beat copy
                actualGenus: actualSet[0], // Phase 05.1 Gap C — m/f/n so explain resolves label via i18n. For multi-genus nouns (e.g. "f/m"), use the first listed so the i18n label lookup resolves; the suggested article is also drawn from this slot.
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
