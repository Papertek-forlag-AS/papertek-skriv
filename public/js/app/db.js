/**
 * Single IndexedDB entry point for documents, trash, and folders.
 *
 * Every app store must open `skriv-documents` through this module so the full
 * migration chain runs regardless of which screen touches storage first.
 */

export const DB_NAME = 'skriv-documents';
export const DB_VERSION = 4;

const DOCUMENTS_STORE = 'documents';
const TRASH_STORE = 'trash';
const FOLDERS_STORE = 'folders';
const PERSONAL_FOLDER_NAME = '__personal__';

const SYSTEM_SUBJECTS = [
    'Engelsk', 'Fremmedspråk', 'Geografi', 'Historie', 'IT', 'KRLE',
    'Kroppsøving', 'Kunst og håndverk', 'Matematikk', 'Musikk',
    'Naturfag', 'Norsk', 'Religion og etikk', 'Samfunnsfag', 'Samfunnskunnskap',
];

let database = null;
let opening = null;
let openGeneration = 0;

export function normalizeFolderName(name) {
    return String(name || '').toLowerCase()
        .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

export function getSchoolYearLabel(value = new Date()) {
    const date = value instanceof Date ? value : new Date(value);
    const validDate = Number.isNaN(date.getTime()) ? new Date() : date;
    const startYear = validDate.getMonth() < 7
        ? validDate.getFullYear() - 1
        : validDate.getFullYear();
    return `${startYear}/${startYear + 1}`;
}

function ensureIndex(store, name, keyPath, options = {}) {
    if (!store.indexNames.contains(name)) store.createIndex(name, keyPath, options);
}

function createBaseStores(db) {
    if (!db.objectStoreNames.contains(DOCUMENTS_STORE)) {
        const documents = db.createObjectStore(DOCUMENTS_STORE, { keyPath: 'id' });
        documents.createIndex('updatedAt', 'updatedAt', { unique: false });
    }
    if (!db.objectStoreNames.contains(TRASH_STORE)) {
        const trash = db.createObjectStore(TRASH_STORE, { keyPath: 'id' });
        trash.createIndex('trashedAt', 'trashedAt', { unique: false });
    }
}

function runV3Migration(transaction) {
    const documents = transaction.objectStore(DOCUMENTS_STORE);
    ensureIndex(documents, 'subject', 'subject', { unique: false });
    ensureIndex(documents, 'schoolYear', 'schoolYear', { unique: false });
}

function readLegacyCustomSubjects() {
    try {
        const raw = globalThis.localStorage?.getItem('skriv_custom_subjects');
        const values = raw ? JSON.parse(raw) : [];
        return Array.isArray(values) ? values.filter((value) => typeof value === 'string') : [];
    } catch {
        return [];
    }
}

function runV4Migration(db, transaction) {
    if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        const folders = db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
        folders.createIndex('parentId', 'parentId', { unique: false });
        folders.createIndex('schoolYear', 'schoolYear', { unique: false });
    }

    const documents = transaction.objectStore(DOCUMENTS_STORE);
    ensureIndex(documents, 'folderIds', 'folderIds', { unique: false, multiEntry: true });

    const folders = transaction.objectStore(FOLDERS_STORE);
    ensureIndex(folders, 'parentId', 'parentId', { unique: false });
    ensureIndex(folders, 'schoolYear', 'schoolYear', { unique: false });

    const now = new Date().toISOString();
    const nameToId = new Map();
    const addFolder = (id, name, isSystem, sortOrder) => {
        nameToId.set(name, id);
        const request = folders.add({
            id,
            name,
            parentId: null,
            isSystem,
            schoolYear: null,
            sortOrder,
            createdAt: now,
        });
        request.onerror = (event) => {
            // A partially completed historical migration may already contain
            // this deterministic key. Only that known-safe collision may be
            // ignored; quota and browser failures must abort the migration.
            if (request.error?.name === 'ConstraintError') {
                event.preventDefault();
                event.stopPropagation();
            }
        };
    };

    addFolder('sys___personal__', PERSONAL_FOLDER_NAME, true, 0);
    SYSTEM_SUBJECTS.forEach((name, index) => {
        addFolder(`sys_${normalizeFolderName(name)}`, name, true, index + 1);
    });
    readLegacyCustomSubjects().forEach((name, index) => {
        if (!nameToId.has(name)) {
            addFolder(`cust_${normalizeFolderName(name)}`, name, false, 100 + index);
        }
    });

    // One cursor owns the full record backfill. Running separate v3 and v4
    // cursors can overwrite each other's updates when upgrading v1/v2 data.
    const backfillRecord = (store) => {
        store.openCursor().onsuccess = (event) => {
            const cursor = event.target.result;
            if (!cursor) return;
            const record = cursor.value;
            let changed = false;
            if (record.subject === undefined) {
                record.subject = null;
                changed = true;
            }
            if (!record.schoolYear) {
                record.schoolYear = getSchoolYearLabel(record.createdAt);
                changed = true;
            }
            if (record.folderIds === undefined) {
                const folderId = record.subject ? nameToId.get(record.subject) : null;
                record.folderIds = folderId ? [folderId] : [];
                changed = true;
            }
            if (changed) cursor.update(record);
            cursor.continue();
        };
    };

    backfillRecord(documents);
    if (db.objectStoreNames.contains(TRASH_STORE)) {
        backfillRecord(transaction.objectStore(TRASH_STORE));
    }
}

