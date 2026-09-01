/** Browser-only delegated authentication for Microsoft Graph. */

import {
    readMicrosoftConfig,
    validateMicrosoftConfig,
} from './microsoft-config.js';

// Teams channel files live in a group-owned SharePoint site rather than the
// pupil's personal drive. Delegated Files.ReadWrite.All is therefore required
// to reach files the signed-in pupil can already access through Teams.
export const MICROSOFT_GRAPH_SCOPES = Object.freeze(['Files.ReadWrite.All']);
export const MSAL_BROWSER_PATH = '/vendor/msal-browser-5.17.3.min.js';

let msalLoadPromise = null;

export class MicrosoftAuthError extends Error {
    constructor(code, message, cause) {
        super(message, cause ? { cause } : undefined);
        this.name = 'MicrosoftAuthError';
        this.code = code;
    }
}

export function loadMicrosoftAuthenticationLibrary(options = {}) {
    const globalObject = options.globalObject ?? globalThis;
    const documentObject = options.documentObject ?? globalThis.document;
    if (globalObject.msal?.PublicClientApplication) {
        return Promise.resolve(globalObject.msal);
    }
    if (msalLoadPromise) return msalLoadPromise;
    if (!documentObject?.createElement || !documentObject?.head) {
        return Promise.reject(new MicrosoftAuthError(
            'msal-load-failed',
            'Microsoft authentication requires a browser document.',
        ));
    }

    msalLoadPromise = new Promise((resolve, reject) => {
        let activeScript = null;
        const finish = () => {
            if (globalObject.msal?.PublicClientApplication) {
                resolve(globalObject.msal);
            } else {
                activeScript?.remove?.();
                msalLoadPromise = null;
                reject(new MicrosoftAuthError(
                    'msal-load-failed',
                    'The Microsoft authentication library did not initialise.',
                ));
            }
        };
        const fail = () => {
            activeScript?.remove?.();
            msalLoadPromise = null;
            reject(new MicrosoftAuthError(
                'msal-load-failed',
                'The Microsoft authentication library could not be loaded.',
            ));
        };

        const existing = documentObject.querySelector?.('script[data-skriv-msal]');
        if (existing) {
            activeScript = existing;
            existing.addEventListener('load', finish, { once: true });
            existing.addEventListener('error', fail, { once: true });
            return;
        }

        const script = documentObject.createElement('script');
        activeScript = script;
        script.src = MSAL_BROWSER_PATH;
        script.async = true;
        script.dataset.skrivMsal = 'true';
        script.addEventListener('load', finish, { once: true });
        script.addEventListener('error', fail, { once: true });
        documentObject.head.appendChild(script);
    });

    return msalLoadPromise;
}

function assertConfig(config) {
    const validated = validateMicrosoftConfig(config);
    if (!validated.valid) {
        throw new MicrosoftAuthError(
            'not-configured',
            'Microsoft connection is not configured with valid client and tenant IDs.',
        );
    }
    let redirect;
    try {
        redirect = new URL(String(config?.redirectUri || ''));
    } catch {
        redirect = null;
    }
    const redirectIsLocal = ['localhost', '127.0.0.1', '[::1]'].includes(
        redirect?.hostname?.toLowerCase?.(),
    );
    const currentOrigin = String(globalThis.location?.origin || '');
    if (!redirect
        || (redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && redirectIsLocal))
        || redirect.username
        || redirect.password
        || redirect.pathname !== '/microsoft-auth-redirect.html'
        || redirect.search
        || redirect.hash
        || (currentOrigin && currentOrigin !== 'null' && redirect.origin !== currentOrigin)) {
        throw new MicrosoftAuthError(
            'invalid-redirect-uri',
            'Microsoft authentication requires the dedicated same-origin redirect page.',
        );
    }
    return { ...validated, redirectUri: redirect.href };
}

