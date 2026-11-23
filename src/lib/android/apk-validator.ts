import AdmZip from 'adm-zip';
import { sha256Hex } from '@/lib/crypto';

export interface ValidatedApkMetadata {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  isValidApk: boolean;
  validationErrors: string[];
  appName: string | null;
  packageId: string | null;
  versionName: string | null;
  versionCode: string | null;
  isSigned: boolean;
  signingStatus: 'signed' | 'unsigned' | 'debug_signed';
  abi: string;
}

export interface Repo2ApkRunnerMetadata {
  fileName?: string;
  appName?: string;
  packageId?: string;
  versionName?: string;
  versionCode?: string;
  sha256?: string;
  isSigned?: boolean;
  signingStatus?: 'signed' | 'unsigned' | 'debug_signed';
  abi?: string;
}

export function validateApkBuffer(
  apkBuffer: Buffer,
  fileName: string,
  runnerMeta?: Repo2ApkRunnerMetadata | null,
  isDebugBuild = false
): ValidatedApkMetadata {
  const errors: string[] = [];

  if (!apkBuffer || apkBuffer.length < 512) {
    errors.push('APK file is empty or smaller than minimum valid APK size (512 B).');
  }

  // ZIP local file header magic bytes: PK\x03\x04
  if (
    apkBuffer.length < 4 ||
    apkBuffer[0] !== 0x50 ||
    apkBuffer[1] !== 0x4b ||
    apkBuffer[2] !== 0x03 ||
    apkBuffer[3] !== 0x04
  ) {
    errors.push('File does not start with valid APK/ZIP magic header.');
  }

  let hasManifest = false;
  let hasDexOrResources = false;
  let hasSignatureEntries = false;

  if (errors.length === 0) {
    try {
      const zip = new AdmZip(apkBuffer);
      const entries = zip.getEntries();
      const names = entries.map((e) => e.entryName);
      hasManifest = names.includes('AndroidManifest.xml');
      hasDexOrResources =
        names.some((n) => /^classes\d*\.dex$/.test(n)) || names.includes('resources.arsc');
      hasSignatureEntries = names.some((n) => /^META-INF\/.*\.(RSA|DSA|EC|SF)$/i.test(n));

      if (!hasManifest) {
        errors.push('Archive is missing AndroidManifest.xml.');
      }
      if (!hasDexOrResources) {
        errors.push('Archive is missing compiled classes.dex and resources.arsc.');
      }
    } catch (err) {
      errors.push(`Corrupted APK ZIP container: ${err instanceof Error ? err.message : 'parse error'}`);
    }
  }

  const sha256 = sha256Hex(apkBuffer);
  if (runnerMeta?.sha256 && runnerMeta.sha256.toLowerCase() !== sha256.toLowerCase()) {
    errors.push('APK SHA-256 checksum does not match runner metadata.');
  }

  let signingStatus: 'signed' | 'unsigned' | 'debug_signed' = 'unsigned';
  let isSigned = false;
  if (runnerMeta?.signingStatus) {
    signingStatus = runnerMeta.signingStatus;
    isSigned = runnerMeta.isSigned ?? signingStatus !== 'unsigned';
  } else if (isDebugBuild) {
    signingStatus = 'debug_signed';
    isSigned = true;
  } else if (hasSignatureEntries) {
    signingStatus = 'signed';
    isSigned = true;
  }

  return {
    fileName,
    sizeBytes: apkBuffer.length,
    sha256,
    isValidApk: errors.length === 0,
    validationErrors: errors,
    appName: runnerMeta?.appName || null,
    packageId: runnerMeta?.packageId || null,
    versionName: runnerMeta?.versionName || null,
    versionCode: runnerMeta?.versionCode || null,
    isSigned,
    signingStatus,
    abi: runnerMeta?.abi || 'universal',
  };
}

export function extractApkFromGitHubArtifactZip(artifactZipBuffer: Buffer): {
  apkBuffer: Buffer;
  apkFileName: string;
  metadata: Repo2ApkRunnerMetadata | null;
} | null {
  const zip = new AdmZip(artifactZipBuffer);
  const entries = zip.getEntries();

  let metadata: Repo2ApkRunnerMetadata | null = null;
  const metaEntry = entries.find((e) => e.entryName.endsWith('repo2apk-metadata.json'));
  if (metaEntry) {
    try {
      metadata = JSON.parse(metaEntry.getData().toString('utf8')) as Repo2ApkRunnerMetadata;
    } catch {
      metadata = null;
    }
  }

  const apkEntries = entries.filter(
    (e) =>
      !e.isDirectory &&
      e.entryName.toLowerCase().endsWith('.apk') &&
      !e.entryName.toLowerCase().includes('androidtest') &&
      !e.entryName.toLowerCase().includes('-unaligned')
  );

  if (apkEntries.length === 0) return null;

  // Prefer universal / arm64-v8a / release / debug primary apk
  apkEntries.sort((a, b) => {
    const score = (name: string) => {
      const l = name.toLowerCase();
      if (l.includes('universal')) return 0;
      if (l.includes('arm64-v8a')) return 1;
      if (!l.includes('unsigned')) return 2;
      return 3;
    };
    return score(a.entryName) - score(b.entryName);
  });

  const chosen = apkEntries[0];
  const fileName = chosen.entryName.split('/').pop() || 'app.apk';
  return {
    apkBuffer: chosen.getData(),
    apkFileName: fileName,
    metadata,
  };
}
