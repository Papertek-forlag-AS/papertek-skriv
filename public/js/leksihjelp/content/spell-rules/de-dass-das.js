/**
 * Spell-check rule: German "das" confused with "dass" before a clause subject
 * (de-dass-das, priority 29).
 *
 * Norwegian uses one word ("det/at") for both the German demonstrative/article
 * "das" and the subordinating conjunction "dass". Students frequently write
 * "das" where "dass" is required:
 *
 *   "Ich denke das du Recht hast."  →  "Ich denke, dass du Recht hast."
 *   "Ich weiß das es stimmt."       →  "Ich weiß, dass es stimmt."
 *
 * Detection: when "das" is immediately followed by a personal pronoun acting
 * as a clause subject (ich, du, er, sie, es, wir), the "das" is almost
 * certainly the conjunction "dass". The article "das" never directly precedes
 * a personal pronoun in valid German.
 *
 * "ihr" is excluded deliberately: "das ihr" is too ambiguous (could be
 * article + dative "ihr") and produces too many FPs.
 *
 * Only the "das" token is flagged — the student writes the rest of the
 * clause correctly; only the conjunction spelling needs to change.
 *
 * Rule ID: 'de-dass-das'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Personal pronouns that function as clause subjects and never follow "das"
  // as an article in standard German.
  const CLAUSE_SUBJECTS = new Set(['ich', 'du', 'er', 'sie', 'es', 'wir']);

  const rule = {
    id: 'de-dass-das',
    languages: ['de'],
    priority: 29,
    severity: 'error',
    exam: {
      safe: false,
      reason: 'Grammatical error — wrong conjunction; not a surface typo check',
      category: 'grammar-lookup',
    },
    explain: (finding) => {
      const esc = typeof escapeHtml === 'function' ? escapeHtml : (s) => String(s);
      const next = finding && finding.nextWord ? ` <em>${esc(finding.nextWord)}</em>` : '';
      return {
        nb: `<em>das</em> er en artikkel eller demonstrativpronomen; <strong>dass</strong> er konjunksjonen som innleder en leddsetning. Her innleder det en leddsetning — skriv <strong>dass</strong>.`,
        nn: `<em>das</em> er ein artikkel eller demonstrativpronomen; <strong>dass</strong> er konjunksjonen som innleier ei leddsetning. Her innleier det ei leddsetning — skriv <strong>dass</strong>.`,
        en: `<em>das</em> is an article or demonstrative pronoun; <strong>dass</strong> is the conjunction introducing a subordinate clause. Here it introduces a clause — write <strong>dass</strong>.`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos } = ctx;
      if (!tokens || tokens.length < 2) return [];
      const out = [];

      const nounGenus = (ctx.vocab && ctx.vocab.nounGenus) || new Map();

      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].word !== 'das') continue;
        if (!CLAUSE_SUBJECTS.has(tokens[i + 1].word)) continue;

        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end) continue;

        // Sentence boundary between "das" and the pronoun means they're in
        // different sentences: "Kennen Sie das? Ich …" is demonstrative das
        // at sentence end, not a conjunction (Ordbank sweep 2026-07).
        if (ctx.text && /[.!?;:]/.test(ctx.text.slice(t.end, tokens[i + 1].start))) continue;

        // Relative-pronoun guard: "das" as a RELATIVE pronoun ("ein Problem,
        // das wir lösen müssen") correctly precedes the relative clause's
        // subject pronoun and refers to a NEUTER noun antecedent. It is
        // comma-set and has a noun before it in the sentence. The CONJUNCTION
        // error "das" (→ dass) instead follows a matrix verb with no such
        // antecedent ("Ich denke das du …", "Ich sehe das er …"). Skip when
        // "das" follows a comma AND a noun antecedent precedes it this sentence.
        if (i > 0) {
          const gap = ctx.text ? ctx.text.slice(tokens[i - 1].end, tokens[i].start) : ' ';
          const commaBefore = tokens[i - 1].word === ',' || /,/.test(gap);
          if (commaBefore) {
            let hasAntecedent = false;
            for (let k = i - 1; k >= 0; k--) {
              const bnd = ctx.text && tokens[k + 1]
                ? ctx.text.slice(tokens[k].end, tokens[k + 1].start) : '';
              if (/[.!?]/.test(bnd)) break; // sentence boundary
              const tk = tokens[k];
              const capMid = k > 0 && tk.display && /^\p{Lu}/u.test(tk.display);
              if (nounGenus.has(tk.word) || capMid) { hasAntecedent = true; break; }
            }
            if (hasAntecedent) continue;
          }
        }

        out.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: t.start,
          end: t.end,
          original: t.display,
          fix: t.display === 'Das' ? 'Dass' : 'dass',
          nextWord: tokens[i + 1].display,
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
