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
 * Escape a string for safe insertion into an HTML attribute.
 */
export function escapeAttr(str) {
    return (str || '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
