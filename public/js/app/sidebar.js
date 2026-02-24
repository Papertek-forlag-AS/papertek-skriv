/**
 * Sidebar navigation for subject folders.
 * Shows: school year selector, recent docs, subject folders with counts,
 * orphan documents, personal folder, and add-subject input.
 */

import { t } from '../editor-core/shared/i18n.js';
import { escapeHtml } from '../editor-core/shared/html-escape.js';
import {
    getAllSubjects, getAvailableSchoolYears, getCurrentSchoolYear,
    setCurrentSchoolYear, addCustomSubject, removeCustomSubject,
    PERSONAL_SUBJECT, PREDEFINED_SUBJECTS, getCustomSubjects,
} from './subject-store.js';
import { getSchoolLevel, setSchoolLevel, SCHOOL_LEVELS } from './school-level.js';
import { showOnboardingModal } from './onboarding-modal.js';

/**
 * Create the sidebar navigation component.
 * @param {HTMLElement} container - The element to render the sidebar into
 * @param {Object} options
 * @param {Array} options.docs - All documents (for computing counts)
 * @param {string} options.activeFilter - Current active filter ('all' | 'orphans' | 'personal' | subject name)
 * @param {string} options.schoolYear - Active school year label
 * @param {Function} options.onFilterChange - Called with new filter value
 * @param {Function} options.onSchoolYearChange - Called with new school year label
 * @param {Function} options.onAddSubject - Called when student adds a custom subject
 * @returns {{ destroy: Function, update: Function }}
 */
