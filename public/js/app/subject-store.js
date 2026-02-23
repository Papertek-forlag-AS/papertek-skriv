/**
 * Subject store — manages school subjects and school year logic.
 * Subjects are used to organize documents into folders.
 * School years run from August 1st to July 31st.
 *
 * Predefined subjects + student-created custom subjects.
 * Custom subjects are persisted in localStorage.
 */

const LS_CUSTOM_SUBJECTS = 'skriv_custom_subjects';
const LS_SCHOOL_YEAR = 'skriv_school_year';

/**
 * Common Norwegian school subjects (ungdomsskole + videregående).
 * Sorted alphabetically in Norwegian.
 */
export const PREDEFINED_SUBJECTS = [
    'Engelsk',
    'Fremmedspråk',
    'Geografi',
    'Historie',
    'IT',
    'KRLE',
    'Kroppsøving',
    'Kunst og håndverk',
    'Matematikk',
    'Musikk',
    'Naturfag',
    'Norsk',
    'Samfunnsfag',
];

/** Reserved subject name for the personal folder. */
export const PERSONAL_SUBJECT = '__personal__';

/**
 * Get the school year boundaries for a given date.
 * A school year runs from August 1st to July 31st.
 * @param {Date} [referenceDate] - Date to determine school year (defaults to now)
 * @returns {{ startYear: number, endYear: number, start: Date, end: Date, label: string }}
 */
export function getSchoolYear(referenceDate) {
    const d = referenceDate || new Date();
    // If we're in Jan-Jul, the school year started the previous August
    // If we're in Aug-Dec, the school year started this August
    const startYear = d.getMonth() < 7 ? d.getFullYear() - 1 : d.getFullYear();
    const endYear = startYear + 1;
    return {
        startYear,
        endYear,
        start: new Date(startYear, 7, 1),   // August 1st
        end: new Date(endYear, 6, 31, 23, 59, 59), // July 31st
        label: `${startYear}/${endYear}`,
    };
}

/**
 * Get the currently active school year label.
 * Auto-detects from the current date if not set.
 * @returns {string} e.g. '2025/2026'
 */
export function getCurrentSchoolYear() {
    let stored = localStorage.getItem(LS_SCHOOL_YEAR);
    if (!stored) {
        stored = getSchoolYear().label;
        localStorage.setItem(LS_SCHOOL_YEAR, stored);
    }
    return stored;
}

/**
 * Set the active school year.
 * @param {string} label - e.g. '2025/2026'
 */
export function setCurrentSchoolYear(label) {
    localStorage.setItem(LS_SCHOOL_YEAR, label);
}

/**
 * Get student-created custom subjects from localStorage.
 * @returns {string[]}
 */
export function getCustomSubjects() {
    try {
        const raw = localStorage.getItem(LS_CUSTOM_SUBJECTS);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
}

/**
 * Add a custom subject.
 * @param {string} name - Subject name (trimmed, max 30 chars)
 */
export function addCustomSubject(name) {
    const trimmed = name.trim().slice(0, 30);
    if (!trimmed) return;
    const customs = getCustomSubjects();
    if (!customs.includes(trimmed) && !PREDEFINED_SUBJECTS.includes(trimmed)) {
        customs.push(trimmed);
        localStorage.setItem(LS_CUSTOM_SUBJECTS, JSON.stringify(customs));
    }
}

/**
 * Remove a custom subject.
 * @param {string} name
 */
export function removeCustomSubject(name) {
    const customs = getCustomSubjects().filter(s => s !== name);
    localStorage.setItem(LS_CUSTOM_SUBJECTS, JSON.stringify(customs));
}

/**
 * Get all subjects (predefined + custom), sorted alphabetically.
 * @returns {string[]}
 */
export function getAllSubjects() {
    const all = new Set([...PREDEFINED_SUBJECTS, ...getCustomSubjects()]);
    return [...all].sort((a, b) => a.localeCompare(b, 'nb'));
}

/**
 * Get all distinct school years present in documents.
 * Useful for building a year selector dropdown.
 * @param {Array<{schoolYear: string}>} docs
 * @returns {string[]} Sorted descending (newest first), e.g. ['2025/2026', '2024/2025']
 */
export function getAvailableSchoolYears(docs) {
    const years = new Set();
    for (const doc of docs) {
        if (doc.schoolYear) years.add(doc.schoolYear);
    }
    // Always include the current year
    years.add(getCurrentSchoolYear());
    return [...years].sort().reverse();
}
