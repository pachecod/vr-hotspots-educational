/**
 * Guest preview cleanup tests.
 * Run: node test/guest-preview-cleanup.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  markGuestPreviewExpiry,
  isGuestPreviewExpired,
  sweepExpiredGuestPreviews,
  isGuestPreviewPath,
  hostedPathFromTourUrl,
  isExpiredGuestPreviewTourUrl,
} = require('../lib/guest-preview-cleanup');
const {
  clampGuestPreviewTimeoutSeconds,
  GUEST_PREVIEW_TIMEOUT_SECONDS_DEFAULT,
} = require('../lib/app-settings');

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guest-preview-test-'));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function testClampSeconds() {
  assert.strictEqual(clampGuestPreviewTimeoutSeconds(1200), 1200);
  assert.strictEqual(clampGuestPreviewTimeoutSeconds(10), 30);
  assert.strictEqual(clampGuestPreviewTimeoutSeconds(99999), 3600);
  assert.strictEqual(clampGuestPreviewTimeoutSeconds('bad'), GUEST_PREVIEW_TIMEOUT_SECONDS_DEFAULT);
  console.log('✓ clamp guest preview timeout seconds');
}

function testGuestPreviewPathDetection() {
  assert.strictEqual(isGuestPreviewPath('vr-preview-abc-tour'), true);
  assert.strictEqual(isGuestPreviewPath('vr-student123-tour'), false);
  console.log('✓ guest preview path detection');
}

function testExpiredGuestPreviewDeleted() {
  withTempDir((root) => {
    const hostedPath = 'vr-preview-test-expired';
    const targetDir = path.join(root, hostedPath);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'index.html'), '<html></html>');
    markGuestPreviewExpiry(root, hostedPath, {
      expiresAt: Date.now() - 1000,
      timeoutSeconds: 1200,
    });
    assert.strictEqual(isGuestPreviewExpired(root, hostedPath), true);
    const deleted = sweepExpiredGuestPreviews(root);
    assert.strictEqual(deleted, 1);
    assert.strictEqual(fs.existsSync(targetDir), false);
  });
  console.log('✓ expired guest preview deleted');
}

function testStudentPreviewWithoutMetaNotExpired() {
  withTempDir((root) => {
    const hostedPath = 'vr-preview-student-session';
    const targetDir = path.join(root, hostedPath);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'index.html'), '<html></html>');
    assert.strictEqual(isGuestPreviewExpired(root, hostedPath), false);
    const deleted = sweepExpiredGuestPreviews(root);
    assert.strictEqual(deleted, 0);
    assert.strictEqual(fs.existsSync(targetDir), true);
  });
  console.log('✓ student preview without meta not expired');
}

function testPermanentTourPathIgnored() {
  withTempDir((root) => {
    const hostedPath = 'vr-abc12345-my-tour';
    const targetDir = path.join(root, hostedPath);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'index.html'), '<html></html>');
    assert.strictEqual(isGuestPreviewExpired(root, hostedPath), false);
    const deleted = sweepExpiredGuestPreviews(root);
    assert.strictEqual(deleted, 0);
  });
  console.log('✓ permanent tour path ignored');
}

function testDisabledTimeoutMetaNotExpired() {
  withTempDir((root) => {
    const hostedPath = 'vr-preview-guest-no-timeout';
    const targetDir = path.join(root, hostedPath);
    fs.mkdirSync(targetDir, { recursive: true });
    markGuestPreviewExpiry(root, hostedPath, {});
    assert.strictEqual(isGuestPreviewExpired(root, hostedPath), false);
    const deleted = sweepExpiredGuestPreviews(root);
    assert.strictEqual(deleted, 0);
  });
  console.log('✓ disabled timeout meta not expired');
}

function testTourUrlParsing() {
  assert.strictEqual(
    hostedPathFromTourUrl('https://example.com/hosted/vr-preview-abc/index.html'),
    'vr-preview-abc'
  );
  withTempDir((root) => {
    const dir = path.join(root, 'vr-preview-abc');
    fs.mkdirSync(dir, { recursive: true });
    markGuestPreviewExpiry(root, 'vr-preview-abc', { expiresAt: Date.now() - 500, timeoutSeconds: 1200 });
    const url = 'https://example.com/hosted/vr-preview-abc/index.html';
    assert.strictEqual(isExpiredGuestPreviewTourUrl(root, url), true);
  });
  console.log('✓ tour URL parsing');
}

function main() {
  testClampSeconds();
  testGuestPreviewPathDetection();
  testExpiredGuestPreviewDeleted();
  testStudentPreviewWithoutMetaNotExpired();
  testPermanentTourPathIgnored();
  testDisabledTimeoutMetaNotExpired();
  testTourUrlParsing();
  console.log('\nAll guest preview cleanup tests passed.');
}

main();
