/**
 * Paragraph Trainer — drill the three-step paragraph model
 * (trestegsmodellen): temasetning → utdyping → avslutningssetning.
 *
 * Genre-independent: the student draws a random claim from a topic deck
 * (no repeats until exhausted, like the German exam spinner), writes ONE
 * paragraph in three labelled fields, self-checks against a checklist,
 * and can view/copy the assembled paragraph as flowing text.
 *
 * The in-progress attempt (topic + field texts + checklist) persists in
 * localStorage so a reload or navigation doesn't lose the draft.
 *
 * Starter chips reuse the skriveramme system (frame-guide): the authored
 * STEP_STARTERS are the initial fill, and "🎲 Flere forslag" draws extra
 * starters on demand from the writing-spinner word bank (generell +
 * droefting genres, level-aware), with a sliding window of visible chips,
 * scramble reveal, and no repeats until a step's buckets are exhausted.
 *
 * Portable: no imports from app/. Works standalone.
 *
 * Usage:
 *   import { initParagraphTrainer } from './paragraph-trainer.js';
 *   const trainer = initParagraphTrainer(container, {
 *       getLevel: () => 'ungdomsskole',  // optional school level for us/vgs tier
 *   });
 *   trainer.destroy();
 */

import { t, getCurrentLanguage, getDateLocale } from '../shared/i18n.js';
import { escapeHtml } from '../shared/html-escape.js';
import { countWords } from '../shared/word-counter.js';
import { showToast } from '../shared/toast-notification.js';
import { showInPageConfirm } from '../shared/in-page-modal.js';
import { TRAINER_TOPICS, STEP_STARTERS } from './paragraph-trainer-data.js';

const DECK_KEY = 'papertek.skriv.paragraphTrainer.deck';
const DRAFT_KEY = 'papertek.skriv.paragraphTrainer.draft';
const HISTORY_KEY = 'papertek.skriv.paragraphTrainer.history';
const HISTORY_MAX = 20;

// Max starter chips visible per step (sliding window, same idea as the
// frame guide): a 🎲 draw appends a new pick and pushes the oldest out.
const MAX_VISIBLE_STARTERS = 3;

const SCRAMBLE_CHARS = 'abcdefghijklmnoprstuvwxyzæøå';
const SCRAMBLE_DURATION = 500;

// Genres of the writing-spinner word bank the trainer draws from. Both fit
// an opinion paragraph; pools are merged since the nn bank spreads the
// argumentative buckets differently (generell lacks argument/eksempel there).
const SPINNER_GENRES = ['generell', 'droefting'];

// spinnerBuckets: which word-bank buckets fit each step of the paragraph
// model. Both nb and nn spellings are listed (innledning vs innleiing).
const STEPS = [
    { key: 'topic', starterKey: 'topic', spinnerBuckets: ['innledning', 'innleiing'] },
    { key: 'support', starterKey: 'support', spinnerBuckets: ['argument', 'eksempel', 'motargument', 'overgang'] },
    { key: 'closing', starterKey: 'closing', spinnerBuckets: ['avslutning'] },
];

// ─── Live checklist heuristics ───────────────────────────────────────────
// The checklist items are verified automatically from the text. They are
// FORM checks (one sentence, a causal marker present, a shared keyword),
// so the hints phrase them as writing tips rather than verdicts — the
// model can see structure, not whether the content is good.

// Causal / justification markers (nb + nn variants in one list).
const CAUSAL_MARKERS = [
    'fordi', 'derfor', 'difor', 'siden', 'sidan', 'ettersom',
    'grunnen er', 'grunnen til', 'dermed', 'slik at', 'det fører til',
];

// Example markers (nb + nn variants).
const EXAMPLE_MARKERS = [
    'for eksempel', 'f.eks', 'til dømes', 'blant annet', 'mellom anna',
    'et eksempel', 'eit døme', 'som da ', 'som då ', 'et godt eksempel',
];

