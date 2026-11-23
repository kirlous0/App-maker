import YAML from 'yaml';
import type {
  AndroidFramework,
  AndroidProjectAnalysis,
  AndroidSdkRequirements,
  ExistingSigningInfo,
} from '@/lib/types';

export type RepoFileFetcher = (repoRelativePath: string) => Promise<string | null>;

function normalizeDir(dir: string | undefined | null): string {
  if (!dir) return '.';
  const cleaned = dir.trim().replace(/^\/+|\/+$/g, '');
  return cleaned === '' || cleaned === '.' ? '.' : cleaned;
}

function joinDir(dir: string, rel: string): string {
  const d = normalizeDir(dir);
  const r = rel.replace(/^\/+/, '');
  return d === '.' ? r : `${d}/${r}`;
}

export function discoverCandidateProjectDirectories(treePaths: string[]): string[] {
  const candidates = new Set<string>();
  const ignored = /(^|\/)(node_modules|\.git|\.dart_tool|\.gradle|build|dist|\.next)\//;

  for (const p of treePaths) {
    if (ignored.test(p)) continue;
    const parts = p.split('/');
    const file = parts[parts.length - 1];
    const dir = parts.length === 1 ? '.' : parts.slice(0, -1).join('/');

    if (
      file === 'pubspec.yaml' ||
      file === 'settings.gradle' ||
      file === 'settings.gradle.kts' ||
      file === 'package.json'
    ) {
      candidates.add(dir);
    } else if (
      (file === 'build.gradle' || file === 'build.gradle.kts') &&
      parts.length >= 2 &&
      parts[parts.length - 2] === 'android'
    ) {
      // e.g. my-app/android/build.gradle -> candidate root is my-app (or . if top-level android/)
      const parent = parts.length === 2 ? '.' : parts.slice(0, -2).join('/');
      candidates.add(parent);
    }
  }

  if (candidates.size === 0) candidates.add('.');
  return Array.from(candidates).sort((a, b) => {
    if (a === '.') return -1;
    if (b === '.') return 1;
    return a.localeCompare(b);
  });
}

function parseGradleWrapperVersion(propsContent: string | null): string | null {
  if (!propsContent) return null;
  const match = propsContent.match(/distributionUrl\s*=.*gradle-([0-9]+(?:\.[0-9]+)*)-/);
  return match?.[1] || null;
}

function parseSettingsModules(settingsContent: string | null): string[] {
  if (!settingsContent) return [];
  const modules = new Set<string>();
  const includeRegex = /include\s*\(([^)]+)\)|include\s+([^\r\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = includeRegex.exec(settingsContent)) !== null) {
    const raw = (m[1] || m[2] || '').trim();
    const quoted = raw.matchAll(/["']([^"']+)["']/g);
    for (const q of quoted) {
      const mod = q[1].trim();
      if (mod) {
        modules.add(mod.startsWith(':') ? mod : `:${mod}`);
      }
    }
  }
  return Array.from(modules);
}

function parseGradleStringProp(content: string, names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match Kotlin/Groovy: prop = "val" OR prop "val" OR prop = 34 OR prop(34) OR prop = flutter.compileSdkVersion
    const strMatch = content.match(
      new RegExp(`\\b${escaped}\\s*(?:=|\\s)\\s*["']([^"']+)["']`)
    );
    if (strMatch?.[1]) return strMatch[1].trim();
    const numMatch = content.match(
      new RegExp(`\\b${escaped}\\s*(?:=|\\s|\\()\\s*([0-9]{1,3})(?:\\)|\\s|$)`)
    );
    if (numMatch?.[1]) return numMatch[1].trim();
    const flutterRef = content.match(
      new RegExp(`\\b${escaped}\\s*(?:=|\\s)\\s*(flutter\\.[A-Za-z0-9_]+)`)
    );
    if (flutterRef?.[1]) return flutterRef[1].trim();
  }
  return null;
}

