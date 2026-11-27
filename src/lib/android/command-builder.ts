import type { AbiMode, AndroidProjectAnalysis, BuildMode } from '@/lib/types';

const SAFE_IDENT = /^[A-Za-z0-9._:-]+$/;
const SAFE_VERSION = /^[A-Za-z0-9.+-]+$/;

export function sanitizeIdentifier(val: string | undefined | null, fallback: string): string {
  if (!val) return fallback;
  const trimmed = val.trim();
  return SAFE_IDENT.test(trimmed) ? trimmed : fallback;
}

export function sanitizeVersionValue(val: string | undefined | null): string | null {
  if (!val) return null;
  const trimmed = val.trim();
  if (!trimmed || !SAFE_VERSION.test(trimmed)) return null;
  return trimmed;
}

function capitalize(str: string): string {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : '';
}

export function computeBuildCommand(params: {
  analysis: AndroidProjectAnalysis;
  buildType: BuildMode;
  applicationModule?: string | null;
  buildVariant?: string | null;
  abiMode?: AbiMode;
  buildName?: string | null;
  buildNumber?: string | null;
}): {
  command: string;
  gradleTask: string;
  normalizedModule: string;
  normalizedVariant: string;
} {
  const { analysis, buildType } = params;
  const mod = sanitizeIdentifier(
    params.applicationModule || analysis.selectedModule,
    'app'
  ).replace(/^:/, '');
  const variant = sanitizeIdentifier(params.buildVariant, buildType);
  const abiMode: AbiMode = params.abiMode === 'split' ? 'split' : 'universal';
  const buildName = sanitizeVersionValue(params.buildName);
  const buildNumber = sanitizeVersionValue(params.buildNumber);

  if (analysis.framework === 'flutter') {
    const parts = ['flutter', 'build', 'apk', `--${buildType}`];
    if (variant !== buildType && !['debug', 'release', 'profile'].includes(variant.toLowerCase())) {
      const flavorOnly = variant.replace(/(Debug|Release|Profile)$/i, '');
      if (flavorOnly) parts.push('--flavor', flavorOnly);
    }
    if (abiMode === 'split') {
      parts.push('--split-per-abi');
    }
    if (buildName) {
      parts.push(`--build-name=${buildName}`);
    }
    if (buildNumber) {
      parts.push(`--build-number=${buildNumber}`);
    }
    return {
      command: parts.join(' '),
      gradleTask: `assemble${capitalize(variant)}`,
      normalizedModule: mod,
      normalizedVariant: variant,
    };
  }

  const gradleTask = `assemble${capitalize(variant)}`;
  const taskPath = mod === 'root' ? gradleTask : `:${mod}:${gradleTask}`;

  if (analysis.framework === 'react_native' || analysis.framework === 'expo_bare') {
    const rnGradleBin = analysis.hasGradleWrapper === false ? 'gradle' : './gradlew';
    return {
      command: `cd android && ${rnGradleBin} ${taskPath} --no-daemon`,
      gradleTask: taskPath,
      normalizedModule: mod,
      normalizedVariant: variant,
    };
  }

  // Native Android
  const gradleBin = analysis.hasGradleWrapper === false ? 'gradle' : './gradlew';
  return {
    command: `${gradleBin} ${taskPath} --no-daemon`,
    gradleTask: taskPath,
    normalizedModule: mod,
    normalizedVariant: variant,
  };
}
