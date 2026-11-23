-- Repo2APK Initial Schema & RLS Migration
-- Target: Supabase PostgreSQL 17 + Supabase Private Storage

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Users
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  github_user_id bigint UNIQUE NOT NULL,
  github_login text NOT NULL,
  name text,
  email text,
  avatar_url text,
  preferred_language text NOT NULL DEFAULT 'ar' CHECK (preferred_language IN ('ar', 'en')),
  default_build_type text NOT NULL DEFAULT 'debug' CHECK (default_build_type IN ('debug', 'release')),
  artifact_retention_days integer NOT NULL DEFAULT 7 CHECK (artifact_retention_days BETWEEN 1 AND 90),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2. GitHub Installations (encrypted OAuth tokens stored server-side only)
CREATE TABLE IF NOT EXISTS public.github_installations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  installation_id bigint NOT NULL,
  account_login text NOT NULL,
  account_type text NOT NULL DEFAULT 'User',
  repository_selection text NOT NULL DEFAULT 'selected',
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  encrypted_user_access_token text,
  encrypted_user_refresh_token text,
  token_expires_at timestamptz,
  suspended_at timestamptz,
  disconnected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, installation_id)
);

-- 3. Repositories
CREATE TABLE IF NOT EXISTS public.repositories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  installation_id bigint NOT NULL,
  github_repo_id bigint NOT NULL,
  owner text NOT NULL,
  name text NOT NULL,
  full_name text NOT NULL,
  description text,
  visibility text NOT NULL DEFAULT 'public',
  is_private boolean NOT NULL DEFAULT false,
  primary_language text,
  default_branch text NOT NULL DEFAULT 'main',
  html_url text,
  pushed_at timestamptz,
  synced_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, github_repo_id)
);

-- 4. Projects
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  repository_id uuid REFERENCES public.repositories(id) ON DELETE SET NULL,
  repo_full_name text NOT NULL,
  branch text NOT NULL,
  project_dir text NOT NULL DEFAULT '.',
  framework text NOT NULL DEFAULT 'unknown',
  application_module text,
  package_id text,
  analysis_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  workflow_installed boolean NOT NULL DEFAULT false,
  workflow_path text NOT NULL DEFAULT '.github/workflows/repo2apk-build.yml',
  last_analyzed_sha text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, repo_full_name, branch, project_dir)
);

-- 5. Signing Configurations (encrypted per-user keystore credentials, never shared)
CREATE TABLE IF NOT EXISTS public.signing_configurations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  label text NOT NULL,
  repo_full_name text,
  key_alias text NOT NULL,
  encrypted_keystore_base64 text NOT NULL,
  encrypted_store_password text NOT NULL,
  encrypted_key_password text NOT NULL,
  keystore_sha256 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6. Build Jobs
CREATE TABLE IF NOT EXISTS public.build_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  signing_config_id uuid REFERENCES public.signing_configurations(id) ON DELETE SET NULL,
  run_nonce text NOT NULL UNIQUE,
  installation_id bigint NOT NULL,
  repo_full_name text NOT NULL,
  branch text NOT NULL,
  commit_sha text NOT NULL,
  project_dir text NOT NULL DEFAULT '.',
  framework text NOT NULL,
  build_type text NOT NULL CHECK (build_type IN ('debug', 'release')),
  build_variant text,
  application_module text,
  abi_mode text NOT NULL DEFAULT 'universal' CHECK (abi_mode IN ('universal', 'split')),
  build_name text,
  build_number text,
  build_command text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'validating', 'storing', 'succeeded', 'failed', 'cancelled', 'timed_out')),
  current_stage integer NOT NULL DEFAULT 1,
  stages_state jsonb NOT NULL DEFAULT '[]'::jsonb,
  github_run_id bigint,
  github_job_id bigint,
  github_run_url text,
  is_unsigned boolean NOT NULL DEFAULT false,
  error_code text,
  error_summary text,
  error_details text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 7. Build Logs
