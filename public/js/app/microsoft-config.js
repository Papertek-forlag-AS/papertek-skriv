/**
 * Public Microsoft Entra configuration for the optional Teams/SharePoint sync.
 *
 * Client and tenant IDs identify an application; they are not credentials.
 * The SharePoint host is a public school boundary for accepted folder URLs.
 * Production reads all three values from same-origin HTML metadata. Local
 * development may temporarily override them for the current tab.
 */

export const MICROSOFT_CONFIG_META_NAMES = Object.freeze({
    clientId: 'skriv:microsoft-client-id',
    tenantId: 'skriv:microsoft-tenant-id',
    sharePointHost: 'skriv:microsoft-sharepoint-host',
});

export const MICROSOFT_SESSION_OVERRIDE_KEYS = Object.freeze({
    clientId: 'skriv.microsoft.clientId',
    tenantId: 'skriv.microsoft.tenantId',
    sharePointHost: 'skriv.microsoft.sharePointHost',
});

const GUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ZERO_GUID = '00000000-0000-0000-0000-000000000000';
const SHAREPOINT_HOST_SUFFIX = '.sharepoint.com';
const SHAREPOINT_TENANT_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export class MicrosoftConfigError extends Error {
    constructor(code, message) {
        super(message);
        this.name = 'MicrosoftConfigError';
        this.code = code;
    }
}

export function isMicrosoftGuid(value) {
    const candidate = String(value || '').trim();
    return GUID_PATTERN.test(candidate) && candidate.toLowerCase() !== ZERO_GUID;
}

/**
 * Normalize a bare Microsoft 365 global-cloud SharePoint host.
 * Schemes, paths, ports, wildcards, and the derived `-my` host are rejected.
 */
export function normalizeMicrosoftSharePointHost(value) {
    const candidate = String(value || '').trim().toLowerCase();
    if (!candidate.endsWith(SHAREPOINT_HOST_SUFFIX)) return '';

    const tenant = candidate.slice(0, -SHAREPOINT_HOST_SUFFIX.length);
    if (!SHAREPOINT_TENANT_PATTERN.test(tenant) || tenant.endsWith('-my')) return '';
    return `${tenant}${SHAREPOINT_HOST_SUFFIX}`;
}

/**
 * Check a canonical or sharing URL against the configured school tenant.
 * Personal OneDrive uses the matching `<tenant>-my.sharepoint.com` companion.
 */
export function isMicrosoftSharePointUrlAllowed(value, configuredHost) {
    const sharePointHost = normalizeMicrosoftSharePointHost(configuredHost);
    if (!sharePointHost) return false;

    try {
        const url = new URL(String(value || ''));
        const tenant = sharePointHost.slice(0, -SHAREPOINT_HOST_SUFFIX.length);
        const personalHost = `${tenant}-my${SHAREPOINT_HOST_SUFFIX}`;
        return url.protocol === 'https:' &&
            !url.username &&
            !url.password &&
            !url.port &&
            (url.hostname.toLowerCase() === sharePointHost ||
                url.hostname.toLowerCase() === personalHost);
    } catch {
        return false;
    }
}

export function validateMicrosoftConfig(config = {}) {
    const clientId = String(config.clientId || '').trim();
    const tenantId = String(config.tenantId || '').trim();
    const sharePointHostInput = String(config.sharePointHost || '').trim().toLowerCase();
    const sharePointHost = normalizeMicrosoftSharePointHost(sharePointHostInput);
    const errors = [];

    if (!isMicrosoftGuid(clientId)) errors.push('invalid-client-id');
    if (!isMicrosoftGuid(tenantId)) errors.push('invalid-tenant-id');
    if (!sharePointHost) errors.push('invalid-sharepoint-host');

    return {
        valid: errors.length === 0,
        errors,
        clientId,
        tenantId,
        sharePointHost: sharePointHost || sharePointHostInput,
    };
}

export function isMicrosoftConfigValid(config) {
    return validateMicrosoftConfig(config).valid;
}

export function isMicrosoftLocalhost(locationObject = globalThis.location) {
    const hostname = String(locationObject?.hostname || '').toLowerCase();
    return hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1' ||
        hostname === '[::1]';
}

function readMeta(documentObject, name) {
    try {
        return documentObject
            ?.querySelector?.(`meta[name="${name}"]`)
            ?.getAttribute?.('content')
            ?.trim?.() || '';
    } catch {
        return '';
    }
}

