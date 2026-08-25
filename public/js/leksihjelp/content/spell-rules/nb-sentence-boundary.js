/**
 * Spell-check rule: NB/NN missing sentence-boundary punctuation (priority 56).
 *
 * Detects two independent clauses run together with no period/!/? between
 * them. Conservative heuristic — high precision over recall:
 *
 *   1. Token N is a capitalised subject pronoun (Det/Han/Hun/Jeg/Vi/...)
 *   2. Token N is NOT at position 0 (start of input)
 *   3. Token N+1 is a finite verb form (er/var/har/hadde/kan/skal/vil/...)
 *   4. Token N-1 does NOT end with .!?:; (no existing sentence boundary)
 *   5. Token N-1 is NOT a coordinating conjunction (og/men/for/eller/så)
 *   6. There is no '"' or ')' immediately before token N (skip dialogue/parens)
 *
 * Fix: insert period before the capital pronoun.
 *
 * Rule ID: 'nb-sentence-boundary'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  const CAPITAL_SUBJECTS_NB = new Set([
    'Jeg', 'Du', 'Han', 'Hun', 'Den', 'Det', 'Vi', 'Dere', 'De', 'Man',
  ]);
  const CAPITAL_SUBJECTS_NN = new Set([
    'Eg', 'Du', 'Han', 'Ho', 'Den', 'Det', 'Vi', 'Dykk', 'Dei', 'Ein',
  ]);

  // Finite verb forms after a subject pronoun — strong "new clause" signal.
  // Limit to high-frequency forms to keep precision high.
  const FINITE_VERBS = new Set([
    // copula / aux
    'er', 'var', 'har', 'hadde', 'blir', 'ble', 'vart', 'vert',
    // modals
    'kan', 'kunne', 'skal', 'skulle', 'vil', 'ville', 'må', 'måtte',
    'bør', 'burde',
    // pro-form / common
    'gjør', 'gjorde', 'gjer',
  ]);

  // Coordinating conjunctions — if previous token IS one of these, the
  // capital pronoun is conjoined, not a new sentence.
  const CONJUNCTIONS_PREV = new Set(['og', 'men', 'for', 'eller', 'så']);

  // Plan 50-04 sub-step F: abbreviations whose trailing `.` is NOT a
  // sentence terminator. Common NB abbreviations from Språkrådet style
  // guide. Lowercased; missing-capital branch looks prev-token+'.' up here.
  const ABBREVIATIONS = new Set([
    'f.eks.', 'osv.', 'dvs.', 'etc.', 'bl.a.', 'm.fl.', 'evt.',
    'jf.', 'kr.', 'nr.', 'ca.', 'pga.', 'iht.', 'ifb.', 'mht.',
    // v3.0.136 (Wikipedia precision-corpus run): measurement + name
    // abbreviations that fired the missing-capital branch on clean text
    // («4000 moh., men …», «40 km. nordvest», «Gordy, Jr. (fødd …»).
    'moh.', 'km.', 'cm.', 'mm.', 'kg.', 'jr.', 'sr.', 'st.',
    'kap.', 'fig.', 'red.', 'utg.', 'mfl.', 'hhv.', 'tlf.',
    // Ordbank sweep (2026-07): «45 mill. kroner», «15 personer pr.
    // kvadratkilometer» fired the missing-capital branch.
    'mill.', 'mrd.', 'pr.', 'stk.', 'kl.',
  ]);

  // Academic degrees and titles. Added 2026-08-13 after a Wikipedia sweep
  // produced 19 findings on biography prose — «cand. jur. i 1883» wanted
  // «Jur», «dr. philos. i 1916» wanted «Philos».
  //
  // This is the THIRD list of Norwegian abbreviations in the rule set, and
  // the comments above record it being extended twice already from earlier
  // sweeps. So rather than grow a third copy in isolation, the set below is
  // merged at CHECK time with the one sentence-case.js publishes — read
  // there, not here, because rule files load alphabetically and
  // nb-sentence-boundary is evaluated before sentence-case has registered.
  // Either list can now be extended and both rules see it.
  const DEGREES = [
    'dr.', 'prof.', 'cand.', 'stud.', 'mag.', 'jur.', 'med.', 'philol.',
    'philos.', 'real.', 'theol.', 'polit.', 'oecon.', 'scient.', 'paed.',
    'ing.', 'fhv.', 'sst.', 'o.l.', 'o.a.', 'm.m.',
  ];
  function abbreviations(lang) {
    const host = typeof self !== 'undefined' ? self : globalThis;
    const shared = host.__lexiAbbrev && host.__lexiAbbrev.setFor;
    const merged = new Set(ABBREVIATIONS);
    for (const a of DEGREES) merged.add(a);
    if (shared) for (const a of shared(lang)) merged.add(a);
    return merged;
  }

  // Interjections that appear as quote-less exclamations mid-sentence
  // («vi sa Prosit! begge gangene», «Han sa Skål! og tok en slurk») — the
  // «!» belongs to the interjection, not a sentence boundary.
  const INTERJECTIONS = new Set([
    'prosit', 'skål', 'hei', 'hurra', 'takk', 'unnskyld', 'gratulerer',
    'æsj', 'uff', 'au', 'hallo', 'velkommen', 'bravo', 'stopp', 'hjelp',
  ]);

  function getCapitalSubjects(lang) {
    return lang === 'nn' ? CAPITAL_SUBJECTS_NN : CAPITAL_SUBJECTS_NB;
  }

  const rule = {
    id: 'nb-sentence-boundary',
    languages: ['nb', 'nn'],
    priority: 56,
    exam: {
      safe: true,
      reason: "Pattern-matched sentence boundary — flags only the highest-precision case (capital subject pronoun + finite verb without preceding punctuation)",
      category: "grammar-lookup",
    },
    severity: 'warning',
    // v3.0.121 Lær mer: this rule produced 41 findings per run on the real
    // NB student corpus, all without pedagogy — top of the coverage gap list.
    pedagogy: {
      note: {
        nb: 'Hver setning starter med <strong>stor bokstav</strong> og forrige setning slutter med punktum (eller ? / !). Sjekk begge når du får dette varselet — det vanligste er at punktumet finnes, men den nye setningen fortsetter med liten bokstav.',
        nn: 'Kvar setning startar med <strong>stor bokstav</strong> og førre setning sluttar med punktum (eller ? / !). Sjekk begge når du får dette varselet — det vanlegaste er at punktumet finst, men den nye setninga held fram med liten bokstav.',
        en: 'Every sentence starts with a <strong>capital letter</strong>, and the previous one ends with a full stop (or ? / !). Check both — most often the full stop is there but the new sentence continues in lowercase.',
      },
      examples: [
        {
          correct: 'Vi spiser middag. Etterpå ser vi en film.',
          incorrect: 'Vi spiser middag. etterpå ser vi en film.',
          translation: { nb: 'Stor bokstav etter punktum.', nn: 'Stor bokstav etter punktum.', en: 'Capital letter after a full stop.' },
        },
        {
          correct: 'Jeg liker fotball. Broren min liker håndball.',
          incorrect: 'Jeg liker fotball broren min liker håndball.',
          translation: { nb: 'To setninger trenger punktum mellom seg.', nn: 'To setningar treng punktum mellom seg.', en: 'Two sentences need a full stop between them.' },
        },
      ],
      extra: {
        nb: 'Tips: les teksten høyt. Der du naturlig puster og stemmen går ned, hører det som regel hjemme et punktum — og neste ord skal ha stor bokstav.',
        nn: 'Tips: les teksten høgt. Der du naturleg pustar og stemma går ned, høyrer det som regel heime eit punktum — og neste ord skal ha stor bokstav.',
        en: 'Tip: read the text aloud. Where you naturally pause and your voice drops, a full stop usually belongs — and the next word takes a capital.',
      },
    },
    explain: (finding) => {
      // Plan 50-04 sub-step F: missing-punctuation branch fix starts
      // with '. '; missing-capital branch fix is the capitalised token.
      if (finding.fix && !finding.fix.startsWith('. ')) {
        return {
          nb: `Etter punktum (eller ! / ?) skal det være stor forbokstav: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `Etter punktum (eller ! / ?) skal det vere stor forbokstav: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      return {
        nb: `Det mangler punktum (eller ! / ?) foran <em>${escapeHtml(finding.original)}</em>. To setninger må skilles med stort tegn, ikke kjøres sammen.`,
        nn: `Det manglar punktum (eller ! / ?) framfor <em>${escapeHtml(finding.original)}</em>. To setningar må skiljast med stort teikn, ikkje køyrast saman.`,
      };
    },
    check(ctx) {
      const { tokens, text, cursorPos, lang } = ctx;
      const capitals = getCapitalSubjects(lang);
      // Built per check so the shared list from sentence-case.js is picked up
      // regardless of rule load order — see abbreviations() above.
      const ABBREV = abbreviations(lang);
      const out = [];

      for (let i = 1; i < tokens.length - 1; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        // 1. Token must be a capitalised subject pronoun (case-sensitive)
        if (!capitals.has(t.display)) continue;

        // 3. Next token must be a finite verb (lowercase match)
        const nextT = tokens[i + 1];
        if (!FINITE_VERBS.has(nextT.word.toLowerCase())) continue;

        // 4 & 5. Inspect the gap between previous token and current token.
        const prevT = tokens[i - 1];
        const gap = text.slice(prevT.end, t.start);
        // Already has sentence-end punctuation in the gap? Skip.
        if (/[.!?:;]/.test(gap)) continue;
        // Quotation marks or closing paren immediately before? Skip (dialogue / aside).
        // Phase 48 C9: include OPENING quote marks (« „ ") too — a capital
        // pronoun right after an opening quote is the start of quoted
        // material, not a missing sentence break in the surrounding prose.
        if (/["»\)\]«„“]/.test(gap)) continue;

        // Previous token is itself sentence-final punctuation (e.g. on its own)?
        if (/^[.!?:;]+$/.test(prevT.display)) continue;
        // Previous token is a coordinating conjunction → it's a conjoined clause,
        // not a missing-period case.
        if (CONJUNCTIONS_PREV.has(prevT.word.toLowerCase())) continue;

        out.push({
          rule_id: 'nb-sentence-boundary',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: '. ' + t.display,
          message: `Mangler punktum foran «${t.display}»`,
        });
      }

      // Plan 50-04 sub-step F: missing-capital-after-period branch.
      // Fires on lowercase NB letter after sentence-final '.!?'. Gates:
      //   (a) prev-token+'.' not in ABBREVIATIONS (single-dot abbrevs like osv.)
      //   (b) text from a small lookback window before prev does NOT
      //       contain a letter-dot-letter pattern (catches multi-dot
      //       abbreviations like 'f.eks.' tokenised as ['f','eks',…])
      //   (c) prev-token is not digits AND no digit appears in the gap
      //       (catches numbered-list '1. punkt' even though digits aren't
      //       tokenised — gap-side check covers it)
      //   (d) gap has no quote chars (handled by quotation-suppression)
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (!/^[a-zæøå]/.test(t.display)) continue;
        const prevT = tokens[i - 1];
        const gap = text.slice(prevT.end, t.start);
        if (!/[.!?]/.test(gap)) continue;
        if (/["»«„“]/.test(gap)) continue;
        if (/\d/.test(gap)) continue; // digit immediately before period — numbered list
        // Embedded punctuation after the terminator — «ha det!, sa hun»,
        // «Skål! — sa hun», «… gjøre. (bokmål)» — the terminator is part of an
        // embedded exclamation or is followed by a parenthetical label, not a
        // sentence boundary that demands a capital.
        if (/[,—–;:()]/.test(gap)) continue;
        // Quote-less interjection exclamation: «vi sa Prosit! begge gangene»,
        // «å si prosit! i Norge» — the «!» belongs to the interjection.
        if (/!/.test(gap) && INTERJECTIONS.has(prevT.word.toLowerCase())) continue;
        // Two-word idiom «ha det!» («ha det!, sa hun og gikk»).
        if (/!/.test(gap) && prevT.word.toLowerCase() === 'det'
            && i >= 2 && tokens[i - 2].word.toLowerCase() === 'ha') continue;
        // v3.0.136 precision guards (Wikipedia corpus run):
        // (a) no whitespace after the period → domain/file/notation, not a
        //     sentence boundary («vg.no», «ax^{3}.b»).
        if (!/\s/.test(gap)) continue;
        // (b) single-letter token before the period → initial or Latin
        //     binomial abbreviation («C. flavus», «H. C. Andersen», «L.»),
        //     never a sentence end.
        if (prevT.display.length === 1) continue;
        // (c) single-letter flagged token → notation/enumeration («a. e.
        //     i. o.», IPA lists). Exception: 'i' and 'å', the only
        //     single-letter Norwegian words that legitimately start
        //     sentences («i dag …», «å reise …») — keep coaching those.
        if (t.display.length === 1 && t.word !== 'i' && t.word !== 'å') continue;
        const abbrevCandidate = (prevT.display + '.').toLowerCase();
        if (ABBREV.has(abbrevCandidate)) continue;
        // Multi-dot abbreviation guards. Two shapes:
        //  (1) prev is the inner half of a multi-dot abbrev — lookback
        //      from prev.start sees a letter-dot-letter pattern (e.g.
        //      "f.eks" before token 'ikke'); treat as inside abbrev.
        //  (2) prev is the leading half of a yet-to-close multi-dot
        //      abbrev — prev.display + '.' + current.display + '.' is in
        //      ABBREVIATIONS (e.g. prev='f', current='eks' → 'f.eks.').
        const lookbackStart = Math.max(0, prevT.start - 8);
        const window = text.slice(lookbackStart, prevT.end);
        if (/[a-zæøå]\.[a-zæøå]/i.test(window)) continue;
        const twoPartAbbrev = (prevT.display + '.' + t.display + '.').toLowerCase();
        if (ABBREV.has(twoPartAbbrev)) continue;
        if (/^\d+$/.test(prevT.display)) continue;
        if (out.some(f => f.start === t.start && f.rule_id === 'nb-sentence-boundary')) continue;
        const fix = t.display[0].toUpperCase() + t.display.slice(1);
        out.push({
          rule_id: 'nb-sentence-boundary',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix,
          message: `Stor forbokstav etter punktum: «${t.display}» → «${fix}»`,
        });
      }

      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
