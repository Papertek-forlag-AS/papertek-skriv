import { t } from '../shared/i18n.js';

export function initInsightsDrawer(container, actions) {
    const drawer = document.createElement('div');
    drawer.className = 'fixed right-0 top-0 bottom-0 w-80 bg-white dark:bg-stone-900 border-l border-stone-200 dark:border-stone-700 shadow-2xl transition-transform duration-300 ease-in-out translate-x-full z-[100] flex flex-col';
    
    // Header
    const header = document.createElement('div');
    header.className = 'flex items-center justify-between p-4 border-b border-stone-200 dark:border-stone-700';
    header.innerHTML = `
        <h2 class="text-base font-semibold text-stone-800 dark:text-stone-100">${t('skriv.insightsTitle') || 'Gjennomgang'}</h2>
        <button id="close-insights" type="button" class="flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 active:bg-stone-300 transition-colors flex-shrink-0" title="${t('insights.close')} (Esc)">
            <svg class="w-3.5 h-3.5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
            <span>${t('insights.close')}</span>
        </button>
    `;
    
    // Body
    const body = document.createElement('div');
    body.className = 'flex-1 overflow-y-auto p-4 space-y-6';

    function createSection(title, items) {
        const section = document.createElement('div');
        section.className = 'space-y-2';
        section.innerHTML = `<h3 class="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-3">${title}</h3>`;
        
        items.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'w-full flex items-center gap-3 p-3 text-left bg-stone-50 dark:bg-stone-800 hover:bg-stone-100 dark:hover:bg-stone-700 border border-stone-200 dark:border-stone-700 rounded-lg transition-colors';
            if (item.description) btn.title = item.description;
            btn.innerHTML = `
                <div class="text-stone-500 dark:text-stone-400">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="${item.icon}"/></svg>
                </div>
                <div class="flex-1 font-medium text-stone-700 dark:text-stone-200">${item.label}</div>
            `;
            btn.addEventListener('click', () => {
                // If it's a toggle, we can visually show it's active. For now, just trigger action.
                btn.classList.toggle('ring-2');
                btn.classList.toggle('ring-emerald-500');
                item.action();
                // Yield to the tool: several tools open their own panel on
                // the same right edge, which the drawer would otherwise hide.
                closeDrawer();
            });
            section.appendChild(btn);
        });
        
        return section;
    }

    const toolsSection = createSection(t('skriv.insightsTools') || 'Verktøy', actions.filter(a => a.isTool));
    const analysisSection = createSection(t('skriv.insightsAnalysis') || 'Analyse', actions.filter(a => a.isAnalysis));

    body.appendChild(toolsSection);
    body.appendChild(analysisSection);

    drawer.appendChild(header);
    drawer.appendChild(body);
    container.appendChild(drawer);

    let isOpen = false;

    drawer.querySelector('#close-insights').addEventListener('click', (e) => {
        e.stopPropagation();
        closeDrawer();
    });

    function openDrawer() {
        isOpen = true;
        drawer.style.pointerEvents = 'auto';
        drawer.setAttribute('aria-hidden', 'false');
        drawer.inert = false;
        drawer.classList.remove('translate-x-full');
    }

    function closeDrawer() {
        if (!isOpen) return;
        isOpen = false;
        drawer.classList.add('translate-x-full');
        drawer.setAttribute('aria-hidden', 'true');
        drawer.inert = true;
        setTimeout(() => {
            if (!isOpen) drawer.style.pointerEvents = 'none';
        }, 300);
    }

    function toggle() {
        if (isOpen) closeDrawer();
        else openDrawer();
    }

    function destroy() {
        drawer.remove();
    }

    return { open: openDrawer, close: closeDrawer, toggle, destroy };
}
