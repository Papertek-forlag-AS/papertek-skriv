/**
 * Frame Guide Panel
 * Left-side accordion panel showing writing frame structure.
 * Students consult while writing, mark sections done, insert sentence starters.
 */
import { t } from '../shared/i18n.js';
import { showToast } from '../shared/toast-notification.js';

const DIVIDER_CLASS = 'skriv-frame-divider';

const CSS = `
/* Frame Guide Panel */
.skriv-frame-guide {
    position: fixed;
    top: 0;
    left: 0;
    width: 300px;
    height: 100vh;
    background: #fafaf9;
    border-right: 1px solid #e7e5e4;
    overflow-y: auto;
    z-index: 30;
    display: flex;
    flex-direction: column;
    transition: transform 0.3s ease;
    font-size: 0.85rem;
}
.skriv-frame-guide.hidden {
    transform: translateX(-100%);
}

/* Header */
.frame-guide-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
    border-bottom: 1px solid #e7e5e4;
    position: sticky;
    top: 0;
    background: #fafaf9;
    z-index: 1;
}
.frame-guide-title {
    font-weight: 600;
    font-size: 0.95rem;
    color: #1c1917;
}
.frame-guide-close {
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    color: #78716c;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
}
.frame-guide-close:hover {
    background: #f5f5f4;
}

/* Progress */
.frame-guide-progress {
    padding: 0.75rem 1rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    border-bottom: 1px solid #e7e5e4;
}
.frame-guide-progress-bar {
    flex: 1;
    height: 6px;
    background: #e7e5e4;
    border-radius: 3px;
    overflow: hidden;
}
.frame-guide-progress-fill {
    height: 100%;
    background: #059669;
    border-radius: 3px;
    transition: width 0.3s ease;
}
.frame-guide-progress-text {
    font-size: 0.75rem;
    color: #78716c;
    white-space: nowrap;
}

/* Sections */
.frame-guide-sections {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem 0;
}
.frame-guide-section {
    border-bottom: 1px solid #f5f5f4;
}
.frame-guide-section.completed .frame-guide-section-header {
    opacity: 0.5;
}
.frame-guide-section.completed .frame-guide-section-title {
    text-decoration: line-through;
}

/* Section header */
.frame-guide-section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    cursor: pointer;
    transition: background 0.1s;
}
.frame-guide-section-header:hover {
    background: #f5f5f4;
}
.frame-guide-section-arrow {
    font-size: 0.6rem;
    color: #a8a29e;
    width: 12px;
}
.frame-guide-section-title {
    font-weight: 500;
    color: #292524;
    flex: 1;
}
.frame-guide-check {
    color: #059669;
    font-weight: bold;
}

/* Section content */
.frame-guide-section-content {
    padding: 0 1rem 0.75rem 2rem;
}
.frame-guide-instruction {
    color: #57534e;
    line-height: 1.5;
    margin-bottom: 0.5rem;
    font-size: 0.8rem;
}
.frame-guide-subsection {
    margin: 0.5rem 0;
    padding-left: 0.5rem;
    border-left: 2px solid #d6d3d1;
}
.frame-guide-subsection strong {
    font-size: 0.8rem;
    color: #44403c;
}
.frame-guide-sub-instruction {
    font-size: 0.75rem;
    color: #78716c;
    margin: 0.25rem 0;
}

/* Sentence starters (clickable) */
.frame-guide-starter {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.375rem 0.5rem;
    margin: 0.25rem 0;
    font-size: 0.78rem;
    color: #059669;
    background: #ecfdf5;
    border: 1px solid #a7f3d0;
    border-radius: 4px;
    cursor: pointer;
    transition: background 0.1s, transform 0.1s;
}
.frame-guide-starter:hover {
    background: #d1fae5;
    transform: translateX(2px);
}

/* Done button */
.frame-guide-done-btn {
    display: block;
    width: 100%;
    margin-top: 0.5rem;
    padding: 0.4rem;
    font-size: 0.75rem;
    border: 1px dashed #d6d3d1;
    background: none;
    color: #78716c;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
}
.frame-guide-done-btn:hover {
    border-color: #059669;
    color: #059669;
}
.frame-guide-done-btn.active {
    background: #ecfdf5;
    border-style: solid;
    border-color: #059669;
    color: #059669;
}

/* Inline dividers in editor */
.skriv-frame-divider {
    display: flex;
    align-items: center;
    margin: 0.75em 0;
    user-select: none;
    cursor: pointer;
}
.skriv-frame-divider::before,
.skriv-frame-divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #d6d3d1;
}
.frame-divider-label {
    padding: 0.15rem 0.75rem;
    font-size: 0.65rem;
    color: #a8a29e;
    white-space: nowrap;
}
.skriv-frame-divider:hover .frame-divider-label {
    color: #059669;
}

/* Dark mode */
@media (prefers-color-scheme: dark) {
    .skriv-frame-guide {
        background: #1c1917;
        border-color: #44403c;
    }
    .frame-guide-header {
        background: #1c1917;
        border-color: #44403c;
    }
    .frame-guide-title { color: #e7e5e4; }
    .frame-guide-section { border-color: #292524; }
    .frame-guide-section-header:hover { background: #292524; }
    .frame-guide-section-title { color: #d6d3d1; }
    .frame-guide-instruction { color: #a8a29e; }
    .frame-guide-starter { background: #064e3b; border-color: #065f46; color: #6ee7b7; }
    .frame-guide-starter:hover { background: #065f46; }
    .frame-guide-done-btn { border-color: #44403c; color: #a8a29e; }
    .frame-guide-progress-bar { background: #44403c; }
    .skriv-frame-divider::before, .skriv-frame-divider::after { background: #44403c; }
    .frame-divider-label { color: #78716c; }
}

/* Mobile */
@media (max-width: 768px) {
    .skriv-frame-guide {
        width: 85vw;
        max-width: 320px;
    }
}
`;

