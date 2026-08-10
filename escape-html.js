/**
 * Browser/global copy of lib/escape-html.js for classic <script> pages.
 * Keep in sync with lib/escape-html.js.
 */
(function (global) {
  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
  global.escapeHtml = escapeHtml;
})(typeof window !== 'undefined' ? window : globalThis);
