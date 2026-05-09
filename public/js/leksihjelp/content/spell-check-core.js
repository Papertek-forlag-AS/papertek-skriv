/**
 * Leksihjelp — Spell / Grammar Check Core (rule registry runner)
 *
 * Pure, side-effect-free rule evaluator used by both:
 *   - extension/content/spell-check.js (browser DOM adapter)
 *   - scripts/check-fixtures.js        (Node fixture harness, Plan 03)
 *
 * INFRA-03: this file is now ONLY the runner + shared helpers. Each rule
 * (gender, modal_form, sarskriving, typo curated, typo fuzzy) lives in its
 * own file under extension/content/spell-rules/ and registers itself onto
 * `self.__lexiSpellRules` at IIFE load time. Adding a new rule = create one
 * file + add one manifest line; zero edits to this file.
 *
 * Dual-export footer: writes `self.__lexiSpellCore` in the browser and
 * `module.exports` in Node — same API, same code path. Also initializes
 * `self.__lexiSpellRules = []` so rule files loaded BEFORE core (or
 * out-of-order) still find a registry to push onto.
 *
 * This file MUST NOT reference DOM globals (the "document" object), the
 * chrome extension runtime, timers, or any other browser-only API. It takes
 * vocabulary indexes as arguments and returns an array of Finding objects.
 *
 * Span convention: start is inclusive, end is exclusive (Python-style).
 * end = start + word.length. Plan 03 fixtures reference this comment.
 *
 * Output field name: findings use `rule_id` (not `type`). The DOM adapter
 * in spell-check.js may alias `f.type = f.rule_id` for legacy UI code.
 * Fixture files reference `rule_id`; mismatched names silently fail.
 */

