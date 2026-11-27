import { NextResponse } from 'next/server';
import { recoverBuildArtifactFromGitHub } from '@/lib/builds/sync-engine';
import { dbStore, getStoreMode } from '@/lib/db';
import { APK_CHUNKED_BUCKET } from '@/lib/db/supabase';
import { getSession } from '@/lib/session';
import type { BuildArtifactRecord } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_PROXY_SLICE_BYTES = 3_500_000;

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

  let artifact: BuildArtifactRecord | null = await dbStore.getBuildArtifactByJob(
    session.userId,
    job.id
  );
  if (!artifact || artifact.deleted_at) {
    return NextResponse.json({ error: 'APK artifact has expired or was deleted.' }, { status: 404 });
  }

  if (new Date(artifact.expires_at).getTime() < Date.now()) {
    return NextResponse.json({ error: 'APK artifact has expired.' }, { status: 410 });
  }

  const url = new URL(request.url);
  const format = url.searchParams.get('format');
  const proxy = url.searchParams.get('proxy') === '1';
  const chunkIndexParam = url.searchParams.get('chunkIndex');

  // Same-origin byte-range proxy slice (strictly <= 3.5 MB to never exceed Vercel's 4.5 MB payload cap)
  if (chunkIndexParam !== null) {
    const chunkIndex = parseInt(chunkIndexParam, 10);
    const start = parseInt(url.searchParams.get('start') || '0', 10);
    const end = parseInt(url.searchParams.get('end') || '0', 10);
    if (
      !Number.isFinite(chunkIndex) ||
      chunkIndex < 0 ||
      !Number.isFinite(start) ||
      start < 0 ||
      !Number.isFinite(end) ||
      end < start ||
      end - start + 1 > MAX_PROXY_SLICE_BYTES
    ) {
      return NextResponse.json({ error: 'Invalid chunk slice parameters.' }, { status: 400 });
    }

    const isChunked =
      artifact.storage_bucket === APK_CHUNKED_BUCKET || artifact.storage_path.endsWith('.manifest');
    if (getStoreMode() === 'supabase' && isChunked) {
      const info = await dbStore.createChunkedArtifactSignedUrls(
        artifact.storage_path,
        artifact.file_name,
        300
      );
      const partPath = info.chunkPaths[chunkIndex];
      if (!partPath) {
        return NextResponse.json({ error: 'Chunk index out of bounds.' }, { status: 404 });
      }
      const sliceBuf = await dbStore.readStorageByteRange(partPath, start, end);
      return new Response(new Uint8Array(sliceBuf), {
        status: 200,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(sliceBuf.byteLength),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    const sliceBuf = await dbStore.readStorageByteRange(artifact.storage_path, start, end);
    return new Response(new Uint8Array(sliceBuf), {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(sliceBuf.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const prepareDownloadPayload = async (
    targetArtifact: BuildArtifactRecord
  ): Promise<
    | {
        chunked: true;
        signedUrl: string;
        chunkUrls: string[];
        chunkSizes: number[];
      }
    | {
        chunked: false;
        signedUrl: string;
      }
  > => {
    const isChunked =
      targetArtifact.storage_bucket === APK_CHUNKED_BUCKET ||
      targetArtifact.storage_path.endsWith('.manifest');
    if (isChunked) {
      const { chunkUrls, chunkSizes } = await dbStore.createChunkedArtifactSignedUrls(
        targetArtifact.storage_path,
        targetArtifact.file_name,
        900
      );
      return {
        chunked: true,
        signedUrl: chunkUrls[0],
        chunkUrls,
        chunkSizes,
      };
    }
    const signedUrl = await dbStore.createArtifactSignedUrl(
      targetArtifact.storage_path,
      targetArtifact.file_name,
      300
    );
    return {
      chunked: false,
      signedUrl,
    };
  };

  if (getStoreMode() === 'supabase' && !proxy) {
    let prepared: Awaited<ReturnType<typeof prepareDownloadPayload>>;
    try {
      prepared = await prepareDownloadPayload(artifact);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('ARTIFACT_OBJECTS_MISSING')) {
        // Self-heal automatically from GitHub Actions artifact if storage chunks were lost or incomplete
        const recovered = await recoverBuildArtifactFromGitHub(
          session.userId,
          job.id
        ).catch(() => null);
        if (!recovered) {
          return NextResponse.json(
            {
              error:
                'Stored APK parts were missing or corrupted and could not be recovered from GitHub Actions. Please trigger a rebuild.',
            },
            { status: 410 }
          );
        }
        artifact = recovered;
        prepared = await prepareDownloadPayload(artifact);
      } else {
        throw err;
      }
    }

    await dbStore.incrementArtifactDownload(artifact.id, artifact.download_count);

    if (format === 'json') {
      return NextResponse.json({
        ...prepared,
        fileName: artifact.file_name,
        sizeBytes: artifact.size_bytes,
        sha256: artifact.sha256,
        expiresInSeconds: prepared.chunked ? 900 : 300,
      });
    }

    if (prepared.chunked) {
      const accept = request.headers.get('accept') || '';
      if (accept.includes('text/html')) {
        return NextResponse.redirect(
          new URL(`/builds/${job.id}/download?autodownload=1`, url.origin),
          302
        );
      }
      const stream = await dbStore.streamChunkedApk(artifact.storage_path);
      return new Response(stream, {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.android.package-archive',
          'Content-Disposition': `attachment; filename="${artifact.file_name.replace(/"/g, '')}"`,
          'Content-Length': String(artifact.size_bytes),
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    }

    return NextResponse.redirect(prepared.signedUrl, 302);
  }

  await dbStore.incrementArtifactDownload(artifact.id, artifact.download_count);

  // Stream verified APK directly when proxy=1 or in sandbox local mode
  if (format === 'json') {
    return NextResponse.json({
      chunked: false,
      signedUrl: `/api/builds/${job.id}/download?proxy=1`,
      fileName: artifact.file_name,
      sizeBytes: artifact.size_bytes,
      sha256: artifact.sha256,
      expiresInSeconds: 180,
    });
  }

  const apkBuffer = await dbStore.downloadApkBinary(artifact.storage_path, artifact.storage_bucket);
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
