/**
 * English (en) translations for Skriv.
 *
 * Pluralization: keys that depend on a count can use object form:
 *   { one: '...', other: '...' }
 * The correct form is selected by t() based on params.count.
 * Plain strings still work — backward compatible.
 */
export default {
    common: {
        loading: 'Loading...',
        error: 'Something went wrong. Try again.',
        cancel: 'Cancel',
        confirm: 'Confirm',
        ok: 'OK',
        back: 'Back',
        delete: 'Delete',
    },

    export: {
        defaultTitle: 'Document',
        author: 'Author: {{name}}',
        authorFallback: 'Unknown',
        date: 'Date: {{date}}',
        wordCount: {
            one: 'Word count: {{count}}',
            other: 'Word count: {{count}}',
        },
        pdfNotLoaded: 'PDF library is not loaded. Try downloading as .txt instead.',
    },

    time: {
        now: 'Now',
        minutesAgo: {
            one: '{{count}} min ago',
            other: '{{count}} min ago',
        },
        hoursAgo: {
            one: '{{count}} hr ago',
            other: '{{count}} hrs ago',
        },
        yesterday: 'Yesterday',
        daysAgo: {
            one: '{{count}} day ago',
            other: '{{count}} days ago',
        },
    },

    specialChars: {
        prompt: 'Other language?',
        pickerTitle: 'Choose language:',
    },

    wordCounter: {
        count: {
            one: '{{count}} word',
            other: '{{count}} words',
        },
        goalRange: '(goal: {{min}}\u2013{{max}})',
        goalMin: '(goal: at least {{min}})',
        goalMax: '(goal: max {{max}})',
    },

    stats: {
        title: 'Writing Statistics',
        totalWords: 'Total words',
        totalDocuments: {
            one: '{{count}} document',
            other: '{{count}} documents',
        },
        avgPerDocument: 'Average per document',
        perDocument: 'Words per document',
        writingActivity: 'Writing activity',
        noData: 'No documents to show statistics for yet.',
        close: 'Close',
        wordsUnit: 'words',
        monthNames: 'Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec',
    },

    search: {
        placeholder: 'Search documents...',
        noResults: 'No documents found',
        clear: 'Clear search',
        resultsCount: {
            one: '{{count}} of {{total}} document',
            other: '{{count}} of {{total}} documents',
        },
    },

    tags: {
        all: 'All',
        addTag: 'Add tag',
        removeTag: 'Remove tag',
        filter: 'Filter by tag',
    },

    sidebar: {
        title: 'Subjects',
        recentDocs: 'Recent documents',
        orphans: 'No subject',
        personalFolder: 'Personal folder',
        addSubject: 'Add subject',
        removeSubject: 'Remove subject',
        chooseSubject: 'Choose subject',
        schoolYear: 'School year',
        orphanPrompt: {
            one: '{{count}} document without subject',
            other: '{{count}} documents without subject',
        },
        moved: 'Moved to {{subject}}',
        dragHint: 'Drag to a folder',
        dropHere: 'Drop here',
        personalDesc: 'Personal texts',
        customSubjectPlaceholder: 'Subject name...',
        deleteSubject: 'Remove subject from list',
        deleteSubjectConfirm: 'Remove "{{subject}}" from list? Documents keep their subject.',
        noSubject: 'No subject',
        subjectLabel: 'Subject',
        showAllSubjects: 'Show all subjects ({{count}})',
        hideSubjects: 'Show fewer',
    },

    sw: {
        updateAvailable: 'A new version is available.',
        updateNow: 'Update now',
        updating: 'Updating...',
    },

    level: {
        choose: 'Choose level',
        title: 'What grade level are you in?',
        subtitle: 'We will adjust the subjects to your level. You can change this later.',
        barneskole: 'Primary school',
        barneskoleSub: 'Grades 1–7',
        ungdomsskole: 'Lower secondary',
        ungdomsskoleSub: 'Grades 8–10',
        vg1: 'Upper secondary year 1',
        vg1Sub: 'First year of upper secondary',
        vg2: 'Upper secondary year 2',
        vg2Sub: 'Second year of upper secondary',
        vg3: 'Upper secondary year 3',
        vg3Sub: 'Third year of upper secondary',
        changeLevel: 'Change level',
    },

    language: {
        label: 'Language',
    },

    theme: {
        toggle: 'Switch theme',
        light: 'Light mode',
        dark: 'Dark mode',
        system: 'System preference',
    },

    spinner: {
        title: 'Word Spinner',
        spin: 'Spin!',
        clickToSpin: 'Click "Spin!" for a suggestion',
        synonymTitle: 'Other words for "{{word}}":',
        cat: {
            innledning: 'Introduction',
            argument: 'Argument',
            motargument: 'Counter-argument',
            eksempel: 'Example',
            overgang: 'Transition',
            avslutning: 'Conclusion',
            kilde: 'Source reference',
        },
    },

    radar: {
        button: 'Repetition',
        tooltip: '"{{word}}" is used {{count}} times',
        on: 'Repetition radar on',
        off: 'Repetition radar off',
    },

    sentence: {
        button: 'Sentence length',
        on: 'Sentence length view on',
        off: 'Sentence length view off',
        tooltipLong: 'Long sentence ({{count}} words)',
        tooltipVeryLong: 'Very long sentence ({{count}} words)',
        avgLength: 'Avg: {{avg}} words/sentence',
    },

    paragraphMap: {
        button: 'Paragraph map',
        on: 'Paragraph map on',
        off: 'Paragraph map off',
        words: 'words',
        ariaLabel: 'Paragraph map — visual overview of text structure',
    },

    image: {
        button: 'Image',
        captionPlaceholder: 'Caption...',
        tooLarge: 'Image is too large (max 5 MB)',
        invalidType: 'Invalid file type. Use PNG, JPEG or GIF.',
        deleted: 'Image removed',
    },

    checklist: {
        title: 'Pre-submission checklist',
        proceed: 'Download',
        cancel: 'Cancel',
        hasTitle: 'The document has a title',
        hasWords: 'The text has at least 100 words',
        hasSources: 'Sources have been added',
        introConclusion: 'Introduction and conclusion are written',
        spellCheck: 'Spelling and language have been checked',
        droefting: {
            question: 'The thesis is presented in the introduction',
            argFor: 'At least one argument for with claim, evidence and explanation',
            argAgainst: 'At least one counter-argument with claim, evidence and explanation',
            conclusion: 'The conclusion takes a clear position',
        },
        analyse: {
            work: 'The work is presented (title, author, year)',
            structure: 'Structure and composition are analysed',
            devices: 'Literary devices are identified with examples',
            interpretation: 'Interpretation is given with reasoning',
        },
        kronikk: {
            hook: 'The introduction captures attention',
            position: 'A clear stance is presented',
            arguments: 'At least two main arguments are presented',
            counterArg: 'A counter-argument is presented and addressed',
        },
    },

    matte: {
        superscriptTooltip: 'Superscript (Ctrl+.)',
        subscriptTooltip: 'Subscript (Ctrl+,)',
    },

    // Skriv-specific
    skriv: {
        appName: 'Papertek Skriv',
        tagline: 'Your personal writing workshop',
        newDocument: 'New text',
        untitled: 'Untitled',
        lastEdited: 'Last edited',
        noDocuments: 'No documents yet. Click "New text" to get started.',
        deleteConfirmTitle: 'Delete document',
        deleteConfirmMessage: 'Are you sure you want to delete "{{title}}"? This cannot be undone.',
        deleteConfirmYes: 'Yes, delete',
        saved: 'Saved',
        saving: 'Saving...',
        placeholder: 'Start writing here...',
        backToDocuments: 'My documents',
        downloadTxt: 'Download .txt',
        downloadPdf: 'Download PDF',
        titlePlaceholder: 'Give your document a title...',
        wordsWritten: {
            one: '{{count}} word written',
            other: '{{count}} words written',
        },
        documentsCount: {
            one: '{{count}} document',
            other: '{{count}} documents',
        },
        exportTitle: 'Export',

        // Advanced toggle + TOC
        advancedToggle: 'Advanced',
        advancedOn: 'Advanced mode on',
        advancedOff: 'Advanced mode off',
        advancedDisableConfirmTitle: 'Turn off advanced mode?',
        advancedDisableConfirmMessage: 'Headings are kept as bold text and can be restored. Lists are kept.',
        advancedDisableConfirmYes: 'Yes, turn off',
        strukturComingSoon: 'Coming soon',
        tocTitle: 'Table of Contents',
        tocEmpty: 'Add headings (H1/H2) to build the table of contents.',

        // References
        refButton: 'Cite',
        refTitle: 'References',
        refDialogTitle: 'Add source',
        refDialogEdit: 'Edit source',
        refTypeBook: 'Book',
        refTypeWeb: 'Website',
        refTypeArticle: 'Article',
        refAuthor: 'Author(s)',
        refYear: 'Year',
        refSourceTitle: 'Title',
        refUrl: 'URL (optional)',
        refPublisher: 'Publisher (optional)',
        refAdd: 'Add',
        refUpdate: 'Update',
        refDelete: 'Delete source',
        refDeleteConfirm: 'Delete this source? The citation marker in the text will also be removed.',

        // Writing frames
        strukturTooltip: 'Choose writing frame',
        frameSelectorTitle: 'Choose writing frame',
        frameDroefting: 'Discussion',
        frameDroeftingDesc: 'Arguments for and against with structured reasoning',
        frameAnalyse: 'Analysis',
        frameAnalyseDesc: 'Structured analysis of a text or work',
        frameKronikk: 'Op-ed',
        frameKronikkDesc: 'Argumentative text on a current topic',
        frameRemove: 'Remove writing frame',
        frameRemoveConfirmTitle: 'Remove writing frame?',
        frameRemoveConfirmMessage: 'Section headers and unused prompts will be removed. Your written text is kept.',
        frameRemoveConfirmYes: 'Yes, remove',
        frameApplyConfirmTitle: 'Insert writing frame?',
        frameApplyConfirmMessage: 'The document already contains text. The writing frame will be added alongside existing content.',
        frameApplyConfirmYes: 'Yes, insert',
        frameActive: 'Writing frame active',

        // Trash
        trashButton: 'Trash',
        trashEmpty: 'Trash is empty.',
        trashInfo: {
            one: 'Documents are permanently deleted after {{days}} day.',
            other: 'Documents are permanently deleted after {{days}} days.',
        },
        trashRestore: 'Restore',
        trashDeletePermanently: 'Delete permanently',
        trashDeletePermanentlyConfirmTitle: 'Delete permanently?',
        trashDeletePermanentlyConfirmMessage: 'Are you sure? "{{title}}" cannot be recovered after this.',
        trashDeletePermanentlyConfirmYes: 'Yes, delete permanently',
        trashEmptyAll: 'Empty trash',
        trashEmptyAllConfirmTitle: 'Empty the trash?',
        trashEmptyAllConfirmMessage: {
            one: '{{count}} document in the trash will be permanently deleted. This cannot be undone.',
            other: 'All {{count}} documents in the trash will be permanently deleted. This cannot be undone.',
        },
        trashEmptyAllConfirmYes: 'Yes, empty all',
        trashRestored: 'Document has been restored',
        trashMoveToTrash: 'Move to trash',
        deleteConfirmMessageTrash: {
            one: '"{{title}}" will be moved to the trash. You can restore it within {{days}} day.',
            other: '"{{title}}" will be moved to the trash. You can restore it within {{days}} days.',
        },
        deleteConfirmYesTrash: 'Yes, move to trash',
        trashCount: {
            one: '{{count}} in trash',
            other: '{{count}} in trash',
        },
    },
};
