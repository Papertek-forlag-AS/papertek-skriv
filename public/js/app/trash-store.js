/**
 * Trash Store — soft-delete with restore for documents.
 * Deleted documents live in a separate IndexedDB store for 30 days.
 * After 30 days they are permanently purged on next app load.
 *
 * Portable: this module has no dependencies on other app modules.
 * It only needs a document object with an `id` property.
 *
 * Usage:
 *   import { trashDocument, restoreDocument, listTrashedDocuments,
 *            permanentlyDelete, purgeExpired } from './trash-store.js';
 */

const DB_NAME = 'skriv-documents';
const DB_VERSION = 4;                // v4: folders store + folderIds on documents
const DOCS_STORE = 'documents';
const TRASH_STORE = 'trash';
const PERSONAL_FOLDER_NAME = '__personal__';
const RETENTION_DAYS = 30;

let _db = null;

/**
 * Open (or upgrade) the IndexedDB database.
 * Creates the `trash` object store if it doesn't exist.
 */
function openDB() {
    if (_db) return Promise.resolve(_db);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // If blocked for more than 3s, reload to clear stale connections
        let blockedTimer = null;
        request.onblocked = () => {
            console.warn('[trash-store] DB upgrade blocked — closing stale connections');
            if (_db) { _db.close(); _db = null; }
            blockedTimer = setTimeout(() => {
                console.warn('[trash-store] DB still blocked after 3s — reloading');
                window.location.reload();
            }, 3000);
        };

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            const tx = e.target.transaction;

            // Original documents store (created in v1)
            if (!db.objectStoreNames.contains(DOCS_STORE)) {
                const store = db.createObjectStore(DOCS_STORE, { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }

            // New trash store (v2)
            if (!db.objectStoreNames.contains(TRASH_STORE)) {
                const trashStore = db.createObjectStore(TRASH_STORE, { keyPath: 'id' });
                trashStore.createIndex('trashedAt', 'trashedAt', { unique: false });
            }

            // v3: subject + schoolYear indexes on documents
            if (e.oldVersion < 3) {
                const store = tx.objectStore(DOCS_STORE);
                if (!store.indexNames.contains('subject')) {
                    store.createIndex('subject', 'subject', { unique: false });
                }
                if (!store.indexNames.contains('schoolYear')) {
                    store.createIndex('schoolYear', 'schoolYear', { unique: false });
                }
            }
            // v4: folders store + folderIds on documents
            if (e.oldVersion < 4) {
                _runV4Migration(db, tx);
            }
        };

        request.onsuccess = (e) => {
            if (blockedTimer) clearTimeout(blockedTimer);
            _db = e.target.result;
            // Close this connection if another tab/module requests a version upgrade
            _db.onversionchange = () => {
                _db.close();
                _db = null;
            };
            resolve(_db);
        };

        request.onerror = (e) => {
            if (blockedTimer) clearTimeout(blockedTimer);
            console.error('IndexedDB open failed:', e.target.error);
            reject(e.target.error);
        };
    });
}

/**
 * DB v4 migration — creates folders store, seeds folders, sets folderIds.
 * Duplicated in document-store.js, trash-store.js, and folder-store.js.
 */
function _runV4Migration(db, tx) {
    const now = new Date().toISOString();
    const nameToId = new Map();

    function normName(n) {
        return n.toLowerCase()
            .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
            .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }

    if (!db.objectStoreNames.contains('folders')) {
        const fs = db.createObjectStore('folders', { keyPath: 'id' });
        fs.createIndex('parentId', 'parentId', { unique: false });
        fs.createIndex('schoolYear', 'schoolYear', { unique: false });
    }

    const docStore = tx.objectStore(DOCS_STORE);
    if (!docStore.indexNames.contains('folderIds')) {
        docStore.createIndex('folderIds', 'folderIds', { unique: false, multiEntry: true });
    }

    const foldersStore = tx.objectStore('folders');

    function addFolder(id, name, isSystem, sortOrder) {
        nameToId.set(name, id);
        const req = foldersStore.add({
            id, name, parentId: null, isSystem,
            schoolYear: null, sortOrder, createdAt: now,
        });
        req.onerror = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    }

    addFolder('sys___personal__', PERSONAL_FOLDER_NAME, true, 0);

    const SUBJECTS = [
        'Engelsk', 'Fremmedspråk', 'Geografi', 'Historie', 'IT', 'KRLE',
        'Kroppsøving', 'Kunst og håndverk', 'Matematikk', 'Musikk',
        'Naturfag', 'Norsk', 'Religion og etikk', 'Samfunnsfag', 'Samfunnskunnskap',
    ];
    SUBJECTS.forEach((name, i) => addFolder('sys_' + normName(name), name, true, i + 1));

    try {
        const raw = localStorage.getItem('skriv_custom_subjects');
        const customs = raw ? JSON.parse(raw) : [];
        customs.forEach((name, i) => {
            if (!nameToId.has(name)) {
                addFolder('cust_' + normName(name), name, false, 100 + i);
            }
        });
    } catch (_) { /* ignore */ }

    docStore.openCursor().onsuccess = (ev) => {
        const cursor = ev.target.result;
        if (!cursor) return;
        try {
            const doc = cursor.value;
            if (doc.folderIds !== undefined) { cursor.continue(); return; }
            const fid = doc.subject ? nameToId.get(doc.subject) : null;
            doc.folderIds = fid ? [fid] : [];
            cursor.update(doc);
        } catch (_) { /* skip */ }
        cursor.continue();
    };

    if (db.objectStoreNames.contains(TRASH_STORE)) {
        const trashStore = tx.objectStore(TRASH_STORE);
        trashStore.openCursor().onsuccess = (ev) => {
            const cursor = ev.target.result;
            if (!cursor) return;
            try {
                const doc = cursor.value;
                if (doc.folderIds !== undefined) { cursor.continue(); return; }
                const fid = doc.subject ? nameToId.get(doc.subject) : null;
                doc.folderIds = fid ? [fid] : [];
                cursor.update(doc);
            } catch (_) { /* skip */ }
            cursor.continue();
        };
    }
}

