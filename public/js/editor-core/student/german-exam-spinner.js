/**
 * German Exam Spinner — randomised Udir-style writing tasks.
 *
 * Two levels (Tysk 1, Tysk 2). Per-level "deck" of remaining task ids,
 * persisted in localStorage. No repeats until the deck is exhausted.
 *
 * Each spin reveals a task card (German prompt, optional inline SVG,
 * optional Norwegian model answer). Clicking "Skriv svar" calls the
 * supplied onPickTask callback — the host wires that to document creation.
 *
 * Portable: no imports from app/. Works standalone.
 *
 * Usage:
 *   import { initGermanExamSpinner } from './german-exam-spinner.js';
 *   const spinner = initGermanExamSpinner(container, {
 *       onPickTask: (task, level) => { ... open editor with task ... },
 *   });
 *   spinner.destroy();
 */

import { t } from '../shared/i18n.js';
import { escapeHtml } from '../shared/html-escape.js';
import { writingTasks, examTasks, LEVELS, MODES } from './german-exam-data.js';

const DECK_KEY_PREFIX = 'papertek.skriv.germanExam.deck.';
const LEVEL_KEY = 'papertek.skriv.germanExam.activeLevel';
const MODE_KEY = 'papertek.skriv.germanExam.activeMode';

function corpusFor(mode) {
    return mode === 'exam' ? examTasks : writingTasks;
}
const SCRAMBLE_CHARS = 'abcdefghijklmnoprstuvwxyzäöüß';
const SCRAMBLE_DURATION = 600;
const SCRAMBLE_INTERVAL = 30;

// ─── Deck persistence ────────────────────────────────────────────────────

