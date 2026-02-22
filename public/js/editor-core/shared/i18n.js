/**
 * Internationalization (i18n) module.
 * Simple key-value translation lookup with interpolation support.
 *
 * Usage:
 *   import { t } from './i18n.js';
 *   t('wordCounter.count', { count: 42 })  // => "42 ord"
 */

const STORAGE_KEY = 'skriv_language';
const DEFAULT_LANGUAGE = 'nb';
const SUPPORTED_LANGUAGES = ['nb', 'nn', 'en'];

/**
 * Map app language codes to BCP 47 date locale strings.
 */
const DATE_LOCALES = {
    nb: 'nb-NO',
    nn: 'nn-NO',
    en: 'en-US',
    uk: 'uk-UA',
    se: 'se-NO',
};

/**
 * Plural rules per language.
 * Each function takes a count (integer) and returns the plural form key.
 *
 * Forms used:
 *   nb/nn/en: 'one' | 'other'
 *   uk:       'one' | 'few' | 'many'   (Slavic plural rules)
 *   se:       'one' | 'two' | 'other'  (Sámi has dual number)
 */
const PLURAL_RULES = {
    // Norwegian Bokmål / Nynorsk: 1 = one, rest = other
    nb: (n) => n === 1 ? 'one' : 'other',
    nn: (n) => n === 1 ? 'one' : 'other',

    // English: same as Norwegian
    en: (n) => n === 1 ? 'one' : 'other',

    // Ukrainian: Slavic plural rules
    // one:  ends in 1, not 11 (1, 21, 31, 101...)
    // few:  ends in 2-4, not 12-14 (2, 3, 4, 22, 23, 24...)
    // many: everything else (0, 5-20, 25-30, 11-14...)
    uk: (n) => {
        const mod10 = n % 10;
        const mod100 = n % 100;
        if (mod10 === 1 && mod100 !== 11) return 'one';
        if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'few';
        return 'many';
    },

    // Northern Sámi: dual number
    // one: 1, two: 2, other: everything else
    se: (n) => n === 1 ? 'one' : n === 2 ? 'two' : 'other',
};

let _translations = {};
let _currentLanguage = DEFAULT_LANGUAGE;
let _initialized = false;
let _changeListeners = [];

/**
 * Resolve a nested key like 'wordCounter.count' from a translations object.
 */
function resolveKey(obj, key) {
    const parts = key.split('.');
    let current = obj;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = current[part];
    }
    return current;
}

/**
 * Interpolate placeholders: {{name}} => params.name
 */
function interpolate(str, params) {
    if (!params || typeof str !== 'string') return str;
    return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        return params[key] !== undefined ? String(params[key]) : match;
    });
}

/**
 * Initialize i18n. Must be called once before t() is used.
 * Auto-detects language from: localStorage > browser language > default (nb).
 */
export async function initI18n() {
    if (_initialized) return;

    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
        _currentLanguage = stored;
    } else {
        const browserLang = navigator.language?.split('-')[0];
        if (browserLang && SUPPORTED_LANGUAGES.includes(browserLang)) {
            _currentLanguage = browserLang;
        }
    }

    await loadLanguage(_currentLanguage);
    document.documentElement.lang = _currentLanguage;
    _initialized = true;
}

/**
 * Dynamically import the locale file for a given language.
 */
async function loadLanguage(lang) {
    try {
        const module = await import(`../locales/${lang}.js`);
        _translations = module.default || module.translations;
    } catch (err) {
        console.error(`Failed to load locale "${lang}", falling back to ${DEFAULT_LANGUAGE}:`, err);
        if (lang !== DEFAULT_LANGUAGE) {
            const fallback = await import(`../locales/${DEFAULT_LANGUAGE}.js`);
            _translations = fallback.default || fallback.translations;
            _currentLanguage = DEFAULT_LANGUAGE;
        }
    }
}

/**
 * Translate a key with optional interpolation and pluralization.
 *
 * If the resolved value is a string, interpolates and returns it (backward compatible).
 * If the resolved value is an object with plural form keys (one/two/few/many/other),
 * selects the correct form based on params.count and the current language's plural rules.
 *
 * Examples:
 *   t('wordCounter.count', { count: 1 })   // string value → "1 ord"
 *   t('time.daysAgo', { count: 3 })        // plural object → "3 dager siden" (nb)
 *
 * Plural object format in locale files:
 *   daysAgo: {
 *       one: '{{count}} dag siden',
 *       other: '{{count}} dager siden',
 *   }
 *
 * @param {string} key - Translation key (dot-separated)
 * @param {Record<string, any>} [params] - Interpolation params; count triggers pluralization
 * @returns {string}
 */
export function t(key, params) {
    const value = resolveKey(_translations, key);
    if (value === undefined) {
        console.warn(`[i18n] Missing translation: "${key}" (${_currentLanguage})`);
        return key;
    }

    // Plural object: pick the right form based on count
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        const count = params?.count;
        if (count === undefined) {
            // No count provided — fall back to 'other' or first available form
            const str = value.other || Object.values(value)[0] || key;
            return interpolate(str, params);
        }
        const rule = PLURAL_RULES[_currentLanguage] || PLURAL_RULES.nb;
        const form = rule(Math.abs(Number(count) || 0));
        // Try exact form, then 'other' as fallback
        const str = value[form] || value.other || Object.values(value)[0] || key;
        return interpolate(str, params);
    }

    return interpolate(value, params);
}

/**
 * Get the current active language code.
 */
export function getCurrentLanguage() {
    return _currentLanguage;
}

/**
 * Get the BCP 47 date locale string for the current language.
 * Used with toLocaleDateString() and similar Intl APIs.
 */
export function getDateLocale() {
    return DATE_LOCALES[_currentLanguage] || 'nb-NO';
}

/**
 * Get list of supported languages with display names.
 */
export function getSupportedLanguages() {
    return [
        { code: 'nb', name: 'Norsk bokmål' },
        { code: 'nn', name: 'Norsk nynorsk' },
        { code: 'en', name: 'English' },
    ];
}

/**
 * Change the active language. Persists to localStorage.
 */
export async function setLanguage(lang) {
    if (!SUPPORTED_LANGUAGES.includes(lang)) return;
    if (lang === _currentLanguage) return;

    _currentLanguage = lang;
    localStorage.setItem(STORAGE_KEY, lang);
    await loadLanguage(lang);
    document.documentElement.lang = lang;

    _changeListeners.forEach(fn => fn(lang));
}

/**
 * Register a callback for language changes.
 */
export function onLanguageChange(callback) {
    _changeListeners.push(callback);
    return () => {
        _changeListeners = _changeListeners.filter(fn => fn !== callback);
    };
}

/**
 * Render a language selector <select> element inside the given container.
 */
export function renderLanguageSelector(container) {
    const languages = getSupportedLanguages();
    const current = _currentLanguage;

    const select = document.createElement('select');
    select.className = 'text-xs border border-stone-300 rounded px-2 py-1 bg-white text-stone-600 cursor-pointer';
    select.setAttribute('aria-label', t('language.label'));

    languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang.code;
        option.textContent = lang.name;
        option.selected = lang.code === current;
        select.appendChild(option);
    });

    select.addEventListener('change', async () => {
        await setLanguage(select.value);
        window.location.reload();
    });

    container.appendChild(select);
}
