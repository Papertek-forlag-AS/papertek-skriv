/**
 * Spell-check rule: German perfekt participle placement in MAIN clauses
 * (priority 65, P3 hint band).
 *
 * In the perfekt, the past participle goes at the END of the clause
 * (Satzklammer — the aux at position 2 and the participle close the
 * bracket):
 *   "Meine Mutter hat gekocht Suppe."  →  "Meine Mutter hat Suppe gekocht."
 *
 * This is direct Norwegian word-order transfer ("mamma har kokt suppe" —
 * Norwegian keeps verb and object together) and scored 0/7 on the
 * synthetic-corpus probes before this rule existed. Sibling of
 * de-modal-infinitive-final (same Satzklammer concept, modal+infinitive
 * flavour); subordinate clauses stay de-verb-final's territory.
 *
 * Recommendation-only: word order can't be fixed by one-spot substitution,
 * so findings carry noAutoFix and propose the reordered clause tail.
 *
 * Rule ID: 'de-participle-final'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Perfekt auxiliaries (present-tense forms — the perfekt frame).
  const PERFEKT_AUX = new Set([
    'habe', 'hast', 'hat', 'haben', 'habt',
    'bin', 'bist', 'ist', 'sind', 'seid',
  ]);

  // Mirrors de-verb-final.js DE_SUBORDINATORS — a subordinator before the
  // aux means the clause is de-verb-final's territory.
  const DE_SUBORDINATORS = new Set([
    'dass', 'weil', 'wenn', 'ob', 'obwohl', 'als', 'bevor', 'nachdem',
    'damit', 'sodass', 'solange', 'sobald', 'seit', 'seitdem', 'während',
    'indem', 'falls',
  ]);

  // Legitimate Nachfeld openers — material AFTER the participle that is
  // grammatical in standard German ("Ich habe mehr gegessen als du").
  const NACHFELD_OPENERS = new Set(['als', 'wie']);

  const CLAUSE_BREAK_RE = /[.!?;,:\n]/;

  const rule = {
    id: 'de-participle-final',
    languages: ['de'],
    priority: 65, // P3 hint band (mirrors de-modal-infinitive-final)
    exam: {
      safe: false,
      reason: 'Word-order recommendation (perfekt participle placement) with Lær mer pedagogy; syntactic guidance exceeds Chrome native parity',
      category: 'grammar-lookup',
    },
    severity: 'hint',
    // Satzklammer pedagogy — the verbal-bracket concept, perfekt flavour.
    pedagogy: {
      note: {
        nb: 'I perfektum lager tysk en <strong>verbal ramme</strong> (Satzklammer): hjelpeverbet (<em>habe/hat/bin/ist …</em>) står på plass 2, og partisippet (<em>gekocht, gegangen …</em>) står <strong>helt til slutt</strong>. Alt annet står imellom.',
        nn: 'I perfektum lagar tysk ei <strong>verbal ramme</strong> (Satzklammer): hjelpeverbet (<em>habe/hat/bin/ist …</em>) står på plass 2, og partisippet (<em>gekocht, gegangen …</em>) står <strong>heilt til slutt</strong>. Alt anna står imellom.',
        en: 'In the perfect tense German forms a <strong>verbal bracket</strong> (Satzklammer): the auxiliary (<em>habe/hat/bin/ist …</em>) sits in position 2 and the participle (<em>gekocht, gegangen …</em>) goes <strong>at the very end</strong>. Everything else sits in between.',
      },
      examples: [
        {
          correct: 'Meine Mutter hat Suppe gekocht.',
          incorrect: 'Meine Mutter hat gekocht Suppe.',
          translation: { nb: 'Moren min har kokt suppe.', nn: 'Mora mi har koka suppe.', en: 'My mother cooked soup.' },
          note: {
            nb: 'På norsk står verbet og objektet samlet («har kokt suppe») — på tysk skilles de.',
            nn: 'På norsk står verbet og objektet samla («har koka suppe») — på tysk vert dei skilde.',
            en: 'Norwegian keeps verb and object together («har kokt suppe») — German splits them.',
          },
        },
        {
          correct: 'Ich bin gestern in die Stadt gegangen.',
          incorrect: 'Ich bin gegangen in die Stadt gestern.',
          translation: { nb: 'Jeg gikk til byen i går.', nn: 'Eg gjekk til byen i går.', en: 'I went to town yesterday.' },
        },
        {
          correct: 'Wir haben den ganzen Tag geschlafen.',
          incorrect: 'Wir haben geschlafen den ganzen Tag.',
          translation: { nb: 'Vi har sovet hele dagen.', nn: 'Vi har sove heile dagen.', en: 'We slept all day.' },
        },
      ],
      extra: {
        nb: 'Samme ramme gjelder med modalverb: <em>"Ich will heute Fußball <strong>spielen</strong>"</em> — infinitiven står sist. Unntak: sammenligninger kan stå etter partisippet: <em>"Ich habe mehr gegessen <strong>als du</strong>"</em>.',
        nn: 'Same ramme gjeld med modalverb: <em>"Ich will heute Fußball <strong>spielen</strong>"</em> — infinitiven står sist. Unntak: samanlikningar kan stå etter partisippet: <em>"Ich habe mehr gegessen <strong>als du</strong>"</em>.',
        en: 'The same bracket applies with modal verbs: <em>"Ich will heute Fußball <strong>spielen</strong>"</em> — the infinitive goes last. Exception: comparisons may follow the participle: <em>"Ich habe mehr gegessen <strong>als du</strong>"</em>.',
      },
    },
    explain: (finding) => {
      const part = `<em>${esc(finding.original)}</em>`;
      const aux = finding.aux ? `<em>${esc(finding.aux)}</em>` : 'hjelpeverbet';
      const prop = finding.proposal ? ` — for eksempel: <em>«${esc(finding.proposal)}»</em>` : '';
      const propNN = finding.proposal ? ` — til dømes: <em>«${esc(finding.proposal)}»</em>` : '';
      const propEN = finding.proposal ? ` — for example: <em>“${esc(finding.proposal)}”</em>` : '';
      return {
        nb: `I perfektum står partisippet ${part} helt til slutt i setningen — ${aux} på plass 2 og ${part} sist lager den tyske verbalrammen${prop}.`,
        nn: `I perfektum står partisippet ${part} heilt til slutt i setninga — ${aux} på plass 2 og ${part} sist lagar den tyske verbalramma${propNN}.`,
        en: `In the perfect tense the participle ${part} goes at the very end of the clause — ${aux} in position 2 and ${part} last form the German verbal bracket${propEN}.`,
      };
    },
    check(ctx) {
      const { text, tokens, vocab, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      const participleToAux = vocab.participleToAux || new Map();
      if (participleToAux.size === 0) return [];
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        if (!PERFEKT_AUX.has(tokens[i].word)) continue;

        // Subordinator earlier in the same clause → de-verb-final territory
        // (it already flags "dass sie haben vermisst mich" on the aux).
        let subordinate = false;
        for (let j = i - 1; j >= 0; j--) {
          const between = text ? text.slice(tokens[j].end, tokens[j + 1].start) : '';
          if (CLAUSE_BREAK_RE.test(between)) break;
          if (DE_SUBORDINATORS.has(tokens[j].word)) { subordinate = true; break; }
        }
        if (subordinate) continue;

        // Clause end after the aux.
        let clauseEnd = tokens.length;
        for (let j = i + 1; j < tokens.length; j++) {
          const between = text ? text.slice(tokens[j - 1].end, tokens[j].start) : '';
          if (CLAUSE_BREAK_RE.test(between)) { clauseEnd = j; break; }
        }

        // The misplacement pattern is the participle RIGHT after the aux
        // (optionally one adverb between): "hat gekocht Suppe", "bin
        // gegangen in die Stadt". A distant participle is the CORRECT
        // bracket shape — never flag it.
        let pIdx = -1;
        for (let j = i + 1; j < Math.min(i + 3, clauseEnd); j++) {
          const t = tokens[j];
          if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) { pIdx = -2; break; }
          if (participleToAux.has(t.word)) { pIdx = j; break; }
        }
        if (pIdx < 0) continue;

        let tail = tokens.slice(pIdx + 1, clauseEnd);
        // v3.0.123: shared-aux coordination — "Wir haben Berlin besucht und
        // viele Museen gesehen" puts EACH conjunct's participle at the end
        // of its OWN conjunct. When the tail crosses an und/oder/aber whose
        // right side carries another participle, the conjunction is this
        // participle's effective clause end, not the sentence end.
        const coordIdx = tail.findIndex(t => t.word === 'und' || t.word === 'oder' || t.word === 'aber');
        // Ordbank sweep 2026-07: a fresh perfect AUX right of the coordinator
        // also opens its own conjunct ("bin ich gefallen und habe mir das
        // Knie verletzt") — covers participles missing from participleToAux.
        if (coordIdx >= 0 && tail.slice(coordIdx + 1).some(t => participleToAux.has(t.word) || PERFEKT_AUX.has(t.word))) {
          tail = tail.slice(0, coordIdx);
        }
        if (tail.length === 0) { i = pIdx; continue; } // participle already clause-final
        // Legitimate Nachfeld: comparisons after the participle are fine.
        if (NACHFELD_OPENERS.has(tail[0].word)) continue;

        const pTok = tokens[pIdx];
        let proposal = null;
        if (tail.length <= 6) {
          proposal = tail.map(t => t.display).join(' ') + ' ' + pTok.display;
        }

        out.push({
          rule_id: 'de-participle-final',
          priority: rule.priority,
          start: pTok.start,
          end: pTok.end,
          original: pTok.display,
          display: pTok.display,
          fix: pTok.display,
          noAutoFix: true,
          proposal,
          aux: tokens[i].display,
          message: proposal
            ? `Partisippet står til slutt: «${proposal}»`
            : `Partisippet «${pTok.display}» står helt til slutt i setningen`,
          severity: 'hint',
        });
        // Continue from the participle — a coordinated second perfekt in the
        // same clause ("habe gekauft X und habe gegessen Y") gets its own
        // finding (jumping to clauseEnd skipped the second aux).
        i = pIdx;
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
