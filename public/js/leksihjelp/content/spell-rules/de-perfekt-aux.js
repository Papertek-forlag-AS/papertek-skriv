/**
 * Spell-check rule: DE Perfekt auxiliary choice (DE-03, priority 70).
 *
 * Phase 8. Flags Perfekt constructions where the wrong auxiliary (haben/sein)
 * is used with a past participle.
 *   Wrong:   "ich habe gegangen"  (gehen requires sein)
 *   Correct: "ich bin gegangen"
 *
 * Verbs whose auxiliary is 'both' (fahren, schwimmen) are intentionally
 * skipped to avoid false positives — the transitive/intransitive distinction
 * requires clause-level semantics we don't have.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // ── Conjugated forms of haben and sein ──
  // Maps each conjugated form to { aux: 'haben'|'sein', person, tense }
  // so we can suggest the correct conjugation of the OTHER auxiliary.
  const HABEN_FORMS = {
    habe:    { person: 'ich',       tense: 'present' },
    hast:    { person: 'du',        tense: 'present' },
    hat:     { person: 'er/sie/es', tense: 'present' },
    haben:   { person: 'wir',       tense: 'present' },
    habt:    { person: 'ihr',       tense: 'present' },
    hatte:   { person: 'ich',       tense: 'past' },
    hattest: { person: 'du',        tense: 'past' },
    hatten:  { person: 'wir',       tense: 'past' },
    hattet:  { person: 'ihr',       tense: 'past' },
  };

  const SEIN_FORMS = {
    bin:   { person: 'ich',       tense: 'present' },
    bist:  { person: 'du',        tense: 'present' },
    ist:   { person: 'er/sie/es', tense: 'present' },
    sind:  { person: 'wir',       tense: 'present' },
    seid:  { person: 'ihr',       tense: 'present' },
    war:   { person: 'ich',       tense: 'past' },
    warst: { person: 'du',        tense: 'past' },
    waren: { person: 'wir',       tense: 'past' },
    wart:  { person: 'ihr',       tense: 'past' },
  };

  // Lookup: conjugated form → { aux, person, tense }
  const AUX_LOOKUP = new Map();
  for (const [form, info] of Object.entries(HABEN_FORMS)) {
    AUX_LOOKUP.set(form, { aux: 'haben', ...info });
  }
  for (const [form, info] of Object.entries(SEIN_FORMS)) {
    AUX_LOOKUP.set(form, { aux: 'sein', ...info });
  }

  // Mapping: given a person+tense, what is the correct conjugation of haben/sein?
  const HABEN_BY_PERSON = {};
  for (const [form, info] of Object.entries(HABEN_FORMS)) {
    HABEN_BY_PERSON[info.person + '|' + info.tense] = form;
  }
  const SEIN_BY_PERSON = {};
  for (const [form, info] of Object.entries(SEIN_FORMS)) {
    SEIN_BY_PERSON[info.person + '|' + info.tense] = form;
  }

  // 3rd person plural uses same forms as wir for both auxiliaries
  HABEN_BY_PERSON['sie/Sie|present'] = 'haben';
  HABEN_BY_PERSON['sie/Sie|past'] = 'hatten';
  SEIN_BY_PERSON['sie/Sie|present'] = 'sind';
  SEIN_BY_PERSON['sie/Sie|past'] = 'waren';

  function getCorrectAux(wrongAuxInfo, requiredAux) {
    const key = wrongAuxInfo.person + '|' + wrongAuxInfo.tense;
    if (requiredAux === 'sein') {
      return SEIN_BY_PERSON[key] || null;
    }
    if (requiredAux === 'haben') {
      return HABEN_BY_PERSON[key] || null;
    }
    return null;
  }

  const rule = {
    id: 'de-perfekt-aux',
    languages: ['de'],
    priority: 70,
    // exam-audit 33-03: stays safe=false — Auxiliary selection (haben/sein) is verb-class + context dependent; not lookup-shaped
    exam: {
      safe: false,
      reason: "Stays safe=false (de-perfekt-aux) — Auxiliary selection (haben/sein) is verb-class + context dependent; not lookup-shaped",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: (finding) => {
      const participle = finding.participle || 'participle';
      const correctAux = finding.fix || '';
      return {
        nb: `<em>${escapeHtml(finding.original)}</em> er feil hjelpeverb her — <em>${escapeHtml(participle)}</em> bruker <em>${escapeHtml(correctAux)}</em> i perfektum.`,
        nn: `<em>${escapeHtml(finding.original)}</em> er feil hjelpeverb her — <em>${escapeHtml(participle)}</em> brukar <em>${escapeHtml(correctAux)}</em> i perfektum.`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'de') return [];
      const { tokens } = ctx;
      const out = [];

      // Read participleToAux from vocab seam
      const participleToAux = (ctx.vocab && ctx.vocab.participleToAux)
        ? ctx.vocab.participleToAux
        : ((ctx.vocab && typeof ctx.vocab.getParticipleToAux === 'function')
          ? ctx.vocab.getParticipleToAux()
          : new Map());

      if (!participleToAux || participleToAux.size === 0) return [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const auxInfo = AUX_LOOKUP.get(t.word);
        if (!auxInfo) continue;

        // Scan forward up to 5 tokens for a past participle
        const maxScan = Math.min(i + 6, tokens.length);
        for (let j = i + 1; j < maxScan; j++) {
          const candidate = tokens[j];
          const candidateLower = candidate.word;

          // Check if this token is a known participle
          const requiredAux = participleToAux.get(candidateLower);
          if (!requiredAux) continue;

          // Skip 'both' — no way to tell transitive vs intransitive
          if (requiredAux === 'both') break;

          // Check if the auxiliary matches
          if (auxInfo.aux === requiredAux) break; // Correct auxiliary — no flag

          // Wrong auxiliary! Suggest the correct one.
          const correctForm = getCorrectAux(auxInfo, requiredAux);
          if (!correctForm) break;

          // Check structural suppression
          if (ctx.suppressedFor && ctx.suppressedFor.structural &&
              ctx.suppressedFor.structural.has(t.start)) break;

          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: t.start,
            end: t.end,
            original: t.display,
            fix: matchCase ? matchCase(t.display, correctForm) : correctForm,
            participle: candidate.display,
            message: `Perfekt: "${t.display} ... ${candidate.display}" skulle vart "${correctForm} ... ${candidate.display}"`,
          });
          break; // Only flag the first participle match per auxiliary
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
