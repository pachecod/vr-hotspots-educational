// Educational backend server for VR Hotspots

require('dotenv').config();
const { assertProductionSecrets } = require('./lib/security/production-secrets');
assertProductionSecrets();

const express = require('express');
const helmet = require('helmet');
const multer = require('multer');
const path = require('path');
const https = require('https');
const fs = require('fs');
const crypto = require('crypto');
const unzipper = require('unzipper');
const archiver = require('archiver');
const AdmZip = require('adm-zip');
const b2Service = require('./services/b2-service');
const { resolveHostedProjectUrls } = require('./services/hosted-project-urls');
const os = require('os');
const { requireAdmin } = require('./admin-auth');
const { registerCommonAssetRoutes } = require('./routes/common-assets-routes');
const { registerStripeWebhook } = require('./routes/stripe-webhook');
const { registerStudentRoutes } = require('./routes/student-routes');
const { registerRosterRoutes } = require('./routes/roster-routes');
const { registerStudentAssetRoutes } = require('./routes/student-assets-routes');
const { registerSceneVideoRoutes } = require('./routes/scene-video-routes');
const { registerBillingRoutes } = require('./routes/billing-routes');
const { registerSubmissionVersionRoutes } = require('./routes/submission-version-routes');
const { registerAdminStudentPeekRoutes } = require('./routes/admin-student-peek-routes');
const { registerAdminContentRoutes } = require('./routes/admin-content-routes');
const { registerFlatPageRoutes } = require('./routes/flat-page-routes');
const { registerVrTourRoutes } = require('./routes/vr-tour-routes');
const { registerSnippetRoutes } = require('./routes/snippet-routes');
const { registerRideyRoutes } = require('./routes/ridey-routes');
const { registerLocalTestUserRoutes } = require('./routes/local-test-user-routes');
const { rejectLocalTestUserWrites } = require('./lib/local-test-user');
const { registerTemplateRoutes } = require('./routes/template-routes');
const { registerPlaygroundRoutes } = require('./routes/playground-routes');
const { runMigrations, importSubmissionsFromJson } = require('./db/migrate');
const { isDbEnabled } = require('./services/db-service');
const {
  requireStudentStrict,
  isStudentAuthRequired,
  getStudentSession,
} = require('./student-auth');
const submissionsDb = require('./services/submissions-db');
const projectVersionsDb = require('./services/project-versions-db');
const { assertCanSubmit } = require('./services/usage-quota');
const { parseCookies } = require('./lib/session');
const {
  purgeLegacySubmission,
  purgeHostedSubmission,
} = require('./lib/student-content/purge');
const { assertSafeOutboundUrl } = require('./lib/security/ssrf-guard');
const { sanitizeReturnTo } = require('./lib/security/safe-redirect');
const { csrfGuard } = require('./lib/security/csrf-guard');
const { requireAuthForCloudWrites, cloudWritesRequireAuth } = require('./lib/security/cloud-write-auth');
const {
  createGitHubSession,
  getGitHubToken,
  clearGitHubSession,
  setGitHubSessionCookie,
} = require('./lib/github-oauth-store');

const app = express();
const upload = multer({ dest: 'temp-uploads/' });

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);
app.use((req, res, next) => {
  if (req.path.startsWith('/hosted/')) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob: https:; img-src * data: blob:; media-src * data: blob:; frame-src *;"
    );
  }
  next();
});
app.use(csrfGuard);

registerStripeWebhook(app);

const HOSTED_PROJECTS_FILE = path.join(__dirname, 'hosted-projects.json');

// Helper: robust submissions log loader (supports newline-delimited JSON and accidental pretty JSON blocks)
function loadSubmissionsLog() {
  const file = 'submissions.json';
  if (!fs.existsSync(file)) return [];
  const raw = fs.readFileSync(file, 'utf8');
  const lines = raw.split('\n');
  const entries = [];
  let buffer = '';
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Accumulate into buffer to support pretty-printed multi-line JSON objects
    buffer += trimmed;
    try {
      const obj = JSON.parse(buffer);
      entries.push(obj);
      buffer = '';
    } catch (e) {
      // Not yet a full JSON object, continue accumulating
      continue;
    }
  }
  if (buffer) {
    console.warn('⚠ Unparsed trailing submissions.json content (discarded):', buffer.slice(0, 80));
  }
  return entries;
}

function writeSubmissionsLog(entries) {
  const file = 'submissions.json';
  const data = entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : '');
  fs.writeFileSync(file, data, 'utf8');
}

async function resolveSubmissionRemotePath(filename, versionId) {
  const candidates = new Set();
  if (isDbEnabled()) {
    if (versionId) {
      const ver = await projectVersionsDb.getVersionById(versionId);
      if (ver && ver.b2Path) candidates.add(ver.b2Path);
    }
    const verByFile = await projectVersionsDb.getVersionByFileName(filename);
    if (verByFile && verByFile.b2Path) candidates.add(verByFile.b2Path);
    const row = await submissionsDb.getSubmissionByFileName(filename);
    if (row && row.remote_path) candidates.add(row.remote_path);
  }
  const logs = loadSubmissionsLog();
  const submission = logs.find((sub) => sub.fileName === filename);
  if (submission && submission.remotePath) candidates.add(submission.remotePath);
  candidates.add(`student-projects/${filename}`);

  for (const remotePath of candidates) {
    try {
      const info = await b2Service.getFileInfo(remotePath);
      if (info) return remotePath;
    } catch (_) {
      /* try next candidate */
    }
  }

  try {
    const files = await b2Service.listFiles('student-projects/');
    const match = files.find(
      (f) =>
        f.fileName === `student-projects/${filename}` || f.fileName.endsWith(`/${filename}`)
    );
    if (match) return match.fileName;
  } catch (err) {
    console.warn('B2 listFiles fallback failed:', err.message);
  }

  return `student-projects/${filename}`;
}

function assertValidZipFile(localPath) {
  const stat = fs.statSync(localPath);
  if (!stat.isFile() || stat.size < 22) {
    throw new Error(`Downloaded file is too small to be a valid ZIP (${stat.size} bytes)`);
  }
  const fd = fs.openSync(localPath, 'r');
  try {
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    if (header[0] !== 0x50 || header[1] !== 0x4b) {
      throw new Error('Downloaded file is not a valid ZIP archive');
    }
  } finally {
    fs.closeSync(fd);
  }
}

async function tryDeriveProjectMetaFromZip(zipPath) {
  return new Promise((resolve) => {
    let done = false;
    let input = null;
    let parser = null;

    const stopStreams = () => {
      try {
        if (input && parser) input.unpipe(parser);
      } catch (_) {}
      try {
        if (input) input.destroy();
      } catch (_) {}
    };

    const finish = (result) => {
      if (done) return;
      done = true;
      stopStreams();
      resolve(result || null);
    };

    try {
      input = fs.createReadStream(zipPath);
      parser = unzipper.Parse();

      input.on('error', () => finish(null));
      parser.on('error', () => finish(null));

      parser.on('entry', (entry) => {
        if (done) {
          try {
            entry.autodrain();
          } catch (_) {}
          return;
        }

        const entryPath = (entry.path || '').toString();
        const isFile = entry.type === 'File' || !entry.type;
        if (!isFile || !entryPath.toLowerCase().endsWith('config.json')) {
          entry.autodrain();
          return;
        }

        let text = '';
        entry.setEncoding('utf8');
        entry.on('data', (chunk) => {
          if (done) return;
          text += chunk;
          if (text.length > 512 * 1024) {
            // config.json should be small; avoid holding huge data
            finish(null);
          }
        });
        entry.on('end', () => {
          if (done) return;
          try {
            const cfg = JSON.parse(text);
            finish({
              studentName: (cfg.studentName || (cfg.meta && cfg.meta.studentName) || cfg.author || '')
                .toString()
                .trim(),
              projectName: (cfg.projectName || cfg.name || cfg.title || '').toString().trim(),
            });
          } catch (_) {
            finish(null);
          }
        });
      });

      parser.on('close', () => finish(null));
      input.pipe(parser);
    } catch (_) {
      finish(null);
    }
  });
}

