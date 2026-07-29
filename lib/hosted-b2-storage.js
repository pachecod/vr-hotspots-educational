const fs = require('fs');
const path = require('path');
const b2Service = require('../services/b2-service');
const { getContentType } = require('./common-assets');
const { contentTypeForFilename } = require('./flat-page-files');

const HOSTED_B2_PREFIX = 'hosted-projects/';
const HOSTED_DIR = path.join(process.cwd(), 'hosted-projects');

let _hostedDirOverride = null;

function getHostedDir() {
  return _hostedDirOverride || HOSTED_DIR;
}

function setHostedDirForTests(dir) {
  _hostedDirOverride = dir || null;
}

function usesB2HostedStorage() {
  if (_hostedDirOverride) return false;
  return Boolean(process.env.B2_KEY_ID && process.env.B2_APP_KEY && process.env.B2_BUCKET_NAME);
}

function validateHostedPath(hostedPath) {
  return typeof hostedPath === 'string' && /^[a-zA-Z0-9_-]+$/.test(hostedPath);
}

function normalizeRelativePath(relativePath) {
  const normalized = String(relativePath || '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '');
  if (!normalized || normalized.includes('..')) return null;
  return normalized;
}

function buildRemotePath(hostedPath, relativePath) {
  const rel = normalizeRelativePath(relativePath);
  if (!validateHostedPath(hostedPath) || !rel) return null;
  return `${HOSTED_B2_PREFIX}${hostedPath}/${rel}`;
}

function buildPrefix(hostedPath) {
  if (!validateHostedPath(hostedPath)) return null;
  return `${HOSTED_B2_PREFIX}${hostedPath}/`;
}

function localProjectDir(hostedPath) {
  if (!validateHostedPath(hostedPath)) return null;
  return path.join(getHostedDir(), hostedPath);
}

function contentTypeForRelativePath(relativePath) {
  const ext = path.extname(relativePath).toLowerCase();
  if (['.html', '.htm', '.css', '.js', '.mjs', '.json', '.md', '.txt', '.xml', '.svg', '.csv', '.yaml', '.yml'].includes(ext)) {
    return contentTypeForFilename(path.basename(relativePath));
  }
  return getContentType(path.basename(relativePath));
}

function walkLocalFiles(dir, baseDir = dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkLocalFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      const relativePath = path.relative(baseDir, fullPath).split(path.sep).join('/');
      results.push({ fullPath, relativePath });
    }
  }
  return results;
}

async function hostedProjectExists(hostedPath) {
  if (!validateHostedPath(hostedPath)) return false;
  if (usesB2HostedStorage()) {
    try {
      await b2Service.ensureCommonAssetsBucket();
      const info = await b2Service.getCommonAssetFileInfo(buildRemotePath(hostedPath, 'index.html'));
      return Boolean(info);
    } catch {
      return false;
    }
  }
  return fs.existsSync(path.join(localProjectDir(hostedPath), 'index.html'));
}

async function uploadHostedBuffer(hostedPath, relativePath, buffer, contentType) {
  const remotePath = buildRemotePath(hostedPath, relativePath);
  if (!remotePath) throw new Error('Invalid hosted path or file path');
  if (usesB2HostedStorage()) {
    await b2Service.ensureCommonAssetsBucket();
    await b2Service.uploadCommonAssetBuffer(
      buffer,
      remotePath,
      contentType || contentTypeForRelativePath(relativePath)
    );
    return;
  }
  const target = path.join(localProjectDir(hostedPath), relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, buffer);
}

async function uploadHostedUtf8(hostedPath, relativePath, content) {
  await uploadHostedBuffer(
    hostedPath,
    relativePath,
    Buffer.from(String(content), 'utf8'),
    contentTypeForRelativePath(relativePath)
  );
}

async function uploadHostedFileFromDisk(hostedPath, localFilePath, relativePath) {
  const rel = relativePath || path.basename(localFilePath);
  const remotePath = buildRemotePath(hostedPath, rel);
  if (!remotePath) throw new Error('Invalid hosted path or file path');
  if (usesB2HostedStorage()) {
    await b2Service.ensureCommonAssetsBucket();
    await b2Service.uploadCommonAsset(
      localFilePath,
      remotePath,
      contentTypeForRelativePath(rel)
    );
    return;
  }
  const target = path.join(localProjectDir(hostedPath), rel);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(localFilePath, target);
}

