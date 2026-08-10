/**
 * Classic-script copy of flat-editor/previewSandbox.js for flat-page-editor.js.
 * Keep the elevated-editor checks identical (adminReview / adminTemplate / adminAssign).
 * security-regression.js asserts parity with the ESM module.
 */
(function (global) {
  function isAdminElevatedEditorSession(search) {
    try {
      const params = new URLSearchParams(
        search == null ? (typeof global.location !== 'undefined' ? global.location.search : '') : search
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

  function getPreviewSandboxAttribute(search) {
    if (isAdminElevatedEditorSession(search)) {
      return 'allow-scripts allow-modals allow-popups allow-forms';
    }
    return 'allow-scripts allow-same-origin allow-modals allow-popups allow-forms';
  }

  global.isAdminElevatedEditorSession = isAdminElevatedEditorSession;
  global.getPreviewSandboxAttribute = getPreviewSandboxAttribute;
})(typeof window !== 'undefined' ? window : globalThis);
