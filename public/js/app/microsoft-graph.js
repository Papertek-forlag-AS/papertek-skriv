/** Narrow Microsoft Graph client for Skriv files in a shared drive folder. */

export const MICROSOFT_GRAPH_BASE_URL = 'https://graph.microsoft.com/v1.0';

const DRIVE_ITEM_FIELDS = [
    'id',
    'name',
    'eTag',
    'cTag',
    'lastModifiedDateTime',
    'size',
    'file',
    'webUrl',
    'parentReference',
].join(',');
const DOWNLOAD_ITEM_FIELDS = `${DRIVE_ITEM_FIELDS},@microsoft.graph.downloadUrl`;
const MAX_TRANSFER_BYTES = 60 * 1024 * 1024;
const MAX_LIST_PAGES = 5;
const MAX_LIST_DOCUMENTS = 200;

export class MicrosoftGraphError extends Error {
    constructor(message, options = {}) {
        super(message, options.cause ? { cause: options.cause } : undefined);
        this.name = 'MicrosoftGraphError';
        this.status = options.status ?? 0;
        this.code = options.code || 'graph-error';
        this.kind = options.kind || 'graph-error';
        this.retryAfter = options.retryAfter ?? null;
        this.requestId = options.requestId || null;
        this.details = options.details ?? null;
    }
}

export class MicrosoftGraphAuthenticationError extends MicrosoftGraphError {
    constructor(message, options = {}) {
        super(message, { ...options, status: 401, kind: 'unauthenticated' });
        this.name = 'MicrosoftGraphAuthenticationError';
    }
}

export class MicrosoftGraphPermissionError extends MicrosoftGraphError {
    constructor(message, options = {}) {
        super(message, { ...options, status: 403, kind: 'forbidden' });
        this.name = 'MicrosoftGraphPermissionError';
    }
}

export class MicrosoftGraphNotFoundError extends MicrosoftGraphError {
    constructor(message, options = {}) {
        super(message, { ...options, status: 404, kind: 'not-found' });
        this.name = 'MicrosoftGraphNotFoundError';
    }
}

export class MicrosoftGraphConflictError extends MicrosoftGraphError {
    constructor(message, options = {}) {
        super(message, { ...options, status: options.status ?? 412, kind: 'conflict' });
        this.name = 'MicrosoftGraphConflictError';
    }
}

export class MicrosoftGraphRateLimitError extends MicrosoftGraphError {
    constructor(message, options = {}) {
        super(message, { ...options, status: 429, kind: 'rate-limited' });
        this.name = 'MicrosoftGraphRateLimitError';
    }
}

function base64Encode(binary) {
    if (typeof globalThis.btoa !== 'function') {
        throw new MicrosoftGraphError('This browser cannot encode a Microsoft sharing URL.', {
            code: 'base64-unavailable',
            kind: 'invalid-input',
        });
    }
    return globalThis.btoa(binary);
}

export function encodeSharingUrl(sharingUrl) {
    let parsed;
    try {
        parsed = new URL(String(sharingUrl || ''));
    } catch {
        throw new MicrosoftGraphError('The Microsoft sharing link is invalid.', {
            code: 'invalid-sharing-url',
            kind: 'invalid-input',
        });
    }
    if (parsed.protocol !== 'https:') {
        throw new MicrosoftGraphError('The Microsoft sharing link must use HTTPS.', {
            code: 'invalid-sharing-url',
            kind: 'invalid-input',
        });
    }
    if (parsed.username || parsed.password || parsed.port) {
        throw new MicrosoftGraphError('The Microsoft sharing link contains credentials or a port.', {
            code: 'invalid-sharing-url',
            kind: 'invalid-input',
        });
    }

    const bytes = new TextEncoder().encode(parsed.href);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `u!${base64Encode(binary).replace(/=+$/g, '').replace(/\//g, '_').replace(/\+/g, '-')}`;
}

