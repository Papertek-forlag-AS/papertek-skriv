/**
 * Spell-check rule: German object pronoun case — ADVISORY
 * (de-akkusativ-pronoun, priority 31).
 *
 * A direct object takes the ACCUSATIVE pronoun, not the nominative. Norwegian
 * has no case on pronouns, so students keep the subject form:
 *   "Ich sehe er"   — did you mean "Ich sehe ihn"?
 *   "Ich kenne er"  — did you mean "Ich kenne ihn"?
 *
 * Severity 'hint' (advisory "Mente du …?"), localised to NB/NN/EN via explain.
 *
 * Detection (conservative): [subject pronoun] [finite verb] [nominative pronoun
 * with a distinct accusative: er→ihn, ich→mich, du→dich]. FP guard: the
 * nominative pronoun must NOT be followed by another finite verb — otherwise it
 * is the subject of a following clause ("Ich glaube er kommt", "Ich sehe dass
 * er rennt"), where the nominative is correct. The middle token must be a real
 * verb (verbInfinitive lookup), so "Ich und er." (compound subject) never
 * matches. sie/es/wir/ihr are skipped (nominative == accusative).
 *
 * Exam classification: safe=false — pedagogy popover beyond Chrome native parity.
 *
 * Rule ID: 'de-akkusativ-pronoun'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const applyCase = typeof matchCase === 'function' ? matchCase : (o, s) => s;

  const SUBJ_PRONOUNS = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man']);
  // Nominative → accusative, only where the two forms differ.
  const NOM_TO_ACC = { er: 'ihn', ich: 'mich', du: 'dich' };

  function isVerb(vi, word) {
    return !!(vi && (vi instanceof Map ? vi.get(word) : vi[word]));
  }

  const rule = {
    id: 'de-akkusativ-pronoun',
    languages: ['de'],
    priority: 31,
    exam: {
      safe: false,
      reason: 'Advisory object-pronoun case suggestion with Lær mer pedagogy — beyond Chrome native parity',
      category: 'grammar-lookup',
    },
    severity: 'hint',
    explain: (finding) => {
      const phrase = esc((finding.subject || '') + ' ' + (finding.verb || '') + ' ' + (finding.fix || ''));
      return {
        nb: `Et direkte objekt tar <strong>akkusativ</strong>, ikke nominativ. Mente du <strong>${phrase}</strong>? Pronomen: <em>er→ihn, ich→mich, du→dich</em>.`,
        nn: `Eit direkte objekt tek <strong>akkusativ</strong>, ikkje nominativ. Mente du <strong>${phrase}</strong>? Pronomen: <em>er→ihn, ich→mich, du→dich</em>.`,
        en: `A direct object takes the <strong>accusative</strong>, not the nominative. Did you mean <strong>${phrase}</strong>? Pronouns: <em>er→ihn, ich→mich, du→dich</em>.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      const vi = ctx.vocab && ctx.vocab.verbInfinitive;
      if (!vi) return [];
      const out = [];

      // A nominative pronoun directly after a preposition is a PP object
      // with a CASE error ("Ohne du gehe ich nicht" — du should be dich),
      // not the clause subject; the verb inverts around the fronted PP and
      // the pronoun at i+2 IS the real subject (Ordbank sweep 2026-07).
      const PREPS = new Set(['ohne', 'für', 'gegen', 'durch', 'um', 'mit',
        'bei', 'nach', 'von', 'zu', 'aus', 'seit', 'an', 'auf', 'in',
        'über', 'unter', 'vor', 'hinter', 'neben', 'zwischen']);

      for (let i = 0; i + 2 < tokens.length; i++) {
        if (!SUBJ_PRONOUNS.has(tokens[i].word)) continue;     // subject
        if (i > 0 && PREPS.has(tokens[i - 1].word)) continue;  // PP object, not subject
        if (!isVerb(vi, tokens[i + 1].word)) continue;         // finite verb
        const acc = NOM_TO_ACC[tokens[i + 2].word];
        if (!acc) continue;                                    // object is a distinct-case nominative
        // Clause-boundary guard: a comma/sentence break anywhere in the
        // [subject][verb][pronoun] span means the pronoun heads a NEW clause and
        // is its SUBJECT, not an object — reported speech "Er sagt, er sei
        // krank." / "Er sagte, er würde kommen." (the i+3 verb guard below misses
        // these because Konjunktiv "sei"/"würde" aren't in verbInfinitive).
        if (ctx.text && /[,;:.!?\n]/.test(ctx.text.slice(tokens[i].end, tokens[i + 2].start))) continue;
        // FP guard: a verb right after the nominative pronoun → it's the subject
        // of a following clause (correct), not an object.
        if (i + 3 < tokens.length && isVerb(vi, tokens[i + 3].word)) continue;
        if (cursorPos != null && cursorPos >= tokens[i + 2].start && cursorPos <= tokens[i + 2].end + 1) continue;

        const fix = applyCase(tokens[i + 2].display, acc);
        out.push({
          rule_id: 'de-akkusativ-pronoun',
          priority: rule.priority,
          start: tokens[i + 2].start,
          end: tokens[i + 2].end,
          original: tokens[i + 2].display,
          fix,
          verb: tokens[i + 1].display,
          subject: tokens[i].display,
          message: `Direkte objekt — mente du «${fix}»?`,
          severity: 'hint',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
