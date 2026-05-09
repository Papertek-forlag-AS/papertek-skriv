/**
 * Spell-check rule: Spanish personal "a" missing marker (ES-03, priority 55).
 *
 * Phase 9. Flags missing personal "a" before human direct objects:
 *   Wrong:   "Veo Juan" -> suggest "a Juan"
 *   Wrong:   "Ayudo mi madre" -> suggest "a mi madre"
 *   Correct: "Veo a Juan" (personal "a" present)
 *   Correct: "Veo la casa" (non-human object)
 *   Correct: "Soy profesor" (copula verb, not transitive)
 *
 * Consumes ES_HUMAN_NOUNS, ES_COPULA_VERBS, ES_SER_FORMS, ES_ESTAR_FORMS
 * from grammar-tables.js. Uses isLikelyProperNoun from spell-check-core.js.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { isLikelyProperNoun: coreIsProperNoun } = core;

  // Fallback for isLikelyProperNoun (matches spell-check-core.js logic)
  function isLikelyProperNoun(tok, idx, toks, text) {
    if (coreIsProperNoun) return coreIsProperNoun(tok, idx, toks, text);
    const first = tok.display[0];
    if (first !== first.toUpperCase() || first === first.toLowerCase()) return false;
    if (idx === 0) return false;
    const prevTok = toks[idx - 1];
    const between = text.slice(prevTok.end, tok.start);
    if (/[.!?]/.test(between)) return false;
    return true;
  }

  // ── Place names blocklist (conservative: do NOT flag these as human) ──
  const PLACE_NAMES = new Set([
    'madrid', 'barcelona', 'espana', 'mexico', 'colombia', 'argentina',
    'peru', 'chile', 'francia', 'alemania', 'noruega', 'europa',
    'america', 'africa', 'asia', 'sevilla', 'valencia', 'bilbao',
    'granada', 'toledo', 'salamanca', 'malaga', 'zaragoza',
    'lima', 'bogota', 'santiago', 'buenos', 'caracas',
  ]);

  // ── Spanish prepositions (if one precedes the noun, it's not a bare DO) ──
  const PREPOSITIONS = new Set([
    'a', 'en', 'con', 'de', 'por', 'para', 'sin', 'sobre',
    'entre', 'hacia', 'hasta', 'desde', 'ante', 'bajo', 'contra',
    'segun', 'tras',
  ]);

  // ── Possessive determiners ──
  const POSSESSIVES = new Set([
    'mi', 'tu', 'su', 'nuestro', 'vuestro',
    'mis', 'tus', 'sus', 'nuestros', 'vuestros',
    'nuestra', 'vuestras', 'nuestras', 'vuestra',
  ]);

  // ── Lazy-init grammar tables ──
  let _tables = null;
  function getTables() {
    if (_tables) return _tables;
    const gt = host.__lexiGrammarTables || {};
    _tables = {
      HUMAN_NOUNS: gt.ES_HUMAN_NOUNS || new Set(),
      COPULA_VERBS: gt.ES_COPULA_VERBS || new Set(),
      SER_FORMS: gt.ES_SER_FORMS || new Set(),
      ESTAR_FORMS: gt.ES_ESTAR_FORMS || new Set(),
    };
    return _tables;
  }

  function isCopulaForm(word) {
    const { COPULA_VERBS, SER_FORMS, ESTAR_FORMS } = getTables();
    if (SER_FORMS.has(word)) return true;
    if (ESTAR_FORMS.has(word)) return true;
    if (COPULA_VERBS.has(word)) return true;
    // Common conjugated forms of parecer
    if (/^parec/.test(word)) return true;
    return false;
  }

  const rule = {
    id: 'es-personal-a',
    languages: ['es'],
    priority: 55,
    // exam-audit 33-03: stays safe=false — Insertion of "a" before animate direct object; multi-token edit beyond Chrome parity
    exam: {
      safe: false,
      reason: "Stays safe=false (es-personal-a) — Insertion of personal 'a' before animate direct object; multi-token edit beyond Chrome parity",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: function (finding) {
      return {
        nb: 'Spansk bruker "a" foran menneskelige direkte objekter. Prov <em>' + (finding.fix || '') + '</em>.',
        nn: 'Spansk brukar "a" framfor menneskelege direkte objekt. Prov <em>' + (finding.fix || '') + '</em>.',
      };
    },
    check(ctx) {
      if (ctx.lang !== 'es') return [];
      const { tokens, cursorPos } = ctx;
      const { HUMAN_NOUNS } = getTables();
      const findings = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        // Step a: Check if token is a conjugated verb (finite form)
        const tagged = ctx.getTagged(i);
        if (!tagged || !tagged.isFinite) continue;

        // Skip prepositions/function words that happen to match finite stems
        // (e.g. "a" from "a causa de" verb forms creates a false finite tag)
        if (PREPOSITIONS.has(t.word)) continue;
        if (t.word.length <= 2 && !ctx.vocab.knownPresens.has(t.word) && !ctx.vocab.knownPreteritum.has(t.word)) continue;

        // Step c: Skip copula verbs
        if (isCopulaForm(t.word)) continue;

        const next = tokens[i + 1];
        if (!next) continue;

        // Sentence-boundary guard: if the verb and the following token are
        // separated by . ! ? or a newline, the next token starts a new
        // sentence and is not a direct object of this verb. Without this
        // guard, "...que viene.\nMi hermana..." flags "Mi hermana" as a DO
        // of "viene" (FP class observed in benchmark-texts/es-extended).
        const between = ctx.text.slice(t.end, next.start);
        if (/[.!?\n]/.test(between)) continue;

        // Step d: Skip if next token is "a" (personal "a" already present)
        if (next.word === 'a') continue;

        // Step e: Skip if next token is a preposition (not a bare DO)
        if (PREPOSITIONS.has(next.word)) continue;

        // Skip if next token is a determiner (el, la, los, las, un, una, etc.)
        // These indicate a full NP, not a bare human DO needing personal "a"
        if (['el', 'la', 'los', 'las', 'un', 'una', 'unos', 'unas'].indexOf(next.word) !== -1) continue;

        const next2 = tokens[i + 2];

        // Step g: Possessive + human noun pattern
        if (POSSESSIVES.has(next.word) && next2 && HUMAN_NOUNS.has(next2.word)) {
          findings.push({
            rule_id: 'es-personal-a',
            start: next.start,
            end: next2.end,
            original: next.display + ' ' + next2.display,
            fix: 'a ' + next.display + ' ' + next2.display,
            message: 'Falta "a" personal: ' + next.display + ' ' + next2.display + ' -> a ' + next.display + ' ' + next2.display,
            severity: 'warning',
          });
          continue;
        }

        // Step f+h: Check if next token is a human proper noun
        if (isLikelyProperNoun(next, i + 1, tokens, ctx.text)) {
          // Skip place names
          if (PLACE_NAMES.has(next.word)) continue;

          findings.push({
            rule_id: 'es-personal-a',
            start: next.start,
            end: next.end,
            original: next.display,
            fix: 'a ' + next.display,
            message: 'Falta "a" personal: ' + next.display + ' -> a ' + next.display,
            severity: 'warning',
          });
          continue;
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
