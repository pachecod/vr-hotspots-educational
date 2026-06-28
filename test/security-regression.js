/**
 * Security regression tests for v2.8 hardening.
 * Run: node test/security-regression.js
 */

const assert = require('assert');
const { sanitizeReturnTo } = require('../lib/security/safe-redirect');
const { hostnameLooksBlocked, isPrivateOrMetadataIp } = require('../lib/security/ssrf-guard');
const { cloudWritesRequireAuth } = require('../lib/security/cloud-write-auth');

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

testSafeRedirect();
testSsrfBlocklist();
testCloudWriteAuthFlag();
console.log('\nAll security regression tests passed.');
