/**
 * Writing Feedback — rule-based writing tips for Norwegian students.
 *
 * Provides automated feedback WITHOUT AI — pure pattern matching.
 * Checks: passive voice, filler words, paragraph length,
 * missing sources, sentence start repetition, very long sentences.
 *
 * Usage:
 *   import { initWritingFeedback } from './writing-feedback.js';
 *   const { destroy, toggle, isActive, analyze } = initWritingFeedback(editor, container, {
 *       getActiveFrame: () => 'droefting'
 *   });
 */

import { t } from '../shared/i18n.js';
import { isFrameElement, isImageBlock } from '../shared/frame-elements.js';

// --- Constants ---

const DEBOUNCE_MS = 1000;

const FILLER_WORDS = {
    nb: [
        'liksom', 'bare', 'egentlig', 'faktisk', 'vel', 'altså',
        'jo', 'nok', 'visst', 'sikkert', 'litt', 'ganske',
        'veldig', 'virkelig'
    ],
    nn: [
        'liksom', 'berre', 'eigentleg', 'faktisk', 'vel', 'altså',
        'jo', 'nok', 'visst', 'sikkert', 'litt', 'ganske',
        'veldig', 'verkeleg'
    ],
};

// Reflexive/deponent verbs that are NOT passive (allowlist, normalized
// via normalize() so both nb -s/-es and nn -ast forms are covered)
const REFLEXIVE_VERBS = [
    'moetes', 'trives', 'finnes', 'lykkes', 'minnes', 'synes',
    'ferdes', 'skjelves', 'lages', 'slippes', 'trenges',
    'moetast', 'trivast', 'finnast', 'lukkast', 'minnast', 'synast',
    'ferdast', 'kjennest', 'tykkjest'
];

// Passive auxiliary patterns (nb ble/blir/blitt, nn vart/vert/blei).
// The -a participle form requires 3+ stem letters so short adjectives
// («blei bra») don't trigger.
const PASSIVE_AUX_REGEX = /\b(?:ble|blir|blitt|vart|vert|blei)\s+(\w+(?:t|et|dd)|\w{3,}a)\b/gi;
// s-passive: only flag the explicit det-passive construction
// («det vises», «det hevdes», nn «det gjerast») — matching bare words
// ending in -s produced false hits on plurals and genitives.
const PASSIVE_S_REGEX = /\b(?:det|dette|her)\s+([a-zæøå]{3,}(?:es|ast))\b/gi;

const PARAGRAPH_MAX_WORDS = 200;
const PARAGRAPH_MIN_WORDS = 20;
const SENTENCE_MAX_WORDS = 40;
const FILLER_THRESHOLD = 3;
const REPETITION_THRESHOLD = 3;
const SOURCE_MIN_WORDS = 300;

// Frames that require source citations
const SOURCE_REQUIRED_FRAMES = ['droefting', 'kronikk', 'fagartikkel'];

// --- Styles ---

const STYLES = `
.skriv-feedback-btn {
    position: relative;
}
.skriv-feedback-badge {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 18px;
    height: 18px;
    border-radius: 9px;
    background: #f59e0b;
    color: #fff;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 4px;
    line-height: 1;
}
.skriv-feedback-panel {
    position: absolute;
    top: 0;
    right: 0;
    width: 260px;
    height: 100%;
    background: var(--skriv-bg, #fff);
    border-left: 1px solid var(--skriv-border, #e5e7eb);
    overflow-y: auto;
    z-index: 50;
    padding: 12px;
    box-sizing: border-box;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.5;
    color: var(--skriv-text, #1f2937);
}
.skriv-feedback-panel h3 {
    margin: 0 0 8px;
    font-size: 14px;
    font-weight: 600;
}
.skriv-feedback-group {
    margin-bottom: 16px;
}
.skriv-feedback-group-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--skriv-muted, #6b7280);
    margin-bottom: 6px;
    font-weight: 600;
}
.skriv-feedback-card {
    background: var(--skriv-card-bg, #f9fafb);
    border: 1px solid var(--skriv-border, #e5e7eb);
    border-left: 3px solid #f59e0b;
    border-radius: 6px;
    padding: 8px 10px;
    margin-bottom: 6px;
    display: flex;
    align-items: flex-start;
    gap: 8px;
}
.skriv-feedback-card--tip {
    border-left-color: #3b82f6;
}
.skriv-feedback-card-icon {
    flex-shrink: 0;
    font-size: 14px;
    line-height: 1.5;
}
.skriv-feedback-card-body {
    flex: 1;
    min-width: 0;
}
.skriv-feedback-card-text {
    margin: 0;
    font-size: 12px;
    word-wrap: break-word;
}
.skriv-feedback-card-btn {
    display: inline-block;
    margin-top: 4px;
    font-size: 11px;
    color: #3b82f6;
    cursor: pointer;
    background: none;
    border: none;
    padding: 0;
    text-decoration: underline;
}
.skriv-feedback-card-btn:hover {
    color: #1d4ed8;
}
.skriv-feedback-empty {
    text-align: center;
    color: var(--skriv-muted, #6b7280);
    padding: 24px 12px;
    font-size: 13px;
}
.skriv-feedback-highlight {
    background: #fef3c7;
    border-radius: 2px;
    transition: background 0.3s;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    .skriv-feedback-panel {
        --skriv-bg: #1f2937;
        --skriv-border: #374151;
        --skriv-text: #f3f4f6;
        --skriv-muted: #9ca3af;
        --skriv-card-bg: #111827;
    }
    .skriv-feedback-highlight {
        background: #78350f;
    }
}
`;

