/**
 * Spell-check rule: Context-aware typo correction (priority 45).
 * 
 * Flags valid words that are statistically unlikely in their current context
 * when a very close neighbor (edit distance 1) is a common bigram match.
 * 
 * Example: "veldig bar" -> "veldig bra"
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const core = host.__lexiSpellCore || {};
  const {
    editDistance,
    matchCase,
    escapeHtml,
  } = core;

  const SAFE_WORDS = new Set([
    // Norwegian Bokmål/Nynorsk common short words
    'at', 'av', 'de', 'deg', 'dem', 'den', 'det', 'din', 'du', 'en', 'er', 'et', 
    'for', 'fra', 'før', 'ha', 'han', 'har', 'her', 'hva', 'hun', 'hvor', 'i', 
    'ikke', 'jeg', 'kan', 'man', 'med', 'meg', 'min', 'må', 'noe', 'noen', 'nå', 
    'og', 'om', 'opp', 'oss', 'på', 'seg', 'sin', 'skal', 'som', 'så', 'til', 
    'ut', 'var', 'vi', 'vil', 'å', 'ei', 'eit', 'ein', 'dei', 'eg', 'ho', 'vår', 
    'kvar', 'kva', 'kven', 'kor', 'mer', 'meir', 'barn', 'born', 'mykje', 'veldig',
    'også', 'eller', 'men', 'vårt', 'våre', 'mi', 'mitt', 'mine', 'di', 'ditt', 
    'dine', 'si', 'sitt', 'sine',
    // English common short words and verbs
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'do', 'for', 'from', 'has', 
    'have', 'he', 'i', 'in', 'is', 'it', 'not', 'of', 'on', 'or', 'so', 'that', 
    'the', 'to', 'was', 'we', 'will', 'with', 'you', 'went', 'want', 'can', 
    'could', 'should', 'would', 'may', 'might', 'shall', 'must', 'am', 'were', 
    'been', 'being', 'had', 'does', 'did', 'done', 'doing'
  ]);

  const rule = {
    id: 'context-typo',
    languages: ['nb', 'nn', 'en'], // Enabled for languages with bigram data
    priority: 45, // Slightly higher priority than standard typo
    exam: {
      safe: true,
      reason: "Token-level context typo correction; at-or-below browser native spellcheck parity",
      category: "spellcheck",
    },
    severity: 'error',
    explain: (finding) => ({
      nb: `Mente du <em>${escapeHtml(finding.fix)}</em>? Ordet <em>${escapeHtml(finding.original)}</em> passer sjelden etter "${escapeHtml(finding.prev)}".`,
      nn: `Meinte du <em>${escapeHtml(finding.fix)}</em>? Ordet <em>${escapeHtml(finding.original)}</em> passar sjeldan etter "${escapeHtml(finding.prev)}".`,
      en: `Did you mean <em>${escapeHtml(finding.fix)}</em>? The word <em>${escapeHtml(finding.original)}</em> is unusual after "${escapeHtml(finding.prev)}".`,
    }),
    check(ctx) {
      const { text, tokens, vocab, cursorPos, suppressed, lang } = ctx;
      const validWords = vocab.validWords || new Set();
      const bigrams = vocab.bigrams;
      if (!bigrams) return [];

      const out = [];
      for (let i = 1; i < tokens.length; i++) {
        const t = tokens[i];
        const prevT = tokens[i - 1];
        
        if (cursorPos != null && cursorPos >= t.start && cursorPos <= t.end + 1) continue;
        if (suppressed && suppressed.has(i)) continue;

        // Do not bridge punctuation
        const between = text.slice(prevT.end, t.start);
        if (/[.!?,\-:]/.test(between)) continue;

        const prevWord = prevT.word.toLowerCase();
        const currentWord = t.word.toLowerCase();
        
        // Protect highly common function words from being flagged as typos
        if (SAFE_WORDS.has(currentWord)) continue;
        
        // If current word is valid but has no bigram connection to previous word
        const currentPairs = bigrams[prevWord];
        if (currentPairs && !currentPairs[currentWord] && validWords.has(currentWord)) {
          
          let bestNeighbor = null;
          let bestScore = 0;

          const currentZipf = (vocab.freq && vocab.freq.get(currentWord)) || 0;

          for (const cand of validWords) {
            if (cand === currentWord) continue;
            if (Math.abs(cand.length - currentWord.length) > 1) continue;
            // For short words, only allow edits that preserve the first letter (unless it's a transposition)
            if (cand[0] !== currentWord[0] && currentWord.length <= 4) {
               if (!(cand.length === currentWord.length && cand[1] === currentWord[0] && cand[0] === currentWord[1])) {
                   continue; 
               }
            }

            const dist = editDistance(currentWord, cand, 1);
            if (dist === 1) {
              const weight = currentPairs[cand];
              const candZipf = (vocab.freq && vocab.freq.get(cand)) || 0;

              // We only have Zipf data for NB/NN.
              // If we do, ensure we aren't suggesting a rare word.
              if (currentZipf > 0 && candZipf > 0 && candZipf < 3.0) continue;

              // Without Zipf data (e.g. EN has no freq sidecar), we lose the
              // frequency gate that normally stops us suggesting a rare word
              // as the "right" form. Compensate by demanding a stronger
              // bigram signal. Symptom this guards against: "They ate
              // dinner" → "ate → are" (bigram `they are` dominates the
              // table, but `ate` is the correct word here). Raising the bar
              // to 5 stops bigram-majority cases from overriding a token
              // that was already valid.
              const hasZipfData = vocab.freq && vocab.freq.size > 0;
              const minWeight = hasZipfData ? 2 : 5;

              if (weight >= minWeight) {
                if (weight > bestScore) {
                  bestScore = weight;
                  bestNeighbor = cand;
                }
              }
            }
          }

          const hasZipfData = vocab.freq && vocab.freq.size > 0;
          const minBestScore = hasZipfData ? 2 : 5;
          if (bestNeighbor && bestScore >= minBestScore) {
            const fix = matchCase(t.display, bestNeighbor);
            out.push({
              rule_id: 'context-typo',
              priority: rule.priority,
              start: t.start,
              end: t.end,
              original: t.display,
              prev: prevT.display,
              fix: fix,
              suggestions: [fix],
              message: `Kontekst-feil: "${t.display}" -> "${fix}"`,
            });
            if (suppressed) suppressed.add(i);
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
