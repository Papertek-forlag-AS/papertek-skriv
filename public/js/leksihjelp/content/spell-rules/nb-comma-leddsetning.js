/**
 * Spell-check rule: NB/NN comma after a fronted subordinate clause
 * (nb-comma-leddsetning, priority 56).
 *
 * Norwegian requires a comma AFTER a subordinate clause (leddsetning) when it
 * stands first in the sentence, before the main clause:
 *   Wrong:   "Da jeg kom hjem spiste jeg middag."
 *   Correct: "Da jeg kom hjem, spiste jeg middag."
 * This is one of the most-taught Norwegian comma rules and a very common
 * student error. Unlike a relative-clause or coordinating comma, it is
 * OBLIGATORY, so its absence can be flagged without the optional-comma trap.
 *
 * Detection (the inverse of nb-v2's "skip subordinate clauses" branch):
 *   1. The sentence starts with a high-confidence subordinating conjunction
 *      (da/når/hvis/dersom/fordi/siden/ettersom/mens + NN cognates).
 *   2. It is a real subordinate clause, i.e. SVO: the token after the
 *      subjunction is a subject/noun, NOT a finite verb. This rejects the
 *      adverb reading "Da kom han hjem" (subjunction slot filled by an adverb
 *      → V2 inversion, no comma).
 *   3. The subordinate clause has its own finite verb.
 *   4. The main clause begins with inversion — a finite verb immediately
 *      followed by a subject pronoun ("spiste jeg", "ble han", "gikk vi").
 *      That verb is where the comma must go; if the gap before it has no
 *      comma (or other clause boundary), flag it.
 *
 * Ambiguous subjunctions are deliberately excluded (som = relative, at =
 * complement, om = about/whether, før/etter = also prepositions, selv/sjølv =
 * needs "om") to keep precision high — the whole point of the tool.
 *
 * Severity: warning (amber). Auto-fixable (clean ", verb" insertion).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // High-confidence, sentence-initial subordinating conjunctions only.
  const SUBJUNCTIONS = {
    nb: new Set(['da', 'når', 'hvis', 'dersom', 'fordi', 'siden', 'ettersom', 'mens']),
    nn: new Set(['då', 'når', 'viss', 'dersom', 'fordi', 'sidan', 'ettersom', 'medan']),
  };

  const SUBJECT_PRONOUNS = {
    nb: new Set(['jeg', 'du', 'han', 'hun', 'den', 'det', 'vi', 'dere', 'de', 'man']),
    nn: new Set(['eg', 'du', 'han', 'ho', 'den', 'det', 'vi', 'dykk', 'dei', 'ein']),
  };
  // Combined set for subordinate-clause subject detection (dialect tolerance:
  // a leaked "jeg" in NN text is still a subject; dialect-mix flags the register
  // separately).
  const ANY_SUBJECT = new Set([...SUBJECT_PRONOUNS.nb, ...SUBJECT_PRONOUNS.nn]);
  // Determiners that can head the subordinate clause's subject NP
  // ("Dersom den gamle mannen ...", "Når det regner ...").
  const DETERMINERS = new Set(['den', 'det', 'de', 'dei', 'denne', 'dette', 'desse', 'disse', 'en', 'et', 'ei', 'ein']);

  // Closed finite-verb sets for main/subordinate verb detection. We check
  // knownPresens/knownPreteritum directly (like nb-v2) rather than isFinite,
  // which over-matches stems from multi-word forms. Copulas/auxiliaries/modals
  // may be missing from those Sets, so carry them explicitly.
  const FIN_AUX = new Set([
    'er', 'var', 'vere', 'være', 'vart', 'blei', 'blir', 'ble', 'vert', 'vore', 'vært',
    'har', 'hadde', 'hev',
    'skal', 'kan', 'må', 'vil', 'bør', 'tør', 'lar', 'lèt',
    'skulle', 'kunne', 'måtte', 'ville', 'burde',
  ]);

  const rule = {
    id: 'nb-comma-leddsetning',
    languages: ['nb', 'nn'],
    priority: 56,
    // Multi-token syntactic analysis (clause structure), not a token lookup —
    // mirrors nb-v2's exam classification.
    exam: {
      safe: false,
      reason: "Stays safe=false (nb-comma-leddsetning) — clause-structure analysis for comma after a fronted subordinate clause; syntactic, not lookup",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      const v = escapeHtml(finding && finding.original ? finding.original : '');
      return {
        nb: `Når en leddsetning står først i setningen, skal det komma etter den — foran hovedsetningen. Skriv <em>, ${v}</em>.`,
        nn: `Når ei leddsetning står først i setninga, skal det komma etter henne — framfor hovudsetninga. Skriv <em>, ${v}</em>.`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'nb' && ctx.lang !== 'nn') return [];
      if (!ctx.sentences || !core.tokensInSentence) return [];

      const lang = ctx.lang;
      const subj = SUBJUNCTIONS[lang] || SUBJUNCTIONS.nb;
      const subjectPron = SUBJECT_PRONOUNS[lang] || SUBJECT_PRONOUNS.nb;
      const knownPresens = (ctx.vocab && ctx.vocab.knownPresens) || new Set();
      const knownPreteritum = (ctx.vocab && ctx.vocab.knownPreteritum) || new Set();
      const nounGenus = (ctx.vocab && ctx.vocab.nounGenus) || new Map();
      const cursorPos = ctx.cursorPos;

      const isFinite = (w) => knownPresens.has(w) || knownPreteritum.has(w) || FIN_AUX.has(w);
      const findings = [];

      for (const sentence of ctx.sentences) {
        const range = core.tokensInSentence(ctx, sentence);
        if (range.end - range.start < 4) continue;

        const fw = ctx.getTagged(range.start).word.toLowerCase();
        if (!subj.has(fw)) continue;
        // "når" doubles as a wh-word — a question is inversion, not a leddsetning.
        if (sentence.text.trimEnd().endsWith('?')) continue;

        // Subordinate clause must be SVO: the token after the subjunction is a
        // subject/noun, NOT a finite verb. Rejects the adverb reading
        // "Da kom han hjem" (V2 inversion — no comma).
        const t1 = ctx.getTagged(range.start + 1);
        if (!t1) continue;
        const w1 = t1.word.toLowerCase();
        if (isFinite(w1)) continue;
        const subjectLike = ANY_SUBJECT.has(w1) || DETERMINERS.has(w1) || nounGenus.has(w1);
        if (!subjectLike) continue;

        // Subordinate clause's own finite verb.
        let vSub = -1;
        for (let j = range.start + 2; j < range.end; j++) {
          if (isFinite(ctx.getTagged(j).word.toLowerCase())) { vSub = j; break; }
        }
        if (vSub < 0) continue;

        // Main clause boundary: first inversion [finite verb][subject pronoun]
        // after the subordinate verb.
        let m = -1;
        for (let j = vSub + 1; j < range.end - 1; j++) {
          const wj = ctx.getTagged(j).word.toLowerCase();
          const next = ctx.getTagged(j + 1);
          if (!next) continue;
          if (isFinite(wj) && subjectPron.has(next.word.toLowerCase())) { m = j; break; }
        }
        if (m < 0) continue;

        // Skip if a clause boundary (comma/semicolon/colon/dash) already sits
        // before the main verb.
        const mTok = ctx.tokens[m];
        const prevTok = ctx.tokens[m - 1];
        if (!mTok || !prevTok) continue;
        const gap = ctx.text.slice(prevTok.end, mTok.start);
        if (/[,;:—–]/.test(gap)) continue;

        // Cursor guard — don't flag the token being typed.
        if (cursorPos != null && cursorPos >= mTok.start && cursorPos <= mTok.end + 1) continue;

        findings.push({
          rule_id: 'nb-comma-leddsetning',
          priority: rule.priority,
          start: mTok.start,
          end: mTok.end,
          original: mTok.display,
          fix: ', ' + mTok.display,
          message: `Mangler komma etter leddsetningen, foran «${mTok.display}»`,
          severity: 'warning',
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
