/**
 * Service Worker for Papertek Skriv.
 * Caches static assets for offline use.
 */

const CACHE_NAME = 'skriv-v66';
const ASSETS = [
    '/',
    '/index.html',
    '/whitepaper.html',
    '/manifest.json',
    '/js/app/main.js',
    '/js/app/standalone-writer.js',
    '/js/app/document-store.js',
    '/js/app/document-list.js',
    '/js/app/document-search.js',
    '/js/app/trash-store.js',
    '/js/app/folder-store.js',
    '/js/app/sidebar.js',
    '/js/app/folder-picker.js',
    '/js/app/sw-manager.js',
    '/js/app/school-level.js',
    '/js/app/onboarding-modal.js',
    '/js/app/german-exam-route.js',
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
    '/js/editor-core/student/toc-manager.js',
    '/js/editor-core/student/reference-manager.js',
    '/js/editor-core/student/special-chars-panel.js',
    '/js/editor-core/student/frame-parser.js',
    '/js/editor-core/student/frame-guide.js',
    '/js/editor-core/student/frame-manager.js',
    '/js/editor-core/student/frame-selector.js',
    '/js/editor-core/student/writing-spinner.js',
    '/js/editor-core/student/word-frequency.js',
    '/js/editor-core/student/spinner-data-nb.js',
    '/js/editor-core/student/spinner-data-nn.js',
    '/js/editor-core/student/sentence-length.js',
    '/js/editor-core/student/paragraph-map.js',
    '/js/editor-core/student/image-manager.js',
    '/js/editor-core/student/matte.js',
    '/js/editor-core/student/submission-checklist.js',
    '/js/editor-core/student/german-exam-data.js',
    '/js/editor-core/student/german-exam-spinner.js',
    '/js/editor-core/student/german-hint-drawer.js',
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
    // Nynorsk frames
    '/frames/nn/droefting.md',
    '/frames/nn/analyse.md',
    '/frames/nn/kronikk.md',
    '/frames/nn/kaaseri.md',
    '/frames/nn/fagartikkel.md',
    '/frames/nn/leserinnlegg.md',
    '/frames/nn/novelle.md',
    // Legacy paths (backward compatibility)
    '/frames/droefting.md',
    '/frames/analyse.md',
    '/frames/kronikk.md',
    // Leksihjelp loader (chrome.* shim — must precache so it survives offline)
    '/js/leksihjelp-loader.js',
];