function deckKey(mode, level) {
    return DECK_KEY_PREFIX + mode + '.' + level;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function loadDeck(mode, level) {
    try {
        const raw = localStorage.getItem(deckKey(mode, level));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function saveDeck(mode, level, ids) {
    try {
        localStorage.setItem(deckKey(mode, level), JSON.stringify(ids));
    } catch {
        // localStorage unavailable — proceed without persistence
    }
}

function reshuffleDeck(mode, level) {
    const ids = (corpusFor(mode)[level] || []).map(t => t.id);
    const shuffled = shuffle(ids);
    saveDeck(mode, level, shuffled);
    return shuffled;
}

function ensureDeck(mode, level) {
    const existing = loadDeck(mode, level);
    if (existing && existing.length > 0) return existing;
    return reshuffleDeck(mode, level);
}

function pickTaskFromDeck(mode, level) {
    const deck = ensureDeck(mode, level);
    const id = deck[0];
    const remaining = deck.slice(1);
    saveDeck(mode, level, remaining);
    const task = (corpusFor(mode)[level] || []).find(t => t.id === id);
    return { task, deckAfter: remaining };
}

function totalTasks(mode, level) {
    return (corpusFor(mode)[level] || []).length;
}

// ─── Active level persistence ────────────────────────────────────────────

function loadActiveLevel() {
    const v = localStorage.getItem(LEVEL_KEY);
    return LEVELS.includes(v) ? v : 'tysk-1';
}

function saveActiveLevel(level) {
    try { localStorage.setItem(LEVEL_KEY, level); } catch {}
}

function loadActiveMode() {
    const v = localStorage.getItem(MODE_KEY);
    return MODES.includes(v) ? v : 'writing';
}

function saveActiveMode(mode) {
    try { localStorage.setItem(MODE_KEY, mode); } catch {}
}

// ─── Scramble animation (matches writing-spinner) ────────────────────────

function scrambleReveal(el, finalText, onDone, duration = SCRAMBLE_DURATION) {
    const len = finalText.length;
    const start = Date.now();

    function tick() {
        const elapsed = Date.now() - start;
        const progress = Math.min(1, elapsed / duration);
        const settled = Math.floor(progress * len);

        let out = finalText.slice(0, settled);
        for (let i = settled; i < len; i++) {
            const ch = finalText[i];
            if (/\s/.test(ch)) {
                out += ch;
            } else {
                out += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
            }
        }
        el.textContent = out;

        if (progress < 1) {
            setTimeout(tick, SCRAMBLE_INTERVAL);
        } else {
            el.textContent = finalText;
            if (onDone) onDone();
        }
    }
    tick();
}

// Scramble every text-bearing element on the freshly-rendered card in parallel.
// Title settles fast (short); prompt paragraphs/list items get a longer
// duration so the matrix effect feels deliberate on long prompts.
function scrambleCard(root) {
    const title = root.querySelector('[data-task-title]');
    if (title) scrambleReveal(title, title.textContent, null, 700);

    const promptParts = root.querySelectorAll('[data-prompt] p, [data-prompt] li');
    promptParts.forEach(el => {
        scrambleReveal(el, el.textContent, null, 1400);
    });
}

// ─── Markdown-light → HTML (paragraphs + lists) ──────────────────────────

function modelAnswerToHtml(text) {
    if (!text) return '';
    const paragraphs = text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    return paragraphs.map(p => {
        // Single \n inside a paragraph → <br> (e.g. sign-off above [navn])
        const inner = p.split('\n').map(line => escapeHtml(line)).join('<br>');
        return `<p class="my-2">${inner}</p>`;
    }).join('');
}

function promptToHtml(prompt) {
    const blocks = prompt.split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    return blocks.map(block => {
        if (/^[-*]\s/m.test(block)) {
            // Block has bullet lines. Lines before the first bullet are a
            // lead-in paragraph (e.g. "Skriv en tekst der du forteller").
            const lines = block.split(/\n/).map(l => l.trim()).filter(Boolean);
            const firstBullet = lines.findIndex(l => /^[-*]\s/.test(l));
            const prefix = firstBullet > 0 ? lines.slice(0, firstBullet).join(' ') : null;
            const items = lines.slice(firstBullet)
                .filter(l => /^[-*]\s/.test(l))
                .map(l => l.replace(/^[-*]\s+/, ''));
            let out = '';
            if (prefix) out += `<p class="my-2">${escapeHtml(prefix)}</p>`;
            out += '<ul class="list-disc pl-5 my-2">' + items.map(i => `<li>${escapeHtml(i)}</li>`).join('') + '</ul>';
            return out;
        }
        return `<p class="my-2">${escapeHtml(block)}</p>`;
    }).join('');
}

// ─── Main entry point ────────────────────────────────────────────────────

/**
 * Initialise the spinner UI inside the given container.
 * @param {HTMLElement} container
 * @param {Object} options
 * @param {(task: Object, level: string) => void} options.onPickTask - called when student clicks "Skriv svar"
 * @returns {{ destroy: () => void }}
 */
export function initGermanExamSpinner(container, options = {}) {
    const onPickTask = options.onPickTask || (() => {});

    let activeLevel = loadActiveLevel();
    let activeMode = loadActiveMode();
    let currentTask = null;
    let modelAnswerOpen = false;

    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'german-exam-spinner max-w-2xl mx-auto p-4';
    container.appendChild(root);

    function render() {
        const total = totalTasks(activeMode, activeLevel);
        const deck = ensureDeck(activeMode, activeLevel);
        const remaining = deck.length;
        const deckExhausted = remaining === 0;
        const corpusEmpty = total === 0;

        root.innerHTML = `
            <h1 class="text-2xl font-bold mb-4">${escapeHtml(t('germanExam.screenTitle'))}</h1>

            <!-- Mode tabs (Writing / Exam) -->
            <div class="flex gap-2 mb-3" role="tablist" aria-label="${escapeHtml(t('germanExam.modeTabsLabel'))}">
                <button type="button" data-mode="writing"
                    class="px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${activeMode === 'writing' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-stone-700 border-stone-300 dark:border-stone-600'}"
                    role="tab" aria-selected="${activeMode === 'writing'}">
                    ${escapeHtml(t('germanExam.tabWriting'))}
                </button>
                <button type="button" data-mode="exam"
                    class="px-4 py-2 rounded-lg border text-sm font-medium transition-colors ${activeMode === 'exam' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-stone-700 border-stone-300 dark:border-stone-600'}"
                    role="tab" aria-selected="${activeMode === 'exam'}">
                    ${escapeHtml(t('germanExam.tabExam'))}
                </button>
            </div>

            <!-- Level tabs (Tysk 1 / Tysk 2) -->
            <div class="flex gap-2 mb-4" role="tablist" aria-label="${escapeHtml(t('germanExam.screenTitle'))}">
                <button type="button" data-level="tysk-1"
                    class="px-4 py-2 rounded-lg border transition-colors ${activeLevel === 'tysk-1' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-stone-700 border-stone-300 dark:border-stone-600'}"
                    role="tab" aria-selected="${activeLevel === 'tysk-1'}">
                    ${escapeHtml(t('germanExam.levelTysk1'))}
                </button>
                <button type="button" data-level="tysk-2"
                    class="px-4 py-2 rounded-lg border transition-colors ${activeLevel === 'tysk-2' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white dark:bg-stone-700 border-stone-300 dark:border-stone-600'}"
                    role="tab" aria-selected="${activeLevel === 'tysk-2'}">
                    ${escapeHtml(t('germanExam.levelTysk2'))}
                </button>
            </div>

            ${corpusEmpty ? `
                <div class="rounded-xl border border-dashed border-stone-300 dark:border-stone-600 p-8 text-center text-stone-500 dark:text-stone-400">
                    <p class="text-sm">${escapeHtml(t('germanExam.corpusEmpty'))}</p>
                </div>
            ` : `
                <div class="flex items-center justify-between mb-4 text-sm text-stone-600 dark:text-stone-300">
                    <span data-deck-status>${
                        deckExhausted
                            ? escapeHtml(t('germanExam.deckEmpty'))
                            : escapeHtml(t('germanExam.deckRemaining', { n: remaining, total }))
                    }</span>
                </div>

                <div class="text-center mb-6">
                    <button type="button" data-spin
                        class="px-8 py-4 text-lg font-semibold rounded-xl bg-emerald-600 text-white shadow hover:bg-emerald-700 transition-colors">
                        ${escapeHtml(deckExhausted ? t('germanExam.reshuffleAndRestart') : t('germanExam.spin'))}
                    </button>
                    <p class="mt-2 text-xs text-stone-500" data-spin-hint>${escapeHtml(t('germanExam.clickToSpin'))}</p>
                </div>

                <div data-card></div>
            `}
        `;

        // Re-render the existing card if any (e.g. after level switch we clear it)
        if (currentTask && !corpusEmpty) {
            renderCard(currentTask);
        }
    }

    function renderCard(task) {
        const cardHost = root.querySelector('[data-card]');
        if (!cardHost) return;

        cardHost.innerHTML = `
            <article class="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-5 shadow-sm">
                <p class="text-xs uppercase tracking-wider text-stone-500 mb-1">${escapeHtml(task.attribution)}</p>
                <h2 class="text-xl font-semibold mb-3" data-task-title>${escapeHtml(task.title)}</h2>
                <div class="prose prose-sm dark:prose-invert max-w-none" data-prompt>${promptToHtml(task.prompt)}</div>
                <div data-image class="my-3"></div>
                <div class="mt-4">
                    <button type="button" data-toggle-model class="text-sm underline text-emerald-700 dark:text-emerald-400">
                        ${escapeHtml(modelAnswerOpen ? t('germanExam.hideModelAnswer') : t('germanExam.showModelAnswer'))}
                    </button>
                    <div data-model class="${modelAnswerOpen ? 'mt-3' : 'hidden mt-3'} border-l-4 border-emerald-300 pl-3 text-stone-700 dark:text-stone-200">
                        <h3 class="text-sm font-semibold mb-1">${escapeHtml(t('germanExam.modelAnswerHeading'))}</h3>
                        ${modelAnswerToHtml(task.modelAnswers && task.modelAnswers.simple)}
                    </div>
                </div>
                <div class="mt-5 text-right">
                    <button type="button" data-write
                        class="px-5 py-2 rounded-lg bg-emerald-600 text-white font-medium hover:bg-emerald-700 transition-colors">
                        ${escapeHtml(t('germanExam.writeAnswer'))}
                    </button>
                </div>
            </article>
        `;

        // Lazy-load SVG if present.
        // The default export is injected as innerHTML — SVG modules under
        // german-exam-svg/ are part of the trust boundary. Only commit
        // hand-authored SVG; never wire image() to an untrusted source.
        if (task.image) {
            const slot = cardHost.querySelector('[data-image]');
            task.image().then(mod => {
                slot.innerHTML = mod.default || '';
            }).catch(err => {
                console.warn('Failed to load task image:', err);
            });
        }
    }

    function updateDeckStatus() {
        const status = root.querySelector('[data-deck-status]');
        const spinBtn = root.querySelector('[data-spin]');
        if (!status || !spinBtn) return;
        const total = totalTasks(activeMode, activeLevel);
        const remaining = (loadDeck(activeMode, activeLevel) || []).length;
        const deckExhausted = remaining === 0;
        status.textContent = deckExhausted
            ? t('germanExam.deckEmpty')
            : t('germanExam.deckRemaining', { n: remaining, total });
        spinBtn.textContent = deckExhausted
            ? t('germanExam.reshuffleAndRestart')
            : t('germanExam.spin');
    }

    function handleSpin() {
        const deck = loadDeck(activeMode, activeLevel) || [];
        if (deck.length === 0) {
            // Reshuffle path
            reshuffleDeck(activeMode, activeLevel);
            updateDeckStatus();
            return;
        }
        const { task } = pickTaskFromDeck(activeMode, activeLevel);
        if (!task) {
            // Stale id in deck — reshuffle and try again
            reshuffleDeck(activeMode, activeLevel);
            updateDeckStatus();
            return;
        }
        currentTask = task;
        modelAnswerOpen = false;

        // Render card and scramble all task text in parallel
        renderCard(task);
        scrambleCard(root);
        updateDeckStatus();
    }

    function handleClick(e) {
        const modeBtn = e.target.closest('[data-mode]');
        if (modeBtn) {
            const newMode = modeBtn.dataset.mode;
            if (newMode !== activeMode && MODES.includes(newMode)) {
                activeMode = newMode;
                saveActiveMode(activeMode);
                currentTask = null;
                modelAnswerOpen = false;
                render();
            }
            return;
        }
        const levelBtn = e.target.closest('[data-level]');
        if (levelBtn) {
            const newLevel = levelBtn.dataset.level;
            if (newLevel !== activeLevel) {
                activeLevel = newLevel;
                saveActiveLevel(activeLevel);
                currentTask = null;
                modelAnswerOpen = false;
                render();
            }
            return;
        }
        if (e.target.closest('[data-spin]')) { handleSpin(); return; }
        if (e.target.closest('[data-toggle-model]')) {
            modelAnswerOpen = !modelAnswerOpen;
            const modelEl = root.querySelector('[data-model]');
            const toggleEl = root.querySelector('[data-toggle-model]');
            if (modelEl) modelEl.classList.toggle('hidden', !modelAnswerOpen);
            if (toggleEl) toggleEl.textContent = modelAnswerOpen
                ? t('germanExam.hideModelAnswer')
                : t('germanExam.showModelAnswer');
            return;
        }
        if (e.target.closest('[data-write]') && currentTask) {
            onPickTask(currentTask, activeLevel, activeMode);
            return;
        }
    }

    root.addEventListener('click', handleClick);
    render();

    return {
        destroy() {
            root.removeEventListener('click', handleClick);
            container.innerHTML = '';
        },
    };
}
