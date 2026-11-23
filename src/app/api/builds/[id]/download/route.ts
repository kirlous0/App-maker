import { NextResponse } from 'next/server';
import { dbStore, getStoreMode } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await dbStore.getBuildJob(session.userId, id);
  if (!job || job.status !== 'succeeded') {
    return NextResponse.json(
      { error: 'No validated APK is available for this build.' },
      { status: 404 }
    );
  }

  const artifact = await dbStore.getBuildArtifactByJob(session.userId, job.id);
  if (!artifact || artifact.deleted_at) {
    return NextResponse.json({ error: 'APK artifact has expired or was deleted.' }, { status: 404 });
  }

  if (new Date(artifact.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'APK artifact has expired.' }, { status: 410 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format');
  const proxy = url.searchParams.get('proxy') === '1';

  await dbStore.incrementArtifactDownload(artifact.id, artifact.download_count);

  if (getStoreMode() === 'supabase' && !proxy) {
    const signedUrl = await dbStore.createArtifactSignedUrl(
      artifact.storage_path,
      artifact.file_name,
      120
    );
    if (format === 'json') {
      return NextResponse.json({
        signedUrl,
        fileName: artifact.file_name,
        sizeBytes: artifact.size_bytes,
        sha256: artifact.sha256,
        expiresInSeconds: 120,
      });
    }
    return NextResponse.redirect(signedUrl, 302);
  }

  // Stream verified APK directly when proxy=1 or in sandbox local mode
  if (format === 'json') {
    return NextResponse.json({
      signedUrl: `/api/builds/${job.id}/download?proxy=1`,
      fileName: artifact.file_name,
      sizeBytes: artifact.size_bytes,
      sha256: artifact.sha256,
      expiresInSeconds: 120,
    });
  }

  const apkBuffer = await dbStore.downloadApkBinary(artifact.storage_path);
  return new Response(new Uint8Array(apkBuffer), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${artifact.file_name.replace(/"/g, '')}"`,
      'Content-Length': String(apkBuffer.byteLength),
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
