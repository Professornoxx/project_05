import type { Env, SourceName } from "./types";
import { extractCommonFields, extractUserProfileFields, type ParsedRow } from "./excelParse";

// "Settled" definition shared by every caller that needs to know whether a
// deposit/withdrawal row should count toward a user's lifetime total — kept
// in sync by hand with etl/sync_engine.py's _is_complete (the Python ETL
// this TS path mirrors): deposits use the text status 'COMPLETE';
// withdrawals use numeric status 2 (0=review, 1=processing, 2=complete,
// 3=rejected, 4=failed).
export function isMasterAggregateComplete(table: "deposits" | "withdrawals", status: string | null): boolean {
  if (table === "deposits") return status === "COMPLETE";
  if (table === "withdrawals") {
    const n = Number(status);
    return !Number.isNaN(n) && n === 2;
  }
  return false;
}

// Applies pre-computed per-user net deltas (from write-chunk's before/after
// status comparison — see that handler's comment) to users.total_deposit /
// deposit_count (or total_withdrawal) via INCREMENT, never replace.
//
// This replaces a prior version that recomputed SUM(amount)/COUNT(*) over
// the whole daily_records_db table for each touched user and overwrote the
// column outright. That had two live bugs, confirmed against production
// data 2026-07-25 (199 users, ~Rs 6.4L in phantom totals): (1) no status
// filter, so PROCESS/FAILED/rejected rows counted toward "lifetime deposit"
// exactly like COMPLETE ones; (2) daily_records_db only retains a rolling
// ~35-day window, so recomputing from it also silently discarded any
// history older than that on every run — the exact regression
// etl/sync_engine.py's own comments describe deliberately avoiding when the
// Python ETL was redesigned around delta-tracking; this TS fallback path
// was never updated to match.
export async function applyMasterAggregateDeltas(
  env: Env,
  table: "deposits" | "withdrawals",
  deltas: Record<number, { amount: number; count: number }>
): Promise<number> {
  const entries = Object.entries(deltas).filter(([, d]) => d.amount !== 0 || d.count !== 0);
  if (entries.length === 0) return 0;

  const column = table === "deposits" ? "total_deposit" : "total_withdrawal";
  const countColumn = table === "deposits" ? "deposit_count" : null;
  const now = new Date().toISOString();

  const CHUNK = 100;
  let updated = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const statements = chunk.map(([userId, d]) => {
      const setClause = countColumn
        ? `${column} = COALESCE(${column}, 0) + ?, ${countColumn} = COALESCE(${countColumn}, 0) + ?, update_time = ?`
        : `${column} = COALESCE(${column}, 0) + ?, update_time = ?`;
      const binds = countColumn ? [d.amount, d.count, now, Number(userId)] : [d.amount, now, Number(userId)];
      return env.daily_records_db.prepare(`UPDATE users SET ${setClause} WHERE user_id = ?`).bind(...binds);
    });
    await env.daily_records_db.batch(statements);
    updated += statements.length;
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
