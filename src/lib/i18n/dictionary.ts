import type { SupportedLanguage } from '@/lib/types';

export interface Dictionary {
  brand: string;
  tagline: string;
  nav: {
    home: string;
    dashboard: string;
    history: string;
    settings: string;
    connectGithub: string;
    disconnectGithub: string;
    connectedAs: string;
    notConnected: string;
  };
  landing: {
    badge: string;
    heroTitle: string;
    heroSubtitle: string;
    heroNotice: string;
    ctaConnect: string;
    ctaDashboard: string;
    ctaDocs: string;
    howItWorksTitle: string;
    howItWorksSteps: Array<{ step: string; title: string; desc: string }>;
    frameworksTitle: string;
    frameworksSubtitle: string;
    frameworks: Array<{ name: string; stack: string; details: string }>;
    securityTitle: string;
    securitySubtitle: string;
    securityItems: Array<{ title: string; desc: string }>;
  };
  dashboard: {
    title: string;
    subtitle: string;
    syncRepos: string;
    searchPlaceholder: string;
    allVisibility: string;
    publicOnly: string;
    privateOnly: string;
    selectRepo: string;
    configureBuild: string;
    noReposTitle: string;
    noReposDesc: string;
    manageAccess: string;
    stats: {
      totalBuilds: string;
      successRate: string;
      avgDuration: string;
      activeBuilds: string;
    };
    recentBuilds: string;
    viewAllHistory: string;
    noBuildsYet: string;
    setupBannerTitle: string;
    setupBannerDesc: string;
    goToSettings: string;
  };
  configure: {
    title: string;
    subtitle: string;
    backToDashboard: string;
    branchLabel: string;
    latestCommitLabel: string;
    projectDirLabel: string;
    analyzeButton: string;
    analyzing: string;
    analysisReportTitle: string;
    notAndroidTitle: string;
    notAndroidWarning: string;
    detectedFilesLabel: string;
    frameworkLabel: string;
    languageLabel: string;
    buildSystemLabel: string;
    moduleLabel: string;
    packageIdLabel: string;
    sdkLabel: string;
    gradleWrapperLabel: string;
    javaJdkLabel: string;
    flutterVersionLabel: string;
    signingDetectedLabel: string;
    dependenciesLabel: string;
    variantsLabel: string;
    buildConfigTitle: string;
    buildModeLabel: string;
    debugModeTitle: string;
    debugModeDesc: string;
    releaseModeTitle: string;
    releaseModeDesc: string;
    variantSelectLabel: string;
    abiModeLabel: string;
    universalApk: string;
    splitAbiApk: string;
    buildNameLabel: string;
    buildNumberLabel: string;
    signingMethodLabel: string;
    signingRepoExisting: string;
    signingSavedConfig: string;
    signingUploadNew: string;
    signingUnsigned: string;
    unsignedWarning: string;
    keystoreFileLabel: string;
    keyAliasLabel: string;
    storePasswordLabel: string;
    keyPasswordLabel: string;
    saveKeystoreLabel: string;
    keystoreLabelInput: string;
    computedCommandLabel: string;
    workflowRequiredTitle: string;
    workflowRequiredDesc: string;
    workflowUpdateTitle: string;
    workflowUpdateDesc: string;
    workflowPermissionsNote: string;
    workflowApproveCheckbox: string;
    workflowInstallButton: string;
    workflowUpdateButton: string;
    workflowInstalling: string;
    workflowInstalledBadge: string;
    buildButton: string;
    startingBuild: string;
  };
  monitor: {
    title: string;
    subtitle: string;
    stagesTitle: string;
    currentStageLabel: string;
    elapsedLabel: string;
    githubRunLink: string;
    logsTitle: string;
    expandLogs: string;
    collapseLogs: string;
    copyLogs: string;
    copied: string;
    refreshNow: string;
    retrySameCommit: string;
    retryLatestCommit: string;
    workflowUpdateRequiredError: string;
    openConfigureToUpdate: string;
    viewDownloadPage: string;
    errorReportTitle: string;
    remediationLabel: string;
    queuedHint: string;
    statusLabels: Record<string, string>;
    stages: Record<string, string>;
  };
  download: {
    title: string;
    subtitle: string;
    downloadButton: string;
    unsignedAlertTitle: string;
    unsignedAlertDesc: string;
    signedVerifiedBadge: string;
    debugSignedBadge: string;
    metadataLabels: {
      appName: string;
      repository: string;
      branch: string;
      commitSha: string;
      framework: string;
      buildType: string;
      fileName: string;
      fileSize: string;
      packageId: string;
      version: string;
      buildDate: string;
      duration: string;
      sha256: string;
      expiresAt: string;
    };
    copySha: string;
    backToMonitor: string;
    rebuildAction: string;
  };
  history: {
    title: string;
    subtitle: string;
    filterStatus: string;
    filterAll: string;
    searchRepo: string;
    columns: {
      repository: string;
      branchCommit: string;
      frameworkType: string;
      status: string;
      dateDuration: string;
      actions: string;
    };
    downloadApk: string;
    viewLogs: string;
    rebuildSame: string;
    rebuildLatest: string;
    deleteBuild: string;
    confirmDelete: string;
    emptyTitle: string;
    emptyDesc: string;
  };
  settings: {
    title: string;
    subtitle: string;
    githubSectionTitle: string;
    githubConnectedDesc: string;
    githubNotConnectedDesc: string;
    githubSetupTitle: string;
    githubSetupDesc: string;
    missingEnvLabel: string;
    callbackUrlLabel: string;
    webhookUrlLabel: string;
    permissionsTableTitle: string;
    manifestCardTitle: string;
    manifestCardDesc: string;
    manifestAppNameLabel: string;
    manifestSubmitButton: string;
    manifestSubmitting: string;
    preferencesTitle: string;
    languageLabel: string;
    defaultBuildTypeLabel: string;
    retentionDaysLabel: string;
    savePreferences: string;
    savedNotice: string;
    signingSectionTitle: string;
    signingSectionDesc: string;
    addKeystoreTitle: string;
    noSigningConfigs: string;
    deleteAction: string;
  };
}

