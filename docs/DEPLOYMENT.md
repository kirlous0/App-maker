# Deployment Guide (Vercel + Supabase)

## 1. Provision Supabase Database & Private Storage

1. Create a Supabase project (PostgreSQL 17).
2. Apply the migration in `supabase/migrations/20261123000001_init_repo2apk.sql`:
   - Via Supabase SQL Editor, or
   - Via Supabase CLI: `supabase db push`
3. Verify the migration created:
   - Tables: `users`, `github_installations`, `repositories`, `projects`, `signing_configurations`, `build_jobs`, `build_logs`, `build_artifacts`, `rate_limit_events`
   - Row Level Security (`ENABLE ROW LEVEL SECURITY`) enabled on all 9 tables
   - Private storage bucket `apk-artifacts` (`public = false`)

## 2. Deploy Next.js App to Vercel

1. Connect the repository to Vercel (Framework Preset: **Next.js**).
2. Add all environment variables listed in `docs/ENVIRONMENT_VARIABLES.md` (Production & Preview).
3. Update your GitHub App Callback URL and Webhook URL to match the deployed Vercel domain:
   - `https://<your-vercel-domain>/api/auth/github/callback`
   - `https://<your-vercel-domain>/api/webhooks/github`
4. Verify `/api/health` returns `200 OK` with `"database": { "mode": "supabase", "ok": true }`.

## 3. Scheduled Artifact Cleanup

`vercel.json` configures a daily cron job invoking `/api/cron/cleanup` using `CRON_SECRET`. Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when `CRON_SECRET` is configured in Environment Variables.
