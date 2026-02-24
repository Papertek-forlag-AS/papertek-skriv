/**
 * School level data module.
 * Maps Norwegian school levels to their writing-relevant subjects.
 * Zero dependencies — sits at the bottom of the app dependency graph.
 */

const LS_KEY = 'skriv_school_level';

/**
 * Available school levels (Norwegian education system).
 * Only Studiespesialisering for videregående.
 */
export const SCHOOL_LEVELS = [
    { id: 'barneskole',   labelKey: 'level.barneskole',   subKey: 'level.barneskoleSub' },
    { id: 'ungdomsskole', labelKey: 'level.ungdomsskole', subKey: 'level.ungdomsskoleSub' },
    { id: 'vg1',          labelKey: 'level.vg1',          subKey: 'level.vg1Sub' },
    { id: 'vg2',          labelKey: 'level.vg2',          subKey: 'level.vg2Sub' },
    { id: 'vg3',          labelKey: 'level.vg3',          subKey: 'level.vg3Sub' },
];

/**
 * Subjects students typically write in, per school level.
 * Excludes non-writing subjects like Kroppsøving and Mat og helse.
 * Students can always add custom subjects for anything missing.
 */
export const LEVEL_SUBJECTS = {
    barneskole:   ['Norsk', 'Matematikk', 'Engelsk', 'Naturfag', 'Samfunnsfag', 'KRLE'],
    ungdomsskole: ['Norsk', 'Matematikk', 'Engelsk', 'Naturfag', 'Samfunnsfag', 'KRLE', 'Kunst og håndverk', 'Musikk', 'Fremmedspråk'],
    vg1:          ['Norsk', 'Engelsk', 'Matematikk', 'Naturfag', 'Samfunnskunnskap', 'Geografi', 'Fremmedspråk'],
    vg2:          ['Norsk', 'Matematikk', 'Historie', 'Fremmedspråk'],
    vg3:          ['Norsk', 'Historie', 'Religion og etikk'],
};

/** Get the stored school level ID, or null if not set. */
export function getSchoolLevel() {
    return localStorage.getItem(LS_KEY) || null;
}

/** Save the selected school level. */
export function setSchoolLevel(levelId) {
    localStorage.setItem(LS_KEY, levelId);
}

/** Check if a school level has been chosen (for onboarding gate). */
export function hasSchoolLevel() {
    return !!localStorage.getItem(LS_KEY);
}

/** Get the subject array for a given level ID. */
export function getSubjectsForLevel(levelId) {
    return LEVEL_SUBJECTS[levelId] || [];
}
