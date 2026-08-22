/**
 * Spell-check rule: sentence-boundary orthography (sentence-case, priority 18).
 *
 * Language-agnostic orthography that no other rule covered:
 *
 *   A) Missing space after a sentence terminator (.!?) when the next
 *      character is an UPPERCASE letter — "Jeg er her.Du er der." →
 *      "Jeg er her. Du er der." (insert the space). Restricting Check A to
 *      an UPPERCASE follower keeps it clear of domains/files/emails
 *      ("vg.no", "fil.txt", "a@b.no" — lowercase after the dot) and
 *      decimals ("3.14" — digit). All six languages.
 *
 *   B) Lowercase letter starting a new sentence (capital missing) after a
 *      terminator + space — "I am here. you are here." → "… You …".
 *      EN/DE/ES/FR only; NB/NN already get this from nb-sentence-boundary
 *      (which owns the NB-specific abbreviation/single-letter guards).
 *
 *   C) Lowercase first word at the very start of the text — "jeg liker …"
 *      → "Jeg liker …". All six languages (nb-sentence-boundary starts at
 *      token 1, so start-of-text was a gap for everyone).
 *
 * Guards against false positives (shared by B/C and the abbrev parts of A):
 *   - abbreviations whose trailing '.' is not a sentence end (per language:
 *     f.eks./osv., z.B./usw., e.g./etc., p.ej., p.ex., …), incl. multi-dot
 *     shapes via a letter-dot-letter lookback;
 *   - a digit immediately before the terminator (decimals, ordinals, lists);
 *   - quote/paren characters in the gap (dialogue/asides);
 *   - a single-letter token before the terminator (initials: "H. C. …").
 *
 * Exam mode: safe = true, category 'spellcheck' — pure orthography (Udir's
 * exam checker corrects sentence-initial capitals and run-together
 * punctuation), so it SURVIVES the exam-mode spelling-only filter.
 *
 * Rule ID: 'sentence-case'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml: coreEscape } = host.__lexiSpellCore || {};
  function escapeHtml(s) {
    if (coreEscape) return coreEscape(s);
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Abbreviations whose trailing '.' is NOT a sentence terminator. Lowercased,
  // stored WITH the trailing dot. A shared Latin core + per-language additions.
  const ABBREV_CORE = [
    'etc.', 'vs.', 'cf.', 'al.', 'pp.', 'no.', 'vol.', 'fig.', 'ca.', 'ex.',
  ];
  const ABBREV_BY_LANG = {
    // Norwegian academic degrees and titles were absent until 2026-08-13, when
    // a Wikipedia sweep produced 19 findings on biography prose — «cand. jur.
    // i 1883» wanted «Jur», «dr. philos.» wanted «Philos». Note dr./prof. were
    // already in the de/en/es/fr lists but not nb/nn, which is exactly the
    // shape of gap a per-language list invites. These are extremely common in
    // Norwegian encyclopaedic and CV prose, and the degree abbreviations are a
    // closed set.
    nb: ['f.eks.', 'osv.', 'dvs.', 'bl.a.', 'm.fl.', 'mfl.', 'evt.', 'jf.', 'kr.', 'nr.',
      'pga.', 'iht.', 'ifb.', 'mht.', 'hhv.', 'tlf.', 'moh.', 'km.', 'cm.', 'mm.', 'kg.',
      'jr.', 'sr.', 'st.', 'kap.', 'red.', 'utg.',
      'dr.', 'prof.', 'cand.', 'stud.', 'mag.', 'jur.', 'med.', 'philol.', 'philos.',
      'real.', 'theol.', 'polit.', 'oecon.', 'scient.', 'paed.', 'siv.ing.', 'ing.',
      'o.l.', 'o.a.', 'm.m.', 'f.o.m.', 't.o.m.', 'ca.', 'fhv.', 'sst.'],
    nn: ['f.eks.', 'osv.', 'dvs.', 'bl.a.', 'm.fl.', 'mfl.', 'evt.', 'jf.', 'kr.', 'nr.',
      'pga.', 'iht.', 'mht.', 'hhv.', 'tlf.', 'moh.', 'km.', 'kg.', 'jr.', 'sr.', 'st.', 'kap.',
      'dr.', 'prof.', 'cand.', 'stud.', 'mag.', 'jur.', 'med.', 'philol.', 'philos.',
      'real.', 'theol.', 'polit.', 'oecon.', 'scient.', 'paed.', 'siv.ing.', 'ing.',
      'o.l.', 'o.a.', 'm.m.', 'f.o.m.', 't.o.m.', 'ca.', 'fhv.', 'sst.'],
    de: ['z.b.', 'u.a.', 'usw.', 'bzw.', 'd.h.', 'v.a.', 'ggf.', 'bzgl.', 'vgl.', 'z.t.',
      'nr.', 'abb.', 'evtl.', 'inkl.', 'max.', 'min.', 'bspw.', 'u.ä.', 'o.ä.', 'dr.', 'prof.'],
    en: ['e.g.', 'i.e.', 'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'st.', 'jr.', 'sr.',
      'approx.', 'dept.', 'min.', 'max.', 'inc.', 'ltd.', 'co.', 'vs.', 'a.m.', 'p.m.'],
    es: ['p.ej.', 'ej.', 'sr.', 'sra.', 'srta.', 'dr.', 'dra.', 'núm.', 'pág.', 'págs.',
      'admón.', 'avda.', 'depto.', 'ud.', 'uds.'],
    fr: ['p.ex.', 'ex.', 'm.', 'mme.', 'mlle.', 'dr.', 'env.', 'av.', 'bd.', 'cf.',
      'éd.', 'réf.', 'tél.', 'c.-à-d.'],
  };
  function abbrevSet(lang) {
    return new Set(ABBREV_CORE.concat(ABBREV_BY_LANG[lang] || []));
  }

  // Shared so nb-typo-fuzzy can consult the SAME list instead of keeping its
  // own copy. The two rules produced the two halves of one bug on the same
  // input — sentence-case wanted to capitalise «jur», the typo rule said
  // «cand står ikke i ordboken» — and a second list would drift apart from
  // this one the first time either was extended.
  host.__lexiAbbrev = host.__lexiAbbrev || {};
  host.__lexiAbbrev.setFor = abbrevSet;

  const TERMINATOR = /[.!?]/;
  const isLetter = (ch) => /\p{L}/u.test(ch || '');
  const isUpper = (ch) => /\p{Lu}/u.test(ch || '');
  const startsLower = (s) => /^\p{Ll}/u.test(s || '');
  function capitalize(s) { return s ? s[0].toUpperCase() + s.slice(1) : s; }
  // Intentionally lowercase-initial brand/camelCase words (iPhone, eBay,
  // macOS) carry an internal uppercase — never "fix" their first letter.
  const isCamel = (s) => /^\p{Ll}.*\p{Lu}/u.test(s || '');

  // Dialogue-attribution verbs that legitimately stay lowercase after a
  // quoted exclamation/question ("Moi aussi ! dit ma sœur.").
  const SPEECH_VERBS = new Set([
    // fr
    'dit', 'dit-il', 'dit-elle', 'demanda', 'répondit', 'ajouta', 'cria',
    "s'écria", 'murmura', 'répond', 'demande', 'ajoute', 'lança', 'reprit',
    // en
    'said', 'says', 'asked', 'replied', 'shouted', 'whispered', 'exclaimed',
    'added', 'answered', 'cried',
    // de
    'sagte', 'fragte', 'rief', 'antwortete', 'flüsterte', 'meinte',
    // es
    'dijo', 'preguntó', 'respondió', 'gritó', 'exclamó', 'añadió', 'susurró',
  ]);

  const rule = {
    id: 'sentence-case',
    languages: ['nb', 'nn', 'en', 'de', 'es', 'fr'],
    priority: 18,
    exam: {
      safe: true,
      reason: 'Sentence-boundary orthography (capital after a full stop, space after a full stop) — at browser-native spellcheck parity; Udir exam-checker corrects these.',
      category: 'spellcheck',
    },
    severity: 'warning',
    explain: (finding) => {
      if (finding.kind === 'space') {
        return {
          nb: `Det mangler mellomrom etter punktum: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
          nn: `Det manglar mellomrom etter punktum: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
          en: `Missing space after the full stop: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
          de: `Nach dem Punkt fehlt ein Leerzeichen: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
          es: `Falta un espacio después del punto: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
          fr: `Il manque une espace après le point : <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
        };
      }
      return {
        nb: `En ny setning skal starte med stor forbokstav: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
        nn: `Ei ny setning skal starte med stor forbokstav: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
        en: `A new sentence starts with a capital letter: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
        de: `Ein neuer Satz beginnt mit einem Großbuchstaben: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
        es: `Una oración nueva empieza con mayúscula: <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
        fr: `Une nouvelle phrase commence par une majuscule : <em>${escapeHtml(finding.original)}</em> → <em>${escapeHtml(finding.fix)}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, text, cursorPos, lang } = ctx;
      if (!text || !tokens || !tokens.length) return [];
      const ABBREV = abbrevSet(lang);
      const out = [];
      const underCursor = (s, e) => cursorPos != null && cursorPos >= s && cursorPos <= e + 1;

      // Is the run of letters ending at index `dotIdx` (exclusive) an
      // abbreviation, an initial, or part of a multi-dot abbreviation?
      function abbrevBeforeDot(dotIdx) {
        let s = dotIdx;
        while (s > 0 && isLetter(text[s - 1])) s--;
        const word = text.slice(s, dotIdx);
        if (!word) return false;
        if (word.length === 1) return true; // initial ("H. C. Andersen")
        if (ABBREV.has((word + '.').toLowerCase())) return true;
        // multi-dot abbrev: letter-dot-letter immediately before the word
        // ("f.eks." → dot after "eks" has "f." before it).
        const look = text.slice(Math.max(0, s - 6), s);
        if (/\p{L}\.\p{L}/u.test(look + (s > 0 ? '' : ''))) {
          // ensure the look window actually ends in "X." adjacent to the word
          if (/\p{L}\.$/u.test(look)) return true;
        }
        return false;
      }

      // ── Check A: missing space after .!? before an UPPERCASE letter ──
      for (let p = 1; p < text.length - 1; p++) {
        if (!TERMINATOR.test(text[p])) continue;
        const before = text[p - 1];
        const after = text[p + 1];
        if (!isUpper(after)) continue;            // only uppercase follower
        if (!isLetter(before)) continue;          // letter before (skip 3.14, ...)
        if (TERMINATOR.test(before)) continue;    // ellipsis "...X"
        if (abbrevBeforeDot(p)) continue;         // f.eks.Det / etc.Then / H.C.
        // Email / URL / domain-chain: the no-space run after the dot contains
        // another '.', '@', '/' or ':' → not a sentence boundary
        // ("ola.Nordmann@x.no", "www.NRK.no", "a.B/c").
        const runAfter = text.slice(p + 1).split(/\s/)[0];
        if (/[.@/:]/.test(runAfter)) continue;
        if (underCursor(p, p + 1)) continue;
        out.push({
          rule_id: 'sentence-case',
          priority: rule.priority,
          kind: 'space',
          start: p,
          end: p + 2,
          original: text.slice(p, p + 2),
          fix: text[p] + ' ' + after,
          message: `Mangler mellomrom etter punktum: «${text.slice(p, p + 2)}» → «${text[p] + ' ' + after}»`,
          severity: 'warning',
        });
      }

      // ── Check C: lowercase first word at the very start of the text ──
      // Gated on a COMPLETED first sentence: only fires once a terminator
      // (.!?) is followed by more content — i.e. the writer has finished
      // sentence 1 and moved on, so a lowercase opening word is clearly an
      // error, not a half-typed fragment. This (a) stops it nagging while the
      // first sentence is still being typed (no terminator-then-content yet)
      // and (b) keeps it clear of the lowercase single-clause test fragments
      // (which end at their terminator, nothing after). All six languages —
      // nb-sentence-boundary starts at token 1, so start-of-text was a gap
      // for everyone.
      {
        const first = tokens[0];
        const lead = text.slice(0, first.start);
        // A terminator anywhere AFTER the first token, with non-whitespace
        // following it → the first sentence is completed and continued.
        const rest = text.slice(first.end);
        // A GENUINE sentence terminator after the first token means sentence 1
        // is finished and continued. "!"/"?" always qualify; a "." qualifies
        // only when it is NOT an ordinal/decimal ("1. desember", "13.30"), an
        // abbreviation ("kl.", "ca.", "St."), or an ellipsis ("mener at …").
        // Norwegian dictionary example fragments ("møtet blir avholdt 1.
        // desember") are riddled with ordinal-date periods that previously
        // read as sentence ends and falsely triggered the first-word flag.
        let firstSentenceDone = /[!?]\s*\S/.test(rest);
        if (!firstSentenceDone) {
          const re = /\.\s*(\S)/g;
          let m;
          while ((m = re.exec(rest))) {
            if (m[1] === '.') continue;                       // ellipsis "..."
            const dotAbs = first.end + m.index;
            if (/\d/.test(text[dotAbs - 1] || '')) continue;  // ordinal / decimal
            if (abbrevBeforeDot(dotAbs)) continue;            // abbreviation
            firstSentenceDone = true; break;
          }
        }
        if (firstSentenceDone && /^\s*$/.test(lead)
            && startsLower(first.display) && !isCamel(first.display)
            && !underCursor(first.start, first.end)) {
          out.push({
            rule_id: 'sentence-case',
            priority: rule.priority,
            kind: 'capital',
            start: first.start,
            end: first.end,
            original: first.display,
            fix: capitalize(first.display),
            message: `Stor forbokstav i starten: «${first.display}» → «${capitalize(first.display)}»`,
            severity: 'warning',
          });
        }
      }

      // ── Check B: lowercase word after .!? + space (EN/DE/ES/FR) ──
      // NB/NN defer to nb-sentence-boundary (owns the NB-specific guards).
      if (lang !== 'nb' && lang !== 'nn') {
        for (let i = 1; i < tokens.length; i++) {
          const t = tokens[i];
          if (!startsLower(t.display) || isCamel(t.display)) continue;
          if (underCursor(t.start, t.end)) continue;
          const prev = tokens[i - 1];
          const gap = text.slice(prev.end, t.start);
          if (!/[.!?]/.test(gap)) continue;          // a terminator in the gap
          if (!/\s/.test(gap)) continue;             // space present (no-space = Check A / domain)
          if (/[\d]/.test(gap)) continue;            // 1. list / ordinal / decimal
          if (/["»«„“”'’\)\]]/.test(gap)) continue;  // dialogue / aside
          if (prev.display.length === 1) continue;   // initial
          // Dialogue attribution after !/? stays lowercase ("Moi aussi !
          // dit ma sœur.", "Great! said Tom.") — Ordbank sweep 2026-07.
          if (/[!?]/.test(gap) && SPEECH_VERBS.has(t.word)) continue;
          // abbreviation before the terminator
          const dotIdx = prev.end + gap.indexOf('.');
          if (gap.indexOf('.') >= 0 && abbrevBeforeDot(dotIdx)) continue;
          out.push({
            rule_id: 'sentence-case',
            priority: rule.priority,
            kind: 'capital',
            start: t.start,
            end: t.end,
            original: t.display,
            fix: capitalize(t.display),
            message: `Stor forbokstav etter punktum: «${t.display}» → «${capitalize(t.display)}»`,
            severity: 'warning',
          });
        }
      }

      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
