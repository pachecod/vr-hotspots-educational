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
const { setHostedDirForTests } = require('../lib/hosted-b2-storage');
const {
  clampGuestPreviewTimeoutSeconds,
  GUEST_PREVIEW_TIMEOUT_SECONDS_DEFAULT,
} = require('../lib/app-settings');

async function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'guest-preview-test-'));
  setHostedDirForTests(dir);
  try {
    return await fn(dir);
  } finally {
    setHostedDirForTests(null);
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
  assert.strictEqual(isGuestPreviewPath('flat-preview-abc-page'), true);
  assert.strictEqual(isGuestPreviewPath('vr-student123-tour'), false);
  assert.strictEqual(isGuestPreviewPath('flat-a1b2c3d4-my-page'), false);
  console.log('✓ guest preview path detection');
}

async function testExpiredGuestPreviewDeleted() {
  await withTempDir(async (root) => {
    const hostedPath = 'vr-preview-test-expired';
    const targetDir = path.join(root, hostedPath);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'index.html'), '<html></html>');
    await markGuestPreviewExpiry(hostedPath, {
      expiresAt: Date.now() - 1000,
      timeoutSeconds: 1200,
    });
    assert.strictEqual(await isGuestPreviewExpired(hostedPath), true);
    const deleted = await sweepExpiredGuestPreviews();
    assert.strictEqual(deleted, 1);
    assert.strictEqual(fs.existsSync(targetDir), false);
  });
  console.log('✓ expired guest preview deleted');
}

async function testStudentPreviewWithoutMetaNotExpired() {
  await withTempDir(async (root) => {
    const hostedPath = 'vr-preview-student-session';
    const targetDir = path.join(root, hostedPath);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'index.html'), '<html></html>');
    assert.strictEqual(await isGuestPreviewExpired(hostedPath), false);
    const deleted = await sweepExpiredGuestPreviews();
    assert.strictEqual(deleted, 0);
    assert.strictEqual(fs.existsSync(targetDir), true);
  });
  console.log('✓ student preview without meta not expired');
}

async function testExpiredFlatPreviewDeleted() {
  await withTempDir(async (root) => {
    const hostedPath = 'flat-preview-test-expired';
    const targetDir = path.join(root, hostedPath);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'index.html'), '<html></html>');
    await markGuestPreviewExpiry(hostedPath, {
      expiresAt: Date.now() - 1000,
      timeoutSeconds: 1200,
    });
    assert.strictEqual(await isGuestPreviewExpired(hostedPath), true);
    const deleted = await sweepExpiredGuestPreviews();
    assert.strictEqual(deleted, 1);
    assert.strictEqual(fs.existsSync(targetDir), false);
  });
  console.log('✓ expired flat preview deleted');
}

async function testPermanentTourPathIgnored() {
  await withTempDir(async (root) => {
    const hostedPath = 'vr-abc12345-my-tour';
    const targetDir = path.join(root, hostedPath);
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, 'index.html'), '<html></html>');
    assert.strictEqual(await isGuestPreviewExpired(hostedPath), false);
    const deleted = await sweepExpiredGuestPreviews();
    assert.strictEqual(deleted, 0);
  });
  console.log('✓ permanent tour path ignored');
}

async function testDisabledTimeoutMetaNotExpired() {
  await withTempDir(async (root) => {
    const hostedPath = 'vr-preview-guest-no-timeout';
    const targetDir = path.join(root, hostedPath);
    fs.mkdirSync(targetDir, { recursive: true });
    await markGuestPreviewExpiry(hostedPath, {});
    assert.strictEqual(await isGuestPreviewExpired(hostedPath), false);
    const deleted = await sweepExpiredGuestPreviews();
    assert.strictEqual(deleted, 0);
  });
  console.log('✓ disabled timeout meta not expired');
}

async function testTourUrlParsing() {
  assert.strictEqual(
    hostedPathFromTourUrl('https://example.com/hosted/vr-preview-abc/index.html'),
    'vr-preview-abc'
  );
  await withTempDir(async (root) => {
    const dir = path.join(root, 'vr-preview-abc');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'index.html'), '<html></html>');
    await markGuestPreviewExpiry('vr-preview-abc', { expiresAt: Date.now() - 500, timeoutSeconds: 1200 });
    const url = 'https://example.com/hosted/vr-preview-abc/index.html';
    assert.strictEqual(await isExpiredGuestPreviewTourUrl(url), true);
  });
  console.log('✓ tour URL parsing');
}

async function main() {
  testClampSeconds();
  testGuestPreviewPathDetection();
  await testExpiredGuestPreviewDeleted();
  await testExpiredFlatPreviewDeleted();
  await testStudentPreviewWithoutMetaNotExpired();
  await testPermanentTourPathIgnored();
  await testDisabledTimeoutMetaNotExpired();
  await testTourUrlParsing();
  console.log('\nAll guest preview cleanup tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
