/**
 * Leksihjelp — Rule → grammar-feature map (level-scoped corrections).
 *
 * Single source of truth (read by both the core scope-gate in
 * spell-check-core.js AND the popup library-view.js). Keyed by rule_id (the
 * value a rule emits on findings). Values are GENERIC feature ids — the seam's
 * genericToLangMap (vocab-seam.js) maps them to the language-prefixed form the
 * preset stores, so one entry works across NB/NN/DE/ES/FR.
 *
 * A list value = "in scope if ANY listed feature is enabled".
 * Rules ABSENT from this map are always-on basics (orthography, spelling,
 * dialect, punctuation, anglicism) and fire at every level.
 *
 * Modelled on exam-registry.js: loaded in content_scripts (before
 * spell-check-core.js) and in popup.html.
 */
(function () {
  'use strict';
  const host = typeof self !== 'undefined' ? self : globalThis;

  // Keyed by the rule-object `id` (== the emitted rule_id for every grammar rule
  // here — verified). Values: GENERIC ids (resolve via vocab-seam's
  // genericToLangMap — only the Germanic/Norse-named set: present, preteritum,
  // perfektum, imperativ, comparative, superlative, plural, articles,
  // accusative_nouns, dative, genitiv) OR LANG-PREFIXED ids directly (required
  // for Romance features the generic map doesn't cover — es_subjuntivo,
  // fr_subjonctif, etc.; the predicate's direct enabledFeatures.has() resolves
  // them). A list = "in scope if ANY listed feature is enabled".
  host.__lexiRuleFeatures = Object.freeze({
    // ── German ──
    'de-subject-verb':         'grammar_present',
    'de-strong-verb':          'grammar_present',
    'de-komparativ':           'grammar_comparative',
    'de-prep-case':            ['grammar_accusative_nouns', 'grammar_dative'],
    'de-wechselpraep':         ['grammar_accusative_nouns', 'grammar_dative'],
    'de-dative-plural':        'grammar_dative',
    'de-dative-verb':          'grammar_dative',
    'de-compound-gender':      'grammar_articles',
    // ── Gender (rule.id 'gender' is shared by de-gender + nb-gender → DE+NB+NN) ──
    'gender':                  'grammar_articles',
    'nb-compound-gender':      'grammar_articles',
    'nb-demonstrative-gender': 'grammar_articles',
    // ── Spanish / French: advanced MOOD only (lang-prefixed — generic ids
    //    don't cover Romance naming). Conservative: subject-verb, pp-agreement,
    //    adj-gender, word-order, definiteness stay always-on (absent). ──
    'es-subjuntivo':           'grammar_es_subjuntivo',
    'fr-subjonctif':           'grammar_fr_subjonctif',
  });

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = host.__lexiRuleFeatures;
  }
})();
