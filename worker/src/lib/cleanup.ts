import type { Env } from "./types";

const RETENTION_DAYS = 35;

// wallet_details gets its own much shorter retention — it hit D1's 500MB
// size cap twice now (2026-07-26, then again 2026-08-08 with
// wallet_details at 2,073,708 rows / ~450MB of ~477MB total, still sitting
// right at the then-15-day boundary) because it stores every individual
// bet/bonus event, scaling with total bet COUNT rather than with
// (users x games). The 2026-08-08 fix moved Game Activity's "15days"
// period (Top Games/Highest Bet/Roller Active) onto wallet_daily_agg, the
// same rollup "month" already used — see the gameplaySource/gameplayBlock
// comments in index.ts. That leaves day/week as the only periods still on
// raw wallet_details, and those only ever need 7 days back
// (addDaysGA(anchorDate, -6), inclusive of anchorDate) — plus Search
// User's 2/7-day gameplay panels and Suspicious Withdrawals' 3-day games
// count, all comfortably under 7. Bonus Claims never had a 15days period
// (day/week/month only), so it was unaffected either way.
const WALLET_DETAILS_RETENTION_DAYS = 7;
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
