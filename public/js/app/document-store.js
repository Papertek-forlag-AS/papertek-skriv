/**
 * Document storage using IndexedDB.
 * Stores documents locally in the browser — no server, no login.
 *
 * Each document: { id, title, html, plainText, wordCount, createdAt, updatedAt, tags, subject, schoolYear }
 */

import { getSchoolYear, getCurrentSchoolYear } from './subject-store.js';

const DB_NAME = 'skriv-documents';
const DB_VERSION = 4;               // v4: folders store + folderIds on documents
const STORE_NAME = 'documents';
const PERSONAL_FOLDER_NAME = '__personal__';

let _db = null;

/**
 * Open (or create) the IndexedDB database.
 */
function openDB() {
    if (_db) return Promise.resolve(_db);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        // If blocked for more than 3s, reload to clear stale connections
        let blockedTimer = null;
        request.onblocked = () => {
            console.warn('[document-store] DB upgrade blocked — closing stale connections');
            if (_db) { _db.close(); _db = null; }
            blockedTimer = setTimeout(() => {
                console.warn('[document-store] DB still blocked after 3s — reloading');
                window.location.reload();
            }, 3000);
        };

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            const tx = e.target.transaction;

            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            // v2: trash store (also created in trash-store.js)
            if (!db.objectStoreNames.contains('trash')) {
                const trashStore = db.createObjectStore('trash', { keyPath: 'id' });
                trashStore.createIndex('trashedAt', 'trashedAt', { unique: false });
            }
            // v3: subject + schoolYear fields on documents
            if (e.oldVersion < 3) {
                const store = tx.objectStore(STORE_NAME);
                if (!store.indexNames.contains('subject')) {
                    store.createIndex('subject', 'subject', { unique: false });
                }
                if (!store.indexNames.contains('schoolYear')) {
                    store.createIndex('schoolYear', 'schoolYear', { unique: false });
                }
                // Backfill existing documents
                store.openCursor().onsuccess = (event) => {
                    const cursor = event.target.result;
                    if (cursor) {
                        const doc = cursor.value;
                        let changed = false;
                        if (doc.subject === undefined) {
                            doc.subject = null;
                            changed = true;
                        }
                        if (!doc.schoolYear) {
                            doc.schoolYear = getSchoolYear(new Date(doc.createdAt)).label;
                            changed = true;
                        }
                        if (changed) cursor.update(doc);
                        cursor.continue();
                    }
                };
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
 * DB v4 migration — creates folders store, seeds folders, sets folderIds on documents.
 * Duplicated in document-store.js, trash-store.js, and folder-store.js because
 * any of the three may open the DB first.
 */
function _runV4Migration(db, tx) {
    const now = new Date().toISOString();
    const nameToId = new Map();

    function normName(n) {
        return n.toLowerCase()
            .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
            .replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    }

    // 1. Create folders store
    if (!db.objectStoreNames.contains('folders')) {
        const fs = db.createObjectStore('folders', { keyPath: 'id' });
        fs.createIndex('parentId', 'parentId', { unique: false });
        fs.createIndex('schoolYear', 'schoolYear', { unique: false });
    }

    // 2. folderIds multiEntry index on documents
    const docStore = tx.objectStore(STORE_NAME);
    if (!docStore.indexNames.contains('folderIds')) {
        docStore.createIndex('folderIds', 'folderIds', { unique: false, multiEntry: true });
    }

    // 3. Seed folders
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

    // 4. Walk documents → set folderIds
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

    // 5. Walk trash → set folderIds
    if (db.objectStoreNames.contains('trash')) {
        const trashStore = tx.objectStore('trash');
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
        tags: [],
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
