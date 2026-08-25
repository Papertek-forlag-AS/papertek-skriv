/**
 * Spell-check rule: bare infinitive where the present tense is required (priority 17).
 *
 * A very common L2-Norwegian error is dropping the present-tense -r and leaving
 * the bare infinitive as the finite verb of a clause:
 *   Wrong:   "jeg gå på skolen"   → "jeg går på skolen"
 *   Wrong:   "vi spise middag"    → "vi spiser middag"
 *   Wrong:   "han være syk"       → "han er syk"
 *   Correct: "jeg går på skolen"  → no flag
 *   Correct: "jeg vil gå"         → no flag (modal + infinitive; nb-modal-verb owns that)
 *   Correct: "jeg kunne gå"       → no flag ("kunne" is a valid preterite here)
 *
 * Complements `modal_form` (which owns the inverse: a finite form after a modal).
 *
 * PRECISION (Tier-3 L2 rule — the ~100%-precision story is sacred):
 *   - Frame is [clause-initial NOMINATIVE subject pronoun][bare infinitive],
 *     adjacent. Requiring the pronoun to HEAD its clause (sentence start or right
 *     after a conjunction) keeps it a subject, so object-pronoun constructions
 *     ("la meg gå" — object pronoun anyway, never clause-initial) can't match.
 *   - Fires only when the token is a real infinitive in `vocab.verbForms` whose
 *     present form differs — the suggestion is data-driven (gå→går, være→er),
 *     never generated, so irregulars are correct and unknown verbs stay silent.
 *   - Modal infinitives (kunne/ville/skulle/måtte/burde/…) are excluded: after a
 *     subject pronoun they read as valid preterites ("jeg kunne" = I could).
 *   - Noun-homograph infinitives (møte = to meet / a meeting) are skipped when the
 *     pronoun is determiner-capable (det/den/de), because "det møte" almost
 *     certainly wants the definite noun "det møtet", not "det møter".
 *   - Tokens that are already a present/preterite form are skipped.
 *
 * Severity: warning (P2 amber). Rule ID: 'nb-bare-infinitive-present'.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const { matchCase: coreMatchCase, escapeHtml: coreEscape } = core;
  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original && original[0] >= 'A' && original[0] <= 'Z') return replacement[0].toUpperCase() + replacement.slice(1);
    return replacement;
  }
  const escapeHtml = coreEscape || ((s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));

  // Nominative subject pronouns only (NB + NN). Object forms (meg/deg/oss/seg)
  // are deliberately excluded so ECM / "la meg gå" constructions can't match.
  const SUBJECT_PRONOUNS = new Set([
    'jeg', 'eg', 'du', 'han', 'hun', 'ho', 'den', 'det', 'vi', 'me', 'dere', 'dykk', 'de', 'dei',
  ]);
  // Determiner-capable pronouns: for these, an infinitive that is ALSO a noun is
  // ambiguous ("det møte" → "det møtet" the noun, not "det møter"), so skip it.
  const DETERMINER_CAPABLE = new Set(['det', 'den', 'de']);
  // Modal infinitives read as valid preterites after a subject pronoun.
  const MODAL_INF = new Set([
    'kunne', 'kunna', 'ville', 'skulle', 'måtte', 'burde', 'tore', 'tørre',
  ]);
  // A pronoun heads a clause when it is sentence-initial OR directly follows one
  // of these clause-introducing conjunctions/subordinators.
  const CLAUSE_STARTERS = new Set([
    'og', 'men', 'for', 'eller', 'så', 'samt',
    'som', 'at', 'fordi', 'når', 'hvis', 'da', 'dersom', 'mens', 'om', 'enten', 'verken', 'selv',
  ]);

  const rule = {
    id: 'nb-bare-infinitive-present',
    languages: ['nb', 'nn'],
    priority: 17,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Finite present-tense agreement (jeg gå → jeg går); grammatical pedagogy beyond Chrome native spellcheck parity',
      category: 'grammar-lookup',
    },
    explain(finding) {
      const orig = escapeHtml(finding.original || '');
      const fix = escapeHtml(finding.fix || '');
      const subj = escapeHtml(finding.subject || '');
      return {
        nb: `Hovedverbet i en setning skal stå i <strong>presens</strong>, ikke infinitiv — etter <em>${subj}</em> skriver du <em>${fix}</em>, ikke <em>${orig}</em>.`,
        nn: `Hovudverbet i ei setning skal stå i <strong>presens</strong>, ikkje infinitiv — etter <em>${subj}</em> skriv du <em>${fix}</em>, ikkje <em>${orig}</em>.`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'nb' && ctx.lang !== 'nn') return [];
      const { tokens, cursorPos } = ctx;
      if (!tokens || tokens.length < 2) return [];
      const vocab = ctx.vocab || {};
      const verbForms = vocab.verbForms;
      if (!verbForms || verbForms.size === 0) return [];
      const nounGenus = vocab.nounGenus || new Set();
      const isAdjective = vocab.isAdjective || new Set();
      const knownPresens = vocab.knownPresens || new Set();
      const knownPreteritum = vocab.knownPreteritum || new Set();
      const sPassivForms = vocab.sPassivForms || new Set();
      const sentences = Array.isArray(ctx.sentences) ? ctx.sentences : null;
      const out = [];

      const sentenceIdx = (pos) => {
        if (!sentences) return -1;
        for (let s = 0; s < sentences.length; s++) {
          if (pos >= sentences[s].start && pos < sentences[s].end) return s;
        }
        return -1;
      };

      for (let i = 1; i < tokens.length; i++) {
        const pron = tokens[i - 1];
        const verb = tokens[i];
        if (!SUBJECT_PRONOUNS.has(pron.word)) continue;

        // Clause-head guard: the pronoun must be the subject at the start of its
        // clause — sentence-initial, or directly after a clause-introducing word.
        const before = tokens[i - 2];
        let clauseHead = false;
        if (!before) {
          clauseHead = true;
        } else if (CLAUSE_STARTERS.has(before.word)) {
          clauseHead = true;
        } else if (sentences) {
          clauseHead = sentenceIdx(before.start) !== sentenceIdx(pron.start);
        }
        if (!clauseHead) continue;

        // The candidate must be a real infinitive with a present form.
        if (MODAL_INF.has(verb.word)) continue;
        // NN s-verbs (deponent/reciprocal + s-passive infinitives: møtast,
        // finnast, lesast, gjerast) are valid finite forms — "Vi møtast kvar
        // dag" is correct Nynorsk, not a bare-infinitive error. nn-passiv-s
        // owns that surface; skip the same set modal_form skips.
        if (sPassivForms.has(verb.word)) continue;
        const forms = verbForms.get(verb.word);
        if (!forms || !forms.present || forms.present.size === 0) continue;
        // Already a finite form (present/preterite) → not a bare-infinitive error.
        if (knownPresens.has(verb.word) || knownPreteritum.has(verb.word)) continue;
        // Determiner + noun/adjective-homograph ambiguity: den/det/de heading an
        // adjective or noun is a definite noun phrase, not subject+verb. Several
        // definite adjectives coincide with verb infinitives ("den kristne
        // religionen" — kristne is the adjective, also "å kristne" to christen;
        // "den hellige ånd", "den slemme ulven"). Two signals catch these:
        // the candidate is itself a known adjective/noun, OR — since many
        // definite adjective forms (kristne, slemme) aren't in isAdjective — a
        // NOUN follows the candidate, i.e. it's the attributive adjective of the
        // NP head. Adverbial continuations ("det regne mye/ute") aren't nouns,
        // so the valuable expletive-det case still fires.
        if (DETERMINER_CAPABLE.has(pron.word)) {
          const after = tokens[i + 1];
          if (nounGenus.has(verb.word) || isAdjective.has(verb.word) ||
              (after && nounGenus.has(after.word))) continue;
        }

        // Pick the first present form that actually differs from the infinitive.
        let present = null;
        for (const f of forms.present) { if (f && f !== verb.word) { present = f; break; } }
        if (!present) continue;

        if (cursorPos != null && cursorPos >= verb.start && cursorPos <= verb.end + 1) continue;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: verb.start,
          end: verb.end,
          original: verb.display,
          fix: matchCase(verb.display, present),
          subject: pron.display,
          message: `Presens etter «${pron.display}»: «${pron.display} ${verb.display}» → «${pron.display} ${matchCase(verb.display, present)}»`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
