/**
 * Frame Guide Panel
 * Left-side accordion panel showing writing frame structure.
 * Students consult while writing, mark sections done, insert sentence starters.
 *
 * Eager-scaffold model: when a frame is applied, all section markers and
 * default paragraph slots are inserted into the editor up front and remain
 * visible while the guide is open. "Merk som ferdig" toggles state on the
 * existing marker. "+ Nytt avsnitt" appends extra paragraph slots within a
 * section. The writing-spinner word bank supplies on-demand starter variation
 * via "🎲 Flere forslag".
 */
import { t, getCurrentLanguage } from '../shared/i18n.js';
import { showToast } from '../shared/toast-notification.js';

const DIVIDER_CLASS = 'skriv-frame-divider';
const SECTION_MARKER_CLASS = 'section-marker';
const PARAGRAPH_MARKER_CLASS = 'paragraph-marker';
const SECTION_END_CLASS = 'section-end-marker';
const MAX_VISIBLE_STARTERS = 2;

const SCRAMBLE_CHARS = 'abcdefghijklmnoprstuvwxyzæøå';
const SCRAMBLE_DURATION = 500;

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
    margin: 0.4rem 0;
    padding-left: 0.5rem;
    border-left: 2px solid #d6d3d1;
}
.frame-guide-subsection-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    cursor: pointer;
    padding: 0.2rem 0.1rem;
    border-radius: 4px;
    transition: background 0.1s;
}
.frame-guide-subsection-header:hover {
    background: #f5f5f4;
}
.frame-guide-subsection-arrow {
    font-size: 0.55rem;
    color: #a8a29e;
    width: 10px;
    flex-shrink: 0;
}
.frame-guide-subsection strong {
    font-size: 0.8rem;
    color: #44403c;
}
.frame-guide-subsection-body {
    margin-top: 0.25rem;
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
/* "🎲 Flere forslag" button */
.frame-guide-spinner-btn {
    display: block;
    width: 100%;
    margin: 0.35rem 0 0.25rem;
    padding: 0.3rem 0.5rem;
    font-size: 0.72rem;
    color: #78716c;
    background: transparent;
    border: 1px dashed #d6d3d1;
    border-radius: 4px;
    cursor: pointer;
    transition: color 0.1s, border-color 0.1s;
}
.frame-guide-spinner-btn:hover {
    color: #059669;
    border-color: #a7f3d0;
}
.frame-guide-spinner-btn[disabled] {
    cursor: not-allowed;
    opacity: 0.6;
}

/* Done button */
.frame-guide-done-btn,
.frame-guide-add-paragraph-btn {
    display: block;
    width: 100%;
    margin-top: 0.4rem;
    padding: 0.4rem;
    font-size: 0.75rem;
    border: 1px dashed #d6d3d1;
    background: none;
    color: #78716c;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
}
.frame-guide-done-btn:hover,
.frame-guide-add-paragraph-btn:hover {
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
/* Hide dividers when the guide sidebar is collapsed — they're navigation
   markers tied to the guide, not document content. Kept in DOM so toggling
   the sidebar back restores them. */
.skriv-frame-guide-collapsed .skriv-frame-divider {
    display: none;
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
/* Section-start markers: prominent — these are the main wayfinding labels */
.skriv-frame-divider.section-marker {
    margin: 1.5em 0 0.75em;
}
.skriv-frame-divider.section-marker::before,
.skriv-frame-divider.section-marker::after {
    height: 3px;
    background: #78716c;
    border-radius: 2px;
}
.skriv-frame-divider.section-marker .frame-divider-label {
    font-size: 1rem;
    font-weight: 600;
    color: #44403c;
    padding: 0.25rem 1rem;
    letter-spacing: 0.01em;
}
/* Paragraph-level markers are slightly subtler than section markers */
.skriv-frame-divider.paragraph-marker .frame-divider-label {
    font-size: 0.6rem;
    color: #b7b3ad;
    font-style: italic;
}
/* Section-end marker: solid closing line, slightly subtler than the start */
.skriv-frame-divider.section-end-marker {
    margin: 0.25em 0 1.5em;
    cursor: default;
}
.skriv-frame-divider.section-end-marker::before,
.skriv-frame-divider.section-end-marker::after {
    background: #a8a29e;
    height: 2px;
    border-radius: 2px;
}
.skriv-frame-divider.section-end-marker .frame-divider-label {
    font-size: 0.7rem;
    color: #a8a29e;
    padding: 0 0.6rem;
}
.skriv-frame-divider.section-end-marker:hover .frame-divider-label {
    color: #a8a29e;  /* don't highlight on hover - it's not interactive */
}
/* End marker reflects parent section's state */
.skriv-frame-divider.section-end-marker.is-completed::before,
.skriv-frame-divider.section-end-marker.is-completed::after {
    background: #34d399;
}
.skriv-frame-divider.section-end-marker.is-completed .frame-divider-label {
    color: #059669;
}
.skriv-frame-divider.section-end-marker.is-on-hold::before,
.skriv-frame-divider.section-end-marker.is-on-hold::after {
    background: #fbbf24;
}
.skriv-frame-divider.section-end-marker.is-on-hold .frame-divider-label {
    color: #d97706;
}
/* Completed section marker */
.skriv-frame-divider.section-marker.is-completed .frame-divider-label {
    color: #059669;
}
.skriv-frame-divider.section-marker.is-completed::before,
.skriv-frame-divider.section-marker.is-completed::after {
    background: #34d399;
}
/* On-hold section marker: student moved away without marking done */
.skriv-frame-divider.section-marker.is-on-hold .frame-divider-label {
    color: #d97706;
}
.skriv-frame-divider.section-marker.is-on-hold .frame-divider-label::after {
    content: ' ⏸';
    font-size: 0.7em;
    margin-left: 0.15em;
}
.skriv-frame-divider.section-marker.is-on-hold::before,
.skriv-frame-divider.section-marker.is-on-hold::after {
    background: #fcd34d;
}
/* On-hold sidebar header */
.frame-guide-section.on-hold .frame-guide-section-title {
    color: #b45309;
}
.frame-guide-section.on-hold .frame-guide-on-hold-icon {
    color: #d97706;
    font-weight: bold;
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
    .frame-guide-done-btn,
    .frame-guide-add-paragraph-btn,
    .frame-guide-spinner-btn { border-color: #44403c; color: #a8a29e; }
    .frame-guide-progress-bar { background: #44403c; }
    .skriv-frame-divider::before, .skriv-frame-divider::after { background: #44403c; }
    .frame-divider-label { color: #78716c; }
    .skriv-frame-divider.paragraph-marker .frame-divider-label { color: #57534e; }
    .skriv-frame-divider.section-marker.is-completed::before,
    .skriv-frame-divider.section-marker.is-completed::after { background: #065f46; }
}

/* Mobile */
@media (max-width: 768px) {
    .skriv-frame-guide {
        width: 85vw;
        max-width: 320px;
    }
}
`;

// --- Spinner word-bank loading (shared semantics with writing-spinner) ---
async function loadSpinnerStarters() {
    const lang = getCurrentLanguage();
    try {
        const mod = lang === 'nn'
            ? await import('./spinner-data-nn.js')
            : await import('./spinner-data-nb.js');
        return mod.starters || {};
    } catch (err) {
        console.error('Failed to load spinner starters:', err);
        return {};
    }
}

function levelToTier(level) {
    return (level === 'ungdomsskole' || level === 'barneskole') ? 'us' : 'vgs';
}

function escapeHtml(s) {
    return String(s)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

// --- Scramble animation for spinner-generated starters ---
function scrambleReveal(el, finalText, onDone) {
    const len = finalText.length;
    const startTime = Date.now();

    function tick() {
        const elapsed = Date.now() - startTime;
        const resolved = Math.min(len, Math.floor((elapsed / SCRAMBLE_DURATION) * len));
        let display = '';
        for (let i = 0; i < len; i++) {
            if (i < resolved) display += finalText[i];
            else if (finalText[i] === ' ') display += ' ';
            else display += SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
        }
        el.textContent = display;
        if (resolved < len) {
            requestAnimationFrame(tick);
        } else {
            el.textContent = finalText;
            if (onDone) onDone();
        }
    }
    requestAnimationFrame(tick);
}

export function initFrameGuide(editor, container, options = {}) {
    // options.onSave — callback to trigger auto-save
    // options.getLevel — () => school level (for spinner integration)
    let panel = null;
    let styleEl = null;
    let frameData = null;
    let frameType = null;
    let sectionStates = []; // { completed, expanded, onHold, starters }
    let panelVisible = false;
    let lastRange = null;
    let starterDataPromise = null;
    let activeSectionIndex = -1;
    // Per-scope (section[/subsection]) history of recently shown spinner starters
    // so consecutive "More suggestions" clicks return different results until the
    // bucket is exhausted, then the history resets.
    const spinnerHistory = new Map(); // key: `${sectionIndex}:${subsectionIndex}` → string[]

    // Inject CSS
    styleEl = document.createElement('style');
    styleEl.textContent = CSS;
    document.head.appendChild(styleEl);

    // --- Selection capture: store the editor's last known range ---
    function handleSelectionChange() {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (editor.contains(range.startContainer)) {
            lastRange = range.cloneRange();
            updateActiveSection();
        }
    }
    document.addEventListener('selectionchange', handleSelectionChange);

    // --- Active-section tracking: detect when caret moves between sections.
    // When student leaves a non-completed section without marking done, that
    // section enters "on-hold" (amber). Entering a section clears its on-hold.
    function updateActiveSection() {
        if (!frameData || sectionStates.length === 0) return;
        const newActive = getSectionIndexFromRange(lastRange);
        if (newActive === activeSectionIndex) return;
        const prev = activeSectionIndex;
        activeSectionIndex = newActive;

        // Mark the section we just left as on-hold (unless completed)
        if (prev >= 0 && sectionStates[prev] && !sectionStates[prev].completed && !sectionStates[prev].onHold) {
            sectionStates[prev].onHold = true;
            updateSectionMarkerVisuals(prev);
        }
        // Manage state for the section we just entered
        if (newActive >= 0 && sectionStates[newActive]) {
            if (sectionStates[newActive].onHold) {
                sectionStates[newActive].onHold = false;
                updateSectionMarkerVisuals(newActive);
            }
            // Auto-expand the newly active section in the sidebar accordion
            sectionStates.forEach((s, idx) => {
                s.expanded = (idx === newActive);
            });
        }
        renderSections();
    }

    function updateSectionMarkerVisuals(sectionIndex) {
        const state = sectionStates[sectionIndex];
        if (!state) return;
        const primary = editor.querySelector(
            `.${SECTION_MARKER_CLASS}[data-section-index="${sectionIndex}"][data-paragraph-index="0"]`
        );
        const end = editor.querySelector(
            `.${SECTION_END_CLASS}[data-section-index="${sectionIndex}"]`
        );
        const onHold = !!state.onHold && !state.completed;
        const completed = !!state.completed;
        [primary, end].forEach(el => {
            if (!el) return;
            el.classList.toggle('is-on-hold', onHold);
            el.classList.toggle('is-completed', completed);
        });
    }

    // --- Panel structure ---
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

    // --- Slot/label helpers ---
    function getDefaultSlotCount(/* sectionIndex */) {
        // One paragraph per section by default. Students extend with
        // "+ Nytt avsnitt" as needed.
        return 1;
    }

    function getDefaultSlotLabel(sectionIndex, paragraphIndex) {
        const section = frameData.sections[sectionIndex];
        const slotCount = getDefaultSlotCount(sectionIndex);
        if (slotCount === 1) return section.title;
        return `${section.title} — ${t('skriv.frameGuideParagraphSuffix')} ${paragraphIndex + 1}`;
    }

    function makeMarker({ sectionIndex, paragraphIndex, label, isSection, completed = false }) {
        const div = document.createElement('div');
        div.className = `${DIVIDER_CLASS} ${isSection ? SECTION_MARKER_CLASS : PARAGRAPH_MARKER_CLASS}`;
        if (isSection && completed) div.classList.add('is-completed');
        div.contentEditable = 'false';
        div.dataset.sectionIndex = String(sectionIndex);
        div.dataset.paragraphIndex = String(paragraphIndex);
        div.dataset.sectionTitle = frameData.sections[sectionIndex].title;
        if (isSection) div.dataset.completed = completed ? 'true' : 'false';
        div.innerHTML = `<span class="frame-divider-label">${escapeHtml(label)}</span>`;
        return div;
    }

    function makeParagraphSlot() {
        const p = document.createElement('p');
        p.innerHTML = '<br>';
        return p;
    }

    function isEmptyPlaceholderBlock(el) {
        if (!el) return false;
        if (el.nodeType !== Node.ELEMENT_NODE) return false;
        if (el.tagName !== 'P' && el.tagName !== 'DIV') return false;
        if (el.classList.contains(DIVIDER_CLASS)) return false;
        const html = el.innerHTML.replace(/<br\s*\/?>/gi, '').trim();
        return html === '';
    }

    function isEditorEffectivelyEmpty() {
        if (editor.children.length === 0) return true;
        return [...editor.children].every(c => isEmptyPlaceholderBlock(c));
    }

    // --- Eager scaffold: insert all section/paragraph markers + slots ---
    function scaffoldEditor() {
        const fragment = document.createDocumentFragment();
        frameData.sections.forEach((section, sectionIndex) => {
            const slotCount = getDefaultSlotCount(sectionIndex);
            for (let pIdx = 0; pIdx < slotCount; pIdx++) {
                const isSectionMarker = pIdx === 0;
                fragment.appendChild(makeMarker({
                    sectionIndex,
                    paragraphIndex: pIdx,
                    label: getDefaultSlotLabel(sectionIndex, pIdx),
                    isSection: isSectionMarker,
                }));
                fragment.appendChild(makeParagraphSlot());
            }
            // Section-end marker: subtle line that closes off the section
            // so the boundary between sections is unambiguous.
            fragment.appendChild(makeSectionEndMarker(sectionIndex));
        });

        if (isEditorEffectivelyEmpty()) {
            editor.innerHTML = '';
            editor.appendChild(fragment);
        } else {
            editor.insertBefore(fragment, editor.firstChild);
        }
    }

    function makeSectionEndMarker(sectionIndex) {
        const div = document.createElement('div');
        div.className = `${DIVIDER_CLASS} ${SECTION_END_CLASS}`;
        div.contentEditable = 'false';
        div.dataset.sectionIndex = String(sectionIndex);
        div.dataset.sectionEnd = 'true';
        div.innerHTML = '<span class="frame-divider-label">↑</span>';
        return div;
    }

    // --- Build sections in sidebar ---
    function applyFrame(data, type) {
        frameData = data;
        frameType = type;
        sectionStates = data.sections.map(s => ({
            completed: false,
            expanded: false,
            onHold: false,
            // Sliding window of currently-displayed starters per scope (max 2).
            // Initial fill comes from markdown-authored prompts; each spinner
            // roll appends a new pick and trims the oldest, so the user
            // always sees at most 2 alternatives — top one slides out as new
            // ones come in.
            starters: {
                section: (s.prompts || []).slice(0, MAX_VISIBLE_STARTERS),
                subsections: (s.subsections || []).map(sub =>
                    (sub.prompts || []).slice(0, MAX_VISIBLE_STARTERS)
                ),
            },
            // Accordion state per subsection — closed by default; clicking
            // a subsection title opens it and closes any other open one
            // within the same section.
            subsectionExpanded: (s.subsections || []).map(() => false),
        }));
        activeSectionIndex = -1;
        spinnerHistory.clear();
        if (sectionStates.length > 0) sectionStates[0].expanded = true;

        // Eagerly scaffold dividers if editor has none yet
        if (!editor.querySelector(`.${DIVIDER_CLASS}`)) {
            scaffoldEditor();
        }

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
                (state.expanded ? ' expanded' : '') +
                (state.onHold && !state.completed ? ' on-hold' : '');

            // Header (click to expand/collapse)
            const header = document.createElement('div');
            header.className = 'frame-guide-section-header';
            const indicator = state.completed
                ? '<span class="frame-guide-check">✓</span>'
                : (state.onHold ? '<span class="frame-guide-on-hold-icon">⏸</span>' : '');
            header.innerHTML = `
                <span class="frame-guide-section-arrow">${state.expanded ? '▼' : '▶'}</span>
                <span class="frame-guide-section-title">${escapeHtml(section.title)}</span>
                ${indicator}
            `;
            header.addEventListener('click', () => {
                const willExpand = !state.expanded;
                if (willExpand) {
                    // Accordion: opening this section closes any other expanded section
                    sectionStates.forEach((s, idx) => {
                        if (idx !== i) s.expanded = false;
                    });
                }
                state.expanded = willExpand;
                renderSections();
                scrollToSectionMarker(i);
            });

            // Content (instruction + subsections + prompts + buttons)
            const content = document.createElement('div');
            content.className = 'frame-guide-section-content';
            if (!state.expanded) content.style.display = 'none';

            // Section instruction
            if (section.instruction) {
                const instr = document.createElement('p');
                instr.className = 'frame-guide-instruction';
                instr.textContent = section.instruction;
                content.appendChild(instr);
            }

            // Subsections — collapsed by default, accordion within section
            if (section.subsections && section.subsections.length > 0) {
                section.subsections.forEach((sub, subIdx) => {
                    const subExpanded = !!state.subsectionExpanded[subIdx];
                    const subEl = document.createElement('div');
                    subEl.className = 'frame-guide-subsection' + (subExpanded ? ' expanded' : '');

                    // Clickable title row
                    const subHeader = document.createElement('div');
                    subHeader.className = 'frame-guide-subsection-header';
                    subHeader.innerHTML = `
                        <span class="frame-guide-subsection-arrow">${subExpanded ? '▼' : '▶'}</span>
                        <strong>${escapeHtml(sub.title)}</strong>
                    `;
                    subHeader.addEventListener('click', () => {
                        const willExpand = !state.subsectionExpanded[subIdx];
                        if (willExpand) {
                            // Accordion: opening this subsection closes others in this section
                            state.subsectionExpanded = state.subsectionExpanded.map(() => false);
                        }
                        state.subsectionExpanded[subIdx] = willExpand;
                        renderSections();
                    });
                    subEl.appendChild(subHeader);

                    // Body (instruction + starters + spinner) — only when expanded
                    if (subExpanded) {
                        const subBody = document.createElement('div');
                        subBody.className = 'frame-guide-subsection-body';
                        if (sub.instruction) {
                            const subInstr = document.createElement('p');
                            subInstr.className = 'frame-guide-sub-instruction';
                            subInstr.textContent = sub.instruction;
                            subBody.appendChild(subInstr);
                        }
                        (state.starters.subsections[subIdx] || []).forEach(text => {
                            subBody.appendChild(makeStarterButton(text, i, subIdx));
                        });
                        if (sub.spinnerBucket) {
                            subBody.appendChild(makeSpinnerButton({
                                sectionIndex: i,
                                subsectionIndex: subIdx,
                                bucket: sub.spinnerBucket,
                            }));
                        }
                        subEl.appendChild(subBody);
                    }

                    content.appendChild(subEl);
                });
            }

            // Currently-visible section-level starters (sliding window)
            (state.starters.section || []).forEach(text => {
                content.appendChild(makeStarterButton(text, i, -1));
            });
            // 🎲 Flere forslag (section-level) — only when section has no subsections,
            // since subsection-level buttons cover the multi-bucket case.
            if ((!section.subsections || section.subsections.length === 0) && section.spinnerBucket) {
                content.appendChild(makeSpinnerButton({
                    sectionIndex: i,
                    subsectionIndex: -1,
                    bucket: section.spinnerBucket,
                }));
            }

            // Done button
            const doneBtn = document.createElement('button');
            doneBtn.className = 'frame-guide-done-btn' + (state.completed ? ' active' : '');
            doneBtn.textContent = state.completed
                ? t('skriv.frameGuideMarkDoneActive')
                : t('skriv.frameGuideMarkDone');
            doneBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                state.completed = !state.completed;
                if (state.completed) state.onHold = false;
                const primary = editor.querySelector(
                    `.${SECTION_MARKER_CLASS}[data-section-index="${i}"][data-paragraph-index="0"]`
                );
                if (primary) {
                    primary.dataset.completed = state.completed ? 'true' : 'false';
                }
                updateSectionMarkerVisuals(i);
                if (state.completed) {
                    state.expanded = false;
                    const nextIdx = sectionStates.findIndex((s, idx) => idx > i && !s.completed);
                    if (nextIdx !== -1) sectionStates[nextIdx].expanded = true;
                }
                renderSections();
                updateProgress();
                if (options.onSave) options.onSave();
            });
            content.appendChild(doneBtn);

            // + Nytt avsnitt button (only for non-completed sections)
            if (!state.completed) {
                const addBtn = document.createElement('button');
                addBtn.className = 'frame-guide-add-paragraph-btn';
                addBtn.textContent = t('skriv.frameGuideAddParagraph');
                addBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    addParagraphToSection(i);
                });
                content.appendChild(addBtn);
            }

            sectionEl.appendChild(header);
            sectionEl.appendChild(content);
            sectionsEl.appendChild(sectionEl);
        });
    }

    function makeStarterButton(text, sourceSectionIndex, sourceSubsectionIndex) {
        const btn = document.createElement('button');
        btn.className = 'frame-guide-starter';
        btn.textContent = text;
        btn.title = 'Klikk for å sette inn';
        btn.addEventListener('click', () => insertStarter(text, sourceSectionIndex, sourceSubsectionIndex));
        return btn;
    }

    function makeSpinnerButton({ sectionIndex, subsectionIndex, bucket }) {
        const btn = document.createElement('button');
        btn.className = 'frame-guide-spinner-btn';
        btn.textContent = t('skriv.frameGuideMoreSuggestions');
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const text = await pickSpinnerStarter({ sectionIndex, subsectionIndex, bucket });
            if (!text) {
                btn.disabled = true;
                btn.textContent = t('skriv.frameGuideNoMoreSuggestions');
                return;
            }

            // Sliding window: append new pick, trim oldest so we never show
            // more than MAX_VISIBLE_STARTERS at this scope. Top alternative
            // is "thrown out", second moves up, new one fills the bottom.
            const state = sectionStates[sectionIndex];
            const list = subsectionIndex >= 0
                ? state.starters.subsections[subsectionIndex]
                : state.starters.section;
            list.push(text);
            while (list.length > MAX_VISIBLE_STARTERS) list.shift();

            // Re-render the starter buttons in this scope: clear all
            // existing starter buttons, re-insert from state.
            const parent = btn.parentNode;
            parent.querySelectorAll('.frame-guide-starter').forEach(el => el.remove());
            list.forEach((s, idx) => {
                const newBtn = makeStarterButton(s, sectionIndex, subsectionIndex);
                parent.insertBefore(newBtn, btn);
                if (idx === list.length - 1) {
                    // Animate only the newly-added one
                    newBtn.textContent = '';
                    scrambleReveal(newBtn, s);
                }
            });
        });
        return btn;
    }

    // --- Spinner helpers ---
    function ensureSpinnerData() {
        if (!starterDataPromise) {
            starterDataPromise = loadSpinnerStarters();
        }
        return starterDataPromise;
    }

    async function pickSpinnerStarter({ sectionIndex, subsectionIndex, bucket }) {
        if (!frameType) return null;
        const starters = await ensureSpinnerData();
        const tier = levelToTier(options.getLevel?.() || 'ungdomsskole');
        const genreData = starters[frameType] || starters.generell;
        if (!genreData) return null;
        const tierData = genreData[tier] || genreData.us;
        if (!tierData) return null;

        // Track shown history per scope (independent of what's currently
        // displayed) so consecutive clicks return different results.
        const historyKey = `${sectionIndex}:${subsectionIndex}`;
        let history = spinnerHistory.get(historyKey) || [];

        // Authored prompts at the same scope are also excluded so we don't
        // echo what the markdown already provides.
        const sectionData = frameData.sections[sectionIndex];
        const authored = subsectionIndex >= 0
            ? (sectionData.subsections[subsectionIndex].prompts || [])
            : (sectionData.prompts || []);

        // Try the requested bucket first, then fall back to other buckets in
        // the same genre. Different genres use different bucket-name
        // conventions (analyse: innledning/hoveddel/…, novelle: aapning/
        // skildring/…), so the position-default may not match a real bucket.
        const requested = bucket && tierData[bucket] ? [bucket] : [];
        const others = Object.keys(tierData).filter(b => b !== bucket);

        for (let attempt = 0; attempt < 2; attempt++) {
            const used = new Set([...history, ...authored]);
            for (const b of [...requested, ...others]) {
                const pool = tierData[b];
                if (!pool || pool.length === 0) continue;
                const available = pool.filter(s => !used.has(s));
                if (available.length === 0) continue;
                const pick = available[Math.floor(Math.random() * available.length)];
                history.push(pick);
                spinnerHistory.set(historyKey, history);
                return pick;
            }
            // Exhausted: reset history (keep just the most recent to avoid an
            // immediate repeat) and try again.
            history = history.length > 0 ? [history[history.length - 1]] : [];
        }
        return null;
    }

    // --- Progress bar ---
    function updateProgress() {
        const completed = sectionStates.filter(s => s.completed).length;
        const total = sectionStates.length;
        const pct = total > 0 ? (completed / total) * 100 : 0;
        panel.querySelector('.frame-guide-progress-fill').style.width = `${pct}%`;
        panel.querySelector('.frame-guide-progress-text').textContent = `${completed}/${total} avsnitt`;
    }

    // --- Section navigation in editor ---
    function findNearestPrecedingMarker(range) {
        if (!range) return null;
        let node = range.startContainer;
        if (node.nodeType === Node.TEXT_NODE) node = node.parentNode;
        while (node && node.parentNode !== editor) {
            node = node.parentNode;
        }
        if (!node) return null;
        let prev = node.classList && node.classList.contains(DIVIDER_CLASS)
            ? node
            : node.previousElementSibling;
        while (prev) {
            if (prev.classList && prev.classList.contains(DIVIDER_CLASS) &&
                prev.dataset.sectionIndex !== undefined) {
                return prev;
            }
            prev = prev.previousElementSibling;
        }
        return null;
    }

    function getSectionIndexFromRange(range) {
        const marker = findNearestPrecedingMarker(range);
        return marker ? parseInt(marker.dataset.sectionIndex) : -1;
    }

    function getParagraphIndexFromRange(range) {
        const marker = findNearestPrecedingMarker(range);
        return marker ? parseInt(marker.dataset.paragraphIndex) : -1;
    }

    /**
     * Place caret at end of the paragraph slot belonging to a specific
     * (sectionIndex, paragraphIndex). Returns true if successful.
     */
    function placeCaretAtSlot(sectionIndex, paragraphIndex) {
        const marker = editor.querySelector(
            `.${DIVIDER_CLASS}[data-section-index="${sectionIndex}"][data-paragraph-index="${paragraphIndex}"]`
        );
        if (!marker) return false;
        let target = marker.nextElementSibling;
        while (target && target.classList && target.classList.contains(DIVIDER_CLASS)) {
            target = target.nextElementSibling;
        }
        if (!target) return false;

        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);

        editor.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        lastRange = range.cloneRange();
        return true;
    }

    function scrollToSectionMarker(sectionIndex) {
        const marker = editor.querySelector(
            `.${SECTION_MARKER_CLASS}[data-section-index="${sectionIndex}"]`
        );
        if (marker) marker.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // --- Insert sentence starter ---
    // sourceSubsectionIndex is accepted for signature stability but no longer
    // affects caret targeting: subsections are sidebar guidance now, not
    // editor slots, so all prompts (subsection-derived or section-level)
    // target the source section. If the cursor is already in that section
    // we use it; otherwise we jump to the section's first slot.
    function insertStarter(text, sourceSectionIndex /*, sourceSubsectionIndex */) {
        const currentSection = lastRange ? getSectionIndexFromRange(lastRange) : -1;
        const needsJump = sourceSectionIndex !== undefined &&
                          sourceSectionIndex !== -1 &&
                          currentSection !== sourceSectionIndex;

        if (needsJump) {
            if (!placeCaretAtSlot(sourceSectionIndex, 0)) {
                editor.focus();
            }
        } else {
            editor.focus();
            if (lastRange && editor.contains(lastRange.startContainer)) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(lastRange);
            }
        }
        document.execCommand('insertText', false, text);
        showToast(t('frame_starter_inserted') || 'Satt inn');
        if (options.onSave) options.onSave();
    }

    // --- + Nytt avsnitt: add a paragraph slot inside a section ---
    function addParagraphToSection(sectionIndex) {
        const existingMarkers = editor.querySelectorAll(
            `.${DIVIDER_CLASS}[data-section-index="${sectionIndex}"]:not(.${SECTION_END_CLASS})`
        );
        const newParagraphIndex = existingMarkers.length;
        const newLabel = `${frameData.sections[sectionIndex].title} — ${t('skriv.frameGuideParagraphSuffix')} ${newParagraphIndex + 1}`;
        const newMarker = makeMarker({
            sectionIndex,
            paragraphIndex: newParagraphIndex,
            label: newLabel,
            isSection: false,
        });
        const newSlot = makeParagraphSlot();

        // Insert before this section's end marker (preferred), else before
        // the next section's start marker, else at end of editor.
        const sectionEnd = editor.querySelector(
            `.${SECTION_END_CLASS}[data-section-index="${sectionIndex}"]`
        );
        const nextSection = editor.querySelector(
            `.${SECTION_MARKER_CLASS}[data-section-index="${sectionIndex + 1}"]`
        );
        const insertBefore = sectionEnd || nextSection;
        if (insertBefore) {
            editor.insertBefore(newMarker, insertBefore);
            editor.insertBefore(newSlot, insertBefore);
        } else {
            editor.appendChild(newMarker);
            editor.appendChild(newSlot);
        }

        // Place caret in the new empty paragraph
        const range = document.createRange();
        range.selectNodeContents(newSlot);
        range.collapse(true);
        editor.focus();
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        lastRange = range.cloneRange();

        if (options.onSave) options.onSave();
    }

    // --- Click marker in editor → expand corresponding section in sidebar ---
    function handleEditorClick(e) {
        const divider = e.target.closest(`.${DIVIDER_CLASS}`);
        if (divider && divider.dataset.sectionIndex !== undefined) {
            const idx = parseInt(divider.dataset.sectionIndex);
            if (!isNaN(idx) && sectionStates[idx]) {
                sectionStates[idx].expanded = true;
                renderSections();
            }
        }
    }
    editor.addEventListener('click', handleEditorClick);

    // --- Auto-detection: heading matches a section title + sidebar sync ---
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

        const sIdx = getSectionIndexFromRange(lastRange);
        if (sIdx < 0 || !sectionStates[sIdx]) return;
        const state = sectionStates[sIdx];

        let needsRender = false;
        let needsSave = false;

        // Typing inside a completed section reverts it to "in progress" so
        // the "Mark as done" affordance returns.
        if (state.completed) {
            state.completed = false;
            const primary = editor.querySelector(
                `.${SECTION_MARKER_CLASS}[data-section-index="${sIdx}"][data-paragraph-index="0"]`
            );
            if (primary) primary.dataset.completed = 'false';
            updateSectionMarkerVisuals(sIdx);
            needsRender = true;
            needsSave = true;
        }

        // Accordion sidebar sync: typing in a section opens it in the
        // sidebar and closes whatever was previously open. Skip when this
        // section is already the sole-expanded one.
        const someoneElseOpen = sectionStates.some((s, i) => i !== sIdx && s.expanded);
        if (!state.expanded || someoneElseOpen) {
            sectionStates.forEach((s, i) => { s.expanded = (i === sIdx); });
            needsRender = true;
        }

        if (needsRender) {
            renderSections();
            updateProgress();
            if (needsSave && options.onSave) options.onSave();
        }
    }
    editor.addEventListener('input', handleInput);

    // --- Show/hide panel ---
    function show() {
        panel.classList.remove('hidden');
        panelVisible = true;
        editor.style.marginLeft = '310px';
        editor.classList.remove('skriv-frame-guide-collapsed');
    }

    function hide() {
        panel.classList.add('hidden');
        panelVisible = false;
        editor.style.marginLeft = '';
        editor.classList.add('skriv-frame-guide-collapsed');
    }

    function isVisible() { return panelVisible; }

    function toggle() { panelVisible ? hide() : show(); }

    // --- Remove frame entirely ---
    function removeFrame() {
        frameData = null;
        frameType = null;
        sectionStates = [];
        hide();
        // Remove each divider plus the empty <p> slot that immediately follows it.
        // This cleans up unused scaffold slots while preserving any paragraph
        // the student actually wrote into.
        editor.querySelectorAll(`.${DIVIDER_CLASS}`).forEach(el => {
            const next = el.nextElementSibling;
            if (next && isEmptyPlaceholderBlock(next)) next.remove();
            el.remove();
        });
        editor.classList.remove('skriv-frame-guide-collapsed');
        if (options.onSave) options.onSave();
    }

    // Close button
    panel.querySelector('.frame-guide-close').addEventListener('click', toggle);

    // --- Getters ---
    function getActiveFrame() { return frameType; }
    function hasFrame() { return !!frameData; }
    function setActiveFrameType(type) { frameType = type; }

    // --- Rehydrate state from existing dividers in editor ---
    function rehydrate() {
        if (!frameData) return;
        const dividers = editor.querySelectorAll(`.${DIVIDER_CLASS}`);

        if (dividers.length === 0) {
            // No markers — scaffold now
            scaffoldEditor();
            renderSections();
            updateProgress();
            return;
        }

        // Detect new model: at least one divider has data-paragraph-index set
        const newModel = Array.from(dividers).some(d => d.dataset.paragraphIndex !== undefined);

        if (newModel) {
            dividers.forEach(d => {
                const sIdx = parseInt(d.dataset.sectionIndex);
                const pIdx = parseInt(d.dataset.paragraphIndex);
                if (!isNaN(sIdx) && sectionStates[sIdx]) {
                    if (d.classList.contains(SECTION_MARKER_CLASS)) {
                        const completed = d.dataset.completed === 'true';
                        sectionStates[sIdx].completed = completed;
                        if (completed) sectionStates[sIdx].expanded = false;
                    }
                    // Skip label re-derive for end markers
                    if (d.classList.contains(SECTION_END_CLASS)) return;
                    // Re-derive label using the current rule. Migrates older
                    // saved docs (subsection-derived labels) to generic
                    // numbering on load. Cheap & idempotent.
                    if (!isNaN(pIdx)) {
                        const slotCount = getDefaultSlotCount(sIdx);
                        const newLabel = pIdx < slotCount
                            ? getDefaultSlotLabel(sIdx, pIdx)
                            : `${frameData.sections[sIdx].title} — ${t('skriv.frameGuideParagraphSuffix')} ${pIdx + 1}`;
                        const labelEl = d.querySelector('.frame-divider-label');
                        if (labelEl) labelEl.textContent = newLabel;
                    }
                } else {
                    d.remove();
                }
            });
            // Migrate: insert any missing section-end markers (for docs saved
            // before section-end markers existed).
            frameData.sections.forEach((_, sIdx) => {
                if (editor.querySelector(`.${SECTION_END_CLASS}[data-section-index="${sIdx}"]`)) return;
                const nextSectionStart = editor.querySelector(
                    `.${SECTION_MARKER_CLASS}[data-section-index="${sIdx + 1}"]`
                );
                const endMarker = makeSectionEndMarker(sIdx);
                if (nextSectionStart) {
                    editor.insertBefore(endMarker, nextSectionStart);
                } else {
                    editor.appendChild(endMarker);
                }
            });
            // Sync visuals (completed state) onto every section's end marker
            // so they match the start marker's color.
            frameData.sections.forEach((_, sIdx) => updateSectionMarkerVisuals(sIdx));
        } else {
            // Legacy model: each divider == a completed section marker
            dividers.forEach(d => {
                const idx = parseInt(d.dataset.sectionIndex);
                if (!isNaN(idx) && sectionStates[idx]) {
                    sectionStates[idx].completed = true;
                    sectionStates[idx].expanded = false;
                } else {
                    d.remove();
                }
            });
        }
        renderSections();
        updateProgress();
    }

    // --- Cleanup ---
    function destroy() {
        document.removeEventListener('selectionchange', handleSelectionChange);
        editor.removeEventListener('click', handleEditorClick);
        editor.removeEventListener('input', handleInput);
        if (panel) panel.remove();
        if (styleEl) styleEl.remove();
        editor.style.marginLeft = '';
        editor.classList.remove('skriv-frame-guide-collapsed');
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
        isVisible,
        rehydrate,
        getCleanText: () => {
            const clone = editor.cloneNode(true);
            clone.querySelectorAll(`.${DIVIDER_CLASS}`).forEach(el => el.remove());
            return clone.textContent || '';
        },
    };
}
