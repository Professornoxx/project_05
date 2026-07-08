-- Daily Records DB: the hourly download output (deposit/withdrawal/wallet)
-- plus the sync activity log. All rows here are subject to the 35-day
-- retention cleanup (daily cron), separately from the permanent Master DB.
--
-- raw_json is nullable and deliberately left unpopulated on the write path
-- (see upsert.ts) — JSON-serializing the full ~35-column source row on
-- every single record was the single largest CPU cost in each sync, and
-- the fields that matter (user_id, amount, status, create_time) already
-- have dedicated columns. The column stays in the schema in case a future
-- need for the full raw row resurfaces.
CREATE TABLE IF NOT EXISTS sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,           -- 'wallet' | 'withdrawal' | 'deposit' | 'manual_upload'
  started_at TEXT NOT NULL,
  finished_at TEXT,
  status TEXT NOT NULL,           -- 'success' | 'failed' | 'running'
  rows_upserted INTEGER DEFAULT 0,
  error_message TEXT
);
CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON sync_runs(started_at);

CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_key TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  amount REAL,
  status TEXT,
  create_time TEXT,
  channel TEXT,       -- e.g. "Pay Center-coinsPay" — for Deposit Channel Analysis
  result_time TEXT,   -- when the order actually completed (vs. create_time = initiated)
  raw_json TEXT,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_create_time ON deposits(create_time);
CREATE INDEX IF NOT EXISTS idx_deposits_channel ON deposits(channel);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_key TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  amount REAL,
  status TEXT,
  create_time TEXT,
  raw_json TEXT,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_create_time ON withdrawals(create_time);

CREATE TABLE IF NOT EXISTS wallet_details (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_key TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  amount REAL,
  status TEXT,
  create_time TEXT,
  raw_json TEXT,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallet_details_user ON wallet_details(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_details_create_time ON wallet_details(create_time);
