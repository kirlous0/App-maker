# Repo2APK

Automated Android APK build platform powered by **Next.js**, **TypeScript**, **Supabase (PostgreSQL + Private Storage)**, **GitHub Apps**, and **GitHub Actions**.

Repo2APK connects to your GitHub account via least-privilege GitHub App installation, inspects authentic Android source repositories (**Native Android Kotlin/Java Gradle**, **Flutter**, **React Native CLI / Expo Bare**), compiles the application inside isolated GitHub Actions runners using its real build configuration, validates the output APK and SHA-256 checksum, and serves signed private downloads.

> **Important:** Repo2APK does **not** wrap websites in a WebView. Non-Android repositories are clearly detected and rejected before any build starts.

---

## Core Architecture

- **Frontend & BFF**: Next.js App Router + TypeScript + Tailwind CSS (Arabic RTL default + English LTR toggle)
- **Authentication & Token Security**: GitHub App OAuth + Installation scoping, `HttpOnly` HMAC-signed session cookies, AES-256-GCM encrypted server-side token & keystore storage (zero `localStorage` tokens, zero PAT inputs)
- **Build Engine**: Explicit-approval installation of `templates/workflows/repo2apk-build.yml`, `workflow_dispatch` with unique run correlation nonce, real-time step/log SSE streaming, and LibSodium-sealed ephemeral secrets for Release keystores
- **Database & Private Storage**: Supabase PostgreSQL with Row Level Security (RLS) on all tables + private `apk-artifacts` bucket with 120-second signed download URLs

## Documentation

- [GitHub App Setup Guide](docs/GITHUB_APP_SETUP.md)
- [Environment Variables Reference](docs/ENVIRONMENT_VARIABLES.md)
- [Deployment Instructions (Vercel + Supabase)](docs/DEPLOYMENT.md)
- [Testing & End-to-End Verification](docs/TESTING.md)
- [Workflow Template](templates/workflows/repo2apk-build.yml)
- [Database Migration](supabase/migrations/20261123000001_init_repo2apk.sql)

## Local Quick Start

```bash
npm install
cp .env.example .env.local
# Fill in Supabase, GitHub App, SESSION_SECRET, and TOKEN_ENCRYPTION_KEY values
npm run dev
```
