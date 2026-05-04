/**
 * Argument Flow Visualization Module
 *
 * Analyzes argumentative text and visualizes the argument structure as a flow diagram.
 * Detects claims, evidence, explanations, counter-arguments, and structural gaps.
 *
 * For argumentative genres: droefting, kronikk, leserinnlegg, retorisk-analyse, sammenligning.
 *
 * i18n keys needed:
 *   argument.title = 'Argumentflyt'
 *   argument.empty = 'Skriv en argumenterende tekst for å se argumentflyten'
 *   argument.claim = 'Påstand'
 *   argument.evidence = 'Belegg'
 *   argument.explanation = 'Forklaring'
 *   argument.counter = 'Motargument'
 *   argument.missingEvidence = 'Mangler belegg'
 *   argument.missingExplanation = 'Mangler forklaring'
 */

import { t } from '../shared/i18n.js';
import { isFrameElement } from '../shared/frame-elements.js';

const CLAIM_MARKERS = [
    'mener', 'hevder', 'påstår', 'bør', 'må vi', 'det er viktig',
    'jeg mener', 'vi må', 'det er nødvendig', 'konklusjonen er', 'min påstand'
];

const EVIDENCE_MARKERS = [
    'ifølge', 'viser at', 'forskning', 'statistikk', 'undersøkelse',
    'rapport', 'tall fra', 'i artikkelen', 'eksempel på', 'studier viser', '\\[\\d+\\]'
];

const EXPLANATION_MARKERS = [
    'dette betyr', 'konsekvensen', 'dette viser at', 'sammenhengen er',
    'dermed', 'resultatet er', 'dette innebærer', 'fordi dette'
];

const COUNTER_MARKERS = [
    'på den andre siden', 'motargument', 'kritikere', 'likevel',
    'derimot', 'imidlertid', 'til tross for', 'innvende', 'noen vil hevde'
];

const ARGUMENTATIVE_FRAMES = [
    'droefting', 'kronikk', 'leserinnlegg', 'retorisk-analyse', 'sammenligning'
];

const STYLES = `
.skriv-argument-flow {
    position: fixed;
    top: 0;
    right: 0;
    width: 280px;
    height: 100vh;
    background: #fafaf9;
    border-left: 1px solid #e7e5e4;
    overflow-y: auto;
    z-index: 30;
    display: flex;
    flex-direction: column;
    transition: transform 0.3s ease;
    font-size: 0.8rem;
}
.skriv-argument-flow.hidden {
    transform: translateX(100%);
}
.argument-flow-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid #e7e5e4;
    position: sticky;
    top: 0;
    background: #fafaf9;
}
.argument-flow-title { font-weight: 600; color: #1c1917; }
.argument-flow-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #78716c; }
.argument-flow-content { padding: 0.75rem; flex: 1; }
.argument-flow-empty { color: #a8a29e; text-align: center; padding: 2rem 1rem; }

.argument-flow-summary {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
}
.af-stat {
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 500;
}
.af-stat.af-claim { background: #dbeafe; color: #1d4ed8; }
.af-stat.af-evidence { background: #dcfce7; color: #166534; }
.af-stat.af-counter { background: #fef3c7; color: #92400e; }

.argument-flow-cards { display: flex; flex-direction: column; align-items: stretch; }
.af-card {
    padding: 0.5rem 0.6rem;
    border-radius: 6px;
    border-left: 3px solid;
    background: white;
    cursor: pointer;
    transition: transform 0.1s, box-shadow 0.1s;
}
.af-card:hover { transform: translateX(2px); box-shadow: 0 2px 6px rgba(0,0,0,0.08); }
.af-card.af-claim { border-color: #3b82f6; }
.af-card.af-evidence { border-color: #22c55e; }
.af-card.af-explanation { border-color: #a855f7; }
.af-card.af-counter { border-color: #f59e0b; }
.af-card-header { display: flex; align-items: center; gap: 0.3rem; margin-bottom: 0.2rem; }
.af-icon { font-size: 0.7rem; }
.af-type { font-weight: 500; font-size: 0.7rem; color: #44403c; }
.af-loc { margin-left: auto; font-size: 0.6rem; color: #a8a29e; }
.af-card-text { font-size: 0.72rem; color: #57534e; line-height: 1.4; }

.af-gap {
    text-align: center;
    font-size: 0.7rem;
    color: #dc2626;
    padding: 0.3rem;
    background: #fef2f2;
    border-radius: 4px;
    margin: 0.25rem 0;
}

.af-connector {
    width: 2px;
    height: 12px;
    background: #d6d3d1;
    margin: 0 auto;
}

@media (prefers-color-scheme: dark) {
    .skriv-argument-flow { background: #1c1917; border-color: #44403c; }
    .argument-flow-header { background: #1c1917; border-color: #44403c; }
    .argument-flow-title { color: #e7e5e4; }
    .af-card { background: #292524; }
    .af-card-text { color: #d6d3d1; }
    .af-type { color: #d6d3d1; }
}
`;

