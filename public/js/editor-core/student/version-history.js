/**
 * Version History Module
 *
 * Automatically saves content snapshots and lets students view/restore
 * previous versions of their writing.
 *
 * Features:
 * - Auto-save snapshot every 5 minutes (if content changed)
 * - Snapshot on every 100 new words written
 * - Timeline panel with preview and restore
 * - Max 50 snapshots per document (oldest auto-pruned)
 *
 * i18n keys needed:
 *   versions.title = 'Versjonshistorikk'
 *   versions.snapshot = 'Lagret {{time}}'
 *   versions.words = '{{count}} ord'
 *   versions.restore = 'Gjenopprett'
 *   versions.restoreConfirm = 'Erstatte nåværende tekst med denne versjonen?'
 *   versions.restored = 'Versjon gjenopprettet'
 *   versions.preview = 'Forhåndsvisning'
 *   versions.close = 'Lukk'
 *   versions.empty = 'Ingen lagrede versjoner ennå'
 */

import { t } from '../shared/i18n.js';
import { countWords } from '../shared/word-counter.js';
import { showToast } from '../shared/toast-notification.js';

const SNAPSHOT_INTERVAL = 300000; // 5 minutes
const WORD_THRESHOLD = 100;
const MAX_SNAPSHOTS = 50;
const DB_NAME = 'skriv-versions';
const STORE_NAME = 'snapshots';
const DB_VERSION = 1;

const STYLES = `
.version-panel {
    position: fixed;
    top: 0;
    right: -340px;
    width: 320px;
    height: 100vh;
    background: #fff;
    border-left: 1px solid #e2e8f0;
    box-shadow: -4px 0 16px rgba(0,0,0,0.08);
    z-index: 1100;
    display: flex;
    flex-direction: column;
    transition: right 0.25s ease;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}
.version-panel.open {
    right: 0;
}
.version-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #e2e8f0;
}
.version-panel-header h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 600;
    color: #1e293b;
}
.version-panel-close {
    background: none;
    border: none;
    font-size: 20px;
    cursor: pointer;
    color: #64748b;
    padding: 4px 8px;
    border-radius: 4px;
}
.version-panel-close:hover {
    background: #f1f5f9;
    color: #1e293b;
}
.version-list {
    flex: 1;
    overflow-y: auto;
    padding: 12px 16px;
}
.version-empty {
    text-align: center;
    color: #94a3b8;
    font-size: 13px;
    padding: 40px 20px;
}
.version-timeline {
    position: relative;
    padding-left: 20px;
}
.version-timeline::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: #e2e8f0;
    border-radius: 1px;
}
.version-entry {
    position: relative;
    margin-bottom: 12px;
    padding: 10px 12px;
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    cursor: pointer;
    transition: border-color 0.15s ease, background 0.15s ease;
}
.version-entry:hover {
    border-color: #93c5fd;
    background: #eff6ff;
}
.version-entry::before {
    content: '';
    position: absolute;
    left: -18px;
    top: 16px;
    width: 10px;
    height: 10px;
    background: #3b82f6;
    border: 2px solid #fff;
    border-radius: 50%;
    box-shadow: 0 0 0 2px #e2e8f0;
}
.version-entry-time {
    font-size: 12px;
    color: #64748b;
    margin-bottom: 4px;
}
.version-entry-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
}
.version-entry-words {
    font-size: 11px;
    background: #dbeafe;
    color: #1d4ed8;
    padding: 2px 6px;
    border-radius: 10px;
    font-weight: 500;
}
.version-entry-preview {
    font-size: 12px;
    color: #475569;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.version-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 1200;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px;
}
.version-preview-box {
    background: #fff;
    border-radius: 12px;
    width: 100%;
    max-width: 700px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 60px rgba(0,0,0,0.2);
}
.version-preview-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #e2e8f0;
}
.version-preview-header h4 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
}
.version-preview-actions {
    display: flex;
    gap: 8px;
}
.version-preview-content {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
    font-size: 14px;
    line-height: 1.7;
    color: #334155;
}
.version-btn-restore {
    background: #16a34a;
    color: #fff;
    border: none;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s;
}
.version-btn-restore:hover {
    background: #15803d;
}
.version-btn-close {
    background: #f1f5f9;
    color: #475569;
    border: 1px solid #e2e8f0;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 13px;
    cursor: pointer;
    transition: background 0.15s;
}
.version-btn-close:hover {
    background: #e2e8f0;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    .version-panel {
        background: #1e293b;
        border-left-color: #334155;
    }
    .version-panel-header {
        border-bottom-color: #334155;
    }
    .version-panel-header h3 {
        color: #f1f5f9;
    }
    .version-panel-close {
        color: #94a3b8;
    }
    .version-panel-close:hover {
        background: #334155;
        color: #f1f5f9;
    }
    .version-entry {
        background: #0f172a;
        border-color: #334155;
    }
    .version-entry:hover {
        border-color: #60a5fa;
        background: #1e3a5f;
    }
    .version-entry::before {
        border-color: #1e293b;
        box-shadow: 0 0 0 2px #334155;
    }
    .version-entry-time {
        color: #94a3b8;
    }
    .version-entry-words {
        background: #1e3a5f;
        color: #93c5fd;
    }
    .version-entry-preview {
        color: #cbd5e1;
    }
    .version-timeline::before {
        background: #334155;
    }
    .version-empty {
        color: #64748b;
    }
    .version-preview-box {
        background: #1e293b;
    }
    .version-preview-header {
        border-bottom-color: #334155;
    }
    .version-preview-header h4 {
        color: #f1f5f9;
    }
    .version-preview-content {
        color: #e2e8f0;
    }
    .version-btn-close {
        background: #334155;
        color: #e2e8f0;
        border-color: #475569;
    }
    .version-btn-close:hover {
        background: #475569;
    }
}
`;

