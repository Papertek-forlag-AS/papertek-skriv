/**
 * Paragraph Trainer data — practice topics and sentence starters.
 *
 * Topics are short, genre-neutral claims the student writes ONE paragraph
 * about using the three-step model (temasetning → utdyping → avslutning).
 * Each topic carries both Bokmål and Nynorsk phrasing; the trainer picks
 * the variant matching the active UI language (en falls back to nb —
 * the practice content itself is Norwegian, like the German exam corpus).
 */

export const TRAINER_TOPICS = [
    {
        id: 'mobilfri-skole',
        nb: 'Mobilen bør leveres inn når skoledagen starter.',
        nn: 'Mobilen bør leverast inn når skuledagen startar.',
    },
    {
        id: 'leksefri-skole',
        nb: 'Skolen bør være leksefri.',
        nn: 'Skulen bør vere leksefri.',
    },
    {
        id: 'senere-skolestart',
        nb: 'Skoledagen bør starte senere om morgenen.',
        nn: 'Skuledagen bør starte seinare om morgonen.',
    },
    {
        id: 'skoleuniform',
        nb: 'Alle elever bør bruke skoleuniform.',
        nn: 'Alle elevar bør bruke skuleuniform.',
    },
    {
        id: 'gratis-kollektiv',
        nb: 'Kollektivtransport bør være gratis for ungdom.',
        nn: 'Kollektivtransport bør vere gratis for ungdom.',
    },
    {
        id: 'gaming-laering',
        nb: 'Dataspill kan gjøre oss flinkere på skolen.',
        nn: 'Dataspel kan gjere oss flinkare på skulen.',
    },
    {
        id: 'sosiale-medier-vennskap',
        nb: 'Sosiale medier gjør det lettere å holde på vennskap.',
        nn: 'Sosiale medium gjer det lettare å halde på venskap.',
    },
    {
        id: 'kroppspress',
        nb: 'Sosiale medier skaper kroppspress blant unge.',
        nn: 'Sosiale medium skaper kroppspress blant unge.',
    },
    {
        id: 'energidrikk-aldersgrense',
        nb: 'Energidrikker bør ha aldersgrense.',
        nn: 'Energidrikkar bør ha aldersgrense.',
    },
    {
        id: 'sunn-kantine',
        nb: 'Skolekantina bør bare selge sunn mat.',
        nn: 'Skulekantina bør berre selje sunn mat.',
    },
    {
        id: 'karakterer-gym',
        nb: 'Karakterer i kroppsøving bør fjernes.',
        nn: 'Karakterar i kroppsøving bør fjernast.',
    },
    {
        id: 'e-sport-idrett',
        nb: 'E-sport er en ekte idrett.',
        nn: 'E-sport er ein ekte idrett.',
    },
    {
        id: 'deltidsjobb',
        nb: 'Alle ungdommer bør ha en deltidsjobb ved siden av skolen.',
        nn: 'Alle ungdomar bør ha ein deltidsjobb ved sida av skulen.',
    },
    {
        id: 'programmering-for-alle',
        nb: 'Alle elever bør lære programmering på skolen.',
        nn: 'Alle elevar bør lære programmering på skulen.',
    },
    {
        id: 'ki-i-skolen',
        nb: 'Kunstig intelligens bør være lov å bruke i skolearbeid.',
        nn: 'Kunstig intelligens bør vere lov å bruke i skulearbeid.',
    },
    {
        id: 'kjottfri-dag',
        nb: 'Alle skoler bør ha en kjøttfri dag i uka.',
        nn: 'Alle skular bør ha ein kjøtfri dag i veka.',
    },
    {
        id: 'sommerferie-lengde',
        nb: 'Sommerferien er for lang.',
        nn: 'Sommarferien er for lang.',
    },
    {
        id: 'bok-vs-film',
        nb: 'Boka er alltid bedre enn filmen.',
        nn: 'Boka er alltid betre enn filmen.',
    },
    {
        id: 'influenser-yrke',
        nb: 'Influenser er et ordentlig yrke.',
        nn: 'Influensar er eit ordentleg yrke.',
    },
    {
        id: 'plast-i-havet',
        nb: 'Hver enkelt av oss kan gjøre noe med plasten i havet.',
        nn: 'Kvar einskild av oss kan gjere noko med plasten i havet.',
    },
    {
        id: 'ungdom-nyheter',
        nb: 'Ungdom bør følge med på nyhetene.',
        nn: 'Ungdom bør følgje med på nyheitene.',
    },
    {
        id: 'skjermtid-grense',
        nb: 'Foreldre bør sette grenser for skjermtid.',
        nn: 'Foreldre bør setje grenser for skjermtid.',
    },
    {
        id: 'russetid',
        nb: 'Russetiden har blitt for dyr og kommersiell.',
        nn: 'Russetida har blitt for dyr og kommersiell.',
    },
    {
        id: 'prove-fri-fredag',
        nb: 'Det bør ikke være lov å ha prøver på fredager.',
        nn: 'Det bør ikkje vere lov å ha prøver på fredagar.',
    },
];

// Sentence starters per step, per language. Shown as clickable chips
// under each writing field; clicking inserts the starter when the field
// is empty.
export const STEP_STARTERS = {
    nb: {
        topic: [
            'Jeg mener at …',
            'Et viktig poeng er at …',
            'Mange hevder at …',
        ],
        support: [
            'For det første …',
            'Et eksempel på dette er …',
            'Dette ser vi når …',
            'En grunn til dette er at …',
        ],
        closing: [
            'Derfor mener jeg at …',
            'Alt i alt viser dette at …',
            'Dette betyr at …',
        ],
    },
    nn: {
        topic: [
            'Eg meiner at …',
            'Eit viktig poeng er at …',
            'Mange hevdar at …',
        ],
        support: [
            'For det fyrste …',
            'Eit døme på dette er …',
            'Dette ser vi når …',
            'Ein grunn til dette er at …',
        ],
        closing: [
            'Difor meiner eg at …',
            'Alt i alt viser dette at …',
            'Dette tyder at …',
        ],
    },
};
