-- VR Hotspots 2.0 schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id UUID NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  password_encrypted TEXT,
  password_set_at TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_id, display_name)
);

CREATE INDEX IF NOT EXISTS idx_students_class_id ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_username ON students(username);

CREATE TABLE IF NOT EXISTS submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES students(id) ON DELETE SET NULL,
  student_name TEXT NOT NULL,
  project_name TEXT NOT NULL,
  file_name TEXT NOT NULL UNIQUE,
  remote_path TEXT NOT NULL,
  hosted_path TEXT,
  hosted_url TEXT,
  hosted_at TIMESTAMPTZ,
  is_hosted BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  synced_from_b2 BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_submissions_student_id ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON submissions(submitted_at DESC);

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

CREATE TABLE IF NOT EXISTS student_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  filename TEXT NOT NULL,
  b2_path TEXT NOT NULL UNIQUE,
  size BIGINT NOT NULL DEFAULT 0,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, category, filename)
);

CREATE INDEX IF NOT EXISTS idx_student_assets_student_id ON student_assets(student_id);

-- Flat Web Page projects (WebXRIDE-style HTML/CSS/JS authored alongside spherical content)
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

CREATE TABLE IF NOT EXISTS asset_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_key TEXT NOT NULL,
  tag TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (asset_key, tag)
);

CREATE INDEX IF NOT EXISTS idx_asset_tags_asset_key ON asset_tags(asset_key);
CREATE INDEX IF NOT EXISTS idx_asset_tags_tag ON asset_tags(tag);

CREATE TABLE IF NOT EXISTS billing_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scope_type TEXT NOT NULL CHECK (scope_type IN ('class', 'student', 'site')),
  scope_id UUID NOT NULL,
  stripe_customer_id TEXT,
  plan_tier TEXT NOT NULL DEFAULT 'free',
  limit_overrides JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'active',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scope_type, scope_id)
);

CREATE TABLE IF NOT EXISTS usage_counters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id UUID NOT NULL REFERENCES billing_accounts(id) ON DELETE CASCADE,
  metric TEXT NOT NULL,
  period_start DATE NOT NULL,
  value BIGINT NOT NULL DEFAULT 0,
  UNIQUE (billing_account_id, metric, period_start)
);

CREATE TABLE IF NOT EXISTS stripe_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS schema_migrations (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