function repairCurrentRecords(db) {
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(
            [DOCUMENTS_STORE, TRASH_STORE, FOLDERS_STORE],
            'readwrite',
        );
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(
            transaction.error || new Error('IndexedDB repair transaction aborted'),
        );

        // Older v4 bundles had three competing upgrade handlers. The schema
        // is sound, but one cursor could overwrite another cursor's backfill.
        // Repair the data at open time without triggering a schema upgrade in
        // another tab that may still contain unsaved writing.
        const foldersRequest = transaction.objectStore(FOLDERS_STORE).getAll();
        foldersRequest.onsuccess = () => {
            const folderIdByName = new Map(
                (foldersRequest.result || []).map((folder) => [folder.name, folder.id]),
            );

            const repairStore = (store) => {
                store.openCursor().onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (!cursor) return;
                    const record = cursor.value;
                    let changed = false;
                    if (record.subject === undefined) {
                        record.subject = null;
                        changed = true;
                    }
                    if (!record.schoolYear) {
                        record.schoolYear = getSchoolYearLabel(record.createdAt);
                        changed = true;
                    }
                    if (!Array.isArray(record.folderIds)) {
                        const legacyFolderId = record.subject
                            ? folderIdByName.get(record.subject)
                            : null;
                        record.folderIds = legacyFolderId ? [legacyFolderId] : [];
                        changed = true;
                    }
                    if (changed) cursor.update(record);
                    cursor.continue();
                };
            };

            repairStore(transaction.objectStore(DOCUMENTS_STORE));
            repairStore(transaction.objectStore(TRASH_STORE));
        };
    });
}

export function upgradeSkrivDatabase(event) {
    const db = event.target.result;
    const transaction = event.target.transaction;
    createBaseStores(db);
    if (event.oldVersion < 3) runV3Migration(transaction);
    if (event.oldVersion < 4) runV4Migration(db, transaction);
}

function flushAndCloseForVersionChange(connection) {
    const pending = [];
    const waitUntil = (promise) => pending.push(Promise.resolve(promise));
    const target = globalThis.document;

    if (target && typeof globalThis.CustomEvent === 'function') {
        target.dispatchEvent(new CustomEvent('skriv:before-app-reload', {
            detail: { waitUntil },
        }));
    }

    Promise.all(pending).then(() => {
        connection.close();
        if (database === connection) database = null;
        openGeneration += 1;
        opening = null;
        globalThis.location?.reload?.();
    }).catch((error) => {
        console.error('[db] Could not save before database upgrade:', error);
        if (target && typeof globalThis.CustomEvent === 'function') {
            target.dispatchEvent(new CustomEvent('skriv:app-reload-cancelled'));
        }
        // Keep the connection open. Blocking a new schema is safer than
        // stranding a dirty editor on an incompatible older bundle.
    });
}

export function openSkrivDatabase() {
    if (database) return Promise.resolve(database);
    if (opening) return opening;

    const generation = openGeneration;
    opening = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = upgradeSkrivDatabase;
        request.onblocked = () => {
            console.warn('[db] Upgrade is waiting for another Skriv tab to close its database connection.');
            if (globalThis.document && typeof globalThis.CustomEvent === 'function') {
                document.dispatchEvent(new CustomEvent('skriv:database-blocked'));
            }
        };
        request.onsuccess = () => {
            if (generation !== openGeneration) {
                request.result.close();
                reject(new Error('database-open-cancelled'));
                return;
            }

            database = request.result;
            const connection = database;
            database.onversionchange = () => flushAndCloseForVersionChange(connection);
            repairCurrentRecords(connection).then(() => {
                resolve(connection);
            }).catch((error) => {
                connection.close();
                if (database === connection) database = null;
                if (generation === openGeneration) opening = null;
                reject(error);
            });
        };
        request.onerror = () => {
            if (generation === openGeneration) opening = null;
            reject(request.error);
        };
    });

    return opening;
}

export function closeSkrivDatabase() {
    openGeneration += 1;
    database?.close();
    database = null;
    opening = null;
}