export function createMicrosoftAuth(options = {}) {
    const config = options.config || readMicrosoftConfig();
    const loadMsal = options.loadMsal || loadMicrosoftAuthenticationLibrary;
    let clientPromise = null;
    let currentAccount = null;

    function getUnambiguousCachedAccount(client) {
        const activeAccount = client.getActiveAccount?.() || null;
        if (activeAccount) return activeAccount;
        const accounts = client.getAllAccounts?.() || [];
        return accounts.length === 1 ? accounts[0] : null;
    }

    async function getClient() {
        if (clientPromise) return clientPromise;

        clientPromise = (async () => {
            const validated = assertConfig(config);
            const msal = await loadMsal();
            if (!msal?.PublicClientApplication) {
                throw new MicrosoftAuthError(
                    'msal-load-failed',
                    'The Microsoft authentication library is unavailable.',
                );
            }

            const client = new msal.PublicClientApplication({
                auth: {
                    clientId: validated.clientId,
                    authority: `https://login.microsoftonline.com/${validated.tenantId}`,
                    redirectUri: validated.redirectUri,
                },
                cache: {
                    cacheLocation: 'sessionStorage',
                },
            });
            await client.initialize?.();

            currentAccount = getUnambiguousCachedAccount(client);
            if (currentAccount) client.setActiveAccount?.(currentAccount);
            return client;
        })().catch((error) => {
            clientPromise = null;
            if (error instanceof MicrosoftAuthError) throw error;
            throw new MicrosoftAuthError(
                'initialization-failed',
                error?.message || 'Microsoft authentication could not be initialised.',
                error,
            );
        });

        return clientPromise;
    }

    async function connect() {
        const client = await getClient();
        try {
            const result = await client.loginPopup({
                scopes: [...MICROSOFT_GRAPH_SCOPES],
                prompt: 'select_account',
            });
            currentAccount = result?.account || null;
            if (!currentAccount) {
                throw new MicrosoftAuthError(
                    'account-missing',
                    'Microsoft sign-in did not return an account.',
                );
            }
            client.setActiveAccount?.(currentAccount);
            return currentAccount;
        } catch (error) {
            if (error instanceof MicrosoftAuthError) throw error;
            throw new MicrosoftAuthError(
                'sign-in-failed',
                error?.message || 'Microsoft sign-in failed.',
                error,
            );
        }
    }

    async function getAccount() {
        const client = await getClient();
        currentAccount = client.getActiveAccount?.() || currentAccount ||
            getUnambiguousCachedAccount(client);
        return currentAccount;
    }

    async function isConnected() {
        return Boolean(await getAccount());
    }

    async function getAccessToken({ allowPopup = true } = {}) {
        const client = await getClient();
        const account = await getAccount();
        if (!account) {
            if (!allowPopup) {
                throw new MicrosoftAuthError('not-connected', 'No Microsoft account is connected.');
            }
            await connect();
        }

        const request = {
            scopes: [...MICROSOFT_GRAPH_SCOPES],
            account: currentAccount,
        };
        try {
            const result = await client.acquireTokenSilent(request);
            if (!result?.accessToken) throw new Error('No access token was returned.');
            return result.accessToken;
        } catch (silentError) {
            if (!allowPopup) {
                throw new MicrosoftAuthError(
                    'token-unavailable',
                    silentError?.message || 'A Microsoft access token is unavailable.',
                    silentError,
                );
            }
            try {
                const result = await client.acquireTokenPopup({
                    ...request,
                    prompt: 'select_account',
                });
                currentAccount = result?.account || currentAccount;
                if (currentAccount) client.setActiveAccount?.(currentAccount);
                if (!result?.accessToken) throw new Error('No access token was returned.');
                return result.accessToken;
            } catch (popupError) {
                throw new MicrosoftAuthError(
                    'token-unavailable',
                    popupError?.message || 'A Microsoft access token could not be acquired.',
                    popupError,
                );
            }
        }
    }

    async function disconnect() {
        const client = await getClient();
        // Clear this app's complete cache so an arbitrary second pupil account
        // cannot be adopted after disconnect on a shared device.
        await client.clearCache();
        client.setActiveAccount?.(null);
        currentAccount = null;
    }

    return {
        initialize: getClient,
        connect,
        getAccessToken,
        getAccount,
        isConnected,
        disconnect,
    };
}
