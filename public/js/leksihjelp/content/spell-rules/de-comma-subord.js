/**
 * Spell-check rule: missing comma before a subordinating conjunction in German
 * (de-comma-subord, priority 27).
 *
 * German grammar requires a comma before subordinating conjunctions when they
 * do not open the sentence. Norwegian students routinely forget this because
 * the rule exists in Norwegian too but feels "different" in a foreign language.
 *
 * Conjunctions covered:
 *   dass, weil, obwohl, ob, damit, bevor, nachdem, während, falls, wenn,
 *   sobald, solange, seitdem, bis (temporal), seit (temporal), ehe
 *
 * Excluded:
 *   als — too ambiguous with the comparative ("größer als ich")
 *   denn — coordinating conjunction (different grammar, comma varies by style)
 *
 * Detection:
 *   1. Find a subordinating conjunction at token index > 0
 *      (index 0 means sentence-open "Wenn …" — no preceding comma needed).
 *   2. Check the raw text between the previous token end and the conjunction
 *      start. If it contains no comma (or semicolon) → flag.
 *   3. The finding spans [prevTok.end, conjTok.end] so the fix replaces
 *      " weil" with ", weil" — inserting the comma without disrupting spacing.
 *
 * Rule ID: 'de-comma-subord'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // 'während', 'seit', 'bis' omitted — each doubles as a preposition mid-sentence
  // (e.g. "Er schläft während der Reise") and is too ambiguous without noun-phrase
  // detection. 'seitdem' is always a conjunction and is safe to include.
  const SUBORD = new Set([
    'dass', 'weil', 'obwohl', 'ob', 'damit', 'bevor', 'nachdem',
    'falls', 'wenn', 'sobald', 'solange', 'seitdem', 'ehe',
  ]);

  // A subject-starter that can open the clause after the CONJUNCTION "damit"
  // (so that): a personal pronoun or an article/determiner. The homograph
  // pronominal adverb "damit" (= with it/thereby) is instead followed by an
  // adjective/participle/object or is clause-final ("damit zufrieden", "damit
  // gerechnet", "Gib mir den Stift damit!") — no comma there.
  const SUBJECT_STARTER = new Set([
    'ich', 'du', 'er', 'sie', 'es', 'wir', 'ihr', 'man',
    'der', 'die', 'das', 'dem', 'den', 'des',
    'ein', 'eine', 'einen', 'einem', 'einer', 'eines',
    'dieser', 'diese', 'dieses', 'diesen', 'diesem',
    'mein', 'meine', 'dein', 'deine', 'sein', 'seine',
    'unser', 'unsere', 'euer', 'eure', 'ihre',
  ]);

  const rule = {
    id: 'de-comma-subord',
    languages: ['de'],
    priority: 27,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Punctuation hint — comma before subordinate clause; not a spellcheck error',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      const conj = finding && finding.conj ? `<em>${esc(finding.conj)}</em>` : 'konjunksjonen';
      return {
        nb: `På tysk setter man alltid komma foran en underordnet konjunksjon som ${conj} når den ikke innleder setningen.`,
        nn: `På tysk set ein alltid komma framfor ein underordna konjunksjon som ${conj} når han ikkje innleier setninga.`,
        en: `In German, a comma is always required before a subordinating conjunction like ${conj} when it does not open the sentence.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, text } = ctx;
      if (!tokens || tokens.length < 2 || !text) return [];
      const out = [];

      for (let i = 1; i < tokens.length; i++) {
        const conjTok = tokens[i];
        if (!SUBORD.has(conjTok.word)) continue;

        const prevTok = tokens[i - 1];

        // The gap between the previous word and the conjunction.
        const gap = text.slice(prevTok.end, conjTok.start);

        // If the gap already contains a comma or semicolon → nothing to do.
        if (/[,;]/.test(gap)) continue;

        // If the gap contains anything other than whitespace (e.g. punctuation
        // like "?" or "!") the sentence is likely ending — skip.
        if (/[.!?]/.test(gap)) continue;

        // Metalinguistic quoting ("Man sagt „ob" auf Deutsch") — an opening
        // quote in the gap means the conjunction is being MENTIONED, not used.
        if (/[„“”"«»‚‘’]/.test(gap)) continue;

        // "Ehe" capitalized mid-sentence is the NOUN (die Ehe = marriage), not
        // the conjunction "ehe" (before), which is lowercase. Skip the noun.
        if (conjTok.word === 'ehe' && conjTok.display &&
            conjTok.display[0] === conjTok.display[0].toUpperCase() &&
            conjTok.display[0] !== conjTok.display[0].toLowerCase()) continue;

        // "als ob" (as if) is a fixed two-word conjunction — the comma belongs
        // before "als", not between "als" and "ob". Skip "ob" after "als".
        if (conjTok.word === 'ob' && prevTok.word === 'als') continue;

        // "auch wenn" (even if/though) — the comma belongs before "auch", not
        // between "auch" and "wenn". Skip "wenn" after "auch".
        if (conjTok.word === 'wenn' && prevTok.word === 'auch') continue;

        // "so dass" / "sodass" (so that) — the comma belongs before the "so"
        // unit (usually already present), not between "so" and "dass".
        if (conjTok.word === 'dass' && prevTok.word === 'so') continue;

        // "damit" homograph: only the CONJUNCTION (so that) takes a comma, and
        // it is followed by the clause subject (pronoun/article). When "damit"
        // is the pronominal adverb (= with it) it is followed by an adjective/
        // participle/object or is clause-final — no comma. ("ist damit
        // zufrieden", "damit gerechnet", "den Stift damit!", "damit Vokabeln
        // trainieren".)
        if (conjTok.word === 'damit') {
          const nextTok = tokens[i + 1];
          if (!nextTok || !SUBJECT_STARTER.has(nextTok.word)) continue;
        }

        // Skip if the previous token itself is a comma or opening punctuation
        // (conjunction IS opening the clause — no preceding comma needed).
        if (/^[,;.!?(\[{]$/.test(prevTok.word)) continue;

        if (cursorPos != null) {
          if (cursorPos >= prevTok.end && cursorPos <= conjTok.end) continue;
        }

        const originalText = text.slice(prevTok.end, conjTok.end);
        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: prevTok.end,
          end: conjTok.end,
          original: originalText,
          fix: ', ' + conjTok.display,
          conj: conjTok.display,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
