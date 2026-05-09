/**
 * Spell-check rule: FR passé composé / imparfait aspectual hint (Phase 32-01).
 *
 * Soft P3 hint that fires when a French past-tense temporal adverb pairs
 * with a verb in the *other* aspect:
 *
 *   "Hier je mangeais une pomme"        → flags `mangeais` (imparfait)
 *                                          since `hier` cues passé composé
 *   "Tous les jours j'ai mangé une pomme"
 *                                       → flags `ai mangé` (passé composé)
 *                                          since `tous les jours` cues imparfait
 *
 * Adverb sets and the shared pedagogy block are read from the synced FR
 * generalbank (see vocab-seam-core: ctx.vocab.frAspectAdverbs and
 * ctx.vocab.frAspectPedagogy). Verb-form recognition uses two indexes also
 * built in vocab-seam-core: frImparfaitToVerb and frPasseComposeParticiples
 * + frAuxPresensForms (auxiliary presens forms of avoir/être, used to
 * detect "ai mangé" / "es allé" compounds in the token stream).
 *
 * Severity: hint (P3 dashed/muted dot). Never warning or error.
 *
 * The explain() callback returns { nb, nn, pedagogy } — the pedagogy
 * field is additive (validated by check-explain-contract's pedagogy
 * branch when present, ignored by older surfaces). No data → no pedagogy.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { tokensInSentence } = core;

  function escapeHtml(s) {
    const fn = core.escapeHtml;
    if (fn) return fn(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function stripAccents(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // Pedagogy is hot-readable from ctx.vocab.frAspectPedagogy on every check
  // call. We don't cache it in module scope — vocab indexes are rebuilt
  // when the language switches, and caching here would stale-pin the
  // pedagogy block to whichever language was loaded first.

  const rule = {
    id: 'fr-aspect-hint',
    languages: ['fr'],
    priority: 65,                   // P3 hint band (mirrors es-imperfecto-hint)
    severity: 'hint',
    // exam-audit 33-03: stays safe=false — Lær mer pedagogy popover (aspect_choice) — teaches rather than corrects; exceeds Chrome parity
    exam: {
      safe: false,
      reason:
        'Lookup-shaped grammar nudge (fr-aspect-hint) that exceeds browser ' +
        'native spell-check parity; surfaced only outside exam mode.',
      category: 'grammar-lookup',
    },
    explain: function (finding) {
      const adverb = finding.adverb || '';
      const expected = finding.expectedAspect || '';
      const aspectName =
        expected === 'passe_compose'
          ? 'passé composé (avsluttet hendelse)'
          : 'imparfait (pågående eller vanlig handling)';
      const aspectNameNn =
        expected === 'passe_compose'
          ? 'passé composé (avslutta hending)'
          : 'imparfait (pågåande eller vanleg handling)';
      const out = {
        nb:
          'Tidsuttrykket <em>' +
          escapeHtml(adverb) +
          '</em> antyder at verbet bør stå i ' +
          aspectName +
          '.',
        nn:
          'Tidsuttrykket <em>' +
          escapeHtml(adverb) +
          '</em> tyder på at verbet bør stå i ' +
          aspectNameNn +
          '.',
        severity: 'hint',
      };
      if (finding.pedagogy) out.pedagogy = finding.pedagogy;
      return out;
    },
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      if (!ctx.sentences || !tokensInSentence) return [];

      const adverbs = ctx.vocab && ctx.vocab.frAspectAdverbs;
      const imparfaitToVerb = ctx.vocab && ctx.vocab.frImparfaitToVerb;
      const auxForms = ctx.vocab && ctx.vocab.frAuxPresensForms;
      const participles = ctx.vocab && ctx.vocab.frPasseComposeParticiples;
      const pedagogy = ctx.vocab && ctx.vocab.frAspectPedagogy;
      if (!adverbs || (!imparfaitToVerb && !participles)) return [];
      if (!adverbs.passeCompose || !adverbs.imparfait) return [];

      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = tokensInSentence(ctx, sentence);
        if (range.end - range.start < 2) continue;

        // Pass 1: locate adverb hits (single-word + multi-word phrases).
        const adverbHits = []; // { type, adverb, tokenIdx, span }
        for (let i = range.start; i < range.end; i++) {
          const word = ctx.tokens[i].word;
          const stripped = stripAccents(word);

          // Single-word passé-composé adverbs
          if (
            adverbs.passeCompose.single.has(word) ||
            adverbs.passeCompose.single.has(stripped)
          ) {
            adverbHits.push({
              type: 'passe_compose',
              adverb: ctx.tokens[i].display,
              tokenIdx: i,
              tokenIdxEnd: i,
            });
            continue;
          }
          // Single-word imparfait adverbs
          if (
            adverbs.imparfait.single.has(word) ||
            adverbs.imparfait.single.has(stripped)
          ) {
            adverbHits.push({
              type: 'imparfait',
              adverb: ctx.tokens[i].display,
              tokenIdx: i,
              tokenIdxEnd: i,
            });
            continue;
          }

          // Multi-word phrase scan (passé composé)
          for (const phrase of adverbs.passeCompose.phrases) {
            const words = phrase.split(' ');
            if (i + words.length > range.end) continue;
            let match = true;
            for (let k = 0; k < words.length; k++) {
              const tw = ctx.tokens[i + k].word;
              const ts = stripAccents(tw);
              if (tw !== words[k] && ts !== words[k]) {
                match = false;
                break;
              }
            }
            if (match) {
              const display = [];
              for (let k = 0; k < words.length; k++) display.push(ctx.tokens[i + k].display);
              adverbHits.push({
                type: 'passe_compose',
                adverb: display.join(' '),
                tokenIdx: i,
                tokenIdxEnd: i + words.length - 1,
              });
              break;
            }
          }

          // Multi-word phrase scan (imparfait)
          for (const phrase of adverbs.imparfait.phrases) {
            const words = phrase.split(' ');
            if (i + words.length > range.end) continue;
            let match = true;
            for (let k = 0; k < words.length; k++) {
              const tw = ctx.tokens[i + k].word;
              const ts = stripAccents(tw);
              if (tw !== words[k] && ts !== words[k]) {
                match = false;
                break;
              }
            }
            if (match) {
              const display = [];
              for (let k = 0; k < words.length; k++) display.push(ctx.tokens[i + k].display);
              adverbHits.push({
                type: 'imparfait',
                adverb: display.join(' '),
                tokenIdx: i,
                tokenIdxEnd: i + words.length - 1,
              });
              break;
            }
          }
        }

        if (adverbHits.length === 0) continue;

        // Pass 2: for each adverb hit, scan for a verb in the wrong aspect.
        // We allow the verb to be either before or after the adverb but skip
        // tokens inside the adverb's own span.
        for (const hit of adverbHits) {
          let flagged = false;
          for (let j = range.start; j < range.end && !flagged; j++) {
            if (j >= hit.tokenIdx && j <= hit.tokenIdxEnd) continue;
            const word = ctx.tokens[j].word;
            const stripped = stripAccents(word);

            if (hit.type === 'passe_compose') {
              // Adverb cues passé composé → look for an imparfait finite verb.
              // Primary lookup via the verbbank-derived index, fallback to a
              // suffix heuristic (-ais / -ait / -ions / -iez / -aient) to catch
              // verbs whose imparfait form isn't in the index. The fallback is
              // gated on minimum length to avoid common short nouns/adjectives.
              let verbInfo =
                (imparfaitToVerb && (imparfaitToVerb.get(word) || imparfaitToVerb.get(stripped))) || null;
              if (!verbInfo && word.length >= 5 && /(?:ais|ait|ions|iez|aient)$/.test(word)) {
                // Common -ions endings on nouns (questions, opinions) — guard.
                if (!/^(?:questions|opinions|nations|stations|missions|réunions|emotions|émotions|portions|positions|fractions|conditions|relations|directions|attentions|invitations|inscriptions|expressions|impressions|institutions|propositions|locations|libations|sanctions|reactions|réactions|elections|élections|sessions|conclusions|illusions|tensions|extensions|expansions|fonctions|productions|operations|opérations|champions|millions|billions|trillions)$/i.test(word)) {
                  verbInfo = { inf: '?', person: '?' };
                }
              }
              if (verbInfo) {
                const f = {
                  rule_id: 'fr-aspect-hint',
                  start: ctx.tokens[j].start,
                  end: ctx.tokens[j].end,
                  original: ctx.tokens[j].display,
                  fix: ctx.tokens[j].display, // P3 hint — no concrete fix string; surface lives in explain()
                  adverb: hit.adverb,
                  expectedAspect: 'passe_compose',
                  message:
                    ctx.tokens[j].display +
                    ' (' +
                    verbInfo.inf +
                    ', imparfait) — adverb «' +
                    hit.adverb +
                    '» cues passé composé',
                  severity: 'hint',
                };
                if (pedagogy) f.pedagogy = pedagogy;
                findings.push(f);
                flagged = true;
              }
            } else {
              // Adverb cues imparfait → look for a passé-composé compound:
              // an aux (present tense of avoir/être) followed by a known
              // past participle within 1–2 tokens. Also accept elided
              // contractions (j'ai, n'a, qu'as, etc.) by stripping the
              // leading "*'" prefix and re-checking against auxForms.
              const elidedSplit = word.match(/^[a-zçéèêëàâ]'(.+)$/i);
              const auxCandidate = elidedSplit ? elidedSplit[1] : word;
              if (auxForms && (auxForms.has(auxCandidate) || auxForms.has(word))) {
                let participleIdx = -1;
                let partInfo = null;
                for (let k = j + 1; k < Math.min(j + 3, range.end); k++) {
                  const pw = ctx.tokens[k].word;
                  const info =
                    (participles && (participles.get(pw) || participles.get(stripAccents(pw)))) || null;
                  if (info) {
                    participleIdx = k;
                    partInfo = info;
                    break;
                  }
                  // Also allow a generic past-participle suffix heuristic
                  // (-é, -i, -u) so we don't depend solely on participle
                  // index coverage. Defensive — keeps recall high if a
                  // verb's `participle` field is missing in the data.
                  if (/[éiu]$/.test(pw) && pw.length >= 3) {
                    participleIdx = k;
                    partInfo = { inf: '?', aux: word === 'suis' || word === 'es' || word === 'est' || word === 'sommes' || word === 'sont' || word === 'êtes' || word === 'etes' ? 'être' : 'avoir' };
                    break;
                  }
                }
                if (participleIdx !== -1) {
                  const auxTok = ctx.tokens[j];
                  const partTok = ctx.tokens[participleIdx];
                  const f = {
                    rule_id: 'fr-aspect-hint',
                    start: auxTok.start,
                    end: partTok.end,
                    original: auxTok.display + ' ' + partTok.display,
                    fix: auxTok.display + ' ' + partTok.display,
                    adverb: hit.adverb,
                    expectedAspect: 'imparfait',
                    message:
                      auxTok.display +
                      ' ' +
                      partTok.display +
                      ' (passé composé) — adverb «' +
                      hit.adverb +
                      '» cues imparfait',
                    severity: 'hint',
                  };
                  if (pedagogy) f.pedagogy = pedagogy;
                  findings.push(f);
                  flagged = true;
                }
              }
            }
          }
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
