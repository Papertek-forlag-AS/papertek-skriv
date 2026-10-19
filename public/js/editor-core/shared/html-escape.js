/**
 * HTML escape utilities.
 * Shared across all modules — single source of truth.
 *
 * Usage:
 *   import { escapeHtml, escapeAttr } from './html-escape.js';
 */

/**
 * Escape a string for safe insertion into HTML content.
 * Uses the browser's built-in text node escaping.
 */
export function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Escape a string for safe insertion into an HTML attribute (quoted with
 * either " or '). `&` is escaped first so text that looks like an entity
 * round-trips unchanged; null/undefined give '' and other values are
 * stringified instead of throwing.
 */
export function escapeAttr(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}
