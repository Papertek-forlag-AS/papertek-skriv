/**
 * Spell-check rule: Nynorsk dual-form consistency (nn-form-consistency,
 * priority 66, P3 hint band).
 *
 * Some words have TWO official Nynorsk forms (Nynorskordboka "el." entries).
 * Both are correct — but using both variants of the SAME word in one text is
 * a style inconsistency (same principle as en-spelling-consistency for
 * British/American English). This rule flags the minority variant's
 * occurrences and suggests the majority form.
 *
 * User decision 2026-07 (follow-up to the mens→medan spec correction in
 * nb-dialect-mix): «mens» is standard NN and must not flag alone, but
 * mixing «mens» and «medan» in one text should coach consistency.
 *
 * The pair list is curated and word-level (not inflectional paradigms —
 * a/e-infinitiv and -ar/-er presens mixing are document-level checks
 * planned as DOC-04 in the Phase 13 document-state seam).
 *
 * Rule ID: 'nn-form-consistency'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml, matchCase } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Curated dual-form pairs — both members are STANDARD Nynorsk
  // (Nynorskordboka "el." entries). [formA, formB]; neither is preferred,
  // the majority in the student's own text wins.
  const DUAL_FORM_PAIRS = [
    ['mens', 'medan'],
    // Room to grow: add pairs only after verifying BOTH forms are standard
    // single-word NN entries at ord.uib.no (same bar as the mens fix).
  ];

  // token word → { key, other }
  const PAIR_INDEX = new Map();
  for (const [a, b] of DUAL_FORM_PAIRS) {
    PAIR_INDEX.set(a, { key: a + '|' + b, other: b });
    PAIR_INDEX.set(b, { key: a + '|' + b, other: a });
  }

  const rule = {
    id: 'nn-form-consistency',
    languages: ['nn'],
    priority: 66, // P3 hint band
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Dual-form consistency pedagogy (both forms are standard Nynorsk) — style coaching beyond native spellcheck parity',
      category: 'grammar-lookup',
    },
    explain(finding) {
      const a = esc(finding.original || '');
      const b = esc(finding.fix || '');
      return {
        nb: `Både <em>${a}</em> og <em>${b}</em> er riktig nynorsk — men du har brukt begge formene i teksten. Vær konsekvent: resten av teksten bruker <em>${b}</em>.`,
        nn: `Både <em>${a}</em> og <em>${b}</em> er rett nynorsk — men du har brukt begge formene i teksten. Ver konsekvent: resten av teksten brukar <em>${b}</em>.`,
        en: `Both <em>${a}</em> and <em>${b}</em> are correct Nynorsk — but you used both forms in this text. Be consistent: the rest of your text uses <em>${b}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, lang } = ctx;
      if (lang !== 'nn' || !tokens || tokens.length < 2) return [];

      // Pass 1: bucket occurrences per pair.
      const byPair = new Map(); // key → { a: markers[], b: markers[] } keyed by word
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const entry = PAIR_INDEX.get(t.word);
        if (!entry) continue;
        if (!byPair.has(entry.key)) byPair.set(entry.key, new Map());
        const buckets = byPair.get(entry.key);
        if (!buckets.has(t.word)) buckets.set(t.word, []);
        buckets.get(t.word).push({ i, tok: t, other: entry.other });
      }

      const out = [];
      for (const [, buckets] of byPair) {
        if (buckets.size < 2) continue; // only one variant used — consistent
        const groups = [...buckets.values()];
        // Minority = fewer occurrences; tie → the variant whose FIRST
        // occurrence comes later (the writer "switched").
        groups.sort((g1, g2) => (g1.length - g2.length) || (g2[0].i - g1[0].i));
        const minority = groups[0];
        for (const mk of minority) {
          if (cursorPos != null && cursorPos >= mk.tok.start && cursorPos <= mk.tok.end + 1) continue;
          const fix = matchCase ? matchCase(mk.tok.display, mk.other) : mk.other;
          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: mk.tok.start,
            end: mk.tok.end,
            original: mk.tok.display,
            fix,
            suggestion: fix,
            severity: rule.severity,
            message: `Både «${mk.tok.display}» og «${fix}» er rett nynorsk — ver konsekvent (resten av teksten brukar «${fix}»)`,
          });
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
