# Testing & Verification Guide

## 1. Automated Unit & Integration Tests

Run the Vitest suite (verifies Android project detection across Native Kotlin/Groovy/Multi-module, Flutter, React Native, Expo Bare, Non-Android rejection, build command computation, APK ZIP/Manifest/SHA-256 validation, AES-256-GCM encryption, HMAC session cookies, webhook signature verification, and failure log classification):

```bash
npm test
npm run typecheck
npm run build
```

## 2. Real End-to-End Android Repository Build Verification

Once your GitHub App credentials are configured in `.env.local` (or Vercel):

1. Open `/`, verify Arabic RTL loads by default (`dir="rtl"`, `lang="ar"`), and toggle to English (`EN`) to verify LTR switching.
2. Click **Connect GitHub Account** -> authorize the GitHub App on a real Android repository (Native Kotlin/Java, Flutter, or React Native CLI).
3. On `/dashboard`, confirm your username, avatar, and authorized repository list appear.
4. Select your Android repository -> `/configure`:
   - Switch branches and inspect the latest commit SHA.
   - Review the **Android Project Analysis Report** (framework, package ID, SDK versions, Gradle wrapper, Java version, signing status).
   - Also test selecting a non-Android repository (e.g., an HTML/Next.js repo) and confirm Repo2APK blocks the build with a clear explanation.
5. For your Android repository, review the `.github/workflows/repo2apk-build.yml` preview, check the approval checkbox, and click **Approve & Install Workflow**.
6. Choose **Debug APK** (or **Release APK** with your own `.jks`/`.keystore`), confirm the derived command, and click **Build APK**.
7. On `/builds/[id]`, observe the real-time 9-stage progress pipeline and live GitHub Actions logs.
8. Upon completion, open `/builds/[id]/download`, verify SHA-256 checksum, package ID, file size, and click **Download APK** to download the compiled `.apk` binary from private Supabase Storage.
9. Verify `/history` shows the build record and allows rebuilding or deleting the record + artifact.
