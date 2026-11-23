import type { ErrorDiagnostic } from '@/lib/types';

function extractExcerpt(logText: string, regex: RegExp): string | undefined {
  const lines = logText.split('\n');
  const idx = lines.findIndex((line) => regex.test(line));
  if (idx === -1) return undefined;
  const start = Math.max(0, idx - 2);
  const end = Math.min(lines.length, idx + 6);
  return lines.slice(start, end).join('\n').slice(0, 1200);
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
      matchedLogExcerpt: extractExcerpt(text, /apk|assemble/i),
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

  if (/gradlew: Permission denied|gradlew: not found|No such file or directory.*gradlew/i.test(text)) {
    return {
      code: 'MISSING_GRADLE_WRAPPER',
      titleAr: 'ملف Gradle Wrapper مفقود أو غير قابل للتنفيذ',
      titleEn: 'Missing Gradle Wrapper',
      explanationAr: 'فشل العثور على ./gradlew أو gradle-wrapper.jar داخل المستودع.',
      explanationEn: 'The build runner could not locate ./gradlew or gradle/wrapper/gradle-wrapper.jar.',
      remediationAr: 'أضف ./gradlew ومجلد gradle/wrapper/ إلى المستودع عبر `gradle wrapper`.',
      remediationEn: 'Commit ./gradlew and gradle/wrapper/* into your repository.',
      matchedLogExcerpt: extractExcerpt(text, /gradlew/i),
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

  if (/Failed to install the following Android SDK|compileSdkVersion|build-tools|SDK location not found|licenses? not accepted|NDK .* not found/i.test(text)) {
    return {
      code: 'ANDROID_SDK_CONFIG_ERROR',
      titleAr: 'خطأ في إعدادات Android SDK أو التراخيص',
      titleEn: 'Android SDK Configuration Error',
      explanationAr: 'تعذر تهيئة منصة Android SDK أو Build Tools أو NDK المطلوبة في المشروع.',
      explanationEn: 'Required Android SDK platform, Build Tools, or NDK failed to resolve or accept licenses.',
      remediationAr: 'تأكد من قيم compileSdk / ndkVersion في build.gradle وأنها متوفرة في مستودع Android SDK.',
      remediationEn: 'Verify compileSdk, buildToolsVersion, and ndkVersion in your Gradle build files.',
      matchedLogExcerpt: extractExcerpt(text, /Android SDK|compileSdk|SDK location|license|NDK/i),
    };
  }

  if (/keystore|signingConfig|storePassword|keyPassword|keyAlias|Failed to read key .* from store|jarsigner|apksigner/i.test(text)) {
    return {
      code: 'SIGNING_CREDENTIALS_ERROR',
      titleAr: 'خطأ في بيانات التوقيع أو Keystore',
      titleEn: 'Signing Credentials Error',
      explanationAr: 'بيانات Keystore أو كلمات المرور أو Key Alias غير صحيحة أو مفقودة لبناء Release.',
      explanationEn: 'Keystore file, alias, or passwords failed verification during Release signing.',
      remediationAr: 'راجع كلمة مرور المخزن و Key Alias في إعدادات التوقيع أو ارفع ملف Keystore صحيح.',
      remediationEn: 'Check your keystore file, key alias, and passwords in Signing Settings.',
      matchedLogExcerpt: extractExcerpt(text, /keystore|signing|storePassword|apksigner/i),
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
    matchedLogExcerpt: extractExcerpt(text, /error|failed|exception/i),
  };
}
