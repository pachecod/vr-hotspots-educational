const { getBlockedExtensions } = require('./app-settings');
const { getExtension, assertAllowedFlatFilename } = require('./flat-page-files');

async function isExtensionBlocked(filename) {
  const blocked = await getBlockedExtensions();
  const ext = getExtension(filename);
  return !!(ext && blocked.includes(ext));
}

module.exports = {
  getBlockedExtensions,
  isExtensionBlocked,
  assertUploadAllowed: assertAllowedFlatFilename,
};
