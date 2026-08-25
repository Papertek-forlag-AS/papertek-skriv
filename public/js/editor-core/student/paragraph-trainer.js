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
 * Portable: no imports from app/. Works standalone.
 *
 * Usage:
 *   import { initParagraphTrainer } from './paragraph-trainer.js';
 *   const trainer = initParagraphTrainer(container);
 *   trainer.destroy();
 */

import { t, getCurrentLanguage } from '../shared/i18n.js';
import { escapeHtml } from '../shared/html-escape.js';
import { countWords } from '../shared/word-counter.js';
import { showToast } from '../shared/toast-notification.js';
import { showInPageConfirm } from '../shared/in-page-modal.js';
import { TRAINER_TOPICS, STEP_STARTERS } from './paragraph-trainer-data.js';

const DECK_KEY = 'papertek.skriv.paragraphTrainer.deck';
const DRAFT_KEY = 'papertek.skriv.paragraphTrainer.draft';

const STEPS = [
    { key: 'topic', starterKey: 'topic' },
    { key: 'support', starterKey: 'support' },
    { key: 'closing', starterKey: 'closing' },
];

const CHECK_COUNT = 4;

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
 * @returns {{ destroy: () => void }}
 */
export function initParagraphTrainer(container) {
    const contentLang = getCurrentLanguage() === 'nn' ? 'nn' : 'nb';
    const starters = STEP_STARTERS[contentLang];

    let currentTopic = null;
    let stepTexts = ['', '', ''];
    let checks = new Array(CHECK_COUNT).fill(false);
    let previewOpen = false;

    // Restore draft, or draw a fresh topic right away (no spin ceremony —
    // this screen is a drill, keep friction low).
    const draft = loadDraft();
    if (draft && TRAINER_TOPICS.some(topic => topic.id === draft.topicId)) {
        currentTopic = TRAINER_TOPICS.find(topic => topic.id === draft.topicId);
        if (Array.isArray(draft.steps)) {
            stepTexts = STEPS.map((_, i) => typeof draft.steps[i] === 'string' ? draft.steps[i] : '');
        }
        if (Array.isArray(draft.checks)) {
            checks = checks.map((_, i) => draft.checks[i] === true);
        }
    } else {
        currentTopic = drawTopic();
        persist();
    }

    function persist() {
        saveDraft({ topicId: currentTopic.id, steps: stepTexts, checks });
    }

    container.innerHTML = '';
    const root = document.createElement('div');
    root.className = 'paragraph-trainer max-w-2xl mx-auto p-4';
    container.appendChild(root);

    function stepCardHtml(index) {
        const n = index + 1;
        const step = STEPS[index];
        const chips = starters[step.starterKey].map((s, si) => `
            <button type="button" data-starter data-step="${index}" data-si="${si}"
                class="px-2 py-1 rounded-full border border-stone-300 dark:border-stone-600 text-xs text-stone-600 dark:text-stone-300 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 hover:border-emerald-400 transition-colors">
                ${escapeHtml(s)}
            </button>`).join('');
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
                <div class="flex flex-wrap items-center gap-1.5 mt-2">
                    <span class="text-xs text-stone-400 dark:text-stone-500">${escapeHtml(t('paragraphTrainer.starters'))}</span>
                    ${chips}
                    <span class="ml-auto text-xs text-stone-400 dark:text-stone-500" data-word-count="${index}"></span>
                </div>
            </section>
        `;
    }

    function render() {
        const total = TRAINER_TOPICS.length;
        const remaining = (loadDeck() || []).length;

        const checklistItems = Array.from({ length: CHECK_COUNT }, (_, i) => `
            <label class="flex items-start gap-2 text-sm cursor-pointer">
                <input type="checkbox" data-check="${i}" ${checks[i] ? 'checked' : ''}
                    class="mt-0.5 h-4 w-4 rounded border-stone-300 text-emerald-600 focus:ring-emerald-500">
                <span>${escapeHtml(t(`paragraphTrainer.check${i + 1}`))}</span>
            </label>`).join('');

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

            <!-- Self-check checklist -->
            <div class="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-4 shadow-sm mb-5">
                <h2 class="text-base font-semibold mb-2">${escapeHtml(t('paragraphTrainer.checklistTitle'))}</h2>
                <div class="space-y-2">${checklistItems}</div>
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
                    </div>
                </div>
                <div data-preview class="${previewOpen ? 'mt-3' : 'hidden mt-3'} border-l-4 border-emerald-300 pl-3">
                    <p class="text-sm leading-relaxed text-stone-700 dark:text-stone-200" data-preview-text></p>
                </div>
            </div>
        `;

        // Restore field texts (textarea content can't be set via innerHTML safely)
        STEPS.forEach((_, i) => {
            root.querySelector(`[data-step-input="${i}"]`).value = stepTexts[i];
        });
        updateWordCounts();
        updatePreview();
    }

    function assembledText() {
        return stepTexts.map(s => s.trim()).filter(Boolean).join(' ');
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
        checks = new Array(CHECK_COUNT).fill(false);
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
        }
    });

    root.addEventListener('change', (e) => {
        const check = e.target.closest('[data-check]');
        if (check) {
            checks[Number(check.getAttribute('data-check'))] = check.checked;
            persist();
        }
    });

    root.addEventListener('click', (e) => {
        const starter = e.target.closest('[data-starter]');
        if (starter) {
            const i = Number(starter.getAttribute('data-step'));
            const text = starters[STEPS[i].starterKey][Number(starter.getAttribute('data-si'))];
            const input = root.querySelector(`[data-step-input="${i}"]`);
            if (!input.value.trim()) {
                // Insert the starter without the trailing ellipsis, ready to continue
                input.value = text.replace(/\s*…$/, ' ');
                stepTexts[i] = input.value;
                persist();
                updateWordCounts();
                updatePreview();
            }
            input.focus();
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
        if (e.target.closest('[data-copy]')) {
            const text = assembledText();
            if (!text) {
                showToast(t('paragraphTrainer.previewEmpty'), { duration: 2000 });
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                showToast(t('paragraphTrainer.copied'), { duration: 2000 });
            }).catch(() => {
                showToast(t('paragraphTrainer.copyFailed'), { duration: 3000 });
            });
        }
    });

    render();
    updateDeckStatus();

    function destroy() {
        // All listeners live on root, which is removed with the subtree.
        root.remove();
    }

    return { destroy };
}
