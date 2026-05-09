/**
 * Spell-check rule: FR past-participle agreement with preceding DO (FR-03, priority 72).
 *
 * Phase 10, Plan 03. Flags past-participle (PP) forms that lack feminine/plural
 * agreement when a direct-object pronoun (la, les) precedes the avoir auxiliary.
 *
 *   Wrong:   "je la ai mange"   -> mangee (la = feminine singular, needs -e)
 *   Wrong:   "je les ai mange"  -> manges (les = plural, needs -s)
 *   Correct: "je la ai mangee"  -> no flag (already agrees)
 *   Correct: "elle est allee"   -> no flag (etre construction, not avoir)
 *
 * Scope: Adjacent-window only: [DO-pronoun] [avoir-form] [past-participle].
 *
 * 10.3b deferred to v3.0:
 *   - l' DO-pronoun (requires antecedent gender resolution)
 *   - que relative pronoun (distance > adjacent window)
 *   - Pronominal verbs with reflexive DO
 *   - Elided DO requiring gender inference
 *
 * Feature-gated: grammar_fr_pp_agreement (defaults OFF).
 * Severity: hint (P3 dotted).
 *
 * Rule ID: 'fr-pp-agreement'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // ── Lazy-init grammar tables ──
  let FR_AVOIR_FORMS = null;

  function ensureTables() {
    if (FR_AVOIR_FORMS) return true;
    const tables = host.__lexiGrammarTables;
    if (!tables || !tables.FR_AVOIR_FORMS) return false;
    FR_AVOIR_FORMS = tables.FR_AVOIR_FORMS;
    return true;
  }

  // ── Accent stripping for student-text robustness ──
  function stripAccents(s) {
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  // DO-pronoun tokens that trigger agreement checking.
  // la -> feminine singular (needs -e)
  // les -> plural (needs -s)
  const DO_PRONOUNS = {
    la: { gender: 'f', number: 's', suffix: 'e' },
    les: { gender: null, number: 'p', suffix: 's' },
  };

  // Build accent-stripped participle lookup from vocab seam (cached per check batch).
  let _cachedParticipleMap = null;
  let _cachedParticipleSource = null;

  function getParticipleLookup(participleToAux) {
    if (_cachedParticipleSource === participleToAux) return _cachedParticipleMap;
    const lookup = new Map();
    for (const [pp, aux] of participleToAux) {
      // Store {aux, basePP} so hasAgreement can compare against the canonical base form
      const entry = { aux, basePP: pp };
      lookup.set(pp, entry);
      const stripped = stripAccents(pp);
      if (stripped !== pp && !lookup.has(stripped)) {
        lookup.set(stripped, entry);
      }
    }
    _cachedParticipleMap = lookup;
    _cachedParticipleSource = participleToAux;
    return lookup;
  }

  // Check if a word already has the required agreement ending.
  // Uses the accent-stripped base form from participleToAux to detect whether
  // the student's token has an EXTRA character beyond the base. Example:
  //   base 'mangé' (stripped: 'mange'), student wrote 'mangée' (stripped: 'mangee')
  //   -> mangee is longer than mange by 1 and ends in 'e' → already agreed.
  //   base 'mangé' (stripped: 'mange'), student wrote 'mange' (stripped: 'mange')
  //   -> same length as base → NOT agreed (student just dropped the accent).
  function hasAgreement(word, doInfo, basePP) {
    const strippedWord = stripAccents(word);
    const strippedBase = stripAccents(basePP);
    if (doInfo.suffix === 'e') {
      // Feminine: stripped word must be longer than stripped base and end in -e
      // (mangée -> mangee vs mangé -> mange: mangee.length > mange.length)
      // OR the base itself has an -e suffix beyond its root (prise vs pris)
      return strippedWord.length > strippedBase.length && strippedWord.endsWith('e');
    }
    if (doInfo.suffix === 's') {
      // Plural: must end in -s
      return word.endsWith('s');
    }
    return false;
  }

  // Generate agreement suggestion by appending suffix.
  function makeSuggestion(display, doInfo) {
    return display + doInfo.suffix;
  }

  const rule = {
    id: 'fr-pp-agreement',
    languages: ['fr'],
    priority: 72,
    // exam-audit 33-03: stays safe=false — Past-participle agreement requires multi-token + gender/number context; not single-token lookup
    exam: {
      safe: false,
      reason: "Stays safe=false (fr-pp-agreement) — Past-participle agreement requires multi-token + gender/number context; not single-token lookup",
      category: "grammar-lookup",
    },
    severity: 'hint',
    explain: (finding) => {
      const pp = finding.original || '';
      const fix = finding.fix || '';
      return {
        nb: `Partisippet <em>${escapeHtml(pp)}</em> ma samsvarboyes med det direkte objektet som star foran: <em>${escapeHtml(fix)}</em>.`,
        nn: `Partisippet <em>${escapeHtml(pp)}</em> ma samsvarboyas med det direkte objektet som star framfor: <em>${escapeHtml(fix)}</em>.`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      if (!ctx.vocab || !ctx.vocab.isFeatureEnabled ||
          !ctx.vocab.isFeatureEnabled('grammar_fr_pp_agreement')) return [];
      if (!ensureTables()) return [];

      const participleToAux = (ctx.vocab && ctx.vocab.participleToAux)
        ? ctx.vocab.participleToAux
        : new Map();
      if (!participleToAux || participleToAux.size === 0) return [];

      const ppLookup = getParticipleLookup(participleToAux);
      const { tokens, cursorPos } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length - 2; i++) {
        const doToken = tokens[i];
        const doInfo = DO_PRONOUNS[doToken.word];
        if (!doInfo) continue;

        const auxToken = tokens[i + 1];
        // Check if next token is a known avoir form
        if (!FR_AVOIR_FORMS[auxToken.word]) continue;

        const ppToken = tokens[i + 2];
        // Skip if cursor is near the finding
        if (cursorPos != null && cursorPos >= doToken.start && cursorPos <= ppToken.end + 1) continue;

        const ppWord = ppToken.word; // already lowercase
        const ppStripped = stripAccents(ppWord);

        // Look up the participle (try exact, then accent-stripped)
        const entry = ppLookup.get(ppWord) || ppLookup.get(ppStripped);
        if (!entry) continue;

        // Skip etre constructions — PP agreement with etre is different
        if (entry.aux === 'etre' || entry.aux === 'être') continue;

        // Check if PP already has correct agreement ending
        if (hasAgreement(ppWord, doInfo, entry.basePP)) continue;

        // Flag: PP needs agreement
        const suggestion = makeSuggestion(ppToken.display, doInfo);

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: ppToken.start,
          end: ppToken.end,
          original: ppToken.display,
          fix: suggestion,
          message: `Samsvarsboyning: "${ppToken.display}" -> "${suggestion}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
