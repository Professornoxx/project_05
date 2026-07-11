import type { Env } from "./types";

const CACHE_KEY_PREFIX = "cache:";

// Read-through cache for expensive aggregate endpoints (currently just
// /api/dashboard/performance, which runs ~8 grouped SQL queries per
// request). Source data only changes on sync (roughly hourly), so a short
// TTL cuts repeat-load cost with negligible staleness risk — a dashboard
// refresh within the TTL window sees the same numbers it would have anyway.
// KV enforces a 60s minimum TTL, so this can't be tuned below that.
const DEFAULT_TTL_SECONDS = 120;

export async function cachedJson<T>(
  env: Env,
  key: string,
  compute: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<T> {
  const cacheKey = CACHE_KEY_PREFIX + key;
  const cached = await env.SYNC_KV.get(cacheKey);
  if (cached !== null) {
    return JSON.parse(cached) as T;
  }
  const value = await compute();
  await env.SYNC_KV.put(cacheKey, JSON.stringify(value), { expirationTtl: ttlSeconds });
  return value;
}
