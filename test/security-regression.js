/**
 * Security regression tests for v2.8 hardening.
 * Run: node test/security-regression.js
 */

const assert = require('assert');
const { sanitizeReturnTo } = require('../lib/security/safe-redirect');
const { hostnameLooksBlocked, isPrivateOrMetadataIp } = require('../lib/security/ssrf-guard');
const { cloudWritesRequireAuth } = require('../lib/security/cloud-write-auth');
const {
  isLocalTestUserModeAvailable,
  startLocalTestUser,
  getLocalTestSession,
} = require('../lib/local-test-user');
const { handleStudentLogout } = require('../student-auth');

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
  const prev = { ...process.env };
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
    process.env = prev;
  }
  console.log('✓ cloud write auth flag');
}

function testLocalTestUserModeAvailability() {
  const prev = { ...process.env };
  try {
    delete process.env.NODE_ENV;
    process.env.LOCAL_TEST_USER_ENABLED = 'true';
    assert.strictEqual(isLocalTestUserModeAvailable(), true);

    process.env.NODE_ENV = 'production';
    assert.strictEqual(isLocalTestUserModeAvailable(), false);

    process.env.LOCAL_TEST_USER_ALLOW_PRODUCTION = 'true';
    assert.strictEqual(isLocalTestUserModeAvailable(), true);
  } finally {
    process.env = prev;
  }
  console.log('✓ local test user mode availability');
}

function testCloudWriteAuthWithLocalTestCookie() {
  const prev = { ...process.env };
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
    process.env = prev;
  }
  console.log('✓ cloud write auth with local test cookie');
}

function testStudentLogoutSetsBothClearCookies() {
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

  handleStudentLogout({}, mockRes);
  const cookies = headers['Set-Cookie'];
  const list = Array.isArray(cookies) ? cookies : [cookies];
  assert.ok(list.some((c) => String(c).startsWith('student_session=')), 'student_session clear missing');
  assert.ok(list.some((c) => String(c).startsWith('local_test_session=')), 'local_test_session clear missing');
  console.log('✓ student logout clears both session cookies');
}

testSafeRedirect();
testSsrfBlocklist();
testCloudWriteAuthFlag();
testLocalTestUserModeAvailability();
testCloudWriteAuthWithLocalTestCookie();
testStudentLogoutSetsBothClearCookies();
console.log('\nAll security regression tests passed.');
