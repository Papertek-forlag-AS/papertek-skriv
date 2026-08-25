/**
 * Read Aloud (opplesing)
 *
 * Reads the document out loud with the Web Speech API (speechSynthesis).
 * Reads block by block: the block being spoken is highlighted and scrolled
 * into view, so pupils can follow along visually — a key support for
 * dyslexic readers. Starts from the block containing the caret/selection
 * when there is one, otherwise from the top.
 *
 * Long blocks are split into sentence-sized chunks to dodge the well-known
 * Chrome bug where long utterances go silent after ~15 seconds.
 *
 * All data stays local; speechSynthesis voices are provided by the OS.
 * No network calls.
 */

import { t } from '../shared/i18n.js';
import { isFrameElement } from '../shared/frame-elements.js';
import { showToast } from '../shared/toast-notification.js';
import { langToTag } from './editor-lang.js';

const HIGHLIGHT_CLASS = 'skriv-reading-current';
const MAX_CHUNK_LENGTH = 200;
const RATES = [0.75, 1, 1.25];

const CSS = `
.skriv-readaloud-panel {
    position: fixed;
    bottom: 3.5rem;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(8px);
    border: 1px solid #e7e5e4;
    border-radius: 999px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.12);
    z-index: 90;
    font-size: 0.85rem;
}
.dark .skriv-readaloud-panel {
    background: rgba(41, 37, 36, 0.95);
    border-color: #44403c;
}
.skriv-readaloud-panel.hidden { display: none; }
.skriv-readaloud-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.75rem;
    border: 1px solid #d6d3d1;
    border-radius: 999px;
    background: none;
    color: #44403c;
    cursor: pointer;
    font-size: 0.8rem;
    transition: background 0.1s, color 0.1s;
}
.skriv-readaloud-btn:hover { background: #f5f5f4; }
.dark .skriv-readaloud-btn { color: #d6d3d1; border-color: #57534e; }
.dark .skriv-readaloud-btn:hover { background: #44403c; }
.skriv-readaloud-btn.primary {
    background: #059669;
    border-color: #059669;
    color: #fff;
}
.skriv-readaloud-btn.primary:hover { background: #047857; }
.skriv-readaloud-close {
    border: none;
    background: none;
    color: #a8a29e;
    font-size: 1.1rem;
    cursor: pointer;
    padding: 0 0.25rem;
}
.skriv-readaloud-close:hover { color: #57534e; }
.${HIGHLIGHT_CLASS} {
    background: #fef3c7;
    border-radius: 4px;
    transition: background 0.2s;
}
.dark .${HIGHLIGHT_CLASS} { background: #78350f; }
`;

/**
 * Split text into speakable chunks: whole sentences where possible,
 * hard-split at commas/spaces when a single sentence exceeds maxLength.
 * Exported for tests.
 * @param {string} text
 * @param {number} [maxLength]
 * @returns {string[]}
 */
