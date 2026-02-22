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
const DB_VERSION = 2;                // Bumped from 1 to add trash store
const DOCS_STORE = 'documents';
const TRASH_STORE = 'trash';
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

        request.onupgradeneeded = (e) => {
            const db = e.target.result;

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
        };

        request.onsuccess = (e) => {
            _db = e.target.result;
            resolve(_db);
        };

        request.onerror = (e) => {
            console.error('IndexedDB open failed:', e.target.error);
            reject(e.target.error);
        };
    });
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
