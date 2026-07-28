import type { Env } from "./types";

// Fake origin for Cache API keys — Cache API keys off a Request's URL, not
// an arbitrary string, so this just gives every cache entry a stable,
// never-dereferenced address to hang off of.
const CACHE_KEY_ORIGIN = "https://internal-cache.project05.workers.dev/";

// Read-through cache for expensive aggregate endpoints (Platform Analysis,
// Action Center, Analytics, Performance, etc. — see call sites). Source
// data only changes on sync (roughly hourly), so a short TTL cuts repeat-
// load cost with negligible staleness risk — a dashboard refresh within
// the TTL window sees the same numbers it would have anyway.
//
// Backed by Workers' built-in Cache API (`caches.default`), not KV. This
// used to be KV-backed, but KV's 1,000-writes/day cap is account-wide, not
// per-namespace — as more endpoints got cached this quota started getting
// exhausted by cache traffic alone, which then made unrelated KV writes
// (like Configuration's "Save & Sync" bearer-token save) fail with "KV
// put() limit exceeded for the day" (confirmed live 2026-07-28). Cache API
// has no such quota, so cache traffic can never again block a real write.
// Tradeoff: Cache API is per-colo, not globally consistent like KV — a
// cache miss can happen again at a different edge location within the TTL
// window instead of always hitting a shared value. That's fine here: the
// worst case is an extra query run once per colo, not incorrect data.
const DEFAULT_TTL_SECONDS = 120;

export async function cachedJson<T>(
  env: Env,
  key: string,
  compute: () => Promise<T>,
  ttlSeconds: number = DEFAULT_TTL_SECONDS
): Promise<T> {
  const cache = caches.default;
  const cacheKey = new Request(CACHE_KEY_ORIGIN + encodeURIComponent(key));
  const cached = await cache.match(cacheKey);
  if (cached) {
    return (await cached.json()) as T;
  }
  const value = await compute();
  await cache.put(
    cacheKey,
    new Response(JSON.stringify(value), {
      headers: { "Cache-Control": `max-age=${ttlSeconds}`, "Content-Type": "application/json" },
    })
  );
  return value;
}
