/**
 * Writing Progress / Goals Module
 *
 * Tracks session writing stats and shows motivational progress.
 * Features: session word count, active timer, daily goal, WPM, streak.
 *
 * i18n keys needed:
 *   progress.sessionWords = '{{count}} ord denne økten'
 *   progress.sessionTime = '{{minutes}} min'
 *   progress.wordsPerMin = '{{count}} ord/min'
 *   progress.dailyGoal = 'Daglig mål'
 *   progress.streak = '{{count}} dager på rad'
 *   progress.setGoalPrompt = 'Sett daglig ordmål:'
 *   progress.noGoal = 'Sett et mål'
 *   progress.goalReached = 'Mål nådd!'
 */

import { t } from '../shared/i18n.js';
import { countWords } from '../shared/word-counter.js';

const LS_DAILY_GOAL = 'skriv_daily_goal';
const LS_STREAK = 'skriv_writing_streak';
const LS_LAST_WRITE_DATE = 'skriv_last_write_date';
const IDLE_TIMEOUT = 120000; // 2 minutes

const STYLES = `
.skriv-progress-trigger {
    position: fixed;
    bottom: 16px;
    right: 16px;
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    border-radius: 20px;
    padding: 6px 14px;
    font-size: 13px;
    color: #166534;
    cursor: pointer;
    z-index: 900;
    box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
    user-select: none;
}
.skriv-progress-trigger:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.skriv-progress-panel {
    position: fixed;
    bottom: 56px;
    right: 16px;
    width: 220px;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 12px;
    padding: 16px;
    z-index: 901;
    box-shadow: 0 8px 24px rgba(0,0,0,0.12);
    transform: translateY(10px);
    opacity: 0;
    pointer-events: none;
    transition: transform 0.2s ease, opacity 0.2s ease;
}
.skriv-progress-panel.visible {
    transform: translateY(0);
    opacity: 1;
    pointer-events: auto;
}
.skriv-progress-panel h4 {
    margin: 0 0 10px;
    font-size: 13px;
    font-weight: 600;
    color: #374151;
}
.skriv-progress-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
    font-size: 12px;
    color: #4b5563;
}
.skriv-progress-row .label {
    color: #6b7280;
}
.skriv-progress-row .value {
    font-weight: 600;
    color: #111827;
}
.skriv-progress-bar-wrap {
    width: 100%;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
    margin: 4px 0 8px;
}
.skriv-progress-bar-fill {
    height: 100%;
    background: #059669;
    border-radius: 4px;
    transition: width 0.3s ease;
}
.skriv-progress-goal-btn {
    display: inline-block;
    background: none;
    border: 1px dashed #9ca3af;
    border-radius: 6px;
    padding: 4px 10px;
    font-size: 11px;
    color: #6b7280;
    cursor: pointer;
    margin-top: 4px;
}
.skriv-progress-goal-btn:hover {
    border-color: #059669;
    color: #059669;
}
.skriv-progress-streak {
    margin-top: 6px;
    font-size: 12px;
    color: #4b5563;
}
.skriv-progress-streak .fire {
    filter: grayscale(0);
}
.skriv-progress-streak.inactive .fire {
    filter: grayscale(1);
}
`;