const ar: Dictionary = {
  brand: 'Repo2APK',
  tagline: 'منصة بناء حزم أندرويد APK مباشرة من مستودعات GitHub',
  nav: {
    home: 'الرئيسية',
    dashboard: 'لوحة التحكم',
    history: 'سجل البناء',
    settings: 'الإعدادات',
    connectGithub: 'ربط حساب GitHub',
    disconnectGithub: 'فصل GitHub',
    connectedAs: 'متصل بحساب',
    notConnected: 'غير متصل بـ GitHub',
  },
  landing: {
    badge: 'ترجمة أصلية لتطبيقات أندرويد عبر GitHub Actions',
    heroTitle: 'حوّل مستودع أندرويد الحقيقي إلى ملف APK جاهز للتثبيت',
    heroSubtitle:
      'منصة مطوّرين مؤتمتة تتصل بحساب GitHub الخاص بك عبر GitHub App، تحلل بنية مشروعك الأصلية (Kotlin / Java / Flutter / React Native)، وتشغّل ترجمة حقيقية على بيئات GitHub المعزولة.',
    heroNotice:
      'Repo2APK ليس محوّل مواقع إلى WebView — يجب أن يحتوي المستودع على شيفرة تطبيق أندرويد فعلية.',
    ctaConnect: 'ربط حساب GitHub',
    ctaDashboard: 'الانتقال إلى لوحة التحكم',
    ctaDocs: 'متطلبات الإعداد والأمان',
    howItWorksTitle: 'كيف تعمل المنصة',
    howItWorksSteps: [
      {
        step: '01',
        title: 'تفويض GitHub App بأقل صلاحيات',
        desc: 'تختار بنفسك المستودعات المصرح بها (عامة أو خاصة) دون مشاركة أي رمز وصول شخصي (PAT).',
      },
      {
        step: '02',
        title: 'تحليل المشروع واكتشاف الإعدادات',
        desc: 'يفحص المحرك شجرة الملفات لاكتشاف Gradle و Flutter و React Native والوحدات و SDK وإعدادات التوقيع.',
      },
      {
        step: '03',
        title: 'سير عمل شفاف على GitHub Actions',
        desc: 'يُعرض ملف workflow للمراجعة والموافقة الصريحة قبل إضافته، ثم تُبنى الحزمة على خوادم معزولة.',
      },
      {
        step: '04',
        title: 'تحقق وبصمة SHA-256 وتنزيل آمن',
        desc: 'يتحقق الخادم من بنية ملف APK وبصمته ويحفظه في مخزن خاص مع روابط تنزيل مؤقتة.',
      },
    ],
    frameworksTitle: 'الأطر وأنظمة البناء المدعومة',
    frameworksSubtitle:
      'يكتشف المحلل إعدادات البناء الأصلية تلقائياً دون أوامر عشوائية.',
    frameworks: [
      {
        name: 'Native Android',
        stack: 'Kotlin · Java · Gradle Kotlin/Groovy DSL',
        details:
          'دعم المشاريع أحادية ومتعددة الوحدات، Version Catalogs، والنكهات (Flavors) وملفات AndroidManifest.',
      },
      {
        name: 'Flutter Android',
        stack: 'Dart · pubspec.yaml · android/ Gradle',
        details:
          'قراءة إصدار Flutter، تقسيم ABI، وتمرير build-name و build-number مباشرة.',
      },
      {
        name: 'React Native & Expo Bare',
        stack: 'RN CLI · Expo prebuild · android/ Gradle',
        details:
          'اكتشاف تبعيات npm/yarn/pnpm وترجمة مشروع android/ الأصلي عبر Gradle Wrapper.',
      },
    ],
    securityTitle: 'البنية الأمنية وعزل البيانات',
    securitySubtitle: 'مصممة لحماية الشيفرة المصدرية ومفاتيح التوقيع.',
    securityItems: [
      {
        title: 'تخزين خادمي مشفر AES-256-GCM',
        desc: 'لا تُخزّن أي رموز مصادقة في localStorage ولا تُرسل إلى المتصفح إطلاقاً.',
      },
      {
        title: 'بدون تشغيل شيفرة غير موثوقة على الخادم',
        desc: 'تتم كل عمليات الترجمة داخل GitHub Actions المعزولة بعيداً عن خادم الويب.',
      },
      {
        title: 'توقيع Release خاص بكل مطور',
        desc: 'لا توجد مفاتيح توقيع مشتركة؛ تُمرّر شهاداتك كـ GitHub Actions Secrets مشفرة وتُحذف بعد البناء.',
      },
    ],
  },
  dashboard: {
    title: 'لوحة التحكم والمستودعات',
    subtitle: 'اختر مستودع تطبيق أندرويد المصرح به لبدء التحليل وبناء ملف APK.',
    syncRepos: 'تحديث المستودعات',
    searchPlaceholder: 'ابحث باسم المستودع أو اللغة...',
    allVisibility: 'الكل',
    publicOnly: 'عام',
    privateOnly: 'خاص',
    selectRepo: 'اختيار وتهيئة',
    configureBuild: 'إعداد البناء',
    noReposTitle: 'لا توجد مستودعات مصرح بها بعد',
    noReposDesc: 'قم بتثبيت GitHub App على مستودع أندرويد واحد على الأقل لتظهر هنا.',
    manageAccess: 'إدارة صلاحيات المستودعات في GitHub',
    stats: {
      totalBuilds: 'إجمالي عمليات البناء',
      successRate: 'نسبة النجاح',
      avgDuration: 'متوسط المدة',
      activeBuilds: 'عمليات نشطة الآن',
    },
    recentBuilds: 'أحدث عمليات البناء',
    viewAllHistory: 'عرض السجل الكامل',
    noBuildsYet: 'لم تُنفذ أي عمليات بناء حتى الآن.',
    setupBannerTitle: 'تطبيق GitHub App غير مُعد بالكامل في متغيرات البيئة',
    setupBannerDesc:
      'لربط حسابك الحقيقي وتشغيل GitHub Actions، أضف بيانات GitHub App في الإعدادات أو ملف البيئة.',
    goToSettings: 'عرض دليل الإعداد',
  },
  configure: {
    title: 'تحليل المشروع وإعداد البناء',
    subtitle: 'افحص بنية المستودع وحدد الفرع والوحدة وإعدادات التوقيع.',
    backToDashboard: 'العودة للمستودعات',
    branchLabel: 'الفرع (Branch)',
    latestCommitLabel: 'أحدث Commit SHA',
    projectDirLabel: 'مجلد المشروع (Monorepo)',
    analyzeButton: 'إعادة تحليل المشروع',
    analyzing: 'جارٍ فحص شجرة الملفات وملفات Gradle...',
    analysisReportTitle: 'تقرير تحليل تطبيق أندرويد',
    notAndroidTitle: 'هذا المستودع لا يحتوي على تطبيق أندرويد قابل للبناء',
    notAndroidWarning:
      'تم إيقاف البناء تلقائياً لأن المستودع لا يطابق أي بنية أندرويد أصلية مدعومة.',
    detectedFilesLabel: 'الملفات المكتشفة في الجذر:',
    frameworkLabel: 'الإطار المكتشف',
    languageLabel: 'لغة البرمجة',
    buildSystemLabel: 'نظام البناء',
    moduleLabel: 'وحدة التطبيق (Module)',
    packageIdLabel: 'معرّف الحزمة (Package ID)',
    sdkLabel: 'متطلبات Android SDK',
    gradleWrapperLabel: 'إصدار Gradle Wrapper',
    javaJdkLabel: 'إصدار Java / JDK المطلوب',
    flutterVersionLabel: 'إصدار Flutter',
    signingDetectedLabel: 'إعداد التوقيع في المشروع',
    dependenciesLabel: 'أبرز الاعتماديات',
    variantsLabel: 'النكهات ومتغيرات البناء المتاحة',
    buildConfigTitle: 'إعدادات بناء APK',
    buildModeLabel: 'نوع البناء',
    debugModeTitle: 'Debug APK',
    debugModeDesc: 'للاختبار والتثبيت المباشر باستخدام توقيع التطوير القياسي.',
    releaseModeTitle: 'Release APK',
    releaseModeDesc: 'نسخة محسّنة للنشر تتطلب شهادة توقيع صالحة أو ستُوسم كغير موقّعة.',
    variantSelectLabel: 'متغير البناء (Variant / Flavor)',
    abiModeLabel: 'معمارية المعالج (ABI)',
    universalApk: 'Universal APK (ملف شامل)',
    splitAbiApk: 'ABI-Split APKs (حسب المعمارية)',
    buildNameLabel: 'اسم الإصدار (Build Name)',
    buildNumberLabel: 'رقم الإصدار (Build Number)',
    signingMethodLabel: 'طريقة توقيع Release',
    signingRepoExisting: 'استخدام إعداد التوقيع الموجود في المستودع',
    signingSavedConfig: 'استخدام شهادة Keystore محفوظة',
    signingUploadNew: 'رفع ملف Keystore لهذه العملية',
    signingUnsigned: 'إنشاء Release غير موقّع (Unsigned)',
    unsignedWarning:
      'تنبيه: ملف Release غير الموقّع لا يصلح للنشر على Google Play ولا يمكن تثبيته على معظم الأجهزة دون توقيع.',
    keystoreFileLabel: 'ملف Keystore (.jks / .keystore)',
    keyAliasLabel: 'اسم المفتاح (Key Alias)',
    storePasswordLabel: 'كلمة مرور المخزن (Store Password)',
    keyPasswordLabel: 'كلمة مرور المفتاح (Key Password)',
    saveKeystoreLabel: 'حفظ الشهادة مشفرة (AES-256-GCM) لاستخدامها لاحقاً',
    keystoreLabelInput: 'اسم تعريفي للشهادة',
    computedCommandLabel: 'أمر البناء الفعلي المشتق من التحليل',
    workflowRequiredTitle: 'موافقة تثبيت سير عمل البناء (مرة واحدة)',
    workflowRequiredDesc:
      'لتشغيل البناء على GitHub Actions، يحتاج Repo2APK إلى إضافة ملف واحد فقط داخل المستودع دون المساس بأي workflows أخرى.',
    workflowUpdateTitle: 'تحديث مطلوب لملف سير عمل البناء',
    workflowUpdateDesc:
      'تم تحديث قالب البناء لدعم توافق Android NDK / CMake (بما فيها -lpthread) وتجهيز NDK/CMake/SDK تلقائياً، وإصلاح Gradle Wrapper وسجلات المراحل. راجع التحديث واعتمد تثبيته على هذا الفرع قبل البناء.',
    workflowPermissionsNote: 'الصلاحيات المستخدمة: Contents (Write) و Workflows (Write) و Actions (Write).',
    workflowApproveCheckbox: 'راجعت محتوى ملف workflow وأوافق صراحة على إضافته/تحديثه في هذا المستودع.',
    workflowInstallButton: 'تثبيت ملف Workflow في المستودع',
    workflowUpdateButton: 'اعتماد وتحديث ملف Workflow',
    workflowInstalling: 'جارٍ حفظ workflow...',
    workflowInstalledBadge: 'ملف repo2apk-build.yml مثبّت ومحدّث وجاهز',
    buildButton: 'بدء بناء APK الآن',
    startingBuild: 'جارٍ إرسال طلب البناء إلى GitHub Actions...',
  },
  monitor: {
    title: 'مراقبة البناء المباشر',
    subtitle: 'حالة فعلية متزامنة مباشرة مع GitHub Actions Runner.',
    stagesTitle: 'مراحل البناء التسع',
    currentStageLabel: 'المرحلة الحالية',
    elapsedLabel: 'المدة المنقضية',
    githubRunLink: 'فتح التشغيل في GitHub Actions',
    logsTitle: 'سجلات التنفيذ الفعلية',
    expandLogs: 'توسيع الطرفية',
    collapseLogs: 'تصغير الطرفية',
    copyLogs: 'نسخ السجل',
    copied: 'تم النسخ',
    refreshNow: 'تحديث الحالة الآن',
    retrySameCommit: 'إعادة البناء لنفس الـ Commit',
    retryLatestCommit: 'البناء لأحدث Commit',
    workflowUpdateRequiredError: 'ملف workflow في المستودع قديم. افتح صفحة التهيئة واعتمد التحديث أولاً.',
    openConfigureToUpdate: 'فتح صفحة التهيئة لتحديث Workflow',
    viewDownloadPage: 'الانتقال إلى صفحة تنزيل APK',
    errorReportTitle: 'تشخيص الفشل التلقائي',
    remediationLabel: 'الإجراء المقترح:',
    queuedHint: 'في انتظار استلام عامل GitHub Actions للمهمة وبدء الخطوات...',
    statusLabels: {
      queued: 'في قائمة الانتظار',
      running: 'قيد الترجمة والبناء',
      validating: 'جارٍ فحص APK',
      storing: 'جارٍ التخزين الآمن',
      succeeded: 'اكتمل بنجاح',
      failed: 'فشل البناء',
      cancelled: 'تم الإلغاء',
      timed_out: 'انتهت المهلة',
    },
    stages: {
      repo_verification: '1. التحقق من المستودع',
      source_checkout: '2. جلب الكود المصدري',
      env_preparation: '3. تهيئة بيئة البناء',
      dependency_install: '4. تثبيت الاعتماديات',
      project_configuration: '5. تهيئة مشروع أندرويد',
      apk_compilation: '6. ترجمة وبناء ملف APK',
      apk_validation: '7. التحقق من صحة ملف APK',
      artifact_storage: '8. تخزين الملف النهائي',
      build_completed: '9. اكتمل البناء',
    },
  },
  download: {
    title: 'ملف APK جاهز للتنزيل',
    subtitle: 'تم التحقق من سلامة الحزمة وتخزينها في مخزن خاص مشفر.',
    downloadButton: 'تنزيل ملف APK',
    unsignedAlertTitle: 'تحذير: ملف Release غير موقّع',
    unsignedAlertDesc:
      'تم بناء هذا الملف بدون شهادة توقيع Release. لا يُعد جاهزاً للنشر الإنتاجي أو متجر Google Play.',
    signedVerifiedBadge: 'موقّع بشهادة Release صالحة',
    debugSignedBadge: 'توقيع Debug قياسي للاختبار',
    metadataLabels: {
      appName: 'اسم التطبيق',
      repository: 'المستودع',
      branch: 'الفرع',
      commitSha: 'Commit SHA',
      framework: 'الإطار',
      buildType: 'نوع البناء',
      fileName: 'اسم الملف',
      fileSize: 'حجم الحزمة',
      packageId: 'معرّف الحزمة (Package ID)',
      version: 'الإصدار (Name / Code)',
      buildDate: 'تاريخ البناء',
      duration: 'مدة البناء',
      sha256: 'بصمة SHA-256',
      expiresAt: 'صالح في المخزن حتى',
    },
    copySha: 'نسخ SHA-256',
    backToMonitor: 'عرض السجلات والمراحل',
    rebuildAction: 'بناء إصدار جديد',
  },
  history: {
    title: 'سجل عمليات البناء',
    subtitle: 'استعرض عملياتك السابقة، حمّل ملفات APK، أو أعد البناء لأي Commit.',
    filterStatus: 'تصفية حسب الحالة',
    filterAll: 'جميع الحالات',
    searchRepo: 'تصفية باسم المستودع...',
    columns: {
      repository: 'المستودع',
      branchCommit: 'الفرع / Commit',
      frameworkType: 'الإطار / النوع',
      status: 'الحالة',
      dateDuration: 'التاريخ والمدة',
      actions: 'الإجراءات',
    },
    downloadApk: 'تنزيل APK',
    viewLogs: 'السجلات',
    rebuildSame: 'إعادة نفس الـ Commit',
    rebuildLatest: 'بناء أحدث Commit',
    deleteBuild: 'حذف السجل والملف',
    confirmDelete: 'هل تريد حذف هذا البناء وملف APK الخاص به نهائياً من التخزين؟',
    emptyTitle: 'لا توجد سجلات بناء تطابق بحثك',
    emptyDesc: 'ابدأ أول عملية بناء من لوحة التحكم لتظهر جميع السجلات والملفات هنا.',
  },
  settings: {
    title: 'الإعدادات والأمان والتوقيع',
    subtitle: 'إدارة اتصال GitHub وتفضيلات اللغة والاحتفاظ بالملفات وشهادات Keystore.',
    githubSectionTitle: 'اتصال GitHub App',
    githubConnectedDesc: 'الحساب متصل عبر GitHub App وتُحفظ الرموز مشفرة على الخادم فقط.',
    githubNotConnectedDesc: 'لم يتم ربط حساب GitHub بعد.',
    githubSetupTitle: 'دليل تهيئة GitHub App (للمسؤولين)',
    githubSetupDesc:
      'أنشئ GitHub App وأضف متغيرات البيئة التالية ليعمل التفويض الحقيقي عبر OAuth و Actions:',
    missingEnvLabel: 'متغيرات غير مفعّلة حالياً:',
    callbackUrlLabel: 'Callback URL',
    webhookUrlLabel: 'Webhook URL',
    permissionsTableTitle: 'الحد الأدنى المطلوب من الصلاحيات:',
    manifestCardTitle: 'إعداد تلقائي بضغطة زر (GitHub App Manifest -> ملف .env لـ Vercel)',
    manifestCardDesc:
      'بدلاً من كتابة الروابط والصلاحيات يدوياً، اضغط الزر بالأسفل لإنشاء التطبيق على GitHub تلقائياً وتنزيل ملف .env جاهز لزر Import .env في Vercel.',
    manifestAppNameLabel: 'اسم التطبيق على GitHub (فريد)',
    manifestSubmitButton: 'إنشاء GitHub App تلقائياً وتجهيز ملف .env',
    manifestSubmitting: 'جارٍ التوجيه إلى GitHub...',
    preferencesTitle: 'تفضيلات البناء واللغة',
    languageLabel: 'لغة الواجهة',
    defaultBuildTypeLabel: 'نوع البناء الافتراضي',
    retentionDaysLabel: 'مدة الاحتفاظ بملفات APK (بالأيام)',
    savePreferences: 'حفظ التفضيلات',
    savedNotice: 'تم حفظ التفضيلات بنجاح.',
    signingSectionTitle: 'شهادات التوقيع المشفرة (Keystores)',
    signingSectionDesc:
      'تُشفر ملفات Keystore وكلمات المرور باستخدام AES-256-GCM لكل مستخدم بشكل منفصل ولا تُشارك إطلاقاً.',
    addKeystoreTitle: 'إضافة شهادة Keystore جديدة',
    noSigningConfigs: 'لم تضف أي شهادات توقيع بعد.',
    deleteAction: 'حذف',
  },
};

