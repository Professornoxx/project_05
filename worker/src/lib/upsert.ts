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

  // Find which of these keys are NOT already in the DB — this is the
  // "missing records" count the sync log reports.
  const existing = new Set<string>();
  const BATCH = 100;
  for (let i = 0; i < keys.length; i += BATCH) {
    const slice = keys.slice(i, i + BATCH);
    const placeholders = slice.map(() => "?").join(",");
    const res = await env.master_db
      .prepare(`SELECT record_key FROM ${table} WHERE record_key IN (${placeholders})`)
      .bind(...slice)
      .all<{ record_key: string }>();
    for (const r of res.results) existing.add(r.record_key);
  }
  const missingBefore = keys.length - existing.size;

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

  // batch() runs all statements as a single transaction — either every row
  // in this sync lands, or none do, so a mid-sync failure can't leave the
  // table with only some of the batch written.
  for (let i = 0; i < statements.length; i += BATCH) {
    await env.master_db.batch(statements.slice(i, i + BATCH));
  }

  return { fetched: rows.length, missingBefore, upserted: rows.length };
}

export function tableForSource(source: Exclude<SourceName, "manual_upload">): string {
  return TABLE_BY_SOURCE[source];
}