async function uploadHostedDirectory(localDir, hostedPath) {
  if (!validateHostedPath(hostedPath)) throw new Error('Invalid hosted path');
  await deleteHostedProject(hostedPath);
  const files = walkLocalFiles(localDir);
  for (const file of files) {
    await uploadHostedFileFromDisk(hostedPath, file.fullPath, file.relativePath);
  }
}

async function readHostedFileUtf8(hostedPath, relativePath) {
  const buffer = await readHostedFileBuffer(hostedPath, relativePath);
  return buffer.toString('utf8');
}

async function readHostedFileBuffer(hostedPath, relativePath) {
  const remotePath = buildRemotePath(hostedPath, relativePath);
  if (!remotePath) throw new Error('Invalid hosted path or file path');
  if (usesB2HostedStorage()) {
    await b2Service.ensureCommonAssetsBucket();
    const { stream } = await b2Service.downloadCommonAssetStream(remotePath);
    const chunks = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  const localPath = path.join(localProjectDir(hostedPath), relativePath);
  return fs.readFileSync(localPath);
}

async function downloadHostedStream(hostedPath, relativePath, options = {}) {
  const remotePath = buildRemotePath(hostedPath, relativePath);
  if (!remotePath) {
    const err = new Error('Invalid hosted path or file path');
    err.statusCode = 400;
    throw err;
  }
  if (usesB2HostedStorage()) {
    await b2Service.ensureCommonAssetsBucket();
    try {
      return await b2Service.downloadCommonAssetStream(remotePath, options);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 404) {
        const notFound = new Error('Not found');
        notFound.statusCode = 404;
        throw notFound;
      }
      throw err;
    }
  }
  const localPath = path.join(localProjectDir(hostedPath), relativePath);
  if (!fs.existsSync(localPath)) {
    const notFound = new Error('Not found');
    notFound.statusCode = 404;
    throw notFound;
  }
  const stat = fs.statSync(localPath);
  const stream = fs.createReadStream(localPath);
  return {
    stream,
    statusCode: 200,
    headers: { 'content-length': String(stat.size) },
  };
}

async function hostedFileExists(hostedPath, relativePath) {
  if (usesB2HostedStorage()) {
    try {
      await b2Service.ensureCommonAssetsBucket();
      const info = await b2Service.getCommonAssetFileInfo(buildRemotePath(hostedPath, relativePath));
      return Boolean(info);
    } catch {
      return false;
    }
  }
  return fs.existsSync(path.join(localProjectDir(hostedPath), relativePath));
}

async function deleteHostedProject(hostedPath) {
  if (!validateHostedPath(hostedPath)) return false;
  if (usesB2HostedStorage()) {
    try {
      await b2Service.ensureCommonAssetsBucket();
      await b2Service.deleteCommonAssetPrefix(buildPrefix(hostedPath));
    } catch (err) {
      console.warn(`Hosted B2 delete failed for ${hostedPath}:`, err.message);
    }
  }
  const localDir = localProjectDir(hostedPath);
  if (fs.existsSync(localDir)) {
    fs.rmSync(localDir, { recursive: true, force: true });
    return true;
  }
  return usesB2HostedStorage();
}

async function listHostedProjectPaths() {
  const paths = new Set();
  if (usesB2HostedStorage()) {
    try {
      await b2Service.ensureCommonAssetsBucket();
      const files = await b2Service.listCommonAssetFiles(HOSTED_B2_PREFIX);
      for (const file of files) {
        const name = file.fileName || '';
        const rest = name.slice(HOSTED_B2_PREFIX.length);
        const segment = rest.split('/')[0];
        if (segment) paths.add(segment);
      }
    } catch (err) {
      console.warn('Could not list hosted projects from B2:', err.message);
    }
  }
  if (fs.existsSync(getHostedDir())) {
    for (const entry of fs.readdirSync(getHostedDir(), { withFileTypes: true })) {
      if (entry.isDirectory()) paths.add(entry.name);
    }
  }
  return [...paths];
}

