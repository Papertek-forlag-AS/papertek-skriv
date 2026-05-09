/**
 * German Hint Drawer.
 *
 * Non-modal slide-in panel that shows the simple + rich Norwegian drafts
 * for a German exam document. Triggered from a top-bar button in the
 * editor; the button is only mounted when the doc has a `germanHint`
 * field (seeded by german-exam-route.js when a task is picked).
 *
 * Non-modal on purpose: the student needs to read the draft AND write at
 * the same time. There's no backdrop and no focus trap — the editor
 * stays fully interactive while the drawer is open, sitting on the right
 * edge of the viewport. To close: the X button, Esc, or the toggle
 * button in the editor top bar.
 *
 * Public API:
 *   initGermanHintDrawer(host, hint, options?) → { destroy(), open(), close(), toggle() }
 *
 *   - host:    HTMLElement to mount the drawer into (typically the editor
 *              wrapper). The drawer positions itself fixed.
 *   - hint:    { simple: string, rich: string } — both may be empty, in
 *              which case that variant tab is disabled.
 *   - options: { docId?: string }  Used to namespace localStorage state
 *              (last-opened variant) per document.
 */

import { t } from '../shared/i18n.js';
import { escapeHtml } from '../shared/html-escape.js';

const STORE_PREFIX = 'germanHintDrawer.variant.';
const VARIANTS = ['simple', 'rich'];

function paragraphsToHtml(text) {
    if (!text) return '';
    const paras = String(text).split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
    return paras.map(p => {
        const inner = p.split('\n').map(line => escapeHtml(line)).join('<br>');
        return `<p class="my-2 leading-relaxed">${inner}</p>`;
    }).join('');
}

function loadVariant(docId) {
    if (!docId) return 'simple';
    try {
        const v = localStorage.getItem(STORE_PREFIX + docId);
        return VARIANTS.includes(v) ? v : 'simple';
    } catch (_) {
        return 'simple';
    }
}

function saveVariant(docId, variant) {
    if (!docId) return;
    try {
        localStorage.setItem(STORE_PREFIX + docId, variant);
    } catch (_) { /* ignore */ }
}

