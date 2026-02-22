/**
 * Norwegian Bokmål (nb) translations for Skriv.
 *
 * Pluralization: keys that depend on a count can use object form:
 *   { one: '...', other: '...' }
 * The correct form is selected by t() based on params.count.
 * Plain strings still work — backward compatible.
 */
export default {
    common: {
        loading: 'Laster...',
        error: 'Noe gikk galt. Prøv igjen.',
        cancel: 'Avbryt',
        confirm: 'Bekreft',
        ok: 'OK',
        back: 'Tilbake',
        delete: 'Slett',
    },

    export: {
        defaultTitle: 'Dokument',
        author: 'Forfatter: {{name}}',
        authorFallback: 'Ukjent',
        date: 'Dato: {{date}}',
        wordCount: 'Antall ord: {{count}}',
        pdfNotLoaded: 'PDF-biblioteket er ikke lastet. Prøv å laste ned som .txt i stedet.',
    },

    time: {
        now: 'Nå',
        minutesAgo: {
            one: '{{count}} min siden',
            other: '{{count}} min siden',
        },
        hoursAgo: {
            one: '{{count}} time siden',
            other: '{{count}} timer siden',
        },
        yesterday: 'I går',
        daysAgo: {
            one: '{{count}} dag siden',
            other: '{{count}} dager siden',
        },
    },

    specialChars: {
        prompt: 'Annet språk?',
        pickerTitle: 'Velg språk:',
    },

    wordCounter: {
        count: '{{count}} ord',
        goalRange: '(mål: {{min}}\u2013{{max}})',
        goalMin: '(mål: minst {{min}})',
        goalMax: '(mål: maks {{max}})',
    },

    language: {
        label: 'Språk',
    },

    spinner: {
        title: 'Ordspinner',
        spin: 'Snurr!',
        clickToSpin: 'Klikk «Snurr!» for et forslag',
        synonymTitle: 'Andre ord for «{{word}}»:',
        cat: {
            innledning: 'Innledning',
            argument: 'Argument',
            motargument: 'Motargument',
            eksempel: 'Eksempel',
            overgang: 'Overgang',
            avslutning: 'Avslutning',
            kilde: 'Kildebruk',
        },
    },

    radar: {
        button: 'Gjentakelse',
        tooltip: '«{{word}}» brukes {{count}} ganger',
        on: 'Gjentakelsesradar på',
        off: 'Gjentakelsesradar av',
    },

    sentence: {
        button: 'Setningslengde',
        on: 'Setningslengde-visning på',
        off: 'Setningslengde-visning av',
        tooltipLong: 'Lang setning ({{count}} ord)',
        tooltipVeryLong: 'Veldig lang setning ({{count}} ord)',
        avgLength: 'Snitt: {{avg}} ord/setning',
    },

    paragraphMap: {
        button: 'Avsnittskart',
        on: 'Avsnittskart på',
        off: 'Avsnittskart av',
        words: 'ord',
        ariaLabel: 'Avsnittskart — visuell oversikt over tekstens struktur',
    },

    image: {
        button: 'Bilde',
        captionPlaceholder: 'Bildetekst...',
        tooLarge: 'Bildet er for stort (maks 5 MB)',
        invalidType: 'Ugyldig filtype. Bruk PNG, JPEG eller GIF.',
        deleted: 'Bilde fjernet',
    },

    checklist: {
        title: 'Sjekkliste før innsending',
        proceed: 'Last ned',
        cancel: 'Avbryt',
        hasTitle: 'Dokumentet har en tittel',
        hasWords: 'Teksten har minst 100 ord',
        hasSources: 'Kilder er lagt til',
        introConclusion: 'Innledning og avslutning er skrevet',
        spellCheck: 'Språk og stavekontroll er sjekket',
        droefting: {
            question: 'Problemstillingen er presentert i innledningen',
            argFor: 'Minst ett argument for med påstand, underbygging og forklaring',
            argAgainst: 'Minst ett argument mot med påstand, underbygging og forklaring',
            conclusion: 'Konklusjonen tar stilling til problemstillingen',
        },
        analyse: {
            work: 'Verket er presentert (tittel, forfatter, år)',
            structure: 'Oppbygging og struktur er analysert',
            devices: 'Virkemidler er identifisert med eksempler',
            interpretation: 'Tolkning er gitt med begrunnelse',
        },
        kronikk: {
            hook: 'Innledningen fanger oppmerksomhet',
            position: 'Tydelig holdning er presentert',
            arguments: 'Minst to hovedargumenter er presentert',
            counterArg: 'Motargument er presentert og besvart',
        },
    },

    // Skriv-specific
    skriv: {
        appName: 'Papertek Skriv',
        tagline: 'Ditt personlige skriveverksted',
        newDocument: 'Ny tekst',
        untitled: 'Uten tittel',
        lastEdited: 'Sist endret',
        noDocuments: 'Ingen dokumenter ennå. Klikk "Ny tekst" for å begynne.',
        deleteConfirmTitle: 'Slett dokument',
        deleteConfirmMessage: 'Er du sikker på at du vil slette "{{title}}"? Dette kan ikke angres.',
        deleteConfirmYes: 'Ja, slett',
        saved: 'Lagret',
        saving: 'Lagrer...',
        placeholder: 'Begynn å skrive her...',
        backToDocuments: 'Mine dokumenter',
        downloadTxt: 'Last ned .txt',
        downloadPdf: 'Last ned PDF',
        titlePlaceholder: 'Gi dokumentet en tittel...',
        wordsWritten: '{{count}} ord skrevet',
        documentsCount: {
            one: '{{count}} dokument',
            other: '{{count}} dokumenter',
        },
        exportTitle: 'Eksporter',

        // Advanced toggle + TOC
        advancedToggle: 'Avansert',
        advancedOn: 'Avansert modus på',
        advancedOff: 'Avansert modus av',
        advancedDisableConfirmTitle: 'Slå av avansert modus?',
        advancedDisableConfirmMessage: 'Overskrifter beholdes som fet tekst og kan gjenopprettes. Lister beholdes.',
        advancedDisableConfirmYes: 'Ja, slå av',
        strukturComingSoon: 'Kommer snart',
        tocTitle: 'Innholdsfortegnelse',
        tocEmpty: 'Legg til overskrifter (H1/H2) for å bygge innholdsfortegnelsen.',

        // References
        refButton: 'Kilde',
        refTitle: 'Kildeliste',
        refDialogTitle: 'Legg til kilde',
        refDialogEdit: 'Rediger kilde',
        refTypeBook: 'Bok',
        refTypeWeb: 'Nettside',
        refTypeArticle: 'Artikkel',
        refAuthor: 'Forfatter(e)',
        refYear: 'Årstall',
        refSourceTitle: 'Tittel',
        refUrl: 'URL (valgfritt)',
        refPublisher: 'Forlag/utgiver (valgfritt)',
        refAdd: 'Legg til',
        refUpdate: 'Oppdater',
        refDelete: 'Slett kilde',
        refDeleteConfirm: 'Vil du slette denne kilden? Referansemarkøren i teksten fjernes også.',

        // Writing frames (Skriverammer)
        strukturTooltip: 'Velg skriveramme',
        frameSelectorTitle: 'Velg skriveramme',
        frameDroefting: 'Drøfting',
        frameDroeftingDesc: 'Argumenter for og mot med trestegsmetoden',
        frameAnalyse: 'Analyse',
        frameAnalyseDesc: 'Strukturert analyse av tekst eller verk',
        frameKronikk: 'Kronikk',
        frameKronikkDesc: 'Argumenterende tekst om et aktuelt tema',
        frameRemove: 'Fjern skriveramme',
        frameRemoveConfirmTitle: 'Fjern skriveramme?',
        frameRemoveConfirmMessage: 'Seksjonsoverskrifter og ubrukte ledetekster fjernes. Teksten du har skrevet beholdes.',
        frameRemoveConfirmYes: 'Ja, fjern',
        frameApplyConfirmTitle: 'Sett inn skriveramme?',
        frameApplyConfirmMessage: 'Dokumentet inneholder allerede tekst. Skriverammen settes inn i tillegg til eksisterende innhold.',
        frameApplyConfirmYes: 'Ja, sett inn',
        frameActive: 'Skriveramme aktiv',

        // Trash
        trashButton: 'Papirkurv',
        trashEmpty: 'Papirkurven er tom.',
        trashInfo: {
            one: 'Dokumenter slettes permanent etter {{days}} dag.',
            other: 'Dokumenter slettes permanent etter {{days}} dager.',
        },
        trashRestore: 'Gjenopprett',
        trashDeletePermanently: 'Slett permanent',
        trashDeletePermanentlyConfirmTitle: 'Slett permanent?',
        trashDeletePermanentlyConfirmMessage: 'Er du sikker? "{{title}}" kan ikke gjenopprettes etter dette.',
        trashDeletePermanentlyConfirmYes: 'Ja, slett permanent',
        trashEmptyAll: 'Tøm papirkurv',
        trashEmptyAllConfirmTitle: 'Tøm papirkurven?',
        trashEmptyAllConfirmMessage: {
            one: '{{count}} dokument i papirkurven slettes permanent. Dette kan ikke angres.',
            other: 'Alle {{count}} dokumenter i papirkurven slettes permanent. Dette kan ikke angres.',
        },
        trashEmptyAllConfirmYes: 'Ja, tøm alt',
        trashRestored: 'Dokumentet er gjenopprettet',
        trashMoveToTrash: 'Flytt til papirkurv',
        deleteConfirmMessageTrash: {
            one: 'Dokumentet "{{title}}" flyttes til papirkurven. Du kan gjenopprette det innen {{days}} dag.',
            other: 'Dokumentet "{{title}}" flyttes til papirkurven. Du kan gjenopprette det innen {{days}} dager.',
        },
        deleteConfirmYesTrash: 'Ja, flytt til papirkurv',
        trashCount: {
            one: '{{count}} i papirkurven',
            other: '{{count}} i papirkurven',
        },
    },
};
