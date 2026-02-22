/**
 * Frame Manager
 *
 * Manages the lifecycle of a writing frame inside the editor:
 *  - applyFrame(): Inserts section headers + ghost prompts into the editor
 *  - removeFrame(): Strips scaffold, keeps student-written text
 *  - Prompt click handler: select-all on click so student can type to replace
 *  - Prompt input handler: removes ghost styling once student types
 *  - Rehydration: re-attaches handlers on page reload
 *
 * Frame DOM structure:
 *   [div.skriv-frame-section contenteditable=false]  ← section header
 *     [p.frame-section-title] "Innledning"
 *     [p.frame-section-instruction] "Presenter temaet..."
 *   [p.skriv-frame-prompt data-frame-original="..."]  ← editable ghost text
 *   ...
 *   [div.skriv-frame-subsection contenteditable=false] ← subsection header
 *     [p.frame-subsection-title] "Påstå"
 *   [p.skriv-frame-prompt data-frame-original="..."]   ← editable ghost text
 */

/**
 * Initialize the frame manager for a given editor element.
 * @param {HTMLElement} editor - The contenteditable element
 * @param {{ onSave?: () => void }} options
 * @returns {{ applyFrame, removeFrame, getActiveFrame, hasFrame, setActiveFrameType, getCleanText, destroy }}
 */
