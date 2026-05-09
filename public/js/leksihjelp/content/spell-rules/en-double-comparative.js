/**
 * Spell-check rule: English Double Comparative/Superlative (priority 15).
 *
 * Flags redundant constructions:
 *   "more better"   → "better"
 *   "most fastest"  → "fastest"
 *   "more easier"   → "easier"
 *   "most prettiest" → "prettiest"
 *
 * Rule ID: 'en-double-comparative'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};

  // Irregular comparatives/superlatives that already carry the comparison
  const IRREGULAR_COMP = new Set([
    'better', 'worse', 'more', 'less', 'further', 'farther', 'elder', 'older',
  ]);
  const IRREGULAR_SUP = new Set([
    'best', 'worst', 'most', 'least', 'furthest', 'farthest', 'eldest', 'oldest',
  ]);

  const rule = {
    id: 'en-double-comparative',
    languages: ['en'],
    priority: 15,
    exam: {
      safe: true,
      reason: "Two-token pattern rule — flags redundant double comparison; below browser-native parity",
      category: "grammar-lookup",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Dobbel komparativ/superlativ: bruk enten <em>more/most</em> ELLER endelsen <em>-er/-est</em>, ikke begge. Skriv <em>${escapeHtml(finding.fix)}</em>.`,
      nn: `Dobbel komparativ/superlativ: bruk anten <em>more/most</em> ELLER endinga <em>-er/-est</em>, ikkje begge. Skriv <em>${escapeHtml(finding.fix)}</em>.`,
      en: `Double comparative: use either <em>more/most</em> OR the <em>-er/-est</em> ending, not both. Write <em>${escapeHtml(finding.fix)}</em>.`,
    }),
    check(ctx) {
      const { tokens, cursorPos, suppressed } = ctx;
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        const t = tokens[i];
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        const word = t.word.toLowerCase();
        const nextT = tokens[i + 1];
        if (cursorPos != null && cursorPos >= nextT.start && cursorPos <= nextT.end + 1) continue;
        if (suppressed && suppressed.has(i + 1)) continue;

        const nextWord = nextT.word.toLowerCase();

        // "more" + comparative (-er ending or irregular comparative)
        if (word === 'more') {
          if (IRREGULAR_COMP.has(nextWord) || (nextWord.endsWith('er') && nextWord.length > 3 && !IRREGULAR_COMP.has(nextWord) && nextWord !== 'other' && nextWord !== 'after' && nextWord !== 'over' && nextWord !== 'under' && nextWord !== 'never' && nextWord !== 'ever' && nextWord !== 'inner' && nextWord !== 'outer' && nextWord !== 'upper' && nextWord !== 'later' && nextWord !== 'super' && nextWord !== 'water' && nextWord !== 'river' && nextWord !== 'paper' && nextWord !== 'power' && nextWord !== 'lower' && nextWord !== 'proper' && nextWord !== 'corner' && nextWord !== 'dinner' && nextWord !== 'summer' && nextWord !== 'winter' && nextWord !== 'number' && nextWord !== 'matter' && nextWord !== 'letter' && nextWord !== 'member' && nextWord !== 'finger' && nextWord !== 'order' && nextWord !== 'answer' && nextWord !== 'silver' && nextWord !== 'sister' && nextWord !== 'brother' && nextWord !== 'mother' && nextWord !== 'father' && nextWord !== 'teacher' && nextWord !== 'player' && nextWord !== 'leader' && nextWord !== 'reader' && nextWord !== 'driver' && nextWord !== 'worker' && nextWord !== 'singer' && nextWord !== 'dancer' && nextWord !== 'writer' && nextWord !== 'speaker' && nextWord !== 'computer' && nextWord !== 'together' && nextWord !== 'whatever' && nextWord !== 'however' && nextWord !== 'whenever' && nextWord !== 'remember' && nextWord !== 'consider' && nextWord !== 'discover' && nextWord !== 'deliver' && nextWord !== 'either' && nextWord !== 'neither' && nextWord !== 'rather' && nextWord !== 'whether' && nextWord !== 'another' && nextWord !== 'chapter' && nextWord !== 'center' && nextWord !== 'soccer' && nextWord !== 'clever' && nextWord !== 'proper' && nextWord !== 'differ' && nextWord !== 'offer' && nextWord !== 'enter' && nextWord !== 'utter' && nextWord !== 'bitter' && nextWord !== 'trigger' && nextWord !== 'timber' && nextWord !== 'shelter' && nextWord !== 'counter' && nextWord !== 'gender' && nextWord !== 'wonder' && nextWord !== 'monster' && nextWord !== 'weather' && nextWord !== 'laughter' && nextWord !== 'daughter' && nextWord !== 'murder' && nextWord !== 'thunder' && nextWord !== 'hunger' && nextWord !== 'cancer' && nextWord !== 'danger' && nextWord !== 'hammer' && nextWord !== 'ladder' && nextWord !== 'rubber' && nextWord !== 'butter' && nextWord !== 'copper' && nextWord !== 'pepper' && nextWord !== 'timber' && nextWord !== 'ginger' && nextWord !== 'slender' && nextWord !== 'tender' && nextWord !== 'banker' && nextWord !== 'farmer' && nextWord !== 'shower' && nextWord !== 'flower' && nextWord !== 'tower' && nextWord !== 'powder')) {
            out.push({
              rule_id: 'en-double-comparative',
              priority: rule.priority,
              start: t.start,
              end: nextT.end,
              original: t.display + ' ' + nextT.display,
              fix: nextT.display,
              suggestions: [nextT.display],
              message: `Double comparative: "${t.display} ${nextT.display}" → "${nextT.display}"`,
            });
            if (suppressed) { suppressed.add(i); suppressed.add(i + 1); }
          }
        }

        // "most" + superlative (-est ending or irregular superlative)
        else if (word === 'most') {
          if (IRREGULAR_SUP.has(nextWord) || (nextWord.endsWith('est') && nextWord.length > 4 && nextWord !== 'forest' && nextWord !== 'interest' && nextWord !== 'harvest' && nextWord !== 'request' && nextWord !== 'protest' && nextWord !== 'contest' && nextWord !== 'suggest' && nextWord !== 'arrest' && nextWord !== 'honest' && nextWord !== 'modest' && nextWord !== 'earnest' && nextWord !== 'nearest' && nextWord !== 'dearest')) {
            out.push({
              rule_id: 'en-double-comparative',
              priority: rule.priority,
              start: t.start,
              end: nextT.end,
              original: t.display + ' ' + nextT.display,
              fix: nextT.display,
              suggestions: [nextT.display],
              message: `Double superlative: "${t.display} ${nextT.display}" → "${nextT.display}"`,
            });
            if (suppressed) { suppressed.add(i); suppressed.add(i + 1); }
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
