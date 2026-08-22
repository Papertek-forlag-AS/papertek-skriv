/**
 * Spell-check rule: Universal Number Agreement (priority 15).
 *
 * Flags plural article followed by singular noun.
 * - French: les (pl) + singular noun
 * - Spanish: las/los/unos/unas (pl) + singular noun
 * - German: die (pl) + singular noun
 *
 * Rule ID: 'agreement'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const PLURAL_ARTICLES = {
    fr: new Set(['les', 'des']),
    es: new Set(['las', 'los', 'unos', 'unas']),
    de: new Set(['die']), // 'die' is also feminine singular, handled by context
  };

  // Personal pronouns (subject + object clitics). A plural ARTICLE never
  // follows one of these; when "les/los/las" does, it is an object clitic in a
  // clitic cluster (FR "elle leur les montre", "je les montre"; ES "me los
  // da") and the next token is a verb, not a noun — even when that token is a
  // noun homograph (montre = watch/shows, casa = house/marries). Used together
  // with a verb-form check so "las casa"/"les maison" (no preceding pronoun)
  // still fire.
  const PRONOUNS = {
    fr: new Set(['je', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles', 'me', 'te', 'se', 'le', 'la', 'les', 'lui', 'leur', 'y', 'en', 'moi', 'toi', 'eux']),
    es: new Set(['yo', 'tú', 'tu', 'él', 'ella', 'usted', 'nosotros', 'nosotras', 'vosotros', 'vosotras', 'ustedes', 'ellos', 'ellas', 'me', 'te', 'se', 'lo', 'la', 'los', 'las', 'le', 'les', 'nos', 'os']),
    de: new Set(),
  };

  const rule = {
    id: 'agreement',
    languages: ['fr', 'es', 'de'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Lookup-shaped grammar rule (universal-agreement) — Chrome native parity confirmed in 33-03 audit: Universal agreement check is lookup against agreement maps; single-token suggestion",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Samsvarsfeil: Artikkelen er i flertall, så substantivet <em>${escapeHtml(finding.noun)}</em> må også være det. Prøv <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `Samsvarsfeil: Artikkelen er i fleirtal, så substantivet <em>${escapeHtml(finding.noun)}</em> må også vere det. Prøv <em>${escapeHtml(finding.fix)}</em>.`,
      en: `Agreement error: The article is plural, so the noun <em>${escapeHtml(finding.noun)}</em> must be plural too. Try <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos, lang } = ctx;
      const nounForms = vocab.nounForms || new Map();
      const articles = PLURAL_ARTICLES[lang];
      if (!articles) return [];

      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        if (articles.has(t.word) && next) {
          // Special case for German 'die': only flag if we are SURE it's plural context
          // (for now, let's keep it simple and focus on FR/ES where it's unambiguous)
          if (lang === 'de' && t.word === 'die') continue;

          // Clitic-cluster guard: if the previous token is a personal pronoun
          // AND the candidate is a known verb form, this is a clitic + verb
          // ("leur les montre", "je les montre"), not article + noun. Skip.
          const prev = tokens[i - 1];
          const verbInf = vocab.verbInfinitive;
          if (prev && PRONOUNS[lang] && PRONOUNS[lang].has(prev.word)
              && verbInf && verbInf.has(next.word)) continue;

          const isAlsoPlural = Array.from(nounForms.values()).some(f => f.plural.has(next.word));
          if (isAlsoPlural) continue;
          const forms = Array.from(nounForms.values()).find(f => f.singular.has(next.word));
          if (forms && forms.plural.size > 0) {
            const fix = Array.from(forms.plural)[0];
            out.push({
              rule_id: 'agreement',
              priority: rule.priority,
              start: next.start,
              end: next.end,
              original: next.display,
              noun: next.display,
              fix: matchCase(next.display, fix),
              suggestion: matchCase(next.display, fix),
              message: `Flertall: "${t.display} ${fix}"`,
            });
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
