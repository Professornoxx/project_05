"""
Core sync logic shared by deposit/withdraw/wallet. Mirrors chunkedUpsert.ts +
sync.ts + aggregate.ts from the Workers version, but with none of the
Workers-side ceilings: no 50-subrequest cap, no CPU-time limit, no self-fetch
restriction. Row batching (150/statement) is still used because it's a real
D1-engine limit (same SQLite engine regardless of transport), not a
Workers-specific one — but the NUMBER of batches is now unbounded, since a
GitHub Actions job has no per-request budget to run out of.
"""
import os
import sys
import time
from datetime import datetime, timezone

import requests

import cf_client
import common

# Merged database: DAILY_DB_ID now points at the single D1 database holding
# both users (migrated from the former separate master-db) and
# deposits/withdrawals/wallet_details/sync_runs. The old MASTER_DB_ID env
# var is no longer read here — every d1_query call in this file uses
# DAILY_DB_ID, including the ones writing to the users table.
DAILY_DB_ID = os.environ["DAILY_DB_ID"]
PACKAGE_ID = os.environ.get("PACKAGE_ID", "10")

# D1's real per-statement bound-variable ceiling. The "offset" in D1's
# "too many SQL variables at offset N" error is a byte position in the SQL
# TEXT, not a variable index — it landed at the same ~407-413 regardless of
# whether the chunk held 150 or 50 rows, which only makes sense if that byte
# offset falls inside the ~16th row's placeholders both times (the query's
# fixed-length prefix is ~70 chars, each "(?,?,?,?,?,?)," is ~21 chars:
# 70 + 16*21 ≈ 406). That lines up exactly with D1's documented ceiling of
# 100 bound parameters PER STATEMENT (16 rows x 6 params = 96) — the real
# limit was the documented one all along; earlier Workers-side testing that
# suggested ~150 was safe was measuring something different (.batch() calls
# with many separate single-row statements, where each statement's own
# param count never left single digits, not one big multi-row VALUES
# clause like this).
CHUNK_SIZE = 12  # 8 params/row (wallet_details, now incl. game_name + source_name): 12*8=96, under the ~100 ceiling
DEPOSIT_CHUNK_SIZE = 9  # deposits has 5 extra columns (channel, marketing_channel, result_time, is_first_deposit, region): 9*11=99, under the ~100 ceiling
WITHDRAW_CHUNK_SIZE = 10  # withdrawals has 4 extra columns (channel, review_time, callback_time, payment_order_id): 10*10=100, at the ceiling
REQUEST_TIMEOUT_SECONDS = 120  # generous — no Workers-style CPU clock to protect here

TABLE_BY_SOURCE = {"deposit": "deposits", "withdraw": "withdrawals", "wallet": "wallet_details"}


def fetch_export_rows(source: str, begin_time: str, end_time: str) -> list[dict]:
    url = common.get_export_url(source)
    token = common.get_bearer_token()

    # withdraw/export's queryDate[1] is EXCLUSIVE (confirmed live: same-day
    # range 2026-07-08..2026-07-08 returned 0 rows, but 2026-07-08..2026-07-09
    # returned same-day data up to 15:57) — unlike deposit/export, whose
    # queryDate[1] is inclusive of that day. Without this +1 day shift, every
    # withdraw sync silently excludes the current day's data.
    request_end_time = common.shift_date(end_time, days=1) if source == "withdraw" else end_time

    params = {
        "packageId": PACKAGE_ID,
        "pageNum": "1",
        "pageSize": "100000",
        "useUpiQuery": "true",
        "queryDate[0]": begin_time,
        "queryDate[1]": request_end_time,
    }
    started = time.time()
    try:
        res = requests.post(
            url, params=params, headers={"Authorization": f"Bearer {token}"}, timeout=REQUEST_TIMEOUT_SECONDS
        )
    except requests.exceptions.RequestException as e:
        elapsed = int((time.time() - started) * 1000)
        raise RuntimeError(f"{source} export fetch failed after {elapsed}ms: {e}")

    if not res.ok:
        raise RuntimeError(f"{source} export failed: {res.status_code} {res.reason}")

    content_type = res.headers.get("content-type", "")
    if "json" in content_type:
        body = res.json()
        code = body.get("code")
        if code is not None and code != 200:
            raise RuntimeError(f"{source} export error (code {code}): {body.get('msg', 'no message')}")
        return body if isinstance(body, list) else body.get("rows", [])

    content = res.content
    if content[:2] != b"PK":
        preview = content[:200].decode("utf-8", errors="replace")
        raise RuntimeError(
            f"{source} export: response is not a valid .xlsx (magic bytes {content[:4].hex()}). "
            f"content-type={content_type} size={len(content)} preview={preview!r}"
        )
    return common.parse_excel_rows(content)


