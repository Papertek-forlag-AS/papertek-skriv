/**
 * Spell-check rule: German modal + infinitive placement in MAIN clauses
 * (priority 65, P3 hint band).
 *
 * After a modal verb, the infinitive belongs at the END of the clause:
 *   "Ich will fahren ins Spanien."  →  "Ich will ins Spanien fahren."
 *
 * Companion to two existing rules:
 *  - modal_form (de-modal-verb.js) fixes the FORM ("will fahre" → "fahren").
 *    This rule only fires once the infinitive form is correct, so the
 *    student gets two-stage coaching: apply the infinitive fix, and on the
 *    re-check this placement hint appears on the (now-correct) infinitive.
 *  - de-verb-final handles SUBORDINATE clauses (dass/weil/...). This rule
 *    covers main clauses, which de-verb-final deliberately ignores.
 *
 * Recommendation-only: word order can't be fixed with a one-spot
 * substitution, so the finding carries noAutoFix (no "Fiks" button) and
 * proposes the reordered clause tail in the explanation instead.
 *
 * Rule ID: 'de-modal-infinitive-final'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Mirrors de-modal-verb.js MODAL_VERBS.
  const MODAL_VERBS = new Set([
    'kann', 'kannst', 'können', 'könnt', 'konnte', 'konntest', 'konnten',
    'muss', 'musst', 'müssen', 'müsst', 'musste', 'musstest', 'mussten',
    'soll', 'sollst', 'sollen', 'sollt', 'sollte', 'solltest', 'sollten',
    'will', 'willst', 'wollen', 'wollt', 'wollte', 'wolltest', 'wollten',
    'darf', 'darfst', 'dürfen', 'dürft', 'durfte', 'durftest', 'durften',
    'mag', 'magst', 'mögen', 'mögt', 'mochte', 'mochtest', 'mochten',
    'möchte', 'möchtest', 'möchten', 'möchtet',
  ]);

  // Subordinators between the modal and clause end mean de-verb-final's
  // territory (or at least a structure this main-clause rule shouldn't
  // judge). Mirrors de-verb-final.js DE_SUBORDINATORS.
  const DE_SUBORDINATORS = new Set([
    'dass', 'weil', 'wenn', 'ob', 'obwohl', 'als', 'bevor', 'nachdem',
    'damit', 'sodass', 'solange', 'sobald', 'seit', 'seitdem', 'während',
    'indem', 'falls',
  ]);

  const COORDINATORS = new Set(['und', 'oder']);

  // Clause reach ends at sentence punctuation, a comma, or a dash. The
  // en/em-dash (and double hyphen) marks a parenthetical or a new clause
  // ("Du kannst das Auto nehmen – ich habe keine Einwände") — the infinitive
  // before it is already clause-final.
  const CLAUSE_BREAK_RE = /[.!?;,:\n–—]|--/;

  function isCapitalizedNoun(tok, nounGenus) {
    return tok.display && tok.display[0] === tok.display[0].toUpperCase()
      && tok.display[0] !== tok.display[0].toLowerCase()
      && nounGenus.has(tok.word);
  }

  function isCapitalized(tok) {
    return tok.display && tok.display[0] === tok.display[0].toUpperCase()
      && tok.display[0] !== tok.display[0].toLowerCase();
  }

  // Possessive determiner forms. Some are also verb infinitives ("meinen" = to
  // mean, "sein" = to be), so after a modal they can be mis-picked as THE
  // infinitive. When one heads a noun phrase (followed by an adjective or noun)
  // it is a determiner, not the verb ("… meinen Kugelschreiber benutzen",
  // "… sein großes Talent anerkennen").
  const POSSESSIVES = new Set([
    'mein', 'meine', 'meinen', 'meinem', 'meiner', 'meines',
    'dein', 'deine', 'deinen', 'deinem', 'deiner', 'deines',
    'sein', 'seine', 'seinen', 'seinem', 'seiner', 'seines',
    'ihr', 'ihre', 'ihren', 'ihrem', 'ihrer', 'ihres',
    'unser', 'unsere', 'unseren', 'unserem', 'unserer', 'unseres',
    'euer', 'eure', 'euren', 'eurem', 'eurer', 'eures',
  ]);

  const rule = {
    id: 'de-modal-infinitive-final',
    languages: ['de'],
    priority: 65, // P3 hint band (mirrors es-imperfecto-hint / fr-aspect-hint)
    exam: {
      safe: false,
      reason: 'Word-order recommendation (modal + infinitive placement); syntactic guidance, not single-token lookup',
      category: 'grammar-lookup',
    },
    severity: 'hint',
    // Satzklammer pedagogy — the verbal-bracket concept, modal flavour.
    // Sibling lesson of de-participle-final (perfekt flavour); added
    // v3.0.117 after the student-corpus triage showed 19 placement hints
    // rendered without Lær mer.
    pedagogy: {
      note: {
        nb: 'Med modalverb lager tysk en <strong>verbal ramme</strong> (Satzklammer): modalverbet (<em>will, kann, muss …</em>) står på plass 2, og infinitiven står <strong>helt til slutt</strong>. Alt annet står imellom.',
        nn: 'Med modalverb lagar tysk ei <strong>verbal ramme</strong> (Satzklammer): modalverbet (<em>will, kann, muss …</em>) står på plass 2, og infinitiven står <strong>heilt til slutt</strong>. Alt anna står imellom.',
        en: 'With a modal verb German forms a <strong>verbal bracket</strong> (Satzklammer): the modal (<em>will, kann, muss …</em>) sits in position 2 and the infinitive goes <strong>at the very end</strong>. Everything else sits in between.',
      },
      examples: [
        {
          correct: 'Ich will ins Spanien fahren.',
          incorrect: 'Ich will fahren ins Spanien.',
          translation: { nb: 'Jeg vil reise til Spania.', nn: 'Eg vil reise til Spania.', en: 'I want to travel to Spain.' },
          note: {
            nb: 'På norsk står verbene samlet («vil reise til Spania») — på tysk skilles de.',
            nn: 'På norsk står verba samla («vil reise til Spania») — på tysk vert dei skilde.',
            en: 'Norwegian keeps the verbs together («vil reise til Spania») — German splits them.',
          },
        },
        {
          correct: 'Wir wollen eine Pizza essen.',
          incorrect: 'Wir wollen essen eine Pizza.',
          translation: { nb: 'Vi vil spise en pizza.', nn: 'Vi vil ete ein pizza.', en: 'We want to eat a pizza.' },
        },
        {
          correct: 'Er kann mit seinem Bruder spielen.',
          incorrect: 'Er kann spielen mit seinem Bruder.',
          translation: { nb: 'Han kan leke med broren sin.', nn: 'Han kan leike med broren sin.', en: 'He can play with his brother.' },
        },
      ],
      extra: {
        nb: 'Samme ramme gjelder i perfektum: <em>"Ich habe Suppe <strong>gekocht</strong>"</em> — partisippet står sist. Koordinerte infinitiver er greit: <em>"Ich will essen und schlafen"</em>.',
        nn: 'Same ramme gjeld i perfektum: <em>"Ich habe Suppe <strong>gekocht</strong>"</em> — partisippet står sist. Koordinerte infinitivar er greitt: <em>"Ich will essen und schlafen"</em>.',
        en: 'The same bracket applies in the perfect tense: <em>"Ich habe Suppe <strong>gekocht</strong>"</em> — the participle goes last. Coordinated infinitives are fine: <em>"Ich will essen und schlafen"</em>.',
      },
    },
    explain: (finding) => {
      const inf = `<em>${esc(finding.original)}</em>`;
      const prop = finding.proposal ? ` — for eksempel: <em>«${esc(finding.proposal)}»</em>` : '';
      const propNN = finding.proposal ? ` — til dømes: <em>«${esc(finding.proposal)}»</em>` : '';
      const propEN = finding.proposal ? ` — for example: <em>“${esc(finding.proposal)}”</em>` : '';
      return {
        nb: `Riktig form! Neste steg: i setninger med modalverb står infinitiven ${inf} vanligvis helt til slutt${prop}.`,
        nn: `Rett form! Neste steg: i setningar med modalverb står infinitiven ${inf} vanlegvis heilt til slutt${propNN}.`,
        en: `Correct form! Next step: with a modal verb, the infinitive ${inf} usually goes at the very end of the clause${propEN}.`,
      };
    },
    check(ctx) {
      const { text, tokens, vocab, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      // verbForms is keyed by INFINITIVE ("fahren" → tense table) — the
      // natural "is this an infinitive?" test. verbInfinitive maps only
      // CONJUGATED forms to their infinitive ("fahre" → "fahren"), so it
      // identifies the not-yet-fixed forms this rule must stay silent on.
      const verbForms = vocab.verbForms || new Map();
      const verbInfinitive = vocab.verbInfinitive || new Map();
      const nounGenus = vocab.nounGenus || new Map();
      // A genuine post-modal infinitive is lowercase ("will fahren"). A
      // CAPITALISED -en word is a nominalised-infinitive noun ("das Treffen",
      // "das Unternehmen") — a verb homograph that is NOT the clause's verb,
      // even when it is absent from nounGenus. Excluding all capitalised tokens
      // (not just known nouns) closes the Treffen/Unternehmen misfire class.
      const isInfinitive = (t) => verbForms.has(t.word)
        && (t.word.endsWith('en') || t.word.endsWith('n'))
        && !isCapitalized(t);
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        if (!MODAL_VERBS.has(tokens[i].word)) continue;

        // Bound the clause: from the modal to the next punctuation break.
        let clauseEnd = tokens.length;
        let sawSubordinator = false;
        for (let j = i + 1; j < tokens.length; j++) {
          const between = text ? text.slice(tokens[j - 1].end, tokens[j].start) : '';
          if (CLAUSE_BREAK_RE.test(between)) { clauseEnd = j; break; }
          if (DE_SUBORDINATORS.has(tokens[j].word)) { sawSubordinator = true; break; }
        }
        if (sawSubordinator) continue;

        // First verb in the clause after the modal decides. If it's an
        // infinitive ("fahren") it's our placement candidate. If it's a
        // conjugated form ("fahre"), that's modal_form's job — the
        // two-stage flow depends on this rule staying silent until the
        // form is right. Capitalized known nouns ("Essen") are skipped —
        // German capitalizes nouns.
        let infIdx = -1;
        for (let j = i + 1; j < clauseEnd; j++) {
          const t = tokens[j];
          if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) { infIdx = -2; break; }
          if (isCapitalizedNoun(t, nounGenus)) continue;
          // Possessive determiner heading a noun phrase ("meinen Kugelschreiber",
          // "sein großes Talent") — a determiner, not the verb. Keep scanning.
          if (POSSESSIVES.has(t.word)) {
            const nx = tokens[j + 1];
            if (nx && j + 1 < clauseEnd && (isCapitalized(nx) || (vocab.isAdjective && vocab.isAdjective.has(nx.word)))) continue;
          }
          if (isInfinitive(t)) { infIdx = j; break; }
          if (verbInfinitive.has(t.word)) break; // conjugated verb → modal_form territory
        }
        if (infIdx < 0) continue;

        // Tail = clause content after the infinitive. Empty tail → the
        // infinitive is already clause-final, nothing to recommend.
        const tail = tokens.slice(infIdx + 1, clauseEnd);
        if (tail.length === 0) continue;

        // Legitimate continuations after an infinitive:
        //  - "zu" → zu-infinitive construction ("will versuchen zu schlafen")
        //  - coordination / verb clusters where every following token is
        //    another infinitive or und/oder ("will essen und schlafen",
        //    "will schwimmen gehen")
        if (tail[0].word === 'zu') continue;
        let effTail = tail;
        // v3.0.123: shared-modal coordination — "Wir wollen Berlin besuchen
        // und viele Museen sehen" ends EACH conjunct with its own infinitive.
        // A coordinator whose right side carries another infinitive bounds
        // this infinitive's conjunct; mirrors de-participle-final.
        const coordIdx = effTail.findIndex(t => COORDINATORS.has(t.word));
        if (coordIdx >= 0 && effTail.slice(coordIdx + 1).some(t => isInfinitive(t))) {
          effTail = effTail.slice(0, coordIdx);
        }
        if (effTail.length === 0) { i = infIdx; continue; }
        const allVerbal = effTail.every(t => COORDINATORS.has(t.word) || isInfinitive(t));
        if (allVerbal) continue;

        const infTok = tokens[infIdx];
        // Build the reorder proposal: "<tail> <infinitive>". Keep it short —
        // beyond 6 tail tokens the inline example gets unwieldy and the
        // generic message carries the point.
        let proposal = null;
        if (effTail.length <= 6) {
          proposal = effTail.map(t => t.display).join(' ') + ' ' + infTok.display;
        }

        out.push({
          rule_id: 'de-modal-infinitive-final',
          priority: rule.priority,
          start: infTok.start,
          end: infTok.end,
          original: infTok.display,
          display: infTok.display,
          // Structural recommendation — moving the verb crosses other
          // tokens, so there is no one-spot substitution. noAutoFix
          // suppresses the "Fiks" button; the popover explains instead.
          fix: infTok.display,
          noAutoFix: true,
          proposal,
          modal: tokens[i].display,
          message: proposal
            ? `Infinitiven står vanligvis til slutt: «${proposal}»`
            : `Infinitiven «${infTok.display}» står vanligvis helt til slutt i setningen`,
          severity: 'hint',
        });
        // Continue from the infinitive — a coordinated second modal frame in
        // the same clause gets its own finding (jumping to clauseEnd would
        // skip it; same fix as de-participle-final v3.0.117).
        i = infIdx;
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
