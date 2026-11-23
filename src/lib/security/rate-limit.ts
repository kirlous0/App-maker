import { dbStore } from '@/lib/db';

export async function enforceRateLimit(
  userId: string,
  action: string,
  maxEvents: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const recent = await dbStore.countRecentRateLimitEvents(userId, action, windowSeconds);
  if (recent >= maxEvents) {
    return { allowed: false, retryAfterSeconds: windowSeconds };
  }
  await dbStore.recordRateLimitEvent(userId, action);
  return { allowed: true, retryAfterSeconds: 0 };
}

export async function enforceBuildConcurrencyLimit(userId: string): Promise<{
  allowed: boolean;
  activeCount: number;
  maxConcurrent: number;
}> {
  const maxConcurrent = parseInt(process.env.MAX_CONCURRENT_BUILDS_PER_USER || '2', 10) || 2;
  const activeCount = await dbStore.countActiveUserBuilds(userId);
  return {
    allowed: activeCount < maxConcurrent,
    activeCount,
    maxConcurrent,
  };
}
