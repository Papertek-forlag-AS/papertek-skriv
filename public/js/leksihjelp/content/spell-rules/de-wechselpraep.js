/**
 * Spell-check rule: German Wechselpräpositionen (de-wechselpraep, priority 21).
 *
 * The nine two-way prepositions (in, an, auf, über, unter, vor, hinter, neben,
 * zwischen) take ACCUSATIVE for direction/motion-to-a-goal and DATIVE for
 * location/static activity. Norwegian/English don't mark this, so it's a top
 * error source — but the case can only be decided from the verb's meaning, and
 * many motion verbs legitimately allow BOTH ("ich gehe in die Schule" =
 * direction; "ich gehe in der Schule" = walking around inside). So:
 *
 *   Layer 1 (default, severity=hint): only the HIGH-CONFIDENCE mismatches —
 *     • a STATIVE/activity verb (sein, wohnen, bleiben, stehen, liegen, sitzen,
 *       arbeiten, lernen, …) + an unambiguously-ACCUSATIVE article
 *       → should be dative ("Ich lerne in die Schule" → "in der Schule").
 *     • a PUT verb (stellen, legen, setzen, stecken, hängen) + an
 *       unambiguously-DATIVE article → should be accusative
 *       ("Ich stelle es auf dem Tisch" → "auf den Tisch").
 *     Ambiguous motion verbs (gehen, fahren, …) are NEVER hard-flagged here.
 *     The verb used is the NEAREST one before the preposition (so a stative
 *     verb earlier in the sentence can't mislabel a later motion phrase).
 *
 *   Layer 2 (opt-in, vocab.wechselAlwaysWarn === true): a gentle self-check
 *     hint on EVERY Wechselpräposition — "sjekk: bevegelse (akkusativ) eller
 *     plassering (dativ)?" — for students who want to be prompted each time.
 *     Default OFF. Layer 1 takes precedence per preposition.
 *
 * Always a HINT, never an error — even Layer 1 says "check", because the
 * verb-class heuristic can't be perfect.
 *
 * Exam mode: safe = false — semantic/syntactic case check, not a spelling lookup.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const WECHSEL = new Set(['in', 'an', 'auf', 'über', 'unter', 'vor', 'hinter', 'neben', 'zwischen']);

  // Fixed verb/adjective + preposition combos whose prepositional OBJECT takes
  // accusative regardless of motion/location semantics ("warten auf" = wait for,
  // "lesen über" = read about, "denken an" = think of). When the nearest verb
  // governs the Wechselpräp this way, the stative→dative heuristic must not fire.
  // Keyed by preposition → set of governing verb infinitives / adjectives.
  const ACC_PREP_VERBS = {
    auf: new Set(['warten', 'hoffen', 'freuen', 'gespannt', 'achten', 'aufpassen',
      'reagieren', 'ankommen', 'antworten', 'vorbereiten', 'verzichten', 'stolz',
      'neugierig', 'böse', 'aufmerksam', 'angewiesen']),
    über: new Set(['lesen', 'schreiben', 'lernen', 'sprechen', 'reden', 'denken',
      'nachdenken', 'freuen', 'informieren', 'berichten', 'diskutieren', 'wissen',
      'lachen', 'streiten', 'klagen', 'sich', 'erzählen', 'staunen', 'ärgern',
      'beschweren', 'verfügen', 'herrschen']),
    an: new Set(['denken', 'erinnern', 'glauben', 'schreiben', 'wenden', 'teilnehmen',
      'arbeiten', 'gewöhnen', 'zweifeln', 'leiden', 'sterben', 'sterben', 'grenzen',
      'appellieren', 'gewohnt', 'interessiert', 'beteiligt']),
  };

  // Verb infinitives that take DATIVE with a Wechselpräp (location / static
  // activity). Curated, high-confidence set.
  // 'hängen' is deliberately excluded — it is itself Wechsel-ambiguous
  // (intransitive "hängt an der Wand" = dative; transitive "hängt … an die
  // Wand" = accusative), so it can't disambiguate the case.
  const STATIVE_INF = new Set([
    'sein', 'bleiben', 'stehen', 'liegen', 'sitzen', 'wohnen', 'leben',
    'arbeiten', 'lernen', 'studieren', 'warten', 'schlafen', 'stattfinden',
    'spielen', 'essen', 'kochen', 'lesen', 'schreiben',
  ]);
  // Verbs that take ACCUSATIVE with a Wechselpräp (placement toward a goal).
  const PUT_INF = new Set(['stellen', 'legen', 'setzen', 'stecken']);
  // Ambiguous motion verbs — listed only so the nearest-verb scan recognises
  // them as "a relevant verb" and stops (preventing an earlier stative verb
  // from being used); they themselves never trigger a Layer-1 flag.
  const MOTION_INF = new Set([
    'gehen', 'fahren', 'kommen', 'laufen', 'rennen', 'fliegen', 'reisen',
    'steigen', 'springen', 'fallen', 'klettern', 'ziehen', 'bringen', 'tragen',
  ]);
  // sein/haben present+past surface forms map to their lemma for classification
  // (verbInfinitive doesn't always carry the auxiliaries).
  const SEIN_FORMS = new Set(['bin', 'bist', 'ist', 'sind', 'seid', 'war', 'warst', 'waren', 'wart']);

  let _tables = null;
  function getTables() {
    if (_tables) return _tables;
    const gt = host.__lexiGrammarTables || {};
    const DEF = gt.DEF_ARTICLE_CASE || {};
    const INDEF = gt.INDEF_ARTICLE_CASE || {};
    const reverse = (tbl) => {
      const m = {};
      for (const [art, readings] of Object.entries(tbl)) {
        for (const r of readings) {
          const k = r.genus + '.' + r.case;
          if (!m[k]) m[k] = art;
        }
      }
      return m;
    };
    // For each article: which cases can it carry (ignoring nominativ, since a
    // post-preposition NP is never the subject).
    const caseFlags = (tbl) => {
      const f = {};
      for (const [art, readings] of Object.entries(tbl)) {
        const set = new Set(readings.map(r => r.case));
        f[art] = { acc: set.has('akkusativ'), dat: set.has('dativ') };
      }
      return f;
    };
    _tables = {
      DEF_CORRECT: reverse(DEF),
      INDEF_CORRECT: reverse(INDEF),
      DEF_FLAGS: caseFlags(DEF),
      INDEF_FLAGS: caseFlags(INDEF),
    };
    return _tables;
  }

  // Classify an article token: 'acc' (accusative-only), 'dat' (dative-only),
  // or null (ambiguous / not an article).
  function articleCase(word, T) {
    const f = T.DEF_FLAGS[word] || T.INDEF_FLAGS[word];
    if (!f) return null;
    if (f.acc && !f.dat) return 'acc';
    if (f.dat && !f.acc) return 'dat';
    return null; // den / ambiguous
  }
  function isIndef(word) { return /^ein/.test(word); }

  function verbClass(word, verbInf) {
    if (SEIN_FORMS.has(word)) return 'stative';
    let inf = (verbInf && verbInf.get(word)) || word;
    if (STATIVE_INF.has(inf)) return 'stative';
    if (PUT_INF.has(inf)) return 'put';
    if (MOTION_INF.has(inf)) return 'motion';
    return null;
  }

  const rule = {
    id: 'de-wechselpraep',
    languages: ['de'],
    priority: 21,
    exam: {
      safe: false,
      reason: 'Stays safe=false (de-wechselpraep) — Wechselpräposition case is a semantic check, not a single-token spelling lookup',
      category: 'grammar-lookup',
    },
    severity: 'hint',
    explain: (finding) => {
      if (finding.kind === 'mismatch') {
        const exp = finding.expectedCase === 'dativ' ? 'plassering (dativ)' : 'bevegelse (akkusativ)';
        const expEn = finding.expectedCase === 'dativ' ? 'location (dative)' : 'direction (accusative)';
        const fix = finding.fix ? ` Forslag: <em>${escapeHtml(finding.fix)}</em>.` : '';
        const fixEn = finding.fix ? ` Suggestion: <em>${escapeHtml(finding.fix)}</em>.` : '';
        return {
          nb: `<em>${escapeHtml(finding.prep)}</em> er en wechselpreposisjon. Verbet her tyder på <strong>${exp}</strong> — sjekk kasus.${fix}`,
          nn: `<em>${escapeHtml(finding.prep)}</em> er ein wechselpreposisjon. Verbet her tyder på <strong>${exp}</strong> — sjekk kasus.${fix}`,
          en: `<em>${escapeHtml(finding.prep)}</em> is a two-way preposition. The verb here suggests <strong>${expEn}</strong> — check the case.${fixEn}`,
        };
      }
      return {
        nb: `<em>${escapeHtml(finding.prep)}</em> er en wechselpreposisjon. Sjekk: er det <strong>bevegelse</strong> (akkusativ) eller <strong>plassering</strong> (dativ)?`,
        nn: `<em>${escapeHtml(finding.prep)}</em> er ein wechselpreposisjon. Sjekk: er det <strong>rørsle</strong> (akkusativ) eller <strong>plassering</strong> (dativ)?`,
        en: `<em>${escapeHtml(finding.prep)}</em> is a two-way preposition. Check: is it <strong>direction</strong> (accusative) or <strong>location</strong> (dative)?`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, sentences } = ctx;
      if (!tokens || !sentences) return [];
      const vocab = ctx.vocab || {};
      const verbInf = vocab.verbInfinitive instanceof Map ? vocab.verbInfinitive : null;
      const nounGenus = vocab.nounGenus instanceof Map ? vocab.nounGenus : new Map();
      const alwaysWarn = vocab.wechselAlwaysWarn === true;
      const T = getTables();
      const out = [];
      const tokensInSentence = (s) => {
        let first = tokens.findIndex(t => t.start >= s.start);
        if (first === -1) return [0, 0];
        let last = first;
        while (last < tokens.length && tokens[last].end <= s.end) last++;
        return [first, last];
      };

      for (const sentence of sentences) {
        const [sStart, sEnd] = tokensInSentence(sentence);
        for (let i = sStart; i < sEnd; i++) {
          if (!WECHSEL.has(tokens[i].word)) continue;
          const prepTok = tokens[i];

          // Nearest classified verb before the preposition — but only within
          // the SAME clause. The governing verb of a Wechselpräp PP is in its
          // own clause; a coordinating conjunction (und/oder/…) or a comma
          // starts a new clause whose verb must not be borrowed. Without this,
          // «… und reden über die Schule» reached back across «und» to the
          // stative «kochen» and mislabelled the (verb-governed accusative)
          // «über die Schule» as a location-dative mismatch.
          const CLAUSE_COORD = rule.__coord || (rule.__coord = new Set(['und', 'oder', 'aber', 'sondern', 'denn']));
          let vClass = null;
          let vInf = null;
          let vIdx = -1;
          let sawSich = false;
          for (let k = i - 1; k >= sStart; k--) {
            if (CLAUSE_COORD.has(tokens[k].word)) break;
            if (k < i) {
              const between = ctx.text ? ctx.text.slice(tokens[k].end, tokens[k + 1].start) : '';
              if (/[,;:]/.test(between)) break;
            }
            if (tokens[k].word === 'sich') sawSich = true;
            const c = verbClass(tokens[k].word, verbInf);
            if (c) { vClass = c; vInf = (verbInf && verbInf.get(tokens[k].word)) || tokens[k].word; vIdx = k; break; }
          }
          // PUT verbs force accusative only when TRANSITIVE — a direct-object NP
          // between the verb and the preposition ("Ich stelle das Buch auf den
          // Tisch"). With no object the verb is intransitive/locative and takes
          // dative ("Der Schlüssel steckt in der Tür", "hängt an der Wand"), so
          // the put→accusative heuristic must not fire.
          if (vClass === 'put' && vIdx >= 0) {
            let hasObject = false;
            for (let k = vIdx + 1; k < i; k++) {
              const w = tokens[k].word;
              if (nounGenus.has(w) || /^(?:mich|dich|ihn|sie|es|uns|euch|den|einen|meinen|deinen|seinen|ihren)$/.test(w)) { hasObject = true; break; }
            }
            if (!hasObject) continue;
            // Separable "ausstellen" (stellen + trailing "aus" = exhibit/display)
            // is LOCATIVE ("stellt … in einer Galerie aus" → dative), not a
            // placement-toward-a-goal put. A standalone "aus" later in the clause
            // reveals the separable verb → skip.
            if (vInf === 'stellen') {
              for (let k = i + 1; k < sEnd; k++) {
                const bw = ctx.text ? ctx.text.slice(tokens[k - 1].end, tokens[k].start) : '';
                if (/[,;:.!?]/.test(bw)) break;
                if (tokens[k].word === 'aus') { vClass = null; break; }
              }
              if (!vClass) continue;
            }
          }
          // Fixed verb/adjective + preposition object → accusative government,
          // overriding the stative→dative heuristic ("warten auf einen Anruf",
          // "lesen über die Geschichte", "gespannt auf das Konzert"). Also scan
          // the clause for a governing adjective (gespannt/stolz/neugierig …),
          // which isn't a "verb" but pins the case just the same.
          const prepW = tokens[i].word;
          const accGov = ACC_PREP_VERBS[prepW];
          if (accGov) {
            if (vInf && accGov.has(vInf)) continue;
            let adjGov = false;
            for (let k = i - 1; k >= sStart && k >= i - 4; k--) {
              const bw = k < i && ctx.text ? ctx.text.slice(tokens[k].end, tokens[k + 1].start) : '';
              if (/[,;:.!?]/.test(bw)) break;
              if (accGov.has(tokens[k].word)) { adjGov = true; break; }
            }
            if (adjGov) continue;
          }
          // Wikipedia-corpus precision (D2, 2026-06-12): reflexive verbs with
          // prepositional government take a FIXED case regardless of
          // motion/location semantics («spezialisiert sich auf die …»,
          // «bezieht sich auf die Tatsache» — both correct accusative). A
          // `sich` before the preposition means the verb-class heuristic
          // doesn't apply; skip rather than mislabel.
          if (sawSich) continue;

          // Article within the next 1–2 tokens (allow one adjective: "auf dem
          // großen Tisch" — article is still right after the prep).
          let artTok = null, artCase = null;
          for (let j = i + 1; j < Math.min(i + 3, sEnd); j++) {
            const ac = articleCase(tokens[j].word, T);
            if (ac) { artTok = tokens[j]; artCase = ac; break; }
            // stop if we already hit a noun (no article present)
            if (nounGenus.has(tokens[j].word)) break;
            // Article-less capitalized token = a proper-noun prep object ("in
            // Europa …") — the PP ends there; a later article ("die Nummer") is
            // a separate constituent (predicate nominative), not this PP's.
            // Articles/adjectives are lowercase, so this never skips a real one.
            if (/^\p{Lu}/u.test(tokens[j].display)) break;
          }

          let flagged = false;
          if (artTok && vClass && vClass !== 'motion') {
            const wantDat = vClass === 'stative';
            const wantAcc = vClass === 'put';
            if ((wantDat && artCase === 'acc') || (wantAcc && artCase === 'dat')) {
              // Find the noun after the article to compute a gender-correct fix.
              let fix = null;
              const expectedCase = wantDat ? 'dativ' : 'akkusativ';
              for (let n = tokens.indexOf(artTok) + 1; n < Math.min(tokens.indexOf(artTok) + 3, sEnd); n++) {
                const g = nounGenus.get(tokens[n].word);
                if (g) {
                  const tbl = isIndef(artTok.word) ? T.INDEF_CORRECT : T.DEF_CORRECT;
                  const corr = tbl[g + '.' + expectedCase];
                  if (corr && corr !== artTok.word) fix = matchCase(artTok.display, corr);
                  break;
                }
              }
              if (cursorPos == null || !(cursorPos >= artTok.start && cursorPos <= artTok.end + 1)) {
                out.push({
                  rule_id: 'de-wechselpraep',
                  priority: rule.priority,
                  kind: 'mismatch',
                  start: artTok.start,
                  end: artTok.end,
                  original: artTok.display,
                  // D2 (2026-06-12): when no gender-correct article can be
                  // computed, emit the hint WITHOUT a fix — the corpus run
                  // surfaced self-identical suggestions (der→der, eine→eine),
                  // which read as nonsense. explain() already handles a
                  // missing fix («sjekk kasus» without a suggestion).
                  fix: fix || null,
                  prep: prepTok.display,
                  expectedCase,
                  severity: 'hint',
                  message: `«${prepTok.display}» — verbet tyder på ${expectedCase}; sjekk kasus`,
                });
                flagged = true;
              }
            }
          }

          // Layer 2: opt-in self-check hint on the preposition itself.
          if (!flagged && alwaysWarn) {
            if (cursorPos == null || !(cursorPos >= prepTok.start && cursorPos <= prepTok.end + 1)) {
              out.push({
                rule_id: 'de-wechselpraep',
                priority: rule.priority,
                kind: 'check',
                start: prepTok.start,
                end: prepTok.end,
                original: prepTok.display,
                prep: prepTok.display,
                severity: 'hint',
                message: `«${prepTok.display}» er en wechselpreposisjon — sjekk bevegelse/plassering`,
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
