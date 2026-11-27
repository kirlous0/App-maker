export interface GitHubAppPublicConfig {
  isConfigured: boolean;
  hasClientCredentials: boolean;
  hasAppPrivateKey: boolean;
  hasWebhookSecret: boolean;
  appSlug: string | null;
  appId: string | null;
  missingVars: string[];
  appBaseUrl: string;
  callbackUrl: string;
  installUrl: string | null;
  webhookUrl: string;
  requiredPermissions: Array<{ permission: string; access: string; reasonEn: string; reasonAr: string }>;
}

export function resolveRequestOrigin(request: Request): string {
  const fwdHost = request.headers.get('x-forwarded-host');
  const host = fwdHost || request.headers.get('host');
  const proto =
    request.headers.get('x-forwarded-proto') ||
    (request.url.startsWith('https://') ? 'https' : 'http');
  if (host) {
    return `${proto}://${host.replace(/^0\.0\.0\.0/, 'localhost')}`;
  }
  const url = new URL(request.url);
  return url.origin.replace('://0.0.0.0', '://localhost');
}

export function getAppBaseUrl(requestOrigin?: string): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured && configured !== 'http://localhost:3000') {
    return configured.replace(/\/+$/, '');
  }
  if (requestOrigin) {
    return requestOrigin.replace('://0.0.0.0', '://localhost').replace(/\/+$/, '');
  }
  return (configured || 'http://localhost:3000').replace(/\/+$/, '');
}

export function getGitHubAppConfig(requestOrigin?: string): GitHubAppPublicConfig {
  const appId = process.env.GITHUB_APP_ID?.trim() || null;
  const appSlug = process.env.GITHUB_APP_SLUG?.trim() || null;
  const clientId = process.env.GITHUB_CLIENT_ID?.trim() || null;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET?.trim() || null;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY?.trim() || null;
  const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET?.trim() || null;

  const missingVars: string[] = [];
  if (!appId) missingVars.push('GITHUB_APP_ID');
  if (!appSlug) missingVars.push('GITHUB_APP_SLUG');
  if (!clientId) missingVars.push('GITHUB_CLIENT_ID');
  if (!clientSecret) missingVars.push('GITHUB_CLIENT_SECRET');
  if (!privateKey) missingVars.push('GITHUB_APP_PRIVATE_KEY');

  const appBaseUrl = getAppBaseUrl(requestOrigin);

  return {
    isConfigured: missingVars.length === 0,
    hasClientCredentials: Boolean(clientId && clientSecret),
    hasAppPrivateKey: Boolean(appId && privateKey),
    hasWebhookSecret: Boolean(webhookSecret),
    appSlug,
    appId,
    missingVars,
    appBaseUrl,
    callbackUrl: `${appBaseUrl}/api/auth/github/callback`,
    installUrl: appSlug ? `https://github.com/apps/${appSlug}/installations/new` : null,
    webhookUrl: `${appBaseUrl}/api/webhooks/github`,
    requiredPermissions: [
      {
        permission: 'Metadata',
        access: 'Read-only',
        reasonEn: 'Required by GitHub Apps to list authorized repositories and branches.',
        reasonAr: 'مطلوبة أساسياً لعرض المستودعات المصرح بها والفروع.',
      },
      {
        permission: 'Contents',
        access: 'Read & Write',
        reasonEn: 'Read project files for Android detection and commit the dedicated build workflow when approved.',
        reasonAr: 'قراءة ملفات المشروع لتحليل بنية أندرويد وإضافة ملف سير عمل البناء بعد موافقتك.',
      },
      {
        permission: 'Workflows',
        access: 'Read & Write',
        reasonEn: 'Install and update .github/workflows/repo2apk-build.yml upon explicit approval.',
        reasonAr: 'تثبيت وتحديث ملف .github/workflows/repo2apk-build.yml بعد موافقتك الصريحة.',
      },
      {
        permission: 'Actions',
        access: 'Read & Write',
        reasonEn: 'Dispatch workflow_dispatch builds, read job logs, and download compiled APK artifacts.',
        reasonAr: 'تشغيل عمليات البناء عبر workflow_dispatch وقراءة السجلات وتنزيل مخرجات APK.',
      },
      {
        permission: 'Secrets (Actions)',
        access: 'Read & Write (Optional)',
        reasonEn: 'Only needed if you supply a Release Keystore so credentials are encrypted as repo secrets.',
        reasonAr: 'مطلوبة فقط عند استخدام شهادة توقيع Release لتمرير المفاتيح مشفرة عبر أسرار GitHub.',
      },
    ],
  };
}