function readSessionOverride(storage, key) {
    try {
        return storage?.getItem?.(key)?.trim?.() || '';
    } catch {
        return '';
    }
}

function getSessionStorage() {
    try {
        return globalThis.sessionStorage;
    } catch {
        return undefined;
    }
}

function getRedirectUri(locationObject) {
    const origin = String(locationObject?.origin || '').trim();
    if (!origin || origin === 'null') return '';
    return `${origin.replace(/\/$/, '')}/microsoft-auth-redirect.html`;
}

export function readMicrosoftConfig(options = {}) {
    const documentObject = options.documentObject ?? globalThis.document;
    const locationObject = options.locationObject ?? globalThis.location;
    const storage = options.sessionStorageObject ?? getSessionStorage();

    const metaConfig = {
        clientId: readMeta(documentObject, MICROSOFT_CONFIG_META_NAMES.clientId),
        tenantId: readMeta(documentObject, MICROSOFT_CONFIG_META_NAMES.tenantId),
        sharePointHost: readMeta(documentObject, MICROSOFT_CONFIG_META_NAMES.sharePointHost),
    };

    const local = isMicrosoftLocalhost(locationObject);
    const clientOverride = local
        ? readSessionOverride(storage, MICROSOFT_SESSION_OVERRIDE_KEYS.clientId)
        : '';
    const tenantOverride = local
        ? readSessionOverride(storage, MICROSOFT_SESSION_OVERRIDE_KEYS.tenantId)
        : '';
    const sharePointHostOverride = local
        ? readSessionOverride(storage, MICROSOFT_SESSION_OVERRIDE_KEYS.sharePointHost)
        : '';
    const validated = validateMicrosoftConfig({
        clientId: clientOverride || metaConfig.clientId,
        tenantId: tenantOverride || metaConfig.tenantId,
        sharePointHost: sharePointHostOverride || metaConfig.sharePointHost,
    });

    return {
        clientId: validated.clientId,
        tenantId: validated.tenantId,
        sharePointHost: validated.sharePointHost,
        authority: validated.valid
            ? `https://login.microsoftonline.com/${validated.tenantId}`
            : '',
        redirectUri: getRedirectUri(locationObject),
        valid: validated.valid,
        configured: validated.valid,
        errors: validated.errors,
        source: clientOverride || tenantOverride || sharePointHostOverride
            ? 'localhost-session'
            : 'meta',
    };
}

export const getMicrosoftConfig = readMicrosoftConfig;

export function setMicrosoftConfigOverrides(config, options = {}) {
    const locationObject = options.locationObject ?? globalThis.location;
    const storage = options.sessionStorageObject ?? getSessionStorage();
    if (!isMicrosoftLocalhost(locationObject)) {
        throw new MicrosoftConfigError(
            'localhost-only',
            'Microsoft configuration overrides are only available on localhost.',
        );
    }

    const validated = validateMicrosoftConfig(config);
    if (!validated.valid) {
        throw new MicrosoftConfigError(
            validated.errors[0],
            'Microsoft client ID, tenant ID, and SharePoint host must be valid.',
        );
    }

    try {
        storage.setItem(MICROSOFT_SESSION_OVERRIDE_KEYS.clientId, validated.clientId);
        storage.setItem(MICROSOFT_SESSION_OVERRIDE_KEYS.tenantId, validated.tenantId);
        storage.setItem(
            MICROSOFT_SESSION_OVERRIDE_KEYS.sharePointHost,
            validated.sharePointHost,
        );
    } catch (error) {
        throw new MicrosoftConfigError(
            'storage-unavailable',
            error?.message || 'The local Microsoft configuration could not be stored.',
        );
    }

    return readMicrosoftConfig({
        ...options,
        locationObject,
        sessionStorageObject: storage,
    });
}

export function clearMicrosoftConfigOverrides(options = {}) {
    const locationObject = options.locationObject ?? globalThis.location;
    const storage = options.sessionStorageObject ?? getSessionStorage();
    if (!isMicrosoftLocalhost(locationObject)) return false;

    try {
        storage.removeItem(MICROSOFT_SESSION_OVERRIDE_KEYS.clientId);
        storage.removeItem(MICROSOFT_SESSION_OVERRIDE_KEYS.tenantId);
        storage.removeItem(MICROSOFT_SESSION_OVERRIDE_KEYS.sharePointHost);
        return true;
    } catch {
        return false;
    }
}
