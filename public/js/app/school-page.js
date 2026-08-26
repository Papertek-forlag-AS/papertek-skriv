/**
 * Entry point for school.html — the standalone per-school one-pager.
 *
 * Hosts two portable exercises from editor-core/student/ behind a simple
 * tab row (paragraph trainer + sentence-starter drill)
 * without the Skriv shell: no router, no document list, no onboarding, and
 * deliberately no service-worker registration — the page must not pull
 * visitors into the Skriv PWA (see the manifest comment in school.html).
 *
 * Which school is shown comes from window.SKRIV_SCHOOL, resolved in
 * school.html from the ?skole= query parameter against the SKRIV_SCHOOLS
 * config map (name, fixed school level, accent palette, theme-color).
 * Adding a school is one config entry — this module is school-agnostic.
 *
 * Like #/avsnitt: nothing is written to IndexedDB — the in-progress attempt
 * lives in localStorage inside the trainer itself (shared with #/avsnitt,
 * since both surfaces run on the same origin). No onSaveDocument callback
 * is passed, so the trainer's save-as-document button stays hidden here.
 */

import { initI18n, t } from '../editor-core/shared/i18n.js';
import { initTheme, cycleTheme, getThemeIconSVG } from '../editor-core/shared/theme.js';
import { showToast } from '../editor-core/shared/toast-notification.js';
import { initParagraphTrainer } from '../editor-core/student/paragraph-trainer.js';
import { initSentenceStarterDrill } from '../editor-core/student/sentence-starter-drill.js';

async function init() {
    const school = window.SKRIV_SCHOOL || { name: '', level: 'vg1' };

    initTheme();
    await initI18n();

    const badgeEl = document.querySelector('[data-school-badge]');
    if (badgeEl) badgeEl.textContent = school.name;

    if (school.themeColor) {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', school.themeColor);
    }

    const titleEl = document.querySelector('[data-page-title]');
    if (titleEl) titleEl.textContent = t('paragraphTrainer.screenTitle');

    // Theme toggle (system → light → dark), same cycle as Skriv's header
    const themeBtn = document.querySelector('[data-theme-toggle]');
    if (themeBtn) {
        themeBtn.title = t('theme.toggle');
        themeBtn.setAttribute('aria-label', t('theme.toggle'));
        themeBtn.innerHTML = getThemeIconSVG();
        themeBtn.addEventListener('click', () => {
            const newTheme = cycleTheme();
            themeBtn.innerHTML = getThemeIconSVG();
            showToast(t(`theme.${newTheme}`), { duration: 1500 });
        });
    }

    const host = document.querySelector('[data-trainer-host]');
    if (!host) {
        console.error('Missing [data-trainer-host] element');
        return;
    }

    // --- Two exercises, one simple tab row ---
    // The paragraph trainer is the main exercise; the sentence-starter
    // drill is a quick warm-up. One active at a time, destroyed on switch.
    const EXERCISES = [
        { id: 'avsnitt', labelKey: 'paragraphTrainer.screenTitle', init: (el) => initParagraphTrainer(el, { getLevel: () => school.level || 'vg1' }) },
        { id: 'setninger', labelKey: 'starterDrill.title', init: (el) => initSentenceStarterDrill(el, { getLevel: () => school.level || 'vg1' }) },
    ];

    const tabRow = document.createElement('div');
    tabRow.className = 'max-w-2xl mx-auto px-4 pt-4 flex gap-2';
    tabRow.setAttribute('role', 'tablist');
    host.parentNode.insertBefore(tabRow, host);

    let activeApi = null;
    let activeId = null;

    function activate(id) {
        if (id === activeId) return;
        const exercise = EXERCISES.find(x => x.id === id);
        if (!exercise) return;
        if (activeApi) { try { activeApi.destroy(); } catch (_) {} }
        host.innerHTML = '';
        activeId = id;
        activeApi = exercise.init(host);
        for (const btn of tabRow.querySelectorAll('[data-exercise]')) {
            const on = btn.dataset.exercise === id;
            btn.setAttribute('aria-selected', on ? 'true' : 'false');
            btn.className = on
                ? 'px-4 py-1.5 rounded-full text-sm font-medium bg-emerald-600 text-white'
                : 'px-4 py-1.5 rounded-full text-sm font-medium border border-stone-300 dark:border-stone-600 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors';
        }
        if (titleEl) titleEl.textContent = t(exercise.labelKey);
    }

    for (const exercise of EXERCISES) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.setAttribute('role', 'tab');
        btn.dataset.exercise = exercise.id;
        btn.textContent = t(exercise.labelKey);
        btn.addEventListener('click', () => activate(exercise.id));
        tabRow.appendChild(btn);
    }

    activate('avsnitt');
}

init().catch(err => console.error('School page init failed:', err));
