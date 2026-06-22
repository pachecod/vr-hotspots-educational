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
    return true;
  }

  console.log('🔄 Applying database schema...');
  await pool.query(schemaSql);
  await pool.query(`INSERT INTO schema_migrations (name) VALUES ($1)`, ['initial_schema_v1']);
  console.log('✅ Database schema applied');
  return true;
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
