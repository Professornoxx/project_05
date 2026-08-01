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
  channel TEXT,       -- e.g. "Pay Center-coinsPay" — PAYMENT gateway, for Deposit Channel Analysis
  marketing_channel TEXT, -- e.g. "B02", "rupiibet" — acquisition channel, distinct raw "channel"
                           -- header field on the same export row; for Platform Analysis Channel performance
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
  synced_at TEXT NOT NULL,
  channel TEXT,
  review_time TEXT,
  callback_time TEXT,
  payment_order_id TEXT -- vendor's payment-gateway order reference (e.g. "TW..."), distinct from record_key; NULL for status-0 (under review) orders
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
  synced_at TEXT NOT NULL,
  game_name TEXT,
  -- Bonus Claim Report's real filter: a row is a bonus claim only when
  -- game_name is non-blank AND source_name is blank. Real gameplay rows
  -- have both populated (e.g. game_name="Aviator", source_name="OneApi").
  source_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_wallet_details_user ON wallet_details(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_details_create_time ON wallet_details(create_time);
CREATE INDEX IF NOT EXISTS idx_wallet_details_game_name ON wallet_details(game_name);
CREATE INDEX IF NOT EXISTS idx_wallet_details_source_name ON wallet_details(source_name);

-- One row per (day, user, game, is_bonus) instead of one row per bet — the
-- raw wallet_details table hit D1's 500MB size cap at only ~19 days old
-- (2026-07-26 incident) because it stores every individual bet/bonus event;
-- this collapses that down to a daily rollup, at roughly the cardinality of
-- (unique users who played) x (unique games), not (total bets placed) —
-- orders of magnitude smaller. Populated once per day by
-- etl/build_reports.py's refresh_daily_agg() (idempotent full-day
-- recompute from that day's raw wallet_details rows, not a delta), which
-- lets raw wallet_details retention shrink to just what short-window
-- features need (Search User's last-2-days gameplay list, Suspicious
-- Withdrawals' 3-day games count) while the Platform Analysis "Month" tab
-- reports (Bonus Claims, Top Games, Highest Single Bet, Roller Active) read
-- 29 days from THIS table instead of scanning 29 raw days. max_amount/
-- max_amount_time/max_amount_game exist specifically so "Highest Single
-- Bet" stays exactly correct from the rollup — a plain SUM/COUNT can't
-- answer "what was the single largest bet," so that one stat is tracked
-- explicitly per day instead of derived.
CREATE TABLE IF NOT EXISTS wallet_daily_agg (
  d TEXT NOT NULL,               -- calendar day (date(create_time)), not synced_at
  user_id INTEGER NOT NULL,
  game_name TEXT NOT NULL,
  is_bonus INTEGER NOT NULL,     -- 0 = real gameplay (source_name populated), 1 = bonus claim (source_name blank) — same split as the Bonus Claim Report's existing filter
  total_amount REAL NOT NULL DEFAULT 0,
  bet_count INTEGER NOT NULL DEFAULT 0,
  max_amount REAL,
  max_amount_time TEXT,
  first_time TEXT,     -- earliest create_time that day, for Bonus Claim Report's "deposited after first claim" check across the full window (MIN over qualifying days)
  last_active TEXT,
  PRIMARY KEY (d, user_id, game_name, is_bonus)
);
CREATE INDEX IF NOT EXISTS idx_wallet_daily_agg_user ON wallet_daily_agg(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_daily_agg_date ON wallet_daily_agg(d);
