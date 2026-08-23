import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const workerUrl = new URL('../public/sw.js', import.meta.url);

async function loadWorker({ cacheNames = [], cachedResponse } = {}) {
    const source = await readFile(workerUrl, 'utf8');
    const handlers = new Map();
    const deletedCaches = [];
    const precachedAssets = [];
    let skipWaitingCalls = 0;
    let claimCalls = 0;
    let fetchCalls = 0;

    const cache = {
        async addAll(assets) { precachedAssets.push(...assets); },
        async add() {},
        async put() {},
    };
    const context = {
        self: {
            location: { origin: 'https://skriv.example' },
            addEventListener(type, handler) { handlers.set(type, handler); },
            skipWaiting() { skipWaitingCalls += 1; },
            clients: {
                async claim() { claimCalls += 1; },
            },
        },
        caches: {
            async open() { return cache; },
            async keys() { return cacheNames; },
            async delete(name) { deletedCaches.push(name); return true; },
            async match() { return cachedResponse; },
        },
        console: { warn() {} },
        fetch: async () => {
            fetchCalls += 1;
            return { ok: false };
        },
        URL,
        Promise,
    };

    vm.runInNewContext(source, context, { filename: 'public/sw.js' });
    return {
        handlers,
        deletedCaches,
        precachedAssets,
        get skipWaitingCalls() { return skipWaitingCalls; },
        get claimCalls() { return claimCalls; },
        get fetchCalls() { return fetchCalls; },
    };
}

function dispatchExtendable(handler, extra = {}) {
    let completion = Promise.resolve();
    handler({
        ...extra,
        waitUntil(promise) { completion = Promise.resolve(promise); },
    });
    return completion;
}

test('service worker install waits without forcing activation', async () => {
    const worker = await loadWorker();
    await dispatchExtendable(worker.handlers.get('install'));

    assert.equal(worker.skipWaitingCalls, 0);
    assert.ok(worker.precachedAssets.includes('/css/main.css'));
    assert.ok(worker.precachedAssets.includes('/vendor/tailwindcss-3.4.17.js'));

    worker.handlers.get('message')({ data: { type: 'SKIP_WAITING' } });
    assert.equal(worker.skipWaitingCalls, 1, 'explicit update message activates waiting worker');
});

test('service worker activation deletes only older Skriv caches and claims clients', async () => {
    const worker = await loadWorker({
        cacheNames: [
            'skriv-v75', 'skriv-v76', 'skriv-v77', 'skriv-v78', 'skriv-v79',
            'skriv-v80', 'another-app-cache',
        ],
    });

    await dispatchExtendable(worker.handlers.get('activate'));
    assert.deepEqual(
        worker.deletedCaches,
        ['skriv-v75', 'skriv-v76', 'skriv-v77', 'skriv-v78', 'skriv-v79', 'skriv-v80'],
    );
    assert.equal(worker.claimCalls, 1);
});

test('service worker serves pinned release assets from cache before the network', async () => {
    const cachedResponse = { source: 'skriv-v80' };
    const worker = await loadWorker({ cachedResponse });
    let responsePromise;

    worker.handlers.get('fetch')({
        request: {
            method: 'GET',
            url: 'https://skriv.example/js/app/main.js',
        },
        respondWith(promise) { responsePromise = Promise.resolve(promise); },
        waitUntil() {},
    });

    assert.equal(await responsePromise, cachedResponse);
    assert.equal(worker.fetchCalls, 0);
});

test('service worker never intercepts Microsoft identity or Graph traffic', async () => {
    const worker = await loadWorker({ cachedResponse: { unsafe: true } });
    let responded = false;

    for (const url of [
        'https://login.microsoftonline.com/tenant/oauth2/v2.0/authorize',
        'https://graph.microsoft.com/v1.0/drives/example',
        'https://contoso.sharepoint.com/download/example',
    ]) {
        worker.handlers.get('fetch')({
            request: { method: 'GET', url },
            respondWith() { responded = true; },
            waitUntil() {},
        });
    }

    assert.equal(responded, false);
    assert.equal(worker.fetchCalls, 0);
});

test('MSAL redirect response page and bridge always bypass app caches', async () => {
    const worker = await loadWorker({ cachedResponse: { unsafe: true } });
    await dispatchExtendable(worker.handlers.get('install'));

    for (const path of [
        '/microsoft-auth-redirect.html?auth-response=1',
        '/vendor/msal-redirect-bridge-5.17.3.min.js',
    ]) {
        let responded = false;
        worker.handlers.get('fetch')({
            request: { method: 'GET', url: `https://skriv.example${path}` },
            respondWith() { responded = true; },
            waitUntil() {},
        });
        assert.equal(responded, false, `${path} must stay network-only`);
    }

    assert.equal(
        worker.precachedAssets.includes('/vendor/msal-redirect-bridge-5.17.3.min.js'),
        false,
    );
});
