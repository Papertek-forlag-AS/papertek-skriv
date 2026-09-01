/**
 * Document storage using IndexedDB.
 * Stores documents locally in the browser. The optional Microsoft connector
 * may keep a linked copy elsewhere, but this store remains authoritative for
 * every writing save and never depends on a login or network connection.
 *
 * Each document: { id, title, html, plainText, wordCount, writingLanguage, createdAt, updatedAt, subject, schoolYear }
 */

import { getCurrentSchoolYear } from './folder-store.js';
import { getCurrentLanguage } from '../editor-core/shared/i18n.js';
import { openSkrivDatabase } from './db.js';

const STORE_NAME = 'documents';

/** Languages supported by Skriv's per-document writing-language setting. */
export const DOCUMENT_WRITING_LANGUAGES = Object.freeze(['nb', 'nn', 'en', 'de', 'es', 'fr']);

/**
 * Return a supported document language, falling back predictably.
 * Kept as a small pure helper so imports and older IndexedDB records can use
 * the same compatibility rule without requiring a database migration.
 */
export function normalizeWritingLanguage(value, fallback = 'nb') {
    if (DOCUMENT_WRITING_LANGUAGES.includes(value)) return value;
    if (DOCUMENT_WRITING_LANGUAGES.includes(fallback)) return fallback;
    return 'nb';
}

/**
 * Resolve the language for a document, including records created before the
 * writingLanguage field existed. Legacy German-task documents have a strong
 * language signal; other records use the supplied fallback.
 */
export function getDocumentWritingLanguage(doc, fallback = 'nb') {
    const legacyGerman = !!(doc?.germanHint && (doc.germanHint.simple || doc.germanHint.rich));
    const inferred = doc?.writingLanguage || (legacyGerman ? 'de' : fallback);
    return normalizeWritingLanguage(inferred, fallback);
}

function withDocumentDefaults(doc) {
    if (!doc) return doc;
    return {
        ...doc,
        writingLanguage: getDocumentWritingLanguage(doc),
    };
}

function hasSameStoredValue(left, right) {
    if (Object.is(left, right)) return true;
    if (Array.isArray(left) || Array.isArray(right)) {
        return Array.isArray(left) && Array.isArray(right)
            && left.length === right.length
            && left.every((value, index) => hasSameStoredValue(value, right[index]));
    }
    if (!left || !right || typeof left !== 'object' || typeof right !== 'object') {
        return false;
    }

    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    return leftKeys.length === rightKeys.length
        && leftKeys.every((key, index) => key === rightKeys[index]
            && hasSameStoredValue(left[key], right[key]));
}

/**
 * Generate a short unique ID.
 */
function generateId() {
    return crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Create a new document. Returns the document object.
 * @param {string} title
 * @param {{ writingLanguage?: string }} [options]
 */
export async function createDocument(title = '', options = {}) {
    const db = await openSkrivDatabase();
    const now = new Date().toISOString();

    const doc = {
        id: generateId(),
        title: title,
        html: '',
        plainText: '',
        wordCount: 0,
        writingLanguage: normalizeWritingLanguage(options.writingLanguage, getCurrentLanguage()),
        subject: null,
        folderIds: [],
        schoolYear: getCurrentSchoolYear(),
        createdAt: now,
        updatedAt: now,
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(doc);
        tx.oncomplete = () => resolve(doc);
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get a document by ID.
 */
export async function getDocument(id) {
    const db = await openSkrivDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(withDocumentDefaults(request.result || null));
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Save (update) a document. Merges provided fields with existing doc.
 * Metadata-only integrations may preserve the writing timestamp so a remote
 * acknowledgement does not make the document look locally edited again.
 *
 * The read and write share one transaction so metadata acknowledgements can
 * never overwrite a newer autosave or resurrect a document moved to trash.
 * `expectedFields` provides an optional compare-and-swap guard for integrations
 * whose asynchronous work may have been superseded. A failed guard resolves
 * to `null` without writing.
 *
 * @param {string} id
 * @param {Object} updates
 * @param {{ preserveUpdatedAt?: boolean, expectedFields?: Object }} [options]
 */
export async function saveDocument(id, updates, options = {}) {
    const db = await openSkrivDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(id);
        let updated = null;
        let failure = null;

        request.onsuccess = () => {
            const rawExisting = request.result || null;
            if (!rawExisting) {
                failure = new Error(`Document ${id} not found`);
                tx.abort();
                return;
            }

            const expectedFields = options.expectedFields;
            if (expectedFields && typeof expectedFields === 'object') {
                const unchanged = Object.entries(expectedFields).every(
                    ([key, value]) => hasSameStoredValue(rawExisting[key], value),
                );
                if (!unchanged) return;
            }

            const existing = withDocumentDefaults(rawExisting);
            updated = {
                ...existing,
                ...updates,
                id, // never overwrite ID
                updatedAt: options.preserveUpdatedAt
                    ? existing.updatedAt
                    : new Date().toISOString(),
            };
            store.put(updated);
        };
        request.onerror = (event) => {
            failure = event.target.error;
        };
        tx.oncomplete = () => resolve(updated);
        tx.onerror = (event) => reject(failure || event.target.error);
        tx.onabort = (event) => reject(failure || event.target.error || tx.error);
    });
}

/**
 * List all documents, sorted by updatedAt descending (newest first).
 */
export async function listDocuments() {
    const db = await openSkrivDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const docs = (request.result || []).map(withDocumentDefaults);
            docs.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
            resolve(docs);
        };
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Delete a document by ID.
 */
export async function deleteDocument(id) {
    const db = await openSkrivDatabase();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}
