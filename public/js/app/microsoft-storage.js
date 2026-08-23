/**
 * Local-first orchestration for the optional Microsoft 365 document store.
 *
 * IndexedDB remains authoritative. This module only mirrors one document at a
 * time to an explicitly selected Teams/SharePoint/OneDrive folder, and remote
 * failures are recorded as metadata without rolling back local writing.
 */

import {
    isMicrosoftSharePointUrlAllowed,
    readMicrosoftConfig,
} from './microsoft-config.js';
import { createMicrosoftAuth } from './microsoft-auth.js';
import { createMicrosoftGraphClient } from './microsoft-graph.js';
import {
    createMicrosoftDocumentFileName,
    hashMicrosoftDocument,
    isMicrosoftDocumentFile,
    parseMicrosoftDocument,
    serializeMicrosoftDocument,
} from './microsoft-document-codec.js';
import {
    createDocument,
    getDocument,
    listDocuments,
    saveDocument,
} from './document-store.js';
import { getAllFolders } from './folder-store.js';
import { listTrashedDocuments } from './trash-store.js';

export const MICROSOFT_TARGET_SESSION_KEY = 'skriv.microsoft.target.v1';

const LINK_VERSION = 1;
const TARGET_VERSION = 1;
const DEFAULT_SYNC_DEBOUNCE_MS = 2500;
const TARGET_KEYS = Object.freeze([
    'version',
    'tenantId',
    'driveId',
    'folderId',
    'folderName',
    'folderWebUrl',
]);

export class MicrosoftStorageError extends Error {
    constructor(code, message, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.name = 'MicrosoftStorageError';
        this.code = code;
        this.state = options.state || 'error';
    }
}

function defaultSessionStorage() {
    try {
        return globalThis.sessionStorage;
    } catch {
        return null;
    }
}

function clone(value) {
    if (value === null || value === undefined) return value;
    return JSON.parse(JSON.stringify(value));
}

function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function sameValue(left, right) {
    return cleanString(left).toLowerCase() === cleanString(right).toLowerCase();
}

function isHttpsUrl(value) {
    try {
        const url = new URL(cleanString(value));
        return url.protocol === 'https:' && !url.username && !url.password && !url.port;
    } catch {
        return false;
    }
}

function isTarget(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    if (value.version !== TARGET_VERSION) return false;
    const keys = Object.keys(value).sort();
    const expectedKeys = [...TARGET_KEYS].sort();
    if (keys.length !== expectedKeys.length
        || keys.some((key, index) => key !== expectedKeys[index])) return false;
    return ['tenantId', 'driveId', 'folderId', 'folderName']
        .every((key) => typeof value[key] === 'string' && value[key].trim())
        && isHttpsUrl(value.folderWebUrl);
}

function isLink(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value)
        && value.version === LINK_VERSION
        && cleanString(value.tenantId)
        && cleanString(value.accountBinding)
        && cleanString(value.driveId)
        && cleanString(value.folderId));
}

function sanitiseLink(value) {
    if (!isLink(value)) return null;
    return {
        version: LINK_VERSION,
        tenantId: cleanString(value.tenantId),
        accountBinding: cleanString(value.accountBinding),
        driveId: cleanString(value.driveId),
        folderId: cleanString(value.folderId),
        folderName: cleanString(value.folderName),
        folderWebUrl: isHttpsUrl(value.folderWebUrl) ? cleanString(value.folderWebUrl) : null,
        remoteDocumentId: cleanString(value.remoteDocumentId) || null,
        itemId: cleanString(value.itemId) || null,
        fileName: cleanString(value.fileName) || null,
        webUrl: isHttpsUrl(value.webUrl) ? cleanString(value.webUrl) : null,
        eTag: cleanString(value.eTag) || null,
        cTag: cleanString(value.cTag) || null,
        lastSyncedAt: cleanString(value.lastSyncedAt) || null,
        lastSyncedHash: cleanString(value.lastSyncedHash) || null,
        state: cleanString(value.state) || 'pending',
        errorCode: cleanString(value.errorCode) || null,
        attemptId: cleanString(value.attemptId) || null,
    };
}

