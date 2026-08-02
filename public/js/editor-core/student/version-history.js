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

const TIMELINE_INTERVAL = 5000;
const MAJOR_INTERVAL = 300000;
const MAJOR_WORD_THRESHOLD = 100;
const MAX_SNAPSHOTS = 5000;
const DB_NAME = 'skriv-versions';
const STORE_NAME = 'snapshots';
const DB_VERSION = 1;

let playbackCache = [];
let playbackIndex = 0;
let playbackTimer = null;
let isPlaying = false;

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
    let timelineIntervalId = null;
    let majorIntervalId = null;
    let lastSnapshotWords = 0;
    let lastMajorSnapshotWords = 0;
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

    async function saveSnapshot(isMajor = false) {
        if (!db) return;
        const content = editor.innerHTML;
        if (content === lastSnapshotContent) return;

        lastSnapshotContent = content;
        lastSnapshotWords = countWords(editor.textContent);
        if (isMajor) lastMajorSnapshotWords = lastSnapshotWords;

        const snapshot = {
            docId,
            timestamp: Date.now(),
            content,
            wordCount: lastSnapshotWords,
            preview: editor.textContent.trim().slice(0, 60),
            isMajor
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
    timelineIntervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
            saveSnapshot(false);
        }
    }, TIMELINE_INTERVAL);

    majorIntervalId = setInterval(() => {
        if (document.visibilityState === 'visible') {
            saveSnapshot(true);
        }
    }, MAJOR_INTERVAL);

    // --- Word threshold snapshot ---
    function handleInput() {
        const currentWords = countWords(editor.textContent);
        if (currentWords - lastMajorSnapshotWords >= MAJOR_WORD_THRESHOLD) {
            saveSnapshot(true);
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

        panel.addEventListener('click', (e) => {
            if (e.target.closest('.version-panel-close')) {
                hidePanel();
            }
        });
    }

    async function renderList() {
        if (!panel) return;
        const listEl = panel.querySelector('.version-list');
        const snapshots = await getSnapshots();
        const majorSnapshots = snapshots.filter(s => s.isMajor);

        let html = '';

        if (snapshots.length > 0) {
            html += `
                <div style="padding: 0 0 15px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 15px;">
                    <button class="version-play-full-timeline" style="width: 100%; padding: 8px; background: #0f766e; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                        ▶ Spill av hele tidslinjen
                    </button>
                </div>
            `;
        }

        if (majorSnapshots.length === 0) {
            html += `<div class="version-empty">${t('versions.empty') || 'Ingen lagrede versjoner ennå'}</div>`;
        } else {
            html += '<div class="version-timeline">';
            for (const snap of majorSnapshots) {
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
        }

        listEl.innerHTML = html;

        // Attach click handlers
        listEl.querySelectorAll('.version-entry').forEach((entry) => {
            entry.addEventListener('click', () => {
                const id = Number(entry.dataset.id);
                showPreview(id);
            });
        });

        const btnPlayFull = listEl.querySelector('.version-play-full-timeline');
        if (btnPlayFull) {
            btnPlayFull.addEventListener('click', () => {
                // Play from the very first recorded snapshot
                showPreview(snapshots[snapshots.length - 1].id);
            });
        }
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

    // --- Playback overlay ---
    async function showPreview(initialSnapshotId) {
        if (!db) return;
        const all = await getSnapshots();
        playbackCache = all.reverse(); // Now chronological (oldest first)
        
        if (playbackCache.length === 0) return;
        
        playbackIndex = playbackCache.findIndex(s => s.id === initialSnapshotId);
        if (playbackIndex === -1) playbackIndex = playbackCache.length - 1;

        overlayEl = document.createElement('div');
        overlayEl.className = 'version-overlay';
        overlayEl.innerHTML = `
            <div class="version-preview-box" style="display:flex; flex-direction:column; max-width: 900px; height: 90vh;">
                <div class="version-preview-header" style="flex-direction:column; align-items: stretch; gap: 10px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <h4>${t('versions.preview') || 'Tidslinjeavspilling'}</h4>
                        <div class="version-preview-actions">
                            <button class="version-btn-restore" style="display:none;">${t('versions.restore') || 'Gjenopprett'}</button>
                            <button class="version-btn-close">${t('versions.close') || 'Lukk'}</button>
                        </div>
                    </div>
                    
                    <div style="display:flex; align-items:center; gap: 15px; background: #f8fafc; padding: 10px 15px; border-radius: 6px;">
                        <button id="playback-prev" style="padding: 6px 12px; border:1px solid #cbd5e1; border-radius:4px; background:#fff; cursor:pointer;">◀</button>
                        <button id="playback-toggle" style="padding: 6px 16px; border:none; border-radius:4px; background:#0d9488; color:#fff; font-weight:bold; cursor:pointer; min-width: 90px;">Spill av</button>
                        <button id="playback-next" style="padding: 6px 12px; border:1px solid #cbd5e1; border-radius:4px; background:#fff; cursor:pointer;">▶</button>
                        
                        <div style="flex:1; display:flex; align-items:center; gap: 10px; font-size:13px; color:#475569;">
                            <span id="playback-status" style="white-space:nowrap; min-width: 100px;">Snapshot 0/0</span>
                            <input type="range" id="playback-slider" min="0" max="${playbackCache.length - 1}" value="${playbackIndex}" style="flex:1; cursor:pointer;">
                        </div>
                        
                        <button id="playback-jump-live" style="padding: 6px 12px; border:none; border-radius:4px; background:#dcfce7; color:#166534; font-weight:bold; cursor:pointer;">● Gå til nåværende versjon av dokumentet</button>
                    </div>
                    
                    <div style="display:flex; justify-content:space-between; font-size:12px; color:#64748b;">
                        <span id="playback-time-label">Tid</span>
                        <span id="playback-word-label" style="color:#059669; font-weight:bold;">0 ord</span>
                    </div>
                </div>
                <div class="version-preview-content" style="white-space: pre-wrap; font-family: 'Times New Roman', serif; font-size: 16px; flex:1; overflow-y:auto;"></div>
            </div>
        `;
        document.body.appendChild(overlayEl);

        const contentEl = overlayEl.querySelector('.version-preview-content');
        const sliderEl = overlayEl.querySelector('#playback-slider');
        const statusEl = overlayEl.querySelector('#playback-status');
        const timeLabel = overlayEl.querySelector('#playback-time-label');
        const wordLabel = overlayEl.querySelector('#playback-word-label');
        const toggleBtn = overlayEl.querySelector('#playback-toggle');
        const restoreBtn = overlayEl.querySelector('.version-btn-restore');

        function renderFrame() {
            if (playbackIndex < 0) playbackIndex = 0;
            if (playbackIndex >= playbackCache.length) playbackIndex = playbackCache.length - 1;
            
            const currentSnap = playbackCache[playbackIndex];
            const prevSnap = playbackIndex > 0 ? playbackCache[playbackIndex - 1] : null;
            
            const oldHtml = prevSnap ? prevSnap.content : '';
            const newHtml = currentSnap.content;
            
            contentEl.innerHTML = generateDiffHtml(oldHtml, newHtml);
            
            sliderEl.value = playbackIndex;
            statusEl.textContent = `Snapshot ${playbackIndex + 1}/${playbackCache.length}`;
            timeLabel.textContent = formatRelativeTime(currentSnap.timestamp);
            
            const wordDiff = prevSnap ? (currentSnap.wordCount - prevSnap.wordCount) : currentSnap.wordCount;
            const sign = wordDiff > 0 ? '+' : '';
            wordLabel.textContent = `${sign}${wordDiff} ord (${currentSnap.wordCount} totalt)`;
            
            // Show restore button only if paused
            restoreBtn.style.display = (!isPlaying) ? 'block' : 'none';
        }

        function togglePlay() {
            if (isPlaying) {
                isPlaying = false;
                toggleBtn.textContent = 'Spill av';
                toggleBtn.style.background = '#0d9488';
                clearTimeout(playbackTimer);
                renderFrame();
            } else {
                if (playbackIndex >= playbackCache.length - 1) playbackIndex = 0; // loop
                isPlaying = true;
                toggleBtn.textContent = 'Pause';
                toggleBtn.style.background = '#0f766e';
                renderFrame();
                playNext();
            }
        }

        function playNext() {
            if (!isPlaying) return;
            playbackTimer = setTimeout(() => {
                if (playbackIndex < playbackCache.length - 1) {
                    playbackIndex++;
                    renderFrame();
                    
                    // Auto scroll to bottom of content if appending
                    contentEl.scrollTop = contentEl.scrollHeight;
                    
                    playNext();
                } else {
                    togglePlay(); // Stop when reaching end
                }
            }, 500); // 500ms per frame
        }

        overlayEl.querySelector('#playback-prev').addEventListener('click', () => {
            if (isPlaying) togglePlay();
            playbackIndex = Math.max(0, playbackIndex - 1);
            renderFrame();
        });
        
        overlayEl.querySelector('#playback-next').addEventListener('click', () => {
            if (isPlaying) togglePlay();
            playbackIndex = Math.min(playbackCache.length - 1, playbackIndex + 1);
            renderFrame();
        });
        
        toggleBtn.addEventListener('click', togglePlay);
        
        sliderEl.addEventListener('input', (e) => {
            if (isPlaying) togglePlay();
            playbackIndex = parseInt(e.target.value);
            renderFrame();
        });
        
        overlayEl.querySelector('#playback-jump-live').addEventListener('click', () => {
            closeOverlay();
        });

        overlayEl.querySelector('.version-btn-close').addEventListener('click', closeOverlay);
        restoreBtn.addEventListener('click', () => {
            const msg = t('versions.restoreConfirm') || 'Erstatte nåværende tekst med denne versjonen?';
            if (confirm(msg)) {
                restoreSnapshot(playbackCache[playbackIndex].id);
            }
        });

        overlayEl.addEventListener('click', (e) => {
            if (e.target === overlayEl) closeOverlay();
        });
        
        renderFrame();
    }

    function generateDiffHtml(oldHtml, newHtml) {
        const tempOld = document.createElement('div'); tempOld.innerHTML = oldHtml;
        const tempNew = document.createElement('div'); tempNew.innerHTML = newHtml;

        // Strip UI chrome from interactive elements so only user text remains
        const chromeSelector = '.skriv-slot-chips, .skriv-slot-prompt, .skriv-image-drag-handle, .skriv-image-handles, .skriv-toc';
        tempOld.querySelectorAll(chromeSelector).forEach(e => e.remove());
        tempNew.querySelectorAll(chromeSelector).forEach(e => e.remove());

        const oldText = tempOld.textContent || '';
        const newText = tempNew.textContent || '';

        const tokenRegex = /([a-zA-ZæøåÆØÅ0-9]+|\s+|[^a-zA-ZæøåÆØÅ0-9\s]+)/g;
        const oldWords = oldText.match(tokenRegex) || [];
        const newWords = newText.match(tokenRegex) || [];

        let html = '';
        let i = 0, j = 0;
        
        while (i < oldWords.length || j < newWords.length) {
            if (i < oldWords.length && j < newWords.length && oldWords[i] === newWords[j]) {
                html += escapeHtml(oldWords[i]);
                i++; j++;
            } else {
                let foundMatch = false;
                for (let lookAhead = 1; lookAhead < 30 && !foundMatch; lookAhead++) {
                    if (i + lookAhead < oldWords.length && oldWords[i + lookAhead] === newWords[j]) {
                        html += `<del style="background:#fee2e2;color:#991b1b;text-decoration:line-through;">${escapeHtml(oldWords.slice(i, i + lookAhead).join(''))}</del>`;
                        i += lookAhead;
                        foundMatch = true;
                    } else if (j + lookAhead < newWords.length && oldWords[i] === newWords[j + lookAhead]) {
                        html += `<ins style="background:#dcfce7;color:#166534;text-decoration:none;">${escapeHtml(newWords.slice(j, j + lookAhead).join(''))}</ins>`;
                        j += lookAhead;
                        foundMatch = true;
                    }
                }
                if (!foundMatch) {
                    if (i < oldWords.length) {
                        html += `<del style="background:#fee2e2;color:#991b1b;text-decoration:line-through;">${escapeHtml(oldWords[i])}</del>`;
                        i++;
                    }
                    if (j < newWords.length) {
                        html += `<ins style="background:#dcfce7;color:#166534;text-decoration:none;">${escapeHtml(newWords[j])}</ins>`;
                        j++;
                    }
                }
            }
        }
        return html;
    }

    function closeOverlay() {
        if (overlayEl) {
            isPlaying = false;
            clearTimeout(playbackTimer);
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
            const snaps = await getSnapshots();
            const majorSnaps = snaps.filter(s => s.isMajor);
            
            if (majorSnaps.length === 0) {
                // Force an initial major snapshot ("Document Created")
                await saveSnapshot(true);
            } else {
                // Just initialize state to prevent duplicate saving
                lastSnapshotContent = editor.innerHTML;
                lastSnapshotWords = countWords(editor.textContent);
            }
        } catch (err) {
            console.warn('[version-history] Failed to initialize IndexedDB:', err);
        }
    }
    init();

    // --- Destroy ---
    function destroy() {
        editor.removeEventListener('input', handleInput);
        if (timelineIntervalId) clearInterval(timelineIntervalId);
        if (majorIntervalId) clearInterval(majorIntervalId);
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
