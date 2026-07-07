import type { Env } from "./types";

const RETENTION_DAYS = 35;

// Every table in the Daily Records DB (deposits, withdrawals, wallet_details,
// sync_runs) is a rolling 35-day window, not permanent storage — that's the
// whole point of splitting it from the Master DB. Each table archives to R2
// (when available) before deleting, same optional-R2 pattern as upload.ts:
// if R2 isn't enabled yet, cleanup still runs, it just skips the archive.
const TABLES: { name: string; dateColumn: string }[] = [
  { name: "sync_runs", dateColumn: "started_at" },
  { name: "deposits", dateColumn: "synced_at" },
  { name: "withdrawals", dateColumn: "synced_at" },
  { name: "wallet_details", dateColumn: "synced_at" },
];

export async function cleanupOldSyncRuns(env: Env): Promise<{ archived: number; deleted: number; perTable: Record<string, number> }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const perTable: Record<string, number> = {};
  let archived = 0;
  let deleted = 0;

  for (const { name, dateColumn } of TABLES) {
    const old = await env.daily_records_db
      .prepare(`SELECT * FROM ${name} WHERE ${dateColumn} < ?`)
      .bind(cutoff)
      .all();

    perTable[name] = old.results.length;
    if (old.results.length === 0) continue;

    if (env.UPLOADS) {
      const key = `archived-logs/${name}-${new Date().toISOString().slice(0, 10)}.json`;
      try {
        await env.UPLOADS.put(key, JSON.stringify(old.results));
        archived += old.results.length;
      } catch (err) {
        console.error(`Archive to R2 failed for ${name} (non-fatal, proceeding with delete):`, err);
      }
    }

    await env.daily_records_db.prepare(`DELETE FROM ${name} WHERE ${dateColumn} < ?`).bind(cutoff).run();
    deleted += old.results.length;
  }

  return { archived, deleted, perTable };
}
