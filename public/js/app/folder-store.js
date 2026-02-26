/**
 * Folder store — manages document folders with hierarchy support.
 * Replaces subject-store.js with proper folder objects in IndexedDB.
 * Folders support 3-level nesting and multi-folder document assignment.
 *
 * Opens the same 'skriv-documents' DB at version 4.
 * Contains identical migration logic to document-store.js and trash-store.js
 * since any of the three modules may open the DB first.
 *
 * Dependencies: school-level.js
 */

import { getSchoolLevel, getSubjectsForLevel } from './school-level.js';

const DB_NAME = 'skriv-documents';
const DB_VERSION = 4;
const FOLDERS_STORE = 'folders';
const DOCS_STORE = 'documents';
const TRASH_STORE = 'trash';

export const PERSONAL_FOLDER_NAME = '__personal__';
export const PERSONAL_SUBJECT = PERSONAL_FOLDER_NAME; // backward-compat alias
export const MAX_FOLDER_DEPTH = 3;

const LS_SCHOOL_YEAR = 'skriv_school_year';
const LS_CUSTOM_SUBJECTS = 'skriv_custom_subjects';

/**
 * Complete list of system subjects (superset across all school levels).
 * Used during DB v4 migration to seed system folders.
 */
const ALL_SYSTEM_SUBJECTS = [
    'Engelsk', 'Fremmedspråk', 'Geografi', 'Historie', 'IT', 'KRLE',
    'Kroppsøving', 'Kunst og håndverk', 'Matematikk', 'Musikk',
    'Naturfag', 'Norsk', 'Religion og etikk', 'Samfunnsfag', 'Samfunnskunnskap',
];

let _db = null;

// ─── Deterministic folder ID generation ─────────────────────────────────

function normalizeName(name) {
    return name.toLowerCase()
        .replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

// ─── DB v4 migration (shared with document-store.js / trash-store.js) ───

function runV4Migration(db, tx) {
    const now = new Date().toISOString();
    const nameToId = new Map();

    // 1. Create folders store
    if (!db.objectStoreNames.contains(FOLDERS_STORE)) {
        const fs = db.createObjectStore(FOLDERS_STORE, { keyPath: 'id' });
        fs.createIndex('parentId', 'parentId', { unique: false });
        fs.createIndex('schoolYear', 'schoolYear', { unique: false });
    }

    // 2. folderIds multiEntry index on documents
    const docStore = tx.objectStore(DOCS_STORE);
    if (!docStore.indexNames.contains('folderIds')) {
        docStore.createIndex('folderIds', 'folderIds', { unique: false, multiEntry: true });
    }

    // 3. Seed folders
    const foldersStore = tx.objectStore(FOLDERS_STORE);

    function addFolder(id, name, isSystem, sortOrder) {
        nameToId.set(name, id);
        const req = foldersStore.add({
            id, name, parentId: null, isSystem,
            schoolYear: null, sortOrder, createdAt: now,
        });
        req.onerror = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
    }

    // Personal folder
    addFolder('sys___personal__', PERSONAL_FOLDER_NAME, true, 0);

    // System subject folders
    ALL_SYSTEM_SUBJECTS.forEach((name, i) => {
        addFolder('sys_' + normalizeName(name), name, true, i + 1);
    });

    // Custom subjects from localStorage
    try {
        const raw = localStorage.getItem(LS_CUSTOM_SUBJECTS);
        const customs = raw ? JSON.parse(raw) : [];
        customs.forEach((name, i) => {
            if (!nameToId.has(name)) {
                addFolder('cust_' + normalizeName(name), name, false, 100 + i);
            }
        });
    } catch (_) { /* ignore parse errors */ }

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
        } catch (_) { /* skip failed doc */ }
        cursor.continue();
    };

    // 5. Walk trash → set folderIds on trashed documents
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

// ─── Open DB ────────────────────────────────────────────────────────────

