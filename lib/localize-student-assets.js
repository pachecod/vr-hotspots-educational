/**
 * Hosted pages must not depend on /student-assets/… links: those only load for the owning
 * student (or an admin). When a page or tour is hosted, copy the student asset files it uses
 * into the hosted copy under my-assets/<category>/ and point its links there.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const b2Service = require('../services/b2-service');
const { query, isDbEnabled } = require('../services/db-service');

const ASSET_DIR = 'my-assets';
const TEXT_EXTENSIONS = new Set(['.html', '.htm', '.css', '.js', '.mjs', '.json']);
// Optional origin, then /student-assets/<student uuid>/<category>/<filename>
const STUDENT_ASSET_URL_RE =
  /(?:https?:\/\/[^\s"'()<>]+?)?\/student-assets\/([0-9a-fA-F-]{36})\/([A-Za-z0-9_-]+)\/([^\s"'()<>?#\\]+)/g;

function safeDecode(value) {
  try {
    return decodeURIComponent(value);
  } catch (_) {
    return value;
  }
}

function isSafeFilename(name) {
  return !!name && name === path.basename(name) && name !== '.' && name !== '..';
}

function findStudentAssetRefs(text) {
  const refs = [];
  for (const match of String(text || '').matchAll(STUDENT_ASSET_URL_RE)) {
    refs.push({
      url: match[0],
      studentId: match[1].toLowerCase(),
      category: match[2],
      filename: safeDecode(match[3]),
    });
  }
  return refs;
}

async function lookupB2Path(ref) {
  if (!isDbEnabled()) return null;
  const { rows } = await query(
    `SELECT b2_path FROM student_assets
     WHERE student_id = $1 AND category = $2 AND filename = $3 AND ownership = 'student'`,
    [ref.studentId, ref.category, ref.filename]
  );
  return rows[0]?.b2_path || null;
}

/**
 * Download each referenced asset the caller may use into destRoot/my-assets/<category>/<file>.
 * Returns Map(url -> path relative to destRoot) for the assets that were copied.
 */
async function copyAssets(refs, destRoot, canUseStudent) {
  const byKey = new Map();
  const urlToRel = new Map();
  for (const ref of refs) {
    if (urlToRel.has(ref.url)) continue;
    if (!isSafeFilename(ref.filename) || !canUseStudent(ref.studentId)) continue;
    const key = `${ref.studentId}/${ref.category}/${ref.filename}`;
    if (!byKey.has(key)) {
      let rel = null;
      try {
        const b2Path = await lookupB2Path(ref);
        if (b2Path) {
          rel = `${ASSET_DIR}/${ref.category}/${ref.filename}`;
          const dest = path.join(destRoot, ASSET_DIR, ref.category, ref.filename);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          if (!fs.existsSync(dest)) await b2Service.downloadFile(b2Path, dest);
        }
      } catch (err) {
        console.warn('Could not copy student asset for hosting:', key, err.message);
        rel = null;
      }
      byKey.set(key, rel);
    }
    const rel = byKey.get(key);
    if (rel) urlToRel.set(ref.url, rel);
  }
  return urlToRel;
}

function rewriteText(text, fileRelPath, urlToRel) {
  const fromDir = path.posix.dirname(fileRelPath.split(path.sep).join('/'));
  return String(text).replace(STUDENT_ASSET_URL_RE, (url) => {
    const rel = urlToRel.get(url);
    if (!rel) return url;
    const relative = path.posix.relative(fromDir === '.' ? '' : fromDir, rel);
    return relative.split('/').map(encodeURIComponent).join('/');
  });
}

function listTextFiles(dir, base = dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTextFiles(full, base));
    else if (TEXT_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
      out.push({ full, rel: path.relative(base, full) });
    }
  }
  return out;
}

/** Localize student assets inside an extracted project directory (before it is uploaded). */
async function localizeStudentAssetsInDir(dir, { canUseStudent }) {
  const files = listTextFiles(dir).map((f) => ({ ...f, text: fs.readFileSync(f.full, 'utf8') }));
  const refs = files.flatMap((f) => findStudentAssetRefs(f.text));
  if (!refs.length) return { copied: 0 };
  const urlToRel = await copyAssets(refs, dir, canUseStudent);
  if (!urlToRel.size) return { copied: 0 };
  for (const f of files) {
    const next = rewriteText(f.text, f.rel, urlToRel);
    if (next !== f.text) fs.writeFileSync(f.full, next);
  }
  return { copied: new Set(urlToRel.values()).size };
}

/**
 * Localize student assets for an in-memory file list ({ name, content }) such as a flat page.
 * Returns rewritten files plus downloaded assets to upload ({ localPath, relativePath }) and a
 * cleanup() that removes the temporary download folder.
 */
async function localizeStudentAssetsInFiles(files, { canUseStudent }) {
  const refs = files.flatMap((f) =>
    TEXT_EXTENSIONS.has(path.extname(f.name).toLowerCase()) ? findStudentAssetRefs(f.content) : []
  );
  const noop = { files, assets: [], cleanup: () => {} };
  if (!refs.length) return noop;
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hosted-assets-'));
  const cleanup = () => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (_) {}
  };
  const urlToRel = await copyAssets(refs, tempDir, canUseStudent);
  if (!urlToRel.size) {
    cleanup();
    return noop;
  }
  const rewritten = files.map((f) =>
    TEXT_EXTENSIONS.has(path.extname(f.name).toLowerCase())
      ? { ...f, content: rewriteText(f.content, f.name, urlToRel) }
      : f
  );
  const assets = [...new Set(urlToRel.values())].map((rel) => ({
    relativePath: rel,
    localPath: path.join(tempDir, ...rel.split('/')),
  }));
  return { files: rewritten, assets, cleanup };
}

/** Whose assets a hosting request may copy: admins any student's, a student only their own, guests none. */
function studentAssetAccessFor(req) {
  const { getAdminSession } = require('../admin-auth');
  const { getStudentSession } = require('../student-auth');
  if (getAdminSession(req)) return () => true;
  const studentId = String(getStudentSession(req)?.studentId || '').toLowerCase();
  return (id) => !!studentId && String(id).toLowerCase() === studentId;
}

module.exports = {
  studentAssetAccessFor,
  localizeStudentAssetsInDir,
  localizeStudentAssetsInFiles,
  findStudentAssetRefs,
};