export function createSidebar(container, options) {
    const nav = document.createElement('nav');
    nav.className = 'skriv-sidebar';
    nav.setAttribute('role', 'navigation');
    nav.setAttribute('aria-label', t('sidebar.title'));

    let state = { ...options };

    function getSubjectCounts(docs, schoolYear) {
        const counts = { all: 0, orphans: 0, personal: 0 };
        for (const doc of docs) {
            if (doc.schoolYear !== schoolYear) continue;
            counts.all++;
            if (!doc.subject) {
                counts.orphans++;
            } else if (doc.subject === PERSONAL_SUBJECT) {
                counts.personal++;
            } else {
                counts[doc.subject] = (counts[doc.subject] || 0) + 1;
            }
        }
        return counts;
    }

    function render() {
        const counts = getSubjectCounts(state.docs, state.schoolYear);
        const subjects = getAllSubjects();
        const years = getAvailableSchoolYears(state.docs);
        const customSubjects = getCustomSubjects();

        nav.innerHTML = '';

        // School year selector
        const yearSection = document.createElement('div');
        yearSection.className = 'px-3 pt-4 pb-2';
        yearSection.innerHTML = `
            <label class="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold mb-1 block">${t('sidebar.schoolYear')}</label>
            <select id="sidebar-year-select" class="w-full text-sm px-2 py-1.5 rounded-lg border border-stone-200 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-200 outline-none focus:border-emerald-400">
                ${years.map(y => `<option value="${y}" ${y === state.schoolYear ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
        `;
        nav.appendChild(yearSection);

        yearSection.querySelector('#sidebar-year-select').addEventListener('change', (e) => {
            state.schoolYear = e.target.value;
            setCurrentSchoolYear(e.target.value);
            state.onSchoolYearChange(e.target.value);
            render();
        });

        // Navigation items container
        const list = document.createElement('div');
        list.className = 'px-2 py-2 flex flex-col gap-0.5';

        // "Siste dok" (Recent / All)
        list.appendChild(createItem(
            'all',
            t('sidebar.recentDocs'),
            counts.all,
            `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`
        ));

        // Divider + section label
        list.appendChild(createDivider(t('sidebar.title')));

        // Subject folders — show only subjects with documents or custom subjects
        const visibleSubjects = subjects.filter(s =>
            (counts[s] || 0) > 0 || customSubjects.includes(s)
        );
        const hiddenSubjects = subjects.filter(s =>
            (counts[s] || 0) === 0 && !customSubjects.includes(s)
        );

        for (const subject of visibleSubjects) {
            const count = counts[subject] || 0;
            const isCustom = customSubjects.includes(subject);
            list.appendChild(createItem(
                subject,
                subject,
                count,
                `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`,
                isCustom
            ));
        }

        // "Show all subjects" toggle when there are hidden subjects
        if (hiddenSubjects.length > 0) {
            const showAllBtn = document.createElement('button');
            showAllBtn.className = 'flex items-center gap-2 w-full px-3 py-1 text-[11px] text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors rounded-lg';
            showAllBtn.innerHTML = `
                <svg class="w-3 h-3 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
                ${t('sidebar.showAllSubjects', { count: hiddenSubjects.length })}
            `;
            let expanded = false;
            const expandedContainer = document.createElement('div');
            expandedContainer.className = 'hidden';

            for (const subject of hiddenSubjects) {
                expandedContainer.appendChild(createItem(
                    subject,
                    subject,
                    0,
                    `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>`,
                    false
                ));
            }

            showAllBtn.addEventListener('click', () => {
                expanded = !expanded;
                expandedContainer.classList.toggle('hidden', !expanded);
                showAllBtn.querySelector('svg').style.transform = expanded ? 'rotate(180deg)' : '';
                showAllBtn.lastElementChild?.remove();
                const label = document.createElement('span');
                label.textContent = expanded
                    ? t('sidebar.hideSubjects')
                    : t('sidebar.showAllSubjects', { count: hiddenSubjects.length });
                showAllBtn.appendChild(label);
            });

            // Wrap label in span for replacement
            const labelSpan = document.createElement('span');
            labelSpan.textContent = t('sidebar.showAllSubjects', { count: hiddenSubjects.length });
            showAllBtn.innerHTML = `<svg class="w-3 h-3 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>`;
            showAllBtn.appendChild(labelSpan);

            list.appendChild(showAllBtn);
            list.appendChild(expandedContainer);
        }

        // Add subject button
        const addBtn = document.createElement('button');
        addBtn.className = 'flex items-center gap-2 w-full px-3 py-1.5 text-xs text-stone-400 dark:text-stone-500 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors rounded-lg';
        addBtn.innerHTML = `
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v12m6-6H6"/></svg>
            ${t('sidebar.addSubject')}
        `;
        addBtn.addEventListener('click', () => showAddSubjectInput(list, addBtn));
        list.appendChild(addBtn);

        // Divider
        list.appendChild(createDivider());

        // Orphans
        const orphanItem = createItem(
            'orphans',
            t('sidebar.orphans'),
            counts.orphans,
            `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
            false,
            counts.orphans > 0
        );
        list.appendChild(orphanItem);

        // Personal folder
        list.appendChild(createItem(
            'personal',
            t('sidebar.personalFolder'),
            counts.personal,
            `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/></svg>`
        ));

        nav.appendChild(list);

        // "Bytt trinn" (Change level) button at the bottom
        const levelId = getSchoolLevel();
        if (levelId) {
            const levelData = SCHOOL_LEVELS.find(l => l.id === levelId);
            const levelSection = document.createElement('div');
            levelSection.className = 'px-3 py-3 mt-auto border-t border-stone-200 dark:border-stone-700';

            const changeLevelBtn = document.createElement('button');
            changeLevelBtn.className = 'flex items-center gap-2 w-full px-3 py-2 text-xs text-stone-500 dark:text-stone-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-stone-100 dark:hover:bg-stone-700/50 rounded-lg transition-colors';
            changeLevelBtn.innerHTML = `
                <svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5"/></svg>
                <span class="flex flex-col text-left">
                    <span class="font-medium">${escapeHtml(t('level.changeLevel'))}</span>
                    <span class="text-[10px] text-stone-400 dark:text-stone-500">${levelData ? escapeHtml(t(levelData.labelKey)) : ''}</span>
                </span>
            `;

            changeLevelBtn.addEventListener('click', async () => {
                const newLevel = await showOnboardingModal({ allowCancel: true });
                if (newLevel) {
                    setSchoolLevel(newLevel);
                    state.activeFilter = 'all';
                    state.onFilterChange('all');
                    // No explicit render() needed — onFilterChange → applyFilters → sidebar.update → render
                }
            });

            levelSection.appendChild(changeLevelBtn);
            nav.appendChild(levelSection);
        }
    }

    function createItem(filterValue, label, count, iconSvg, isCustom = false, hasAttention = false) {
        const isActive = state.activeFilter === filterValue;
        const btn = document.createElement('button');
        btn.className = `skriv-sidebar-item flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg transition-colors ${
            isActive
                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-medium'
                : 'text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700/50'
        }`;
        btn.setAttribute('data-filter', filterValue);
        if (isActive) btn.setAttribute('aria-current', 'page');

        btn.innerHTML = `
            <span class="flex-shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500'}">${iconSvg}</span>
            <span class="flex-1 text-left truncate">${escapeHtml(label)}</span>
            ${count > 0 ? `<span class="text-[10px] px-1.5 py-0.5 rounded-full ${
                hasAttention
                    ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400'
                    : 'bg-stone-100 dark:bg-stone-700 text-stone-400 dark:text-stone-500'
            }">${count}</span>` : ''}
        `;

        btn.addEventListener('click', () => {
            state.activeFilter = filterValue;
            state.onFilterChange(filterValue);
            render();
        });

        return btn;
    }

    function createDivider(label) {
        const div = document.createElement('div');
        if (label) {
            div.className = 'mt-3 mb-1 px-3';
            div.innerHTML = `<span class="text-[10px] uppercase tracking-wider text-stone-400 dark:text-stone-500 font-semibold">${escapeHtml(label)}</span>`;
        } else {
            div.className = 'my-2 mx-3 border-t border-stone-200 dark:border-stone-700';
        }
        return div;
    }

    function showAddSubjectInput(list, addBtn) {
        addBtn.classList.add('hidden');

        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'px-3 py-1';
        inputWrapper.innerHTML = `
            <input type="text" maxlength="30"
                class="w-full text-xs px-2 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-700 text-stone-700 dark:text-stone-200 outline-none focus:border-emerald-400 placeholder-stone-400"
                placeholder="${t('sidebar.customSubjectPlaceholder')}" />
        `;

        const input = inputWrapper.querySelector('input');

        function commit() {
            const name = input.value.trim();
            if (name) {
                addCustomSubject(name);
                if (state.onAddSubject) state.onAddSubject(name);
            }
            inputWrapper.remove();
            addBtn.classList.remove('hidden');
            render();
        }

        function cancel() {
            inputWrapper.remove();
            addBtn.classList.remove('hidden');
        }

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') cancel();
        });
        input.addEventListener('blur', commit);

        list.insertBefore(inputWrapper, addBtn);
        input.focus();
    }

    render();
    container.appendChild(nav);

    return {
        destroy: () => nav.remove(),
        update(newOptions) {
            Object.assign(state, newOptions);
            render();
        },
    };
}
