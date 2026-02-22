/**
 * Frame Markdown Parser
 *
 * Parses a .md file into a structured frame object.
 *
 * Markdown format:
 *   # Frame Name
 *   ## Metadata
 *   genre: drøfting
 *   level: vgs
 *   ## Section Title
 *   > Instruction text for this section
 *   - Prompt sentence starter 1
 *   - Prompt sentence starter 2
 *   ### Subsection Title
 *   > Subsection instruction
 *   - Prompt for subsection
 *
 * Output:
 *   { name, meta, sections }
 *   section = { title, instruction, prompts, subsections }
 *   subsection = { title, instruction, prompts }
 */

/**
 * Parse a frame markdown string into a structured object.
 * @param {string} md - Raw markdown content
 * @returns {{ name: string, meta: Record<string, string>, sections: Array }}
 */
export function parseFrameMarkdown(md) {
    const lines = md.split('\n');
    const result = { name: '', meta: {}, sections: [] };

    let currentSection = null;
    let currentSub = null;
    let inMeta = false;

    for (const rawLine of lines) {
        const line = rawLine.trimEnd();

        // H1 — frame name (only first one)
        if (line.startsWith('# ') && !line.startsWith('## ') && !result.name) {
            result.name = line.slice(2).trim();
            inMeta = false;
            continue;
        }

        // H2 — section or metadata block
        if (line.startsWith('## ')) {
            const title = line.slice(3).trim();
            if (title.toLowerCase() === 'metadata') {
                inMeta = true;
                currentSection = null;
                currentSub = null;
                continue;
            }
            inMeta = false;
            currentSub = null;
            currentSection = { title, instruction: '', prompts: [], subsections: [] };
            result.sections.push(currentSection);
            continue;
        }

        // H3 — subsection (only valid inside a section)
        if (line.startsWith('### ') && currentSection) {
            const title = line.slice(4).trim();
            currentSub = { title, instruction: '', prompts: [] };
            currentSection.subsections.push(currentSub);
            continue;
        }

        // Metadata key:value pairs
        if (inMeta) {
            const colonIdx = line.indexOf(':');
            if (colonIdx > 0) {
                const key = line.slice(0, colonIdx).trim();
                const val = line.slice(colonIdx + 1).trim();
                if (key) result.meta[key] = val;
            }
            continue;
        }

        // Blockquote — instruction for current section or subsection
        if (line.startsWith('> ')) {
            const text = line.slice(2).trim();
            const target = currentSub || currentSection;
            if (target) {
                target.instruction = target.instruction
                    ? target.instruction + ' ' + text
                    : text;
            }
            continue;
        }

        // List item — prompt
        if (line.startsWith('- ')) {
            const text = line.slice(2).trim();
            const target = currentSub || currentSection;
            if (target && text) {
                target.prompts.push(text);
            }
            continue;
        }
    }

    return result;
}
