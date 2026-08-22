/**
 * Spell-check rule: accusative pronoun used as indirect object of a
 * two-object (ditransitive) verb (de-dativ-objekt, priority 25).
 *
 * German ditransitive verbs (geben, sagen, zeigen, schicken, bringen,
 * schenken, erklären, erzählen) take TWO objects:
 *   • a DATIVE indirect object  (the recipient)
 *   • an ACCUSATIVE direct object (the thing given/shown/sent)
 *
 * Norwegian uses "meg/deg/ham" for both roles; German has separate dative
 * forms (mir/dir/ihm). Students often write:
 *   "Er gibt ihn das Buch."   → "Er gibt ihm das Buch."
 *   "Ich sage dich die Wahrheit." → "Ich sage dir die Wahrheit."
 *
 * Only the three accusative forms with a distinct dative counterpart are
 * flagged: mich→mir, dich→dir, ihn→ihm.
 * "sie/uns/euch" are identical in acc and dat — not flagged.
 *
 * Detection:
 *   1. Find a token that maps to a DATIVE_VERB_INF.
 *   2. Scan forward in the same clause for mich/dich/ihn.
 *   3. If found → flag → suggest the dative form.
 *
 * Clause boundary stops: CLAUSE_COORD and comma/semicolon/colon/period
 * in the inter-token gap.
 *
 * Rule ID: 'de-dativ-objekt'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Ditransitive verbs that require a dative indirect object.
  const DATIVE_VERB_INF = new Set([
    'geben', 'sagen', 'zeigen', 'schicken', 'bringen',
    'schenken', 'erklären', 'erzählen', 'empfehlen',
  ]);

  // Accusative personal pronouns that have a distinct dative form.
  const ACC_TO_DAT = new Map([
    ['mich', 'mir'],
    ['dich', 'dir'],
    ['ihn',  'ihm'],
  ]);

  const CLAUSE_STOP = new Set(['und', 'oder', 'aber', 'sondern', 'denn']);

  function isDativeVerb(word, verbInf) {
    const inf = (verbInf && verbInf.get(word)) || word;
    return DATIVE_VERB_INF.has(inf);
  }

  const rule = {
    id: 'de-dativ-objekt',
    languages: ['de'],
    priority: 25,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Grammar hint — indirect object case (dative vs accusative); semantic check',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      const orig = esc(finding && finding.original || '');
      const fix  = esc(finding && finding.fix || '');
      const verb = finding && finding.verb
        ? `<em>${esc(finding.verb)}</em>` : 'dette verbet';
      return {
        nb: `${verb} er et toverdig verb med et indirekte objekt i dativ. Det indirekte objektet (mottakeren) må stå i dativ: <strong>${fix}</strong>, ikke akkusativ <em>${orig}</em>. Direkte objekt (tingen) forblir i akkusativ.`,
        nn: `${verb} er eit toverdig verb med eit indirekte objekt i dativ. Det indirekte objektet (mottakaren) må stå i dativ: <strong>${fix}</strong>, ikkje akkusativ <em>${orig}</em>. Direkte objekt (tingen) forblir i akkusativ.`,
        en: `${verb} is a ditransitive verb requiring a dative indirect object. The indirect object (the recipient) must be dative: <strong>${fix}</strong>, not accusative <em>${orig}</em>. The direct object (the thing) stays accusative.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, text } = ctx;
      if (!tokens || tokens.length < 2 || !text) return [];
      const vocab = ctx.vocab || {};
      const verbInf = vocab.verbInfinitive instanceof Map ? vocab.verbInfinitive : null;
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        if (!isDativeVerb(tokens[i].word, verbInf)) continue;
        const verbTok = tokens[i];

        // Forward scan for the first accusative pronoun in this clause.
        for (let k = i + 1; k < tokens.length; k++) {
          if (CLAUSE_STOP.has(tokens[k].word)) break;
          const gap = text.slice(tokens[k - 1].end, tokens[k].start);
          if (/[,;:.]/.test(gap)) break;

          const dat = ACC_TO_DAT.get(tokens[k].word);
          if (!dat) continue;

          const pTok = tokens[k];
          if (cursorPos != null && cursorPos >= pTok.start && cursorPos <= pTok.end) break;

          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: pTok.start,
            end: pTok.end,
            original: pTok.display,
            fix: dat,
            verb: (verbInf && verbInf.get(verbTok.word)) || verbTok.display,
          });
          break;
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
