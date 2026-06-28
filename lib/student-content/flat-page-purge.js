const path = require('path');
const fs = require('fs');
const b2Service = require('../../services/b2-service');

const HOSTED_DIR = path.join(process.cwd(), 'hosted-projects');

function studentHostedPrefix(studentId) {
  const shortId = String(studentId).replace(/-/g, '').slice(0, 8);
  return `flat-${shortId}-`;
}

async function deleteFlatPageB2Files(b2Prefix, manifest) {
  if (!process.env.B2_KEY_ID || !b2Prefix) return;
  const manifestNames = Array.isArray(manifest)
    ? manifest.map((entry) => entry && entry.name).filter(Boolean)
    : [];
  for (const name of manifestNames) {
    try {
      await b2Service.deleteFile(`${b2Prefix}${name}`);
    } catch (err) {
      console.warn(`Flat page B2 delete failed for ${b2Prefix}${name}:`, err.message);
    }
  }
  try {
    const files = await b2Service.listFiles(b2Prefix);
    for (const file of files) {
      const remotePath = file.fileName || file.file_name;
      if (!remotePath || !remotePath.startsWith(b2Prefix)) continue;
      try {
        await b2Service.deleteFile(remotePath);
      } catch (err) {
        console.warn(`Flat page B2 delete failed for ${remotePath}:`, err.message);
      }
    }
  } catch (err) {
    console.warn('Flat page B2 prefix cleanup failed:', err.message);
  }
}

function removeHostedFlatPageDir(studentId, slug, hostedPathFromDb) {
  const candidates = new Set();
  if (hostedPathFromDb) candidates.add(hostedPathFromDb);
  if (studentId && slug) candidates.add(`${studentHostedPrefix(studentId)}${slug}`);
  for (const dirName of candidates) {
    if (!dirName || dirName.includes('..') || dirName.includes('/')) continue;
    const targetDir = path.join(HOSTED_DIR, dirName);
    if (!fs.existsSync(targetDir)) continue;
    try {
      fs.rmSync(targetDir, { recursive: true, force: true });
    } catch (err) {
      console.warn(`Hosted flat page delete failed for ${dirName}:`, err.message);
    }
  }
}

module.exports = {
  HOSTED_DIR,
  studentHostedPrefix,
  deleteFlatPageB2Files,
  removeHostedFlatPageDir,
};