// Small words ignored when looking for an echoed keyword between the
// topic sentence and the closing sentence.
const ECHO_STOPWORDS = new Set([
    'dette', 'derfor', 'difor', 'fordi', 'likevel', 'skal', 'ikke', 'ikkje',
    'være', 'vere', 'blir', 'vert', 'har', 'kan', 'ganske', 'veldig',
    'også', 'over', 'under', 'etter', 'alle', 'noen', 'nokre', 'mange',
    'mener', 'meiner', 'synes', 'synest',
]);

function countSentences(text) {
    return text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.split(/\s+/).length >= 2).length;
}

function contentWords(text) {
    return new Set(
        text.toLowerCase().replace(/[^a-zæøåäöüé\s-]/gi, ' ').split(/\s+/)
            .filter(w => w.length >= 4 && !ECHO_STOPWORDS.has(w))
    );
}

/**
 * Evaluate the four checklist items against the three step texts.
 * @param {string[]} steps - [topic, support, closing]
 * @returns {Array<{pass: boolean, written: boolean}>}
 */
export function evaluateChecks(steps) {
    const [topic, support, closing] = steps.map(s => (s || '').trim());
    const supportLower = ` ${support.toLowerCase()} `;
    const topicWords = contentWords(topic);
    const echoed = [...contentWords(closing)].some(w => topicWords.has(w));
    const wc = topic ? topic.split(/\s+/).length : 0;

    return [
        { pass: !!topic && countSentences(topic) === 1 && wc >= 3 && wc <= 30, written: !!topic },
        { pass: CAUSAL_MARKERS.some(m => supportLower.includes(m)), written: !!support },
        { pass: EXAMPLE_MARKERS.some(m => supportLower.includes(m)), written: !!support },
        { pass: !!closing && echoed, written: !!closing },
    ];
}

// ─── Attempt history ─────────────────────────────────────────────────────
// Logged only when the pupil actively finishes (copies or saves the
// paragraph) — never on every keystroke. Kept deliberately small: a flat
// list the pupil can look back at for mastery, not an analytics surface.

/**
 * Prepend an entry to a history list, dropping consecutive duplicates
 * (copy + save of the same paragraph is one attempt) and capping length.
 * Pure — exported for tests.
 * @param {Array} list - existing history, newest first
 * @param {{ts, topic, text, checksPassed, checksTotal, words}} entry
 * @param {number} [max]
 * @returns {Array} new list
 */
export function appendHistoryEntry(list, entry, max = HISTORY_MAX) {
    const existing = Array.isArray(list) ? list : [];
    if (existing.length && existing[0].text === entry.text) return existing;
    return [entry, ...existing].slice(0, max);
}

function loadHistory() {
    try {
        const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY));
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function saveHistory(list) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(list)); } catch {}
}

