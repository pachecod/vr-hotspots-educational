const fs = require('fs');
const path = require('path');
const { getPool, isDbEnabled } = require('../services/db-service');

async function runMigrations() {
  if (!isDbEnabled()) {
    console.log('ℹ️  DATABASE_URL not set — skipping PostgreSQL migrations');
    return false;
  }

  const pool = getPool();
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  const { rows } = await pool.query(`SELECT name FROM schema_migrations WHERE name = $1`, [
    'initial_schema_v1',
  ]);
  if (rows.length > 0) {
    console.log('✅ Database schema already applied');
  } else {
    console.log('🔄 Applying database schema...');
    await pool.query(schemaSql);
    await pool.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, ['initial_schema_v1']);
    console.log('✅ Database schema applied');
  }

  await applyIncrementalMigrations(pool);
  return true;
}

async function applyIncrementalMigrations(pool) {
  const migrations = [
    {
      name: 'students_password_encrypted_v1',
      sql: `ALTER TABLE students ADD COLUMN IF NOT EXISTS password_encrypted TEXT;`,
    },
    {
      name: 'project_versions_v1',
      sql: `
        CREATE TABLE IF NOT EXISTS project_threads (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          project_name TEXT NOT NULL,
          project_slug TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (student_id, project_slug)
        );
        CREATE INDEX IF NOT EXISTS idx_project_threads_student_id ON project_threads(student_id);

        CREATE TABLE IF NOT EXISTS project_versions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          thread_id UUID NOT NULL REFERENCES project_threads(id) ON DELETE CASCADE,
          version_number INT NOT NULL,
          kind TEXT NOT NULL CHECK (kind IN ('draft', 'submitted', 'admin_return')),
          b2_path TEXT NOT NULL UNIQUE,
          file_name TEXT NOT NULL UNIQUE,
          student_note TEXT,
          admin_note TEXT,
          parent_version_id UUID REFERENCES project_versions(id) ON DELETE SET NULL,
          created_by TEXT NOT NULL CHECK (created_by IN ('student', 'admin')),
          student_seen_at TIMESTAMPTZ,
          submitted_at TIMESTAMPTZ,
          hosted_path TEXT,
          hosted_url TEXT,
          hosted_at TIMESTAMPTZ,
          is_hosted BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (thread_id, version_number)
        );
        CREATE INDEX IF NOT EXISTS idx_project_versions_thread_id ON project_versions(thread_id);
        CREATE INDEX IF NOT EXISTS idx_project_versions_kind ON project_versions(kind, submitted_at DESC);
      `,
    },
    {
      name: 'billing_limit_overrides_v1',
      sql: `ALTER TABLE billing_accounts ADD COLUMN IF NOT EXISTS limit_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;`,
    },
    {
      name: 'asset_tags_v1',
      sql: `
        CREATE TABLE IF NOT EXISTS asset_tags (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          asset_key TEXT NOT NULL,
          tag TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (asset_key, tag)
        );
        CREATE INDEX IF NOT EXISTS idx_asset_tags_asset_key ON asset_tags(asset_key);
        CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag);
      `,
    },
    {
      name: 'editor_features_v1',
      sql: `
        CREATE TABLE IF NOT EXISTS snippets (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title TEXT NOT NULL,
          code TEXT NOT NULL,
          language TEXT NOT NULL DEFAULT 'html',
          sort_order INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL DEFAULT '{}'::jsonb,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS project_templates (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title TEXT NOT NULL,
          slug TEXT NOT NULL UNIQUE,
          description TEXT NOT NULL DEFAULT '',
          scope TEXT NOT NULL DEFAULT 'flat' CHECK (scope IN ('flat', 'combined')),
          is_public BOOLEAN NOT NULL DEFAULT FALSE,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          sort_order INT NOT NULL DEFAULT 0,
          files_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
          thumbnail_url TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_project_templates_public ON project_templates(is_public, sort_order);
      `,
    },
    {
      name: 'project_templates_playground_v1',
      sql: `
        ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS is_playground BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE project_templates ADD COLUMN IF NOT EXISTS bundle_b2_key TEXT;
        CREATE INDEX IF NOT EXISTS idx_project_templates_playground ON project_templates(is_playground, sort_order);
      `,
    },
    {
      name: 'flat_page_projects_v1',
      sql: `
        CREATE TABLE IF NOT EXISTS flat_page_projects (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
          thread_id UUID REFERENCES project_threads(id) ON DELETE SET NULL,
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          b2_prefix TEXT NOT NULL,
          files_manifest JSONB NOT NULL DEFAULT '[]'::jsonb,
          hosted_path TEXT,
          hosted_url TEXT,
          hosted_at TIMESTAMPTZ,
          is_hosted BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE (student_id, slug)
        );
        CREATE INDEX IF NOT EXISTS idx_flat_page_projects_student_id ON flat_page_projects(student_id);
      `,
    },
  ];

  for (const migration of migrations) {
    const { rows } = await pool.query(`SELECT name FROM schema_migrations WHERE name = $1`, [
      migration.name,
    ]);
    if (rows.length > 0) continue;
    console.log(`🔄 Applying migration: ${migration.name}`);
    await pool.query(migration.sql);
    await pool.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [migration.name]);
    console.log(`✅ Migration applied: ${migration.name}`);
  }

  const { rows: pvRows } = await pool.query(
    `SELECT name FROM schema_migrations WHERE name = $1`,
    ['project_versions_import_v1']
  );
  if (pvRows.length === 0) {
    const projectVersionsDb = require('../services/project-versions-db');
    const result = await projectVersionsDb.importLegacySubmissions();
    await pool.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, ['project_versions_import_v1']);
    console.log(`✅ Imported ${result.imported} legacy submission(s) into project_versions`);
  }

  const { rows: cleanupRows } = await pool.query(
    `SELECT name FROM schema_migrations WHERE name = $1`,
    ['orphan_project_thread_cleanup_v1']
  );
  if (cleanupRows.length === 0) {
    const {
      purgeOrphanProjectThreads,
      purgeEmptyProjectThreads,
    } = require('../lib/purge-project-thread');
    const orphans = await purgeOrphanProjectThreads();
    const empty = await purgeEmptyProjectThreads();
    await pool.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [
      'orphan_project_thread_cleanup_v1',
    ]);
    console.log(
      `✅ Project thread cleanup: ${orphans.purged} orphan(s), ${empty.purged} empty thread(s) removed`
    );
  }

  await applyContentHubMigrations(pool);
}

