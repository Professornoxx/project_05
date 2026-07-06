CREATE TABLE IF NOT EXISTS users (
  user_id INTEGER PRIMARY KEY,
  agent_status INTEGER,
  agent_user_id INTEGER,
  superior_user_id INTEGER,
  direct_superior INTEGER,
  agent_level_1 INTEGER,
  agent_level_2 INTEGER,
  agent_level_3 INTEGER,
  agent_level_4 INTEGER,
  agent_level INTEGER,
  username TEXT,
  gender INTEGER,
  phone TEXT,
  email TEXT,
  register_ip TEXT,
  birth_date TEXT,
  app_version INTEGER,
  register_device TEXT,
  login_device TEXT,
  register_channel TEXT,
  is_test_account INTEGER,
  inviter_user_id INTEGER,
  register_source TEXT,
  last_active_time TEXT,
  last_login_device TEXT,
  device_id TEXT,
  user_status INTEGER,
  push_token TEXT,
  member_level INTEGER,
  register_version INTEGER,
  channel TEXT,
  balance REAL,
  deposit_count INTEGER,
  query_time TEXT,
  start_time TEXT,
  end_time TEXT,
  deposit_count_start INTEGER,
  deposit_count_end INTEGER,
  user_balance REAL,
  total_deposit REAL,
  frozen_amount REAL,
  total_withdrawal REAL,
  withdrawal_limit REAL,
  city TEXT,
  mark TEXT,
  flow_up_time TEXT,
  next_flow_up_time TEXT,
  tag TEXT,
  im_user_id TEXT,
  im_user_status INTEGER,
  group_name TEXT,
  adjust_adid TEXT,
  im_customer INTEGER,
  create_time TEXT,
  update_time TEXT,
  package_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_update_time ON users(update_time);
CREATE INDEX IF NOT EXISTS idx_users_inviter ON users(inviter_user_id);

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

-- Deposit ("water"), Withdrawal, and Wallet-detail records.
-- Exact export API field names aren't known yet (no live token to sample a
-- response), so each row's full original fields are preserved in raw_json —
-- this guarantees no field is ever lost regardless of the real schema.
-- record_key is the dedup identity: the export's own id/order-no field if
-- present, otherwise a content hash of the row (see recordKey() in sync.ts).
CREATE TABLE IF NOT EXISTS deposits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_key TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  amount REAL,
  status TEXT,
  create_time TEXT,
  raw_json TEXT NOT NULL,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deposits_user ON deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_deposits_create_time ON deposits(create_time);

CREATE TABLE IF NOT EXISTS withdrawals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_key TEXT NOT NULL UNIQUE,
  user_id INTEGER,
  amount REAL,
  status TEXT,
  create_time TEXT,
  raw_json TEXT NOT NULL,
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
  raw_json TEXT NOT NULL,
  synced_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_wallet_details_user ON wallet_details(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_details_create_time ON wallet_details(create_time);
