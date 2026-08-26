/**
 * Sentence Starter Drill (setningsstart)
 *
 * Micro-exercise for the school pages: the pupil is given ONE rhetorical
 * function (innledning, argument, motargument, eksempel, overgang,
 * avslutning) and writes ONE sentence that does that job. Two or three
 * sentence starters from the writing-spinner word bank are offered as
 * clickable chips.
 *
 * Deliberately tiny (keep it simple, skolerettet): no draft persistence,
 * no history, no save — a quick warm-up drill, not a document surface.
 * All content is reused from spinner-data (generell genre) and the
 * existing spinner.cat.* labels; the module adds no new word data.
 */

import { t, getCurrentLanguage } from '../shared/i18n.js';
import { escapeHtml } from '../shared/html-escape.js';

/** The rhetorical functions the drill draws from (generell-genre buckets). */
const BUCKETS = ['innledning', 'argument', 'motargument', 'eksempel', 'overgang', 'avslutning'];

/**
 * Check the pupil's sentence: exactly one finished sentence, at least
 * three words. Pure — exported for tests.
 * @param {string} text
 * @returns {{ oneSentence: boolean, minWords: boolean, written: boolean }}
 */
export function evaluateStarterSentence(text) {
    const trimmed = (text || '').trim();
    const terminators = (trimmed.match(/[.!?…]+/g) || []).length;
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    return {
        written: !!trimmed,
        oneSentence: terminators === 1 && /[.!?…]$/.test(trimmed),
        minWords: words >= 3,
    };
}

async function loadStarters(contentLang) {
    const lang = contentLang || getCurrentLanguage();
    try {
        const mod = lang === 'nn'
            ? await import('./spinner-data-nn.js')
            : lang === 'en'
                ? await import('./spinner-data-en.js')
                : await import('./spinner-data-nb.js');
        return mod.starters?.generell || {};
    } catch (err) {
        console.error('Failed to load starter data:', err);
        return {};
    }
}

/**
 * Initialize the drill.
 * @param {HTMLElement} container
 * @param {object} [options]
 * @param {() => string|null} [options.getLevel] - School level ('barneskole'|'ungdomsskole'|'vg1'|...)
 * @param {() => string|null} [options.getContentLang] - Language the pupil writes in
 * @returns {{ destroy: () => void }}
 */
export function initSentenceStarterDrill(container, options = {}) {
    const root = document.createElement('div');
    root.className = 'max-w-2xl mx-auto px-4 py-6';
    container.appendChild(root);

    let generell = {};       // bucket → starters for the level tier
    let bucket = null;
    let text = '';

    function tier() {
        const level = options.getLevel?.() || 'ungdomsskole';
        return (level === 'ungdomsskole' || level === 'barneskole') ? 'us' : 'vgs';
    }

    function drawBucket() {
        const available = BUCKETS.filter(b => b !== bucket && (generell[b] || []).length);
        const pool = available.length ? available : BUCKETS;
        bucket = pool[Math.floor(Math.random() * pool.length)];
    }

    function chips() {
        const pool = generell[bucket] || [];
        return pool.slice(0, 3);
    }

    function checksHtml() {
        const c = evaluateStarterSentence(text);
        const row = (pass, label) => `
            <li class="flex items-center gap-2 text-sm ${pass ? 'text-emerald-700 dark:text-emerald-400' : 'text-stone-400'}">
                <span>${pass ? '✓' : '○'}</span><span>${escapeHtml(label)}</span>
            </li>`;
        return row(c.written && c.oneSentence, t('starterDrill.checkOneSentence'))
            + row(c.written && c.minWords, t('starterDrill.checkMinWords'));
    }

    function render() {
        root.innerHTML = `
            <div class="rounded-xl border border-stone-200 dark:border-stone-700 bg-white dark:bg-stone-800 p-4 shadow-sm">
                <div class="flex items-center justify-between gap-3 mb-1">
                    <h2 class="text-base font-semibold">${escapeHtml(t(`spinner.cat.${bucket}`))}</h2>
                    <button type="button" data-new-bucket
                        class="px-3 py-1.5 rounded-lg border border-emerald-600 text-emerald-700 dark:text-emerald-400 text-sm font-medium hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors">
                        🎲 ${escapeHtml(t('starterDrill.newTask'))}
                    </button>
                </div>
                <p class="text-sm text-stone-500 dark:text-stone-400 mb-3">${escapeHtml(t('starterDrill.intro'))}</p>
                <div class="flex flex-wrap gap-2 mb-3">
                    ${chips().map(c => `
                        <button type="button" data-chip="${escapeHtml(c)}"
                            class="text-xs px-2.5 py-1 rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors">
                            ${escapeHtml(c)}
                        </button>`).join('')}
                </div>
                <textarea data-drill-input rows="2"
                    class="w-full rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-900 p-3 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="${escapeHtml(t('starterDrill.placeholder'))}"></textarea>
                <ul class="mt-2 space-y-0.5" data-drill-checks>${checksHtml()}</ul>
            </div>
        `;
        const input = root.querySelector('[data-drill-input]');
        input.value = text;
    }

    function onInput(e) {
        if (!e.target.matches('[data-drill-input]')) return;
        text = e.target.value;
        root.querySelector('[data-drill-checks]').innerHTML = checksHtml();
    }

    function onClick(e) {
        if (e.target.closest('[data-new-bucket]')) {
            drawBucket();
            text = '';
            render();
            return;
        }
        const chip = e.target.closest('[data-chip]');
        if (chip) {
            const input = root.querySelector('[data-drill-input]');
            text = chip.dataset.chip.replace(/\.\.\.$/, ' ');
            input.value = text;
            input.focus();
            root.querySelector('[data-drill-checks]').innerHTML = checksHtml();
        }
    }

    root.addEventListener('input', onInput);
    root.addEventListener('click', onClick);

    loadStarters(options.getContentLang?.()).then(g => {
        generell = g[tier()] || g.us || {};
        drawBucket();
        render();
    });

    function destroy() {
        root.removeEventListener('input', onInput);
        root.removeEventListener('click', onClick);
        root.remove();
    }

    return { destroy };
}