export function initFrameManager(editor, options = {}) {
    const { onSave } = options;
    let activeFrameType = null;

    // --- Build DOM from parsed frame data ---

    /**
     * Apply a frame to the editor.
     * @param {{ name: string, meta: object, sections: Array }} frameData - Parsed frame object
     * @param {string} frameType - Frame identifier (e.g. 'droefting')
     */
    function applyFrame(frameData, frameType) {
        const frag = document.createDocumentFragment();

        for (const section of frameData.sections) {
            // Section header (non-editable)
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'skriv-frame-section';
            sectionDiv.contentEditable = 'false';

            const titleP = document.createElement('p');
            titleP.className = 'frame-section-title';
            titleP.textContent = section.title;
            sectionDiv.appendChild(titleP);

            if (section.instruction) {
                const instrP = document.createElement('p');
                instrP.className = 'frame-section-instruction';
                instrP.textContent = section.instruction;
                sectionDiv.appendChild(instrP);
            }

            frag.appendChild(sectionDiv);

            // Section-level prompts
            for (const prompt of section.prompts) {
                frag.appendChild(createPromptParagraph(prompt));
            }

            // Subsections
            for (const sub of section.subsections) {
                const subDiv = document.createElement('div');
                subDiv.className = 'skriv-frame-subsection';
                subDiv.contentEditable = 'false';

                const subTitle = document.createElement('p');
                subTitle.className = 'frame-subsection-title';
                subTitle.textContent = sub.title;
                subDiv.appendChild(subTitle);

                if (sub.instruction) {
                    const subInstr = document.createElement('p');
                    subInstr.className = 'frame-section-instruction';
                    subInstr.textContent = sub.instruction;
                    subDiv.appendChild(subInstr);
                }

                frag.appendChild(subDiv);

                for (const prompt of sub.prompts) {
                    frag.appendChild(createPromptParagraph(prompt));
                }
            }
        }

        // Insert the frame. If editor is "empty" (just <p><br></p>), replace content.
        const isEmpty = isEditorEmpty();
        if (isEmpty) {
            editor.innerHTML = '';
        }

        editor.appendChild(frag);
        activeFrameType = frameType;

        // Trigger save
        if (onSave) onSave();
    }

    /**
     * Create a prompt paragraph element with ghost styling.
     */
    function createPromptParagraph(text) {
        const p = document.createElement('p');
        p.className = 'skriv-frame-prompt';
        p.setAttribute('data-frame-original', text);
        p.textContent = text;
        return p;
    }

    /**
     * Check if editor content is effectively empty.
     */
    function isEditorEmpty() {
        const text = editor.innerText?.trim();
        if (!text) return true;
        // Check for just a single <p><br></p>
        if (editor.children.length === 1 && editor.children[0].tagName === 'P') {
            const p = editor.children[0];
            if (!p.textContent?.trim() && (p.childNodes.length === 0 || (p.childNodes.length === 1 && p.childNodes[0].nodeName === 'BR'))) {
                return true;
            }
        }
        return false;
    }

    // --- Remove frame scaffold, keep student text ---

    function removeFrame() {
        // Remove section headers
        editor.querySelectorAll('.skriv-frame-section').forEach(el => el.remove());
        // Remove subsection headers
        editor.querySelectorAll('.skriv-frame-subsection').forEach(el => el.remove());
        // Remove untouched prompts (still have the class)
        editor.querySelectorAll('.skriv-frame-prompt').forEach(el => el.remove());

        // If editor is now empty, add a default paragraph
        if (!editor.innerHTML.trim()) {
            editor.innerHTML = '<p><br></p>';
        }

        activeFrameType = null;
        if (onSave) onSave();
    }

    // --- Prompt interaction handlers ---

    /**
     * Delegated click handler: when user clicks a prompt paragraph,
     * select all its text so they can type to replace.
     */
    function handlePromptClick(e) {
        const prompt = e.target.closest('.skriv-frame-prompt');
        if (!prompt || !editor.contains(prompt)) return;

        const sel = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(prompt);
        sel.removeAllRanges();
        sel.addRange(range);
    }

    /**
     * Delegated input handler: when a prompt paragraph changes,
     * remove the ghost styling class.
     */
    function handlePromptInput() {
        // Find all prompts that have been modified
        editor.querySelectorAll('.skriv-frame-prompt').forEach(p => {
            const original = p.getAttribute('data-frame-original');
            const current = p.textContent?.trim();

            // Remove class if content changed from original or is empty
            if (current !== original) {
                p.classList.remove('skriv-frame-prompt');
                p.removeAttribute('data-frame-original');
            }
        });
    }

    // --- Rehydration on load ---

    /**
     * Re-attach handlers to existing frame DOM (after page reload).
     * Called on init — checks if the editor already contains frame elements.
     */
    function rehydrate() {
        const hasSections = editor.querySelectorAll('.skriv-frame-section').length > 0;
        if (hasSections) {
            // Frame DOM exists from saved HTML — handlers are re-attached via delegation
            // We just need to know that a frame is active
            // (activeFrameType will be set by standalone-writer from doc.frameType)
        }
    }

    // --- Public API helpers ---

    function getActiveFrame() {
        return activeFrameType;
    }

    function hasFrame() {
        return activeFrameType !== null ||
            editor.querySelectorAll('.skriv-frame-section').length > 0;
    }

    function setActiveFrameType(type) {
        activeFrameType = type || null;
    }

    /**
     * Get editor text with frame scaffold excluded.
     * Used for accurate word count and .txt export.
     */
    function getCleanText() {
        const clone = editor.cloneNode(true);
        // Remove section headers
        clone.querySelectorAll('.skriv-frame-section').forEach(el => el.remove());
        // Remove subsection headers
        clone.querySelectorAll('.skriv-frame-subsection').forEach(el => el.remove());
        // Remove untouched prompts
        clone.querySelectorAll('.skriv-frame-prompt').forEach(el => el.remove());
        return clone.innerText || '';
    }

    // --- Setup & teardown ---

    editor.addEventListener('click', handlePromptClick);
    editor.addEventListener('input', handlePromptInput);
    rehydrate();

    function destroy() {
        editor.removeEventListener('click', handlePromptClick);
        editor.removeEventListener('input', handlePromptInput);
    }

    return {
        applyFrame,
        removeFrame,
        getActiveFrame,
        hasFrame,
        setActiveFrameType,
        getCleanText,
        destroy,
    };
}
