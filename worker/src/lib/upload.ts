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

  // Determine insert vs update by checking which user_ids already exist,
  // so the summary reports accurate counts (not just "upserted").
  const existingIds = new Set<number>();
  const CHECK_BATCH = 100;
  const userIds = mapped.map((m) => m.user_id);
  for (let i = 0; i < userIds.length; i += CHECK_BATCH) {
    const slice = userIds.slice(i, i + CHECK_BATCH);
    if (slice.length === 0) continue;
    const placeholders = slice.map(() => "?").join(",");
    const res = await env.master_db
      .prepare(`SELECT user_id FROM users WHERE user_id IN (${placeholders})`)
      .bind(...slice)
      .all<{ user_id: number }>();
    for (const r of res.results) existingIds.add(r.user_id);
  }

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

  const WRITE_BATCH = 50;
  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < statements.length; i += WRITE_BATCH) {
    const slice = statements.slice(i, i + WRITE_BATCH);
    try {
      await env.master_db.batch(slice);
      for (const m of mapped.slice(i, i + WRITE_BATCH)) {
        if (existingIds.has(m.user_id)) updated++;
        else inserted++;
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      for (const m of mapped.slice(i, i + WRITE_BATCH)) {
        failedRows.push({ sheet: "batch", rowIndex: m.user_id, reason });
      }
    }
  }

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
