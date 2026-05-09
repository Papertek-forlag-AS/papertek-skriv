/**
 * Spell-check rule: register / colloquialism detection (REG-01, priority 60).
 *
 * Phase 6. Data-driven rule that flags colloquialisms and informal register
 * when the user has opted in via the grammar_register feature toggle (OFF by
 * default). Sources data from vocab-seam registerbank; falls back to inline
 * SEED_REGISTER when the bank is absent.
 *
 * Severity: warning (P2 amber dot).
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // TEMPORARY: remove after papertek-vocabulary registerbank PR lands.
  // Inline seed data matching the expected API shape.
  const SEED_REGISTER = {
    en: new Map([
      ['gonna', { word: 'gonna', formal: 'going to' }],
      ['wanna', { word: 'wanna', formal: 'want to' }],
      ["ain't", { word: "ain't", formal: 'is not / am not' }],
      ['gotta', { word: 'gotta', formal: 'got to' }],
      ['kinda', { word: 'kinda', formal: 'kind of' }],
      ['sorta', { word: 'sorta', formal: 'sort of' }],
      ['ya', { word: 'ya', formal: 'you' }],
      ['cuz', { word: 'cuz', formal: 'because' }],
      ['dunno', { word: 'dunno', formal: "don't know" }],
      ['lemme', { word: 'lemme', formal: 'let me' }],
    ]),
    nb: new Map([
      ['downloade', { word: 'downloade', formal: 'laste ned' }],
      ['booket', { word: 'booket', formal: 'bestilt' }],
      ['chille', { word: 'chille', formal: 'slappe av' }],
      ['gamingen', { word: 'gamingen', formal: 'spillingen' }],
      ['sharet', { word: 'sharet', formal: 'delt' }],
      ['linke', { word: 'linke', formal: 'lenke til' }],
      ['joine', { word: 'joine', formal: 'bli med' }],
      ['streame', { word: 'streame', formal: 'stromme' }],
      ['skrolle', { word: 'skrolle', formal: 'bla' }],
    ]),
    nn: new Map([
      ['downloade', { word: 'downloade', formal: 'laste ned' }],
      ['booket', { word: 'booket', formal: 'bestilt' }],
      ['chille', { word: 'chille', formal: 'slappe av' }],
      ['gamingen', { word: 'gamingen', formal: 'spelinga' }],
      ['sharet', { word: 'sharet', formal: 'delt' }],
      ['linke', { word: 'linke', formal: 'lenkje til' }],
      ['joine', { word: 'joine', formal: 'verte med' }],
      ['streame', { word: 'streame', formal: 'stromme' }],
      ['skrolle', { word: 'skrolle', formal: 'bla' }],
    ]),
    fr: new Map([
      // FR multi-word entries handled via sentence-level matching below.
    ]),
  };

  // FR sentence-level patterns (multi-word register entries).
  // TEMPORARY: remove after papertek-vocabulary registerbank PR lands.
  const FR_SENTENCE_PATTERNS = [
    { trigger: 'je sais pas', formal: 'je ne sais pas' },
    { trigger: 'je veux pas', formal: 'je ne veux pas' },
    { trigger: 'je peux pas', formal: 'je ne peux pas' },
  ];

  const rule = {
    id: 'register',
    languages: ['nb', 'nn', 'en', 'fr'],
    priority: 60,
    exam: {
      safe: true,
      reason: "Token-level token-level register correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'warning',
    explain: function (finding) {
      return {
        nb: 'Usikker — <em>' + escapeHtml(finding.original) + '</em> er uformelt. Bruk <em>' + escapeHtml(finding.fix) + '</em> i formelle tekster.',
        nn: 'Usikker — <em>' + escapeHtml(finding.original) + '</em> er uformelt. Bruk <em>' + escapeHtml(finding.fix) + '</em> i formelle tekstar.',
      };
    },
    check(ctx) {
      // Feature-gated: REG-01 defaults OFF.
      // When isFeatureEnabled is absent or returns false for grammar_register, skip.
      const ife = ctx.vocab.isFeatureEnabled;
      if (typeof ife !== 'function' || !ife('grammar_register')) {
        return [];
      }

      const findings = [];
      const lang = ctx.lang;

      // Resolve register words: prefer vocab-seam data, fall back to seed.
      let registerMap = ctx.vocab.registerWords;
      if (!registerMap || registerMap.size === 0) {
        registerMap = SEED_REGISTER[lang] || new Map();
      }

      // Per-token matching.
      if (registerMap.size > 0) {
        for (let i = 0; i < ctx.tokens.length; i++) {
          if (ctx.suppressedFor && ctx.suppressedFor.structural && ctx.suppressedFor.structural.has(i)) continue;
          const t = ctx.tokens[i];
          const entry = registerMap.get(t.word.toLowerCase());
          if (entry && entry.formal) {
            findings.push({
              rule_id: 'register',
              start: t.start,
              end: t.end,
              original: t.display,
              fix: entry.formal,
              message: t.display + ' → ' + entry.formal + ' (formelt)',
              severity: 'warning',
            });
          }
        }
      }

      // FR sentence-level matching for multi-word patterns.
      if (lang === 'fr' && ctx.sentences) {
        const patterns = FR_SENTENCE_PATTERNS;
        for (const sentence of ctx.sentences) {
          const sentLower = sentence.text.toLowerCase();
          for (const pat of patterns) {
            const idx = sentLower.indexOf(pat.trigger);
            if (idx === -1) continue;
            const absStart = sentence.start + idx;
            const absEnd = absStart + pat.trigger.length;
            // Check structural suppression for any token in the match span.
            let suppressed = false;
            if (ctx.suppressedFor && ctx.suppressedFor.structural) {
              for (let ti = 0; ti < ctx.tokens.length; ti++) {
                const tok = ctx.tokens[ti];
                if (tok.end > absStart && tok.start < absEnd && ctx.suppressedFor.structural.has(ti)) {
                  suppressed = true;
                  break;
                }
              }
            }
            if (suppressed) continue;
            findings.push({
              rule_id: 'register',
              start: absStart,
              end: absEnd,
              original: ctx.text.slice(absStart, absEnd),
              fix: pat.formal,
              message: pat.trigger + ' → ' + pat.formal + ' (formelt)',
              severity: 'warning',
            });
          }
        }
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
