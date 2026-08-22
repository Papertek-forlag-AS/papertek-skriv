/**
 * Spell-check rule: FR possessive adjective gender agreement (FR-16, priority 20).
 *
 * Norwegian students confuse possessive adjective gender because Norwegian
 * "sin/sitt/sine" doesn't distinguish noun gender. French requires gender
 * agreement: mon/ton/son (masculine) vs ma/ta/sa (feminine) before
 * consonant-initial nouns.
 *
 *   Wrong:   "son maison est grande"  →  "sa maison"   (maison = f)
 *   Wrong:   "sa livre est bon"       →  "son livre"   (livre = m)
 *   Wrong:   "mon voiture est belle"  →  "ma voiture"  (voiture = f)
 *   Correct: "son école est loin"     →  no flag (vowel-initial → fr-grammar)
 *   Correct: "sa maison est grande"   →  no flag (sa before f = correct)
 *   Correct: "son livre est bon"      →  no flag (son before m = correct)
 *
 * Only fires on consonant-initial nouns present in the vocabulary.
 * Vowel/h-initial cases are handled by fr-grammar (ma/ta/sa → mon/ton/son).
 *
 * Severity: warning (P2 amber dot).
 * Rule ID: 'fr-accord-possessif'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const POSS_NOUN_ARTICLES = new Set(['un','une','le','la','les','du','des','de','au','aux','ce','cet','cette','ces']);
  const core = host.__lexiSpellCore || {};
  const { matchCase: coreMatchCase } = core;

  function matchCase(original, replacement) {
    if (coreMatchCase) return coreMatchCase(original, replacement);
    if (original && original[0] >= 'A' && original[0] <= 'Z') {
      return replacement[0].toUpperCase() + replacement.slice(1);
    }
    return replacement;
  }

  // Masculine possessive ↔ feminine counterpart.
  const POSS_FIX = {
    mon: 'ma', ma: 'mon',
    ton: 'ta', ta: 'ton',
    son: 'sa', sa: 'son',
  };

  const MASC_POSS = new Set(['mon', 'ton', 'son']);
  const FEM_POSS  = new Set(['ma', 'ta', 'sa']);

  // Vowel base letters (NFD) — used to skip vowel/h-initial nouns (fr-grammar territory).
  const VOWEL_CHARS = new Set('aeiouyàâäéèêëïîôùûüÿœæ'.split(''));

  const rule = {
    id: 'fr-accord-possessif',
    languages: ['fr'],
    priority: 20,
    severity: 'warning',
    exam: {
      safe: false,
      reason: 'Possessive gender agreement via nounLemmaGenus lookup — grammatical',
      category: 'grammar-lookup',
    },
    explain: (finding) => ({
      nb: `Franske eiendomsord samsvarer i kjønn med substantivet. <em>${finding.fix}</em> er riktig foran ${finding.nounGenus === 'f' ? 'hunkjønnsord' : 'hankjønnsord'}: <em>${finding.fix} ${finding.nounWord}</em>.`,
      nn: `Franske eigedomsord samsvarar i kjønn med substantivet. <em>${finding.fix}</em> er rett framfor ${finding.nounGenus === 'f' ? 'hokjønnsord' : 'hankjønnsord'}: <em>${finding.fix} ${finding.nounWord}</em>.`,
      en: `French possessives agree in gender with the noun. <em>${finding.fix}</em> is the correct form before a ${finding.nounGenus === 'f' ? 'feminine' : 'masculine'} noun: <em>${finding.fix} ${finding.nounWord}</em>.`,
    }),
    check(ctx) {
      if (ctx.lang !== 'fr') return [];

      const nounLemmaGenus = ctx.vocab && ctx.vocab.nounLemmaGenus;
      if (!nounLemmaGenus || !nounLemmaGenus.size) return [];

      const { tokens, text, cursorPos } = ctx;
      const findings = [];

      for (let i = 0; i + 1 < tokens.length; i++) {
        const poss = tokens[i];
        const noun = tokens[i + 1];

        // Avoid flagging the token the user is actively typing.
        if (cursorPos != null && cursorPos >= poss.start && cursorPos <= poss.end + 1) continue;

        const possW = poss.word.toLowerCase();
        if (!POSS_FIX[possW]) continue;

        // "ton"/"son" are homographs of the nouns "le ton" (tone) / "le son"
        // (sound). A real possessive is never preceded by an article/determiner,
        // so "d'un ton ferme" is the NOUN, not the possessive — skip. Check the
        // post-apostrophe base too ("d'un" is a single token).
        if (i > 0) {
          const pw = tokens[i - 1].word.toLowerCase();
          const pbase = pw.replace(/^[a-zà-ÿ]+['’]/, '');
          if (POSS_NOUN_ARTICLES.has(pw) || POSS_NOUN_ARTICLES.has(pbase)) continue;
        }

        const nounW = noun.word.toLowerCase();

        // Skip vowel/h-initial nouns — covered by fr-grammar rule.
        const first = (nounW[0] || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
        if (VOWEL_CHARS.has(first) || first === 'h') continue;

        // Skip nouns not in vocab — safest default.
        const genus = nounLemmaGenus.get(nounW);
        if (!genus) continue;

        // Mismatch: masculine possessive before feminine noun, or vice versa.
        const mismatch = (MASC_POSS.has(possW) && genus === 'f') ||
                         (FEM_POSS.has(possW)  && genus === 'm');
        if (!mismatch) continue;

        const origPoss = text.slice(poss.start, poss.end);
        const fix = matchCase(origPoss, POSS_FIX[possW]);

        findings.push({
          rule_id: rule.id,
          priority: rule.priority,
          start: poss.start,
          end: poss.end,
          original: origPoss,
          fix,
          nounGenus: genus,
          nounWord: nounW,
        });
      }

      return findings;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
