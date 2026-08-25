/**
 * Spell-check rule: English spelling-variety consistency (en-spelling-consistency,
 * priority 66, P3 hint band).
 *
 * Policy (user decision, Ordbank sweep 2026-07): BOTH British and American
 * spellings are accepted by the typo layer (exam-safe acceptance — Norwegian
 * classrooms mix both). This rule adds the CONSISTENCY pedagogy on top:
 *
 *  A) SAME WORD in both spellings within one text ("colour" and "color") —
 *     the unambiguous inconsistency every style guide and examiner flags.
 *     Strong trigger; fires on the minority spelling's occurrences.
 *  B) DIFFERENT words from clearly different varieties (a "colour" next to a
 *     "center") — softer signal, commonly frowned upon in formal writing but
 *     not an error per se. Conservative trigger: only with ≥2 markers of the
 *     majority variety and the classes that are UNAMBIGUOUS variety markers
 *     (-our/-or, -re/-er measure words, -ogue, -ll- doubling, curated pairs).
 *     The -ise/-ize class is EXCLUDED from cross-word detection because -ize
 *     is valid Oxford British — it only counts for the same-word case.
 *
 * Rule ID: 'en-spelling-consistency'
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiSpellRules = host.__lexiSpellRules || [];
  const { escapeHtml, matchCase } = host.__lexiSpellCore || {};
  const esc = typeof escapeHtml === 'function'
    ? escapeHtml
    : (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Curated unambiguous pairs (British → American). Extended at runtime by the
  // systematic suffix transforms below.
  const CURATED_BR_TO_AM = new Map([
    ['programme', 'program'], ['programmes', 'programs'],
    ['grey', 'gray'], ['greyer', 'grayer'], ['greyest', 'grayest'],
    ['practise', 'practice'], ['practised', 'practiced'], ['practising', 'practicing'],
    ['licence', 'license'], ['licences', 'licenses'],
    ['defence', 'defense'], ['defences', 'defenses'],
    ['offence', 'offense'], ['offences', 'offenses'],
    ['metre', 'meter'], ['metres', 'meters'],
    ['kilometre', 'kilometer'], ['kilometres', 'kilometers'],
    ['centimetre', 'centimeter'], ['centimetres', 'centimeters'],
    ['millimetre', 'millimeter'], ['millimetres', 'millimeters'],
    ['litre', 'liter'], ['litres', 'liters'],
    ['centre', 'center'], ['centres', 'centers'],
    ['theatre', 'theater'], ['theatres', 'theaters'],
    ['fibre', 'fiber'], ['fibres', 'fibers'],
    ['catalogue', 'catalog'], ['catalogues', 'catalogs'],
    ['dialogue', 'dialog'], ['dialogues', 'dialogs'],
    ['travelling', 'traveling'], ['travelled', 'traveled'],
    ['traveller', 'traveler'], ['travellers', 'travelers'],
    ['cancelling', 'canceling'], ['cancelled', 'canceled'],
    ['labelling', 'labeling'], ['labelled', 'labeled'],
    ['modelling', 'modeling'], ['modelled', 'modeled'],
    ['jewellery', 'jewelry'], ['aluminium', 'aluminum'],
    ['aeroplane', 'airplane'], ['aeroplanes', 'airplanes'],
    ['moustache', 'mustache'], ['moustaches', 'mustaches'],
    ['tyre', 'tire'], ['tyres', 'tires'],
    ['cheque', 'check'], ['cheques', 'checks'],
    ['storey', 'story'], ['storeys', 'stories'],
    ['plough', 'plow'], ['ploughs', 'plows'],
    ['judgement', 'judgment'], ['judgements', 'judgments'],
  ]);

  // Systematic transforms. Returns { am, br, crossSafe } or null.
  //  crossSafe = usable as a cross-word variety marker (see header).
  function varietyPair(w, validWords) {
    if (CURATED_BR_TO_AM.has(w)) {
      // Ambiguous curated words (cheque/check → 'check' is also a verb;
      // storey/story, tyre/tire, plough/plow verb…) stay same-word-only.
      const AMBIG = new Set(['cheque', 'cheques', 'storey', 'storeys', 'tyre', 'tyres',
        'plough', 'ploughs', 'practise', 'practised', 'practising', 'grey', 'greyer', 'greyest']);
      return { am: CURATED_BR_TO_AM.get(w), br: w, crossSafe: !AMBIG.has(w) };
    }
    // Reverse curated lookup (american → british)
    for (const [br, am] of CURATED_BR_TO_AM) {
      if (am === w) {
        // 'judgment(s)' included: valid British in legal usage — not a
        // reliable variety marker (EN variety-picker phase, 2026-07).
        const AMBIG_AM = new Set(['check', 'checks', 'story', 'stories', 'tire', 'tires',
          'plow', 'plows', 'practice', 'gray', 'grayer', 'grayest', 'program', 'programs',
          'meter', 'meters', 'liter', 'liters', 'judgment', 'judgments']);
        return { am: w, br, crossSafe: !AMBIG_AM.has(w) };
      }
    }
    // -our ↔ -or (colour/color, flavour/flavor + inflections). Stem before
    // -our must be ≥3 letters — excludes your/hour/tour/pour/sour/four and
    // the junk short stems the 110k list happens to contain ('yor').
    let m = w.match(/^(.+our)(s|ed|ing|ite|ites|able)?$/);
    if (m && /our$/.test(m[1]) && m[1].length >= 6) {
      const am = m[1].slice(0, -3) + 'or' + (m[2] || '');
      if (validWords.has(am) && am !== w) return { am, br: w, crossSafe: true };
    }
    m = w.match(/^(.+or)(s|ed|ing|ite|ites|able)?$/);
    if (m && m[1].length >= 5) {
      const br = m[1].slice(0, -2) + 'our' + (m[2] || '');
      if (validWords.has(br) && br !== w) return { am: w, br, crossSafe: true };
    }
    // -ise ↔ -ize family (same-word only: -ize is valid Oxford British)
    m = w.match(/(is|ys)(e|es|ed|ing|ation|ations)$/);
    if (m) {
      const am = w.slice(0, w.length - m[0].length) + (m[1][0] === 'i' ? 'iz' : 'yz') + m[2];
      if (validWords.has(am) && am !== w) return { am, br: w, crossSafe: false };
    }
    m = w.match(/(iz|yz)(e|es|ed|ing|ation|ations)$/);
    if (m) {
      const br = w.slice(0, w.length - m[0].length) + (m[1][0] === 'i' ? 'is' : 'ys') + m[2];
      if (validWords.has(br) && br !== w) return { am: w, br, crossSafe: false };
    }
    return null;
  }

  const rule = {
    id: 'en-spelling-consistency',
    languages: ['en'],
    priority: 66, // P3 hint band
    severity: 'hint',
    noAutoFix: false,
    exam: {
      safe: false,
      reason: 'Spelling-variety consistency pedagogy (British vs American) — style coaching beyond native spellcheck parity',
      category: 'grammar-lookup',
    },
    explain(finding) {
      const a = esc(finding.original || '');
      const b = esc(finding.fix || '');
      const other = esc(finding.counterpart || '');
      if (finding.sameWord) {
        return {
          nb: `Du har brukt både <em>${a}</em> og <em>${other}</em> i teksten — britisk og amerikansk stavemåte av samme ord. Begge er riktige, men vær konsekvent: velg én variant, f.eks. <em>${b}</em>.`,
          nn: `Du har brukt både <em>${a}</em> og <em>${other}</em> i teksten — britisk og amerikansk stavemåte av same ord. Begge er rette, men ver konsekvent: vel éin variant, t.d. <em>${b}</em>.`,
          en: `You used both <em>${a}</em> and <em>${other}</em> — British and American spellings of the same word. Both are correct, but be consistent: pick one, e.g. <em>${b}</em>.`,
        };
      }
      return {
        nb: `<em>${a}</em> er ${finding.variety === 'br' ? 'britisk' : 'amerikansk'} stavemåte, men resten av teksten bruker ${finding.variety === 'br' ? 'amerikansk' : 'britisk'}. Begge varianter er riktige — men i én og samme tekst er det god stil å holde seg til én: <em>${b}</em>.`,
        nn: `<em>${a}</em> er ${finding.variety === 'br' ? 'britisk' : 'amerikansk'} stavemåte, men resten av teksten brukar ${finding.variety === 'br' ? 'amerikansk' : 'britisk'}. Begge variantane er rette — men i éin og same tekst er det god stil å halde seg til éin: <em>${b}</em>.`,
        en: `<em>${a}</em> is the ${finding.variety === 'br' ? 'British' : 'American'} spelling, but the rest of your text uses ${finding.variety === 'br' ? 'American' : 'British'} spelling. Both are correct — but within one text it is good style to stick to one: <em>${b}</em>.`,
      };
    },
    check(ctx) {
      const { tokens, vocab, cursorPos, lang } = ctx;
      if (lang !== 'en' || !tokens || tokens.length < 2) return [];
      // EN variety-picker (2026-07): a strict variety supersedes the
      // consistency coaching — every other-variety form already flags as a
      // spelling error via en-spelling-variety.
      if (vocab && (vocab.enSpellingVariety === 'br' || vocab.enSpellingVariety === 'am')) return [];
      const validWords = vocab.validWords || new Set();
      if (!validWords.size) return [];

      // Pass 1: collect variety-marker tokens.
      const markers = []; // { i, tok, pair, variety }
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.word.length < 4) continue;
        const pair = varietyPair(t.word, validWords);
        if (!pair) continue;
        markers.push({ i, tok: t, pair, variety: t.word === pair.br ? 'br' : 'am' });
      }
      if (markers.length < 2) return [];

      const out = [];
      const flagged = new Set();

      // A) Same word in both spellings — strong trigger.
      const byLemma = new Map(); // am-form → markers[]
      for (const mk of markers) {
        const key = mk.pair.am;
        if (!byLemma.has(key)) byLemma.set(key, []);
        byLemma.get(key).push(mk);
      }
      for (const [, group] of byLemma) {
        const br = group.filter(g => g.variety === 'br');
        const am = group.filter(g => g.variety === 'am');
        if (!br.length || !am.length) continue;
        // Flag the minority spelling's occurrences (tie → the later variant).
        const minority = br.length < am.length ? br
          : am.length < br.length ? am
          : (br[0].i < am[0].i ? am : br);
        const majority = minority === br ? am : br;
        for (const mk of minority) {
          if (flagged.has(mk.i)) continue;
          if (cursorPos != null && cursorPos >= mk.tok.start && cursorPos <= mk.tok.end + 1) continue;
          flagged.add(mk.i);
          const fixWord = mk.variety === 'br' ? mk.pair.am : mk.pair.br;
          out.push({
            rule_id: rule.id,
            priority: rule.priority,
            start: mk.tok.start,
            end: mk.tok.end,
            original: mk.tok.display,
            fix: matchCase ? matchCase(mk.tok.display, fixWord) : fixWord,
            counterpart: majority[0].tok.display,
            sameWord: true,
            variety: mk.variety,
            severity: rule.severity,
            message: `Blandet stavemåte: «${mk.tok.display}» og «${majority[0].tok.display}» er samme ord (britisk/amerikansk) — vær konsekvent`,
          });
        }
      }

      // B) Cross-word variety mixing — conservative: only crossSafe markers,
      //    majority ≥ 2, and at least 3 markers total.
      const cross = markers.filter(mk => mk.pair.crossSafe && !flagged.has(mk.i));
      const crossBr = cross.filter(mk => mk.variety === 'br');
      const crossAm = cross.filter(mk => mk.variety === 'am');
      if (cross.length >= 3 && crossBr.length && crossAm.length) {
        const minority = crossBr.length < crossAm.length ? crossBr
          : crossAm.length < crossBr.length ? crossAm : null;
        if (minority && (cross.length - minority.length) >= 2) {
          for (const mk of minority) {
            if (flagged.has(mk.i)) continue;
            if (cursorPos != null && cursorPos >= mk.tok.start && cursorPos <= mk.tok.end + 1) continue;
            flagged.add(mk.i);
            const fixWord = mk.variety === 'br' ? mk.pair.am : mk.pair.br;
            out.push({
              rule_id: rule.id,
              priority: rule.priority,
              start: mk.tok.start,
              end: mk.tok.end,
              original: mk.tok.display,
              fix: matchCase ? matchCase(mk.tok.display, fixWord) : fixWord,
              sameWord: false,
              variety: mk.variety,
              severity: rule.severity,
              message: `Stavemåte-stil: «${mk.tok.display}» er ${mk.variety === 'br' ? 'britisk' : 'amerikansk'}, resten av teksten ${mk.variety === 'br' ? 'amerikansk' : 'britisk'}`,
            });
          }
        }
      }
      return out;
    },
  };

  host.__lexiSpellRules.push(rule);
  // Shared pair mapping for en-spelling-variety (loads after this file per
  // manifest order) — EN variety-picker phase, 2026-07.
  host.__lexiVarietyPair = varietyPair;
  if (typeof module !== 'undefined' && module.exports) module.exports = rule;
})();
