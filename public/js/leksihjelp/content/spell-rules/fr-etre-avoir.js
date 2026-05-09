/**
 * Spell-check rule: FR passe compose auxiliary choice (FR-02, priority 70).
 *
 * Phase 10. Flags passe compose constructions where the wrong auxiliary
 * (avoir/etre) is used with a past participle.
 *   Wrong:   "j'ai alle"   (aller requires etre -> "je suis alle")
 *   Wrong:   "il a parti"  (partir requires etre -> "il est parti")
 *   Correct: "j'ai mange"  (manger takes avoir)
 *
 * Verbs whose auxiliary is 'both' (descendre, monter, passer, sortir in
 * some uses) are intentionally skipped to avoid false positives.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  // Lazy-init references to grammar tables (not available at IIFE time in Node)
  let AUX_LOOKUP = null;
  let AVOIR_BY_PERSON = null;
  let ETRE_BY_PERSON = null;
  let FR_ETRE_VERBS = null;
  let FR_ETRE_PARTICIPLES = null;

  // Accent stripping for participle lookup
  const ACCENT_MAP = {
    'à': 'a', 'â': 'a', 'ä': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'ï': 'i', 'î': 'i',
    'ô': 'o',
    'ù': 'u', 'û': 'u', 'ü': 'u',
    'ÿ': 'y',
    'ç': 'c',
  };

  function stripAccents(s) {
    let out = '';
    for (let i = 0; i < s.length; i++) {
      out += ACCENT_MAP[s[i]] || s[i];
    }
    return out;
  }

  function init() {
    if (AUX_LOOKUP) return true;

    const tables = host.__lexiGrammarTables;
    if (!tables || !tables.FR_AVOIR_FORMS || !tables.FR_ETRE_FORMS) return false;

    const FR_AVOIR_FORMS = tables.FR_AVOIR_FORMS;
    const FR_ETRE_FORMS = tables.FR_ETRE_FORMS;
    FR_ETRE_VERBS = tables.FR_ETRE_VERBS;
    FR_ETRE_PARTICIPLES = tables.FR_ETRE_PARTICIPLES;

    // Build AUX_LOOKUP: conjugated form -> { aux, person, tense }
    AUX_LOOKUP = new Map();
    for (const [form, info] of Object.entries(FR_AVOIR_FORMS)) {
      AUX_LOOKUP.set(form, { aux: 'avoir', ...info });
    }
    for (const [form, info] of Object.entries(FR_ETRE_FORMS)) {
      AUX_LOOKUP.set(form, { aux: 'etre', ...info });
    }

    // Build reverse maps: person+tense -> conjugated form
    AVOIR_BY_PERSON = {};
    for (const [form, info] of Object.entries(FR_AVOIR_FORMS)) {
      // For shared persons like '1s/2s', register for both
      const persons = info.person.split('/');
      for (const p of persons) {
        AVOIR_BY_PERSON[p + '|' + info.tense] = form;
      }
    }
    ETRE_BY_PERSON = {};
    for (const [form, info] of Object.entries(FR_ETRE_FORMS)) {
      const persons = info.person.split('/');
      for (const p of persons) {
        // Prefer accented forms — skip accent-stripped duplicates
        if (!ETRE_BY_PERSON[p + '|' + info.tense]) {
          ETRE_BY_PERSON[p + '|' + info.tense] = form;
        }
      }
    }

    return true;
  }

  function getCorrectAux(wrongAuxInfo, requiredAux) {
    const persons = wrongAuxInfo.person.split('/');
    const key = persons[0] + '|' + wrongAuxInfo.tense;
    if (requiredAux === 'etre') {
      return ETRE_BY_PERSON[key] || null;
    }
    if (requiredAux === 'avoir') {
      return AVOIR_BY_PERSON[key] || null;
    }
    return null;
  }

  // Normalize auxiliary values from data ('être' -> 'etre', 'avoir' -> 'avoir').
  // The vocab data uses accented French names; the rule uses plain ASCII internally.
  function normalizeAux(aux) {
    if (!aux) return null;
    const lower = aux.toLowerCase();
    if (lower === 'être' || lower === 'etre') return 'etre';
    if (lower === 'avoir') return 'avoir';
    if (lower === 'both') return 'both';
    return null;
  }

  // Determine what auxiliary a participle requires.
  // Returns 'etre', 'avoir', 'both', or null (unknown).
  function getRequiredAux(participleLower, vocabMap) {
    // 1. Data-driven lookup (ctx.vocab.participleToAux)
    if (vocabMap && vocabMap.size > 0) {
      const direct = vocabMap.get(participleLower);
      if (direct) return normalizeAux(direct);
      // Try accent-stripped
      const stripped = stripAccents(participleLower);
      if (stripped !== participleLower) {
        const strippedResult = vocabMap.get(stripped);
        if (strippedResult) return normalizeAux(strippedResult);
      }
    }

    // 2. Hardcoded fallback: FR_ETRE_PARTICIPLES
    if (FR_ETRE_PARTICIPLES) {
      const inf = FR_ETRE_PARTICIPLES[participleLower];
      if (inf) return 'etre';
      const stripped = stripAccents(participleLower);
      if (stripped !== participleLower && FR_ETRE_PARTICIPLES[stripped]) return 'etre';
    }

    return null; // Unknown — don't flag
  }

  // Detect subject person from tokens preceding the auxiliary.
  // Returns person code ('1s', '2s', '3s', '1p', '2p', '3p') or null.
  function detectPerson(tokens, auxIdx) {
    if (auxIdx === 0) return null;
    const prev = tokens[auxIdx - 1];
    const pw = prev.word;

    // Handle apostrophe-joined tokens like j'ai, l'ai, etc.
    // If the auxiliary IS part of an apostrophe token (j'ai), the pronoun is embedded
    // The tokenizer makes j'ai a single token, so auxIdx points at "j'ai"
    // But we handle that case separately below.

    const SUBJECT_MAP = {
      je: '1s', tu: '2s',
      il: '3s', elle: '3s', on: '3s',
      nous: '1p', vous: '2p',
      ils: '3p', elles: '3p',
    };
    return SUBJECT_MAP[pw] || null;
  }

  const rule = {
    id: 'fr-etre-avoir',
    languages: ['fr'],
    priority: 70,
    // exam-audit 33-03: stays safe=false — Auxiliary selection (être/avoir) is verb-class + context dependent; not single-token lookup
    exam: {
      safe: false,
      reason: "Stays safe=false (fr-etre-avoir) — Auxiliary selection (être/avoir) is verb-class + context dependent; not single-token lookup",
      category: "grammar-lookup",
    },
    severity: 'warning',
    explain: (finding) => {
      const participle = finding.participle || 'participe';
      const correctAux = finding.fix || '';
      return {
        nb: `<em>${escapeHtml(finding.original)}</em> er feil hjelpeverb her — <em>${escapeHtml(participle)}</em> bruker <em>${escapeHtml(correctAux)}</em> i passe compose.`,
        nn: `<em>${escapeHtml(finding.original)}</em> er feil hjelpeverb her — <em>${escapeHtml(participle)}</em> brukar <em>${escapeHtml(correctAux)}</em> i passe compose.`,
      };
    },
    check(ctx) {
      if (ctx.lang !== 'fr') return [];
      if (!init()) return [];
      const { tokens } = ctx;
      const out = [];

      // Read participleToAux from vocab seam
      const participleToAux = (ctx.vocab && ctx.vocab.participleToAux)
        ? ctx.vocab.participleToAux
        : ((ctx.vocab && typeof ctx.vocab.getParticipleToAux === 'function')
          ? ctx.vocab.getParticipleToAux()
          : new Map());

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const w = t.word; // lowercase

        // Handle apostrophe-joined auxiliary: j'ai, j'avais, etc.
        // Tokenizer makes "j'ai" a single token with word "j'ai"
        let auxForm = null;
        let auxInfo = null;
        let subjectPerson = null;

        // Check if this is an apostrophe token containing an auxiliary
        const apoIdx = w.indexOf("'");
        if (apoIdx > 0) {
          const afterApo = w.slice(apoIdx + 1);
          auxInfo = AUX_LOOKUP.get(afterApo);
          if (auxInfo) {
            auxForm = afterApo;
            // Detect person from the prefix (j' -> je -> 1s)
            const prefix = w.slice(0, apoIdx);
            const ELIDED_PERSON = { j: '1s', l: '3s', s: '3s' };
            subjectPerson = ELIDED_PERSON[prefix] || null;
          }
        }

        // Check plain auxiliary token
        if (!auxInfo) {
          auxInfo = AUX_LOOKUP.get(w);
          if (auxInfo) {
            auxForm = w;
            subjectPerson = detectPerson(tokens, i);
          }
        }

        if (!auxInfo) continue;

        // Scan forward up to 5 tokens for a past participle.
        // Phase 42: stop at sentence boundary — the new se-taire participle
        // form `tu` collides with the subject pronoun `Tu`, so without this
        // guard the scan crosses sentence boundaries and flags "Tu as raison.
        // Tu es gentil." with the next-sentence "Tu" mistaken as a participle.
        const maxScan = Math.min(i + 6, tokens.length);
        let crossedBoundary = false;
        for (let j = i + 1; j < maxScan; j++) {
          if (j > i + 1 && ctx.text) {
            const gap = ctx.text.slice(tokens[j - 1].end, tokens[j].start);
            if (/[.!?;]/.test(gap)) { crossedBoundary = true; break; }
          }
          const candidate = tokens[j];
          const candidateLower = candidate.word;

          // Phase 42: never treat a subject pronoun (lowercase or capitalised
          // sentence-initial) as a participle. `tu` (= silent, past participle
          // of "se taire") would otherwise mask the legitimate sentence start.
          if (candidateLower === 'tu' || candidateLower === 'je' || candidateLower === 'il' ||
              candidateLower === 'elle' || candidateLower === 'on' || candidateLower === 'nous' ||
              candidateLower === 'vous' || candidateLower === 'ils' || candidateLower === 'elles') continue;

          const requiredAux = getRequiredAux(candidateLower, participleToAux);
          if (!requiredAux) continue;

          // Skip 'both' — no way to tell transitive vs intransitive
          if (requiredAux === 'both') break;

          // Check if the auxiliary matches
          if (auxInfo.aux === requiredAux) break; // Correct — no flag

          // Wrong auxiliary! Suggest the correct one.
          // Use detected person if available, otherwise use auxInfo.person
          const personForLookup = subjectPerson
            ? { person: subjectPerson, tense: auxInfo.tense }
            : auxInfo;
          const correctForm = getCorrectAux(personForLookup, requiredAux);
          if (!correctForm) break;

          // Check structural suppression
          if (ctx.suppressedFor && ctx.suppressedFor.structural &&
              ctx.suppressedFor.structural.has(t.start)) break;

          // For apostrophe tokens, the fix replaces the whole token
          let fix, original, flagStart, flagEnd;
          if (apoIdx > 0 && auxForm !== w) {
            // e.g. j'ai -> reconstruct as j'ai (flagging the whole token)
            // but the fix should be the correct form, potentially with subject
            // For j'ai where etre needed: suggest "suis" but the student needs
            // to restructure as "je suis". Flag the whole apostrophe token.
            fix = correctForm;
            original = t.display;
            flagStart = t.start;
            flagEnd = t.end;
          } else {
            fix = matchCase ? matchCase(t.display, correctForm) : correctForm;
            original = t.display;
            flagStart = t.start;
            flagEnd = t.end;
          }

          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: flagStart,
            end: flagEnd,
            original: original,
            fix: fix,
            participle: candidate.display,
            message: `Passe compose: "${original} ... ${candidate.display}" -> "${fix} ... ${candidate.display}"`,
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