function openDB() {
    if (_db) return Promise.resolve(_db);

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        let blockedTimer = null;
        request.onblocked = () => {
            console.warn('[folder-store] DB upgrade blocked — closing stale connections');
            if (_db) { _db.close(); _db = null; }
            blockedTimer = setTimeout(() => {
                console.warn('[folder-store] DB still blocked after 3s — reloading');
                window.location.reload();
            }, 3000);
        };

        request.onupgradeneeded = (e) => {
            const db = e.target.result;
            const tx = e.target.transaction;

            // v1: documents store
            if (!db.objectStoreNames.contains(DOCS_STORE)) {
                const store = db.createObjectStore(DOCS_STORE, { keyPath: 'id' });
                store.createIndex('updatedAt', 'updatedAt', { unique: false });
            }
            // v2: trash store
            if (!db.objectStoreNames.contains(TRASH_STORE)) {
                const trashStore = db.createObjectStore(TRASH_STORE, { keyPath: 'id' });
                trashStore.createIndex('trashedAt', 'trashedAt', { unique: false });
            }
            // v3: subject + schoolYear indexes
            if (e.oldVersion < 3) {
                const store = tx.objectStore(DOCS_STORE);
                if (!store.indexNames.contains('subject')) {
                    store.createIndex('subject', 'subject', { unique: false });
                }
                if (!store.indexNames.contains('schoolYear')) {
                    store.createIndex('schoolYear', 'schoolYear', { unique: false });
                }
            }
            // v4: folders + folderIds
            if (e.oldVersion < 4) {
                runV4Migration(db, tx);
            }
        };

        request.onsuccess = (e) => {
            if (blockedTimer) clearTimeout(blockedTimer);
            _db = e.target.result;
            _db.onversionchange = () => { _db.close(); _db = null; };
            resolve(_db);
        };

        request.onerror = (e) => {
            if (blockedTimer) clearTimeout(blockedTimer);
            console.error('IndexedDB open failed:', e.target.error);
            reject(e.target.error);
        };
    });
}

// ─── School year helpers (ported from subject-store.js) ─────────────────

/**
 * Get the school year boundaries for a given date.
 * A school year runs from August 1st to July 31st.
 * @param {Date} [referenceDate]
 * @returns {{ startYear: number, endYear: number, start: Date, end: Date, label: string }}
 */
export function getSchoolYear(referenceDate) {
    const d = referenceDate || new Date();
    const startYear = d.getMonth() < 7 ? d.getFullYear() - 1 : d.getFullYear();
    const endYear = startYear + 1;
    return {
        startYear,
        endYear,
        start: new Date(startYear, 7, 1),
        end: new Date(endYear, 6, 31, 23, 59, 59),
        label: `${startYear}/${endYear}`,
    };
}

/**
 * Get the currently active school year label.
 * @returns {string} e.g. '2025/2026'
 */
export function getCurrentSchoolYear() {
    let stored = localStorage.getItem(LS_SCHOOL_YEAR);
    if (!stored) {
        stored = getSchoolYear().label;
        localStorage.setItem(LS_SCHOOL_YEAR, stored);
    }
    return stored;
}

/**
 * Set the active school year.
 * @param {string} label
 */
export function setCurrentSchoolYear(label) {
    localStorage.setItem(LS_SCHOOL_YEAR, label);
}

/**
 * Get all distinct school years present in documents.
 * @param {Array<{schoolYear: string}>} docs
 * @returns {string[]} Sorted descending (newest first)
 */
export function getAvailableSchoolYears(docs) {
    const years = new Set();
    for (const doc of docs) {
        if (doc.schoolYear) years.add(doc.schoolYear);
    }
    years.add(getCurrentSchoolYear());
    return [...years].sort().reverse();
}

// ─── Folder CRUD ────────────────────────────────────────────────────────

/**
 * Create a new folder.
 * @param {string} name - Folder name (max 30 chars)
 * @param {string|null} [parentId=null] - Parent folder ID (null for root)
 * @returns {Promise<Object>} The created folder
 */
export async function createFolder(name, parentId = null) {
    const trimmed = name.trim().slice(0, 30);
    if (!trimmed) throw new Error('Folder name cannot be empty');

    // Enforce depth limit
    if (parentId) {
        const depth = await getFolderDepth(parentId);
        if (depth >= MAX_FOLDER_DEPTH) {
            throw new Error('Maximum folder depth reached');
        }
    }

    // Check for duplicate name among siblings
    const siblings = parentId ? await getChildren(parentId) : await getRootFolders();
    if (siblings.some(f => f.name === trimmed)) {
        throw new Error('A folder with this name already exists');
    }

    const db = await openDB();
    const id = 'cust_' + normalizeName(trimmed) + '_' + Date.now().toString(36);
    const folder = {
        id,
        name: trimmed,
        parentId: parentId || null,
        isSystem: false,
        schoolYear: null,
        sortOrder: siblings.length + 1,
        createdAt: new Date().toISOString(),
    };

    return new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDERS_STORE, 'readwrite');
        tx.objectStore(FOLDERS_STORE).add(folder);
        tx.oncomplete = () => resolve(folder);
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Rename a folder (custom folders only).
 * @param {string} folderId
 * @param {string} newName
 */