function loadHostedProjects() {
  try {
    if (fs.existsSync(HOSTED_PROJECTS_FILE)) {
      return JSON.parse(fs.readFileSync(HOSTED_PROJECTS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading hosted projects:', err);
  }
  return { projects: [] };
}

function saveHostedProjects(data) {
  try {
    fs.writeFileSync(HOSTED_PROJECTS_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Error saving hosted projects:', err);
  }
}

// Serve the VR editor with cache-busting headers so students always get updates
const staticNoStaleOptions = {
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    // Never cache HTML; always fetch latest shell
    if (ext === '.html' || ext === '.htm') {
      res.setHeader('Cache-Control', 'no-store');
      return;
    }
    // For app code and configs, force revalidation each load
    if (ext === '.js' || ext === '.css' || ext === '.json') {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
      return;
    }
    // Media and images: revalidate so changed files get fetched without manual clears
    if (
      [
        '.png',
        '.jpg',
        '.jpeg',
        '.gif',
        '.svg',
        '.webp',
        '.mp3',
        '.wav',
        '.ogg',
        '.mp4',
        '.webm',
      ].includes(ext)
    ) {
      res.setHeader('Cache-Control', 'no-cache, must-revalidate');
      return;
    }
    // Default: conservative no-cache
    res.setHeader('Cache-Control', 'no-cache');
  },
};
app.use(express.static('.', staticNoStaleOptions));
app.use(express.json({ limit: '50mb' }));
app.use(rejectLocalTestUserWrites);

function protectAdminRoutes(req, res, next) {
  if (!req.path.startsWith('/admin')) return next();
  if (req.method === 'POST' && req.path === '/admin/login') return next();
  if (req.method === 'POST' && req.path === '/admin/logout') return next();
  if (req.method === 'GET' && (req.path === '/admin' || req.path === '/admin/')) return next();
  if (req.method === 'GET' && req.path === '/admin/session') return next();
  return requireAdmin(req, res, next);
}

app.use(protectAdminRoutes);

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'admin.html'));
});

registerCommonAssetRoutes(app, upload);
registerLocalTestUserRoutes(app);
registerStudentRoutes(app);
registerRosterRoutes(app, { requireAdmin });
registerStudentAssetRoutes(app, upload);
registerSceneVideoRoutes(app, upload);
registerBillingRoutes(app);
registerSubmissionVersionRoutes(app, {
  upload,
  assertValidZipFile,
  extractZipToDirSafe,
});
registerAdminStudentPeekRoutes(app, { requireAdmin });
registerAdminContentRoutes(app, { requireAdmin });
registerFlatPageRoutes(app);
registerVrTourRoutes(app, { upload, assertValidZipFile, extractZipToDirSafe });
registerSnippetRoutes(app);
registerRideyRoutes(app);
registerTemplateRoutes(app);
registerPlaygroundRoutes(app);

if (process.env.B2_KEY_ID && process.env.B2_APP_KEY && process.env.B2_BUCKET_NAME) {
  b2Service
    .ensureCommonAssetsBucket()
    .then(() => b2Service.syncLegacyCommonAssetsToPublicBucket())
    .catch((err) => {
      console.warn('⚠️ Common assets bucket setup skipped:', err.message);
    });
}

// Debug endpoint: view server memory usage (useful on localhost / Render)
app.get('/admin/memory', (req, res) => {
  try {
    const mu = process.memoryUsage();
    res.json({
      ok: true,
      pid: process.pid,
      uptimeSec: Math.round(process.uptime()),
      node: process.version,
      memory: {
        rssMB: Math.round((mu.rss / 1024 / 1024) * 10) / 10,
        heapUsedMB: Math.round((mu.heapUsed / 1024 / 1024) * 10) / 10,
        heapTotalMB: Math.round((mu.heapTotal / 1024 / 1024) * 10) / 10,
        externalMB: Math.round((mu.external / 1024 / 1024) * 10) / 10,
        arrayBuffersMB: Math.round(((mu.arrayBuffers || 0) / 1024 / 1024) * 10) / 10,
      },
      system: {
        totalMB: Math.round((os.totalmem() / 1024 / 1024) * 10) / 10,
        freeMB: Math.round((os.freemem() / 1024 / 1024) * 10) / 10,
        loadavg: os.loadavg ? os.loadavg() : null,
      },
    });
  } catch (e) {
    res.status(500).json({ ok: false, message: e.message || 'error' });
  }
});

// ===== GitHub OAuth + Upload-to-Repo (Educational) =====
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID;
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET;
const GITHUB_OAUTH_CALLBACK_BASE = process.env.GITHUB_OAUTH_CALLBACK_BASE; // optional: e.g. http://localhost:3000

let githubOauthStates = new Map(); // state -> { returnTo, createdAt, popup }

function getGitHubTokenFromRequest(req, res) {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    res.status(500).json({
      success: false,
      message: 'Server missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET env vars',
    });
    return null;
  }
  const token = getGitHubToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: 'Not authenticated with GitHub' });
    return null;
  }
  return token;
}

function getServerBaseUrl(req) {
  if (GITHUB_OAUTH_CALLBACK_BASE && typeof GITHUB_OAUTH_CALLBACK_BASE === 'string') {
    return GITHUB_OAUTH_CALLBACK_BASE.replace(/\/$/, '');
  }
  const proto = req.headers['x-forwarded-proto'] ? String(req.headers['x-forwarded-proto']) : req.protocol;
  return `${proto}://${req.get('host')}`;
}

function githubApiRequest(method, apiPath, token, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const opts = {
      method,
      hostname: 'api.github.com',
      path: apiPath,
      headers: {
        'User-Agent': 'vr-hotspots-educational',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    };
    if (token) {
      opts.headers.Authorization = `Bearer ${token}`;
    }
    if (payload) {
      opts.headers['Content-Type'] = 'application/json';
      opts.headers['Content-Length'] = Buffer.byteLength(payload);
    }

    const reqq = https.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        let parsed = null;
        try {
          parsed = data ? JSON.parse(data) : null;
        } catch (_) {
          parsed = data;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(parsed);
        } else {
          const msg =
            (parsed && (parsed.message || parsed.error_description || parsed.error)) ||
            `GitHub API error (${res.statusCode})`;
          const err = new Error(msg);
          err.statusCode = res.statusCode;
          err.details = parsed;
          reject(err);
        }
      });
    });
    reqq.on('error', reject);
    if (payload) reqq.write(payload);
    reqq.end();
  });
}

function githubOAuthTokenExchange(code, redirectUri) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      client_secret: GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: redirectUri,
    });

    const opts = {
      method: 'POST',
      hostname: 'github.com',
      path: '/login/oauth/access_token',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'vr-hotspots-educational',
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const reqq = https.request(opts, (res) => {
      let data = '';
      res.on('data', (d) => (data += d));
      res.on('end', () => {
        let parsed;
        try {
          parsed = JSON.parse(data);
        } catch (e) {
          return reject(new Error('Invalid OAuth response from GitHub'));
        }
        if (res.statusCode >= 200 && res.statusCode < 300 && parsed && parsed.access_token) {
          resolve(parsed.access_token);
        } else {
          reject(new Error(parsed.error_description || parsed.error || 'OAuth token exchange failed'));
        }
      });
    });
    reqq.on('error', reject);
    reqq.write(payload);
    reqq.end();
  });
}

function ensureGitHubAuthed(req, res) {
  return getGitHubTokenFromRequest(req, res);
}

function sanitizeZipEntryPath(p) {
  if (!p || typeof p !== 'string') return null;
  let s = p.replace(/\\/g, '/');
  s = s.replace(/^\/+/, '');
  if (!s) return null;
  if (s.includes('\0')) return null;
  if (s.split('/').some((seg) => seg === '..')) return null;
  if (s.startsWith('__MACOSX/')) return null;
  return s;
}

async function extractZipToDirSafe(zipPath, destDir) {
  const { pipeline } = require('stream/promises');
  const destRoot = path.resolve(destDir);
  await fs.promises.mkdir(destRoot, { recursive: true });

  return new Promise((resolve, reject) => {
    const input = fs.createReadStream(zipPath);
    const parser = unzipper.Parse();

    let chain = Promise.resolve();
    let settled = false;

    const bail = (err) => {
      if (settled) return;
      settled = true;
      try {
        input.unpipe(parser);
      } catch (_) {}
      try {
        input.destroy();
      } catch (_) {}
      try {
        parser.destroy();
      } catch (_) {}
      reject(err);
    };

    input.on('error', (e) => bail(e));
    parser.on('error', (e) => bail(e));

    parser.on('entry', (entry) => {
      chain = chain
        .then(async () => {
          const safeRel = sanitizeZipEntryPath((entry.path || '').toString());
          if (!safeRel) {
            entry.autodrain();
            return;
          }

          const outPath = path.resolve(destRoot, safeRel);
          if (!outPath.startsWith(destRoot + path.sep) && outPath !== destRoot) {
            entry.autodrain();
            throw new Error('Blocked zip entry path traversal');
          }

          if (entry.type === 'Directory') {
            await fs.promises.mkdir(outPath, { recursive: true });
            entry.autodrain();
            return;
          }

          await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
          await pipeline(entry, fs.createWriteStream(outPath));
        })
        .catch((e) => bail(e));
    });

    parser.on('close', () => {
      chain
        .then(() => {
          if (settled) return;
          settled = true;
          resolve();
        })
        .catch((e) => bail(e));
    });

    input.pipe(parser);
  });
}

