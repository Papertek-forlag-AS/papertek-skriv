/**
 * Word bank for the Writing Spinner — Norwegian Bokmål (nb).
 *
 * Categories:
 *   starters  — sentence starters grouped by rhetorical function
 *   synonyms  — common overused words → better alternatives
 *   stopwords — words to ignore in frequency analysis
 *
 * All data is static — no API calls, works offline.
 * The student decides whether the suggestion fits — that's the learning mechanism.
 */

export const starters = {
    innledning: [
        'I denne teksten skal jeg drøfte...',
        'Et sentralt spørsmål i vår tid er...',
        'Det er mange ulike meninger om...',
        'Temaet er aktuelt fordi...',
        'Stadig flere stiller spørsmål ved...',
    ],
    argument: [
        'Et viktig argument for dette er...',
        'På den ene siden kan man hevde at...',
        'Det finnes gode grunner til å mene at...',
        'Forskning viser at...',
        'Et sentralt poeng er at...',
        'Dette underbygges av...',
    ],
    motargument: [
        'På den andre siden...',
        'Et motargument er at...',
        'Kritikere vil hevde at...',
        'Likevel kan man innvende at...',
        'Mot dette kan det anføres at...',
    ],
    eksempel: [
        'Et godt eksempel på dette er...',
        'Dette kan illustreres ved...',
        'Vi ser dette tydelig i...',
        'En konkret konsekvens av dette er...',
        'I praksis betyr dette at...',
    ],
    overgang: [
        'I tillegg til dette...',
        'Videre er det verdt å merke seg at...',
        'Et annet viktig aspekt er...',
        'Dessuten...',
        'Ikke bare... men også...',
        'Når det gjelder...',
        'Med dette som bakgrunn...',
    ],
    avslutning: [
        'Alt i alt mener jeg at...',
        'Etter å ha vurdert begge sider...',
        'Samlet sett viser dette at...',
        'Konklusjonen er at...',
        'Avslutningsvis vil jeg hevde at...',
    ],
    kilde: [
        'Ifølge... er det slik at...',
        'Som... påpeker...',
        'I artikkelen "..." hevdes det at...',
        'Statistikk fra... viser at...',
        'I sin bok "..." argumenterer... for at...',
    ],
};

export const synonyms = {
    // Overbrukte verb
    'mener': ['hevder', 'påstår', 'anser', 'argumenterer for', 'fremholder'],
    'sier': ['uttaler', 'hevder', 'påpeker', 'framhever', 'konstaterer'],
    'viser': ['illustrerer', 'avslører', 'demonstrerer', 'tydeliggjør', 'bekrefter'],
    'bruker': ['benytter', 'anvender', 'nyttiggjør seg', 'tar i bruk'],
    'gjør': ['utfører', 'foretar', 'gjennomfører', 'bidrar til'],
    'får': ['oppnår', 'erverver', 'tilegner seg', 'mottar'],
    'har': ['besitter', 'innehar', 'disponerer', 'rår over'],
    'ser': ['observerer', 'betrakter', 'legger merke til', 'registrerer'],
    'tenker': ['reflekterer', 'vurderer', 'overveier', 'funderer på'],
    'vet': ['kjenner til', 'er kjent med', 'er klar over', 'forstår'],

    // Overbrukte adjektiv
    'stor': ['betydelig', 'omfattende', 'vesentlig', 'markant'],
    'liten': ['beskjeden', 'ubetydelig', 'marginal', 'minimal'],
    'god': ['effektiv', 'vellykket', 'fordelaktig', 'gunstig'],
    'dårlig': ['uheldig', 'problematisk', 'utilstrekkelig', 'mangelfull'],
    'viktig': ['avgjørende', 'sentral', 'vesentlig', 'betydningsfull'],
    'mange': ['tallrike', 'en rekke', 'adskillige', 'et betydelig antall'],
    'mye': ['i stor grad', 'betraktelig', 'i vesentlig grad'],
    'ny': ['moderne', 'innovativ', 'nyskapende', 'fersk'],

    // Overbrukte adverb/bindeord
    'også': ['i tillegg', 'dessuten', 'videre', 'likeledes'],
    'derfor': ['følgelig', 'som en konsekvens', 'av den grunn', 'dermed'],
    'men': ['imidlertid', 'likevel', 'derimot', 'til tross for dette'],
    'fordi': ['ettersom', 'siden', 'på grunn av at', 'da'],
};

/**
 * Norwegian stop words — excluded from frequency analysis.
 * Common function words that appear often but carry no content meaning.
 */
export const stopwords = new Set([
    // Artikler/determinativer
    'en', 'ei', 'et', 'den', 'det', 'de',
    // Pronomen
    'jeg', 'du', 'han', 'hun', 'vi', 'dere', 'dem', 'seg', 'sin', 'sitt', 'sine',
    'meg', 'deg', 'oss', 'denne', 'dette', 'disse', 'min', 'mitt', 'mine', 'din', 'ditt', 'dine',
    'vår', 'vårt', 'våre', 'hans', 'hennes', 'deres',
    // Preposisjoner
    'i', 'på', 'til', 'for', 'med', 'av', 'om', 'fra', 'ved', 'over', 'under',
    'etter', 'mellom', 'mot', 'gjennom', 'blant', 'hos', 'uten', 'innen',
    // Konjunksjoner
    'og', 'eller', 'men', 'for', 'så', 'at', 'da', 'når', 'hvis', 'fordi',
    'siden', 'selv', 'om', 'enn', 'som', 'der', 'her', 'hvor',
    // Hjelpeverb
    'er', 'var', 'har', 'hadde', 'vil', 'ville', 'skal', 'skulle', 'kan', 'kunne',
    'må', 'måtte', 'bør', 'burde', 'blir', 'ble', 'blitt', 'vært', 'være',
    'ha', 'få', 'fikk', 'fått',
    // Andre vanlige
    'ikke', 'ingen', 'noe', 'noen', 'alt', 'alle', 'mange', 'mer', 'mest',
    'hva', 'hvem', 'hvilken', 'hvilket', 'hvilke',
    'også', 'bare', 'helt', 'slik', 'sånn', 'veldig', 'ganske',
    'jo', 'ja', 'nei', 'nå', 'da', 'her', 'der', 'dit',
]);

/**
 * Simple Norwegian stemmer — strips common suffixes to group word forms.
 * Not linguistically perfect, but good enough for frequency grouping.
 * @param {string} word - Lowercase word
 * @returns {string} Stemmed form
 */
export function stem(word) {
    if (word.length < 4) return word;

    // Strip common endings, longest first
    const suffixes = [
        'erende', 'elsen', 'inger', 'inger',
        'ene', 'ene', 'ert', 'ing', 'het', 'lig', 'isk',
        'er', 'en', 'et', 'te', 'de', 'ar', 'ne',
        'e', 's',
    ];
    for (const suf of suffixes) {
        if (word.length > suf.length + 2 && word.endsWith(suf)) {
            return word.slice(0, -suf.length);
        }
    }
    return word;
}