// --- Utility functions ---

/**
 * Count words in a string.
 */
function countWords(text) {
    const trimmed = text.trim();
    if (!trimmed) return 0;
    return trimmed.split(/\s+/).length;
}

/**
 * Split text into sentences (Norwegian punctuation aware).
 */
function splitSentences(text) {
    // Split on . ! ? followed by space or end, but not abbreviations
    const raw = text.split(/(?<=[.!?])\s+/);
    return raw
        .map(s => s.trim())
        .filter(s => s.length > 0 && countWords(s) >= 2);
}

/**
 * Normalize text for comparison (lowercase, strip accents on ae/oe/aa).
 */
function normalize(word) {
    return word.toLowerCase()
        .replace(/æ/g, 'ae')
        .replace(/ø/g, 'oe')
        .replace(/å/g, 'aa');
}

// --- Main export ---

export function initWritingFeedback(editor, container, options = {}) {
    const { getActiveFrame, getWritingLang } = options;

    // Document writing language, collapsed to the two data languages.
    function dataLang() {
        return (getWritingLang ? getWritingLang() : 'nb') === 'nn' ? 'nn' : 'nb';
    }

    let active = false;
    let panel = null;
    let findings = [];
    let styleEl = null;
    let debounceTimer = null;
    let inputHandler = null;
    let badge = null;
    let toolbarBtn = null;

    // Inject styles
    styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    // --- Text extraction ---

    /**
     * Get paragraphs from editor, excluding frame scaffold and images.
     * Returns array of { text, element } objects.
     */
    function getParagraphs() {
        const paragraphs = [];
        const children = editor.children;
        for (let i = 0; i < children.length; i++) {
            const el = children[i];
            if (isFrameElement(el) || isImageBlock(el)) continue;
            const text = (el.innerText || '').trim();
            if (text) {
                paragraphs.push({ text, element: el });
            }
        }
        return paragraphs;
    }

    /**
     * Get full text from editor (excluding frame elements).
     */
    function getFullText() {
        return getParagraphs().map(p => p.text).join('\n\n');
    }

    // --- Analysis checks ---

    function checkPassiveVoice(sentences) {
        for (const { text, element } of sentences) {
            // Pattern 1: auxiliary + past participle
            const auxMatches = [...text.matchAll(PASSIVE_AUX_REGEX)];
            for (const match of auxMatches) {
                findings.push({
                    type: 'passive',
                    group: t('feedback.groupPassive'),
                    icon: '⚠️',
                    severity: 'warning',
                    text: t('feedback.passiveWord', { word: match[0] }),
                    excerpt: text.substring(0, 60),
                    element
                });
            }

            // Pattern 2: det-passive -es/-ast verbs
            const sMatches = [...text.matchAll(PASSIVE_S_REGEX)];
            for (const match of sMatches) {
                // Skip if in reflexive allowlist
                if (REFLEXIVE_VERBS.includes(normalize(match[1]))) continue;
                findings.push({
                    type: 'passive',
                    group: t('feedback.groupPassive'),
                    icon: '⚠️',
                    severity: 'warning',
                    text: t('feedback.passiveWord', { word: match[0] }),
                    excerpt: text.substring(0, 60),
                    element
                });
            }
        }
    }

    function checkFillerWords(fullText) {
        // normalize() lowercases and folds æ/ø/å to ASCII, so \b works
        // for words like «altså» that end in a non-\w character.
        const searchText = normalize(fullText);

        for (const filler of FILLER_WORDS[dataLang()]) {
            const regex = new RegExp(`\\b${normalize(filler)}\\b`, 'g');
            const matches = searchText.match(regex);
            const count = matches ? matches.length : 0;

            if (count >= FILLER_THRESHOLD) {
                findings.push({
                    type: 'filler',
                    group: t('feedback.groupFiller'),
                    icon: '💡',
                    severity: 'tip',
                    text: t('feedback.filler', { word: filler, count }),
                    element: null
                });
            }
        }
    }

    function checkParagraphLength(paragraphs) {
        for (const { text, element } of paragraphs) {
            const wc = countWords(text);
            if (wc > PARAGRAPH_MAX_WORDS) {
                findings.push({
                    type: 'paragraph-length',
                    group: t('feedback.groupParagraphs'),
                    icon: '📝',
                    severity: 'warning',
                    text: t('feedback.longParagraph', { count: wc }),
                    excerpt: text.substring(0, 50),
                    element
                });
            } else if (wc < PARAGRAPH_MIN_WORDS && wc > 0) {
                findings.push({
                    type: 'paragraph-length',
                    group: t('feedback.groupParagraphs'),
                    icon: '📝',
                    severity: 'tip',
                    text: t('feedback.shortParagraph', { count: wc }),
                    excerpt: text.substring(0, 50),
                    element
                });
            }
        }
    }

    function checkMissingSources(fullText) {
        const frame = getActiveFrame ? getActiveFrame() : null;
        if (!frame) return;

        const normalizedFrame = normalize(frame);
        const requiresSources = SOURCE_REQUIRED_FRAMES.some(f => normalizedFrame.includes(f));
        if (!requiresSources) return;

        const wc = countWords(fullText);
        if (wc < SOURCE_MIN_WORDS) return;

        // Check for citation markers (nb «ifølge», nn «ifølgje»)
        const hasCitation = /\[\d+\]/.test(fullText)
            || /ifølgj?e/i.test(fullText)
            || /i følgj?e/i.test(fullText)
            || /\(.*\d{4}.*\)/.test(fullText);

        if (!hasCitation) {
            findings.push({
                type: 'missing-sources',
                group: t('feedback.groupSources'),
                icon: '⚠️',
                severity: 'warning',
                text: t('feedback.noSources'),
                element: null
            });
        }
    }

    function checkSentenceStartRepetition(sentences) {
        if (sentences.length < REPETITION_THRESHOLD) return;

        let streak = 1;
        let streakWord = '';
        let streakStart = 0;

        for (let i = 1; i < sentences.length; i++) {
            const prevFirst = getFirstWord(sentences[i - 1].text);
            const currFirst = getFirstWord(sentences[i].text);

            if (prevFirst && currFirst && prevFirst === currFirst) {
                if (streak === 1) {
                    streakWord = currFirst;
                    streakStart = i - 1;
                }
                streak++;
            } else {
                if (streak >= REPETITION_THRESHOLD) {
                    findings.push({
                        type: 'repetition',
                        group: t('feedback.groupVariation'),
                        icon: '💡',
                        severity: 'tip',
                        text: t('feedback.sentenceRepeat', { count: streak, word: streakWord }),
                        element: sentences[streakStart].element
                    });
                }
                streak = 1;
            }
        }

        // Check final streak
        if (streak >= REPETITION_THRESHOLD) {
            findings.push({
                type: 'repetition',
                group: t('feedback.groupVariation'),
                icon: '💡',
                severity: 'tip',
                text: t('feedback.sentenceRepeat', { count: streak, word: streakWord }),
                element: sentences[streakStart].element
            });
        }
    }

    function checkVeryLongSentences(sentences) {
        for (const { text, element } of sentences) {
            const wc = countWords(text);
            if (wc > SENTENCE_MAX_WORDS) {
                findings.push({
                    type: 'long-sentence',
                    group: t('feedback.groupSentences'),
                    icon: '⚠️',
                    severity: 'warning',
                    text: t('feedback.longSentence', { count: wc }),
                    excerpt: text.substring(0, 60),
                    element
                });
            }
        }
    }

    // --- Helpers ---

    function getFirstWord(sentence) {
        const match = sentence.match(/^\s*(\w+)/);
        return match ? match[1].toLowerCase() : '';
    }

    /**
     * Get sentences with their parent element reference.
     * Returns array of { text, element }.
     */
    function getSentencesWithElements() {
        const paragraphs = getParagraphs();
        const sentences = [];
        for (const { text, element } of paragraphs) {
            const paraSentences = splitSentences(text);
            for (const s of paraSentences) {
                sentences.push({ text: s, element });
            }
        }
        return sentences;
    }

    // --- Core analysis ---

    function analyze() {
        findings = [];
        const paragraphs = getParagraphs();
        const fullText = getFullText();
        const sentences = getSentencesWithElements();

        checkPassiveVoice(sentences);
        checkFillerWords(fullText);
        checkParagraphLength(paragraphs);
        checkMissingSources(fullText);
        checkSentenceStartRepetition(sentences);
        checkVeryLongSentences(sentences);

        updateBadge();
        if (active && panel) {
            renderPanel();
        }
    }

    // --- UI ---

    function updateBadge() {
        if (!badge) return;
        const count = findings.length;
        badge.textContent = count > 0 ? String(count) : '';
        badge.style.display = count > 0 ? 'flex' : 'none';
    }

    function showPanel() {
        if (panel) return;
        panel = document.createElement('div');
        panel.className = 'skriv-feedback-panel';
        container.style.position = 'relative';
        container.appendChild(panel);
        renderPanel();
    }

    function hidePanel() {
        if (panel) {
            panel.remove();
            panel = null;
        }
        clearHighlights();
    }

    function renderPanel() {
        if (!panel) return;

        if (findings.length === 0) {
            panel.innerHTML = `
                <h3>${escapeHtml(t('feedback.title'))}</h3>
                <div class="skriv-feedback-empty">
                    ${escapeHtml(t('feedback.noFindings'))}
                </div>`;
            return;
        }

        // Group findings by group name
        const groups = {};
        for (const f of findings) {
            if (!groups[f.group]) groups[f.group] = [];
            groups[f.group].push(f);
        }

        let html = `<h3>${escapeHtml(t('feedback.title'))} <span style="font-weight:400;font-size:12px;color:var(--skriv-muted,#6b7280)">(${findings.length})</span></h3>`;

        for (const [groupName, items] of Object.entries(groups)) {
            html += `<div class="skriv-feedback-group">`;
            html += `<div class="skriv-feedback-group-title">${escapeHtml(groupName)}</div>`;
            for (let i = 0; i < items.length; i++) {
                const f = items[i];
                const cardClass = f.severity === 'tip' ? 'skriv-feedback-card skriv-feedback-card--tip' : 'skriv-feedback-card';
                const showBtn = f.element
                    ? `<button class="skriv-feedback-card-btn" data-finding-idx="${findings.indexOf(f)}">${escapeHtml(t('feedback.show'))}</button>`
                    : '';
                html += `
                    <div class="${cardClass}">
                        <span class="skriv-feedback-card-icon">${f.icon}</span>
                        <div class="skriv-feedback-card-body">
                            <p class="skriv-feedback-card-text">${escapeHtml(f.text)}</p>
                            ${showBtn}
                        </div>
                    </div>`;
            }
            html += `</div>`;
        }

        panel.innerHTML = html;

        // Attach click handlers for "Vis" buttons
        panel.querySelectorAll('.skriv-feedback-card-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(btn.dataset.findingIdx, 10);
                const finding = findings[idx];
                if (finding && finding.element) {
                    scrollToAndHighlight(finding.element);
                }
            });
        });
    }

    function scrollToAndHighlight(element) {
        clearHighlights();
        element.classList.add('skriv-feedback-highlight');
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Remove highlight after 3s
        setTimeout(() => {
            element.classList.remove('skriv-feedback-highlight');
        }, 3000);
    }

    function clearHighlights() {
        editor.querySelectorAll('.skriv-feedback-highlight').forEach(el => {
            el.classList.remove('skriv-feedback-highlight');
        });
    }

    function escapeHtml(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // --- Input listening ---

    function onInput() {
        if (!active) return;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(analyze, DEBOUNCE_MS);
    }

    inputHandler = onInput;
    editor.addEventListener('input', inputHandler);

    // --- Public API ---

    function toggle(btn) {
        active = !active;
        if (btn) {
            toolbarBtn = btn;
        }
        if (active) {
            analyze();
            showPanel();
        } else {
            hidePanel();
        }
        return active;
    }

    function setBadgeElement(el) {
        badge = el;
        updateBadge();
    }

    function destroy() {
        active = false;
        clearTimeout(debounceTimer);
        if (inputHandler) {
            editor.removeEventListener('input', inputHandler);
        }
        hidePanel();
        if (styleEl && styleEl.parentNode) {
            styleEl.parentNode.removeChild(styleEl);
        }
        styleEl = null;
        badge = null;
        toolbarBtn = null;
    }

    return {
        destroy,
        toggle,
        isActive: () => active,
        analyze,
        setBadgeElement,
        getFindings: () => [...findings]
    };
}