// Vendored leksihjelp bundle. Precached best-effort (see install handler).
// Generated via scripts/sync-leksihjelp.js — keep in sync with the file
// listing in public/js/leksihjelp/. Failures here do NOT block install:
// the fetch handler will lazy-cache any path missed at install time.
const LEKSIHJELP_ASSETS = [
    '/js/leksihjelp/.version',
    '/js/leksihjelp/i18n/strings.js',
    '/js/leksihjelp/exam-registry.js',
    '/js/leksihjelp/styles/leksihjelp.css',
    '/js/leksihjelp/content/vocab-seam-core.js',
    '/js/leksihjelp/content/vocab-seam.js',
    '/js/leksihjelp/content/lang-detect.js',
    '/js/leksihjelp/content/spell-check-core.js',
    '/js/leksihjelp/content/spell-check-engine.js',
    '/js/leksihjelp/content/spell-check-renderer.js',
    '/js/leksihjelp/content/spell-rules/collocation.js',
    '/js/leksihjelp/content/spell-rules/de-capitalization.js',
    '/js/leksihjelp/content/spell-rules/de-compound-gender.js',
    '/js/leksihjelp/content/spell-rules/de-gender.js',
    '/js/leksihjelp/content/spell-rules/de-grammar.js',
    '/js/leksihjelp/content/spell-rules/de-modal-verb.js',
    '/js/leksihjelp/content/spell-rules/de-perfekt-aux.js',
    '/js/leksihjelp/content/spell-rules/de-prep-case.js',
    '/js/leksihjelp/content/spell-rules/de-separable-verb.js',
    '/js/leksihjelp/content/spell-rules/de-v2.js',
    '/js/leksihjelp/content/spell-rules/de-verb-final.js',
    '/js/leksihjelp/content/spell-rules/doc-drift-de-address.js',
    '/js/leksihjelp/content/spell-rules/doc-drift-fr-address.js',
    '/js/leksihjelp/content/spell-rules/doc-drift-nb-passiv-overuse.js',
    '/js/leksihjelp/content/spell-rules/doc-drift-nb-register.js',
    '/js/leksihjelp/content/spell-rules/doc-drift-nn-infinitive.js',
    '/js/leksihjelp/content/spell-rules/en-a-an.js',
    '/js/leksihjelp/content/spell-rules/en-confused-pairs.js',
    '/js/leksihjelp/content/spell-rules/en-double-comparative.js',
    '/js/leksihjelp/content/spell-rules/en-grammar.js',
    '/js/leksihjelp/content/spell-rules/en-grammar-advanced.js',
    '/js/leksihjelp/content/spell-rules/en-homophones.js',
    '/js/leksihjelp/content/spell-rules/en-morphology.js',
    '/js/leksihjelp/content/spell-rules/en-subject-verb.js',
    '/js/leksihjelp/content/spell-rules/en-word-family.js',
    '/js/leksihjelp/content/spell-rules/es-accent-guard.js',
    '/js/leksihjelp/content/spell-rules/es-coordination.js',
    '/js/leksihjelp/content/spell-rules/es-fr-gender.js',
    '/js/leksihjelp/content/spell-rules/es-fr-modal-verb.js',
    '/js/leksihjelp/content/spell-rules/es-grammar.js',
    '/js/leksihjelp/content/spell-rules/es-gustar.js',
    '/js/leksihjelp/content/spell-rules/es-imperfecto-hint.js',
    '/js/leksihjelp/content/spell-rules/es-personal-a.js',
    '/js/leksihjelp/content/spell-rules/es-por-para.js',
    '/js/leksihjelp/content/spell-rules/es-pro-drop.js',
    '/js/leksihjelp/content/spell-rules/es-ser-estar.js',
    '/js/leksihjelp/content/spell-rules/es-subjuntivo.js',
    '/js/leksihjelp/content/spell-rules/fr-adj-gender.js',
    '/js/leksihjelp/content/spell-rules/fr-aspect-hint.js',
    '/js/leksihjelp/content/spell-rules/fr-bags.js',
    '/js/leksihjelp/content/spell-rules/fr-clitic-order.js',
    '/js/leksihjelp/content/spell-rules/fr-contraction.js',
    '/js/leksihjelp/content/spell-rules/fr-elision.js',
    '/js/leksihjelp/content/spell-rules/fr-etre-avoir.js',
    '/js/leksihjelp/content/spell-rules/fr-grammar.js',
    '/js/leksihjelp/content/spell-rules/fr-pp-agreement.js',
    '/js/leksihjelp/content/spell-rules/fr-preposition.js',
    '/js/leksihjelp/content/spell-rules/fr-subjonctif.js',
    '/js/leksihjelp/content/spell-rules/grammar-tables.js',
    '/js/leksihjelp/content/spell-rules/nb-aa-og.js',
    '/js/leksihjelp/content/spell-rules/nb-anglicism.js',
    '/js/leksihjelp/content/spell-rules/nb-apostrophe-genitive.js',
    '/js/leksihjelp/content/spell-rules/nb-codeswitch.js',
    '/js/leksihjelp/content/spell-rules/nb-comma.js',
    '/js/leksihjelp/content/spell-rules/nb-compound-gender.js',
    '/js/leksihjelp/content/spell-rules/nb-demonstrative-gender.js',
    '/js/leksihjelp/content/spell-rules/nb-dialect-mix.js',
    '/js/leksihjelp/content/spell-rules/nb-double-definiteness.js',
    '/js/leksihjelp/content/spell-rules/nb-gender.js',
    '/js/leksihjelp/content/spell-rules/nb-homophones.js',
    '/js/leksihjelp/content/spell-rules/nb-modal-verb.js',
    '/js/leksihjelp/content/spell-rules/nb-nn-passiv-s.js',
    '/js/leksihjelp/content/spell-rules/nb-possessive-definite.js',
    '/js/leksihjelp/content/spell-rules/nb-propernoun-guard.js',
    '/js/leksihjelp/content/spell-rules/nb-riksmal-lexical.js',
    '/js/leksihjelp/content/spell-rules/nb-sarskriving.js',
    '/js/leksihjelp/content/spell-rules/nb-sentence-boundary.js',
    '/js/leksihjelp/content/spell-rules/nb-triple-letter.js',
    '/js/leksihjelp/content/spell-rules/nb-typo-curated.js',
    '/js/leksihjelp/content/spell-rules/nb-typo-fuzzy.js',
    '/js/leksihjelp/content/spell-rules/nb-v2.js',
    '/js/leksihjelp/content/spell-rules/nn-plural-leakage.js',
    '/js/leksihjelp/content/spell-rules/nn-verb-leakage.js',
    '/js/leksihjelp/content/spell-rules/quotation-suppression.js',
    '/js/leksihjelp/content/spell-rules/redundancy.js',
    '/js/leksihjelp/content/spell-rules/register.js',
    '/js/leksihjelp/content/spell-rules/universal-agreement.js',
    '/js/leksihjelp/content/spell-rules/universal-context-typo.js',
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
                LEKSIHJELP_ASSETS.map((path) =>
                    cache.add(path).catch((err) => {
                        console.warn('[sw] leksihjelp precache miss:', path, err && err.message);
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
