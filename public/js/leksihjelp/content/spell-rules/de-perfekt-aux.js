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

        // Scan forward up to 5 tokens for a past participle.
        // Stop at coordinating conjunctions — they start a new clause,
        // so the participle belongs to a different auxiliary.
        const COORD_CONJ = new Set(['und', 'oder', 'aber', 'sondern', 'denn']);
        // Reflexive verbs ALWAYS form the Perfekt with haben — "Er hat sich
        // erkältet", "Ich habe mich gewaschen" — regardless of the lexical
        // verb's intransitive-motion auxiliary in participleToAux. A reflexive
        // pronoun between the aux and the participle pins the required aux to
        // haben. Without this, "er habe sich erkältet" flagged habe→bin
        // (erkälten's participle carries aux=sein in the bank, but the
        // reflexive construction overrides that).
        const REFLEX_PRON = new Set(['mich', 'dich', 'sich', 'uns', 'euch']);
        let sawReflexive = false;
        const maxScan = Math.min(i + 6, tokens.length);
        for (let j = i + 1; j < maxScan; j++) {
          const candidate = tokens[j];
          const candidateLower = candidate.word;
          if (REFLEX_PRON.has(candidateLower)) sawReflexive = true;

          // Stop at a clause boundary (comma/semicolon/sentence end) — German
          // relative + subordinate clauses are always comma-set, so a participle
          // past the comma belongs to a DIFFERENT auxiliary. Fixes the textbook
          // "Das ist das Buch, das ich gelesen habe." flagging the matrix "ist"
          // against the relative-clause participle "gelesen".
          if (ctx.text && /[,;:.!?\n]/.test(ctx.text.slice(tokens[j - 1].end, candidate.start))) break;

          if (COORD_CONJ.has(candidateLower)) break;

          // Check if this token is a known participle
          let requiredAux = participleToAux.get(candidateLower);
          if (!requiredAux) continue;
          // Reflexive construction → haben overrides the lexical aux (incl. 'both').
          if (sawReflexive) requiredAux = 'haben';

          // "gefallen" homograph: participleToAux carries sein (from fallen — "ist
          // gefallen"), but the transitive-ish verb gefallen "to please" takes
          // HABEN and a DATIVE experiencer ("Das Konzert hat mir gefallen", "Dem
          // Publikum hat es gefallen"). A dative pronoun/marker near the participle
          // disambiguates to the please-reading → haben.
          if (candidateLower === 'gefallen') {
            const DATIVE_MARK = new Set(['mir', 'dir', 'ihm', 'ihr', 'uns', 'euch', 'ihnen', 'dem', 'der', 'den', 'meinem', 'deinem', 'seinem', 'ihrem', 'unserem', 'eurem']);
            for (let d = Math.max(0, i - 5); d <= j; d++) {
              if (DATIVE_MARK.has(tokens[d].word)) { requiredAux = 'haben'; break; }
            }
          }

          // Track B (Phase 47): for 'both'-aux verbs (fahren/laufen/schwimmen),
          // resolve to a concrete aux by scanning for a strong-accusative
          // marker between aux and participle. Strong-acc markers are
          // case-unambiguous in form: den/einen/keinen/jeden/diesen/jenen/
          // welchen/manchen and the pronouns ihn/mich/dich. (Ambiguous-case
          // tokens like das/die/sie/es are excluded to avoid FPs when they
          // are nominative subjects.) With a strong-acc present → transitive
          // → haben is correct. Without one → intransitive/directional →
          // sein is correct.
          if (requiredAux === 'both') {
            // F47-1 (v3.0.41): scope the strong-acc escape to motion verbs
            // that genuinely take direct objects in modern German. For
            // gelaufen/geschwommen, the transitive-haben reading is
            // archaic/edge ("den Marathon gelaufen", "den Fluss
            // geschwommen") and a "den/einen/…" later in the clause is
            // far more often a temporal/locative phrase or a separate
            // sentence fragment. Keep the escape ON for fahren/fliegen
            // (and their separable derivatives), where transitive
            // perfekt-haben is everyday standard (Auto fahren,
            // Flugzeug fliegen).
            const TRUE_TRANSITIVE_MOTION = new Set([
              'gefahren', 'weggefahren', 'geflogen', 'ausgezogen',
              // ziehen/umziehen are aux='both' in the verbbank: motion → sein
              // ("Ich bin nach Berlin gezogen", "Ich bin umgezogen"), but a
              // direct object → haben ("Ich habe das Seil gezogen", "Ich habe
              // mich umgezogen"). Enable the strong-accusative resolver so it
              // decides per clause instead of defaulting to sein.
              'gezogen', 'umgezogen',
            ]);
            const allowStrongAccEscape = TRUE_TRANSITIVE_MOTION.has(candidateLower);
            const STRONG_ACC = new Set(['den', 'einen', 'keinen', 'jeden', 'diesen', 'jenen', 'welchen', 'manchen', 'meinen', 'deinen', 'seinen', 'ihren', 'unseren', 'euren', 'ihn', 'mich', 'dich']);
            // F47-1 residual (v3.0.42): ambiguous-case markers (das/die,
            // possessives) are accusative when they sit in the mid-clause
            // slot between aux and a TRUE_TRANSITIVE_MOTION participle,
            // followed by a capitalized noun. "Wir haben das Auto
            // gefahren." = transitive haben → silent. Scoped to the
            // motion-verb escape branch; STRONG_ACC stays unchanged
            // globally so nominative-subject detection elsewhere is
            // unaffected.
            const STRONG_ACC_AMBIGUOUS = new Set([
              'das', 'die',
              'mein', 'meine', 'dein', 'deine', 'sein', 'seine',
              'ihr', 'ihre', 'unser', 'unsere', 'euer', 'eure',
            ]);
            let hasAcc = false;
            if (allowStrongAccEscape) {
              const scanEnd = Math.min(j + 6, tokens.length);
              for (let k = i + 1; k < scanEnd; k++) {
                if (STRONG_ACC.has(tokens[k].word)) { hasAcc = true; break; }
                if (STRONG_ACC_AMBIGUOUS.has(tokens[k].word) && k + 1 < tokens.length) {
                  // Look ahead for a capitalized noun, optionally past one
                  // intervening lowercase adjective.
                  for (let m = k + 1; m <= Math.min(k + 2, tokens.length - 1); m++) {
                    const w = tokens[m].display || tokens[m].word;
                    if (w && /^[A-ZÄÖÜ]/.test(w)) { hasAcc = true; break; }
                  }
                  if (hasAcc) break;
                }
              }
            }
            // Resolve: transitive → haben; intransitive → sein.
            const resolvedAux = hasAcc ? 'haben' : 'sein';
            if (auxInfo.aux === resolvedAux) break; // already correct
            const correctFormBoth = getCorrectAux(auxInfo, resolvedAux);
            if (!correctFormBoth) break;
            if (ctx.suppressedFor && ctx.suppressedFor.structural &&
                ctx.suppressedFor.structural.has(t.start)) break;
            out.push({
              rule_id: rule.id,
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase ? matchCase(t.display, correctFormBoth) : correctFormBoth,
              participle: candidate.display,
              message: `Perfekt: "${t.display} ... ${candidate.display}" skulle vart "${correctFormBoth} ... ${candidate.display}"`,
            });
            break;
          }

          // Check if the auxiliary matches
          if (auxInfo.aux === requiredAux) break; // Correct auxiliary — no flag

          // Zustandspassiv / predicate-adjective guard (direction B: sein-aux +
          // a participle whose Perfekt takes HABEN). The Perfekt of a haben-verb
          // is "hat geschlossen" — never "ist geschlossen" — so "sein +
          // haben-participle" is a valid STATAL PASSIVE ("Das Museum ist
          // geschlossen" = is closed) or predicate adjective ("Ich bin
          // enttäuscht", "Er ist geboren"), not a mis-auxiliaried Perfekt. Only
          // treat it as a perfect-tense error when the subject is a bare
          // personal pronoun AND the participle is not a common predicate
          // adjective — that is the "ich bin gemacht" (attempted Perfekt) shape
          // the fixtures pin, distinct from the thing-subject Zustandspassiv the
          // corpus is full of.
          if (auxInfo.aux === 'sein' && requiredAux === 'haben') {
            const PERSONAL_PRON = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man']);
            const STATIVE_PARTICIPLE = new Set([
              'geboren', 'enttäuscht', 'überrascht', 'interessiert', 'aufgeregt',
              'informiert', 'angezogen', 'begeistert', 'erstaunt', 'überzeugt',
              'verliebt', 'verletzt', 'erschöpft', 'gestresst', 'entspannt',
              'gewöhnt', 'betrunken', 'gelangweilt', 'besorgt', 'verärgert',
              'gespannt', 'zufrieden', 'gefangen',
              // Impersonal "es ist verboten/erlaubt …" and other common
              // predicate-adjective participles (Zustandspassiv with any subject,
              // incl. the impersonal pronoun "es").
              'verboten', 'erlaubt', 'geschlossen', 'geöffnet', 'reserviert',
              'besetzt', 'versichert', 'geregelt', 'geschützt', 'erhalten',
              'verheiratet', 'geschieden', 'bekannt', 'gewohnt',
              // "Ich bin verloren" = I am lost (predicate adjective) —
              // Ordbank sweep 2026-07.
              'verloren',
            ]);
            const prevTok = i > 0 ? tokens[i - 1] : null;
            const nextTok = tokens[i + 1] || null;
            const subjPron = (prevTok && PERSONAL_PRON.has(prevTok.word))
              || (nextTok && PERSONAL_PRON.has(nextTok.word));
            if (!subjPron || STATIVE_PARTICIPLE.has(candidateLower)) break;
          }

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
