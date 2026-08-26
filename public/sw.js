/**
 * Service Worker for Papertek Skriv.
 * Caches static assets for offline use.
 */

const CACHE_NAME = 'skriv-v90';
const ASSETS = [
    '/',
    '/index.html',
    '/whitepaper.html',
    '/stabekk.html',
    '/school.html',
    '/manifest.json',
    '/icons/icon-192.svg',
    '/js/app/main.js',
    '/js/app/standalone-writer.js',
    '/js/app/document-store.js',
    '/js/app/document-list.js',
    '/js/app/document-search.js',
    '/js/app/trash-store.js',
    '/js/app/word-count-stats.js',
    '/js/app/folder-store.js',
    '/js/app/library-backup.js',
    '/js/app/sidebar.js',
    '/js/app/folder-picker.js',
    '/js/app/sw-manager.js',
    '/js/app/school-level.js',
    '/js/app/onboarding-modal.js',
    '/js/app/german-exam-route.js',
    '/js/app/paragraph-trainer-route.js',
    '/js/app/school-page.js',
    '/js/app/leksihjelp-bridge.js',
    '/js/app/leksihjelp-settings.js',
    '/js/app/leksihjelp-dictionary.js',
    '/js/editor-core/config.js',
    '/js/editor-core/shared/i18n.js',
    '/js/editor-core/shared/in-page-modal.js',
    '/js/editor-core/shared/toast-notification.js',
    '/js/editor-core/shared/word-counter.js',
    '/js/editor-core/shared/html-escape.js',
    '/js/editor-core/shared/dom-helpers.js',
    '/js/editor-core/shared/frame-elements.js',
    '/js/editor-core/shared/auto-save.js',
    '/js/editor-core/shared/theme.js',
    '/js/editor-core/shared/aria-live.js',
    '/js/editor-core/student/editor-toolbar.js',
    '/js/editor-core/student/text-export.js',
    '/js/editor-core/student/docx-export.js',
    '/js/editor-core/student/find-replace.js',
    '/js/editor-core/student/toc-manager.js',
    '/js/editor-core/student/reference-manager.js',
    '/js/editor-core/student/special-chars-panel.js',
    '/js/editor-core/student/argument-flow.js',
    '/js/editor-core/student/focus-mode.js',
    '/js/editor-core/student/frame-parser.js',
    '/js/editor-core/student/frame-guide.js',
    '/js/editor-core/student/frame-selector.js',
    '/js/editor-core/student/keyboard-shortcuts.js',
    '/js/editor-core/student/lix-score.js',
    '/js/editor-core/student/writing-spinner.js',
    '/js/editor-core/student/writing-feedback.js',
    '/js/editor-core/student/writing-progress.js',
    '/js/editor-core/student/word-frequency.js',
    '/js/editor-core/student/spinner-data-nb.js',
    '/js/editor-core/student/spinner-data-nn.js',
    '/js/editor-core/student/spinner-data-en.js',
    '/js/editor-core/student/sentence-length.js',
    '/js/editor-core/student/paragraph-map.js',
    '/js/editor-core/student/image-manager.js',
    '/js/editor-core/student/matte.js',
    '/js/editor-core/student/onboarding-tour.js',
    '/js/editor-core/student/submission-checklist.js',
    '/js/editor-core/student/table-manager.js',
    '/js/editor-core/student/version-history.js',
    '/js/editor-core/student/paragraph-trainer.js',
    '/js/editor-core/student/paragraph-trainer-data.js',
    '/js/editor-core/student/german-exam-data.js',
    '/js/editor-core/student/german-exam-spinner.js',
    '/js/editor-core/student/german-hint-drawer.js',
    '/js/editor-core/student/insights-drawer.js',
    '/js/editor-core/student/editor-lang.js',
    '/js/editor-core/student/read-aloud.js',
    '/js/editor-core/student/reading-settings.js',
    '/js/editor-core/student/german-exam-svg/birthday.js',
    '/js/editor-core/student/german-exam-svg/city.js',
    '/js/editor-core/student/german-exam-svg/berlin.js',
    '/js/editor-core/student/german-exam-svg/friends.js',
    '/js/editor-core/student/german-exam-svg/school.js',
    '/js/editor-core/student/german-exam-svg/environment.js',
    '/js/editor-core/student/german-exam-svg/social-media.js',
    '/js/editor-core/student/german-exam-svg/journey.js',
    '/js/editor-core/student/german-exam-svg/future.js',
    '/js/editor-core/student/german-exam-svg/multicultural.js',
    '/js/editor-core/student/german-exam-svg/summer-job.js',
    '/js/editor-core/student/german-exam-svg/lost-bag.js',
    '/js/editor-core/student/german-exam-svg/youth-center-poster.js',
    '/js/editor-core/student/german-exam-svg/poster-choice.js',
    '/js/editor-core/student/german-exam-svg/vacation-photos.js',
    '/js/editor-core/student/german-exam-svg/hotel-complaints.js',
    '/js/editor-core/locales/nb.js',
    '/js/editor-core/locales/nn.js',
    '/js/editor-core/locales/en.js',
    // Bokmål frames
    '/frames/nb/droefting.md',
    '/frames/nb/analyse.md',
    '/frames/nb/kronikk.md',
    '/frames/nb/kaaseri.md',
    '/frames/nb/fagartikkel.md',
    '/frames/nb/leserinnlegg.md',
    '/frames/nb/novelle.md',
    '/frames/nb/retorisk-analyse.md',
    '/frames/nb/kortsvar.md',
    '/frames/nb/kreativ-tekst.md',
    '/frames/nb/reflekterende-tekst.md',
    '/frames/nb/sammenligning.md',
    '/frames/nb/fortelling.md',
    '/frames/nb/faktatekst.md',
    '/frames/nb/bokmelding.md',
    '/frames/nb/soeknad.md',
    '/frames/nb/formelt-brev.md',
    // Nynorsk frames
    '/frames/nn/droefting.md',
    '/frames/nn/analyse.md',
    '/frames/nn/kronikk.md',
    '/frames/nn/kaaseri.md',
    '/frames/nn/fagartikkel.md',
    '/frames/nn/leserinnlegg.md',
    '/frames/nn/novelle.md',
    '/frames/nn/retorisk-analyse.md',
    '/frames/nn/kortsvar.md',
    '/frames/nn/kreativ-tekst.md',
    '/frames/nn/reflekterende-tekst.md',
    '/frames/nn/sammenligning.md',
    '/frames/nn/fortelling.md',
    '/frames/nn/faktatekst.md',
    '/frames/nn/bokmelding.md',
    '/frames/nn/soeknad.md',
    '/frames/nn/formelt-brev.md',
    // English frames (the English subject exists at every school level)
    '/frames/en/droefting.md',
    '/frames/en/analyse.md',
    '/frames/en/kronikk.md',
    '/frames/en/kaaseri.md',
    '/frames/en/fagartikkel.md',
    '/frames/en/leserinnlegg.md',
    '/frames/en/novelle.md',
    '/frames/en/retorisk-analyse.md',
    '/frames/en/kortsvar.md',
    '/frames/en/kreativ-tekst.md',
    '/frames/en/reflekterende-tekst.md',
    '/frames/en/sammenligning.md',
    '/frames/en/fortelling.md',
    '/frames/en/faktatekst.md',
    '/frames/en/bokmelding.md',
    '/frames/en/soeknad.md',
    '/frames/en/formelt-brev.md',
    // Leksihjelp loader (chrome.* shim — must precache so it survives offline)
    '/js/leksihjelp-loader.js',
];