function parseRetryAfter(value) {
    if (!value) return null;
    const seconds = Number(value);
    if (Number.isFinite(seconds)) return Math.max(0, seconds);
    const date = Date.parse(value);
    return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

async function readErrorDetails(response) {
    let details = null;
    try {
        const text = await response.text();
        details = text ? JSON.parse(text) : null;
    } catch {
        details = null;
    }
    return details;
}

async function graphErrorFromResponse(response) {
    const details = await readErrorDetails(response);
    const graphError = details?.error || details;
    const message = graphError?.message || `Microsoft Graph request failed (${response.status}).`;
    const options = {
        status: response.status,
        code: graphError?.code || `http-${response.status}`,
        retryAfter: parseRetryAfter(response.headers?.get?.('Retry-After')),
        requestId: response.headers?.get?.('request-id') ||
            graphError?.innerError?.['request-id'] ||
            null,
        details,
    };

    if (response.status === 401) return new MicrosoftGraphAuthenticationError(message, options);
    if (response.status === 403) return new MicrosoftGraphPermissionError(message, options);
    if (response.status === 404) return new MicrosoftGraphNotFoundError(message, options);
    if (response.status === 409 || response.status === 412) {
        return new MicrosoftGraphConflictError(message, options);
    }
    if (response.status === 429) return new MicrosoftGraphRateLimitError(message, options);
    return new MicrosoftGraphError(message, options);
}

function asGraphUrl(pathOrUrl) {
    const value = String(pathOrUrl || '');
    if (!/^https?:/i.test(value)) {
        return `${MICROSOFT_GRAPH_BASE_URL}${value.startsWith('/') ? value : `/${value}`}`;
    }

    const url = new URL(value);
    if (url.origin !== 'https://graph.microsoft.com' || url.username || url.password) {
        throw new MicrosoftGraphError('Microsoft Graph returned an unexpected continuation URL.', {
            code: 'invalid-continuation-url',
            kind: 'invalid-response',
        });
    }
    return url.href;
}

function requireValue(value, name) {
    const result = String(value || '').trim();
    if (!result) {
        throw new MicrosoftGraphError(`${name} is required.`, {
            code: 'invalid-argument',
            kind: 'invalid-input',
        });
    }
    return result;
}

function requireSkrivFileName(fileName) {
    const result = requireValue(fileName, 'fileName');
    if (!/\.skriv$/i.test(result) || /[\\/]/.test(result)) {
        throw new MicrosoftGraphError('Skriv cloud files must use a .skriv file name.', {
            code: 'invalid-file-name',
            kind: 'invalid-input',
        });
    }
    return result;
}

function requireTransferUrl(value, code) {
    let url;
    try {
        url = new URL(String(value || ''));
    } catch {
        url = null;
    }
    if (!url || url.protocol !== 'https:' || url.username || url.password || url.port) {
        throw new MicrosoftGraphError('Microsoft Graph returned an invalid transfer URL.', {
            code,
            kind: 'invalid-response',
        });
    }
    return url.href;
}

function toUploadBytes(content) {
    let bytes;
    if (typeof content === 'string') bytes = new TextEncoder().encode(content);
    else if (content instanceof Uint8Array) bytes = content;
    else if (content instanceof ArrayBuffer) bytes = new Uint8Array(content);
    else {
        throw new MicrosoftGraphError('Skriv upload content must be text or bytes.', {
            code: 'invalid-content',
            kind: 'invalid-input',
        });
    }

    if (bytes.byteLength === 0 || bytes.byteLength >= MAX_TRANSFER_BYTES) {
        throw new MicrosoftGraphError('Skriv upload content has an unsupported size.', {
            code: 'invalid-content-size',
            kind: 'invalid-input',
        });
    }
    return bytes;
}

function finalDriveItemMetadata(item) {
    if (!item?.id) {
        throw new MicrosoftGraphError('Microsoft Graph did not return file metadata.', {
            code: 'invalid-drive-item',
            kind: 'invalid-response',
        });
    }
    const metadata = {
        id: item.id,
        name: item.name ?? null,
        eTag: item.eTag ?? null,
        cTag: item.cTag ?? null,
        lastModifiedDateTime: item.lastModifiedDateTime ?? null,
        webUrl: item.webUrl ?? null,
        parentReference: item.parentReference ?? null,
    };
    if (Number.isSafeInteger(item.size) && item.size >= 0) metadata.size = item.size;
    return metadata;
}

function isCanonicalSharePointUrl(value) {
    try {
        const url = new URL(String(value || ''));
        return url.protocol === 'https:'
            && !url.username
            && !url.password
            && !url.port
            && /\.sharepoint\.com$/i.test(url.hostname);
    } catch {
        return false;
    }
}

function assertSkrivDriveItem(item, expected = {}) {
    const expectedDriveId = String(expected.driveId || '');
    const expectedFolderId = String(expected.folderId || '');
    const expectedItemId = String(expected.itemId || '');
    const valid = item?.id
        && (!expectedItemId || item.id === expectedItemId)
        && item.file
        && typeof item.name === 'string'
        && item.name.length > '.skriv'.length
        && /\.skriv$/i.test(item.name)
        && item.parentReference?.driveId === expectedDriveId
        && item.parentReference?.id === expectedFolderId
        && isCanonicalSharePointUrl(item.webUrl);
    if (!valid) {
        throw new MicrosoftGraphConflictError(
            'The Microsoft document moved, was renamed, or left the selected folder.',
            { code: 'remote-item-moved-or-renamed', status: 412 },
        );
    }
    if (expected.eTag && item.eTag !== expected.eTag) {
        throw new MicrosoftGraphConflictError(
            'The Microsoft document changed before this upload.',
            { code: 'remote-changed-before-upload', status: 412 },
        );
    }
    return item;
}

function assertRemoteDocumentSize(value, source, maximumBytes) {
    if (value === null || value === undefined || value === '') return null;
    const size = Number(value);
    if (!Number.isSafeInteger(size) || size < 0) {
        throw new MicrosoftGraphError('Microsoft returned an invalid document size.', {
            code: 'invalid-download-size',
            kind: 'invalid-response',
            details: { source },
        });
    }
    if (size >= maximumBytes) {
        throw new MicrosoftGraphError('The Microsoft document is too large to import safely.', {
            code: 'remote-document-too-large',
            kind: 'invalid-input',
            details: { source, maximumBytes },
        });
    }
    return size;
}

async function readBoundedDownloadText(response, maximumBytes) {
    assertRemoteDocumentSize(
        response.headers?.get?.('Content-Length'),
        'content-length',
        maximumBytes,
    );

    const reader = response.body?.getReader?.();
    if (!reader) {
        throw new MicrosoftGraphError('This browser cannot read the document with a safe limit.', {
            code: 'bounded-download-unavailable',
            kind: 'invalid-response',
        });
    }

    const decoder = new TextDecoder('utf-8', { fatal: true });
    const parts = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
            totalBytes += bytes.byteLength;
            if (totalBytes >= maximumBytes) {
                try {
                    await reader.cancel();
                } catch {
                    // The size rejection below remains authoritative.
                }
                throw new MicrosoftGraphError(
                    'The Microsoft document is too large to import safely.',
                    {
                        code: 'remote-document-too-large',
                        kind: 'invalid-input',
                        details: { source: 'stream', maximumBytes },
                    },
                );
            }
            parts.push(decoder.decode(bytes, { stream: true }));
        }
        parts.push(decoder.decode());
        return parts.join('');
    } catch (cause) {
        if (cause instanceof MicrosoftGraphError) throw cause;
        try {
            await reader.cancel();
        } catch {
            // The invalid UTF-8 error below remains authoritative.
        }
        throw new MicrosoftGraphError('The Microsoft document is not valid UTF-8.', {
            code: 'invalid-download-encoding',
            kind: 'invalid-response',
            cause,
        });
    } finally {
        reader.releaseLock?.();
    }
}