/**
 * Classify a sentence by its argument role.
 * Checks markers in order of specificity: counter > evidence > explanation > claim.
 */
function classifySentence(sentence) {
    const lower = sentence.toLowerCase();

    for (const marker of COUNTER_MARKERS) {
        if (lower.includes(marker) || new RegExp(marker).test(lower)) return 'counter';
    }
    for (const marker of EVIDENCE_MARKERS) {
        if (lower.includes(marker) || new RegExp(marker).test(lower)) return 'evidence';
    }
    for (const marker of EXPLANATION_MARKERS) {
        if (lower.includes(marker) || new RegExp(marker).test(lower)) return 'explanation';
    }
    for (const marker of CLAIM_MARKERS) {
        if (lower.includes(marker) || new RegExp(marker).test(lower)) return 'claim';
    }

    return 'neutral';
}

/**
 * Detect structural gaps in the argument flow.
 * - Claims without following evidence
 * - Evidence without following explanation
 */
function detectGaps(flow) {
    const gaps = [];

    for (let i = 0; i < flow.length; i++) {
        const item = flow[i];

        if (item.type === 'claim') {
            const next = flow[i + 1];
            if (!next || (next.type !== 'evidence' && next.type !== 'explanation')) {
                gaps.push({
                    afterIndex: i,
                    type: 'missingEvidence',
                    text: t('argument.missingEvidence') || 'Mangler belegg'
                });
            }
        }

        if (item.type === 'evidence') {
            const next = flow[i + 1];
            if (!next || next.type !== 'explanation') {
                gaps.push({
                    afterIndex: i,
                    type: 'missingExplanation',
                    text: t('argument.missingExplanation') || 'Mangler forklaring'
                });
            }
        }
    }

    return gaps;
}

/**
 * Initialize the argument flow visualization.
 *
 * @param {HTMLElement} editor - The contenteditable editor element
 * @param {HTMLElement} container - Container element to append the panel to
 * @param {Object} options
 * @param {Function} options.getActiveFrame - Returns the current frame type string
 * @returns {{ destroy: Function, toggle: Function, isActive: Function }}
 */