// Vendored leksihjelp bundle. Precached best-effort (see install handler).
// Generated via scripts/sync-leksihjelp.js — keep in sync with the file
// listing in public/js/leksihjelp/. Failures here do NOT block install:
// the fetch handler will lazy-cache any path missed at install time.
// Large optional assets, precached best-effort like the leksihjelp bundle:
// a miss never blocks install, and the fetch handler lazy-caches on first
// use. The docx bundle (~800 kB) is only needed when a pupil exports Word.
const OPTIONAL_ASSETS = [
    '/vendor/docx.iife.js',
];

const LEKSIHJELP_ASSETS = [
    '/js/leksihjelp/.version',
    '/js/leksihjelp/i18n/strings.js',
    '/js/leksihjelp/exam-registry.js',
    '/js/leksihjelp/styles/leksihjelp.css',
    '/js/leksihjelp/content/vocab-seam-core.js',
    '/js/leksihjelp/content/vocab-seam.js',
    '/js/leksihjelp/content/lang-detect.js',
    '/js/leksihjelp/content/pause-domain.js',
    '/js/leksihjelp/content/rule-features.js',
    '/js/leksihjelp/content/spell-check-core.js',
    '/js/leksihjelp/content/spell-check-engine.js',
    '/js/leksihjelp/content/pedagogy-render.js',
    '/js/leksihjelp/content/personalization-store.js',
    '/js/leksihjelp/content/spell-check-renderer.js',
    '/js/leksihjelp/content/spell-rules/grammar-tables.js',
    '/js/leksihjelp/content/spell-rules/quotation-suppression.js',
    '/js/leksihjelp/content/spell-rules/de-capitalization.js',
    '/js/leksihjelp/content/spell-rules/de-perfekt-aux.js',
    '/js/leksihjelp/content/spell-rules/de-compound-gender.js',
    '/js/leksihjelp/content/spell-rules/de-gender.js',
    '/js/leksihjelp/content/spell-rules/de-grammar.js',
    '/js/leksihjelp/content/spell-rules/de-wann-wenn.js',
    '/js/leksihjelp/content/spell-rules/de-codeswitch.js',
    '/js/leksihjelp/content/spell-rules/de-modal-verb.js',
    '/js/leksihjelp/content/spell-rules/de-sarskriving.js',
    '/js/leksihjelp/content/spell-rules/en-grammar.js',
    '/js/leksihjelp/content/spell-rules/en-grammar-advanced.js',
    '/js/leksihjelp/content/spell-rules/en-capitalization.js',
    '/js/leksihjelp/content/spell-rules/en-preposition.js',
    '/js/leksihjelp/content/spell-rules/en-false-friend.js',
    '/js/leksihjelp/content/spell-rules/en-spelling-consistency.js',
    '/js/leksihjelp/content/spell-rules/en-spelling-variety.js',
    '/js/leksihjelp/content/spell-rules/es-accent-guard.js',
    '/js/leksihjelp/content/spell-rules/es-coordination.js',
    '/js/leksihjelp/content/spell-rules/es-grammar.js',
    '/js/leksihjelp/content/spell-rules/es-subject-verb.js',
    '/js/leksihjelp/content/spell-rules/es-fr-gender.js',
    '/js/leksihjelp/content/spell-rules/es-fr-modal-verb.js',
    '/js/leksihjelp/content/spell-rules/fr-contraction.js',
    '/js/leksihjelp/content/spell-rules/fr-elision.js',
    '/js/leksihjelp/content/spell-rules/fr-etre-avoir.js',
    '/js/leksihjelp/content/spell-rules/fr-avoir-idiom.js',
    '/js/leksihjelp/content/spell-rules/fr-cedille.js',
    '/js/leksihjelp/content/spell-rules/fr-plural.js',
    '/js/leksihjelp/content/spell-rules/fr-plus-bon.js',
    '/js/leksihjelp/content/spell-rules/fr-aucun.js',
    '/js/leksihjelp/content/spell-rules/fr-beau-bel.js',
    '/js/leksihjelp/content/spell-rules/fr-adj-plural.js',
    '/js/leksihjelp/content/spell-rules/fr-grammar.js',
    '/js/leksihjelp/content/spell-rules/fr-preposition.js',
    '/js/leksihjelp/content/spell-rules/nb-codeswitch.js',
    '/js/leksihjelp/content/spell-rules/nb-propernoun-guard.js',
    '/js/leksihjelp/content/spell-rules/nb-gender.js',
    '/js/leksihjelp/content/spell-rules/nb-adjective-agreement.js',
    '/js/leksihjelp/content/spell-rules/nb-compound-gender.js',
    '/js/leksihjelp/content/spell-rules/nb-demonstrative-gender.js',
    '/js/leksihjelp/content/spell-rules/nb-double-definiteness.js',
    '/js/leksihjelp/content/spell-rules/nb-definiteness-advisory.js',
    '/js/leksihjelp/content/spell-rules/nb-transitive-intransitive.js',
    '/js/leksihjelp/content/spell-rules/nb-modal-verb.js',
    '/js/leksihjelp/content/spell-rules/nb-nn-passiv-s.js',
    '/js/leksihjelp/content/spell-rules/nb-aa-og.js',
    '/js/leksihjelp/content/spell-rules/nb-sarskriving.js',
    '/js/leksihjelp/content/spell-rules/nb-sarskriving-tentative.js',
    '/js/leksihjelp/content/spell-rules/universal-agreement.js',
    '/js/leksihjelp/content/spell-rules/nb-dialect-mix.js',
    '/js/leksihjelp/content/spell-rules/nb-place-preposition.js',
    '/js/leksihjelp/content/spell-rules/nn-verb-leakage.js',
    '/js/leksihjelp/content/spell-rules/nn-plural-leakage.js',
    '/js/leksihjelp/content/spell-rules/nn-form-consistency.js',
    '/js/leksihjelp/content/spell-rules/nb-riksmal-lexical.js',
    '/js/leksihjelp/content/spell-rules/nb-typo-curated.js',
    '/js/leksihjelp/content/spell-rules/nb-runon-words.js',
    '/js/leksihjelp/content/spell-rules/nb-triple-letter.js',
    '/js/leksihjelp/content/spell-rules/nb-typo-fuzzy.js',
    '/js/leksihjelp/content/spell-rules/nb-homophones.js',
    '/js/leksihjelp/content/spell-rules/en-a-an.js',
    '/js/leksihjelp/content/spell-rules/en-homophones.js',
    '/js/leksihjelp/content/spell-rules/universal-context-typo.js',
    '/js/leksihjelp/content/spell-rules/register.js',
    '/js/leksihjelp/content/spell-rules/collocation.js',
    '/js/leksihjelp/content/spell-rules/redundancy.js',
    '/js/leksihjelp/content/spell-rules/es-ser-estar.js',
    '/js/leksihjelp/content/spell-rules/es-por-para.js',
    '/js/leksihjelp/content/spell-rules/es-personal-a.js',
    '/js/leksihjelp/content/spell-rules/de-prep-case.js',
    '/js/leksihjelp/content/spell-rules/de-separable-verb.js',
    '/js/leksihjelp/content/spell-rules/de-v2.js',
    '/js/leksihjelp/content/spell-rules/de-verb-final.js',
    '/js/leksihjelp/content/spell-rules/de-modal-infinitive-final.js',
    '/js/leksihjelp/content/spell-rules/de-participle-final.js',
    '/js/leksihjelp/content/spell-rules/de-subject-verb.js',
    '/js/leksihjelp/content/spell-rules/de-strong-verb.js',
    '/js/leksihjelp/content/spell-rules/de-komparativ.js',
    '/js/leksihjelp/content/spell-rules/de-dative-plural.js',
    '/js/leksihjelp/content/spell-rules/de-dative-verb.js',
    '/js/leksihjelp/content/spell-rules/de-negation.js',
    '/js/leksihjelp/content/spell-rules/de-kein-noun.js',
    '/js/leksihjelp/content/spell-rules/de-reflexive.js',
    '/js/leksihjelp/content/spell-rules/de-akkusativ-pronoun.js',
    '/js/leksihjelp/content/spell-rules/de-adjective-declension.js',
    '/js/leksihjelp/content/spell-rules/de-wechselpraep.js',
    '/js/leksihjelp/content/spell-rules/de-possessive-genitive.js',
    '/js/leksihjelp/content/spell-rules/de-dative-possessive.js',
    '/js/leksihjelp/content/spell-rules/de-accusative-possessive.js',
    '/js/leksihjelp/content/spell-rules/de-dat-prep-pronoun.js',
    '/js/leksihjelp/content/spell-rules/de-acc-prep-pronoun.js',
    '/js/leksihjelp/content/spell-rules/de-wechsel-prep-pronoun.js',
    '/js/leksihjelp/content/spell-rules/de-prep-contraction.js',
    '/js/leksihjelp/content/spell-rules/de-dass-das.js',
    '/js/leksihjelp/content/spell-rules/de-comma-subord.js',
    '/js/leksihjelp/content/spell-rules/de-wo-wohin.js',
    '/js/leksihjelp/content/spell-rules/de-zu-infinitive.js',
    '/js/leksihjelp/content/spell-rules/de-nach-hause.js',
    '/js/leksihjelp/content/spell-rules/de-dativ-objekt.js',
    '/js/leksihjelp/content/spell-rules/de-sehr-komparativ.js',
    '/js/leksihjelp/content/spell-rules/de-sowohl-als-auch.js',
    '/js/leksihjelp/content/spell-rules/de-je-desto.js',
    '/js/leksihjelp/content/spell-rules/de-trotz-conjunction.js',
    '/js/leksihjelp/content/spell-rules/de-ob-indirect.js',
    '/js/leksihjelp/content/spell-rules/de-viel-viele.js',
    '/js/leksihjelp/content/spell-rules/fr-bags.js',
    '/js/leksihjelp/content/spell-rules/fr-pp-agreement.js',
    '/js/leksihjelp/content/spell-rules/nb-v2.js',
    '/js/leksihjelp/content/spell-rules/es-subjuntivo.js',
    '/js/leksihjelp/content/spell-rules/es-imperfecto-hint.js',
    '/js/leksihjelp/content/spell-rules/fr-subjonctif.js',
    '/js/leksihjelp/content/spell-rules/fr-aspect-hint.js',
    '/js/leksihjelp/content/spell-rules/es-pro-drop.js',
    '/js/leksihjelp/content/spell-rules/es-gustar.js',
    '/js/leksihjelp/content/spell-rules/es-mucho-muchos.js',
    '/js/leksihjelp/content/spell-rules/es-todo-todos.js',
    '/js/leksihjelp/content/spell-rules/es-tener-edad.js',
    '/js/leksihjelp/content/spell-rules/es-ir-a-infinitivo.js',
    '/js/leksihjelp/content/spell-rules/es-double-negation.js',
    '/js/leksihjelp/content/spell-rules/es-enye.js',
    '/js/leksihjelp/content/spell-rules/es-haber-impersonal.js',
    '/js/leksihjelp/content/spell-rules/es-demonstrative-gender.js',
    '/js/leksihjelp/content/spell-rules/es-apocope.js',
    '/js/leksihjelp/content/spell-rules/es-possessive-number.js',
    '/js/leksihjelp/content/spell-rules/es-conmigo-contigo.js',
    '/js/leksihjelp/content/spell-rules/es-numeral-cien.js',
    '/js/leksihjelp/content/spell-rules/es-cardinal-gender.js',
    '/js/leksihjelp/content/spell-rules/es-cualquier.js',
    '/js/leksihjelp/content/spell-rules/es-ambos.js',
    '/js/leksihjelp/content/spell-rules/es-otro.js',
    '/js/leksihjelp/content/spell-rules/es-varios.js',
    '/js/leksihjelp/content/spell-rules/fr-tout-tous.js',
    '/js/leksihjelp/content/spell-rules/fr-clitic-order.js',
    '/js/leksihjelp/content/spell-rules/en-morphology.js',
    '/js/leksihjelp/content/spell-rules/en-word-family.js',
    '/js/leksihjelp/content/spell-rules/en-article-profession.js',
    '/js/leksihjelp/content/spell-rules/en-subject-verb.js',
    '/js/leksihjelp/content/spell-rules/fr-adj-gender.js',
    '/js/leksihjelp/content/spell-rules/fr-negation.js',
    '/js/leksihjelp/content/spell-rules/fr-relative-qui-que.js',
    '/js/leksihjelp/content/spell-rules/fr-accord-possessif.js',
    '/js/leksihjelp/content/spell-rules/fr-tout-le-monde.js',
    '/js/leksihjelp/content/spell-rules/fr-on-singulier.js',
    '/js/leksihjelp/content/spell-rules/fr-pays-preposition.js',
    '/js/leksihjelp/content/spell-rules/fr-aller-infinitif.js',
    '/js/leksihjelp/content/spell-rules/fr-ce-cet-cette.js',
    '/js/leksihjelp/content/spell-rules/fr-quel-accord.js',
    '/js/leksihjelp/content/spell-rules/fr-venir-de.js',
    '/js/leksihjelp/content/spell-rules/fr-ville-preposition.js',
    '/js/leksihjelp/content/spell-rules/fr-si-conditionnel.js',
    '/js/leksihjelp/content/spell-rules/fr-moyen-transport.js',
    '/js/leksihjelp/content/spell-rules/fr-jouer-a-de.js',
    '/js/leksihjelp/content/spell-rules/fr-on-ont.js',
    '/js/leksihjelp/content/spell-rules/fr-son-sont.js',
    '/js/leksihjelp/content/spell-rules/fr-ce-ces.js',
    '/js/leksihjelp/content/spell-rules/fr-quel-pluriel.js',
    '/js/leksihjelp/content/spell-rules/fr-leur-leurs.js',
    '/js/leksihjelp/content/spell-rules/doc-drift-de-address.js',
    '/js/leksihjelp/content/spell-rules/doc-drift-fr-address.js',
    '/js/leksihjelp/content/spell-rules/doc-drift-nb-register.js',
    '/js/leksihjelp/content/spell-rules/doc-drift-nn-infinitive.js',
    '/js/leksihjelp/content/spell-rules/doc-drift-nb-passiv-overuse.js',
    '/js/leksihjelp/content/spell-rules/nb-anglicism.js',
    '/js/leksihjelp/content/spell-rules/nb-possessive-definite.js',
    '/js/leksihjelp/content/spell-rules/en-confused-pairs.js',
    '/js/leksihjelp/content/spell-rules/en-double-comparative.js',
    '/js/leksihjelp/content/spell-rules/nb-adverbial-split.js',
    '/js/leksihjelp/content/spell-rules/nb-comma.js',
    '/js/leksihjelp/content/spell-rules/nb-comma-leddsetning.js',
    '/js/leksihjelp/content/spell-rules/nb-sentence-boundary.js',
    '/js/leksihjelp/content/spell-rules/sentence-case.js',
    '/js/leksihjelp/content/spell-rules/nb-apostrophe-genitive.js',
    '/js/leksihjelp/content/spell-rules/nb-nn-reflexive-possessive.js',
    '/js/leksihjelp/content/spell-rules/nb-nn-infinitive-after-aa.js',
    '/js/leksihjelp/content/spell-rules/nb-negation-order.js',
    '/js/leksihjelp/content/spell-rules/nb-subordinate-order.js',
    '/js/leksihjelp/content/spell-rules/nb-impersonal-det.js',
    '/js/leksihjelp/content/spell-rules/nb-noun-plural-quantifier.js',
    '/js/leksihjelp/content/spell-rules/nb-bare-infinitive-present.js',
    '/js/leksihjelp/popup/dict-state-builder.js',
    '/js/leksihjelp/popup/grammar-features-section.js',
    '/js/leksihjelp/data/de.json',
    '/js/leksihjelp/data/en.json',
    '/js/leksihjelp/data/es.json',
    '/js/leksihjelp/data/fr.json',
    '/js/leksihjelp/data/nb.json',
    '/js/leksihjelp/data/nn.json',
    '/js/leksihjelp/data/nb-baseline.json',
    '/js/leksihjelp/data/grammarfeatures-de.json',
    '/js/leksihjelp/data/grammarfeatures-en.json',
    '/js/leksihjelp/data/grammarfeatures-es.json',
    '/js/leksihjelp/data/grammarfeatures-fr.json',
    '/js/leksihjelp/data/grammarfeatures-nb.json',
    '/js/leksihjelp/data/grammarfeatures-nn.json',
    '/js/leksihjelp/data/pitfalls-en.json',
    // Norwegian spell-check support data — precached (best-effort) so
    // nb/nn checking works offline. Foreign-language equivalents are
    // lazy-cached on first use instead (they are ~10 MB each).
    '/js/leksihjelp/data/validwords-nb.json',
    '/js/leksihjelp/data/validwords-nn.json',
    '/js/leksihjelp/data/bigrams-nb.json',
    '/js/leksihjelp/data/bigrams-nn.json',
    '/js/leksihjelp/data/freq-nb.json',
    '/js/leksihjelp/data/freq-nn.json',
    '/js/leksihjelp/data/ordbank-bloom-nb.bin',
    '/js/leksihjelp/data/ordbank-bloom-nn.bin',
    '/js/leksihjelp/data/cross-standard-nb-nn.json',
    '/js/leksihjelp/data/non-compound-pairs.json',
    '/js/leksihjelp/data/rettskrivingsvedtak-2023.json',
];

