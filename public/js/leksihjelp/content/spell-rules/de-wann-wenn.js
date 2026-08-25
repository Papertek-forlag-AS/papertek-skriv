/**
 * Spell-check rule: wann vs wenn confusion (priority 48, P2 warning).
 *
 * Norwegian "når" covers BOTH German "wann" (questions) and "wenn"
 * (conditions / repeated events), so students reach for "wann" everywhere:
 *   "Wann ich komme nach hause, ich setze mich" (real uke-22 corpus)
 *   "ich lesen wann ich hast zeit"
 *   "auch wann es regnet" (synthetic probe, scored 0 before this rule)
 *
 * Detection: a "wann" that is NOT a question. Questions keep wann:
 *   - the sentence ends in "?" (direct question, anywhere in it)
 *   - an asking/knowing verb governs it within a short window
 *     ("Ich weiß nicht, wann er kommt")
 * Everything else — wann heading a conditional/temporal clause — flags
 * with the deterministic fix "wenn".
 *
 * Exam classification: safe=false. "wann" is a perfectly valid German word;
 * flagging it is contextual grammar guidance with a Lær mer lesson — beyond
 * Chrome native spellcheck parity (same class as modal_form/de-verb-final).
 *
 * Rule ID: 'de-wann-wenn'
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

  // Verbs that legitimately govern an indirect wann-question.
  const INDIRECT_GOVERNORS = new Set([
    'weiß', 'weisst', 'weißt', 'wissen', 'wisst', 'wusste', 'wussten',
    'frage', 'fragst', 'fragt', 'fragen', 'fragte', 'fragten', 'gefragt',
    'sage', 'sagst', 'sagt', 'sagen', 'sag',
    // Ordbank sweep 2026-07: more verbs governing indirect wann-questions
    // ("Der Fahrplan zeigt, wann der Bus kommt") + da-correlates
    // ("ein Gefühl dafür, wann jemand traurig ist").
    'zeige', 'zeigst', 'zeigt', 'zeigen', 'zeigte', 'zeigten', 'gezeigt',
    'sehe', 'siehst', 'sieht', 'sehen', 'sah', 'sahen', 'gesehen',
    'höre', 'hörst', 'hört', 'hören', 'hörte', 'hörten', 'gehört',
    'erkläre', 'erklärt', 'erklären', 'erklärte',
    'entscheide', 'entscheidet', 'entscheiden', 'entschieden',
    'bestimme', 'bestimmt', 'bestimmen', 'bestimmte',
    'erkenne', 'erkennt', 'erkennen', 'erkannte', 'erkannt',
    'merke', 'merkst', 'merkt', 'merken', 'gemerkt',
    'verstehe', 'verstehst', 'versteht', 'verstehen', 'verstanden',
    'lerne', 'lernst', 'lernt', 'lernen', 'gelernt',
    'egal', 'unklar', 'klar',
    'dafür', 'darauf', 'darüber', 'davon', 'daran', 'danach',
  ]);

  const rule = {
    id: 'de-wann-wenn',
    languages: ['de'],
    priority: 48,
    exam: {
      safe: false,
      reason: 'Contextual wann/wenn guidance with Lær mer pedagogy — "wann" is a valid word; flagging it exceeds Chrome native parity',
      category: 'grammar-lookup',
    },
    severity: 'warning',
    pedagogy: {
      note: {
        nb: 'Norsk <em>når</em> dekker TRE tyske ord: <strong>wann</strong> (bare i spørsmål), <strong>wenn</strong> (betingelse eller noe som gjentar seg) og <strong>als</strong> (én enkelt hendelse i fortid).',
        nn: 'Norsk <em>når</em> dekkjer TRE tyske ord: <strong>wann</strong> (berre i spørsmål), <strong>wenn</strong> (vilkår eller noko som gjentek seg) og <strong>als</strong> (éi enkelt hending i fortida).',
        en: 'Norwegian <em>når</em> covers THREE German words: <strong>wann</strong> (questions only), <strong>wenn</strong> (conditions or repeated events) and <strong>als</strong> (a single past event).',
      },
      examples: [
        {
          correct: 'Wann kommst du?',
          incorrect: 'Wenn kommst du?',
          translation: { nb: 'Når kommer du? (spørsmål → wann)', nn: 'Når kjem du? (spørsmål → wann)', en: 'When are you coming? (question → wann)' },
        },
        {
          correct: 'Wenn es regnet, bleibe ich zu Hause.',
          incorrect: 'Wann es regnet, bleibe ich zu Hause.',
          translation: { nb: 'Når det regner, blir jeg hjemme. (betingelse → wenn)', nn: 'Når det regnar, blir eg heime. (vilkår → wenn)', en: 'When it rains, I stay home. (condition → wenn)' },
        },
        {
          correct: 'Als ich acht war, wohnte ich in Bergen.',
          incorrect: 'Wenn ich acht war, wohnte ich in Bergen.',
          translation: { nb: 'Da jeg var åtte, bodde jeg i Bergen. (én gang i fortid → als)', nn: 'Då eg var åtte, budde eg i Bergen. (éin gong i fortida → als)', en: 'When I was eight, I lived in Bergen. (single past event → als)' },
        },
      ],
      extra: {
        nb: 'Test: kan du svare med et klokkeslett eller en dato? Da er det et spørsmål → <em>wann</em>. Kan du bytte ut med «hvis» eller «hver gang»? Da er det <em>wenn</em>.',
        nn: 'Test: kan du svare med eit klokkeslett eller ein dato? Då er det eit spørsmål → <em>wann</em>. Kan du byte ut med «viss» eller «kvar gong»? Då er det <em>wenn</em>.',
        en: 'Test: can you answer with a time or date? Then it is a question → <em>wann</em>. Can you replace it with "if" or "every time"? Then it is <em>wenn</em>.',
      },
    },
    explain: (finding) => ({
      nb: `<em>wann</em> brukes bare i spørsmål. Her beskriver det en betingelse eller noe som gjentar seg — bruk <em>${esc(finding.fix)}</em>.`,
      nn: `<em>wann</em> vert berre brukt i spørsmål. Her skildrar det eit vilkår eller noko som gjentek seg — bruk <em>${esc(finding.fix)}</em>.`,
      en: `<em>wann</em> is used only in questions. Here it introduces a condition or repeated event — use <em>${esc(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { text, tokens, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.word !== 'wann') continue;
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        // Direct question: the sentence containing wann ends in "?". Scan
        // forward to the next sentence-ending punctuation in the raw text.
        let isQuestion = false;
        if (text) {
          for (let p = t.end; p < text.length; p++) {
            const c = text[p];
            if (c === '?') { isQuestion = true; break; }
            if (c === '.' || c === '!' || c === '\n') break;
          }
        }
        if (isQuestion) continue;

        // Indirect question: an asking/knowing verb shortly before wann
        // ("Ich weiß nicht, wann er kommt").
        let indirect = false;
        for (let j = Math.max(0, i - 3); j < i; j++) {
          if (INDIRECT_GOVERNORS.has(tokens[j].word)) { indirect = true; break; }
        }
        if (indirect) continue;

        const fix = applyCase(t.display, 'wenn');
        out.push({
          rule_id: 'de-wann-wenn',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix,
          message: `«${t.display}» → «${fix}» — wann brukes bare i spørsmål`,
          severity: 'warning',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
