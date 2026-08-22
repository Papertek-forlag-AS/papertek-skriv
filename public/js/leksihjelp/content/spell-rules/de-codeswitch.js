/**
 * Spell-check rule: Norwegian words leaking into German text (priority 2).
 *
 * Synthetic-corpus probes scored 2/6 on this class, and the real uke-22
 * corpus is full of it: "mein vater jobber", "Ich glede mich", "ich håper",
 * "fahren nach Italia/Spania", "Ich må gjøre". Two signals:
 *
 *   A. Norwegian letters: a lowercase token containing æ/ø/å can never be
 *      German ("håper", "må", "kjøre"). Capitalized æøå tokens are skipped —
 *      they're almost always Norwegian names/places (Bjørn, Ålesund), which
 *      are not errors in a personal essay.
 *   B. Curated high-frequency NB words with their German counterpart
 *      ("jobber" → arbeitet, "Spania" → Spanien). Tight, corpus-driven
 *      list — extend as triage surfaces more.
 *
 * Both signals require the token to be UNKNOWN to German validWords, so a
 * genuine German homograph always wins.
 *
 * DE-side sibling of nb-codeswitch (NB text ← EN leaks). Mirrors its exam
 * classification: token-level flagging at-or-below native spellcheck parity.
 *
 * Rule ID: 'de-codeswitch'
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

  const NB_LETTER_RE = /[æøå]/;

  // v3.0.121: generalized to ES/FR/EN. The æøå signal is universal (no
  // target language uses those letters); the curated maps are per-language.
  // Rule id stays 'de-codeswitch' for fixture/CSS compatibility — read it
  // as "the codeswitch rule born in the DE wave".
  const NB_TO_TARGET = {
    es: new Map(Object.entries({
      brus: 'refresco', koselig: 'agradable', og: 'y', ikke: 'no',
      hytta: 'la cabaña', venn: 'amigo', venner: 'amigos',
    })),
    fr: new Map(Object.entries({
      brus: 'soda', koselig: 'agréable', og: 'et',
      hytta: 'le chalet', venn: 'ami', venner: 'amis',
    })),
    en: new Map(Object.entries({
      brus: 'soda', koselig: 'cosy', og: 'and', ikke: 'not', jeg: 'I',
      hytta: 'the cabin', venn: 'friend', venner: 'friends', veldig: 'very',
    })),
  };

  // Curated NB → DE map (lowercase keys). Corpus-driven; every entry is a
  // word Norwegian students actually wrote in German essays. Keys must NOT
  // be valid German words (the validWords check is belt-and-braces).
  const NB_TO_DE = new Map(Object.entries({
    jobber: 'arbeitet',
    jobbe: 'arbeiten',
    glede: 'freue',
    gleder: 'freut',
    frisk: 'gesund',
    brus: 'Limonade',
    vil: 'will',
    ikke: 'nicht',
    jeg: 'ich',
    fordi: 'weil',
    italia: 'Italien',
    spania: 'Spanien',
    norge: 'Norwegen',
    frankrike: 'Frankreich',
    fotball: 'Fußball',
    venner: 'Freunde',
    skole: 'Schule',
    hyggelig: 'gemütlich',
    veldig: 'sehr',
  }));

  const rule = {
    id: 'de-codeswitch',
    languages: ['de', 'es', 'fr', 'en'],
    priority: 2, // early — wins dedupeOverlapping against typo-fuzzy guesses
    // Mirrors nb-codeswitch: token-level codeswitch flagging is at-or-below
    // what a native browser spellchecker does with an unknown word.
    exam: {
      safe: true,
      reason: 'Token-level codeswitch flagging (Norwegian word in German text); at-or-below browser native spellcheck parity',
      category: 'spellcheck',
    },
    severity: 'error',
    explain: (finding) => {
      const w = `<em>${esc(finding.original)}</em>`;
      const de = finding.fix && !finding.noAutoFix ? ` — prøv: <em>${esc(finding.fix)}</em>` : '';
      const deNN = finding.fix && !finding.noAutoFix ? ` — prøv: <em>${esc(finding.fix)}</em>` : '';
      const deEN = finding.fix && !finding.noAutoFix ? ` — try: <em>${esc(finding.fix)}</em>` : '';
      return {
        nb: `${w} ser ut som et norsk ord her${de}.`,
        nn: `${w} ser ut som eit norsk ord her${deNN}.`,
        en: `${w} looks like a Norwegian word in this text${deEN}.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang } = ctx;
      const langMap = lang === 'de' ? NB_TO_DE : NB_TO_TARGET[lang];
      if (!langMap) return [];
      const validWords = vocab.validWords || new Set();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (t.word.length < 2) continue;
        if (validWords.has(t.word)) continue;
        // Wikipedia-corpus precision (2026-06-12): IPA pronunciation guides
        // («ˌrɪkənˈbækɚ», «sbøː») carry æ/ø/å-class letters and stress/length
        // marks from the IPA Extensions + Spacing Modifier blocks — they are
        // phonetic notation, not Norwegian code-switching. Skip any token
        // containing characters from those blocks.
        if (/[ɐ-˿]/.test(t.word)) continue;

        const capitalized = t.display[0] !== t.display[0].toLowerCase()
          && t.display[0] === t.display[0].toUpperCase();
        const mapped = langMap.get(t.word);
        const nbLetters = NB_LETTER_RE.test(t.word) && !capitalized;
        if (!mapped && !nbLetters) continue;

        const f = {
          rule_id: 'de-codeswitch',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          severity: 'error',
        };
        if (mapped) {
          f.fix = applyCase(t.display, mapped);
          f.message = `Norsk ord: «${t.display}» → «${f.fix}»`;
        } else {
          // æøå signal without a known counterpart — flag, don't guess.
          f.fix = t.display;
          f.noAutoFix = true;
          f.message = `«${t.display}» ser ut som et norsk ord — finn ordet på målspråket`;
        }
        out.push(f);
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
