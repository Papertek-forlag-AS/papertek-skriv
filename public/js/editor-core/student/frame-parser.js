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
 *   spinner: hoveddel              (optional override; otherwise auto-derived)
 *   > Instruction text for this section
 *   - Prompt sentence starter 1
 *   - Prompt sentence starter 2
 *   ### Subsection Title
 *   spinner: verkemiddel           (optional override at subsection level)
 *   > Subsection instruction
 *   - Prompt for subsection
 *
 * Output:
 *   { name, meta, sections }
 *   section = { title, instruction, prompts, subsections, spinnerBucket }
 *   subsection = { title, instruction, prompts, spinnerBucket }
 */

const SUBSECTION_NAME_BUCKETS = [
    { match: /virkemid/i, bucket: 'verkemiddel' },
    { match: /tolkning|tematikk/i, bucket: 'tolkning' },
];

/**
 * Compute the default spinner bucket for a section based on its position.
 * @param {number} index - Section index in the frame.
 * @param {number} total - Total section count.
 * @returns {string}
 */
function defaultSectionBucket(index, total) {
    if (index === 0) return 'innledning';
    if (index === total - 1) return 'avslutning';
    return 'hoveddel';
}

/**
 * Compute the default spinner bucket for a subsection given its title and parent.
 * @param {string} title - Subsection title.
 * @param {string} parentBucket - Parent section's bucket.
 * @returns {string}
 */
function defaultSubsectionBucket(title, parentBucket) {
    for (const rule of SUBSECTION_NAME_BUCKETS) {
        if (rule.match.test(title)) return rule.bucket;
    }
    return parentBucket;
}

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
            currentSection = {
                title,
                instruction: '',
                prompts: [],
                subsections: [],
                spinnerBucket: null, // resolved below
            };
            result.sections.push(currentSection);
            continue;
        }

        // H3 — subsection (only valid inside a section)
        if (line.startsWith('### ') && currentSection) {
            const title = line.slice(4).trim();
            currentSub = {
                title,
                instruction: '',
                prompts: [],
                spinnerBucket: null, // resolved below
            };
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

        // spinner: <bucket> — explicit override at section or subsection level
        if (/^spinner\s*:/i.test(line)) {
            const colonIdx = line.indexOf(':');
            const bucket = line.slice(colonIdx + 1).trim();
            if (bucket) {
                const target = currentSub || currentSection;
                if (target) target.spinnerBucket = bucket;
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

    // Resolve default spinner buckets for any section/subsection that didn't
    // declare an override. Position-based at section level; subsection-name
    // match (with parent inheritance) at subsection level.
    const total = result.sections.length;
    result.sections.forEach((section, i) => {
        if (!section.spinnerBucket) {
            section.spinnerBucket = defaultSectionBucket(i, total);
        }
        section.subsections.forEach(sub => {
            if (!sub.spinnerBucket) {
                sub.spinnerBucket = defaultSubsectionBucket(sub.title, section.spinnerBucket);
            }
        });
    });

    return result;
}