export function initArgumentFlow(editor, container, options = {}) {
    let active = false;
    let panel = null;
    let styleEl = null;
    let debounceTimer = null;

    // Inject styles
    styleEl = document.createElement('style');
    styleEl.textContent = STYLES;
    document.head.appendChild(styleEl);

    function isArgumentativeFrame() {
        const frame = options.getActiveFrame?.();
        return ARGUMENTATIVE_FRAMES.includes(frame);
    }

    function analyze() {
        const paragraphs = [];

        for (const child of editor.children) {
            if (isFrameElement(child)) continue;
            if (child.classList?.contains('skriv-frame-divider')) continue;
            const text = child.textContent?.trim();
            if (!text) continue;
            paragraphs.push({ element: child, text });
        }

        const flow = [];
        paragraphs.forEach((para, pIdx) => {
            const sentences = para.text.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 5);
            sentences.forEach((sentence, sIdx) => {
                const type = classifySentence(sentence);
                if (type !== 'neutral') {
                    flow.push({
                        type,
                        text: sentence.length > 60 ? sentence.slice(0, 57) + '...' : sentence,
                        paragraph: pIdx + 1,
                        sentence: sIdx + 1,
                        element: para.element,
                    });
                }
            });
        });

        const gaps = detectGaps(flow);
        return { flow, gaps };
    }

    function renderPanel(result) {
        if (!panel) return;
        const content = panel.querySelector('.argument-flow-content');

        if (result.flow.length === 0) {
            content.innerHTML = `<div class="argument-flow-empty">${t('argument.empty') || 'Skriv en argumenterende tekst for å se argumentflyten'}</div>`;
            return;
        }

        let html = '';

        // Summary stats
        const claims = result.flow.filter(f => f.type === 'claim').length;
        const evidence = result.flow.filter(f => f.type === 'evidence').length;
        const counters = result.flow.filter(f => f.type === 'counter').length;

        html += `<div class="argument-flow-summary">
            <span class="af-stat af-claim">${claims} påstand${claims !== 1 ? 'er' : ''}</span>
            <span class="af-stat af-evidence">${evidence} belegg</span>
            <span class="af-stat af-counter">${counters} motarg.</span>
        </div>`;

        // Flow cards
        const icons = { claim: '🔵', evidence: '📊', explanation: '💡', counter: '⚠️' };
        const labels = {
            claim: t('argument.claim') || 'Påstand',
            evidence: t('argument.evidence') || 'Belegg',
            explanation: t('argument.explanation') || 'Forklaring',
            counter: t('argument.counter') || 'Motargument'
        };

        html += '<div class="argument-flow-cards">';
        result.flow.forEach((item, i) => {
            html += `<div class="af-card af-${item.type}" data-index="${i}">
                <div class="af-card-header"><span class="af-icon">${icons[item.type]}</span> <span class="af-type">${labels[item.type]}</span> <span class="af-loc">Avs. ${item.paragraph}</span></div>
                <div class="af-card-text">${escapeHtml(item.text)}</div>
            </div>`;

            // Gap warning after this card
            const gap = result.gaps.find(g => g.afterIndex === i);
            if (gap) {
                html += `<div class="af-gap"><span class="af-gap-icon">❌</span> ${escapeHtml(gap.text)}</div>`;
            }

            // Connector line between cards
            if (i < result.flow.length - 1) {
                html += '<div class="af-connector"></div>';
            }
        });
        html += '</div>';

        content.innerHTML = html;

        // Click to scroll to source paragraph
        content.querySelectorAll('.af-card').forEach(card => {
            card.addEventListener('click', () => {
                const idx = parseInt(card.dataset.index);
                const item = result.flow[idx];
                if (item?.element) {
                    item.element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    item.element.style.outline = '2px solid #3b82f6';
                    setTimeout(() => { item.element.style.outline = ''; }, 2000);
                }
            });
        });
    }

    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // Create panel DOM
    function createPanel() {
        panel = document.createElement('div');
        panel.className = 'skriv-argument-flow hidden';
        panel.innerHTML = `
            <div class="argument-flow-header">
                <span class="argument-flow-title">${t('argument.title') || 'Argumentflyt'}</span>
                <button class="argument-flow-close">&times;</button>
            </div>
            <div class="argument-flow-content"></div>
        `;
        container.appendChild(panel);
        panel.querySelector('.argument-flow-close').addEventListener('click', () => toggle());
    }

    createPanel();

    function handleInput() {
        if (!active) return;
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const result = analyze();
            renderPanel(result);
        }, 1200);
    }

    editor.addEventListener('input', handleInput);

    function toggle() {
        active = !active;
        if (active) {
            panel.classList.remove('hidden');
            const result = analyze();
            renderPanel(result);
        } else {
            panel.classList.add('hidden');
        }
        return active;
    }

    function destroy() {
        editor.removeEventListener('input', handleInput);
        if (debounceTimer) clearTimeout(debounceTimer);
        if (panel) panel.remove();
        if (styleEl) styleEl.remove();
    }

    return { destroy, toggle, isActive: () => active, isArgumentativeFrame };
}