CREATE TABLE IF NOT EXISTS public.build_logs (
  id bigserial PRIMARY KEY,
  build_job_id uuid NOT NULL REFERENCES public.build_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  stage_index integer NOT NULL DEFAULT 1,
  step_name text,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error', 'debug')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 8. Build Artifacts
CREATE TABLE IF NOT EXISTS public.build_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  build_job_id uuid NOT NULL REFERENCES public.build_jobs(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  app_name text,
  file_name text NOT NULL,
  storage_bucket text NOT NULL DEFAULT 'apk-artifacts',
  storage_path text NOT NULL,
  size_bytes bigint NOT NULL,
  sha256 text NOT NULL,
  package_id text,
  version_name text,
  version_code text,
  is_signed boolean NOT NULL DEFAULT false,
  signing_status text NOT NULL DEFAULT 'unsigned',
  abi text NOT NULL DEFAULT 'universal',
  download_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 9. Rate Limit Events
CREATE TABLE IF NOT EXISTS public.rate_limit_events (
  id bigserial PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_installations_user_id ON public.github_installations(user_id);
CREATE INDEX IF NOT EXISTS idx_repositories_user_id ON public.repositories(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_signing_configs_user_id ON public.signing_configurations(user_id);
CREATE INDEX IF NOT EXISTS idx_build_jobs_user_created ON public.build_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_build_jobs_run_nonce ON public.build_jobs(run_nonce);
CREATE INDEX IF NOT EXISTS idx_build_jobs_github_run_id ON public.build_jobs(github_run_id);
CREATE INDEX IF NOT EXISTS idx_build_logs_job_id ON public.build_logs(build_job_id, id);
CREATE INDEX IF NOT EXISTS idx_build_artifacts_job_id ON public.build_artifacts(build_job_id);
CREATE INDEX IF NOT EXISTS idx_build_artifacts_expires_at ON public.build_artifacts(expires_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rate_limit_user_action_time ON public.rate_limit_events(user_id, action, created_at DESC);

-- Helper for updated_at
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON public.users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON public.users FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_installations_updated_at ON public.github_installations;
CREATE TRIGGER trg_installations_updated_at BEFORE UPDATE ON public.github_installations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_projects_updated_at ON public.projects;
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_signing_configs_updated_at ON public.signing_configurations;
CREATE TRIGGER trg_signing_configs_updated_at BEFORE UPDATE ON public.signing_configurations FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_build_jobs_updated_at ON public.build_jobs;
CREATE TRIGGER trg_build_jobs_updated_at BEFORE UPDATE ON public.build_jobs FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- Enable Row Level Security (strict per-user isolation)
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.github_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.repositories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signing_configurations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limit_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_profile" ON public.users
  FOR ALL USING (id = auth.uid() OR id::text = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (id = auth.uid() OR id::text = current_setting('request.jwt.claim.sub', true));

CREATE POLICY "users_own_installations" ON public.github_installations
  FOR ALL USING (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true));

CREATE POLICY "users_own_repositories" ON public.repositories
  FOR ALL USING (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true));

CREATE POLICY "users_own_projects" ON public.projects
  FOR ALL USING (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true));

CREATE POLICY "users_own_signing_configs" ON public.signing_configurations
  FOR ALL USING (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true));

CREATE POLICY "users_own_build_jobs" ON public.build_jobs
  FOR ALL USING (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true));

CREATE POLICY "users_own_build_logs" ON public.build_logs
  FOR ALL USING (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true));

CREATE POLICY "users_own_build_artifacts" ON public.build_artifacts
  FOR ALL USING (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true));

CREATE POLICY "users_own_rate_limits" ON public.rate_limit_events
  FOR ALL USING (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true))
  WITH CHECK (user_id = auth.uid() OR user_id::text = current_setting('request.jwt.claim.sub', true));

-- Private Storage Bucket for APK Artifacts
INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'apk-artifacts',
  'apk-artifacts',
  false,
  ARRAY['application/vnd.android.package-archive', 'application/octet-stream']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "apk_artifacts_owner_select" ON storage.objects;
CREATE POLICY "apk_artifacts_owner_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'apk-artifacts'
    AND (storage.foldername(name))[1] = COALESCE(auth.uid()::text, current_setting('request.jwt.claim.sub', true))
  );

DROP POLICY IF EXISTS "apk_artifacts_owner_insert" ON storage.objects;
CREATE POLICY "apk_artifacts_owner_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'apk-artifacts'
    AND (storage.foldername(name))[1] = COALESCE(auth.uid()::text, current_setting('request.jwt.claim.sub', true))
  );

DROP POLICY IF EXISTS "apk_artifacts_owner_delete" ON storage.objects;
CREATE POLICY "apk_artifacts_owner_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'apk-artifacts'
    AND (storage.foldername(name))[1] = COALESCE(auth.uid()::text, current_setting('request.jwt.claim.sub', true))
  );
