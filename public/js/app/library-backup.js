/**
 * Whole-library backup and restore.
 *
 * The portable `.skriv` file contains documents, trash, folders, version
 * snapshots, and the small set of Skriv preferences needed to make the
 * library understandable on another browser profile. Restore is merge-only:
 * existing records are never overwritten, and retries are deterministic.
 */

import { openSkrivDatabase } from './db.js';
import {
    openVersionHistoryDatabase,
    VERSION_HISTORY_STORE_NAME,
} from '../editor-core/student/version-history.js';

const BACKUP_FORMAT = 'papertek-skriv-backup';
const BACKUP_VERSION = 1;
const MAX_BACKUP_TEXT_LENGTH = 100 * 1024 * 1024;
const MAX_DOCUMENTS_PER_COLLECTION = 10000;
const MAX_FOLDERS = 10000;
const MAX_VERSIONS = 50000;
const MAX_HTML_LENGTH = 50 * 1024 * 1024;
const MAX_ID_LENGTH = 512;
const MAX_FOLDER_DEPTH = 3;
const MAX_JSON_DEPTH = 20;
const MAX_RECORD_ARRAY_LENGTH = 10000;
const MAX_REFERENCES_PER_DOCUMENT = 1000;

const DOCUMENT_STORES = ['documents', 'trash', 'folders'];
const SETTINGS_KEYS = [
    'skriv_language',
    'skriv_theme',
    'theme',
    'skriv_school_year',
    'skriv_school_level',
    'skriv.leksihjelp.writingLang',
    'skriv.leksihjelp.lookupLang',
    'skriv.leksihjelp.examMode',
];

const ACTIVE_HTML_TAGS = new Set([
    'script', 'iframe', 'object', 'embed', 'applet', 'meta', 'link', 'base',
    'style', 'form', 'template', 'noscript', 'xmp', 'plaintext', 'noembed', 'noframes',
]);
const URL_ATTRIBUTES = new Set([
    'href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'background',
]);
const RESOURCE_URL_ATTRIBUTES = new Set(['src', 'xlink:href', 'poster', 'background']);

function invalidBackup(reason) {
    throw new Error(`invalid-backup:${reason}`);
}

function isPlainObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertPlainRecord(value, collection) {
    if (!isPlainObject(value)) invalidBackup(`${collection}-record`);
}

function assertBoundedJson(value, field, depth = 0) {
    if (depth > MAX_JSON_DEPTH) invalidBackup(`${field}-depth`);
    if (value === null || typeof value === 'boolean') return;
    if (typeof value === 'string') {
        if (value.length > MAX_HTML_LENGTH) invalidBackup(`${field}-string`);
        return;
    }
    if (typeof value === 'number') {
        if (!Number.isFinite(value)) invalidBackup(`${field}-number`);
        return;
    }
    if (Array.isArray(value)) {
        if (value.length > MAX_RECORD_ARRAY_LENGTH) invalidBackup(`${field}-array`);
        for (const entry of value) assertBoundedJson(entry, field, depth + 1);
        return;
    }
    if (isPlainObject(value)) {
        const entries = Object.entries(value);
        if (entries.length > MAX_RECORD_ARRAY_LENGTH) invalidBackup(`${field}-properties`);
        for (const [key, entry] of entries) {
            if (key.length > MAX_ID_LENGTH) invalidBackup(`${field}-property`);
            assertBoundedJson(entry, field, depth + 1);
        }
        return;
    }
    invalidBackup(`${field}-value`);
}

function assertString(value, field, { optional = false, max = MAX_HTML_LENGTH } = {}) {
    if (value === undefined && optional) return;
    if (typeof value !== 'string' || value.length > max) invalidBackup(field);
}

function assertOptionalNumber(value, field) {
    if (value !== undefined && (!Number.isFinite(value) || value < 0)) invalidBackup(field);
}

function assertOptionalBoolean(value, field) {
    if (value !== undefined && typeof value !== 'boolean') invalidBackup(field);
}

