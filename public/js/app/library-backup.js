/**
 * Library backup — whole-library export/restore as a .skriv file.
 *
 * Browser-profile storage is not a backup: IndexedDB can be evicted by
 * the browser or wiped by "clear browsing data". This module gives the
 * pupil a file they own.
 *
 * Export: all active documents plus custom folders as one JSON file.
 * Restore: merge-only — nothing existing is ever overwritten or deleted.
 *   - Folders are matched by name+parent; missing ones are recreated
 *     (depth-ordered) and imported documents are remapped onto them.
 *   - A document whose id and updatedAt already exist locally is skipped;
 *     everything else is imported as a new document.
 *
 * Trash and version snapshots are deliberately not exported: trash is
 * transient by design, and snapshots would multiply the file size.
 */

import { listDocuments, createDocument, saveDocument, getDocument } from './document-store.js';
import { getAllFolders, createFolder, isSystemFolder } from './folder-store.js';

export const BACKUP_FORMAT = 'skriv-library-backup';
export const BACKUP_VERSION = 1;

/**
 * Serialize the whole library to a JSON string.
 * @returns {Promise<{json: string, documentCount: number}>}
 */
export async function serializeLibraryBackup() {
    const documents = await listDocuments();
    const folders = (await getAllFolders()).filter(f => !isSystemFolder(f));

    const payload = {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: new Date().toISOString(),
        documents,
        folders,
    };
    return { json: JSON.stringify(payload, null, 2), documentCount: documents.length };
}

/**
 * Download the library backup as a .skriv file.
 * @returns {Promise<number>} number of documents exported
 */
export async function downloadLibraryBackup() {
    const { json, documentCount } = await serializeLibraryBackup();
    const stamp = new Date().toISOString().slice(0, 10);
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `skriv-sikkerhetskopi-${stamp}.skriv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    return documentCount;
}

/**
 * Parse and validate a backup file's text content.
 * Throws Error('invalid') when the file is not a Skriv backup.
 */
export function parseLibraryBackup(text) {
    let data;
    try {
        data = JSON.parse(text);
    } catch (_) {
        throw new Error('invalid');
    }
    if (!data || data.format !== BACKUP_FORMAT || !Array.isArray(data.documents)) {
        throw new Error('invalid');
    }
    const folders = Array.isArray(data.folders) ? data.folders : [];

    const documents = data.documents.filter(d =>
        d && typeof d.id === 'string'
        && typeof d.html === 'string'
        && typeof d.title === 'string'
        // Reject active content — document HTML is rendered with
        // innerHTML, so a hostile backup file must not become script.
        && !/<script|javascript:|\son\w+\s*=/i.test(d.html)
    );
    return { documents, folders };
}

/**
 * Merge a parsed backup into the local library.
 * @returns {Promise<{importedDocs: number, skippedDocs: number, createdFolders: number}>}
 */
export async function restoreLibraryBackup({ documents, folders }) {
    // --- Folders: match by name+parent, create the missing ones ---
    const idMap = new Map(); // imported folder id -> local folder id

    function depthOf(folder, all, seen = new Set()) {
        if (!folder.parentId || seen.has(folder.id)) return 0;
        seen.add(folder.id);
        const parent = all.find(f => f.id === folder.parentId);
        return parent ? 1 + depthOf(parent, all, seen) : 0;
    }

    const orderedFolders = [...folders].sort(
        (a, b) => depthOf(a, folders) - depthOf(b, folders)
    );

    let createdFolders = 0;
    for (const imported of orderedFolders) {
        if (!imported || typeof imported.id !== 'string' || typeof imported.name !== 'string') continue;
        const localParentId = imported.parentId ? (idMap.get(imported.parentId) || null) : null;
        const existingLocal = (await getAllFolders()).find(f =>
            f.name === imported.name && (f.parentId || null) === localParentId
        );
        if (existingLocal) {
            idMap.set(imported.id, existingLocal.id);
            continue;
        }
        try {
            const created = await createFolder(imported.name, localParentId);
            idMap.set(imported.id, created.id);
            createdFolders++;
        } catch (_) {
            // Depth limit or race — the documents just land without this folder.
        }
    }

    // --- Documents: merge-only ---
    let importedDocs = 0;
    let skippedDocs = 0;
    for (const imported of documents) {
        const existing = await getDocument(imported.id);
        if (existing && existing.updatedAt === imported.updatedAt) {
            skippedDocs++;
            continue;
        }
        const created = await createDocument(imported.title || '');
        await saveDocument(created.id, {
            title: imported.title || '',
            html: imported.html,
            plainText: typeof imported.plainText === 'string' ? imported.plainText : '',
            wordCount: Number.isFinite(imported.wordCount) ? imported.wordCount : 0,
            subject: typeof imported.subject === 'string' ? imported.subject : null,
            schoolYear: typeof imported.schoolYear === 'string' ? imported.schoolYear : created.schoolYear,
            folderIds: Array.isArray(imported.folderIds)
                ? imported.folderIds.map(id => idMap.get(id)).filter(Boolean)
                : [],
        });
        importedDocs++;
    }

    return { importedDocs, skippedDocs, createdFolders };
}
