/**
 * Portable Microsoft 365 document files.
 *
 * A remote document reuses the validated `.skriv` backup envelope, but is
 * deliberately narrower: exactly one live document, the folders needed to
 * understand that document, and no account, sync, settings, trash, or version
 * data. Microsoft 365 item metadata remains local so moving a file between
 * tenants cannot carry a stale remote identity with it.
 */

import {
    parseLibraryBackup,
    serializeLibraryBackup,
} from './library-backup.js';

const REMOTE_DATA_KEYS = Object.freeze([
    'documents',
    'trash',
    'folders',
    'versions',
    'settings',
]);

const MAX_READABLE_TITLE_LENGTH = 80;

function invalidMicrosoftDocument(reason) {
    throw new Error(`invalid-microsoft-document:${reason}`);
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function stripMicrosoft365Metadata(record) {
    const { microsoft365: _microsoft365, ...portableRecord } = record;
    return portableRecord;
}

function shortStableId(id) {
    const input = String(id || '');
    const readable = input.normalize('NFKC').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8);

    // FNV-1a gives short/non-UUID IDs a deterministic suffix and makes the
    // filename token depend on the complete ID rather than only its prefix.
    let hash = 0x811c9dc5;
    for (let index = 0; index < input.length; index += 1) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    const suffix = (hash >>> 0).toString(16).padStart(8, '0');
    return `${readable}${suffix}`.slice(0, 12);
}