/**
 * Format a timestamp as a relative time string.
 */
function formatRelativeTime(timestamp) {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Akkurat nå';
    if (minutes < 60) return `${minutes} min siden`;
    if (hours < 24) return `${hours} t siden`;
    if (days < 7) return `${days} d siden`;

    const date = new Date(timestamp);
    return date.toLocaleDateString('nb-NO', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
}

/**
 * Initialize the version history module.
 *
 * @param {HTMLElement} editor - The contenteditable editor element.
 * @param {object} options
 * @param {string} options.docId - Document ID for scoping snapshots.
 * @param {Function} [options.onRestore] - Callback after restoring a version.
 * @param {Function} [options.getTitle] - Returns the current document title.
 * @returns {{ destroy: Function, toggle: Function, saveSnapshot: Function }}
 */
export function initVersionHistory(editor, options = {}) {
    const docId = options.docId || 'default';
    let panel = null;
    let styleEl = null;
    let intervalId = null;
    let lastSnapshotWords = 0;
    let lastSnapshotContent = '';
    let db = null;
    let overlayEl = null;

    // --- Inject styles ---
    styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    // --- IndexedDB setup ---
    async function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onupgradeneeded = (e) => {
                const database = e.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    const store = database.createObjectStore(STORE_NAME, {
                        keyPath: 'id',
                        autoIncrement: true,
                    });
                    store.createIndex('docId', 'docId', { unique: false });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function saveSnapshot() {
        if (!db) return;
        const content = editor.innerHTML;
        if (content === lastSnapshotContent) return;

        lastSnapshotContent = content;
        lastSnapshotWords = countWords(editor.textContent);

        const snapshot = {
            docId,
            timestamp: Date.now(),
            content,
            wordCount: lastSnapshotWords,
            preview: editor.textContent.trim().slice(0, 60),
        };

        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readwrite');
            tx.objectStore(STORE_NAME).add(snapshot);
            tx.oncomplete = () => {
                pruneSnapshots().then(resolve);
            };
            tx.onerror = () => reject(tx.error);
        });
    }

    async function getSnapshots() {
        if (!db) return [];
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const index = store.index('docId');
            const request = index.getAll(docId);
            request.onsuccess = () => {
                const results = request.result || [];
                results.sort((a, b) => b.timestamp - a.timestamp);
                resolve(results);
            };
            request.onerror = () => reject(request.error);
        });
    }

    async function pruneSnapshots() {
        if (!db) return;
        const snapshots = await getSnapshots();
        if (snapshots.length <= MAX_SNAPSHOTS) return;

        const toDelete = snapshots.slice(MAX_SNAPSHOTS);
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        for (const snap of toDelete) {
            store.delete(snap.id);
        }
        return new Promise((resolve) => {
            tx.oncomplete = resolve;
            tx.onerror = resolve;
        });
    }

    async function restoreSnapshot(snapshotId) {
        if (!db) return;
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const request = store.get(snapshotId);
            request.onsuccess = () => {
                const snapshot = request.result;
                if (!snapshot) return resolve();

                // Save current state before restoring
                saveSnapshot().then(() => {
                    editor.innerHTML = snapshot.content;
                    lastSnapshotContent = snapshot.content;
                    lastSnapshotWords = countWords(editor.textContent);

                    if (options.onRestore) {
                        options.onRestore();
                    }

                    showToast(t('versions.restored') || 'Versjon gjenopprettet');
                    closeOverlay();
                    resolve();
                });
            };
            request.onerror = () => reject(request.error);
        });
    }

    // --- Auto-snapshot on interval ---
    intervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
            saveSnapshot();
        }
    }, SNAPSHOT_INTERVAL);

    // --- Word threshold snapshot ---
    function handleInput() {
        const currentWords = countWords(editor.textContent);
        if (currentWords - lastSnapshotWords >= WORD_THRESHOLD) {
            saveSnapshot();
        }
    }
    editor.addEventListener('input', handleInput);

    // --- Panel UI ---
    function createPanel() {
        panel = document.createElement('aside');
        panel.className = 'version-panel';
        panel.innerHTML = `
            <div class="version-panel-header">
                <h3>${t('versions.title') || 'Versjonshistorikk'}</h3>
                <button class="version-panel-close" aria-label="${t('versions.close') || 'Lukk'}">&times;</button>
            </div>
            <div class="version-list"></div>
        `;
        document.body.appendChild(panel);

        panel.querySelector('.version-panel-close').addEventListener('click', hidePanel);
    }

    async function renderList() {
        if (!panel) return;
        const listEl = panel.querySelector('.version-list');
        const snapshots = await getSnapshots();

        if (snapshots.length === 0) {
            listEl.innerHTML = `<div class="version-empty">${t('versions.empty') || 'Ingen lagrede versjoner ennå'}</div>`;
            return;
        }

        let html = '<div class="version-timeline">';
        for (const snap of snapshots) {
            const timeStr = formatRelativeTime(snap.timestamp);
            const wordsStr = `${snap.wordCount} ${t('versions.wordsLabel') || 'ord'}`;
            const preview = escapeForAttr(snap.preview || '');
            html += `
                <div class="version-entry" data-id="${snap.id}">
                    <div class="version-entry-time">${timeStr}</div>
                    <div class="version-entry-meta">
                        <span class="version-entry-words">${wordsStr}</span>
                    </div>
                    <div class="version-entry-preview">${escapeHtml(snap.preview || '')}</div>
                </div>
            `;
        }
        html += '</div>';
        listEl.innerHTML = html;

        // Attach click handlers
        listEl.querySelectorAll('.version-entry').forEach((entry) => {
            entry.addEventListener('click', () => {
                const id = Number(entry.dataset.id);
                showPreview(id);
            });
        });
    }

    function showPanel() {
        if (!panel) createPanel();
        renderList();
        requestAnimationFrame(() => {
            panel.classList.add('open');
        });
    }

    function hidePanel() {
        if (panel) {
            panel.classList.remove('open');
        }
    }

    function toggle() {
        if (!panel) {
            showPanel();
            return;
        }
        if (panel.classList.contains('open')) {
            hidePanel();
        } else {
            showPanel();
        }
    }

    // --- Preview overlay ---
    async function showPreview(snapshotId) {
        if (!db) return;
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.get(snapshotId);
        request.onsuccess = () => {
            const snapshot = request.result;
            if (!snapshot) return;

            overlayEl = document.createElement('div');
            overlayEl.className = 'version-overlay';
            overlayEl.innerHTML = `
                <div class="version-preview-box">
                    <div class="version-preview-header">
                        <h4>${t('versions.preview') || 'Forhåndsvisning'} — ${formatRelativeTime(snapshot.timestamp)}</h4>
                        <div class="version-preview-actions">
                            <button class="version-btn-restore">${t('versions.restore') || 'Gjenopprett'}</button>
                            <button class="version-btn-close">${t('versions.close') || 'Lukk'}</button>
                        </div>
                    </div>
                    <div class="version-preview-content">${snapshot.content}</div>
                </div>
            `;
            document.body.appendChild(overlayEl);

            overlayEl.querySelector('.version-btn-close').addEventListener('click', closeOverlay);
            overlayEl.querySelector('.version-btn-restore').addEventListener('click', () => {
                const msg = t('versions.restoreConfirm') || 'Erstatte nåværende tekst med denne versjonen?';
                if (confirm(msg)) {
                    restoreSnapshot(snapshotId);
                }
            });

            // Close on backdrop click
            overlayEl.addEventListener('click', (e) => {
                if (e.target === overlayEl) closeOverlay();
            });
        };
    }

    function closeOverlay() {
        if (overlayEl) {
            overlayEl.remove();
            overlayEl = null;
        }
    }

    // --- Helpers ---
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function escapeForAttr(str) {
        return str.replace(/"/g, '&quot;').replace(/</g, '&lt;');
    }

    // --- Init ---
    async function init() {
        try {
            db = await openDB();
            lastSnapshotContent = editor.innerHTML;
            lastSnapshotWords = countWords(editor.textContent);
            // Save initial snapshot
            await saveSnapshot();
        } catch (err) {
            console.warn('[version-history] Failed to initialize IndexedDB:', err);
        }
    }
    init();

    // --- Destroy ---
    function destroy() {
        editor.removeEventListener('input', handleInput);
        if (intervalId) clearInterval(intervalId);
        if (panel) panel.remove();
        if (overlayEl) overlayEl.remove();
        if (styleEl) styleEl.remove();
        if (db) db.close();
        panel = null;
        overlayEl = null;
        styleEl = null;
        db = null;
    }

    return { destroy, toggle, saveSnapshot };
}
