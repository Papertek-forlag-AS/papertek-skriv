/**
 * Word bank for the Writing Spinner — Norwegian Nynorsk (nn).
 *
 * Categories:
 *   starters  — sentence starters grouped by rhetorical function
 *   synonyms  — common overused words → better alternatives
 *   stopwords — words to ignore in frequency analysis
 *
 * All data is static — no API calls, works offline.
 */

export const starters = {
    innledning: [
        'I denne teksten skal eg drøfte...',
        'Eit sentralt spørsmål i vår tid er...',
        'Det er mange ulike meiningar om...',
        'Temaet er aktuelt fordi...',
        'Stadig fleire stiller spørsmål ved...',
    ],
    argument: [
        'Eit viktig argument for dette er...',
        'På den eine sida kan ein hevde at...',
        'Det finst gode grunnar til å meina at...',
        'Forsking viser at...',
        'Eit sentralt poeng er at...',
        'Dette vert underbygt av...',
    ],
    motargument: [
        'På den andre sida...',
        'Eit motargument er at...',
        'Kritikarar vil hevde at...',
        'Likevel kan ein innvende at...',
        'Mot dette kan det anførast at...',
    ],
    eksempel: [
        'Eit godt døme på dette er...',
        'Dette kan illustrerast ved...',
        'Vi ser dette tydeleg i...',
        'Ein konkret konsekvens av dette er...',
        'I praksis tyder dette at...',
    ],
    overgang: [
        'I tillegg til dette...',
        'Vidare er det verdt å merkje seg at...',
        'Eit anna viktig aspekt er...',
        'Dessutan...',
        'Ikkje berre... men også...',
        'Når det gjeld...',
        'Med dette som bakgrunn...',
    ],
    avslutning: [
        'Alt i alt meiner eg at...',
        'Etter å ha vurdert begge sider...',
        'Samla sett viser dette at...',
        'Konklusjonen er at...',
        'Avslutningsvis vil eg hevde at...',
    ],
    kilde: [
        'Ifølgje... er det slik at...',
        'Som... peikar på...',
        'I artikkelen "..." vert det hevda at...',
        'Statistikk frå... viser at...',
        'I boka si "..." argumenterer... for at...',
    ],
};

export const synonyms = {
    // Overbrukte verb
    'meiner': ['hevdar', 'påstår', 'reknar med', 'argumenterer for', 'held fram'],
    'seier': ['uttalar', 'hevdar', 'peikar på', 'framhevar', 'konstaterer'],
    'viser': ['illustrerer', 'avslører', 'demonstrerer', 'tydeleggjer', 'stadfestar'],
    'brukar': ['nyttar', 'tek i bruk', 'nyttiggjer seg'],
    'gjer': ['utfører', 'gjennomfører', 'bidreg til'],
    'får': ['oppnår', 'tileignar seg', 'mottek'],
    'har': ['sit med', 'rår over', 'disponerer'],
    'ser': ['observerer', 'legg merke til', 'registrerer'],
    'tenkjer': ['reflekterer', 'vurderer', 'funderer på'],
    'veit': ['kjenner til', 'er kjend med', 'forstår'],

    // Overbrukte adjektiv
    'stor': ['betydeleg', 'omfattande', 'vesentleg', 'markant'],
    'liten': ['beskjeden', 'ubetydeleg', 'marginal', 'minimal'],
    'god': ['effektiv', 'vellukka', 'gunstig', 'fordelaktig'],
    'dårleg': ['uheldig', 'problematisk', 'utilstrekkeleg', 'mangelfull'],
    'viktig': ['avgjerande', 'sentral', 'vesentleg', 'betydingsfull'],
    'mange': ['talrike', 'ei rekkje', 'adskillige', 'eit betydeleg tal'],
    'mykje': ['i stor grad', 'monaleg', 'i vesentleg grad'],
    'ny': ['moderne', 'innovativ', 'nyskapande', 'fersk'],

    // Overbrukte adverb/bindeord
    'også': ['i tillegg', 'dessutan', 'vidare', 'likeins'],
    'derfor': ['følgjeleg', 'som ein konsekvens', 'av den grunn', 'dermed'],
    'men': ['likevel', 'derimot', 'til trass for dette'],
    'fordi': ['ettersom', 'sidan', 'på grunn av at', 'då'],
};

export const stopwords = new Set([
    // Artiklar/determinativar
    'ein', 'ei', 'eit', 'den', 'det', 'dei',
    // Pronomen
    'eg', 'du', 'han', 'ho', 'vi', 'dykk', 'dei', 'seg', 'sin', 'sitt', 'sine',
    'meg', 'deg', 'oss', 'denne', 'dette', 'desse', 'min', 'mitt', 'mine', 'din', 'ditt', 'dine',
    'vår', 'vårt', 'våre', 'hans', 'hennar', 'deira',
    // Preposisjonar
    'i', 'på', 'til', 'for', 'med', 'av', 'om', 'frå', 'ved', 'over', 'under',
    'etter', 'mellom', 'mot', 'gjennom', 'blant', 'hos', 'utan', 'innan',
    // Konjunksjonar
    'og', 'eller', 'men', 'for', 'so', 'at', 'då', 'når', 'dersom', 'fordi',
    'sidan', 'sjølv', 'om', 'enn', 'som', 'der', 'her', 'kvar',
    // Hjelpeverb
    'er', 'var', 'har', 'hadde', 'vil', 'ville', 'skal', 'skulle', 'kan', 'kunne',
    'må', 'måtte', 'bør', 'burde', 'vert', 'vart', 'vorte', 'vore', 'vere',
    'ha', 'få', 'fekk', 'fått',
    // Andre vanlege
    'ikkje', 'ingen', 'noko', 'nokon', 'alt', 'alle', 'mange', 'meir', 'mest',
    'kva', 'kven', 'kva for ein', 'kva for eit',
    'også', 'berre', 'heilt', 'slik', 'veldig', 'ganske',
    'jo', 'ja', 'nei', 'no', 'då', 'her', 'der', 'dit',
]);

export function stem(word) {
    if (word.length < 4) return word;
    const suffixes = [
        'ande', 'inga', 'ingar', 'elsen',
        'ane', 'ene', 'ert', 'ing', 'heit', 'leg', 'isk',
        'ar', 'en', 'et', 'te', 'de', 'er', 'ne',
        'e', 's',
    ];
    for (const suf of suffixes) {
        if (word.length > suf.length + 2 && word.endsWith(suf)) {
            return word.slice(0, -suf.length);
        }
    }
    return word;
}
