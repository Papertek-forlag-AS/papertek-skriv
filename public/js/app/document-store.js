/**
 * Document storage using IndexedDB.
 * Stores documents locally in the browser — no server, no login.
 *
 * Each document: { id, title, html, plainText, wordCount, createdAt, updatedAt }
 */

const DB_NAME = 'skriv-documents';
const DB_VERSION = 2;               // v2: added trash store
const STORE_NAME = 'documents';

let _db = null;

/**
 * Open (or create) the IndexedDB database.
 */
function openDB() {
    if (_db) return Promise.resolve(_db);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            // v2: trash store (also created in trash-store.js)
            if (!db.objectStoreNames.contains('trash')) {
                const trashStore = db.createObjectStore('trash', { keyPath: 'id' });
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
 * Generate a short unique ID.
 */
function generateId() {
    return crypto.randomUUID?.() || Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * Create a new document. Returns the document object.
 */
export async function createDocument(title = '') {
    const db = await openDB();
    const now = new Date().toISOString();

    const doc = {
        id: generateId(),
        title: title,
        html: '',
        plainText: '',
        wordCount: 0,
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
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(id);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Save (update) a document. Merges provided fields with existing doc.
 */
export async function saveDocument(id, updates) {
    const db = await openDB();
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
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            const docs = request.result || [];
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
    const db = await openDB();

    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}