/**
 * Move a document to the trash.
 * The document is removed from the documents store and placed in trash.
 * @param {Object} doc - The full document object (must have .id)
 * @returns {Promise<Object>} The trashed document with metadata
 */
export async function trashDocument(doc) {
    const db = await openDB();
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + RETENTION_DAYS * 86400000).toISOString();

    const trashedDoc = {
        ...doc,
        trashedAt: now,
        expiresAt: expiresAt,
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction([DOCS_STORE, TRASH_STORE], 'readwrite');

        // Remove from documents
        tx.objectStore(DOCS_STORE).delete(doc.id);

        // Add to trash
        tx.objectStore(TRASH_STORE).put(trashedDoc);

        tx.oncomplete = () => resolve(trashedDoc);
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Restore a document from trash back to the documents store.
 * @param {string} id - The document ID to restore
 * @returns {Promise<Object>} The restored document
 */
export async function restoreDocument(id) {
    const db = await openDB();

    // Get the trashed document
    const trashedDoc = await new Promise((resolve, reject) => {
        const tx = db.transaction(TRASH_STORE, 'readonly');
        const request = tx.objectStore(TRASH_STORE).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (e) => reject(e.target.error);
    });

    if (!trashedDoc) throw new Error(`Trashed document ${id} not found`);

    // Remove trash metadata
    const { trashedAt, expiresAt, ...restoredDoc } = trashedDoc;
    restoredDoc.updatedAt = new Date().toISOString();

    return new Promise((resolve, reject) => {
        const tx = db.transaction([DOCS_STORE, TRASH_STORE], 'readwrite');

        // Add back to documents
        tx.objectStore(DOCS_STORE).put(restoredDoc);

        // Remove from trash
        tx.objectStore(TRASH_STORE).delete(id);

        tx.oncomplete = () => resolve(restoredDoc);
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * List all trashed documents, sorted by trashedAt descending (newest first).
 * @returns {Promise<Array>} Array of trashed documents
 */
export async function listTrashedDocuments() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(TRASH_STORE, 'readonly');
        const request = tx.objectStore(TRASH_STORE).getAll();

        request.onsuccess = () => {
            const docs = request.result || [];
            docs.sort((a, b) => (b.trashedAt || '').localeCompare(a.trashedAt || ''));
            resolve(docs);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Permanently delete a document from trash. Cannot be undone.
 * @param {string} id - The document ID to permanently delete
 */
export async function permanentlyDelete(id) {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(TRASH_STORE, 'readwrite');
        tx.objectStore(TRASH_STORE).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Permanently delete all documents from trash. Cannot be undone.
 */
export async function emptyTrash() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(TRASH_STORE, 'readwrite');
        tx.objectStore(TRASH_STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get the count of documents currently in trash.
 * @returns {Promise<number>}
 */
export async function getTrashCount() {
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(TRASH_STORE, 'readonly');
        const request = tx.objectStore(TRASH_STORE).count();
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Purge documents that have been in trash longer than RETENTION_DAYS.
 * Call this on app startup.
 * @returns {Promise<number>} Number of documents purged
 */
export async function purgeExpired() {
    const db = await openDB();
    const now = new Date().toISOString();

    const allTrashed = await listTrashedDocuments();
    const expired = allTrashed.filter(doc => doc.expiresAt && doc.expiresAt < now);

    if (expired.length === 0) return 0;

    return new Promise((resolve, reject) => {
        const tx = db.transaction(TRASH_STORE, 'readwrite');
        const store = tx.objectStore(TRASH_STORE);

        expired.forEach(doc => store.delete(doc.id));

        tx.oncomplete = () => resolve(expired.length);
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get the retention period in days.
 * @returns {number}
 */
export function getRetentionDays() {
    return RETENTION_DAYS;
}