function parseVersionCatalogAgp(tomlContent: string | null): {
  agpVersion: string | null;
  kotlinVersion: string | null;
  appPluginAlias: string | null;
} {
  if (!tomlContent) return { agpVersion: null, kotlinVersion: null, appPluginAlias: null };
  const agpMatch = tomlContent.match(/^(?:agp|androidGradlePlugin|gradle)\s*=\s*["']([^"']+)["']/m);
  const kotlinMatch = tomlContent.match(/^kotlin\s*=\s*["']([^"']+)["']/m);
  const aliasMatch = tomlContent.match(
    /^([A-Za-z0-9_-]+)\s*=\s*\{[^}]*id\s*=\s*["']com\.android\.application["']/m
  );
  return {
    agpVersion: agpMatch?.[1] || null,
    kotlinVersion: kotlinMatch?.[1] || null,
    appPluginAlias: aliasMatch?.[1]?.replace(/-/g, '.') || null,
  };
}

function parseBuildTypesAndFlavors(gradleContent: string): {
  buildTypes: string[];
  productFlavors: string[];
} {
  const buildTypes = new Set<string>(['debug', 'release']);
  const productFlavors = new Set<string>();

  const btBlock = gradleContent.match(/buildTypes\s*\{([\s\S]*?)\n\s*\}/);
  if (btBlock?.[1]) {
    const ktsMatches = btBlock[1].matchAll(/(?:create|getByName|named)\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g);
    for (const m of ktsMatches) buildTypes.add(m[1]);
    const groovyMatches = btBlock[1].matchAll(/^\s{4,12}([A-Za-z][A-Za-z0-9_-]*)\s*\{/gm);
    for (const m of groovyMatches) {
      if (!['create', 'getByName', 'named', 'initWith'].includes(m[1])) {
        buildTypes.add(m[1]);
      }
    }
  }

  const pfBlock = gradleContent.match(/productFlavors\s*\{([\s\S]*?)\n\s*\}/);
  if (pfBlock?.[1]) {
    const ktsMatches = pfBlock[1].matchAll(/(?:create|getByName|register)\(\s*["']([A-Za-z0-9_-]+)["']\s*\)/g);
    for (const m of ktsMatches) productFlavors.add(m[1]);
    const groovyMatches = pfBlock[1].matchAll(/^\s{4,12}([A-Za-z][A-Za-z0-9_-]*)\s*\{/gm);
    for (const m of groovyMatches) {
      if (!['create', 'getByName', 'register', 'dimension'].includes(m[1])) {
        productFlavors.add(m[1]);
      }
    }
  }

  return {
    buildTypes: Array.from(buildTypes),
    productFlavors: Array.from(productFlavors),
  };
}

function capitalize(str: string): string {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

function computeVariants(buildTypes: string[], flavors: string[]): string[] {
  if (flavors.length === 0) return buildTypes;
  const variants: string[] = [];
  for (const flavor of flavors) {
    for (const bt of buildTypes) {
      variants.push(`${flavor}${capitalize(bt)}`);
    }
  }
  return variants;
}

function detectSigningConfig(gradleContents: string[]): ExistingSigningInfo {
  const combined = gradleContents.join('\n');
  const hasReleaseSigningConfig =
    /signingConfigs\s*\{[\s\S]*?(?:release|create\(\s*["']release["']\s*\))/i.test(combined);
  const referencesKeystoreFile =
    /storeFile\s*(?:=|\s)|keystore\.properties|signing\.properties|\.jks|\.keystore/i.test(combined);
  const referencesEnvVars =
    /System\.getenv|findProperty|providers\.environmentVariable|KEYSTORE/i.test(combined);

  const details: string[] = [];
  if (hasReleaseSigningConfig) {
    details.push('Detected release block inside signingConfigs');
  }
  if (referencesKeystoreFile) {
    details.push('References keystore file or keystore.properties');
  }
  if (referencesEnvVars) {
    details.push('Reads signing credentials from environment/Gradle properties');
  }

  return {
    hasReleaseSigningConfig,
    referencesKeystoreFile,
    referencesEnvVars,
    details,
  };
}

function detectJavaVersion(contents: string[], agpVersion: string | null): {
  javaVersion: string | null;
  recommendedJdk: string;
} {
  const combined = contents.join('\n');
  const explicit =
    combined.match(/JavaVersion\.VERSION_([0-9_]+)/)?.[1]?.replace('_', '.') ||
    combined.match(/jvmToolchain\(\s*([0-9]+)\s*\)/)?.[1] ||
    combined.match(/jvmTarget\s*(?:=|\s)\s*["']?(?:1\.)?([0-9]+)["']?/)?.[1] ||
    null;

  let recommendedJdk = '17';
  if (explicit) {
    const major = explicit === '1.8' ? 8 : parseInt(explicit, 10);
    if (major >= 21) recommendedJdk = '21';
    else if (major >= 17) recommendedJdk = '17';
    else if (major >= 11) recommendedJdk = '17'; // AGP 8+ runs on 17 cleanly with sourceCompat 11
    else recommendedJdk = '17';
  } else if (agpVersion && parseFloat(agpVersion) >= 8.3) {
    recommendedJdk = '17';
  }

  return { javaVersion: explicit, recommendedJdk };
}

function extractGradleDependencies(contents: string[]): string[] {
  const deps = new Set<string>();
  const combined = contents.join('\n');
  const matches = combined.matchAll(
    /(?:implementation|api|kapt|ksp)\s*\(?\s*["']([A-Za-z0-9._-]+:[A-Za-z0-9._-]+)(?::[^"']+)?["']\s*\)?/g
  );
  for (const m of matches) {
    deps.add(m[1]);
    if (deps.size >= 18) break;
  }
  const aliasMatches = combined.matchAll(/(?:implementation|api)\(\s*(libs\.[A-Za-z0-9._-]+)\s*\)/g);
  for (const m of aliasMatches) {
    deps.add(m[1]);
    if (deps.size >= 18) break;
  }
  return Array.from(deps);
}

function parseManifestInfo(manifestXml: string | null): { packageId: string | null; appLabel: string | null } {
  if (!manifestXml) return { packageId: null, appLabel: null };
  const pkg = manifestXml.match(/package\s*=\s*["']([^"']+)["']/)?.[1] || null;
  const label = manifestXml.match(/android:label\s*=\s*["']([^"'@][^"']*)["']/)?.[1] || null;
  return { packageId: pkg, appLabel: label };
}

function inferAgpVersion(rootGradle: string | null, tomlAgp: string | null): string | null {
  if (tomlAgp) return tomlAgp;
  if (!rootGradle) return null;
  const m1 = rootGradle.match(/com\.android\.tools\.build:gradle:([0-9]+\.[0-9]+(?:\.[0-9]+)?)/);
  if (m1?.[1]) return m1[1];
  const m2 = rootGradle.match(/id\s*\(?\s*["']com\.android\.application["']\s*\)?\s*version\s*["']([^"']+)["']/);
  return m2?.[1] || null;
}

export async function analyzeAndroidProject(params: {
  repoFullName: string;
  branch: string;
  commitSha: string;
  projectDir?: string;
  treePaths: string[];
  fetchFile: RepoFileFetcher;
}): Promise<AndroidProjectAnalysis> {
  const projectDir = normalizeDir(params.projectDir);
  const candidateDirectories = discoverCandidateProjectDirectories(params.treePaths);
  const pathSet = new Set(params.treePaths);

  const hasFile = (rel: string) => pathSet.has(joinDir(projectDir, rel));

  const blockers: AndroidProjectAnalysis['blockers'] = [];
  const warnings: AndroidProjectAnalysis['warnings'] = [];

  // 1. Check Flutter (pubspec.yaml)
  if (hasFile('pubspec.yaml')) {
    const pubspecRaw = await params.fetchFile(joinDir(projectDir, 'pubspec.yaml'));
    if (pubspecRaw) {
      let parsed: Record<string, unknown> = {};
      try {
        parsed = (YAML.parse(pubspecRaw) as Record<string, unknown>) || {};
      } catch {
        parsed = {};
      }
      const deps = (parsed.dependencies as Record<string, unknown>) || {};
      const isFlutter = Boolean(deps.flutter || parsed.flutter);
      if (isFlutter) {
        const hasAndroidDir =
          hasFile('android/build.gradle') ||
          hasFile('android/build.gradle.kts') ||
          hasFile('android/app/build.gradle') ||
          hasFile('android/app/build.gradle.kts');

        const fvmrc = await params.fetchFile(joinDir(projectDir, '.fvmrc'));
        const fvmConfig = await params.fetchFile(joinDir(projectDir, '.fvm/fvm_config.json'));
        const flutterVersionFile = await params.fetchFile(joinDir(projectDir, '.flutter-version'));
        let flutterVersion: string | null = flutterVersionFile?.trim() || null;
        if (!flutterVersion && fvmrc) {
          try {
            flutterVersion = (JSON.parse(fvmrc) as { flutter?: string }).flutter || null;
          } catch {
            flutterVersion = null;
          }
        }
        if (!flutterVersion && fvmConfig) {
          try {
            flutterVersion = (JSON.parse(fvmConfig) as { flutterSdkVersion?: string }).flutterSdkVersion || null;
          } catch {
            flutterVersion = null;
          }
        }

        const versionRaw = typeof parsed.version === 'string' ? parsed.version : null;
        const [vName, vCode] = versionRaw ? versionRaw.split('+') : [null, null];

        const androidRootGradle =
          (await params.fetchFile(joinDir(projectDir, 'android/build.gradle.kts'))) ||
          (await params.fetchFile(joinDir(projectDir, 'android/build.gradle')));
        const androidAppGradle =
          (await params.fetchFile(joinDir(projectDir, 'android/app/build.gradle.kts'))) ||
          (await params.fetchFile(joinDir(projectDir, 'android/app/build.gradle')));
        const gradleProps = await params.fetchFile(
          joinDir(projectDir, 'android/gradle/wrapper/gradle-wrapper.properties')
        );
        const manifest = await params.fetchFile(
          joinDir(projectDir, 'android/app/src/main/AndroidManifest.xml')
        );
        const toml = await params.fetchFile(joinDir(projectDir, 'android/gradle/libs.versions.toml'));

        const hasGradleWrapper = hasFile('android/gradlew');
        if (!hasAndroidDir) {
          blockers.push({
            code: 'MISSING_ANDROID_PROJECT',
            messageAr: 'مشروع Flutter هذا لا يحتوي على مجلد android/ بعد. يلزم وجود مشروع أندرويد فعلي.',
            messageEn: 'This Flutter project does not contain an android/ directory yet.',
          });
        } else if (!hasGradleWrapper) {
          warnings.push({
            code: 'MISSING_GRADLE_WRAPPER',
            messageAr: 'لم يتم العثور على android/gradlew؛ سيعتمد البناء على Flutter CLI لتوليد/تهيئة Gradle.',
            messageEn: 'android/gradlew was not found; Flutter CLI will invoke Gradle if cached.',
          });
        }

        const gradleTexts = [androidRootGradle || '', androidAppGradle || ''].filter(Boolean);
        const combinedGradle = gradleTexts.join('\n');
        const catalog = parseVersionCatalogAgp(toml);
        const agpVersion = inferAgpVersion(androidRootGradle, catalog.agpVersion);
        const { javaVersion, recommendedJdk } = detectJavaVersion(gradleTexts, agpVersion);
        const { buildTypes, productFlavors } = parseBuildTypesAndFlavors(combinedGradle);
        const manifestInfo = parseManifestInfo(manifest);
        const packageId =
          parseGradleStringProp(combinedGradle, ['applicationId', 'namespace']) ||
          manifestInfo.packageId;
        const androidSdk: AndroidSdkRequirements = {
          compileSdk: parseGradleStringProp(combinedGradle, ['compileSdk', 'compileSdkVersion']),
          minSdk: parseGradleStringProp(combinedGradle, ['minSdk', 'minSdkVersion']),
          targetSdk: parseGradleStringProp(combinedGradle, ['targetSdk', 'targetSdkVersion']),
          ndkVersion: parseGradleStringProp(combinedGradle, ['ndkVersion']),
          buildToolsVersion: parseGradleStringProp(combinedGradle, ['buildToolsVersion']),
        };
        const existingSigning = detectSigningConfig(gradleTexts);
        if (!existingSigning.hasReleaseSigningConfig) {
          warnings.push({
            code: 'NO_RELEASE_SIGNING_CONFIG',
            messageAr: 'لم يتم رصد إعداد توقيع Release مخصص؛ البناء بصيغة Release بدون شهادة سينتج APK غير موقّع.',
            messageEn: 'No release signingConfig detected; Release builds without a keystore produce an unsigned APK.',
          });
        }

        const isKts = hasFile('android/app/build.gradle.kts') || hasFile('android/build.gradle.kts');
        return {
          repoFullName: params.repoFullName,
          branch: params.branch,
          commitSha: params.commitSha,
          projectDir,
          isAndroidProject: hasAndroidDir,
          isBuildable: hasAndroidDir && blockers.length === 0,
          framework: 'flutter',
          frameworkLabel: 'Flutter (Android)',
          language: 'Dart',
          buildSystem: isKts ? 'Flutter + Gradle Kotlin DSL (.kts)' : 'Flutter + Gradle Groovy DSL',
          agpVersion,
          gradleWrapperVersion: parseGradleWrapperVersion(gradleProps),
          hasGradleWrapper,
          javaVersion,
          recommendedJdk,
          flutterVersion: flutterVersion || 'stable',
          reactNativeVersion: null,
          expoVersion: null,
          applicationModules: ['app'],
          selectedModule: 'app',
          packageId,
          versionName: vName || null,
          versionCode: vCode || null,
          buildTypes,
          productFlavors,
          availableVariants: computeVariants(buildTypes, productFlavors),
          androidSdk,
          dependencies: Object.keys(deps).slice(0, 18),
          existingSigning,
          candidateDirectories,
          supportsAbiSplit: true,
          supportsBuildNameNumberOverride: true,
          blockers,
          warnings,
        };
      }
    }
  }

  // 2. Check React Native / Expo
  if (hasFile('package.json')) {
    const pkgRaw = await params.fetchFile(joinDir(projectDir, 'package.json'));
    if (pkgRaw) {
      let pkg: {
        name?: string;
        version?: string;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      } = {};
      try {
        pkg = JSON.parse(pkgRaw);
      } catch {
        pkg = {};
      }
      const allDeps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      const rnVersion = allDeps['react-native'] || null;
      const expoVersion = allDeps['expo'] || null;

      if (rnVersion || expoVersion) {
        const hasAndroidGradle =
          hasFile('android/build.gradle') ||
          hasFile('android/build.gradle.kts') ||
          hasFile('android/app/build.gradle') ||
          hasFile('android/app/build.gradle.kts');

        if (!hasAndroidGradle) {
          return {
            repoFullName: params.repoFullName,
            branch: params.branch,
            commitSha: params.commitSha,
            projectDir,
            isAndroidProject: false,
            isBuildable: false,
            framework: 'unsupported',
            frameworkLabel: expoVersion ? 'Expo Managed (No android/)' : 'React Native (No android/)',
            language: 'TypeScript / JavaScript',
            buildSystem: 'Missing native android/ directory',
            agpVersion: null,
            gradleWrapperVersion: null,
            hasGradleWrapper: false,
            javaVersion: null,
            recommendedJdk: '17',
            flutterVersion: null,
            reactNativeVersion: rnVersion,
            expoVersion,
            applicationModules: [],
            selectedModule: null,
            packageId: null,
            versionName: pkg.version || null,
            versionCode: null,
            buildTypes: [],
            productFlavors: [],
            availableVariants: [],
            androidSdk: {
              compileSdk: null,
              minSdk: null,
              targetSdk: null,
              ndkVersion: null,
              buildToolsVersion: null,
            },
            dependencies: Object.keys(allDeps).slice(0, 18),
            existingSigning: {
              hasReleaseSigningConfig: false,
              referencesKeystoreFile: false,
              referencesEnvVars: false,
              details: [],
            },
            candidateDirectories,
            supportsAbiSplit: false,
            supportsBuildNameNumberOverride: false,
            blockers: [
              {
                code: 'MISSING_ANDROID_PROJECT',
                messageAr:
                  'هذا المشروع لا يحتوي على مجلد android/ أصلي (مشروع Expo مُدار بدون prebuild). شغّل `npx expo prebuild --platform android` أو اختر مستودعاً يحتوي على كود أندرويد.',
                messageEn:
                  'This project lacks a native android/ Gradle directory (managed Expo without prebuild). Run `npx expo prebuild --platform android` first.',
              },
            ],
            warnings: [],
            nonAndroidReason: {
              code: 'MISSING_NATIVE_ANDROID_DIR',
              messageAr:
                'لا ينشئ Repo2APK أغلفة WebView. لبناء تطبيق React Native / Expo يجب وجود مجلد android/ فعلي مع ملفات Gradle.',
              messageEn:
                'Repo2APK never wraps web apps in WebView. A native android/ Gradle directory is required.',
              detectedFiles: ['package.json'],
            },
          };
        }

        const hasGradleWrapper = hasFile('android/gradlew');
        if (!hasGradleWrapper) {
          blockers.push({
            code: 'MISSING_GRADLE_WRAPPER',
            messageAr: 'ملف android/gradlew غير موجود في المستودع ولا يمكن تشغيل Gradle بأمان بدونه.',
            messageEn: 'android/gradlew is missing from the repository.',
          });
        }

        const androidRootGradle =
          (await params.fetchFile(joinDir(projectDir, 'android/build.gradle.kts'))) ||
          (await params.fetchFile(joinDir(projectDir, 'android/build.gradle')));
        const androidAppGradle =
          (await params.fetchFile(joinDir(projectDir, 'android/app/build.gradle.kts'))) ||
          (await params.fetchFile(joinDir(projectDir, 'android/app/build.gradle')));
        const gradleProps = await params.fetchFile(
          joinDir(projectDir, 'android/gradle/wrapper/gradle-wrapper.properties')
        );
        const manifest = await params.fetchFile(
          joinDir(projectDir, 'android/app/src/main/AndroidManifest.xml')
        );

        const gradleTexts = [androidRootGradle || '', androidAppGradle || ''].filter(Boolean);
        const combinedGradle = gradleTexts.join('\n');
        const agpVersion = inferAgpVersion(androidRootGradle, null);
        const { javaVersion, recommendedJdk } = detectJavaVersion(gradleTexts, agpVersion);
        const { buildTypes, productFlavors } = parseBuildTypesAndFlavors(combinedGradle);
        const manifestInfo = parseManifestInfo(manifest);
        const packageId =
          parseGradleStringProp(combinedGradle, ['applicationId', 'namespace']) ||
          manifestInfo.packageId;
        const androidSdk: AndroidSdkRequirements = {
          compileSdk: parseGradleStringProp(combinedGradle, ['compileSdk', 'compileSdkVersion']),
          minSdk: parseGradleStringProp(combinedGradle, ['minSdk', 'minSdkVersion']),
          targetSdk: parseGradleStringProp(combinedGradle, ['targetSdk', 'targetSdkVersion']),
          ndkVersion: parseGradleStringProp(combinedGradle, ['ndkVersion']),
          buildToolsVersion: parseGradleStringProp(combinedGradle, ['buildToolsVersion']),
        };
        const existingSigning = detectSigningConfig(gradleTexts);
        const isKts = hasFile('android/app/build.gradle.kts') || hasFile('android/build.gradle.kts');
        const framework: AndroidFramework = expoVersion ? 'expo_bare' : 'react_native';

        return {
          repoFullName: params.repoFullName,
          branch: params.branch,
          commitSha: params.commitSha,
          projectDir,
          isAndroidProject: true,
          isBuildable: blockers.length === 0,
          framework,
          frameworkLabel: expoVersion ? 'Expo (Native Android)' : 'React Native CLI',
          language: hasFile('tsconfig.json') ? 'TypeScript + Kotlin/Java' : 'JavaScript + Kotlin/Java',
          buildSystem: isKts ? 'React Native + Gradle Kotlin DSL (.kts)' : 'React Native + Gradle Groovy DSL',
          agpVersion,
          gradleWrapperVersion: parseGradleWrapperVersion(gradleProps),
          hasGradleWrapper,
          javaVersion,
          recommendedJdk,
          flutterVersion: null,
          reactNativeVersion: rnVersion,
          expoVersion,
          applicationModules: ['app'],
          selectedModule: 'app',
          packageId,
          versionName: parseGradleStringProp(combinedGradle, ['versionName']) || pkg.version || null,
          versionCode: parseGradleStringProp(combinedGradle, ['versionCode']),
          buildTypes,
          productFlavors,
          availableVariants: computeVariants(buildTypes, productFlavors),
          androidSdk,
          dependencies: Object.keys(allDeps).slice(0, 18),
          existingSigning,
          candidateDirectories,
          supportsAbiSplit: true,
          supportsBuildNameNumberOverride: false,
          blockers,
          warnings,
        };
      }
    }
  }

  // 3. Check Native Android (Kotlin / Java / Multi-module Gradle)
  const hasSettingsKts = hasFile('settings.gradle.kts');
  const hasSettingsGroovy = hasFile('settings.gradle');
  const hasRootGradleKts = hasFile('build.gradle.kts');
  const hasRootGradleGroovy = hasFile('build.gradle');
  const hasAppGradle = hasFile('app/build.gradle.kts') || hasFile('app/build.gradle');

  if (hasSettingsKts || hasSettingsGroovy || hasRootGradleKts || hasRootGradleGroovy || hasAppGradle) {
    const settingsRaw =
      (await params.fetchFile(joinDir(projectDir, 'settings.gradle.kts'))) ||
      (await params.fetchFile(joinDir(projectDir, 'settings.gradle')));
    const rootGradle =
      (await params.fetchFile(joinDir(projectDir, 'build.gradle.kts'))) ||
      (await params.fetchFile(joinDir(projectDir, 'build.gradle')));
    const toml = await params.fetchFile(joinDir(projectDir, 'gradle/libs.versions.toml'));
    const gradleProps = await params.fetchFile(
      joinDir(projectDir, 'gradle/wrapper/gradle-wrapper.properties')
    );

    const catalog = parseVersionCatalogAgp(toml);
    const parsedModules = parseSettingsModules(settingsRaw);

    // Discover potential modules in tree if settings.gradle didn't list them explicitly
    const prefixSlash = projectDir === '.' ? '' : `${projectDir}/`;
    const discoveredGradleDirs = new Set<string>(parsedModules.map((m) => m.replace(/^:/, '').replace(/:/g, '/')));
    for (const p of params.treePaths) {
      if (prefixSlash && !p.startsWith(prefixSlash)) continue;
      const rel = prefixSlash ? p.slice(prefixSlash.length) : p;
      const m = rel.match(/^(.+)\/build\.gradle(?:\.kts)?$/);
      if (m?.[1] && !m[1].includes('buildSrc')) {
        discoveredGradleDirs.add(m[1]);
      }
    }
    if (discoveredGradleDirs.size === 0 && (hasRootGradleKts || hasRootGradleGroovy)) {
      discoveredGradleDirs.add('.');
    }

    const appModules: Array<{ name: string; content: string; manifest: string | null }> = [];
    const allModuleContents: string[] = [];

    for (const modDir of Array.from(discoveredGradleDirs).slice(0, 12)) {
      const modPrefix = modDir === '.' ? '' : `${modDir}/`;
      const modGradle =
        (await params.fetchFile(joinDir(projectDir, `${modPrefix}build.gradle.kts`))) ||
        (await params.fetchFile(joinDir(projectDir, `${modPrefix}build.gradle`)));
      if (!modGradle) continue;
      allModuleContents.push(modGradle);

      const isAppPlugin =
        /com\.android\.application/.test(modGradle) ||
        (catalog.appPluginAlias ? modGradle.includes(catalog.appPluginAlias) : false);

      if (isAppPlugin) {
        const manifest = await params.fetchFile(
          joinDir(projectDir, `${modPrefix}src/main/AndroidManifest.xml`)
        );
        appModules.push({
          name: modDir === '.' ? 'root' : modDir.replace(/\//g, ':'),
          content: modGradle,
          manifest,
        });
      }
    }

    const isAndroidPluginInRoot = Boolean(
      rootGradle &&
        (/com\.android\.application|com\.android\.library/.test(rootGradle) ||
          (catalog.appPluginAlias && rootGradle.includes(catalog.appPluginAlias)))
    );

    if (appModules.length > 0 || isAndroidPluginInRoot) {
      const primary = appModules[0] || {
        name: 'app',
        content: rootGradle || '',
        manifest: await params.fetchFile(joinDir(projectDir, 'src/main/AndroidManifest.xml')),
      };
      const hasGradleWrapper = hasFile('gradlew');
      if (!hasGradleWrapper) {
        blockers.push({
          code: 'MISSING_GRADLE_WRAPPER',
          messageAr: 'لم يتم العثور على سكربت ./gradlew في جذر المشروع.',
          messageEn: 'Gradle wrapper script (./gradlew) is missing in this project directory.',
        });
      }

      const gradleTexts = [rootGradle || '', ...allModuleContents].filter(Boolean);
      const primaryGradle = primary.content || rootGradle || '';
      const hasKtFiles = params.treePaths.some(
        (p) => (!prefixSlash || p.startsWith(prefixSlash)) && p.endsWith('.kt')
      );
      const hasJavaFiles = params.treePaths.some(
        (p) => (!prefixSlash || p.startsWith(prefixSlash)) && p.endsWith('.java')
      );
      const language =
        hasKtFiles && hasJavaFiles ? 'Kotlin + Java' : hasKtFiles ? 'Kotlin' : 'Java';

      const isKts =
        hasSettingsKts || hasRootGradleKts || hasFile(`${primary.name.replace(/:/g, '/')}/build.gradle.kts`);
      const agpVersion = inferAgpVersion(rootGradle, catalog.agpVersion);

      let extraSdkText = primaryGradle;
      // Check convention plugin files (e.g., build-logic/.../AndroidApplicationConventionPlugin.kt or KotlinAndroid.kt)
      // if primary module relies on a convention plugin for compileSdk/minSdk/targetSdk
      if (!parseGradleStringProp(extraSdkText, ['compileSdk', 'compileSdkVersion'])) {
        const conventionFiles = params.treePaths
          .filter((p) => {
            if (prefixSlash && !p.startsWith(prefixSlash)) return false;
            const rel = prefixSlash ? p.slice(prefixSlash.length) : p;
            return (
              /^build-logic\/.*\.(kt|kts|gradle)$/.test(rel) &&
              /(Android|Kotlin|Application)/.test(rel)
            );
          })
          .slice(0, 4);
        if (conventionFiles.length > 0) {
          const contents = await Promise.all(conventionFiles.map((f) => params.fetchFile(f)));
          const extra = contents.filter((c): c is string => Boolean(c));
          gradleTexts.push(...extra);
          extraSdkText = `${extraSdkText}\n${extra.join('\n')}`;
        }
      }

      const { javaVersion, recommendedJdk } = detectJavaVersion(gradleTexts, agpVersion);
      const { buildTypes, productFlavors } = parseBuildTypesAndFlavors(primaryGradle);
      const manifestInfo = parseManifestInfo(primary.manifest);
      const packageId =
        parseGradleStringProp(primaryGradle, ['applicationId', 'namespace']) || manifestInfo.packageId;

      const androidSdk: AndroidSdkRequirements = {
        compileSdk: parseGradleStringProp(extraSdkText, ['compileSdk', 'compileSdkVersion']),
        minSdk: parseGradleStringProp(extraSdkText, ['minSdk', 'minSdkVersion']),
        targetSdk: parseGradleStringProp(extraSdkText, ['targetSdk', 'targetSdkVersion']),
        ndkVersion: parseGradleStringProp(extraSdkText, ['ndkVersion']),
        buildToolsVersion: parseGradleStringProp(extraSdkText, ['buildToolsVersion']),
      };

      const existingSigning = detectSigningConfig(gradleTexts);
      if (!existingSigning.hasReleaseSigningConfig) {
        warnings.push({
          code: 'NO_RELEASE_SIGNING_CONFIG',
          messageAr: 'لا يوجد إعداد توقيع release في ملفات Gradle. يمكنك استخدام شهادة توقيع مخصصة لبناء Release.',
          messageEn: 'No release signingConfig detected in Gradle files. Supply a keystore for signed Release APKs.',
        });
      }

      return {
        repoFullName: params.repoFullName,
        branch: params.branch,
        commitSha: params.commitSha,
        projectDir,
        isAndroidProject: true,
        isBuildable: blockers.length === 0,
        framework: 'native_android',
        frameworkLabel:
          appModules.length > 1
            ? `Native Android (Multi-module: ${appModules.length} apps)`
            : 'Native Android',
        language,
        buildSystem: isKts ? 'Gradle Kotlin DSL (.kts)' : 'Gradle Groovy DSL',
        agpVersion,
        gradleWrapperVersion: parseGradleWrapperVersion(gradleProps),
        hasGradleWrapper,
        javaVersion,
        recommendedJdk,
        flutterVersion: null,
        reactNativeVersion: null,
        expoVersion: null,
        applicationModules: appModules.map((m) => m.name),
        selectedModule: primary.name,
        packageId,
        versionName: parseGradleStringProp(primaryGradle, ['versionName']),
        versionCode: parseGradleStringProp(primaryGradle, ['versionCode']),
        buildTypes,
        productFlavors,
        availableVariants: computeVariants(buildTypes, productFlavors),
        androidSdk,
        dependencies: extractGradleDependencies(gradleTexts),
        existingSigning,
        candidateDirectories,
        supportsAbiSplit: false,
        supportsBuildNameNumberOverride: false,
        blockers,
        warnings,
      };
    }
  }

  // 4. Not an Android application
  const prefixSlash = projectDir === '.' ? '' : `${projectDir}/`;
  const topFiles = params.treePaths
    .filter((p) => !prefixSlash || p.startsWith(prefixSlash))
    .map((p) => (prefixSlash ? p.slice(prefixSlash.length) : p))
    .filter((p) => !p.includes('/'))
    .slice(0, 12);

  return {
    repoFullName: params.repoFullName,
    branch: params.branch,
    commitSha: params.commitSha,
    projectDir,
    isAndroidProject: false,
    isBuildable: false,
    framework: 'unsupported',
    frameworkLabel: 'Not an Android Application',
    language: 'Unknown',
    buildSystem: 'Unsupported / Non-Android',
    agpVersion: null,
    gradleWrapperVersion: null,
    hasGradleWrapper: false,
    javaVersion: null,
    recommendedJdk: '17',
    flutterVersion: null,
    reactNativeVersion: null,
    expoVersion: null,
    applicationModules: [],
    selectedModule: null,
    packageId: null,
    versionName: null,
    versionCode: null,
    buildTypes: [],
    productFlavors: [],
    availableVariants: [],
    androidSdk: {
      compileSdk: null,
      minSdk: null,
      targetSdk: null,
      ndkVersion: null,
      buildToolsVersion: null,
    },
    dependencies: [],
    existingSigning: {
      hasReleaseSigningConfig: false,
      referencesKeystoreFile: false,
      referencesEnvVars: false,
      details: [],
    },
    candidateDirectories,
    supportsAbiSplit: false,
    supportsBuildNameNumberOverride: false,
    blockers: [
      {
        code: 'NOT_ANDROID_REPOSITORY',
        messageAr:
          'لم يتم العثور على مشروع أندرويد فعلي (Native Kotlin/Java أو Flutter Android أو React Native Android) في هذا المجلد. لا تقوم المنصة بتغليف المواقع داخل WebView.',
        messageEn:
          'No actual Android application (Native Gradle, Flutter android/, or React Native android/) was detected in this directory. Repo2APK never creates WebView wrappers.',
      },
    ],
    warnings: [],
    nonAndroidReason: {
      code: 'NOT_ANDROID_REPOSITORY',
      messageAr:
        candidateDirectories.length > 1 || (candidateDirectories.length === 1 && candidateDirectories[0] !== projectDir)
          ? 'المجلد المحدد لا يحتوي على مشروع أندرويد؛ جرّب اختيار مجلد فرعي آخر من قائمة المجلدات المكتشفة.'
          : 'هذا المستودع لا يحتوي على شيفرة مصدرية لتطبيق أندرويد.',
      messageEn:
        'This repository or selected directory does not contain Android build configuration files (build.gradle / build.gradle.kts / pubspec.yaml + android/).',
      detectedFiles: topFiles,
    },
  };
}
