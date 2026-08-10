/**
 * Shared live-preview iframe sandbox policy.
 * Used by Preview.jsx (React) and, via window export + preview-sandbox.js, by flat-page-editor.js.
 *
 * Match admin-auth-ui.js elevated-editor gate: adminReview, adminTemplate, adminAssign.
 * Keep allow-same-origin for normal student/guest editing (nested VR embeds need IndexedDB).
 */

export function isAdminElevatedEditorSession(
  search = typeof window !== 'undefined' ? window.location.search : ''
) {
  try {
    const params = new URLSearchParams(search);
    return (
      params.get('adminReview') === '1' ||
      !!params.get('adminTemplate') ||
      params.get('adminAssign') === '1'
    );
  } catch (_) {
    return false;
  }
}

export function getPreviewSandboxAttribute(search) {
  if (isAdminElevatedEditorSession(search)) {
    return 'allow-scripts allow-modals allow-popups allow-forms';
  }
  return 'allow-scripts allow-same-origin allow-modals allow-popups allow-forms';
}

if (typeof window !== 'undefined') {
  window.isAdminElevatedEditorSession = isAdminElevatedEditorSession;
  window.getPreviewSandboxAttribute = getPreviewSandboxAttribute;
}
