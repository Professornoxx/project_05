import type { Env } from "./types";

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
      return env.master_db
        .prepare(`UPDATE users SET ${setClause} WHERE user_id = ?`)
        .bind(...binds);
    });

    if (statements.length > 0) {
      await env.master_db.batch(statements);
      updated += statements.length;
    }
  }

  return updated;
}