// Listen for SKIP_WAITING message from sw-manager.js
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Install: cache static assets
//
// Two-stage install:
//   1. Atomic precache of the critical Skriv ASSETS — if any of these fail,
//      the SW does not activate and the previous cache stays live (safe).
//   2. Best-effort precache of the vendored leksihjelp bundle. We allow
//      individual fetches to fail (a 404 from a sync-script bug shouldn't
//      brick Skriv); whatever fails gets lazy-cached on first hit by the
//      fetch handler below. This keeps Skriv resilient to leksihjelp
//      vendoring drift without giving up offline-first for the bundle.
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            await cache.addAll(ASSETS);
            // Settle each leksihjelp asset independently — Promise.all on
            // .catch'd inner promises is the standard "wait, don't fail" idiom.
            await Promise.all(
                [...LEKSIHJELP_ASSETS, ...OPTIONAL_ASSETS].map((path) =>
                    cache.add(path).catch((err) => {
                        console.warn('[sw] best-effort precache miss:', path, err && err.message);
                    })
                )
            );
        })
    );
    self.skipWaiting();
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((names) => {
            return Promise.all(
                names
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch: network first, fall back to cache
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip CDN requests (Tailwind, jsPDF, Floating UI) — let browser handle
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // Cache successful responses
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, clone);
                    });
                }
                return response;
            })
            .catch(() => {
                // Network failed — try cache
                return caches.match(event.request);
            })
    );
});
