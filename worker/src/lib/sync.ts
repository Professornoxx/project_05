import type { Env, SourceName, SyncResult } from "./types";
import { fetchExportRows } from "./exportClient";
import { upsertRowsChunked, tableForSource } from "./chunkedUpsert";
import { updateMasterAggregatesForUsers } from "./aggregate";

const SOURCES: Exclude<SourceName, "manual_upload">[] = ["wallet", "deposit", "withdraw"];

async function logRun(
  env: Env,
  source: SourceName,
  startedAt: string,
  result: Partial<SyncResult> & { status: "success" | "failed" }
) {
  await env.daily_records_db
    .prepare(
      `INSERT INTO sync_runs (source, started_at, finished_at, status, rows_upserted, error_message)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(
      source,
      startedAt,
      new Date().toISOString(),
      result.status,
      result.upserted ?? 0,
      result.error ?? null
    )
    .run();
}

// Runs one source end-to-end: fetch last-5-day export -> upsert -> log.
// Each source is isolated in its own try/catch so one failing source
// (network timeout, bad token) never blocks or rolls back the other two.
export async function syncSource(source: Exclude<SourceName, "manual_upload">, env: Env): Promise<SyncResult> {
  const startedAt = new Date().toISOString();
  try {
    const rows = await fetchExportRows(source, env);
    const { fetched, missingBefore, upserted, userIds } = await upsertRowsChunked(tableForSource(source), rows, env);

    // Step 2 of the requested flow: once the Daily Records DB is updated,
    // refresh the Master DB's per-user totals from it. Only deposit/
    // withdraw map to a Master DB aggregate column (total_deposit,
    // total_withdrawal); wallet_details has no equivalent column to refresh
    // yet, so it's skipped here — revisit once that endpoint is unblocked
    // and its field meaning is confirmed.
    if (source === "deposit" || source === "withdraw") {
      const table = source === "deposit" ? "deposits" : "withdrawals";
      await updateMasterAggregatesForUsers(env, table, userIds);
    }

    await logRun(env, source, startedAt, { status: "success", upserted });
    return { source, fetched, missing_found: missingBefore, upserted, status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logRun(env, source, startedAt, { status: "failed", error: message });
    return { source, fetched: 0, missing_found: 0, upserted: 0, status: "failed", error: message };
  }
}

export async function runFullSync(env: Env): Promise<SyncResult[]> {
  // Parallel, not sequential: the real backend has been observed hanging
  // indefinitely on individual sources (25s+ with the new per-request
  // timeout in exportClient.ts). Running sequentially meant one stuck
  // source delayed the other two from even starting — now a hang in
  // "wallet" no longer blocks "deposit"/"withdraw" from completing on time.
  return Promise.all(SOURCES.map((source) => syncSource(source, env)));
}