const en: Dictionary = {
  brand: 'Repo2APK',
  tagline: 'Automated Android APK Build Platform from GitHub Repositories',
  nav: {
    home: 'Overview',
    dashboard: 'Dashboard',
    history: 'Build History',
    settings: 'Settings',
    connectGithub: 'Connect GitHub',
    disconnectGithub: 'Disconnect GitHub',
    connectedAs: 'Connected as',
    notConnected: 'GitHub Not Connected',
  },
  landing: {
    badge: 'Native Android Compilation on Isolated GitHub Actions',
    heroTitle: 'Compile Real Android Repositories Into Verified APKs',
    heroSubtitle:
      'Connect your GitHub account via GitHub App, inspect Kotlin, Java, Flutter, or React Native projects automatically, and compile authentic APKs using your repository’s native build configuration.',
    heroNotice:
      'Repo2APK is NOT a website-to-WebView wrapper. Selected repositories must contain actual Android source code.',
    ctaConnect: 'Connect GitHub Account',
    ctaDashboard: 'Open Dashboard',
    ctaDocs: 'Security & Setup Specs',
    howItWorksTitle: 'How Repo2APK Works',
    howItWorksSteps: [
      {
        step: '01',
        title: 'Least-Privilege GitHub App Auth',
        desc: 'Authorize specific public or private repositories via GitHub App OAuth—zero personal access tokens requested.',
      },
      {
        step: '02',
        title: 'Deep Android Project Inspection',
        desc: 'Automatically inspects Gradle Kotlin/Groovy DSL, Flutter pubspec, React Native android/, SDKs, modules, and signing configs.',
      },
      {
        step: '03',
        title: 'Explicit Workflow Approval & Dispatch',
        desc: 'Preview the exact workflow YAML and approve installation before Repo2APK touches your repository, then build in isolated runners.',
      },
      {
        step: '04',
        title: 'APK Validation & Private Signed Downloads',
        desc: 'Server verifies ZIP/AndroidManifest structure and SHA-256 checksum before storing the APK in private storage.',
      },
    ],
    frameworksTitle: 'Supported Android Build Systems',
    frameworksSubtitle:
      'Every build command is derived directly from inspected project files.',
    frameworks: [
      {
        name: 'Native Android',
        stack: 'Kotlin · Java · Gradle Kotlin/Groovy DSL',
        details:
          'Single and multi-module detection, Version Catalogs, build flavors, and AndroidManifest inspection.',
      },
      {
        name: 'Flutter Android',
        stack: 'Dart · pubspec.yaml · android/ Gradle',
        details:
          'Reads Flutter SDK constraints, ABI splits, and passes build-name and build-number overrides.',
      },
      {
        name: 'React Native & Expo Bare',
        stack: 'RN CLI · Expo prebuild · android/ Gradle',
        details:
          'Resolves npm/yarn/pnpm dependencies and compiles the native android/ Gradle module.',
      },
    ],
    securityTitle: 'Security Architecture',
    securitySubtitle: 'Built to isolate untrusted code and protect developer keys.',
    securityItems: [
      {
        title: 'Encrypted Server-Side Token Storage',
        desc: 'Tokens are encrypted with AES-256-GCM at rest and scoped to HttpOnly cookies—never localStorage.',
      },
      {
        title: 'Zero Compilation on Web Backend',
        desc: 'All Gradle, Flutter, and Node compilations run inside isolated GitHub-hosted runners.',
      },
      {
        title: 'Per-User Release Signing Isolation',
        desc: 'Never shares keys across users. Keystores are sealed as ephemeral GitHub Action secrets and purged after build.',
      },
    ],
  },
  dashboard: {
    title: 'Repositories & Build Overview',
    subtitle: 'Select an authorized Android repository to inspect its project structure and build an APK.',
    syncRepos: 'Sync Repositories',
    searchPlaceholder: 'Search by repository name or language...',
    allVisibility: 'All',
    publicOnly: 'Public',
    privateOnly: 'Private',
    selectRepo: 'Inspect & Configure',
    configureBuild: 'Configure Build',
    noReposTitle: 'No Authorized Repositories Found',
    noReposDesc: 'Install the Repo2APK GitHub App on at least one repository to list it here.',
    manageAccess: 'Manage Repository Access on GitHub',
    stats: {
      totalBuilds: 'Total Builds',
      successRate: 'Success Rate',
      avgDuration: 'Avg Duration',
      activeBuilds: 'Active Builds',
    },
    recentBuilds: 'Recent Builds',
    viewAllHistory: 'View Full History',
    noBuildsYet: 'No builds triggered yet.',
    setupBannerTitle: 'GitHub App Environment Configuration Required',
    setupBannerDesc:
      'Configure your GitHub App credentials in environment variables to enable live OAuth and Actions builds.',
    goToSettings: 'View Setup Guide',
  },
  configure: {
    title: 'Project Inspection & Build Configuration',
    subtitle: 'Select branch and directory, review the Android analysis report, and configure your APK.',
    backToDashboard: 'Back to Repositories',
    branchLabel: 'Branch',
    latestCommitLabel: 'Latest Commit SHA',
    projectDirLabel: 'Project Directory (Monorepo)',
    analyzeButton: 'Re-Analyze Project',
    analyzing: 'Inspecting repository tree and Gradle/Flutter manifests...',
    analysisReportTitle: 'Android Project Analysis Report',
    notAndroidTitle: 'Repository Is Not a Buildable Android Application',
    notAndroidWarning:
      'Build execution is blocked because this directory does not contain an authentic native Android build configuration.',
    detectedFilesLabel: 'Detected files in directory:',
    frameworkLabel: 'Detected Framework',
    languageLabel: 'Language',
    buildSystemLabel: 'Build System',
    moduleLabel: 'Application Module',
    packageIdLabel: 'Package / Application ID',
    sdkLabel: 'Android SDK Requirements',
    gradleWrapperLabel: 'Gradle Wrapper',
    javaJdkLabel: 'Required JDK',
    flutterVersionLabel: 'Flutter Version',
    signingDetectedLabel: 'Existing Signing Config',
    dependenciesLabel: 'Detected Dependencies',
    variantsLabel: 'Available Variants & Flavors',
    buildConfigTitle: 'APK Build Configuration',
    buildModeLabel: 'Build Mode',
    debugModeTitle: 'Debug APK',
    debugModeDesc: 'Standard debug compilation for device testing using default debug signing.',
    releaseModeTitle: 'Release APK',
    releaseModeDesc: 'Optimized release build using your own signing configuration or keystore.',
    variantSelectLabel: 'Build Variant / Flavor',
    abiModeLabel: 'ABI Target Mode',
    universalApk: 'Universal APK',
    splitAbiApk: 'ABI-Specific APKs',
    buildNameLabel: 'Build Name (versionName)',
    buildNumberLabel: 'Build Number (versionCode)',
    signingMethodLabel: 'Release Signing Method',
    signingRepoExisting: 'Use repository existing signingConfig',
    signingSavedConfig: 'Use saved encrypted keystore',
    signingUploadNew: 'Provide keystore for this build',
    signingUnsigned: 'Build Unsigned Release APK',
    unsignedWarning:
      'Warning: An unsigned Release APK is NOT production-ready and cannot be uploaded to Google Play or installed without signing.',
    keystoreFileLabel: 'Keystore File (.jks / .keystore)',
    keyAliasLabel: 'Key Alias',
    storePasswordLabel: 'Keystore Password',
    keyPasswordLabel: 'Key Password',
    saveKeystoreLabel: 'Save keystore encrypted (AES-256-GCM) for future builds',
    keystoreLabelInput: 'Keystore Label',
    computedCommandLabel: 'Computed Build Command',
    workflowRequiredTitle: 'One-Time Build Workflow Approval',
    workflowRequiredDesc:
      'Repo2APK requires installing one dedicated workflow file on this branch without touching any existing workflows.',
    workflowUpdateTitle: 'Build Workflow Update Available',
    workflowUpdateDesc:
      'The Repo2APK build workflow template has been updated with Android NDK/CMake compatibility (including `-lpthread` Bionic adaptation), SDK/NDK/CMake provisioning, Gradle wrapper resilience, and cleaner stage logs. Review and approve updating it on this branch before building.',
    workflowPermissionsNote: 'Permissions used: Contents (Write), Workflows (Write), Actions (Write).',
    workflowApproveCheckbox: 'I have reviewed the workflow YAML below and explicitly approve adding/updating it in this repository.',
    workflowInstallButton: 'Approve & Install Workflow',
    workflowUpdateButton: 'Approve & Update Workflow',
    workflowInstalling: 'Committing workflow file...',
    workflowInstalledBadge: 'repo2apk-build.yml installed & up to date',
    buildButton: 'Build APK',
    startingBuild: 'Dispatching GitHub Actions build...',
  },
  monitor: {
    title: 'Real-Time Build Monitor',
    subtitle: 'Live build telemetry synchronized with GitHub Actions.',
    stagesTitle: 'Build Pipeline Stages',
    currentStageLabel: 'Current Stage',
    elapsedLabel: 'Elapsed Duration',
    githubRunLink: 'View Run on GitHub Actions',
    logsTitle: 'Live Runner Logs',
    expandLogs: 'Expand Terminal',
    collapseLogs: 'Collapse Terminal',
    copyLogs: 'Copy Logs',
    copied: 'Copied',
    refreshNow: 'Sync Now',
    retrySameCommit: 'Rebuild Same Commit',
    retryLatestCommit: 'Build Latest Commit',
    workflowUpdateRequiredError: 'The workflow file in this repository is outdated. Open Configure to approve the update first.',
    openConfigureToUpdate: 'Open Configure to Update Workflow',
    viewDownloadPage: 'Go to APK Download Page',
    errorReportTitle: 'Automated Error Diagnosis',
    remediationLabel: 'Recommended Fix:',
    queuedHint: 'Waiting for GitHub Actions runner allocation and initial step telemetry...',
    statusLabels: {
      queued: 'Queued',
      running: 'Building',
      validating: 'Validating APK',
      storing: 'Storing Artifact',
      succeeded: 'Succeeded',
      failed: 'Failed',
      cancelled: 'Cancelled',
      timed_out: 'Timed Out',
    },
    stages: {
      repo_verification: '1. Repository verification',
      source_checkout: '2. Source code checkout',
      env_preparation: '3. Environment preparation',
      dependency_install: '4. Dependency installation',
      project_configuration: '5. Android project configuration',
      apk_compilation: '6. APK compilation',
      apk_validation: '7. APK validation',
      artifact_storage: '8. Artifact storage',
      build_completed: '9. Build completed',
    },
  },
  download: {
    title: 'APK Build Artifact Ready',
    subtitle: 'Validated APK stored in private object storage with time-limited signed access.',
    downloadButton: 'Download APK',
    unsignedAlertTitle: 'Unsigned Release APK',
    unsignedAlertDesc:
      'This Release APK is unsigned and NOT production-ready. Sign it with your private keystore before distribution.',
    signedVerifiedBadge: 'Signed Release APK',
    debugSignedBadge: 'Debug-Signed Test APK',
    metadataLabels: {
      appName: 'Application Name',
      repository: 'Repository',
      branch: 'Branch',
      commitSha: 'Commit SHA',
      framework: 'Framework',
      buildType: 'Build Type',
      fileName: 'APK File Name',
      fileSize: 'APK Size',
      packageId: 'Package ID',
      version: 'Version (Name / Code)',
      buildDate: 'Build Date',
      duration: 'Build Duration',
      sha256: 'SHA-256 Checksum',
      expiresAt: 'Private Storage Retention Until',
    },
    copySha: 'Copy SHA-256',
    backToMonitor: 'View Build Logs',
    rebuildAction: 'Configure New Build',
  },
  history: {
    title: 'Build History',
    subtitle: 'Inspect past builds, download validated APKs, or trigger rebuilds.',
    filterStatus: 'Filter by Status',
    filterAll: 'All Statuses',
    searchRepo: 'Filter by repository...',
    columns: {
      repository: 'Repository',
      branchCommit: 'Branch / Commit',
      frameworkType: 'Framework / Mode',
      status: 'Status',
      dateDuration: 'Date & Duration',
      actions: 'Actions',
    },
    downloadApk: 'Download APK',
    viewLogs: 'Logs',
    rebuildSame: 'Rebuild Commit',
    rebuildLatest: 'Build Latest',
    deleteBuild: 'Delete Record & APK',
    confirmDelete: 'Permanently delete this build record and its stored APK artifact?',
    emptyTitle: 'No Matching Builds Found',
    emptyDesc: 'Trigger your first Android build from the Dashboard to see records and artifacts here.',
  },
  settings: {
    title: 'Settings, GitHub & Signing',
    subtitle: 'Manage your GitHub App connection, language preference, retention, and encrypted keystores.',
    githubSectionTitle: 'GitHub App Connection',
    githubConnectedDesc: 'Authenticated via GitHub App OAuth with AES-256-GCM encrypted server token storage.',
    githubNotConnectedDesc: 'No GitHub account is currently connected.',
    githubSetupTitle: 'GitHub App Configuration Guide',
    githubSetupDesc:
      'Register a GitHub App and set these environment variables to enable live OAuth and Actions builds:',
    missingEnvLabel: 'Missing Environment Variables:',
    callbackUrlLabel: 'Callback URL',
    webhookUrlLabel: 'Webhook URL',
    permissionsTableTitle: 'Minimum Required GitHub App Permissions:',
    manifestCardTitle: '1-Click Automatic Setup (GitHub App Manifest -> Vercel .env)',
    manifestCardDesc:
      'Skip filling out URLs and permissions manually. Click below to register the GitHub App automatically and download a ready-to-import .env file for Vercel.',
    manifestAppNameLabel: 'Unique GitHub App Name',
    manifestSubmitButton: 'Create GitHub App & Export .env',
    manifestSubmitting: 'Redirecting to GitHub...',
    preferencesTitle: 'Language & Build Preferences',
    languageLabel: 'Interface Language',
    defaultBuildTypeLabel: 'Default Build Type',
    retentionDaysLabel: 'Artifact Retention (Days)',
    savePreferences: 'Save Preferences',
    savedNotice: 'Preferences saved.',
    signingSectionTitle: 'Encrypted Signing Keystores',
    signingSectionDesc:
      'Keystores and passwords are encrypted per-user with AES-256-GCM and never shared across accounts.',
    addKeystoreTitle: 'Add Signing Keystore',
    noSigningConfigs: 'No saved signing keystores yet.',
    deleteAction: 'Delete',
  },
};

export function getDictionary(lang: SupportedLanguage): Dictionary {
  return lang === 'en' ? en : ar;
}