function normaliseNow(now) {
    const value = typeof now === 'function' ? now() : new Date();
    const date = value instanceof Date ? value : new Date(value);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function resultFor(documentRecord, link, state = link?.state || 'local-only', extra = {}) {
    return {
        state,
        linked: isLink(link),
        document: documentRecord || null,
        link: isLink(link) ? clone(link) : null,
        ...extra,
    };
}

function targetMatchesLink(target, link) {
    return Boolean(target && link
        && sameValue(target.tenantId, link.tenantId)
        && target.driveId === link.driveId
        && target.folderId === link.folderId);
}

function accountMatchesTenant(account, tenantId) {
    return Boolean(account?.homeAccountId
        && cleanString(account.tenantId)
        && sameValue(account.tenantId, tenantId));
}

function classifyError(error) {
    const status = Number(error?.status || 0);
    const code = cleanString(error?.code) || `http-${status || 0}`;
    const kind = cleanString(error?.kind);

    if (status === 412 || kind === 'conflict') return { state: 'conflict', code };
    if (status === 401 || kind === 'unauthenticated'
        || ['not-connected', 'token-unavailable', 'sign-in-failed'].includes(code)) {
        return { state: 'needs-sign-in', code };
    }
    if (status === 403 || kind === 'forbidden') return { state: 'permission-denied', code };
    if (status === 404 || kind === 'not-found') return { state: 'remote-missing', code };
    if (kind === 'network' || status === 429 || status >= 500) return { state: 'error', code };
    return { state: 'error', code: code === 'http-0' ? 'sync-failed' : code };
}

function remoteMetadata(item, previous = {}) {
    return {
        itemId: cleanString(item?.id) || previous.itemId || null,
        fileName: cleanString(item?.name) || previous.fileName || null,
        webUrl: cleanString(item?.webUrl) || previous.webUrl || null,
        eTag: cleanString(item?.eTag) || previous.eTag || null,
        cTag: cleanString(item?.cTag) || previous.cTag || null,
    };
}

/**
 * Create a Microsoft storage controller. Every dependency can be replaced for
 * deterministic unit tests; production defaults use the real local stores,
 * MSAL authentication, Graph client, and native `.skriv` codec.
 */
export function createMicrosoftStorage(options = {}) {
    const dependencies = options.dependencies || options;
    const config = options.config || (dependencies.readMicrosoftConfig || readMicrosoftConfig)(
        options.configOptions,
    );
    const auth = options.auth || (dependencies.createMicrosoftAuth || createMicrosoftAuth)({ config });
    const graph = options.graph || (dependencies.createMicrosoftGraphClient || createMicrosoftGraphClient)({
        // Background sync must never open a sign-in popup. The explicit
        // connect() action handles interaction before Graph work begins.
        getAccessToken: () => auth.getAccessToken({ allowPopup: false }),
    });
    const getDocumentImpl = dependencies.getDocument || getDocument;
    const saveDocumentImpl = dependencies.saveDocument || saveDocument;
    const createDocumentImpl = dependencies.createDocument || createDocument;
    const listDocumentsImpl = dependencies.listDocuments || listDocuments;
    const listTrashedDocumentsImpl = dependencies.listTrashedDocuments || listTrashedDocuments;
    const getAllFoldersImpl = dependencies.getAllFolders || getAllFolders;
    const serializeDocument = dependencies.serializeMicrosoftDocument || serializeMicrosoftDocument;
    const parseDocument = dependencies.parseMicrosoftDocument || parseMicrosoftDocument;
    const hashDocument = dependencies.hashMicrosoftDocument || hashMicrosoftDocument;
    const createFileName = dependencies.createMicrosoftDocumentFileName
        || createMicrosoftDocumentFileName;
    const isDocumentFile = dependencies.isMicrosoftDocumentFile || isMicrosoftDocumentFile;
    const cryptoImplementation = options.cryptoImplementation || globalThis.crypto;
    const storage = options.sessionStorageObject ?? defaultSessionStorage();
    const setTimer = options.setTimeoutImpl || globalThis.setTimeout?.bind(globalThis);
    const clearTimer = options.clearTimeoutImpl || globalThis.clearTimeout?.bind(globalThis);
    const debounceMs = Number.isFinite(options.debounceMs)
        ? Math.max(0, options.debounceMs)
        : DEFAULT_SYNC_DEBOUNCE_MS;
    const now = options.now || (() => new Date());
    const createAttemptId = options.createAttemptId || (() => (
        cryptoImplementation?.randomUUID?.()
        || `${normaliseNow(now)}-${Math.random().toString(36).slice(2)}`
    ));
    const onStatus = typeof options.onStatus === 'function' ? options.onStatus : null;

    let memoryTarget = null;
    let destroyed = false;
    const scheduled = new Map();
    const inFlight = new Map();
    const queued = new Map();

    function isConfigured() {
        return Boolean(config?.valid ?? config?.configured);
    }

    function getConfig() {
        return clone(config);
    }

    function assertConfigured() {
        if (!isConfigured()) {
            throw new MicrosoftStorageError(
                'not-configured',
                'Microsoft storage is not configured.',
                { state: 'not-configured' },
            );
        }
    }

    function readTarget() {
        let parsed = memoryTarget;
        try {
            const raw = storage?.getItem?.(MICROSOFT_TARGET_SESSION_KEY);
            parsed = raw ? JSON.parse(raw) : parsed;
        } catch {
            parsed = memoryTarget;
        }
        if (!isTarget(parsed)) return null;
        if (cleanString(config?.tenantId) && !sameValue(parsed.tenantId, config.tenantId)) {
            return null;
        }
        if (!isMicrosoftSharePointUrlAllowed(parsed.folderWebUrl, config?.sharePointHost)) {
            clearTarget();
            return null;
        }
        memoryTarget = clone(parsed);
        return clone(parsed);
    }

    function getTarget() {
        return readTarget();
    }

    function writeTarget(target) {
        if (!isTarget(target)
            || !isMicrosoftSharePointUrlAllowed(target.folderWebUrl, config?.sharePointHost)) {
            throw new MicrosoftStorageError(
                'invalid-target',
                'The Microsoft folder target is invalid.',
                { state: 'target-required' },
            );
        }
        const safeTarget = {
            version: TARGET_VERSION,
            tenantId: cleanString(target.tenantId),
            driveId: cleanString(target.driveId),
            folderId: cleanString(target.folderId),
            folderName: cleanString(target.folderName),
            folderWebUrl: cleanString(target.folderWebUrl),
        };
        memoryTarget = safeTarget;
        try {
            storage?.setItem?.(MICROSOFT_TARGET_SESSION_KEY, JSON.stringify(safeTarget));
        } catch {
            // Memory-only is still session-scoped and lets local writing remain
            // usable in privacy modes where sessionStorage is unavailable.
        }
        return clone(safeTarget);
    }

    function clearTarget() {
        memoryTarget = null;
        try {
            storage?.removeItem?.(MICROSOFT_TARGET_SESSION_KEY);
        } catch {
            // Already cleared from the in-memory session.
        }
        return true;
    }

    async function getAccount() {
        if (!isConfigured()) return null;
        try {
            return await auth.getAccount();
        } catch {
            return null;
        }
    }

    async function connect() {
        assertConfigured();
        const account = await auth.connect();
        if (!accountMatchesTenant(account, config.tenantId)) {
            throw new MicrosoftStorageError(
                'account-mismatch',
                'The selected Microsoft account is not in the configured school tenant.',
                { state: 'account-mismatch' },
            );
        }
        return account;
    }

    async function getAccountBinding(account) {
        const tenantId = cleanString(account?.tenantId);
        const homeAccountId = cleanString(account?.homeAccountId);
        if (!tenantId || !homeAccountId) return '';
        try {
            return await hashDocument(
                `skriv-microsoft-account:${tenantId}:${homeAccountId}`,
                cryptoImplementation,
            );
        } catch {
            return '';
        }
    }

    async function accountMatchesLink(account, link) {
        if (!accountMatchesTenant(account, link?.tenantId)) return false;
        const binding = await getAccountBinding(account);
        return Boolean(binding && binding === link.accountBinding);
    }

    async function findRemoteAlias(target, remoteItem, account) {
        const accountBinding = await getAccountBinding(account);
        const [documents, trash] = await Promise.all([
            listDocumentsImpl(),
            listTrashedDocumentsImpl(),
        ]);
        const matchesItem = (documentRecord) => {
            const link = sanitiseLink(documentRecord?.microsoft365);
            return link
                && sameValue(link.tenantId, target.tenantId)
                && link.driveId === target.driveId
                && link.itemId === remoteItem.id
                ? { document: documentRecord, link }
                : null;
        };
        const active = documents.map(matchesItem).find(Boolean) || null;
        const trashed = trash.map(matchesItem).find(Boolean) || null;
        return { active, trashed, accountBinding };
    }

    async function selectTarget(folderUrl) {
        assertConfigured();
        if (!isMicrosoftSharePointUrlAllowed(folderUrl, config.sharePointHost)) {
            throw new MicrosoftStorageError(
                'folder-host',
                'The folder link is outside the configured school SharePoint host.',
                { state: 'target-mismatch' },
            );
        }
        let account = await getAccount();
        if (!account) account = await connect();
        if (!accountMatchesTenant(account, config.tenantId)) {
            throw new MicrosoftStorageError(
                'account-mismatch',
                'The selected Microsoft account does not match this school tenant.',
                { state: 'account-mismatch' },
            );
        }

        let item;
        try {
            item = await graph.resolveSharedFolder(folderUrl);
        } catch (cause) {
            const classified = classifyError(cause);
            throw new MicrosoftStorageError(
                classified.code,
                cause?.message || 'The Microsoft folder could not be opened.',
                { cause, state: classified.state },
            );
        }

        if (!isMicrosoftSharePointUrlAllowed(item?.webUrl, config.sharePointHost)) {
            throw new MicrosoftStorageError(
                'folder-host',
                'The resolved folder is outside the configured school SharePoint host.',
                { state: 'target-mismatch' },
            );
        }

        const target = {
            version: TARGET_VERSION,
            tenantId: cleanString(config.tenantId),
            driveId: cleanString(item?.parentReference?.driveId),
            folderId: cleanString(item?.id),
            folderName: cleanString(item?.name),
            // Only Graph's canonical item URL is retained. The pasted sharing
            // URL (which may contain a bearer-like token) is never stored.
            folderWebUrl: cleanString(item?.webUrl),
        };
        return writeTarget(target);
    }

    async function buildBaseLink(target, account, previous = {}) {
        const safePrevious = sanitiseLink(previous) || {};
        const accountBinding = await getAccountBinding(account);
        if (!accountBinding) {
            throw new MicrosoftStorageError(
                'account-mismatch',
                'The Microsoft account could not be bound safely.',
                { state: 'account-mismatch' },
            );
        }
        return {
            version: LINK_VERSION,
            tenantId: target.tenantId,
            accountBinding,
            driveId: target.driveId,
            folderId: target.folderId,
            folderName: target.folderName,
            folderWebUrl: target.folderWebUrl,
            remoteDocumentId: cleanString(safePrevious.remoteDocumentId) || null,
            itemId: safePrevious.itemId || null,
            fileName: safePrevious.fileName || null,
            webUrl: safePrevious.webUrl || null,
            eTag: safePrevious.eTag || null,
            cTag: safePrevious.cTag || null,
            lastSyncedAt: safePrevious.lastSyncedAt || null,
            lastSyncedHash: safePrevious.lastSyncedHash || null,
            state: safePrevious.state || 'pending',
            errorCode: safePrevious.errorCode || null,
            attemptId: safePrevious.attemptId || null,
        };
    }

    function emitStatus(documentRecord, link, state = link?.state || 'local-only') {
        if (!onStatus) return;
        try {
            onStatus({
                documentId: documentRecord?.id || null,
                state,
                link: isLink(link) ? clone(link) : null,
                document: documentRecord || null,
            });
        } catch {
            // UI status rendering must never affect local or remote persistence.
        }
    }

    async function persistLink(
        documentRecord,
        link,
        expectedMicrosoft365 = documentRecord?.microsoft365,
    ) {
        let saved;
        try {
            saved = await saveDocumentImpl(
                documentRecord.id,
                { microsoft365: link },
                {
                    preserveUpdatedAt: true,
                    expectedFields: { microsoft365: clone(expectedMicrosoft365) },
                },
            );
        } catch (error) {
            if (/document .* not found/i.test(String(error?.message || ''))) return null;
            throw error;
        }
        if (!saved) return null;
        emitStatus(saved, link);
        return saved;
    }

    async function currentResult(documentId, fallbackState = 'superseded') {
        try {
            const current = await getDocumentImpl(documentId);
            const currentLink = sanitiseLink(current?.microsoft365);
            return resultFor(
                current,
                currentLink,
                currentLink?.state || (current ? 'local-only' : fallbackState),
                {
                    superseded: true,
                },
            );
        } catch {
            return resultFor(null, null, fallbackState, { superseded: true });
        }
    }

    async function persistExistingState(documentRecord, link, state, errorCode) {
        const safeLink = sanitiseLink(link);
        if (!safeLink) return resultFor(documentRecord, null, state);
        const nextLink = {
            ...safeLink,
            state,
            errorCode: errorCode || null,
            attemptId: null,
        };
        const saved = await persistLink(documentRecord, nextLink, documentRecord.microsoft365);
        if (!saved) return currentResult(documentRecord.id, state);
        return resultFor(saved, nextLink, state);
    }

    function wireDocument(documentRecord, link) {
        const remoteDocumentId = cleanString(link?.remoteDocumentId) || documentRecord.id;
        return { ...documentRecord, id: remoteDocumentId };
    }

    function keepBothFileName(documentRecord, link) {
        const stamp = normaliseNow(now).replace(/[-:.TZ]/g, '');
        const remoteId = cleanString(link?.remoteDocumentId) || documentRecord.id;
        return createFileName({
            ...documentRecord,
            id: `${remoteId}-copy-${stamp}`,
            title: `${cleanString(documentRecord.title) || 'untitled'} kopi`,
        });
    }

    async function runDocumentSync(documentId, syncOptions = {}) {
        const documentRecord = await getDocumentImpl(documentId);
        if (!documentRecord) {
            throw new MicrosoftStorageError(
                'document-not-found',
                `Document ${documentId} was not found.`,
                { state: 'document-not-found' },
            );
        }

        const previousLink = sanitiseLink(documentRecord.microsoft365);
        if (syncOptions.requireExistingLink === true && !previousLink) {
            return resultFor(documentRecord, null, 'local-only');
        }
        const target = getTarget();
        if (!target) {
            return persistExistingState(
                documentRecord,
                previousLink,
                'target-required',
                'target-required',
            );
        }
        if (previousLink && !targetMatchesLink(target, previousLink)) {
            return persistExistingState(
                documentRecord,
                previousLink,
                'target-mismatch',
                'target-mismatch',
            );
        }

        const account = await getAccount();
        if (!account) {
            return persistExistingState(
                documentRecord,
                previousLink,
                'needs-sign-in',
                'not-connected',
            );
        }
        if (!accountMatchesTenant(account, target.tenantId)
            || (previousLink && !(await accountMatchesLink(account, previousLink)))) {
            return persistExistingState(
                documentRecord,
                previousLink,
                'account-mismatch',
                'account-mismatch',
            );
        }

        let content;
        let localHash;
        try {
            const folders = await getAllFoldersImpl();
            const baseForWire = previousLink || {
                remoteDocumentId: documentRecord.id,
            };
            content = serializeDocument(
                wireDocument(documentRecord, baseForWire),
                folders,
                { createdAt: documentRecord.createdAt },
            );
            localHash = await hashDocument(content, cryptoImplementation);
        } catch (cause) {
            const code = cleanString(cause?.code) || 'invalid-local-document';
            return persistExistingState(documentRecord, previousLink, 'error', code);
        }

        const keepBoth = syncOptions.keepBoth === true
            || syncOptions.conflictStrategy === 'keep-both';
        if (previousLink?.state === 'synced'
            && previousLink.lastSyncedHash === localHash
            && !keepBoth) {
            return resultFor(documentRecord, previousLink, 'synced');
        }

        const pendingLink = {
            ...(await buildBaseLink(target, account, previousLink || {})),
            remoteDocumentId: cleanString(previousLink?.remoteDocumentId) || documentRecord.id,
            state: 'pending',
            errorCode: null,
            attemptId: createAttemptId(),
        };
        let saved = await persistLink(
            documentRecord,
            pendingLink,
            documentRecord.microsoft365,
        );
        if (!saved) return currentResult(documentId);

        try {
            let item;
            if (previousLink?.itemId && !keepBoth) {
                if (!cleanString(previousLink.eTag)) {
                    throw new MicrosoftStorageError(
                        'etag-missing',
                        'The linked Microsoft file has no conflict token.',
                        { state: 'conflict' },
                    );
                }
                item = await graph.updateSkrivDocument({
                    driveId: target.driveId,
                    folderId: target.folderId,
                    itemId: previousLink.itemId,
                    eTag: previousLink.eTag,
                    content,
                });
            } else {
                item = await graph.createSkrivDocument({
                    driveId: target.driveId,
                    folderId: target.folderId,
                    fileName: keepBoth
                        ? keepBothFileName(documentRecord, pendingLink)
                        : createFileName(wireDocument(documentRecord, pendingLink)),
                    content,
                });
            }
            assertRemoteItemInTarget(item, target);

            const syncedLink = {
                ...pendingLink,
                ...remoteMetadata(item, pendingLink),
                lastSyncedAt: normaliseNow(now),
                lastSyncedHash: localHash,
                state: 'synced',
                errorCode: null,
                attemptId: null,
            };
            saved = await persistLink(saved, syncedLink, pendingLink);
            if (!saved) return currentResult(documentId);
            return resultFor(saved, syncedLink, 'synced', { remoteItem: clone(item) });
        } catch (cause) {
            const classified = cause instanceof MicrosoftStorageError
                ? { state: cause.state, code: cause.code }
                : classifyError(cause);
            const failedLink = {
                ...pendingLink,
                state: classified.state,
                errorCode: classified.code,
                attemptId: null,
            };
            saved = await persistLink(saved, failedLink, pendingLink);
            if (!saved) return currentResult(documentId);
            return resultFor(saved, failedLink, classified.state);
        }
    }

    function queueDocumentSync(documentId, syncOptions) {
        let entry = queued.get(documentId);
        if (!entry) {
            entry = { options: { ...syncOptions } };
            entry.promise = new Promise((resolve) => { entry.resolve = resolve; });
            queued.set(documentId, entry);
        } else {
            entry.options = {
                ...entry.options,
                ...syncOptions,
                keepBoth: entry.options.keepBoth === true || syncOptions.keepBoth === true,
            };
        }
        return entry.promise;
    }

    function syncDocument(documentId, syncOptions = {}) {
        if (destroyed) {
            return Promise.resolve(resultFor(null, null, 'destroyed'));
        }
        if (inFlight.has(documentId)) return queueDocumentSync(documentId, syncOptions);

        const operation = runDocumentSync(documentId, syncOptions)
            .finally(() => {
                if (inFlight.get(documentId) !== operation) return;
                inFlight.delete(documentId);

                const next = queued.get(documentId);
                if (!next) return;
                queued.delete(documentId);
                if (destroyed) {
                    next.resolve(resultFor(null, null, 'cancelled'));
                    return;
                }
                syncDocument(documentId, next.options).then(next.resolve, () => {
                    next.resolve(resultFor(null, null, 'error', {
                        errorCode: 'sync-failed',
                    }));
                });
            });
        inFlight.set(documentId, operation);
        return operation;
    }

    function armScheduledSync(documentId) {
        if (destroyed || typeof setTimer !== 'function') {
            return Promise.resolve(resultFor(null, null, destroyed ? 'destroyed' : 'error'));
        }

        let entry = scheduled.get(documentId);
        if (!entry) {
            entry = {};
            entry.promise = new Promise((resolve) => { entry.resolve = resolve; });
            scheduled.set(documentId, entry);
        } else if (entry.timer !== undefined && typeof clearTimer === 'function') {
            clearTimer(entry.timer);
        }

        entry.timer = setTimer(async () => {
            scheduled.delete(documentId);
            try {
                entry.resolve(await syncDocument(documentId, { requireExistingLink: true }));
            } catch (error) {
                entry.resolve(resultFor(null, null, 'error', {
                    errorCode: cleanString(error?.code) || 'sync-failed',
                }));
            }
        }, debounceMs);
        return entry.promise;
    }

    async function scheduleDocumentSync(documentId) {
        if (destroyed) return resultFor(null, null, 'destroyed');
        try {
            const documentRecord = await getDocumentImpl(documentId);
            const link = sanitiseLink(documentRecord?.microsoft365);
            // Autosave may call this for every document. Remote upload remains
            // explicitly opt-in: only an already linked document is scheduled.
            if (!link) return resultFor(documentRecord, null, 'local-only');
            return await armScheduledSync(documentId);
        } catch (error) {
            return resultFor(null, null, 'error', {
                errorCode: cleanString(error?.code) || 'sync-failed',
            });
        }
    }

    async function listRemoteDocuments() {
        assertConfigured();
        const target = getTarget();
        if (!target) {
            throw new MicrosoftStorageError(
                'target-required',
                'Choose a Microsoft folder first.',
                { state: 'target-required' },
            );
        }
        const account = await getAccount();
        if (!account) {
            throw new MicrosoftStorageError(
                'not-connected',
                'Connect a Microsoft account first.',
                { state: 'needs-sign-in' },
            );
        }
        if (!accountMatchesTenant(account, target.tenantId)) {
            throw new MicrosoftStorageError(
                'account-mismatch',
                'The connected account does not match the selected folder.',
                { state: 'account-mismatch' },
            );
        }
        const items = await graph.listSkrivDocuments(target);
        return (Array.isArray(items) ? items : []).filter(isDocumentFile);
    }

    function assertRemoteItemInTarget(item, target) {
        const driveId = cleanString(item?.parentReference?.driveId);
        const folderId = cleanString(item?.parentReference?.id);
        const fileName = cleanString(item?.name);
        const webUrl = cleanString(item?.webUrl);
        if (!cleanString(item?.id)
            || driveId !== target.driveId
            || folderId !== target.folderId
            || (fileName && !isDocumentFile(fileName))
            || (webUrl && !isMicrosoftSharePointUrlAllowed(webUrl, config?.sharePointHost))) {
            throw new MicrosoftStorageError(
                'target-mismatch',
                'The Microsoft file is outside the selected folder.',
                { state: 'target-mismatch' },
            );
        }
    }

    async function importRemoteDocument(remoteItem) {
        assertConfigured();
        const target = getTarget();
        if (!target) {
            throw new MicrosoftStorageError(
                'target-required',
                'Choose a Microsoft folder first.',
                { state: 'target-required' },
            );
        }
        if (!remoteItem?.id || !isDocumentFile(remoteItem)) {
            throw new MicrosoftStorageError(
                'invalid-remote-document',
                'The selected Microsoft item is not a Skriv document.',
            );
        }
        assertRemoteItemInTarget(remoteItem, target);

        const account = await getAccount();
        if (!account) {
            throw new MicrosoftStorageError(
                'not-connected',
                'Connect a Microsoft account first.',
                { state: 'needs-sign-in' },
            );
        }
        if (!accountMatchesTenant(account, target.tenantId)) {
            throw new MicrosoftStorageError(
                'account-mismatch',
                'The connected account does not match the selected folder.',
                { state: 'account-mismatch' },
            );
        }

        // A drive item has exactly one linked local identity. Reopening an
        // already imported item reuses that record; a record in trash remains
        // recoverable there and must not gain a second live alias.
        const aliases = await findRemoteAlias(target, remoteItem, account);
        if (aliases.active) {
            if (aliases.accountBinding === aliases.active.link.accountBinding
                && targetMatchesLink(target, aliases.active.link)) {
                return resultFor(
                    aliases.active.document,
                    aliases.active.link,
                    aliases.active.link.state || 'synced',
                    { remoteItem: clone(remoteItem), alreadyImported: true },
                );
            }
            throw new MicrosoftStorageError(
                'remote-document-already-linked',
                'This Microsoft document is already linked to another local document.',
                { state: 'conflict' },
            );
        }
        if (aliases.trashed) {
            throw new MicrosoftStorageError(
                'remote-document-in-trash',
                'This Microsoft document is already in Skriv trash. Restore it instead.',
                { state: 'conflict' },
            );
        }

        // Validate and hash everything before creating a local record. A
        // malformed or foreign file therefore leaves the local library intact.
        const downloaded = await graph.downloadSkrivDocument({
            driveId: target.driveId,
            folderId: target.folderId,
            itemId: remoteItem.id,
        });
        assertRemoteItemInTarget(downloaded.item, target);
        let parsed;
        try {
            parsed = parseDocument(downloaded.text);
        } catch (cause) {
            throw new MicrosoftStorageError(
                'invalid-remote-document',
                'The Microsoft file is not a valid Skriv document.',
                { cause },
            );
        }

        const created = await createDocumentImpl(cleanString(parsed.document.title));
        const {
            id: remoteDocumentId,
            folderIds: _foreignFolders,
            schoolYear: _foreignSchoolYear,
            subject: _legacySubject,
            ...portableDocument
        } = parsed.document;
        const baseLink = await buildBaseLink(target, account, {
            remoteDocumentId,
        });
        const item = {
            ...remoteItem,
            ...(downloaded.item || {}),
        };
        const initialLink = {
            ...baseLink,
            ...remoteMetadata(item, baseLink),
            remoteDocumentId,
            state: 'pending',
            errorCode: null,
            attemptId: null,
        };
        const firstSaved = await saveDocumentImpl(created.id, {
            ...portableDocument,
            folderIds: [],
            schoolYear: created.schoolYear,
            subject: null,
            microsoft365: initialLink,
        });

        // The imported record has a new local ID and local updatedAt. Hash its
        // canonical wire representation (which retains the payload ID) so an
        // unchanged import does not immediately upload a timestamp-only edit.
        const canonical = serializeDocument(
            wireDocument(firstSaved, initialLink),
            [],
            { createdAt: firstSaved.createdAt },
        );
        const localHash = await hashDocument(canonical, cryptoImplementation);
        const syncedLink = {
            ...initialLink,
            remoteDocumentId,
            lastSyncedAt: normaliseNow(now),
            lastSyncedHash: localHash,
            state: 'synced',
            errorCode: null,
            attemptId: null,
        };
        const saved = await persistLink(firstSaved, syncedLink, initialLink);
        if (!saved) return currentResult(created.id);
        return resultFor(saved, syncedLink, 'synced', { remoteItem: clone(item) });
    }

    async function unlinkDocument(documentId) {
        const documentRecord = await getDocumentImpl(documentId);
        if (!documentRecord) {
            throw new MicrosoftStorageError(
                'document-not-found',
                `Document ${documentId} was not found.`,
                { state: 'document-not-found' },
            );
        }
        const entry = scheduled.get(documentId);
        if (entry) {
            if (entry.timer !== undefined && typeof clearTimer === 'function') clearTimer(entry.timer);
            scheduled.delete(documentId);
            entry.resolve(resultFor(documentRecord, null, 'unlinked'));
        }
        const queuedEntry = queued.get(documentId);
        if (queuedEntry) {
            queued.delete(documentId);
            queuedEntry.resolve(resultFor(documentRecord, null, 'unlinked'));
        }
        const saved = await saveDocumentImpl(
            documentId,
            { microsoft365: null },
            {
                preserveUpdatedAt: true,
            },
        );
        if (!saved) {
            throw new MicrosoftStorageError(
                'unlink-failed',
                'The Microsoft link could not be removed.',
                { state: 'error' },
            );
        }
        emitStatus(saved, null, 'local-only');
        return resultFor(saved, null, 'local-only');
    }

    async function getDocumentSyncState(documentId) {
        const documentRecord = await getDocumentImpl(documentId);
        if (!documentRecord) {
            throw new MicrosoftStorageError(
                'document-not-found',
                `Document ${documentId} was not found.`,
                { state: 'document-not-found' },
            );
        }
        const link = sanitiseLink(documentRecord.microsoft365);
        if (!link) return resultFor(documentRecord, null, 'local-only');
        if (link.state === 'needs-sign-in') {
            return resultFor(documentRecord, link, 'needs-sign-in');
        }
        const target = getTarget();
        if (!target) return resultFor(documentRecord, link, 'target-required');
        if (!targetMatchesLink(target, link)) return resultFor(documentRecord, link, 'target-mismatch');
        const account = await getAccount();
        if (!account) return resultFor(documentRecord, link, 'needs-sign-in');
        if (!(await accountMatchesLink(account, link))) {
            return resultFor(documentRecord, link, 'account-mismatch');
        }
        return resultFor(documentRecord, link, link.state || 'pending');
    }

    async function disconnect() {
        for (const [documentId, entry] of scheduled) {
            if (entry.timer !== undefined && typeof clearTimer === 'function') clearTimer(entry.timer);
            entry.resolve(resultFor(null, null, 'needs-sign-in'));
            scheduled.delete(documentId);
        }
        for (const [documentId, entry] of queued) {
            entry.resolve(resultFor(null, null, 'needs-sign-in'));
            queued.delete(documentId);
        }

        let disconnectError = null;
        try {
            await auth.disconnect();
        } catch (error) {
            disconnectError = error;
        }
        clearTarget();

        // This local scan is intentional: every existing link should visibly
        // become signed out without contacting Microsoft or deleting anything.
        const documents = await listDocumentsImpl();
        for (const documentRecord of documents) {
            const link = sanitiseLink(documentRecord.microsoft365);
            if (!link) continue;
            await persistLink(documentRecord, {
                ...link,
                state: 'needs-sign-in',
                errorCode: 'not-connected',
                attemptId: null,
            }, documentRecord.microsoft365);
        }

        if (disconnectError) {
            throw new MicrosoftStorageError(
                cleanString(disconnectError.code) || 'sign-out-failed',
                disconnectError.message || 'Microsoft sign-out failed.',
                { cause: disconnectError, state: 'needs-sign-in' },
            );
        }
        return true;
    }

    function destroy() {
        if (destroyed) return;
        destroyed = true;
        for (const [documentId, entry] of scheduled) {
            if (entry.timer !== undefined && typeof clearTimer === 'function') clearTimer(entry.timer);
            entry.resolve(resultFor(null, null, 'cancelled'));
            scheduled.delete(documentId);
        }
        for (const [documentId, entry] of queued) {
            entry.resolve(resultFor(null, null, 'cancelled'));
            queued.delete(documentId);
        }
    }

    return {
        isConfigured,
        getConfig,
        getAccount,
        connect,
        disconnect,
        getTarget,
        selectTarget,
        clearTarget,
        listRemoteDocuments,
        syncDocument,
        scheduleDocumentSync,
        importRemoteDocument,
        unlinkDocument,
        getDocumentSyncState,
        destroy,
    };
}
