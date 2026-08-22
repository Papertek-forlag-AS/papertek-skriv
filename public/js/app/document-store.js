/**
 * Document storage using IndexedDB.
 * Stores documents locally in the browser — no server, no login.
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
 */
export async function saveDocument(id, updates) {
    const db = await openSkrivDatabase();
    const existing = await getDocument(id);
    if (!existing) throw new Error(`Document ${id} not found`);

    const updated = {
        ...existing,
        ...updates,
        id, // never overwrite ID
        updatedAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(updated);
        tx.oncomplete = () => resolve(updated);
        tx.onerror = (e) => reject(e.target.error);
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
