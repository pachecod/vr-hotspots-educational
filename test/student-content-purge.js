/**
 * Content hub purge / inventory regression tests.
 * Run: node test/student-content-purge.js
 */

const assert = require('assert');
const path = require('path');
const {
  purgeContentItem,
  describePurge,
  purgeProjectThread,
  removeHostedDir,
} = require('../lib/student-content/purge');
const { studentHostedPrefix } = require('../lib/student-content/flat-page-purge');
const { CONTENT_TYPES } = require('../lib/student-content/inventory');

function testExports() {
  assert.strictEqual(typeof purgeContentItem, 'function');
  assert.strictEqual(typeof describePurge, 'function');
  assert.strictEqual(typeof purgeProjectThread, 'function');
  assert.ok(CONTENT_TYPES.includes('project'));
  assert.ok(CONTENT_TYPES.includes('orphan_asset'));
  assert.ok(CONTENT_TYPES.includes('legacy_submission'));
  console.log('✓ module exports');
}

function testStudentHostedPrefix() {
  const id = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  assert.strictEqual(studentHostedPrefix(id), 'flat-a1b2c3d4-');
  console.log('✓ student hosted prefix');
}

function testRemoveHostedDirSafety() {
  assert.strictEqual(removeHostedDir('../etc/passwd'), false);
  assert.strictEqual(removeHostedDir('foo/bar'), false);
  console.log('✓ hosted dir path safety');
}

async function testDescribePurgeProjectPreservesAssets() {
  const manifest = await describePurge({ type: 'project', id: '00000000-0000-0000-0000-000000000001' });
  assert.strictEqual(manifest.type, 'project');
  assert.ok(
    manifest.preserved.some((p) => p.includes('student_assets')),
    'project delete should preserve student_assets'
  );
  assert.ok(
    manifest.willRemove.dbTables.some((t) => t.includes('project_threads')),
    'project delete should remove thread'
  );
  console.log('✓ describePurge project preserves assets');
}

async function testPurgeContentItemUnknownType() {
  let threw = false;
  try {
    await purgeContentItem({ type: 'unknown_type', id: 'x' });
  } catch (err) {
    threw = true;
    assert.ok(err.message.includes('Unknown content type'));
  }
  assert.strictEqual(threw, true);
  console.log('✓ unknown purge type rejected');
}

async function run() {
  testExports();
  testStudentHostedPrefix();
  testRemoveHostedDirSafety();
  await testDescribePurgeProjectPreservesAssets();
  await testPurgeContentItemUnknownType();
  console.log('\nAll student content purge tests passed.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
