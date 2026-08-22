/**
 * Spell-check rule: Spanish accent and special character guard (priority 15).
 *
 * Norweigan keyboards make Spanish accents and 'ñ' tedious to type.
 * This rule flags common missing accents or 'n' instead of 'ñ'.
 *
 * Rule ID: 'es-accent'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { matchCase, escapeHtml } = host.__lexiSpellCore || {};

  const COMMON_MISSING_ACCENTS = {
    'esta': { fix: 'está', context: 'verb' },
    'estas': { fix: 'estás', context: 'verb' },
    'tu': { fix: 'tú', context: 'pronoun' },
    'el': { fix: 'él', context: 'pronoun' },
    'si': { fix: 'sí', context: 'affirmative' },
    'ano': { fix: 'año', note: 'year' },
    // Phase 40-05: extend with high-frequency student misses (mas/leido/pelicula).
    // These are unambiguous accent slips for the targeted forms — see audit rows
    // es.36 (leído), es.37 (más), es.40 (película).
    'mas': { fix: 'más', context: 'comparative' },
    'leido': { fix: 'leído', context: 'participle' },
    'leida': { fix: 'leída', context: 'participle' },
    'pelicula': { fix: 'película', context: 'noun' },
    'peliculas': { fix: 'películas', context: 'noun' },
    'dia': { fix: 'día', context: 'noun' },
    'dias': { fix: 'días', context: 'noun' },
    'decision': { fix: 'decisión', context: 'noun' },
    'cancion': { fix: 'canción', context: 'noun' },
    'canciones': { fix: 'canciones', context: 'noun' },
    'comunicacion': { fix: 'comunicación', context: 'noun' },
    'television': { fix: 'televisión', context: 'noun' },
    'examenes': { fix: 'exámenes', context: 'noun' },
    'jamon': { fix: 'jamón', context: 'noun' },
    'corazon': { fix: 'corazón', context: 'noun' },
    'pais': { fix: 'país', context: 'noun' },
    'paises': { fix: 'países', context: 'noun' },
  };

  const rule = {
    id: 'es-accent',
    languages: ['es'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Token-level accent-guard correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Mangler aksent eller spesialtegn. Bruk <em>${escapeHtml(finding.fix)}</em> her (verbform eller substantiv).`,
      nn: `Manglar aksent eller spesialtegn. Bruk <em>${escapeHtml(finding.fix)}</em> her (verbform eller substantiv).`,
      en: `Missing accent or special character. Use <em>${escapeHtml(finding.fix)}</em> here (verb form or noun).`,
    }),
    check(ctx) {
      const { tokens, vocab, cursorPos } = ctx;
      const validWords = vocab.validWords || new Set();
      const knownPresens = vocab.knownPresens || new Set();
      const out = [];

      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        const next = tokens[i + 1];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;

        // 1. Context-aware accent checks
        if (COMMON_MISSING_ACCENTS[t.word]) {
          const p = COMMON_MISSING_ACCENTS[t.word];
          let shouldFlag = false;
          
          if (t.word === 'esta' || t.word === 'estas') {
             // If followed by an adjective or participle, it's often the verb 'está'.
             // Phase 40-05: broaden to feminine participles (-ada/-ida) — covers
             // "Ella esta embarazada" / "esta cansada" class without false positives
             // since 'esta' as demonstrative usually precedes a noun (not -ado/-ido).
             // …but a known NOUN ending in -ada/-ida ("esta temporada", "esta
             // bebida") is the demonstrative, not the verb — the -ada/-ida
             // heuristic must not fire on nouns.
             if (next && (next.word.endsWith('ado') || next.word.endsWith('ido') ||
                          next.word.endsWith('ada') || next.word.endsWith('ida'))
                 && !(vocab.nounGenus && vocab.nounGenus.has(next.word))
                 && !(vocab.nounLemmaGenus && vocab.nounLemmaGenus.has(next.word))) {
               shouldFlag = true;
             }
             // v3.0.121 (synthetic-corpus miss "el agua esta caliente"):
             // esta + known ADJECTIVE is the verb too. The demonstrative
             // precedes a noun, so adjective-next disambiguates the same
             // way the participle endings do.
             if (!shouldFlag && next && vocab.isAdjective && vocab.isAdjective.has(next.word)
                 && !(vocab.nounGenus && vocab.nounGenus.has(next.word))) {
               shouldFlag = true;
             }
          } else if (t.word === 'ano' || t.word === 'mas' ||
                     t.word === 'leido' || t.word === 'leida' ||
                     t.word === 'pelicula' || t.word === 'peliculas' ||
                     t.word === 'dia' || t.word === 'dias' ||
                     t.word === 'decision' ||
                     t.word === 'cancion' ||
                     t.word === 'comunicacion' || t.word === 'television' ||
                     t.word === 'examenes' || t.word === 'jamon' ||
                     t.word === 'corazon' ||
                     t.word === 'pais' || t.word === 'paises') {
            shouldFlag = true; // unambiguous: always the accented form in student texts
          }
          
          const accentFix = matchCase(t.display, p.fix);
          if (shouldFlag && accentFix !== t.display) {   // never emit a no-op suggestion
            out.push({
              rule_id: 'es-accent',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: accentFix,
              message: `Aksent: "${p.fix}"`,
            });
          }
        }

        // 2. Generic 'n' instead of 'ñ' check
        // If word contains 'n', and replacing 'n' with 'ñ' results in a valid word
        // while the original is NOT a valid word (or is much less frequent).
        if (t.word.includes('n') && !validWords.has(t.word)) {
          const withTilde = t.word.replace('n', 'ñ');
          if (validWords.has(withTilde)) {
            out.push({
              rule_id: 'es-accent',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              fix: matchCase(t.display, withTilde),
              message: `Bruk "ñ": "${withTilde}"`,
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
