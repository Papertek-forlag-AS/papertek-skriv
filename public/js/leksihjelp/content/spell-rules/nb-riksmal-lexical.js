/**
 * Spell-check rule: lexical riksmål markers (priority 40).
 *
 * Old-fashioned riksmål spellings — `efter`, `sne`, `nu`, `fandt`, `sagde` —
 * that are nearly never the intended form in modern student bokmål writing.
 * Without this rule, typo-fuzzy (priority 50) catches them but with the
 * wrong neighbour: `sne → sen`, `efter → eter`. The rule fires per-token,
 * unconditionally, with the canonical bokmål replacement from
 * BOKMAL_RIKSMAL_MAP — and runs *before* typo-fuzzy so dedupeOverlapping
 * keeps the right fix.
 *
 * Distinct from `doc-drift-nb-register` (priority 203, document-pass): that
 * rule handles morphological inconsistency (`Jenta` in §1, `jenten` in §3)
 * where both forms are valid and the issue is intra-document drift. Lexical
 * riksmål has no morphological/dialect equivalent — `sne` simply isn't a
 * modern bokmål word.
 *
 * Inline pedagogy ("Lær mer" content) explains *why* — students often see
 * these forms in older books and assume they're current.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml, matchCase } = host.__lexiSpellCore || {};

  function getMap() {
    return host.__lexiGrammarTables && host.__lexiGrammarTables.BOKMAL_RIKSMAL_MAP;
  }
  function getLexicalForms() {
    return (host.__lexiGrammarTables && host.__lexiGrammarTables.LEXICAL_RIKSMAL_FORMS) || new Set();
  }

  // Per-form pedagogy snippets. Keyed by canonical lowercase riksmål form.
  // Surfaces in the popover's "Lær mer" panel via finding.pedagogy.
  // Shape mirrors the shared pedagogy contract enforced by
  // scripts/check-explain-contract.js (summary.nb/en + explanation.nb).
  function ped(nbSummary, nbExplain, enSummary, enExplain) {
    return {
      summary: { nb: nbSummary, nn: nbSummary, en: enSummary },
      explanation: { nb: nbExplain, nn: nbExplain, en: enExplain },
    };
  }
  const PEDAGOGY = {
    efter: ped(
      '«Efter» er en gammel riksmålform. Modern bokmål skriver «etter».',
      '<em>Efter</em> er en gammeldags riksmålform. Modern bokmål skriver <em>etter</em>. Du møter <em>efter</em> i eldre tekster (f.eks. Henrik Ibsen), men ikke i dagens skrift.',
      '"Efter" is an old riksmål form. Modern bokmål uses "etter".',
      '<em>Efter</em> is an archaic riksmål form. Modern bokmål writes <em>etter</em>. You will meet it in older texts (e.g. Ibsen), but not in current writing.'
    ),
    sne: ped(
      '«Sne» er en gammel skrivemåte. Modern bokmål skriver «snø» — med ø.',
      '<em>Sne</em> er en gammel skrivemåte du finner i eldre bøker og dansk. Modern bokmål skriver <em>snø</em> — med ø.',
      '"Sne" is an archaic spelling. Modern bokmål writes "snø" — with ø.',
      '<em>Sne</em> is an old spelling found in older books and in Danish. Modern bokmål writes <em>snø</em> with ø.'
    ),
    nu: ped(
      '«Nu» er gammelt; bokmål skriver «nå».',
      '<em>Nu</em> er en gammel form, fremdeles vanlig i svensk og dansk. På bokmål skriver vi <em>nå</em>.',
      '"Nu" is archaic; bokmål uses "nå".',
      '<em>Nu</em> is archaic, still current in Swedish and Danish. Bokmål uses <em>nå</em>.'
    ),
    fandt: ped(
      '«Fandt» er gammel preteritum av «finne»; bokmål skriver «fant».',
      '<em>Fandt</em> er den gamle preteritumformen til <em>finne</em>, brukt i riksmål og dansk. Modern bokmål skriver <em>fant</em>.',
      '"Fandt" is an old past-tense of "finne"; bokmål uses "fant".',
      '<em>Fandt</em> is the archaic past tense of <em>finne</em>, used in riksmål and Danish. Modern bokmål writes <em>fant</em>.'
    ),
    sagde: ped(
      '«Sagde» er gammel preteritum av «si»; bokmål skriver «sa».',
      '<em>Sagde</em> er den gamle preteritumformen til <em>si</em>, brukt i riksmål og dansk. Modern bokmål skriver <em>sa</em>.',
      '"Sagde" is an old past-tense of "si"; bokmål uses "sa".',
      '<em>Sagde</em> is the archaic past tense of <em>si</em>, used in riksmål and Danish. Modern bokmål writes <em>sa</em>.'
    ),
  };
  const PEDAGOGY_FALLBACK = ped(
    'Riksmål er en konservativ bokmålstradisjon med eldre stavemåter — disse formene regnes ikke som korrekt moderne bokmål.',
    'Riksmål er en konservativ bokmålstradisjon som ofte beholder eldre stavemåter. Mange av disse formene møter du i eldre bøker, men de regnes ikke som korrekt moderne bokmål.',
    'Riksmål is a conservative bokmål tradition that keeps older spellings — these forms aren’t considered correct modern bokmål.',
    'Riksmål is a conservative bokmål tradition that often keeps older spellings. Many of these forms appear in older books, but they aren’t considered correct modern bokmål.'
  );

  const rule = {
    id: 'nb-riksmal-lexical',
    languages: ['nb'],
    priority: 40,
    exam: {
      safe: false,
      reason: 'Register guidance — explains modern bokmål vs old-fashioned riksmål; pedagogical surface beyond browser native parity',
      category: 'grammar-lookup',
    },
    severity: 'warning',

    explain(finding) {
      const esc = escapeHtml || (s => s);
      const word = finding.original || '';
      const fix = finding.fix || '';
      const nb = `<em>${esc(word)}</em> er en gammeldags riksmålform — mente du <em>${esc(fix)}</em>?`;
      const nn = `<em>${esc(word)}</em> er ei gammaldags riksmålform — meinte du <em>${esc(fix)}</em>?`;
      const key = (word || '').toLowerCase();
      const pedagogy = PEDAGOGY[key] || PEDAGOGY_FALLBACK;
      return { nb, nn, severity: 'warning', pedagogy };
    },

    check(ctx) {
      const MAP = getMap();
      const LEXICAL = getLexicalForms();
      if (!MAP || !LEXICAL || LEXICAL.size === 0) return [];

      const { tokens, cursorPos, suppressed } = ctx;
      const out = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;
        if (!LEXICAL.has(t.word)) continue;
        const fixLower = MAP.get(t.word);
        if (!fixLower) continue;
        const fix = matchCase ? matchCase(t.display, fixLower) : fixLower;
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix,
          message: `Riksmålform: "${t.display}" → "${fix}"`,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
