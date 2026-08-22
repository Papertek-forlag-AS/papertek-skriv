/**
 * Spell-check rule: German dative-governing verbs (de-dative-verb, priority 47).
 *
 * A closed set of common verbs takes a DATIVE object, not accusative —
 * helfen, danken, folgen, gefallen, gehören, antworten, passen, schmecken,
 * gratulieren. Norwegian has no case on objects, so students reach for the
 * accusative pronoun they meet first:
 *   "Ich helfe dich"   → "Ich helfe dir"
 *   "Das gefällt mich" → "Das gefällt mir"
 *   "Ich danke dich"   → "Ich danke dir"
 *
 * Detection (conservative, low-FP): a FINITE present form of a dative verb
 * directly followed (≤1 intervening token) by one of the THREE unambiguous
 * accusative pronouns mich / dich / ihn → suggest the dative mir / dir / ihm.
 * Ambiguous pronouns (uns, euch, sie, es) are skipped — they look the same in
 * both cases or are too easily a different verb's object. A second verb between
 * the dative verb and the pronoun aborts (the pronoun belongs to that verb).
 *
 * VG1 chapter 12 (Tysk 1). The bare infinitive forms (helfen/danken/…) are
 * intentionally excluded so "Ich will dir helfen" (correct, pronoun before the
 * infinitive) is never touched, and "wir/sie helfen" can't false-fire.
 *
 * Exam classification: safe=false. The accusative pronoun is a perfectly valid
 * word; flagging it is contextual case guidance with a Lær mer lesson — beyond
 * Chrome native spellcheck parity (same class as de-prep-case / de-wechselpraep).
 *
 * Rule ID: 'de-dative-verb'
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

  // Finite PRESENT forms of common dative-governing verbs (bare infinitives and
  // the syncretic wir/sie/-en forms are deliberately omitted — see header).
  const DATIVE_VERB_FORMS = new Set([
    // helfen (strong: hilfst/hilft)
    'helfe', 'hilfst', 'hilft', 'helft',
    // danken
    'danke', 'dankst', 'dankt',
    // folgen
    'folge', 'folgst', 'folgt',
    // gefallen (strong: gefällst/gefällt)
    'gefalle', 'gefällst', 'gefällt',
    // gehören
    'gehöre', 'gehörst', 'gehört',
    // antworten
    'antworte', 'antwortest', 'antwortet',
    // passen
    'passe', 'passt',
    // schmecken
    'schmecke', 'schmeckst', 'schmeckt',
    // gratulieren
    'gratuliere', 'gratulierst', 'gratuliert',
  ]);

  // Unambiguous accusative → dative personal pronouns.
  const ACC_TO_DAT = { mich: 'mir', dich: 'dir', ihn: 'ihm' };

  // Dative pronouns — if one appears first, the dative verb's object is already
  // correct ("hilft dir …"), so a later accusative pronoun belongs to a
  // different verb ("hilft dir, dich zu entspannen" — dich is entspannen's
  // reflexive), not the dative verb. Stop scanning.
  const DAT_PRON = new Set(['mir', 'dir', 'ihm', 'ihr', 'uns', 'euch', 'ihnen']);

  // A finite verb form between the dative verb and the pronoun means the pronoun
  // is that verb's object — abort. Cheap heuristic: any other token that is
  // itself a dative-verb form, or ends in a finite verb ending after a known
  // stem, is hard to detect generically, so we just require ADJACENCY (≤1 gap)
  // and that the gap token is not a verb-like token (handled by the small window).

  const rule = {
    id: 'de-dative-verb',
    languages: ['de'],
    priority: 47,
    exam: {
      safe: false,
      reason: 'Contextual dative-case guidance with Lær mer pedagogy — the accusative pronoun is a valid word; flagging it exceeds Chrome native parity',
      category: 'grammar-lookup',
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Verbet <em>${esc(finding.verb || '')}</em> styrer <strong>dativ</strong> — bruk <em>${esc(finding.fix)}</em> i stedet for <em>${esc(finding.original)}</em>.`,
      nn: `Verbet <em>${esc(finding.verb || '')}</em> styrer <strong>dativ</strong> — bruk <em>${esc(finding.fix)}</em> i staden for <em>${esc(finding.original)}</em>.`,
      en: `The verb <em>${esc(finding.verb || '')}</em> takes the <strong>dative</strong> — use <em>${esc(finding.fix)}</em> instead of <em>${esc(finding.original)}</em>.`,
    }),
    check(ctx) {
      const { tokens, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        if (!DATIVE_VERB_FORMS.has(tokens[i].word)) continue;

        // Look at the next up-to-2 tokens for an accusative pronoun. Stop at the
        // first one; a clause-ending token in the gap aborts.
        for (let j = i + 1; j <= i + 2 && j < tokens.length; j++) {
          // Clause boundary in the gap → the pronoun is in a different clause.
          if (ctx.text && /[,;:.!?]/.test(ctx.text.slice(tokens[j - 1].end, tokens[j].start))) break;
          const pron = tokens[j].word;
          // The dative object is already present ("hilft dir …") → verb
          // satisfied; a later accusative belongs to another verb.
          if (DAT_PRON.has(pron)) break;
          const dat = ACC_TO_DAT[pron];
          if (!dat) {
            // Allow exactly one intervening non-pronoun token (e.g. an adverb:
            // "gefällt dir nicht" has none, but "hilft mir gern" — pronoun is
            // first; "danke dir sehr" — pronoun first). If the gap token is
            // another dative-verb form, abort (its own object follows).
            if (DATIVE_VERB_FORMS.has(pron) || ACC_TO_DAT[pron]) break;
            continue;
          }
          if (cursorPos != null && cursorPos >= tokens[j].start && cursorPos <= tokens[j].end + 1) break;
          const fix = applyCase(tokens[j].display, dat);
          out.push({
            rule_id: 'de-dative-verb',
            priority: rule.priority,
            start: tokens[j].start,
            end: tokens[j].end,
            original: tokens[j].display,
            fix,
            verb: tokens[i].display,
            message: `${tokens[i].display} styrer dativ: «${tokens[j].display}» → «${fix}»`,
            severity: 'error',
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
