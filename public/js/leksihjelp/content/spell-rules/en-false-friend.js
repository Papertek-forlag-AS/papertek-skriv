/**
 * Spell-check rule: English False Friends from Norwegian (priority 43).
 *
 * Flags NB→EN false friends — Norwegian cognates used with the wrong meaning
 * in English text. Severity: info (hint). The English word IS valid, just
 * probably not what the Norwegian student meant.
 *
 * Context guards suppress the hint when surrounding words indicate legitimate
 * English usage.
 *
 * Rule ID: 'en-false-friend'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // The lowercase EN word → false-friend metadata map is now data-driven: it
  // comes from the curated falsefriendsbank in papertek-vocabulary, built into
  // ctx.vocab.falseFriendsMap by the seam. No inline word list — single source
  // of truth (mirrors nb-anglicism). Each entry carries nbWord/enMeaning/
  // suggestion plus the load-bearing safeContextNext/safeContextPrev guard
  // arrays. Resolved per-call from ctx; explain() reads the fields stashed on
  // the finding (the map is only available inside check()).

  const rule = {
    id: 'en-false-friend',
    languages: ['en'],
    priority: 43,
    exam: {
      safe: false,
      reason: 'Intellectual support: tells student the English word has a different meaning than the Norwegian cognate.',
      category: 'grammar-lookup',
    },
    severity: 'hint',
    explain: (finding) => {
      // Fields stashed on the finding by check() (the falseFriendsMap is only
      // available inside check via ctx.vocab). Mirrors nb-anglicism, which
      // reads finding.original/finding.fix rather than re-looking-up the bank.
      if (!finding.enMeaning || !finding.nbWord || !finding.suggestion) {
        return {
          nb: `Mulig falsk venn fra norsk.`,
          nn: `Mogleg falsk ven frå norsk.`,
        };
      }
      return {
        nb: `«${escapeHtml(finding.original)}» betyr '${finding.enMeaning}' på engelsk — ikke det samme som norsk «${finding.nbWord}». Mente du «${finding.suggestion}»?`,
        nn: `«${escapeHtml(finding.original)}» tyder '${finding.enMeaning}' på engelsk — ikkje det same som norsk «${finding.nbWord}». Meinte du «${finding.suggestion}»?`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      // Data-driven: the false-friends list lives in the papertek
      // falsefriendsbank, surfaced as ctx.vocab.falseFriendsMap by the seam.
      // Silent if absent (mirrors nb-anglicism).
      const FALSE_FRIENDS = (vocab && vocab.falseFriendsMap instanceof Map) ? vocab.falseFriendsMap : null;
      if (!FALSE_FRIENDS || !FALSE_FRIENDS.size) return [];
      const out = [];
      const seen = new Set();

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const word = t.word;

        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        const entry = FALSE_FRIENDS.get(word);
        if (!entry) continue;

        // Deduplicate: only fire once per unique word per text
        if (seen.has(word)) continue;

        // Context guard: safeContextPrev
        if (entry.safeContextPrev && i > 0) {
          const prev = tokens[i - 1].word;
          if (entry.safeContextPrev.includes(prev)) continue;
        }

        // Context guard: safeContextNext
        if (entry.safeContextNext && i < tokens.length - 1) {
          const next = tokens[i + 1].word;
          if (entry.safeContextNext.includes(next)) continue;
        }

        seen.add(word);

        out.push({
          rule_id: 'en-false-friend',
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: entry.suggestion,
          suggestion: entry.suggestion,
          // Stashed for explain() — the bank-backed map isn't reachable there.
          enMeaning: entry.enMeaning,
          nbWord: entry.nbWord,
          message: `Falsk venn: «${t.display}» betyr '${entry.enMeaning}' på engelsk, ikke '${entry.nbWord}'`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
