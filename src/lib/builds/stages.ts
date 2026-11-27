import type { BuildStageState } from '@/lib/types';

export interface StageDefinition {
  index: number;
  key: BuildStageState['key'];
  labelAr: string;
  labelEn: string;
}

export const BUILD_STAGES: StageDefinition[] = [
  {
    index: 1,
    key: 'repo_verification',
    labelAr: 'التحقق من المستودع',
    labelEn: 'Repository verification',
  },
  {
    index: 2,
    key: 'source_checkout',
    labelAr: 'جلب الكود المصدري',
    labelEn: 'Source code checkout',
  },
  {
    index: 3,
    key: 'env_preparation',
    labelAr: 'تهيئة بيئة البناء',
    labelEn: 'Environment preparation',
  },
  {
    index: 4,
    key: 'dependency_install',
    labelAr: 'تثبيت الاعتماديات',
    labelEn: 'Dependency installation',
  },
  {
    index: 5,
    key: 'project_configuration',
    labelAr: 'تهيئة مشروع أندرويد',
    labelEn: 'Android project configuration',
  },
  {
    index: 6,
    key: 'apk_compilation',
    labelAr: 'ترجمة وبناء ملف APK',
    labelEn: 'APK compilation',
  },
  {
    index: 7,
    key: 'apk_validation',
    labelAr: 'التحقق من صحة ملف APK',
    labelEn: 'APK validation',
  },
  {
    index: 8,
    key: 'artifact_storage',
    labelAr: 'تخزين الملف النهائي',
    labelEn: 'Artifact storage',
  },
  {
    index: 9,
    key: 'build_completed',
    labelAr: 'اكتمل البناء',
    labelEn: 'Build completed',
  },
];

export function createInitialStagesState(nowIso = new Date().toISOString()): BuildStageState[] {
  return BUILD_STAGES.map((stage, i) => ({
    index: stage.index,
    key: stage.key,
    status: i === 0 ? 'completed' : 'pending',
    startedAt: i === 0 ? nowIso : null,
    completedAt: i === 0 ? nowIso : null,
    message: null,
  }));
}

export function mapGitHubStepNameToStageIndex(stepName: string, fallbackStage = -1): number {
  const lower = stepName.toLowerCase();
  const explicit = lower.match(/\[stage\s*([1-9])\]|repo2apk_stage:([1-9])/);
  const explicitDigit = explicit?.[1] || explicit?.[2];
  if (explicitDigit) return parseInt(explicitDigit, 10);
  if (lower.startsWith('post ') || lower.includes('complete job') || lower.includes('cleanup')) return -1;
  if (lower.includes('set up job') || lower.includes('verification')) return 1;
  if (lower.includes('checkout') || lower.includes('verify target commit')) return 2;
  if (
    lower.includes('setup java') ||
    lower.includes('setup-java') ||
    lower.includes('setup android') ||
    lower.includes('setup-android') ||
    lower.includes('setup flutter') ||
    lower.includes('flutter-action') ||
    lower.includes('setup node') ||
    lower.includes('setup-node') ||
    lower.includes('environment')
  ) {
    return 3;
  }
  if (lower.includes('dependenc') || lower.includes('pub get') || lower.includes('npm') || lower.includes('yarn')) return 4;
  if (lower.includes('configuration') || lower.includes('signing') || lower.includes('gradle wrapper')) return 5;
  if (lower.includes('compil') || lower.includes('build apk') || lower.includes('assemble')) return 6;
  if (lower.includes('validat') || lower.includes('upload apk artifact') || lower.includes('upload-artifact')) return 7;
  return fallbackStage;
}
