import type { Env, SourceName } from "./types";
import { extractCommonFields, extractUserProfileFields, type ParsedRow } from "./excelParse";

// After the Daily Records DB is updated, refresh the affected users' summary
// columns in the Master DB (total_deposit, total_withdrawal, deposit_count).
// D1 has no cross-database joins, so this reads aggregates from
// daily_records_db and writes them into master_db in two separate steps.
// Scoped to only the user_ids touched by this sync (not a full-table
// re-aggregation) to keep this cheap regardless of how large the tables get.
export async function updateMasterAggregatesForUsers(
  env: Env,
  table: "deposits" | "withdrawals",
  userIds: number[]
): Promise<number> {
  const uniqueIds = [...new Set(userIds.filter((id) => Number.isFinite(id)))];
  if (uniqueIds.length === 0) return 0;

  const column = table === "deposits" ? "total_deposit" : "total_withdrawal";
  const countColumn = table === "deposits" ? "deposit_count" : null;

  // Chunk to stay well under D1's practical bound-parameter ceiling for a
  // single IN clause (same lesson learned in upsert.ts: keep this small).
  const CHUNK = 100;
  let updated = 0;

  for (let i = 0; i < uniqueIds.length; i += CHUNK) {
    const chunk = uniqueIds.slice(i, i + CHUNK);
    const placeholders = chunk.map(() => "?").join(",");
    const sums = await env.daily_records_db
      .prepare(
        `SELECT user_id, SUM(amount) as total, COUNT(*) as cnt FROM ${table}
         WHERE user_id IN (${placeholders}) GROUP BY user_id`
      )
      .bind(...chunk)
      .all<{ user_id: number; total: number; cnt: number }>();

    const statements = sums.results.map((row) => {
      const setClause = countColumn
        ? `${column} = ?, ${countColumn} = ?, update_time = ?`
        : `${column} = ?, update_time = ?`;
      const binds = countColumn
        ? [row.total, row.cnt, new Date().toISOString(), row.user_id]
        : [row.total, new Date().toISOString(), row.user_id];
      return env.daily_records_db
        .prepare(`UPDATE users SET ${setClause} WHERE user_id = ?`)
        .bind(...binds);
    });

    if (statements.length > 0) {
      await env.daily_records_db.batch(statements);
      updated += statements.length;
    }
  }

  return updated;
}

// TS mirror of etl/sync_engine.py's collect_profile_updates +
// update_master_profiles — see that file's comment for the full reasoning
// (no dedicated user-list export exists; city/create_time/totals are
// deliberately excluded). This is what makes the Configuration page's
// "Save & Sync" button also refresh master_db.users, not just
// daily_records_db — previously only the GitHub Actions Python ETL did
// this. COALESCE(excluded.col, users.col) on conflict means a field this
// batch didn't observe leaves the existing value alone instead of
// blanking it out.
export async function updateMasterProfilesForUsers(
  env: Env,
  rows: ParsedRow[],
  source: Exclude<SourceName, "manual_upload">
): Promise<number> {
  type ProfileEntry = { phone: string | null; mark: string | null; member_level: number | string | null; wallet_balance: number | null; _walletBalanceTime: string | null };
  const updates = new Map<number, ProfileEntry>();

  for (const { row } of rows) {
    const common = extractCommonFields(row);
    if (common.user_id === null) continue;
    const uid = Number(common.user_id);
    if (!Number.isFinite(uid)) continue;

    const profile = extractUserProfileFields(row);
    const entry = updates.get(uid) ?? { phone: null, mark: null, member_level: null, wallet_balance: null, _walletBalanceTime: null };
    if (profile.phone !== null) entry.phone = profile.phone;
    if (profile.mark !== null) entry.mark = profile.mark;
    if (profile.member_level !== null) entry.member_level = profile.member_level;
    if (source === "wallet" && profile.wallet_balance !== null) {
      const rowTime = common.create_time;
      if (rowTime && (entry._walletBalanceTime === null || rowTime > entry._walletBalanceTime)) {
        entry.wallet_balance = profile.wallet_balance;
        entry._walletBalanceTime = rowTime;
      }
    }
    updates.set(uid, entry);
  }

  if (updates.size === 0) return 0;

  const now = new Date().toISOString();
  const entries = [...updates.entries()];
  const CHUNK = 90;
  let written = 0;

  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const statements = chunk.map(([uid, fields]) =>
      env.daily_records_db
        .prepare(
          `INSERT INTO users (user_id, phone, mark, member_level, user_balance, update_time)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             phone = COALESCE(excluded.phone, users.phone),
             mark = COALESCE(excluded.mark, users.mark),
             member_level = COALESCE(excluded.member_level, users.member_level),
             user_balance = COALESCE(excluded.user_balance, users.user_balance),
             update_time = excluded.update_time`
        )
        .bind(uid, fields.phone, fields.mark, fields.member_level, fields.wallet_balance, now)
    );
    await env.daily_records_db.batch(statements);
    written += statements.length;
  }

  return written;
}
