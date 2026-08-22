/**
 * Spell-check rule: German preposition + definite article should contract
 * (de-prep-contraction, priority 66 — after collocation 65 so a wrong-preposition
 * collocation error claims the span; a contraction hint on a wrong preposition
 * would be misleading coaching).
 *
 * In German, certain preposition + definite article combinations normally
 * fuse into a single contracted word. Writing them out separately is not
 * technically wrong in all registers, but in everyday written German it
 * sounds unnatural and is flagged as a stylistic weakness.
 *
 * Standard contractions covered:
 *   an  + dem → am      an  + das → ans
 *   auf + das → aufs
 *   bei + dem → beim
 *   durch + das → durchs
 *   für + das → fürs
 *   in  + dem → im      in  + das → ins
 *   über + das → übers
 *   um  + das → ums
 *   von + dem → vom
 *   zu  + dem → zum     zu  + der → zur
 *
 * FP guard: only fire when the article is immediately followed by a
 * capitalised word (a noun). If the next token is lowercase it is likely
 * a relative pronoun ("das Haus, in dem ich wohne") or the preposition is
 * part of a prepositional phrase without a direct noun — skip to avoid FPs.
 *
 * The finding spans the full [prep article] run so the replacement text
 * ("im", "am", …) cleanly replaces both words.
 *
 * Rule ID: 'de-prep-contraction'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Map: prep → { articleForm: contractedForm }
  //
  // SCOPE: only the strongly-preferred dem/der contractions, where the
  // uncontracted form sounds stilted in standard written German (an dem → am,
  // in dem → im, zu dem → zum, zu der → zur, von dem → vom, bei dem → beim).
  //
  // The optional "das" contractions were REMOVED (für das → fürs, in das → ins,
  // auf das → aufs, über das → übers, durch das → durchs, um das → ums, an das
  // → ans): both spellings are fully correct standard German, so flagging the
  // uncontracted form is a false positive, not a style improvement. Removing
  // "um das → ums" also fixes the "um … zu" bug — in "um das Projekt zu
  // vollenden", that "um" is the infinitival conjunction, not the preposition,
  // and "ums" would be wrong.
  const CONTRACTIONS = new Map([
    ['an',    { dem: 'am'                 }],
    ['bei',   { dem: 'beim'               }],
    ['in',    { dem: 'im'                 }],
    ['von',   { dem: 'vom'                }],
    ['zu',    { dem: 'zum',  der: 'zur'   }],
  ]);

  const rule = {
    id: 'de-prep-contraction',
    languages: ['de'],
    priority: 66,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Style hint — suggests standard contraction; not a spellcheck error',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      if (!finding || !finding.original) {
        return {
          nb: 'Preposisjon og bestemt artikkel bør slås sammen til ett ord på tysk.',
          nn: 'Preposisjon og bunden artikkel bør slåast saman til eitt ord på tysk.',
          en: 'Preposition and definite article should contract into one word in German.',
        };
      }
      const orig = esc(finding.original);
      const fix  = esc(finding.fix || '');
      return {
        nb: `På tysk slår man som regel <em>${orig}</em> saman til <strong>${fix}</strong>.`,
        nn: `På tysk slår ein som regel <em>${orig}</em> saman til <strong>${fix}</strong>.`,
        en: `In German, <em>${orig}</em> normally contracts to <strong>${fix}</strong>.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos } = ctx;
      if (!tokens || tokens.length < 3) return [];
      const out = [];

      for (let i = 0; i < tokens.length - 2; i++) {
        const prepTok = tokens[i];
        const artTok  = tokens[i + 1];
        const nounTok = tokens[i + 2];

        const articles = CONTRACTIONS.get(prepTok.word);
        if (!articles) continue;

        const contracted = articles[artTok.word];
        if (!contracted) continue;

        // Require the following token to start with an uppercase letter.
        // Lowercase next token = relative pronoun or pronoun phrase → skip.
        const nounFirst = nounTok.display.charAt(0);
        if (nounFirst !== nounFirst.toUpperCase() || nounFirst === nounFirst.toLowerCase()) continue;

        // Genus guard (Ordbank sweep 2026-07): when the noun's genus
        // contradicts the article, the ARTICLE is the error (de-prep-case
        // territory) — contracting it would fuse the wrong article into the
        // suggestion ("von dem Frau" → "vom Frau") and dedupeOverlapping
        // would silence the real prep-case finding. dem = m/n dative,
        // der = f dative; only guard when the genus is known.
        const genusMap = ctx.vocab && ctx.vocab.nounGenus;
        if (genusMap) {
          const g = genusMap.get(nounTok.word);
          if (g === 'f' && artTok.word === 'dem') continue;
          if ((g === 'm' || g === 'n') && artTok.word === 'der') continue;
        }

        if (cursorPos != null) {
          if (cursorPos >= prepTok.start && cursorPos <= artTok.end) continue;
        }

        // The finding covers the full "prep article" span.
        const originalText = ctx.text
          ? ctx.text.slice(prepTok.start, artTok.end)
          : `${prepTok.display} ${artTok.display}`;

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: prepTok.start,
          end: artTok.end,
          original: originalText,
          fix: contracted,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
