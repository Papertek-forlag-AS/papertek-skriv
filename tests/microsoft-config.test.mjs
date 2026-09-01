import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    MICROSOFT_CONFIG_META_NAMES,
    MICROSOFT_SESSION_OVERRIDE_KEYS,
    MicrosoftConfigError,
    clearMicrosoftConfigOverrides,
    isMicrosoftConfigValid,
    isMicrosoftGuid,
    isMicrosoftSharePointUrlAllowed,
    normalizeMicrosoftSharePointHost,
    readMicrosoftConfig,
    setMicrosoftConfigOverrides,
    validateMicrosoftConfig,
} from '../public/js/app/microsoft-config.js';
import {
    MICROSOFT_GRAPH_SCOPES,
    createMicrosoftAuth,
    loadMicrosoftAuthenticationLibrary,
} from '../public/js/app/microsoft-auth.js';

const CLIENT_ID = '11111111-2222-3333-4444-555555555555';
const TENANT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const SHAREPOINT_HOST = 'school.sharepoint.com';

function createDocumentMeta(values) {
    return {
        querySelector(selector) {
            const name = selector.match(/^meta\[name="(.+)"\]$/)?.[1];
            if (!name || !(name in values)) return null;
            return {
                getAttribute(attribute) {
                    return attribute === 'content' ? values[name] : null;
                },
            };
        },
    };
}

function createSessionStorage(initial = {}) {
    const values = new Map(Object.entries(initial));
    return {
        getItem(key) { return values.has(key) ? values.get(key) : null; },
        setItem(key, value) { values.set(key, String(value)); },
        removeItem(key) { values.delete(key); },
        entries() { return Object.fromEntries(values); },
    };
}

test('Microsoft IDs and school SharePoint host are all required', () => {
    assert.equal(isMicrosoftGuid(CLIENT_ID), true);
    assert.equal(isMicrosoftGuid('not-a-guid'), false);
    assert.equal(isMicrosoftGuid('00000000-0000-0000-0000-000000000000'), false);
    assert.equal(isMicrosoftConfigValid({
        clientId: CLIENT_ID,
        tenantId: TENANT_ID,
        sharePointHost: SHAREPOINT_HOST,
    }), true);
    assert.equal(isMicrosoftConfigValid({ clientId: CLIENT_ID, tenantId: TENANT_ID }), false);
    assert.deepEqual(
        validateMicrosoftConfig({ clientId: 'bad', tenantId: '' }).errors,
        ['invalid-client-id', 'invalid-tenant-id', 'invalid-sharepoint-host'],
    );
});

test('SharePoint host normalization and URL boundary allow only the school pair', () => {
    assert.equal(normalizeMicrosoftSharePointHost(' School.SharePoint.com '), SHAREPOINT_HOST);
    assert.equal(normalizeMicrosoftSharePointHost('https://school.sharepoint.com'), '');
    assert.equal(normalizeMicrosoftSharePointHost('school.sharepoint.com/sites/class'), '');
    assert.equal(normalizeMicrosoftSharePointHost('school-my.sharepoint.com'), '');
    assert.equal(normalizeMicrosoftSharePointHost('school.sharepoint.de'), '');

    assert.equal(
        isMicrosoftSharePointUrlAllowed('https://school.sharepoint.com/sites/class', SHAREPOINT_HOST),
        true,
    );
    assert.equal(
        isMicrosoftSharePointUrlAllowed('https://school-my.sharepoint.com/personal/student', SHAREPOINT_HOST),
        true,
    );
    assert.equal(
        isMicrosoftSharePointUrlAllowed('https://other.sharepoint.com/sites/class', SHAREPOINT_HOST),
        false,
    );
    assert.equal(
        isMicrosoftSharePointUrlAllowed('https://school.sharepoint.com.evil.example/folder', SHAREPOINT_HOST),
        false,
    );
    assert.equal(
        isMicrosoftSharePointUrlAllowed('http://school.sharepoint.com/folder', SHAREPOINT_HOST),
        false,
    );
});

