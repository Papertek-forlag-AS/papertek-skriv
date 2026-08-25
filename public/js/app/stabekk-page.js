/**
 * Entry point for stabekk.html — the standalone Stabekk one-pager.
 *
 * Hosts the portable three-step paragraph trainer from editor-core/student/
 * without the Skriv shell: no router, no document list, no onboarding.
 * Stabekk branding (accent palette) lives in stabekk.html's Tailwind config,
 * which remaps the emerald scale — the trainer module is reused unchanged
 * and #/avsnitt inside Skriv is untouched.
 *
 * Like #/avsnitt: nothing is written to IndexedDB — the in-progress attempt
 * lives in localStorage inside the trainer itself (shared with #/avsnitt,
 * since both surfaces run on the same origin).
 */

import { initI18n, t } from '../editor-core/shared/i18n.js';
import { initTheme, cycleTheme, getThemeIconSVG } from '../editor-core/shared/theme.js';
import { showToast } from '../editor-core/shared/toast-notification.js';
import { initServiceWorker } from './sw-manager.js';
import { initParagraphTrainer } from '../editor-core/student/paragraph-trainer.js';

// Fast skolenivå for Stabekk-klassene i stedet for onboarding-modalen.
// Styrer hvilket nivå ('us' vs 'vgs') startsetning-trekkene henter fra.
// Gyldige verdier: 'barneskole' | 'ungdomsskole' | 'vg1' | 'vg2' | 'vg3'.
const STABEKK_LEVEL = 'ungdomsskole';

async function init() {
    initTheme();
    initServiceWorker();
    await initI18n();

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
        getLevel: () => STABEKK_LEVEL,
    });
}

init().catch(err => console.error('Stabekk page init failed:', err));
