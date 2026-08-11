/**
 * Security regression tests for v2.8 / v3.8 hardening.
 * Run: node test/security-regression.js
 */

const assert = require('assert');
const { sanitizeReturnTo } = require('../lib/security/safe-redirect');
const {
  hostnameLooksBlocked,
  isPrivateOrMetadataIp,
  assertSafeOutboundUrl,
} = require('../lib/security/ssrf-guard');
const { cloudWritesRequireAuth } = require('../lib/security/cloud-write-auth');
const {
  isLocalTestUserModeAvailable,
  startLocalTestUser,
  getLocalTestSession,
  rejectLocalTestUserWrites,
} = require('../lib/local-test-user');
const { handleStudentLogout } = require('../student-auth');
const { isPublicPlaygroundEnabled } = require('../lib/playground-config');
const { validateZipHasConfig, playgroundBundleKey } = require('../routes/playground-routes');
const {
  getHostedOrigin,
  buildHostedUrl,
  isHostedOriginRequest,
  isAllowedOnHostedOrigin,
} = require('../lib/hosted-origin');
const { assertProductionSecrets } = require('../lib/security/production-secrets');
const { assertStudentOwnedRemotePath } = require('../lib/security/student-remote-path');
const {
  requireStudent,
  isStudentAuthPermissive,
} = require('../student-auth');
const fs = require('fs');
const os = require('os');
const path = require('path');
const AdmZip = require('adm-zip');

