import type { Env } from "./types";

const RETENTION_DAYS = 35;

// wallet_details gets its own much shorter retention — it hit D1's 500MB
// size cap at only ~19 days old (2026-07-26 incident) because it stores
// every individual bet/bonus event, scaling with total bet COUNT rather
// than with (users x games). 15 days safely covers everything that still
// needs raw row-level detail (Search User's 2/7-day gameplay panels,
// Suspicious Withdrawals' 3-day games count, the Day/Week/15days tabs on
// Bonus Claims and Game Activity). The Platform Analysis "Month" tab
// (which needs a real 29-day window) no longer depends on raw
// wallet_details at all — it reads wallet_daily_agg instead, a ~90x
// smaller one-row-per-(day,user,game) rollup populated by
// etl/build_reports.py's refresh_daily_agg(), which gets its own longer
// retention below specifically so it can hold that full 29-day window
// (plus buffer) at negligible size cost.
const WALLET_DETAILS_RETENTION_DAYS = 15;
const WALLET_DAILY_AGG_RETENTION_DAYS = 40;

// Every table in the Daily Records DB is a rolling window, not permanent
// storage — that's the whole point of splitting it from the Master DB.
// Each table archives to R2 (when available) before deleting, same
// optional-R2 pattern as upload.ts: if R2 isn't enabled yet, cleanup still
// runs, it just skips the archive.
const TABLES: { name: string; dateColumn: string; retentionDays: number }[] = [
  { name: "sync_runs", dateColumn: "started_at", retentionDays: RETENTION_DAYS },
  { name: "deposits", dateColumn: "synced_at", retentionDays: RETENTION_DAYS },
  { name: "withdrawals", dateColumn: "synced_at", retentionDays: RETENTION_DAYS },
  { name: "wallet_details", dateColumn: "synced_at", retentionDays: WALLET_DETAILS_RETENTION_DAYS },
  // dateColumn is "d" (the calendar day the row summarizes), not
  // synced_at — wallet_daily_agg rows are recomputed in place each run,
  // not append-only, so there's no separate sync timestamp to purge by.
  { name: "wallet_daily_agg", dateColumn: "d", retentionDays: WALLET_DAILY_AGG_RETENTION_DAYS },
];

export async function cleanupOldSyncRuns(env: Env): Promise<{ archived: number; deleted: number; perTable: Record<string, number> }> {
  const perTable: Record<string, number> = {};
  let archived = 0;
  let deleted = 0;

  for (const { name, dateColumn, retentionDays } of TABLES) {
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
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
