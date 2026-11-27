export type SupportedLanguage = 'ar' | 'en';

export type AndroidFramework =
  | 'native_android'
  | 'flutter'
  | 'react_native'
  | 'expo_bare'
  | 'unsupported';

export type BuildMode = 'debug' | 'release';

export type AbiMode = 'universal' | 'split';

export type BuildStatus =
  | 'queued'
  | 'running'
  | 'validating'
  | 'storing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'timed_out';

export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface BuildStageState {
  index: number; // 1..9
  key:
    | 'repo_verification'
    | 'source_checkout'
    | 'env_preparation'
    | 'dependency_install'
    | 'project_configuration'
    | 'apk_compilation'
    | 'apk_validation'
    | 'artifact_storage'
    | 'build_completed';
  status: StageStatus;
  startedAt: string | null;
  completedAt: string | null;
  message?: string | null;
}

export interface UserProfile {
  id: string;
  github_user_id: number;
  github_login: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  preferred_language: SupportedLanguage;
  default_build_type: BuildMode;
  artifact_retention_days: number;
  created_at: string;
  updated_at: string;
}

export interface GitHubInstallationRecord {
  id: string;
  user_id: string;
  installation_id: number;
  account_login: string;
  account_type: string;
  repository_selection: string;
  permissions: Record<string, string>;
  encrypted_user_access_token: string | null;
  encrypted_user_refresh_token: string | null;
  token_expires_at: string | null;
  suspended_at: string | null;
  disconnected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface RepositoryRecord {
  id: string;
  user_id: string;
  installation_id: number;
  github_repo_id: number;
  owner: string;
  name: string;
  full_name: string;
  description: string | null;
  visibility: string;
  is_private: boolean;
  primary_language: string | null;
  default_branch: string;
  html_url: string | null;
  pushed_at: string | null;
  synced_at: string;
}

export interface GitHubBranchInfo {
  name: string;
  commitSha: string;
  commitMessage: string | null;
  commitAuthor: string | null;
  commitDate: string | null;
  isProtected: boolean;
}

export interface ExistingSigningInfo {
  hasReleaseSigningConfig: boolean;
  referencesKeystoreFile: boolean;
  referencesEnvVars: boolean;
  details: string[];
}

export interface AndroidSdkRequirements {
  compileSdk: string | null;
  minSdk: string | null;
  targetSdk: string | null;
  ndkVersion: string | null;
  buildToolsVersion: string | null;
  cmakeVersion?: string | null;
  hasNativeCxx?: boolean;
}

export interface AndroidProjectAnalysis {
  repoFullName: string;
  branch: string;
  commitSha: string;
  projectDir: string;
  isAndroidProject: boolean;
  isBuildable: boolean;
  framework: AndroidFramework;
  frameworkLabel: string;
  language: string;
  buildSystem: string; // e.g. 'Gradle Kotlin DSL (.kts)', 'Gradle Groovy DSL', 'Flutter + Gradle', 'React Native + Gradle'
  agpVersion: string | null;
  gradleWrapperVersion: string | null;
  hasGradleWrapper: boolean;
  javaVersion: string | null;
  recommendedJdk: string;
  flutterVersion: string | null;
  reactNativeVersion: string | null;
  expoVersion: string | null;
  applicationModules: string[];
  selectedModule: string | null;
  packageId: string | null;
  versionName: string | null;
  versionCode: string | null;
  buildTypes: string[];
  productFlavors: string[];
  availableVariants: string[];
  androidSdk: AndroidSdkRequirements;
  dependencies: string[];
  existingSigning: ExistingSigningInfo;
  candidateDirectories: string[];
  supportsAbiSplit: boolean;
  supportsBuildNameNumberOverride: boolean;
  blockers: Array<{
    code: string;
    messageAr: string;
    messageEn: string;
  }>;
  warnings: Array<{
    code: string;
    messageAr: string;
    messageEn: string;
  }>;
  nonAndroidReason?: {
    code: string;
    messageAr: string;
    messageEn: string;
    detectedFiles: string[];
  };
}

export interface BuildConfigInput {
  repoFullName: string;
  installationId: number;
  branch: string;
  commitSha: string;
  projectDir: string;
  buildType: BuildMode;
  applicationModule: string;
  buildVariant: string;
  abiMode: AbiMode;
  buildName?: string;
  buildNumber?: string;
  signingMode: 'debug_default' | 'repo_existing' | 'user_keystore' | 'unsigned_release';
  signingConfigId?: string;
  ephemeralKeystore?: {
    keystoreBase64: string;
    storePassword: string;
    keyAlias: string;
    keyPassword: string;
    saveForFuture?: boolean;
    label?: string;
  };
}

export interface SigningConfigSummary {
  id: string;
  user_id: string;
  project_id: string | null;
  label: string;
  repo_full_name: string | null;
  key_alias: string;
  keystore_sha256: string;
  created_at: string;
  updated_at: string;
}

export interface SigningConfigRecord extends SigningConfigSummary {
  encrypted_keystore_base64: string;
  encrypted_store_password: string;
  encrypted_key_password: string;
}

export interface BuildJobRecord {
  id: string;
  user_id: string;
  project_id: string | null;
  signing_config_id: string | null;
  run_nonce: string;
  installation_id: number;
  repo_full_name: string;
  branch: string;
  commit_sha: string;
  project_dir: string;
  framework: AndroidFramework;
  build_type: BuildMode;
  build_variant: string | null;
  application_module: string | null;
  abi_mode: AbiMode;
  build_name: string | null;
  build_number: string | null;
  build_command: string;
  status: BuildStatus;
  current_stage: number;
  stages_state: BuildStageState[];
  github_run_id: number | null;
  github_job_id: number | null;
  github_run_url: string | null;
  is_unsigned: boolean;
  error_code: string | null;
  error_summary: string | null;
  error_details: string | null;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  created_at: string;
  updated_at: string;
}

export interface BuildLogRecord {
  id: number;
  build_job_id: string;
  user_id: string;
  stage_index: number;
  step_name: string | null;
  level: 'info' | 'warn' | 'error' | 'debug';
  content: string;
  created_at: string;
}

export interface BuildArtifactRecord {
  id: string;
  build_job_id: string;
  user_id: string;
  app_name: string | null;
  file_name: string;
  storage_bucket: string;
  storage_path: string;
  size_bytes: number;
  sha256: string;
  package_id: string | null;
  version_name: string | null;
  version_code: string | null;
  is_signed: boolean;
  signing_status: string;
  abi: string;
  download_count: number;
  expires_at: string;
  deleted_at: string | null;
  created_at: string;
}

export interface ErrorDiagnostic {
  code: string;
  titleAr: string;
  titleEn: string;
  explanationAr: string;
  explanationEn: string;
  remediationAr: string;
  remediationEn: string;
  matchedLogExcerpt?: string;
}

export interface BuildStats {
  totalBuilds: number;
  succeededBuilds: number;
  failedBuilds: number;
  activeBuilds: number;
  successRate: number;
  averageDurationMs: number | null;
  totalArtifactsBytes: number;
}