function safeReadableTitle(value, fallbackTitle) {
    const normalized = String(value || '').normalize('NFKC')
        // OneDrive and SharePoint reject these filename characters and control
        // bytes. A conservative readable alphabet also avoids URL/path traps.
        .replace(/[\u0000-\u001f\u007f-\u009f"*:<>?\/\\|]/g, '-')
        .replace(/[^\p{L}\p{N} ._()'-]+/gu, '-')
        .replace(/\s+/g, ' ')
        .replace(/-+/g, '-')
        .trim()
        .replace(/[. -]+$/g, '')
        .replace(/^-+/g, '');

    const fallback = String(fallbackTitle || 'untitled').normalize('NFKC')
        .replace(/[^\p{L}\p{N}_-]+/gu, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'untitled';
    const candidate = normalized || fallback;
    const truncated = Array.from(candidate).slice(0, MAX_READABLE_TITLE_LENGTH).join('')
        .replace(/[. ]+$/g, '');

    // Windows-reserved basenames are also rejected by OneDrive sync clients.
    if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(truncated)) {
        return `skriv-${truncated}`;
    }
    return truncated || fallback;
}

function selectFolderClosure(documentRecord, folders) {
    if (!Array.isArray(folders)) invalidMicrosoftDocument('folders');
    const folderIds = documentRecord.folderIds ?? [];
    if (!Array.isArray(folderIds)) invalidMicrosoftDocument('folderIds');

    const foldersById = new Map();
    for (const folder of folders) {
        if (!isPlainObject(folder) || typeof folder.id !== 'string' || !folder.id) {
            invalidMicrosoftDocument('folder');
        }
        if (foldersById.has(folder.id)) invalidMicrosoftDocument('duplicate-folder');
        foldersById.set(folder.id, folder);
    }

    const neededIds = new Set();
    const pending = [...folderIds];
    while (pending.length > 0) {
        const folderId = pending.pop();
        if (neededIds.has(folderId)) continue;
        const folder = foldersById.get(folderId);
        if (!folder) invalidMicrosoftDocument('missing-folder');
        neededIds.add(folderId);
        if (folder.parentId) pending.push(folder.parentId);
    }

    // Preserve the library's stable folder ordering while omitting unrelated
    // folders. The backup validator below checks cycles and maximum depth.
    return folders
        .filter((folder) => neededIds.has(folder.id))
        .map(stripMicrosoft365Metadata);
}

function assertExactKeys(value, expected, reason) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        invalidMicrosoftDocument(reason);
    }
}

/**
 * Build the initial remote filename. The title stays readable while the stable
 * ID suffix prevents ordinary duplicate titles from colliding.
 *
 * @param {{ id: string, title?: string }} documentRecord
 * @param {{ fallbackTitle?: string }} [options]
 */
export function createMicrosoftDocumentFileName(documentRecord, options = {}) {
    if (!isPlainObject(documentRecord) || typeof documentRecord.id !== 'string' || !documentRecord.id) {
        invalidMicrosoftDocument('id');
    }
    const title = safeReadableTitle(documentRecord.title, options.fallbackTitle);
    return `${title}--${shortStableId(documentRecord.id)}.skriv`;
}

/**
 * Serialize one live document in the existing validated backup envelope.
 * Only directly referenced folders and their ancestors travel with the file.
 *
 * @param {object} documentRecord
 * @param {object[]} [folders]
 * @param {{ createdAt?: string }} [options]
 * @returns {string}
 */
export function serializeMicrosoftDocument(documentRecord, folders = [], options = {}) {
    if (!isPlainObject(documentRecord)) invalidMicrosoftDocument('document');

    const portableDocument = stripMicrosoft365Metadata(documentRecord);
    const portableFolders = selectFolderClosure(portableDocument, folders);
    const createdAt = options.createdAt
        || portableDocument.updatedAt
        || portableDocument.createdAt
        || new Date().toISOString();
    const serialized = serializeLibraryBackup({
        documents: [portableDocument],
        trash: [],
        folders: portableFolders,
        versions: [],
        settings: {},
    }, { createdAt });

    // Serialization must never produce a remote file that the stricter reader
    // would reject. This also reuses the backup module's HTML and graph checks.
    parseMicrosoftDocument(serialized);
    return serialized;
}

/**
 * Parse and validate a native remote document file.
 *
 * @param {string} text
 * @returns {{ document: object, folders: object[], createdAt: string }}
 */
export function parseMicrosoftDocument(text) {
    const parsed = parseLibraryBackup(text);
    if (!isPlainObject(parsed)) invalidMicrosoftDocument('root');
    assertExactKeys(parsed, ['format', 'version', 'createdAt', 'data'], 'root-shape');
    if (typeof parsed.createdAt !== 'string' || Number.isNaN(Date.parse(parsed.createdAt))) {
        invalidMicrosoftDocument('createdAt');
    }

    const data = parsed.data;
    if (!isPlainObject(data)) invalidMicrosoftDocument('data');
    assertExactKeys(data, REMOTE_DATA_KEYS, 'data-shape');
    if (data.documents.length !== 1) invalidMicrosoftDocument('document-count');
    if (data.trash.length !== 0) invalidMicrosoftDocument('trash');
    if (data.versions.length !== 0) invalidMicrosoftDocument('versions');
    if (Object.keys(data.settings).length !== 0) invalidMicrosoftDocument('settings');
    if (Object.hasOwn(data.documents[0], 'microsoft365')) {
        invalidMicrosoftDocument('connector-metadata');
    }

    const documentRecord = stripMicrosoft365Metadata(data.documents[0]);
    const expectedFolders = selectFolderClosure(documentRecord, data.folders);
    const expectedIds = new Set(expectedFolders.map((folder) => folder.id));
    if (expectedIds.size !== data.folders.length
        || data.folders.some((folder) => !expectedIds.has(folder.id))) {
        invalidMicrosoftDocument('folder-closure');
    }

    return {
        document: documentRecord,
        folders: expectedFolders,
        createdAt: parsed.createdAt,
    };
}

/** Return whether a local/remote file name is a candidate `.skriv` document. */
export function isMicrosoftDocumentFile(fileOrName) {
    const name = typeof fileOrName === 'string' ? fileOrName : fileOrName?.name;
    return typeof name === 'string' && name.length > '.skriv'.length && /\.skriv$/i.test(name);
}

/** Calculate the SHA-256 of the exact serialized UTF-8 document file. */
export async function hashMicrosoftDocument(serializedText, cryptoImplementation = globalThis.crypto) {
    if (typeof serializedText !== 'string') invalidMicrosoftDocument('hash-input');
    const subtle = cryptoImplementation?.subtle || cryptoImplementation;
    if (typeof subtle?.digest !== 'function') invalidMicrosoftDocument('crypto');

    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(serializedText));
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
