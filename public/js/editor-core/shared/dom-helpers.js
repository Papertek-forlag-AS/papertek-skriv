/**
 * Shared DOM helpers.
 * Small utility functions used across multiple modules.
 *
 * Usage:
 *   import { getModalParent } from './dom-helpers.js';
 */

/**
 * Return the best parent element for modal overlays.
 * Works in fullscreen mode, fake-fullscreen mode, and normal mode.
 */
export function getModalParent() {
    return document.fullscreenElement
        || document.webkitFullscreenElement
        || document.querySelector('[data-fake-fullscreen]')
        || document.body;
}