test('production configuration comes from the three public meta tags', () => {
    const documentObject = createDocumentMeta({
        [MICROSOFT_CONFIG_META_NAMES.clientId]: CLIENT_ID,
        [MICROSOFT_CONFIG_META_NAMES.tenantId]: TENANT_ID,
        [MICROSOFT_CONFIG_META_NAMES.sharePointHost]: 'School.SharePoint.com',
    });
    const config = readMicrosoftConfig({
        documentObject,
        locationObject: { hostname: 'skriv.papertek.no', origin: 'https://skriv.papertek.no' },
        sessionStorageObject: createSessionStorage({
            [MICROSOFT_SESSION_OVERRIDE_KEYS.clientId]: TENANT_ID,
            [MICROSOFT_SESSION_OVERRIDE_KEYS.tenantId]: CLIENT_ID,
            [MICROSOFT_SESSION_OVERRIDE_KEYS.sharePointHost]: 'other.sharepoint.com',
        }),
    });

    assert.equal(config.clientId, CLIENT_ID);
    assert.equal(config.tenantId, TENANT_ID);
    assert.equal(config.sharePointHost, SHAREPOINT_HOST);
    assert.equal(config.authority, `https://login.microsoftonline.com/${TENANT_ID}`);
    assert.equal(
        config.redirectUri,
        'https://skriv.papertek.no/microsoft-auth-redirect.html',
    );
    assert.equal(config.source, 'meta');
    assert.equal(config.valid, true);
});

test('session overrides are accepted only on localhost and are easy to clear', () => {
    const storage = createSessionStorage();
    const locationObject = { hostname: '127.0.0.1', origin: 'http://127.0.0.1:4173' };
    const documentObject = createDocumentMeta({});

    const config = setMicrosoftConfigOverrides(
        { clientId: CLIENT_ID, tenantId: TENANT_ID, sharePointHost: SHAREPOINT_HOST },
        { documentObject, locationObject, sessionStorageObject: storage },
    );
    assert.equal(config.source, 'localhost-session');
    assert.equal(config.clientId, CLIENT_ID);
    assert.equal(config.tenantId, TENANT_ID);
    assert.equal(config.sharePointHost, SHAREPOINT_HOST);
    assert.equal(
        config.redirectUri,
        'http://127.0.0.1:4173/microsoft-auth-redirect.html',
    );
    assert.deepEqual(storage.entries(), {
        [MICROSOFT_SESSION_OVERRIDE_KEYS.clientId]: CLIENT_ID,
        [MICROSOFT_SESSION_OVERRIDE_KEYS.tenantId]: TENANT_ID,
        [MICROSOFT_SESSION_OVERRIDE_KEYS.sharePointHost]: SHAREPOINT_HOST,
    });

    assert.equal(clearMicrosoftConfigOverrides({ locationObject, sessionStorageObject: storage }), true);
    assert.deepEqual(storage.entries(), {});

    assert.throws(
        () => setMicrosoftConfigOverrides(
            {
                clientId: CLIENT_ID,
                tenantId: TENANT_ID,
                sharePointHost: 'https://school.sharepoint.com/sites/class',
            },
            { documentObject, locationObject, sessionStorageObject: storage },
        ),
        (error) => error instanceof MicrosoftConfigError &&
            error.code === 'invalid-sharepoint-host',
    );

    assert.throws(
        () => setMicrosoftConfigOverrides(
            { clientId: CLIENT_ID, tenantId: TENANT_ID, sharePointHost: SHAREPOINT_HOST },
            {
                locationObject: { hostname: 'skriv.papertek.no' },
                sessionStorageObject: storage,
            },
        ),
        (error) => error instanceof MicrosoftConfigError && error.code === 'localhost-only',
    );
});

test('Microsoft auth uses the Teams-capable delegated scope, session cache, account picker, and clearCache', async () => {
    const calls = [];
    const account = { homeAccountId: 'student.tenant', username: 'student@example.no' };
    let instance;

    class PublicClientApplication {
        constructor(config) {
            this.config = config;
            this.activeAccount = null;
            instance = this;
        }
        async initialize() { calls.push(['initialize']); }
        getActiveAccount() { return this.activeAccount; }
        getAllAccounts() { return []; }
        setActiveAccount(value) { this.activeAccount = value; }
        async loginPopup(request) {
            calls.push(['loginPopup', request]);
            return { account };
        }
        async acquireTokenSilent(request) {
            calls.push(['acquireTokenSilent', request]);
            return { accessToken: 'delegated-token', account };
        }
        async clearCache(request) { calls.push(['clearCache', request]); }
    }

    const auth = createMicrosoftAuth({
        config: {
            clientId: CLIENT_ID,
            tenantId: TENANT_ID,
            sharePointHost: SHAREPOINT_HOST,
            redirectUri: 'http://127.0.0.1:4173/microsoft-auth-redirect.html',
        },
        loadMsal: async () => ({ PublicClientApplication }),
    });

    assert.deepEqual(MICROSOFT_GRAPH_SCOPES, ['Files.ReadWrite.All']);
    assert.equal(await auth.isConnected(), false);
    assert.equal(await auth.connect(), account);
    assert.equal(await auth.isConnected(), true);
    assert.equal(await auth.getAccessToken(), 'delegated-token');
    await auth.disconnect();
    assert.equal(await auth.isConnected(), false);

    assert.equal(instance.config.cache.cacheLocation, 'sessionStorage');
    assert.deepEqual(calls.find(([name]) => name === 'loginPopup')[1], {
        scopes: ['Files.ReadWrite.All'],
        prompt: 'select_account',
    });
    assert.equal(calls.find(([name]) => name === 'clearCache')[1], undefined);
});

