# GitHub App Setup Guide for Repo2APK

Repo2APK uses a **GitHub App** with OAuth user-to-server authorization and per-repository installation scoping. It never asks users for Personal Access Tokens (PATs) and never stores tokens in browser `localStorage`.

---

## 1. Create the GitHub App

1. Open GitHub -> **Settings** -> **Developer settings** -> **GitHub Apps** -> **New GitHub App**.
2. Fill in the core fields:
   - **GitHub App name**: `Repo2APK Builder` (must be globally unique on GitHub; note the generated URL slug for `GITHUB_APP_SLUG`).
   - **Homepage URL**: Your app URL (e.g. `https://your-repo2apk-domain.vercel.app`).
   - **Callback URL**:
     - Production: `https://your-repo2apk-domain.vercel.app/api/auth/github/callback`
     - Local Dev: `http://localhost:3000/api/auth/github/callback`
   - **Expire user authorization tokens**: Enabled (recommended — Repo2APK automatically refreshes expiring tokens server-side).
   - **Request user authorization (OAuth) during installation**: **Enabled** (checked).
   - **Setup URL** (optional): Same as Callback URL or leave blank when OAuth during installation is checked.
3. **Webhook**:
   - **Active**: Checked.
   - **Webhook URL**: `https://your-repo2apk-domain.vercel.app/api/webhooks/github`
   - **Webhook secret**: Generate with `openssl rand -hex 32` -> set as `GITHUB_WEBHOOK_SECRET`.

---

## 2. Minimum Repository Permissions

Configure **only** these permissions under **Repository permissions**:

| Permission | Access Level | Purpose |
|---|---|---|
| **Metadata** | Read-only | Mandatory baseline to list authorized repositories and branches. |
| **Contents** | Read & write | Read Gradle/Flutter/RN files for Android analysis, and commit `.github/workflows/repo2apk-build.yml` only after explicit user approval. |
| **Workflows** | Read & write | Create or update the dedicated `.github/workflows/repo2apk-build.yml` workflow file. |
| **Actions** | Read & write | Dispatch `workflow_dispatch` builds, poll run/job steps & logs, and download compiled APK artifacts. |
| **Secrets** | Read & write | Optional — only used when a user supplies a custom Release keystore so Repo2APK seals credentials into ephemeral encrypted Actions secrets and deletes them right after the build. |

Leave **Account permissions** and **Organization permissions** at **No access** unless needed.

---

## 3. Subscribe to Events

Under **Subscribe to events**, check:
- `Workflow run`
- `Workflow job`
- `Installation` (automatically included)
- `Installation repositories`

---

## 4. Generate Credentials

1. On the GitHub App general page:
   - Copy **App ID** -> `GITHUB_APP_ID`
   - Copy **Client ID** -> `GITHUB_CLIENT_ID`
   - Click **Generate a new client secret** -> `GITHUB_CLIENT_SECRET`
   - Copy the URL slug (from `https://github.com/apps/<slug>`) -> `GITHUB_APP_SLUG`
2. Under **Private keys**, click **Generate a private key** (downloads a `.pem` file).
3. Format the `.pem` file for environment variables:
   ```bash
   awk 'NF {sub(/\r/, ""); printf "%s\\n",$0;}' your-app.private-key.pem
   ```
   Set the resulting single-line string as `GITHUB_APP_PRIVATE_KEY`.