async function ensureRepoInitialized(owner, repo, token) {
  // Many Git Data endpoints return 409 "Git Repository is empty" until at least one commit exists.
  try {
    const commits = await githubApiRequest(
      'GET',
      `/repos/${owner}/${repo}/commits?per_page=1`,
      token
    );
    if (Array.isArray(commits) && commits.length > 0) return;
    // If GitHub ever returns [], treat as empty.
  } catch (e) {
    if (e && e.statusCode === 409 && /empty/i.test(String(e.message || ''))) {
      // proceed to init
    } else {
      // If commits endpoint fails for other reasons, don't hide it.
      throw e;
    }
  }

  const readme = `# ${repo}\n\nInitialized by VR Hotspot Editor.\n`;
  const contentB64 = Buffer.from(readme, 'utf8').toString('base64');

  await githubApiRequest(
    'PUT',
    `/repos/${owner}/${repo}/contents/README.md`,
    token,
    {
      message: 'Initialize repository',
      content: contentB64,
    }
  );
}

async function ensureGitHubPagesEnabled(owner, repo, branch, token) {
  // Requires a public repo unless the account supports private Pages.
  // We keep this simple: only attempt when the user selected it and the repo is public.
  const source = { branch, path: '/' };

  const fmtErr = (e) => {
    const status = e?.statusCode ? ` (${e.statusCode})` : '';
    const msg = e?.message ? String(e.message) : 'Unknown error';
    const detailsMsg = e?.details?.message ? `: ${e.details.message}` : '';
    return `${msg}${status}${detailsMsg}`;
  };

  const tryGet = async () => {
    try {
      return await githubApiRequest('GET', `/repos/${owner}/${repo}/pages`, token);
    } catch (e) {
      // 404 when Pages not enabled
      if (e?.statusCode === 404) return null;
      throw e;
    }
  };

  // If already enabled, just try to update source.
  const existing = await tryGet();
  if (existing) {
    try {
      await githubApiRequest('PUT', `/repos/${owner}/${repo}/pages`, token, { source });
    } catch (e) {
      return { ok: false, error: fmtErr(e), pages: existing };
    }
    const verified = await tryGet();
    return { ok: true, pages: verified || existing };
  }

  // Not enabled yet: try create
  try {
    await githubApiRequest('POST', `/repos/${owner}/${repo}/pages`, token, { source });
  } catch (e) {
    // If create fails due to "already exists" style conditions, attempt update.
    const msg = String(e?.message || '').toLowerCase();
    if (e?.statusCode === 409 || e?.statusCode === 422 || msg.includes('already')) {
      try {
        await githubApiRequest('PUT', `/repos/${owner}/${repo}/pages`, token, { source });
      } catch (e2) {
        return { ok: false, error: fmtErr(e2) };
      }
    } else {
      return { ok: false, error: fmtErr(e) };
    }
  }

  const verified = await tryGet();
  if (!verified) {
    return { ok: false, error: 'Pages API call succeeded but Pages is still not enabled (may take time)' };
  }
  return { ok: true, pages: verified };
}

async function pushZipBufferToGitHub({
  zipBuffer,
  mode,
  repoName,
  repoFullName,
  visibility,
  branch,
  commitMessage,
  templateName,
  enablePages,
  token,
}) {
  if (!token) {
    throw new Error('GitHub token is required');
  }
  if (!zipBuffer || !Buffer.isBuffer(zipBuffer) || zipBuffer.length === 0) {
    throw new Error('ZIP buffer is empty');
  }

  const safeBranch = typeof branch === 'string' && branch.trim() ? branch.trim() : 'main';
  const safeMessage =
    typeof commitMessage === 'string' && commitMessage.trim()
      ? commitMessage.trim().slice(0, 200)
      : 'Update VR Hotspot project';

  const githubUser = await githubApiRequest('GET', '/user', token);
  let owner = githubUser.login;
  let repo = null;

  if (mode === 'create') {
    if (!repoName || typeof repoName !== 'string' || !/^[a-zA-Z0-9_.-]{1,100}$/.test(repoName)) {
      throw new Error('Invalid repoName');
    }
    const isPrivate = String(visibility || 'public').toLowerCase() === 'private';
    try {
      const created = await githubApiRequest('POST', '/user/repos', token, {
        name: repoName,
        private: isPrivate,
        description: `VR Hotspot project${templateName ? `: ${templateName}` : ''}`,
        // Create the initial commit/branch so Git Data API endpoints work immediately.
        auto_init: true,
      });
      repo = created.name;
      owner = created.owner?.login || owner;
    } catch (e) {
      // GitHub returns 422 for validation errors (including "name already exists on this account")
      if (e && e.statusCode === 422) {
        const errors = Array.isArray(e.details?.errors) ? e.details.errors : [];
        const errorsText = errors
          .map((er) => {
            const field = er?.field ? `field=${er.field}` : '';
            const code = er?.code ? `code=${er.code}` : '';
            const msg = er?.message ? er.message : '';
            return [field, code, msg].filter(Boolean).join(' ');
          })
          .filter(Boolean)
          .join('; ');

        const combined = `${String(e.message || '')} ${errorsText}`.toLowerCase();
        if (combined.includes('already exists')) {
          // Treat as an "update existing" flow to match UX expectations.
          repo = repoName;
          owner = githubUser.login;
        } else {
          throw new Error(
            `Repository creation failed${errorsText ? `: ${errorsText}` : ''}`
          );
        }
      } else {
        throw e;
      }
    }
  } else {
    if (!repoFullName || typeof repoFullName !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(repoFullName)) {
      throw new Error('Invalid repoFullName');
    }
    const parts = repoFullName.split('/');
    owner = parts[0];
    repo = parts[1];
  }

  // Ensure the repository has at least one commit (handles "empty repo" for existing repos too)
  await ensureRepoInitialized(owner, repo, token);

  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();
  if (!entries || entries.length === 0) {
    throw new Error('ZIP is empty');
  }

  // Build file list
  const files = [];
  for (const entry of entries) {
    if (entry.isDirectory) continue;
    const safePath = sanitizeZipEntryPath(entry.entryName);
    if (!safePath) continue;
    const data = entry.getData();
    files.push({ path: safePath, content: data });
  }
  if (files.length === 0) {
    throw new Error('No files found in ZIP');
  }
  if (files.length > 5000) {
    throw new Error('Too many files in ZIP');
  }

  const repoInfo = await githubApiRequest('GET', `/repos/${owner}/${repo}`, token);
  const defaultBranch = repoInfo.default_branch || 'main';
  const targetBranch = safeBranch || defaultBranch;

  // Try to read existing ref for base commit/tree
  let baseCommitSha = null;
  let baseTreeSha = null;
  try {
    const ref = await githubApiRequest(
      'GET',
      `/repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(targetBranch)}`,
      token
    );
    baseCommitSha = ref?.object?.sha || null;
  } catch (_) {
    baseCommitSha = null;
  }
  if (baseCommitSha) {
    const commit = await githubApiRequest(
      'GET',
      `/repos/${owner}/${repo}/git/commits/${baseCommitSha}`,
      token
    );
    baseTreeSha = commit?.tree?.sha || null;
  }

  // Create blobs
  const treeItems = [];
  for (const f of files) {
    const b64 = f.content.toString('base64');
    const blob = await githubApiRequest('POST', `/repos/${owner}/${repo}/git/blobs`, token, {
      content: b64,
      encoding: 'base64',
    });
    treeItems.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
  }

  // Create tree
  const treeBody = baseTreeSha ? { base_tree: baseTreeSha, tree: treeItems } : { tree: treeItems };
  const newTree = await githubApiRequest('POST', `/repos/${owner}/${repo}/git/trees`, token, treeBody);

  // Create commit
  const commitBody = {
    message: safeMessage,
    tree: newTree.sha,
    parents: baseCommitSha ? [baseCommitSha] : [],
  };
  const newCommit = await githubApiRequest('POST', `/repos/${owner}/${repo}/git/commits`, token, commitBody);

  // Update or create ref
  const refPath = `/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(targetBranch)}`;
  try {
    await githubApiRequest('PATCH', refPath, token, { sha: newCommit.sha, force: true });
  } catch (_) {
    await githubApiRequest('POST', `/repos/${owner}/${repo}/git/refs`, token, {
      ref: `refs/heads/${targetBranch}`,
      sha: newCommit.sha,
    });
  }

  let pagesUrl = null;
  let pagesEnabled = null;
  let pagesError = null;
  try {
    if (enablePages && repoInfo && repoInfo.private === false) {
      const pagesResult = await ensureGitHubPagesEnabled(owner, repo, targetBranch, token);
      pagesEnabled = !!pagesResult?.ok;
      pagesUrl =
        pagesResult?.pages?.html_url ||
        (pagesEnabled ? `https://${owner}.github.io/${repo}/` : null);
      pagesError = pagesEnabled ? null : pagesResult?.error || 'Failed to enable Pages';
    }
  } catch (e) {
    pagesEnabled = false;
    pagesError = e?.message || String(e);
  }

  return {
    repoFullName: `${owner}/${repo}`,
    branch: targetBranch,
    commitSha: newCommit.sha,
    repoUrl: `https://github.com/${owner}/${repo}`,
    pagesUrl,
    pagesEnabled,
    pagesError,
  };
}

