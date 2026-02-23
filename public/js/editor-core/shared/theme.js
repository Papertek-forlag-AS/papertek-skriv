/**
 * Theme manager for dark/light mode.
 * Applies a `.dark` class to <html> and persists preference in localStorage.
 * Supports three modes: 'light', 'dark', 'system' (follows OS).
 */

const STORAGE_KEY = 'skriv_theme';

let _mediaQuery = null;
let _mediaListener = null;

/**
 * Get the current theme setting.
 * @returns {'light'|'dark'|'system'}
 */
export function getTheme() {
    return localStorage.getItem(STORAGE_KEY) || 'system';
}

/**
 * Set the theme.
 * @param {'light'|'dark'|'system'} theme
 */
export function setTheme(theme) {
    localStorage.setItem(STORAGE_KEY, theme);
    applyTheme();
}

/**
 * Cycle through themes: system → light → dark → system.
 * @returns {'light'|'dark'|'system'} The new theme
 */
export function cycleTheme() {
    const order = ['system', 'light', 'dark'];
    const current = getTheme();
    const next = order[(order.indexOf(current) + 1) % order.length];
    setTheme(next);
    return next;
}

/**
 * Check if dark mode is currently active (resolved).
 * @returns {boolean}
 */
export function isDark() {
    return document.documentElement.classList.contains('dark');
}

/**
 * Apply the theme to the DOM.
 * Call this on page load and whenever theme changes.
 */
function applyTheme() {
    const theme = getTheme();
    const html = document.documentElement;

    if (theme === 'dark') {
        html.classList.add('dark');
    } else if (theme === 'light') {
        html.classList.remove('dark');
    } else {
        // system — follow OS preference
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        html.classList.toggle('dark', prefersDark);
    }
}

/**
 * Initialize theme on page load.
 * Sets up OS preference listener for 'system' mode.
 */
export function initTheme() {
    applyTheme();

    // Listen for OS theme changes
    _mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    _mediaListener = () => {
        if (getTheme() === 'system') {
            applyTheme();
        }
    };
    _mediaQuery.addEventListener('change', _mediaListener);
}

/**
 * Get the icon name for the current theme (for toggle buttons).
 * @returns {'sun'|'moon'|'monitor'}
 */
export function getThemeIcon() {
    const theme = getTheme();
    if (theme === 'light') return 'sun';
    if (theme === 'dark') return 'moon';
    return 'monitor';
}
