/**
 * Spell-check rule: German nicht + bare noun → kein (de-kein-noun, priority 46).
 *
 * Norwegian learners negate bare nouns with "nicht" by direct transfer from NB
 * "ikke": "Ich habe nicht Zeit." → "Ich habe keine Zeit."
 *
 * The existing de-negation rule handles nicht + indefinite article (nicht ein →
 * kein). This rule handles the complementary case: nicht + bare noun (no
 * article) from a curated list of common abstract/mass nouns.
 *
 * FP guard: contrastive "nicht X, sondern Y" is correct German — skip when
 * `sondern` appears later in the same clause.
 *
 * kein-forms are stored as accusative (the most common error context, e.g.
 * after haben). Feminine and neuter acc = nom, so only masculine nouns
 * show keinen vs kein.
 *
 * Rule ID: 'de-kein-noun'
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

  // Map: lowercase noun → kein-form (accusative).
  // f/n nouns: kein/keine (acc = nom). m nouns: keinen (acc).
  const KEIN_NOUNS = new Map([
    ['zeit',        'keine'],   // f
    ['geld',        'kein'],    // n
    ['hunger',      'keinen'],  // m
    ['lust',        'keine'],   // f
    ['angst',       'keine'],   // f
    ['recht',       'kein'],    // n
    ['ahnung',      'keine'],   // f
    ['erfahrung',   'keine'],   // f
    ['interesse',   'kein'],    // n
    ['problem',     'kein'],    // n
    ['platz',       'keinen'],  // m
    ['durst',       'keinen'],  // m
    ['chance',      'keine'],   // f
    ['geduld',      'keine'],   // f
    ['verständnis', 'kein'],    // n
    ['grund',       'keinen'],  // m
    ['stress',      'keinen'],  // m
    ['kontakt',     'keinen'],  // m
    ['plan',        'keinen'],  // m
    ['mut',         'keinen'],  // m
    ['sinn',        'keinen'],  // m
    ['zweck',       'keinen'],  // m
    ['unterschied', 'keinen'],  // m
  ]);

  const rule = {
    id: 'de-kein-noun',
    languages: ['de'],
    priority: 46,
    exam: {
      safe: false,
      reason: 'Contextual kein- negation guidance for bare nouns — requires gender knowledge, exceeds Chrome native parity',
      category: 'grammar-lookup',
    },
    severity: 'warning',
    explain: (finding) => ({
      nb: `For å nekte et substantiv uten artikkel bruker tysk <strong>kein</strong>, ikke <em>nicht</em> — skriv <em>${esc(finding.fix)}</em>.`,
      nn: `For å nekte eit substantiv utan artikkel brukar tysk <strong>kein</strong>, ikkje <em>nicht</em> — skriv <em>${esc(finding.fix)}</em>.`,
      en: `German uses <strong>kein</strong> (not <em>nicht</em>) to negate a noun without an article — use <em>${esc(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].word !== 'nicht') continue;
        const nounWord = tokens[i + 1].word;
        const keinBase = KEIN_NOUNS.get(nounWord);
        if (!keinBase) continue;

        // Contrastive "nicht X, sondern Y" is correct — skip.
        let contrastive = false;
        for (let j = i + 2; j < tokens.length; j++) {
          if (tokens[j].word === 'sondern') { contrastive = true; break; }
          if (tokens[j].word === '.' || tokens[j].word === '!' || tokens[j].word === '?') break;
        }
        if (contrastive) continue;

        if (cursorPos != null && cursorPos >= tokens[i].start && cursorPos <= tokens[i + 1].end + 1) continue;

        const kein = applyCase(tokens[i].display, keinBase);
        const fix = kein + ' ' + tokens[i + 1].display;

        out.push({
          rule_id: 'de-kein-noun',
          priority: rule.priority,
          start: tokens[i].start,
          end: tokens[i + 1].end,
          original: tokens[i].display + ' ' + tokens[i + 1].display,
          fix,
          suggestion: fix,
          message: `«${tokens[i].display} ${tokens[i + 1].display}» → «${fix}»`,
          severity: 'warning',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