async function applyContentHubMigrations(pool) {
  const contentHubMigration = {
    name: 'content_hub_v1',
    sql: `
      ALTER TABLE student_assets ADD COLUMN IF NOT EXISTS ownership TEXT NOT NULL DEFAULT 'student';
      ALTER TABLE student_assets ADD COLUMN IF NOT EXISTS orphaned_from JSONB;
      ALTER TABLE student_assets ALTER COLUMN student_id DROP NOT NULL;
      ALTER TABLE student_assets DROP CONSTRAINT IF EXISTS student_assets_student_id_category_filename_key;
      CREATE UNIQUE INDEX IF NOT EXISTS idx_student_assets_student_unique
        ON student_assets (student_id, category, filename)
        WHERE ownership = 'student' AND student_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_student_assets_orphaned
        ON student_assets(ownership) WHERE ownership = 'orphaned';

      CREATE TABLE IF NOT EXISTS student_published_tours (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        slug TEXT NOT NULL,
        hosted_path TEXT NOT NULL,
        hosted_url TEXT NOT NULL,
        qr_url TEXT,
        published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (student_id, slug)
      );
      CREATE INDEX IF NOT EXISTS idx_student_published_tours_student_id ON student_published_tours(student_id);

      CREATE TABLE IF NOT EXISTS purged_b2_paths (
        b2_path TEXT PRIMARY KEY,
        purged_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `,
  };

  const { rows } = await pool.query(`SELECT name FROM schema_migrations WHERE name = $1`, [
    contentHubMigration.name,
  ]);
  if (rows.length === 0) {
    console.log(`🔄 Applying migration: ${contentHubMigration.name}`);
    await pool.query(contentHubMigration.sql);
    await pool.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [contentHubMigration.name]);
    console.log(`✅ Migration applied: ${contentHubMigration.name}`);
  }

  const { rows: backfillRows } = await pool.query(
    `SELECT name FROM schema_migrations WHERE name = $1`,
    ['content_hub_vr_tour_backfill_v1']
  );
  if (backfillRows.length === 0) {
    const backfilled = await backfillVrToursFromDisk(pool);
    await pool.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, [
      'content_hub_vr_tour_backfill_v1',
    ]);
    console.log(`✅ VR tour backfill: ${backfilled} tour(s) registered`);
  }
}

