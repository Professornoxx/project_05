import type { Env, SourceName } from "./types";
import { recordKey, extractCommonFields, type ParsedRow } from "./excelParse";

const TABLE_BY_SOURCE: Record<Exclude<SourceName, "manual_upload">, string> = {
  deposit: "deposits",
  withdraw: "withdrawals",
  wallet: "wallet_details",
};

export interface ChunkRow {
  record_key: string;
  user_id: number | null;
  amount: number | null;
  status: string | null;
  create_time: string | null;
}

// Row count and subrequest budgets, both tuned against Cloudflare's Workers
// free-plan limits:
//   - CHUNK_SIZE=150: proven safe as a single D1 .batch() write size (see
//     upsert.ts history — larger sizes intermittently hit D1's "too many
//     SQL variables" error in ways that don't scale predictably; this is a
//     D1-side limit, independent of the chunking technique, so raising
//     CHUNK_SIZE isn't safe without re-testing against real D1 data).
//   - MAX_CHUNKS=45: the free-plan subrequest cap is ~50 per invocation, and
//     this same sync also spends 2 of those on the count-before/count-after
//     queries — 45+2=47 leaves a small safety margin rather than sitting
//     exactly at the wall.
// Together that's a firm ceiling of 6,750 rows per sync for a source using
// this path — the practical maximum this technique can reach given both
// constraints. It does not help wallet (~100,000 rows/day); nothing short
// of a different approach (R2 archive, or a paid plan removing the CPU
// limit that made chunking necessary at all) closes that gap.
const CHUNK_SIZE = 150;
const MAX_CHUNKS = 45;
const MAX_ROWS = CHUNK_SIZE * MAX_CHUNKS;

// Each chunk is dispatched as a self-fetch subrequest to this same Worker's
// /internal/write-chunk route. That's a genuinely separate Workers
// invocation with its own fresh CPU-time budget — the free-plan-compatible
// way to do more total work than one invocation's CPU limit allows, since
// parsing+binding cost is spread across many small invocations instead of
// piling into one that gets killed by "Worker exceeded CPU time limit."
export async function upsertRowsChunked(
  table: string,
  rows: ParsedRow[],
  env: Env
): Promise<{ fetched: number; missingBefore: number; upserted: number; userIds: number[] }> {
  if (rows.length === 0) return { fetched: 0, missingBefore: 0, upserted: 0, userIds: [] };

  if (rows.length > MAX_ROWS) {
    throw new Error(
      `${table}: ${rows.length} rows exceeds the ${MAX_ROWS}-row chunked-write ceiling ` +
        `(${MAX_CHUNKS} chunks x ${CHUNK_SIZE} rows, bounded by the free-plan subrequest limit). ` +
        `Volume has grown past what this technique can cover in one sync.`
    );
  }

  const countBefore = await env.daily_records_db
    .prepare(`SELECT COUNT(*) as c FROM ${table}`)
    .first<{ c: number }>();

  const now = new Date().toISOString();
  const chunkRows: ChunkRow[] = await Promise.all(
    rows.map(async (r) => {
      const common = extractCommonFields(r.row);
      return {
        record_key: await recordKey(r.row),
        user_id: common.user_id,
        amount: common.amount,
        status: common.status,
        create_time: common.create_time,
      };
    })
  );

  const chunks: ChunkRow[][] = [];
  for (let i = 0; i < chunkRows.length; i += CHUNK_SIZE) {
    chunks.push(chunkRows.slice(i, i + CHUNK_SIZE));
  }

  // Dispatched with Promise.all (not sequential ctx.waitUntil-and-forget):
  // we need every chunk's outcome before computing countAfter and deciding
  // the overall sync_runs status, and awaiting them concurrently keeps this
  // fast without affecting the subrequest count either way.
  const results = await Promise.allSettled(
    chunks.map((chunk) =>
      fetch(`${env.SELF_URL}/internal/write-chunk`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-internal-secret": env.INTERNAL_SECRET,
        },
        body: JSON.stringify({ table, rows: chunk, synced_at: now }),
      })
    )
  );

  const failures: string[] = [];
  let chunksWritten = 0;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === "rejected") {
      failures.push(`chunk ${i}: ${result.reason}`);
      continue;
    }
    if (!result.value.ok) {
      const body = await result.value.text();
      failures.push(`chunk ${i}: HTTP ${result.value.status} ${body.slice(0, 200)}`);
      continue;
    }
    chunksWritten++;
  }

  if (failures.length > 0) {
    throw new Error(`${chunksWritten}/${chunks.length} chunks written; failures: ${failures.join(" | ")}`);
  }

  const countAfter = await env.daily_records_db
    .prepare(`SELECT COUNT(*) as c FROM ${table}`)
    .first<{ c: number }>();
  const missingBefore = (countAfter?.c ?? 0) - (countBefore?.c ?? 0);

  const userIds = chunkRows
    .map((r) => Number(r.user_id))
    .filter((id) => Number.isFinite(id));

  return { fetched: rows.length, missingBefore, upserted: rows.length, userIds };
}

export function tableForSource(source: Exclude<SourceName, "manual_upload">): string {
  return TABLE_BY_SOURCE[source];
}