export async function renameFolder(folderId, newName) {
    const trimmed = newName.trim().slice(0, 30);
    if (!trimmed) throw new Error('Folder name cannot be empty');

    const db = await openDB();
    const folder = await getFolderById(folderId);
    if (!folder) throw new Error('Folder not found');
    if (folder.isSystem) throw new Error('Cannot rename system folders');

    folder.name = trimmed;

    return new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDERS_STORE, 'readwrite');
        tx.objectStore(FOLDERS_STORE).put(folder);
        tx.oncomplete = () => resolve(folder);
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Delete a custom folder. Reassigns children to deleted folder's parent.
 * Documents in this folder lose this folder from their folderIds.
 * @param {string} folderId
 */
export async function deleteFolder(folderId) {
    const db = await openDB();
    const folder = await getFolderById(folderId);
    if (!folder) throw new Error('Folder not found');
    if (folder.isSystem) throw new Error('Cannot delete system folders');

    const children = await getChildren(folderId);
    const newParentId = folder.parentId || null;

    return new Promise((resolve, reject) => {
        const tx = db.transaction([FOLDERS_STORE, DOCS_STORE], 'readwrite');
        const fStore = tx.objectStore(FOLDERS_STORE);
        const dStore = tx.objectStore(DOCS_STORE);

        // Reassign children to parent
        for (const child of children) {
            child.parentId = newParentId;
            fStore.put(child);
        }

        // Remove folder from all documents' folderIds
        const idx = dStore.index('folderIds');
        const req = idx.openCursor(IDBKeyRange.only(folderId));
        req.onsuccess = (ev) => {
            const cursor = ev.target.result;
            if (!cursor) return;
            const doc = cursor.value;
            doc.folderIds = (doc.folderIds || []).filter(id => id !== folderId);
            cursor.update(doc);
            cursor.continue();
        };

        // Delete the folder
        fStore.delete(folderId);

        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Move a folder to a new parent. Validates depth constraints.
 * @param {string} folderId
 * @param {string|null} newParentId
 */
export async function moveFolder(folderId, newParentId) {
    const folder = await getFolderById(folderId);
    if (!folder) throw new Error('Folder not found');
    if (folder.isSystem) throw new Error('Cannot move system folders');

    // Calculate new depth for this folder + its deepest subtree
    const subtreeDepth = await getSubtreeDepth(folderId);
    const newParentDepth = newParentId ? await getFolderDepth(newParentId) : 0;
    if (newParentDepth + subtreeDepth > MAX_FOLDER_DEPTH) {
        throw new Error('Move would exceed maximum folder depth');
    }

    // Prevent moving to own descendant
    if (newParentId) {
        const path = await getFolderPath(newParentId);
        if (path.some(f => f.id === folderId)) {
            throw new Error('Cannot move folder into its own descendant');
        }
    }

    const db = await openDB();
    folder.parentId = newParentId || null;

    return new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDERS_STORE, 'readwrite');
        tx.objectStore(FOLDERS_STORE).put(folder);
        tx.oncomplete = () => resolve(folder);
        tx.onerror = (e) => reject(e.target.error);
    });
}

// ─── Folder queries ─────────────────────────────────────────────────────

/**
 * Get all folders (flat array).
 * @returns {Promise<Array>}
 */
export async function getAllFolders() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDERS_STORE, 'readonly');
        const req = tx.objectStore(FOLDERS_STORE).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get root-level folders (parentId === null), sorted by sortOrder.
 * @returns {Promise<Array>}
 */
export async function getRootFolders() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDERS_STORE, 'readonly');
        const idx = tx.objectStore(FOLDERS_STORE).index('parentId');
        const req = idx.getAll(IDBKeyRange.only(null));
        req.onsuccess = () => {
            const folders = req.result || [];
            folders.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            resolve(folders);
        };
        req.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get direct children of a folder.
 * @param {string} parentId
 * @returns {Promise<Array>}
 */
