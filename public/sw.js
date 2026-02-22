/**
 * Service Worker for Papertek Skriv.
 * Caches static assets for offline use.
 */

const CACHE_NAME = 'skriv-v13';
const ASSETS = [
    '/',
    '/index.html',
    '/whitepaper.html',
    '/manifest.json',
    '/js/app/main.js',
    '/js/app/standalone-writer.js',
    '/js/app/document-store.js',
    '/js/app/document-list.js',
    '/js/app/trash-store.js',
    '/js/editor-core/config.js',
    '/js/editor-core/shared/i18n.js',
    '/js/editor-core/shared/in-page-modal.js',
    '/js/editor-core/shared/toast-notification.js',
    '/js/editor-core/shared/word-counter.js',
    '/js/editor-core/shared/html-escape.js',
    '/js/editor-core/shared/dom-helpers.js',
    '/js/editor-core/shared/frame-elements.js',
    '/js/editor-core/shared/auto-save.js',
    '/js/editor-core/student/editor-toolbar.js',
    '/js/editor-core/student/text-export.js',
    '/js/editor-core/student/toc-manager.js',
    '/js/editor-core/student/reference-manager.js',
    '/js/editor-core/student/special-chars-panel.js',
    '/js/editor-core/student/frame-parser.js',
    '/js/editor-core/student/frame-manager.js',
    '/js/editor-core/student/frame-selector.js',
    '/js/editor-core/student/writing-spinner.js',
    '/js/editor-core/student/word-frequency.js',
    '/js/editor-core/student/spinner-data-nb.js',
    '/js/editor-core/student/spinner-data-nn.js',
    '/js/editor-core/student/sentence-length.js',
    '/js/editor-core/student/paragraph-map.js',
    '/js/editor-core/student/image-manager.js',
    '/js/editor-core/student/submission-checklist.js',
    '/js/editor-core/locales/nb.js',
    '/js/editor-core/locales/nn.js',
    '/js/editor-core/locales/en.js',
    // Bokmål frames
    '/frames/nb/droefting.md',
    '/frames/nb/analyse.md',
    '/frames/nb/kronikk.md',
    // Nynorsk frames
    '/frames/nn/droefting.md',
    '/frames/nn/analyse.md',
    '/frames/nn/kronikk.md',
    // Legacy paths (backward compatibility)
    '/frames/droefting.md',
    '/frames/analyse.md',
    '/frames/kronikk.md',
];

// Install: cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
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
