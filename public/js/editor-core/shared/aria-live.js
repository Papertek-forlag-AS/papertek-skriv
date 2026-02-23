/**
 * ARIA live region for screen reader announcements.
 * Creates a hidden live region and provides an announce() function.
 * Used for: auto-save status, search results count, toast messages.
 */

let _liveRegion = null;

/**
 * Get or create the aria-live region.
 */
function getLiveRegion() {
    if (_liveRegion && document.body.contains(_liveRegion)) return _liveRegion;

    _liveRegion = document.createElement('div');
    _liveRegion.setAttribute('aria-live', 'polite');
    _liveRegion.setAttribute('aria-atomic', 'true');
    _liveRegion.setAttribute('role', 'status');
    _liveRegion.className = 'sr-only';
    _liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);border:0;';
    document.body.appendChild(_liveRegion);

    return _liveRegion;
}

/**
 * Announce a message to screen readers.
 * @param {string} message - The text to announce
 */
export function announce(message) {
    const region = getLiveRegion();
    // Clear then set — forces re-announcement even if same text
    region.textContent = '';
    requestAnimationFrame(() => {
        region.textContent = message;
    });
}