export async function getChildren(parentId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDERS_STORE, 'readonly');
        const idx = tx.objectStore(FOLDERS_STORE).index('parentId');
        const req = idx.getAll(IDBKeyRange.only(parentId));
        req.onsuccess = () => {
            const folders = req.result || [];
            folders.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
            resolve(folders);
        };
        req.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get a single folder by ID.
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getFolderById(id) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(FOLDERS_STORE, 'readonly');
        const req = tx.objectStore(FOLDERS_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Get ancestor chain [root, ..., folder] for a folder.
 * @param {string} folderId
 * @returns {Promise<Array>}
 */
export async function getFolderPath(folderId) {
    const path = [];
    let currentId = folderId;
    while (currentId) {
        const folder = await getFolderById(currentId);
        if (!folder) break;
        path.unshift(folder);
        currentId = folder.parentId;
    }
    return path;
}

/**
 * Get depth of a folder (1-based: root = 1).
 * @param {string} folderId
 * @returns {Promise<number>}
 */
export async function getFolderDepth(folderId) {
    const path = await getFolderPath(folderId);
    return path.length;
}

/**
 * Get the maximum depth of a folder's subtree (including itself).
 * @param {string} folderId
 * @returns {Promise<number>}
 */
async function getSubtreeDepth(folderId) {
    const children = await getChildren(folderId);
    if (children.length === 0) return 1;
    const childDepths = await Promise.all(children.map(c => getSubtreeDepth(c.id)));
    return 1 + Math.max(...childDepths);
}

// ─── Tree helpers (pure sync) ───────────────────────────────────────────

/**
 * Build a nested tree from a flat array of folders.
 * @param {Array} folders - Flat array of folder objects
 * @returns {Array} Nested array of { ...folder, children: [...] }
 */
export function buildFolderTree(folders) {
    const map = new Map();
    const roots = [];

    // Create node map with empty children arrays
    for (const f of folders) {
        map.set(f.id, { ...f, children: [] });
    }

    // Build parent-child relationships
    for (const f of folders) {
        const node = map.get(f.id);
        if (f.parentId && map.has(f.parentId)) {
            map.get(f.parentId).children.push(node);
        } else {
            roots.push(node);
        }
    }

    // Sort children by sortOrder at each level
    function sortChildren(nodes) {
        nodes.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        for (const node of nodes) {
            if (node.children.length > 0) sortChildren(node.children);
        }
    }
    sortChildren(roots);

    return roots;
}

/**
 * Flatten a tree back to a flat array with depth annotations.
 * @param {Array} tree - Nested tree from buildFolderTree
 * @returns {Array<{ folder: Object, depth: number }>}
 */
export function flattenTree(tree) {
    const result = [];
    function walk(nodes, depth) {
        for (const node of nodes) {
            const { children, ...folder } = node;
            result.push({ folder, depth });
            if (children && children.length > 0) walk(children, depth + 1);
        }
    }
    walk(tree, 1);
    return result;
}

// ─── Document-folder assignment ─────────────────────────────────────────

/**
 * Add a document to a folder.
 * Directly accesses IndexedDB (no import from document-store to avoid circular dep).
 * @param {string} docId
 * @param {string} folderId
 */
export async function addDocToFolder(docId, folderId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DOCS_STORE, 'readwrite');
        const store = tx.objectStore(DOCS_STORE);
        const req = store.get(docId);
        req.onsuccess = () => {
            const doc = req.result;
            if (!doc) { reject(new Error('Document not found')); return; }
            const ids = doc.folderIds || [];
            if (!ids.includes(folderId)) {
                doc.folderIds = [...ids, folderId];
                doc.updatedAt = new Date().toISOString();
                store.put(doc);
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Remove a document from a folder.
 * @param {string} docId
 * @param {string} folderId
 */
export async function removeDocFromFolder(docId, folderId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DOCS_STORE, 'readwrite');
        const store = tx.objectStore(DOCS_STORE);
        const req = store.get(docId);
        req.onsuccess = () => {
            const doc = req.result;
            if (!doc) { reject(new Error('Document not found')); return; }
            doc.folderIds = (doc.folderIds || []).filter(id => id !== folderId);
            doc.updatedAt = new Date().toISOString();
            store.put(doc);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

/**
 * Replace all folder assignments for a document.
 * @param {string} docId
 * @param {string[]} folderIds
 */
export async function setDocFolders(docId, folderIds) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(DOCS_STORE, 'readwrite');
        const store = tx.objectStore(DOCS_STORE);
        const req = store.get(docId);
        req.onsuccess = () => {
            const doc = req.result;
            if (!doc) { reject(new Error('Document not found')); return; }
            doc.folderIds = [...folderIds];
            doc.updatedAt = new Date().toISOString();
            store.put(doc);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
    });
}

// ─── System folder helpers ──────────────────────────────────────────────

/** Check if a folder is the personal folder. */
export function isPersonalFolder(folder) {
    return folder && folder.name === PERSONAL_FOLDER_NAME;
}

/** Check if a folder is a system (predefined) folder. */
export function isSystemFolder(folder) {
    return folder && folder.isSystem === true;
}