test('multiple cached pupils require selection and disconnect clears the whole app cache', async () => {
    const accounts = [
        { homeAccountId: 'pupil-a', tenantId: TENANT_ID },
        { homeAccountId: 'pupil-b', tenantId: TENANT_ID },
    ];
    let clearArgument = 'not-called';

    class PublicClientApplication {
        constructor() { this.activeAccount = null; }
        async initialize() {}
        getActiveAccount() { return this.activeAccount; }
        getAllAccounts() { return [...accounts]; }
        setActiveAccount(account) { this.activeAccount = account; }
        async clearCache(argument) {
            clearArgument = argument;
            accounts.splice(0);
        }
    }

    const auth = createMicrosoftAuth({
        config: {
            clientId: CLIENT_ID,
            tenantId: TENANT_ID,
            sharePointHost: SHAREPOINT_HOST,
            redirectUri: 'http://localhost:4173/microsoft-auth-redirect.html',
        },
        loadMsal: async () => ({ PublicClientApplication }),
    });

    assert.equal(await auth.getAccount(), null, 'cached-account order is never a pupil selector');
    await auth.disconnect();
    assert.equal(clearArgument, undefined);
    assert.equal(accounts.length, 0);
    assert.equal(await auth.getAccount(), null);
});

test('auth refuses an app-root or cross-purpose redirect fallback', async () => {
    const auth = createMicrosoftAuth({
        config: {
            clientId: CLIENT_ID,
            tenantId: TENANT_ID,
            sharePointHost: SHAREPOINT_HOST,
            redirectUri: 'http://localhost:4173/',
        },
        loadMsal: async () => {
            throw new Error('MSAL must not load for invalid configuration');
        },
    });

    await assert.rejects(
        auth.initialize(),
        (error) => error.code === 'invalid-redirect-uri',
    );
});

test('auth source lazy-loads pinned MSAL and contains no site scope or browser credential', async () => {
    const source = await readFile(
        new URL('../public/js/app/microsoft-auth.js', import.meta.url),
        'utf8',
    );

    assert.match(source, /\/vendor\/msal-browser-5\.17\.3\.min\.js/);
    assert.match(source, /cacheLocation: 'sessionStorage'/);
    assert.match(source, /prompt: 'select_account'/);
    assert.match(source, /clearCache\(/);
    assert.match(source, /Files\.ReadWrite\.All/);
    assert.doesNotMatch(source, /Sites\.ReadWrite\.All/);
    assert.doesNotMatch(source, /clientSecret|client_secret/);
});

test('a failed MSAL script is removed so a later load can retry', async () => {
    const nodes = [];
    const globalObject = {};
    const documentObject = {
        head: {
            appendChild(node) { nodes.push(node); },
        },
        createElement() {
            const listeners = new Map();
            return {
                dataset: {},
                removed: false,
                addEventListener(type, listener) { listeners.set(type, listener); },
                remove() { this.removed = true; },
                dispatch(type) { listeners.get(type)?.(); },
            };
        },
        querySelector() {
            return nodes.find((node) => !node.removed) || null;
        },
    };

    const failed = loadMicrosoftAuthenticationLibrary({ globalObject, documentObject });
    nodes[0].dispatch('error');
    await assert.rejects(failed, (error) => error.code === 'msal-load-failed');
    assert.equal(nodes[0].removed, true);

    const retried = loadMicrosoftAuthenticationLibrary({ globalObject, documentObject });
    assert.equal(nodes.length, 2);
    globalObject.msal = { PublicClientApplication: class PublicClientApplication {} };
    nodes[1].dispatch('load');
    assert.equal(await retried, globalObject.msal);
});