export function initWritingProgress(editor, options = {}) {
    let sessionStartWords = 0;
    let sessionWords = 0;
    let sessionStartTime = Date.now();
    let activeTime = 0;
    let lastActivityTime = Date.now();
    let idleStart = null;
    let totalIdleTime = 0;
    let isIdle = false;
    let panelVisible = false;
    let idleTimerId = null;
    let updateTimerId = null;

    // Calculate initial word count
    sessionStartWords = countWords(editor.textContent);

    // Inject styles
    const styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    // Create trigger button
    const trigger = document.createElement('button');
    trigger.className = 'skriv-progress-trigger';
    trigger.setAttribute('aria-label', t('progress.sessionWords')?.replace('{{count}}', '0') || 'Skrivefremdrift');
    trigger.textContent = '↗ 0 ord';
    trigger.addEventListener('click', toggle);
    document.body.appendChild(trigger);

    // Create panel
    const panel = document.createElement('div');
    panel.className = 'skriv-progress-panel';
    panel.innerHTML = buildPanelHTML();
    document.body.appendChild(panel);

    // Wire up goal button inside panel
    const goalBtn = panel.querySelector('[data-action="set-goal"]');
    if (goalBtn) goalBtn.addEventListener('click', setDailyGoal);

    // Start idle detection
    resetIdleTimer();

    // Periodic display update (for timer)
    updateTimerId = setInterval(() => {
        updateActiveTime();
        updateDisplay();
    }, 10000);

    function buildPanelHTML() {
        const goal = getDailyGoal();
        const streak = getStreak();
        const streakActive = streak > 0;

        let html = `<h4>${t('progress.dailyGoal') || 'Skrivefremdrift'}</h4>`;
        html += `<div class="skriv-progress-row"><span class="label">Denne økten</span><span class="value" data-field="session-words">0 ord / 0 min</span></div>`;
        html += `<div class="skriv-progress-row"><span class="label">Fart</span><span class="value" data-field="wpm">0 ord/min</span></div>`;

        if (goal > 0) {
            html += `<div class="skriv-progress-row"><span class="label">${t('progress.dailyGoal') || 'Daglig mål'}</span><span class="value" data-field="goal-text">0/${goal}</span></div>`;
            html += `<div class="skriv-progress-bar-wrap"><div class="skriv-progress-bar-fill" data-field="goal-bar" style="width:0%"></div></div>`;
        } else {
            html += `<button class="skriv-progress-goal-btn" data-action="set-goal">${t('progress.noGoal') || 'Sett et mål'}</button>`;
        }

        html += `<div class="skriv-progress-streak ${streakActive ? '' : 'inactive'}"><span class="fire">🔥</span> <span data-field="streak">${streak} ${t('progress.streak')?.replace('{{count}}', '') || 'dager på rad'}</span></div>`;

        return html;
    }

    function updateDisplay() {
        const minutes = Math.floor(getActiveMinutes());
        const wpm = minutes > 0 ? Math.round(sessionWords / minutes) : 0;
        const goal = getDailyGoal();
        const streak = getStreak();

        // Update trigger
        trigger.textContent = `↗ ${sessionWords} ord`;

        // Update panel fields
        const sessionField = panel.querySelector('[data-field="session-words"]');
        if (sessionField) sessionField.textContent = `${sessionWords} ord / ${minutes} min`;

        const wpmField = panel.querySelector('[data-field="wpm"]');
        if (wpmField) wpmField.textContent = `${wpm} ord/min`;

        if (goal > 0) {
            const goalText = panel.querySelector('[data-field="goal-text"]');
            const goalBar = panel.querySelector('[data-field="goal-bar"]');
            if (goalText) {
                const reached = sessionWords >= goal;
                goalText.textContent = reached
                    ? (t('progress.goalReached') || 'Mål nådd!')
                    : `${sessionWords}/${goal}`;
            }
            if (goalBar) {
                const pct = Math.min(100, Math.round((sessionWords / goal) * 100));
                goalBar.style.width = pct + '%';
            }
        }

        const streakField = panel.querySelector('[data-field="streak"]');
        if (streakField) streakField.textContent = `${streak} ${t('progress.streak')?.replace('{{count}}', '') || 'dager på rad'}`;
    }

    function getActiveMinutes() {
        updateActiveTime();
        return activeTime / 60000;
    }

    function updateActiveTime() {
        const now = Date.now();
        const elapsed = now - sessionStartTime;
        const currentIdle = isIdle ? (now - idleStart) : 0;
        activeTime = Math.max(0, elapsed - totalIdleTime - currentIdle);
    }

    function resetIdleTimer() {
        if (idleTimerId) clearTimeout(idleTimerId);
        idleTimerId = setTimeout(() => {
            isIdle = true;
            idleStart = Date.now();
        }, IDLE_TIMEOUT);
    }

    function handleInput() {
        const now = Date.now();

        // Resume from idle
        if (isIdle) {
            totalIdleTime += (now - idleStart);
            isIdle = false;
            idleStart = null;
        }

        lastActivityTime = now;
        resetIdleTimer();
        updateSessionWords();
    }

    function updateSessionWords() {
        const currentWords = countWords(editor.textContent);
        sessionWords = Math.max(0, currentWords - sessionStartWords);
        updateDisplay();
        checkStreak();
    }

    function checkStreak() {
        if (sessionWords < 50) return;

        const today = new Date().toDateString();
        const lastDate = localStorage.getItem(LS_LAST_WRITE_DATE);

        if (lastDate === today) return; // already counted today

        const yesterday = new Date(Date.now() - 86400000).toDateString();
        let streak = parseInt(localStorage.getItem(LS_STREAK) || '0');

        if (lastDate === yesterday) {
            streak += 1;
        } else {
            streak = 1;
        }

        localStorage.setItem(LS_STREAK, String(streak));
        localStorage.setItem(LS_LAST_WRITE_DATE, today);
        updateDisplay();
    }

    function setDailyGoal() {
        const current = localStorage.getItem(LS_DAILY_GOAL) || '300';
        const goal = prompt(t('progress.setGoalPrompt') || 'Sett daglig ordmål:', current);
        if (goal && !isNaN(goal) && parseInt(goal) > 0) {
            localStorage.setItem(LS_DAILY_GOAL, goal);
            // Rebuild panel to show progress bar
            panel.innerHTML = buildPanelHTML();
            const newGoalBtn = panel.querySelector('[data-action="set-goal"]');
            if (newGoalBtn) newGoalBtn.addEventListener('click', setDailyGoal);
            updateDisplay();
        }
    }

    function getStreak() {
        const lastDate = localStorage.getItem(LS_LAST_WRITE_DATE);
        if (!lastDate) return 0;

        const today = new Date().toDateString();
        const yesterday = new Date(Date.now() - 86400000).toDateString();

        // Streak is valid if last write was today or yesterday
        if (lastDate === today || lastDate === yesterday) {
            return parseInt(localStorage.getItem(LS_STREAK) || '0');
        }
        // Streak broken
        return 0;
    }

    function getDailyGoal() {
        return parseInt(localStorage.getItem(LS_DAILY_GOAL) || '0');
    }

    function toggle() {
        panelVisible = !panelVisible;
        if (panelVisible) {
            panel.classList.add('visible');
            updateDisplay();
        } else {
            panel.classList.remove('visible');
        }
    }

    // Attach listener
    editor.addEventListener('input', handleInput);

    // Initial display
    updateDisplay();

    function destroy() {
        editor.removeEventListener('input', handleInput);
        if (idleTimerId) clearTimeout(idleTimerId);
        if (updateTimerId) clearInterval(updateTimerId);
        trigger.removeEventListener('click', toggle);
        trigger.remove();
        panel.remove();
        styleEl.remove();
    }

    return { destroy, toggle };
}
