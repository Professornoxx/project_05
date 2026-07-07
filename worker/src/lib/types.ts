export interface Env {
  master_db: D1Database; // users only
  daily_records_db: D1Database; // deposits, withdrawals, wallet_details, sync_runs — 35-day retention
  SYNC_KV: KVNamespace;
  UPLOADS?: R2Bucket;
  BEARER_TOKEN: string;
  PACKAGE_ID: string;
  SYNC_WINDOW_DAYS: string;
  DEPOSIT_EXPORT_URL: string;
  WITHDRAW_EXPORT_URL: string;
  WALLET_EXPORT_URL: string;
  ADMIN_API_KEY: string; // Configuration login only
  DASHBOARD_ADMIN_KEY: string; // Dashboard login only — deliberately separate from ADMIN_API_KEY
  SELF_URL: string;
  INTERNAL_SECRET: string;
}

export type SourceName = "wallet" | "deposit" | "withdraw" | "manual_upload";

// Best-effort shape of a row coming back from the export APIs / uploaded sheets.
// Unknown/extra fields are preserved in `raw` so nothing is ever silently dropped.
export interface UserRecord {
  user_id: number;
  [key: string]: unknown;
}

export interface SyncResult {
  source: SourceName;
  fetched: number;
  missing_found: number;
  upserted: number;
  status: "success" | "failed";
  error?: string;
}
