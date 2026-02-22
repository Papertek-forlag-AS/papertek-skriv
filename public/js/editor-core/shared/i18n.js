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
const SUPPORTED_LANGUAGES = ['nb', 'en'];

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
 * Translate a key with optional interpolation.
 * Returns the key itself if no translation is found.
 */
export function t(key, params) {
    const value = resolveKey(_translations, key);
    if (value === undefined) {
        console.warn(`[i18n] Missing translation: "${key}" (${_currentLanguage})`);
        return key;
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
 * Get list of supported languages with display names.
 */
export function getSupportedLanguages() {
    return [
        { code: 'nb', name: 'Norsk bokmål' },
        { code: 'en', name: 'English' }
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
