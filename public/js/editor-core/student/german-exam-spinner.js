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
 *       onPickTask: (task) => { ... open editor with task ... },
 *   });
 *   spinner.destroy();
 */

import { t } from '../shared/i18n.js';
import { escapeHtml } from '../shared/html-escape.js';
import { tasks as TASKS, LEVELS } from './german-exam-data.js';

const DECK_KEY_PREFIX = 'papertek.skriv.germanExam.deck.';
const LEVEL_KEY = 'papertek.skriv.germanExam.activeLevel';
const SCRAMBLE_CHARS = 'abcdefghijklmnoprstuvwxyzäöüß';
const SCRAMBLE_DURATION = 600;
const SCRAMBLE_INTERVAL = 30;

// ─── Deck persistence ────────────────────────────────────────────────────

function deckKey(level) {
    return DECK_KEY_PREFIX + level;
}

function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function loadDeck(level) {
    try {
        const raw = localStorage.getItem(deckKey(level));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : null;
    } catch {
        return null;
    }
}

function saveDeck(level, ids) {
    try {
        localStorage.setItem(deckKey(level), JSON.stringify(ids));
    } catch {
        // localStorage unavailable — proceed without persistence
    }
}

function reshuffleDeck(level) {
    const ids = (TASKS[level] || []).map(t => t.id);
    const shuffled = shuffle(ids);
    saveDeck(level, shuffled);
    return shuffled;
}

function ensureDeck(level) {
    const existing = loadDeck(level);
    if (existing && existing.length > 0) return existing;
    return reshuffleDeck(level);
}

function pickTaskFromDeck(level) {
    const deck = ensureDeck(level);
    const id = deck[0];
    const remaining = deck.slice(1);
    saveDeck(level, remaining);
    const task = (TASKS[level] || []).find(t => t.id === id);
    return { task, deckAfter: remaining };
}

function totalTasks(level) {
    return (TASKS[level] || []).length;
}

// ─── Active level persistence ────────────────────────────────────────────

function loadActiveLevel() {
    const v = localStorage.getItem(LEVEL_KEY);
    return LEVELS.includes(v) ? v : 'tysk-1';
}

function saveActiveLevel(level) {
    try { localStorage.setItem(LEVEL_KEY, level); } catch {}
}
