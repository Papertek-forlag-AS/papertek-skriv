/**
 * Norwegian Bokmål (nb) translations for Skriv.
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

    wordCounter: {
        count: '{{count}} ord',
        goalRange: '(mål: {{min}}\u2013{{max}})',
        goalMin: '(mål: minst {{min}})',
        goalMax: '(mål: maks {{max}})',
    },

    language: {
        label: 'Språk',
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
        documentsCount: '{{count}} dokumenter',
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
    },
};
