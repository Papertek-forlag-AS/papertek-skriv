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

/**
 * Get the SVG icon markup for the current theme (for toggle buttons).
 * moon = dark, sun = light, monitor = system.
 * @returns {string}
 */
export function getThemeIconSVG() {
    const theme = getTheme();
    if (theme === 'dark') {
        return '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"/></svg>';
    }
    if (theme === 'light') {
        return '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"/></svg>';
    }
    return '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>';
}
