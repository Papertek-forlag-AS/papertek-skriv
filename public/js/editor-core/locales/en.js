/**
 * English (en) translations for Skriv.
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

    wordCounter: {
        count: '{{count}} words',
        goalRange: '(goal: {{min}}\u2013{{max}})',
        goalMin: '(goal: at least {{min}})',
        goalMax: '(goal: max {{max}})',
    },

    language: {
        label: 'Language',
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
        wordsWritten: '{{count}} words written',
        documentsCount: '{{count}} documents',
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
    },
};