export function initFrameGuide(editor, container, options = {}) {
    // options.onSave — callback to trigger auto-save
    let panel = null;
    let styleEl = null;
    let frameData = null;
    let frameType = null;
    let sectionStates = []; // { completed: boolean, expanded: boolean }[]
    let panelVisible = false;

    // Inject CSS
    styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    // --- Create panel structure ---
    panel = document.createElement('div');
    panel.className = 'skriv-frame-guide hidden';
    panel.innerHTML = `
        <div class="frame-guide-header">
            <span class="frame-guide-title"></span>
            <button class="frame-guide-close" title="Lukk">&times;</button>
        </div>
        <div class="frame-guide-progress">
            <div class="frame-guide-progress-bar"><div class="frame-guide-progress-fill"></div></div>
            <span class="frame-guide-progress-text"></span>
        </div>
        <div class="frame-guide-sections"></div>
    `;
    container.appendChild(panel);

    // --- Build sections from frame data ---
    function applyFrame(data, type) {
        frameData = data;
        frameType = type;
        sectionStates = data.sections.map(() => ({ completed: false, expanded: false }));
        // Expand first section by default
        if (sectionStates.length > 0) sectionStates[0].expanded = true;
        renderSections();
        updateProgress();
        show();
    }

    function renderSections() {
        const sectionsEl = panel.querySelector('.frame-guide-sections');
        sectionsEl.innerHTML = '';
        panel.querySelector('.frame-guide-title').textContent = frameData.name;

        frameData.sections.forEach((section, i) => {
            const state = sectionStates[i];
            const sectionEl = document.createElement('div');
            sectionEl.className = 'frame-guide-section' +
                (state.completed ? ' completed' : '') +
                (state.expanded ? ' expanded' : '');

            // Header (click to expand/collapse)
            const header = document.createElement('div');
            header.className = 'frame-guide-section-header';
            header.innerHTML = `
                <span class="frame-guide-section-arrow">${state.expanded ? '▼' : '▶'}</span>
                <span class="frame-guide-section-title">${section.title}</span>
                ${state.completed ? '<span class="frame-guide-check">✓</span>' : ''}
            `;
            header.addEventListener('click', () => {
                state.expanded = !state.expanded;
                renderSections();
                // If there's a divider for this section, scroll to it
                scrollToDivider(i);
            });

            // Content (instruction + subsections + prompts + done button)
            const content = document.createElement('div');
            content.className = 'frame-guide-section-content';
            if (!state.expanded) content.style.display = 'none';

            // Instruction
            if (section.instruction) {
                const instr = document.createElement('p');
                instr.className = 'frame-guide-instruction';
                instr.textContent = section.instruction;
                content.appendChild(instr);
            }

            // Subsections
            if (section.subsections && section.subsections.length > 0) {
                section.subsections.forEach(sub => {
                    const subEl = document.createElement('div');
                    subEl.className = 'frame-guide-subsection';
                    subEl.innerHTML = `<strong>${sub.title}</strong>`;
                    if (sub.instruction) {
                        const subInstr = document.createElement('p');
                        subInstr.className = 'frame-guide-sub-instruction';
                        subInstr.textContent = sub.instruction;
                        subEl.appendChild(subInstr);
                    }
                    // Subsection prompts
                    if (sub.prompts && sub.prompts.length > 0) {
                        sub.prompts.forEach(prompt => {
                            const btn = document.createElement('button');
                            btn.className = 'frame-guide-starter';
                            btn.textContent = prompt;
                            btn.title = 'Klikk for å sette inn';
                            btn.addEventListener('click', () => insertStarter(prompt));
                            subEl.appendChild(btn);
                        });
                    }
                    content.appendChild(subEl);
                });
            }

            // Section-level prompts
            if (section.prompts && section.prompts.length > 0) {
                section.prompts.forEach(prompt => {
                    const btn = document.createElement('button');
                    btn.className = 'frame-guide-starter';
                    btn.textContent = prompt;
                    btn.title = 'Klikk for å sette inn';
                    btn.addEventListener('click', () => insertStarter(prompt));
                    content.appendChild(btn);
                });
            }

            // Done button
            const doneBtn = document.createElement('button');
            doneBtn.className = 'frame-guide-done-btn' + (state.completed ? ' active' : '');
            doneBtn.textContent = state.completed ? '✓ Ferdig' : 'Merk som ferdig';
            doneBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                state.completed = !state.completed;
                if (state.completed) {
                    state.expanded = false;
                    insertDivider(i);
                    // Auto-expand next incomplete section
                    const nextIdx = sectionStates.findIndex((s, idx) => idx > i && !s.completed);
                    if (nextIdx !== -1) sectionStates[nextIdx].expanded = true;
                } else {
                    removeDivider(i);
                }
                renderSections();
                updateProgress();
                if (options.onSave) options.onSave();
            });
            content.appendChild(doneBtn);

            sectionEl.appendChild(header);
            sectionEl.appendChild(content);
            sectionsEl.appendChild(sectionEl);
        });
    }

    // --- Progress bar ---
    function updateProgress() {
        const completed = sectionStates.filter(s => s.completed).length;
        const total = sectionStates.length;
        const pct = total > 0 ? (completed / total) * 100 : 0;
        panel.querySelector('.frame-guide-progress-fill').style.width = `${pct}%`;
        panel.querySelector('.frame-guide-progress-text').textContent = `${completed}/${total} avsnitt`;
    }

    // --- Insert sentence starter at cursor ---
    function insertStarter(text) {
        editor.focus();
        document.execCommand('insertText', false, text);
        showToast(t('frame_starter_inserted') || 'Satt inn');
        if (options.onSave) options.onSave();
    }

    // --- Dividers in editor ---
    function insertDivider(sectionIndex) {
        const divider = document.createElement('div');
        divider.className = DIVIDER_CLASS;
        divider.contentEditable = 'false';
        divider.dataset.sectionIndex = sectionIndex;
        divider.dataset.sectionTitle = frameData.sections[sectionIndex].title;
        divider.innerHTML = `<span class="frame-divider-label">${frameData.sections[sectionIndex].title} ✓</span>`;

        // Find insertion point: after current block or at end of editor
        const sel = window.getSelection();
        let insertBefore = null;
        if (sel && sel.rangeCount > 0) {
            let node = sel.getRangeAt(0).startContainer;
            while (node && node !== editor && node.parentNode !== editor) {
                node = node.parentNode;
            }
            if (node && node !== editor) {
                insertBefore = node.nextSibling;
            }
        }

        if (insertBefore) {
            editor.insertBefore(divider, insertBefore);
        } else {
            editor.appendChild(divider);
        }

        // Ensure paragraph after divider for continued writing
        if (!divider.nextElementSibling) {
            const p = document.createElement('p');
            p.innerHTML = '<br>';
            editor.appendChild(p);
        }
    }

    function removeDivider(sectionIndex) {
        const divider = editor.querySelector(`.${DIVIDER_CLASS}[data-section-index="${sectionIndex}"]`);
        if (divider) divider.remove();
    }

    function scrollToDivider(sectionIndex) {
        const divider = editor.querySelector(`.${DIVIDER_CLASS}[data-section-index="${sectionIndex}"]`);
        if (divider) {
            divider.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }

    // --- Click divider in editor to open corresponding section in sidebar ---
    function handleEditorClick(e) {
        const divider = e.target.closest(`.${DIVIDER_CLASS}`);
        if (divider) {
            const idx = parseInt(divider.dataset.sectionIndex);
            if (!isNaN(idx) && sectionStates[idx]) {
                sectionStates[idx].expanded = true;
                renderSections();
            }
        }
    }
    editor.addEventListener('click', handleEditorClick);

    // --- Auto-detection: if student types a heading matching a section title ---
    function handleInput() {
        if (!frameData) return;
        const headings = editor.querySelectorAll('h1, h2, h3');
        headings.forEach(h => {
            const text = h.textContent.trim().toLowerCase();
            frameData.sections.forEach((section, i) => {
                if (text === section.title.toLowerCase() && !sectionStates[i].completed) {
                    sectionStates[i].expanded = true;
                }
            });
        });
    }
    editor.addEventListener('input', handleInput);

    // --- Show/hide panel ---
    function show() {
        panel.classList.remove('hidden');
        panelVisible = true;
        editor.style.marginLeft = '310px';
    }

    function hide() {
        panel.classList.add('hidden');
        panelVisible = false;
        editor.style.marginLeft = '';
    }

    function toggle() {
        panelVisible ? hide() : show();
    }

    // --- Remove frame entirely ---
    function removeFrame() {
        frameData = null;
        frameType = null;
        sectionStates = [];
        hide();
        // Remove all dividers from editor
        editor.querySelectorAll(`.${DIVIDER_CLASS}`).forEach(el => el.remove());
        if (options.onSave) options.onSave();
    }

    // Close button
    panel.querySelector('.frame-guide-close').addEventListener('click', toggle);

    // --- Getters ---
    function getActiveFrame() { return frameType; }
    function hasFrame() { return !!frameData; }
    function setActiveFrameType(type) { frameType = type; }

    // --- Rehydration: restore state from existing dividers in editor ---
    function rehydrate() {
        if (!frameData) return;
        const dividers = editor.querySelectorAll(`.${DIVIDER_CLASS}`);
        dividers.forEach(d => {
            const idx = parseInt(d.dataset.sectionIndex);
            if (!isNaN(idx) && sectionStates[idx]) {
                sectionStates[idx].completed = true;
                sectionStates[idx].expanded = false;
            }
        });
        if (dividers.length > 0) {
            renderSections();
            updateProgress();
        }
    }

    // --- Cleanup ---
    function destroy() {
        editor.removeEventListener('click', handleEditorClick);
        editor.removeEventListener('input', handleInput);
        if (panel) panel.remove();
        if (styleEl) styleEl.remove();
        editor.style.marginLeft = '';
    }

    return {
        destroy,
        applyFrame,
        removeFrame,
        getActiveFrame,
        hasFrame,
        setActiveFrameType,
        toggle,
        show,
        hide,
        rehydrate,
        getCleanText: () => {
            // Return editor text excluding dividers
            const clone = editor.cloneNode(true);
            clone.querySelectorAll(`.${DIVIDER_CLASS}`).forEach(el => el.remove());
            return clone.textContent || '';
        },
    };
}