export function createMicrosoftGraphClient(options = {}) {
    const getAccessToken = options.getAccessToken;
    const fetchImpl = options.fetchImpl || globalThis.fetch?.bind(globalThis);
    if (typeof getAccessToken !== 'function') {
        throw new TypeError('createMicrosoftGraphClient requires getAccessToken().');
    }
    if (typeof fetchImpl !== 'function') {
        throw new TypeError('createMicrosoftGraphClient requires fetch().');
    }
    const requestedDownloadLimit = Number(options.maxDownloadBytes);
    const maxDownloadBytes = Number.isSafeInteger(requestedDownloadLimit)
        && requestedDownloadLimit > 0
        && requestedDownloadLimit <= MAX_TRANSFER_BYTES
        ? requestedDownloadLimit
        : MAX_TRANSFER_BYTES;
    const requestedListPages = Number(options.maxListPages);
    const maxListPages = Number.isSafeInteger(requestedListPages)
        && requestedListPages > 0
        && requestedListPages <= MAX_LIST_PAGES
        ? requestedListPages
        : MAX_LIST_PAGES;
    const requestedListDocuments = Number(options.maxListDocuments);
    const maxListDocuments = Number.isSafeInteger(requestedListDocuments)
        && requestedListDocuments > 0
        && requestedListDocuments <= MAX_LIST_DOCUMENTS
        ? requestedListDocuments
        : MAX_LIST_DOCUMENTS;

    async function fetchMicrosoftResource(url, init) {
        try {
            return await fetchImpl(url, init);
        } catch (cause) {
            throw new MicrosoftGraphError('The Microsoft service could not be reached.', {
                code: 'network-error',
                kind: 'network',
                cause,
            });
        }
    }

    async function request(pathOrUrl, init = {}) {
        const token = await getAccessToken();
        if (!token) {
            throw new MicrosoftGraphAuthenticationError('No Microsoft access token is available.', {
                code: 'missing-access-token',
            });
        }

        const headers = new Headers(init.headers || {});
        headers.set('Authorization', `Bearer ${token}`);
        headers.set('Accept', 'application/json');
        const response = await fetchMicrosoftResource(
            asGraphUrl(pathOrUrl),
            {
                ...init,
                headers,
                cache: 'no-store',
                credentials: 'omit',
                referrerPolicy: 'no-referrer',
            },
        );
        if (!response.ok) throw await graphErrorFromResponse(response);
        return response;
    }

    async function requestJson(pathOrUrl, init = {}) {
        const response = await request(pathOrUrl, init);
        if (response.status === 204) return null;
        try {
            return await response.json();
        } catch (cause) {
            throw new MicrosoftGraphError('Microsoft Graph returned invalid JSON.', {
                code: 'invalid-json',
                kind: 'invalid-response',
                cause,
            });
        }
    }

    async function requestUpload(uploadUrl, bytes) {
        const headers = new Headers({
            'Content-Type': 'application/octet-stream',
            'Content-Range': `bytes 0-${bytes.byteLength - 1}/${bytes.byteLength}`,
        });
        const response = await fetchMicrosoftResource(uploadUrl, {
            method: 'PUT',
            headers,
            body: bytes,
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
        });
        if (!response.ok) throw await graphErrorFromResponse(response);
        if (response.status === 202) {
            throw new MicrosoftGraphError('The Skriv upload did not finish in one request.', {
                code: 'incomplete-upload',
                kind: 'invalid-response',
            });
        }
        try {
            return await response.json();
        } catch (cause) {
            throw new MicrosoftGraphError('Microsoft Graph returned invalid upload metadata.', {
                code: 'invalid-json',
                kind: 'invalid-response',
                cause,
            });
        }
    }

    async function getDriveItem(driveId, itemId, fields = DRIVE_ITEM_FIELDS) {
        const query = new URLSearchParams({ '$select': fields });
        return requestJson(
            `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}?${query}`,
        );
    }

    async function resolveSharedFolder(sharingUrl) {
        const shareId = encodeSharingUrl(sharingUrl);
        const query = new URLSearchParams({
            '$select': `${DRIVE_ITEM_FIELDS},folder`,
        });
        // A Teams/SharePoint sharing URL may need to be redeemed before Graph
        // exposes the drive item, even when the signed-in pupil is already a
        // member of the team. Keep that access scoped to this request.
        const item = await requestJson(`/shares/${shareId}/driveItem?${query}`, {
            headers: {
                Prefer: 'redeemSharingLinkIfNecessary',
            },
        });
        if (!item?.folder || !item?.id || !item?.parentReference?.driveId) {
            throw new MicrosoftGraphError('The sharing link does not resolve to a writable folder.', {
                code: 'invalid-shared-folder',
                kind: 'invalid-response',
                details: item,
            });
        }
        return item;
    }

    async function listSkrivDocuments({ driveId, folderId }) {
        const resolvedDriveId = requireValue(driveId, 'driveId');
        const resolvedFolderId = requireValue(folderId, 'folderId');
        const query = new URLSearchParams({ '$select': DRIVE_ITEM_FIELDS, '$top': '200' });
        let nextUrl = `/drives/${encodeURIComponent(resolvedDriveId)}` +
            `/items/${encodeURIComponent(resolvedFolderId)}/children?${query}`;
        const visited = new Set();
        const files = [];
        let pageCount = 0;

        while (nextUrl) {
            const absoluteUrl = asGraphUrl(nextUrl);
            if (visited.has(absoluteUrl)) {
                throw new MicrosoftGraphError('Microsoft Graph returned a repeated continuation URL.', {
                    code: 'pagination-loop',
                    kind: 'invalid-response',
                });
            }
            visited.add(absoluteUrl);
            pageCount += 1;
            const page = await requestJson(absoluteUrl);
            if (!Array.isArray(page?.value)) {
                throw new MicrosoftGraphError('Microsoft Graph returned an invalid folder listing.', {
                    code: 'invalid-folder-list',
                    kind: 'invalid-response',
                    details: page,
                });
            }
            const pageFiles = page.value.filter(
                (item) => item?.file && /\.skriv$/i.test(item.name || ''),
            );
            if (files.length + pageFiles.length > maxListDocuments) {
                throw new MicrosoftGraphError(
                    'The Microsoft folder contains too many Skriv documents to list safely.',
                    {
                        code: 'remote-list-too-large',
                        kind: 'invalid-input',
                        details: { maxListDocuments, maxListPages },
                    },
                );
            }
            files.push(...pageFiles);
            nextUrl = page['@odata.nextLink'] || '';
            if (nextUrl && pageCount >= maxListPages) {
                throw new MicrosoftGraphError(
                    'The Microsoft folder contains too many items to list safely.',
                    {
                        code: 'remote-list-too-large',
                        kind: 'invalid-input',
                        details: { maxListDocuments, maxListPages },
                    },
                );
            }
        }
        return files;
    }

    async function completeUploadSession({
        sessionPath,
        sessionHeaders,
        bytes,
        driveId,
        folderId,
        fallbackMetadata,
    }) {
        const session = await requestJson(sessionPath, {
            method: 'POST',
            headers: new Headers({
                'Content-Type': 'application/json',
                ...(sessionHeaders || {}),
            }),
            body: JSON.stringify({
                item: sessionHeaders?.['If-Match']
                    ? undefined
                    : { '@microsoft.graph.conflictBehavior': 'fail' },
            }),
        });
        const uploadUrl = requireTransferUrl(session?.uploadUrl, 'invalid-upload-session');

        const uploaded = await requestUpload(uploadUrl, bytes);
        if (!uploaded?.id || !uploaded?.eTag) {
            throw new MicrosoftGraphError('Microsoft Graph did not acknowledge the uploaded file version.', {
                code: 'invalid-drive-item',
                kind: 'invalid-response',
                details: uploaded,
            });
        }
        const acknowledged = finalDriveItemMetadata({
            ...(fallbackMetadata || {}),
            ...uploaded,
        });
        let fresh;
        try {
            fresh = await getDriveItem(driveId, uploaded.id);
        } catch {
            // The successful upload response already committed these bytes and
            // supplied their conflict token. A best-effort enrichment failure
            // must not turn that committed create/update into an unsafe retry.
            return acknowledged;
        }
        assertSkrivDriveItem(fresh, {
            driveId,
            folderId,
            itemId: uploaded.id,
        });
        if (fresh?.eTag && fresh.eTag !== uploaded.eTag) {
            throw new MicrosoftGraphConflictError(
                'The Microsoft document changed immediately after this upload.',
                {
                    code: 'remote-changed-after-upload',
                    status: 412,
                },
            );
        }
        // The upload acknowledgement is the only conflict token that belongs
        // to the bytes we just sent. A second client may change the file before
        // this enriching GET completes; never pair that later eTag with our
        // local hash or a future save could silently overwrite the other edit.
        return finalDriveItemMetadata({
            ...(fallbackMetadata || {}),
            ...uploaded,
            ...fresh,
            eTag: uploaded.eTag,
        });
    }

    async function createSkrivDocument({ driveId, folderId, fileName, content }) {
        const resolvedDriveId = requireValue(driveId, 'driveId');
        const resolvedFolderId = requireValue(folderId, 'folderId');
        const resolvedFileName = requireSkrivFileName(fileName);
        const bytes = toUploadBytes(content);
        const path = `/drives/${encodeURIComponent(resolvedDriveId)}` +
            `/items/${encodeURIComponent(resolvedFolderId)}:` +
            `/${encodeURIComponent(resolvedFileName)}:/createUploadSession`;

        return completeUploadSession({
            sessionPath: path,
            bytes,
            driveId: resolvedDriveId,
            folderId: resolvedFolderId,
            fallbackMetadata: {
                name: resolvedFileName,
                parentReference: {
                    driveId: resolvedDriveId,
                    id: resolvedFolderId,
                },
            },
        });
    }

    async function updateSkrivDocument({ driveId, folderId, itemId, eTag, content }) {
        const resolvedDriveId = requireValue(driveId, 'driveId');
        const resolvedFolderId = requireValue(folderId, 'folderId');
        const resolvedItemId = requireValue(itemId, 'itemId');
        const resolvedETag = requireValue(eTag, 'eTag');
        const bytes = toUploadBytes(content);
        const current = assertSkrivDriveItem(
            await getDriveItem(resolvedDriveId, resolvedItemId),
            {
                driveId: resolvedDriveId,
                folderId: resolvedFolderId,
                itemId: resolvedItemId,
                eTag: resolvedETag,
            },
        );
        const path = `/drives/${encodeURIComponent(resolvedDriveId)}` +
            `/items/${encodeURIComponent(resolvedItemId)}/createUploadSession`;

        return completeUploadSession({
            sessionPath: path,
            sessionHeaders: { 'If-Match': resolvedETag },
            bytes,
            driveId: resolvedDriveId,
            folderId: resolvedFolderId,
            fallbackMetadata: current,
        });
    }

    async function downloadSkrivDocument({ driveId, folderId, itemId }) {
        const resolvedDriveId = requireValue(driveId, 'driveId');
        const resolvedFolderId = requireValue(folderId, 'folderId');
        const resolvedItemId = requireValue(itemId, 'itemId');
        const item = assertSkrivDriveItem(
            await getDriveItem(resolvedDriveId, resolvedItemId, DOWNLOAD_ITEM_FIELDS),
            {
                driveId: resolvedDriveId,
                folderId: resolvedFolderId,
                itemId: resolvedItemId,
            },
        );
        assertRemoteDocumentSize(item?.size, 'drive-item', maxDownloadBytes);
        const downloadUrl = requireTransferUrl(
            item?.['@microsoft.graph.downloadUrl'],
            'download-url-missing',
        );

        const response = await fetchMicrosoftResource(downloadUrl, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'omit',
            referrerPolicy: 'no-referrer',
        });
        if (!response.ok) throw await graphErrorFromResponse(response);
        return {
            item: finalDriveItemMetadata(item),
            text: await readBoundedDownloadText(response, maxDownloadBytes),
        };
    }

    return {
        resolveSharedFolder,
        listSkrivDocuments,
        createSkrivDocument,
        updateSkrivDocument,
        downloadSkrivDocument,
    };
}
