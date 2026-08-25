/**
 * Spell-check rule: "sowohl...und" — Norwegian "bade...og" transfer error
 * (de-sowohl-als-auch, priority 23, hint).
 *
 * German uses the correlative pair "sowohl...als auch" (both...and also).
 * Norwegian-speaking students transfer "bade...og" and write "sowohl...und".
 *
 *   "Er spricht sowohl Englisch und Deutsch."     → als auch
 *   "Sie ist sowohl klug und fleißig."             → als auch
 *   "Wir kaufen sowohl Brot und Milch."            → als auch
 *
 * Must NOT fire on:
 *   "Er spricht sowohl Englisch als auch Deutsch."  (already correct)
 *   "sowohl gut als auch schön, und dazu noch ..."  ("und" after clause boundary)
 *   "sowohl er als auch sie …"                      ("als" found before "und" → correct)
 *
 * Detection:
 *   1. Find token "sowohl".
 *   2. Scan forward (max 15 tokens) for "und".
 *   3. Stop (no fire) if: a clause boundary is hit (comma/period/semicolon in
 *      gap text, or a subordinating conjunction), or "als" is found (→ pattern
 *      is already correct or ambiguous).
 *   4. If "und" found: flag it, fix = "als auch".
 *      Exception: if "auch" immediately follows "und" → fix = "als" only.
 *
 * Rule ID: 'de-sowohl-als-auch'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Stop the scan if any of these words appear (clause boundaries or "als" meaning already-correct).
  const SCAN_STOP = new Set([
    'als', 'aber', 'sondern', 'denn', 'doch',
    'weil', 'dass', 'wenn', 'obwohl', 'obgleich',
    'weil', 'da', 'damit', 'bevor', 'nachdem',
  ]);

  const MAX_SCAN = 15;

  const rule = {
    id: 'de-sowohl-als-auch',
    languages: ['de'],
    priority: 23,
    severity: 'hint',
    exam: {
      safe: false,
      reason: 'Contextual grammar hint — correlative conjunction pair; beyond Chrome native parity',
      category: 'grammar-lookup',
    },
    explain: () => ({
      nb: `Tysk bruker korrelasjonspar <strong>sowohl … als auch</strong> (bade … og). Skriv <em>als auch</em> i stedet for <em>und</em>.`,
      nn: `Tysk brukar korrelasjonspar <strong>sowohl … als auch</strong> (bade … og). Skriv <em>als auch</em> i staden for <em>und</em>.`,
      en: `German uses the correlative pair <strong>sowohl … als auch</strong> (both … and). Write <em>als auch</em> instead of <em>und</em>.`,
    }),
    check(ctx) {
      const { tokens, text, cursorPos, lang } = ctx;
      if (lang !== 'de') return [];
      if (!tokens || tokens.length < 3 || !text) return [];
      const out = [];

      for (let i = 0; i < tokens.length - 1; i++) {
        if (tokens[i].word !== 'sowohl') continue;

        // Forward scan from the token after 'sowohl'.
        for (let k = i + 1; k < tokens.length && k <= i + MAX_SCAN; k++) {
          const gap = k > 0 ? text.slice(tokens[k - 1].end, tokens[k].start) : '';
          if (/[,;.!?]/.test(gap)) break;

          const w = tokens[k].word;
          if (SCAN_STOP.has(w)) break;

          if (w !== 'und') continue;

          const undTok = tokens[k];
          if (cursorPos != null && cursorPos >= undTok.start && cursorPos <= undTok.end) break;

          // If "und auch" → fix = "als" only (don't double-"auch").
          const nextWord = tokens[k + 1] && tokens[k + 1].word;
          const fix = nextWord === 'auch' ? 'als' : 'als auch';

          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: undTok.start,
            end: undTok.end,
            original: undTok.display,
            fix,
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
