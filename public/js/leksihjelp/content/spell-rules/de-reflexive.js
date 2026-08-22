/**
 * Spell-check rule: German reflexive verbs — ADVISORY (de-reflexive, priority 31).
 *
 * Many common verbs are reflexive: the object is a reflexive pronoun matching
 * the subject (ich→mich, du→dich, er/sie/es→sich, wir→uns, ihr→euch). Norwegian
 * students reach for a plain personal pronoun:
 *   "Er freut mich"   — did you mean "Er freut sich" (han gleder seg)?
 *   "Ich freue ihn"   — did you mean "Ich freue mich" (jeg gleder meg)?
 *
 * This is severity 'hint' (advisory), NOT a hard correction, because the
 * non-reflexive reading is sometimes valid: "er freut mich" can genuinely mean
 * "he pleases me" (jdn freuen). So we surface a "Mente du …?" / "Did you
 * mean …?" suggestion the student can apply or dismiss. The explain + lesson
 * localise to the UI language (NB/NN/EN) via the standard explain() {nb,nn,en}.
 *
 * Detection: [subject pronoun] [reflexive-capable verb] [personal object
 * pronoun that ISN'T the subject's reflexive]. Impersonal subjects (es, das)
 * are excluded — "es freut mich" (it pleases me) is the correct transitive
 * reading, not reflexive. The reflexive verb set is curated (VG1 ch10 +
 * verbbank-attested forms); missing verbs are a data-enrichment task upstream.
 *
 * Exam classification: safe=false — pedagogy popover beyond Chrome native parity.
 *
 * Rule ID: 'de-reflexive'
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

  // Reflexive-capable verb present forms → infinitive. The first block is
  // verbbank-attested (duschen/entspannen/erinnern/freuen/fühlen/interessieren/
  // konzentrieren/waschen); the second adds common regular VG1 reflexives.
  const REFLEXIVE_VERB = {
    dusche: 'duschen', duschen: 'duschen', duschst: 'duschen', duscht: 'duschen',
    entspanne: 'entspannen', entspannen: 'entspannen', entspannst: 'entspannen', entspannt: 'entspannen',
    erinnere: 'erinnern', erinnern: 'erinnern', erinnerst: 'erinnern', erinnert: 'erinnern',
    freue: 'freuen', freuen: 'freuen', freust: 'freuen', freut: 'freuen',
    fühle: 'fühlen', fühlen: 'fühlen', fühlst: 'fühlen', fühlt: 'fühlen',
    interessiere: 'interessieren', interessieren: 'interessieren', interessierst: 'interessieren', interessiert: 'interessieren',
    konzentriere: 'konzentrieren', konzentrieren: 'konzentrieren', konzentrierst: 'konzentrieren', konzentriert: 'konzentrieren',
    wasche: 'waschen', waschen: 'waschen', wäschst: 'waschen', wäscht: 'waschen', wascht: 'waschen',
    // hand-added regular VG1 reflexives:
    ärgere: 'ärgern', ärgern: 'ärgern', ärgerst: 'ärgern', ärgert: 'ärgern',
    beeile: 'beeilen', beeilen: 'beeilen', beeilst: 'beeilen', beeilt: 'beeilen',
    setze: 'setzen', setzt: 'setzen', setzen: 'setzen',
    schäme: 'schämen', schämst: 'schämen', schämt: 'schämen', schämen: 'schämen',
    erhole: 'erholen', erholst: 'erholen', erholt: 'erholen', erholen: 'erholen',
    wundere: 'wundern', wunderst: 'wundern', wundert: 'wundern', wundern: 'wundern',
    langweile: 'langweilen', langweilst: 'langweilen', langweilt: 'langweilen', langweilen: 'langweilen',
  };

  // Subject pronoun → the reflexive pronoun that matches it. Impersonal es/das
  // are intentionally absent (their reading is transitive, not reflexive).
  const SUBJ_REFLEXIVE = {
    ich: 'mich', du: 'dich', er: 'sich', sie: 'sich', wir: 'uns', ihr: 'euch',
  };

  // Personal object pronouns that could be a mistaken reflexive. (sich is the
  // correct reflexive → never flagged; sie/es/ihr are too ambiguous.)
  const OBJECT_PRONOUNS = new Set(['mich', 'dich', 'ihn', 'uns', 'euch']);

  const rule = {
    id: 'de-reflexive',
    languages: ['de'],
    priority: 31,
    exam: {
      safe: false,
      reason: 'Advisory reflexive-verb suggestion with Lær mer pedagogy — the non-reflexive reading can be valid; beyond Chrome native parity',
      category: 'grammar-lookup',
    },
    severity: 'hint',
    explain: (finding) => {
      const inf = esc(finding.verbInf || '');
      const phrase = esc((finding.subject || '') + ' ' + (finding.verb || '') + ' ' + (finding.fix || ''));
      return {
        nb: `Refleksivt verb (<em>${inf}</em>). Mente du <strong>${phrase}</strong>? Refleksive verb tar pronomenet som matcher subjektet: ich→<em>mich</em>, du→<em>dich</em>, er/sie/es→<em>sich</em>. (Ellers er <em>${esc(finding.original)}</em> riktig — «han gjør noe med en annen».)`,
        nn: `Refleksivt verb (<em>${inf}</em>). Mente du <strong>${phrase}</strong>? Refleksive verb tek pronomenet som matchar subjektet: ich→<em>mich</em>, du→<em>dich</em>, er/sie/es→<em>sich</em>. (Elles er <em>${esc(finding.original)}</em> rett — «han gjer noko med ein annan».)`,
        en: `Reflexive verb (<em>${inf}</em>). Did you mean <strong>${phrase}</strong>? Reflexive verbs take the pronoun that matches the subject: ich→<em>mich</em>, du→<em>dich</em>, er/sie/es→<em>sich</em>. (Otherwise <em>${esc(finding.original)}</em> is fine — “does it to someone else”.)`,
      };
    },
    check(ctx) {
      const { tokens, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      const out = [];

      for (let i = 0; i + 2 < tokens.length; i++) {
        const refl = SUBJ_REFLEXIVE[tokens[i].word];
        if (!refl) continue;                                  // not a (reflexive-eligible) subject
        const verbInf = REFLEXIVE_VERB[tokens[i + 1].word];
        if (!verbInf) continue;                               // verb is not reflexive-capable
        const obj = tokens[i + 2].word;
        if (obj === refl) continue;                           // already the correct reflexive
        if (!OBJECT_PRONOUNS.has(obj)) continue;              // not a flaggable personal pronoun
        if (cursorPos != null && cursorPos >= tokens[i + 2].start && cursorPos <= tokens[i + 2].end + 1) continue;

        const fix = applyCase(tokens[i + 2].display, refl);
        out.push({
          rule_id: 'de-reflexive',
          priority: rule.priority,
          start: tokens[i + 2].start,
          end: tokens[i + 2].end,
          original: tokens[i + 2].display,
          fix,
          verb: tokens[i + 1].display,
          verbInf,
          subject: tokens[i].display,
          message: `Refleksivt verb — mente du «${fix}»?`,
          severity: 'hint',
        });
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
