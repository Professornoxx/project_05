-- Master DB: the user list only. Everything else (deposits, withdrawals,
-- wallet details, sync logs) lives in the separate Daily Records DB.
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
  package_id INTEGER,
  assigned_agent TEXT,
  -- Dashboard-only ban flag, deliberately never written by the ETL sync
  -- (unlike user_status, which the raw export overwrites every sync) so a
  -- ban persists across re-syncs until an admin explicitly unbans. Banned
  -- users are hidden from the Search User page's own listing; other
  -- existing dashboard reports do not yet filter on this — follow-up work.
  is_banned INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
CREATE INDEX IF NOT EXISTS idx_users_update_time ON users(update_time);
CREATE INDEX IF NOT EXISTS idx_users_inviter ON users(inviter_user_id);
CREATE INDEX IF NOT EXISTS idx_users_is_banned ON users(is_banned);