app.get('/github/oauth/status', async (req, res) => {
  try {
    const token = getGitHubToken(req);
    if (!token) {
      return res.json({ authed: false });
    }
    const githubUser = await githubApiRequest('GET', '/user', token);
    return res.json({ authed: true, user: { login: githubUser.login, id: githubUser.id } });
  } catch (e) {
    clearGitHubSession(req, res);
    return res.json({ authed: false });
  }
});

// List repos for the authenticated user (used for dropdown selection in the editor)
app.get('/github/repos', async (req, res) => {
  try {
    const token = ensureGitHubAuthed(req, res);
    if (!token) return;

    // Basic pagination without relying on Link headers (keeps githubApiRequest simple)
    const perPage = 100;
    const maxPages = 10; // up to 1000 repos
    const repos = [];

    for (let page = 1; page <= maxPages; page++) {
      const pageRepos = await githubApiRequest(
        'GET',
        `/user/repos?per_page=${perPage}&page=${page}&sort=updated&direction=desc&affiliation=owner,collaborator,organization_member`,
        token
      );

      if (!Array.isArray(pageRepos) || pageRepos.length === 0) break;
      for (const r of pageRepos) {
        if (!r || !r.full_name) continue;
        repos.push({
          full_name: r.full_name,
          private: !!r.private,
          updated_at: r.updated_at,
        });
      }

      if (pageRepos.length < perPage) break;
    }

    return res.json({ success: true, repos });
  } catch (e) {
    console.error('GitHub repos list error:', e);
    return res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
});

// List branches for a repo (owner/name) so the editor can offer a dropdown.
app.get('/github/branches', async (req, res) => {
  try {
    const token = ensureGitHubAuthed(req, res);
    if (!token) return;

    const repoFullName = typeof req.query.repo === 'string' ? req.query.repo.trim() : '';
    if (!repoFullName || !/^[^/\s]+\/[^/\s]+$/.test(repoFullName)) {
      return res.status(400).json({ success: false, message: 'Query param "repo" must be owner/name' });
    }
    const [owner, repo] = repoFullName.split('/');

    const perPage = 100;
    const maxPages = 10;
    const branches = [];

    for (let page = 1; page <= maxPages; page++) {
      const pageBranches = await githubApiRequest(
        'GET',
        `/repos/${owner}/${repo}/branches?per_page=${perPage}&page=${page}`,
        token
      );
      if (!Array.isArray(pageBranches) || pageBranches.length === 0) break;
      for (const b of pageBranches) {
        if (!b || !b.name) continue;
        branches.push({ name: b.name });
      }
      if (pageBranches.length < perPage) break;
    }

    return res.json({ success: true, branches });
  } catch (e) {
    // Empty repos can sometimes return 409 "Git Repository is empty" on some endpoints.
    if (e && e.statusCode === 409 && /empty/i.test(String(e.message || ''))) {
      return res.json({ success: true, branches: [] });
    }
    console.error('GitHub branches list error:', e);
    return res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
});

app.get('/github/oauth/start', (req, res) => {
  if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
    return res.status(500).send('Server missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET env vars');
  }
  const state = crypto.randomBytes(16).toString('hex');
  const baseUrl = getServerBaseUrl(req);
  const returnTo = sanitizeReturnTo(
    typeof req.query.returnTo === 'string' ? req.query.returnTo : '/',
    baseUrl
  );
  const popup = String(req.query.popup || '').toLowerCase() === 'true' || String(req.query.popup || '') === '1';
  githubOauthStates.set(state, { returnTo, createdAt: Date.now(), popup });

  const prompt = typeof req.query.prompt === 'string' ? req.query.prompt : '';
  const safePrompt = prompt === 'select_account' ? 'select_account' : '';
  const login = typeof req.query.login === 'string' ? req.query.login : '';
  const safeLogin = login && /^[A-Za-z0-9-]+$/.test(login) ? login : '';

  // prune old states
  for (const [k, v] of githubOauthStates.entries()) {
    if (Date.now() - v.createdAt > 15 * 60 * 1000) githubOauthStates.delete(k);
  }

  const redirectUri = `${getServerBaseUrl(req)}/github/oauth/callback`;
  const scope = encodeURIComponent('repo');
  const authUrl =
    `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(GITHUB_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${scope}` +
    `&state=${encodeURIComponent(state)}` +
    (safePrompt ? `&prompt=${encodeURIComponent(safePrompt)}` : '') +
    (safeLogin ? `&login=${encodeURIComponent(safeLogin)}` : '');

  return res.redirect(authUrl);
});

app.post('/github/oauth/logout', (req, res) => {
  clearGitHubSession(req, res);
  return res.json({ success: true });
});

app.get('/github/oauth/callback', async (req, res) => {
  try {
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET) {
      return res.status(500).send('Server missing GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET env vars');
    }
    const code = typeof req.query.code === 'string' ? req.query.code : null;
    const state = typeof req.query.state === 'string' ? req.query.state : null;
    if (!code || !state) {
      return res.status(400).send('Missing code/state');
    }
    const stateEntry = githubOauthStates.get(state);
    if (!stateEntry) {
      return res.status(400).send('Invalid OAuth state');
    }
    githubOauthStates.delete(state);

    const redirectUri = `${getServerBaseUrl(req)}/github/oauth/callback`;
    const token = await githubOAuthTokenExchange(code, redirectUri);

    let githubUser = null;
    try {
      githubUser = await githubApiRequest('GET', '/user', token);
    } catch (_) {
      githubUser = null;
    }
    const sessionId = createGitHubSession(token, githubUser);
    setGitHubSessionCookie(res, sessionId);

    const safeReturnTo = sanitizeReturnTo(stateEntry.returnTo || '/', getServerBaseUrl(req));

    if (stateEntry.popup) {
      let targetOrigin = null;
      try {
        const u = new URL(safeReturnTo || '/', getServerBaseUrl(req));
        targetOrigin = `${u.protocol}//${u.host}`;
      } catch (_) {
        targetOrigin = null;
      }

      const safeTargetOrigin = targetOrigin ? String(targetOrigin).replace(/</g, '').replace(/>/g, '') : '*';

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>GitHub Connected</title>
  </head>
  <body style="font-family: Arial, sans-serif; padding: 16px;">
    <div style="font-weight: bold; margin-bottom: 8px;">GitHub connected.</div>
    <div style="color: #444;">You can close this window.</div>
    <script>
      (function () {
        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({ type: 'github-oauth-complete' }, ${JSON.stringify(safeTargetOrigin)});
          }
        } catch (e) {}
        try { window.close(); } catch (e) {}
      })();
    </script>
  </body>
</html>`);
    }

    return res.redirect(safeReturnTo);
  } catch (e) {
    console.error('GitHub OAuth callback error:', e);
    return res.status(500).send(e.message || 'OAuth error');
  }
});

// Push an exported project ZIP as a single commit (create new repo or update existing)
app.post('/github/push-zip', express.json({ limit: '500mb' }), async (req, res) => {
  try {
    const token = ensureGitHubAuthed(req, res);
    if (!token) return;

    const {
      mode,
      repoName,
      repoFullName,
      visibility,
      branch,
      commitMessage,
      zipBase64,
      templateName,
      enablePages,
    } = req.body || {};

    if (!zipBase64 || typeof zipBase64 !== 'string') {
      return res.status(400).json({ success: false, message: 'zipBase64 is required' });
    }
    if (zipBase64.length > 700 * 1024 * 1024) {
      return res.status(413).json({ success: false, message: 'ZIP too large' });
    }
    const safeBranch = typeof branch === 'string' && branch.trim() ? branch.trim() : 'main';
    const safeMessage =
      typeof commitMessage === 'string' && commitMessage.trim()
        ? commitMessage.trim().slice(0, 200)
        : 'Update VR Hotspot project';

    const zipBuffer = Buffer.from(zipBase64, 'base64');
    if (!zipBuffer || zipBuffer.length === 0) {
      return res.status(400).json({ success: false, message: 'ZIP decode failed' });
    }

    const result = await pushZipBufferToGitHub({
      zipBuffer,
      mode,
      repoName,
      repoFullName,
      visibility,
      branch: safeBranch,
      commitMessage: safeMessage,
      templateName,
      enablePages: !!enablePages,
      token,
    });

    return res.json({ success: true, ...result });
  } catch (e) {
    console.error('GitHub push-zip error:', e);
    return res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
});

// Multipart upload version (preferred): avoids base64 JSON size limits
app.post('/github/push-zip-upload', upload.single('project'), async (req, res) => {
  try {
    const token = ensureGitHubAuthed(req, res);
    if (!token) return;

    const file = req.file;
    if (!file || !file.path) {
      return res.status(400).json({ success: false, message: 'Missing uploaded ZIP file' });
    }

    const mode = typeof req.body.mode === 'string' ? req.body.mode : '';
    const repoName = typeof req.body.repoName === 'string' ? req.body.repoName : '';
    const repoFullName = typeof req.body.repoFullName === 'string' ? req.body.repoFullName : '';
    const visibility = typeof req.body.visibility === 'string' ? req.body.visibility : 'public';
    const branch = typeof req.body.branch === 'string' ? req.body.branch : 'main';
    const commitMessage = typeof req.body.commitMessage === 'string' ? req.body.commitMessage : '';
    const templateName = typeof req.body.templateName === 'string' ? req.body.templateName : '';
    const enablePages = String(req.body.enablePages || '').toLowerCase() === 'true';

    const zipBuffer = fs.readFileSync(file.path);
    try {
      fs.unlinkSync(file.path);
    } catch (_) {}

    const result = await pushZipBufferToGitHub({
      zipBuffer,
      mode,
      repoName,
      repoFullName,
      visibility,
      branch,
      commitMessage,
      templateName,
      enablePages,
      token,
    });

    return res.json({ success: true, ...result });
  } catch (e) {
    console.error('GitHub push-zip-upload error:', e);
    return res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
});

// Serve hosted student projects with the same anti-stale headers
app.use('/hosted', express.static('hosted-projects', staticNoStaleOptions));

// Collect student project submissions (auth required when DB/B2/production)
app.post('/submit-project', requireAuthForCloudWrites, upload.single('project'), async (req, res) => {
  try {
    const projectFile = req.file;
    if (!projectFile) {
      return res
        .status(400)
        .json({ success: false, message: 'No project ZIP uploaded (field name: project)' });
    }

    assertValidZipFile(projectFile.path);

    // Attempt to derive metadata from the ZIP's config.json
    let derivedStudent = (req.body.studentName || '').trim();
    let derivedProject = (req.body.projectName || '').trim();
    try {
      const meta = await tryDeriveProjectMetaFromZip(projectFile.path);
      if (meta) {
        derivedStudent = derivedStudent || meta.studentName;
        derivedProject = derivedProject || meta.projectName;
      }
    } catch (_) {
      /* ignore zip read errors */
    }

    const originalNameRaw = projectFile.originalname;
    let originalName = 'project.zip';
    if (typeof originalNameRaw === 'string' && originalNameRaw.trim()) {
      originalName = originalNameRaw.trim();
    }
    originalName = originalName.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_.-]/g, '_');
    const baseFromZip = /\.zip$/i.test(originalName)
      ? originalName.replace(/\.zip$/i, '')
      : originalName;
    const safeStudent =
      (derivedStudent || baseFromZip || 'student').replace(/[^a-zA-Z0-9]/g, '_') || 'student';
    const safeProject = (derivedProject || baseFromZip || 'VR_Project').toString() || 'VR_Project';

    const fileName = `${safeStudent}_${Date.now()}.zip`;
    const remotePath = `student-projects/${fileName}`;

    // Upload to Backblaze B2
    try {
      await b2Service.uploadFile(projectFile.path, remotePath);
    } finally {
      // Clean up local temp file (even if upload fails)
      try {
        fs.unlinkSync(projectFile.path);
      } catch (_) {}
    }

    // Log submission
    const submission = {
      studentName: safeStudent,
      projectName: safeProject,
      fileName,
      remotePath,
      submittedAt: new Date().toISOString(),
    };

    const logs = loadSubmissionsLog();
    logs.push(submission);
    writeSubmissionsLog(logs);

    return res.json({
      success: true,
      message: 'Project submitted successfully to cloud storage!',
      fileName,
      studentName: safeStudent,
      projectName: safeProject,
    });
  } catch (e) {
    console.error('Submit-project error:', e);
    return res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
});

// Endpoint to fetch B2 direct upload credentials (student auth required for cloud writes)
app.get('/api/b2-upload-url', requireAuthForCloudWrites, async (req, res) => {
  try {
    const data = await b2Service.getUploadUrl();
    res.json({
      success: true,
      ...data,
      studentId: req.studentSession?.studentId || null,
      classId: req.studentSession?.classId || null,
      classSlug: req.studentSession?.classSlug || null,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to get secure upload URL' });
  }
});

// Endpoint to log project submission after successful B2 upload
app.post('/api/submit-project-meta', requireAuthForCloudWrites, express.json(), async (req, res) => {
  req.on('aborted', () => {
    console.log('Project meta upload aborted');
  });

  const finish = async () => {
    try {
      let studentId = null;
      let studentName = (req.body && req.body.studentName) || 'student';
      let classId = null;
      let classSlug = 'default';

      const sess = req.studentSession || getStudentSession(req);
      if (sess && sess.studentId) {
        studentId = sess.studentId;
        studentName = sess.displayName || studentName;
        classId = sess.classId;
        classSlug = sess.classSlug || 'default';
        if (classId) {
          await assertCanSubmit({ classId });
        }
      }

      const {
        projectName,
        fileName,
        remotePath,
        studentNote,
        threadId,
        versionNumber,
        kind = 'submitted',
      } = req.body || {};
      const safeProject = projectName || 'VR_Project';

      let versionResult = null;
      if (isDbEnabled() && studentId && kind !== 'legacy') {
        versionResult = await projectVersionsDb.createVersion({
          studentId,
          projectName: safeProject,
          fileName,
          b2Path: remotePath,
          kind: kind === 'draft' ? 'draft' : 'submitted',
          createdBy: 'student',
          studentNote,
          threadId: threadId || null,
          versionNumber: versionNumber || null,
        });
        await submissionsDb.createSubmission({
          studentId,
          studentName,
          projectName: safeProject,
          fileName,
          remotePath,
        });
      } else if (isDbEnabled()) {
        await submissionsDb.createSubmission({
          studentId,
          studentName,
          projectName: safeProject,
          fileName,
          remotePath,
        });
      }

      const submission = {
        studentId,
        studentName,
        projectName: safeProject,
        fileName,
        remotePath,
        submittedAt: new Date().toISOString(),
      };

      const logs = loadSubmissionsLog();
      logs.push({
        studentName,
        projectName: safeProject,
        fileName,
        remotePath,
        submittedAt: submission.submittedAt,
      });
      writeSubmissionsLog(logs);

      return res.json({
        success: true,
        message: 'Project submitted successfully to cloud storage!',
        fileName,
        studentName,
        projectName: safeProject,
        versionId: versionResult?.version?.id || null,
        threadId: versionResult?.thread?.id || threadId || null,
        versionNumber: versionResult?.versionNumber || versionNumber || null,
      });
    } catch (err) {
      if (err.statusCode === 402) {
        return res.status(402).json({ success: false, ...err.payload });
      }
      console.error('Submit-project meta error:', err);
      return res.status(500).json({ success: false, message: err.message || 'Server error' });
    }
  };

  return finish();
});

function requireAuthForVideoFetch(req, res, next) {
  if (cloudWritesRequireAuth(req)) {
    return requireStudentStrict(req, res, next);
  }
  return next();
}

// Server-side video fetch endpoint (bypasses CORS; auth + SSRF protections)
app.post('/fetch-video', requireAuthForVideoFetch, express.json(), async (req, res) => {
  const { url } = req.body;

  let safeUrl;
  try {
    safeUrl = await assertSafeOutboundUrl(url);
  } catch (err) {
    return res.status(400).json({
      success: false,
      error: err.message || 'Invalid URL.',
    });
  }

  const targetUrl = safeUrl.toString();
  console.log(`📹 Fetching video from: ${targetUrl}`);

  const protocol = safeUrl.protocol === 'https:' ? https : require('http');
  const MAX_BYTES = 500 * 1024 * 1024;
  let bytesReceived = 0;

  const request = protocol.get(targetUrl, { timeout: 60000 }, (videoRes) => {
    if (videoRes.statusCode >= 300 && videoRes.statusCode < 400 && videoRes.headers.location) {
      videoRes.resume();
      return res.status(400).json({
        success: false,
        error: 'Redirects are not allowed for video fetch.',
      });
    }

    if (videoRes.statusCode !== 200) {
      videoRes.resume();
      return res.status(videoRes.statusCode).json({
        success: false,
        error: `Remote server returned ${videoRes.statusCode}`,
      });
    }

    const contentType = videoRes.headers['content-type'] || 'video/mp4';
    const contentLength = videoRes.headers['content-length'];

    if (contentLength && parseInt(contentLength, 10) > MAX_BYTES) {
      videoRes.destroy();
      return res.status(413).json({
        success: false,
        error: 'Video file too large (max 500MB).',
      });
    }

    res.setHeader('Content-Type', contentType);
    if (contentLength) {
      res.setHeader('Content-Length', contentLength);
    }

    videoRes.on('data', (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived > MAX_BYTES) {
        videoRes.destroy();
        if (!res.headersSent) {
          res.status(413).json({
            success: false,
            error: 'Video file too large (max 500MB).',
          });
        } else {
          res.destroy();
        }
      }
    });

    videoRes.pipe(res);

    videoRes.on('error', (err) => {
      console.error('Video fetch error:', err);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to fetch video.',
        });
      }
    });
  });

  request.on('error', (err) => {
    console.error('Video fetch error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        error: 'Failed to fetch video.',
      });
    }
  });
});

// Admin: Save updated config.json back to hosted project (with backup)
app.post('/admin/save-project-config', async (req, res) => {
  try {
    const { hostedPath, config } = req.body || {};
    if (!hostedPath || typeof hostedPath !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(hostedPath)) {
      return res.status(400).json({ success: false, message: 'Invalid hostedPath' });
    }
    if (!config || typeof config !== 'object') {
      return res.status(400).json({ success: false, message: 'Invalid config payload' });
    }

    const cfgDir = path.join('hosted-projects', hostedPath);
    const cfgFile = path.join(cfgDir, 'config.json');
    if (!fs.existsSync(cfgDir)) {
      return res.status(404).json({ success: false, message: 'Hosted project not found' });
    }

    // Backup existing config.json if present
    try {
      if (fs.existsSync(cfgFile)) {
        const backupName = `config.backup-${Date.now()}.json`;
        fs.copyFileSync(cfgFile, path.join(cfgDir, backupName));
      }
    } catch (e) {
      console.warn('Backup warning:', e.message);
    }

    // Write new config.json (pretty printed)
    fs.writeFileSync(cfgFile, JSON.stringify(config, null, 2), 'utf8');

    // Touch index.html to help some CDNs revalidate (optional)
    try {
      const idx = path.join(cfgDir, 'index.html');
      if (fs.existsSync(idx)) fs.utimesSync(idx, new Date(), new Date());
    } catch (_) {}

    // Also update the original submission ZIP so future downloads/hosting use the latest edits
    try {
      const subsPath = 'submissions.json';
      if (fs.existsSync(subsPath)) {
        const raw = fs
          .readFileSync(subsPath, 'utf8')
          .split('\n')
          .filter((l) => l.trim())
          .map((l) => JSON.parse(l));
        const match = raw.find((s) => s.hostedPath === hostedPath);
        if (match && match.fileName) {
          const zipOutPath = path.join('student-projects', match.fileName);

          // Backup existing ZIP
          try {
            if (fs.existsSync(zipOutPath)) {
              const backupsDir = path.join('student-projects', 'backups');
              if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
              const backupName =
                match.fileName.replace(/\.zip$/i, '') + `-backup-${Date.now()}.zip`;
              fs.copyFileSync(zipOutPath, path.join(backupsDir, backupName));
            }
          } catch (e) {
            console.warn('ZIP backup warning:', e.message);
          }

          // Create a fresh ZIP from hosted folder contents
          await new Promise((resolve, reject) => {
            const output = fs.createWriteStream(zipOutPath + '.tmp');
            const archive = archiver('zip', { zlib: { level: 9 } });
            output.on('close', () => {
              try {
                // Replace original atomically
                if (fs.existsSync(zipOutPath)) fs.unlinkSync(zipOutPath);
                fs.renameSync(zipOutPath + '.tmp', zipOutPath);
                resolve();
              } catch (e) {
                reject(e);
              }
            });
            output.on('error', reject);
            archive.on('error', reject);
            archive.pipe(output);
            // Add contents of hosted project at root of ZIP
            archive.directory(cfgDir + path.sep, false);
            archive.finalize();
          });
        }
      }
    } catch (packErr) {
      console.warn('Repack ZIP warning:', packErr.message);
      // Non-fatal: we still saved config.json; downloads may be stale until rehosted
    }

    return res.json({ success: true, message: 'Config saved and package updated (if mapped)' });
  } catch (e) {
    console.error('save-project-config error:', e);
    return res.status(500).json({ success: false, message: e.message || 'Server error' });
  }
});

// Admin can view all submissions (API endpoint) - synced with B2 and PostgreSQL
app.get('/admin/submissions', async (req, res) => {
  try {
    const classId = req.query.classId || null;
    const studentId = req.query.studentId || null;

    if (isDbEnabled()) {
      const inbox = await projectVersionsDb.listAdminInbox({ classId, studentId });
      if (inbox.length > 0) {
        const enriched = inbox.map((submission) => {
          try {
            const hostedPath = submission.hostedPath;
            if (hostedPath && typeof hostedPath === 'string') {
              const hostedDir = path.join('hosted-projects', hostedPath);
              let updatedISO = undefined;
              const cfg = path.join(hostedDir, 'config.json');
              if (fs.existsSync(cfg)) {
                updatedISO = fs.statSync(cfg).mtime.toISOString();
              } else {
                const idx = path.join(hostedDir, 'index.html');
                if (fs.existsSync(idx)) updatedISO = fs.statSync(idx).mtime.toISOString();
              }
              if (updatedISO) submission.updatedAt = updatedISO;
            }
          } catch (_) {}
          return {
            versionId: submission.id,
            threadId: submission.threadId,
            versionNumber: submission.versionNumber,
            studentName: submission.studentDisplayName,
            studentId: submission.studentId,
            className: submission.className,
            classId: submission.classId,
            projectName: submission.projectName,
            fileName: submission.fileName,
            remotePath: submission.b2Path,
            studentNote: submission.studentNote,
            adminNote: submission.adminNote,
            hostedPath: submission.hostedPath,
            hostedUrl: submission.hostedUrl,
            hostedAt: submission.hostedAt,
            isHosted: submission.isHosted,
            submittedAt: submission.submittedAt,
            updatedAt: submission.updatedAt,
          };
        });
        return res.json(enriched);
      }

      const dbSubs = await submissionsDb.listSubmissions({ classId, studentId });
      if (dbSubs.length > 0) {
        const enriched = dbSubs.map((submission) => {
          try {
            const hostedPath = submission.hostedPath;
            if (hostedPath && typeof hostedPath === 'string') {
              const hostedDir = path.join('hosted-projects', hostedPath);
              let updatedISO = undefined;
              const cfg = path.join(hostedDir, 'config.json');
              if (fs.existsSync(cfg)) {
                updatedISO = fs.statSync(cfg).mtime.toISOString();
              } else {
                const idx = path.join(hostedDir, 'index.html');
                if (fs.existsSync(idx)) updatedISO = fs.statSync(idx).mtime.toISOString();
              }
              if (updatedISO) submission.updatedAt = updatedISO;
            }
          } catch (_) {}
          return {
            studentName: submission.studentDisplayName || submission.studentName,
            studentId: submission.studentId,
            className: submission.className,
            classId: submission.classId,
            projectName: submission.projectName,
            fileName: submission.fileName,
            remotePath: submission.remotePath,
            hostedPath: submission.hostedPath,
            hostedUrl: submission.hostedUrl,
            hostedAt: submission.hostedAt,
            isHosted: submission.isHosted,
            submittedAt: submission.submittedAt,
            updatedAt: submission.updatedAt,
            syncedFromB2: submission.syncedFromB2,
          };
        });
        return res.json(enriched);
      }
    }

    // Get files from B2
    const b2Files = await b2Service.listFiles('student-projects/');

    // Load local submissions log
    let logs = [];
    if (fs.existsSync('submissions.json')) {
      logs = loadSubmissionsLog();
    }

    // Create a map of existing submissions by fileName
    const submissionsMap = new Map();
    logs.forEach((sub) => {
      submissionsMap.set(sub.fileName, sub);
    });

    // Sync with B2 - add any files that exist in B2 but not in submissions.json
    let needsSync = false;
    for (const b2File of b2Files) {
      const fileName = b2File.fileName.replace('student-projects/', '');

      if (!submissionsMap.has(fileName)) {
        // File exists in B2 but not in submissions.json - add it
        console.log(`📥 Found orphaned B2 file: ${fileName}`);

        // Try to derive metadata from filename
        const nameParts = fileName.replace(/\.zip$/i, '').split('_');
        const studentName = nameParts[0] || 'unknown';
        const projectName = nameParts.slice(0, -1).join('_') || 'VR_Project';

        submissionsMap.set(fileName, {
          studentName,
          projectName,
          fileName,
          remotePath: b2File.fileName,
          submittedAt: new Date(b2File.uploadTimestamp).toISOString(),
          syncedFromB2: true,
        });
        needsSync = true;
      }
    }

    // Remove submissions that no longer exist in B2
    const b2FileNames = new Set(b2Files.map((f) => f.fileName.replace('student-projects/', '')));
    for (const [fileName] of submissionsMap) {
      if (!b2FileNames.has(fileName)) {
        console.log(`🗑️ Removing orphaned submission entry: ${fileName}`);
        submissionsMap.delete(fileName);
        needsSync = true;
      }
    }

    // Update submissions.json if changes were made
    if (needsSync) {
      const syncedLogs = Array.from(submissionsMap.values());
      writeSubmissionsLog(syncedLogs);
      console.log(`✅ Synced submissions.json with B2 (${syncedLogs.length} entries)`);
    }

    // Get final list and enrich with hosted project info
    const enriched = Array.from(submissionsMap.values()).map((submission) => {
      try {
        const hostedPath = submission.hostedPath;
        if (hostedPath && typeof hostedPath === 'string') {
          const hostedDir = path.join('hosted-projects', hostedPath);
          let updatedISO = undefined;

          const cfg = path.join(hostedDir, 'config.json');
          if (fs.existsSync(cfg)) {
            updatedISO = fs.statSync(cfg).mtime.toISOString();
          } else {
            const idx = path.join(hostedDir, 'index.html');
            if (fs.existsSync(idx)) {
              updatedISO = fs.statSync(idx).mtime.toISOString();
            }
          }

          if (updatedISO) submission.updatedAt = updatedISO;
        }
      } catch (_) {}
      return submission;
    });

    res.json(enriched);
  } catch (error) {
    console.error('Submissions endpoint error:', error);
    res.json([]);
  }
});

// Manual sync endpoint - force sync B2 with local submissions.json
app.post('/admin/sync-b2', async (req, res) => {
  try {
    console.log('🔄 Starting manual B2 sync...');

    // Get files from B2
    const b2Files = await b2Service.listFiles('student-projects/');
    console.log(`📋 Found ${b2Files.length} file(s) in B2`);

    // Load local submissions log
    let logs = [];
    if (fs.existsSync('submissions.json')) {
      logs = loadSubmissionsLog();
    }

    const submissionsMap = new Map();
    logs.forEach((sub) => {
      submissionsMap.set(sub.fileName, sub);
    });

    // Add B2 files that don't exist locally
    let addedCount = 0;
    for (const b2File of b2Files) {
      const fileName = b2File.fileName.replace('student-projects/', '');

      if (!submissionsMap.has(fileName)) {
        const nameParts = fileName.replace(/\.zip$/i, '').split('_');
        const studentName = nameParts[0] || 'unknown';
        const projectName = nameParts.slice(0, -1).join('_') || 'VR_Project';

        submissionsMap.set(fileName, {
          studentName,
          projectName,
          fileName,
          remotePath: b2File.fileName,
          submittedAt: new Date(b2File.uploadTimestamp).toISOString(),
          syncedFromB2: true,
        });
        addedCount++;
        console.log(`  ✅ Added: ${fileName}`);
      }
    }

    // Remove entries that don't exist in B2
    const b2FileNames = new Set(b2Files.map((f) => f.fileName.replace('student-projects/', '')));
    let removedCount = 0;
    for (const [fileName] of submissionsMap) {
      if (!b2FileNames.has(fileName)) {
        submissionsMap.delete(fileName);
        removedCount++;
        console.log(`  🗑️ Removed: ${fileName}`);
      }
    }

    // Save synced list
    const syncedLogs = Array.from(submissionsMap.values());
    writeSubmissionsLog(syncedLogs);

    console.log(
      `✅ Sync complete: ${addedCount} added, ${removedCount} removed, ${syncedLogs.length} total`
    );

    res.json({
      success: true,
      message: `Sync complete: ${addedCount} added, ${removedCount} removed`,
      total: syncedLogs.length,
      added: addedCount,
      removed: removedCount,
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Admin can download individual projects
app.get('/admin/download/:filename', async (req, res) => {
  let tempPath = null;
  try {
    const filename = req.params.filename;
    const remotePath = await resolveSubmissionRemotePath(filename);
    tempPath = path.join('temp-uploads', `download_${Date.now()}_${filename}`);

    console.log(`📥 Downloading submission from B2: ${remotePath}`);
    await b2Service.downloadFile(remotePath, tempPath);
    assertValidZipFile(tempPath);

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', 'application/zip');

    res.download(tempPath, filename, (err) => {
      try {
        if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (cleanupErr) {
        console.error('Temp file cleanup error:', cleanupErr);
      }
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({ success: false, message: 'Download failed' });
        }
      }
    });
  } catch (error) {
    if (tempPath) {
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (_) {}
    }
    console.error('Download endpoint error:', error);
    const notFound =
      error.response?.status === 404 ||
      /404|not found/i.test(String(error.message || ''));
    res.status(notFound ? 404 : 500).json({
      success: false,
      message: notFound
        ? 'Project ZIP not found in cloud storage. The student may need to submit again.'
        : error.message || 'Server error during download',
    });
  }
});

// Admin can delete individual projects (legacy filename or full versioned thread)
app.delete('/admin/delete/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const result = await purgeLegacySubmission(filename);
    console.log(`✅ Project deleted: ${filename}`);
    res.json({
      success: true,
      message: 'Project deleted successfully from cloud storage',
      result,
    });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting project: ' + error.message,
    });
  }
});

// Admin can host individual projects
app.post('/admin/host/:filename', async (req, res) => {
  const { filename } = req.params;
  const { urlPath } = req.body;

  if (!filename || !urlPath) {
    return res.status(400).json({ error: 'filename and urlPath required' });
  }

  // Validate URL path
  if (!/^[a-zA-Z0-9_-]+$/.test(urlPath)) {
    return res.status(400).json({ error: 'Invalid URL path format' });
  }

  try {
    const remotePath = await resolveSubmissionRemotePath(filename);
    const tempPath = path.join('temp-uploads', `host_${Date.now()}_${filename}`);
    const hostedDir = path.join('hosted-projects', urlPath);

    // Download from B2
    await b2Service.downloadFile(remotePath, tempPath);
    assertValidZipFile(tempPath);

    // Clear existing hosted directory if it exists
    if (fs.existsSync(hostedDir)) {
      fs.rmSync(hostedDir, { recursive: true, force: true });
    }
    fs.mkdirSync(hostedDir, { recursive: true });

    // Extract ZIP to hosted directory
    try {
      await extractZipToDirSafe(tempPath, hostedDir);
    } finally {
      // Clean up temp file
      try {
        if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
      } catch (_) {}
    }

    // Update submissions.json with hosting info
    const logs = loadSubmissionsLog();
    const submission = logs.find((sub) => sub.fileName === filename);
    const urls = resolveHostedProjectUrls(urlPath, hostedDir);

    if (submission) {
      submission.hostedPath = urlPath;
      submission.hostedUrl = urls.tourUrl;
      submission.hostedAt = new Date().toISOString();
      submission.isHosted = true;
      writeSubmissionsLog(logs);
      if (isDbEnabled()) {
        await submissionsDb.updateSubmissionHosting(filename, {
          hostedPath: urlPath,
          hostedUrl: urls.tourUrl,
          isHosted: true,
        });
      }
    }

    res.json({
      success: true,
      message: `Project hosted at /${urlPath}`,
      hostedUrl: urls.tourUrl,
      tourUrl: urls.tourUrl,
      flatPageUrl: urls.flatPageUrl,
    });
  } catch (error) {
    console.error('Host error:', error);
    const notFound =
      error.response?.status === 404 ||
      /404|not found/i.test(String(error.message || ''));
    res.status(notFound ? 404 : 500).json({
      success: false,
      message: notFound
        ? `Project ZIP not found in cloud storage (${filename}). Try downloading first to verify the file exists.`
        : error.message || 'Hosting failed',
    });
  }
});

// Admin can unhost individual projects
app.post('/admin/unhost/:filename', async (req, res) => {
  const { filename } = req.params;

  try {
    const result = await purgeHostedSubmission({ fileName: filename });
    res.json({ success: true, message: 'Project unhosted successfully', result });
  } catch (error) {
    console.error('Unhost error:', error);
    res.status(500).json({
      success: false,
      message: 'Error unhosting project: ' + error.message,
    });
  }
});

app.get('/admin/hosted-projects', (req, res) => {
  const hosted = loadHostedProjects();
  res.json(hosted);
});

// Admin: Download ALL projects as a single backup ZIP
app.get('/admin/backup-all', async (req, res) => {
  try {
    const archive = archiver('zip', { zlib: { level: 9 } });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="vr-projects-backup-${Date.now()}.zip"`
    );

    archive.pipe(res);

    // Download all files from B2 and add to archive
    const allFiles = await b2Service.listFiles('student-projects/');
    const tempDir = path.join('temp-uploads', `backup_${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    for (const file of allFiles) {
      const localPath = path.join(tempDir, path.basename(file.fileName));
      await b2Service.downloadFile(file.fileName, localPath);
      archive.file(localPath, { name: `student-projects/${path.basename(file.fileName)}` });
    }

    // Add submissions.json
    if (fs.existsSync('submissions.json')) {
      archive.file('submissions.json', { name: 'submissions.json' });
    }

    archive.finalize();

    archive.on('end', () => {
      // Clean up temp files
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    archive.on('error', (err) => {
      console.error('Archive error:', err);
      res.status(500).json({ error: 'Failed to create backup' });
    });

    console.log('📦 Creating backup of all projects from cloud storage...');
  } catch (error) {
    console.error('Backup error:', error);
    res.status(500).json({ error: 'Backup failed' });
  }
});

// POST /admin/restore-backup - Restore from backup ZIP
app.post('/admin/restore-backup', upload.single('backup'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded' });
  }

  const tempZipPath = req.file.path;
  console.log('📥 Restoring backup...');

  try {
    // Validate file size (basic check that file exists and has content)
    const stats = fs.statSync(tempZipPath);
    if (stats.size === 0) {
      throw new Error('Uploaded file is empty');
    }

    // Validate it's a valid ZIP by trying to read it
    const zip = new AdmZip(tempZipPath);
    const entries = zip.getEntries();

    if (entries.length === 0) {
      throw new Error('ZIP file is empty or corrupted');
    }

    // Clear existing projects (skip temp files and backups directory)
    const projectsDir = 'student-projects';
    const files = fs.readdirSync(projectsDir);
    for (const file of files) {
      // Skip the temp file we just uploaded and backups directory
      if (file === path.basename(tempZipPath) || file === 'backups') {
        continue;
      }

      const filePath = path.join(projectsDir, file);
      const stat = fs.statSync(filePath);

      if (stat.isFile()) {
        fs.unlinkSync(filePath);
      } else if (stat.isDirectory()) {
        fs.rmSync(filePath, { recursive: true, force: true });
      }
    }

    // Clear hosted projects
    const hostedDir = 'hosted-projects';
    if (fs.existsSync(hostedDir)) {
      fs.rmSync(hostedDir, { recursive: true, force: true });
      fs.mkdirSync(hostedDir);
    }

    // Clear submissions.json if it exists
    if (fs.existsSync('submissions.json')) {
      fs.unlinkSync('submissions.json');
    }

    // Extract all entries
    for (const entry of entries) {
      if (!entry.isDirectory) {
        const entryPath = entry.entryName;
        const targetPath = path.join('.', entryPath);

        // Ensure directory exists
        const targetDir = path.dirname(targetPath);
        if (!fs.existsSync(targetDir)) {
          fs.mkdirSync(targetDir, { recursive: true });
        }

        // Extract file
        fs.writeFileSync(targetPath, entry.getData());
      }
    }

    // Clean up temp file
    if (fs.existsSync(tempZipPath)) {
      fs.unlinkSync(tempZipPath);
    }

    console.log('✅ Backup restored successfully');
    res.json({ success: true, message: 'Backup restored successfully' });
  } catch (err) {
    console.error('Restore error:', err);

    // Clean up temp file on error
    try {
      if (fs.existsSync(tempZipPath)) {
        fs.unlinkSync(tempZipPath);
      }
    } catch (cleanupErr) {
      console.error('Error cleaning up temp file:', cleanupErr);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to restore backup: ' + err.message,
    });
  }
});

// Diagnostic endpoint to list all B2 files (for debugging)
app.get('/admin/list-b2-files', async (req, res) => {
  try {
    const files = await b2Service.listFiles('student-projects/');
    const fileList = files.map((f) => ({
      name: f.fileName,
      size: f.contentLength,
      uploaded: new Date(f.uploadTimestamp).toISOString(),
      fileId: f.fileId,
    }));

    console.log(`📋 Found ${fileList.length} file(s) in B2`);

    res.json({
      success: true,
      count: fileList.length,
      files: fileList,
    });
  } catch (error) {
    console.error('List B2 files error:', error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

// Determine if we should use HTTPS (only for local development with certificates)
const useHTTPS = fs.existsSync('localhost+1-key.pem') && fs.existsSync('localhost+1.pem');

// Use environment port or fallback to 3000
const PORT = process.env.PORT || 3000;

async function startServer() {
  try {
    await runMigrations();
    if (isDbEnabled()) {
      await importSubmissionsFromJson(loadSubmissionsLog, writeSubmissionsLog);
      try {
        await require('./lib/snippets').seedSnippetsIfEmpty();
      } catch (seedErr) {
        console.warn('⚠️ Snippet seed skipped:', seedErr.message);
      }
    }
  } catch (err) {
    console.error('⚠️ Database startup error:', err.message);
  }

  if (useHTTPS) {
  // Local HTTPS setup with mkcert certificates
  const options = {
    key: fs.readFileSync('localhost+1-key.pem'),
    cert: fs.readFileSync('localhost+1.pem'),
  };

  const server = https.createServer(options, app).listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server running on https://localhost:${PORT}`);
    console.log(`🌐 Also accessible at https://192.168.1.80:${PORT}`);
    console.log(`👨‍💼 Admin overview: https://localhost:${PORT}/admin`);
    console.log(`👨‍💼 Admin submissions: https://localhost:${PORT}/admin-submissions.html`);
  });
  server.timeout = 0; // Disable idle timeout 
  server.requestTimeout = 0; // Disable 5-minute request timeout (for huge uploads/downloads)
  server.headersTimeout = 0; 
} else {
  // Production HTTP setup (e.g., Render, Heroku)
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 Server running on http://localhost:${PORT}`);
    console.log(`👨‍🏫 Admin overview: http://localhost:${PORT}/admin`);
    console.log(`👨‍🏫 Admin submissions: http://localhost:${PORT}/admin-submissions.html`);
    console.log('ℹ️  Running in HTTP mode (no SSL certificates found)');
  });
  server.timeout = 0; 
  server.requestTimeout = 0; 
  server.headersTimeout = 0; 
  }
}

startServer();

// Add cleanup function for orphaned temp files
function cleanupTempFiles() {
  try {
    const projectsDir = 'student-projects';
    if (!fs.existsSync(projectsDir)) {
      return;
    }

    const files = fs.readdirSync(projectsDir);
    let cleanedCount = 0;

    for (const file of files) {
      // Remove files that look like multer temp files (32 hex chars, no extension)
      if (/^[0-9a-f]{32}$/i.test(file)) {
        const filePath = path.join(projectsDir, file);

        // Extra safety: check if file exists before trying to delete
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          cleanedCount++;
          console.log(`🧹 Cleaned up temp file: ${file}`);
        }
      }
    }

    if (cleanedCount > 0) {
      console.log(`✅ Cleaned up ${cleanedCount} orphaned temp file(s)`);
    }
  } catch (err) {
    console.error('Error during temp file cleanup:', err);
  }
}

// Call cleanup on server start
cleanupTempFiles();
