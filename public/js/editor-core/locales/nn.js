/**
 * Norwegian Nynorsk (nn) translations for Skriv.
 *
 * Pluralization: keys that depend on a count can use object form:
 *   { one: '...', other: '...' }
 * The correct form is selected by t() based on params.count.
 * Plain strings still work — backward compatible.
 */
export default {
    common: {
        loading: 'Lastar...',
        error: 'Noko gjekk gale. Prøv igjen.',
        cancel: 'Avbryt',
        confirm: 'Stadfest',
        ok: 'OK',
        back: 'Tilbake',
        delete: 'Slett',
    },

    export: {
        defaultTitle: 'Dokument',
        author: 'Forfattar: {{name}}',
        authorFallback: 'Ukjend',
        date: 'Dato: {{date}}',
        wordCount: 'Tal på ord: {{count}}',
        pdfNotLoaded: 'PDF-biblioteket er ikkje lasta. Prøv å laste ned som .txt i staden.',
    },

    time: {
        now: 'No',
        minutesAgo: {
            one: '{{count}} min sidan',
            other: '{{count}} min sidan',
        },
        hoursAgo: {
            one: '{{count}} time sidan',
            other: '{{count}} timar sidan',
        },
        yesterday: 'I går',
        daysAgo: {
            one: '{{count}} dag sidan',
            other: '{{count}} dagar sidan',
        },
    },

    specialChars: {
        prompt: 'Anna språk?',
        pickerTitle: 'Vel språk:',
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
        title: 'Ordspinnar',
        spin: 'Snurr!',
        clickToSpin: 'Klikk «Snurr!» for eit forslag',
        synonymTitle: 'Andre ord for «{{word}}»:',
        cat: {
            innledning: 'Innleiing',
            argument: 'Argument',
            motargument: 'Motargument',
            eksempel: 'Døme',
            overgang: 'Overgang',
            avslutning: 'Avslutning',
            kilde: 'Kjeldebruk',
        },
    },

    radar: {
        button: 'Gjentaking',
        tooltip: '«{{word}}» vert brukt {{count}} gonger',
        on: 'Gjentakingsradar på',
        off: 'Gjentakingsradar av',
    },

    sentence: {
        button: 'Setningslengd',
        on: 'Setningslengd-vising på',
        off: 'Setningslengd-vising av',
        tooltipLong: 'Lang setning ({{count}} ord)',
        tooltipVeryLong: 'Svært lang setning ({{count}} ord)',
        avgLength: 'Snitt: {{avg}} ord/setning',
    },

    paragraphMap: {
        button: 'Avsnittskart',
        on: 'Avsnittskart på',
        off: 'Avsnittskart av',
        words: 'ord',
        ariaLabel: 'Avsnittskart — visuell oversikt over tekststrukturen',
    },

    image: {
        button: 'Bilete',
        captionPlaceholder: 'Bilettekst...',
        tooLarge: 'Biletet er for stort (maks 5 MB)',
        invalidType: 'Ugyldig filtype. Bruk PNG, JPEG eller GIF.',
        deleted: 'Bilete fjerna',
    },

    checklist: {
        title: 'Sjekkliste før innsending',
        proceed: 'Last ned',
        cancel: 'Avbryt',
        hasTitle: 'Dokumentet har ein tittel',
        hasWords: 'Teksten har minst 100 ord',
        hasSources: 'Kjelder er lagt til',
        introConclusion: 'Innleiing og avslutning er skrivne',
        spellCheck: 'Språk og stavekontroll er sjekka',
        droefting: {
            question: 'Problemstillinga er presentert i innleiinga',
            argFor: 'Minst eitt argument for med påstand, underbygging og forklaring',
            argAgainst: 'Minst eitt argument mot med påstand, underbygging og forklaring',
            conclusion: 'Konklusjonen tek stilling til problemstillinga',
        },
        analyse: {
            work: 'Verket er presentert (tittel, forfattar, år)',
            structure: 'Oppbygging og struktur er analysert',
            devices: 'Verkemiddel er identifiserte med døme',
            interpretation: 'Tolking er gitt med grunngjeving',
        },
        kronikk: {
            hook: 'Innleiinga fangar merksemda',
            position: 'Tydeleg haldning er presentert',
            arguments: 'Minst to hovudargument er presenterte',
            counterArg: 'Motargument er presentert og svara på',
        },
    },

    // Skriv-specific
    skriv: {
        appName: 'Papertek Skriv',
        tagline: 'Di personlege skrivestove',
        newDocument: 'Ny tekst',
        untitled: 'Utan tittel',
        lastEdited: 'Sist endra',
        noDocuments: 'Ingen dokument enno. Klikk "Ny tekst" for å byrje.',
        deleteConfirmTitle: 'Slett dokument',
        deleteConfirmMessage: 'Er du sikker på at du vil slette "{{title}}"? Dette kan ikkje angrast.',
        deleteConfirmYes: 'Ja, slett',
        saved: 'Lagra',
        saving: 'Lagrar...',
        placeholder: 'Byrj å skrive her...',
        backToDocuments: 'Mine dokument',
        downloadTxt: 'Last ned .txt',
        downloadPdf: 'Last ned PDF',
        titlePlaceholder: 'Gje dokumentet ein tittel...',
        wordsWritten: '{{count}} ord skrive',
        documentsCount: '{{count}} dokument',
        exportTitle: 'Eksporter',

        // Advanced toggle + TOC
        advancedToggle: 'Avansert',
        advancedOn: 'Avansert modus på',
        advancedOff: 'Avansert modus av',
        advancedDisableConfirmTitle: 'Slå av avansert modus?',
        advancedDisableConfirmMessage: 'Overskrifter vert haldne som feit tekst og kan gjenopprettast. Lister vert haldne.',
        advancedDisableConfirmYes: 'Ja, slå av',
        strukturComingSoon: 'Kjem snart',
        tocTitle: 'Innhaldsliste',
        tocEmpty: 'Legg til overskrifter (H1/H2) for å byggje innhaldslista.',

        // References
        refButton: 'Kjelde',
        refTitle: 'Kjeldeliste',
        refDialogTitle: 'Legg til kjelde',
        refDialogEdit: 'Rediger kjelde',
        refTypeBook: 'Bok',
        refTypeWeb: 'Nettside',
        refTypeArticle: 'Artikkel',
        refAuthor: 'Forfattar(ar)',
        refYear: 'Årstal',
        refSourceTitle: 'Tittel',
        refUrl: 'URL (valfritt)',
        refPublisher: 'Forlag/utgjevar (valfritt)',
        refAdd: 'Legg til',
        refUpdate: 'Oppdater',
        refDelete: 'Slett kjelde',
        refDeleteConfirm: 'Vil du slette denne kjelda? Referansemarkøren i teksten vert fjerna òg.',

        // Writing frames (Skriverammer)
        strukturTooltip: 'Vel skriveramme',
        frameSelectorTitle: 'Vel skriveramme',
        frameDroefting: 'Drøfting',
        frameDroeftingDesc: 'Argument for og mot med trestegsmetoden',
        frameAnalyse: 'Analyse',
        frameAnalyseDesc: 'Strukturert analyse av tekst eller verk',
        frameKronikk: 'Kronikk',
        frameKronikkDesc: 'Argumenterande tekst om eit aktuelt tema',
        frameRemove: 'Fjern skriveramme',
        frameRemoveConfirmTitle: 'Fjerne skriveramma?',
        frameRemoveConfirmMessage: 'Seksjonsoverskrifter og ubrukte leidetekstar vert fjerna. Teksten du har skrive vert halden.',
        frameRemoveConfirmYes: 'Ja, fjern',
        frameApplyConfirmTitle: 'Setje inn skriveramme?',
        frameApplyConfirmMessage: 'Dokumentet inneheld allereie tekst. Skriveramma vert sett inn i tillegg til eksisterande innhald.',
        frameApplyConfirmYes: 'Ja, set inn',
        frameActive: 'Skriveramme aktiv',

        // Trash
        trashButton: 'Papirkorg',
        trashEmpty: 'Papirkorga er tom.',
        trashInfo: {
            one: 'Dokument vert sletta permanent etter {{days}} dag.',
            other: 'Dokument vert sletta permanent etter {{days}} dagar.',
        },
        trashRestore: 'Gjenopprett',
        trashDeletePermanently: 'Slett permanent',
        trashDeletePermanentlyConfirmTitle: 'Slette permanent?',
        trashDeletePermanentlyConfirmMessage: 'Er du sikker? "{{title}}" kan ikkje gjenopprettast etter dette.',
        trashDeletePermanentlyConfirmYes: 'Ja, slett permanent',
        trashEmptyAll: 'Tøm papirkorg',
        trashEmptyAllConfirmTitle: 'Tømme papirkorga?',
        trashEmptyAllConfirmMessage: {
            one: '{{count}} dokument i papirkorga vert sletta permanent. Dette kan ikkje angrast.',
            other: 'Alle {{count}} dokument i papirkorga vert sletta permanent. Dette kan ikkje angrast.',
        },
        trashEmptyAllConfirmYes: 'Ja, tøm alt',
        trashRestored: 'Dokumentet er gjenoppretta',
        trashMoveToTrash: 'Flytt til papirkorg',
        deleteConfirmMessageTrash: {
            one: 'Dokumentet "{{title}}" vert flytta til papirkorga. Du kan gjenopprette det innan {{days}} dag.',
            other: 'Dokumentet "{{title}}" vert flytta til papirkorga. Du kan gjenopprette det innan {{days}} dagar.',
        },
        deleteConfirmYesTrash: 'Ja, flytt til papirkorg',
        trashCount: {
            one: '{{count}} i papirkorga',
            other: '{{count}} i papirkorga',
        },
    },
};
