import type { Env } from "./types";
import { parseAllSheets } from "./excelParse";
import { mapRowToUser, USER_UPDATE_COLUMNS } from "./userColumns";

export interface UploadSummary {
  sheetsRead: number;
  totalRowsProcessed: number;
  inserted: number;
  updated: number;
  failed: number;
  failedRows: Array<{ sheet: string; rowIndex: number; reason: string }>;
}

// Handles a manually-uploaded master-file replacement that may contain
// multiple worksheets. Every sheet is parsed and every row merged into one
// full-column upsert against `users`, keyed on user_id:
//   - user_id exists      -> UPDATE every column from the uploaded row
//   - user_id is new      -> INSERT it
//   - no valid user_id    -> counted as a failed row, sync continues
// ON CONFLICT(user_id) DO UPDATE guarantees no duplicate rows are ever
// created, regardless of how many times the same user_id appears across
// sheets or across repeated uploads.
export async function handleMasterUpload(file: ArrayBuffer, env: Env, filename: string): Promise<UploadSummary> {
  if (env.UPLOADS) {
    await env.UPLOADS.put(`uploads/${Date.now()}-${filename}`, file).catch((err) =>
      console.error("R2 archive failed (non-fatal):", err)
    );
  }

  const parsedRows = parseAllSheets(file);
  const sheetsRead = new Set(parsedRows.map((r) => r.sheetName)).size;

  const startedAt = new Date().toISOString();
  const failedRows: UploadSummary["failedRows"] = [];
  const mapped: { user_id: number; values: Record<string, string | number | null> }[] = [];

  parsedRows.forEach(({ sheetName, row }, i) => {
    const result = mapRowToUser(row);
    if (result === null) {
      failedRows.push({ sheet: sheetName, rowIndex: i, reason: "missing or invalid user_id" });
      return;
    }
    mapped.push(result);
  });

  // Inserted vs. updated is derived from a total-row-count delta, not a
  // per-user_id existence check. Checking existence with an IN clause per
  // row hit two different Cloudflare/D1 limits at this scale (55k+ rows):
  // the Workers subrequest cap when batched small, and D1's bound-SQL-
  // variable limit ("too many SQL variables") when batched large. Since
  // ON CONFLICT DO UPDATE never changes the table's total row count,
  // (count_after - count_before) is exactly the number of new inserts —
  // 2 subrequests total regardless of dataset size.
  const countBefore = await env.master_db
    .prepare(`SELECT COUNT(*) as c FROM users`)
    .first<{ c: number }>();

  const now = new Date().toISOString();
  const setClause = USER_UPDATE_COLUMNS.map(
    // COALESCE keeps the existing value when this upload's row didn't carry
    // that column (partial sheet), instead of nulling out real data.
    (col) => `${col} = COALESCE(excluded.${col}, users.${col})`
  ).join(", ");
  const insertColumns = ["user_id", ...USER_UPDATE_COLUMNS];
  const placeholders = insertColumns.map(() => "?").join(",");

  const statements = mapped.map((m) => {
    const bindValues = insertColumns.map((col) =>
      col === "user_id" ? m.user_id : col === "update_time" ? now : m.values[col] ?? null
    );
    return env.master_db
      .prepare(
        `INSERT INTO users (${insertColumns.join(",")}) VALUES (${placeholders})
         ON CONFLICT(user_id) DO UPDATE SET ${setClause}`
      )
      .bind(...bindValues);
  });

  // 150 statements at 7 bound params each (1050 total) is confirmed working
  // against real D1 (deposits sync, 5,591 rows). The `users` table binds 56
  // params/row, ~8x more per statement, so this is scaled down proportionally.
  // D1's real limit here doesn't match its documented "100 params/statement"
  // figure and isn't simply a total-variable-count either — larger batches
  // fail with "too many SQL variables" in ways that don't scale predictably,
  // so don't raise this without testing against real D1 data first.
  const WRITE_BATCH = 20;
  let successfullyWritten = 0;
  for (let i = 0; i < statements.length; i += WRITE_BATCH) {
    const slice = statements.slice(i, i + WRITE_BATCH);
    try {
      await env.master_db.batch(slice);
      successfullyWritten += slice.length;
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      for (const m of mapped.slice(i, i + WRITE_BATCH)) {
        failedRows.push({ sheet: "batch", rowIndex: m.user_id, reason });
      }
    }
  }

  const countAfter = await env.master_db
    .prepare(`SELECT COUNT(*) as c FROM users`)
    .first<{ c: number }>();
  const inserted = (countAfter?.c ?? 0) - (countBefore?.c ?? 0);
  const updated = successfullyWritten - inserted;

  const summary: UploadSummary = {
    sheetsRead,
    totalRowsProcessed: parsedRows.length,
    inserted,
    updated,
    failed: failedRows.length,
    failedRows,
  };

  await env.master_db
    .prepare(
      `INSERT INTO sync_runs (source, started_at, finished_at, status, rows_upserted, error_message)
       VALUES ('manual_upload', ?, ?, ?, ?, ?)`
    )
    .bind(
      startedAt,
      new Date().toISOString(),
      failedRows.length > 0 && inserted + updated === 0 ? "failed" : "success",
      inserted + updated,
      failedRows.length > 0 ? `${failedRows.length} row(s) failed` : null
    )
    .run();

  return summary;
}