def upsert_rows(table: str, rows: list[dict]) -> tuple[int, list[int]]:
    """Returns (rows_written, touched_user_ids). deposits gets 2 extra
    columns (channel, result_time) for the Deposit Analysis dashboard
    section; withdrawals gets 3 extra columns (channel, review_time,
    callback_time) for the Withdraw Analysis section; wallet_details gets
    2 extra columns (game_name, source_name) for the Platform Analysis
    Bonus Claim Report."""
    if not rows:
        return 0, []

    is_deposit = table == "deposits"
    is_withdraw = table == "withdrawals"
    chunk_size = DEPOSIT_CHUNK_SIZE if is_deposit else WITHDRAW_CHUNK_SIZE if is_withdraw else CHUNK_SIZE
    now = datetime.now(timezone.utc).isoformat()
    touched_user_ids = []

    for i in range(0, len(rows), chunk_size):
        chunk = rows[i : i + chunk_size]
        values_sql = []
        params = []
        for row in chunk:
            key = common.record_key(row)
            fields = common.extract_common_fields(row)
            if is_deposit:
                values_sql.append("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                params.extend([
                    key, fields["user_id"], fields["amount"], fields["status"], fields["create_time"],
                    fields["channel"], fields["marketing_channel"], fields["result_time"],
                    fields["is_first_deposit"], fields["region"], now,
                ])
            elif is_withdraw:
                values_sql.append("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
                params.extend([
                    key, fields["user_id"], fields["amount"], fields["status"], fields["create_time"],
                    fields["channel"], fields["review_time"], fields["callback_time"],
                    fields["payment_order_id"], now,
                ])
            else:
                values_sql.append("(?, ?, ?, ?, ?, ?, ?, ?)")
                params.extend([
                    key, fields["user_id"], fields["amount"], fields["status"], fields["create_time"],
                    fields["game_name"], fields["source_name"], now,
                ])
            if fields["user_id"] is not None:
                try:
                    touched_user_ids.append(int(float(fields["user_id"])))
                except (ValueError, TypeError):
                    pass

        if is_deposit:
            sql = (
                f"INSERT INTO {table} (record_key, user_id, amount, status, create_time, channel, marketing_channel, result_time, is_first_deposit, region, synced_at) "
                f"VALUES {','.join(values_sql)} "
                "ON CONFLICT(record_key) DO UPDATE SET "
                "user_id = excluded.user_id, amount = excluded.amount, status = excluded.status, "
                "create_time = excluded.create_time, channel = excluded.channel, "
                "marketing_channel = excluded.marketing_channel, "
                "result_time = excluded.result_time, is_first_deposit = excluded.is_first_deposit, "
                "region = excluded.region, synced_at = excluded.synced_at"
            )
        elif is_withdraw:
            sql = (
                f"INSERT INTO {table} (record_key, user_id, amount, status, create_time, channel, review_time, callback_time, payment_order_id, synced_at) "
                f"VALUES {','.join(values_sql)} "
                "ON CONFLICT(record_key) DO UPDATE SET "
                "user_id = excluded.user_id, amount = excluded.amount, status = excluded.status, "
                "create_time = excluded.create_time, channel = excluded.channel, "
                "review_time = excluded.review_time, callback_time = excluded.callback_time, "
                "payment_order_id = excluded.payment_order_id, synced_at = excluded.synced_at"
            )
        else:
            sql = (
                f"INSERT INTO {table} (record_key, user_id, amount, status, create_time, game_name, source_name, synced_at) "
                f"VALUES {','.join(values_sql)} "
                "ON CONFLICT(record_key) DO UPDATE SET "
                "user_id = excluded.user_id, amount = excluded.amount, status = excluded.status, "
                "create_time = excluded.create_time, game_name = excluded.game_name, "
                "source_name = excluded.source_name, synced_at = excluded.synced_at"
            )
        cf_client.d1_query(DAILY_DB_ID, sql, params)

    return len(rows), touched_user_ids


def update_master_aggregates(table: str, user_ids: list[int]) -> int:
    """Mirrors aggregate.ts: after Daily Records DB is updated, refresh the
    touched users' summary columns in the Master DB. Only deposit/withdraw
    map to a Master DB column; wallet_details has none yet."""
    unique_ids = list({uid for uid in user_ids if uid is not None})
    if not unique_ids:
        return 0

    column = "total_deposit" if table == "deposits" else "total_withdrawal"
    count_column = "deposit_count" if table == "deposits" else None

    updated = 0
    for i in range(0, len(unique_ids), 100):
        chunk = unique_ids[i : i + 100]
        placeholders = ",".join("?" for _ in chunk)
        sums = cf_client.d1_query(
            DAILY_DB_ID,
            f"SELECT user_id, SUM(amount) as total, COUNT(*) as cnt FROM {table} "
            f"WHERE user_id IN ({placeholders}) GROUP BY user_id",
            chunk,
        )
        for row in sums:
            now = datetime.now(timezone.utc).isoformat()
            if count_column:
                cf_client.d1_query(
                    DAILY_DB_ID,
                    f"UPDATE users SET {column} = ?, {count_column} = ?, update_time = ? WHERE user_id = ?",
                    [row["total"], row["cnt"], now, row["user_id"]],
                )
            else:
                cf_client.d1_query(
                    DAILY_DB_ID,
                    f"UPDATE users SET {column} = ?, update_time = ? WHERE user_id = ?",
                    [row["total"], now, row["user_id"]],
                )
            updated += 1
    return updated


# Auto-updates master_db.users from data incidentally present on the
# deposit/withdraw/wallet exports — no dedicated user-list export exists on
# the source system (confirmed: probed 9 plausible endpoint paths, none
# returned real user data), so this is the only automated path to keep
# phone/mark/member_level/user_balance current without a manual upload.
# Deliberately excludes: total_deposit/total_withdrawal/frozen_amount/
# withdrawal_limit (need true lifetime history — daily_records_db only
# retains a rolling 35-day window, so computing "lifetime" from it would
# silently shrink real existing totals); assigned_agent (owned entirely by
# the separate agent-upload path); and city (confirmed live: master_db.city
# holds STATE-level values while the exports' city fields are CITY-level —
# different granularity, would corrupt the region reports). New users get
# whatever fields this batch actually observed; anything not observed
# stays NULL rather than guessed.
def collect_profile_updates(rows: list[dict], source: str) -> dict[int, dict]:
    updates: dict[int, dict] = {}
    for row in rows:
        fields = common.extract_common_fields(row)
        uid_raw = fields.get("user_id")
        if uid_raw is None:
            continue
        try:
            uid = int(float(uid_raw))
        except (ValueError, TypeError):
            continue
        profile = common.extract_user_profile_fields(row)
        entry = updates.setdefault(uid, {})
        for key in ("phone", "mark", "member_level"):
            if profile.get(key) is not None:
                entry[key] = profile[key]
        # Wallet balance needs "most recent row wins", not "last row seen
        # in this batch wins" — the export isn't guaranteed to be time-
        # ordered, so track the row's own create_time alongside the value.
        if source == "wallet" and profile.get("wallet_balance") is not None:
            row_time = fields.get("create_time")
            if row_time and (entry.get("_wallet_balance_time") is None or row_time > entry["_wallet_balance_time"]):
                entry["wallet_balance"] = profile["wallet_balance"]
                entry["_wallet_balance_time"] = row_time
    return updates


def update_master_profiles(updates: dict[int, dict]) -> int:
    """Batches into multi-row INSERT statements like every other bulk write
    in this file — NOT one HTTP call per user, which would mean thousands
    of individual round-trips for wallet's large unique-user count. Every
    row always carries all 5 columns (NULL for anything this batch didn't
    observe) so a single VALUES clause shape works across heterogeneous
    rows; COALESCE(excluded.col, users.col) on conflict means a NULL here
    preserves whatever's already there instead of blanking it out — this
    is what makes "leave unobserved fields alone" actually safe to batch."""
    if not updates:
        return 0
    now = datetime.now(timezone.utc).isoformat()
    items = list(updates.items())
    # 6 params/row (user_id + 4 fields + update_time): 16*6=96, under the
    # ~100 bound-params-per-statement ceiling established elsewhere in this
    # file for single multi-row INSERT statements.
    BATCH = 16
    written = 0
    for i in range(0, len(items), BATCH):
        chunk = items[i:i + BATCH]
        values_sql = []
        params = []
        for uid, fields in chunk:
            values_sql.append("(?, ?, ?, ?, ?, ?)")
            params.extend([
                uid, fields.get("phone"), fields.get("mark"),
                fields.get("member_level"), fields.get("wallet_balance"), now,
            ])
        sql = (
            "INSERT INTO users (user_id, phone, mark, member_level, user_balance, update_time) "
            f"VALUES {','.join(values_sql)} "
            "ON CONFLICT(user_id) DO UPDATE SET "
            "phone = COALESCE(excluded.phone, users.phone), "
            "mark = COALESCE(excluded.mark, users.mark), "
            "member_level = COALESCE(excluded.member_level, users.member_level), "
            "user_balance = COALESCE(excluded.user_balance, users.user_balance), "
            "update_time = excluded.update_time"
        )
        cf_client.d1_query(DAILY_DB_ID, sql, params)
        written += len(chunk)
    return written


def log_run(source: str, started_at: str, status: str, rows_upserted: int, error_message: str | None) -> None:
    cf_client.d1_query(
        DAILY_DB_ID,
        "INSERT INTO sync_runs (source, started_at, finished_at, status, rows_upserted, error_message) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        [source, started_at, datetime.now(timezone.utc).isoformat(), status, rows_upserted, error_message],
    )


def sync_source(source: str, begin_time: str, end_time: str) -> None:
    table = TABLE_BY_SOURCE[source]
    started_at = datetime.now(timezone.utc).isoformat()
    print(f"[{source}] window {begin_time} to {end_time}")
    try:
        rows = fetch_export_rows(source, begin_time, end_time)
        print(f"[{source}] fetched {len(rows)} rows")
        written, user_ids = upsert_rows(table, rows)

        if source in ("deposit", "withdraw"):
            updated = update_master_aggregates(table, user_ids)
            print(f"[{source}] updated Master DB aggregates for {updated} users")

        profile_updates = collect_profile_updates(rows, source)
        profiles_written = update_master_profiles(profile_updates)
        print(f"[{source}] updated Master DB profile fields for {profiles_written} users")

        log_run(source, started_at, "success", written, None)
        print(f"[{source}] SUCCESS — {written} rows upserted")
    except Exception as e:
        log_run(source, started_at, "failed", 0, str(e))
        print(f"[{source}] FAILED — {e}", file=sys.stderr)
        raise
