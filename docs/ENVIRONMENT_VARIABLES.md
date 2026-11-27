# Environment Variables Reference

Copy `.env.example` to `.env.local` for local development or configure these in Vercel Project Settings -> Environment Variables.

| Variable | Required | Description |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | Yes | Public origin URL without trailing slash (e.g. `https://repo2apk.vercel.app` or `http://localhost:3000`). |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase project URL (`https://<ref>.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase public/publishable anon key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase server-side service role key (**server-only**, never expose to client). |
| `SESSION_SECRET` | Yes | Secret (>= 32 chars) for HMAC-SHA256 signing of `HttpOnly` session and CSRF cookies. Generate: `openssl rand -hex 32`. |
| `TOKEN_ENCRYPTION_KEY` | Yes | 64-char hex (32 bytes) AES-256-GCM master key for encrypting GitHub OAuth tokens and per-user signing keystores at rest. Generate: `openssl rand -hex 32`. |
| `GITHUB_APP_ID` | Yes | Numeric ID of your GitHub App. |
| `GITHUB_APP_SLUG` | Yes | URL slug of your GitHub App (`https://github.com/apps/<slug>`). |
| `GITHUB_CLIENT_ID` | Yes | GitHub App OAuth Client ID. |
| `GITHUB_CLIENT_SECRET` | Yes | GitHub App OAuth Client Secret. |
| `GITHUB_APP_PRIVATE_KEY` | Yes | GitHub App RSA private key PEM (`\n`-escaped single line or multi-line). |
| `GITHUB_WEBHOOK_SECRET` | Recommended | Secret used to verify `X-Hub-Signature-256` on `POST /api/webhooks/github`. |
| `CRON_SECRET` | Recommended | Bearer secret authorizing `POST /api/cron/cleanup`. Generate: `openssl rand -hex 24`. |
| `BUILD_TIMEOUT_MINUTES` | Optional | Default `45`. Stale builds older than this are marked `timed_out`. |
| `MAX_CONCURRENT_BUILDS_PER_USER` | Optional | Default `2`. Prevents concurrent runner abuse per user. |
| `ARTIFACT_RETENTION_DAYS` | Optional | Default `7`. Default days before APK artifacts expire from private storage. |
