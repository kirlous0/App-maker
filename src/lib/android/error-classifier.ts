import type { ErrorDiagnostic } from '@/lib/types';

const METADATA_HEADER_LINE =
  /^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+(?:with:|env:|shell:|accept-android-sdk-licenses:|log-accepted-android-sdk-licenses:|cmdline-tools-version:|packages:)/i;

function extractExcerpt(logText: string, regex: RegExp): string | undefined {
  const lines = logText.split('\n');
  let idx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (METADATA_HEADER_LINE.test(line)) continue;
    if (regex.test(line)) {
      idx = i;
      break;
    }
  }
  if (idx === -1) {
    idx = lines.findIndex((line) => regex.test(line));
  }
  if (idx === -1) return undefined;
  const start = Math.max(0, idx - 2);
  const end = Math.min(lines.length, idx + 6);
  const excerptLines = lines.slice(start, end).filter((l) => !METADATA_HEADER_LINE.test(l));
  return (excerptLines.length > 0 ? excerptLines : lines.slice(start, end)).join('\n').slice(0, 1200);
}

export function classifyBuildFailure(params: {
  logText: string;
  framework?: string;
  explicitErrorCode?: string | null;
}): ErrorDiagnostic {
  const text = params.logText || '';

  if (params.explicitErrorCode === 'BUILD_TIMEOUT' || /exceeded the maximum execution time|timed out/i.test(text)) {
    return {
      code: 'BUILD_TIMEOUT',
      titleAr: 'انتهت مهلة البناء المسموحة',
      titleEn: 'Build Timeout Exceeded',
      explanationAr: 'استغرقت عملية الترجمة وقتاً أطول من الحد الأقصى المسموح به.',
      explanationEn: 'The GitHub Actions compilation job exceeded the configured timeout limit.',
      remediationAr: 'فعّل التخزين المؤقت لـ Gradle أو قلل الموارد الثقيلة وأعد المحاولة.',
      remediationEn: 'Optimize heavy Gradle tasks or retry with warm caches.',
      matchedLogExcerpt: extractExcerpt(text, /timed out|timeout/i),
    };
  }

  if (params.explicitErrorCode === 'MISSING_APK_ARTIFACT' || /No valid APK artifact found/i.test(text)) {
    return {
      code: 'MISSING_APK_ARTIFACT',
      titleAr: 'لم يتم العثور على ملف APK الناتج',
      titleEn: 'Missing APK Artifact',
      explanationAr: 'اكتمل تشغيل سير العمل لكن لم ينتج أي ملف APK صالح في مسار المخرجات.',
      explanationEn: 'The workflow finished without producing a valid APK file in the output directory.',
      remediationAr: 'تأكد من أن الوحدة المحددة تطبق com.android.application وأن أمر البناء ينتج APK وليس AAB.',
      remediationEn: 'Ensure the selected module applies com.android.application and produces an .apk artifact.',
      matchedLogExcerpt: extractExcerpt(text, /No valid APK|apk|assemble/i),
    };
  }

  if (params.explicitErrorCode === 'ACTIONS_DISABLED' || /Actions has been disabled|workflow_dispatch.*403/i.test(text)) {
    return {
      code: 'GITHUB_ACTIONS_DISABLED',
      titleAr: 'GitHub Actions معطل على هذا المستودع',
      titleEn: 'GitHub Actions Disabled',
      explanationAr: 'إعدادات المستودع تمنع تشغيل GitHub Actions أو تفتقر الصلاحيات لتشغيل Workflow.',
      explanationEn: 'GitHub Actions is disabled on this repository or lacks workflow execution permission.',
      remediationAr: 'افتح Settings -> Actions -> General في المستودع وفعّل Allow all actions and reusable workflows.',
      remediationEn: 'Enable Actions in repository Settings -> Actions -> General on GitHub.',
    };
  }

  if (/Unexpected inputs provided/i.test(text)) {
    return {
      code: 'WORKFLOW_UPDATE_REQUIRED',
      titleAr: 'ملف Workflow في المستودع قديم ويحتاج تحديثاً',
      titleEn: 'Repository Workflow File Outdated',
      explanationAr: 'ملف .github/workflows/repo2apk-build.yml داخل المستودع لا يتطابق مع أحدث قالب بناء.',
      explanationEn: 'The .github/workflows/repo2apk-build.yml file in the repository is outdated.',
      remediationAr: 'افتح صفحة التهيئة واعتمد تحديث ملف Workflow ثم أعد تشغيل البناء.',
      remediationEn: 'Open Configure, approve the updated workflow file, and trigger the build again.',
      matchedLogExcerpt: extractExcerpt(text, /Unexpected inputs/i),
    };
  }

  if (/gradlew: Permission denied|gradlew: not found|No such file or directory.*gradlew|Neither \.\/gradlew nor system gradle/i.test(text)) {
    return {
      code: 'MISSING_GRADLE_WRAPPER',
      titleAr: 'ملف Gradle Wrapper مفقود أو غير قابل للتنفيذ',
      titleEn: 'Missing Gradle Wrapper',
      explanationAr: 'فشل العثور على ./gradlew أو تحميل إصدار Gradle المحدد في gradle-wrapper.properties.',
      explanationEn: 'The build runner could not locate ./gradlew or download the Gradle distribution.',
      remediationAr: 'حدّث ملف Workflow من صفحة التهيئة أو أضف ./gradlew ومجلد gradle/wrapper/ إلى المستودع.',
      remediationEn: 'Update the workflow file or commit ./gradlew and gradle/wrapper/* into your repository.',
      matchedLogExcerpt: extractExcerpt(text, /gradlew|gradle/i),
    };
  }

  if (/OutOfMemoryError|Java heap space|GC overhead limit exceeded|Metaspace/i.test(text)) {
    return {
      code: 'GRADLE_OUT_OF_MEMORY',
      titleAr: 'نفاد ذاكرة JVM أثناء ترجمة Gradle',
      titleEn: 'Gradle Out of Memory',
      explanationAr: 'تجاوزت عملية ترجمة Gradle/Kotlin حد الذاكرة المتاح في org.gradle.jvmargs.',
      explanationEn: 'Gradle or Kotlin compiler exhausted JVM heap or metaspace memory.',
      remediationAr: 'اضبط org.gradle.jvmargs=-Xmx3g -XX:MaxMetaspaceSize=768m في gradle.properties.',
      remediationEn: 'Adjust org.gradle.jvmargs (e.g. -Xmx3g) in gradle.properties and retry.',
      matchedLogExcerpt: extractExcerpt(text, /OutOfMemoryError|heap space|Metaspace/i),
    };
  }

  if (/Unsupported class file major version|requires Java \d+|Android Gradle plugin requires Java \d+|invalid source release|JDK \d+ is required/i.test(text)) {
    return {
      code: 'INCOMPATIBLE_JAVA_VERSION',
      titleAr: 'إصدار Java / JDK غير متوافق',
      titleEn: 'Incompatible Java / JDK Version',
      explanationAr: 'إصدار Gradle أو Android Gradle Plugin يتطلب إصدار Java مختلفاً عن المستخدم.',
      explanationEn: 'Gradle or Android Gradle Plugin requires a different JDK version than configured.',
      remediationAr: 'تحقق من jvmToolchain / sourceCompatibility في build.gradle ثم أعد المحاولة.',
      remediationEn: 'Align AGP, Gradle, and Java version requirements in build.gradle(.kts).',
      matchedLogExcerpt: extractExcerpt(
        text,
        /Unsupported class file|requires Java|invalid source release|JDK/i
      ),
    };
  }

  if (/Failed to install the following Android SDK|compileSdkVersion|build-tools|SDK location not found|licenses? not accepted|NDK .* not found|sdkmanager.*failed|sdkmanager.*Operation not permitted|android\/sdk.*Permission denied/i.test(text)) {
    return {
      code: 'ANDROID_SDK_CONFIG_ERROR',
      titleAr: 'خطأ في إعدادات Android SDK أو التراخيص',
      titleEn: 'Android SDK Configuration Error',
      explanationAr: 'تعذر تهيئة منصة Android SDK أو Build Tools أو NDK المطلوبة في المشروع.',
      explanationEn: 'Required Android SDK platform, Build Tools, or NDK failed to resolve or accept licenses.',
      remediationAr: 'حدث ملف Workflow في صفحة التهيئة (تحديث تهيئة Android SDK التلقائية) وتأكد من compileSdk / ndkVersion.',
      remediationEn: 'Update the workflow file from Configure and verify compileSdk / buildToolsVersion / ndkVersion.',
      matchedLogExcerpt: extractExcerpt(
        text,
        /sdkmanager|Operation not permitted|Permission denied|Failed to install.*Android SDK|licenses? not accepted|compileSdk|SDK location|NDK .* not found/i
      ),
    };
  }

  if (/File google-services\.json is missing/i.test(text)) {
    return {
      code: 'GOOGLE_SERVICES_MISSING',
      titleAr: 'ملف google-services.json غير موجود',
      titleEn: 'Missing google-services.json',
      explanationAr: 'يطلب ملحق Google Services وجود app/google-services.json غير الموجود في المستودع.',
      explanationEn: 'The Google Services Gradle plugin failed because app/google-services.json is missing.',
      remediationAr: 'أضف google-services.json أو فعّل googleServices.missing.passthrough=true / MissingGoogleServicesStrategy.WARN.',
      remediationEn: 'Commit google-services.json or configure MissingGoogleServicesStrategy.WARN in Gradle.',
      matchedLogExcerpt: extractExcerpt(text, /google-services\.json/i),
    };
  }

  if (/keystore|signingConfig|storePassword|keyPassword|keyAlias|Failed to read key .* from store|jarsigner|apksigner/i.test(text)) {
    return {
      code: 'SIGNING_CREDENTIALS_ERROR',
      titleAr: 'خطأ في بيانات التوقيع أو Keystore',
      titleEn: 'Signing Credentials Error',
      explanationAr: 'ملف Keystore أو كلمات المرور أو Key Alias غير صحيحة أو مفقودة لبناء التطبيق.',
      explanationEn: 'Keystore file, alias, or passwords failed verification during signing.',
      remediationAr: 'راجع كلمة مرور المخزن و Key Alias أو استخدم وضع Debug أو ارفع شهادة توقيع صحيحة.',
      remediationEn: 'Check keystore file, key alias, and passwords in Signing Settings or use Debug mode.',
      matchedLogExcerpt: extractExcerpt(text, /Keystore file|Failed to read key|storePassword|apksigner|signingConfig/i),
    };
  }

  if (/Manifest merger failed/i.test(text)) {
    return {
      code: 'MANIFEST_MERGER_ERROR',
      titleAr: 'تعارض في دمج AndroidManifest.xml',
      titleEn: 'AndroidManifest Merger Failed',
      explanationAr: 'حدث تعارض بين خصائص AndroidManifest.xml في التطبيق والمكتبات المدمجة (مثل minSdk أو exported).',
      explanationEn: 'AndroidManifest merger failed due to conflicting attributes or SDK requirements.',
      remediationAr: 'راجع تفاصيل التعارض في السجل (مثل tools:replace أو android:exported أو minSdk).',
      remediationEn: 'Inspect the manifest merger conflict in logs and adjust AndroidManifest.xml or minSdk.',
      matchedLogExcerpt: extractExcerpt(text, /Manifest merger failed/i),
    };
  }

  if (/Could not resolve all files|Could not find .*\.|Could not GET https:\/\/|Failed to resolve:|pub get failed|version solving failed|ERESOLVE|npm ERR!/i.test(text)) {
    return {
      code: 'DEPENDENCY_RESOLUTION_ERROR',
      titleAr: 'فشل جلب الاعتماديات والمكتبات',
      titleEn: 'Dependency Resolution Failure',
      explanationAr: 'تعذر تحميل إحدى الحزم أو المكتبات من Maven أو pub.dev أو npm.',
      explanationEn: 'Gradle, Pub, or npm could not resolve or download a required dependency.',
      remediationAr: 'تحقق من توفر المكتبات وrepositories في settings.gradle أو pubspec.yaml أو package.json.',
      remediationEn: 'Verify package versions and repository declarations (mavenCentral, google, pub.dev, npm).',
      matchedLogExcerpt: extractExcerpt(
        text,
        /Could not resolve|Could not find|pub get failed|version solving|npm ERR!|ERESOLVE/i
      ),
    };
  }

  if (params.framework === 'flutter' && /Gradle task assemble.*failed|Execution failed for task|Error: .*\.dart:|Target kernel_snapshot_program failed/i.test(text)) {
    return {
      code: 'FLUTTER_COMPILATION_ERROR',
      titleAr: 'خطأ أثناء ترجمة مشروع Flutter',
      titleEn: 'Flutter Compilation Error',
      explanationAr: 'فشلت ترجمة كود Dart أو مهمة Gradle أثناء بناء Flutter APK.',
      explanationEn: 'Dart compilation or underlying Gradle build failed during `flutter build apk`.',
      remediationAr: 'راجع تفاصيل الخطأ في السجل أدناه وأصلح أخطاء Dart أو تبعيات Flutter.',
      remediationEn: 'Inspect the matched Flutter/Dart compiler output below to fix compilation errors.',
      matchedLogExcerpt: extractExcerpt(
        text,
        /Target kernel_snapshot|Error:.*\.dart|Gradle task assemble|FAILURE:/i
      ),
    };
  }

  if (/FAILURE: Build failed with an exception|Compilation error|Execution failed for task|e: file:\/\/.*\.kt/i.test(text)) {
    return {
      code: 'GRADLE_COMPILATION_ERROR',
      titleAr: 'فشل ترجمة Gradle / Kotlin / Java',
      titleEn: 'Gradle Compilation Error',
      explanationAr: 'توقفت مهمة Gradle أثناء ترجمة الكود المصدري أو الموارد.',
      explanationEn: 'Gradle failed while compiling Kotlin/Java sources or Android resources.',
      remediationAr: 'راجع السطر المحدد في سجل البناء لتصحيح الخطأ البرمجي أو تعارض الموارد.',
      remediationEn: 'Review the Gradle failure trace below to resolve the source or resource error.',
      matchedLogExcerpt: extractExcerpt(
        text,
        /FAILURE: Build failed|Execution failed for task|e: file:\/\//i
      ),
    };
  }

  return {
    code: 'BUILD_FAILED',
    titleAr: 'فشلت عملية البناء',
    titleEn: 'Build Failed',
    explanationAr: 'توقف سير عمل البناء على GitHub Actions قبل إنتاج APK صالح.',
    explanationEn: 'The GitHub Actions workflow exited with a failure before producing a valid APK.',
    remediationAr: 'افحص سجل البناء الكامل لتحديد الخطوة التي تعثرت وأعد المحاولة.',
    remediationEn: 'Expand the build logs below to inspect the failed step and retry.',
    matchedLogExcerpt: extractExcerpt(text, /##\[error\]|Error:|FAILURE:|Exception:|failed/i),
  };
}