(function () {
  'use strict';

  // ── Tokenization ──

  // WORD_RE: matches letters, but also allows internal apostrophes (e.g. they're, don't)
  const WORD_RE = /[\p{L}]+(?:'[\p{L}]+)*/gu;

  function tokenize(text) {
    const out = [];
    WORD_RE.lastIndex = 0;
    let m;
    while ((m = WORD_RE.exec(text))) {
      out.push({
        word: m[0].toLowerCase(),
        display: m[0],
        start: m.index,
        end: m.index + m[0].length,  // end is exclusive (past-the-end)
      });
    }
    return out;
  }

  // ── Word-order infrastructure (INFRA-06, Phase 7) ──

  const SUBORDINATORS = {
    nb: new Set(['fordi', 'at', 'som', 'når', 'hvis', 'selv', 'om', 'da', 'mens', 'etter', 'før', 'siden', 'dersom', 'enda', 'skjønt', 'ettersom']),
    nn: new Set(['fordi', 'at', 'som', 'når', 'viss', 'sjølv', 'om', 'då', 'mens', 'etter', 'før', 'sidan', 'dersom', 'endå', 'trass']),
    de: new Set(['dass', 'weil', 'wenn', 'ob', 'obwohl', 'als', 'bevor', 'nachdem', 'damit', 'sodass', 'solange', 'sobald', 'seit', 'seitdem', 'während', 'indem', 'falls']),
    fr: new Set(['que', 'quand', 'si', 'parce', 'lorsque', 'puisque', 'comme', 'pendant', 'avant', 'après', 'bien', 'pour', 'afin', 'tandis', 'dès']),
  };

  const SUBJECT_PRONOUNS = {
    nb: new Set(['jeg', 'du', 'han', 'hun', 'den', 'det', 'vi', 'dere', 'de', 'man', 'en']),
    nn: new Set(['eg', 'du', 'han', 'ho', 'den', 'det', 'vi', 'dykk', 'dei', 'ein']),
    de: new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man']),
    fr: new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles']),
    es: new Set(['yo', 'tu', 'el', 'ella', 'nosotros', 'vosotros', 'ellos', 'ellas', 'usted', 'ustedes']),
  };

  function buildFiniteStems(vocab) {
    const stems = new Set();
    for (const form of (vocab.knownPresens || new Set())) {
      if (form.includes(' ')) stems.add(form.split(' ')[0]);
    }
    for (const form of (vocab.knownPreteritum || new Set())) {
      if (form.includes(' ')) stems.add(form.split(' ')[0]);
    }
    return stems;
  }

  // classifyPOS: word parameter is already lowercased by the caller
  function classifyPOS(word, vocab, lang) {
    if (SUBORDINATORS[lang] && SUBORDINATORS[lang].has(word)) return 'sub';
    if (SUBJECT_PRONOUNS[lang] && SUBJECT_PRONOUNS[lang].has(word)) return 'pron';
    if (vocab.knownPresens && vocab.knownPresens.has(word)) return 'verb';
    if (vocab.knownPreteritum && vocab.knownPreteritum.has(word)) return 'verb';
    if (vocab.verbInfinitive && vocab.verbInfinitive.has(word)) return 'verb';
    if (vocab.isAdjective && vocab.isAdjective.has(word)) return 'adj';
    if (vocab.nounGenus && vocab.nounGenus.has(word)) return 'noun';
    return 'other';
  }

  function findFiniteVerb(ctx, start, end) {
    for (let i = start; i < end; i++) {
      if (ctx.getTagged(i).isFinite) return i;
    }
    return -1;
  }

  function findSubordinator(ctx, start, end) {
    for (let i = start; i < end; i++) {
      if (ctx.getTagged(i).isSubordinator) return i;
    }
    return -1;
  }

  function isMainClause(ctx, start, end) {
    const sub = findSubordinator(ctx, start, end);
    const verb = findFiniteVerb(ctx, start, end);
    // If subordinator found before the finite verb, this is a subordinate clause
    return sub === -1 || (verb !== -1 && sub > verb);
  }

  function tokensInSentence(ctx, sentence) {
    const first = ctx.tokens.findIndex(t => t.start >= sentence.start);
    if (first === -1) return { start: 0, end: 0 };
    let last = first;
    while (last < ctx.tokens.length && ctx.tokens[last].end <= sentence.end) last++;
    return { start: first, end: last };
  }

  // ── Generic rule runner ──
  //
  // Iterates self.__lexiSpellRules filtered by language and sorted by
  // priority. Rule bodies live in extension/content/spell-rules/. Lower
  // priority runs first; dedupeOverlapping keeps the earliest-listed finding
  // on overlap (load-bearing — see spell-rules/README.md).
  function check(text, vocab, opts = {}) {
    const { cursorPos = null, lang = 'nb' } = opts;
    if (!text || text.length < 3) return [];
    const supported = ['nb', 'nn', 'en', 'de', 'es', 'fr'];
    if (!supported.includes(lang)) return [];

    const tokens = tokenize(text);
    if (tokens.length < 2) return [];

    // Phase 6: Sentence segmentation via Intl.Segmenter. Rules (priority 60+)
    // that need sentence boundaries read ctx.sentences. Graceful fallback to
    // a single whole-text sentence when the API is unavailable (Node < 18.x,
    // older browsers).
    let sentences = [];
    if (typeof Intl !== 'undefined' && Intl.Segmenter) {
      const segmenter = new Intl.Segmenter(lang, { granularity: 'sentence' });
      sentences = [...segmenter.segment(text)].map(seg => ({
        text: seg.segment,
        start: seg.index,
        end: seg.index + seg.segment.length,
      }));
    } else {
      sentences = [{ text, start: 0, end: text.length }];
    }

    const vocabRef = vocab || {};
    // Phase 4: `suppressed` is the shared "do not flag this token index" Set.
    // Pre-pass rules (priority 1-9) populate it; typo/sarskriving rules
    // (priority >= 10) honor it by `if (ctx.suppressed.has(i)) continue` in
    // their per-token loop. gender/modal rules do NOT opt in — they fire on
    // real-grammar patterns (article-mismatch, modal+finite-verb) regardless
    // of whether the span is a name or code-switched quote. See
    // spell-rules/README.md for the convention.
    //
    // Phase 6: `suppressedFor.structural` is populated by the
    // quotation-suppression pre-pass (priority 3). Structural/register rules
    // (priority 60+) honor it; token-local grammar rules (priority 10-55)
    // do NOT check it — they only check `ctx.suppressed`.
    const ctx = {
      text, tokens, vocab: vocabRef, cursorPos, lang,
      suppressed: new Set(),
      suppressedFor: { structural: new Set() },
      sentences,
    };

    // Phase 7 / INFRA-06: tagged-token view. ctx.getTagged(i) returns a
    // cached POS-tagged token with isFinite, isSubordinator, isSubject fields.
    // Word-order rules (priority 70+) consume this instead of raw ctx.tokens.
    const _tagCache = new Map();
    const _finiteStems = buildFiniteStems(vocabRef);
    ctx.getTagged = function(i) {
      if (_tagCache.has(i)) return _tagCache.get(i);
      const tok = ctx.tokens[i];
      if (!tok) return null;
      const w = tok.word.toLowerCase();
      const tag = {
        ...tok,
        pos: classifyPOS(w, vocabRef, lang),
        isFinite: !!(vocabRef.knownPresens && vocabRef.knownPresens.has(w)) ||
                  !!(vocabRef.knownPreteritum && vocabRef.knownPreteritum.has(w)) ||
                  _finiteStems.has(w),
        isSubordinator: !!(SUBORDINATORS[lang] && SUBORDINATORS[lang].has(w)),
        isSubject: !!(SUBJECT_PRONOUNS[lang] && SUBJECT_PRONOUNS[lang].has(w)),
      };
      _tagCache.set(i, tag);
      return tag;
    };

    const host = typeof self !== 'undefined' ? self : globalThis;
    const allRules = host.__lexiSpellRules || [];
    const rules = allRules
      .filter(r => Array.isArray(r.languages) && r.languages.includes(lang))
      .slice()
      .sort((a, b) => (a.priority || 999) - (b.priority || 999));

    // Phase 39+: rulePedagogy is keyed by rule_id (centralized "Lær mer"
    // lessons sourced from papertek-vocabulary's grammarbank.pedagogy).
    // Auto-attach by finding.rule_id below, so adding a new pedagogy entry
    // for an existing rule is a pure data change in papertek-vocabulary —
    // no leksihjelp-side wiring needed.
    const rulePedagogy = (vocab && vocab.rulePedagogy) || null;

    const findings = [];
    for (const rule of rules) {
      try {
        const out = rule.check(ctx);
        if (Array.isArray(out) && out.length) {
          // Phase 6: stamp severity from the parent rule onto each finding
          // so the DOM adapter can map to the correct CSS tier.
          for (const f of out) {
            if (!f.severity && rule.severity) f.severity = rule.severity;
            // Auto-attach pedagogy: rule_id-keyed remote lesson takes
            // precedence over the rule's inline rule.pedagogy literal,
            // and explicit f.pedagogy from the rule's own lookup wins
            // over both (e.g. es-por-para keys by `fix` word, de-prep-case
            // keys by preposition+case).
            if (!f.pedagogy && f.rule_id) {
              const remote = rulePedagogy ? rulePedagogy.get(f.rule_id) : null;
              f.pedagogy = remote || rule.pedagogy || null;
            }
          }
          findings.push(...out);
        }
      } catch (e) {
        if (!rule._warned) {
          console.warn('[lexi-spell] rule', rule.id, 'threw', e);
          rule._warned = true;
        }
      }
    }

    // ── Phase 13: Document-level post-pass (INFRA-07) ──
    // Document rules (kind: 'document', priority 200+) receive the full ctx
    // AND the pass-1 findings array. They run AFTER all token-level rules.
    // Their check(ctx) returns [] (harmless no-op in pass-1); the real logic
    // lives in checkDocument(ctx, findings).
    const docRules = rules.filter(r => r.kind === 'document');
    for (const rule of docRules) {
      try {
        const out = rule.checkDocument(ctx, findings);
        if (Array.isArray(out) && out.length) {
          for (const f of out) {
            if (!f.severity && rule.severity) f.severity = rule.severity;
            // Auto-attach pedagogy: rule_id-keyed remote lesson takes
            // precedence over the rule's inline rule.pedagogy literal,
            // and explicit f.pedagogy from the rule's own lookup wins
            // over both (e.g. es-por-para keys by `fix` word, de-prep-case
            // keys by preposition+case).
            if (!f.pedagogy && f.rule_id) {
              const remote = rulePedagogy ? rulePedagogy.get(f.rule_id) : null;
              f.pedagogy = remote || rule.pedagogy || null;
            }
          }
          findings.push(...out);
        }
      } catch (e) {
        if (!rule._warned) {
          console.warn('[lexi-spell] doc-rule', rule.id, 'threw', e);
          rule._warned = true;
        }
      }
    }

    return dedupeOverlapping(findings);
  }

  // ── Shared helpers (used by rule files via self.__lexiSpellCore) ──

  // Detect proper-noun-like tokens: capitalized first letter AND not at the
  // start of a sentence. Sentence starts are either position 0 in the text or
  // immediately preceded by a sentence-ending punctuation.
  function isLikelyProperNoun(tok, idx, toks, text) {
    const first = tok.display[0];
    if (first !== first.toUpperCase() || first === first.toLowerCase()) return false;
    if (idx === 0) return false;
    // Look at chars between previous token and this one
    const prevTok = toks[idx - 1];
    const between = text.slice(prevTok.end, tok.start);
    if (/[.!?]/.test(between)) return false;
    return true;
  }

  // Bounded Damerau-Levenshtein. Returns edit distance between a and b, or
  // k + 1 if known to exceed k (early abort). Treats a single transposition
  // of adjacent characters as one edit, so "nrosk"/"norsk" is distance 1 —
  // the most common class of typing error for learners.
  //
  // Existing implementation beats `fast-levenshtein` because it handles the
  // adjacent-transposition case ("berde" → "bedre" is distance 1, not 2).
  // Do not replace with a library.
  function editDistance(a, b, k) {
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > k) return k + 1;
    // Full matrix — word lengths are small, so memory isn't a concern and
    // we need three rows of history for the transposition case.
    const dp = [];
    for (let i = 0; i <= la; i++) {
      dp.push(new Array(lb + 1).fill(0));
      dp[i][0] = i;
    }
    for (let j = 0; j <= lb; j++) dp[0][j] = j;
    for (let i = 1; i <= la; i++) {
      let rowMin = dp[i][0];
      for (let j = 1; j <= lb; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        let v = Math.min(
          dp[i - 1][j] + 1,       // delete
          dp[i][j - 1] + 1,       // insert
          dp[i - 1][j - 1] + cost // substitute
        );
        if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
          v = Math.min(v, dp[i - 2][j - 2] + 1); // transpose
        }
        dp[i][j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > k) return k + 1;
    }
    return dp[la][lb];
  }

  function findFuzzyNeighbor(word, validWords) {
    const len = word.length;
    // Tighter threshold for short words — 1 edit out of 4 chars is already
    // a lot of signal to drop, but 1 edit out of 8+ is common.
    const k = len <= 6 ? 1 : 2;
    let best = null;
    let bestScore = -Infinity; // higher is better
    const first = word[0];
    for (const cand of validWords) {
      const cl = cand.length;
      if (Math.abs(cl - len) > k) continue;
      if (cand[0] !== first) continue; // Very common typos keep the first char
      if (cand === word) continue;
      const d = editDistance(word, cand, k);
      if (d > k) continue;
      const score = scoreCandidate(word, cand, d);
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
    }
    return best;
  }

  // Scoring heuristic, higher is better:
  //   + 15 × prefix chars shared (start of word rarely typo'd)
  //   + 10 × suffix chars shared (Norwegian inflection often at the end)
  //   - 100 × edit distance (distance-1 beats distance-2 comfortably)
  //   - 50 if the candidate is shorter than the query (users rarely type
  //         extra letters they didn't intend, so prefer
  //         transpositions/insertions over deletions). This is what makes
  //         "Skirver" pick "Skriver" over "Skiver".
  //   + 40 if the candidate is an adjacent-char transposition of the query.
  //         Transposed-adjacent typos are the most common typing error,
  //         so "berde" → "bedre" (transposition) beats "berde" → "berre"
  //         (substitution) even though both are 1-edit.
  function scoreCandidate(query, cand, d) {
    const pref = sharedPrefixLen(query, cand);
    const suff = sharedSuffixLen(query, cand);
    let s = pref * 15 + suff * 10 - d * 100;
    if (cand.length < query.length) s -= 50;
    if (isAdjacentTransposition(query, cand)) s += 40;
    return s;
  }

  // True iff `cand` is `query` with exactly one pair of adjacent characters
  // swapped. Same length. "berde" vs "bedre" → true.
  function isAdjacentTransposition(a, b) {
    if (a.length !== b.length) return false;
    let firstDiff = -1;
    let diffCount = 0;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) {
        if (firstDiff === -1) firstDiff = i;
        diffCount++;
        if (diffCount > 2) return false;
      }
    }
    return diffCount === 2 &&
      firstDiff + 1 < a.length &&
      a[firstDiff] === b[firstDiff + 1] &&
      a[firstDiff + 1] === b[firstDiff];
  }

  function sharedPrefixLen(a, b) {
    const n = Math.min(a.length, b.length);
    let i = 0;
    while (i < n && a[i] === b[i]) i++;
    return i;
  }

  function sharedSuffixLen(a, b) {
    const la = a.length;
    const lb = b.length;
    const n = Math.min(la, lb);
    let i = 0;
    while (i < n && a[la - 1 - i] === b[lb - 1 - i]) i++;
    return i;
  }

  // When two findings cover overlapping spans (e.g., særskriving + typo on
  // the same word), keep the earlier-listed one — order in the rules array
  // (sorted by priority) mirrors pedagogical priority. This ordering is
  // exercised by the fixture suite in Plan 03; do not reorder rule
  // priorities in spell-rules/* without re-running the fixtures.
  function dedupeOverlapping(findings) {
    const kept = [];
    for (const f of findings) {
      const conflict = kept.some(k => !(f.end <= k.start || f.start >= k.end));
      if (!conflict) kept.push(f);
    }
    return kept;
  }

  function matchCase(original, replacement) {
    if (!original || !replacement) return replacement;
    if (original[0] === original[0].toUpperCase() && original[0] !== original[0].toLowerCase()) {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  // Node-safe HTML escape — used by rule explain() builders to safely
  // interpolate user-typed tokens inside <em> wrappers. Phase 5 / UX-01.
  //
  // Uses String.replace (not document.createElement) so the helper runs in
  // both the Node fixture harness AND the browser content-script context.
  // The popover in spell-check.js has its own DOM-based escapeHtml (line ~565)
  // which stays in place; Plan 03 may or may not consolidate.
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
  }

  /**
   * Per-target-locale string lookup for spell-rule explain() callables.
   *
   * Reads __lexiI18n.STRINGS[lang][key] DIRECTLY — bypasses __lexiI18n.t()
   * which routes via the UI locale stored in chrome.storage. Gap C needs
   * per-target-locale lookup because explain() produces both nb and nn
   * strings in one call (routed by document lang, not UI lang).
   *
   * Falls back to NB then to the raw key if the requested locale+key is
   * missing — defensive for early-render / partial-i18n-load scenarios
   * (and for Node, where __lexiI18n is not loaded at all — fixture harness
   * does not exercise explain(), and check-explain-contract only verifies
   * shape using a fake finding, so the key-fallback is benign).
   *
   * Phase 05.1 / Gap C — added for nb-gender's three-beat copy. Reusable
   * for future rules needing cross-locale labels.
   */
  function getString(key, lang) {
    const host = typeof self !== 'undefined' ? self : globalThis;
    const STRINGS = (host.__lexiI18n && host.__lexiI18n.STRINGS) || {};
    return (STRINGS[lang] && STRINGS[lang][key]) || (STRINGS.nb && STRINGS.nb[key]) || key;
  }

  // ── Dual-export footer ──
  // Writes `self.__lexiSpellCore` in the browser (content script) AND
  // `module.exports` in Node — same API, same code path. `self` is defined
  // both in content scripts and in Node 18+. ALSO initializes the rule
  // registry array so rule files loading either before or after core still
  // find it (belt-and-braces against manifest-order drift).
  const api = {
    check,
    tokenize,
    editDistance,
    matchCase,
    escapeHtml,
    getString,
    dedupeOverlapping,
    sharedPrefixLen,
    sharedSuffixLen,
    isAdjacentTransposition,
    isLikelyProperNoun,
    scoreCandidate,
    findFuzzyNeighbor,
    findFiniteVerb,
    findSubordinator,
    isMainClause,
    tokensInSentence,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellCore = api;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  // ── Phase 27: Exam-mode helper (single source of truth) ──
  // Used by spell-check.js, floating-widget.js, word-prediction.js, popup.js
  // to gate non-exam-safe surfaces and rules. Reads markers from rule objects
  // and from host.__lexiExamRegistry (defined in extension/exam-registry.js).
  // Fail-safe: unknown surface IDs return false (hidden) when exam mode is on.
  host.__lexiExam = host.__lexiExam || {
    isSurfaceSafe(surfaceId, examMode) {
      if (!examMode) return true;
      const reg = (host.__lexiExamRegistry) || [];
      const e = reg.find(x => x && x.id === surfaceId);
      return e ? e.exam && e.exam.safe === true : false; // unknown surface = fail-safe (hidden)
    },
    isRuleSafe(rule, examMode) {
      if (!examMode) return true;
      return !!(rule && rule.exam && rule.exam.safe === true);
    },
    isExplainSafe(rule, examMode) {
      if (!examMode) return true;
      if (!rule || !rule.explain || !rule.explain.exam) return this.isRuleSafe(rule, examMode);
      return rule.explain.exam.safe === true;
    },
    /**
     * Read chrome.storage.local.examMode (default false). Promise resolves
     * to a boolean. Degrades gracefully when chrome.storage is unavailable
     * (Node tests, some lockdown shim contexts) — defaults to false (off).
     */
    getExamMode() {
      return new Promise(resolve => {
        try {
          if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            resolve(false);
            return;
          }
          chrome.storage.local.get(['examMode'], (res) => {
            resolve(!!(res && res.examMode));
          });
        } catch (_) {
          resolve(false);
        }
      });
    },
  };
})();
