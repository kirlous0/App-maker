import { NextResponse } from 'next/server';
import { getGitHubAppConfig, resolveRequestOrigin } from '@/lib/github/config';
import {
  formatVercelGitHubAppEnv,
  type GitHubAppManifestConversionResponse,
} from '@/lib/github/manifest';
import { resolveServerLanguage } from '@/lib/i18n/server';
import { consumeManifestStateCookie, MANIFEST_STATE_COOKIE_NAME } from '@/lib/session';

function escapeHtml(val: string): string {
  return val
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cfg = getGitHubAppConfig(resolveRequestOrigin(request));
  const { lang } = await resolveServerLanguage();

  if (cfg.isConfigured) {
    const dest = new URL('/settings', cfg.appBaseUrl);
    dest.searchParams.set('manifest_error', 'already_configured');
    return NextResponse.redirect(dest);
  }

  if (!code) {
    const dest = new URL('/settings', cfg.appBaseUrl);
    dest.searchParams.set('manifest_error', 'missing_code');
    return NextResponse.redirect(dest);
  }

  const validState = await consumeManifestStateCookie(state);
  if (!validState) {
    const dest = new URL('/settings', cfg.appBaseUrl);
    dest.searchParams.set('manifest_error', 'invalid_state');
    return NextResponse.redirect(dest);
  }

  let appData: GitHubAppManifestConversionResponse;
  try {
    const ghRes = await fetch(
      `https://api.github.com/app-manifests/${encodeURIComponent(code)}/conversions`,
      {
        method: 'POST',
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'Repo2APK-Platform',
        },
        cache: 'no-store',
      }
    );
    if (!ghRes.ok) {
      const errText = await ghRes.text();
      throw new Error(`GitHub returned ${ghRes.status}: ${errText.slice(0, 120)}`);
    }
    appData = (await ghRes.json()) as GitHubAppManifestConversionResponse;
    if (!appData?.id || !appData?.slug || !appData?.client_id || !appData?.client_secret || !appData?.pem) {
      throw new Error('Incomplete conversion payload returned by GitHub.');
    }
  } catch (err) {
    const dest = new URL('/settings', cfg.appBaseUrl);
    dest.searchParams.set(
      'manifest_error',
      err instanceof Error ? err.message.slice(0, 140) : 'conversion_failed'
    );
    const res = NextResponse.redirect(dest);
    res.cookies.delete(MANIFEST_STATE_COOKIE_NAME);
    return res;
  }

  const envContent = formatVercelGitHubAppEnv(appData);
  const safeJsonPayload = JSON.stringify({
    fileName: 'repo2apk-github-app.env',
    envContent,
  }).replace(/</g, '\\u003c');

  const isAr = lang === 'ar';
  const installUrl = `https://github.com/apps/${encodeURIComponent(appData.slug)}/installations/new`;
  const vercelEnvUrl =
    'https://vercel.com/kirlous-s-projects/repo2apk/settings/environment-variables';

  const html = `<!DOCTYPE html>
<html lang="${isAr ? 'ar' : 'en'}" dir="${isAr ? 'rtl' : 'ltr'}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Repo2APK — GitHub App Created</title>
  <style>
    body { margin: 0; background: #08090C; color: #E6EAF2; font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; }
    .wrap { max-width: 720px; margin: 48px auto; padding: 0 20px; }
    .card { background: #0E1117; border: 1px solid #1F2430; border-radius: 10px; padding: 28px; }
    .badge { display: inline-block; background: rgba(16,185,129,0.12); color: #34D399; border: 1px solid rgba(16,185,129,0.35); border-radius: 6px; padding: 4px 10px; font-size: 12px; font-family: monospace; }
    h1 { margin: 14px 0 8px; font-size: 22px; color: #fff; }
    p { margin: 0 0 18px; color: #9AA3B2; font-size: 14px; }
    .meta { background: #131720; border: 1px solid #1F2430; border-radius: 8px; padding: 14px; font-family: monospace; font-size: 12px; margin-bottom: 20px; direction: ltr; text-align: left; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
    button, a.btn { cursor: pointer; border: none; border-radius: 7px; padding: 11px 18px; font-size: 13px; font-weight: 600; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; }
    .primary { background: #10B981; color: #04140E; }
    .secondary { background: #131720; color: #E6EAF2; border: 1px solid #2E3648 !important; }
    ol { margin: 0; padding-inline-start: 20px; color: #CBD2E0; font-size: 13px; }
    li { margin-bottom: 8px; }
    .warn { margin-top: 18px; padding: 12px; border-radius: 7px; background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.3); color: #FCD34D; font-size: 12px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <span class="badge">GITHUB_APP_CREATED</span>
      <h1>${isAr ? 'تم إنشاء GitHub App بنجاح' : 'GitHub App Created Successfully'}</h1>
      <p>${
        isAr
          ? 'تم إنشاء التطبيق وتوليد جميع المفاتيح والموافقات تلقائياً. حمّل ملف .env التالي ثم ارفعه مباشرة عبر زر Import .env في Vercel.'
          : 'Your GitHub App and credentials were generated automatically. Download the .env file below and upload it via Vercel Import .env.'
      }</p>

      <div class="meta">
        <div>GITHUB_APP_ID = ${escapeHtml(String(appData.id))}</div>
        <div>GITHUB_APP_SLUG = ${escapeHtml(appData.slug)}</div>
        <div>GITHUB_CLIENT_ID = ${escapeHtml(appData.client_id)}</div>
        <div>GITHUB_CLIENT_SECRET = [READY IN .ENV FILE]</div>
        <div>GITHUB_APP_PRIVATE_KEY = [READY IN .ENV FILE]</div>
        <div>GITHUB_WEBHOOK_SECRET = [READY IN .ENV FILE]</div>
      </div>

      <div class="actions">
        <button id="download-btn" type="button" class="primary">
          ${isAr ? 'تحميل ملف repo2apk-github-app.env' : 'Download repo2apk-github-app.env'}
        </button>
        <a href="${escapeHtml(vercelEnvUrl)}" target="_blank" rel="noreferrer" class="btn secondary">
          ${isAr ? 'فتح متغيرات البيئة في Vercel' : 'Open Vercel Environment Variables'}
        </a>
        <a href="${escapeHtml(installUrl)}" target="_blank" rel="noreferrer" class="btn secondary">
          ${isAr ? 'تثبيت التطبيق على مستودع أندرويد' : 'Install App on Android Repo'}
        </a>
      </div>

      <ol>
        <li>${
          isAr
            ? 'اضغط على زر "تحميل ملف repo2apk-github-app.env" أعلاه.'
            : 'Click "Download repo2apk-github-app.env" above.'
        }</li>
        <li>${
          isAr
            ? 'افتح متغيرات البيئة في Vercel، واضغط زر "Import .env" في الأسفل وارفع الملف، ثم احفظ (تأكد من تحديد Production و Preview).'
            : 'Open Vercel Environment Variables, click "Import .env", upload the downloaded file, and save for Production & Preview.'
        }</li>
        <li>${
          isAr
            ? 'اضغط "تثبيت التطبيق على مستودع أندرويد" لمنح الصلاحية للمستودع، ثم أعد نشر المشروع في Vercel وابدأ البناء!'
            : 'Click "Install App on Android Repo" to authorize your Android repo, trigger a Redeploy in Vercel, and start building!'
        }</li>
      </ol>

      <div class="warn">${
        isAr
          ? 'تنبيه أمني: هذه الصفحة تظهر لمرة واحدة فقط ولا يتم حفظ أسرار GitHub على الخادم حتى تضيفها بنفسك إلى Vercel. احذف الملف من جهازك بعد رفعه لـ Vercel.'
          : 'Security note: This one-time page does not persist GitHub App secrets on the server. Delete the downloaded .env file after importing it into Vercel.'
      }</div>
    </div>
  </div>
  <script type="application/json" id="env-payload">${safeJsonPayload}</script>
  <script>
    (function () {
      var btn = document.getElementById('download-btn');
      var el = document.getElementById('env-payload');
      if (!btn || !el) return;
      var payload = JSON.parse(el.textContent || '{}');
      btn.addEventListener('click', function () {
        var blob = new Blob([payload.envContent || ''], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = payload.fileName || 'repo2apk-github-app.env';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      });
    })();
  </script>
</body>
</html>`;

  const response = new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
    },
  });
  response.cookies.delete(MANIFEST_STATE_COOKIE_NAME);
  return response;
}