async function syncLocalHostedProjectsToB2() {
  const hostedDir = getHostedDir();
  if (!usesB2HostedStorage() || !fs.existsSync(hostedDir)) return 0;
  let uploaded = 0;
  for (const entry of fs.readdirSync(hostedDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || !validateHostedPath(entry.name)) continue;
    const existsOnB2 = await hostedProjectExists(entry.name);
    if (existsOnB2) continue;
    const localDir = path.join(hostedDir, entry.name);
    console.log(`ℹ️  Migrating hosted project "${entry.name}" from disk to B2...`);
    await uploadHostedDirectory(localDir, entry.name);
    uploaded++;
  }
  if (uploaded > 0) {
    console.log(`✅ Migrated ${uploaded} hosted project(s) from disk to B2`);
  }
  return uploaded;
}

async function getHostedProjectUpdatedAt(hostedPath) {
  if (!validateHostedPath(hostedPath)) return undefined;
  if (usesB2HostedStorage()) {
    try {
      await b2Service.ensureCommonAssetsBucket();
      const cfgInfo = await b2Service.getCommonAssetFileInfo(buildRemotePath(hostedPath, 'config.json'));
      if (cfgInfo?.uploadTimestamp) {
        return new Date(cfgInfo.uploadTimestamp).toISOString();
      }
      const indexInfo = await b2Service.getCommonAssetFileInfo(buildRemotePath(hostedPath, 'index.html'));
      if (indexInfo?.uploadTimestamp) {
        return new Date(indexInfo.uploadTimestamp).toISOString();
      }
    } catch (_) {}
    return undefined;
  }
  const cfgFile = path.join(localProjectDir(hostedPath), 'config.json');
  if (fs.existsSync(cfgFile)) return fs.statSync(cfgFile).mtime.toISOString();
  const indexFile = path.join(localProjectDir(hostedPath), 'index.html');
  if (fs.existsSync(indexFile)) return fs.statSync(indexFile).mtime.toISOString();
  return undefined;
}

async function materializeHostedProjectToDir(hostedPath, targetDir) {
  if (!validateHostedPath(hostedPath)) throw new Error('Invalid hosted path');
  if (fs.existsSync(targetDir)) {
    fs.rmSync(targetDir, { recursive: true, force: true });
  }
  fs.mkdirSync(targetDir, { recursive: true });

  if (usesB2HostedStorage()) {
    await b2Service.ensureCommonAssetsBucket();
    const prefix = buildPrefix(hostedPath);
    const files = await b2Service.listCommonAssetFiles(prefix);
    for (const file of files) {
      const remotePath = file.fileName || '';
      if (!remotePath.startsWith(prefix)) continue;
      const relativePath = remotePath.slice(prefix.length);
      if (!relativePath) continue;
      const { stream } = await b2Service.downloadCommonAssetStream(remotePath);
      const target = path.join(targetDir, relativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await new Promise((resolve, reject) => {
        const out = fs.createWriteStream(target);
        stream.pipe(out);
        out.on('finish', resolve);
        out.on('error', reject);
        stream.on('error', reject);
      });
    }
    return;
  }

  const sourceDir = localProjectDir(hostedPath);
  if (!fs.existsSync(sourceDir)) {
    throw new Error('Hosted project not found');
  }
  for (const file of walkLocalFiles(sourceDir)) {
    const target = path.join(targetDir, file.relativePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(file.fullPath, target);
  }
}

module.exports = {
  HOSTED_B2_PREFIX,
  HOSTED_DIR,
  getHostedDir,
  setHostedDirForTests,
  usesB2HostedStorage,
  validateHostedPath,
  normalizeRelativePath,
  buildRemotePath,
  buildPrefix,
  localProjectDir,
  contentTypeForRelativePath,
  walkLocalFiles,
  hostedProjectExists,
  uploadHostedBuffer,
  uploadHostedUtf8,
  uploadHostedFileFromDisk,
  uploadHostedDirectory,
  readHostedFileUtf8,
  readHostedFileBuffer,
  downloadHostedStream,
  hostedFileExists,
  deleteHostedProject,
  listHostedProjectPaths,
  syncLocalHostedProjectsToB2,
  materializeHostedProjectToDir,
  getHostedProjectUpdatedAt,
};
