/**
 * Spell-check rule: FR recent past "venir de" must be followed by an infinitive (FR-23, priority 16).
 *
 * The French recent past (passé récent) is "venir (conjugated) + de + INFINITIVE":
 * "je viens de manger" = "I have just eaten". Norwegian students conjugate the
 * second verb by L1 transfer (or re-use a present form), exactly as they do with
 * the near future (see fr-aller-infinitif — this is its mirror image).
 *
 *   Wrong:   "il vient de mange"   →  "il vient de manger"   (mange = il/elle present)
 *   Wrong:   "je viens de fait"    →  "je viens de faire"    (fait = il/elle present)
 *   Correct: "je viens de manger"  →  no flag (manger = infinitive, not in present map)
 *   Correct: "il vient de Paris"   →  no flag (Paris not a verb form — origin "de")
 *   Correct: "elle vient de Lyon"  →  no flag (origin reading)
 *
 * Detection: a conjugated form of "venir" (viens/vient/venons/venez/viennent — all
 * carry inf="venir" in frPresensToVerb), then the literal "de", then a token in
 * frPresensToVerb whose person is finite (≠ "infinitiv"). Fix = that entry's
 * infinitive (entry.inf). A capitalised third token is skipped — that's a proper
 * noun ("vient de Paris"), the "come from" reading, never a conjugation error.
 *
 * Scope: the elided "d'" before a vowel-initial infinitive ("vient d'arriver")
 * tokenises as a single token and is out of scope here — only the non-elided
 * "de" + consonant-initial verb is handled.
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-venir-de'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];

  const rule = {
    id: 'fr-venir-de',
    languages: ['fr'],
    priority: 16,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Recent past venir de + infinitive — grammatical (verb-lookup)',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Nær fortid på fransk er <em>venir de</em> + infinitiv. Etter <em>${finding.venir} de</em> skal verbet stå i infinitiv: <em>${finding.fix}</em>, ikke <em>${finding.original}</em>.`,
      nn: `Nær fortid på fransk er <em>venir de</em> + infinitiv. Etter <em>${finding.venir} de</em> skal verbet stå i infinitiv: <em>${finding.fix}</em>, ikkje <em>${finding.original}</em>.`,
      en: `The French recent past is <em>venir de</em> + infinitive. After <em>${finding.venir} de</em> the verb must be an infinitive: <em>${finding.fix}</em>, not <em>${finding.original}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const frPresensToVerb = ctx.vocab && ctx.vocab.frPresensToVerb;
      if (!frPresensToVerb || !frPresensToVerb.size) return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 2 < tokens.length; i++) {
        const venirTok = tokens[i];
        const deTok = tokens[i + 1];
        const verbTok = tokens[i + 2];

        const venirEntry = frPresensToVerb.get(venirTok.word.toLowerCase());
        if (!venirEntry || venirEntry.inf !== 'venir') continue;

        if (deTok.word.toLowerCase() !== 'de') continue;

        // Punctuation between the trigger tokens breaks the construction:
        // «je viens de... » entre amis — the quoted mention ends at the
        // ellipsis/guillemet; 'entre' is not venir's complement (Ordbank
        // sweep 2026-07). Require whitespace-only gaps.
        if (text && (/\S/.test(text.slice(venirTok.end, deTok.start)) ||
                     /\S/.test(text.slice(deTok.end, verbTok.start)))) continue;

        // Skip proper nouns — "vient de Paris" is the origin reading, not an error.
        const verbRaw = verbTok.word;
        if (verbRaw[0] >= 'A' && verbRaw[0] <= 'Z') continue;
        if (verbRaw[0] >= 'À' && verbRaw[0] <= 'Þ') continue;

        // Avoid flagging while the user is still typing the third token.
        if (cursorPos != null && cursorPos >= verbTok.start && cursorPos <= verbTok.end + 1) continue;

        const verbW = verbRaw.toLowerCase();
        const verbEntry = frPresensToVerb.get(verbW);
        // Must be a finite (conjugated) form — a real infinitive isn't in the present map.
        if (!verbEntry || verbEntry.person === 'infinitiv') continue;

        const fix = verbEntry.inf;
        if (!fix || fix === verbW) continue;

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: verbTok.start,
          end: verbTok.end,
          original: text.slice(verbTok.start, verbTok.end),
          fix,
          venir: text.slice(venirTok.start, venirTok.end),
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
