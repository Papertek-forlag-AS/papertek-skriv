/**
 * Leksihjelp — Report View Module (Phase 30-01)
 *
 * Mountable bug-report form. The form lives inside `#view-settings` today;
 * Task 2 may extract it as its own view container or keep it inline. See
 * SUMMARY for the final call.
 *
 * @typedef {Object} ReportViewDeps
 * @property {Object} runtime    - { sendMessage }
 * @property {Function} t        - i18n resolver
 * @property {string}  BACKEND_URL
 *
 * @returns {{ destroy(): void }}
 */
(function () {
  'use strict';

  function mountReportView(container, deps) {
    if (!container) throw new Error('mountReportView: container required');
    if (!deps) throw new Error('mountReportView: deps required');

    // TODO Plan 30-01 Task 2: move logic from popup.js — currently a no-op.
    return {
      destroy() { /* no-op until Task 2 */ },
    };
  }

  const host = typeof self !== 'undefined' ? self : globalThis;
  host.__lexiReportView = { mount: mountReportView };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { mount: mountReportView, mountReportView };
  }
})();
