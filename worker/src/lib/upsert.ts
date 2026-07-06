import type { Env, SourceName } from "./types";
import { recordKey, extractCommonFields, type ParsedRow } from "./excelParse";

const TABLE_BY_SOURCE: Record<Exclude<SourceName, "manual_upload">, string> = {
  deposit: "deposits",
  withdraw: "withdrawals",
  wallet: "wallet_details",
};

// Upserts every parsed row into the given table, deduplicated by record_key.
// Uses ON CONFLICT DO UPDATE so records that already exist get refreshed
// (status changes, amount corrections) instead of being silently skipped —
// this is what "compare with existing DB, detect missing/incomplete" means
// in practice: anything not already present or out of date gets written.
export async function upsertRows(
  table: string,
  rows: ParsedRow[],
  env: Env
): Promise<{ fetched: number; missingBefore: number; upserted: number }> {
  if (rows.length === 0) return { fetched: 0, missingBefore: 0, upserted: 0 };

  const keys = await Promise.all(rows.map((r) => recordKey(r.row)));

  // "Missing before" is derived from a total-row-count delta (before vs.
  // after the upsert), not a per-key existence check. Two earlier attempts
  // failed at scale: checking existence with an IN clause per row hit
  // Cloudflare's Workers subrequest limit (50/request on Free) when batched
  // small, and hit D1's bound-SQL-variable limit ("too many SQL variables")
  // when batched large. A row can only ever be a fresh INSERT or an existing
  // UPDATE via ON CONFLICT — updates never change the table's total row
  // count, so (count_after - count_before) is exactly the number of new
  // records, with just 2 subrequests total regardless of dataset size.
  const countBefore = await env.master_db
    .prepare(`SELECT COUNT(*) as c FROM ${table}`)
    .first<{ c: number }>();

  const now = new Date().toISOString();
  const statements = rows.map((r, i) => {
    const key = keys[i];
    const common = extractCommonFields(r.row);
    return env.master_db
      .prepare(
        `INSERT INTO ${table} (record_key, user_id, amount, status, create_time, raw_json, synced_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(record_key) DO UPDATE SET
           user_id = excluded.user_id,
           amount = excluded.amount,
           status = excluded.status,
           create_time = excluded.create_time,
           raw_json = excluded.raw_json,
           synced_at = excluded.synced_at`
      )
      .bind(
        key,
        common.user_id,
        common.amount,
        common.status,
        common.create_time,
        JSON.stringify(r.row),
        now
      );
  });

  // Each .batch() call is one subrequest regardless of how many statements
  // it contains, and runs them as one transaction — either every row in
  // this chunk lands, or none do. 150 is empirically proven against real
  // D1 data (5,591-row deposit sync and 909-row withdraw sync both
  // succeeded at this size); larger sizes (500+) intermittently hit a D1
  // "too many SQL variables" error whose actual threshold doesn't match
  // D1's documented 100-params-per-statement limit and isn't purely a
  // function of batch size — don't raise this without testing against
  // real D1 data first.
  const WRITE_BATCH = 150;
  for (let i = 0; i < statements.length; i += WRITE_BATCH) {
    try {
      await env.master_db.batch(statements.slice(i, i + WRITE_BATCH));
    } catch (err) {
      const failingKeys = keys.slice(i, i + WRITE_BATCH);
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`upsert failed at batch offset ${i} (keys: ${failingKeys.join(", ")}): ${message}`);
    }
  }

  const countAfter = await env.master_db
    .prepare(`SELECT COUNT(*) as c FROM ${table}`)
    .first<{ c: number }>();
  const missingBefore = (countAfter?.c ?? 0) - (countBefore?.c ?? 0);

  return { fetched: rows.length, missingBefore, upserted: rows.length };
}

export function tableForSource(source: Exclude<SourceName, "manual_upload">): string {
  return TABLE_BY_SOURCE[source];
}
