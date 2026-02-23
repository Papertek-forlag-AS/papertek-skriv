/**
 * Word Count Statistics panel.
 * Shows total words, per-document breakdown, and monthly writing activity.
 * Opened from the clickable word count badge on the document list.
 */

import { escapeHtml } from '../editor-core/shared/html-escape.js';
import { t } from '../editor-core/shared/i18n.js';
import { getSchoolYear } from './subject-store.js';

/**
 * Show a word-count statistics panel as a full-screen overlay.
 * @param {Array<{id: string, title: string, wordCount: number, createdAt: string, updatedAt: string}>} docs
 */
export function showWordCountStats(docs) {
    // Remove any existing panel
    const existing = document.getElementById('skriv-stats-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'skriv-stats-overlay';
    overlay.className = 'skriv-stats-overlay';

    const totalWords = docs.reduce((sum, d) => sum + (d.wordCount || 0), 0);
    const avgWords = docs.length > 0 ? Math.round(totalWords / docs.length) : 0;

    // Build monthly activity data for the current school year (Aug–Jul)
    const monthlyData = buildMonthlyActivity(docs);
    const maxMonthWords = Math.max(...monthlyData.map(m => m.words), 1);

    // Sort docs by word count descending for the breakdown
    const sortedDocs = [...docs].sort((a, b) => (b.wordCount || 0) - (a.wordCount || 0));
    const maxDocWords = sortedDocs.length > 0 ? (sortedDocs[0].wordCount || 1) : 1;

    overlay.innerHTML = `
        <div class="skriv-stats-panel">
            <div class="skriv-stats-header">
                <h2 class="skriv-stats-title">${t('stats.title')}</h2>
                <button id="stats-close" class="skriv-stats-close" aria-label="${t('stats.close')}">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
            </div>

            ${docs.length === 0 ? `
                <div class="skriv-stats-empty">
                    <p>${t('stats.noData')}</p>
                </div>
            ` : `
                <!-- Summary cards -->
                <div class="skriv-stats-summary">
                    <div class="skriv-stats-card">
                        <div class="skriv-stats-card-value">${totalWords.toLocaleString()}</div>
                        <div class="skriv-stats-card-label">${t('stats.totalWords')}</div>
                    </div>
                    <div class="skriv-stats-card">
                        <div class="skriv-stats-card-value">${t('stats.totalDocuments', { count: docs.length })}</div>
                        <div class="skriv-stats-card-label">&nbsp;</div>
                    </div>
                    <div class="skriv-stats-card">
                        <div class="skriv-stats-card-value">${avgWords.toLocaleString()}</div>
                        <div class="skriv-stats-card-label">${t('stats.avgPerDocument')}</div>
                    </div>
                </div>

                <!-- Monthly activity chart -->
                <div class="skriv-stats-section">
                    <h3 class="skriv-stats-section-title">${t('stats.writingActivity')}</h3>
                    <div class="skriv-stats-chart">
                        ${monthlyData.map(m => `
                            <div class="skriv-stats-chart-col">
                                <div class="skriv-stats-chart-bar-wrap">
                                    <div class="skriv-stats-chart-bar" style="height: ${Math.max(2, (m.words / maxMonthWords) * 100)}%"
                                         title="${m.words.toLocaleString()} ${t('stats.wordsUnit')}"></div>
                                </div>
                                <div class="skriv-stats-chart-label">${m.label}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Per-document breakdown -->
                <div class="skriv-stats-section">
                    <h3 class="skriv-stats-section-title">${t('stats.perDocument')}</h3>
                    <div class="skriv-stats-doc-list">
                        ${sortedDocs.map(doc => {
                            const title = doc.title || t('skriv.untitled');
                            const wc = doc.wordCount || 0;
                            const pct = Math.max(1, (wc / maxDocWords) * 100);
                            return `
                                <div class="skriv-stats-doc-row">
                                    <div class="skriv-stats-doc-title">${escapeHtml(title)}</div>
                                    <div class="skriv-stats-doc-bar-wrap">
                                        <div class="skriv-stats-doc-bar" style="width: ${pct}%"></div>
                                    </div>
                                    <div class="skriv-stats-doc-count">${wc.toLocaleString()}</div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `}
        </div>
    `;

    document.body.appendChild(overlay);

    // Close handlers
    const closeBtn = overlay.querySelector('#stats-close');
    closeBtn.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) overlay.remove();
    });

    // Esc key
    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            overlay.remove();
            document.removeEventListener('keydown', onKeyDown);
        }
    };
    document.addEventListener('keydown', onKeyDown);
}

/**
 * Build monthly word-count activity for the current school year.
 * Shows Aug–Jul, only up to the current month.
 * Uses document updatedAt to attribute words to the month of last edit.
 *
 * Prepared for future school-year selector: pass a different referenceDate
 * to getSchoolYear() to view historical years.
 */
function buildMonthlyActivity(docs) {
    const monthNames = t('stats.monthNames').split(',');
    const now = new Date();
    const schoolYear = getSchoolYear(now);
    const months = [];

    // Generate months from August to current month (or July if viewing past year)
    const schoolMonthOrder = [7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5, 6]; // Aug=7 through Jul=6
    for (const monthIdx of schoolMonthOrder) {
        const year = monthIdx >= 7 ? schoolYear.startYear : schoolYear.endYear;
        const monthDate = new Date(year, monthIdx, 1);

        // Don't show future months
        if (monthDate > now) break;

        months.push({
            year,
            month: monthIdx,
            label: monthNames[monthIdx],
            words: 0,
        });
    }

    // Attribute each document's words to the month it was last updated
    docs.forEach(doc => {
        if (!doc.updatedAt || !doc.wordCount) return;
        const updated = new Date(doc.updatedAt);
        const updateYear = updated.getFullYear();
        const updateMonth = updated.getMonth();

        for (const m of months) {
            if (m.year === updateYear && m.month === updateMonth) {
                m.words += doc.wordCount;
                break;
            }
        }
    });

    return months;
}