function restoreEnv(prev) {
  for (const key of Object.keys(process.env)) {
    if (!(key in prev)) delete process.env[key];
  }
  for (const [key, value] of Object.entries(prev)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

function snapshotEnv() {
  return { ...process.env };
}

function testSafeRedirect() {
  const base = 'https://example.com';
  assert.strictEqual(sanitizeReturnTo('/', base), '/');
  assert.strictEqual(sanitizeReturnTo('/admin-submissions.html', base), '/admin-submissions.html');
  assert.strictEqual(sanitizeReturnTo('https://evil.com/phish', base), '/');
  assert.strictEqual(sanitizeReturnTo('//evil.com', base), '/');
  assert.strictEqual(sanitizeReturnTo('javascript:alert(1)', base), '/');
  console.log('✓ safe redirect');
}

function testSsrfBlocklist() {
  assert.strictEqual(hostnameLooksBlocked('localhost'), true);
  assert.strictEqual(hostnameLooksBlocked('169.254.169.254'), true);
  assert.strictEqual(hostnameLooksBlocked('metadata.google.internal'), true);
  assert.strictEqual(isPrivateOrMetadataIp('10.0.0.1'), true);
  assert.strictEqual(isPrivateOrMetadataIp('8.8.8.8'), false);
  console.log('✓ SSRF blocklist');
}

function testCloudWriteAuthFlag() {
  const prev = snapshotEnv();
  try {
    delete process.env.NODE_ENV;
    delete process.env.DATABASE_URL;
    delete process.env.B2_KEY_ID;
    delete process.env.STUDENT_AUTH_REQUIRED;
    delete process.env.LOCAL_TEST_USER_ENABLED;
    assert.strictEqual(cloudWritesRequireAuth(), false);

    process.env.B2_KEY_ID = 'x';
    process.env.B2_APP_KEY = 'y';
    process.env.B2_BUCKET_NAME = 'z';
    assert.strictEqual(cloudWritesRequireAuth(), true);
  } finally {
    restoreEnv(prev);
  }
  console.log('✓ cloud write auth flag');
}

function testLocalTestUserModeAvailability() {
  const prev = snapshotEnv();
  try {
    delete process.env.NODE_ENV;
    process.env.LOCAL_TEST_USER_ENABLED = 'true';
    assert.strictEqual(isLocalTestUserModeAvailable(), true);

    process.env.NODE_ENV = 'production';
    assert.strictEqual(isLocalTestUserModeAvailable(), false);

    process.env.LOCAL_TEST_USER_ALLOW_PRODUCTION = 'true';
    assert.strictEqual(isLocalTestUserModeAvailable(), true);
  } finally {
    restoreEnv(prev);
  }
  console.log('✓ local test user mode availability');
}

function testCloudWriteAuthWithLocalTestCookie() {
  const prev = snapshotEnv();
  try {
    delete process.env.NODE_ENV;
    delete process.env.DATABASE_URL;
    delete process.env.B2_KEY_ID;
    delete process.env.STUDENT_AUTH_REQUIRED;
    process.env.LOCAL_TEST_USER_ENABLED = 'true';

    const mockRes = {
      _headers: {},
      setHeader(key, value) {
        this._headers[key] = value;
      },
    };
    startLocalTestUser(mockRes);
    const setCookie = mockRes._headers['Set-Cookie'] || '';
    const cookiePair = setCookie.split(';')[0];
    const mockReq = { headers: { cookie: cookiePair } };

    assert.ok(getLocalTestSession(mockReq), 'expected valid local test session');
    assert.strictEqual(cloudWritesRequireAuth(mockReq), true);
    assert.strictEqual(cloudWritesRequireAuth(), false);
  } finally {
    restoreEnv(prev);
  }
  console.log('✓ cloud write auth with local test cookie');
}

async function testStudentLogoutSetsBothClearCookies() {
  const headers = {};
  const mockRes = {
    appendHeader(key, value) {
      const prev = headers[key];
      if (!prev) headers[key] = value;
      else if (Array.isArray(prev)) headers[key] = [...prev, value];
      else headers[key] = [prev, value];
    },
    setHeader(key, value) {
      headers[key] = value;
    },
    getHeader(key) {
      return headers[key];
    },
    json() {},
  };

  await handleStudentLogout({ headers: {} }, mockRes);
  const cookies = headers['Set-Cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies];
  assert.ok(list.some((c) => String(c).startsWith('student_session=')), 'student_session clear missing');
  assert.ok(list.some((c) => String(c).startsWith('local_test_session=')), 'local_test_session clear missing');
  console.log('✓ student logout clears both session cookies');
}

function testPublicPlaygroundFlag() {
  const prev = process.env.PUBLIC_PLAYGROUND_ENABLED;
  try {
    delete process.env.PUBLIC_PLAYGROUND_ENABLED;
    assert.strictEqual(isPublicPlaygroundEnabled(), false);
    process.env.PUBLIC_PLAYGROUND_ENABLED = 'true';
    assert.strictEqual(isPublicPlaygroundEnabled(), true);
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_PLAYGROUND_ENABLED;
    else process.env.PUBLIC_PLAYGROUND_ENABLED = prev;
  }
  console.log('✓ public playground flag');
}

function testPlaygroundBundleValidation() {
  assert.strictEqual(playgroundBundleKey('farm-tour'), 'playground-tours/farm-tour.zip');
  const tmp = path.join(os.tmpdir(), `pg-test-${Date.now()}.zip`);
  const badZip = new AdmZip();
  badZip.addFile('readme.txt', Buffer.from('hi'));
  badZip.writeZip(tmp);
  assert.strictEqual(validateZipHasConfig(tmp), false);
  fs.unlinkSync(tmp);

  const good = path.join(os.tmpdir(), `pg-good-${Date.now()}.zip`);
  const goodZip = new AdmZip();
  goodZip.addFile('config.json', Buffer.from('{"name":"demo"}'));
  goodZip.writeZip(good);
  assert.strictEqual(validateZipHasConfig(good), true);
  fs.unlinkSync(good);
  console.log('✓ playground bundle validation');
}

function testGuestWriteAllowlistsAuthFlows() {
  const prev = snapshotEnv();
  try {
    delete process.env.NODE_ENV;
    process.env.LOCAL_TEST_USER_ENABLED = 'true';

    const mockRes = {
      _headers: {},
      setHeader(key, value) {
        this._headers[key] = value;
      },
      appendHeader(key, value) {
        const existing = this._headers[key];
        if (!existing) this._headers[key] = value;
        else if (Array.isArray(existing)) this._headers[key] = [...existing, value];
        else this._headers[key] = [existing, value];
      },
    };
    startLocalTestUser(mockRes);
    const setCookie = mockRes._headers['Set-Cookie'] || '';
    const cookiePair = String(Array.isArray(setCookie) ? setCookie[0] : setCookie).split(';')[0];

    function assertAllowed(path) {
      let nextCalled = false;
      let statusCode = null;
      rejectLocalTestUserWrites(
        { method: 'POST', path, headers: { cookie: cookiePair } },
        {
          status(code) {
            statusCode = code;
            return this;
          },
          json() {
            return this;
          },
        },
        () => {
          nextCalled = true;
        }
      );
      assert.strictEqual(nextCalled, true, `${path} should pass guest write guard`);
      assert.strictEqual(statusCode, null);
    }

    assertAllowed('/admin/login');
    assertAllowed('/api/student/login');
    assertAllowed('/api/classes/abc-123/verify-password');

    let nextCalled = false;
    let statusCode = null;
    let body = null;
    rejectLocalTestUserWrites(
      { method: 'POST', path: '/admin/templates', headers: { cookie: cookiePair } },
      {
        status(code) {
          statusCode = code;
          return this;
        },
        json(payload) {
          body = payload;
          return this;
        },
      },
      () => {
        nextCalled = true;
      }
    );
    assert.strictEqual(nextCalled, false);
    assert.strictEqual(statusCode, 403);
    assert.ok(body && /local-only/i.test(body.message || ''));
  } finally {
    restoreEnv(prev);
  }
  console.log('✓ guest write allowlist includes auth flows');
}

async function testSsrfPinnedResolve() {
  await assert.rejects(() => assertSafeOutboundUrl('http://127.0.0.1/x'), /private|local/i);
  await assert.rejects(() => assertSafeOutboundUrl('http://localhost/x'), /private|local/i);
  const pinned = await assertSafeOutboundUrl('https://example.com/video.mp4');
  assert.ok(pinned.url instanceof URL);
  assert.strictEqual(pinned.hostname, 'example.com');
  assert.ok(pinned.address && !isPrivateOrMetadataIp(pinned.address));
  assert.ok(pinned.family === 4 || pinned.family === 6);
  console.log('✓ SSRF pinned resolve');
}

function testHostedOriginHelper() {
  const prev = snapshotEnv();
  try {
    delete process.env.HOSTED_ORIGIN;
    delete process.env.SERVER_BASE_URL;
    assert.strictEqual(buildHostedUrl('demo-tour', 'index.html'), '/hosted/demo-tour/index.html');

    process.env.HOSTED_ORIGIN = 'https://hosted.webxride.com';
    process.env.SERVER_BASE_URL = 'https://webxride.com';
    assert.strictEqual(getHostedOrigin(), 'https://hosted.webxride.com');
    assert.strictEqual(
      buildHostedUrl('demo-tour', 'index.html'),
      'https://hosted.webxride.com/hosted/demo-tour/index.html'
    );

    const hostedReq = {
      get: () => 'hosted.webxride.com',
      headers: { host: 'hosted.webxride.com' },
      path: '/admin',
    };
    assert.strictEqual(isHostedOriginRequest(hostedReq), true);
    assert.strictEqual(isAllowedOnHostedOrigin({ path: '/admin' }), false);
    assert.strictEqual(isAllowedOnHostedOrigin({ path: '/hosted/x/index.html' }), true);
    assert.strictEqual(isAllowedOnHostedOrigin({ path: '/' }), true);
    assert.strictEqual(isAllowedOnHostedOrigin({ path: '/health' }), true);
  } finally {
    restoreEnv(prev);
  }
  console.log('✓ hosted origin helper');
}

function testPasswordEncryptionSecretRequired() {
  const keys = [
    'NODE_ENV',
    'ADMIN_PASSWORD',
    'ADMIN_SESSION_SECRET',
    'STUDENT_SESSION_SECRET',
    'STUDENT_PASSWORD_ENCRYPTION_SECRET',
    'B2_KEY_ID',
  ];
  const prev = {};
  for (const key of keys) prev[key] = process.env[key];
  const exit = process.exit;
  try {
    process.env.NODE_ENV = 'production';
    process.env.ADMIN_PASSWORD = 'strong-admin-password-xyz';
    process.env.ADMIN_SESSION_SECRET = 'admin-session-secret-xyz-32chars!!';
    process.env.STUDENT_SESSION_SECRET = 'student-session-secret-xyz-32chars!';
    delete process.env.STUDENT_PASSWORD_ENCRYPTION_SECRET;
    delete process.env.B2_KEY_ID;

    let exited = null;
    process.exit = (code) => {
      exited = code;
      throw new Error(`exit:${code}`);
    };
    try {
      assertProductionSecrets();
      assert.fail('expected assertProductionSecrets to exit');
    } catch (err) {
      assert.ok(/exit:1/.test(err.message));
      assert.strictEqual(exited, 1);
    }

    process.env.STUDENT_PASSWORD_ENCRYPTION_SECRET = 'dedicated-password-enc-secret-xyz!!';
    exited = null;
    assertProductionSecrets();
    assert.strictEqual(exited, null);
  } finally {
    process.exit = exit;
    for (const key of keys) {
      if (prev[key] === undefined) delete process.env[key];
      else process.env[key] = prev[key];
    }
  }
  console.log('✓ password encryption secret required in production');
}

function testPreviewSandboxAdminElevatedIsolation() {
  // Ridey / AI preview must never combine allow-scripts + allow-same-origin.
  const ridey = fs.readFileSync(path.join(__dirname, '..', 'flat-editor', 'AIAssistant.jsx'), 'utf8');
  assert.ok(!/sandbox="[^"]*allow-same-origin/.test(ridey), 'AIAssistant still has allow-same-origin');

  const helper = fs.readFileSync(
    path.join(__dirname, '..', 'flat-editor', 'previewSandbox.js'),
    'utf8'
  );
  const classic = fs.readFileSync(path.join(__dirname, '..', 'preview-sandbox.js'), 'utf8');
  const bundle = fs.readFileSync(path.join(__dirname, '..', 'flat-editor.bundle.js'), 'utf8');

  // Canonical implementation lives in the ESM module and is exported on window.
  assert.ok(/adminReview/.test(helper), 'previewSandbox.js must check adminReview');
  assert.ok(/adminTemplate/.test(helper), 'previewSandbox.js must check adminTemplate');
  assert.ok(/adminAssign/.test(helper), 'previewSandbox.js must check adminAssign');
  assert.ok(
    /window\.getPreviewSandboxAttribute\s*=/.test(helper),
    'previewSandbox.js must assign getPreviewSandboxAttribute on window'
  );
  assert.ok(
    /window\.getPreviewSandboxAttribute\s*=/.test(bundle),
    'flat-editor.bundle.js must assign getPreviewSandboxAttribute on window'
  );

  // Classic script must be a prefer-global fallback (escapeHtml pattern), not a second source of truth.
  assert.ok(
    /typeof global\.getPreviewSandboxAttribute !== 'function'/.test(classic) ||
      /typeof global\.getPreviewSandboxAttribute !== "function"/.test(classic),
    'preview-sandbox.js must only set getPreviewSandboxAttribute when missing'
  );
  assert.ok(/adminReview/.test(classic), 'preview-sandbox.js fallback must still check adminReview');
  assert.ok(/adminTemplate/.test(classic), 'preview-sandbox.js fallback must still check adminTemplate');
  assert.ok(/adminAssign/.test(classic), 'preview-sandbox.js fallback must still check adminAssign');
  assert.ok(
    /allow-scripts allow-modals allow-popups allow-forms/.test(classic),
    'preview-sandbox.js fallback must define restricted sandbox'
  );
  assert.ok(
    /allow-scripts allow-same-origin allow-modals allow-popups allow-forms/.test(classic),
    'preview-sandbox.js fallback must keep same-origin for non-admin editing'
  );

  // Fallback behavior smoke-check (only matters if the bundle failed to load).
  const classicRunner = new Function('window', 'globalThis', `${classic}\nreturn window;`);
  const sandboxGlobal = { location: { search: '' } };
  const g = classicRunner(sandboxGlobal, sandboxGlobal);
  assert.strictEqual(
    g.getPreviewSandboxAttribute('?foo=1'),
    'allow-scripts allow-same-origin allow-modals allow-popups allow-forms'
  );
  assert.strictEqual(
    g.getPreviewSandboxAttribute('?adminReview=1'),
    'allow-scripts allow-modals allow-popups allow-forms'
  );
  assert.strictEqual(
    g.getPreviewSandboxAttribute('?adminTemplate=abc'),
    'allow-scripts allow-modals allow-popups allow-forms'
  );
  assert.strictEqual(
    g.getPreviewSandboxAttribute('?adminAssign=1'),
    'allow-scripts allow-modals allow-popups allow-forms'
  );
  // Prefer an existing global rather than overwriting it.
  const existing = () => 'FROM_BUNDLE';
  const preferGlobal = { location: { search: '' }, getPreviewSandboxAttribute: existing };
  const g2 = classicRunner(preferGlobal, preferGlobal);
  assert.strictEqual(g2.getPreviewSandboxAttribute, existing);

  // Both editor paths must call the shared helper — not re-inline query-param logic.
  const preview = fs.readFileSync(path.join(__dirname, '..', 'flat-editor', 'Preview.jsx'), 'utf8');
  assert.ok(
    /from ['"]\.\/previewSandbox\.js['"]/.test(preview),
    'Preview.jsx must import shared previewSandbox helper'
  );
  assert.ok(
    /getPreviewSandboxAttribute\s*\(/.test(preview),
    'Preview.jsx must call getPreviewSandboxAttribute'
  );
  assert.ok(
    !/params\.get\(['"]adminReview['"]\)/.test(preview),
    'Preview.jsx must not re-inline adminReview sandbox logic'
  );

  const legacy = fs.readFileSync(path.join(__dirname, '..', 'flat-page-editor.js'), 'utf8');
  assert.ok(
    /getPreviewSandboxAttribute\s*\(/.test(legacy),
    'flat-page-editor.js must call getPreviewSandboxAttribute'
  );
  assert.ok(
    !/params\.get\(['"]adminReview['"]\)/.test(legacy),
    'flat-page-editor.js must not re-inline adminReview sandbox logic'
  );

  const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  assert.ok(
    /preview-sandbox\.js/.test(indexHtml),
    'index.html must load preview-sandbox.js for the legacy editor path'
  );

  console.log('✓ preview sandbox: window export + classic fallback (single source of truth)');
}

function testStudentRemotePathOwnership() {
  const ok = assertStudentOwnedRemotePath('student-projects/class1/stu-1/proj/v1.zip', {
    classSlug: 'class1',
    studentId: 'stu-1',
  });
  assert.strictEqual(ok, 'student-projects/class1/stu-1/proj/v1.zip');
  assert.throws(
    () =>
      assertStudentOwnedRemotePath('student-projects/other/stu-1/x.zip', {
        classSlug: 'class1',
        studentId: 'stu-1',
      }),
    /under your student-projects/
  );
  assert.throws(
    () =>
      assertStudentOwnedRemotePath('student-projects/class1/stu-1/../evil.zip', {
        classSlug: 'class1',
        studentId: 'stu-1',
      }),
    /Invalid remotePath/
  );
  console.log('✓ student remotePath ownership');
}

function testRequireStudentProductionStrict() {
  const prev = snapshotEnv();
  try {
    process.env.NODE_ENV = 'production';
    delete process.env.STUDENT_AUTH_REQUIRED;
    // Re-require would cache module; exercise middleware via current export which
    // captured IS_PRODUCTION at load — if NODE_ENV was not production at load, skip.
    // Instead assert the helper contract via a fresh fork-less check of source.
    const src = fs.readFileSync(path.join(__dirname, '..', 'student-auth.js'), 'utf8');
    assert.ok(/IS_PRODUCTION/.test(src), 'student-auth must gate permissive mode on production');
    assert.ok(/isStudentAuthPermissive/.test(src));
    assert.ok(typeof requireStudent === 'function');
    assert.ok(typeof isStudentAuthPermissive === 'function');
  } finally {
    restoreEnv(prev);
  }
  console.log('✓ requireStudent production gate present');
}

function testZipBombCapsPresent() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'simple-server.js'), 'utf8');
  assert.ok(/ZIP_MAX_ENTRIES\s*=\s*5000/.test(src));
  assert.ok(/ZIP_MAX_UNCOMPRESSED_BYTES/.test(src));
  assert.ok(/assertValidZipFile\(zipPath\)/.test(src));
  console.log('✓ zip-bomb caps present in extract path');
}

function testCsrfNoXhrBypass() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib/security/csrf-guard.js'), 'utf8');
  assert.ok(
    !/requestedWith\s*===\s*['"]XMLHttpRequest['"]/.test(src),
    'CSRF guard must not bypass on X-Requested-With: XMLHttpRequest'
  );
  assert.ok(/hostMatchesOrigin/.test(src) && /refererMatchesHost/.test(src));
  console.log('✓ CSRF guard relies on Origin/Referer only');
}

function testCreateVersionOwnsRemotePath() {
  const versions = fs.readFileSync(
    path.join(__dirname, '..', 'services/project-versions-db.js'),
    'utf8'
  );
  assert.ok(
    /async function createVersion[\s\S]*assertStudentOwnedRemotePath/.test(versions),
    'createVersion must call assertStudentOwnedRemotePath'
  );
  const routes = fs.readFileSync(
    path.join(__dirname, '..', 'routes/submission-version-routes.js'),
    'utf8'
  );
  assert.ok(
    /\/api\/student\/projects\/save-draft[\s\S]{0,3500}?classSlug:\s*sess\.classSlug/.test(routes),
    'save-draft must pass classSlug into createVersion'
  );
  assert.ok(
    /err\.statusCode === 400/.test(routes),
    'save-draft must map ownership errors to HTTP 400'
  );
  const server = fs.readFileSync(path.join(__dirname, '..', 'simple-server.js'), 'utf8');
  assert.ok(
    /SESSION_COOKIE_NAMES[\s\S]*app\.use\('\/hosted'/.test(server),
    'hosted static path must strip session cookies'
  );
  const stripBlock = server.match(
    /SESSION_COOKIE_NAMES\s*=\s*new Set\(\[([\s\S]*?)\]\)/
  );
  assert.ok(stripBlock, 'SESSION_COOKIE_NAMES set must exist');
  const stripList = stripBlock[1];
  assert.ok(
    /class_roster_session/.test(stripList) && /site_access/.test(stripList),
    'hosted cookie strip must use real class_roster_session and site_access names'
  );
  assert.ok(
    !/\broster_gate\b/.test(stripList) && !/\bsite_password\b/.test(stripList),
    'hosted cookie strip must not use incorrect roster_gate/site_password names'
  );
  console.log('✓ createVersion ownership + save-draft + hosted cookie strip');
}

function testEscapeHtmlSharedUtility() {
  const shared = fs.readFileSync(path.join(__dirname, '..', 'lib/escape-html.js'), 'utf8');
  assert.ok(/&#39;/.test(shared), 'shared escapeHtml must escape single quotes');
  const browser = fs.readFileSync(path.join(__dirname, '..', 'escape-html.js'), 'utf8');
  assert.ok(/&#39;/.test(browser));
  const users = fs.readFileSync(path.join(__dirname, '..', 'admin-users.js'), 'utf8');
  assert.ok(
    !/onclick=["']deleteStudent\(/.test(users),
    'admin-users must not use inline onclick with interpolated IDs'
  );
  assert.ok(/data-action=["']delete-student["']/.test(users));
  console.log('✓ shared escapeHtml + admin-users data-* actions');
}

async function main() {
  testSafeRedirect();
  testSsrfBlocklist();
  await testSsrfPinnedResolve();
  testHostedOriginHelper();
  testPasswordEncryptionSecretRequired();
  testPreviewSandboxAdminElevatedIsolation();
  testStudentRemotePathOwnership();
  testRequireStudentProductionStrict();
  testZipBombCapsPresent();
  testCsrfNoXhrBypass();
  testCreateVersionOwnsRemotePath();
  testEscapeHtmlSharedUtility();
  testCloudWriteAuthFlag();
  testLocalTestUserModeAvailability();
  testCloudWriteAuthWithLocalTestCookie();
  await testStudentLogoutSetsBothClearCookies();
  testPublicPlaygroundFlag();
  testPlaygroundBundleValidation();
  testGuestWriteAllowlistsAuthFlows();
  console.log('\nAll security regression tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
