/**
 * Entry point for school.html — the standalone per-school one-pager.
 *
 * Hosts the portable three-step paragraph trainer from editor-core/student/
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

    initParagraphTrainer(host, {
        getLevel: () => school.level || 'vg1',
    });
}

init().catch(err => console.error('School page init failed:', err));