function assertId(value, field) {
    if (typeof value !== 'string' || value.length === 0 || value.length > MAX_ID_LENGTH) {
        invalidBackup(field);
    }
}

function decodeUrlEntities(value) {
    return value
        .replace(/&#x([0-9a-f]+);?/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .replace(/&#([0-9]+);?/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
        .replace(/&colon;/gi, ':')
        .replace(/&lpar;/gi, '(')
        .replace(/&rpar;/gi, ')')
        .replace(/&tab;/gi, '\t')
        .replace(/&newline;/gi, '\n')
        .replace(/&amp;/gi, '&');
}

function isSafeUrl(value) {
    const decoded = decodeUrlEntities(String(value || '')).trim();
    const compact = decoded.replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
    if (!compact || compact.startsWith('#') || compact.startsWith('/') || compact.startsWith('./') || compact.startsWith('../')) {
        return true;
    }
    if (/^(?:https?|mailto|tel):/.test(compact)) return true;
    if (/^data:image\/(?:png|jpe?g|gif|webp);base64,/.test(compact)) return true;
    return !/^[a-z][a-z0-9+.-]*:/.test(compact);
}

function isSafeResourceUrl(value) {
    const decoded = decodeUrlEntities(String(value || '')).trim();
    const compact = decoded.replace(/[\u0000-\u0020\u007f-\u009f]/g, '').toLowerCase();
    if (compact.startsWith('//')) return false;
    if (/^(?:https?|mailto|tel):/.test(compact)) return false;
    return isSafeUrl(decoded);
}

function isSafeStyle(value) {
    const decoded = decodeUrlEntities(String(value || ''));
    return !/(?:\\|\/\*|\*\/|url\s*\(|image-set\s*\(|expression\s*\(|@import\b|behavior\s*:|-moz-binding|\b(?:blob|data|file|https?|javascript|vbscript):)/i.test(decoded);
}

function assertSafeHtmlWithDom(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    for (const element of parsed.querySelectorAll('*')) {
        if (ACTIVE_HTML_TAGS.has(element.tagName.toLowerCase())) invalidBackup('unsafe-html-tag');
        for (const attribute of element.attributes) {
            const name = attribute.name.toLowerCase();
            if (name.startsWith('on') || name === 'srcdoc' || name === 'ping') invalidBackup('unsafe-html-attribute');
            if (name === 'srcset') invalidBackup('unsafe-html-attribute');
            if (name === 'style' && !isSafeStyle(attribute.value)) invalidBackup('unsafe-html-style');
            if (URL_ATTRIBUTES.has(name)) {
                const tagName = element.tagName.toLowerCase();
                const isResource = RESOURCE_URL_ATTRIBUTES.has(name)
                    || (name === 'href' && (tagName === 'image' || tagName === 'use'));
                if (!(isResource ? isSafeResourceUrl(attribute.value) : isSafeUrl(attribute.value))) {
                    invalidBackup('unsafe-html-url');
                }
            }
        }
    }
}

function assertSafeHtmlFallback(html) {
    const activeTagPattern = new RegExp(`<\\s*\\/?\\s*(?:${[...ACTIVE_HTML_TAGS].join('|')})(?:\\s|/?>)`, 'i');
    if (activeTagPattern.test(html)) invalidBackup('unsafe-html-tag');
    if (/\s(?:on[a-z0-9_-]+|srcdoc|ping)\s*=/i.test(html)) invalidBackup('unsafe-html-attribute');
    if (/\ssrcset\s*=/i.test(html)) invalidBackup('unsafe-html-attribute');

    for (const match of html.matchAll(/\s(href|src|xlink:href|action|formaction|poster|background)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
        const name = match[1].toLowerCase();
        const value = match[2] ?? match[3] ?? match[4] ?? '';
        const isResource = RESOURCE_URL_ATTRIBUTES.has(name);
        if (!(isResource ? isSafeResourceUrl(value) : isSafeUrl(value))) invalidBackup('unsafe-html-url');
    }
    for (const match of html.matchAll(/\sstyle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)) {
        if (!isSafeStyle(match[1] ?? match[2] ?? match[3] ?? '')) invalidBackup('unsafe-html-style');
    }
}

function assertSafeHtml(html, field) {
    if (html === undefined) return;
    assertString(html, field, { max: MAX_HTML_LENGTH });
    if (html.includes('\0')) invalidBackup('unsafe-html-null');
    if (typeof DOMParser === 'function') assertSafeHtmlWithDom(html);
    else assertSafeHtmlFallback(html);
}

function validateDocumentRecord(record, collection) {
    assertPlainRecord(record, collection);
    assertBoundedJson(record, collection);
    assertId(record.id, `${collection}-id`);
    for (const field of [
        'title', 'plainText', 'createdAt', 'updatedAt', 'trashedAt', 'expiresAt',
        'writingLanguage', 'frameType', 'subject', 'schoolYear',
    ]) {
        if (record[field] !== null) assertString(record[field], `${collection}-${field}`, { optional: true, max: 1000000 });
    }
    assertSafeHtml(record.html, `${collection}-html`);
    assertOptionalNumber(record.wordCount, `${collection}-wordCount`);
    if (record.folderIds !== undefined) {
        if (!Array.isArray(record.folderIds)) invalidBackup(`${collection}-folderIds`);
        const unique = new Set();
        for (const folderId of record.folderIds) {
            assertId(folderId, `${collection}-folderId`);
            if (unique.has(folderId)) invalidBackup(`${collection}-duplicate-folderId`);
            unique.add(folderId);
        }
    }
    if (record.references !== undefined) {
        if (!Array.isArray(record.references) || record.references.length > MAX_REFERENCES_PER_DOCUMENT) {
            invalidBackup(`${collection}-references`);
        }
        for (const reference of record.references) {
            assertPlainRecord(reference, `${collection}-reference`);
            for (const field of ['id', 'author', 'year', 'title', 'url', 'publisher', 'type']) {
                assertString(reference[field], `${collection}-reference-${field}`, { optional: true, max: 1000000 });
            }
        }
    }
    if (record.tags !== undefined) {
        if (!Array.isArray(record.tags) || record.tags.length > MAX_RECORD_ARRAY_LENGTH) invalidBackup(`${collection}-tags`);
        for (const tag of record.tags) assertString(tag, `${collection}-tag`, { max: 1000000 });
    }
    if (record.germanHint !== undefined) {
        assertPlainRecord(record.germanHint, `${collection}-germanHint`);
        assertString(record.germanHint.simple, `${collection}-germanHint-simple`, { optional: true, max: 1000000 });
        assertString(record.germanHint.rich, `${collection}-germanHint-rich`, { optional: true, max: 1000000 });
    }
}

function validateFolderRecord(folder) {
    assertPlainRecord(folder, 'folders');
    assertBoundedJson(folder, 'folders');
    assertId(folder.id, 'folder-id');
    assertString(folder.name, 'folder-name', { max: 1000 });
    if (folder.parentId !== undefined && folder.parentId !== null) assertId(folder.parentId, 'folder-parentId');
    assertOptionalBoolean(folder.isSystem, 'folder-isSystem');
    assertOptionalNumber(folder.sortOrder, 'folder-sortOrder');
    if (folder.schoolYear !== undefined && folder.schoolYear !== null) {
        assertString(folder.schoolYear, 'folder-schoolYear', { max: 1000 });
    }
    assertString(folder.createdAt, 'folder-createdAt', { optional: true, max: 1000 });
}

function validateVersionRecord(version) {
    assertPlainRecord(version, 'versions');
    assertBoundedJson(version, 'versions');
    if (version.id !== undefined
        && !(typeof version.id === 'string' || (Number.isInteger(version.id) && version.id >= 0))) {
        invalidBackup('version-id');
    }
    assertId(version.docId, 'version-docId');
    if (version.content === undefined && version.html === undefined) invalidBackup('version-content');
    assertSafeHtml(version.content, 'version-content');
    assertSafeHtml(version.html, 'version-html');
    assertOptionalNumber(version.timestamp, 'version-timestamp');
    assertOptionalNumber(version.wordCount, 'version-wordCount');
    assertOptionalBoolean(version.isMajor, 'version-isMajor');
    assertString(version.preview, 'version-preview', { optional: true, max: 1000000 });
}

function validateFolderGraph(folders) {
    const byId = new Map();
    for (const folder of folders) {
        if (byId.has(folder.id)) invalidBackup('duplicate-folder-id');
        byId.set(folder.id, folder);
    }

    const depthMemo = new Map();
    const visiting = new Set();
    const getDepth = (folderId) => {
        if (depthMemo.has(folderId)) return depthMemo.get(folderId);
        if (visiting.has(folderId)) invalidBackup('folder-cycle');
        visiting.add(folderId);
        const folder = byId.get(folderId);
        const parentId = folder?.parentId || null;
        if (parentId && !byId.has(parentId)) invalidBackup('missing-folder-parent');
        const depth = parentId ? getDepth(parentId) + 1 : 1;
        visiting.delete(folderId);
        if (depth > MAX_FOLDER_DEPTH) invalidBackup('folder-depth');
        depthMemo.set(folderId, depth);
        return depth;
    };
    for (const folder of folders) getDepth(folder.id);
    return { byId, depthMemo };
}

function validateBackupData(data) {
    if (!isPlainObject(data)) invalidBackup('data');
    for (const key of ['documents', 'trash', 'folders', 'versions']) {
        if (!Array.isArray(data[key])) invalidBackup(key);
    }
    if (data.documents.length > MAX_DOCUMENTS_PER_COLLECTION || data.trash.length > MAX_DOCUMENTS_PER_COLLECTION) {
        invalidBackup('document-count');
    }
    if (data.folders.length > MAX_FOLDERS) invalidBackup('folder-count');
    if (data.versions.length > MAX_VERSIONS) invalidBackup('version-count');

    const documentIds = new Set();
    for (const [collection, records] of [['documents', data.documents], ['trash', data.trash]]) {
        for (const record of records) {
            validateDocumentRecord(record, collection);
            if (documentIds.has(record.id)) invalidBackup('duplicate-document-id');
            documentIds.add(record.id);
        }
    }
    for (const folder of data.folders) validateFolderRecord(folder);
    for (const version of data.versions) validateVersionRecord(version);

    const { byId: foldersById } = validateFolderGraph(data.folders);
    for (const record of [...data.documents, ...data.trash]) {
        for (const folderId of record.folderIds || []) {
            if (!foldersById.has(folderId)) invalidBackup('missing-document-folder');
        }
    }

    if (data.settings === undefined || data.settings === null) data.settings = {};
    if (!isPlainObject(data.settings)) invalidBackup('settings');
    assertBoundedJson(data.settings, 'settings');
    for (const [key, value] of Object.entries(data.settings)) {
        if (typeof value !== 'string' || value.length > 1000000) invalidBackup(`setting-${key}`);
    }
    return data;
}

function requestAsPromise(request) {
    return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

function transactionDone(transaction) {
    return new Promise((resolve, reject) => {
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
        transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
    });
}

async function readStores(database, storeNames) {
    const available = storeNames.filter(name => database.objectStoreNames.contains(name));
    if (available.length !== storeNames.length) throw new Error('database-schema-incomplete');
    const transaction = database.transaction(available, 'readonly');
    const complete = transactionDone(transaction);
    const reads = available.map(name => requestAsPromise(transaction.objectStore(name).getAll()));
    const [values] = await Promise.all([Promise.all(reads), complete]);
    return Object.fromEntries(available.map((name, index) => [name, values[index] || []]));
}

function readSettings(storage) {
    const settings = {};
    for (const key of SETTINGS_KEYS) {
        const value = storage?.getItem(key);
        if (value !== null && value !== undefined) settings[key] = value;
    }
    return settings;
}

function canonicalize(value) {
    if (Array.isArray(value)) return value.map(canonicalize);
    if (isPlainObject(value)) {
        return Object.fromEntries(
            Object.keys(value).sort().map(key => [key, canonicalize(value[key])])
        );
    }
    return value;
}

function canonicalString(value) {
    return JSON.stringify(canonicalize(value));
}

function recordsEqual(left, right) {
    return canonicalString(left) === canonicalString(right);
}

function stableHash(value) {
    const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
    const hashes = seeds.map((seed) => {
        let hash = seed >>> 0;
        for (let index = 0; index < value.length; index++) {
            hash ^= value.charCodeAt(index);
            hash = Math.imul(hash, 0x01000193) >>> 0;
        }
        return hash.toString(16).padStart(8, '0');
    });
    return hashes.join('');
}

function stableConflictId(kind, source) {
    return `restored_${kind}_${stableHash(canonicalString(source))}`;
}

function conflictIdCandidate(baseId, attempt) {
    return attempt === 0 ? baseId : `${baseId}_${attempt + 1}`;
}

function conflictCandidateAttempt(baseId, candidateId) {
    if (candidateId === baseId) return 0;
    if (!candidateId.startsWith(`${baseId}_`)) return null;
    const suffix = candidateId.slice(baseId.length + 1);
    if (!/^\d+$/.test(suffix)) return null;
    const number = Number(suffix);
    return Number.isSafeInteger(number) && number >= 2 ? number - 1 : null;
}

function findVerifiedReplay(entries, baseId, matches) {
    const candidates = [];
    for (const [candidateId, value] of entries) {
        const attempt = conflictCandidateAttempt(baseId, candidateId);
        if (attempt !== null) candidates.push({ attempt, candidateId, value });
    }
    candidates.sort((left, right) => left.attempt - right.attempt);
    return candidates.find(candidate => matches(candidate.candidateId, candidate.value)) || null;
}

function firstAvailableConflictId(entries, baseId) {
    for (let attempt = 0; ; attempt++) {
        const candidateId = conflictIdCandidate(baseId, attempt);
        if (!entries.has(candidateId)) return candidateId;
    }
}

function folderDepth(folder, byId, memo = new Map()) {
    if (memo.has(folder.id)) return memo.get(folder.id);
    const parent = folder.parentId ? byId.get(folder.parentId) : null;
    const depth = parent ? folderDepth(parent, byId, memo) + 1 : 1;
    memo.set(folder.id, depth);
    return depth;
}

/**
 * Build a deterministic, non-overwriting plan for the document database.
 * Exported as a pure helper so conflict/retry behavior can be tested without
 * coupling tests to a particular IndexedDB mock.
 */
export function buildLibraryRestorePlan(data, existingData) {
    const existingFolders = existingData.folders || [];
    const existingFolderById = new Map(existingFolders.map(folder => [folder.id, folder]));
    const folderIdMap = new Map();
    const folderWrites = [];
    let foldersSkipped = 0;
    let folderConflicts = 0;

    const sourceFolderById = new Map(data.folders.map(folder => [folder.id, folder]));
    const depthMemo = new Map();
    const sortedFolders = [...data.folders].sort((left, right) => (
        folderDepth(left, sourceFolderById, depthMemo) - folderDepth(right, sourceFolderById, depthMemo)
        || left.id.localeCompare(right.id)
    ));

    for (const sourceFolder of sortedFolders) {
        const mappedParent = sourceFolder.parentId ? folderIdMap.get(sourceFolder.parentId) : null;
        const expectedAtOriginalId = {
            ...sourceFolder,
            parentId: mappedParent || null,
        };
        const existingAtOriginalId = existingFolderById.get(sourceFolder.id);

        if (existingAtOriginalId && (sourceFolder.isSystem || sourceFolder.id.startsWith('sys_'))) {
            // Deterministic system folders belong to the local installation.
            folderIdMap.set(sourceFolder.id, sourceFolder.id);
            foldersSkipped++;
            if (!recordsEqual(existingAtOriginalId, expectedAtOriginalId)) folderConflicts++;
            continue;
        }

        const baseId = stableConflictId('folder', sourceFolder);
        const replay = findVerifiedReplay(
            existingFolderById,
            baseId,
            (candidateId, occupied) => recordsEqual(occupied, {
                ...sourceFolder,
                id: candidateId,
                parentId: mappedParent || null,
            }),
        );
        if (replay) {
            folderIdMap.set(sourceFolder.id, replay.candidateId);
            foldersSkipped++;
            folderConflicts++;
            continue;
        }

        if (existingAtOriginalId && recordsEqual(existingAtOriginalId, expectedAtOriginalId)) {
            folderIdMap.set(sourceFolder.id, sourceFolder.id);
            foldersSkipped++;
            continue;
        }

        if (!existingAtOriginalId) {
            const restored = { ...sourceFolder, parentId: mappedParent || null };
            folderIdMap.set(sourceFolder.id, sourceFolder.id);
            folderWrites.push(restored);
            existingFolderById.set(sourceFolder.id, restored);
            continue;
        }

        const targetId = firstAvailableConflictId(existingFolderById, baseId);
        const restored = {
            ...sourceFolder,
            id: targetId,
            parentId: mappedParent || null,
        };
        folderIdMap.set(sourceFolder.id, targetId);
        folderWrites.push(restored);
        existingFolderById.set(targetId, restored);
        folderConflicts++;
    }

    const existingEntries = new Map();
    for (const [storeName, records] of [['documents', existingData.documents || []], ['trash', existingData.trash || []]]) {
        for (const record of records) existingEntries.set(record.id, { storeName, record });
    }

    const documentIdMap = new Map();
    const documentWrites = [];
    const trashWrites = [];
    let imported = 0;
    let skipped = 0;
    let conflicts = 0;

    for (const [storeName, records] of [['documents', data.documents], ['trash', data.trash]]) {
        for (const sourceRecord of records) {
            const remapped = {
                ...sourceRecord,
                folderIds: (sourceRecord.folderIds || []).map(folderId => folderIdMap.get(folderId)),
            };
            const existingAtOriginalId = existingEntries.get(sourceRecord.id);
            const baseId = stableConflictId(`document_${storeName}`, sourceRecord);
            const replay = findVerifiedReplay(
                existingEntries,
                baseId,
                (candidateId, occupied) => occupied.storeName === storeName
                    && recordsEqual(occupied.record, {
                        ...remapped,
                        id: candidateId,
                        title: `${remapped.title || 'Uten tittel'} (gjenopprettet)`,
                    }),
            );
            if (replay) {
                documentIdMap.set(sourceRecord.id, replay.candidateId);
                skipped++;
                conflicts++;
                continue;
            }

            if (existingAtOriginalId
                && existingAtOriginalId.storeName === storeName
                && recordsEqual(existingAtOriginalId.record, remapped)) {
                documentIdMap.set(sourceRecord.id, sourceRecord.id);
                skipped++;
                continue;
            }

            const hasConflict = !!existingAtOriginalId;
            if (!hasConflict) {
                documentIdMap.set(sourceRecord.id, sourceRecord.id);
                existingEntries.set(sourceRecord.id, { storeName, record: remapped });
                (storeName === 'documents' ? documentWrites : trashWrites).push(remapped);
                imported++;
                continue;
            }

            const targetId = firstAvailableConflictId(existingEntries, baseId);
            const restored = {
                ...remapped,
                id: targetId,
                title: `${remapped.title || 'Uten tittel'} (gjenopprettet)`,
            };
            documentIdMap.set(sourceRecord.id, targetId);
            existingEntries.set(targetId, { storeName, record: restored });
            (storeName === 'documents' ? documentWrites : trashWrites).push(restored);
            imported++;
            conflicts++;
        }
    }

    return {
        folderWrites,
        documentWrites,
        trashWrites,
        folderIdMap,
        documentIdMap,
        imported,
        skipped,
        conflicts,
        foldersImported: folderWrites.length,
        foldersSkipped,
        folderConflicts,
    };
}

function versionSignature(version) {
    const { id: _id, ...withoutId } = version;
    return canonicalString(withoutId);
}

/** Build an idempotent version-import plan for mapped document IDs. */
export function buildVersionRestorePlan(versions, documentIdMap, existingVersions) {
    const signatures = new Set(existingVersions.map(versionSignature));
    const writes = [];
    let skipped = 0;
    let orphaned = 0;

    for (const source of versions) {
        const mappedDocId = documentIdMap.get(source.docId);
        if (!mappedDocId) {
            orphaned++;
            continue;
        }
        const { id: _discardedId, ...copy } = source;
        const restored = { ...copy, docId: mappedDocId };
        if (restored.content === undefined && typeof restored.html === 'string') {
            restored.content = restored.html;
        }
        const signature = versionSignature(restored);
        if (signatures.has(signature)) {
            skipped++;
            continue;
        }
        signatures.add(signature);
        writes.push(restored);
    }
    return { writes, imported: writes.length, skipped, orphaned };
}

export function serializeLibraryBackup(data, options = {}) {
    return JSON.stringify({
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        createdAt: options.createdAt || new Date().toISOString(),
        data: {
            documents: Array.isArray(data.documents) ? data.documents : [],
            trash: Array.isArray(data.trash) ? data.trash : [],
            folders: Array.isArray(data.folders) ? data.folders : [],
            versions: Array.isArray(data.versions) ? data.versions : [],
            settings: data.settings && typeof data.settings === 'object' ? data.settings : {},
        },
    });
}

export function parseLibraryBackup(text) {
    if (typeof text !== 'string' || text.length > MAX_BACKUP_TEXT_LENGTH) invalidBackup('size');
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch {
        throw new Error('invalid-json');
    }

    if (parsed?.format !== BACKUP_FORMAT || parsed?.version !== BACKUP_VERSION) {
        throw new Error('unsupported-backup');
    }
    if (!parsed.data || typeof parsed.data !== 'object') invalidBackup('data');
    validateBackupData(parsed.data);
    return parsed;
}

async function collectLibraryData(storage) {
    const documentDb = await openSkrivDatabase();
    const documentData = await readStores(documentDb, DOCUMENT_STORES);
    const versionDb = await openVersionHistoryDatabase();
    try {
        const versionData = await readStores(versionDb, [VERSION_HISTORY_STORE_NAME]);
        return {
            documents: documentData.documents,
            trash: documentData.trash,
            folders: documentData.folders,
            versions: versionData[VERSION_HISTORY_STORE_NAME],
            settings: readSettings(storage),
        };
    } finally {
        versionDb.close();
    }
}

async function mergeDocumentData(data) {
    const db = await openSkrivDatabase();
    const existing = await readStores(db, DOCUMENT_STORES);
    const plan = buildLibraryRestorePlan(data, existing);
    const writeCount = plan.folderWrites.length + plan.documentWrites.length + plan.trashWrites.length;

    if (writeCount > 0) {
        const transaction = db.transaction(DOCUMENT_STORES, 'readwrite');
        const complete = transactionDone(transaction);
        const folders = transaction.objectStore('folders');
        const documents = transaction.objectStore('documents');
        const trash = transaction.objectStore('trash');
        for (const folder of plan.folderWrites) folders.add(folder);
        for (const document of plan.documentWrites) documents.add(document);
        for (const document of plan.trashWrites) trash.add(document);
        await complete;
    }

    return plan;
}

async function mergeVersions(versions, documentIdMap) {
    const db = await openVersionHistoryDatabase();
    try {
        const existing = await readStores(db, [VERSION_HISTORY_STORE_NAME]);
        const plan = buildVersionRestorePlan(
            versions,
            documentIdMap,
            existing[VERSION_HISTORY_STORE_NAME]
        );
        if (plan.writes.length > 0) {
            const transaction = db.transaction(VERSION_HISTORY_STORE_NAME, 'readwrite');
            const complete = transactionDone(transaction);
            const store = transaction.objectStore(VERSION_HISTORY_STORE_NAME);
            for (const version of plan.writes) store.add(version);
            await complete;
        }
        return plan;
    } finally {
        db.close();
    }
}

function restoreSettings(settings, storage) {
    const previous = new Map();
    const applied = [];
    try {
        for (const key of SETTINGS_KEYS) {
            if (typeof settings[key] !== 'string') continue;
            previous.set(key, storage?.getItem(key) ?? null);
            storage?.setItem(key, settings[key]);
            applied.push(key);
        }
    } catch (error) {
        for (const key of applied.reverse()) {
            try {
                const oldValue = previous.get(key);
                if (oldValue === null) storage?.removeItem(key);
                else storage?.setItem(key, oldValue);
            } catch { /* best-effort rollback */ }
        }
        throw error;
    }
}

export class LibraryRestorePartialError extends Error {
    constructor(result, cause) {
        super('partial-restore');
        this.name = 'LibraryRestorePartialError';
        this.code = 'partial-restore';
        this.result = result;
        this.cause = cause;
        this.canRetry = true;
        this.phases = result.phases;
    }
}

function publicDocumentResult(plan) {
    return {
        imported: plan.imported,
        skipped: plan.skipped,
        conflicts: plan.conflicts,
        foldersImported: plan.foldersImported,
        foldersSkipped: plan.foldersSkipped,
        folderConflicts: plan.folderConflicts,
    };
}

export function initLibraryBackup(options = {}) {
    let destroyed = false;
    const storage = options.storage ?? globalThis.localStorage;
    const collectData = options.collectLibraryData || collectLibraryData;
    const mergeDocuments = options.mergeDocumentData || mergeDocumentData;
    const mergeVersionData = options.mergeVersions || mergeVersions;
    const applySettings = options.restoreSettings || restoreSettings;

    async function createBackupBlob() {
        if (destroyed) throw new Error('backup-destroyed');
        // A version-history read failure must fail the entire export. Returning
        // a superficially successful backup without its snapshots is unsafe.
        const data = await collectData(storage);
        return new Blob([serializeLibraryBackup(data)], { type: 'application/json;charset=utf-8' });
    }

    async function downloadBackup() {
        const blob = await createBackupBlob();
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        const date = new Date().toISOString().slice(0, 10);
        try {
            anchor.href = url;
            anchor.download = `papertek-skriv-${date}.skriv`;
            document.body.appendChild(anchor);
            anchor.click();
        } finally {
            try {
                anchor.remove();
            } finally {
                // Safari may not start consuming the object URL until after
                // the synthetic click task has completed.
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        }
    }

    async function restoreFromText(text) {
        if (destroyed) throw new Error('backup-destroyed');
        const backup = parseLibraryBackup(text);
        const phases = { documents: 'pending', versions: 'pending', settings: 'pending' };

        const documentPlan = await mergeDocuments(backup.data);
        phases.documents = 'complete';
        const result = {
            status: 'partial',
            canRetry: true,
            phases,
            ...publicDocumentResult(documentPlan),
            versions: 0,
            versionsSkipped: 0,
            versionOrphans: 0,
        };

        try {
            const versionPlan = await mergeVersionData(backup.data.versions, documentPlan.documentIdMap);
            phases.versions = 'complete';
            result.versions = versionPlan.imported;
            result.versionsSkipped = versionPlan.skipped;
            result.versionOrphans = versionPlan.orphaned;
        } catch (error) {
            phases.versions = 'failed';
            throw new LibraryRestorePartialError(result, error);
        }

        try {
            await applySettings(backup.data.settings, storage);
            phases.settings = 'complete';
        } catch (error) {
            phases.settings = 'failed';
            throw new LibraryRestorePartialError(result, error);
        }

        result.status = 'complete';
        result.canRetry = false;
        return result;
    }

    async function requestPersistentStorage() {
        if (!navigator.storage?.persist) return false;
        return navigator.storage.persist();
    }

    async function getStorageEstimate() {
        if (!navigator.storage?.estimate) return null;
        return navigator.storage.estimate();
    }

    return {
        createBackupBlob,
        downloadBackup,
        restoreFromText,
        requestPersistentStorage,
        getStorageEstimate,
        destroy() { destroyed = true; },
    };
}
