/**
 * Service Worker for Papertek Skriv.
 * Caches static assets for offline use.
 */

const CACHE_NAME = 'skriv-v5';
const ASSETS = [
    '/',
    '/index.html',
    '/whitepaper.html',
    '/manifest.json',
    '/js/app/main.js',
    '/js/app/standalone-writer.js',
    '/js/app/document-store.js',
    '/js/app/document-list.js',
    '/js/editor-core/config.js',
    '/js/editor-core/shared/i18n.js',
    '/js/editor-core/shared/in-page-modal.js',
    '/js/editor-core/shared/toast-notification.js',
    '/js/editor-core/shared/word-counter.js',
    '/js/editor-core/student/editor-toolbar.js',
    '/js/editor-core/student/text-export.js',
    '/js/editor-core/student/toc-manager.js',
    '/js/editor-core/student/reference-manager.js',
    '/js/editor-core/student/frame-parser.js',
    '/js/editor-core/student/frame-manager.js',
    '/js/editor-core/student/frame-selector.js',
    '/js/editor-core/locales/nb.js',
    '/js/editor-core/locales/en.js',
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