export function initGermanHintDrawer(host, hint, options = {}) {
    const { docId = null } = options;
    const safeHint = {
        simple: (hint && hint.simple) || '',
        rich: (hint && hint.rich) || '',
    };
    const hasSimple = !!safeHint.simple;
    const hasRich = !!safeHint.rich;
    if (!hasSimple && !hasRich) {
        return { destroy() {}, open() {}, close() {}, toggle() {} };
    }

    let activeVariant = loadVariant(docId);
    if (activeVariant === 'simple' && !hasSimple) activeVariant = 'rich';
    if (activeVariant === 'rich' && !hasRich) activeVariant = 'simple';

    const drawer = document.createElement('aside');
    // Non-modal: no backdrop, editor stays interactive while the drawer is open.
    drawer.className = 'german-hint-drawer fixed top-0 right-0 h-full w-full max-w-md bg-white dark:bg-stone-800 shadow-2xl border-l border-stone-200 dark:border-stone-700 z-40 flex flex-col transform translate-x-full transition-transform duration-200 ease-out pointer-events-none';
    drawer.setAttribute('role', 'complementary');
    drawer.setAttribute('aria-labelledby', 'german-hint-title');
    drawer.setAttribute('aria-hidden', 'true');

    drawer.innerHTML = `
        <header class="flex items-center justify-between px-4 py-3 border-b border-stone-200 dark:border-stone-700">
            <h2 id="german-hint-title" class="text-base font-semibold text-stone-800 dark:text-stone-100">
                ${escapeHtml(t('germanExam.hintTitle'))}
            </h2>
            <button type="button" data-close
                class="flex items-center justify-center w-8 h-8 rounded-md text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-700 transition-colors"
                aria-label="${escapeHtml(t('germanExam.hintClose'))}"
                title="${escapeHtml(t('germanExam.hintClose'))}">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        </header>
        <div class="px-4 pt-3" role="tablist" aria-label="${escapeHtml(t('germanExam.hintTabsLabel'))}">
            <div class="inline-flex rounded-lg bg-stone-100 dark:bg-stone-900 p-0.5 text-sm">
                <button type="button" role="tab" data-variant="simple"
                    class="px-3 py-1 rounded-md transition-colors"
                    aria-selected="${activeVariant === 'simple'}"
                    ${hasSimple ? '' : 'disabled'}>
                    ${escapeHtml(t('germanExam.hintTabSimple'))}
                </button>
                <button type="button" role="tab" data-variant="rich"
                    class="px-3 py-1 rounded-md transition-colors"
                    aria-selected="${activeVariant === 'rich'}"
                    ${hasRich ? '' : 'disabled'}>
                    ${escapeHtml(t('germanExam.hintTabRich'))}
                </button>
            </div>
            <p class="mt-2 text-xs text-stone-500 dark:text-stone-400" data-tab-hint></p>
        </div>
        <div class="flex-1 overflow-y-auto px-4 py-3 text-sm text-stone-700 dark:text-stone-200 prose prose-sm max-w-none dark:prose-invert" data-body></div>
    `;

    host.appendChild(drawer);

    const closeBtn = drawer.querySelector('[data-close]');
    const body = drawer.querySelector('[data-body]');
    const tabHint = drawer.querySelector('[data-tab-hint]');
    const tabBtns = drawer.querySelectorAll('[data-variant]');
    let isOpen = false;

    function styleTabs() {
        tabBtns.forEach(btn => {
            const v = btn.dataset.variant;
            const selected = v === activeVariant;
            btn.setAttribute('aria-selected', selected);
            btn.className = 'px-3 py-1 rounded-md transition-colors text-sm '
                + (selected
                    ? 'bg-white dark:bg-stone-700 text-emerald-700 dark:text-emerald-300 shadow-sm font-medium'
                    : 'text-stone-600 dark:text-stone-300 hover:text-stone-900')
                + (btn.disabled ? ' opacity-40 cursor-not-allowed' : '');
        });
    }

    function renderBody() {
        body.innerHTML = paragraphsToHtml(safeHint[activeVariant]);
        tabHint.textContent = activeVariant === 'simple'
            ? t('germanExam.hintSimpleHint')
            : t('germanExam.hintRichHint');
    }

    function setVariant(variant) {
        if (!VARIANTS.includes(variant)) return;
        if (variant === activeVariant) return;
        if (variant === 'simple' && !hasSimple) return;
        if (variant === 'rich' && !hasRich) return;
        activeVariant = variant;
        saveVariant(docId, variant);
        styleTabs();
        renderBody();
    }

    function open() {
        if (isOpen) return;
        isOpen = true;
        // pointer-events-auto only while open so the drawer doesn't block
        // the editor when it's slid off-screen.
        drawer.classList.remove('pointer-events-none');
        drawer.classList.add('pointer-events-auto');
        drawer.setAttribute('aria-hidden', 'false');
        // Force reflow so the slide-in transition runs.
        // eslint-disable-next-line no-unused-expressions
        drawer.offsetWidth;
        drawer.classList.remove('translate-x-full');
        drawer.classList.add('translate-x-0');
        document.addEventListener('keydown', onKey);
    }

    function close() {
        if (!isOpen) return;
        isOpen = false;
        drawer.classList.remove('translate-x-0');
        drawer.classList.add('translate-x-full');
        drawer.setAttribute('aria-hidden', 'true');
        // Stop catching pointer events once the slide-out finishes.
        setTimeout(() => {
            if (!isOpen) {
                drawer.classList.remove('pointer-events-auto');
                drawer.classList.add('pointer-events-none');
            }
        }, 220);
        document.removeEventListener('keydown', onKey);
    }

    function toggle() { isOpen ? close() : open(); }

    function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(); }
    }

    function onTabClick(e) {
        const tab = e.target.closest('[data-variant]');
        if (tab && !tab.disabled) {
            setVariant(tab.dataset.variant);
        }
    }

    function onCloseClick(e) {
        e.preventDefault();
        e.stopPropagation();
        close();
    }

    closeBtn.addEventListener('click', onCloseClick);
    drawer.addEventListener('click', onTabClick);

    styleTabs();
    renderBody();

    return {
        open,
        close,
        toggle,
        destroy() {
            close();
            closeBtn.removeEventListener('click', onCloseClick);
            drawer.removeEventListener('click', onTabClick);
            document.removeEventListener('keydown', onKey);
            drawer.remove();
        },
    };
}
