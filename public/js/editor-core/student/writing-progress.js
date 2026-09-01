/**
 * Writing Progress / Goals Module
 *
 * Tracks session writing stats and shows optional progress.
 * The quiet default shows session words/time and an optional daily goal.
 * Pace and streak metrics are opt-in because they can distract from writing quality.
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
    background: #fafaf9;
    border: 1px solid #d6d3d1;
    border-radius: 20px;
    padding: 6px 14px;
    font-size: 13px;
    color: #57534e;
    cursor: pointer;
    z-index: 900;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06);
    transition: border-color 0.15s ease, color 0.15s ease;
    user-select: none;
}
.skriv-progress-trigger:hover {
    border-color: #a8a29e;
    color: #292524;
}
.skriv-progress-trigger:focus-visible,
.skriv-progress-goal-btn:focus-visible {
    outline: 2px solid #059669;
    outline-offset: 2px;
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
@media (prefers-reduced-motion: reduce) {
    .skriv-progress-trigger,
    .skriv-progress-panel,
    .skriv-progress-bar-fill {
        transition: none;
    }
}
`;

export function initWritingProgress(editor, options = {}) {
    const showPace = options.showPace === true;
    const showStreak = options.showStreak === true;
    let sessionStartWords = 0;
    let sessionWords = 0;
    let sessionStartTime = Date.now();
    let activeTime = 0;
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
    trigger.type = 'button';
    trigger.className = 'skriv-progress-trigger';
    trigger.setAttribute('aria-label', t('progress.openLabel', { count: 0 }));
    trigger.setAttribute('aria-controls', 'skriv-progress-panel');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.textContent = t('progress.triggerText', { count: 0 });
    trigger.addEventListener('click', toggle);
    document.body.appendChild(trigger);

    // Create panel
    const panel = document.createElement('div');
    panel.id = 'skriv-progress-panel';
    panel.className = 'skriv-progress-panel';
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-label', t('progress.title'));
    panel.hidden = true;
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
        const streak = showStreak ? getStreak() : 0;
        const streakActive = showStreak && streak > 0;

        let html = `<h4>${t('progress.title')}</h4>`;
        html += `<div class="skriv-progress-row"><span class="label">${t('progress.thisSession')}</span><span class="value" data-field="session-words">${t('progress.sessionSummary', { count: 0, minutes: 0 })}</span></div>`;
        if (showPace) {
            html += `<div class="skriv-progress-row"><span class="label">${t('progress.paceLabel')}</span><span class="value" data-field="wpm">${t('progress.wordsPerMin', { count: 0 })}</span></div>`;
        }

        if (goal > 0) {
            html += `<div class="skriv-progress-row"><span class="label">${t('progress.dailyGoal')}</span><span class="value" data-field="goal-text">0/${goal}</span></div>`;
            html += `<div class="skriv-progress-bar-wrap" role="progressbar" aria-label="${t('progress.dailyGoal')}" aria-valuemin="0" aria-valuemax="${goal}" aria-valuenow="0"><div class="skriv-progress-bar-fill" data-field="goal-bar" style="width:0%"></div></div>`;
        } else {
            html += `<button type="button" class="skriv-progress-goal-btn" data-action="set-goal">${t('progress.noGoal')}</button>`;
        }

        if (showStreak) {
            html += `<div class="skriv-progress-streak ${streakActive ? '' : 'inactive'}"><span class="fire" aria-hidden="true">🔥</span> <span data-field="streak">${t('progress.streak', { count: streak })}</span></div>`;
        }

        return html;
    }

    function updateDisplay() {
        const minutes = Math.floor(getActiveMinutes());
        const wpm = showPace && minutes > 0 ? Math.round(sessionWords / minutes) : 0;
        const goal = getDailyGoal();
        const streak = showStreak ? getStreak() : 0;

        // Update trigger
        trigger.textContent = t('progress.triggerText', { count: sessionWords });
        trigger.setAttribute('aria-label', t('progress.openLabel', { count: sessionWords }));

        // Update panel fields
        const sessionField = panel.querySelector('[data-field="session-words"]');
        if (sessionField) {
            sessionField.textContent = t('progress.sessionSummary', { count: sessionWords, minutes });
        }

        const wpmField = panel.querySelector('[data-field="wpm"]');
        if (wpmField) wpmField.textContent = t('progress.wordsPerMin', { count: wpm });

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
                goalBar.parentElement?.setAttribute('aria-valuenow', String(Math.min(sessionWords, goal)));
            }
        }

        const streakField = panel.querySelector('[data-field="streak"]');
        if (streakField) streakField.textContent = t('progress.streak', { count: streak });
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

        resetIdleTimer();
        updateSessionWords();
    }

    function updateSessionWords() {
        const currentWords = countWords(editor.textContent);
        sessionWords = Math.max(0, currentWords - sessionStartWords);
        updateDisplay();
        if (showStreak) checkStreak();
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
        const goal = prompt(t('progress.setGoalPrompt'), current);
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
        trigger.setAttribute('aria-expanded', String(panelVisible));
        if (panelVisible) {
            panel.hidden = false;
            panel.classList.add('visible');
            updateDisplay();
        } else {
            panel.classList.remove('visible');
            panel.hidden = true;
        }
    }

    function handlePanelKeydown(e) {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        if (panelVisible) toggle();
        trigger.focus();
    }
    panel.addEventListener('keydown', handlePanelKeydown);

    // Attach listener
    editor.addEventListener('input', handleInput);

    // Initial display
    updateDisplay();

    function destroy() {
        editor.removeEventListener('input', handleInput);
        if (idleTimerId) clearTimeout(idleTimerId);
        if (updateTimerId) clearInterval(updateTimerId);
        trigger.removeEventListener('click', toggle);
        panel.removeEventListener('keydown', handlePanelKeydown);
        trigger.remove();
        panel.remove();
        styleEl.remove();
    }

    return { destroy, toggle };
}
