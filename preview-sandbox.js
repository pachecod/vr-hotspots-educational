/**
 * Classic-script fallback for flat-page-editor.js when flat-editor.bundle.js
 * has not loaded yet. Prefer the real implementation from
 * flat-editor/previewSandbox.js (exported on window by the bundle).
 *
 * Same pattern as escape-html.js: do not overwrite a global that already exists.
 */
(function (global) {
  function isAdminElevatedEditorSessionFallback(search) {
    try {
      const params = new URLSearchParams(
        search == null
          ? typeof global.location !== 'undefined'
            ? global.location.search
            : ''
          : search
      );
      return (
        params.get('adminReview') === '1' ||
        !!params.get('adminTemplate') ||
        params.get('adminAssign') === '1'
      );
    } catch (_) {
      return false;
    }
  }

  function getPreviewSandboxAttributeFallback(search) {
    if (
      (typeof global.isAdminElevatedEditorSession === 'function'
        ? global.isAdminElevatedEditorSession
        : isAdminElevatedEditorSessionFallback)(search)
    ) {
      return 'allow-scripts allow-modals allow-popups allow-forms';
    }
    return 'allow-scripts allow-same-origin allow-modals allow-popups allow-forms';
  }

  if (typeof global.isAdminElevatedEditorSession !== 'function') {
    global.isAdminElevatedEditorSession = isAdminElevatedEditorSessionFallback;
  }
  if (typeof global.getPreviewSandboxAttribute !== 'function') {
    global.getPreviewSandboxAttribute = getPreviewSandboxAttributeFallback;
  }
})(typeof window !== 'undefined' ? window : globalThis);
