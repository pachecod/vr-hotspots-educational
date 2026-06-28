function getEditorCapabilities() {
  const isTest = window.editorAccessMode === 'local_test';
  const isStudent = !!window.currentStudent;
  return {
    isTestUser: isTest,
    isStudent,
    /** Pick files from disk → IndexedDB/blob URLs for preview and ZIP export */
    canPickLocalFiles: true,
    /** Legacy alias — local file pickers */
    canUploadFiles: true,
    /** POST to server (My Assets, scene-video upload API, etc.) */
    canUploadToServer: isStudent,
    canUseCloudSave: isStudent,
    canSubmit: isStudent,
    canUseMyAssets: isStudent,
    canUseRidey: isStudent,
    canPublishVrTour: isStudent,
    canExport: true,
    canLoadZip: true,
    canUseSharedAssets: true,
  };
}

function applyEditorCapabilities() {
  const caps = getEditorCapabilities();

  const submitSection = document.getElementById('submit-to-professor')?.closest('.panel-section');
  if (submitSection) submitSection.style.display = caps.canSubmit ? '' : 'none';

  const cloudBtn = document.getElementById('save-cloud-draft');
  if (cloudBtn) cloudBtn.style.display = caps.canUseCloudSave ? '' : 'none';

  const subsBtn = document.getElementById('student-my-submissions-btn');
  if (subsBtn) subsBtn.style.display = caps.canSubmit ? '' : 'none';

  const githubBtn = document.getElementById('upload-github');
  if (githubBtn) githubBtn.style.display = caps.canUploadToServer ? '' : 'none';

  const myAssetsTab = document.querySelector('#common-assets-tabs [data-source="my"]');
  if (myAssetsTab) myAssetsTab.style.display = caps.canUseMyAssets ? '' : 'none';

  if (window.CommonAssetsPicker && !caps.canUseMyAssets) {
    window.CommonAssetsPicker.assetSource = 'shared';
    if (typeof window.CommonAssetsPicker.updateSourceUi === 'function') {
      window.CommonAssetsPicker.updateSourceUi();
    }
  }

  if (window.flatPageEditor && typeof window.flatPageEditor.onCapabilitiesChange === 'function') {
    window.flatPageEditor.onCapabilitiesChange(caps);
  }
}

function guardServerOnlyUpload() {
  if (!getEditorCapabilities().canUploadToServer) {
    alert('Sign in to upload files to the cloud. You can still choose local files for preview and export.');
    return false;
  }
  return true;
}

window.getEditorCapabilities = getEditorCapabilities;
window.applyEditorCapabilities = applyEditorCapabilities;
window.guardServerOnlyUpload = guardServerOnlyUpload;