// ─── Deck persistence (same scheme as german-exam-spinner) ───────────────

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function loadDeck() {
    try {
        const parsed = JSON.parse(localStorage.getItem(DECK_KEY));
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function saveDeck(ids) {
    try { localStorage.setItem(DECK_KEY, JSON.stringify(ids)); } catch {}
}

function ensureDeck() {
    const existing = loadDeck();
    // Filter out ids that no longer exist in the corpus (topic list edits)
    const validIds = new Set(TRAINER_TOPICS.map(topic => topic.id));
    const cleaned = existing ? existing.filter(id => validIds.has(id)) : [];
    if (cleaned.length > 0) return cleaned;
    const reshuffled = shuffle([...validIds]);
    saveDeck(reshuffled);
    return reshuffled;
}

function drawTopic() {
    const deck = ensureDeck();
    const id = deck[0];
    saveDeck(deck.slice(1));
    return TRAINER_TOPICS.find(topic => topic.id === id) || TRAINER_TOPICS[0];
}

// ─── Spinner word bank (same system as frame-guide / skriveramme) ────────

async function loadSpinnerStarters() {
    const lang = getCurrentLanguage();
    try {
        const mod = lang === 'nn'
            ? await import('./spinner-data-nn.js')
            : await import('./spinner-data-nb.js');
        return mod.starters || {};
    } catch (err) {
        console.error('Failed to load spinner starters:', err);
        return {};
    }
}

function levelToTier(level) {
    return (level === 'ungdomsskole' || level === 'barneskole') ? 'us' : 'vgs';
}

// Scramble animation for spinner-drawn starters (same as frame-guide)
function scrambleReveal(el, finalText, onDone) {
    const len = finalText.length;
    const startTime = Date.now();

    function tick() {
        const elapsed = Date.now() - startTime;
        const resolved = Math.min(len, Math.floor((elapsed / SCRAMBLE_DURATION) * len));
        let display = '';
        for (let i = 0; i < len; i++) {
            if (i < resolved) display += finalText[i];
            else if (finalText[i] === ' ') display += ' ';
            else display += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
        el.textContent = display;
        if (resolved < len) {
            requestAnimationFrame(tick);
        } else {
            el.textContent = finalText;
            if (onDone) onDone();
        }
    }
    requestAnimationFrame(tick);
}

// ─── Draft persistence ───────────────────────────────────────────────────

function loadDraft() {
    try {
        const parsed = JSON.parse(localStorage.getItem(DRAFT_KEY));
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

function saveDraft(draft) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch {}
}

// ─── Main entry point ────────────────────────────────────────────────────

/**
 * Initialise the paragraph trainer UI inside the given container.
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {() => string|null} [options.getLevel] - Returns school level ('ungdomsskole'|'barneskole'|'vg1'|'vg2'|'vg3')
 * @param {(doc: {title: string, text: string}) => void|Promise} [options.onSaveDocument] -
 *   When provided, a "Lagre som dokument" button appears next to Copy; the
 *   host decides what saving means (Skriv creates a document and opens the
 *   editor; the standalone school pages omit the callback and the button).
 * @returns {{ destroy: () => void }}
 */
export function initParagraphTrainer(container, options = {}) {
    const contentLang = getCurrentLanguage() === 'nn' ? 'nn' : 'nb';
    const authored = STEP_STARTERS[contentLang];

    let currentTopic = null;
    let historyOpen = false;
    let expandedHistory = -1;   // index of the expanded history entry, -1 = none
    let stepTexts = ['', '', ''];
    let previewOpen = false;

    // Sliding window of currently-visible starter chips per step. Initial
    // fill comes from the authored STEP_STARTERS; each 🎲 draw appends a
    // spinner pick and trims the oldest (same system as the frame guide).
    const visibleStarters = STEPS.map(step => authored[step.starterKey].slice(0, MAX_VISIBLE_STARTERS));
    // Per-step history of drawn starters so consecutive draws differ until
    // the step's buckets are exhausted, then the history resets.
    const spinnerHistory = new Map(); // stepIndex → string[]
    let starterDataPromise = null;

    function ensureSpinnerData() {
        if (!starterDataPromise) starterDataPromise = loadSpinnerStarters();
        return starterDataPromise;
    }

    async function pickSpinnerStarter(stepIndex) {
        const bank = await ensureSpinnerData();
        const tier = levelToTier(options.getLevel?.() || 'ungdomsskole');

        // Merge the step's buckets across the trainer genres (deduped).
        const merged = new Set();
        for (const genre of SPINNER_GENRES) {
            const genreData = bank[genre];
            if (!genreData) continue;
            const tierData = genreData[tier] || genreData.us;
            if (!tierData) continue;
            for (const bucket of STEPS[stepIndex].spinnerBuckets) {
                for (const s of tierData[bucket] || []) merged.add(s);
            }
        }
        const pool = [...merged];
        if (pool.length === 0) return null;

        // The authored chips for the step are excluded so draws don't echo
        // what STEP_STARTERS already provides.
        const authoredForStep = authored[STEPS[stepIndex].starterKey];
        let history = spinnerHistory.get(stepIndex) || [];

        for (let attempt = 0; attempt < 2; attempt++) {
            const used = new Set([...history, ...authoredForStep]);
            const available = pool.filter(s => !used.has(s));
            if (available.length > 0) {
                const pick = available[Math.floor(Math.random() * available.length)];
                history.push(pick);
                spinnerHistory.set(stepIndex, history);
                return pick;
            }
            // Exhausted: reset history (keep just the most recent to avoid
            // an immediate repeat) and try again.
            history = history.length > 0 ? [history[history.length - 1]] : [];
        }
        return null;
    }

    // Restore draft, or draw a fresh topic right away (no spin ceremony —
    // this screen is a drill, keep friction low).
    const draft = loadDraft();
    if (draft && TRAINER_TOPICS.some(topic => topic.id === draft.topicId)) {
        currentTopic = TRAINER_TOPICS.find(topic => topic.id === draft.topicId);
        if (Array.isArray(draft.steps)) {
            stepTexts = STEPS.map((_, i) => typeof draft.steps[i] === 'string' ? draft.steps[i] : '');
        }
        // Older drafts stored manual checkbox state in draft.checks; the
        // checklist is verified live from the text now, so it is ignored.
    } else {
        currentTopic = drawTopic();
        persist();
    }

    function persist() {
        saveDraft({ topicId: currentTopic.id, steps: stepTexts });
    }

    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'paragraph-trainer max-w-2xl mx-auto p-4';
    container.appendChild(root);

    const STARTER_CHIP_CLASS = 'px-2 py-1 rounded-full border border-stone-300 dark:border-stone-600 text-xs text-stone-600 dark:text-stone-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-400 transition-colors';

    function stepCardHtml(index) {
        const n = index + 1;
        return `
            <section class="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-4 shadow-sm">
                <div class="flex items-baseline gap-2 mb-1">
                    <span class="flex-shrink-0 w-6 h-6 rounded-full bg-emerald-600 text-white text-sm font-bold inline-flex items-center justify-center">${n}</span>
                    <h2 class="text-base font-semibold">${escapeHtml(t(`paragraphTrainer.step${n}Title`))}</h2>
                </div>
                <p class="text-sm text-stone-500 dark:text-stone-400 mb-2">${escapeHtml(t(`paragraphTrainer.step${n}Hint`))}</p>
                <textarea data-step-input="${index}" rows="${index === 1 ? 5 : 2}"
                    class="w-full rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 p-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    aria-label="${escapeHtml(t(`paragraphTrainer.step${n}Title`))}"
                    placeholder="${escapeHtml(t(`paragraphTrainer.step${n}Placeholder`))}"></textarea>
                <div class="flex flex-wrap items-center gap-1.5 mt-2" data-starter-row="${index}">
                    <span class="text-xs text-stone-400 dark:text-stone-500">${escapeHtml(t('paragraphTrainer.starters'))}</span>
                    <button type="button" data-draw-starter="${index}"
                        class="px-2 py-1 rounded-full border border-emerald-300 dark:border-emerald-700 text-xs text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors">
                        ${escapeHtml(t('skriv.frameGuideMoreSuggestions'))}
                    </button>
                    <span class="ml-auto text-xs text-stone-400 dark:text-stone-500" data-word-count="${index}"></span>
                </div>
            </section>
        `;
    }

    // --- Attempt history (small, collapsed by default; hidden when empty) ---
    function historyHtml() {
        const history = loadHistory();
        if (!history.length) return '';
        const rows = history.map((h, i) => {
            const date = new Date(h.ts).toLocaleDateString(getDateLocale(), { day: 'numeric', month: 'short' });
            const expanded = expandedHistory === i;
            return `
                <li>
                    <button type="button" data-history-item="${i}"
                        class="w-full flex items-center gap-3 py-1.5 text-left text-sm hover:bg-stone-50 dark:hover:bg-stone-700/50 rounded px-1">
                        <span class="text-xs text-stone-400 w-14 flex-shrink-0">${escapeHtml(date)}</span>
                        <span class="flex-1 truncate text-stone-700 dark:text-stone-200">${escapeHtml(h.topic)}</span>
                        <span class="text-xs ${h.checksPassed === h.checksTotal ? 'text-emerald-600' : 'text-stone-400'} flex-shrink-0">${h.checksPassed}/${h.checksTotal} ✓</span>
                        <span class="text-xs text-stone-400 flex-shrink-0">${escapeHtml(t('wordCounter.count', { count: h.words }))}</span>
                    </button>
                    ${expanded ? `<p class="text-sm text-stone-600 dark:text-stone-300 border-l-4 border-stone-200 dark:border-stone-600 pl-3 ml-1 my-1 leading-relaxed">${escapeHtml(h.text)}</p>` : ''}
                </li>`;
        }).join('');
        return `
            <div class="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-4 shadow-sm mt-5">
                <button type="button" data-history-toggle class="w-full flex items-center justify-between text-base font-semibold">
                    <span>${escapeHtml(t('paragraphTrainer.historyTitle'))} (${history.length})</span>
                    <span class="text-stone-400 text-sm">${historyOpen ? '▲' : '▼'}</span>
                </button>
                <ul class="${historyOpen ? 'mt-2' : 'hidden'}">${rows}</ul>
            </div>`;
    }

    function render() {
        const total = TRAINER_TOPICS.length;
        const remaining = (loadDeck() || []).length;

        const checklistItems = `<div data-checklist>${checklistRowsHtml()}</div>`;

        root.innerHTML = `
            <h1 class="text-2xl font-bold mb-1">${escapeHtml(t('paragraphTrainer.screenTitle'))}</h1>
            <p class="text-sm text-stone-500 dark:text-stone-400 mb-4">${escapeHtml(t('paragraphTrainer.intro'))}</p>

            <!-- Model explainer: the three steps at a glance -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-5">
                ${[1, 2, 3].map(n => `
                    <div class="rounded-lg border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-3">
                        <p class="text-sm font-semibold text-emerald-800 dark:text-emerald-300">${n}. ${escapeHtml(t(`paragraphTrainer.step${n}Title`))}</p>
                        <p class="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">${escapeHtml(t(`paragraphTrainer.step${n}Desc`))}</p>
                    </div>`).join('')}
            </div>

            <!-- Topic card -->
            <div class="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-4 shadow-sm mb-5">
                <div class="flex items-center justify-between gap-3 mb-1">
                    <p class="text-xs uppercase tracking-wider text-stone-500">${escapeHtml(t('paragraphTrainer.topicLabel'))}</p>
                    <span class="text-xs text-stone-400 dark:text-stone-500" data-deck-status>${escapeHtml(t('paragraphTrainer.deckRemaining', { n: remaining, total }))}</span>
                </div>
                <p class="text-sm text-stone-500 dark:text-stone-400">${escapeHtml(t('paragraphTrainer.topicInstruction'))}</p>
                <p class="text-lg font-semibold my-2" data-topic-text>${escapeHtml(currentTopic[contentLang])}</p>
                <div class="text-right">
                    <button type="button" data-new-topic
                        class="px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors">
                        🎲 ${escapeHtml(t('paragraphTrainer.newTopic'))}
                    </button>
                </div>
            </div>

            <!-- The three writing steps -->
            <div class="space-y-4 mb-5">
                ${STEPS.map((_, i) => stepCardHtml(i)).join('')}
            </div>

            <!-- Live checklist — verified from the text as the pupil writes -->
            <div class="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-4 shadow-sm mb-5">
                <h2 class="text-base font-semibold mb-2">${escapeHtml(t('paragraphTrainer.checklistTitle'))}</h2>
                ${checklistItems}
            </div>

            <!-- Assembled paragraph preview -->
            <div class="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-4 shadow-sm">
                <div class="flex items-center justify-between gap-3">
                    <h2 class="text-base font-semibold">${escapeHtml(t('paragraphTrainer.previewTitle'))}</h2>
                    <div class="flex gap-2">
                        <button type="button" data-toggle-preview class="text-sm underline text-emerald-700 dark:text-emerald-400">
                            ${escapeHtml(previewOpen ? t('paragraphTrainer.previewHide') : t('paragraphTrainer.previewShow'))}
                        </button>
                        <button type="button" data-copy
                            class="text-sm px-3 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                            ${escapeHtml(t('paragraphTrainer.copy'))}
                        </button>
                        ${options.onSaveDocument ? `
                        <button type="button" data-save-doc
                            class="text-sm px-3 py-1 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors">
                            ${escapeHtml(t('paragraphTrainer.saveAsDocument'))}
                        </button>` : ''}
                    </div>
                </div>
                <div data-preview class="${previewOpen ? 'mt-3' : 'hidden mt-3'} border-l-4 border-emerald-300 pl-3">
                    <p class="text-sm leading-relaxed text-stone-700 dark:text-stone-200" data-preview-text></p>
                </div>
            </div>

            ${historyHtml()}
        `;

        // Restore field texts (textarea content can't be set via innerHTML safely)
        STEPS.forEach((_, i) => {
            root.querySelector(`[data-step-input="${i}"]`).value = stepTexts[i];
            renderStarterChips(i);
        });
        updateWordCounts();
        updatePreview();
    }

    // Rebuild the starter chips for one step from visibleStarters state.
    // Chips are inserted before the 🎲 draw button; when animateNew is set
    // the newest chip gets the scramble reveal (it came from a draw).
    function renderStarterChips(stepIndex, animateNew = false) {
        const row = root.querySelector(`[data-starter-row="${stepIndex}"]`);
        if (!row) return;
        row.querySelectorAll('[data-starter]').forEach(el => el.remove());
        const drawBtn = row.querySelector('[data-draw-starter]');
        visibleStarters[stepIndex].forEach((text, si) => {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.setAttribute('data-starter', '');
            btn.setAttribute('data-step', String(stepIndex));
            btn.setAttribute('data-si', String(si));
            btn.className = STARTER_CHIP_CLASS;
            btn.textContent = text;
            row.insertBefore(btn, drawBtn);
            if (animateNew && si === visibleStarters[stepIndex].length - 1) {
                scrambleReveal(btn, text);
            }
        });
    }

    async function handleDrawStarter(stepIndex, btn) {
        btn.disabled = true;
        const text = await pickSpinnerStarter(stepIndex);
        if (!text) {
            // Word bank unavailable or nothing left to draw — retire the button.
            btn.textContent = t('skriv.frameGuideNoMoreSuggestions');
            return;
        }
        btn.disabled = false;
        const list = visibleStarters[stepIndex];
        list.push(text);
        while (list.length > MAX_VISIBLE_STARTERS) list.shift();
        renderStarterChips(stepIndex, true);
    }

    function assembledText() {
        return stepTexts.map(s => s.trim()).filter(Boolean).join(' ');
    }

    // Build the live checklist rows: ✅ when the form check passes, ⚪ plus
    // a tip when the pupil has written in the relevant step without it.
    function checklistRowsHtml() {
        const results = evaluateChecks(stepTexts);
        return results.map((r, i) => `
            <div class="flex items-start gap-2 text-sm py-1">
                <span aria-hidden="true">${r.pass ? '✅' : '⚪'}</span>
                <span class="${r.pass ? 'text-stone-700 dark:text-stone-200' : 'text-stone-500 dark:text-stone-400'}">
                    ${escapeHtml(t(`paragraphTrainer.check${i + 1}`))}
                    ${!r.pass && r.written ? `<span class="block text-xs text-amber-600 dark:text-amber-400 mt-0.5">${escapeHtml(t(`paragraphTrainer.checkHint${i + 1}`))}</span>` : ''}
                </span>
            </div>`).join('');
    }

    function updateChecklist() {
        const el = root.querySelector('[data-checklist]');
        if (el) el.innerHTML = checklistRowsHtml();
    }

    function updateWordCounts() {
        STEPS.forEach((_, i) => {
            const el = root.querySelector(`[data-word-count="${i}"]`);
            if (el) el.textContent = t('paragraphTrainer.wordCount', { n: countWords(stepTexts[i]) });
        });
    }

    function updatePreview() {
        const el = root.querySelector('[data-preview-text]');
        if (!el) return;
        const text = assembledText();
        if (text) {
            el.textContent = text;
            el.classList.remove('italic', 'text-stone-400');
        } else {
            el.textContent = t('paragraphTrainer.previewEmpty');
            el.classList.add('italic', 'text-stone-400');
        }
    }

    function updateDeckStatus() {
        const el = root.querySelector('[data-deck-status]');
        if (el) el.textContent = t('paragraphTrainer.deckRemaining', {
            n: (loadDeck() || []).length,
            total: TRAINER_TOPICS.length,
        });
    }

    async function handleNewTopic() {
        const hasText = stepTexts.some(s => s.trim());
        if (hasText) {
            const proceed = await showInPageConfirm(
                t('paragraphTrainer.newTopicConfirmTitle'),
                t('paragraphTrainer.newTopicConfirmBody'),
                t('paragraphTrainer.newTopicConfirmOk'),
                t('common.cancel')
            );
            if (!proceed) return;
        }
        currentTopic = drawTopic();
        stepTexts = ['', '', ''];
        persist();
        render();
    }

    // ─── Event wiring (delegated on root; render() replaces innerHTML) ───

    root.addEventListener('input', (e) => {
        const input = e.target.closest('[data-step-input]');
        if (input) {
            const i = Number(input.getAttribute('data-step-input'));
            stepTexts[i] = input.value;
            persist();
            updateWordCounts();
            updatePreview();
            updateChecklist();
        }
    });

    root.addEventListener('click', (e) => {
        const starter = e.target.closest('[data-starter]');
        if (starter) {
            const i = Number(starter.getAttribute('data-step'));
            const text = visibleStarters[i][Number(starter.getAttribute('data-si'))] || '';
            const input = root.querySelector(`[data-step-input="${i}"]`);
            if (!input.value.trim()) {
                // Insert the starter without the trailing ellipsis/dots
                // (authored chips end in "…", spinner ones in "..."),
                // ready to continue writing.
                input.value = text.replace(/\s*(?:…|\.\.\.)$/, ' ');
                stepTexts[i] = input.value;
                persist();
                updateWordCounts();
                updatePreview();
                updateChecklist();
            }
            input.focus();
            return;
        }
        const drawBtn = e.target.closest('[data-draw-starter]');
        if (drawBtn) {
            handleDrawStarter(Number(drawBtn.getAttribute('data-draw-starter')), drawBtn);
            return;
        }
        if (e.target.closest('[data-new-topic]')) {
            handleNewTopic();
            return;
        }
        if (e.target.closest('[data-toggle-preview]')) {
            previewOpen = !previewOpen;
            root.querySelector('[data-preview]').classList.toggle('hidden', !previewOpen);
            e.target.closest('[data-toggle-preview]').textContent =
                previewOpen ? t('paragraphTrainer.previewHide') : t('paragraphTrainer.previewShow');
            return;
        }
        if (e.target.closest('[data-history-toggle]')) {
            historyOpen = !historyOpen;
            expandedHistory = -1;
            render();
            return;
        }
        const historyItem = e.target.closest('[data-history-item]');
        if (historyItem) {
            const idx = Number(historyItem.dataset.historyItem);
            expandedHistory = expandedHistory === idx ? -1 : idx;
            render();
            return;
        }
        if (e.target.closest('[data-copy]')) {
            const text = assembledText();
            if (!text) {
                showToast(t('paragraphTrainer.previewEmpty'), { duration: 2000 });
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                recordAttempt(text);
                render();
                showToast(t('paragraphTrainer.copied'), { duration: 2000 });
            }).catch(() => {
                showToast(t('paragraphTrainer.copyFailed'), { duration: 3000 });
            });
            return;
        }
        if (e.target.closest('[data-save-doc]') && options.onSaveDocument) {
            const text = assembledText();
            if (!text) {
                showToast(t('paragraphTrainer.previewEmpty'), { duration: 2000 });
                return;
            }
            recordAttempt(text);
            render();
            Promise.resolve(options.onSaveDocument({
                title: currentTopic[contentLang],
                text,
            })).catch((err) => {
                console.error('Save as document failed:', err);
                showToast(t('paragraphTrainer.saveFailed'), { duration: 3000 });
            });
        }
    });

    /** Log a finished attempt (called from copy/save — the two finish actions). */
    function recordAttempt(text) {
        const checks = evaluateChecks(stepTexts);
        const entry = {
            ts: new Date().toISOString(),
            topic: currentTopic ? currentTopic[contentLang] : '',
            text,
            checksPassed: checks.filter(c => c.pass).length,
            checksTotal: checks.length,
            words: countWords(text),
        };
        saveHistory(appendHistoryEntry(loadHistory(), entry));
    }

    render();
    updateDeckStatus();

    function destroy() {
        // All listeners live on root, which is removed with the subtree.
        root.remove();
    }

    return { destroy };
}
