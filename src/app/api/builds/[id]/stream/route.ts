import { syncBuildJobWithGitHub } from '@/lib/builds/sync-engine';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { id } = await context.params;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const sendEvent = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      const abortHandler = () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed
        }
      };
      request.signal.addEventListener('abort', abortHandler);

      try {
        for (let tick = 0; tick < 60; tick++) {
          if (closed) break;
          const result = await syncBuildJobWithGitHub(session.userId, id);
          sendEvent('update', {
            build: result.job,
            logs: result.logs,
            artifact: result.artifact,
          });

          if (['succeeded', 'failed', 'cancelled', 'timed_out'].includes(result.job.status)) {
            sendEvent('done', { status: result.job.status });
            break;
          }

          if (tick === 59) {
            sendEvent('reconnect', { reason: 'window_limit' });
            break;
          }

          await new Promise((resolve) => setTimeout(resolve, 4000));
        }
      } catch (err) {
        sendEvent('error', {
          message: err instanceof Error ? err.message : 'Stream sync failed',
        });
      } finally {
        request.signal.removeEventListener('abort', abortHandler);
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