async function backfillVrToursFromDisk(pool) {
  const fs = require('fs');
  const path = require('path');
  const hostedDir = path.join(process.cwd(), 'hosted-projects');
  if (!fs.existsSync(hostedDir)) return 0;

  const { rows: students } = await pool.query(
    `SELECT s.id, s.display_name FROM students s`
  );
  const shortIdMap = new Map();
  for (const s of students) {
    const shortId = String(s.id).replace(/-/g, '').slice(0, 8);
    shortIdMap.set(shortId, s.id);
  }

  let count = 0;
  const baseUrl = process.env.SERVER_BASE_URL || 'http://localhost:3000';
  for (const entry of fs.readdirSync(hostedDir)) {
    if (!entry.startsWith('vr-')) continue;
    const rest = entry.slice(3);
    const dashIdx = rest.indexOf('-');
    if (dashIdx < 1) continue;
    const shortId = rest.slice(0, dashIdx);
    const slug = rest.slice(dashIdx + 1);
    const studentId = shortIdMap.get(shortId);
    if (!studentId || !slug) continue;
    const indexPath = path.join(hostedDir, entry, 'index.html');
    if (!fs.existsSync(indexPath)) continue;
    const hostedUrl = `${baseUrl.replace(/\/$/, '')}/hosted/${entry}/index.html`;
    const qrUrl = `${baseUrl.replace(/\/$/, '')}/hosted/${entry}/qr.png`;
    const { rowCount } = await pool.query(
      `INSERT INTO student_published_tours (student_id, slug, hosted_path, hosted_url, qr_url, published_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (student_id, slug) DO NOTHING`,
      [studentId, slug, entry, hostedUrl, qrUrl]
    );
    if (rowCount > 0) count++;
  }
  return count;
}

async function importSubmissionsFromJson(loadSubmissionsLog, writeSubmissionsLog) {
  if (!isDbEnabled()) return { imported: 0 };

  const file = path.join(process.cwd(), 'submissions.json');
  if (!fs.existsSync(file)) return { imported: 0 };

  const entries = loadSubmissionsLog();
  let imported = 0;

  for (const entry of entries) {
    if (!entry.fileName || !entry.remotePath) continue;
    const existing = await require('../services/db-service').query(
      `SELECT id FROM submissions WHERE file_name = $1`,
      [entry.fileName]
    );
    if (existing.rows.length > 0) continue;

    await require('../services/db-service').query(
      `INSERT INTO submissions (
        student_name, project_name, file_name, remote_path,
        hosted_path, hosted_url, hosted_at, is_hosted, submitted_at, synced_from_b2
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (file_name) DO NOTHING`,
      [
        entry.studentName || 'unknown',
        entry.projectName || 'VR_Project',
        entry.fileName,
        entry.remotePath,
        entry.hostedPath || null,
        entry.hostedUrl || null,
        entry.hostedAt ? new Date(entry.hostedAt) : null,
        !!entry.isHosted,
        entry.submittedAt ? new Date(entry.submittedAt) : new Date(),
        !!entry.syncedFromB2,
      ]
    );
    imported++;
  }

  if (imported > 0) {
    console.log(`✅ Imported ${imported} submission(s) from submissions.json into PostgreSQL`);
  }
  return { imported };
}

module.exports = { runMigrations, importSubmissionsFromJson };