export function splitIntoChunks(text, maxLength = MAX_CHUNK_LENGTH) {
    const trimmed = (text || '').trim().replace(/\s+/g, ' ');
    if (!trimmed) return [];

    // Sentence-ish split that keeps the terminator with the sentence.
    const sentences = trimmed.match(/[^.!?…]+[.!?…]+["»']?\s*|[^.!?…]+$/g) || [trimmed];

    const chunks = [];
    for (const sentence of sentences) {
        let s = sentence.trim();
        if (!s) continue;
        while (s.length > maxLength) {
            // Prefer breaking at a comma, then at any space, inside the window.
            const window = s.slice(0, maxLength);
            let cut = window.lastIndexOf(', ');
            if (cut === -1) cut = window.lastIndexOf(' ');
            if (cut <= 0) cut = maxLength;
            chunks.push(s.slice(0, cut + 1).trim());
            s = s.slice(cut + 1).trim();
        }
        if (s) chunks.push(s);
    }
    return chunks;
}

/**
 * Pick the best available voice for a writing language.
 * Exported for tests.
 * @param {Array<{lang: string, localService?: boolean}>} voices
 * @param {string} lang - 'nb' | 'nn' | 'en' | 'de' | ...
 * @returns {object|null}
 */
export function pickVoice(voices, lang) {
    if (!voices || !voices.length) return null;
    // Norwegian voices report nb-NO, nn-NO or no-NO depending on OS.
    const prefixes = (lang === 'nb' || lang === 'nn') ? ['nb', 'nn', 'no'] : [lang];
    for (const prefix of prefixes) {
        const matches = voices.filter(v => (v.lang || '').toLowerCase().startsWith(prefix));
        if (matches.length) {
            // Local voices start faster and work offline.
            return matches.find(v => v.localService) || matches[0];
        }
    }
    return null;
}

/**
 * Initialize the read-aloud feature.
 * @param {HTMLElement} editor - The contenteditable element
 * @param {HTMLElement} container - Parent for the control panel
 * @param {object} [options]
 * @param {() => string} [options.getLang] - Language the pupil writes in ('nb'|'nn'|'en'|'de'|...)
 * @returns {{ toggle, show, hide, isActive, destroy }}
 */
export function initReadAloud(editor, container, options = {}) {
    const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

    let styleEl = null;
    let panel = null;
    let speaking = false;
    let paused = false;
    let rateIndex = 1;
    let currentBlock = null;
    let queue = [];       // [{ block, chunks }]
    let cancelled = false;

    if (!document.getElementById('skriv-readaloud-styles')) {
        styleEl = document.createElement('style');
        styleEl.id = 'skriv-readaloud-styles';
        styleEl.textContent = CSS;
        document.head.appendChild(styleEl);
    }

    // --- Panel ---
    panel = document.createElement('div');
    panel.className = 'skriv-readaloud-panel hidden';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', t('readAloud.title'));
    panel.innerHTML = `
        <button type="button" class="skriv-readaloud-btn primary" data-action="play">▶ ${t('readAloud.play')}</button>
        <button type="button" class="skriv-readaloud-btn hidden" data-action="pause">⏸ ${t('readAloud.pause')}</button>
        <button type="button" class="skriv-readaloud-btn hidden" data-action="resume">▶ ${t('readAloud.resume')}</button>
        <button type="button" class="skriv-readaloud-btn hidden" data-action="stop">⏹ ${t('readAloud.stop')}</button>
        <button type="button" class="skriv-readaloud-btn" data-action="rate" title="${t('readAloud.speed')}">1×</button>
        <button type="button" class="skriv-readaloud-close" data-action="close" aria-label="${t('common.cancel')}">×</button>
    `;
    container.appendChild(panel);

    const btn = (action) => panel.querySelector(`[data-action="${action}"]`);

    function updateButtons() {
        btn('play').classList.toggle('hidden', speaking);
        btn('pause').classList.toggle('hidden', !speaking || paused);
        btn('resume').classList.toggle('hidden', !speaking || !paused);
        btn('stop').classList.toggle('hidden', !speaking);
    }

    // --- Block collection ---

    /** True for blocks that hold readable document text. */
    function isReadableBlock(el) {
        if (!(el instanceof HTMLElement)) return false;
        if (isFrameElement(el)) return false;
        if (el.classList.contains('skriv-frame-divider')) return false;
        if (el.classList.contains('skriv-image-block')) return false;
        return !!el.textContent.trim();
    }

    /** Text of a block, minus any frame scaffolding nested inside it. */
    function blockText(el) {
        const clone = el.cloneNode(true);
        for (const child of clone.querySelectorAll('*')) {
            if (isFrameElement(child) || child.classList?.contains('skriv-image-block')) {
                child.remove();
            }
        }
        return clone.textContent;
    }

    function collectBlocks() {
        return [...editor.children].filter(isReadableBlock);
    }

    /** Index of the block containing the caret, or 0. */
    function startIndex(blocks) {
        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0) {
            let node = sel.getRangeAt(0).startContainer;
            if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
            const block = node?.closest ? blocks.find(b => b.contains(node)) : null;
            if (block) return blocks.indexOf(block);
        }
        return 0;
    }

    // --- Highlight ---

    function highlight(block) {
        clearHighlight();
        currentBlock = block;
        if (block) {
            block.classList.add(HIGHLIGHT_CLASS);
            block.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }

    function clearHighlight() {
        if (currentBlock) currentBlock.classList.remove(HIGHLIGHT_CLASS);
        currentBlock = null;
    }

    // --- Speech ---

    function speakNext() {
        if (cancelled || !queue.length) {
            stop(false);
            return;
        }
        const item = queue[0];
        if (!item.chunks.length) {
            queue.shift();
            speakNext();
            return;
        }
        if (currentBlock !== item.block) highlight(item.block);

        const chunk = item.chunks.shift();
        const utterance = new SpeechSynthesisUtterance(chunk);
        const lang = options.getLang ? options.getLang() : 'nb';
        utterance.lang = langToTag(lang);
        const voice = pickVoice(window.speechSynthesis.getVoices(), lang);
        if (voice) utterance.voice = voice;
        utterance.rate = RATES[rateIndex];
        utterance.onend = () => { if (!cancelled) speakNext(); };
        utterance.onerror = () => { if (!cancelled) speakNext(); };
        window.speechSynthesis.speak(utterance);
    }

    function play() {
        if (!supported) {
            showToast(t('readAloud.unsupported'));
            return;
        }
        stop(false);
        const blocks = collectBlocks();
        if (!blocks.length) {
            showToast(t('readAloud.empty'));
            return;
        }
        queue = blocks.slice(startIndex(blocks)).map(block => ({
            block,
            chunks: splitIntoChunks(blockText(block)),
        }));
        cancelled = false;
        speaking = true;
        paused = false;
        updateButtons();
        speakNext();
    }

    function pause() {
        if (!speaking) return;
        window.speechSynthesis.pause();
        paused = true;
        updateButtons();
    }

    function resume() {
        if (!speaking) return;
        window.speechSynthesis.resume();
        paused = false;
        updateButtons();
    }

    function stop(updateUi = true) {
        cancelled = true;
        if (supported) window.speechSynthesis.cancel();
        queue = [];
        speaking = false;
        paused = false;
        clearHighlight();
        if (updateUi) updateButtons();
    }

    function cycleRate() {
        rateIndex = (rateIndex + 1) % RATES.length;
        btn('rate').textContent = `${RATES[rateIndex]}×`;
        // Applies from the next chunk; restarting mid-word would be jarring.
    }

    // --- Panel visibility ---

    function show() {
        panel.classList.remove('hidden');
        updateButtons();
    }

    function hide() {
        stop();
        panel.classList.add('hidden');
    }

    function toggle() {
        if (panel.classList.contains('hidden')) show();
        else hide();
    }

    function onPanelClick(e) {
        const action = e.target.closest('[data-action]')?.dataset.action;
        if (!action) return;
        if (action === 'play') play();
        else if (action === 'pause') pause();
        else if (action === 'resume') resume();
        else if (action === 'stop') stop();
        else if (action === 'rate') cycleRate();
        else if (action === 'close') hide();
    }
    panel.addEventListener('click', onPanelClick);

    // Chrome loads voices asynchronously; poke the list so the first
    // play() call finds them.
    if (supported && window.speechSynthesis.getVoices().length === 0) {
        window.speechSynthesis.addEventListener?.('voiceschanged', () => {}, { once: true });
    }

    function destroy() {
        stop(false);
        panel.removeEventListener('click', onPanelClick);
        panel.remove();
        if (styleEl) styleEl.remove();
    }

    return { toggle, show, hide, isActive: () => speaking, destroy };
}
