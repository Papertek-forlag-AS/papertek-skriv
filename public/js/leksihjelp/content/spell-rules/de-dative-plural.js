/**
 * Spell-check rule: German dative-plural -n (de-dative-plural, priority 20).
 *
 * After a dative-governing preposition, a plural noun must take the dative
 * plural ending -n (unless the plural already ends in -n or -s):
 *
 *   "seit drei Jahre"   → "seit drei Jahren"
 *   "mit den Kinder"    → "mit den Kindern"
 *   "aus vielen Länder" → "aus vielen Ländern"
 *
 * Data-driven: vocab.deDativePlural maps a noun's nominative-plural surface
 * form to its dative-plural form, but ONLY when they differ (the -n is added).
 * Plurals already ending in -n/-s ("Frauen", "Autos") map to themselves and
 * are absent from the index, so a hit is always a real, fixable omission.
 *
 * Scope / FP guards:
 *   - Fires only after one of the nine ALWAYS-dative prepositions (aus, außer,
 *     bei, gegenüber, mit, nach, seit, von, zu). Two-way prepositions are
 *     excluded — their case depends on motion vs. location (see de-prep-case /
 *     the Wechselpräposition rule).
 *   - The candidate must be an UNAMBIGUOUS plural form (in some lemma's plural
 *     bucket and not in any singular bucket), so a singular noun that happens
 *     to coincide with another noun's nominative plural is never flagged.
 *   - The article-scan stops at the first noun (so a correct dative plural or
 *     a singular object ends the scan) and at any further preposition.
 *
 * Exam mode: safe = false — syntactic case marking, not a single-token lookup.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const DATIVE_PREPS = new Set(['aus', 'außer', 'bei', 'gegenüber', 'mit', 'nach', 'seit', 'von', 'zu']);

  // Exclusive-plural set: forms that appear in some lemma's plural bucket and
  // NOT in any singular bucket. Cached on the vocab object (shared shape with
  // de-prep-case's getPluralForms). Guards against flagging a singular form.
  function exclusivePlurals(vocab) {
    if (vocab.__deDatPluralExclusive) return vocab.__deDatPluralExclusive;
    const plural = new Set();
    const singular = new Set();
    const nf = vocab.nounForms;
    if (nf && typeof nf.values === 'function') {
      for (const forms of nf.values()) {
        if (!forms) continue;
        if (forms.plural) for (const p of forms.plural) plural.add(String(p).toLowerCase());
        if (forms.singular) for (const s of forms.singular) singular.add(String(s).toLowerCase());
      }
    }
    const ex = new Set();
    for (const w of plural) if (!singular.has(w)) ex.add(w);
    vocab.__deDatPluralExclusive = ex;
    return ex;
  }

  const rule = {
    id: 'de-dative-plural',
    languages: ['de'],
    priority: 20,
    exam: {
      safe: false,
      reason: 'Stays safe=false (de-dative-plural) — dative-plural case marking is a syntactic check, not a single-token spelling lookup',
      category: 'grammar-lookup',
    },
    severity: 'error',
    explain: (finding) => {
      const o = escapeHtml(finding.original);
      const f = escapeHtml(finding.fix);
      return {
        nb: `Etter en dativ-preposisjon får substantivet i flertall endelsen <em>-n</em> — bruk <em>${f}</em> i stedet for <em>${o}</em>.`,
        nn: `Etter ein dativ-preposisjon får substantivet i fleirtal endinga <em>-n</em> — bruk <em>${f}</em> i staden for <em>${o}</em>.`,
        en: `After a dative preposition, a plural noun takes the ending <em>-n</em> — use <em>${f}</em> instead of <em>${o}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos } = ctx;
      if (!tokens) return [];
      const vocab = ctx.vocab || {};
      const datPl = vocab.deDativePlural instanceof Map ? vocab.deDativePlural : null;
      if (!datPl || datPl.size === 0) return [];
      const nounGenus = vocab.nounGenus instanceof Map ? vocab.nounGenus : new Map();
      const exPlural = exclusivePlurals(vocab);
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        if (!DATIVE_PREPS.has(tokens[i].word)) continue;
        const scanEnd = Math.min(i + 4, tokens.length);
        for (let j = i + 1; j < scanEnd; j++) {
          const w = tokens[j].word;
          if (DATIVE_PREPS.has(w)) break; // a new prepositional phrase
          const fixForm = datPl.get(w);
          if (fixForm && exPlural.has(w)) {
            const verbTok = tokens[j];
            if (cursorPos != null && cursorPos >= verbTok.start && cursorPos <= verbTok.end + 1) { break; }
            out.push({
              rule_id: 'de-dative-plural',
              priority: rule.priority,
              start: verbTok.start,
              end: verbTok.end,
              original: verbTok.display,
              fix: matchCase(verbTok.display, fixForm),
              message: `«${verbTok.display}» mangler dativ-flertallsendelsen -n — bruk «${fixForm}»`,
            });
            break;
          }
          // Stop at the first noun (correct dative plural, or a singular object).
          if (nounGenus.has(w)) break;
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
