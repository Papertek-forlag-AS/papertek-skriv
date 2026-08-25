/**
 * Editor Language Attributes
 *
 * Keeps the contenteditable's `lang` and `spellcheck` attributes in sync
 * with the language the pupil is writing in. `lang` drives screen-reader
 * pronunciation, hyphenation and the browser's spell-check dictionary;
 * `spellcheck` is turned OFF whenever an external spell-checker
 * (Leksihjelp, embedded or extension) owns the page, so the pupil never
 * sees two competing sets of squiggles.
 *
 * The host wires in getters/subscriptions (typically from the Leksihjelp
 * bridge); the module works standalone with static defaults.
 */

/** Writing-language codes → BCP 47 tags for the `lang` attribute. */
const LANG_TAGS = {
    nb: 'nb-NO',
    nn: 'nn-NO',
    en: 'en',
    de: 'de',
    es: 'es',
    fr: 'fr',
};

/**
 * Resolve a writing-language code to a BCP 47 tag.
 * Unknown codes pass through unchanged (better than lying with nb-NO).
 * @param {string} lang
 * @returns {string}
 */
export function langToTag(lang) {
    return LANG_TAGS[lang] || lang || 'nb-NO';
}

/**
 * Initialize editor language-attribute syncing.
 * @param {HTMLElement} editor - The contenteditable element
 * @param {object} [options]
 * @param {() => string} [options.getWritingLang] - Language the pupil writes in ('nb'|'nn'|'en'|'de'|...)
 * @param {(fn: (lang: string) => void) => (() => void)} [options.onWritingLangChange] - Subscribe; returns unsubscribe
 * @param {() => boolean} [options.hasExternalSpellcheck] - True when an external spell-checker owns the page
 * @param {(fn: () => void) => (() => void)} [options.onSpellcheckOwnerChange] - Subscribe; returns unsubscribe
 * @returns {{ refresh: () => void, destroy: () => void }}
 */
export function initEditorLang(editor, options = {}) {
    const {
        getWritingLang,
        onWritingLangChange,
        hasExternalSpellcheck,
        onSpellcheckOwnerChange,
    } = options;

    function refresh() {
        const lang = getWritingLang ? getWritingLang() : 'nb';
        editor.setAttribute('lang', langToTag(lang));
        const external = hasExternalSpellcheck ? hasExternalSpellcheck() : false;
        editor.setAttribute('spellcheck', external ? 'false' : 'true');
    }

    refresh();

    const unsubs = [];
    if (onWritingLangChange) unsubs.push(onWritingLangChange(() => refresh()));
    if (onSpellcheckOwnerChange) unsubs.push(onSpellcheckOwnerChange(() => refresh()));

    function destroy() {
        for (const unsub of unsubs) {
            try { unsub(); } catch (_) { /* ignore */ }
        }
        unsubs.length = 0;
    }

    return { refresh, destroy };
}
